import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";

// Update the logged-in user's own personal info. Coins, admin flag and email
// are intentionally NOT editable here — only profile details.
export async function PATCH(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : undefined;
  const nationality =
    typeof body.nationality === "string" ? body.nationality.trim() || null : undefined;
  const discord_id =
    typeof body.discord_id === "string" ? body.discord_id.trim() || null : undefined;

  if (nickname !== undefined && nickname.length === 0) {
    return NextResponse.json({ error: "Nickname cannot be empty." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (nickname !== undefined) patch.nickname = nickname;
  if (nationality !== undefined) patch.nationality = nationality;
  if (discord_id !== undefined) patch.discord_id = discord_id;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await ctx.admin
    .from("profiles")
    .update(patch)
    .eq("id", ctx.profile.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
