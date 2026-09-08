// =====================================================================
//  Crediting a paid order. SERVER ONLY.
//
//  Both Stripe entry points need exactly the same behaviour:
//    • the webhook (checkout.session.completed) — the authoritative path;
//    • the browser returning from Checkout (/api/purchase/stripe/status) —
//      so the buyer sees their coins immediately instead of waiting for the
//      webhook to land.
//
//  Whichever arrives first wins; the other becomes a no-op. That is enforced
//  by the atomic `credited = false` claim below (a single UPDATE that only
//  matches while the order is still uncredited), so one payment can never
//  credit twice even if both run at the same moment.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

export type CreditResult =
  | { ok: true; credited: boolean; silver: number; profile: unknown }
  | { ok: false; reason: "not_found" | "error" };

/**
 * Marks an order paid and adds its silver to the buyer's balance, exactly once.
 *
 * @param admin      service-role Supabase client
 * @param orderId    purchases.id
 * @param patch      extra columns to store alongside (Stripe ids, status, …)
 * @returns          `credited: false` when the order had already been credited
 */
export async function creditPurchase(
  admin: Admin,
  orderId: string,
  patch: Record<string, unknown> = {}
): Promise<CreditResult> {
  const { data: order } = await admin
    .from("purchases")
    .select("id, user_id, silver, credited")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, reason: "not_found" };

  const silver = Number(order.silver);

  // Atomic claim — only the first writer sees credited = false.
  const { data: claimed, error: claimErr } = await admin
    .from("purchases")
    .update({ ...patch, credited: true, status: "completed" })
    .eq("id", order.id)
    .eq("credited", false)
    .select("id")
    .maybeSingle();

  if (claimErr) return { ok: false, reason: "error" };

  if (!claimed) {
    // Someone else already credited it. Return the current profile so the
    // caller can still refresh the UI with correct balances.
    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", order.user_id)
      .single();
    return { ok: true, credited: false, silver, profile };
  }

  const { data: current } = await admin
    .from("profiles")
    .select("silver")
    .eq("id", order.user_id)
    .single();

  // Purchased silver is NOT capped — SILVER_CAP only limits coins the game
  // itself hands out; a buyer must always receive everything they paid for.
  const { data: updated, error: creditErr } = await admin
    .from("profiles")
    .update({ silver: (current?.silver ?? 0) + silver })
    .eq("id", order.user_id)
    .select("*")
    .single();

  if (creditErr) return { ok: false, reason: "error" };

  return { ok: true, credited: true, silver, profile: updated };
}
