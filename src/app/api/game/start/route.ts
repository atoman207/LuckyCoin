import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { buildBoard, BOARD_SIZE, ROUND_COST_SILVER } from "@/lib/coins";

// Start a new round. Costs 1 silver. Generates and stores the 50-coin board
// server-side, then returns only the round id + size — never the contents.
export async function POST() {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;

  // Admins play for free so they can always start a round (no entry cost).
  const cost = profile.is_admin ? 0 : ROUND_COST_SILVER;

  if (profile.silver < cost) {
    return NextResponse.json(
      { error: `You need ${cost} silver to play. Buy or exchange coins.` },
      { status: 400 }
    );
  }

  // Deduct the entry cost (zero for admins).
  const { data: charged, error: chargeErr } = await admin
    .from("profiles")
    .update({ silver: profile.silver - cost })
    .eq("id", profile.id)
    .gte("silver", cost) // guard against races
    .select("*")
    .single();

  if (chargeErr || !charged) {
    return NextResponse.json({ error: "Could not start round." }, { status: 400 });
  }

  const board = buildBoard();
  const { data: round, error: roundErr } = await admin
    .from("game_rounds")
    .insert({ user_id: profile.id, board, status: "active" })
    .select("id")
    .single();

  if (roundErr || !round) {
    // Refund the silver if the round couldn't be created.
    await admin
      .from("profiles")
      .update({ silver: charged.silver + cost })
      .eq("id", profile.id);
    return NextResponse.json({ error: "Could not start round." }, { status: 500 });
  }

  return NextResponse.json({
    roundId: round.id,
    size: BOARD_SIZE,
    profile: charged,
  });
}
