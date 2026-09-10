// Daily bot-subscriber drip.
//   node --env-file=.env.local scripts/daily-bots.mjs   (or `npm run bots:run`)
//
// Designed to run ONCE PER HOUR (e.g. from the GitHub Actions cron in
// .github/workflows/daily-bots.yml). Each run adds only a SLICE of the day's
// target so new "users" trickle into the database across the full 24h window
// instead of arriving in one burst.
//
// How the target is chosen
//   • The admin can set bot_specific_count in `app_config` for an exact daily
//     target, or use mode/range fallback settings.
//   • The first run of each 24h window (09:00 → 09:00, UTC+9) sets the day's
//     target in `bot_plan(day)`.
//   • Every later run that day tops `added` up toward `target`, paced by how
//     much of the day has elapsed (+ jitter), and finishes any remainder in
//     the final hour. Re-running an hour only adds the shortfall — it's safe.
//
// Each generated user gets:
//   • a unique, Japanese display name (the site is Japan-only);
//   • a Discord avatar URL from the resource library (src/lib/avatars.ts);
//   • random coins: gold 0–10, silver and bronze each 0–999,999;
//   • kind = 'bot', a created_at randomized within the current 24h window.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Avatar resource library — same human-like mix the app's src/lib/avatars.ts
// uses: a share get NO avatar (null), most of the rest get a real-person photo
// from a finite set (so photos overlap), the remainder an illustrated avatar.
const HERE = dirname(fileURLToPath(import.meta.url));
const AVATAR_CFG = JSON.parse(readFileSync(join(HERE, "../src/lib/avatars.json"), "utf8"));
const avatarUrl = (seed) => {
  if (Math.random() < (AVATAR_CFG.noAvatarChance ?? 0)) return null;
  if (Math.random() < (AVATAR_CFG.peopleShare ?? 0)) {
    const p = AVATAR_CFG.people[Math.floor(Math.random() * AVATAR_CFG.people.length)];
    const n = (p.from ?? 0) + Math.floor(Math.random() * p.count);
    return p.url.replace("{n}", String(n));
  }
  const tpl = AVATAR_CFG.illustrated[Math.floor(Math.random() * AVATAR_CFG.illustrated.length)];
  return tpl.replace("{seed}", encodeURIComponent(String(seed || "anon")));
};

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
const SILVER_MAX = 10_000; // players hold at most 10,000 silver
const BRONZE_MAX = 999_999;

// --- tiny helpers -----------------------------------------------------------
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// --- 表示名の生成 ------------------------------------------------------------
// 日本国内向けのサイトなので、ランキングに並ぶ名前も日本語にします。
// 語彙と組み合わせ方は src/lib/bots.ts と同じものを使っています（管理画面の
// 「今すぐ生成」と、この定期実行スクリプトで名前の傾向がずれないように）。
const ADJ = [
  "しずかな", "まっかな", "つきよの", "たいようの", "ゆきの", "かげの", "きんいろ",
  "ほしぞらの", "みならい", "ゆうかんな", "しあわせ", "こがねの", "はやての",
  "そらいろ", "こもれび", "あさひの", "ゆうやけ", "はるかぜ", "なつぞら", "あきかぜ",
];
const NOUN = [
  "きつね", "からす", "おおかみ", "たか", "とら", "かわうそ", "やまねこ", "くま",
  "つる", "こい", "ほたる", "うさぎ", "たぬき", "ふくろう", "いるか", "ぺんぎん",
  "もみじ", "さくら", "かえで", "やなぎ", "こだま", "しずく", "ひかり", "つばめ",
];
const KATAKANA = [
  "ラッキー", "コイン", "ミラクル", "ドリーム", "スター", "サンダー", "レインボー",
  "チャレンジ", "フォーチュン", "マスター", "キング", "クイーン", "ヒーロー", "ルーキー",
];
const SURNAME = [
  "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
  "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "斎藤", "清水",
  "山崎", "阿部", "森", "池田", "橋本", "石川", "前田", "藤田", "後藤", "岡田",
];
const GIVEN = [
  "ゆうき", "はると", "さくら", "ひなた", "あおい", "りく", "みなと", "つむぎ",
  "そうた", "いつき", "めい", "ゆい", "こはる", "れん", "ひろと", "あかり",
  "なぎさ", "かえで", "たくみ", "みお", "しおり", "けんと", "ゆづき", "そら",
];
// 国籍。日本向けサイトなので日本が大半で、ときどき他国が混ざります。
const COUNTRIES = [
  "日本", "日本", "日本", "日本", "日本", "日本", "日本", "日本",
  "アメリカ", "韓国", "台湾", "中国", "イギリス", "ドイツ", "フランス",
  "ブラジル", "カナダ", "オーストラリア", "タイ", "ベトナム",
];

