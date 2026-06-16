// Central place for the game's economy. Tune everything here.

// Value of each coin expressed in the base unit (bronze).
export const COIN_VALUE = {
  gold: 500,
  silver: 10,
  bronze: 1,
} as const;

// Cost to start one round. A player may pay with EITHER 1 silver OR 10 bronze
// ("coins") — equal value, since 1 silver = 10 bronze.
export const ROUND_COST_SILVER = 1;
export const ROUND_COST_BRONZE = COIN_VALUE.silver; // 10 bronze

export type RoundCurrency = "silver" | "bronze";
export const ROUND_COST: Record<RoundCurrency, number> = {
  silver: ROUND_COST_SILVER,
  bronze: ROUND_COST_BRONZE,
};

// Free demo plays allowed before a visitor must log in.
export const FREE_PLAYS = 3;

// ---- Daily prize wheel -------------------------------------------------
// 20 segments, rewarded in bronze. The pointer NEVER lands on 1000 or 500
// (those are display-only teasers); wins come from the other segments.
export const WHEEL_REWARD_COIN: CoinType = "bronze";
export const DRAW_COOLDOWN_MS = 24 * 60 * 60 * 1000; // one free spin every 24h
export const WHEEL_SPIN_MS = 10_000; // nominal spin time
// Time coefficient: compress the elapsed spin to a fraction of a second.
export const WHEEL_TIME_COEFFICIENT = 0.07;
export const WHEEL_SPIN_EFFECTIVE_MS = Math.round(WHEEL_SPIN_MS * WHEEL_TIME_COEFFICIENT); // ~700ms
export const WHEEL_VALUES: number[] = [
  1000, // ×1
  500, 500, // ×2
  100, 100, 100, // ×3
  50, 50, 50, 50, // ×4
  10, 10, 10, 10, 10, // ×5
  5, 5, 5, 5, // ×4
  0, // ×1
]; // = 20 segments
export const WHEEL_BLOCKED = [1000, 500]; // pointer can never stop here
export const wheelCanWin = (value: number) => !WHEEL_BLOCKED.includes(value);

// Win probabilities for the daily lottery (percent weights). 1000/500 are
// never drawn; 100=2%, 50=10%, 10=50%, and the rest is split between 5 and 0.
export const WHEEL_WIN_WEIGHTS: Record<number, number> = {
  100: 2,
  50: 10,
  10: 50,
  5: 30,
  0: 8,
};

export function drawCooldownLeftMs(lastDrawAt: string | null | undefined, now = Date.now()): number {
  if (!lastDrawAt) return 0;
  return Math.max(0, new Date(lastDrawAt).getTime() + DRAW_COOLDOWN_MS - now);
}

export function formatDrawCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ---- Exchange direction ------------------------------------------------
// One-way only: gold → silver, silver → bronze. Never the reverse.
export const EXCHANGE_NEXT: Partial<Record<CoinType, CoinType>> = {
  gold: "silver",
  silver: "bronze",
};

// Silver → bronze uses tiered bundles (largest first). Singles stay at par.
export const SILVER_BRONZE_TIERS = [
  { silver: 100, bronze: 1500 },
  { silver: 10, bronze: 110 },
  { silver: 1, bronze: 10 },
] as const;

export function silverToBronze(amount: number): number {
  let remaining = amount;
  let total = 0;
  for (const tier of SILVER_BRONZE_TIERS) {
    const chunks = Math.floor(remaining / tier.silver);
    total += chunks * tier.bronze;
    remaining %= tier.silver;
  }
  return total;
}

// How many coins you receive when exchanging downward.
export function exchangeOutput(from: CoinType, to: CoinType, amount: number): number {
  if (from === "gold" && to === "silver") {
    return (amount * COIN_VALUE.gold) / COIN_VALUE.silver;
  }
  if (from === "silver" && to === "bronze") {
    return silverToBronze(amount);
  }
  throw new Error(`Invalid exchange: ${from} → ${to}`);
}

// The board: 50 tiles — round-1 base (before gems): 2 gold, 25 silver, 20 bronze,
// 3 empty. With 5 gems replacing 5 silver: 2 gold, 20 silver, 20 bronze, 5 gems,
// 3 blank. Counts must sum to BOARD_SIZE.
export const BOARD_COMPOSITION = {
  gold: 2,
  silver: 25,
  bronze: 20,
  empty: 3,
} as const;
export const BOARD_SIZE =
  BOARD_COMPOSITION.gold +
  BOARD_COMPOSITION.silver +
  BOARD_COMPOSITION.bronze +
  BOARD_COMPOSITION.empty; // 50

// ---- Restart modes & escalating rounds --------------------------------
export type PlayMode = "continuous" | "multiplier";
export const MAX_RESTARTS = 10;

export type Composition = { gold: number; silver: number; bronze: number; gem?: number };
export const BASE_COMPOSITION: Composition = { gold: 2, silver: 25, bronze: 20 };

