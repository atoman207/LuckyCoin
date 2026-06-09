import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Supabase client bound to the request cookies. Use this in route
// handlers / server components to identify the logged-in user. It runs with
// the anon key + the user's session, so RLS still applies.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware/route
            // handlers refresh the session cookie instead.
          }
        },
      },
    }
  );
}

// Returns the authenticated user or null.
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
