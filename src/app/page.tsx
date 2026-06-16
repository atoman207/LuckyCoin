"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import SubscriberChart from "@/components/SubscriberChart";

export default function Landing() {
  const { openWelcome } = useUser();
  const router = useRouter();

  // After the email magic-link login lands here, show the welcome message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      openWelcome();
      window.history.replaceState({}, "", "/");
    }
  }, [openWelcome]);

  function startGame() {
    // Logged-out visitors get the free demo on /game (3 rounds, then login).
    router.push("/game");
  }

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
          aria-label="Daily Draw"
          title="Daily Draw"
          className="anim-bob absolute left-[5vw] top-[5vw] z-20"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wheel.webp" alt="Daily Draw" className="h-24 w-auto drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] lg:h-32" />
        </Link>
        <Link
          href="/help"
          aria-label="Help"
          title="Help & rules"
          className="anim-bob absolute right-[5vw] top-[5vw] z-20"
          style={{ animationDelay: "0.5s" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/help.webp" alt="Help" className="h-24 w-auto drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] lg:h-32" />
        </Link>

        {/* Hero fills the viewport minus the header, so header + hero = 100vh. */}
        <div className="relative flex min-h-[calc(100dvh-var(--header-h))] flex-col items-center justify-center gap-7 px-6 py-20 text-center">

          <p className="hero-eyebrow">A daily ritual for dreamers, skeptics &amp; everyone in between</p>

          <h1 className="hero-title">
            <span className="hero-title-line">Start your day with</span>
            <span className="hero-luck-word" aria-label="luck">
              LUCK
            </span>
            <span className="hero-title-line hero-title-accent">before the world wakes up.</span>
          </h1>

          <p className="hero-subtitle max-w-2xl">
            Pick your <strong className="text-amber-200">Lucky Coin</strong>, crack it open, and let a little
            good fortune tag along — because{" "}
            <em className="not-italic text-violet-200">everyone</em> deserves to enjoy the word{" "}
            <span className="hero-inline-luck">luck</span>.
          </p>

          <button onClick={startGame} className="btn-coin mt-1">
            PLAY
          </button>

          <p className="hero-footnote">
            Register today and receive a <strong>50-coin</strong> welcome bonus.
          </p>
        </div>
      </section>

      {/* Live subscriber stats from the database */}
      <SubscriberChart />

      {/* How it works */}
      <section className="landing-section">
        <h2 className="landing-section-title">How it works</h2>
        <p className="landing-section-lead">
          Three steps. One lucky moment. Zero gatekeeping on good fortune.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            { t: "1 · Register & log in", d: "Sign up with your nickname and email. You start with a silver coin, bronze coins and a welcome bonus." },
            { t: "2 · Spend a silver to play", d: "Each round costs 1 silver and scatters 50 tiles — gold, silver, bronze, and from round 2 onward, rare jewels." },
            { t: "3 · Pick & crack", d: "Choose one coin. It cracks open and the prize is added to your account instantly." },
          ].map((c) => (
            <div key={c.t} className="landing-card p-6">
              <h3 className="text-lg font-semibold text-amber-200">{c.t}</h3>
              <p className="mt-2 text-slate-300">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Coin values */}
      <section className="p-8">
        <h2 className="text-center text-2xl font-bold">Coin values</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {[
            { type: "gold" as const, title: "Gold", v: "= 500 bronze", d: "The lucky jackpot coin." },
            { type: "silver" as const, title: "Silver", v: "= 10 bronze", d: "Your ticket to play." },
            { type: "bronze" as const, title: "Bronze", v: "base unit", d: "Earned every day." },
          ].map((c) => (
            <div key={c.type} className="flex items-center gap-4 p-5">
              <CoinIcon type={c.type} size={52} />
              <div>
                <div className="font-bold">{c.title}</div>
                <div className="text-amber-300">{c.v}</div>
                <div className="text-sm text-slate-400">{c.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta flex flex-col items-center gap-4 p-10 text-center">
        <h2 className="landing-cta-title">
          Feeling <span className="hero-inline-luck">lucky</span>?
        </h2>
        <p className="max-w-md text-slate-300">
          Daily bonuses, a 7-day streak reward, and a board full of coins — plus jewels from your second round on.
        </p>
        <button onClick={startGame} className="btn-gold text-lg !px-7 !py-3">
          ▶ Start Game
        </button>
      </section>
      </div>
    </>
  );
}
