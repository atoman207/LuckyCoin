import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_PACKS, CUSTOM_SILVER_MIN, CUSTOM_SILVER_MAX, customCost } from "@/lib/coins";
import {
  APP_TAG,
  CHARGE_CURRENCY,
  MIN_CHARGE_JPY,
  chargeFromUsd,
  formatCharge,
  getStripe,
  isStripeConfigured,
  toStripeAmount,
} from "@/lib/stripe";
import { USD_JPY_BOOK_RATE } from "@/lib/fx-book";
import { getSiteOrigin } from "@/lib/site-url";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// カード決済 — シルバーパック用の Stripe Checkout セッションを作成します。
//
// ここではコインを加算しません。まず「支払い待ち」の注文行を書き込み、その id を
// セッションに紐づけ（client_reference_id + metadata）、Stripe が支払い完了を
// 通知して初めてコインを加算します。加算経路は Webhook（/api/stripe/webhook）と、
// 購入者が /buy に戻ったとき（/api/purchase/stripe/status）の 2 つで、
// どちらを通っても加算は 1 回だけです。
export async function POST(req: Request) {
  const t = await getT();

  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: t("api.stripe.notConfigured") }, { status: 503 });
  }

  const { admin, profile } = ctx;
  const body = await req.json().catch(() => ({}));

  // 固定パックか、自由入力（シルバー 1〜100 枚）を受け付けます。価格は必ず
  // サーバー側で算出するので、ブラウザが支払額を選ぶことはできません。
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

  // カタログは USD 建てのまま、請求は固定ブックレートで日本円に換算します。
  const charge = chargeFromUsd(usd);

  // Stripe は通貨ごとの最低額（¥50）未満を受け付けません。汎用エラーを
  // 購入者に見せるのではなく、はっきり理由を伝えます。
  if (charge < MIN_CHARGE_JPY) {
    return NextResponse.json(
      { error: t("api.stripe.amountTooSmall", { min: formatCharge(MIN_CHARGE_JPY) }) },
      { status: 400 }
    );
  }

  const { data: purchase, error } = await admin
    .from("purchases")
    .insert({
      user_id: profile.id,
      silver,
      // usd_amount は USD 建ての定価のまま。集計や管理画面の比較軸です。
      usd_amount: usd,
      currency: "カード · Stripe（JPY）",
      method_id: "stripe-card",
      method: "stripe",
      // pay_amount / pay_currency には実際にカードへ請求した金額を記録します。
      pay_amount: charge,
      pay_currency: "JPY",
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
      locale: "ja",
      client_reference_id: purchase.id,
      customer_email: profile.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CHARGE_CURRENCY,
            unit_amount: toStripeAmount(charge),
            product_data: {
              name: t("api.stripe.productName", { silver: silver.toLocaleString() }),
              description: t("api.stripe.productDesc", { silver: silver.toLocaleString() }),
            },
          },
        },
      ],
      // PaymentIntent 側にも同じ metadata を写すので、Stripe ダッシュボードの
      // どちらのオブジェクトからでも注文を追跡できます。
      // `app` は「このサイトのセッションである」という目印です。Stripe
      // アカウントは他サービスと共有しているため、Webhook と管理画面の
      // 入金履歴はこの値で自分の決済だけを選び出します。
      metadata: { app: APP_TAG, order_id: purchase.id, user_id: profile.id, silver: String(silver) },
      payment_intent_data: {
        metadata: { app: APP_TAG, order_id: purchase.id, user_id: profile.id, silver: String(silver) },
      },
      success_url: `${origin}/buy?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/buy?stripe=cancel&order_id=${purchase.id}`,
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");

    // 記録用です。注文とセッションは client_reference_id で結び付いているので、
    // ここで保存に失敗しても決済とコインの加算には影響しません。
    const { error: refErr } = await admin
      .from("purchases")
      .update({ stripe_session_id: session.id })
      .eq("id", purchase.id);
    if (refErr) console.warn("[stripe] could not store the session id:", refErr.message);

    return NextResponse.json({
      order_id: purchase.id,
      url: session.url,
      silver,
      usd,
      // 実際にカードへ請求される金額（購入者への確認表示用）。
      charge,
      currency: "JPY",
      rate: USD_JPY_BOOK_RATE,
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
