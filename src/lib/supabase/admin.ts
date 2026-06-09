import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client. SERVER ONLY — it bypasses Row Level Security,
// so it must never be imported into client components. Used by API routes to
// mutate coin balances, run the game, and read all users for the admin page.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
