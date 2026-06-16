import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { SHELL_REWARD, SILVER_CAP, randomGemReward, type BoardSlot, type GemReward } from "@/lib/coins";

const NO_REWARD = { gold: 0, silver: 0, bronze: 0 } as const;

// Reveal a pick. The client sends the round id + the chosen shell index. The
// server looks up the stored board, credits the reward, closes the round, and
// returns the full board so the UI can show where everything was.
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;
  const { roundId, index } = await req.json().catch(() => ({}));

  if (typeof roundId !== "string" || typeof index !== "number") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: round } = await admin
    .from("game_rounds")
    .select("*")
    .eq("id", roundId)
    .eq("user_id", profile.id)
    .single();

  if (!round) return NextResponse.json({ error: "Round not found." }, { status: 404 });
  if (round.status !== "active") {
    return NextResponse.json({ error: "This round is already finished." }, { status: 400 });
  }

  const board = round.board as BoardSlot[];
  if (index < 0 || index >= board.length) {
    return NextResponse.json({ error: "Invalid pick." }, { status: 400 });
  }

  const picked = board[index];

  // It is impossible to *select* gold. If the picked card is gold, that card
  // becomes silver (the player receives silver) and exactly ONE other silver
  // card becomes gold — so the gold stays visible on the revealed board, just
  // never where the player clicked. All other cards are untouched.
  let revealType: BoardSlot = picked;
  let finalBoard = board;
  if (picked === "gold") {
    finalBoard = [...board];
    finalBoard[index] = "silver"; // the selected gold → silver
    const silverSpots: number[] = [];
    finalBoard.forEach((t, i) => {
      if (t === "silver" && i !== index) silverSpots.push(i);
    });
    if (silverSpots.length > 0) {
      finalBoard[silverSpots[Math.floor(Math.random() * silverSpots.length)]] = "gold"; // one silver → gold
    }
    revealType = "silver"; // the player receives silver instead of gold
  }

  // Work out what the pick credits. A GEM grants ONE random reward — free turns
  // (banked as free_rounds), silver, or bronze — instead of a coin.
  let gem: GemReward | null = null;
  let creditGold = 0;
  let creditSilver = 0;
  let creditBronze = 0;
  let freeRoundsAdd = 0;
  if (revealType === "gem") {
    gem = randomGemReward();
    if (gem.kind === "turns") freeRoundsAdd = gem.turns;
    else if (gem.kind === "silver") creditSilver = gem.amount;
    else creditBronze = gem.amount;
  } else if (revealType !== "empty") {
    const r = SHELL_REWARD[revealType];
    creditGold = r.gold;
    creditSilver = r.silver;
    creditBronze = r.bronze;
  }

  const reward = { type: revealType, gold: creditGold, silver: creditSilver, bronze: creditBronze, gem };

  // Close the round (guarded so a double-submit can't pay out twice). Persist
  // the possibly-modified board so the relocated gold stays put.
  const { data: closed, error: closeErr } = await admin
    .from("game_rounds")
    .update({
      status: "done",
      picked_index: index,
      reward,
      board: finalBoard,
    })
    .eq("id", roundId)
    .eq("status", "active")
    .select("id")
    .single();

  if (closeErr || !closed) {
    return NextResponse.json({ error: "This round is already finished." }, { status: 400 });
  }

  // Credit the reward. Silver is capped at SILVER_CAP (10,000) per player.
  const { data: updated, error: creditErr } = await admin
    .from("profiles")
    .update({
      gold: profile.gold + creditGold,
      silver: Math.min(SILVER_CAP, profile.silver + creditSilver),
      bronze: profile.bronze + creditBronze,
      free_rounds: (profile.free_rounds ?? 0) + freeRoundsAdd,
    })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (creditErr) {
    return NextResponse.json({ error: creditErr.message }, { status: 500 });
  }

  return NextResponse.json({
    pickedIndex: index,
    reward,
    board: finalBoard, // reveal everything (with the gold relocated)
    profile: updated,
  });
}
