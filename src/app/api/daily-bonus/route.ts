import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import {
  dailyReward,
  DAILY_CLAIM_INTERVAL_MS,
  DAILY_RESET_AFTER_MS,
} from "@/lib/coins";

function formatLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Claim the daily login reward. Claimable once every 24h. The streak advances
// if claimed within the following 24h; letting more than 48h pass since the
// last claim means a day was missed, so the streak resets to day 1 (20 bronze).
// Schedule: 20, 25, 30, 30, 30, 30, then a fixed 50 from day 7 onward.
export async function POST() {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;

  // New members must claim their sign-up + day-1 reward first (/api/claim).
  if (!profile.rewards_claimed) {
    return NextResponse.json({ claimed: false, message: "Claim your sign-up rewards first.", profile });
  }

  const now = Date.now();
  const last = profile.last_bonus_at ? new Date(profile.last_bonus_at).getTime() : null;

  // Cooldown: only one claim per 24h.
  if (last !== null) {
    const elapsed = now - last;
    if (elapsed < DAILY_CLAIM_INTERVAL_MS) {
      const msLeft = DAILY_CLAIM_INTERVAL_MS - elapsed;
      return NextResponse.json({
        claimed: false,
        nextClaimInMs: msLeft,
        message: `Daily reward already claimed. Come back in ${formatLeft(msLeft)}.`,
        profile,
      });
    }
  }

  // Continue the streak if claimed within the 24–48h window; reset if a full
  // day was missed (or there is no prior claim).
  const missed = last === null || now - last >= DAILY_RESET_AFTER_MS;
  const streak = missed ? 1 : profile.streak + 1;
  const gained = dailyReward(streak);

  // Optimistic guard against a double claim: only succeed if last_bonus_at is
  // still what we read. If another request already claimed, this updates no row.
  let q = admin
    .from("profiles")
    .update({
      bronze: profile.bronze + gained,
      streak,
      last_bonus_at: new Date(now).toISOString(),
    })
    .eq("id", profile.id);
  q = profile.last_bonus_at === null ? q.is("last_bonus_at", null) : q.eq("last_bonus_at", profile.last_bonus_at);

  const { data: updated, error } = await q.select("*").maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) {
    // Lost the race — someone already claimed for this period.
    return NextResponse.json({
      claimed: false,
      message: "Daily reward already claimed.",
      profile,
    });
  }

  return NextResponse.json({
    claimed: true,
    gained,
    streak,
    reset: missed && last !== null,
    message:
      missed && last !== null
        ? `Streak reset — +${gained} bronze (day 1).`
        : `+${gained} bronze · day ${streak} streak 🎉`,
    profile: updated,
  });
}
