"use client";

import { useI18n } from "@/lib/i18n/provider";

export default function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="mx-auto hidden max-w-6xl px-4 py-10 text-center text-sm text-faint sm:block">
      {t("footer.text", { year: new Date().getFullYear() })}
    </footer>
  );
}
