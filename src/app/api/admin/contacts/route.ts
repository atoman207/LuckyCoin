import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

// Contact-form messages for the admin page (newest first).
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const { data, error } = await ctx.admin
    .from("contacts")
    .select("id, name, email, message, handled, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data });
}
