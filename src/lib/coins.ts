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

// The board. Counts must sum to BOARD_SIZE. (Bronze = "copper".)
export const BOARD_COMPOSITION = {
  gold: 1,
  silver: 4,
  bronze: 20,
} as const;
export const BOARD_SIZE =
  BOARD_COMPOSITION.gold + BOARD_COMPOSITION.silver + BOARD_COMPOSITION.bronze; // 25

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
};

// Build a freshly shuffled board (counts come from BOARD_COMPOSITION).
export function buildBoard(): CoinType[] {
  const board: CoinType[] = [];
  (Object.keys(BOARD_COMPOSITION) as CoinType[]).forEach((type) => {
    for (let i = 0; i < BOARD_COMPOSITION[type]; i++) board.push(type);
  });
  // Fisher–Yates shuffle.
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  return board;
}
