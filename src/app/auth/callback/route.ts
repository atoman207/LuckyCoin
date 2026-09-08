import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureOAuthProfile } from "@/lib/oauth-profile";

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
    // The provider's text is English-only; log it and show our own message.
    console.error("[auth/callback] provider error:", oauthError);
    return NextResponse.redirect(`${origin}/?login_error=1`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Without a profiles row the account has no balances and never shows
        // up in the admin user list — surface the failure instead of hiding it.
        try {
          await ensureOAuthProfile(createAdminClient(), user);
        } catch {
          return NextResponse.redirect(`${origin}/?login_error=1`);
        }
      }
      return NextResponse.redirect(`${origin}/?welcome=1`);
    }
  }

  return NextResponse.redirect(`${origin}/?login_error=1`);
}
