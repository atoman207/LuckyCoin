"use client";

import Link from "next/link";
import CoinIcon from "@/components/CoinIcon";
import {
  COIN_VALUE,
  ROUND_COST_SILVER,
  ROUND_COST_BRONZE,
  BOARD_SIZE,
  BOARD_COMPOSITION,
  MAX_RESTARTS,
  MULTIPLIER_ROUNDS,
  SIGNUP_WELCOME_BRONZE,
  WHEEL_VALUES,
  WHEEL_BLOCKED,
  FREE_PLAYS,
  COIN_PACKS,
  dailyReward,
  type CoinType,
} from "@/lib/coins";
import { SELL_PRICE_USDT, SELL_HOURS_LABEL } from "@/lib/selling";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="text-xl font-bold text-amber-200">{title}</h2>
      <div className="mt-3 space-y-2 text-slate-300">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  // Wheel distribution, computed from the live config.
  const wheelCounts = WHEEL_VALUES.reduce<Record<number, number>>((acc, v) => {
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});
  const wheelRows = Object.entries(wheelCounts)
    .map(([v, n]) => ({ value: Number(v), count: n }))
    .sort((a, b) => b.value - a.value);

  const coinVals: { type: CoinType; label: string }[] = [
    { type: "gold", label: "Gold" },
    { type: "silver", label: "Silver" },
    { type: "bronze", label: "Bronze (copper)" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Help &amp; rules</h1>
        <p className="text-slate-400">
          Everything below reflects the <em>current</em> game settings and updates automatically when
          the rules change. New here? Read the{" "}
          <Link href="/intro" className="text-amber-300 underline">
            introduction
          </Link>
          .
        </p>
      </div>

      <Section title="How to register">
        <p>
          Click <strong>Log in</strong> in the top bar and switch to <strong>Register</strong>. Enter a
          nickname, email and a password (6+ characters); nationality, Discord ID and an avatar are
          optional. Your account is ready instantly.
        </p>
        <p>
          New members receive a <strong>{SIGNUP_WELCOME_BRONZE} bronze</strong> welcome bonus plus the
          day-1 daily reward of <strong>{dailyReward(1)} bronze</strong>.
        </p>
        <p className="text-sm text-slate-400">
          You can try {FREE_PLAYS} rounds for free without an account — after that, logging in keeps
          your winnings.
        </p>
      </Section>

      <Section title="Coin values">
        <div className="grid gap-3 sm:grid-cols-3">
          {coinVals.map((c) => (
            <div key={c.type} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
              <CoinIcon type={c.type} size={36} />
              <div>
                <div className="font-bold">{c.label}</div>
                <div className="text-sm text-amber-300">
                  {COIN_VALUE[c.type]} bronze{c.type !== "bronze" ? " value" : " (base unit)"}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-400">
          1 gold = {COIN_VALUE.gold / COIN_VALUE.silver} silver = {COIN_VALUE.gold} bronze.
        </p>
      </Section>

      <Section title="How to play">
        <p>
          Each round scatters <strong>{BOARD_SIZE} tiles</strong>: {BOARD_COMPOSITION.gold} gold,{" "}
          {BOARD_COMPOSITION.silver} silver, {BOARD_COMPOSITION.bronze} bronze and{" "}
          {BOARD_COMPOSITION.empty} empty (a blank shows <strong>&ldquo;No&rdquo;</strong> — no win).
          Pick one tile; its prize is credited instantly.
        </p>
        <p>
          A round costs <strong>{ROUND_COST_SILVER} silver</strong> or{" "}
          <strong>{ROUND_COST_BRONZE} bronze</strong> (your choice — equal value).
        </p>
        <p>
          After a round you can <strong>Restart</strong> (up to {MAX_RESTARTS} times) in two modes:
        </p>
        <ul className="ml-5 list-disc text-sm">
          <li>
            <strong>Continuous Play</strong> — the same board every restart.
          </li>
          <li>
            <strong>Multiplier Play</strong> — richer boards each round, e.g. round 2 ={" "}
            {MULTIPLIER_ROUNDS[2].gold}/{MULTIPLIER_ROUNDS[2].silver}/{MULTIPLIER_ROUNDS[2].bronze},
            up to round {MAX_RESTARTS} = {MULTIPLIER_ROUNDS[10].gold}/{MULTIPLIER_ROUNDS[10].silver}/
            {MULTIPLIER_ROUNDS[10].bronze} (gold/silver/bronze).
          </li>
        </ul>
      </Section>

      <Section title="Daily login reward">
        <p>Claimed automatically once every 24 hours. Miss a day and the streak resets to day 1.</p>
        <div className="flex flex-wrap gap-2 text-sm">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <span key={d} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1">
              Day {d}: <strong className="text-amber-300">{dailyReward(d)}</strong> bronze
            </span>
          ))}
        </div>
      </Section>

      <Section title="Daily prize wheel">
        <p>
          Members get one free <Link href="/draw" className="text-amber-300 underline">spin</Link> every
          24 hours. The wheel has {WHEEL_VALUES.length} segments; the pointer{" "}
          <strong>never lands on {WHEEL_BLOCKED.join(" or ")}</strong> (those are teasers).
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {wheelRows.map((r) => (
            <span
              key={r.value}
              className={`rounded-lg border px-2.5 py-1 ${
                WHEEL_BLOCKED.includes(r.value)
                  ? "border-amber-300/30 bg-amber-300/10 text-amber-300"
                  : "border-white/10 bg-black/20"
              }`}
            >
              {r.count}× <strong>{r.value}</strong>
            </span>
          ))}
        </div>
      </Section>

      <Section title="Exchange, buy &amp; sell">
        <p>
          <strong>Exchange</strong> converts coins downward only: gold → silver → bronze (never back
          up). Silver→bronze bundles earn a bonus: 10 silver → 110 bronze, 100 silver → 1,500
          bronze (singles stay 1 → 10).
        </p>
        <p>
          <strong>Buy</strong> silver with crypto (verified on-chain). Packs:{" "}
          {COIN_PACKS.map((p) => `${p.silver}/$${p.usd}`).join(", ")}.
        </p>
        <p>
          <strong>Sell</strong> gold for <strong>{SELL_PRICE_USDT.toLocaleString()} USDT each</strong>,
          open only {SELL_HOURS_LABEL}. Outside those hours, you must wait until the following Sunday.
        </p>
      </Section>

      <Section title="Fair play">
        <p className="text-sm text-slate-400">
          Coin balances are only ever written by the server. Game boards are generated and stored
          server-side, so picks can&apos;t be predicted or replayed. Purchases are confirmed on-chain
          before any coins are credited.
        </p>
      </Section>
    </div>
  );
}
