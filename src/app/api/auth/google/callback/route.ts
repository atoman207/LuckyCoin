import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureOAuthProfile } from "@/lib/oauth-profile";
import { getSiteOrigin } from "@/lib/site-url";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

// Google redirects here with ?code=…&state=…. We exchange the code for an ID
// token, hand it to Supabase on the server (Vercel can reach supabase.co even
// when the user's browser cannot), set the session cookie, and send them home.
export async function GET(request: Request) {
  const t = await getT();
  const origin = getSiteOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError =
    url.searchParams.get("error_description") || url.searchParams.get("error");

  if (oauthError) {
    console.error("[auth/google] provider error:", oauthError);
    return NextResponse.redirect(`${origin}/?login_error=1`);
  }

  const expectedState = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("google_oauth_state="))
    ?.slice("google_oauth_state=".length);

  const clearState = (response: NextResponse) => {
    response.cookies.set("google_oauth_state", "", { path: "/api/auth/google/callback", maxAge: 0 });
    return response;
  };

  if (!code || !state || !expectedState || state !== expectedState) {
    return clearState(
      NextResponse.redirect(`${origin}/?login_error=${encodeURIComponent(t("api.auth.invalidState"))}`)
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return clearState(NextResponse.redirect(`${origin}/?login_error=1`));
  }

  const redirectUri = `${origin}/api/auth/google/callback`;
  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokens = (await tokenRes.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokens.id_token) {
    console.error("[auth/google] token exchange failed:", tokens.error_description || tokens.error);
    return clearState(
      NextResponse.redirect(
        `${origin}/?login_error=${encodeURIComponent(t("api.auth.googleVerifyFailed"))}`
      )
    );
  }

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: tokens.id_token,
  });

  if (signInErr) {
    console.error("[auth/google] supabase sign-in failed:", signInErr);
    return clearState(
      NextResponse.redirect(
        `${origin}/?login_error=${encodeURIComponent(t("api.auth.googleVerifyFailed"))}`
      )
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // A missing profiles row means no balances and no entry in the admin user
    // list, so a failure here must not pass for a successful sign-up.
    try {
      await ensureOAuthProfile(createAdminClient(), user);
    } catch {
      return clearState(
        NextResponse.redirect(
          `${origin}/?login_error=${encodeURIComponent(t("api.auth.profileFailed"))}`
        )
      );
    }
  }

  return clearState(NextResponse.redirect(`${origin}/?welcome=1`));
}
