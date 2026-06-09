// Central place for the game's economy. Tune everything here.

// Value of each coin expressed in the base unit (bronze).
export const COIN_VALUE = {
  gold: 500,
  silver: 10,
  bronze: 1,
} as const;

// Cost to start one round (in silver coins).
export const ROUND_COST_SILVER = 1;

// The 50-coin board. Must sum to BOARD_SIZE.
export const BOARD_SIZE = 50;
export const BOARD_COMPOSITION = {
  gold: 1,
  silver: 5,
  bronze: 44,
} as const;

// Reward granted when a shell of each type is opened.
export const SHELL_REWARD = {
  gold: { gold: 1, silver: 0, bronze: 0 },
  silver: { gold: 0, silver: 1, bronze: 0 },
  bronze: { gold: 0, silver: 0, bronze: 1 },
} as const;

// Starting balance for a brand-new account (after the signup reward).
export const START_SILVER = 1;
export const START_BRONZE = 10;
export const SIGNUP_REWARD_BRONZE = 50;

// Daily bonus.
export const DAILY_BONUS_BRONZE = 5;
export const STREAK_LENGTH = 7;
export const STREAK_BONUS_BRONZE = 20;

// Purchase packs — buy silver coins (simulated crypto checkout).
export type CoinPack = { silver: number; usd: number; label: string; tag?: string };
export const COIN_PACKS: CoinPack[] = [
  { silver: 1, usd: 0.5, label: "1 Silver" },
  { silver: 10, usd: 4, label: "10 Silver", tag: "Save 20%" },
  { silver: 100, usd: 30, label: "100 Silver", tag: "Save 40%" },
  { silver: 1000, usd: 200, label: "1,000 Silver", tag: "Best value" },
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

// Build a freshly shuffled board of 50 shells.
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
