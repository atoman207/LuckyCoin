import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import {
  buildBoardFrom,
  compositionFor,
  multiplierFor,
  stageCostMultiplier,
  BASE_COMPOSITION,
  MAX_RESTARTS,
  BOARD_SIZE,
  ROUND_COST,
  type RoundCurrency,
  type PlayMode,
} from "@/lib/coins";

// Start a round. Two actions:
//   • "new"     — fresh game: round 1, base board, restart counter reset.
//   • "restart" — next round in the chosen mode (continuous | multiplier),
//                 up to MAX_RESTARTS times. The board composition is decided
//                 SERVER-SIDE from the mode + round so it can't be spoofed.
// Pay with EITHER 1 silver OR 10 bronze. Admins play free.
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;
  const body = await req.json().catch(() => ({}));

  const currency: RoundCurrency = body.currency === "bronze" ? "bronze" : "silver";
  const unit = currency;
  const isRestart = body.action === "restart";
  const initiate = body.initiate === true; // (re)start the 2-hour Continue timer

  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  // Resolve mode + round + restart count.
  let mode: PlayMode | null;
  let round: number;
  let restarts: number;
  if (isRestart) {
    const used = profile.game_restarts ?? 0;
    if (used >= MAX_RESTARTS) {
      return NextResponse.json(
        { error: `Restart limit reached (${MAX_RESTARTS}). Start a New Game.` },
        { status: 400 }
      );
    }
    mode = body.mode === "multiplier" ? "multiplier" : "continuous";
    round = (profile.game_round ?? 1) + 1;
    restarts = used + 1;
  } else {
    mode = null; // fresh game
    round = 1;
    restarts = 0;
  }

  // Board composition per the original rules (1 gold, 4 silver, 20 bronze and
  // the rest "NO"), or the per-stage composition in Multiplier Play.
  const composition = isRestart && mode ? compositionFor(mode, round) : BASE_COMPOSITION;
  const increase = multiplierFor(mode, round); // per-round ×N (for display)

  // The stake COMPOUNDS each round: cost = base × cumulative multiplier.
  // (silver: 1,2,4,8,24,72,288,1440,14400,288000; bronze ×10.) Admins free.
  const costMult = mode === "multiplier" ? stageCostMultiplier(round) : 1;
  const cost = profile.is_admin ? 0 : Math.ceil(ROUND_COST[currency] * costMult);
  if (!profile.is_admin && profile[unit] < cost) {
    return NextResponse.json(
      {
        error: `You need ${cost} ${unit} to start this stage (×${increase}), but only have ${profile[unit]}.`,
        currency,
        insufficient: true,
      },
      { status: 400 }
    );
  }

  // Charge the entry cost and persist the game state in one update. Only an
  // "initiate" (Start, or the auto-restart at 0) resets the 2-hour timer.
  const update: Record<string, unknown> = {
    [unit]: profile[unit] - cost,
    game_round: round,
    game_mode: mode,
    game_restarts: restarts,
  };
  if (initiate) update.continue_until = new Date(Date.now() + TWO_HOURS_MS).toISOString();

  const { data: charged, error: chargeErr } = await admin
    .from("profiles")
    .update(update)
    .eq("id", profile.id)
    .gte(unit, cost) // guard against races
    .select("*")
    .single();

  if (chargeErr || !charged) {
    return NextResponse.json({ error: "Could not start round." }, { status: 400 });
  }

  const board = buildBoardFrom(composition);
  const { data: created, error: roundErr } = await admin
    .from("game_rounds")
    .insert({ user_id: profile.id, board, status: "active" })
    .select("id")
    .single();

  if (roundErr || !created) {
    // Refund the entry cost if the round couldn't be created.
    await admin
      .from("profiles")
      .update({ [unit]: charged[unit] + cost })
      .eq("id", profile.id);
    return NextResponse.json({ error: "Could not start round." }, { status: 500 });
  }

  const empty = BOARD_SIZE - (composition.gold + composition.silver + composition.bronze);
  return NextResponse.json({
    roundId: created.id,
    size: BOARD_SIZE,
    profile: charged,
    round,
    mode,
    restarts,
    maxRestarts: MAX_RESTARTS,
    composition: { ...composition, empty },
    multiplier: increase,
  });
}