// 名前をひとつ生成します。
function makeName() {
  switch (randInt(1, 6)) {
    case 1:
      return `${pick(ADJ)}${pick(NOUN)}`; // しずかなきつね
    case 2:
      return `${pick(NOUN)}${randInt(2, 99)}`; // きつね42
    case 3:
      return `${pick(SURNAME)}${pick(GIVEN)}`; // 田中ゆうき
    case 4:
      return `${pick(SURNAME)} ${pick(GIVEN)}`; // 田中 ゆうき
    case 5:
      return `${pick(KATAKANA)}${pick(KATAKANA)}`; // ラッキースター
    default:
      return `${pick(KATAKANA)}${randInt(2, 999)}`; // コイン123
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

// ハンドル風の discord_id（約 60% のユーザーが設定している想定）。
// Discord のハンドルは半角英数字なので、表示名が日本語でもここはローマ字です。
const HANDLE_WORDS = [
  "yuki", "haru", "sora", "kaze", "hikari", "tsuki", "hoshi", "mori", "umi",
  "koi", "sakura", "momiji", "kitsune", "usagi", "tanuki", "fukurou", "tsubame",
  "lucky", "coin", "star", "dream", "miracle", "rookie", "master", "fortune",
];
function discordHandle() {
  if (Math.random() > 0.6) return null;
  const base =
    Math.random() < 0.5
      ? `${pick(HANDLE_WORDS)}_${pick(HANDLE_WORDS)}`
      : pick(HANDLE_WORDS);
  return `${base.slice(0, 14)}${randInt(0, 999)}`;
}

// --- config + plan ----------------------------------------------------------
// Default random daily range when the admin hasn't set (or hasn't changed) a
// fixed number: between DEFAULT_MIN and DEFAULT_MAX users per day.
const DEFAULT_MIN = 100;
const DEFAULT_MAX = 200;

async function readConfig() {
  const { data, error } = await admin.from("app_config").select("key, value, updated_at");
  if (error) {
    throw new Error(
      `${error.message}\n   → Run supabase/schema.sql first (it creates the app_config + bot_plan tables).`
    );
  }
  const cfg = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const updated = Object.fromEntries(
    (data ?? []).map((r) => [r.key, r.updated_at ? Date.parse(r.updated_at) : NaN])
  );
  const enabled = true; // Bot worker is always active.
  const mode = cfg.bot_mode === "manual" ? "manual" : "auto";
  let specificCount = parseInt(cfg.bot_specific_count ?? "0", 10);
  if (!Number.isFinite(specificCount) || specificCount < 0) specificCount = 0;
  let count = parseInt(cfg.bot_daily_count ?? "0", 10);
  if (!Number.isFinite(count) || count < 0) count = 0;
  let min = parseInt(cfg.bot_daily_min ?? String(DEFAULT_MIN), 10);
  let max = parseInt(cfg.bot_daily_max ?? String(DEFAULT_MAX), 10);
  if (!Number.isFinite(min) || min < 0) min = DEFAULT_MIN;
  if (!Number.isFinite(max) || max < min) max = Math.max(min, DEFAULT_MAX);
  return {
    enabled, mode, specificCount, count, min, max,
    specificUpdated: updated.bot_specific_count,
    countUpdated: updated.bot_daily_count,
  };
}

// The day's target. Honour the admin's fixed number ONLY if they set or changed
// it during the current 09:00 business day; otherwise (no number, or unchanged
// from a previous day) use a random count in [min, max] (default 100–200).
// Floored so we always generate at least MIN_DAILY users per day.
const MIN_DAILY = 50;
function pickDailyTarget(cfg, dayStart) {
  let adminNum = 0;
  let adminUpdated = NaN;
  if (cfg.specificCount > 0) {
    adminNum = cfg.specificCount;
    adminUpdated = cfg.specificUpdated;
  } else if (cfg.mode === "manual" && cfg.count > 0) {
    adminNum = cfg.count;
    adminUpdated = cfg.countUpdated;
  }
  if (adminNum > 0 && Number.isFinite(adminUpdated) && adminUpdated >= dayStart) {
    return Math.max(MIN_DAILY, adminNum);
  }
  return Math.max(MIN_DAILY, randInt(cfg.min, cfg.max));
}

// Get (or create, once) today's plan row. Handles two runners racing to
// create the same day by re-selecting on a conflict.
async function getPlan(dayKey, cfg, dayStart) {
  const { data: existing } = await admin
    .from("bot_plan")
    .select("*")
    .eq("day", dayKey)
    .maybeSingle();
  if (existing) return existing;

  const target = pickDailyTarget(cfg, dayStart);
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
function toAddThisRun(target, added, now, dayStart) {
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

function getWindow(nowMs) {
  // Business day is 09:00 -> next 09:00 in UTC+9 (KST/JST-style offset).
  const tzOffsetHours = 9;
  const startHourLocal = 9;
  const shifted = new Date(nowMs + tzOffsetHours * 3_600_000);
  const anchor = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), startHourLocal, 0, 0, 0)
  );
  if (shifted.getUTCHours() < startHourLocal) anchor.setUTCDate(anchor.getUTCDate() - 1);
  const dayKey = anchor.toISOString().slice(0, 10);
  const dayStart = anchor.getTime() - tzOffsetHours * 3_600_000;
  return { dayKey, dayStart };
}

// --- create one bot ---------------------------------------------------------
async function createBot(name, now, dayStart) {
  const nationality = pick(COUNTRIES);
  const discord_id = discordHandle();
  const gold = randInt(0, GOLD_MAX);
  const silver = randInt(0, SILVER_MAX);
  const bronze = randInt(0, BRONZE_MAX);
  // Randomize signup time within the active 24h window (09:00 -> 09:00 local).
  const createdAtMs = randInt(dayStart, now);
  const created_at = new Date(createdAtMs).toISOString();

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
      // Seed the avatar with the user's own UUID → guaranteed-unique image URL.
      avatar_url: avatarUrl(data.user.id),
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
  const { dayKey, dayStart } = getWindow(now);

  const cfg = await readConfig();

  const plan = await getPlan(dayKey, cfg, dayStart);
  if (!plan) throw new Error("Could not read or create today's bot_plan row.");

  const want = toAddThisRun(plan.target, plan.added, now, dayStart);
  console.log(
    `📅 ${dayKey}  target=${plan.target}  added=${plan.added}/${plan.target}  → adding ${want} this run`
  );
  if (want === 0) {
    console.log("⏳ On pace — nothing to add this hour.");
    return;
  }

  const taken = await existingNames();
  const names = uniqueNames(want, taken);
  const added = await run(names, 5, (name) => createBot(name, now, dayStart));

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
