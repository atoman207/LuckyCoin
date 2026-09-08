// =====================================================================
//  LuckyCoinPayments contract integration. SERVER ONLY.
//
//  When a buyer pays through the contract (contracts/LuckyCoinPayments.sol)
//  the order id travels inside the transaction, so settlement stops being a
//  guess. Instead of scanning our receiving address for "a transfer of about
//  the right size at about the right time", we ask the chain a precise
//  question:
//
//      "is there a PaymentReceived log for THIS order id?"
//
//  One indexed-topic query answers it. The moment the log exists the order is
//  paid, by a known payer, for a known amount — and the coins are credited.
//
//  Chains without the contract deployed (Bitcoin, XRP, Stellar, Solana, or an
//  EVM chain where PAYMENT_CONTRACT_* is unset) keep using the original
//  address-scanning flow in lib/chains.ts. Nothing here is required for the
//  site to take payments; it is the fast, exact path when available.
// =====================================================================

import { getChainConfig, AMOUNT_TOLERANCE, PAYMENT_WINDOW_MS } from "@/lib/chains";

// ---- ABI constants ---------------------------------------------------------
// Derived from the compiled ABI with keccak-256 and cross-checked against
// solc 0.8.26's own output for contracts/LuckyCoinPayments.sol.
//
//   payNative(bytes32)                              -> 0xefc3d609
//   payToken(bytes32,address,uint256)               -> 0x569deb2f
//   paid(bytes32)                                   -> 0xadd89bb2
//   PaymentReceived(bytes32,address,address,uint256)
//     -> 0x1c517e85acdede9b6dbdaab4925d20d3551f2961e9a860e72658e1769f150322
export const SELECTOR_PAY_NATIVE = "0xefc3d609";
export const SELECTOR_PAY_TOKEN = "0x569deb2f";
export const SELECTOR_PAID = "0xadd89bb2";
// ERC-20 approve(address,uint256) — a token payment needs an allowance first.
export const SELECTOR_APPROVE = "0x095ea7b3";
export const TOPIC_PAYMENT_RECEIVED =
  "0x1c517e85acdede9b6dbdaab4925d20d3551f2961e9a860e72658e1769f150322";

// ---- Deployments -----------------------------------------------------------
// One contract instance per EVM chain, supplied by environment so the same
// build works before and after deployment. Unset = that chain keeps the
// address-scanning flow.
const DEPLOYMENTS: Record<number, string | undefined> = {
  1: process.env.PAYMENT_CONTRACT_ETHEREUM,   // Ethereum mainnet
  56: process.env.PAYMENT_CONTRACT_BSC,       // BNB Smart Chain
};

// Average seconds per block, used to size the log lookback window.
const BLOCK_TIME_SEC: Record<number, number> = { 1: 12, 56: 3 };

/** The contract address for a payment method, or null when there isn't one. */
export function getPaymentContract(methodId: string): string | null {
  const cfg = getChainConfig(methodId);
  if (!cfg || !cfg.chainId) return null;
  if (cfg.kind !== "evm-native" && cfg.kind !== "evm-token") return null;
  const addr = DEPLOYMENTS[cfg.chainId];
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? addr.toLowerCase() : null;
}

/** True when this order can be paid through the contract. */
export function isContractPayable(methodId: string): boolean {
  return getPaymentContract(methodId) !== null;
}

// ---- Encoding helpers ------------------------------------------------------

/**
 * An order's UUID as the bytes32 the contract expects.
 *
 * A UUID is exactly 16 bytes, so it is used as the high half of the word and
 * right-padded with zeros. That keeps the mapping reversible and readable in a
 * block explorer, unlike hashing it.
 */
export function orderIdToBytes32(orderId: string): string {
  const hex = orderId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error("Order id is not a UUID.");
  return `0x${hex}${"0".repeat(32)}`;
}

