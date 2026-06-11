// Coin selling: price + availability. Selling is open at all times, so gold can
// be sold immediately (no Sunday-only trading window).
// Used by both the /sell page (UX) and the /api/sell route (authoritative).

export const SELL_PRICE_USDT = 1000; // per gold coin
export const SELL_HOURS_LABEL = "any time"; // selling is always available

// Selling is always open now — items can be sold immediately.
export function isSellOpen(): boolean {
  return true;
}

// A short status object for the UI.
export function sellStatus(): { open: boolean; message: string } {
  return { open: true, message: "Selling is open now." };
}
