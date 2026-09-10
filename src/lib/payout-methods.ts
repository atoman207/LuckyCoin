// =====================================================================
//  払い出し先ネットワーク — 「売却」でゴールドコインを USDT で受け取るときに
//  ユーザーが選ぶ送金先の種類です。
//
//  これは入金（決済）ではありません。本サイトの決済手段は Stripe のカード
//  決済のみで、受取用ウォレットやオンチェーン検証はすべて廃止しました。
//  ここにあるのはラベルだけで、実際の送金は管理者が手動で行います。
// =====================================================================

export type PayoutMethod = {
  id: string; // 売却リクエストに記録される安定したキー
  label: string; // 通貨・規格の表示名
  network: string; // 送金に使うチェーン
};

export const PAYOUT_METHODS: PayoutMethod[] = [
  { id: "usdt-bep20", label: "USDT · BEP-20", network: "BNB Smart Chain (BEP-20)" },
  { id: "usdt-trc20", label: "USDT · TRC-20", network: "TRON (TRC-20)" },
  { id: "usdt-erc20", label: "USDT · ERC-20", network: "Ethereum (ERC-20)" },
  { id: "usdt-spl", label: "USDT · Solana", network: "Solana (SPL)" },
  { id: "btc", label: "Bitcoin", network: "Bitcoin" },
  { id: "eth", label: "Ethereum", network: "Ethereum" },
  { id: "bnb", label: "BNB", network: "BNB Smart Chain" },
  { id: "sol", label: "Solana", network: "Solana" },
  { id: "trx", label: "TRON", network: "TRON" },
  { id: "xrp", label: "XRP", network: "XRP Ledger" },
  { id: "xlm", label: "Stellar (XLM)", network: "Stellar" },
];

export function getPayoutMethod(id: string | null | undefined): PayoutMethod | null {
  if (!id) return null;
  return PAYOUT_METHODS.find((m) => m.id === id) ?? null;
}