/** The inverse, for turning a log topic back into an order id. */
export function bytes32ToOrderId(topic: string): string | null {
  const hex = topic.replace(/^0x/, "").toLowerCase();
  if (hex.length !== 64 || !hex.endsWith("0".repeat(32))) return null;
  const u = hex.slice(0, 32);
  return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20, 32)}`;
}

const pad32 = (hexNo0x: string) => hexNo0x.replace(/^0x/, "").toLowerCase().padStart(64, "0");

/** Calldata for `payNative(bytes32)` — the buyer sends value alongside it. */
export function encodePayNative(orderId: string): string {
  return SELECTOR_PAY_NATIVE + pad32(orderIdToBytes32(orderId));
}

/** Calldata for `payToken(bytes32,address,uint256)`. */
export function encodePayToken(orderId: string, token: string, amount: bigint): string {
  return (
    SELECTOR_PAY_TOKEN +
    pad32(orderIdToBytes32(orderId)) +
    pad32(token) +
    pad32(amount.toString(16))
  );
}

/** Calldata for `approve(address,uint256)` on the token contract. */
export function encodeApprove(spender: string, amount: bigint): string {
  return SELECTOR_APPROVE + pad32(spender) + pad32(amount.toString(16));
}

/**
 * Everything a browser wallet needs to pay this order through the contract.
 * `approve` is present only for token payments, and must be sent first.
 */
export type ContractCheckout = {
  address: string; // the LuckyCoinPayments instance
  chainId: number;
  chainIdHex: string; // for wallet_switchEthereumChain
  orderIdHex: string; // the order id as bytes32
  data: string; // calldata for payNative / payToken
  value: string; // wei to attach (decimal string; "0" for tokens)
  token: string | null; // token contract for a token payment
  amount: string; // smallest units being paid (decimal string)
  approve: { to: string; data: string } | null;
};

/** Builds the wallet instructions for an order, or null when unavailable. */
export function buildContractCheckout(
  methodId: string,
  orderId: string,
  payAmount: number
): ContractCheckout | null {
  const contract = getPaymentContract(methodId);
  const cfg = getChainConfig(methodId);
  if (!contract || !cfg?.chainId) return null;

  const amount = toSmallestUnits(payAmount, cfg.decimals);
  const base = {
    address: contract,
    chainId: cfg.chainId,
    chainIdHex: `0x${cfg.chainId.toString(16)}`,
    orderIdHex: orderIdToBytes32(orderId),
    amount: amount.toString(),
  };

  if (cfg.kind === "evm-native") {
    return {
      ...base,
      data: encodePayNative(orderId),
      value: amount.toString(),
      token: null,
      approve: null,
    };
  }
  if (cfg.kind === "evm-token" && cfg.tokenContract) {
    const token = cfg.tokenContract.toLowerCase();
    return {
      ...base,
      data: encodePayToken(orderId, token, amount),
      value: "0",
      token,
      approve: { to: token, data: encodeApprove(contract, amount) },
    };
  }
  return null;
}

// The precision an order's pay_amount is stored at — /api/purchase rounds the
// quote with `toFixed(Math.min(cfg.decimals, 8))` before saving it.
const STORED_DP = 8;

/**
 * A decimal amount in the asset's whole units as an exact integer in its
 * smallest units. Done with string maths, because `0.1 * 10 ** 18` in floating
 * point is not the number anybody wants moving money.
 *
 * The rendering is deliberately capped at the precision the amount was stored
 * with rather than the token's full precision. Asking a float for 18 decimal
 * places prints its binary representation error — `(0.1).toFixed(18)` is
 * "0.100000000000000006" — so the digits beyond the 8th are noise that would
 * make the charge differ from the quote in either direction.
 */
export function toSmallestUnits(amount: number, decimals: number): bigint {
  const dp = Math.min(decimals, STORED_DP);
  const [whole, frac = ""] = amount.toFixed(dp).split(".");
  const scaled = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + scaled);
}

// ---- RPC -------------------------------------------------------------------

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC error (${res.status}).`);
  const j = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || "RPC error.");
  return j.result;
}

type EvmLog = { address: string; topics: string[]; data: string; transactionHash: string; blockNumber: string };

export type ContractPayment = {
  txHash: string;
  payer: string;
  token: string; // "0x000…0" for the native coin
  amount: bigint; // smallest units, as emitted
};

// Decodes one PaymentReceived log. topics = [sig, orderId, payer, token],
// data = the amount, which is the only non-indexed field.
function decodePaymentLog(log: EvmLog): ContractPayment | null {
  if (!log.topics || log.topics.length < 4) return null;
  if (log.topics[0].toLowerCase() !== TOPIC_PAYMENT_RECEIVED) return null;
  const addrFromTopic = (t: string) => `0x${t.replace(/^0x/, "").slice(24)}`.toLowerCase();
  let amount: bigint;
  try {
    amount = BigInt(log.data && log.data !== "0x" ? log.data : "0");
  } catch {
    return null;
  }
  return {
    txHash: log.transactionHash,
    payer: addrFromTopic(log.topics[2]),
    token: addrFromTopic(log.topics[3]),
    amount,
  };
}

/**
 * The amount that must have arrived for the order to count as paid, in the
 * asset's smallest units. Mirrors the 1% dust tolerance the address-scanning
 * verifier already allows.
 */
