import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS = {
  bot_enabled: "true",
  bot_mode: "auto", // 'auto' = random in [min,max]; 'manual' = exactly bot_daily_count
  bot_specific_count: "0", // if > 0, overrides mode/range and becomes the exact daily target
  bot_daily_count: "0",
  bot_daily_min: "100",
  bot_daily_max: "1000",
} as const;

const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

// ---- READ: current bot settings + today's drip progress -------------------
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const { data, error } = await ctx.admin.from("app_config").select("key, value");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cfg = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const config = {
    enabled: (cfg.bot_enabled ?? DEFAULTS.bot_enabled) !== "false",
    mode: cfg.bot_mode === "manual" ? "manual" : "auto",
    specificCount: parseInt(cfg.bot_specific_count ?? DEFAULTS.bot_specific_count, 10) || 0,
    count: parseInt(cfg.bot_daily_count ?? DEFAULTS.bot_daily_count, 10) || 0,
    min: parseInt(cfg.bot_daily_min ?? DEFAULTS.bot_daily_min, 10),
    max: parseInt(cfg.bot_daily_max ?? DEFAULTS.bot_daily_max, 10),
  };

  // Today's plan (may not exist yet if no run has happened).
  const { data: plan } = await ctx.admin
    .from("bot_plan")
    .select("day, target, added, updated_at")
    .eq("day", todayKey())
    .maybeSingle();

  // Headline player counts.
  const { count: botCount } = await ctx.admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("kind", "bot");
  const { count: totalCount } = await ctx.admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", false);

  return NextResponse.json({
    config,
    today: plan ?? null,
    counts: { bots: botCount ?? 0, total: totalCount ?? 0 },
  });
}

// ---- UPDATE: change the drip settings -------------------------------------
export async function PATCH(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const b = await req.json().catch(() => ({}));

  const mode = b.mode === "manual" ? "manual" : "auto";
  let specificCount = Math.floor(Number(b.specificCount));
  if (!Number.isFinite(specificCount) || specificCount < 0) specificCount = 0;
  let count = Math.floor(Number(b.count));
  if (!Number.isFinite(count) || count < 0) count = 0;

  let min = Math.floor(Number(b.min));
  let max = Math.floor(Number(b.max));
  if (!Number.isFinite(min) || min < 0) min = 0;
  if (!Number.isFinite(max) || max < min) {
    return NextResponse.json({ error: "Max must be a number ≥ min." }, { status: 400 });
  }
  if (mode === "manual" && count <= 0) {
    return NextResponse.json({ error: "Enter how many users to add per day (1 or more)." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rows = [
    // The workflow runs continuously; keep bot_enabled true so generation stays active.
    { key: "bot_enabled", value: "true" },
    { key: "bot_mode", value: mode },
    { key: "bot_specific_count", value: String(specificCount) },
    { key: "bot_daily_count", value: String(count) },
    { key: "bot_daily_min", value: String(min) },
    { key: "bot_daily_max", value: String(max) },
  ].map((r) => ({ ...r, updated_at: now }));

  const { error } = await ctx.admin.from("app_config").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // In manual mode, apply the new count to TODAY immediately so the admin's
  // choice takes effect on this day's drip (not just future days). Auto-mode
  // changes only affect future days — today's random target was already rolled.
  if (specificCount > 0 || mode === "manual") {
    const day = todayKey();
    const { data: plan } = await ctx.admin
      .from("bot_plan")
      .select("added")
      .eq("day", day)
      .maybeSingle();
    const target = specificCount > 0 ? specificCount : count;
    await ctx.admin
      .from("bot_plan")
      .upsert(
        { day, target, added: plan?.added ?? 0, updated_at: now },
        { onConflict: "day" }
      );
  }

  return NextResponse.json({ ok: true });
}
