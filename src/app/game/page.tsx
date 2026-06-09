"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import { BOARD_SIZE, ROUND_COST_SILVER, type CoinType } from "@/lib/coins";

type Phase = "idle" | "playing" | "revealed";

export default function GamePage() {
  const { profile, loading, openAuth, setProfile } = useUser();

  const [phase, setPhase] = useState<Phase>("idle");
  const [roundId, setRoundId] = useState<string | null>(null);
  const [board, setBoard] = useState<CoinType[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [reward, setReward] = useState<{ type: CoinType } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Claim the daily bonus once when the page loads.
  const claimedRef = useRef(false);
  useEffect(() => {
    if (!profile || claimedRef.current) return;
    claimedRef.current = true;
    (async () => {
      const res = await fetch("/api/daily-bonus", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.claimed) {
        setProfile(data.profile);
        flash(data.message);
      }
    })();
  }, [profile, setProfile]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000);
  }

  async function startRound() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/game/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfile(data.profile);
      setRoundId(data.roundId);
      setBoard(null);
      setPicked(null);
      setReward(null);
      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(index: number) {
    if (phase !== "playing" || busy || !roundId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/game/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, index }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBoard(data.board);
      setPicked(index);
      setReward(data.reward);
      setProfile(data.profile);
      setPhase("revealed");
      const label =
        data.reward.type === "gold"
          ? "JACKPOT! You found the lucky GOLD coin! 🏆"
          : `You won a ${data.reward.type} coin!`;
      flash(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reveal.");
    } finally {
      setBusy(false);
    }
  }

  // Clear the board and return to the start screen.
  function reset() {
    setPhase("idle");
    setRoundId(null);
    setBoard(null);
    setPicked(null);
    setReward(null);
    setError(null);
  }

  // ---- Not logged in ------------------------------------------------
  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Log in to play</h1>
        <p className="mt-2 text-slate-300">
          You need an account to pick the lucky coin.
        </p>
        <button onClick={openAuth} className="btn-gold mt-6">
          Log in / Register
        </button>
      </div>
    );
  }

  if (loading || !profile) {
    return <div className="py-20 text-center text-slate-400">Loading…</div>;
  }

  // Admins play for free; everyone else pays the silver entry cost.
  const cost = profile.is_admin ? 0 : ROUND_COST_SILVER;
  const canAfford = profile.silver >= cost;
  const playLabel = cost === 0 ? "▶ Play (free)" : `▶ Play (−${cost} silver)`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Pick the lucky coin</h1>
          <p className="text-slate-400">
            {phase === "playing"
              ? "Tap one coin to crack it open."
              : `One round costs ${cost === 0 ? "nothing for admins" : ROUND_COST_SILVER + " silver"} · 1 gold, 5 silver & 44 bronze hidden among ${BOARD_SIZE}.`}
          </p>
        </div>
        <CoinBalance profile={profile} size={26} />
      </div>

      {toast && (
        <div className="card animate-pop border-amber-300/40 bg-amber-300/10 px-4 py-3 text-center font-semibold text-amber-100">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-red-300">{error}</div>
      )}

      {/* Idle / start */}
      {phase === "idle" && (
        <div className="card flex flex-col items-center gap-4 p-10 text-center">
          <CoinIcon type="gold" size={72} className="animate-pop" />
          <h2 className="text-2xl font-bold">Ready for a round?</h2>
          <p className="max-w-sm text-slate-300">
            {cost === 0
              ? `Scatter ${BOARD_SIZE} coins and take your pick.`
              : `Spend ${cost} silver to scatter ${BOARD_SIZE} coins and take your pick.`}
          </p>
          {!canAfford && (
            <p className="text-sm text-red-300">
              You don&apos;t have enough silver. Buy or exchange coins first.
            </p>
          )}
          <button onClick={startRound} disabled={busy || !canAfford} className="btn-gold text-lg !px-7 !py-3">
            {busy ? "Dealing…" : playLabel}
          </button>
        </div>
      )}

      {/* Board */}
      {(phase === "playing" || phase === "revealed") && (
        <>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 sm:gap-3 md:grid-cols-10">
            {Array.from({ length: BOARD_SIZE }).map((_, i) => {
              const revealed = phase === "revealed" && board;
              const type = revealed ? board![i] : null;
              const isPick = picked === i;
              const isGold = type === "gold";
              return (
                <button
                  key={i}
                  onClick={() => pick(i)}
                  disabled={phase !== "playing" || busy}
                  className={[
                    "relative grid aspect-square place-items-center rounded-xl border transition",
                    revealed
                      ? isPick
                        ? isGold
                          ? "border-amber-300 bg-amber-300/15 ring-2 ring-amber-300 scale-105"
                          : "border-amber-300/70 bg-white/10 ring-2 ring-amber-300/70 scale-105"
                        : "border-white/10 bg-black/20 opacity-50"
                      : "border-white/10 bg-gradient-to-b from-white/10 to-black/30 hover:border-amber-300/50 hover:from-amber-300/15",
                  ].join(" ")}
                >
                  {revealed && type ? (
                    <span className="animate-pop">
                      <CoinIcon type={type} size={40} />
                    </span>
                  ) : (
                    <span className="text-xl font-bold text-slate-400 shimmer bg-clip-text">
                      ?
                    </span>
                  )}
                  {revealed && isPick && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-300 px-2 text-[10px] font-bold text-slate-900">
                      YOU
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {phase === "revealed" && reward && (
            <div className="card flex flex-col items-center gap-3 p-6 text-center">
              <div className="flex items-center gap-3">
                <CoinIcon type={reward.type} size={48} className="animate-pop" />
                <div className="text-left">
                  <div className="text-sm uppercase tracking-wide text-slate-400">You won</div>
                  <div className="text-xl font-bold capitalize">1 {reward.type} coin</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button onClick={startRound} disabled={busy || !canAfford} className="btn-gold">
                  {!canAfford ? "Not enough silver" : cost === 0 ? "Play again (free)" : `Play again (−${cost} silver)`}
                </button>
                <button onClick={reset} disabled={busy} className="btn-ghost">
                  🔄 Restart
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
