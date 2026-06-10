import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import {
  WHEEL_VALUES,
  wheelCanWin,
  WHEEL_REWARD_COIN,
  WHEEL_WIN_WEIGHTS,
  DRAW_COOLDOWN_MS,
  drawCooldownLeftMs,
  formatDrawCountdown,
} from "@/lib/coins";

export const runtime = "nodejs";

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
  const msLeft = drawCooldownLeftMs(profile.last_draw_at, now);

  if (msLeft > 0) {
    return NextResponse.json({
      spun: false,
      nextInMs: msLeft,
      message: `Come back in ${formatDrawCountdown(msLeft)} for your next spin.`,
      profile,
    });
  }

  // Random wheel arrangement. The winning VALUE is drawn by weighted
  // probability (100=2%, 50=10%, 10=50%, rest split 5/0; never 1000/500), then
  // we land the pointer on a segment that shows that value.
  const layout = shuffle(WHEEL_VALUES);

  const weights = Object.entries(WHEEL_WIN_WEIGHTS).filter(([v]) => wheelCanWin(Number(v)));
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  let value = Number(weights[weights.length - 1][0]);
  for (const [v, w] of weights) {
    if (r < w) { value = Number(v); break; }
    r -= w;
  }

  const candidates = layout.map((v, i) => ({ v, i })).filter(({ v }) => v === value);
  const pick = candidates.length
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : layout.map((v, i) => ({ v, i })).filter(({ v }) => wheelCanWin(v))[0];

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
