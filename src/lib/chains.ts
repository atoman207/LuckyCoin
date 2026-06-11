// =====================================================================
//  On-chain payment verification — SERVER ONLY.
//  Given a transaction hash submitted by the buyer, confirm on the public
//  blockchain that they actually sent (at least) the expected amount of the
//  right asset to OUR receiving address, and that it has enough confirmations.
//  No third-party payment processor — only public RPC / explorer reads.
//
//  Each verifier returns { ok, paid, confirmed, reason }. Crediting is gated
//  on ok === true in the /api/purchase/verify route.
// =====================================================================

import { RECEIVING_WALLETS } from "@/lib/wallets";

// Underpayment tolerance — absorbs rounding / dust without allowing a
// meaningful shortfall (1%).
export const AMOUNT_TOLERANCE = 0.01;

// A payment must be made within this window of the order being created. This
// also closes the replay angle of submitting an unrelated, older payment to
// the same (reused) address.
export const PAYMENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const CLOCK_SKEW_MS = 2 * 60 * 1000; // tolerance for node/clock differences

export type VerifyResult = {
  ok: boolean; // payment confirmed and sufficient
  paid: number; // amount received at our address (in the asset's whole units)
  confirmed: boolean; // had enough confirmations / reached finality
  timestamp?: number; // block/ledger time of the tx, unix seconds (when known)
  reason?: string; // human-readable failure reason when !ok
};

type ChainKind =
  | "btc"
  | "evm-native"
  | "evm-token"
  | "tron-native"
  | "tron-token"
  | "sol-native"
  | "sol-token"
  | "xrp"
  | "xlm";

type ChainConfig = {
  kind: ChainKind;
  address: string; // our receiving address for this chain
  coingeckoId: string; // price feed id ("tether" for USDT)
  minConfirmations: number;
  rpc?: string; // EVM/Tron/Sol RPC endpoint
  tokenContract?: string; // EVM/Tron token contract (USDT)
  tokenMint?: string; // Solana SPL mint (USDT)
  decimals: number; // token/native decimals
};

// USDT contracts / mints per network.
const USDT = {
  erc20: "0xdac17f958d2ee523a2206206994597c13d831ec7", // 6 decimals
  bep20: "0x55d398326f99059ff775485246999027b3197955", // 18 decimals
  trc20: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", // 6 decimals
  spl: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // 6 decimals
} as const;

const ETH_RPC = process.env.ETH_RPC_URL || "https://eth.llamarpc.com";
const BSC_RPC = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org";
const TRON_API = process.env.TRON_API_URL || "https://api.trongrid.io";
const SOL_RPC = process.env.SOL_RPC_URL || "https://api.mainnet-beta.solana.com";

// Verification config keyed by payment-method id (see PAYMENT_METHODS).
export const CHAIN_CONFIG: Record<string, ChainConfig> = {
  "usdt-trc20": { kind: "tron-token", address: RECEIVING_WALLETS.tron, coingeckoId: "tether", decimals: 6, tokenContract: USDT.trc20, minConfirmations: 19 },
  "usdt-erc20": { kind: "evm-token", address: RECEIVING_WALLETS.evm, coingeckoId: "tether", decimals: 6, tokenContract: USDT.erc20, rpc: ETH_RPC, minConfirmations: 6 },
  "usdt-bep20": { kind: "evm-token", address: RECEIVING_WALLETS.evm, coingeckoId: "tether", decimals: 18, tokenContract: USDT.bep20, rpc: BSC_RPC, minConfirmations: 12 },
  "usdt-spl": { kind: "sol-token", address: RECEIVING_WALLETS.sol, coingeckoId: "tether", decimals: 6, tokenMint: USDT.spl, minConfirmations: 1 },
  btc: { kind: "btc", address: RECEIVING_WALLETS.btc, coingeckoId: "bitcoin", decimals: 8, minConfirmations: 1 },
  eth: { kind: "evm-native", address: RECEIVING_WALLETS.evm, coingeckoId: "ethereum", decimals: 18, rpc: ETH_RPC, minConfirmations: 6 },
  bnb: { kind: "evm-native", address: RECEIVING_WALLETS.evm, coingeckoId: "binancecoin", decimals: 18, rpc: BSC_RPC, minConfirmations: 12 },
  sol: { kind: "sol-native", address: RECEIVING_WALLETS.sol, coingeckoId: "solana", decimals: 9, minConfirmations: 1 },
  trx: { kind: "tron-native", address: RECEIVING_WALLETS.tron, coingeckoId: "tron", decimals: 6, minConfirmations: 19 },
  xrp: { kind: "xrp", address: RECEIVING_WALLETS.xrp, coingeckoId: "ripple", decimals: 6, minConfirmations: 1 },
  xlm: { kind: "xlm", address: RECEIVING_WALLETS.xlm, coingeckoId: "stellar", decimals: 7, minConfirmations: 1 },
};

