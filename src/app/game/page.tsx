"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import DemoGame from "@/components/DemoGame";
import InsufficientCoinsModal from "@/components/InsufficientCoinsModal";
import { BOARD_SIZE, BOARD_COMPOSITION, ROUND_COST, MAX_RESTARTS, MULTIPLIER_FACTORS, stageCostMultiplier, compositionWithGems, gemRewardLabel, type BoardSlot, type CoinType, type RoundCurrency, type PlayMode, type GemReward } from "@/lib/coins";

type Phase = "idle" | "playing" | "revealed";
type Composition = { gold: number; silver: number; bronze: number; gem?: number; empty: number };
type Reward = { type: BoardSlot; gold?: number; silver?: number; bronze?: number; multiplier?: number; gem?: GemReward | null };
const nextMultiplier = (round: number) => MULTIPLIER_FACTORS[Math.min(round + 1, 10)] ?? 1;

// Per-slot reveal styling: the glow/ray colours match the coin so the modal
// looks like it emits light of that colour. Empty is a neutral "no win".
const COIN_REVEAL: Record<BoardSlot, { glow: string; ray: string; title: string }> = {
  gold: { glow: "rgba(251,191,36,0.95)", ray: "rgba(251,191,36,0.5)", title: "JACKPOT — the lucky GOLD coin! 🏆" },
  silver: { glow: "rgba(226,232,240,0.9)", ray: "rgba(226,232,240,0.45)", title: "You won a Silver coin!" },
  bronze: { glow: "rgba(205,127,50,0.95)", ray: "rgba(205,127,50,0.5)", title: "You won a Bronze coin!" },
  gem: { glow: "rgba(167,139,250,0.95)", ray: "rgba(167,139,250,0.5)", title: "A Jewel! Claim your bonus!" },
  empty: { glow: "rgba(100,116,139,0.45)", ray: "rgba(100,116,139,0.2)", title: "Empty — no coin this time!" },
};

function JewelIcon({ className = "" }: { className?: string }) {
  return <img src="/jewel.png" alt="Jewel" className={`object-contain ${className}`} />;
}

