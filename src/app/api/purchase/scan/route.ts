import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_PACKS, CUSTOM_SILVER_MIN, CUSTOM_SILVER_MAX } from "@/lib/coins";
import { verifyPayment, scanIncoming, findPayment, PAYMENT_WINDOW_MS } from "@/lib/chains";

export const runtime = "nodejs";

// Auto-detect payment. The client polls this once per second while the checkout
// modal is open. We scan OUR receiving address for recent incoming transactions,
// then run each candidate through the same on-chain verification used by the
// manual flow. The first transaction that genuinely pays this order's exact
// amount (within the window, not already used) credits the coins atomically.
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;
  const body = await req.json().catch(() => ({}));
  const orderId = typeof body.order_id === "string" ? body.order_id : null;
  if (!orderId) return NextResponse.json({ error: "Order id is required." }, { status: 400 });

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

  const createdAtMs = new Date(order.created_at).getTime();
  if (Date.now() > createdAtMs + PAYMENT_WINDOW_MS + 60_000) {
    return NextResponse.json({ ok: false, expired: true });
  }

  const silver = Number(order.silver);
  const validSilver =
    COIN_PACKS.some((p) => p.silver === silver) ||
    (Number.isInteger(silver) && silver >= CUSTOM_SILVER_MIN && silver <= CUSTOM_SILVER_MAX);
  if (!validSilver) return NextResponse.json({ error: "Invalid order." }, { status: 400 });

  // Fast path: a dedicated address-indexed endpoint (Etherscan V2 / TronGrid)
  // returns a fully-validated matching hash in one call. Falls back to the
  // generic address scan for other chains or when no API key is configured.
  const matchedHash = await findPayment(
    order.method_id,
    Number(order.pay_amount),
    createdAtMs
  ).catch(() => null);

  const candidates = matchedHash ? [matchedHash] : await scanIncoming(order.method_id);
  if (candidates.length === 0) return NextResponse.json({ ok: false, pending: true });

  // Drop any hash already used by any order (one payment can't credit twice).
  const { data: used } = await admin.from("purchases").select("tx_hash").in("tx_hash", candidates);
  const usedSet = new Set((used ?? []).map((u: { tx_hash: string | null }) => u.tx_hash));
  const fresh = candidates.filter((h) => !usedSet.has(h));

  for (const hash of fresh) {
    // The fast-path hash is already validated; scanned candidates still need it.
    if (hash !== matchedHash) {
      const result = await verifyPayment(order.method_id, hash, Number(order.pay_amount), createdAtMs);
      if (!result.ok) continue;
    }

    // Atomic claim: first writer with credited=false wins; the unique tx_hash
    // index blocks reusing one payment across orders.
    const { data: claimed, error: claimErr } = await admin
      .from("purchases")
      .update({ credited: true, status: "completed", tx_hash: hash })
      .eq("id", order.id)
      .eq("credited", false)
      .select("id")
      .maybeSingle();

    if (claimErr) continue; // tx_hash already used by another order — try next candidate
    if (!claimed) return NextResponse.json({ ok: true, message: "Already credited.", profile });

    const { data: updated } = await admin
      .from("profiles")
      .update({ silver: profile.silver + silver })
      .eq("id", profile.id)
      .select("*")
      .single();

    return NextResponse.json({
      ok: true,
      silver,
      message: `Payment received — ${silver} silver added.`,
      profile: updated,
    });
  }

  return NextResponse.json({ ok: false, pending: true });
}
