import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { SIGNUP_WELCOME_BRONZE, dailyReward } from "@/lib/coins";

// One-time reward claim for a new member: the sign-up bonus + the day-1 daily
// reward (50 + 20 = 70 bronze). Starts the daily streak at day 1.
export async function POST() {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;

  if (profile.rewards_claimed) {
    return NextResponse.json({ claimed: false, message: "Rewards already claimed.", profile });
  }

  const signup = SIGNUP_WELCOME_BRONZE; // 50
  const daily = dailyReward(1); // 20
  const gained = signup + daily;

  // Guarded so a double-click can't claim twice.
  const { data: updated, error } = await admin
    .from("profiles")
    .update({
      bronze: profile.bronze + gained,
      rewards_claimed: true,
      streak: 1,
      last_bonus_at: new Date().toISOString(),
    })
    .eq("id", profile.id)
    .eq("rewards_claimed", false)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ claimed: false, message: "Rewards already claimed.", profile });
  }

  return NextResponse.json({
    claimed: true,
    signup,
    daily,
    gained,
    message: `Claimed ${gained} bronze (${signup} sign-up + ${daily} daily)!`,
    profile: updated,
  });
}
