// Project introduction copy. The first lines are shown in the login-gate
// modal; the full set renders on /intro.
export const INTRO_PARAGRAPHS: string[] = [
  "Lucky Coin is a free-to-try luck game: a board of 50 tiles is scattered with gold, silver and bronze coins — and a lot of blanks. Pick one tile, crack it open, and whatever it hides is credited straight to your wallet.",
  "Members get more: a welcome bonus, an escalating daily login reward, and a free daily prize-wheel spin. Coins can be converted downward (gold → silver → bronze), and gold can be sold for USDT during the weekly trading window.",
  "You can try a few rounds for free without an account. When you're ready to keep your winnings and unlock the daily rewards, register in seconds — your nickname, email and a password are all it takes.",
  "Everything is server-verified: balances are only ever written by the server, game boards are generated and stored server-side so picks can't be predicted, and purchases are confirmed on-chain before coins are credited.",
  "Play responsibly. The game is designed for fun — rewards are in-game coins, and the odds (including the empty tiles and the prize-wheel teaser segments) are part of the challenge.",
];

// The short teaser shown before the "Read More" button (first 3 lines).
export const INTRO_TEASER = INTRO_PARAGRAPHS.slice(0, 3);
