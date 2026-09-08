// =====================================================================
//  One-off maintenance: reset the player base and the subscriber chart so
//  everything starts fresh on 2026-09-09.
//
//  Scope (confirmed with the site owner):
//    DELETE  every GENERATED account — email @luckycoin.bot, is_admin false
//    KEEP    real human sign-ups and the administrator account
//    CLEAR   visits, draws, game_rounds, bot_plan
//    KEEP    purchases, sells, contacts (real transaction/enquiry records)
//
//  Run a dry run first (prints what it would do, changes nothing):
//    node --env-file=.env.local scripts/reset-to-sept9.mjs
//  Then, to actually apply it:
//    node --env-file=.env.local scripts/reset-to-sept9.mjs --apply
// =====================================================================

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const BOT_DOMAIN = "@luckycoin.bot";
const CLEAR_TABLES = ["visits", "draws", "game_rounds", "bot_plan"];
const KEEP_TABLES = ["purchases", "sells", "contacts"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Every profile, paged (the table is larger than one PostgREST page).
async function allProfiles() {
  const out = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, nickname, email, kind, is_admin, created_at")
      .order("created_at", { ascending: true })
      .range(offset, offset + page - 1);
    if (error) throw new Error(`read profiles: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

async function countRows(table) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  return error ? `? (${error.message})` : count ?? 0;
}

// Fixed-size worker pool, so 2k+ deletes don't open 2k+ sockets at once.
async function pooled(items, limit, worker) {
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        await worker(items[i]);
        if (++done % 200 === 0) console.log(`   … ${done}/${items.length}`);
      }
    })
  );
}

const main = async () => {
  const profiles = await allProfiles();

  // A generated account is one with the bot mailbox domain. `kind` is NOT used
  // as the test: the column defaulted to 'real' when it was added, so 1,674
  // generated accounts are mislabelled. The email domain is the reliable mark.
  const isGenerated = (p) =>
    typeof p.email === "string" && p.email.toLowerCase().endsWith(BOT_DOMAIN);

  // Belt and braces: an administrator is never deleted, whatever its email.
  const doomed = profiles.filter((p) => isGenerated(p) && !p.is_admin);
  const kept = profiles.filter((p) => !doomed.includes(p));
  const keptAdmins = kept.filter((p) => p.is_admin);

  console.log("=".repeat(64));
  console.log(APPLY ? "APPLYING RESET" : "DRY RUN — nothing will be changed");
  console.log("=".repeat(64));
  console.log(`profiles total          : ${profiles.length}`);
  console.log(`  to DELETE (generated) : ${doomed.length}`);
  console.log(`  to KEEP               : ${kept.length}  (admins: ${keptAdmins.length})`);
  console.log("");
  console.log("Accounts that will be KEPT:");
  for (const p of kept) {
    console.log(
      `  ${p.is_admin ? "[admin]" : "       "} ${String(p.created_at).slice(0, 10)}  ` +
        `${String(p.nickname ?? "").slice(0, 20).padEnd(20)} ${p.email}`
    );
  }
  console.log("");
  console.log("Tables to CLEAR:");
  for (const tbl of CLEAR_TABLES) console.log(`  ${tbl.padEnd(14)} ${await countRows(tbl)} rows`);
  console.log("Tables to KEEP:");
  for (const tbl of KEEP_TABLES) console.log(`  ${tbl.padEnd(14)} ${await countRows(tbl)} rows`);

  // Transaction rows owned by a generated account would vanish with it
  // (ON DELETE CASCADE) — surface that before it happens, not after.
  const doomedIds = new Set(doomed.map((p) => p.id));
  for (const tbl of ["purchases", "sells"]) {
    const { data } = await admin.from(tbl).select("id, user_id");
    const hit = (data ?? []).filter((r) => doomedIds.has(r.user_id)).length;
    if (hit > 0) console.log(`  !! ${hit} ${tbl} row(s) belong to deleted accounts and will cascade away`);
  }

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to perform it.");
    return;
  }

  console.log(`\nDeleting ${doomed.length} generated accounts …`);
  let deleted = 0;
  let failed = 0;
  // Removing the auth user cascades to profiles (FK on delete cascade).
  await pooled(doomed, 10, async (p) => {
    const { error } = await admin.auth.admin.deleteUser(p.id);
    if (error) {
      failed++;
      if (failed <= 5) console.error(`   delete ${p.email}: ${error.message}`);
    } else deleted++;
  });
  console.log(`   deleted ${deleted}, failed ${failed}`);

  console.log("\nClearing history tables …");
  for (const tbl of CLEAR_TABLES) {
    // `neq` on the primary key matches every row (no unfiltered-delete guard).
    const key = tbl === "bot_plan" ? "day" : "id";
    const sentinel = tbl === "bot_plan" ? "1900-01-01" : "00000000-0000-0000-0000-000000000000";
    const { error } = await admin.from(tbl).delete().neq(key, sentinel);
    console.log(`   ${tbl.padEnd(14)} ${error ? `FAILED: ${error.message}` : "cleared"} -> ${await countRows(tbl)} rows`);
  }

  console.log("\nFinal state:");
  console.log(`   profiles : ${await countRows("profiles")}`);
  for (const tbl of [...CLEAR_TABLES, ...KEEP_TABLES]) {
    console.log(`   ${tbl.padEnd(13)}: ${await countRows(tbl)}`);
  }
  console.log("\nDone. The subscriber chart now starts from 2026-09-09.");
};

main().catch((e) => {
  console.error("\n[error]", e.message);
  process.exit(1);
});
