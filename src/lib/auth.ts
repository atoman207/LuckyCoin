import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/coins";

// Resolves the authenticated user and their profile for use in API routes.
// Returns null when there is no valid session.
export async function requireProfile() {
  const user = await getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  return { user, admin, profile: profile as Profile };
}

// Like requireProfile() but also asserts the caller is an administrator.
export async function requireAdmin() {
  const ctx = await requireProfile();
  if (!ctx || !ctx.profile.is_admin) return null;
  return ctx;
}
