// Idempotent admin seeder.
// Run after applying supabase/schema.sql:
//   npm run seed
//
// It guarantees the LuckyCoin administrator account always exists, always has
// the correct password (so login works), and always has is_admin = true.
// Re-running it never wipes the admin's coin balance.

import { createClient } from "@supabase/supabase-js";

const ADMIN = {
  nickname: "LuckyCoin",
  email: "kindman207@gmail.com",
  password: "LuckyCoin!@#",
  nationality: "Japan",
  discord_id: "kkashi207",
};

// The administrator is the house/test account, so its balance is always
// (re)stocked to these amounts on every seed run.
const SEED_BALANCE = { gold: 100, silver: 1000, bronze: 100000 };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Run with:  node --env-file=.env.local scripts/seed-admin.mjs  (or `npm run seed`)."
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  // listUsers paginates (50 per page). Scan a few pages — plenty for seeding.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 50 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 50) break;
  }
  return null;
}

async function main() {
  console.log("Seeding administrator:", ADMIN.email);

  // 1) Ensure the auth user exists with the right password + confirmed email.
  let userId;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: ADMIN.email,
    password: ADMIN.password,
    email_confirm: true,
    user_metadata: { nickname: ADMIN.nickname },
  });

  if (created?.user) {
    userId = created.user.id;
    console.log("  · created auth user");
  } else {
    // Most likely already registered — find it and force the password/state.
    const existing = await findUserByEmail(ADMIN.email);
    if (!existing) throw createErr ?? new Error("Could not create or find admin user.");
    userId = existing.id;
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password: ADMIN.password,
      email_confirm: true,
      user_metadata: { nickname: ADMIN.nickname },
    });
    if (updErr) throw updErr;
    console.log("  · auth user already existed — password reset & confirmed");
  }

  // 2) Upsert the profile. Preserve coin balances if the profile already exists.
  const { data: existingProfile, error: selErr } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existingProfile) {
    const { error } = await admin
      .from("profiles")
      .update({
        nickname: ADMIN.nickname,
        email: ADMIN.email,
        nationality: ADMIN.nationality,
        discord_id: ADMIN.discord_id,
        is_admin: true,
        ...SEED_BALANCE,
      })
      .eq("id", userId);
    if (error) throw error;
    console.log("  · profile updated — is_admin = true, balance restocked");
  } else {
    const { error } = await admin.from("profiles").insert({
      id: userId,
      nickname: ADMIN.nickname,
      email: ADMIN.email,
      nationality: ADMIN.nationality,
      discord_id: ADMIN.discord_id,
      is_admin: true,
      ...SEED_BALANCE,
    });
    if (error) throw error;
    console.log("  · profile created — is_admin = true");
  }

  console.log("\n✅ Admin ready. Log in with:");
  console.log(`   email:    ${ADMIN.email}`);
  console.log(`   password: ${ADMIN.password}`);
}

main().catch((e) => {
  console.error("\n❌ Seed failed:", e.message ?? e);
  if (/schema cache|does not exist|relation/i.test(e.message ?? "")) {
    console.error("   → Run supabase/schema.sql in the Supabase SQL Editor first.");
  }
  process.exit(1);
});
