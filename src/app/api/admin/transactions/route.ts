import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

// All purchase transactions with the buyer, wallet address, price and date.
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const { data, error } = await ctx.admin
    .from("purchases")
    .select(
      "id, silver, usd_amount, currency, wallet_address, to_address, method, status, created_at, profiles ( nickname, email )"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: data });
}
