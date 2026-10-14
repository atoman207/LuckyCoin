"use client";

import { useI18n } from "@/lib/i18n/provider";

export default function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto w-full shrink-0 px-4 py-4 text-center text-sm text-faint">
      {t("footer.text", { year: new Date().getFullYear() })}
    </footer>
  );
}
