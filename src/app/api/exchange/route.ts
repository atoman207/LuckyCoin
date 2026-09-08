import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_VALUE, EXCHANGE_NEXT, exchangeOutput, coinName, type CoinType } from "@/lib/coins";
import { getT } from "@/lib/i18n/server";

const TYPES: CoinType[] = ["gold", "silver", "bronze"];

// Convert coins DOWNWARD only — gold → silver, silver → bronze. Silver→bronze
// uses tiered bundle bonuses; upgrading (e.g. bronze → silver) is not allowed.
export async function POST(req: Request) {
  const t = await getT();
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  const { admin, profile } = ctx;
  const { from, to, amount } = await req.json().catch(() => ({}));

  if (!TYPES.includes(from) || !TYPES.includes(to) || from === to) {
    return NextResponse.json({ error: t("api.exchange.invalidTypes") }, { status: 400 });
  }
  if (EXCHANGE_NEXT[from as CoinType] !== to) {
    return NextResponse.json(
      { error: t("api.exchange.downwardOnly") },
      { status: 400 }
    );
  }
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) {
    return NextResponse.json({ error: t("api.exchange.wholeAmount") }, { status: 400 });
  }
  if (profile[from as CoinType] < amt) {
    return NextResponse.json({ error: t("api.exchange.notEnough", { name: coinName(t, from) }) }, { status: 400 });
  }

  if (from === "gold") {
    const totalValue = amt * COIN_VALUE.gold;
    if (totalValue % COIN_VALUE.silver !== 0) {
      return NextResponse.json(
        { error: t("api.exchange.notEven", { value: COIN_VALUE.silver }) },
        { status: 400 }
      );
    }
  }

  const received = exchangeOutput(from as CoinType, to as CoinType, amt);

  const next = {
    gold: profile.gold,
    silver: profile.silver,
    bronze: profile.bronze,
  };
  next[from as CoinType] -= amt;
  next[to as CoinType] += received;

  const { data: updated, error } = await admin
    .from("profiles")
    .update(next)
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });

  return NextResponse.json({
    message: t("api.exchange.done", { amount: amt, fromName: coinName(t, from), received, toName: coinName(t, to) }),
    profile: updated,
  });
}
