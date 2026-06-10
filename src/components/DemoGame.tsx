"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import DemoCoinModal from "@/components/DemoCoinModal";
import { buildBoardFrom, BASE_COMPOSITION, BOARD_SIZE, FREE_PLAYS, type BoardSlot, type CoinType } from "@/lib/coins";
import { INTRO_TEASER } from "@/lib/content";

const KEY = "lc_demo_plays";

// Weighted demo outcome for logged-out (trial) users:
//   gold 10%, silver 30%, bronze 50%, no win 10%.
function weightedOutcome(): BoardSlot {
  const r = Math.random();
  if (r < 0.1) return "gold"; // 10%
  if (r < 0.4) return "silver"; // 30%
  if (r < 0.9) return "bronze"; // 50%
  return "empty"; // 10% — no win
}

// Free trial for logged-out visitors: up to FREE_PLAYS demo rounds per browser.
// Every win pops a glowing coin modal inviting them to log in; after the limit,
// a login gate links to the full introduction.
export default function DemoGame() {
  const { openAuth } = useUser();
  const router = useRouter();
  const [plays, setPlays] = useState(0);
  const [board, setBoard] = useState<BoardSlot[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<BoardSlot | null>(null);
  const [coinModal, setCoinModal] = useState<CoinType | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    setPlays(Number(localStorage.getItem(KEY) || 0));
  }, []);

  function start() {
    if (plays >= FREE_PLAYS) {
      setGateOpen(true);
      return;
    }
    setBoard(buildBoardFrom(BASE_COMPOSITION));
    setPicked(null);
    setResult(null);
  }

  function pick(i: number) {
    if (!board || picked !== null) return;
    const out = weightedOutcome();
    setPicked(i);
    setResult(out);
    setCoinModal(out === "empty" ? null : out); // effect modal only for coins
    const next = plays + 1;
    setPlays(next);
    localStorage.setItem(KEY, String(next));
    // No coin modal on a no-win, so open the login gate here if trial is used up.
    if (out === "empty" && next >= FREE_PLAYS) setTimeout(() => setGateOpen(true), 800);
  }

  // Closing the win modal: if the trial is used up, show the login gate.
  function closeCoinModal() {
    setCoinModal(null);
    if (plays >= FREE_PLAYS) setTimeout(() => setGateOpen(true), 250);
  }

  const left = Math.max(0, FREE_PLAYS - plays);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Try it free</h1>
          <p className="text-slate-400">
            {left > 0 ? `${left} of ${FREE_PLAYS} free demo rounds left` : "Free rounds used"} · demo
            wins aren&apos;t saved — log in to keep them.
          </p>
        </div>
        <button onClick={openAuth} className="btn-gold text-sm">Log in / Register</button>
      </div>

      {!board ? (
        <div className="card flex flex-col items-center gap-4 p-10 text-center">
          <CoinIcon type="gold" size={72} className="animate-pop" />
          <h2 className="text-2xl font-bold">Pick the lucky coin</h2>
          <p className="max-w-sm text-slate-300">
            {BOARD_SIZE} tiles hide gold, silver and bronze coins. Crack one open and see what you find!
          </p>
          <button onClick={start} disabled={plays >= FREE_PLAYS} className="btn-gold text-lg !px-7 !py-3">
            {plays >= FREE_PLAYS ? "Log in to keep playing" : "▶ Start free round"}
          </button>
          {plays >= FREE_PLAYS && (
            <button onClick={() => setGateOpen(true)} className="text-sm text-amber-300 underline">
              Why log in?
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 sm:gap-3 md:grid-cols-10">
            {board.map((slot, i) => {
              const revealed = picked !== null;
              const isPick = picked === i;
              // The picked tile shows the weighted result; others show the board.
              const shown: BoardSlot = isPick && result ? result : slot;
              return (
                <button
                  key={i}
                  onClick={() => pick(i)}
                  disabled={revealed}
                  className={[
                    "relative grid aspect-square place-items-center rounded-xl border transition",
                    revealed
                      ? isPick
                        ? "border-amber-300/70 bg-white/10 ring-2 ring-amber-300/70 scale-105"
                        : "border-white/10 bg-black/20 opacity-50"
                      : "border-white/10 bg-gradient-to-b from-white/10 to-black/30 hover:border-amber-300/50",
                  ].join(" ")}
                >
                  {revealed && shown !== "empty" ? (
                    <CoinIcon type={shown} size={40} />
                  ) : revealed ? (
                    <span className="text-sm font-bold text-slate-500">No</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {result !== null && !coinModal && (
            <div className="card flex flex-col items-center gap-3 p-6 text-center">
              <div className="text-xl font-bold capitalize">
                {result === "empty" ? "No win this time (demo)" : `You found 1 ${result} coin! (demo)`}
              </div>
              <button onClick={start} className="btn-gold">
                {left > 0 ? `Play again (${left} left)` : "Log in to keep playing"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Effect modal on every demo coin */}
      {coinModal && <DemoCoinModal coin={coinModal} onLogin={openAuth} onClose={closeCoinModal} />}

      {/* Login gate after the free rounds */}
      {gateOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setGateOpen(false)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold">Log in to keep playing</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {INTRO_TEASER.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <button onClick={openAuth} className="btn-gold w-full">Log in / Register</button>
              <button onClick={() => router.push("/intro")} className="btn-ghost w-full">
                Read More →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
