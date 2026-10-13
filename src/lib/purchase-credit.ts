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
//
//  Neither entry point may call this before Stripe reports the session as
//  paid — creating an order, or opening the Checkout page, credits nothing.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

export type CreditResult =
  | { ok: true; credited: boolean; silver: number; profile: unknown }
  | { ok: false; reason: "not_found" | "error" };

// Order ids are Postgres UUIDs. Anything else cannot be one of ours, and
// querying with it would only produce an invalid-uuid error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

// Purchased silver is NOT capped — SILVER_CAP only limits coins the game
// itself hands out; a buyer must always receive everything they paid for.
// Returns the updated profile, or null when the balance could not be written.
async function addSilver(admin: Admin, userId: string, silver: number): Promise<unknown | null> {
  const { data: current, error: readErr } = await admin
    .from("profiles")
    .select("silver")
    .eq("id", userId)
    .maybeSingle();

  // Never fall back to 0 here: writing "0 + silver" after a failed read would
  // replace the buyer's existing balance instead of adding to it.
  if (readErr || !current) return null;

  const { data: updated, error } = await admin
    .from("profiles")
    .update({ silver: Number(current.silver) + silver })
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  return error ? null : updated;
}

/**
 * Marks an order paid and adds its silver to the buyer's balance, exactly once.
 *
 * @param admin      service-role Supabase client
 * @param orderId    purchases.id
 * @param patch      extra columns to store alongside (Stripe ids, …)
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

  // Atomic claim — only the first writer sees credited = false. It writes the
  // claim and nothing else: `patch` is stored separately at the end, so a
  // problem with those bookkeeping columns can never block a paid order.
  const { data: claimed, error: claimErr } = await admin
    .from("purchases")
    .update({ credited: true, status: "completed" })
    .eq("id", order.id)
    .eq("credited", false)
    .select("id")
    .maybeSingle();

  if (claimErr) {
    console.error("[purchase] could not claim order", order.id, claimErr.message);
    return { ok: false, reason: "error" };
  }

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

  const profile = await addSilver(admin, order.user_id, silver);

  if (!profile) {
    // The coins did not land. Hand the claim back so the next attempt (Stripe
    // retries the webhook) credits the order instead of finding it "done".
    await admin
      .from("purchases")
      .update({ credited: false, status: "awaiting_payment" })
      .eq("id", order.id);
    console.error("[purchase] could not add silver for order", order.id);
    return { ok: false, reason: "error" };
  }

  if (Object.keys(patch).length > 0) {
    const { error: patchErr } = await admin.from("purchases").update(patch).eq("id", order.id);
    if (patchErr) {
      console.warn("[purchase] order", order.id, "credited, but its payment reference was not stored:", patchErr.message);
    }
  }

  return { ok: true, credited: true, silver, profile };
}
