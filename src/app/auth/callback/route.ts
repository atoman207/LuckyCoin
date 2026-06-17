import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// OAuth / magic-link landing. Both Google/Facebook sign-in and the email login
// link send the browser here with a one-time `code`. We exchange it for a
// session (sets the auth cookies), make sure the player has a profile row, mark
// the first login complete, and redirect home — immediately logged in.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  // The provider can bounce back with an explicit OAuth error (user cancelled,
  // app misconfigured, …). Surface it cleanly instead of a blank redirect.
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(`${origin}/?login_error=${encodeURIComponent(oauthError)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const admin = createAdminClient();

        // First-time social sign-ins have no profile yet — create one so the
        // app recognises them as a real, fully logged-in player.
        const { data: existing } = await admin
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (!existing) {
          const meta = user.user_metadata ?? {};
          const nickname =
            (meta.full_name || meta.name || meta.user_name || user.email?.split("@")[0] || "Player").toString();
          // Keep a stable placeholder if a provider ever withholds the email, so
          // the NOT NULL profile column is always satisfied.
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
            // The provider already verified the email — no magic-link gate needed.
            first_login_done: true,
            kind: "real",
          });
        } else {
          // Returning user: flag the first login as done so future logins skip
          // the email magic-link step.
          await admin.from("profiles").update({ first_login_done: true }).eq("id", user.id);
        }
      }
      return NextResponse.redirect(`${origin}/?welcome=1`);
    }
  }

  return NextResponse.redirect(`${origin}/?login_error=1`);
}
