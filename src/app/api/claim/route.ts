import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { SIGNUP_WELCOME_BRONZE, dailyReward } from "@/lib/coins";
import { getT } from "@/lib/i18n/server";

// One-time reward claim for a new member: the sign-up bonus + the day-1 daily
// reward (50 + 20 = 70 bronze). Starts the daily streak at day 1.
export async function POST() {
  const t = await getT();
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  const { admin, profile } = ctx;

  if (profile.rewards_claimed) {
    return NextResponse.json({ claimed: false, message: t("api.claim.already"), profile });
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

  if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ claimed: false, message: t("api.claim.already"), profile });
  }

  return NextResponse.json({
    claimed: true,
    signup,
    daily,
    gained,
    message: t("api.claim.done", { total: gained, signup, daily }),
    profile: updated,
  });
}
