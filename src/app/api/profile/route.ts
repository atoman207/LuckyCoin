import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import {
  isBankAccountComplete,
  normalizeBankAccount,
  serializeBankAccount,
  type BankAccount,
} from "@/lib/bank-account";
import { DEFAULT_PAYOUT_METHOD_ID, getPayoutMethod } from "@/lib/payout-methods";
import { getT } from "@/lib/i18n/server";

// Update the logged-in user's own personal info. Coins, admin flag and email
// are intentionally NOT editable here — only profile details (and the bank
// account used for selling gold back, which can be registered at any time).
export async function PATCH(req: Request) {
  const t = await getT();
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : undefined;
  const chatwork_id =
    typeof body.chatwork_id === "string" ? body.chatwork_id.trim() || null : undefined;
  const phone = typeof body.phone === "string" ? body.phone.trim() || null : undefined;
  const discord_id =
    typeof body.discord_id === "string" ? body.discord_id.trim() || null : undefined;

  let payout_address: string | null | undefined = undefined;
  let payout_method: string | null | undefined = undefined;

  if (body.bank && typeof body.bank === "object" && body.bank !== null) {
    const bank = normalizeBankAccount(body.bank as Partial<BankAccount>);
    if (!isBankAccountComplete(bank)) {
      return NextResponse.json({ error: t("api.profile.invalidBank") }, { status: 400 });
    }
    payout_address = serializeBankAccount(bank);
    payout_method = DEFAULT_PAYOUT_METHOD_ID;
  } else {
    if (typeof body.payout_address === "string") {
      payout_address = body.payout_address.trim() || null;
    }
    if (typeof body.payout_method === "string") {
      payout_method = body.payout_method.trim() || null;
    }
  }

  if (nickname !== undefined && nickname.length === 0) {
    return NextResponse.json({ error: t("api.profile.nicknameEmpty") }, { status: 400 });
  }
  if (payout_method !== undefined && payout_method !== null && !getPayoutMethod(payout_method)) {
    return NextResponse.json({ error: t("api.profile.unknownPayout") }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (nickname !== undefined) patch.nickname = nickname;
  if (chatwork_id !== undefined) patch.chatwork_id = chatwork_id;
  if (phone !== undefined) patch.phone = phone;
  if (discord_id !== undefined) patch.discord_id = discord_id;
  if (payout_address !== undefined) patch.payout_address = payout_address;
  if (payout_method !== undefined) patch.payout_method = payout_method;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: t("api.profile.nothingToUpdate") }, { status: 400 });
  }

  const { data, error } = await ctx.admin
    .from("profiles")
    .update(patch)
    .eq("id", ctx.profile.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });
  return NextResponse.json({ profile: data });
}
