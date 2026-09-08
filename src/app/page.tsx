"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import SubscriberChart from "@/components/SubscriberChart";
import RichText from "@/components/RichText";
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
      {/* Mobile only: the banner is a fixed full-screen wallpaper that stays put
          while all the page content scrolls over it. A dark scrim keeps the
          content legible. Tablet/desktop keep the contained hero banner below. */}
      <div aria-hidden className="fixed inset-0 -z-10 sm:hidden">
        <picture>
          <source srcSet="/bg-m.webp" type="image/webp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bg-m.png" alt="" className="h-full w-full object-cover" />
        </picture>
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="space-y-20">
      {/* First screen — the banner is the background; the headline and the PLAY
          coin sit on top. A different image is served per device (desktop /
          tablet / mobile) so the differing aspect ratios never break the layout;
          <picture> downloads only the matching source. */}
      <section className="relative -mt-8 ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] w-screen overflow-hidden">
        <picture>
          <source media="(min-width: 1024px)" srcSet="/bg.webp" type="image/webp" />
          <source media="(min-width: 1024px)" srcSet="/bg.png" />
          <source media="(min-width: 640px)" srcSet="/bg-t.webp" type="image/webp" />
          <source media="(min-width: 640px)" srcSet="/bg-t.png" />
          <source srcSet="/bg-m.webp" type="image/webp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bg-m.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 hidden h-full w-full object-cover sm:block"
          />
        </picture>
        {/* Darkening overlay so the copy stays legible over the busy gold art.
            (Mobile uses the fixed wallpaper's own scrim instead.) */}
        <div className="absolute inset-0 hidden bg-gradient-to-b from-black/70 via-black/45 to-black/85 sm:block" />

        {/* Daily Draw (top-left) and Help (top-right) icons, ~5vw inside the hero. */}
        <Link
          href="/draw"
          aria-label={t("home.dailyDraw")}
          title={t("home.dailyDraw")}
          className="anim-bob absolute left-[5vw] top-[5vw] z-20"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wheel.webp" alt={t("home.dailyDraw")} className="h-24 w-auto drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] lg:h-32" />
        </Link>
        <Link
          href="/help"
          aria-label={t("home.help")}
          title={t("home.helpTitle")}
          className="anim-bob absolute right-[5vw] top-[5vw] z-20"
          style={{ animationDelay: "0.5s" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/help.webp" alt={t("home.help")} className="h-24 w-auto drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] lg:h-32" />
        </Link>

        {/* Hero fills the viewport minus the header, so header + hero = 100vh. */}
        <div className="relative flex min-h-[calc(100dvh-var(--header-h))] flex-col items-center justify-center gap-7 px-6 py-20 text-center">

          <p className="hero-eyebrow">{t("home.eyebrow")}</p>

          <h1 className="hero-title">
            <span className="hero-title-line">{t("home.titleLine1")}</span>
            <span className="hero-luck-word" aria-label={t("home.luckWord")}>
              {t("home.luckWord")}
            </span>
            <span className="hero-title-line hero-title-accent">{t("home.titleLine2")}</span>
          </h1>

          <p className="hero-subtitle">
            {t("home.subtitlePre")}
            <strong className="text-amber-200">{t("home.subtitleStrong")}</strong>
            {t("home.subtitleMid")}
            <em className="not-italic text-violet-200">{t("home.subtitleEm")}</em>
            {t("home.subtitlePost")}
          </p>

          <button onClick={startGame} className="btn-coin mt-1">
            {t("home.play")}
          </button>

          <RichText k="home.footnote" as="p" className="hero-footnote" />
        </div>
      </section>

      {/* Live subscriber stats from the database */}
      <SubscriberChart />

      {/* How it works */}
      <section className="landing-section">
        <h2 className="landing-section-title">{t("home.howTitle")}</h2>
        <p className="landing-section-lead">{t("home.howLead")}</p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((c) => (
            <div key={c.t} className="landing-card p-6">
              <h3 className="text-lg font-semibold text-amber-200">{t(c.t)}</h3>
              <p className="mt-2 text-slate-300">{t(c.d)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Coin values */}
      <section className="p-8">
        <h2 className="text-center text-2xl font-bold">{t("home.valuesTitle")}</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {values.map((c) => (
            <div key={c.type} className="flex items-center gap-4 p-5">
              <CoinIcon type={c.type} size={52} />
              <div>
                <div className="font-bold">{t(c.title)}</div>
                <div className="text-amber-300">{t(c.v)}</div>
                <div className="text-sm text-slate-400">{t(c.d)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta flex flex-col items-center gap-4 p-10 text-center">
        <h2 className="landing-cta-title">
          {t("home.ctaTitlePre")}
          <span className="hero-inline-luck">{t("home.ctaLuck")}</span>
          {t("home.ctaTitlePost")}
        </h2>
        <p className="max-w-md text-slate-300">{t("home.ctaBody")}</p>
        <button onClick={startGame} className="btn-gold text-lg !px-7 !py-3">
          {t("home.startGame")}
        </button>
      </section>
      </div>
    </>
  );
}