export function getChainConfig(methodId: string): ChainConfig | null {
  return CHAIN_CONFIG[methodId] ?? null;
}

// =====================================================================
//  Address scanning — list recent transaction hashes that paid OUR
//  receiving address for a given method, newest first. Used by the
//  auto-detect polling (/api/purchase/scan): each candidate is then run
//  through verifyPayment() for the authoritative amount/confirmation/
//  window/uniqueness checks before any coins are credited.
//  EVM-native (plain ETH/BNB sends) has no efficient incoming index over
//  public RPC, so it returns [] — those orders fall back to manual hash.
// =====================================================================
export async function scanIncoming(methodId: string): Promise<string[]> {
  const cfg = CHAIN_CONFIG[methodId];
  if (!cfg) return [];
  try {
    let hashes: string[] = [];
    switch (cfg.kind) {
      case "tron-token": hashes = await scanTronToken(cfg); break;
      case "tron-native": hashes = await scanTronNative(cfg); break;
      case "evm-token": hashes = await scanEvmToken(cfg); break;
      case "btc": hashes = await scanBtc(cfg); break;
      case "sol-token":
      case "sol-native": hashes = await scanSol(cfg); break;
      case "xrp": hashes = await scanXrp(cfg); break;
      case "xlm": hashes = await scanXlm(cfg); break;
      default: hashes = [];
    }
    return [...new Set(hashes.filter(Boolean))].slice(0, 15);
  } catch {
    return []; // transient explorer/RPC error — the next poll retries
  }
}

async function scanTronToken(cfg: ChainConfig): Promise<string[]> {
  const j = await getJson(
    `${TRON_API}/v1/accounts/${cfg.address}/transactions/trc20?only_to=true&limit=30&contract_address=${cfg.tokenContract}`
  );
  return (j?.data ?? []).map((t: any) => t.transaction_id);
}

async function scanTronNative(cfg: ChainConfig): Promise<string[]> {
  const j = await getJson(`${TRON_API}/v1/accounts/${cfg.address}/transactions?only_to=true&limit=30`);
  return (j?.data ?? []).map((t: any) => t.txID);
}

async function scanEvmToken(cfg: ChainConfig): Promise<string[]> {
  const head = await rpc(cfg.rpc!, "eth_blockNumber", []);
  const fromBlock = "0x" + (BigInt(head) - BigInt(800)).toString(16); // ~last hour, well over the 10-min window
  const topicTo = "0x" + cfg.address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const logs = await rpc(cfg.rpc!, "eth_getLogs", [
    { fromBlock, toBlock: "latest", address: cfg.tokenContract, topics: [ERC20_TRANSFER, null, topicTo] },
  ]);
  // Logs come oldest-first; reverse so the newest candidates are tried first.
  return (logs ?? []).map((l: any) => l.transactionHash).reverse();
}

async function scanBtc(cfg: ChainConfig): Promise<string[]> {
  const txs = await getJson(`https://blockstream.info/api/address/${cfg.address}/txs`);
  return (txs ?? [])
    .filter((tx: any) => (tx.vout ?? []).some((v: any) => v.scriptpubkey_address === cfg.address))
    .map((tx: any) => tx.txid);
}

