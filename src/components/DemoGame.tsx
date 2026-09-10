"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import DemoCoinModal from "@/components/DemoCoinModal";
import { buildBoardFrom, BASE_COMPOSITION, BOARD_SIZE, FREE_PLAYS, coinName, type BoardSlot, type CoinType } from "@/lib/coins";
import { INTRO_TEASER_KEYS } from "@/lib/content";
import { useI18n } from "@/lib/i18n/provider";

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
  const { t } = useI18n();
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
    setCoinModal(out === "empty" || out === "gem" ? null : out); // effect modal only for coins
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
    <div
      className={
        board
          ? "flex h-[calc(100dvh-var(--header-h)-4rem)] flex-col gap-3 overflow-hidden"
          : "space-y-6"
      }
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{t("demo.title")}</h1>
          <p className="text-muted">
            {left > 0 ? t("demo.left", { left, total: FREE_PLAYS }) : t("demo.used")} ·{" "}
            {t("demo.subtitle")}
          </p>
        </div>
        <button onClick={openAuth} className="btn-gold text-sm">{t("common.loginRegister")}</button>
      </div>

      {!board ? (
        <div className="card flex flex-col items-center gap-4 p-10 text-center">
          <CoinIcon type="gold" size={72} className="animate-pop" />
          <h2 className="text-2xl font-bold">{t("demo.pickTitle")}</h2>
          <p className="max-w-sm text-body">{t("demo.pickBody", { size: BOARD_SIZE })}</p>
          <button onClick={start} disabled={plays >= FREE_PLAYS} className="btn-gold text-lg !px-7 !py-3">
            {plays >= FREE_PLAYS ? t("demo.loginToKeepPlaying") : t("demo.startRound")}
          </button>
          {plays >= FREE_PLAYS && (
            <button onClick={() => setGateOpen(true)} className="text-sm text-amber-600 underline">
              {t("demo.whyLogin")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="coin-board-shell min-h-0 flex-1">
            <div className="coin-board-grid">
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
                    "coin-board-tile relative grid place-items-center border transition",
                    revealed
                      ? isPick
                        ? "z-10 border-amber-400 bg-sand ring-2 ring-amber-300 scale-[1.35]"
                        : "border-line bg-cream opacity-50"
                      : "border-line bg-gradient-to-b from-white to-white/50 hover:border-amber-400",
                  ].join(" ")}
                >
                  {revealed && shown !== "empty" && shown !== "gem" ? (
                    <span className="flex h-full w-full items-center justify-center p-[8%]">
                      <CoinIcon type={shown} responsive />
                    </span>
                  ) : revealed ? (
                    <span className="text-xs font-bold text-faint sm:text-sm">{t("coin.no")}</span>
                  ) : null}
                </button>
              );
            })}
            </div>
          </div>

          {result !== null && !coinModal && (
            <div className="card flex shrink-0 flex-col items-center gap-3 p-4 text-center sm:p-6">
              <div className="text-xl font-bold">
                {result === "empty"
                  ? t("demo.resultEmpty")
                  : t("demo.resultCoin", { name: coinName(t, result) })}
              </div>
              <button onClick={start} className="btn-gold">
                {left > 0 ? t("demo.playAgain", { left }) : t("demo.loginToKeepPlaying")}
              </button>
            </div>
          )}
        </>
      )}

      {/* Effect modal on every demo coin */}
      {coinModal && <DemoCoinModal coin={coinModal} onLogin={openAuth} onClose={closeCoinModal} />}

      {/* Login gate after the free rounds */}
      {gateOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#4a3f31]/35 p-4" onClick={() => setGateOpen(false)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold">{t("demo.gateTitle")}</h2>
            <div className="mt-3 space-y-2 text-sm text-body">
              {INTRO_TEASER_KEYS.map((key) => (
                <p key={key}>{t(key)}</p>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <button onClick={openAuth} className="btn-gold w-full">{t("common.loginRegister")}</button>
              <button onClick={() => router.push("/intro")} className="btn-ghost w-full">
                {t("intro.readMore")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
