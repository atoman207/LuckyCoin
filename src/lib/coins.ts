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
export const WHEEL_SPIN_MS = 10_000; // wheel spins for 10 seconds
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

// ---- Exchange direction ------------------------------------------------
// One-way only: gold → silver, silver → bronze. Never the reverse.
export const EXCHANGE_NEXT: Partial<Record<CoinType, CoinType>> = {
  gold: "silver",
  silver: "bronze",
};

// The board: 50 tiles — 1 gold, 4 silver, 20 bronze ("copper") and the rest
// empty (no win). Counts must sum to BOARD_SIZE.
export const BOARD_COMPOSITION = {
  gold: 1,
  silver: 4,
  bronze: 20,
  empty: 25,
} as const;
export const BOARD_SIZE =
  BOARD_COMPOSITION.gold +
  BOARD_COMPOSITION.silver +
  BOARD_COMPOSITION.bronze +
  BOARD_COMPOSITION.empty; // 50

// ---- Restart modes & escalating rounds --------------------------------
export type PlayMode = "continuous" | "multiplier";
export const MAX_RESTARTS = 10;

export type Composition = { gold: number; silver: number; bronze: number };
export const BASE_COMPOSITION: Composition = { gold: 1, silver: 4, bronze: 20 };

// Multiplier Play: the board gets richer each round (the rest of the 50 tiles
// stay empty). Round 1 is the base; rounds 2–10 follow the spec.
export const MULTIPLIER_ROUNDS: Record<number, Composition> = {
  1: { gold: 1, silver: 4, bronze: 20 },
  2: { gold: 1, silver: 4, bronze: 25 },
  3: { gold: 1, silver: 9, bronze: 25 },
  4: { gold: 2, silver: 8, bronze: 40 },
  5: { gold: 2, silver: 18, bronze: 30 },
  6: { gold: 3, silver: 7, bronze: 40 },
  7: { gold: 3, silver: 17, bronze: 30 },
  8: { gold: 4, silver: 16, bronze: 30 },
  9: { gold: 4, silver: 36, bronze: 10 },
  10: { gold: 5, silver: 45, bronze: 0 },
};

// Server-authoritative board composition for a given mode + round.
// Continuous always uses the base board; Multiplier escalates per the table
// (clamped to round 10).
export function compositionFor(mode: PlayMode, round: number): Composition {
  if (mode === "multiplier") {
    return MULTIPLIER_ROUNDS[Math.min(Math.max(round, 1), 10)] ?? BASE_COMPOSITION;
  }
  return BASE_COMPOSITION;
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
  { silver: 10, usd: 2, label: "10 Silver", tag: "Save 20%" },
  { silver: 100, usd: 15, label: "100 Silver", tag: "Save 40%" },
  { silver: 1000, usd: 100, label: "1,000 Silver", tag: "Best value" },
];

export type CoinType = "gold" | "silver" | "bronze";
// A board tile is a coin or an empty slot (no win).
export type BoardSlot = CoinType | "empty";

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
  last_draw_at?: string | null;
};

// Build a freshly shuffled 50-tile board from a coin composition; any tiles
// not filled by coins become empty ("No" — never a win).
export function buildBoardFrom(comp: Composition): BoardSlot[] {
  const coins = comp.gold + comp.silver + comp.bronze;
  const empty = Math.max(0, BOARD_SIZE - coins);
  const counts: Record<BoardSlot, number> = {
    gold: comp.gold,
    silver: comp.silver,
    bronze: comp.bronze,
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
