import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import {
  BOARD_SIZE,
  compositionFor,
  multiplierFor,
  type BoardSlot,
  type PlayMode,
} from "@/lib/coins";

function compositionWithEmpty(mode: string | null | undefined, round: number) {
  const c = compositionFor((mode as PlayMode) ?? "continuous", round);
  return { ...c, empty: BOARD_SIZE - c.gold - c.silver - c.bronze };
}

// Restore the in-progress game session after refresh or navigation.
export async function GET() {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;
  const roundNum = profile.game_round ?? 0;
  const mode = profile.game_mode ?? null;
  const restarts = profile.game_restarts ?? 0;

  if (roundNum <= 0) {
    return NextResponse.json({
      phase: "idle" as const,
      continueUntil: profile.continue_until ?? null,
    });
  }

  const { data: latest } = await admin
    .from("game_rounds")
    .select("id, status, board, picked_index, reward")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const composition = compositionWithEmpty(mode, roundNum);
  const multiplier = multiplierFor(mode, roundNum);

  if (latest?.status === "active") {
    return NextResponse.json({
      phase: "playing" as const,
      roundId: latest.id,
      round: roundNum,
      mode,
      restarts,
      composition,
      multiplier,
      continueUntil: profile.continue_until ?? null,
    });
  }

  if (latest?.status === "done" && latest.board && latest.picked_index != null) {
    return NextResponse.json({
      phase: "revealed" as const,
      roundId: latest.id,
      board: latest.board as BoardSlot[],
      pickedIndex: latest.picked_index as number,
      reward: latest.reward,
      round: roundNum,
      mode,
      restarts,
      composition,
      multiplier,
      continueUntil: profile.continue_until ?? null,
    });
  }

  return NextResponse.json({
    phase: "idle" as const,
    continueUntil: profile.continue_until ?? null,
  });
}
