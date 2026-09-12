"use client";

import Link from "next/link";
import { useUser } from "@/components/UserProvider";
import { useI18n } from "@/lib/i18n/provider";

// First-login reward shortcuts shown in the header until the member claims
// their rewards. Labels collapse on small screens.
export default function FirstLoginButtons() {
  const { profile } = useUser();
  const { t } = useI18n();
  if (!profile || profile.rewards_claimed) return null;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Link href="/claim" className="btn-gold btn-attn !px-3 !py-1.5 text-sm" title={t("firstLogin.claimTitle")}>
        <span className="md:hidden" aria-hidden>
          +
        </span>
        <span className="hidden md:inline">{t("firstLogin.claim")}</span>
      </Link>
      <Link href="/draw" className="btn-silver btn-attn !px-3 !py-1.5 text-sm" title={t("firstLogin.lotteryTitle")}>
        <span className="md:hidden" aria-hidden>
          ◯
        </span>
        <span className="hidden md:inline">{t("firstLogin.lottery")}</span>
      </Link>
      <Link href="/help" className="btn-bronze btn-attn !px-3 !py-1.5 text-sm" title={t("firstLogin.helpTitle")}>
        <span className="md:hidden" aria-hidden>
          ?
        </span>
        <span className="hidden md:inline">{t("firstLogin.help")}</span>
      </Link>
    </div>
  );
}