export function minimumAcceptable(expected: number, decimals: number): bigint {
  const exact = toSmallestUnits(expected, decimals);
  const scale = BigInt(10_000); // BigInt literals need a newer tsconfig target
  return (exact * BigInt(Math.round((1 - AMOUNT_TOLERANCE) * 10_000))) / scale;
}

// The token address a payment for this method must carry: the USDT contract
// for token methods, the zero address for a native coin.
function expectedToken(methodId: string): string | null {
  const cfg = getChainConfig(methodId);
  if (!cfg) return null;
  if (cfg.kind === "evm-native") return "0x0000000000000000000000000000000000000000";
  if (cfg.kind === "evm-token" && cfg.tokenContract) return cfg.tokenContract.toLowerCase();
  return null;
}

/**
 * Look for a settled payment for one specific order.
 *
 * Filtered on the contract address, the event signature AND the order id, so a
 * match is proof this exact order was paid — no amount guessing, no risk of
 * picking up another buyer's transfer.
 *
 * @returns the payment, or null when it has not arrived (or is short-paid /
 *          paid in the wrong asset, both of which are reported as null so the
 *          caller simply keeps waiting).
 */
export async function findContractPayment(
  methodId: string,
  orderId: string,
  expectedAmount: number,
  createdAtMs: number
): Promise<ContractPayment | null> {
  const contract = getPaymentContract(methodId);
  const cfg = getChainConfig(methodId);
  if (!contract || !cfg?.rpc || !cfg.chainId) return null;

  const wantToken = expectedToken(methodId);
  if (!wantToken) return null;

  // Look back far enough to cover the payment window plus a safety margin,
  // clamped to a range public RPC endpoints will actually serve.
  const blockTime = BLOCK_TIME_SEC[cfg.chainId] ?? 12;
  const elapsedSec = Math.max(0, (Date.now() - createdAtMs) / 1000);
  const span = Math.ceil((elapsedSec + PAYMENT_WINDOW_MS / 1000 + 300) / blockTime);
  const lookback = Math.min(5000, Math.max(200, span));

  const head = await rpc(cfg.rpc, "eth_blockNumber", []);
  const headNum = BigInt(String(head));
  const back = BigInt(lookback);
  const fromBlock = headNum > back ? headNum - back : BigInt(0);

  const logs = (await rpc(cfg.rpc, "eth_getLogs", [
    {
      address: contract,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: "latest",
      topics: [TOPIC_PAYMENT_RECEIVED, orderIdToBytes32(orderId)],
    },
  ])) as EvmLog[];

  if (!Array.isArray(logs) || logs.length === 0) return null;

  const min = minimumAcceptable(expectedAmount, cfg.decimals);
  for (const log of logs) {
    if (log.address?.toLowerCase() !== contract) continue;
    const p = decodePaymentLog(log);
    if (!p) continue;
    // The contract guarantees attribution; the amount and asset are still ours
    // to enforce — a buyer could call payNative with one wei.
    if (p.token !== wantToken) continue;
    if (p.amount < min) continue;
    return p;
  }
  return null;
}

/**
 * Verify a specific transaction hash settled a specific order through the
 * contract. Used by the manual "I paid, here is my hash" path.
 */
export async function verifyContractPayment(
  methodId: string,
  txHash: string,
  orderId: string,
  expectedAmount: number
): Promise<{ ok: boolean; payment?: ContractPayment; reason?: "pending" | "reverted" | "no_match" | "short" | "wrong_asset" }> {
  const contract = getPaymentContract(methodId);
  const cfg = getChainConfig(methodId);
  if (!contract || !cfg?.rpc) return { ok: false, reason: "no_match" };

  const receipt = (await rpc(cfg.rpc, "eth_getTransactionReceipt", [txHash])) as {
    status?: string;
    logs?: EvmLog[];
  } | null;

  if (!receipt) return { ok: false, reason: "pending" };
  if (receipt.status !== undefined && BigInt(receipt.status) !== BigInt(1)) {
    return { ok: false, reason: "reverted" };
  }

  const want = orderIdToBytes32(orderId);
  const wantToken = expectedToken(methodId);
  const min = minimumAcceptable(expectedAmount, cfg.decimals);

  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() !== contract) continue;
    if (log.topics?.[1]?.toLowerCase() !== want) continue;
    const p = decodePaymentLog({ ...log, transactionHash: txHash });
    if (!p) continue;
    if (p.token !== wantToken) return { ok: false, reason: "wrong_asset" };
    if (p.amount < min) return { ok: false, payment: p, reason: "short" };
    return { ok: true, payment: p };
  }
  return { ok: false, reason: "no_match" };
}
