import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // always live from the database

// Where the subscriber chart begins. The counts before this date were test and
// seed data; the chart was reset to start fresh here, so anything earlier is
// deliberately excluded from both the series and the headline totals.
const CHART_START_UTC = Date.UTC(2026, 8, 9); // September 9, 2026 (month is 0-based)

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD

// Public: daily new-subscriber counts since the chart start, read live from the
// DB. "Subscribers" = every non-admin profile (real signups + generated ones).
export async function GET() {
  const t = await getT();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("created_at")
    .eq("is_admin", false)
    .gte("created_at", new Date(CHART_START_UTC).toISOString());

  if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });

  // Tally sign-ups per calendar day (UTC).
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.created_at) continue;
    const key = dayKey(new Date(row.created_at).getTime());
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Build a continuous series from the start day → today (no gaps). Before the
  // start date arrives, the chart still renders one empty day rather than an
  // empty array, which would leave the panel blank.
  const today = Date.now();
  const series: { date: string; count: number }[] = [];
  for (let ms = CHART_START_UTC; ms <= Math.max(today, CHART_START_UTC); ms += 86_400_000) {
    const key = dayKey(ms);
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }

  const total = data?.length ?? 0;
  const todayCount = counts.get(dayKey(today)) ?? 0;

  return NextResponse.json({
    total, // headline: subscribers since the chart start
    today: todayCount, // new today
    launch: dayKey(CHART_START_UTC),
    series, // [{ date, count }] from the start date to today
  });
}
