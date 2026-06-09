"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";

export default function Landing() {
  const { profile, openAuth } = useUser();
  const router = useRouter();

  function startGame() {
    if (profile) router.push("/game");
    else openAuth();
  }

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="grid items-center gap-10 pt-6 md:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
            ◎ The lucky coin game
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-6xl">
            Pick the <span className="text-amber-400">lucky</span> coin.
            <br /> Crack it open.
          </h1>
          <p className="mt-5 max-w-md text-lg text-slate-300">
            Fifty coins are scattered on the table. Only one hides the gold. Choose
            wisely — every coin you crack reveals gold, silver or bronze straight to
            your account.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button onClick={startGame} className="btn-gold text-lg !px-7 !py-3">
              ▶ Start Game
            </button>
            {!profile && (
              <button onClick={openAuth} className="btn-ghost text-lg">
                Log in
              </button>
            )}
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Register today and receive a <strong className="text-amber-300">50-coin</strong> welcome bonus.
          </p>
        </div>

        {/* Floating coin board preview */}
        <div className="card grid grid-cols-5 gap-3 p-6">
          {Array.from({ length: 20 }).map((_, i) => {
            const type = i === 7 ? "gold" : i === 3 || i === 14 ? "silver" : "bronze";
            return (
              <div
                key={i}
                className="grid aspect-square place-items-center rounded-xl border border-white/10 bg-black/30"
                style={{ animation: "pop .5s both", animationDelay: `${i * 35}ms` }}
              >
                <CoinIcon type={type} size={36} />
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-center text-3xl font-bold">How it works</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            { t: "1 · Register & log in", d: "Sign up with your nickname and email. You start with a silver coin, bronze coins and a welcome bonus." },
            { t: "2 · Spend a silver to play", d: "Each round costs 1 silver and scatters 50 coins: 1 gold, 5 silver, the rest bronze." },
            { t: "3 · Pick & crack", d: "Choose one coin. It cracks open and the prize is added to your account instantly." },
          ].map((c) => (
            <div key={c.t} className="card p-6">
              <h3 className="text-lg font-semibold text-amber-200">{c.t}</h3>
              <p className="mt-2 text-slate-300">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Coin values */}
      <section className="card p-8">
        <h2 className="text-center text-2xl font-bold">Coin values</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {[
            { type: "gold" as const, title: "Gold", v: "= 500 bronze", d: "The lucky jackpot coin." },
            { type: "silver" as const, title: "Silver", v: "= 10 bronze", d: "Your ticket to play." },
            { type: "bronze" as const, title: "Bronze", v: "base unit", d: "Earned every day." },
          ].map((c) => (
            <div key={c.type} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-5">
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
      <section className="card flex flex-col items-center gap-4 p-10 text-center">
        <h2 className="text-3xl font-bold">Feeling lucky?</h2>
        <p className="max-w-md text-slate-300">
          Daily bonuses, a 7-day streak reward and a board full of coins are waiting.
        </p>
        <button onClick={startGame} className="btn-gold text-lg !px-7 !py-3">
          ▶ Start Game
        </button>
      </section>
    </div>
  );
}
