// Daily bot-subscriber drip.
//   node --env-file=.env.local scripts/daily-bots.mjs   (or `npm run bots:run`)
//
// Designed to run ONCE PER HOUR (e.g. from the GitHub Actions cron in
// .github/workflows/daily-bots.yml). Each run adds only a SLICE of the day's
// target so new "users" trickle into the database across the full 24h window
// instead of arriving in one burst.
//
// How the target is chosen
//   • The admin sets bot_enabled / bot_daily_min / bot_daily_max in the
//     `app_config` table (editable from the admin dashboard → Bots tab).
//   • The first run of each UTC day rolls a random target in
//     [min, max] (default 100–500) and stores it in `bot_plan(day)`.
//   • Every later run that day tops `added` up toward `target`, paced by how
//     much of the day has elapsed (+ jitter), and finishes any remainder in
//     the final hour. Re-running an hour only adds the shortfall — it's safe.
//
// Each generated user gets:
//   • a unique, human-meaningful Discord-style display name;
//   • a Discord avatar URL from the resource library (src/lib/avatars.ts);
//   • random coins: gold 0–10, silver and bronze each 0–999,999;
//   • kind = 'bot', a backdated created_at within the current hour.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Avatar resource library — same config the app's src/lib/avatars.ts imports.
// DiceBear generates a unique, deterministic avatar per seed (the display name).
const HERE = dirname(fileURLToPath(import.meta.url));
const AVATAR_CFG = JSON.parse(readFileSync(join(HERE, "../src/lib/avatars.json"), "utf8"));
const avatarUrl = (seed) => `${AVATAR_CFG.baseUrl}?seed=${encodeURIComponent(seed || "anon")}`;

// --- env --------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing env. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "(locally: `node --env-file=.env.local scripts/daily-bots.mjs`)."
  );
  process.exit(1);
}
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "LuckyBot#2026"; // shared password (these are non-real accounts)

// --- coin caps (must mirror the spec) --------------------------------------
const GOLD_MAX = 10; // inclusive
const SILVER_MAX = 999_999; // strictly fewer than 1,000,000
const BRONZE_MAX = 999_999;

// --- tiny helpers -----------------------------------------------------------
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// --- name generation --------------------------------------------------------
// Word banks chosen so combinations read like real Discord display names.
const ADJ = [
  "Silent", "Crimson", "Lunar", "Solar", "Velvet", "Frost", "Shadow", "Golden",
  "Ember", "Cosmic", "Mystic", "Royal", "Swift", "Wild", "Hidden", "Brave",
  "Quiet", "Neon", "Iron", "Jade", "Amber", "Onyx", "Stormy", "Misty",
  "Radiant", "Feral", "Noble", "Dusty", "Electric", "Frozen", "Scarlet", "Wandering",
];
const NOUN = [
  "Fox", "Raven", "Wolf", "Falcon", "Tiger", "Otter", "Hawk", "Lynx", "Bear",
  "Viper", "Crane", "Heron", "Koi", "Moth", "Comet", "Ember", "Willow", "Cedar",
  "River", "Ridge", "Drift", "Echo", "Sage", "Frost", "Storm", "Ash", "Maple",
  "Phoenix", "Sparrow", "Panther", "Dragon", "Gecko",
];
const FIRST = [
  "Liam", "Mara", "Noah", "Yuki", "Sara", "Kai", "Aria", "Leo", "Mia", "Theo",
  "Ivan", "Lena", "Omar", "Nina", "Ravi", "Elsa", "Hugo", "Zoe", "Finn", "Ada",
  "Ezra", "Luca", "Maya", "Niko", "Tara", "Dmitri", "Hana", "Sven", "Priya", "Diego",
  "Anya", "Mateo", "Freya", "Rohan", "Lara", "Bjorn", "Amara", "Cyrus", "Iris", "Otto",
];
const LAST = [
  "Carter", "Quinn", "Voss", "Tanaka", "Hale", "Brooks", "Nash", "Reyes", "Park",
  "Lowe", "Frost", "Vance", "Cole", "Mori", "Adler", "Bennett", "Cruz", "Dane",
  "Flynn", "Grey", "Holt", "Kane", "Mercer", "Novak", "Pace", "Rhodes", "Sable",
  "Thorne", "Vega", "Ward", "Yates", "Zane",
];
const COUNTRIES = [
  "USA", "Japan", "Germany", "Brazil", "India", "Canada", "France", "Korea",
  "Spain", "Italy", "Mexico", "Australia", "Nigeria", "Turkey", "Sweden",
  "Poland", "Vietnam", "Egypt", "Chile", "Thailand", "Argentina", "Netherlands",
];

