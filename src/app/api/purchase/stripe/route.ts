import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_PACKS, CUSTOM_SILVER_MIN, CUSTOM_SILVER_MAX, customCost } from "@/lib/coins";
import {
  APP_TAG,
  formatCharge,
  getStripe,
  getStripeCurrency,
  isStripeConfigured,
  minChargeAmount,
  toStripeAmount,
} from "@/lib/stripe";
import { convertFromUsd } from "@/lib/fx";
import { getSiteOrigin } from "@/lib/site-url";
import { getLocale } from "@/lib/i18n/server";
import { createTranslator, isMessageKey } from "@/lib/i18n";

export const runtime = "nodejs";

// Card checkout — create a Stripe Checkout Session for a silver pack.
//
// Nothing is credited here. A *pending* order row is written first, its id is
// attached to the session (client_reference_id + metadata), and coins are only
// added once Stripe confirms the payment — either through the webhook
// (/api/stripe/webhook) or when the buyer returns to /buy
// (/api/purchase/stripe/status). Both paths credit at most once.
export async function POST(req: Request) {
  const locale = await getLocale();
  const t = createTranslator(locale);

  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: t("api.stripe.notConfigured") }, { status: 503 });
  }

  const { admin, profile } = ctx;
  const body = await req.json().catch(() => ({}));

  // Accept either a fixed pack or a custom amount (1–100 silver) — the same
  // rules the crypto checkout uses. The price is computed SERVER-SIDE so the
  // browser can never choose what it pays.
  const reqSilver = Math.floor(Number(body.silver));
  const pack = COIN_PACKS.find((p) => p.silver === reqSilver);
  let silver: number;
  let usd: number;
  if (pack) {
    silver = pack.silver;
    usd = pack.usd;
  } else if (
    Number.isInteger(reqSilver) &&
    reqSilver >= CUSTOM_SILVER_MIN &&
    reqSilver <= CUSTOM_SILVER_MAX
  ) {
    silver = reqSilver;
    usd = customCost(reqSilver);
  } else {
    return NextResponse.json(
      { error: t("api.purchase.choosePack", { min: CUSTOM_SILVER_MIN, max: CUSTOM_SILVER_MAX }) },
      { status: 400 }
    );
  }

  // Prices above are USD. Stripe charges in ONE currency and wants the amount
  // already expressed in it, so convert here: a Japanese visitor is billed the
  // yen equivalent while the catalogue stays dollar-denominated.
  const currency = getStripeCurrency(locale);

  let charge: number;
  let rate: number;
  try {
    ({ amount: charge, rate } = await convertFromUsd(usd, currency));
  } catch (e) {
    // The message is a translation key (see lib/fx.ts).
    const key = e instanceof Error ? e.message : "api.pricing.rateFetchFailed";
    console.error("[stripe] no exchange rate for", currency, e);
    return NextResponse.json(
      { error: isMessageKey(key) ? t(key) : t("api.pricing.rateFetchFailed") },
      { status: 503 }
    );
  }

  // Stripe rejects anything under a per-currency floor (¥50, $0.50, …). Say so
  // plainly instead of letting the API throw a generic failure at the buyer.
  const min = minChargeAmount(currency);
  if (charge < min) {
    return NextResponse.json(
      { error: t("api.stripe.amountTooSmall", { min: formatCharge(min, currency, locale) }) },
      { status: 400 }
    );
  }

  const { data: purchase, error } = await admin
    .from("purchases")
    .insert({
      user_id: profile.id,
      silver,
      // usd_amount stays the USD list price — it is what reporting and the
      // admin dashboard compare across payment methods.
      usd_amount: usd,
      currency: `Card · Stripe (${currency.toUpperCase()})`,
      method_id: "stripe-card",
      method: "stripe",
      // …while pay_amount/pay_currency record what the card was actually
      // charged, exactly as the crypto flow records the crypto amount.
      pay_amount: charge,
      pay_currency: currency.toUpperCase(),
      status: "awaiting_payment",
      credited: false,
    })
    .select("id")
    .single();

  if (error || !purchase) {
    return NextResponse.json({ error: t("api.purchase.startFailed") }, { status: 500 });
  }

  const origin = getSiteOrigin(req);

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      // Stripe shows its own checkout page in this language.
      locale: locale === "ja" ? "ja" : "en",
      client_reference_id: purchase.id,
      customer_email: profile.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toStripeAmount(charge, currency),
            product_data: {
              name: t("api.stripe.productName", { silver: silver.toLocaleString() }),
              description: t("api.stripe.productDesc", { silver: silver.toLocaleString() }),
            },
          },
        },
      ],
      // Copied onto the PaymentIntent too, so the order is traceable from
      // either object in the Stripe dashboard.
      // `app` marks the session as ours: the Stripe account is shared with
      // another product, so the webhook uses this to ignore its events.
      metadata: { app: APP_TAG, order_id: purchase.id, user_id: profile.id, silver: String(silver) },
      payment_intent_data: {
        metadata: { app: APP_TAG, order_id: purchase.id, user_id: profile.id, silver: String(silver) },
      },
      success_url: `${origin}/buy?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/buy?stripe=cancel&order_id=${purchase.id}`,
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");

    await admin
      .from("purchases")
      .update({ stripe_session_id: session.id })
      .eq("id", purchase.id);

    return NextResponse.json({
      order_id: purchase.id,
      url: session.url,
      silver,
      usd,
      // What the card is actually charged, for the buyer's confirmation.
      charge,
      currency: currency.toUpperCase(),
      rate,
    });
  } catch (e) {
    await admin
      .from("purchases")
      .update({ status: "failed" })
      .eq("id", purchase.id);
    console.error("[stripe] checkout session failed:", e);
    return NextResponse.json({ error: t("api.stripe.createFailed") }, { status: 502 });
  }
}
