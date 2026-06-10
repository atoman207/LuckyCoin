import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

// Admin dashboard stats:
//   visitors = anonymous people who opened the app to try it free
//   members  = registered users (counted as registered or logged-in today)
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const admin = createAdminClient();
  const today = todayKey();

  // --- Visitors (from the visits table) ---
  const { data: visitRows } = await admin.from("visits").select("visitor_id, day");
  const uniqueVisitors = new Set<string>();
  let visitorsToday = 0;
  for (const v of visitRows ?? []) {
    uniqueVisitors.add(v.visitor_id);
    if (v.day === today) visitorsToday++;
  }

  // --- Members (profiles, excluding the admin account itself is optional) ---
  const { data: members } = await admin.from("profiles").select("id, created_at");
  const membersTotal = members?.length ?? 0;
  const newToday = new Set<string>();
  for (const m of members ?? []) {
    if ((m.created_at ?? "").slice(0, 10) === today) newToday.add(m.id);
  }

  // Add anyone who logged in today (last_sign_in from auth.users).
  for (let page = 1; page <= 40; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 50 });
    if (error) break;
    for (const u of data.users) {
      if ((u.last_sign_in_at ?? "").slice(0, 10) === today) newToday.add(u.id);
    }
    if (data.users.length < 50) break;
  }

  return NextResponse.json({
    visitorsTotal: uniqueVisitors.size,
    visitorsToday,
    membersTotal,
    membersToday: newToday.size,
  });
}
