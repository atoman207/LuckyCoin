import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { SHELL_REWARD, type CoinType } from "@/lib/coins";

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

  const board = round.board as CoinType[];
  if (index < 0 || index >= board.length) {
    return NextResponse.json({ error: "Invalid pick." }, { status: 400 });
  }

  const type = board[index];
  const reward = SHELL_REWARD[type];

  // Close the round (guarded so a double-submit can't pay out twice).
  const { data: closed, error: closeErr } = await admin
    .from("game_rounds")
    .update({
      status: "done",
      picked_index: index,
      reward: { type, ...reward },
    })
    .eq("id", roundId)
    .eq("status", "active")
    .select("id")
    .single();

  if (closeErr || !closed) {
    return NextResponse.json({ error: "This round is already finished." }, { status: 400 });
  }

  // Credit the reward.
  const { data: updated, error: creditErr } = await admin
    .from("profiles")
    .update({
      gold: profile.gold + reward.gold,
      silver: profile.silver + reward.silver,
      bronze: profile.bronze + reward.bronze,
    })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (creditErr) {
    return NextResponse.json({ error: creditErr.message }, { status: 500 });
  }

  return NextResponse.json({
    pickedIndex: index,
    reward: { type, ...reward },
    board, // reveal everything now that the round is over
    profile: updated,
  });
}
