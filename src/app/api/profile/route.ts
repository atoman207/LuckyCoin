import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { getPaymentMethod } from "@/lib/wallets";

// Update the logged-in user's own personal info. Coins, admin flag and email
// are intentionally NOT editable here — only profile details (and the payout
// wallet used for selling gold back, which can be registered at any time).
export async function PATCH(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : undefined;
  const nationality =
    typeof body.nationality === "string" ? body.nationality.trim() || null : undefined;
  const discord_id =
    typeof body.discord_id === "string" ? body.discord_id.trim() || null : undefined;
  const payout_address =
    typeof body.payout_address === "string" ? body.payout_address.trim() || null : undefined;
  const payout_method =
    typeof body.payout_method === "string" ? body.payout_method.trim() || null : undefined;

  if (nickname !== undefined && nickname.length === 0) {
    return NextResponse.json({ error: "Nickname cannot be empty." }, { status: 400 });
  }
  if (payout_method !== undefined && payout_method !== null && !getPaymentMethod(payout_method)) {
    return NextResponse.json({ error: "Unknown payout method." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (nickname !== undefined) patch.nickname = nickname;
  if (nationality !== undefined) patch.nationality = nationality;
  if (discord_id !== undefined) patch.discord_id = discord_id;
  if (payout_address !== undefined) patch.payout_address = payout_address;
  if (payout_method !== undefined) patch.payout_method = payout_method;

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
