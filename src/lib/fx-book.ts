// Book FX used to show and charge Japanese yen. Packs stay priced in USD;
// yen is always USD × this rate, never a live market feed.
export const USD_JPY_BOOK_RATE = 150;

export function usdToJpy(usd: number): number {
  return Math.round(usd * USD_JPY_BOOK_RATE);
}

export function formatJpy(jpy: number, locale = "ja-JP"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(jpy);
}

export function formatUsdAsJpy(usd: number, locale = "ja-JP"): string {
  return formatJpy(usdToJpy(usd), locale);
}
