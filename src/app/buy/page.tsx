"use client";

import { useEffect, useState } from "react";
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

  // Auto-detect payment: while the checkout modal is open, monitor the receiving
  // wallet's network once per second. The checks never overlap (the next one is
  // scheduled only after the previous response). As soon as a valid transaction
  // is detected the loop stops immediately, the coins are credited, a green
  // confirmation shows, and the buyer returns to the game.
  useEffect(() => {
    if (!order) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch("/api/purchase/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: order.order_id }),
        });
        const data = await res.json();
        if (!alive) return;
        if (data.ok) {
          // Transaction detected — stop immediately and move to the next step.
          if (data.profile) setProfile(data.profile);
          setDone("✓ Payment received — silver added. Taking you back to the game…");
          setOrder(null);
          setTxHash("");
          setTimeout(() => router.push("/game"), 1400);
          return; // do not reschedule
        }
        if (data.expired) return; // window closed — stop
      } catch {
        /* transient network error — keep monitoring */
      }
      if (alive) timer = setTimeout(poll, 1000);
    };

    poll(); // first check right away, then every 1s after each response
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [order, router, setProfile]);

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
    // One screen: header + content fit within the viewport (no page scroll).
    <div className="flex h-[calc(100dvh-var(--header-h)-4rem)] flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Buy silver coins</h1>
          <p className="hidden text-sm text-slate-400 sm:block">Pay with crypto, skip the small talk · 1 silver = $0.25 USDT</p>
        </div>
        <CoinBalance profile={profile} size={26} />
      </div>

      {done && (
        <div className="card animate-pop shrink-0 border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-center text-sm font-semibold text-emerald-100">
          {done}
        </div>
      )}
      {/* Step-1 errors here; checkout errors show inside the modal. */}
      {error && !order && (
        <div className="shrink-0 rounded-xl bg-red-500/15 px-4 py-2 text-center text-sm text-red-300">{error}</div>
      )}

      {/* Packs — one compact row on desktop. */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
              className={`card relative flex flex-col items-center gap-1 p-3 text-center transition ${
                active ? "border-amber-300 ring-2 ring-amber-300" : "hover:border-white/25"
              }`}
            >
              {pack.tag && (
                <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                  {pack.tag}
                </span>
              )}
              <CoinIcon type="silver" size={32} />
              <div className="text-sm font-bold">{pack.label}</div>
              <div className="text-xl font-extrabold text-amber-300">${pack.usd}</div>
              <div className="text-[10px] text-slate-400">${per.toFixed(3)} / silver</div>
            </button>
          );
        })}

        {/* Custom amount: 1–100 silver */}
        <div
          onClick={() => selectCustom(customSilver)}
          className={`card relative flex cursor-pointer flex-col items-center gap-1 p-3 text-center transition ${
            usingCustom ? "border-amber-300 ring-2 ring-amber-300" : "hover:border-white/25"
          }`}
        >
          <CoinIcon type="silver" size={32} />
          <div className="text-sm font-bold">Custom</div>
          <input
            type="number"
            min={CUSTOM_SILVER_MIN}
            max={CUSTOM_SILVER_MAX}
            value={customSilver}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => selectCustom(Number(e.target.value))}
            className="input w-20 py-1 text-center text-base font-bold"
          />
          <div className="text-base font-extrabold text-amber-300">${customCost(customSilver)}</div>
        </div>
      </div>

      {/* Checkout — fills the rest; the network list scrolls only if it must,
          keeping the Pay button always visible (no page scroll). */}
      <div className="card flex min-h-0 flex-1 flex-col p-4">
        <h2 className="shrink-0 text-lg font-bold">Checkout</h2>

        {!selected ? (
          <p className="mt-2 text-slate-400">Select a pack above to continue.</p>
        ) : (
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between rounded-xl bg-black/30 px-4 py-2">
              <span className="text-slate-300">{selected.label}</span>
              <span className="text-xl font-bold text-amber-300">${selected.usd}</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <label className="label shrink-0">Pay with</label>
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m)}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                      method.id === m.id
                        ? "border-amber-300 bg-amber-300/15"
                        : "border-white/10 hover:border-white/25 hover:bg-white/5"
                    }`}
                  >
                    <NetworkIcon methodId={m.id} size={26} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{m.asset}</span>
                      <span className="block truncate text-xs text-slate-400">{m.network}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={createOrder} disabled={busy} className="btn-gold w-full shrink-0">
              {busy ? "Getting payment details…" : `Pay $${selected.usd} with ${method.label}`}
            </button>
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
