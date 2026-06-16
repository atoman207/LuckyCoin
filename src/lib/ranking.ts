// Leaderboard ordering — the single source of truth for how players rank.
//
// Rule (highest first):
//   1. more GOLD wins;
//   2. on a gold tie, more SILVER wins;
//   3. on a gold + silver tie, more BRONZE wins.
// Only players equal on all three share a rank.

export type RankCoins = { gold: number; silver: number; bronze: number };

// Comparator for Array.prototype.sort — sorts BEST player first (descending).
export function compareRank(a: RankCoins, b: RankCoins): number {
  if (b.gold !== a.gold) return b.gold - a.gold;
  if (b.silver !== a.silver) return b.silver - a.silver;
  return b.bronze - a.bronze;
}

// True when `a` strictly out-ranks `b` (a should appear above b).
export function outranks(a: RankCoins, b: RankCoins): boolean {
  return compareRank(a, b) < 0;
}

// Competition rank (1-based) of `me` within `all`: 1 + everyone who strictly
// out-ranks me. Players tied on all three coins share the same rank number.
export function rankOf(me: RankCoins, all: RankCoins[]): number {
  let ahead = 0;
  for (const p of all) if (outranks(p, me)) ahead++;
  return ahead + 1;
}
