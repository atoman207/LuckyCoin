import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Magic-link landing. The email login URL points here with a one-time `code`.
// We exchange it for a session (sets the auth cookies), mark the first login as
// complete, and redirect to the home page — immediately logged in.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Flag the first login as done so future logins use the password.
        await createAdminClient().from("profiles").update({ first_login_done: true }).eq("id", user.id);
      }
      return NextResponse.redirect(`${origin}/?welcome=1`);
    }
  }

  return NextResponse.redirect(`${origin}/?login_error=1`);
}
