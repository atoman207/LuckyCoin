import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_PACKS } from "@/lib/coins";
import { getPaymentMethod } from "@/lib/wallets";
import { getChainConfig } from "@/lib/chains";
import { getUsdPrice } from "@/lib/pricing";

export const runtime = "nodejs";

// Direct crypto checkout — no third-party processor. This route creates a
// *pending* order and returns the address + exact amount to send. Coins are
// credited only after the buyer submits their transaction hash and it is
// verified on-chain (/api/purchase/verify).
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;
  const body = await req.json().catch(() => ({}));

  const pack = COIN_PACKS.find((p) => p.silver === Number(body.silver));
  if (!pack) return NextResponse.json({ error: "Unknown coin pack." }, { status: 400 });

  const method = getPaymentMethod(typeof body.method_id === "string" ? body.method_id : null);
  const cfg = method ? getChainConfig(method.id) : null;
  if (!method || !cfg) {
    return NextResponse.json({ error: "Unsupported payment method." }, { status: 400 });
  }

  // Lock the crypto amount to send from the USD price at order time.
  let price: number;
  try {
    price = await getUsdPrice(cfg.coingeckoId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not fetch exchange rate." },
      { status: 502 }
    );
  }
  // Round to the asset's precision (cap at 8 dp for display sanity).
  const dp = Math.min(cfg.decimals, 8);
  const payAmount = Number((pack.usd / price).toFixed(dp));

  const { data: purchase, error } = await admin
    .from("purchases")
    .insert({
      user_id: profile.id,
      silver: pack.silver,
      usd_amount: pack.usd,
      currency: `${method.asset} · ${method.network}`,
      method_id: method.id,
      method: "crypto-direct",
      to_address: method.address,
      pay_address: method.address,
      pay_amount: payAmount,
      pay_currency: method.asset,
      status: "awaiting_payment",
      credited: false,
    })
    .select("id")
    .single();

  if (error || !purchase) {
    return NextResponse.json({ error: error?.message ?? "Could not start checkout." }, { status: 500 });
  }

  return NextResponse.json({
    order_id: purchase.id,
    address: method.address,
    pay_amount: payAmount,
    asset: method.asset,
    network: method.network,
    memo: method.memo ?? null,
    usd: pack.usd,
  });
}
