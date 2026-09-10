// =====================================================================
//  Stripe — カード決済。サーバー専用。
//  シークレットキーがブラウザに渡ることはありません。ブラウザが受け取る
//  のは Stripe が返すホスト型 Checkout の URL だけです。
//
//  必須の環境変数（.env.example を参照）:
//    STRIPE_SECRET_KEY      sk_live_… / sk_test_…
//    STRIPE_WEBHOOK_SECRET  whsec_…  （作成した Webhook エンドポイントの署名鍵）
//
//  本サイトは日本国内向けの単一通貨（日本円）です。パック価格は USD 建てで
//  管理し、請求は常に ¥150 / $1 の固定ブックレート（lib/fx-book.ts）で
//  日本円に換算します。市場レートは参照しません。
// =====================================================================

import Stripe from "stripe";
import { usdToJpy, formatJpy } from "@/lib/fx-book";

// この Stripe アカウントは他のサービスと共有されています。Webhook は購読中の
// イベント種別をアカウント全体から受け取るため、自分の注文かどうかをこの
// マーカーで判別します。管理画面の入金履歴も同じマーカーで絞り込みます。
export const APP_TAG = "luckycoin";

// 請求通貨。日本専用サイトなので日本円に固定です。
export const CHARGE_CURRENCY = "jpy";

// Stripe が「最小単位を持たない」通貨として扱うもの。¥100 は 10000 ではなく
// 100 として送ります。https://docs.stripe.com/currencies#zero-decimal
export const IS_ZERO_DECIMAL = true;

// Stripe の最低請求額（日本円）。
// https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts
export const MIN_CHARGE_JPY = 50;

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// キーが無いときは例外を投げるので、ルート側はスタックトレースではなく
// 分かりやすい日本語のメッセージで応答できます。
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  cached = new Stripe(key, {
    // apiVersion は指定しません。SDK がビルド時に固定したバージョンが、
    // Stripe 側でまとめてテストされている組み合わせです。
    typescript: true,
    appInfo: { name: "Lucky Coin", url: "https://luckybronzecoin.com" },
  });
  return cached;
}

// USD 建ての表示価格を、実際に請求する日本円の金額に換算します。
export function chargeFromUsd(usd: number): number {
  return usdToJpy(usd);
}

// 人に見せるための金額表記（日本円）。
export function formatCharge(jpy: number): string {
  return formatJpy(jpy);
}

// 日本円は最小単位を持たないので、Stripe にはそのままの整数を渡します。
export function toStripeAmount(jpy: number): number {
  return Math.round(jpy);
}

// その逆 — Stripe が返した金額を人が読む単位に戻します。管理画面の入金履歴で
// 使うため、JPY 以外（過去の決済など）にも耐えるようにしてあります。
export function fromStripeAmount(amount: number, currency = CHARGE_CURRENCY): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;
}

// fromStripeAmount() 用。過去に別通貨で決済された履歴を正しく表示するために
// 一覧を残しています。
export const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);
