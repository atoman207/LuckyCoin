import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireAdmin } from "@/lib/auth";
import { APP_TAG, fromStripeAmount, getStripe, isStripeConfigured } from "@/lib/stripe";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
//  管理画面「入金履歴」— Stripe の実際の決済を取得します。
//
//  重要: この Stripe アカウントは他サービスと共有されており、アカウント全体の
//  決済がぶら下がっています。ここで返すのは「本システム経由の決済だけ」です。
//  判定は次の 2 つで、どちらかに当てはまるものだけを採用します。
//
//    1. PaymentIntent の metadata.app が "luckycoin"（= APP_TAG）である。
//       /api/purchase/stripe が作るセッションと PaymentIntent には必ず
//       このマーカーを刻んでいます。
//    2. PaymentIntent の metadata.order_id が、自前の purchases テーブルに
//       ある注文を指している（マーカーが欠けた決済を取りこぼさないための保険）。
//
//  Stripe の Search API（metadata 検索）は最大 1 分ほどの反映遅れがあるため、
//  リアルタイム表示には使わず、list API を期間で引いて自前で絞り込みます。
// =====================================================================

// 1 リクエストで走査する PaymentIntent の上限。Stripe のページングは
// 100 件／ページなので、最大 20 ページ = 2,000 件まで。
const MAX_PAGES = 20;
const PAGE_SIZE = 100;

// 取得期間の既定値と上限（日数）。
const DEFAULT_DAYS = 30;
const MAX_DAYS = 730;

export type StripePaymentRow = {
  id: string; // PaymentIntent id
  created: string; // ISO 8601
  amount: number; // 実際に受領した金額（円などの主要単位）
  refunded: number; // 返金済み金額（同上）
  net: number; // amount - refunded
  currency: string; // 大文字の通貨コード
  status: Stripe.PaymentIntent.Status;
  buyerName: string | null; // 自前 DB の購入者
  buyerEmail: string | null;
  silver: number | null; // 付与したシルバー枚数
  orderId: string | null; // purchases.id
  credited: boolean | null; // コイン付与済みか
  receiptEmail: string | null;
  brand: string | null; // カードブランド（visa / mastercard …）
  last4: string | null;
};

/** 自前 DB に記録済みの Stripe 決済。買い手の情報と突き合わせるために引きます。 */
type OrderRow = {
  id: string;
  silver: number;
  credited: boolean;
  profiles: { nickname: string; email: string } | null;
};