async function scanSol(cfg: ChainConfig): Promise<string[]> {
  const sigs = await rpc(SOL_RPC, "getSignaturesForAddress", [cfg.address, { limit: 30 }]);
  return (sigs ?? []).map((s: any) => s.signature);
}

async function scanXrp(cfg: ChainConfig): Promise<string[]> {
  const j = await getJson("https://s1.ripple.com:51234/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      method: "account_tx",
      params: [{ account: cfg.address, limit: 20, ledger_index_min: -1, ledger_index_max: -1 }],
    }),
  });
  return (j?.result?.transactions ?? []).map((t: any) => t.tx?.hash ?? t.hash);
}

async function scanXlm(cfg: ChainConfig): Promise<string[]> {
  const j = await getJson(`https://horizon.stellar.org/accounts/${cfg.address}/payments?order=desc&limit=20`);
  return (j?._embedded?.records ?? []).map((r: any) => r.transaction_hash);
}

// --- dispatch ---------------------------------------------------------

export async function verifyPayment(
  methodId: string,
  txHash: string,
  expectedAmount: number,
  orderCreatedAtMs: number
): Promise<VerifyResult> {
  const cfg = CHAIN_CONFIG[methodId];
  if (!cfg) return fail("Unsupported payment method.");

  const tx = txHash.trim();
  if (!tx) return fail("Enter the transaction hash / ID.");

  let res: VerifyResult;
  try {
    switch (cfg.kind) {
      case "btc": res = await verifyBtc(cfg, tx); break;
      case "evm-native": res = await verifyEvmNative(cfg, tx); break;
      case "evm-token": res = await verifyEvmToken(cfg, tx); break;
      case "tron-native": res = await verifyTronNative(cfg, tx); break;
      case "tron-token": res = await verifyTronToken(cfg, tx); break;
      case "sol-native": res = await verifySolNative(cfg, tx); break;
      case "sol-token": res = await verifySolToken(cfg, tx); break;
      case "xrp": res = await verifyXrp(cfg, tx); break;
      case "xlm": res = await verifyXlm(cfg, tx); break;
      default: return fail("Unsupported chain.");
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not verify the transaction.");
  }

  if (!res.ok) return res;
  if (!res.confirmed) {
    return { ...res, ok: false, reason: "Transaction found but not yet confirmed. Try again shortly." };
  }
  if (res.paid + 1e-12 < expectedAmount * (1 - AMOUNT_TOLERANCE)) {
    return {
      ...res,
      ok: false,
      reason: `Underpaid: received ${res.paid}, expected ${expectedAmount}.`,
    };
  }

  // Enforce the 10-minute payment window against the transaction's own
  // on-chain timestamp, so an older/unrelated payment to the same address
  // can't be replayed and late payments are rejected.
  if (!res.timestamp) {
    return { ...res, ok: false, reason: "Transaction time not available yet. Try again shortly." };
  }
  const txMs = res.timestamp * 1000;
  if (txMs < orderCreatedAtMs - CLOCK_SKEW_MS) {
    return {
      ...res,
      ok: false,
      reason: "This transaction predates the order. Start a new checkout and pay the amount shown.",
    };
  }
  if (txMs > orderCreatedAtMs + PAYMENT_WINDOW_MS + CLOCK_SKEW_MS) {
    return {
      ...res,
      ok: false,
      reason: "The 10-minute payment window has expired. Start a new checkout.",
    };
  }

  return res;
}

function fail(reason: string): VerifyResult {
  return { ok: false, paid: 0, confirmed: false, reason };
}

// --- helpers ----------------------------------------------------------

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Explorer error (${res.status}).`);
  return res.json();
}

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC error (${res.status}).`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "RPC error.");
  return j.result;
}

// Base58 decode (for converting a TRON base58 address to its hex form).
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(str: string): number[] {
  const bytes: number[] = [0];
  for (const ch of str) {
    const val = B58.indexOf(ch);
    if (val < 0) throw new Error("Invalid base58 character.");
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of str) {
    if (ch === "1") bytes.push(0);
    else break;
  }
  return bytes.reverse();
}

