import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

// All purchase orders with the buyer, price and date.
//
// An order row is written the moment a buyer is sent to Stripe Checkout, before
// anything is paid. `credited` is what tells a real purchase (paid, coins
// granted) from an order that was only opened — the admin page lists paid
// purchases by default and counts only those.
export async function GET() {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: t("api.admin.only") }, { status: 403 });

  const { data, error } = await ctx.admin
    .from("purchases")
    .select(
      "id, silver, usd_amount, currency, method, status, credited, created_at, profiles ( nickname, email )"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });
  return NextResponse.json({ transactions: data });
}
