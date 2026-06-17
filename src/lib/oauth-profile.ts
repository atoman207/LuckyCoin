import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Ensure a social/OAuth sign-in has a profiles row and first_login_done set.
export async function ensureOAuthProfile(admin: SupabaseClient, user: User) {
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

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

    await admin.from("profiles").insert({
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
    });
    return;
  }

  await admin.from("profiles").update({ first_login_done: true }).eq("id", user.id);
}
