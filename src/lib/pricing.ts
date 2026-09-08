// USD price feed for converting a pack's USD price into the crypto amount the
// buyer must send. Stablecoins are treated as $1. Uses CoinGecko's free, no-key
// endpoint. SERVER ONLY (called when an order is created so the quote is
// locked for the payment window).
//
// Failures throw an Error whose message is a MESSAGE KEY — the calling route
// translates it into the visitor's language.

import type { MessageKey } from "@/lib/i18n";

const COINGECKO = "https://api.coingecko.com/api/v3/simple/price";

export async function getUsdPrice(coingeckoId: string): Promise<number> {
  if (coingeckoId === "tether") return 1; // USDT ≈ $1

  const res = await fetch(`${COINGECKO}?ids=${coingeckoId}&vs_currencies=usd`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("api.pricing.rateFetchFailed" satisfies MessageKey);
  const data = await res.json().catch(() => ({}));
  const price = data?.[coingeckoId]?.usd;
  if (!price || typeof price !== "number") {
    throw new Error("api.pricing.rateUnavailable" satisfies MessageKey);
  }
  return price;
}
