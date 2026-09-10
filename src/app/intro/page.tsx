"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import RichText from "@/components/RichText";
import { INTRO_PARAGRAPH_KEYS } from "@/lib/content";
import { FREE_PLAYS, SIGNUP_WELCOME_BRONZE, dailyReward } from "@/lib/coins";
import { useI18n } from "@/lib/i18n/provider";

export default function IntroPage() {
  const { profile, openAuth } = useUser();
  const { t } = useI18n();
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          {t("intro.badge")}
        </span>
        <h1 className="mt-3 text-4xl font-extrabold">{t("intro.title")}</h1>
      </div>

      <div className="card space-y-4 p-6 text-lg leading-relaxed text-body">
        {INTRO_PARAGRAPH_KEYS.map((key) => (
          <p key={key}>{t(key)}</p>
        ))}
      </div>

      <div className="card p-6">
        <h2 className="text-xl font-bold text-amber-700">{t("intro.glanceTitle")}</h2>
        <ul className="mt-3 space-y-2 text-body">
          <RichText as="li" k="intro.glance1" vars={{ plays: FREE_PLAYS }} />
          <RichText
            as="li"
            k="intro.glance2"
            vars={{ welcome: SIGNUP_WELCOME_BRONZE, day1: dailyReward(1) }}
          />
          <RichText as="li" k="intro.glance3" />
          <RichText as="li" k="intro.glance4" />
          <li>
            {t("intro.glance5Pre")}
            <Link href="/help" className="text-amber-600 underline">
              {t("intro.glance5Link")}
            </Link>
            {t("intro.glance5Post")}
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => (profile ? router.push("/game") : openAuth())}
          className="btn-gold text-lg !px-7 !py-3"
        >
          {profile ? t("intro.playNow") : t("intro.registerLogin")}
        </button>
        <Link href="/help" className="btn-ghost text-lg">
          {t("intro.readRules")}
        </Link>
      </div>
    </div>
  );
}
