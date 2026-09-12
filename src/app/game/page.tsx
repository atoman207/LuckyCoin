"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import DemoGame from "@/components/DemoGame";
import InsufficientCoinsModal from "@/components/InsufficientCoinsModal";
import RichText from "@/components/RichText";
import { BOARD_SIZE, BOARD_COMPOSITION, ROUND_COST, MAX_RESTARTS, MULTIPLIER_FACTORS, stageCostMultiplier, compositionWithGems, gemRewardLabel, coinName, type BoardSlot, type CoinType, type RoundCurrency, type PlayMode, type GemReward } from "@/lib/coins";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

type Phase = "idle" | "playing" | "revealed";
type Composition = { gold: number; silver: number; bronze: number; gem?: number; empty: number };
type Reward = { type: BoardSlot; gold?: number; silver?: number; bronze?: number; multiplier?: number; gem?: GemReward | null };
const nextMultiplier = (round: number) => MULTIPLIER_FACTORS[Math.min(round + 1, 10)] ?? 1;

// Per-slot reveal styling: the glow/ray colours match the coin so the modal
// looks like it emits light of that colour. Empty is a neutral "no win".
const COIN_REVEAL: Record<BoardSlot, { glow: string; ray: string; title: MessageKey }> = {
  gold: { glow: "rgba(251,191,36,0.95)", ray: "rgba(251,191,36,0.5)", title: "game.revealGold" },
  silver: { glow: "rgba(226,232,240,0.9)", ray: "rgba(226,232,240,0.45)", title: "game.revealSilver" },
  bronze: { glow: "rgba(205,127,50,0.95)", ray: "rgba(205,127,50,0.5)", title: "game.revealBronze" },
  gem: { glow: "rgba(167,139,250,0.95)", ray: "rgba(167,139,250,0.5)", title: "game.revealGem" },
  empty: { glow: "rgba(100,116,139,0.45)", ray: "rgba(100,116,139,0.2)", title: "game.revealEmpty" },
};

function JewelIcon({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/jewel.png" alt="" aria-hidden className={`object-contain ${className}`} />;
}

// Revealed-board borders: gold → gold, silver → silver, bronze → none.
const COIN_BORDER: Record<CoinType, { tile: string; tilePick: string; coin: string; coinPick: string }> = {
  gold: {
    tile: "gold-card bg-cream",
    tilePick: "gold-card z-10 bg-amber-100 scale-[1.35]",
    coin: "ring-2 ring-amber-400",
    coinPick: "tile-flip ring-4 ring-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.65)]",
  },
  silver: {
    tile: "silver-card bg-cream",
    tilePick: "silver-card z-10 bg-sand scale-[1.35]",
    coin: "ring-2 ring-slate-300",
    coinPick: "tile-flip ring-4 ring-slate-200 shadow-[0_0_14px_rgba(226,232,240,0.55)]",
  },
  bronze: {
    tile: "border-line bg-cream",
    tilePick: "z-10 border-line bg-sand scale-[1.35]",
    coin: "",
    coinPick: "tile-flip",
  },
};

// Clockwise spiral order (from the outermost ring inward) for the board grid,
// so tiles deal in starting from the outside. Computed for the desktop layout.
const SPIRAL_COLS = 10;
const SPIRAL_ROWS = Math.ceil(BOARD_SIZE / SPIRAL_COLS);
const DEAL_ANIM_MS = 400;
const DEAL_STAGGER_MS = Math.floor((1000 - DEAL_ANIM_MS) / (BOARD_SIZE - 1)); // ≈1s total deal

function buildSpiralOrder(rows: number, cols: number, total: number): number[] {
  const order = new Array(total).fill(0);
  let top = 0, bottom = rows - 1, left = 0, right = cols - 1, step = 0;
  const set = (idx: number) => { if (idx < total) order[idx] = step++; };
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) set(top * cols + c);
    top++;
    for (let r = top; r <= bottom; r++) set(r * cols + right);
    right--;
    if (top <= bottom) { for (let c = right; c >= left; c--) set(bottom * cols + c); bottom--; }
    if (left <= right) { for (let r = bottom; r >= top; r--) set(r * cols + left); left--; }
  }
  return order;
}
const SPIRAL_ORDER = buildSpiralOrder(SPIRAL_ROWS, SPIRAL_COLS, BOARD_SIZE);

