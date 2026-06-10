import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";

// End the current game session (New Game). Clears profile progress and closes
// any active round without paying out.
export async function POST() {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;

  await admin
    .from("game_rounds")
    .update({ status: "done" })
    .eq("user_id", profile.id)
    .eq("status", "active");

  const { data: updated, error } = await admin
    .from("profiles")
    .update({
      game_round: 0,
      game_mode: null,
      game_restarts: 0,
      continue_until: null,
    })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profile: updated });
}
