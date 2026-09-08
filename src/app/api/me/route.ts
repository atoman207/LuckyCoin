import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

// Returns the current user's profile (balances, streak, admin flag, ...).
export async function GET() {
  const t = await getT();
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });
  return NextResponse.json({ profile: ctx.profile });
}
