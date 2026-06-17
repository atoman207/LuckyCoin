import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSiteOrigin } from "@/lib/site-url";

export const runtime = "nodejs";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";

// Start Google sign-in on the server. The browser goes to Google directly
// (not supabase.co/auth/v1/authorize), which avoids ERR_TUNNEL_CONNECTION_FAILED
// when supabase.co is blocked on the user's network.
export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Vercel.",
      },
      { status: 503 }
    );
  }

  const origin = getSiteOrigin(request);
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  const response = NextResponse.redirect(`${GOOGLE_AUTH}?${params.toString()}`);
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/auth/google/callback",
  });
  return response;
}
