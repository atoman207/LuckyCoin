import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { isSellOpen, sellStatus, SELL_PRICE_USDT } from "@/lib/selling";

export const runtime = "nodejs";

// Sell gold coins for USDT (1,000 each), only during the Sunday trading
// windows (US Eastern). The window is enforced HERE so the client clock can't
// bypass it. Gold is deducted and a payout request is recorded for the admin
// to fulfil — no crypto is auto-sent.
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;

  // Trading window (authoritative).
  if (!isSellOpen()) {
    return NextResponse.json({ error: sellStatus().message, closed: true }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const gold = Math.floor(Number(body.gold));
  if (!Number.isFinite(gold) || gold < 1) {
    return NextResponse.json({ error: "Enter how many gold coins to sell." }, { status: 400 });
  }
  if (gold > profile.gold) {
    return NextResponse.json({ error: `You only have ${profile.gold} gold.` }, { status: 400 });
  }

  const usdt = gold * SELL_PRICE_USDT;

  // Deduct the gold (race-guarded) before recording the payout request.
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ gold: profile.gold - gold })
    .eq("id", profile.id)
    .gte("gold", gold)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Could not complete the sale." }, { status: 400 });
  }

  await admin.from("sells").insert({
    user_id: profile.id,
    gold,
    usdt_amount: usdt,
    status: "requested",
  });

  return NextResponse.json({
    ok: true,
    usdt,
    message: `Sold ${gold} gold for ${usdt.toLocaleString()} USDT. Your payout will be sent to your wallet.`,
    profile: updated,
  });
}
