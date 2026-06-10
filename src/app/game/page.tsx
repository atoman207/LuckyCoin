"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import DemoGame from "@/components/DemoGame";
import InsufficientCoinsModal from "@/components/InsufficientCoinsModal";
import { BOARD_SIZE, BOARD_COMPOSITION, ROUND_COST, MAX_RESTARTS, type BoardSlot, type RoundCurrency, type PlayMode } from "@/lib/coins";

type Phase = "idle" | "playing" | "revealed";

// Per-slot reveal styling: the glow/ray colours match the coin so the modal
// looks like it emits light of that colour. Empty is a neutral "no win".
const COIN_REVEAL: Record<BoardSlot, { glow: string; ray: string; title: string }> = {
  gold: { glow: "rgba(251,191,36,0.95)", ray: "rgba(251,191,36,0.5)", title: "JACKPOT — the lucky GOLD coin! 🏆" },
  silver: { glow: "rgba(226,232,240,0.9)", ray: "rgba(226,232,240,0.45)", title: "You won a Silver coin!" },
  bronze: { glow: "rgba(205,127,50,0.95)", ray: "rgba(205,127,50,0.5)", title: "You won a Bronze coin!" },
  empty: { glow: "rgba(100,116,139,0.45)", ray: "rgba(100,116,139,0.2)", title: "Empty — no coin this time!" },
};

