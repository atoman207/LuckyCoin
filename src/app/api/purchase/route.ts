import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_PACKS, CUSTOM_SILVER_MIN, CUSTOM_SILVER_MAX, customCost } from "@/lib/coins";
import { getPaymentMethod } from "@/lib/wallets";
import { getChainConfig } from "@/lib/chains";
import { getUsdPrice } from "@/lib/pricing";
import { buildContractCheckout } from "@/lib/payment-contract";
import { getLocale } from "@/lib/i18n/server";
import { createTranslator, isMessageKey } from "@/lib/i18n";

export const runtime = "nodejs";

// Direct crypto checkout — no third-party processor. This route creates a
// *pending* order and returns the address + exact amount to send. Coins are
// credited only after the buyer submits their transaction hash and it is
// verified on-chain (/api/purchase/verify).
export async function POST(req: Request) {
  const t = createTranslator(await getLocale());

  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

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
      { error: t("api.purchase.choosePack", { min: CUSTOM_SILVER_MIN, max: CUSTOM_SILVER_MAX }) },
      { status: 400 }
    );
  }

  const method = getPaymentMethod(typeof body.method_id === "string" ? body.method_id : null);
  const cfg = method ? getChainConfig(method.id) : null;
  if (!method || !cfg) {
    return NextResponse.json({ error: t("api.purchase.unsupportedMethod") }, { status: 400 });
  }

  // Lock the crypto amount to send from the USD price at order time.
  let price: number;
  try {
    price = await getUsdPrice(cfg.coingeckoId);
  } catch (e) {
    // getUsdPrice throws a MESSAGE KEY so the reason can be shown in the
    // visitor's language.
    const raw = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: isMessageKey(raw) ? t(raw) : t("api.purchase.rateFailed") },
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
    return NextResponse.json({ error: t("api.purchase.startFailed") }, { status: 500 });
  }

  return NextResponse.json({
    order_id: purchase.id,
    address: method.address,
    pay_amount: payAmount,
    asset: method.asset,
    network: method.network,
    // A message key — the client renders it in the current language.
    memo: method.memo ?? null,
    usd,
    silver,
    // Present when the LuckyCoinPayments contract is deployed for this chain.
    // Paying through it stamps the order id into the transaction, so the order
    // settles the moment the event lands instead of being matched by amount.
    // Sending to `address` above still works exactly as before.
    contract: buildContractCheckout(method.id, purchase.id, payAmount),
  });
}