// Revealed-board borders: gold → gold, silver → silver, bronze → none.
const COIN_BORDER: Record<CoinType, { tile: string; tilePick: string; coin: string; coinPick: string }> = {
  gold: {
    tile: "gold-card bg-black/25",
    tilePick: "gold-card z-10 bg-amber-300/20 scale-[1.35]",
    coin: "ring-2 ring-amber-400",
    coinPick: "tile-flip ring-4 ring-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.65)]",
  },
  silver: {
    tile: "silver-card bg-black/25",
    tilePick: "silver-card z-10 bg-white/15 scale-[1.35]",
    coin: "ring-2 ring-slate-300",
    coinPick: "tile-flip ring-4 ring-slate-200 shadow-[0_0_14px_rgba(226,232,240,0.55)]",
  },
  bronze: {
    tile: "border-white/10 bg-black/25",
    tilePick: "z-10 border-white/20 bg-white/10 scale-[1.35]",
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
      setError(e instanceof Error ? e.message : "Could not start.");
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
      setLowCoins(`You need ${needSilver} silver or ${needBronze} bronze to continue.`);
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

  if (loading || !profile || !sessionReady) {
    return <div className="py-20 text-center text-slate-400">Loading…</div>;
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
          <h1 className="text-2xl font-extrabold sm:text-3xl">Pick the lucky coin</h1>
          <p className="hidden text-slate-400 sm:block">
            {phase === "playing"
              ? "Tap one coin to crack it open — deep breaths, no pressure."
              : `One round costs ${profile.is_admin ? "nothing (admin perks, obviously)" : `${ROUND_COST.silver} silver or ${ROUND_COST.bronze} bronze`} · ${BOARD_COMPOSITION.gold} gold, ${BOARD_COMPOSITION.silver} silver & ${BOARD_COMPOSITION.bronze} bronze playing hide-and-seek among ${BOARD_SIZE} tiles.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(profile.free_rounds ?? 0) > 0 && (
            <span className="rounded-full bg-violet-500/20 px-3 py-1 text-sm font-bold text-violet-200 ring-1 ring-violet-300/40">
              💎 {profile.free_rounds} free {profile.free_rounds === 1 ? "round" : "rounds"}
            </span>
          )}
          <CoinBalance profile={profile} size={26} />
        </div>
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
              ? `Scatter ${BOARD_SIZE} coins and take your pick — the house always smiles on admins.`
              : `Pay ${ROUND_COST.silver} silver or ${ROUND_COST.bronze} bronze, scatter ${BOARD_SIZE} coins, and trust your gut.`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={openChooser} disabled={busy} className="btn-gold text-lg !px-7 !py-3">
              {busy ? "Dealing…" : "↺ Start Over"}
            </button>
            {hasSaved && (
              <button onClick={nextStage} disabled={busy} className="btn-ghost text-lg">
                ▶ Continue <span className="text-xs text-amber-200">(×{nextMultiplier(restarts + 1)})</span>
              </button>
            )}
          </div>
          <p className="max-w-md text-xs text-slate-500">
            <b>Start Over</b> begins a fresh run at a humble ×1.
            {hasSaved
              ? " Continue picks up your saved multiplier and keeps stacking it higher — no clock, no rush."
              : " Play a round and your multiplier is saved, so you can sneak back and keep building it later."}
          </p>
        </div>
      )}

      {/* Board */}
      {(phase === "playing" || phase === "revealed") && (
        <>
          {/* Restart / New Game toolbar */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-300/15 px-2.5 py-1 text-sm font-bold text-amber-200">
                ×{multiplier} · stage {restarts + 1}/{MAX_RESTARTS}
              </span>
              {/* How many left? — hover for the current multiplier + coin counts */}
              <div className="group relative">
                <button className="btn-ghost text-sm">❓ How many left?</button>
                <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-56 rounded border border-white/10 bg-[#121829] p-3 text-xs shadow-xl group-hover:block">
                  <div className="font-semibold text-amber-200">Current multiplier ×{multiplier}</div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                    {(["gold", "silver", "bronze"] as const).map((t) => (
                      <div key={t} className="rounded bg-black/30 py-2">
                        <CoinIcon type={t} size={22} className="mx-auto" />
                        <div className="mt-1 font-bold">{composition ? composition[t] : "—"}</div>
                      </div>
                    ))}
                    <div className="rounded bg-violet-500/15 py-2">
                      <JewelIcon className="mx-auto h-6 w-6 drop-shadow-[0_0_6px_rgba(167,139,250,0.8)]" />
                      <div className="mt-1 font-bold text-violet-200">{composition?.gem ?? 0}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-slate-400">Coins &amp; gems on the board this stage.</div>
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
                ▶ Continue
                {restartsLeft <= 0 ? " (max)" : ` (×${nextMultiplier(restarts + 1)})`}
              </button>
              {/* Start Over: reset the multiplier and return to the start screen. */}
              <button onClick={newGame} disabled={busy} className="btn-ghost text-sm">
                ↺ Start Over
              </button>
            </div>
          </div>

          {/* Exact counts for this round (hidden on mobile to save space — the
              same info is in the "How many left?" tooltip). */}
          {composition && (
            <div className="hidden shrink-0 flex-wrap items-center justify-center gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm sm:flex">
              <span className="text-slate-400">This round:</span>
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
                <span className="flex items-center gap-1.5 font-semibold text-violet-300">
                  <JewelIcon className="h-5 w-5 drop-shadow-[0_0_6px_rgba(167,139,250,0.8)]" /> {composition.gem}
                </span>
              )}
              <span className="font-semibold text-slate-400">{composition.empty} blank</span>
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
                            ? "z-10 border-violet-300/70 bg-violet-400/20 ring-2 ring-violet-300/70 scale-[1.35]"
                            : "border-violet-300/40 bg-violet-500/10"
                          : isPick && border
                            ? border.tilePick
                            : border
                              ? border.tile
                              : "border-white/10 bg-black/20 opacity-50"
                        : "border-white/10 bg-gradient-to-b from-white/10 to-black/30 hover:border-amber-300/50 hover:from-amber-300/15",
                    ].join(" ")}
                  >
                    {introType === "gem" ? (
                      <JewelIcon className="h-[86%] w-[86%] drop-shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
                    ) : introType === "empty" ? (
                      <span className="text-xs font-bold text-slate-400/70 sm:text-sm">No</span>
                    ) : introType ? (
                      <span className="flex h-full w-full items-center justify-center p-[8%]">
                        <CoinIcon type={introType as CoinType} responsive className="rounded-full" />
                      </span>
                    ) : revealed && isGem ? (
                      <JewelIcon className={`h-[86%] w-[86%] drop-shadow-[0_0_8px_rgba(167,139,250,0.9)] ${isPick ? "tile-flip" : "animate-pop"}`} />
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
                      <span className={`text-xs font-bold text-slate-500 sm:text-sm ${isPick ? "tile-flip" : "animate-pop"}`}>No</span>
                    ) : null}
                    {revealed && isPick && (
                      <span className="absolute -top-1.5 left-1/2 grid h-4 w-4 -translate-x-1/2 place-items-center rounded-full bg-emerald-400 text-[10px] font-black text-slate-900 shadow sm:h-5 sm:w-5 sm:text-xs">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {phase === "revealed" && reward && (
            <div className="card flex shrink-0 flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-3">
                {reward.type === "empty" ? (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-sm font-bold text-slate-400">No</span>
                ) : reward.type === "gem" ? (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-violet-500/20">
                    <JewelIcon className="h-9 w-9 drop-shadow-[0_0_6px_rgba(167,139,250,0.8)]" />
                  </span>
                ) : (
                  <CoinIcon type={reward.type} size={40} className="animate-pop" />
                )}
                <div className="text-left">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {reward.type === "empty" ? "Result" : reward.type === "gem" ? "Gem bonus" : "You won"}
                  </div>
                  <div className="text-lg font-bold capitalize">
                    {reward.type === "empty"
                      ? "Empty — no win"
                      : reward.type === "gem"
                        ? reward.gem ? gemRewardLabel(reward.gem) : "Gem"
                        : `${reward.type === "gold" ? reward.gold : reward.type === "silver" ? reward.silver : reward.bronze ?? 1} ${reward.type}`}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={nextStage}
                  disabled={busy || restartsLeft <= 0}
                  className="btn-gold text-sm"
                >
                  ▶ Continue {restartsLeft <= 0 ? "(max)" : `(×${nextMultiplier(restarts + 1)})`}
                </button>
                <button onClick={newGame} disabled={busy} className="btn-ghost text-sm">
                  ↺ Start Over
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
                <p className="mt-1 text-sm text-slate-400">Pick your poison — both cost the same.</p>
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
                    ? "Admins play for free — rank hath its privileges."
                    : `You'll part with ${ROUND_COST[choice]} ${choice}, scatter ${BOARD_SIZE} coins, and let fate do the rest.`}
                </p>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => startRound(choice, "new")} disabled={busy} className="btn-gold flex-1">
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
              <p className="text-2xl font-extrabold text-white drop-shadow">{COIN_REVEAL[revealCoin].title}</p>
              <p className="mt-1 text-slate-300">
                {revealCoin === "empty"
                  ? "No coins this stage."
                  : revealCoin === "gem"
                    ? reward?.gem
                      ? reward.gem.kind === "turns"
                        ? `${gemRewardLabel(reward.gem)} — your next ${reward.gem.turns} round${reward.gem.turns === 1 ? "" : "s"} are free!`
                        : `${gemRewardLabel(reward.gem)} added!`
                      : "Bonus added!"
                    : `+${reward?.[revealCoin] ?? 1} ${revealCoin} added${(reward?.multiplier ?? 1) > 1 ? ` (×${reward?.multiplier})` : ""}`}
              </p>

              {/* Next-stage prompt: cost + the NEXT round's board (to entice). */}
              {restartsLeft > 0 && (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-3 text-sm">
                  <p className="font-semibold text-amber-200">Proceed to the next stage?</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {(profile.free_rounds ?? 0) > 0 ? (
                      <>
                        Next stage is <span className="font-semibold text-violet-200">FREE</span> (gem) ·
                        multiplier rises to ×{nextMultiplier(restarts + 1)}
                      </>
                    ) : (
                      <>
                        Next stage consumes {nextStageCost} {stageCurrency} · multiplier rises to ×
                        {nextMultiplier(restarts + 1)}
                      </>
                    )}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-amber-200/80">Next board</p>
                  <div className="mt-1 flex items-center justify-center gap-4">
                    {(["gold", "silver", "bronze"] as const).map((t) => (
                      <span key={t} className="flex items-center gap-1 font-bold">
                        <CoinIcon type={t} size={20} /> {nextRoundComp[t]}
                      </span>
                    ))}
                    {(nextRoundComp.gem ?? 0) > 0 && (
                      <span className="flex items-center gap-1 font-bold text-violet-200">
                        <JewelIcon className="h-5 w-5 drop-shadow-[0_0_6px_rgba(167,139,250,0.9)]" />
                        {nextRoundComp.gem}
                      </span>
                    )}
                    {nextRoundComp.empty > 0 && (
                      <span className="text-slate-400">{nextRoundComp.empty} blank</span>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2">
                {restartsLeft > 0 ? (
                  <button onClick={nextStage} className="btn-gold w-full">
                    ▶ Continue (×{nextMultiplier(restarts + 1)})
                  </button>
                ) : (
                  <button onClick={() => { setRevealCoin(null); newGame(); }} className="btn-gold w-full">
                    🏆 Max stage reached — Start Over
                  </button>
                )}
                {/* Stop here keeps the saved multiplier and returns to the hub,
                    where the player can Continue later or Start Over. */}
                <button onClick={() => { setRevealCoin(null); reset(); }} className="btn-ghost w-full text-sm">
                  Stop &amp; save
                </button>
              </div>
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

      {/* Multiplier-increase modal (shown briefly on each Start Again). */}
      {multModal !== null && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4">
          <div className="card animate-pop border-amber-300/40 bg-amber-300/10 px-10 py-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-200">Multiplier increased</p>
            <p className="mt-1 text-6xl font-black text-amber-300 drop-shadow">×{multModal}</p>
            <p className="mt-2 text-slate-300">Winnings this stage are multiplied by {multModal}!</p>
            {composition && (
              <>
                <p className="mt-4 text-xs uppercase tracking-wide text-amber-200/80">Coins on this board</p>
                <div className="mt-1 flex items-center justify-center gap-4">
                  {(["gold", "silver", "bronze"] as const).map((t) => (
                    <span key={t} className="flex items-center gap-1 font-bold">
                      <CoinIcon type={t} size={22} /> {composition[t]}
                    </span>
                  ))}
                  {composition.empty > 0 && (
                    <span className="text-sm text-slate-400">{composition.empty} blank</span>
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
