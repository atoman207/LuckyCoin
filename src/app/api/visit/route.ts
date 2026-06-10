import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Records an anonymous visit — one row per browser per UTC day (deduped by the
// unique index). "Visitors" = people who opened the app to try it for free.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const visitor = typeof body.visitor_id === "string" ? body.visitor_id.slice(0, 64) : null;
  if (!visitor) return NextResponse.json({ error: "Missing visitor id." }, { status: 400 });

  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const admin = createAdminClient();

  // Ignore conflicts (same visitor already counted today).
  await admin
    .from("visits")
    .upsert({ visitor_id: visitor, day }, { onConflict: "visitor_id,day", ignoreDuplicates: true });

  return NextResponse.json({ ok: true });
}