// ---- Gems (Multiplier Play) -------------------------------------------
// Gems only appear in Multiplier Play.
// Round 1: 5 gems (replace 5 silver). From round 2 onward:
//   turn 2 → 1 gem, turn 3 → 2 gems, … turn 10 → 9 gems (replacing silver).
export function gemsForRound(mode: PlayMode | null | undefined, round: number): number {
  if (mode !== "multiplier") return 0;
  if (round <= 1) return 5;
  return Math.max(0, Math.min(round, MAX_RESTARTS) - 1);
}

// Maximum silver any player may hold. Game/bot-generated silver is capped here.
export const SILVER_CAP = 10_000;

// A picked gem grants ONE of these, chosen at random:
//   • free turns  — your next N rounds cost no silver (+1 / +2 / +3);
//   • silver      — +2 / +10 / +50 / +100 silver;
//   • bronze      — +100 / +500 / +1,000 bronze.
export type GemReward =
  | { kind: "turns"; turns: number }
  | { kind: "silver"; amount: number }
  | { kind: "bronze"; amount: number };
export const GEM_TURN_OPTIONS = [1, 2, 3] as const;
export const GEM_SILVER_OPTIONS = [2, 10, 50, 100] as const;
export const GEM_BRONZE_OPTIONS = [100, 500, 1000] as const;
export const GEM_REWARDS: GemReward[] = [
  ...GEM_TURN_OPTIONS.map((t): GemReward => ({ kind: "turns", turns: t })),
  ...GEM_SILVER_OPTIONS.map((a): GemReward => ({ kind: "silver", amount: a })),
  ...GEM_BRONZE_OPTIONS.map((a): GemReward => ({ kind: "bronze", amount: a })),
];
export function randomGemReward(): GemReward {
  return GEM_REWARDS[Math.floor(Math.random() * GEM_REWARDS.length)];
}

// Short human label for a gem reward (used in the UI + result text).
export function gemRewardLabel(r: GemReward): string {
  if (r.kind === "turns") return `+${r.turns} free turn${r.turns === 1 ? "" : "s"}`;
  if (r.kind === "silver") return `+${r.amount} silver`;
  return `+${r.amount.toLocaleString()} bronze`;
}

// Per-round board composition (rounds 1–10). The remaining tiles of the 50 are
// empty ("No"). Round 1 is the entry board; each Continue advances the round.
//   1: 2/20/20 + 5 gems (3 blank)   6: 12/28/10
//   2: 3/37/10                       7: 15/25/10
//   3: 4/36/10                       8: 20/30/0
//   4: 5/35/10                       9: 25/20/0 (5 blank)
//   5: 10/30/10                     10: 30/20/0
// Note: round-1 silver is 25 here; compositionWithGems() replaces 5 with gems.
export const MULTIPLIER_ROUNDS: Record<number, Composition> = {
  1: { gold: 2, silver: 25, bronze: 20 },
  2: { gold: 3, silver: 37, bronze: 10 },
  3: { gold: 4, silver: 36, bronze: 10 },
  4: { gold: 5, silver: 35, bronze: 10 },
  5: { gold: 10, silver: 30, bronze: 10 },
  6: { gold: 12, silver: 28, bronze: 10 },
  7: { gold: 15, silver: 25, bronze: 10 },
  8: { gold: 20, silver: 30, bronze: 0 },
  9: { gold: 25, silver: 20, bronze: 0 },
  10: { gold: 30, silver: 20, bronze: 0 },
};

// Per-round multiplier INCREASE in Multiplier Play. The entry stake compounds
// by this each round (so it is shown as "×N" for the round).
export const MULTIPLIER_FACTORS: Record<number, number> = {
  1: 1, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 4, 9: 4, 10: 5,
};

// The per-round increase shown for `round` (1 outside Multiplier Play).
export function multiplierFor(mode: string | null | undefined, round: number): number {
  if (mode !== "multiplier") return 1;
  return MULTIPLIER_FACTORS[Math.min(Math.max(round, 1), 10)] ?? 1;
}

// Cumulative stake multiplier: the product of all increases up to `round`, so
// the entry cost = base × this. With base = 1 silver / 10 bronze this gives:
//   silver: 1, 2, 4, 8, 24, 72, 216, 864, 3456, 17280
//   bronze: 10, 20, 40, 80, 240, 720, 2160, 8640, 34560, 172800
export function stageCostMultiplier(round: number): number {
  const r = Math.min(Math.max(round, 1), 10);
  let m = 1;
  for (let k = 1; k <= r; k++) m *= MULTIPLIER_FACTORS[k] ?? 1;
  return m;
}

// Server-authoritative board composition for a given mode + round.
// Continuous always uses the base board; Multiplier escalates per the table
// (clamped to round 10).
export function compositionFor(mode: PlayMode, round: number): Composition {
  if (mode === "multiplier") {
    return MULTIPLIER_ROUNDS[Math.min(Math.max(round, 1), 10)] ?? BASE_COMPOSITION;
  }
  return BASE_COMPOSITION;
}