// One fresh, plausible display name. Styles are weighted toward what real
// Discord users pick: PascalCase combos, lowercase handles, and real names.
function makeName() {
  switch (randInt(1, 6)) {
    case 1:
      return `${pick(ADJ)}${pick(NOUN)}`; // SilentFalcon
    case 2:
      return `${pick(ADJ).toLowerCase()}.${pick(NOUN).toLowerCase()}`; // silent.falcon
    case 3:
      return `${pick(ADJ).toLowerCase()}_${pick(NOUN).toLowerCase()}`; // silent_falcon
    case 4:
      return `${pick(FIRST)} ${pick(LAST)}`; // Mara Quinn
    case 5:
      return `${pick(FIRST).toLowerCase()}${pick(LAST).toLowerCase()}`; // maraquinn
    default:
      return `${pick(NOUN)}${randInt(2, 99)}`; // Falcon42
  }
}

// Build `count` names guaranteed unique against `taken` (a lowercased Set of
// names already in the database + already minted this run).
function uniqueNames(count, taken) {
  const out = [];
  while (out.length < count) {
    let name = makeName();
    let guard = 0;
    while (taken.has(name.toLowerCase())) {
      // Vary it until free: nudge with a suffix, then fall back to a number.
      name = guard < 6 ? `${makeName()}` : `${name}${randInt(0, 9)}`;
      if (++guard > 40) {
        name = `${pick(ADJ)}${pick(NOUN)}${randInt(100, 9999)}`;
        if (taken.has(name.toLowerCase())) continue;
        break;
      }
    }
    taken.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

// A handle-style discord_id derived from the display name (for ~60% of users).
function discordHandle(name) {
  if (Math.random() > 0.6) return null;
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "user";
  return `${base}${randInt(0, 999)}`;
}

// --- config + plan ----------------------------------------------------------
async function readConfig() {
  const { data, error } = await admin.from("app_config").select("key, value");
  if (error) {
    throw new Error(
      `${error.message}\n   → Run supabase/schema.sql first (it creates the app_config + bot_plan tables).`
    );
  }
  const cfg = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const enabled = (cfg.bot_enabled ?? "true") !== "false";
  let min = parseInt(cfg.bot_daily_min ?? "100", 10);
  let max = parseInt(cfg.bot_daily_max ?? "500", 10);
  if (!Number.isFinite(min) || min < 0) min = 100;
  if (!Number.isFinite(max) || max < min) max = Math.max(min, 500);
  return { enabled, min, max };
}

// Get (or create, once) today's plan row. Handles two runners racing to
// create the same day by re-selecting on a conflict.
async function getPlan(dayKey, min, max) {
  const { data: existing } = await admin
    .from("bot_plan")
    .select("*")
    .eq("day", dayKey)
    .maybeSingle();
  if (existing) return existing;

  const target = randInt(min, max);
  const { data: inserted, error } = await admin
    .from("bot_plan")
    .insert({ day: dayKey, target, added: 0 })
    .select()
    .single();
  if (!error && inserted) return inserted;

  // Another run inserted it first — read theirs.
  const { data: again } = await admin.from("bot_plan").select("*").eq("day", dayKey).single();
  return again;
}

// Every nickname already in the database (paged), lowercased, for uniqueness.
async function existingNames() {
  const taken = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("profiles")
      .select("nickname")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) if (r.nickname) taken.add(r.nickname.toLowerCase());
    if (!data || data.length < PAGE) break;
  }
  return taken;
}

