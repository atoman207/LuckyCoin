// Server-side language resolution. SERVER ONLY (uses next/headers).
// API routes and server components read the same `lang` cookie the header
// switch writes, so messages returned to the browser are already in the
// language the visitor selected.

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LANG_COOKIE, isLocale, type Locale } from "./config";
import { createTranslator, type TFunction } from "./index";

export async function getLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const fromCookie = store.get(LANG_COOKIE)?.value;
    if (isLocale(fromCookie)) return fromCookie;
    // Nothing chosen yet — the site opens in Japanese on the first visit,
    // whatever the browser's own language happens to be. The visitor can
    // switch with the JA/EN toggle, which stores the choice in the cookie.
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

// The translator for the current request.
export async function getT(): Promise<TFunction> {
  return createTranslator(await getLocale());
}
