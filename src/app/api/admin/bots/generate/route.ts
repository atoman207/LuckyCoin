import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateBots, MAX_PER_RUN } from "@/lib/bots";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Creating a few hundred accounts takes longer than the default budget.
export const maxDuration = 300;

const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

// =====================================================================
//  "Generate" — the button on the admin Bots tab. Replaces the old
//  always-on Python drip (scripts/daily-bot/daily_bots.py): the admin now
//  decides when players appear, once a day.
//
//  Body: { mode: "exact", count } | { mode: "range", min, max }
//    exact  → create exactly `count` players
//    range  → roll a random number in [min, max] and create that many
//
//  The chosen settings are saved to app_config so the form comes back the
//  way it was left, and the run is recorded in bot_plan for the day.
// =====================================================================
export async function POST(req: Request) {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: t("api.admin.only") }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const mode = b.mode === "exact" ? "exact" : "range";

  let target: number;
  let min = Math.floor(Number(b.min));
  let max = Math.floor(Number(b.max));
  const count = Math.floor(Number(b.count));

  if (mode === "exact") {
    if (!Number.isFinite(count) || count < 1) {
      return NextResponse.json({ error: t("api.admin.countRequired") }, { status: 400 });
    }
    target = count;
  } else {
    if (!Number.isFinite(min) || min < 1) min = 1;
    if (!Number.isFinite(max) || max < min) {
      return NextResponse.json({ error: t("api.admin.maxNumber") }, { status: 400 });
    }
    // Random daily count inside the range the admin chose.
    target = Math.floor(Math.random() * (max - min + 1)) + min;
  }

  if (target > MAX_PER_RUN) {
    return NextResponse.json(
      { error: t("api.admin.botTooMany", { max: MAX_PER_RUN }) },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const day = todayKey();

  // Remember the form settings for next time.
  await ctx.admin.from("app_config").upsert(
    [
      { key: "bot_mode", value: mode === "exact" ? "manual" : "auto", updated_at: now },
      { key: "bot_daily_count", value: String(mode === "exact" ? target : count || 0), updated_at: now },
      { key: "bot_daily_min", value: String(min || 0), updated_at: now },
      { key: "bot_daily_max", value: String(max || 0), updated_at: now },
    ],
    { onConflict: "key" }
  );

  // Anything already generated today is topped up, not replaced.
  const { data: plan } = await ctx.admin
    .from("bot_plan")
    .select("target, added")
    .eq("day", day)
    .maybeSingle();
  const alreadyAdded = plan?.added ?? 0;
  const priorTarget = plan?.target ?? 0;

  const savePlan = async (createdSoFar: number) => {
    await ctx.admin.from("bot_plan").upsert(
      {
        day,
        target: priorTarget + target,
        added: alreadyAdded + createdSoFar,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "day" }
    );
  };

  // Record the intent up front, so a run that dies halfway still shows that it
  // was attempted rather than looking like it never happened.
  await savePlan(0);

  const { created, failed } = await generateBots(ctx.admin, target, savePlan);
  await savePlan(created);

  return NextResponse.json({
    ok: true,
    day,
    mode,
    target,
    created,
    failed,
    todayTotal: alreadyAdded + created,
  });
}