export default function GamePage() {
  const { profile, loading, openAuth, setProfile } = useUser();

  const [phase, setPhase] = useState<Phase>("idle");
  const [roundId, setRoundId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardSlot[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [reward, setReward] = useState<{ type: BoardSlot } | null>(null);
  const [revealCoin, setRevealCoin] = useState<BoardSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Start-option modal: open it, then the player selects exactly one option.
  const [chooserOpen, setChooserOpen] = useState(false);
  const [choice, setChoice] = useState<RoundCurrency | null>(null);

  // Restart / round tracking.
  const [restarts, setRestarts] = useState(0);
  const [lastCurrency, setLastCurrency] = useState<RoundCurrency>("silver");
  const [restartChooserOpen, setRestartChooserOpen] = useState(false);
  const [lowCoins, setLowCoins] = useState<string | null>(null);
  const restartsLeft = MAX_RESTARTS - restarts;

  function openChooser() {
    setError(null);
    setChoice(null);
    setChooserOpen(true);
  }
  function closeChooser() {
    setChooserOpen(false);
    setChoice(null);
  }

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

  async function startRound(currency: RoundCurrency, action: "new" | "restart" = "new", mode?: PlayMode) {
    closeChooser();
    setRestartChooserOpen(false);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, action, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.insufficient) {
          setLowCoins(data.error);
          return;
        }
        throw new Error(data.error);
      }
      setProfile(data.profile);
      setRoundId(data.roundId);
      setBoard(null);
      setPicked(null);
      setReward(null);
      setRevealCoin(null);
      setRestarts(data.restarts ?? 0);
      setLastCurrency(currency);
      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start.");
    } finally {
      setBusy(false);
    }
  }

  // New Game — reset everything back to the start screen (restart count clears).
  function newGame() {
    setRestartChooserOpen(false);
    setRestarts(0);
    reset();
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
      setRevealCoin(data.reward.type); // triggers the zoom-in reveal modal
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
    setRevealCoin(null);
    setError(null);
  }

  // ---- Not logged in: free demo (up to 3 rounds, then a login gate) ----
  if (!loading && !profile) {
    return <DemoGame />;
  }

  if (loading || !profile) {
    return <div className="py-20 text-center text-slate-400">Loading…</div>;
  }

  // A round can be paid with EITHER 1 silver OR 10 bronze. Admins play free.
  const canPay = (c: RoundCurrency) => profile.is_admin || profile[c] >= ROUND_COST[c];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Pick the lucky coin</h1>
          <p className="text-slate-400">
            {phase === "playing"
              ? "Tap one coin to crack it open."
              : `One round costs ${profile.is_admin ? "nothing for admins" : `${ROUND_COST.silver} silver or ${ROUND_COST.bronze} bronze`} · ${BOARD_COMPOSITION.gold} gold, ${BOARD_COMPOSITION.silver} silver & ${BOARD_COMPOSITION.bronze} bronze hidden among ${BOARD_SIZE}.`}
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
            {profile.is_admin
              ? `Scatter ${BOARD_SIZE} coins and take your pick.`
              : `Pay ${ROUND_COST.silver} silver or ${ROUND_COST.bronze} bronze to scatter ${BOARD_SIZE} coins and take your pick.`}
          </p>
          <button onClick={openChooser} disabled={busy} className="btn-gold text-lg !px-7 !py-3">
            {busy ? "Dealing…" : "▶ Start"}
          </button>
        </div>
      )}

      {/* Board */}
      {(phase === "playing" || phase === "revealed") && (
        <>
          {/* Restart / New Game toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-slate-400">
              {restarts > 0 ? `Restart ${restarts} of ${MAX_RESTARTS}` : "First game"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setRestartChooserOpen(true)}
                disabled={busy || restartsLeft <= 0}
                className="btn-ghost text-sm"
              >
                🔄 Restart {restartsLeft <= 0 ? "(limit reached)" : `(${restartsLeft} left)`}
              </button>
              <button onClick={newGame} disabled={busy} className="btn-ghost text-sm">
                ✦ New Game
              </button>
            </div>
          </div>

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
                  {revealed && type && type !== "empty" ? (
                    <span className={isPick ? "tile-flip" : "animate-pop"}>
                      <CoinIcon type={type} size={40} />
                    </span>
                  ) : revealed && type === "empty" ? (
                    <span className={`text-sm font-bold text-slate-500 ${isPick ? "tile-flip" : "animate-pop"}`}>No</span>
                  ) : null}
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
                {reward.type === "empty" ? (
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-white/5 text-base font-bold text-slate-400">No</span>
                ) : (
                  <CoinIcon type={reward.type} size={48} className="animate-pop" />
                )}
                <div className="text-left">
                  <div className="text-sm uppercase tracking-wide text-slate-400">
                    {reward.type === "empty" ? "Result" : "You won"}
                  </div>
                  <div className="text-xl font-bold capitalize">
                    {reward.type === "empty" ? "Empty — no win" : `1 ${reward.type} coin`}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => setRestartChooserOpen(true)}
                  disabled={busy || restartsLeft <= 0}
                  className="btn-gold"
                >
                  🔄 Restart {restartsLeft <= 0 ? "(limit reached)" : `(${restartsLeft} left)`}
                </button>
                <button onClick={newGame} disabled={busy} className="btn-ghost">
                  ✦ New Game
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Start-option modal: select exactly one option, then see a message. */}
      {chooserOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={closeChooser}
        >
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            {choice === null ? (
              <>
                <h2 className="text-xl font-bold">Choose how to pay</h2>
                <p className="mt-1 text-sm text-slate-400">Select one option to start a round.</p>
                <div className="mt-4 grid gap-3">
                  {(["silver", "bronze"] as RoundCurrency[]).map((c) => {
                    const ok = canPay(c);
                    return (
                      <button
                        key={c}
                        onClick={() => {
                          if (!ok) {
                            closeChooser();
                            setLowCoins(
                              `You need ${ROUND_COST[c]} ${c} to start a round, but only have ${profile[c]}.`
                            );
                          } else {
                            setChoice(c);
                          }
                        }}
                        className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-left transition hover:border-amber-300/50 hover:bg-amber-300/5"
                      >
                        <span className="flex items-center gap-3">
                          <CoinIcon type={c} size={32} />
                          <span>
                            <span className="block font-bold">
                              {ROUND_COST[c]} {c === "silver" ? "Silver" : "Bronze"}
                            </span>
                            <span className="block text-xs text-slate-400">
                              You have {profile[c]} {c}
                            </span>
                          </span>
                        </span>
                        <span className={`text-xs font-semibold ${ok ? "text-emerald-300" : "text-red-300"}`}>
                          {profile.is_admin ? "Free" : ok ? "Available" : "Not enough"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={closeChooser} className="btn-ghost mt-4 w-full">
                  Cancel
                </button>
              </>
            ) : canPay(choice) ? (
              <>
                <h2 className="text-xl font-bold">Start a round?</h2>
                <p className="mt-2 text-slate-300">
                  {profile.is_admin
                    ? "Admins play for free."
                    : `You'll pay ${ROUND_COST[choice]} ${choice} to scatter ${BOARD_SIZE} coins and take your pick.`}
                </p>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => startRound(choice)} disabled={busy} className="btn-gold flex-1">
                    ▶ Start
                  </button>
                  <button onClick={() => setChoice(null)} className="btn-ghost">
                    Back
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-red-200">Not enough {choice}</h2>
                <p className="mt-2 text-slate-300">
                  You don&apos;t have enough {choice} to start a round. Purchase more silver to keep
                  playing — pay with crypto and it&apos;s credited as soon as the payment confirms.
                </p>
                <div className="mt-5 flex flex-col gap-3">
                  <Link href="/buy" onClick={closeChooser} className="btn-gold text-center">
                    Go to the purchase page →
                  </Link>
                  <button onClick={() => setChoice(null)} className="btn-ghost">
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Coin reveal — the won coin zooms in, the background darkens, and the
          modal emits light in the coin's own colour. */}
      {revealCoin && (
        <div
          className="reveal-overlay fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setRevealCoin(null)}
          style={{ "--glow": COIN_REVEAL[revealCoin].glow, "--ray": COIN_REVEAL[revealCoin].ray } as CSSProperties}
        >
          <div className="flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative grid h-[300px] w-[300px] place-items-center">
              <div className="reveal-rays pointer-events-none absolute inset-[-60px] rounded-full opacity-40" />
              <div className="reveal-glow pointer-events-none absolute inset-0 rounded-full" />
              <div className="reveal-coin relative drop-shadow-2xl">
                {revealCoin === "empty" ? (
                  <span className="grid h-[172px] w-[172px] place-items-center rounded-full border border-white/10 bg-white/5 text-5xl font-extrabold text-slate-400">
                    No
                  </span>
                ) : (
                  <CoinIcon type={revealCoin} size={172} />
                )}
              </div>
            </div>
            <div className="relative -mt-2 text-center">
              <p className="text-2xl font-extrabold text-white drop-shadow">{COIN_REVEAL[revealCoin].title}</p>
              <p className="mt-1 text-slate-300">
                {revealCoin === "empty"
                  ? "Better luck next round!"
                  : `1 ${revealCoin} coin added to your balance`}
              </p>
              <button onClick={() => setRevealCoin(null)} className="btn-gold mt-5">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart mode chooser — pick how the next round plays. */}
      {restartChooserOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => setRestartChooserOpen(false)}
        >
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">Restart — choose a mode</h2>
            <p className="mt-1 text-sm text-slate-400">
              {restartsLeft} of {MAX_RESTARTS} restarts left · pays {ROUND_COST[lastCurrency]} {lastCurrency}.
            </p>
            <div className="mt-4 grid gap-3">
              <button
                onClick={() => startRound(lastCurrency, "restart", "continuous")}
                disabled={busy}
                className="rounded-xl border border-white/10 px-4 py-3 text-left transition hover:border-amber-300/50 hover:bg-amber-300/5"
              >
                <div className="font-bold">Continuous Play</div>
                <div className="text-xs text-slate-400">
                  Same board every restart — 1 gold, 4 silver, 20 bronze, the rest empty.
                </div>
              </button>
              <button
                onClick={() => startRound(lastCurrency, "restart", "multiplier")}
                disabled={busy}
                className="rounded-xl border border-white/10 px-4 py-3 text-left transition hover:border-amber-300/50 hover:bg-amber-300/5"
              >
                <div className="font-bold">Multiplier Play</div>
                <div className="text-xs text-slate-400">
                  Rewards escalate each round — more coins and fewer blanks, up to round {MAX_RESTARTS}.
                </div>
              </button>
            </div>
            <button onClick={() => setRestartChooserOpen(false)} className="btn-ghost mt-4 w-full">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Not-enough-coins notice with a Top Up button + 10s auto-redirect. */}
      {lowCoins && <InsufficientCoinsModal message={lowCoins} onClose={() => setLowCoins(null)} />}
    </div>
  );
}
