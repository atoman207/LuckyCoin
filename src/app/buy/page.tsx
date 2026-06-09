"use client";

import { useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import { COIN_PACKS, type CoinPack } from "@/lib/coins";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/wallets";

type Order = {
  order_id: string;
  address: string;
  pay_amount: number;
  asset: string;
  network: string;
  memo: string | null;
  usd: number;
};

export default function BuyPage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const [selected, setSelected] = useState<CoinPack | null>(null);
  const [method, setMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0]);
  const [order, setOrder] = useState<Order | null>(null);
  const [txHash, setTxHash] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Log in to buy coins</h1>
        <button onClick={openAuth} className="btn-gold mt-6">Log in / Register</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-slate-400">Loading…</div>;

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — buyer can still select the text manually */
    }
  }

  async function createOrder() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ silver: selected.silver, method_id: method.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrder(data as Order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/purchase/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.order_id, tx_hash: txHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.profile) setProfile(data.profile);
      setDone(data.message ?? "Payment verified — silver added.");
      setOrder(null);
      setSelected(null);
      setTxHash("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setOrder(null);
    setTxHash("");
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Buy silver coins</h1>
          <p className="text-slate-400">Pay with cryptocurrency · 1 silver = $0.25 USDT</p>
        </div>
        <CoinBalance profile={profile} size={26} />
      </div>

      {done && (
        <div className="card animate-pop border-emerald-300/40 bg-emerald-300/10 px-4 py-3 text-center font-semibold text-emerald-100">
          ✓ {done}
        </div>
      )}
      {error && <div className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-red-300">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COIN_PACKS.map((pack) => {
          const per = pack.usd / pack.silver;
          const active = selected?.silver === pack.silver;
          return (
            <button
              key={pack.silver}
              onClick={() => !order && setSelected(pack)}
              disabled={!!order}
              className={`card relative flex flex-col items-center gap-2 p-6 text-center transition disabled:opacity-50 ${
                active ? "border-amber-300 ring-2 ring-amber-300" : "hover:border-white/25"
              }`}
            >
              {pack.tag && (
                <span className="absolute -top-2 right-3 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-900">
                  {pack.tag}
                </span>
              )}
              <CoinIcon type="silver" size={48} />
              <div className="text-lg font-bold">{pack.label}</div>
              <div className="text-2xl font-extrabold text-amber-300">${pack.usd}</div>
              <div className="text-xs text-slate-400">${per.toFixed(3)} / silver</div>
            </button>
          );
        })}
      </div>

      {/* Checkout */}
      <div className="card p-6">
        <h2 className="text-lg font-bold">Checkout</h2>

        {!selected ? (
          <p className="mt-2 text-slate-400">Select a pack above to continue.</p>
        ) : !order ? (
          // Step 1 — choose currency and lock the amount.
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-black/30 px-4 py-3">
              <span className="text-slate-300">{selected.label}</span>
              <span className="text-xl font-bold text-amber-300">${selected.usd}</span>
            </div>
            <div>
              <label className="label">Pay with</label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                      method.id === m.id ? "border-amber-300 bg-amber-300/15 text-amber-100" : "border-white/10 hover:bg-white/5"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={createOrder} disabled={busy} className="btn-gold w-full text-lg">
              {busy ? "Getting payment details…" : `Pay $${selected.usd} with ${method.label}`}
            </button>
            <p className="text-center text-xs text-slate-500">
              You&apos;ll get an address and exact amount to send. After paying, submit your
              transaction hash — coins are credited once the payment is confirmed on-chain.
            </p>
          </div>
        ) : (
          // Step 2 — pay the exact amount, then submit the transaction hash.
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4 space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="label mb-0">Send exactly</span>
                  <button
                    onClick={() => copy(String(order.pay_amount), "amt")}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:bg-white/5"
                  >
                    {copied === "amt" ? "Copied ✓" : "Copy"}
                  </button>
                </div>
                <p className="mt-1 font-mono text-lg font-bold text-amber-100">
                  {order.pay_amount} {order.asset}
                </p>
                <p className="text-xs text-amber-200/70">≈ ${order.usd} · {order.network}</p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="label mb-0">To this address</span>
                  <button
                    onClick={() => copy(order.address, "addr")}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:bg-white/5"
                  >
                    {copied === "addr" ? "Copied ✓" : "Copy"}
                  </button>
                </div>
                <p className="mt-1 break-all font-mono text-sm text-amber-100">{order.address}</p>
              </div>

              <p className="text-xs text-amber-200/70">
                Send only {order.asset} over {order.network}. The amount must match (small rounding
                is fine) or the payment can&apos;t be verified.
              </p>
              <p className="text-xs font-semibold text-red-200/80">
                ⏱ Pay within 10 minutes of starting this checkout — later payments won&apos;t be
                accepted and you&apos;ll need to start again.
              </p>
              {order.memo && <p className="text-xs text-amber-200/60">{order.memo}</p>}
            </div>

            <div>
              <label className="label">Transaction hash / ID</label>
              <input
                className="input font-mono text-sm"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="Paste the transaction hash from your wallet after sending"
              />
            </div>
            <button onClick={verify} disabled={busy || !txHash.trim()} className="btn-gold w-full text-lg">
              {busy ? "Verifying on-chain…" : "I've paid — verify payment"}
            </button>
            <button onClick={cancel} className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
              Cancel
            </button>
            <p className="text-center text-xs text-slate-500">
              Verification checks the blockchain directly. If it says &quot;not yet confirmed,&quot;
              wait for a few network confirmations and try again.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
