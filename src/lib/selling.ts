// Coin selling: price + availability. Selling is open at all times, so gold can
// be sold immediately (no Sunday-only trading window).
// Used by both the /sell page (UX) and the /api/sell route (authoritative).
import type { MessageKey } from "@/lib/i18n";

/** ゴールド 1 枚あたりの売却価格（日本円）。 */
export const SELL_PRICE_JPY = 150_000;

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

/** 金額を日本円表記にします（例: 150,000円）。 */
export function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`;
}
