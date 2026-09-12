import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

// All purchase transactions with the buyer, price and date.
export async function GET() {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: t("api.admin.only") }, { status: 403 });

  const { data, error } = await ctx.admin
    .from("purchases")
    .select(
      "id, silver, usd_amount, currency, method, status, created_at, profiles ( nickname, email )"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });
  return NextResponse.json({ transactions: data });
}
