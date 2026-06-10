"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import { SELL_PRICE_USDT, SELL_HOURS_LABEL, sellStatus } from "@/lib/selling";

export default function SellPage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const [amount, setAmount] = useState(1);
  const [status, setStatus] = useState(() => sellStatus());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-check the trading window every 30s so the UI opens/closes on time.
  useEffect(() => {
    const t = setInterval(() => setStatus(sellStatus()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Log in to sell coins</h1>
        <button onClick={openAuth} className="btn-gold mt-6">Log in / Register</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-slate-400">Loading…</div>;

  async function sell() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gold: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.profile) setProfile(data.profile);
      setDone(data.message);
      setAmount(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sale failed.");
    } finally {
      setBusy(false);
    }
  }

  const gold = profile.gold;
  const canSell = status.open && gold >= 1 && amount >= 1 && amount <= gold;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Sell gold coins</h1>
        <p className="text-slate-400">
          1 gold = <span className="font-semibold text-amber-300">{SELL_PRICE_USDT.toLocaleString()} USDT</span>.
        </p>
      </div>

      {/* Trading window banner */}
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          status.open
            ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
            : "border-amber-300/30 bg-amber-300/10 text-amber-200"
        }`}
      >
        <span className="font-semibold">{status.open ? "● Open now" : "● Closed"}</span> — selling hours are{" "}
        {SELL_HOURS_LABEL}.
        {!status.open && " Please wait until the following Sunday."}
      </div>

      {done && (
        <div className="card animate-pop border-emerald-300/40 bg-emerald-300/10 px-4 py-3 text-center font-semibold text-emerald-100">
          ✓ {done}
        </div>
      )}
      {error && <div className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-red-300">{error}</div>}

      <div className="card p-6">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-slate-300">
            <CoinIcon type="gold" size={28} /> Your gold
          </span>
          <span className="text-xl font-bold text-amber-300">{gold}</span>
        </div>

        <div className="mt-5">
          <label className="label">Gold to sell</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={gold}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="input"
              disabled={!status.open || gold < 1}
            />
            <button
              onClick={() => setAmount(Math.max(1, gold))}
              className="btn-ghost shrink-0 text-sm"
              disabled={gold < 1}
            >
              Max
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-black/30 px-4 py-3">
          <span className="text-slate-300">You receive</span>
          <span className="text-xl font-extrabold text-emerald-300">
            {(Math.min(amount, gold || 0) * SELL_PRICE_USDT).toLocaleString()} USDT
          </span>
        </div>

        <button onClick={sell} disabled={busy || !canSell} className="btn-gold mt-5 w-full text-lg">
          {busy
            ? "Processing…"
            : !status.open
              ? "Selling is closed"
              : gold < 1
                ? "No gold to sell"
                : `Sell ${Math.min(amount, gold)} gold`}
        </button>

        <p className="mt-3 text-center text-xs text-slate-500">
          Payouts are sent to your wallet by the team after the sale is recorded.
        </p>
      </div>
    </div>
  );
}
