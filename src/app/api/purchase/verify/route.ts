import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_PACKS } from "@/lib/coins";
import { verifyPayment } from "@/lib/chains";

export const runtime = "nodejs";

// Verify a buyer-submitted transaction hash against the blockchain and, if it
// genuinely paid the order, credit the coins. This is the ONLY place coins are
// credited for a purchase. Guards:
//   - the order belongs to the caller and isn't already credited
//   - the tx actually paid the right address/asset/amount with confirmations
//   - the tx hash is unique across all orders (can't reuse one payment twice)
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;
  const body = await req.json().catch(() => ({}));
  const orderId = typeof body.order_id === "string" ? body.order_id : null;
  const txHash = typeof body.tx_hash === "string" ? body.tx_hash.trim() : "";

  if (!orderId || !txHash) {
    return NextResponse.json({ error: "Order id and transaction hash are required." }, { status: 400 });
  }

  const { data: order } = await admin
    .from("purchases")
    .select("id, user_id, silver, method_id, pay_amount, credited, created_at")
    .eq("id", orderId)
    .single();

  if (!order || order.user_id !== profile.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (order.credited) {
    return NextResponse.json({ ok: true, message: "Already credited.", profile });
  }

  // The 10-minute window is enforced against the transaction's own on-chain
  // timestamp inside verifyPayment — so paying on time but verifying a little
  // later still works, while an old/replayed payment is rejected.
  const createdAtMs = new Date(order.created_at).getTime();

  // Reject a transaction hash that was already used for any order.
  const { data: dupe } = await admin
    .from("purchases")
    .select("id")
    .eq("tx_hash", txHash)
    .maybeSingle();
  if (dupe) {
    return NextResponse.json({ error: "This transaction has already been used." }, { status: 409 });
  }

  // The amount to match was locked when the order was created; the on-chain
  // timestamp must fall within the 10-minute window from createdAtMs.
  const result = await verifyPayment(order.method_id, txHash, Number(order.pay_amount), createdAtMs);
  if (!result.ok) {
    await admin.from("purchases").update({ status: "verification_failed" }).eq("id", order.id);
    return NextResponse.json({ error: result.reason ?? "Payment could not be verified." }, { status: 400 });
  }

  const pack = COIN_PACKS.find((p) => p.silver === Number(order.silver));
  if (!pack) {
    return NextResponse.json({ error: "Unknown coin pack." }, { status: 400 });
  }

  // Atomic claim: only the first writer with credited=false wins, and the
  // unique tx_hash index blocks reusing one payment. If this update affects no
  // row, someone already credited it.
  const { data: claimed, error: claimErr } = await admin
    .from("purchases")
    .update({ credited: true, status: "completed", tx_hash: txHash })
    .eq("id", order.id)
    .eq("credited", false)
    .select("id")
    .maybeSingle();

  if (claimErr) {
    // Most likely the unique tx_hash constraint — treat as reuse.
    return NextResponse.json({ error: "This transaction has already been used." }, { status: 409 });
  }
  if (!claimed) {
    return NextResponse.json({ ok: true, message: "Already credited.", profile });
  }

  const { data: updated } = await admin
    .from("profiles")
    .update({ silver: profile.silver + pack.silver })
    .eq("id", profile.id)
    .select("*")
    .single();

  return NextResponse.json({
    ok: true,
    message: `Payment verified — ${pack.silver} silver added.`,
    profile: updated,
  });
}
