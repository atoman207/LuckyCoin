"use client";

import { useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import { COIN_PACKS, type CoinPack } from "@/lib/coins";

const CHAINS = ["USDT (TRC-20)", "USDT (ERC-20)", "Bitcoin", "Ethereum"];

export default function BuyPage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const [selected, setSelected] = useState<CoinPack | null>(null);
  const [chain, setChain] = useState(CHAINS[0]);
  const [wallet, setWallet] = useState("");
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

  async function pay() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ silver: selected.silver, currency: chain, wallet_address: wallet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfile(data.profile);
      setDone(data.message);
      setSelected(null);
      setWallet("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Buy silver coins</h1>
          <p className="text-slate-400">Pay with cryptocurrency · 1 silver = $0.50 USDT</p>
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
              onClick={() => setSelected(pack)}
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
      </div>

      {/* Checkout */}
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
              <div className="flex flex-wrap gap-2">
                {CHAINS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setChain(c)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                      chain === c ? "border-amber-300 bg-amber-300/15 text-amber-100" : "border-white/10 hover:bg-white/5"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Your wallet address</label>
              <input
                className="input font-mono text-sm"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="The address you're paying from (recorded with the transaction)"
              />
            </div>
            <button onClick={pay} disabled={busy || !wallet.trim()} className="btn-gold w-full text-lg">
              {busy ? "Confirming payment…" : `Pay $${selected.usd} with ${chain}`}
            </button>
            <p className="text-center text-xs text-slate-500">
              Demo checkout — payment is simulated and coins are credited instantly. Swap in a
              real crypto gateway (Coinbase Commerce / NOWPayments) for production.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
