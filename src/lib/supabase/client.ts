"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Uses the public anon key and the cookie-based
// session managed by @supabase/ssr, so the server can read the session too.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