// TRON base58 address -> 21-byte hex ("41" + 20 bytes), lowercased.
function tronToHex(address: string): string {
  const decoded = base58Decode(address);
  const body = decoded.slice(0, decoded.length - 4); // strip 4-byte checksum
  return body.map((b) => b.toString(16).padStart(2, "0")).join("").toLowerCase();
}

// --- Bitcoin (Blockstream) -------------------------------------------

async function verifyBtc(cfg: ChainConfig, txid: string): Promise<VerifyResult> {
  const tx = await getJson(`https://blockstream.info/api/tx/${txid}`);
  if (!tx) return fail("Transaction not found.");

  let sats = 0;
  for (const vout of tx.vout ?? []) {
    if (vout.scriptpubkey_address === cfg.address) sats += vout.value;
  }
  if (sats === 0) return fail("This transaction does not pay the expected Bitcoin address.");

  const tip = await getJson(`https://blockstream.info/api/blocks/tip/height`);
  const confirmed = tx.status?.confirmed === true;
  const confirmations = confirmed ? Number(tip) - Number(tx.status.block_height) + 1 : 0;

  return {
    ok: true,
    paid: sats / 10 ** cfg.decimals,
    confirmed: confirmed && confirmations >= cfg.minConfirmations,
    timestamp: tx.status?.block_time, // unix seconds, set once mined
  };
}

// --- EVM (Ethereum / BNB Smart Chain) --------------------------------

async function evmBlockInfo(
  rpcUrl: string,
  blockNumberHex: string | null
): Promise<{ confirmations: number; timestamp: number }> {
  if (!blockNumberHex) return { confirmations: 0, timestamp: 0 };
  const head = await rpc(rpcUrl, "eth_blockNumber", []);
  const block = await rpc(rpcUrl, "eth_getBlockByNumber", [blockNumberHex, false]);
  return {
    confirmations: Number(BigInt(head) - BigInt(blockNumberHex)) + 1,
    timestamp: block?.timestamp ? Number(BigInt(block.timestamp)) : 0,
  };
}

async function verifyEvmNative(cfg: ChainConfig, hash: string): Promise<VerifyResult> {
  const tx = await rpc(cfg.rpc!, "eth_getTransactionByHash", [hash]);
  if (!tx) return fail("Transaction not found.");
  const receipt = await rpc(cfg.rpc!, "eth_getTransactionReceipt", [hash]);
  if (!receipt) return { ok: true, paid: 0, confirmed: false };
  if (receipt.status !== "0x1") return fail("Transaction failed on-chain.");

  if ((tx.to ?? "").toLowerCase() !== cfg.address.toLowerCase()) {
    return fail("This transaction does not pay the expected address.");
  }
  const paid = Number(BigInt(tx.value)) / 10 ** cfg.decimals;
  const { confirmations, timestamp } = await evmBlockInfo(cfg.rpc!, tx.blockNumber);
  return { ok: true, paid, confirmed: confirmations >= cfg.minConfirmations, timestamp };
}

const ERC20_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function verifyEvmToken(cfg: ChainConfig, hash: string): Promise<VerifyResult> {
  const receipt = await rpc(cfg.rpc!, "eth_getTransactionReceipt", [hash]);
  if (!receipt) {
    // Maybe still pending — distinguish "unknown" from "not yet mined".
    const tx = await rpc(cfg.rpc!, "eth_getTransactionByHash", [hash]);
    if (!tx) return fail("Transaction not found.");
    return { ok: true, paid: 0, confirmed: false };
  }
  if (receipt.status !== "0x1") return fail("Transaction failed on-chain.");

  const contract = cfg.tokenContract!.toLowerCase();
  const want = cfg.address.toLowerCase().replace(/^0x/, "");
  let units = BigInt(0);
  for (const log of receipt.logs ?? []) {
    if ((log.address ?? "").toLowerCase() !== contract) continue;
    if ((log.topics?.[0] ?? "").toLowerCase() !== ERC20_TRANSFER) continue;
    const to = (log.topics?.[2] ?? "").toLowerCase().slice(-40); // last 20 bytes
    if (to !== want) continue;
    units += BigInt(log.data);
  }
  if (units === BigInt(0)) return fail("This transaction does not transfer USDT to the expected address.");

  const { confirmations, timestamp } = await evmBlockInfo(cfg.rpc!, receipt.blockNumber);
  return {
    ok: true,
    paid: Number(units) / 10 ** cfg.decimals,
    confirmed: confirmations >= cfg.minConfirmations,
    timestamp,
  };
}

