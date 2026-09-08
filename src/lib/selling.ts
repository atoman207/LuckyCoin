// Coin selling: price + availability. Selling is open at all times, so gold can
// be sold immediately (no Sunday-only trading window).
// Used by both the /sell page (UX) and the /api/sell route (authoritative).
import type { MessageKey } from "@/lib/i18n";

export const SELL_PRICE_USDT = 1000; // per gold coin
// Message key for "when you can sell" — selling is always available.
export const SELL_HOURS_KEY: MessageKey = "sell.hoursAnyTime";

// Selling is always open now — items can be sold immediately.
export function isSellOpen(): boolean {
  return true;
}

// A short status object for the UI. `message` is a message key.
export function sellStatus(): { open: boolean; message: MessageKey } {
  return { open: true, message: "api.sell.open" };
}
