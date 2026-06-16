// Project introduction copy. The first lines are shown in the login-gate
// modal; the full set renders on /intro.
export const INTRO_PARAGRAPHS: string[] = [
  "Lucky Coin is a free-to-try luck game for anyone who likes starting the day with a tiny ceremony and a suspicious amount of optimism. A 50-tile board hides gold, silver, bronze, jewels from round 2 onward, and enough blanks to keep your ego nicely supervised.",
  "Pick one tile, crack it open, and whatever is inside is credited to your in-game wallet. Gold is the headline act, silver keeps the game moving, bronze is the everyday workhorse, and jewels can drop bonus turns or extra coins when fortune decides to wear its fancy shoes.",
  "Members get the better ritual: a welcome bonus, a day-1 reward, an escalating daily login reward, and a free daily prize-wheel spin. Coins can be converted downward (gold -> silver -> bronze), and gold can be sold for USDT during the weekly trading window.",
  "You can try a few rounds free before registering, because even luck should offer a sample spoon. When you are ready to keep your winnings and unlock daily rewards, sign up with a nickname, email, and password. No ancient prophecy required.",
  "The game is server-verified: boards are generated and stored server-side, balances are written only by the server, and purchases are confirmed on-chain before coins are credited. In short, the mystery is in the tile, not in the accounting.",
  "Play responsibly. Lucky Coin is designed for fun, daily suspense, and the occasional dramatic stare at a blank tile. Rewards are in-game coins, and the odds are part of the challenge.",
];

// The short teaser shown before the "Read More" button (first 3 lines).
export const INTRO_TEASER = INTRO_PARAGRAPHS.slice(0, 3);
