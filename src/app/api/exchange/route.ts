import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { COIN_VALUE, type CoinType } from "@/lib/coins";

const TYPES: CoinType[] = ["gold", "silver", "bronze"];

// Convert coins between types, preserving total bronze value.
//   gold  -> 500 bronze   (or 50 silver)
//   silver -> 10 bronze
//   bronze -> silver/gold  when evenly divisible
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { admin, profile } = ctx;
  const { from, to, amount } = await req.json().catch(() => ({}));

  if (!TYPES.includes(from) || !TYPES.includes(to) || from === to) {
    return NextResponse.json({ error: "Invalid coin types." }, { status: 400 });
  }
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) {
    return NextResponse.json({ error: "Enter a whole amount greater than 0." }, { status: 400 });
  }
  if (profile[from as CoinType] < amt) {
    return NextResponse.json({ error: `Not enough ${from} coins.` }, { status: 400 });
  }

  const totalValue = amt * COIN_VALUE[from as CoinType];
  if (totalValue % COIN_VALUE[to as CoinType] !== 0) {
    const unit = COIN_VALUE[to as CoinType];
    return NextResponse.json(
      { error: `That doesn't convert evenly. Use a multiple worth ${unit} bronze.` },
      { status: 400 }
    );
  }
  const received = totalValue / COIN_VALUE[to as CoinType];

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    message: `Exchanged ${amt} ${from} → ${received} ${to}.`,
    profile: updated,
  });
}
