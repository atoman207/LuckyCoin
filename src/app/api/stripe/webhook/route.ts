import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_TAG, getStripe, isStripeConfigured } from "@/lib/stripe";
import { creditPurchase } from "@/lib/purchase-credit";

export const runtime = "nodejs";
// The signature is computed over the RAW body, so this route must never be
// cached or pre-rendered.
export const dynamic = "force-dynamic";

// =====================================================================
//  Stripe webhook — the authoritative confirmation that a card payment
//  succeeded. Set it up once in the Stripe dashboard:
//
//    Endpoint URL : https://YOUR-DOMAIN/api/stripe/webhook
//    Events       : checkout.session.completed
//                   checkout.session.async_payment_succeeded
//                   checkout.session.async_payment_failed
//                   checkout.session.expired
//
//  Copy the signing secret it gives you into STRIPE_WEBHOOK_SECRET.
//
//  Every request is signature-verified before it is trusted — an unsigned or
//  mis-signed body is rejected with 400 and nothing is credited.
// =====================================================================
// Order ids are Postgres UUIDs. Anything else cannot be one of ours, and
// querying with it would only produce an invalid-uuid error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The order id a Checkout Session refers to, or null when the session belongs
 * to something else.
 *
 * This matters because the Stripe account is shared with another product, and
 * an endpoint receives every event of its subscribed types account-wide — not
 * only the ones this site created. Their sessions must be ANSWERED 200 AND
 * IGNORED: replying 500 to a stranger's event would put our endpoint into
 * Stripe's retry-then-disable cycle, and a disabled endpoint stops crediting
 * our own buyers.
 */
function ourOrderId(session: Stripe.Checkout.Session): string | null {
  const app = session.metadata?.app;
  // Sessions we create carry the marker. Anything explicitly tagged as another
  // product is rejected outright; untagged sessions predate the marker and are
  // still checked against the database below.
  if (app && app !== APP_TAG) return null;
  const id = session.client_reference_id || session.metadata?.order_id;
  return typeof id === "string" && UUID_RE.test(id) ? id : null;
}

async function orderExists(admin: SupabaseClient, orderId: string): Promise<boolean> {
  const { data } = await admin.from("purchases").select("id").eq("id", orderId).maybeSingle();
  return !!data;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isStripeConfigured() || !secret) {
    // 503 (not 400) so Stripe retries once the deployment is configured.
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    // constructEventAsync uses WebCrypto, which works on every Next.js runtime.
    event = await getStripe().webhooks.constructEventAsync(raw, signature, secret);
  } catch (e) {
    console.error("[stripe] webhook signature verification failed:", e);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = ourOrderId(session);

        // Not one of ours — see ourOrderId(). Acknowledged and ignored.
        if (!orderId) break;

        // `completed` also fires for delayed payment methods that have not
        // actually settled yet — only credit once Stripe says it is paid.
        if (session.payment_status !== "paid") break;

        // Confirm the order really exists here before treating a failure to
        // credit it as OUR problem. Without this, a neighbouring product whose
        // ids happen to be UUIDs would drive our endpoint into 500s.
        if (!(await orderExists(admin, orderId))) {
          console.warn("[stripe] ignoring session for an unknown order", orderId);
          break;
        }

        const result = await creditPurchase(admin, orderId, {
          stripe_session_id: session.id,
          stripe_payment_intent:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null,
        });
        if (!result.ok) {
          // A genuine failure on an order we own: answer 500 so Stripe retries
          // with backoff instead of dropping a payment we have taken.
          console.error("[stripe] could not credit order", orderId, result.reason);
          return NextResponse.json({ error: "Could not credit the order." }, { status: 500 });
        }
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = ourOrderId(session);
        if (orderId) {
          await admin
            .from("purchases")
            .update({ status: "failed" })
            .eq("id", orderId)
            .eq("credited", false);
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = ourOrderId(session);
        if (orderId) {
          await admin
            .from("purchases")
            .update({ status: "canceled" })
            .eq("id", orderId)
            .eq("credited", false);
        }
        break;
      }

      default:
        // Every other event type is acknowledged and ignored.
        break;
    }
  } catch (e) {
    console.error("[stripe] webhook handler error:", e);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