export default function GamePage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const { t } = useI18n();

  const [phase, setPhase] = useState<Phase>("idle");
  const [roundId, setRoundId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardSlot[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [revealCoin, setRevealCoin] = useState<BoardSlot | null>(null);
  const [composition, setComposition] = useState<Composition | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [multModal, setMultModal] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
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

  const [sessionReady, setSessionReady] = useState(false);
  const sessionLoadedRef = useRef(false);

  // Board intro animation: face-up (1 s) → flip-scatter (2 s) → off.
  const [introStage, setIntroStage] = useState<"off" | "faceup" | "flipping">("off");
  const [introBoard, setIntroBoard] = useState<BoardSlot[] | null>(null);
  type IntroOffset = { introDelay: number; flipDelay: number; fx: number; fy: number };
  const introOffsets = useRef<IntroOffset[]>([]);

  function triggerBoardIntro(comp: Composition) {
    // Build a client-side shuffled board for the face-up reveal display only.
    // (The real server board stays hidden; this only drives the 1-second preview.)
    const slots: BoardSlot[] = [
      ...Array(comp.gold).fill("gold" as BoardSlot),
      ...Array(comp.silver).fill("silver" as BoardSlot),
      ...Array(comp.bronze).fill("bronze" as BoardSlot),
      ...Array(comp.gem ?? 0).fill("gem" as BoardSlot),
      ...Array(comp.empty).fill("empty" as BoardSlot),
    ];
    for (let k = slots.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [slots[k], slots[j]] = [slots[j], slots[k]];
    }
    setIntroBoard(slots);

    introOffsets.current = Array.from({ length: BOARD_SIZE }, (_, i) => ({
      introDelay: Math.floor(SPIRAL_ORDER[i] * 6),            // spiral in ~300 ms
      flipDelay:  Math.floor(Math.random() * 1500),           // 0–1500 ms random
      fx:         Math.round((Math.random() - 0.5) * 22),     // ±11 px scatter
      fy:         Math.round((Math.random() - 0.5) * 22),
    }));
    setIntroStage("faceup");
    setTimeout(() => setIntroStage("flipping"), 1000);
    setTimeout(() => { setIntroStage("off"); setIntroBoard(null); }, 3100);
  }

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

  // Restore in-progress game after refresh or navigation.
  useEffect(() => {
    if (!profile) {
      setSessionReady(false);
      sessionLoadedRef.current = false;
      return;
    }
    if (sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/game/state", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (data.phase === "playing") {
          setRoundId(data.roundId);
          setBoard(null);
          setPicked(null);
          setReward(null);
          setRevealCoin(null);
          setRestarts(data.restarts ?? 0);
          setComposition(data.composition ?? null);
          setMultiplier(data.multiplier ?? 1);
          setPhase("playing");
        } else if (data.phase === "revealed") {
          setRoundId(data.roundId);
          setBoard(data.board ?? null);
          setPicked(data.pickedIndex ?? null);
          setReward(data.reward ?? null);
          setRevealCoin(null);
          setRestarts(data.restarts ?? 0);
          setComposition(data.composition ?? null);
          setMultiplier(data.multiplier ?? 1);
          setPhase("revealed");
        }
      } catch {
        // Fall back to idle if restore fails.
      } finally {
        setSessionReady(true);
      }
    })();
  }, [profile]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000);
  }

  async function startRound(
    currency: RoundCurrency,
    action: "new" | "restart" = "new",
    mode?: PlayMode,
  ) {
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
          // Prompt a top-up so they can buy more and resume.
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
      setComposition(data.composition ?? null);
      setMultiplier(data.multiplier ?? 1);
      setLastCurrency(currency);
      setPhase("playing");
      if (data.composition) triggerBoardIntro(data.composition);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("game.couldNotStart"));
    } finally {
      setBusy(false);
    }
    return null;
  }

  // Which currency to charge for the next stage: keep using the one in play if
  // affordable, otherwise fall back to the other (1 silver = 10 bronze). This
  // lets the multiplier feature run on Bronze as well as Silver.
  function pickStageCurrency(): RoundCurrency | null {
    if (!profile) return null;
    // Check against the ACTUAL compounded next-stage cost (not the base cost),
    // so we switch to the other currency when the current one can't cover it.
    // Only returns null — which triggers the "insufficient" message — once
    // NEITHER silver NOR bronze can pay.
    const mult = stageCostMultiplier(restarts + 2);
    const afford = (c: RoundCurrency) =>
      profile.is_admin || profile[c] >= Math.ceil(ROUND_COST[c] * mult);
    if (afford(lastCurrency)) return lastCurrency;
    const other: RoundCurrency = lastCurrency === "silver" ? "bronze" : "silver";
    return afford(other) ? other : null;
  }

  // Advance to the next multiplier stage: shake + multiplier-increase modal.
  async function nextStage() {
    const cur = pickStageCurrency();
    if (!cur) {
      setRevealCoin(null);
      const mult = stageCostMultiplier(restarts + 2);
      const needSilver = Math.ceil(ROUND_COST.silver * mult);
      const needBronze = Math.ceil(ROUND_COST.bronze * mult);
      setLowCoins(t("game.needToContinue", { silver: needSilver, bronze: needBronze }));
      return;
    }
    setRevealCoin(null);
    const data = await startRound(cur, "restart", "multiplier");
    if (data) {
      triggerShake();
      setMultModal(data.multiplier ?? 1);
      setTimeout(() => setMultModal(null), 1700);
    }
  }

  function triggerShake() {
    setShake(true);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(180);
    setTimeout(() => setShake(false), 520);
  }

  // Start Over — reset everything back to the start screen, clearing the saved
  // multiplier (restart count and round both reset to the beginning).
  async function newGame() {
    setRestartChooserOpen(false);
    try {
      const res = await fetch("/api/game/reset", { method: "POST" });
      const data = await res.json();
      if (res.ok) setProfile(data.profile);
    } catch {
      // Still clear local state if the request fails.
    }
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
      // Flip ALL cards over so the whole board is visible (gold cards glow).
      setBoard(data.board);
      setPicked(index);
      setReward(data.reward);
      setProfile(data.profile);
      setPhase("revealed");
      // Show the result modal after a 3-second pause so the revealed board (and
      // the gold cards) is seen first.
      setTimeout(() => setRevealCoin(data.reward.type), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("game.couldNotReveal"));
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

  if (loading || !profile || !sessionReady) {
    return <div className="py-20 text-center text-muted">{t("common.loading")}</div>;
  }

  // A round can be paid with EITHER 1 silver OR 10 bronze. Admins play free.
  const canPay = (c: RoundCurrency) => profile.is_admin || profile[c] >= ROUND_COST[c];
  // The currency the next stage will actually charge (silver or its 10-bronze equivalent).
  const stageCurrency = pickStageCurrency() ?? lastCurrency;
  // The stake compounds: next-stage cost = base × cumulative multiplier of the
  // next round (round = restarts + 2 after another Start Again).
  const nextStageCost = Math.ceil(ROUND_COST[stageCurrency] * stageCostMultiplier(restarts + 2));
  // A saved multiplier exists when there is persisted progress to resume.
  const hasSaved = (profile.game_round ?? 0) > 0 && restartsLeft > 0;
  // The board the player gets on the NEXT round — shown alongside the multiplier
  // to keep them engaged (a richer board to look forward to).
  const nextRoundComp = (() => {
    const c = compositionWithGems("multiplier", Math.min(restarts + 2, MAX_RESTARTS));
    const gem = c.gem ?? 0;
    return { ...c, gem, empty: BOARD_SIZE - c.gold - c.silver - c.bronze - gem };
  })();

  // During play the whole view is height-constrained to a single screen so the
  // board (and the action buttons) never overflow; the board flexes to fill.
  const playing = phase === "playing" || phase === "revealed";

  return (
    <div
      className={`${
        playing
          ? "flex h-[calc(100dvh-var(--header-h)-1.5rem)] flex-col gap-2 overflow-hidden sm:h-[calc(100dvh-var(--header-h)-4rem)] sm:gap-3"
          : "space-y-6"
      } ${shake ? "screen-shake" : ""}`}
    >
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{t("game.title")}</h1>
          <p className="hidden text-muted sm:block">
            {phase === "playing"
              ? t("game.subtitlePlaying")
              : t("game.subtitleIdle", {
                  cost: profile.is_admin
                    ? t("game.costAdmin")
                    : t("game.costNormal", { silver: ROUND_COST.silver, bronze: ROUND_COST.bronze }),
                  gold: BOARD_COMPOSITION.gold,
                  silver: BOARD_COMPOSITION.silver,
                  bronze: BOARD_COMPOSITION.bronze,
                  size: BOARD_SIZE,
                })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(profile.free_rounds ?? 0) > 0 && (
            <span className="text-sm font-semibold text-gold-ink">
              {t("game.freeRounds", { count: profile.free_rounds ?? 0 })}
            </span>
          )}
          <CoinBalance profile={profile} size={26} />
        </div>
      </div>

      {toast && (
        <div className="animate-pop px-1 py-2 text-center text-sm font-semibold text-gold-ink">
          {toast}
        </div>
      )}
      {error && (
        <div className="px-1 py-2 text-center text-sm text-red-600">{error}</div>
      )}

      {/* Idle / start */}
      {phase === "idle" && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <CoinIcon type="gold" size={72} className="animate-pop" />
          <h2 className="text-2xl font-bold">{t("game.readyTitle")}</h2>
          <p className="max-w-sm text-muted">
            {profile.is_admin
              ? t("game.readyBodyAdmin", { size: BOARD_SIZE })
              : t("game.readyBody", {
                  silver: ROUND_COST.silver,
                  bronze: ROUND_COST.bronze,
                  size: BOARD_SIZE,
                })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={openChooser} disabled={busy} className="btn-gold text-lg !px-7 !py-3">
              {busy ? t("game.dealing") : t("game.startOver")}
            </button>
            {hasSaved && (
              <button onClick={nextStage} disabled={busy} className="btn-ghost text-lg">
                {t("game.continue")}{" "}
                <span className="text-xs text-gold-ink">(×{nextMultiplier(restarts + 1)})</span>
              </button>
            )}
          </div>
          <p className="max-w-md text-xs text-faint">
            <RichText k="game.startOverHint" />{" "}
            {hasSaved ? t("game.savedHint") : t("game.noSavedHint")}
          </p>
        </div>
      )}

      {/* Board */}
      {(phase === "playing" || phase === "revealed") && (
        <>
          {/* Restart / New Game toolbar */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gold-ink">
                {t("game.stageBadge", { mult: multiplier, stage: restarts + 1, max: MAX_RESTARTS })}
              </span>
              {/* How many left? — hover for the current multiplier + coin counts */}
              <div className="group relative">
                <button className="btn-ghost text-sm">{t("game.howManyLeft")}</button>
                <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-56 rounded-lg border border-line bg-white p-3 text-xs shadow-md group-hover:block">
                  <div className="font-semibold text-gold-ink">{t("game.currentMultiplier", { mult: multiplier })}</div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                    {(["gold", "silver", "bronze"] as const).map((t) => (
                      <div key={t} className="py-2">
                        <CoinIcon type={t} size={22} className="mx-auto" />
                        <div className="mt-1 font-bold">{composition ? composition[t] : "—"}</div>
                      </div>
                    ))}
                    <div className="py-2">
                      <JewelIcon className="mx-auto h-6 w-6" />
                      <div className="mt-1 font-bold">{composition?.gem ?? 0}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-muted">{t("game.boardContents")}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Continue: advance the stage and increase the (saved) multiplier.
                  Available once the current board has been revealed. */}
              <button
                onClick={nextStage}
                disabled={busy || phase !== "revealed" || restartsLeft <= 0}
                className="btn-gold text-sm"
              >
                {restartsLeft <= 0
                  ? t("game.continueMax")
                  : t("game.continueWith", { mult: nextMultiplier(restarts + 1) })}
              </button>
              {/* Start Over: reset the multiplier and return to the start screen. */}
              <button onClick={newGame} disabled={busy} className="btn-ghost text-sm">
                {t("game.startOver")}
              </button>
            </div>
          </div>

          {/* Exact counts for this round (hidden on mobile to save space — the
              same info is in the "How many left?" tooltip). */}
          {composition && (
            <div className="hidden shrink-0 flex-wrap items-center justify-center gap-5 px-1 py-1 text-sm sm:flex">
              <span className="text-muted">{t("game.thisRound")}</span>
              <span className="flex items-center gap-1.5 font-semibold">
                <CoinIcon type="gold" size={20} /> {composition.gold}
              </span>
              <span className="flex items-center gap-1.5 font-semibold">
                <CoinIcon type="silver" size={20} /> {composition.silver}
              </span>
              <span className="flex items-center gap-1.5 font-semibold">
                <CoinIcon type="bronze" size={20} /> {composition.bronze}
              </span>
              {(composition.gem ?? 0) > 0 && (
                <span className="flex items-center gap-1.5 font-semibold">
                  <JewelIcon className="h-5 w-5" /> {composition.gem}
                </span>
              )}
              <span className="font-semibold text-muted">{t("game.blankCount", { count: composition.empty })}</span>
            </div>
          )}

          {/* Board fills the remaining height; tiles are equal squares sized to fit. */}
          <div className="coin-board-shell min-h-0 flex-1">
            <div key={roundId ?? "board"} className="coin-board-grid">
              {Array.from({ length: BOARD_SIZE }).map((_, i) => {
                const revealed = phase === "revealed" && board;
                const type = revealed ? board![i] : null;
                const isPick = picked === i;
                const isGem = type === "gem";
                const border = type && type !== "empty" && type !== "gem" ? COIN_BORDER[type] : null;
                const tileVariant = `coin-board-tile-v${(i % 6) + 1}`;
                const off = introOffsets.current[i];
                const inIntro = introStage !== "off";
                const introType = introStage === "faceup" && introBoard ? introBoard[i] : null;
                const tileStyle: React.CSSProperties = inIntro
                  ? introStage === "faceup"
                    ? ({ "--intro-delay": `${off?.introDelay ?? 0}ms` } as React.CSSProperties)
                    : ({
                        "--flip-delay": `${off?.flipDelay ?? 0}ms`,
                        "--fx": `${off?.fx ?? 0}px`,
                        "--fy": `${off?.fy ?? 0}px`,
                      } as React.CSSProperties)
                  : {
                      animationDelay: `${SPIRAL_ORDER[i] * DEAL_STAGGER_MS}ms`,
                      animationDuration: `${DEAL_ANIM_MS}ms`,
                    };
                return (
                  <button
                    key={i}
                    onClick={() => pick(i)}
                    disabled={phase !== "playing" || busy || inIntro}
                    style={tileStyle}
                    className={[
                      "coin-board-tile relative grid place-items-center border transition duration-300",
                      inIntro ? "" : "tile-deal",
                      introStage === "faceup"   ? "tile-intro-faceup" : "",
                      introStage === "flipping" ? "tile-intro-flip"   : "",
                      tileVariant,
                      revealed
                        ? isGem
                          ? isPick
                            ? "z-10 border-violet-300/80 bg-violet-50/80 ring-1 ring-violet-300 scale-[1.35]"
                            : "border-violet-200/70 bg-violet-50/50"
                          : isPick && border
                            ? border.tilePick
                            : border
                              ? border.tile
                              : "border-line bg-cream opacity-50"
                        : "border-line bg-gradient-to-b from-white to-[#faf6ef] hover:border-amber-400/70 hover:from-amber-50/80",
                    ].join(" ")}
                  >
                    {introType === "gem" ? (
                      <JewelIcon className="h-[86%] w-[86%]" />
                    ) : introType === "empty" ? (
                      <span className="text-xs font-bold text-muted/70 sm:text-sm">{t("coin.no")}</span>
                    ) : introType ? (
                      <span className="flex h-full w-full items-center justify-center p-[8%]">
                        <CoinIcon type={introType as CoinType} responsive className="rounded-full" />
                      </span>
                    ) : revealed && isGem ? (
                      <JewelIcon className={`h-[86%] w-[86%] ${isPick ? "tile-flip" : "animate-pop"}`} />
                    ) : revealed && type && type !== "empty" && type !== "gem" ? (
                      <span className="flex h-full w-full items-center justify-center p-[8%]">
                        <CoinIcon
                          type={type}
                          responsive
                          className={[
                            "rounded-full",
                            isPick ? border!.coinPick : `animate-pop ${border!.coin}`,
                          ].join(" ")}
                        />
                      </span>
                    ) : revealed && type === "empty" ? (
                      <span className={`text-xs font-bold text-faint sm:text-sm ${isPick ? "tile-flip" : "animate-pop"}`}>{t("coin.no")}</span>
                    ) : null}
                    {revealed && isPick && (
                      <span className="absolute -top-1.5 left-1/2 grid h-4 w-4 -translate-x-1/2 place-items-center rounded-full bg-gold-ink text-[10px] font-black text-white sm:h-5 sm:w-5 sm:text-xs">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {phase === "revealed" && reward && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line py-3">
              <div className="flex items-center gap-3">
                {reward.type === "empty" ? (
                  <span className="grid h-10 w-10 place-items-center text-sm font-bold text-muted">{t("coin.no")}</span>
                ) : reward.type === "gem" ? (
                  <span className="grid h-10 w-10 place-items-center">
                    <JewelIcon className="h-9 w-9" />
                  </span>
                ) : (
                  <CoinIcon type={reward.type} size={40} className="animate-pop" />
                )}
                <div className="text-left">
                  <div className="text-xs uppercase tracking-wide text-muted">
                    {reward.type === "empty"
                      ? t("game.resultLabel")
                      : reward.type === "gem"
                        ? t("game.gemBonusLabel")
                        : t("game.youWonLabel")}
                  </div>
                  <div className="text-lg font-bold">
                    {reward.type === "empty"
                      ? t("game.emptyResult")
                      : reward.type === "gem"
                        ? reward.gem
                          ? gemRewardLabel(t, reward.gem)
                          : t("game.gemLabel")
                        : t("game.rewardCoin", {
                            count:
                              (reward.type === "gold"
                                ? reward.gold
                                : reward.type === "silver"
                                  ? reward.silver
                                  : reward.bronze) ?? 1,
                            name: coinName(t, reward.type),
                          })}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={nextStage}
                  disabled={busy || restartsLeft <= 0}
                  className="btn-gold text-sm"
                >
                  {restartsLeft <= 0
                    ? t("game.continueMax")
                    : t("game.continueWith", { mult: nextMultiplier(restarts + 1) })}
                </button>
                <button onClick={newGame} disabled={busy} className="btn-ghost text-sm">
                  {t("game.startOver")}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Start-option modal: select exactly one option, then see a message. */}
      {chooserOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#4a3f31]/30 p-4"
          onClick={closeChooser}
        >
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            {choice === null ? (
              <>
                <h2 className="text-xl font-bold">{t("game.chooseHowToPay")}</h2>
                <p className="mt-1 text-sm text-muted">{t("game.chooseHowToPayHint")}</p>
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
                              t("game.needToStart", {
                                name: coinName(t, c),
                                need: ROUND_COST[c],
                                have: profile[c],
                              })
                            );
                          } else {
                            setChoice(c);
                          }
                        }}
                        className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-left transition hover:border-amber-400 hover:bg-amber-50"
                      >
                        <span className="flex items-center gap-3">
                          <CoinIcon type={c} size={32} />
                          <span>
                            <span className="block font-bold">
                              {t("game.rewardCoin", { count: ROUND_COST[c], name: coinName(t, c) })}
                            </span>
                            <span className="block text-xs text-muted">
                              {t("game.youHave", { amount: profile[c], name: coinName(t, c) })}
                            </span>
                          </span>
                        </span>
                        <span className={`text-xs font-semibold ${ok ? "text-emerald-600" : "text-red-600"}`}>
                          {profile.is_admin ? t("common.free") : ok ? t("common.available") : t("common.notEnough")}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={closeChooser} className="btn-ghost mt-4 w-full">
                  {t("common.cancel")}
                </button>
              </>
            ) : canPay(choice) ? (
              <>
                <h2 className="text-xl font-bold">{t("game.startRoundTitle")}</h2>
                <p className="mt-2 text-body">
                  {profile.is_admin
                    ? t("game.startRoundAdmin")
                    : t("game.startRoundBody", {
                        cost: ROUND_COST[choice],
                        name: coinName(t, choice),
                        size: BOARD_SIZE,
                      })}
                </p>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => startRound(choice, "new")} disabled={busy} className="btn-gold flex-1">
                    {t("game.start")}
                  </button>
                  <button onClick={() => setChoice(null)} className="btn-ghost">
                    {t("common.back")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-red-700">
                  {t("game.notEnoughTitle", { name: coinName(t, choice) })}
                </h2>
                <p className="mt-2 text-body">
                  {t("game.notEnoughBody", { name: coinName(t, choice) })}
                </p>
                <div className="mt-5 flex flex-col gap-3">
                  <Link href="/buy" onClick={closeChooser} className="btn-gold text-center">
                    {t("game.goToPurchase")}
                  </Link>
                  <button onClick={() => setChoice(null)} className="btn-ghost">
                    {t("common.back")}
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
          className="reveal-overlay fixed inset-0 z-50 grid place-items-center bg-[#4a3f31]/45 p-4 backdrop-blur-sm"
          onClick={() => setRevealCoin(null)}
          style={{ "--glow": COIN_REVEAL[revealCoin].glow, "--ray": COIN_REVEAL[revealCoin].ray } as CSSProperties}
        >
          <div className="flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative grid h-[300px] w-[300px] place-items-center">
              <div className="reveal-rays pointer-events-none absolute inset-[-60px] rounded-full opacity-40" />
              <div className="reveal-glow pointer-events-none absolute inset-0 rounded-full" />
              <div className="reveal-coin relative drop-shadow-2xl">
                {revealCoin === "empty" ? (
                  <span className="grid h-[172px] w-[172px] place-items-center rounded-full border border-line bg-cream text-5xl font-extrabold text-muted">
                    {t("coin.no")}
                  </span>
                ) : revealCoin === "gem" ? (
                  <span className="grid h-[172px] w-[172px] place-items-center">
                    <JewelIcon className="h-full w-full drop-shadow-[0_0_28px_rgba(167,139,250,0.95)]" />
                  </span>
                ) : (
                  <CoinIcon type={revealCoin} size={172} />
                )}
              </div>
            </div>
            <div className="relative -mt-2 max-w-sm text-center">
              <p className="text-2xl font-extrabold text-body drop-shadow">{t(COIN_REVEAL[revealCoin].title)}</p>
              <p className="mt-1 text-body">
                {revealCoin === "empty"
                  ? t("game.revealEmptyBody")
                  : revealCoin === "gem"
                    ? reward?.gem
                      ? reward.gem.kind === "turns"
                        ? t("game.revealGemTurns", {
                            label: gemRewardLabel(t, reward.gem),
                            turns: reward.gem.turns,
                          })
                        : t("game.revealGemAdded", { label: gemRewardLabel(t, reward.gem) })
                      : t("game.revealGemBonus")
                    : t("game.revealCoinAdded", {
                        amount: reward?.[revealCoin] ?? 1,
                        name: coinName(t, revealCoin),
                        mult:
                          (reward?.multiplier ?? 1) > 1
                            ? t("game.revealMultSuffix", { mult: reward?.multiplier ?? 1 })
                            : "",
                      })}
              </p>

              {/* Next-stage prompt: cost + the NEXT round's board (to entice). */}
              {restartsLeft > 0 && (
                <div className="mt-4 rounded-xl border border-line bg-cream p-3 text-sm">
                  <p className="font-semibold text-amber-700">{t("game.nextStageTitle")}</p>
                  <p className="mt-1 text-xs text-muted">
                    {(profile.free_rounds ?? 0) > 0 ? (
                      <RichText
                        k="game.nextStageFree"
                        vars={{ mult: nextMultiplier(restarts + 1) }}
                      />
                    ) : (
                      <RichText
                        k="game.nextStageCost"
                        vars={{
                          cost: nextStageCost,
                          name: coinName(t, stageCurrency),
                          mult: nextMultiplier(restarts + 1),
                        }}
                      />
                    )}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-amber-700">{t("game.nextBoard")}</p>
                  <div className="mt-1 flex items-center justify-center gap-4">
                    {(["gold", "silver", "bronze"] as const).map((t) => (
                      <span key={t} className="flex items-center gap-1 font-bold">
                        <CoinIcon type={t} size={20} /> {nextRoundComp[t]}
                      </span>
                    ))}
                    {(nextRoundComp.gem ?? 0) > 0 && (
                      <span className="flex items-center gap-1 font-bold text-violet-700">
                        <JewelIcon className="h-5 w-5 drop-shadow-[0_0_6px_rgba(167,139,250,0.9)]" />
                        {nextRoundComp.gem}
                      </span>
                    )}
                    {nextRoundComp.empty > 0 && (
                      <span className="text-muted">{t("game.blankCount", { count: nextRoundComp.empty })}</span>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2">
                {restartsLeft > 0 ? (
                  <button onClick={nextStage} className="btn-gold w-full">
                    {t("game.continueWith", { mult: nextMultiplier(restarts + 1) })}
                  </button>
                ) : (
                  <button onClick={() => { setRevealCoin(null); newGame(); }} className="btn-gold w-full">
                    {t("game.maxStageReached")}
                  </button>
                )}
                {/* Stop here keeps the saved multiplier and returns to the hub,
                    where the player can Continue later or Start Over. */}
                <button onClick={() => { setRevealCoin(null); reset(); }} className="btn-ghost w-full text-sm">
                  {t("game.stopAndSave")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restart mode chooser — pick how the next round plays. */}
      {restartChooserOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#4a3f31]/35 p-4"
          onClick={() => setRestartChooserOpen(false)}
        >
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{t("game.restartTitle")}</h2>
            <p className="mt-1 text-sm text-muted">
              {t("game.restartLead", {
                left: restartsLeft,
                max: MAX_RESTARTS,
                cost: ROUND_COST[lastCurrency],
                name: coinName(t, lastCurrency),
              })}
            </p>
            <div className="mt-4 grid gap-3">
              <button
                onClick={() => startRound(lastCurrency, "restart", "continuous")}
                disabled={busy}
                className="rounded-xl border border-line px-4 py-3 text-left transition hover:border-amber-400 hover:bg-amber-50"
              >
                <div className="font-bold">{t("game.modeContinuous")}</div>
                <div className="text-xs text-muted">{t("game.modeContinuousDesc")}</div>
              </button>
              <button
                onClick={() => startRound(lastCurrency, "restart", "multiplier")}
                disabled={busy}
                className="rounded-xl border border-line px-4 py-3 text-left transition hover:border-amber-400 hover:bg-amber-50"
              >
                <div className="font-bold">{t("game.modeMultiplier")}</div>
                <div className="text-xs text-muted">{t("game.modeMultiplierDesc", { max: MAX_RESTARTS })}</div>
              </button>
            </div>
            <button onClick={() => setRestartChooserOpen(false)} className="btn-ghost mt-4 w-full">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Multiplier-increase modal (shown briefly on each Start Again). */}
      {multModal !== null && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#4a3f31]/35 p-4">
          <div className="card animate-pop border-amber-300 bg-amber-50 px-10 py-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">{t("game.multIncreased")}</p>
            <p className="mt-1 text-6xl font-black text-amber-600 drop-shadow">×{multModal}</p>
            <p className="mt-2 text-body">{t("game.multBody", { mult: multModal })}</p>
            {composition && (
              <>
                <p className="mt-4 text-xs uppercase tracking-wide text-amber-700">{t("game.boardCoins")}</p>
                <div className="mt-1 flex items-center justify-center gap-4">
                  {(["gold", "silver", "bronze"] as const).map((t) => (
                    <span key={t} className="flex items-center gap-1 font-bold">
                      <CoinIcon type={t} size={22} /> {composition[t]}
                    </span>
                  ))}
                  {composition.empty > 0 && (
                    <span className="text-sm text-muted">{t("game.blankCount", { count: composition.empty })}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Not-enough-coins notice with a Top Up button + 10s auto-redirect. */}
      {lowCoins && <InsufficientCoinsModal message={lowCoins} onClose={() => setLowCoins(null)} />}
    </div>
  );
}
