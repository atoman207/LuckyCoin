"use client";

import { useEffect } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import { useI18n } from "@/lib/i18n/provider";

const AUTO_CLOSE_MS = 10_000;

// Shown once after a new sign-up. Auto-dismisses after 10 seconds, or the user
// can close it with the × button.
export default function WelcomeModal() {
  const { welcomeOpen, closeWelcome } = useUser();
  const { t } = useI18n();

  useEffect(() => {
    if (!welcomeOpen) return;
    const timer = setTimeout(closeWelcome, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [welcomeOpen, closeWelcome]);

  if (!welcomeOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#4a3f31]/35 p-4" onClick={closeWelcome}>
      <div
        className="card relative w-full max-w-sm p-8 text-center animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeWelcome}
          aria-label={t("common.close")}
          className="btn-close absolute right-3 top-3"
        >
          ✕
        </button>
        <CoinIcon type="gold" size={72} className="mx-auto animate-pop" />
        <h2 className="mt-4 text-2xl font-extrabold">{t("welcome.title")}</h2>
        <p className="mt-2 text-lg text-body">{t("welcome.body")}</p>
        <p className="mt-4 text-xs text-faint">{t("welcome.autoClose")}</p>
      </div>
    </div>
  );
}
