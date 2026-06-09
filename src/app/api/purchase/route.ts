import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_PACKS } from "@/lib/coins";

// Simulated crypto checkout. In production, swap the "instant credit" block
// for a real provider webhook (Coinbase Commerce / NOWPayments) that calls a
// verified callback before crediting. The pack is validated against the
// server-side price list so the client can't invent its own amounts.
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;
  const body = await req.json().catch(() => ({}));
  const { silver } = body;
  const currency = typeof body.currency === "string" ? body.currency.trim() : null;
  const wallet_address =
    typeof body.wallet_address === "string" ? body.wallet_address.trim() : "";

  const pack = COIN_PACKS.find((p) => p.silver === Number(silver));
  if (!pack) {
    return NextResponse.json({ error: "Unknown coin pack." }, { status: 400 });
  }
  if (!wallet_address) {
    return NextResponse.json({ error: "Enter the wallet address you're paying from." }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("profiles")
    .update({ silver: profile.silver + pack.silver })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("purchases").insert({
    user_id: profile.id,
    silver: pack.silver,
    usd_amount: pack.usd,
    currency,
    wallet_address,
    method: "crypto-sim",
    status: "completed",
  });

  return NextResponse.json({
    message: `Payment confirmed — ${pack.silver} silver added.`,
    profile: updated,
  });
}
