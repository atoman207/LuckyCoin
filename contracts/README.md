# LuckyCoinPayments — automatic crypto settlement

`LuckyCoinPayments.sol` makes a crypto purchase settle itself. The buyer's
payment carries the order id, the contract emits an event, and the site credits
the coins the moment that event appears — no manual "paste your transaction
hash", no guessing which transfer belongs to which order.

## Why it exists

Without the contract, the backend matches payments heuristically: *"a transfer
of roughly the right amount, to our shared address, at roughly the right time."*
That is ambiguous by construction — two buyers purchasing the same pack in the
same minute is enough to confuse it, and nothing on-chain ties a transfer to an
order.

With the contract, the order id is part of the call:

```solidity
payNative(bytes32 orderId)                        // ETH, BNB
payToken(bytes32 orderId, address token, uint256) // USDT and other ERC-20s
```

Each emits `PaymentReceived(orderId, payer, token, amount)`. The backend asks
one precise question — *is there a `PaymentReceived` log for this order id?* —
and settles on the answer.

## Design

| Property | How |
| --- | --- |
| Never holds funds | Every payment forwards to `treasury` in the same transaction |
| One order, one payment | `paid[orderId]` is set **before** any external call |
| Reentrancy-safe | Checks-effects-interactions plus a `nonReentrant` guard |
| Works with Tether | Low-level ERC-20 calls that accept USDT's missing return value |
| Honest amounts | Emits the treasury's measured balance delta, not the requested amount |
| Protects mistakes | Plain transfers (no order id) **revert** instead of being swallowed |
| Recoverable | `rescue()` retrieves anything sent to the contract directly |
| Safe handover | Two-step ownership transfer; `setPaused` to stop new payments |

The contract deliberately does **not** know USD prices. Pricing stays on the
server, which must do that job anyway for Bitcoin, XRP and Stellar. The contract
guarantees *attribution*; the backend still enforces *sufficiency* (a 1% dust
tolerance) before crediting.

## Compile

```bash
npx solc@0.8.26 --optimize --optimize-runs 200 --bin --abi -o build contracts/LuckyCoinPayments.sol
```

Compiles clean on solc 0.8.26 with no warnings; ~3.8 KB of bytecode.

## Deploy

Deploy one instance per EVM chain. The constructor takes:

| Argument | Value |
| --- | --- |
| `_treasury` | The address that receives payments — your existing EVM receiving wallet, `0xb593a3dA1b311D08b9a4b46F5331A931c6aA5f1f` |
| `_owner` | Administrator. **Use a hardware wallet or a multisig**, not a hot key |

Easiest route is [Remix](https://remix.ethereum.org): paste the file, compile
with 0.8.26 + optimizer on, then deploy on "Injected Provider" with your wallet
switched to each network in turn.

Deploy to **Ethereum (chain 1)** and **BNB Smart Chain (chain 56)**. The TVM is
EVM-compatible, so the same source also deploys on **TRON** — but the app's
integration currently covers the two EVM chains only (see *Not yet wired up*).

Verify the source on Etherscan/BscScan afterwards so buyers can read what they
are calling.

## Configure the site

Add the deployed addresses to `.env.local` (and your Vercel project):

```bash
PAYMENT_CONTRACT_ETHEREUM=0x...   # chain 1
PAYMENT_CONTRACT_BSC=0x...        # chain 56
```

That is the whole switch. With the variable set, `/api/purchase` starts
returning wallet instructions, the checkout modal shows **Pay with wallet**, and
`/api/purchase/scan` settles from the event. With it unset, everything falls
back to the original address-scanning flow — so it is safe to deploy the code
before the contract exists.

## How settlement flows

1. `/api/purchase` creates the order and returns `contract` — the target
   address, the calldata (order id already encoded) and the value to attach.
2. The buyer presses **Pay with wallet**. For USDT the UI handles `approve`
   first, including Tether's quirk of refusing to change a non-zero allowance.
3. The contract forwards the funds to the treasury and emits `PaymentReceived`.
4. `/api/purchase/scan` (polled once a second while the modal is open) queries
   `eth_getLogs` filtered on the contract, the event signature **and the order
   id**. A hit credits the coins immediately.
5. `/api/purchase/verify` accepts a pasted hash too, checking the receipt for
   the same event as a fallback.

Both paths run through `creditPurchase()`, whose atomic `credited = false` claim
and unique `tx_hash` index mean a payment credits exactly once.

## Testing

The integration's money-critical maths — order-id encoding, calldata layout,
decimal scaling and the underpayment threshold — is covered by:

```bash
npx tsx scripts/test-payment-contract.ts
```

**Before mainnet, execute the contract on a testnet** (Sepolia / BSC testnet).
The Solidity has been compiled and reviewed but not yet run: deploy it, make one
native payment and one USDT payment, and confirm the coins land automatically.
A payment contract handling real money warrants that, and ideally an external
audit before it takes significant volume.

## Not yet wired up

- **TRON** — the contract deploys there, but TronGrid's log API differs from
  `eth_getLogs`, so `src/lib/payment-contract.ts` covers chains 1 and 56 only.
  TRC-20 payments keep the address-scanning flow.
- **Solana, Bitcoin, XRP, Stellar** — no EVM contract applies. Bitcoin, XRP and
  Stellar have no programmable settlement at all; these keep address scanning.
