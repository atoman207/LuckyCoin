"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "./config";
import { createTranslator, isMessageKey, translate, type TFunction, type Vars } from "./index";

// 日本語専用サイトなので切り替えは持ちません。t() / tMaybe() / intlLocale を
// 配るためだけのコンテキストです。
type Ctx = {
  locale: Locale;
  t: TFunction;
  /** API から返ってきた「メッセージキーかもしれない値」を訳します。 */
  tMaybe: (value: string | null | undefined, vars?: Vars) => string;
  /** Intl / toLocaleString 用の BCP-47 タグ。 */
  intlLocale: string;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<Ctx>(
    () => ({
      locale: DEFAULT_LOCALE,
      t: createTranslator(),
      tMaybe: (v, vars) => (!v ? "" : isMessageKey(v) ? translate(v, vars) : v),
      intlLocale: INTL_LOCALE,
    }),
    []
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useI18n must be used inside <LanguageProvider>");
  return ctx;
}
