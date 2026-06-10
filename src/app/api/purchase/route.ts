import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_PACKS, CUSTOM_SILVER_MIN, CUSTOM_SILVER_MAX, customCost } from "@/lib/coins";
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

  // Accept either a fixed pack or a custom amount (1–100 silver).
  const reqSilver = Math.floor(Number(body.silver));
  const pack = COIN_PACKS.find((p) => p.silver === reqSilver);
  let silver: number;
  let usd: number;
  if (pack) {
    silver = pack.silver;
    usd = pack.usd;
  } else if (Number.isInteger(reqSilver) && reqSilver >= CUSTOM_SILVER_MIN && reqSilver <= CUSTOM_SILVER_MAX) {
    silver = reqSilver;
    usd = customCost(reqSilver);
  } else {
    return NextResponse.json(
      { error: `Choose a pack, or a custom amount between ${CUSTOM_SILVER_MIN} and ${CUSTOM_SILVER_MAX} silver.` },
      { status: 400 }
    );
  }

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
  const payAmount = Number((usd / price).toFixed(dp));

  const { data: purchase, error } = await admin
    .from("purchases")
    .insert({
      user_id: profile.id,
      silver,
      usd_amount: usd,
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
    usd,
    silver,
  });
}
