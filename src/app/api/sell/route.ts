import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { isSellOpen, sellStatus, SELL_PRICE_USDT } from "@/lib/selling";
import { getPaymentMethod } from "@/lib/wallets";

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

  // Resolve the payout wallet: the one entered now, or the registered one.
  const enteredAddress =
    typeof body.payout_address === "string" ? body.payout_address.trim() : "";
  const payoutAddress = enteredAddress || profile.payout_address || "";
  if (!payoutAddress) {
    return NextResponse.json(
      { error: "Please enter a wallet address to receive your payout.", needWallet: true },
      { status: 400 }
    );
  }

  // Resolve the payout crypto/network: the one chosen now, or the registered one.
  const methodId =
    (typeof body.method_id === "string" && getPaymentMethod(body.method_id)?.id) ||
    profile.payout_method ||
    null;

  const usdt = gold * SELL_PRICE_USDT;

  // Deduct the gold (race-guarded) and register the payout wallet for next time.
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ gold: profile.gold - gold, payout_address: payoutAddress, payout_method: methodId })
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
    method_id: methodId,
    payout_address: payoutAddress,
    status: "requested",
  });

  const methodLabel = getPaymentMethod(methodId)?.label;
  return NextResponse.json({
    ok: true,
    usdt,
    message: `Sold ${gold} gold for ${usdt.toLocaleString()} USDT. Your payout will be sent to ${
      methodLabel ? `${methodLabel} · ` : ""
    }${payoutAddress}.`,
    profile: updated,
  });
}
