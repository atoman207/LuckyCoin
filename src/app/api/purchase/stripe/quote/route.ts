import { NextResponse } from "next/server";
import { MIN_CHARGE_JPY, isStripeConfigured } from "@/lib/stripe";
import { USD_JPY_BOOK_RATE } from "@/lib/fx-book";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /buy に「カードに請求される通貨とレート」を伝えるだけの読み取り専用ルート。
// 実際の請求額は必ず /api/purchase/stripe 側でサーバー再計算します。
// 日本専用サイトなので、常に ¥150 / $1 の固定ブックレートです。
export async function GET() {
  return NextResponse.json({
    available: isStripeConfigured(),
    currency: "JPY",
    rate: USD_JPY_BOOK_RATE,
    zeroDecimal: true,
    minCharge: MIN_CHARGE_JPY,
  });
}
