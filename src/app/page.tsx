"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

export default function Landing() {
  const { openWelcome, openAuth } = useUser();
  const { t } = useI18n();
  const router = useRouter();

  // After login lands back here: show the welcome message on success, or
  // re-open the auth modal (which reads the reason from the URL) on failure.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      openWelcome();
      window.history.replaceState({}, "", "/");
    } else if (params.get("login_error")) {
      openAuth();
    }
  }, [openWelcome, openAuth]);

  function startGame() {
    // Logged-out visitors get the free demo on /game (3 rounds, then login).
    router.push("/game");
  }

  const steps: { t: MessageKey; d: MessageKey }[] = [
    { t: "home.how1Title", d: "home.how1Body" },
    { t: "home.how2Title", d: "home.how2Body" },
    { t: "home.how3Title", d: "home.how3Body" },
  ];

  const values: { type: "gold" | "silver" | "bronze"; title: MessageKey; v: MessageKey; d: MessageKey }[] = [
    { type: "gold", title: "coin.gold", v: "home.goldValue", d: "home.goldDesc" },
    { type: "silver", title: "coin.silver", v: "home.silverValue", d: "home.silverDesc" },
    { type: "bronze", title: "coin.bronze", v: "home.bronzeValue", d: "home.bronzeDesc" },
  ];

  return (
    <>
      <div className="space-y-20">
      {/* Hero starts just below the header, spans the full viewport width,
          and fills the remaining screen. Overflow at the bottom is cropped. */}
      <section className="relative -mt-8 ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] h-[calc(100dvh-var(--header-h))] w-screen overflow-hidden">
        <div className="hero-banner">
          <picture>
            <source media="(min-width: 1024px)" srcSet="/bg.png" />
            <source media="(min-width: 640px)" srcSet="/bg-t.png" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/bg-m.png"
              alt=""
              aria-hidden="true"
              className="hero-banner-img"
            />
          </picture>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/30 to-transparent lg:hidden" />

        {/* Daily Draw (top-left) and Help (top-right) icons, ~5vw inside the hero. */}
        <Link
          href="/draw"
          aria-label={t("home.dailyDraw")}
          title={t("home.dailyDraw")}
          className="anim-bob absolute left-[5vw] top-3 z-20 lg:top-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wheel.webp" alt={t("home.dailyDraw")} className="h-24 w-auto drop-shadow-[0_4px_14px_rgba(120,90,40,0.35)] lg:h-32" />
        </Link>
        <Link
          href="/help"
          aria-label={t("home.help")}
          title={t("home.helpTitle")}
          className="anim-bob absolute right-[5vw] top-3 z-20 lg:top-4"
          style={{ animationDelay: "0.5s" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/help.webp" alt={t("home.help")} className="h-24 w-auto drop-shadow-[0_4px_14px_rgba(120,90,40,0.35)] lg:h-32" />
        </Link>

        {/* Hero fills the viewport minus the header, so header + hero = 100vh.
            キャッチコピー・見出し・リード文はバナー画像そのものに焼き込まれて
            いるため、画面には PLAY ボタンだけを重ねます。同じ文言を HTML でも
            描くと文字が二重になってしまうからです。
            見出しと本文は sr-only で残してあります（画像内の文字は検索エンジン
            にもスクリーンリーダーにも読めないため、ページの見出し構造と説明文
            としてマークアップ上は必要です）。 */}
        <div className="relative flex h-full flex-col items-center justify-end gap-7 px-6 pb-[12vh] text-center">

          <h1 className="sr-only">
            {t("home.titleLine1")} {t("home.luckWord")} {t("home.titleLine2")}
          </h1>
          <p className="sr-only">
            {t("home.subtitlePre")}
            {t("home.subtitleStrong")}
            {t("home.subtitleMid")}
            {t("home.subtitleEm")}
            {t("home.subtitlePost")}
          </p>

          <button onClick={startGame} className="btn-coin mt-1">
            {t("home.play")}
          </button>
        </div>
      </section>

      {/* How it works */}
      <section className="landing-section px-2">
        <h2 className="landing-section-title">{t("home.howTitle")}</h2>
        <p className="landing-section-lead">{t("home.howLead")}</p>
        <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((c, i) => (
            <div key={c.t} className="landing-step text-center md:text-left">
              <span className="landing-step-num" aria-hidden>
                {i + 1}
              </span>
              <h3 className="text-lg font-semibold text-body">{t(c.t)}</h3>
              <p className="mt-2 text-muted">{t(c.d)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Coin values */}
      <section className="px-2">
        <h2 className="landing-section-title text-2xl">{t("home.valuesTitle")}</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {values.map((c) => (
            <div key={c.type} className="flex items-center gap-4">
              <CoinIcon type={c.type} size={52} />
              <div>
                <div className="font-bold">{t(c.title)}</div>
                <div className="text-sm font-semibold text-gold-ink">{t(c.v)}</div>
                <div className="text-sm text-muted">{t(c.d)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta flex flex-col items-center gap-4 py-6 text-center">
        <h2 className="landing-cta-title">
          {t("home.ctaTitlePre")}
          <span className="hero-inline-luck">{t("home.ctaLuck")}</span>
          {t("home.ctaTitlePost")}
        </h2>
        <p className="max-w-md text-muted">{t("home.ctaBody")}</p>
        <button onClick={startGame} className="btn-gold text-lg !px-7 !py-3">
          {t("home.startGame")}
        </button>
      </section>
      </div>
    </>
  );
}
