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

// --- 表示名の生成 ------------------------------------------------------------
// 日本国内向けのサイトなので、ランキングに並ぶ名前も日本語にします。
// 実際の日本人プレイヤーが付けそうな「ひらがな＋名詞」「苗字＋名前」
// 「カタカナのハンドル」などが混ざるよう語彙を用意しています。
const ADJ = [
  "しずかな", "まっかな", "つきよの", "たいようの", "ゆきの", "かげの", "きんいろ",
  "ほしぞらの", "みならい", "ゆうかんな", "しあわせ", "こがねの", "はやての",
  "そらいろ", "こもれび", "あさひの", "ゆうやけ", "はるかぜ", "なつぞら", "あきかぜ",
] as const;
const NOUN = [
  "きつね", "からす", "おおかみ", "たか", "とら", "かわうそ", "やまねこ", "くま",
  "つる", "こい", "ほたる", "うさぎ", "たぬき", "ふくろう", "いるか", "ぺんぎん",
  "もみじ", "さくら", "かえで", "やなぎ", "こだま", "しずく", "ひかり", "つばめ",
] as const;
// カタカナのハンドル用。
const KATAKANA = [
  "ラッキー", "コイン", "ミラクル", "ドリーム", "スター", "サンダー", "レインボー",
  "チャレンジ", "フォーチュン", "マスター", "キング", "クイーン", "ヒーロー", "ルーキー",
] as const;
const SURNAME = [
  "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
  "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "斎藤", "清水",
  "山崎", "阿部", "森", "池田", "橋本", "石川", "前田", "藤田", "後藤", "岡田",
] as const;
const GIVEN = [
  "ゆうき", "はると", "さくら", "ひなた", "あおい", "りく", "みなと", "つむぎ",
  "そうた", "いつき", "めい", "ゆい", "こはる", "れん", "ひろと", "あかり",
  "なぎさ", "かえで", "たくみ", "みお", "しおり", "けんと", "ゆづき", "そら",
] as const;
// 国籍。日本向けサイトなので日本が大半で、ときどき他国が混ざります。
const COUNTRIES = [
  "日本", "日本", "日本", "日本", "日本", "日本", "日本", "日本",
  "アメリカ", "韓国", "台湾", "中国", "イギリス", "ドイツ", "フランス",
  "ブラジル", "カナダ", "オーストラリア", "タイ", "ベトナム",
] as const;

// 名前をひとつ生成します。実在のプレイヤーが付けそうな書き方に寄せて、
// ひらがな複合語・姓名・カタカナ＋数字などを混ぜています。
function makeName(): string {
  switch (randInt(1, 6)) {
    case 1: return `${pick(ADJ)}${pick(NOUN)}`;                  // しずかなきつね
    case 2: return `${pick(NOUN)}${randInt(2, 99)}`;             // きつね42
    case 3: return `${pick(SURNAME)}${pick(GIVEN)}`;             // 田中ゆうき
    case 4: return `${pick(SURNAME)} ${pick(GIVEN)}`;            // 田中 ゆうき
    case 5: return `${pick(KATAKANA)}${pick(KATAKANA)}`;         // ラッキースター
    default: return `${pick(KATAKANA)}${randInt(2, 999)}`;       // コイン123
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

// ハンドル風の discord_id（約 60% のユーザーが設定している想定。実際の
// プレイヤー層でも全員が入力するわけではないため）。
//
// Discord のハンドルは半角英数字なので、表示名が日本語でもここはローマ字です。
// 表示名から機械的に変換すると空文字になってしまうため、専用の語彙から作ります。
const HANDLE_WORDS = [
  "yuki", "haru", "sora", "kaze", "hikari", "tsuki", "hoshi", "mori", "umi",
  "koi", "sakura", "momiji", "kitsune", "usagi", "tanuki", "fukurou", "tsubame",
  "lucky", "coin", "star", "dream", "miracle", "rookie", "master", "fortune",
] as const;

function discordHandle(): string | null {
  if (Math.random() > 0.6) return null;
  const base =
    Math.random() < 0.5
      ? `${pick(HANDLE_WORDS)}_${pick(HANDLE_WORDS)}`
      : pick(HANDLE_WORDS);
  return `${base.slice(0, 14)}${randInt(0, 999)}`;
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
      discord_id: discordHandle(),
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
