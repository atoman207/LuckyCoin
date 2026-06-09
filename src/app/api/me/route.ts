import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";

// Returns the current user's profile (balances, streak, admin flag, ...).
export async function GET() {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return NextResponse.json({ profile: ctx.profile });
}
