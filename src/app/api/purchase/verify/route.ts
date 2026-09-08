import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_PACKS, CUSTOM_SILVER_MIN, CUSTOM_SILVER_MAX } from "@/lib/coins";
import { verifyPayment } from "@/lib/chains";
import { creditPurchase } from "@/lib/purchase-credit";
import { isContractPayable, verifyContractPayment } from "@/lib/payment-contract";
import { getLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n";

export const runtime = "nodejs";

// Verify a buyer-submitted transaction hash against the blockchain and, if it
// genuinely paid the order, credit the coins. Guards:
//   - the order belongs to the caller and isn't already credited
//   - the tx actually paid the right address/asset/amount with confirmations
//   - the tx hash is unique across all orders (can't reuse one payment twice)
export async function POST(req: Request) {
  const t = createTranslator(await getLocale());

  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  const { admin, profile } = ctx;
  const body = await req.json().catch(() => ({}));
  const orderId = typeof body.order_id === "string" ? body.order_id : null;
  const txHash = typeof body.tx_hash === "string" ? body.tx_hash.trim() : "";

  if (!orderId || !txHash) {
    return NextResponse.json({ error: t("api.purchase.orderRequired") }, { status: 400 });
  }

  const { data: order } = await admin
    .from("purchases")
    .select("id, user_id, silver, method_id, pay_amount, credited, created_at")
    .eq("id", orderId)
    .single();

  if (!order || order.user_id !== profile.id) {
    return NextResponse.json({ error: t("api.purchase.orderNotFound") }, { status: 404 });
  }
  if (order.credited) {
    return NextResponse.json({ ok: true, message: t("api.purchase.alreadyCredited"), profile });
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
    return NextResponse.json({ error: t("api.purchase.txUsed") }, { status: 409 });
  }

  // A payment made through the LuckyCoinPayments contract carries the order id
  // in its receipt, so it is checked against THAT rather than against an
  // address and an amount. No time window is needed here: the contract will
  // only ever accept this order id once, so an old payment cannot be replayed.
  if (isContractPayable(order.method_id)) {
    const viaContract = await verifyContractPayment(
      order.method_id,
      txHash,
      order.id,
      Number(order.pay_amount)
    ).catch(() => null);

    if (viaContract?.ok) {
      const claimed = await creditPurchase(admin, order.id, { tx_hash: txHash });
      if (!claimed.ok) {
        return NextResponse.json({ error: t("api.purchase.txUsed") }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        message: claimed.credited
          ? t("api.purchase.verified", { silver: claimed.silver.toLocaleString() })
          : t("api.purchase.alreadyCredited"),
        profile: claimed.profile,
      });
    }
    // Anything else (short payment, wrong asset, or simply not a contract
    // transaction) falls through to the plain address check below, so a buyer
    // who sent straight to the wallet is still verified normally.
  }

  // The amount to match was locked when the order was created; the on-chain
  // timestamp must fall within the 10-minute window from createdAtMs.
  const result = await verifyPayment(order.method_id, txHash, Number(order.pay_amount), createdAtMs);
  if (!result.ok) {
    await admin.from("purchases").update({ status: "verification_failed" }).eq("id", order.id);
    return NextResponse.json(
      {
        error: result.reason
          ? t(result.reason, result.reasonVars)
          : t("api.purchase.unverified"),
      },
      { status: 400 }
    );
  }

  // The order amount is valid if it matches a pack OR the custom range — the
  // same rule the order was created under.
  const silver = Number(order.silver);
  const validSilver =
    COIN_PACKS.some((p) => p.silver === silver) ||
    (Number.isInteger(silver) && silver >= CUSTOM_SILVER_MIN && silver <= CUSTOM_SILVER_MAX);
  if (!validSilver) {
    return NextResponse.json({ error: t("api.purchase.invalidOrder") }, { status: 400 });
  }

  // Atomic claim: only the first writer with credited=false wins, and the
  // unique tx_hash index blocks reusing one payment.
  const credited = await creditPurchase(admin, order.id, { tx_hash: txHash });
  if (!credited.ok) {
    return NextResponse.json({ error: t("api.purchase.txUsed") }, { status: 409 });
  }
  if (!credited.credited) {
    return NextResponse.json({
      ok: true,
      message: t("api.purchase.alreadyCredited"),
      profile: credited.profile,
    });
  }

  return NextResponse.json({
    ok: true,
    message: t("api.purchase.verified", { silver: credited.silver.toLocaleString() }),
    profile: credited.profile,
  });
}
