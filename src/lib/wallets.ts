// =====================================================================
//  Receiving wallets — the administrator's addresses that buyers pay TO.
//  Single source of truth for the buy/checkout flow and the purchase API.
//
//  USDT is supported on every network that carries it (TRON/ETH/BNB/SOL)
//  and all funds land in the admin wallet for that chain. EVM chains
//  (Ethereum + BNB Smart Chain) share one address; every other chain has
//  its own.
// =====================================================================

// One address per chain. EVM (ETH + BNB) intentionally share an address.
export const RECEIVING_WALLETS = {
  evm: "0xb593a3dA1b311D08b9a4b46F5331A931c6aA5f1f", // Ethereum + BNB Smart Chain
  btc: "bc1q95l7rllmaxyrwr07dxh5g78n6pydc6lfvn3s8r",
  xrp: "r9NS1tFAZwQPucuWj3V5DRt4Eo5Jrvcxrb",
  xlm: "GDM6SVQON2BJFZPRSWOI4VQ2HCDYA4XMIP3CKK6U2RLVDUJ26H26XADQ",
  tron: "THvm54m1H6y8s5Ahc8AvG7GptdtBxXriUw",
  sol: "7YyfJJXDLhQc1D45Udm249GshiYLtNt1GVa3roWUJV8L",
} as const;

export type PaymentMethod = {
  id: string; // stable key recorded with the transaction
  label: string; // shown on the checkout button
  asset: string; // token the buyer sends
  network: string; // chain it travels on
  address: string; // the admin address the buyer must send funds TO
  memo?: string; // note for chains that need a destination tag / memo
};

// Order matters — USDT options lead because every pack is priced in USDT, and
// BEP-20 is first so it is the default network. `address` is the live receiving
// address shown at checkout; on-chain verification (see chains.ts) confirms the
// buyer actually paid it on the SELECTED network.
export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "usdt-bep20", label: "USDT · BEP-20", asset: "USDT", network: "BNB Smart Chain (BEP-20)", address: RECEIVING_WALLETS.evm },
  { id: "usdt-trc20", label: "USDT · TRC-20", asset: "USDT", network: "TRON (TRC-20)", address: RECEIVING_WALLETS.tron },
  { id: "usdt-erc20", label: "USDT · ERC-20", asset: "USDT", network: "Ethereum (ERC-20)", address: RECEIVING_WALLETS.evm },
  { id: "usdt-spl", label: "USDT · Solana", asset: "USDT", network: "Solana (SPL)", address: RECEIVING_WALLETS.sol },
  { id: "btc", label: "Bitcoin", asset: "BTC", network: "Bitcoin", address: RECEIVING_WALLETS.btc },
  { id: "eth", label: "Ethereum", asset: "ETH", network: "Ethereum", address: RECEIVING_WALLETS.evm },
  { id: "bnb", label: "BNB", asset: "BNB", network: "BNB Smart Chain", address: RECEIVING_WALLETS.evm },
  { id: "sol", label: "Solana", asset: "SOL", network: "Solana", address: RECEIVING_WALLETS.sol },
  { id: "trx", label: "TRON", asset: "TRX", network: "TRON", address: RECEIVING_WALLETS.tron },
  {
    id: "xrp",
    label: "XRP",
    asset: "XRP",
    network: "XRP Ledger",
    address: RECEIVING_WALLETS.xrp,
    memo: "Some wallets/exchanges require a destination tag — leave it blank or use 0 unless told otherwise.",
  },
  {
    id: "xlm",
    label: "Stellar (XLM)",
    asset: "XLM",
    network: "Stellar",
    address: RECEIVING_WALLETS.xlm,
    memo: "If your wallet/exchange asks for a memo, leave it blank unless told otherwise.",
  },
];

export function getPaymentMethod(id: string | null | undefined): PaymentMethod | null {
  if (!id) return null;
  return PAYMENT_METHODS.find((m) => m.id === id) ?? null;
}