// Composition WITH gems folded in: on Multiplier round R, gemsForRound(R) silver
// tiles become gems (so the coin counts shift silver → gem). Used for both the
// server board and the counts shown to the player.
export function compositionWithGems(mode: string | null | undefined, round: number): Composition {
  const base = compositionFor((mode as PlayMode) ?? "continuous", round);
  const gem = gemsForRound(mode as PlayMode, round);
  if (gem <= 0) return { ...base, gem: 0 };
  return { ...base, silver: Math.max(0, base.silver - gem), gem };
}

// Reward granted when a shell of each type is opened.
export const SHELL_REWARD = {
  gold: { gold: 1, silver: 0, bronze: 0 },
  silver: { gold: 0, silver: 1, bronze: 0 },
  bronze: { gold: 0, silver: 0, bronze: 1 },
} as const;

// Starting balance for a brand-new account. 1 silver lets them play a round
// right away; bronze comes from the welcome + day-1 daily reward below.
export const START_SILVER = 1;
export const START_BRONZE = 0;

// One-time welcome bonus granted on first sign-up (bronze), on top of the
// day-1 daily reward (so a new account gets 50 + 20 = 70 bronze).
export const SIGNUP_WELCOME_BRONZE = 50;

// Daily login reward (bronze). Claimable once every 24h; the streak advances
// only if claimed within the next 24h window — miss it and the streak resets.
export const DAILY_CLAIM_INTERVAL_MS = 24 * 60 * 60 * 1000; // can claim once / 24h
export const DAILY_RESET_AFTER_MS = 48 * 60 * 60 * 1000; // > this since last claim ⇒ missed a day

// Reward schedule by streak day:
//   day 1: 20, then +5 for each of the first two follow-up days (25, 30),
//   holding at 30, then a fixed 50 from day 7 onward.
export const DAILY_BASE_REWARD = 20;
export const DAILY_FIXED_DAY = 7;
export const DAILY_FIXED_REWARD = 50;

export function dailyReward(streakDay: number): number {
  if (streakDay >= DAILY_FIXED_DAY) return DAILY_FIXED_REWARD;
  const day = Math.max(1, streakDay);
  return DAILY_BASE_REWARD + 5 * Math.min(day - 1, 2); // 20, 25, 30, 30, 30, 30
}

// Purchase packs — buy silver coins (crypto checkout, verified on-chain).
// Minimum purchase is 10 silver. Base rate is $0.25 / silver.
export type CoinPack = { silver: number; usd: number; label: string; tag?: string };
export const COIN_PACKS: CoinPack[] = [
  { silver: 10, usd: 2, label: "10 Copper", tag: "Save 20%" },
  { silver: 100, usd: 15, label: "100 Silver", tag: "Save 40%" },
  { silver: 1000, usd: 100, label: "1,000 Silver", tag: "Best value" },
];

// Custom purchase: any whole amount of silver from 1 to 100, at the base rate.
export const CUSTOM_SILVER_MIN = 1;
export const CUSTOM_SILVER_MAX = 100;
export const PRICE_PER_SILVER = 0.25; // USD per silver (base rate)
export const customCost = (silver: number) => Number((silver * PRICE_PER_SILVER).toFixed(2));

export type CoinType = "gold" | "silver" | "bronze";
// A board tile is a coin, a gem (Multiplier Play), or an empty slot (no win).
export type BoardSlot = CoinType | "empty" | "gem";

export type Profile = {
  id: string;
  nickname: string;
  email: string;
  nationality: string | null;
  discord_id: string | null;
  avatar_url: string | null;
  gold: number;
  silver: number;
  bronze: number;
  is_admin: boolean;
  streak: number;
  last_bonus_at: string | null;
  created_at: string;
  game_round?: number;
  game_mode?: string | null;
  game_restarts?: number;
  free_rounds?: number; // banked free rounds from "free turn" gems
  last_draw_at?: string | null;
  continue_until?: string | null;
  rewards_claimed?: boolean;
  first_login_done?: boolean;
  payout_address?: string | null; // registered wallet for sell-back payouts
  payout_method?: string | null; // chosen payout crypto/network (PaymentMethod id)
};

// Build a freshly shuffled 50-tile board from a coin composition; any tiles
// not filled by coins become empty ("No" — never a win).
export function buildBoardFrom(comp: Composition): BoardSlot[] {
  const gem = comp.gem ?? 0;
  const filled = comp.gold + comp.silver + comp.bronze + gem;
  const empty = Math.max(0, BOARD_SIZE - filled);
  const counts: Record<BoardSlot, number> = {
    gold: comp.gold,
    silver: comp.silver,
    bronze: comp.bronze,
    gem,
    empty,
  };
  const board: BoardSlot[] = [];
  (Object.keys(counts) as BoardSlot[]).forEach((type) => {
    for (let i = 0; i < counts[type]; i++) board.push(type);
  });
  // Fisher–Yates shuffle.
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  return board;
}

// The default first-round board.
export function buildBoard(): BoardSlot[] {
  return buildBoardFrom(BASE_COMPOSITION);
}