// --- TRON (TronGrid) -------------------------------------------------

async function tronConfirmations(infoBlock: number | undefined): Promise<number> {
  if (!infoBlock) return 0;
  const now = await getJson(`${TRON_API}/wallet/getnowblock`);
  const head = now?.block_header?.raw_data?.number ?? 0;
  return head - infoBlock + 1;
}

async function verifyTronNative(cfg: ChainConfig, txid: string): Promise<VerifyResult> {
  const tx = await getJson(`${TRON_API}/wallet/gettransactionbyid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: txid }),
  });
  if (!tx || !tx.txID) return fail("Transaction not found.");
  if (tx.ret?.[0]?.contractRet && tx.ret[0].contractRet !== "SUCCESS") {
    return fail("Transaction failed on-chain.");
  }
  const c = tx.raw_data?.contract?.[0];
  if (c?.type !== "TransferContract") return fail("Not a TRX transfer.");
  const v = c.parameter?.value ?? {};
  if ((v.to_address ?? "").toLowerCase() !== tronToHex(cfg.address)) {
    return fail("This transaction does not pay the expected TRON address.");
  }
  const info = await getJson(`${TRON_API}/wallet/gettransactioninfobyid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: txid }),
  });
  const confirmations = await tronConfirmations(info?.blockNumber);
  return {
    ok: true,
    paid: Number(v.amount ?? 0) / 10 ** cfg.decimals,
    confirmed: confirmations >= cfg.minConfirmations,
    timestamp: info?.blockTimeStamp ? Math.floor(info.blockTimeStamp / 1000) : 0,
  };
}

async function verifyTronToken(cfg: ChainConfig, txid: string): Promise<VerifyResult> {
  const tx = await getJson(`${TRON_API}/wallet/gettransactionbyid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: txid }),
  });
  if (!tx || !tx.txID) return fail("Transaction not found.");
  if (tx.ret?.[0]?.contractRet && tx.ret[0].contractRet !== "SUCCESS") {
    return fail("Transaction failed on-chain.");
  }
  const c = tx.raw_data?.contract?.[0];
  if (c?.type !== "TriggerSmartContract") return fail("Not a TRC-20 transfer.");
  const v = c.parameter?.value ?? {};
  if ((v.contract_address ?? "").toLowerCase() !== tronToHex(cfg.tokenContract!)) {
    return fail("This transaction is not a USDT (TRC-20) transfer.");
  }
  // data = selector(4) + to(32) + amount(32)
  const data: string = (v.data ?? "").toLowerCase();
  if (!data.startsWith("a9059cbb") || data.length < 136) return fail("Not a TRC-20 transfer call.");
  const to = "41" + data.slice(32, 72); // 20-byte address with TRON prefix
  if (to !== tronToHex(cfg.address)) {
    return fail("This transaction does not pay the expected TRON address.");
  }
  const units = BigInt("0x" + data.slice(72, 136));
  const info = await getJson(`${TRON_API}/wallet/gettransactioninfobyid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: txid }),
  });
  const confirmations = await tronConfirmations(info?.blockNumber);
  return {
    ok: true,
    paid: Number(units) / 10 ** cfg.decimals,
    confirmed: confirmations >= cfg.minConfirmations,
    timestamp: info?.blockTimeStamp ? Math.floor(info.blockTimeStamp / 1000) : 0,
  };
}

// --- Solana ----------------------------------------------------------

async function getSolTx(sig: string): Promise<any> {
  return rpc(SOL_RPC, "getTransaction", [
    sig,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "finalized" },
  ]);
}

