// =====================================================================
//  Language configuration — the site ships in Japanese (default) and
//  English. The chosen locale is stored in a cookie so BOTH the client
//  components and the server (API routes, <html lang>, metadata) agree
//  on which language to render.
// =====================================================================

export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];

// Japanese is the default language for first-time visitors.
export const DEFAULT_LOCALE: Locale = "ja";

export const LANG_COOKIE = "lang";
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Label shown on the header language switch.
export const LOCALE_LABEL: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
};

// Short label for the compact (mobile) switch.
export const LOCALE_SHORT: Record<Locale, string> = { ja: "JA", en: "EN" };

// Value for <html lang> and for Intl date/number formatting.
export const HTML_LANG: Record<Locale, string> = { ja: "ja", en: "en" };
export const INTL_LOCALE: Record<Locale, string> = { ja: "ja-JP", en: "en-US" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

// Accepts a cookie value or an Accept-Language header fragment.
export function normalizeLocale(v: string | null | undefined): Locale {
  if (!v) return DEFAULT_LOCALE;
  const head = v.split(",")[0]?.trim().toLowerCase() ?? "";
  if (head.startsWith("ja")) return "ja";
  if (head.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

// The other language — used by the header toggle button.
export function otherLocale(locale: Locale): Locale {
  return locale === "ja" ? "en" : "ja";
}
