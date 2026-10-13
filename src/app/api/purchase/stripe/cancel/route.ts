import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { isOrderId } from "@/lib/purchase-credit";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// Called by /buy when the buyer backs out of Stripe Checkout with
// ?stripe=cancel&order_id=…
//
// Nothing was charged and nothing was credited, so this only records the
// outcome: the order stops being listed as "awaiting payment".
//
// It can never touch a paid order — the update only matches while the order is
// still uncredited and awaiting payment. And if the buyer reopens the same
// Checkout page afterwards and does pay, creditPurchase() still credits it.
export async function POST(req: Request) {
  const t = await getT();

  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  const { admin, profile } = ctx;
  const body = await req.json().catch(() => ({}));
  const orderId: unknown = body.order_id;
  if (!isOrderId(orderId)) {
    return NextResponse.json({ error: t("api.purchase.orderNotFound") }, { status: 404 });
  }

  const { error } = await admin
    .from("purchases")
    .update({ status: "canceled" })
    .eq("id", orderId)
    .eq("user_id", profile.id)
    .eq("credited", false)
    .eq("status", "awaiting_payment");

  if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });

  return NextResponse.json({ ok: true });
}
