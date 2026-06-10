import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { WHEEL_VALUES, wheelCanWin, WHEEL_REWARD_COIN } from "@/lib/coins";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Daily prize wheel. Once every 24h: build a randomly arranged 20-segment
// wheel, choose a WINNING segment that is never 1000 or 500, credit the bronze,
// and return the layout + winning index so the client can spin to it.
export async function POST() {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;
  const now = Date.now();
  const last = profile.last_draw_at ? new Date(profile.last_draw_at).getTime() : null;

  if (last !== null && now - last < DAY_MS) {
    const msLeft = DAY_MS - (now - last);
    return NextResponse.json({
      spun: false,
      nextInMs: msLeft,
      message: `Come back in ${formatLeft(msLeft)} for your next spin.`,
      profile,
    });
  }

  // Random wheel arrangement + a winning segment that can never be 1000/500.
  const layout = shuffle(WHEEL_VALUES);
  const winnable = layout.map((v, i) => ({ v, i })).filter(({ v }) => wheelCanWin(v));
  const pick = winnable[Math.floor(Math.random() * winnable.length)];
  const value = pick.v;

  // Credit + stamp the timer (guarded so a double-submit can't double-spin).
  let q = admin
    .from("profiles")
    .update({ [WHEEL_REWARD_COIN]: profile[WHEEL_REWARD_COIN] + value, last_draw_at: new Date(now).toISOString() })
    .eq("id", profile.id);
  q = profile.last_draw_at === null ? q.is("last_draw_at", null) : q.eq("last_draw_at", profile.last_draw_at);
  const { data: updated, error } = await q.select("*").maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ spun: false, message: "Already spun today.", profile });
  }

  await admin.from("draws").insert({ user_id: profile.id, value, coin: WHEEL_REWARD_COIN });

  return NextResponse.json({
    spun: true,
    layout, // 20 values in display order
    winningIndex: pick.i,
    value,
    coin: WHEEL_REWARD_COIN,
    profile: updated,
  });
}