// --- pacing -----------------------------------------------------------------
// How many to add on THIS hourly run, given today's progress.
function toAddThisRun(target, added, now) {
  const dayStart = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate()
  );
  const elapsed = clamp((now - dayStart) / 86_400_000, 0, 1); // fraction of day done
  const remaining = Math.max(0, target - added);
  if (remaining === 0) return 0;

  // In the final hour, finish whatever is left so the day always hits target.
  if (elapsed >= 0.95) return remaining;

  const onPace = Math.round(target * elapsed); // how many we'd "expect" by now
  const shortfall = onPace - added;
  const jitter = 0.6 + Math.random() * 0.8; // 0.6–1.4× so runs aren't uniform
  return clamp(Math.round(shortfall * jitter), 0, remaining);
}

// --- create one bot ---------------------------------------------------------
async function createBot(name, now) {
  const nationality = pick(COUNTRIES);
  const discord_id = discordHandle(name);
  const avatar_url = avatarUrl(name);
  const gold = randInt(0, GOLD_MAX);
  const silver = randInt(0, SILVER_MAX);
  const bronze = randInt(0, BRONZE_MAX);
  // Backdate within the current hour so sign-ups look spread out, not identical.
  const created_at = new Date(now - randInt(0, 55 * 60 * 1000)).toISOString();

  // Retry a couple of times on the rare email/name collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const email = `bot.${randomUUID().slice(0, 8)}@luckycoin.bot`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { nickname: name },
    });
    if (error || !data.user) {
      if (attempt === 2) throw new Error(`create auth user: ${error?.message ?? "unknown"}`);
      continue;
    }
    const { error: pErr } = await admin.from("profiles").insert({
      id: data.user.id,
      nickname: name,
      email,
      nationality,
      discord_id,
      avatar_url,
      gold,
      silver,
      bronze,
      is_admin: false,
      kind: "bot",
      created_at,
    });
    if (pErr) {
      await admin.auth.admin.deleteUser(data.user.id); // don't orphan the auth row
      if (attempt === 2) throw new Error(`insert profile: ${pErr.message}`);
      continue;
    }
    return; // success
  }
}

// Limited-concurrency runner (mirrors seed-bots.mjs).
async function run(items, limit, fn) {
  let i = 0;
  let ok = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        await fn(items[idx]);
        ok++;
      } catch (e) {
        console.warn(`  · skip "${items[idx]}": ${e.message ?? e}`);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return ok;
}

// --- main -------------------------------------------------------------------
async function main() {
  const now = Date.now();
  const dayKey = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  const { enabled, min, max } = await readConfig();
  if (!enabled) {
    console.log("🔕 Bot drip is disabled (app_config.bot_enabled = false). Nothing to do.");
    return;
  }

  const plan = await getPlan(dayKey, min, max);
  if (!plan) throw new Error("Could not read or create today's bot_plan row.");

  const want = toAddThisRun(plan.target, plan.added, now);
  console.log(
    `📅 ${dayKey}  target=${plan.target}  added=${plan.added}/${plan.target}  → adding ${want} this run`
  );
  if (want === 0) {
    console.log("⏳ On pace — nothing to add this hour.");
    return;
  }

  const taken = await existingNames();
  const names = uniqueNames(want, taken);
  const added = await run(names, 5, (name) => createBot(name, now));

  const { error: upErr } = await admin
    .from("bot_plan")
    .update({ added: plan.added + added, updated_at: new Date(now).toISOString() })
    .eq("day", dayKey);
  if (upErr) console.warn(`  · could not update bot_plan.added: ${upErr.message}`);

  const total = plan.added + added;
  console.log(
    `\n✅ Added ${added} new player${added === 1 ? "" : "s"}. ` +
      `Today: ${total}/${plan.target} (${Math.round((total / plan.target) * 100)}%).`
  );
}

main().catch((e) => {
  console.error("\n❌ daily-bots failed:", e.message ?? e);
  process.exit(1);
});
