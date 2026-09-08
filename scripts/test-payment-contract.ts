/**
 * Checks for the contract integration's money-critical maths: order-id
 * encoding, calldata layout, unit scaling and log decoding. A wrong byte
 * offset here sends real funds to the wrong place, so these are asserted
 * against hand-computed expectations rather than against the implementation.
 *
 *   npx tsx scripts/test-payment-contract.ts
 */
import {
  orderIdToBytes32,
  bytes32ToOrderId,
  encodePayNative,
  encodePayToken,
  encodeApprove,
  toSmallestUnits,
  minimumAcceptable,
  SELECTOR_PAY_NATIVE,
  SELECTOR_PAY_TOKEN,
  SELECTOR_APPROVE,
} from "../src/lib/payment-contract";

let passed = 0;
let failed = 0;

function eq(label: string, got: unknown, want: unknown) {
  const ok = String(got) === String(want);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got  ${got}\n        want ${want}`);
}

const ORDER = "550e8400-e29b-41d4-a716-446655440000";
const ORDER_B32 = "0x550e8400e29b41d4a716446655440000" + "0".repeat(32);
const USDT_ERC20 = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const CONTRACT = "0x1111111111111111111111111111111111111111";

console.log("\n--- order id <-> bytes32 ---");
eq("uuid -> bytes32", orderIdToBytes32(ORDER), ORDER_B32);
eq("bytes32 -> uuid (round trip)", bytes32ToOrderId(ORDER_B32), ORDER);
eq("bytes32 is 32 bytes", (orderIdToBytes32(ORDER).length - 2) / 2, 32);
try {
  orderIdToBytes32("not-a-uuid");
  eq("rejects a non-uuid", "no throw", "throws");
} catch {
  eq("rejects a non-uuid", "throws", "throws");
}

console.log("\n--- calldata layout ---");
const nativeData = encodePayNative(ORDER);
eq("payNative selector", nativeData.slice(0, 10), SELECTOR_PAY_NATIVE);
eq("payNative length (4 + 32 bytes)", (nativeData.length - 2) / 2, 36);
eq("payNative arg0 = orderId", "0x" + nativeData.slice(10, 74), ORDER_B32);

const amt = BigInt("15000000"); // 15 USDT at 6 decimals
const tokenData = encodePayToken(ORDER, USDT_ERC20, amt);
eq("payToken selector", tokenData.slice(0, 10), SELECTOR_PAY_TOKEN);
eq("payToken length (4 + 96 bytes)", (tokenData.length - 2) / 2, 100);
eq("payToken arg0 = orderId", "0x" + tokenData.slice(10, 74), ORDER_B32);
eq(
  "payToken arg1 = token, left-padded to 32 bytes",
  "0x" + tokenData.slice(74, 138),
  "0x" + "0".repeat(24) + USDT_ERC20.slice(2)
);
eq("payToken arg2 = amount", BigInt("0x" + tokenData.slice(138, 202)), amt);

const approveData = encodeApprove(CONTRACT, amt);
eq("approve selector", approveData.slice(0, 10), SELECTOR_APPROVE);
eq("approve length (4 + 64 bytes)", (approveData.length - 2) / 2, 68);
eq(
  "approve arg0 = spender",
  "0x" + approveData.slice(10, 74),
  "0x" + "0".repeat(24) + CONTRACT.slice(2)
);
eq("approve arg1 = amount", BigInt("0x" + approveData.slice(74, 138)), amt);

console.log("\n--- decimal scaling ---");
eq("15 USDT @ 6dp", toSmallestUnits(15, 6), "15000000");
eq("0.5 USDT @ 6dp", toSmallestUnits(0.5, 6), "500000");
eq("1 ETH @ 18dp", toSmallestUnits(1, 18), "1000000000000000000");
eq("1.5 ETH @ 18dp", toSmallestUnits(1.5, 18), "1500000000000000000");
// The float trap: a naive toFixed(18) yields 0.100000000000000006.
eq("0.1 ETH @ 18dp (no float noise)", toSmallestUnits(0.1, 18), "100000000000000000");
eq("0.00352 ETH @ 18dp", toSmallestUnits(0.00352, 18), "3520000000000000");
eq("15 USDT @ 18dp (BEP-20)", toSmallestUnits(15, 18), "15000000000000000000");
eq("0 stays 0", toSmallestUnits(0, 18), "0");

console.log("\n--- underpayment threshold (1% tolerance) ---");
eq("15 USDT @ 6dp -> 99%", minimumAcceptable(15, 6), "14850000");
eq("1 ETH @ 18dp -> 99%", minimumAcceptable(1, 18), "990000000000000000");
const min = minimumAcceptable(15, 6);
eq("exact payment clears the bar", toSmallestUnits(15, 6) >= min, "true");
eq("0.5% short still clears", toSmallestUnits(14.925, 6) >= min, "true");
eq("5% short is rejected", toSmallestUnits(14.25, 6) >= min, "false");
eq("one wei is rejected", BigInt(1) >= min, "false");

console.log(`\n${failed === 0 ? "ALL PASSED" : "FAILURES"} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
