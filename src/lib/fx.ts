// =====================================================================
//  USD → settlement-currency exchange rates. SERVER ONLY.
//
//  Pack prices in COIN_PACKS are denominated in USD, but Stripe charges in
//  ONE currency and must be handed the amount already expressed in it. So a
//  ¥ checkout converts the USD price at the fixed book rate in fx-book.ts
//  (¥150 per $1). Other currencies still use a live feed.
//
//  Failures throw an Error whose message is a MESSAGE KEY (same convention as
//  lib/pricing.ts), so the calling route can translate it for the visitor.
// =====================================================================

import type { MessageKey } from "@/lib/i18n";
import { USD_JPY_BOOK_RATE } from "@/lib/fx-book";

// Rates are cached in memory so a burst of checkouts makes at most one
// upstream call per window. Short enough that the quote shown on /buy and the
// amount actually charged agree.
const TTL_MS = 10 * 60 * 1000;
type Entry = { rate: number; at: number };
const cache = new Map<string, Entry>();

// A rate outside this band means a garbled or wrong-way-round response, not a
// real market move. Refusing it is what stops a bad feed from charging ¥1 or
// ¥100,000 for a $2 pack.
const SANE_RANGE: Record<string, [number, number]> = {
  jpy: [60, 400],
  eur: [0.5, 2],
  gbp: [0.4, 2],
  krw: [500, 3000],
  cny: [3, 15],
};

function isSane(currency: string, rate: number): boolean {
  if (!Number.isFinite(rate) || rate <= 0) return false;
  const band = SANE_RANGE[currency];
  return band ? rate >= band[0] && rate <= band[1] : true;
}

// Manual override, e.g. USD_EUR_RATE=0.92. JPY ignores this unless set —
// the default book rate is USD_JPY_BOOK_RATE (150).
function envRate(currency: string): number | null {
  const raw = process.env[`USD_${currency.toUpperCase()}_RATE`];
  if (!raw) return null;
  const n = Number(raw);
  if (!isSane(currency, n)) {
    console.error(`[fx] ignoring out-of-range USD_${currency.toUpperCase()}_RATE:`, raw);
    return null;
  }
  return n;
}

async function fetchFromErApi(currency: string): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const rate = data?.rates?.[currency.toUpperCase()];
    return typeof rate === "number" ? rate : null;
  } catch {
    return null;
  }
}

// Second opinion, no API key required: USDT is pegged to $1, so its price in
// the target currency is the USD rate. CoinGecko is already used by pricing.ts.
async function fetchFromCoingecko(currency: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=${currency.toLowerCase()}`,
      { headers: { accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const rate = data?.tether?.[currency.toLowerCase()];
    return typeof rate === "number" ? rate : null;
  } catch {
    return null;
  }
}

/**
 * How many units of `currency` one US dollar buys.
 *
 * JPY is a fixed book rate (150) for now — never a live market quote.
 * Other currencies: env override → live feed → last good cached rate.
 */
export async function getUsdRate(currency: string): Promise<number> {
  const key = currency.toLowerCase();
  if (key === "usd") return 1;

  const override = envRate(key);
  if (override !== null) return override;

  // Japanese yen is billed at the book rate regardless of the market.
  if (key === "jpy") return USD_JPY_BOOK_RATE;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rate;

  for (const source of [fetchFromErApi, fetchFromCoingecko]) {
    const rate = await source(key);
    if (rate !== null && isSane(key, rate)) {
      cache.set(key, { rate, at: Date.now() });
      return rate;
    }
  }

  // Every feed failed. A stale rate is still a real rate — far better than
  // failing the sale outright.
  if (hit) {
    console.error(`[fx] all rate sources failed for ${key}; using cached rate from`, new Date(hit.at));
    return hit.rate;
  }

  throw new Error("api.pricing.rateFetchFailed" satisfies MessageKey);
}

/** Converts a USD price into `currency`, rounded the way that currency is billed. */
export async function convertFromUsd(
  usd: number,
  currency: string
): Promise<{ amount: number; rate: number }> {
  const rate = await getUsdRate(currency);
  const raw = usd * rate;
  // Zero-decimal currencies (¥) bill whole units; everything else to a cent.
  const amount = ZERO_DECIMAL.has(currency.toLowerCase())
    ? Math.round(raw)
    : Math.round(raw * 100) / 100;
  return { amount, rate };
}

// Currencies Stripe expects WITHOUT a minor unit (¥100 is sent as 100, not
// 10000). https://docs.stripe.com/currencies#zero-decimal
export const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);
