"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LOCALE,
  HTML_LANG,
  INTL_LOCALE,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  otherLocale,
  type Locale,
} from "./config";
import { createTranslator, isMessageKey, translate, type TFunction, type Vars } from "./index";

type Ctx = {
  locale: Locale;
  /** The language the header toggle switches TO. */
  next: Locale;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  t: TFunction;
  /** Translates a value that may be a message key coming back from an API. */
  tMaybe: (value: string | null | undefined, vars?: Vars) => string;
  /** BCP-47 tag for Intl / toLocaleString formatting. */
  intlLocale: string;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();

  // Seeded from the cookie the server already read, so the first client render
  // matches the server HTML exactly (no hydration mismatch).
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState(l);
      if (typeof document !== "undefined") {
        // The cookie is what the SERVER reads: <html lang>, page metadata and
        // the messages returned by API routes all follow it.
        document.cookie = `${LANG_COOKIE}=${l};path=/;max-age=${LANG_COOKIE_MAX_AGE};samesite=lax`;
        document.documentElement.lang = HTML_LANG[l];
      }
      // Client state switches instantly; this re-renders the server parts
      // (page <title> and description) against the new cookie.
      router.refresh();
    },
    [router]
  );

  const toggleLocale = useCallback(() => {
    setLocale(otherLocale(locale));
  }, [locale, setLocale]);

  const value = useMemo<Ctx>(() => {
    const t = createTranslator(locale);
    return {
      locale,
      next: otherLocale(locale),
      setLocale,
      toggleLocale,
      t,
      tMaybe: (v, vars) =>
        !v ? "" : isMessageKey(v) ? translate(locale, v, vars) : v,
      intlLocale: INTL_LOCALE[locale],
    };
  }, [locale, setLocale, toggleLocale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useI18n must be used inside <LanguageProvider>");
  return ctx;
}