async function verifySolNative(cfg: ChainConfig, sig: string): Promise<VerifyResult> {
  const tx = await getSolTx(sig);
  if (!tx) return { ok: true, paid: 0, confirmed: false }; // not yet finalized / unknown
  if (tx.meta?.err) return fail("Transaction failed on-chain.");

  const keys: any[] = tx.transaction?.message?.accountKeys ?? [];
  const idx = keys.findIndex((k) => (typeof k === "string" ? k : k.pubkey) === cfg.address);
  if (idx < 0) return fail("This transaction does not involve the expected address.");
  const delta = (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / 10 ** cfg.decimals;
  if (delta <= 0) return fail("No SOL was received at the expected address.");
  return { ok: true, paid: delta, confirmed: true, timestamp: tx.blockTime ?? 0 }; // finalized => final
}

async function verifySolToken(cfg: ChainConfig, sig: string): Promise<VerifyResult> {
  const tx = await getSolTx(sig);
  if (!tx) return { ok: true, paid: 0, confirmed: false };
  if (tx.meta?.err) return fail("Transaction failed on-chain.");

  const post: any[] = tx.meta?.postTokenBalances ?? [];
  const pre: any[] = tx.meta?.preTokenBalances ?? [];
  const match = post.find((b) => b.mint === cfg.tokenMint && b.owner === cfg.address);
  if (!match) return fail("This transaction does not transfer USDT to the expected address.");
  const before = pre.find((b) => b.accountIndex === match.accountIndex);
  const delta =
    Number(match.uiTokenAmount?.uiAmount ?? 0) - Number(before?.uiTokenAmount?.uiAmount ?? 0);
  if (delta <= 0) return fail("No USDT was received at the expected address.");
  return { ok: true, paid: delta, confirmed: true, timestamp: tx.blockTime ?? 0 };
}

// --- XRP Ledger ------------------------------------------------------

async function verifyXrp(cfg: ChainConfig, hash: string): Promise<VerifyResult> {
  const j = await getJson("https://s1.ripple.com:51234/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method: "tx", params: [{ transaction: hash, binary: false }] }),
  });
  const r = j?.result;
  if (!r || r.status === "error") return fail("Transaction not found.");
  if (r.TransactionType !== "Payment") return fail("Not an XRP payment.");
  if (r.Destination !== cfg.address) return fail("This transaction does not pay the expected XRP address.");
  if (r.meta?.TransactionResult && r.meta.TransactionResult !== "tesSUCCESS") {
    return fail("Transaction failed on-chain.");
  }

  const delivered = r.meta?.delivered_amount ?? r.Amount;
  if (typeof delivered !== "string") return fail("Payment was not in XRP."); // issued currency => object
  // XRP `date` is seconds since the Ripple epoch (2000-01-01) → unix seconds.
  const timestamp = typeof r.date === "number" ? r.date + 946684800 : 0;
  return {
    ok: true,
    paid: Number(delivered) / 10 ** cfg.decimals,
    confirmed: r.validated === true,
    timestamp,
  };
}

// --- Stellar (Horizon) -----------------------------------------------

async function verifyXlm(cfg: ChainConfig, hash: string): Promise<VerifyResult> {
  const tx = await getJson(`https://horizon.stellar.org/transactions/${hash}`);
  if (!tx) return fail("Transaction not found.");
  if (tx.successful === false) return fail("Transaction failed on-chain.");

  const ops = await getJson(`https://horizon.stellar.org/transactions/${hash}/operations`);
  const records: any[] = ops?._embedded?.records ?? [];
  let paid = 0;
  for (const op of records) {
    const isPayment = op.type === "payment" || op.type === "create_account";
    const to = op.to ?? op.account; // create_account uses `account`
    const amount = op.amount ?? op.starting_balance;
    if (isPayment && to === cfg.address && (op.asset_type === "native" || op.type === "create_account")) {
      paid += Number(amount);
    }
  }
  if (paid === 0) return fail("This transaction does not pay XLM to the expected address.");
  const ts = tx.created_at ? Math.floor(Date.parse(tx.created_at) / 1000) : 0;
  return { ok: true, paid, confirmed: true, timestamp: ts || undefined }; // Stellar = immediate finality
}
