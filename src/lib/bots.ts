// =====================================================================
//  Bot-player generation. SERVER ONLY (needs the service-role client).
//
//  This is the Next.js port of the old scripts/daily-bot/daily_bots.py.
//  The Python version ran as an always-on loop that dripped users in every
//  ~10 minutes. This one is on-demand instead: the administrator picks a
//  number (or a range) on the Bots tab and presses Generate, once a day.
//
//  Each generated player gets a plausible Discord-style display name, a
//  human-looking avatar (see lib/avatars.ts), a nationality, random coin
//  balances and kind='bot' so it stays distinguishable from a real sign-up
//  in the admin dashboard.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { avatarUrl } from "@/lib/avatars";

// Shared password — these are non-real accounts that nobody signs into.
const PASSWORD = "LuckyBot#2026";
// Bot mailboxes all share this domain, which is what makes them findable.
export const BOT_EMAIL_DOMAIN = "luckycoin.bot";

// Coin caps (mirror the game spec).
const GOLD_MAX = 10;
const SILVER_MAX = 10_000;
const BRONZE_MAX = 999_999;

// How many accounts one Generate press may create. Keeps a single request
// inside the serverless time budget; the admin can press again to add more.
export const MAX_PER_RUN = 500;
// Auth users are created in parallel, then their profiles go in as one bulk
// insert per chunk. Chunking also means a timeout still leaves an accurate
// count recorded rather than losing the whole run.
const CHUNK = 50;
const CONCURRENCY = 8;

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

// --- name generation --------------------------------------------------------
// Word banks chosen so combinations read like real Discord display names.
const ADJ = [
  "Silent", "Crimson", "Lunar", "Solar", "Velvet", "Frost", "Shadow", "Golden",
  "Ember", "Cosmic", "Mystic", "Royal", "Swift", "Wild", "Hidden", "Brave",
  "Quiet", "Neon", "Iron", "Jade", "Amber", "Onyx", "Stormy", "Misty",
  "Radiant", "Feral", "Noble", "Dusty", "Electric", "Frozen", "Scarlet", "Wandering",
] as const;
const NOUN = [
  "Fox", "Raven", "Wolf", "Falcon", "Tiger", "Otter", "Hawk", "Lynx", "Bear",
  "Viper", "Crane", "Heron", "Koi", "Moth", "Comet", "Ember", "Willow", "Cedar",
  "River", "Ridge", "Drift", "Echo", "Sage", "Frost", "Storm", "Ash", "Maple",
  "Phoenix", "Sparrow", "Panther", "Dragon", "Gecko",
] as const;
const FIRST = [
  "Liam", "Mara", "Noah", "Yuki", "Sara", "Kai", "Aria", "Leo", "Mia", "Theo",
  "Ivan", "Lena", "Omar", "Nina", "Ravi", "Elsa", "Hugo", "Zoe", "Finn", "Ada",
  "Ezra", "Luca", "Maya", "Niko", "Tara", "Dmitri", "Hana", "Sven", "Priya", "Diego",
  "Anya", "Mateo", "Freya", "Rohan", "Lara", "Bjorn", "Amara", "Cyrus", "Iris", "Otto",
] as const;
const LAST = [
  "Carter", "Quinn", "Voss", "Tanaka", "Hale", "Brooks", "Nash", "Reyes", "Park",
  "Lowe", "Frost", "Vance", "Cole", "Mori", "Adler", "Bennett", "Cruz", "Dane",
  "Flynn", "Grey", "Holt", "Kane", "Mercer", "Novak", "Pace", "Rhodes", "Sable",
  "Thorne", "Vega", "Ward", "Yates", "Zane",
] as const;
const COUNTRIES = [
  "USA", "Japan", "Germany", "Brazil", "India", "Canada", "France", "Korea",
  "Spain", "Italy", "Mexico", "Australia", "Nigeria", "Turkey", "Sweden",
  "Poland", "Vietnam", "Egypt", "Chile", "Thailand", "Argentina", "Netherlands",
] as const;

// One fresh, plausible display name. Styles are weighted toward what real
// Discord users pick: PascalCase combos, lowercase handles, and real names.
function makeName(): string {
  switch (randInt(1, 6)) {
    case 1: return `${pick(ADJ)}${pick(NOUN)}`;                               // SilentFalcon
    case 2: return `${pick(ADJ).toLowerCase()}.${pick(NOUN).toLowerCase()}`;  // silent.falcon
    case 3: return `${pick(ADJ).toLowerCase()}_${pick(NOUN).toLowerCase()}`;  // silent_falcon
    case 4: return `${pick(FIRST)} ${pick(LAST)}`;                            // Mara Quinn
    case 5: return `${pick(FIRST).toLowerCase()}${pick(LAST).toLowerCase()}`; // maraquinn
    default: return `${pick(NOUN)}${randInt(2, 99)}`;                         // Falcon42
  }
}