export async function GET(req: Request) {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: t("api.admin.only") }, { status: 403 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: t("api.stripe.notConfigured") }, { status: 503 });
  }

  const url = new URL(req.url);
  const days = Math.min(
    MAX_DAYS,
    Math.max(1, Math.floor(Number(url.searchParams.get("days")) || DEFAULT_DAYS))
  );
  const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

  // --- 1. 自前 DB 側の Stripe 注文 -------------------------------------
  // 注文 id をキーに引けるようにしておきます（PaymentIntent の metadata.order_id
  // と突き合わせます）。買い手名やシルバー数は Stripe 側には無いので、ここから
  // しか出せません。注文は決済より先に作られるため、期間の端で取りこぼさない
  // よう 1 日ぶん手前から引きます。
  const { data: orders, error: ordersErr } = await ctx.admin
    .from("purchases")
    .select("id, silver, credited, profiles ( nickname, email )")
    .eq("method", "stripe")
    .gte("created_at", new Date((since - 24 * 60 * 60) * 1000).toISOString())
    .limit(2000);
  if (ordersErr) console.error("[stripe] could not load orders:", ordersErr.message);

  const byOrderId = new Map<string, OrderRow>();
  for (const o of (orders ?? []) as unknown as OrderRow[]) byOrderId.set(o.id, o);

  // --- 2. Stripe 側の PaymentIntent を期間で走査 ------------------------
  const stripe = getStripe();
  const rows: StripePaymentRow[] = [];
  let truncated = false;

  try {
    let startingAfter: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const res: Stripe.ApiList<Stripe.PaymentIntent> = await stripe.paymentIntents.list({
        limit: PAGE_SIZE,
        created: { gte: since },
        starting_after: startingAfter,
        // 返金額とカードの下 4 桁は Charge 側にあります。
        expand: ["data.latest_charge"],
      });

      for (const pi of res.data) {
        const order = byOrderId.get(pi.metadata?.order_id ?? "") ?? null;

        // 本システム経由の決済だけを残します（上のコメントの 1 と 2）。
        const isOurs = pi.metadata?.app === APP_TAG || order !== null;
        if (!isOurs) continue;

        const charge =
          pi.latest_charge && typeof pi.latest_charge !== "string" ? pi.latest_charge : null;
        const card = charge?.payment_method_details?.card ?? null;

        // amount_received は実際に受け取った額。未確定の決済では 0 です。
        const amount = fromStripeAmount(pi.amount_received || 0, pi.currency);
        const refunded = fromStripeAmount(charge?.amount_refunded ?? 0, pi.currency);

        rows.push({
          id: pi.id,
          created: new Date(pi.created * 1000).toISOString(),
          amount,
          refunded,
          net: amount - refunded,
          currency: pi.currency.toUpperCase(),
          status: pi.status,
          buyerName: order?.profiles?.nickname ?? null,
          buyerEmail: order?.profiles?.email ?? null,
          silver: order?.silver ?? (pi.metadata?.silver ? Number(pi.metadata.silver) : null),
          orderId: order?.id ?? pi.metadata?.order_id ?? null,
          credited: order?.credited ?? null,
          receiptEmail: pi.receipt_email ?? charge?.billing_details?.email ?? null,
          brand: card?.brand ?? null,
          last4: card?.last4 ?? null,
        });
      }

      if (!res.has_more) break;
      startingAfter = res.data[res.data.length - 1]?.id;
      if (!startingAfter) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }
  } catch (e) {
    console.error("[stripe] could not list payments:", e);
    return NextResponse.json({ error: t("api.stripe.historyFailed") }, { status: 502 });
  }

  // 新しい順。
  rows.sort((a, b) => b.created.localeCompare(a.created));

  // --- 3. 集計 ---------------------------------------------------------
  // 売上として数えるのは決済が成立したものだけ（succeeded）です。
  const succeeded = rows.filter((r) => r.status === "succeeded");
  const todayKey = new Date().toISOString().slice(0, 10);

  const grossTotal = succeeded.reduce((s, r) => s + r.amount, 0);
  const refundTotal = succeeded.reduce((s, r) => s + r.refunded, 0);
  const todayRows = succeeded.filter((r) => r.created.slice(0, 10) === todayKey);

  // 日別の売上推移（0 件の日も 0 として埋め、グラフが途切れないようにします）。
  const perDay = new Map<string, { net: number; count: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    perDay.set(d, { net: 0, count: 0 });
  }
  for (const r of succeeded) {
    const d = r.created.slice(0, 10);
    const cur = perDay.get(d);
    if (!cur) continue; // 期間外（時差の端）は無視
    cur.net += r.net;
    cur.count += 1;
  }

  return NextResponse.json({
    payments: rows,
    series: [...perDay.entries()].map(([date, v]) => ({ date, net: v.net, count: v.count })),
    summary: {
      currency: succeeded[0]?.currency ?? "JPY",
      grossTotal,
      refundTotal,
      netTotal: grossTotal - refundTotal,
      count: succeeded.length,
      todayNet: todayRows.reduce((s, r) => s + r.net, 0),
      todayCount: todayRows.length,
      average: succeeded.length ? (grossTotal - refundTotal) / succeeded.length : 0,
      days,
      truncated,
    },
    fetchedAt: new Date().toISOString(),
  });
}
