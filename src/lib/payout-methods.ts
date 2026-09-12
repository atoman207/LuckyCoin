// =====================================================================
//  払い出し方法 — 「売却」でゴールドを日本円で受け取るときの振込手段です。
//  実際の振込は管理者が手動で行います（自動送金はありません）。
// =====================================================================

export type PayoutMethod = {
  id: string;
  label: string;
};

export const PAYOUT_METHODS: PayoutMethod[] = [
  { id: "bank-jp", label: "国内銀行振込" },
];

export const DEFAULT_PAYOUT_METHOD_ID = PAYOUT_METHODS[0]!.id;

export function getPayoutMethod(id: string | null | undefined): PayoutMethod | null {
  if (!id) return null;
  return PAYOUT_METHODS.find((m) => m.id === id) ?? null;
}