// Build `count` names guaranteed unique against `taken` (a lowercased set of
// names already in the database plus the ones already minted this run).
function uniqueNames(count: number, taken: Set<string>): string[] {
  const out: string[] = [];
  while (out.length < count) {
    let name = makeName();
    let guard = 0;
    while (taken.has(name.toLowerCase())) {
      name = guard < 6 ? makeName() : `${name}${randInt(0, 9)}`;
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

// A handle-style discord_id derived from the display name (about 60% of users
// have one, like a real player base where not everyone fills the field in).
function discordHandle(name: string): string | null {
  if (Math.random() > 0.6) return null;
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "user";
  return `${base}${randInt(0, 999)}`;
}

// Every nickname already in use, so generated names never collide.
async function existingNames(admin: SupabaseClient): Promise<Set<string>> {
  const taken = new Set<string>();
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await admin
      .from("profiles")
      .select("nickname")
      .order("nickname")
      .range(offset, offset + page - 1);
    if (error) break;
    for (const r of data ?? []) if (r.nickname) taken.add(String(r.nickname).toLowerCase());
    if (!data || data.length < page) break;
  }
  return taken;
}

// Runs `worker` over `items` with a fixed number of parallel slots.
async function pooled<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i]);
      }
    })
  );
  return results;
}

export type GenerateResult = { created: number; failed: number };

/**
 * Creates `count` bot players.
 *
 * Auth users are created in parallel and their profiles land as one bulk
 * insert per chunk. `onProgress` is awaited after each chunk so the caller can
 * persist progress — a request that runs out of time still leaves a truthful
 * count behind.
 */
export async function generateBots(
  admin: SupabaseClient,
  count: number,
  onProgress?: (createdSoFar: number) => Promise<void>
): Promise<GenerateResult> {
  const wanted = Math.max(0, Math.min(MAX_PER_RUN, Math.floor(count)));
  if (wanted === 0) return { created: 0, failed: 0 };

  const taken = await existingNames(admin);
  const names = uniqueNames(wanted, taken);

  // Spread the join times across today so far, so the roster reads as people
  // who arrived through the day rather than all in the same second.
  const now = Date.now();
  const dayStart = new Date(now).setUTCHours(0, 0, 0, 0);
  const span = Math.max(1, now - dayStart);

  let created = 0;
  let failed = 0;

  for (let i = 0; i < names.length; i += CHUNK) {
    const slice = names.slice(i, i + CHUNK);

    // 1. Auth users, in parallel. A failure here just drops that one name.
    const made = await pooled(slice, CONCURRENCY, async (name) => {
      const email = `bot.${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}@${BOT_EMAIL_DOMAIN}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { nickname: name },
      });
      if (error || !data.user) {
        console.error("[bots] createUser failed:", error?.message);
        return null;
      }
      return { id: data.user.id, name, email };
    });

    const ok = made.filter((m): m is NonNullable<typeof m> => m !== null);
    failed += slice.length - ok.length;
    if (ok.length === 0) continue;

    // 2. All their profiles in ONE insert — far cheaper than row-by-row.
    const rows = ok.map((u) => ({
      id: u.id,
      nickname: u.name,
      email: u.email,
      nationality: pick(COUNTRIES),
      discord_id: discordHandle(u.name),
      avatar_url: avatarUrl(u.id),
      gold: randInt(0, GOLD_MAX),
      silver: randInt(0, SILVER_MAX),
      bronze: randInt(0, BRONZE_MAX),
      is_admin: false,
      kind: "bot",
      rewards_claimed: true,
      first_login_done: true,
      created_at: new Date(dayStart + randInt(0, span)).toISOString(),
    }));

    const { error: insertErr } = await admin.from("profiles").insert(rows);
    if (insertErr) {
      // Roll the auth users back so no account is left without a profile.
      console.error("[bots] bulk profile insert failed:", insertErr.message);
      await pooled(ok, CONCURRENCY, async (u) => {
        await admin.auth.admin.deleteUser(u.id).catch(() => {});
      });
      failed += ok.length;
      continue;
    }

    created += ok.length;
    if (onProgress) await onProgress(created);
  }

  return { created, failed };
}
