import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { isSellOpen, sellStatus, SELL_PRICE_USDT } from "@/lib/selling";
import { getPayoutMethod } from "@/lib/payout-methods";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// Sell gold coins for USDT (1,000 each), only during the Sunday trading
// windows (US Eastern). The window is enforced HERE so the client clock can't
// bypass it. Gold is deducted and a payout request is recorded for the admin
// to fulfil — no crypto is auto-sent.
export async function POST(req: Request) {
  const t = await getT();
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  const { admin, profile } = ctx;

  // Trading window (authoritative).
  if (!isSellOpen()) {
    return NextResponse.json({ error: t(sellStatus().message), closed: true }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const gold = Math.floor(Number(body.gold));
  if (!Number.isFinite(gold) || gold < 1) {
    return NextResponse.json({ error: t("api.sell.enterAmount") }, { status: 400 });
  }
  if (gold > profile.gold) {
    return NextResponse.json({ error: t("api.sell.onlyHave", { count: profile.gold }) }, { status: 400 });
  }

  // Resolve the payout wallet: the one entered now, or the registered one.
  const enteredAddress =
    typeof body.payout_address === "string" ? body.payout_address.trim() : "";
  const payoutAddress = enteredAddress || profile.payout_address || "";
  if (!payoutAddress) {
    return NextResponse.json(
      { error: t("api.sell.needWallet"), needWallet: true },
      { status: 400 }
    );
  }

  // Resolve the payout crypto/network: the one chosen now, or the registered one.
  const methodId =
    (typeof body.method_id === "string" && getPayoutMethod(body.method_id)?.id) ||
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
    return NextResponse.json({ error: t("api.sell.failed") }, { status: 400 });
  }

  await admin.from("sells").insert({
    user_id: profile.id,
    gold,
    usdt_amount: usdt,
    method_id: methodId,
    payout_address: payoutAddress,
    status: "requested",
  });

  const methodLabel = getPayoutMethod(methodId)?.label;
  return NextResponse.json({
    ok: true,
    usdt,
    message: t("api.sell.done", {
      gold,
      usdt: usdt.toLocaleString(),
      method: methodLabel ? `${methodLabel} · ` : "",
      address: payoutAddress,
    }),
    profile: updated,
  });
}
