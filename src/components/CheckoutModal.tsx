"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import NetworkIcon from "@/components/NetworkIcon";
import RichText from "@/components/RichText";
import { useI18n } from "@/lib/i18n/provider";
import { formatUsdAsJpy } from "@/lib/fx-book";

export type CheckoutOrder = {
  order_id: string;
  method_id: string;
  item: string; // order summary line, e.g. "100 Silver"
  address: string;
  pay_amount: number;
  asset: string;
  network: string;
  memo: string | null; // message key returned by the API
  usd: number;
  // Present when LuckyCoinPayments is deployed for this chain. Paying through
  // it stamps the order id into the transaction, so the order settles the
  // moment the event lands. Sending to `address` by hand still works.
  contract?: ContractCheckout | null;
};

type ContractCheckout = {
  address: string;
  chainId: number;
  chainIdHex: string;
  orderIdHex: string;
  data: string;
  value: string; // wei, decimal string
  token: string | null;
  amount: string; // smallest units, decimal string
  approve: { to: string; data: string } | null;
};

// The subset of EIP-1193 we use. Typed locally so the app takes no wallet SDK.
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const getWallet = (): Eip1193 | null =>
  typeof window !== "undefined" && "ethereum" in window
    ? ((window as unknown as { ethereum: Eip1193 }).ethereum ?? null)
    : null;

const toHex = (decimal: string) => `0x${BigInt(decimal).toString(16)}`;

// Chains a wallet may not know about yet, so we can offer to add them.
const ADD_CHAIN: Record<number, Record<string, unknown>> = {
  56: {
    chainId: "0x38",
    chainName: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc-dataseed.binance.org"],
    blockExplorerUrls: ["https://bscscan.com"],
  },
};

const WINDOW_SECONDS = 10 * 60; // 10-minute payment window

/**
 * One-click payment through the LuckyCoinPayments contract.
 *
 * The order id is already baked into `contract.data` by the server, so the
 * transaction the wallet signs is self-identifying: the backend settles it from
 * the emitted event rather than by matching amounts. For tokens this walks the
 * buyer through the standard approve-then-pay pair.
 */
