import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import {
  formatBankAccount,
  isBankAccountComplete,
  normalizeBankAccount,
  parseBankAccount,
  serializeBankAccount,
  type BankAccount,
} from "@/lib/bank-account";
import { isSellOpen, sellStatus, SELL_PRICE_JPY } from "@/lib/selling";
import { DEFAULT_PAYOUT_METHOD_ID, getPayoutMethod } from "@/lib/payout-methods";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

function bankFromBody(body: Record<string, unknown>): BankAccount | null {
  if (body.bank && typeof body.bank === "object" && body.bank !== null) {
    return normalizeBankAccount(body.bank as Partial<BankAccount>);
  }
  if (typeof body.payout_address === "string") {
    return parseBankAccount(body.payout_address);
  }
  return null;
}

// Sell gold coins for JPY (150,000 yen each). Gold is deducted and a payout
// request is recorded for the admin to fulfil via domestic bank transfer.
export async function POST(req: Request) {
  const t = await getT();
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  const { admin, profile } = ctx;

  if (!isSellOpen()) {
    return NextResponse.json({ error: t(sellStatus().message), closed: true }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const gold = Math.floor(Number(body.gold));
  if (!Number.isFinite(gold) || gold < 1) {
    return NextResponse.json({ error: t("api.sell.enterAmount") }, { status: 400 });
  }
  if (gold > profile.gold) {
    return NextResponse.json({ error: t("api.sell.onlyHave", { count: profile.gold }) }, { status: 400 });
  }

  const entered = bankFromBody(body);
  const registered = parseBankAccount(profile.payout_address);
  const bank = entered && isBankAccountComplete(entered) ? entered : registered;
  if (!bank || !isBankAccountComplete(bank)) {
    return NextResponse.json(
      { error: t("api.sell.needBank"), needBank: true },
      { status: 400 }
    );
  }

  const payoutAddress = serializeBankAccount(bank);
  const methodId =
    (typeof body.method_id === "string" && getPayoutMethod(body.method_id)?.id) ||
    getPayoutMethod(profile.payout_method)?.id ||
    DEFAULT_PAYOUT_METHOD_ID;

  const jpy = gold * SELL_PRICE_JPY;

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
    usdt_amount: jpy, // DB カラム名は歴史的経緯。値は日本円。
    method_id: methodId,
    payout_address: payoutAddress,
    status: "requested",
  });

  return NextResponse.json({
    ok: true,
    jpy,
    message: t("api.sell.done", {
      gold,
      jpy: jpy.toLocaleString("ja-JP"),
      bank: formatBankAccount(bank),
    }),
    profile: updated,
  });
}
