"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import NetworkIcon from "@/components/NetworkIcon";
import CheckoutModal, { type CheckoutOrder } from "@/components/CheckoutModal";
import { COIN_PACKS, CUSTOM_SILVER_MIN, CUSTOM_SILVER_MAX, customCost } from "@/lib/coins";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/wallets";

type Selection = { silver: number; usd: number; label: string };

export default function BuyPage() {
  const router = useRouter();
  const { profile, loading, openAuth, setProfile } = useUser();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [customSilver, setCustomSilver] = useState(10);
  const [usingCustom, setUsingCustom] = useState(false);

  function selectCustom(n: number) {
    const v = Math.max(CUSTOM_SILVER_MIN, Math.min(CUSTOM_SILVER_MAX, Math.floor(n) || CUSTOM_SILVER_MIN));
    setCustomSilver(v);
    setUsingCustom(true);
    setSelected({ silver: v, usd: customCost(v), label: `${v} Silver` });
  }
  const [method, setMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0]);
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [txHash, setTxHash] = useState("");
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
      setOrder({ ...data, method_id: method.id, item: selected.label } as CheckoutOrder);
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
      // Payment verified on-chain → silver credited. Close the modal, show a
      // brief confirmation, then send the buyer to the game with their coins.
      setDone("Payment verified — silver added. Taking you to the game…");
      setOrder(null);
      setSelected(null);
      setTxHash("");
      setTimeout(() => router.push("/game"), 1200);
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
      {/* Step-1 errors here; checkout errors show inside the modal. */}
      {error && !order && (
        <div className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-red-300">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COIN_PACKS.map((pack) => {
          const per = pack.usd / pack.silver;
          const active = !usingCustom && selected?.silver === pack.silver;
          return (
            <button
              key={pack.silver}
              onClick={() => {
                setUsingCustom(false);
                setSelected({ silver: pack.silver, usd: pack.usd, label: pack.label });
              }}
              className={`card relative flex flex-col items-center gap-2 p-6 text-center transition ${
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

        {/* Custom amount: 1–100 silver */}
        <div
          onClick={() => selectCustom(customSilver)}
          className={`card relative flex cursor-pointer flex-col items-center gap-2 p-6 text-center transition ${
            usingCustom ? "border-amber-300 ring-2 ring-amber-300" : "hover:border-white/25"
          }`}
        >
          <CoinIcon type="silver" size={48} />
          <div className="text-lg font-bold">Custom</div>
          <input
            type="number"
            min={CUSTOM_SILVER_MIN}
            max={CUSTOM_SILVER_MAX}
            value={customSilver}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => selectCustom(Number(e.target.value))}
            className="input w-24 text-center text-lg font-bold"
          />
          <div className="text-2xl font-extrabold text-amber-300">${customCost(customSilver)}</div>
          <div className="text-xs text-slate-400">{CUSTOM_SILVER_MIN}–{CUSTOM_SILVER_MAX} silver · $0.25 each</div>
        </div>
      </div>

      {/* Checkout — choose a network, then open the payment modal. */}
      <div className="card p-6">
        <h2 className="text-lg font-bold">Checkout</h2>

        {!selected ? (
          <p className="mt-2 text-slate-400">Select a pack above to continue.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-black/30 px-4 py-3">
              <span className="text-slate-300">{selected.label}</span>
              <span className="text-xl font-bold text-amber-300">${selected.usd}</span>
            </div>

            <div>
              <label className="label">Pay with</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                      method.id === m.id
                        ? "border-amber-300 bg-amber-300/15"
                        : "border-white/10 hover:border-white/25 hover:bg-white/5"
                    }`}
                  >
                    <NetworkIcon methodId={m.id} size={30} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{m.asset}</span>
                      <span className="block truncate text-xs text-slate-400">{m.network}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={createOrder} disabled={busy} className="btn-gold w-full text-lg">
              {busy ? "Getting payment details…" : `Pay $${selected.usd} with ${method.label}`}
            </button>
            <p className="text-center text-xs text-slate-500">
              A payment window opens with an address, amount and QR code. After paying, submit your
              transaction hash — coins are credited once it&apos;s confirmed on-chain.
            </p>
          </div>
        )}
      </div>

      {order && (
        <CheckoutModal
          order={order}
          txHash={txHash}
          onTxHash={setTxHash}
          onVerify={verify}
          onCancel={cancel}
          busy={busy}
          error={error}
        />
      )}
    </div>
  );
}
