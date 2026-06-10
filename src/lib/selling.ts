// Coin selling: price + the Sunday trading windows (US Eastern time).
// Used by both the /sell page (UX) and the /api/sell route (authoritative).

export const SELL_PRICE_USDT = 1000; // per gold coin
export const SELL_TZ = "America/New_York"; // "US time" = Eastern
// Sunday-only windows, in ET 24h: [startHour, endHour)
export const SELL_WINDOWS: [number, number][] = [
  [7, 12], // 7:00 AM – 12:00 PM
  [14, 17], // 2:00 PM – 5:00 PM
];
export const SELL_HOURS_LABEL = "Sundays 7:00 AM–12:00 PM and 2:00 PM–5:00 PM (ET)";

// Wall-clock weekday/hour in Eastern time, regardless of server timezone.
function etParts(date: Date) {
  const et = new Date(date.toLocaleString("en-US", { timeZone: SELL_TZ }));
  return { day: et.getDay(), hour: et.getHours(), minute: et.getMinutes() };
}

// Selling is open only on Sundays within either window.
export function isSellOpen(date: Date = new Date()): boolean {
  const { day, hour } = etParts(date);
  if (day !== 0) return false; // Sunday only
  return SELL_WINDOWS.some(([start, end]) => hour >= start && hour < end);
}

// A short status object for the UI.
export function sellStatus(date: Date = new Date()): { open: boolean; message: string } {
  if (isSellOpen(date)) {
    return { open: true, message: "Selling is open now." };
  }
  return {
    open: false,
    message: `Selling is closed. It opens ${SELL_HOURS_LABEL}. Please wait until the following Sunday.`,
  };
}
