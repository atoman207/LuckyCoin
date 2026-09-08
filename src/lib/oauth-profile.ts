import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Ensure a social/OAuth sign-in has a profiles row and first_login_done set.
// The admin dashboard lists profiles, so an account that never gets a row here
// would be invisible there — every failure is logged and the write is an
// upsert, which is safe when two callbacks race for the same new user.
export async function ensureOAuthProfile(admin: SupabaseClient, user: User) {
  const { data: existing, error: readErr } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (readErr) console.error("[oauth-profile] profile lookup failed:", readErr);

  if (!existing) {
    const meta = user.user_metadata ?? {};
    const nickname = (
      meta.full_name ||
      meta.name ||
      meta.user_name ||
      user.email?.split("@")[0] ||
      "Player"
    ).toString();
    const email = (user.email || `${user.id}@social.luckycoin`).toLowerCase();
    const avatar_url = (meta.avatar_url || meta.picture || null) as string | null;

    const { error: insertErr } = await admin.from("profiles").upsert(
      {
        id: user.id,
        nickname,
        email,
        avatar_url,
        gold: 0,
        silver: 0,
        bronze: 0,
        streak: 0,
        rewards_claimed: false,
        first_login_done: true,
        kind: "real",
      },
      { onConflict: "id" }
    );

    // Don't swallow this: without a profiles row the player has no balances
    // and never appears in the admin user list.
    if (insertErr) {
      console.error("[oauth-profile] could not create profile:", insertErr);
      throw new Error(insertErr.message);
    }
    return;
  }

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ first_login_done: true })
    .eq("id", user.id);
  if (updateErr) console.error("[oauth-profile] first_login_done update failed:", updateErr);
}
