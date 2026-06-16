"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import NetworkIcon from "@/components/NetworkIcon";

export type CheckoutOrder = {
  order_id: string;
  method_id: string;
  item: string; // order summary line, e.g. "100 Silver"
  address: string;
  pay_amount: number;
  asset: string;
  network: string;
  memo: string | null;
  usd: number;
};

const WINDOW_SECONDS = 10 * 60; // 10-minute payment window

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
      aria-label={`Copy ${label}`}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition ${
        done
          ? "border-emerald-300/40 text-emerald-300"
          : "border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <ClipboardIcon done={done} />
      {done ? "Copied" : "Copy"}
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
}: {
  order: CheckoutOrder;
  txHash: string;
  onTxHash: (v: string) => void;
  onVerify: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  // Countdown from 10:00. Resets whenever a new order is shown.
  const [left, setLeft] = useState(WINDOW_SECONDS);
  useEffect(() => {
    setLeft(WINDOW_SECONDS);
    const t = setInterval(() => setLeft((s) => (s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
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
            <h2 className="text-lg font-bold">Checkout</h2>
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-300">
              <LockIcon /> Secure payment
            </span>
          </div>
          <button onClick={onCancel} aria-label="Close" className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="max-h-[85vh] space-y-3 overflow-y-auto p-4">
          {/* Order summary */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Order summary</p>
            <div className="space-y-2">
              <Row label="Item">{order.item}</Row>
              <Row label="Pay with">
                <span className="inline-flex items-center gap-2">
                  <NetworkIcon methodId={order.method_id} size={18} />
                  {order.asset} · {order.network}
                </span>
              </Row>
            </div>
            <div className="my-3 h-px bg-white/10" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-300">Total</span>
              <span className="text-2xl font-extrabold text-amber-300">${order.usd.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment panel */}
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-400">Amount due</p>
                <p className="mt-0.5 font-mono text-xl font-bold text-amber-100">
                  {order.pay_amount} {order.asset}
                </p>
              </div>
              <CopyButton text={String(order.pay_amount)} label="amount" />
            </div>

            <div className="mt-3 flex justify-center">
              <div className="rounded-xl bg-white p-2">
                <QRCodeSVG value={order.address} size={124} level="M" />
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">Scan to pay, or copy the address below</p>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-400">Recipient address</p>
                <CopyButton text={order.address} label="address" />
              </div>
              <p className="mt-1 break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-sm text-slate-200">
                {order.address}
              </p>
            </div>

            <div className={`mt-4 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold tabular-nums ${timerTone}`}>
              <ClockIcon />
              {expired ? "Payment window expired" : <span>Time remaining {mm}:{ss}</span>}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Send only <b className="text-slate-300">{order.asset}</b> over{" "}
            <b className="text-slate-300">{order.network}</b>. The amount must match (small rounding is
            fine) or the payment can&apos;t be verified.
          </p>
          {order.memo && <p className="text-xs text-slate-500">{order.memo}</p>}

          {expired ? (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              This checkout expired. Close and start again for a fresh 10-minute window.
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-slate-400">
                  Not detected automatically? Paste your transaction hash to confirm
                </label>
                <input
                  value={txHash}
                  onChange={(e) => onTxHash(e.target.value)}
                  placeholder="0x… / transaction id"
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
                {busy ? "Verifying on-chain…" : "I've paid — verify payment"}
              </button>
            </>
          )}

          <button
            onClick={onCancel}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-white/5"
          >
            {expired ? "Start again" : "Cancel"}
          </button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <LockIcon /> Verified directly on-chain — no third-party processor.
          </p>
        </div>
      </div>
    </div>
  );
}
