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
  compositionWithGems,
  SILVER_CAP,
  GEM_TURN_OPTIONS,
  GEM_SILVER_OPTIONS,
  GEM_BRONZE_OPTIONS,
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
          Everything below reflects the <em>current</em> game settings and updates itself the instant
          the rules change — no carrier pigeons required. New here and pleasantly bewildered? Start
          with the{" "}
          <Link href="/intro" className="text-amber-300 underline">
            introduction
          </Link>
          .
        </p>
      </div>

      <Section title="How to register">
        <p>
          Click <strong>Log in</strong> in the top bar and flip over to <strong>Register</strong>. Hand
          us a nickname, an email and a password (6+ characters — your cat&apos;s name plus a number is
          perfectly acceptable, we won&apos;t tell). Nationality, Discord ID and an avatar are optional
          bragging rights. Your account is ready before you can say &ldquo;beginner&apos;s luck.&rdquo;
        </p>
        <p>
          New members get showered with a <strong>{SIGNUP_WELCOME_BRONZE} bronze</strong> welcome bonus
          plus a day-1 reward of <strong>{dailyReward(1)} bronze</strong> — free coins, no strings, no
          awkward small talk.
        </p>
        <p className="text-sm text-slate-400">
          Want to kick the tyres first? Play {FREE_PLAYS} rounds free without an account. After that,
          logging in is the only thing standing between your winnings and a vanishing act worthy of a
          dryer eating socks.
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
          1 gold = {COIN_VALUE.gold / COIN_VALUE.silver} silver = {COIN_VALUE.gold} bronze — the exchange
          rate of dreams. And do keep it classy: you can stash at most{" "}
          <strong>{SILVER_CAP.toLocaleString()} silver</strong> at once, because even pockets have limits
          (and feelings).
        </p>
      </Section>

      <Section title="How to play">
        <p>
          Each round flings out <strong>{BOARD_SIZE} tiles</strong>: {BOARD_COMPOSITION.gold} gold,{" "}
          {BOARD_COMPOSITION.silver} silver, {BOARD_COMPOSITION.bronze} bronze and{" "}
          {BOARD_COMPOSITION.empty} cheeky blanks that flash <strong>&ldquo;No&rdquo;</strong> and
          precisely nothing else. Pick one, crack it open, and the prize lands in your wallet faster
          than your hopes can rise.
        </p>
        <p>
          A round costs <strong>{ROUND_COST_SILVER} silver</strong> or{" "}
          <strong>{ROUND_COST_BRONZE} bronze</strong> — your call, same price, no loyalty points for
          agonising over it.
        </p>
        <p>
          Survived a round? <strong>Restart</strong> it (up to {MAX_RESTARTS} times) in one of two
          flavours:
        </p>
        <ul className="ml-5 list-disc text-sm">
          <li>
            <strong>Continuous Play</strong> — the same trusty board on repeat, like comfort food.
          </li>
          <li>
            <strong>Multiplier Play</strong> — the board gets greedier every round (more gold &amp;
            silver, fewer naps), all the way to round {MAX_RESTARTS}. The exact loot per round:
          </li>
        </ul>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-white/5 text-amber-200">
              <tr>
                <th className="px-3 py-2">Turn</th>
                <th className="px-3 py-2">Gold</th>
                <th className="px-3 py-2">Silver</th>
                <th className="px-3 py-2">Bronze</th>
                <th className="px-3 py-2">💎 Gems</th>
                <th className="px-3 py-2">Blank</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {Array.from({ length: MAX_RESTARTS }, (_, i) => i + 1).map((r) => {
                const c = compositionWithGems("multiplier", r);
                const gem = c.gem ?? 0;
                const blank = BOARD_SIZE - c.gold - c.silver - c.bronze - gem;
                return (
                  <tr key={r} className="border-t border-white/10">
                    <td className="px-3 py-1.5 font-semibold text-amber-100">{r}</td>
                    <td className="px-3 py-1.5">{c.gold}</td>
                    <td className="px-3 py-1.5">{c.silver}</td>
                    <td className="px-3 py-1.5">{c.bronze}</td>
                    <td className="px-3 py-1.5 text-violet-300">{gem}</td>
                    <td className="px-3 py-1.5">{blank}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="💎 Gems (Multiplier Play)">
        <p>
          In Multiplier Play, turn 1 struts in with a flashy <strong>7 gems</strong> (2 muscling out
          empty slots, 5 elbowing aside silver). From turn 2 on, the gems breed like rabbits and keep
          replacing silver: <strong>1 gem on turn 2</strong>, 2 on turn 3, 3 on turn 4 … topping out at{" "}
          <strong>9 glittering gems on turn 10</strong>. The proof is in the 💎 column above.
        </p>
        <p>Smash a gem open and the prize gods hand you <strong>one</strong> of these, entirely at random:</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-violet-300/30 bg-violet-500/10 p-4">
            <div className="font-bold text-violet-200">Free turns</div>
            <div className="mt-1 text-sm">
              +{GEM_TURN_OPTIONS.join(", +")} turns. Your next round(s) are{" "}
              <strong>on the house</strong> — no silver, no bronze, no questions asked.
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="font-bold text-slate-200">Silver coins</div>
            <div className="mt-1 text-sm">+{GEM_SILVER_OPTIONS.join(", +")} silver, plopped straight into your stash.</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="font-bold text-orange-200">Bronze coins</div>
            <div className="mt-1 text-sm">
              +{GEM_BRONZE_OPTIONS.map((n) => n.toLocaleString()).join(", +")} bronze, because more is simply more.
            </div>
          </div>
        </div>
        <p className="text-sm text-slate-400">
          Example: bag a <strong>+2 turns</strong> gem on turn 3 and your next 2 rounds cost exactly
          nothing — march onward and play them while your silver stays cozy in your pocket.
        </p>
      </Section>

      <Section title="Daily login reward">
        <p>
          Claims itself every 24 hours — turn up and the coins are already waiting, like a suspiciously
          punctual fairy. Ghost the game for a day, though, and the streak sulks all the way back to day 1.
        </p>
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
          24 hours. The wheel sports {WHEEL_VALUES.length} segments, and the pointer will tease you
          mercilessly but <strong>never actually land on {WHEEL_BLOCKED.join(" or ")}</strong> — those
          are pure heartbreak bait.
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
          <strong>Exchange</strong> only ever flows downhill: gold → silver → bronze, never the scenic
          route back up (it&apos;s gravity, but for coins). Bundle silver → bronze for a tip: 10 copper →
          110 bronze, 100 silver → 1,500 bronze (lone coins stay a humble 1 → 10).
        </p>
        <p>
          <strong>Buy</strong> silver with crypto, every payment double-checked on-chain so nobody pulls
          a fast one. Packs:{" "}
          {COIN_PACKS.map((p) => `${p.silver}/$${p.usd}`).join(", ")}.
        </p>
        <p>
          <strong>Sell</strong> gold for <strong>{SELL_PRICE_USDT.toLocaleString()} USDT a pop</strong> —
          open {SELL_HOURS_LABEL}, so you can cash out on a whim.
        </p>
      </Section>

      <Section title="Fair play">
        <p className="text-sm text-slate-400">
          Only the server ever touches your coin balance — your browser doesn&apos;t get a vote, and
          neither do hopeful hackers. Boards are conjured and locked away server-side, so nobody can
          peek, predict or run it back. Purchases are confirmed on-chain before a single coin appears.
          The mystery lives in the tile, never in the maths.
        </p>
      </Section>
    </div>
  );
}
