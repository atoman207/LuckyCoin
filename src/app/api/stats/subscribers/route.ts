import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // always live from the database

// Service launch date — the chart starts here.
const LAUNCH_UTC = Date.UTC(2026, 5, 1); // June 1, 2026 (month is 0-based)

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD

// Public: daily new-subscriber counts since launch, read live from the DB.
// "Subscribers" = every non-admin profile (real signups + seeded bots).
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("created_at")
    .eq("is_admin", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tally sign-ups per calendar day (UTC).
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.created_at) continue;
    counts.set(dayKey(new Date(row.created_at).getTime()), (counts.get(dayKey(new Date(row.created_at).getTime())) ?? 0) + 1);
  }

  // Build a continuous series from launch → today (no gaps).
  const today = Date.now();
  const series: { date: string; count: number }[] = [];
  for (let ms = LAUNCH_UTC; ms <= today; ms += 86_400_000) {
    const key = dayKey(ms);
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }

  const total = data?.length ?? 0;
  const todayKey = dayKey(today);
  const todayCount = counts.get(todayKey) ?? 0;

  return NextResponse.json({
    total, // headline: total subscribers
    today: todayCount, // new today
    launch: dayKey(LAUNCH_UTC),
    series, // [{ date, count }] from launch to today
  });
}