function WalletPayButton({
  contract,
  onSent,
  onError,
}: {
  contract: ContractCheckout;
  onSent: (hash: string) => void;
  onError: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<null | "connect" | "approve" | "pay">(null);
  const busy = step !== null;

  // Poll for a receipt; wallets give us a hash long before it is mined and the
  // approval must actually land before payToken can spend the allowance.
  async function waitForReceipt(w: Eip1193, hash: string) {
    for (let i = 0; i < 120; i++) {
      const r = await w.request({ method: "eth_getTransactionReceipt", params: [hash] });
      if (r) {
        const status = (r as { status?: string }).status;
        if (status !== undefined && BigInt(status) !== BigInt(1)) throw new Error(t("checkout.walletReverted"));
        return;
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
    throw new Error(t("checkout.walletTimeout"));
  }

  async function pay() {
    const w = getWallet();
    if (!w) return onError(t("checkout.walletNotFound"));

    try {
      setStep("connect");
      const accounts = (await w.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts?.[0];
      if (!from) throw new Error(t("checkout.walletNoAccount"));

      // Make sure the wallet is on the chain this order is priced for —
      // otherwise the buyer would pay the right amount on the wrong network.
      try {
        await w.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: contract.chainIdHex }],
        });
      } catch (e) {
        // 4902 = the wallet doesn't have this chain configured yet.
        if ((e as { code?: number })?.code === 4902 && ADD_CHAIN[contract.chainId]) {
          await w.request({
            method: "wallet_addEthereumChain",
            params: [ADD_CHAIN[contract.chainId]],
          });
        } else throw e;
      }

      // ERC-20 leg: make sure the contract is allowed to move exactly this much.
      if (contract.approve && contract.token) {
        setStep("approve");
        const need = BigInt(contract.amount);

        // allowance(owner,spender) — skip a redundant approval when possible.
        const allowanceData =
          "0xdd62ed3e" +
          from.replace(/^0x/, "").toLowerCase().padStart(64, "0") +
          contract.address.replace(/^0x/, "").toLowerCase().padStart(64, "0");
        const raw = (await w.request({
          method: "eth_call",
          params: [{ to: contract.token, data: allowanceData }, "latest"],
        })) as string;
        const current = raw && raw !== "0x" ? BigInt(raw) : BigInt(0);

        if (current < need) {
          // Tether refuses to change a non-zero allowance directly, so it has
          // to be zeroed first. Harmless on well-behaved tokens.
          if (current > BigInt(0)) {
            const zero =
              "0x095ea7b3" +
              contract.address.replace(/^0x/, "").toLowerCase().padStart(64, "0") +
              "0".repeat(64);
            const h = (await w.request({
              method: "eth_sendTransaction",
              params: [{ from, to: contract.token, data: zero }],
            })) as string;
            await waitForReceipt(w, h);
          }
          const h = (await w.request({
            method: "eth_sendTransaction",
            params: [{ from, to: contract.approve.to, data: contract.approve.data }],
          })) as string;
          await waitForReceipt(w, h);
        }
      }

      setStep("pay");
      const params: Record<string, string> = {
        from,
        to: contract.address,
        data: contract.data,
      };
      if (contract.value !== "0") params.value = toHex(contract.value);

      const hash = (await w.request({ method: "eth_sendTransaction", params: [params] })) as string;
      onSent(hash);
    } catch (e) {
      const err = e as { code?: number; message?: string };
      // 4001 = the buyer dismissed the wallet prompt; not an error worth shouting about.
      if (err?.code !== 4001) onError(err?.message || t("checkout.walletFailed"));
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-3">
      <button onClick={pay} disabled={busy} className="btn-gold w-full text-sm disabled:opacity-60">
        {step === "connect"
          ? t("checkout.walletConnecting")
          : step === "approve"
            ? t("checkout.walletApproving")
            : step === "pay"
              ? t("checkout.walletPaying")
              : t("checkout.payWithWallet")}
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-400">{t("checkout.walletHint")}</p>
    </div>
  );
}

function ClipboardIcon({ done }: { done: boolean }) {
  return done ? (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard blocked — the value can still be selected manually */
    }
  }
  return (
    <button
      onClick={copy}
      aria-label={t("checkout.copyAria", { label })}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition ${
        done
          ? "border-emerald-300/40 text-emerald-300"
          : "border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <ClipboardIcon done={done} />
      {done ? t("checkout.copied") : t("checkout.copy")}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-200">{children}</span>
    </div>
  );
}

export default function CheckoutModal({
  order,
  txHash,
  onTxHash,
  onVerify,
  onCancel,
  busy,
  error,
  memo,
}: {
  order: CheckoutOrder;
  txHash: string;
  onTxHash: (v: string) => void;
  onVerify: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  /** Already-translated memo note for chains that need a destination tag. */
  memo?: string;
}) {
  const { t, locale } = useI18n();

  // Wallet errors are shown next to the button rather than in the page-level
  // error slot, which belongs to the manual verify flow.
  const [walletError, setWalletError] = useState<string | null>(null);

  // Countdown from 10:00. Resets whenever a new order is shown.
  const [left, setLeft] = useState(WINDOW_SECONDS);
  useEffect(() => {
    setLeft(WINDOW_SECONDS);
    const timer = setInterval(() => setLeft((s) => (s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(timer);
  }, [order.order_id]);

  const expired = left <= 0;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const timerTone = expired
    ? "border-red-400/30 bg-red-400/10 text-red-300"
    : left <= 120
      ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
      : "border-emerald-300/30 bg-emerald-300/10 text-emerald-200";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="w-full max-w-md overflow-hidden rounded-[2px] border border-white/10 bg-black text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">{t("checkout.title")}</h2>
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-300">
              <LockIcon /> {t("checkout.secure")}
            </span>
          </div>
          <button onClick={onCancel} aria-label={t("common.close")} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="max-h-[85vh] space-y-3 overflow-y-auto p-4">
          {/* Order summary */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("checkout.orderSummary")}
            </p>
            <div className="space-y-2">
              <Row label={t("checkout.item")}>{order.item}</Row>
              <Row label={t("checkout.payWith")}>
                <span className="inline-flex items-center gap-2">
                  <NetworkIcon methodId={order.method_id} size={18} />
                  {order.asset} · {order.network}
                </span>
              </Row>
            </div>
            <div className="my-3 h-px bg-white/10" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-300">{t("checkout.total")}</span>
              <span className="text-right">
                <span className="block text-2xl font-extrabold text-amber-300">
                  {locale === "ja" ? formatUsdAsJpy(order.usd) : `$${order.usd.toFixed(2)}`}
                </span>
                {locale === "ja" && (
                  <span className="block text-xs text-slate-400">${order.usd.toFixed(2)}</span>
                )}
              </span>
            </div>
          </div>

          {/* Payment panel */}
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-400">{t("checkout.amountDue")}</p>
                <p className="mt-0.5 font-mono text-xl font-bold text-amber-100">
                  {order.pay_amount} {order.asset}
                </p>
              </div>
              <CopyButton text={String(order.pay_amount)} label={t("checkout.labelAmount")} />
            </div>

            {order.contract && !expired && (
              <div className="mt-3">
                <WalletPayButton
                  contract={order.contract}
                  onSent={onTxHash}
                  onError={setWalletError}
                />
                {walletError && (
                  <p className="mt-2 break-words rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">
                    {walletError}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="h-px flex-1 bg-white/10" />
                  {t("checkout.walletOrManual")}
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </div>
            )}

            <div className="mt-3 flex justify-center">
              <div className="rounded-xl bg-white p-2">
                <QRCodeSVG value={order.address} size={124} level="M" />
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">{t("checkout.scanToPay")}</p>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-400">{t("checkout.recipient")}</p>
                <CopyButton text={order.address} label={t("checkout.labelAddress")} />
              </div>
              <p className="mt-1 break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-sm text-slate-200">
                {order.address}
              </p>
            </div>

            <div className={`mt-4 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold tabular-nums ${timerTone}`}>
              <ClockIcon />
              {expired ? t("checkout.expired") : <span>{t("checkout.timeLeft", { time: `${mm}:${ss}` })}</span>}
            </div>
          </div>

          <RichText
            as="p"
            className="text-xs text-slate-500"
            k="checkout.warning"
            vars={{ asset: order.asset, network: order.network }}
          />
          {memo && <p className="text-xs text-slate-500">{memo}</p>}

          {expired ? (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {t("checkout.expiredBody")}
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-slate-400">{t("checkout.txLabel")}</label>
                <input
                  value={txHash}
                  onChange={(e) => onTxHash(e.target.value)}
                  placeholder={t("checkout.txPlaceholder")}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20"
                />
              </div>
              {error && (
                <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>
              )}
              <button
                onClick={onVerify}
                disabled={busy || !txHash.trim()}
                className="w-full rounded-lg bg-amber-400 px-4 py-2.5 font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {busy ? t("checkout.verifying") : t("checkout.iPaid")}
              </button>
            </>
          )}

          <button
            onClick={onCancel}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-white/5"
          >
            {expired ? t("checkout.startAgain") : t("common.cancel")}
          </button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <LockIcon /> {t("checkout.footer")}
          </p>
        </div>
      </div>
    </div>
  );
}
