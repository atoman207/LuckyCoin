import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { buildBoard, BOARD_SIZE, ROUND_COST, type RoundCurrency } from "@/lib/coins";

// Start a new round. The player chooses to pay with EITHER 1 silver OR 10
// bronze (equal value). Generates and stores the 50-coin board server-side,
// then returns only the round id + size — never the contents.
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;

  const body = await req.json().catch(() => ({}));
  const currency: RoundCurrency = body.currency === "bronze" ? "bronze" : "silver";
  const unit = currency === "bronze" ? "bronze" : "silver";

  // Admins play for free; everyone else pays the chosen entry cost.
  const cost = profile.is_admin ? 0 : ROUND_COST[currency];

  if (!profile.is_admin && profile[unit] < cost) {
    return NextResponse.json(
      { error: `You need ${cost} ${unit} to play. Buy more coins to keep playing.`, currency },
      { status: 400 }
    );
  }

  // Deduct the entry cost from the chosen balance (zero for admins).
  const { data: charged, error: chargeErr } = await admin
    .from("profiles")
    .update({ [unit]: profile[unit] - cost })
    .eq("id", profile.id)
    .gte(unit, cost) // guard against races
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
    // Refund the entry cost if the round couldn't be created.
    await admin
      .from("profiles")
      .update({ [unit]: charged[unit] + cost })
      .eq("id", profile.id);
    return NextResponse.json({ error: "Could not start round." }, { status: 500 });
  }

  return NextResponse.json({
    roundId: round.id,
    size: BOARD_SIZE,
    profile: charged,
  });
}
