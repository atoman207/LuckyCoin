import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { creditPurchase } from "@/lib/purchase-credit";
import { getT } from "@/lib/i18n/server";


export const runtime = "nodejs";

// Called by /buy when the buyer returns from Stripe Checkout with
// ?stripe=success&session_id=…
//
// The webhook is the authoritative confirmation, but it can land a second or
// two later — this route asks Stripe directly so the coins appear immediately.
// Both paths funnel through creditPurchase(), which credits at most once.
export async function POST(req: Request) {
  const t = await getT();

  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: t("api.stripe.notConfigured") }, { status: 503 });
  }

  const { admin, profile } = ctx;
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ error: t("api.stripe.sessionRequired") }, { status: 400 });
  }

  let session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: t("api.stripe.sessionNotFound") }, { status: 404 });
  }

  const orderId = session.client_reference_id || session.metadata?.order_id || null;
  if (!orderId) {
    return NextResponse.json({ error: t("api.stripe.sessionNotFound") }, { status: 404 });
  }

  // The order must belong to the caller — a session id alone must never be
  // enough to credit somebody else's account.
  const { data: order } = await admin
    .from("purchases")
    .select("id, user_id, silver, credited")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.user_id !== profile.id) {
    return NextResponse.json({ error: t("api.purchase.orderNotFound") }, { status: 404 });
  }

  if (order.credited) {
    return NextResponse.json({
      ok: true,
      status: "paid",
      silver: Number(order.silver),
      message: t("api.purchase.alreadyCredited"),
      profile,
    });
  }

  if (session.status === "expired") {
    await admin
      .from("purchases")
      .update({ status: "canceled" })
      .eq("id", order.id)
      .eq("credited", false);
    return NextResponse.json({ ok: false, status: "canceled", message: t("api.stripe.canceled") });
  }

  if (session.payment_status !== "paid") {
    // "unpaid" while the session is still open, or a delayed payment method
    // that has not settled yet — the webhook will finish the job.
    return NextResponse.json({
      ok: false,
      status: session.status === "open" ? "pending" : "processing",
      message:
        session.status === "open" ? t("api.stripe.notPaid") : t("api.stripe.processing"),
    });
  }

  const result = await creditPurchase(admin, order.id, {
    stripe_session_id: session.id,
    stripe_payment_intent:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: t("api.serverError") }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: "paid",
    silver: result.silver,
    message: t("api.stripe.credited", { silver: result.silver.toLocaleString() }),
    profile: result.profile,
  });
}
