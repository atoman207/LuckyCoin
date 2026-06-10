// Idempotent bot-subscriber seeder.
//   npm run seed:bots
//
// Creates 246 "bot" subscribers spread across the launch window
// (June 1–10, 2026) so the landing-page chart and admin user list have real,
// database-backed data. Daily new-subscriber counts:
//   Jun 1: 13, Jun 2: 25, then varying up to 246 total by Jun 10.
//
// Every bot shares the SAME password and a deterministic email, so re-running
// is safe (existing bots are reused, not duplicated). All other fields are
// randomly but deterministically generated (seeded by index).

import { createClient } from "@supabase/supabase-js";

// --- config ----------------------------------------------------------------
const LAUNCH = Date.UTC(2026, 5, 1); // June 1, 2026 (month is 0-based)
const DAILY = [13, 25, 18, 22, 27, 24, 30, 26, 32, 29]; // sums to 246, Jun 1–10
const TOTAL = DAILY.reduce((a, b) => a + b, 0); // 246
const PASSWORD = "LuckyBot#2026"; // same for every bot (loginable for testing)
const emailFor = (i) => `bot${String(i).padStart(4, "0")}@luckycoin.bot`;

const FIRST = ["Lucky", "Golden", "Swift", "Crimson", "Silver", "Cosmic", "Mighty", "Royal", "Shadow", "Neon", "Turbo", "Frosty", "Solar", "Lunar", "Vivid", "Jade", "Amber", "Ruby", "Onyx", "Pixel"];
const LAST = ["Coin", "Fox", "Tiger", "Falcon", "Wolf", "Panda", "Dragon", "Otter", "Hawk", "Lynx", "Raven", "Bear", "Koi", "Viper", "Moth", "Crane", "Bison", "Gecko", "Heron", "Mole"];
const COUNTRIES = ["USA", "Japan", "Germany", "Brazil", "India", "Canada", "France", "Korea", "Spain", "Italy", "Mexico", "Australia", "Nigeria", "Turkey", "Sweden", "Poland", "Vietnam", "Egypt", "Chile", "Thailand"];

// Deterministic PRNG so re-runs produce stable data.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

// Build the chronological list of 246 bots with backdated created_at.
function buildBots() {
  const bots = [];
  let n = 0;
  for (let day = 0; day < DAILY.length; day++) {
    const count = DAILY[day];
    const dayStart = LAUNCH + day * 86_400_000;
    for (let k = 0; k < count; k++) {
      n += 1;
      const rnd = mulberry32(n * 2654435761);
      // Spread sign-ups through the day in order.
      const created = new Date(dayStart + ((k + 0.5) / count) * 86_400_000);
      bots.push({
        index: n,
        email: emailFor(n),
        nickname: `${pick(rnd, FIRST)}${pick(rnd, LAST)}${Math.floor(rnd() * 900 + 100)}`,
        nationality: pick(rnd, COUNTRIES),
        discord_id: rnd() < 0.6 ? `${pick(rnd, FIRST).toLowerCase()}_${Math.floor(rnd() * 9000 + 1000)}` : null,
        gold: Math.floor(rnd() * 3),
        silver: Math.floor(rnd() * 40),
        bronze: Math.floor(rnd() * 600),
        created_at: created.toISOString(),
      });
    }
  }
  return bots;
}

// --- setup -----------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing env. Run with:  node --env-file=.env.local scripts/seed-bots.mjs  (or `npm run seed:bots`).");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// Map every existing auth email -> id (so re-runs reuse accounts).
async function authEmailMap() {
  const map = new Map();
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 200) break;
  }
  return map;
}

async function seedOne(bot, emailMap) {
  let id = emailMap.get(bot.email);
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({
      email: bot.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { nickname: bot.nickname },
    });
    if (error || !data.user) throw new Error(`create ${bot.email}: ${error?.message ?? "unknown"}`);
    id = data.user.id;
  }
  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id,
      nickname: bot.nickname,
      email: bot.email,
      nationality: bot.nationality,
      discord_id: bot.discord_id,
      gold: bot.gold,
      silver: bot.silver,
      bronze: bot.bronze,
      is_admin: false,
      kind: "bot",
      created_at: bot.created_at,
    },
    { onConflict: "id" }
  );
  if (pErr) throw new Error(`profile ${bot.email}: ${pErr.message}`);
}

// Limited-concurrency runner.
async function run(items, limit, fn) {
  let i = 0;
  let done = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
      done++;
      if (done % 25 === 0 || done === items.length) console.log(`  · ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

async function main() {
  console.log(`Seeding ${TOTAL} bot subscribers (Jun 1–10, 2026)…`);

  // Preflight: make sure the `kind` column exists before creating any accounts,
  // so a missing migration can't leave orphaned auth users behind.
  const { error: preErr } = await admin.from("profiles").select("kind").limit(1);
  if (preErr) {
    throw new Error(
      `${preErr.message}\n   → Run supabase/schema.sql in the Supabase SQL Editor first (it adds the \`kind\` column), then re-run this seed.`
    );
  }

  const bots = buildBots();
  const emailMap = await authEmailMap();
  await run(bots, 5, (bot) => seedOne(bot, emailMap));
  console.log(`\n✅ Done. ${TOTAL} bots present. All share password: ${PASSWORD}`);
  console.log("   Emails: bot0001@luckycoin.bot … bot0246@luckycoin.bot");
}

main().catch((e) => {
  console.error("\n❌ Bot seed failed:", e.message ?? e);
  if (/schema cache|does not exist|relation|column/i.test(e.message ?? "")) {
    console.error("   → Run supabase/schema.sql in the Supabase SQL Editor first (it adds the `kind` column).");
  }
  process.exit(1);
});
