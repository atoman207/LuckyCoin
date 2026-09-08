"use client";

import { LOCALES, LOCALE_LABEL, LOCALE_SHORT } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";

// Header language switch: two segments (JA / EN) with the active one lit, so
// it doubles as the current-language indicator. Japanese is the default.
export default function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("nav.langLabel")}
      className={`flex shrink-0 items-center gap-0.5 rounded-lg border border-white/10 bg-black/30 p-0.5 ${className}`}
    >
      {LOCALES.map((l) => {
        const active = locale === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={active}
            title={LOCALE_LABEL[l]}
            className={`rounded-md px-2 py-1 text-xs font-bold leading-none transition ${
              active ? "bg-amber-400 text-slate-900" : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {LOCALE_SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}
