import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

// Contact-form messages for the admin page (newest first).
export async function GET() {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: t("api.admin.only") }, { status: 403 });

  const { data, error } = await ctx.admin
    .from("contacts")
    .select("id, name, email, message, handled, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });
  return NextResponse.json({ contacts: data });
}
