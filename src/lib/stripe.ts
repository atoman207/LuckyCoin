// =====================================================================
//  Stripe — card checkout. SERVER ONLY.
//  The secret key never leaves the server: the browser only ever receives
//  the hosted Checkout URL that Stripe returns.
//
//  Required environment variables (see .env.example):
//    STRIPE_SECRET_KEY      sk_live_… / sk_test_…
//    STRIPE_WEBHOOK_SECRET  whsec_…  (from the webhook endpoint you create)
//  Optional:
//    STRIPE_CURRENCY        3-letter ISO code. Forces ONE currency for every
//                           buyer. Left unset, the charge currency follows the
//                           language the site is being viewed in — Japanese
//                           visitors are charged in JPY, everyone else in USD.
//    USD_JPY_RATE           unused for JPY unless set; yen is billed at the
//                           book rate of ¥150 / $1 (see src/lib/fx-book.ts).
// =====================================================================

import Stripe from "stripe";
import { ZERO_DECIMAL } from "@/lib/fx";
import type { Locale } from "@/lib/i18n/config";

// This Stripe account is shared with another product, and a webhook endpoint
// receives EVERY event of its subscribed types from the whole account — not
// just the ones this site created. Sessions are stamped with this marker so
// our webhook can tell its own orders apart from the neighbour's.
export const APP_TAG = "luckycoin";

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Throws when the key is missing so routes can answer with a friendly message
// instead of a stack trace.
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  cached = new Stripe(key, {
    // No apiVersion override — the SDK pins the version it was built against,
    // which is the combination Stripe tests together.
    typescript: true,
    appInfo: { name: "Lucky Coin", url: "https://luckybronzecoin.com" },
  });
  return cached;
}

// Pack prices are USD. The currency the card is actually charged in follows
// the visitor's language, so a Japanese buyer sees and pays yen, while the
// prices on the page stay dollar-denominated. STRIPE_CURRENCY overrides it.
const LOCALE_CURRENCY: Record<Locale, string> = { ja: "jpy", en: "usd" };

export function getStripeCurrency(locale: Locale = "en"): string {
  const forced = process.env.STRIPE_CURRENCY?.trim().toLowerCase();
  if (forced) return forced;
  return LOCALE_CURRENCY[locale] ?? "usd";
}

// Stripe rejects a charge below a per-currency floor, in major units.
// https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts
const MIN_CHARGE: Record<string, number> = {
  usd: 0.5, jpy: 50, eur: 0.5, gbp: 0.3, aud: 0.5, cad: 0.5,
  chf: 0.5, dkk: 2.5, nok: 3, sek: 3, hkd: 4, sgd: 0.5, nzd: 0.5,
  mxn: 10, brl: 0.5, inr: 0.5, krw: 100,
};

export function minChargeAmount(currency: string): number {
  return MIN_CHARGE[currency.toLowerCase()] ?? 0.5;
}

export function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL.has(currency.toLowerCase());
}

// Formats an amount for a human, in the currency it will be charged in.
export function formatCharge(amount: number, currency: string, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: isZeroDecimal(currency) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

// Converts a decimal price into the smallest unit Stripe bills in.
export function toStripeAmount(amount: number, currency: string): number {
  return isZeroDecimal(currency) ? Math.round(amount) : Math.round(amount * 100);
}

// The inverse — used when reporting back what the customer actually paid.
export function fromStripeAmount(amount: number, currency: string): number {
  return isZeroDecimal(currency) ? amount : amount / 100;
}
