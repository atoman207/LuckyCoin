import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYS = ["bot_enabled", "bot_daily_min", "bot_daily_max"] as const;
const DEFAULTS: Record<(typeof KEYS)[number], string> = {
  bot_enabled: "true",
  bot_daily_min: "100",
  bot_daily_max: "500",
};

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

  let min = Math.floor(Number(b.min));
  let max = Math.floor(Number(b.max));
  if (!Number.isFinite(min) || min < 0) min = 0;
  if (!Number.isFinite(max) || max < min) {
    return NextResponse.json({ error: "Max must be a number ≥ min." }, { status: 400 });
  }

  const rows = [
    { key: "bot_enabled", value: b.enabled ? "true" : "false" },
    { key: "bot_daily_min", value: String(min) },
    { key: "bot_daily_max", value: String(max) },
    // updated_at refreshes via the column default on conflict.
  ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));

  const { error } = await ctx.admin.from("app_config").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
