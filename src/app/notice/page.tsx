"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import Avatar from "@/components/Avatar";

type Ranked = {
  rank: number;
  id: string;
  nickname: string;
  avatar_url: string | null;
  gold: number;
  silver: number;
  bronze: number;
};

type Board = { total: number; top: Ranked[]; you: Ranked | null };

const POLL_MS = 5_000; // refresh cadence — "real time" within a few seconds

const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

// Gold / silver / bronze styling for the top three places.
const PODIUM: Record<number, { ring: string; row: string; tag: string; label: string }> = {
  1: { ring: "ring-amber-400/60", row: "border-l-4 border-amber-400 bg-amber-400/10", tag: "bg-amber-400 text-slate-900", label: "Gold" },
  2: { ring: "ring-slate-300/60", row: "border-l-4 border-slate-300 bg-slate-300/10", tag: "bg-slate-300 text-slate-900", label: "Silver" },
  3: { ring: "ring-orange-400/60", row: "border-l-4 border-orange-400 bg-orange-400/10", tag: "bg-orange-400 text-slate-900", label: "Bronze" },
};

// Coin counts shown inline next to a player's avatar + name.
function Coins({ gold, silver, bronze }: { gold: number; silver: number; bronze: number }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
      <span className="inline-flex items-center gap-1 text-amber-300">
        <CoinIcon type="gold" size={15} /> {gold.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-1 text-slate-200">
        <CoinIcon type="silver" size={15} /> {silver.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-1 text-orange-300">
        <CoinIcon type="bronze" size={15} /> {bronze.toLocaleString()}
      </span>
    </div>
  );
}

export default function NoticePage() {
  const { profile, openAuth } = useUser();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [flash, setFlash] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load rankings.");
      setBoard(data);
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load rankings.");
    }
  }, []);

  // Poll on an interval so rankings stay live without a page refresh.
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Prefer the server's authoritative "you" row; fall back to the top list.
  const you = board?.you ?? (profile ? board?.top.find((r) => r.id === profile.id) ?? null : null);
  const total = board?.total ?? 0;
  const percentile = you && total > 0 ? Math.max(1, Math.round((you.rank / total) * 100)) : null;

  // "My ranking" button: jump to and briefly highlight the player's own row.
  function showMyRanking() {
    if (!profile) return openAuth();
    document.getElementById("my-rank")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(true);
    setTimeout(() => setFlash(false), 2200);
  }

  const podium = board?.top.slice(0, 3) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl">📣 Notice — Live Rankings</h1>
        <p className="mt-2 text-slate-400">
          Ranked by gold, then silver, then bronze. Updates automatically every few seconds.
        </p>
      </header>

      {error && (
        <div className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-red-300">{error}</div>
      )}

      {/* Headline stats + "My ranking" button */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-6 text-center">
          <div className="text-sm text-slate-400">Total participants</div>
          <div className="mt-1 text-4xl font-extrabold tabular-nums text-emerald-300">
            {board ? total.toLocaleString() : "…"}
          </div>
        </div>
        <div className="card flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div>
            <div className="text-sm text-slate-400">Your current rank</div>
            <div className="mt-1 text-4xl font-extrabold tabular-nums text-amber-300">
              {!profile ? (
                <span className="text-lg font-semibold text-slate-400">Not logged in</span>
              ) : you ? (
                <>
                  #{you.rank.toLocaleString()}
                  <span className="ml-2 text-base font-medium text-slate-400">
                    of {total.toLocaleString()}
                  </span>
                </>
              ) : (
                <span className="text-lg font-semibold text-slate-400">Unranked</span>
              )}
            </div>
            {profile && you && percentile && (
              <div className="mt-1 text-xs text-slate-500">Top {percentile}% of all players</div>
            )}
          </div>
          <button onClick={showMyRanking} className="btn-gold text-sm">
            📊 {profile ? "My ranking" : "Log in to see your rank"}
          </button>
        </div>
      </div>

      {/* Podium — the top three places shown as gold, silver and bronze */}
      {podium.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          {podium.map((r) => {
            const p = PODIUM[r.rank];
            const mine = profile?.id === r.id;
            return (
              <div
                key={r.id}
                className={`card flex flex-col items-center gap-2 p-5 text-center ${p.row}`}
              >
                <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${p.tag}`}>
                  {r.rank === 1 ? "1st" : r.rank === 2 ? "2nd" : "3rd"} · {p.label}
                </span>
                <div className="text-3xl">{medal(r.rank)}</div>
                <Avatar src={r.avatar_url} name={r.nickname} size={64} className={`ring-2 ${p.ring}`} />
                <div className="font-bold">
                  {r.nickname}
                  {mine && (
                    <span className="ml-2 rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">
                      you
                    </span>
                  )}
                </div>
                <Coins gold={r.gold} silver={r.silver} bronze={r.bronze} />
              </div>
            );
          })}
        </section>
      )}

      {/* Top 50 list — avatar + name with coin counts alongside */}
      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-bold">Top 50 players</h2>
          <span className="text-xs text-slate-500">
            {updatedAt ? `updated ${updatedAt.toLocaleTimeString()}` : "loading…"}
          </span>
        </div>

        {board === null ? (
          <div className="px-5 py-10 text-center text-slate-500">Loading rankings…</div>
        ) : board.top.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500">No players yet.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {board.top.map((r) => {
              const mine = profile?.id === r.id;
              const p = PODIUM[r.rank];
              return (
                <li
                  key={r.id}
                  id={mine ? "my-rank" : undefined}
                  className={`flex items-center gap-3 px-4 py-3 transition ${
                    p ? p.row : mine ? "bg-amber-400/10" : "hover:bg-white/[0.03]"
                  } ${mine && flash ? "ring-2 ring-amber-400" : ""}`}
                >
                  {/* Rank badge */}
                  <div className="w-10 shrink-0 text-center text-lg font-bold tabular-nums">
                    {medal(r.rank) ?? <span className="text-slate-400">{r.rank}</span>}
                  </div>
                  <Avatar src={r.avatar_url} name={r.nickname} size={40} />
                  {/* Name + inline coin counts */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{r.nickname}</span>
                      {mine && (
                        <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">
                          you
                        </span>
                      )}
                    </div>
                    <Coins gold={r.gold} silver={r.silver} bronze={r.bronze} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Your standing when you're outside the top 50 */}
      {profile && you && you.rank > 50 && (
        <section id="my-rank" className={`card p-0 ${flash ? "ring-2 ring-amber-400" : ""}`}>
          <div className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-slate-300">
            Your standing — #{you.rank.toLocaleString()} of {total.toLocaleString()}
          </div>
          <div className="flex items-center gap-3 bg-amber-400/10 px-4 py-3">
            <div className="w-10 shrink-0 text-center text-lg font-bold tabular-nums">{you.rank}</div>
            <Avatar src={you.avatar_url} name={you.nickname} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-semibold">
                <span className="truncate">{you.nickname}</span>
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">you</span>
              </div>
              <Coins gold={you.gold} silver={you.silver} bronze={you.bronze} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
