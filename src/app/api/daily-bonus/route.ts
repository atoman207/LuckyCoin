import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import {
  DAILY_BONUS_BRONZE,
  STREAK_LENGTH,
  STREAK_BONUS_BRONZE,
} from "@/lib/coins";

// Claim the daily bonus. +5 bronze each day; +20 bronze every 7th day of a
// streak. Missing a day resets the streak. Idempotent per UTC day.
export async function POST() {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  if (profile.last_bonus_at === today) {
    return NextResponse.json({
      claimed: false,
      message: "Daily bonus already claimed today.",
      profile,
    });
  }

  // Was the last claim exactly yesterday? If so the streak continues.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const continues = profile.last_bonus_at === yesterday;
  const streak = continues ? profile.streak + 1 : 1;

  let gained = DAILY_BONUS_BRONZE;
  let streakHit = false;
  if (streak % STREAK_LENGTH === 0) {
    gained += STREAK_BONUS_BRONZE;
    streakHit = true;
  }

  const { data: updated, error } = await admin
    .from("profiles")
    .update({
      bronze: profile.bronze + gained,
      streak,
      last_bonus_at: today,
    })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    claimed: true,
    gained,
    streak,
    streakHit,
    message: streakHit
      ? `+${gained} bronze! ${STREAK_LENGTH}-day streak bonus included 🎉`
      : `+${gained} bronze. Day ${streak} streak.`,
    profile: updated,
  });
}
