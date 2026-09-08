"use client";

import { useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import { EXCHANGE_NEXT, exchangeOutput, coinName, type CoinType } from "@/lib/coins";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

// Only downward conversions are allowed: gold → silver, silver → bronze.
const FROM_TYPES: CoinType[] = ["gold", "silver"];

export default function ExchangePage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const { t } = useI18n();
  const [from, setFrom] = useState<CoinType>("gold");
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">{t("exchange.loginTitle")}</h1>
        <button onClick={openAuth} className="btn-gold mt-6">{t("common.loginRegister")}</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-slate-400">{t("common.loading")}</div>;

  const to = EXCHANGE_NEXT[from] as CoinType; // gold→silver, silver→bronze
  const received = amount > 0 ? exchangeOutput(from, to, amount) : 0;
  const enough = profile[from] >= amount && amount > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfile(data.profile);
      setMsg(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("exchange.failed"));
    } finally {
      setBusy(false);
    }
  }

  const presets: { from: CoinType; amount: number; label: MessageKey }[] = [
    { from: "gold", amount: 1, label: "exchange.preset1" },
    { from: "silver", amount: 1, label: "exchange.preset2" },
    { from: "silver", amount: 10, label: "exchange.preset3" },
    { from: "silver", amount: 100, label: "exchange.preset4" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">{t("exchange.title")}</h1>
          <p className="text-slate-400">{t("exchange.subtitle")}</p>
        </div>
        <CoinBalance profile={profile} size={26} />
      </div>

      {msg && (
        <div className="card animate-pop border-emerald-300/40 bg-emerald-300/10 px-4 py-3 text-center font-semibold text-emerald-100">
          ✓ {msg}
        </div>
      )}
      {error && <div className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-red-300">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Converter */}
        <div className="card p-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div>
              <label className="label">{t("exchange.from")}</label>
              <select className="input" value={from} onChange={(e) => setFrom(e.target.value as CoinType)}>
                {FROM_TYPES.map((type) => (
                  <option key={type} value={type} className="bg-slate-900">
                    {t("exchange.fromOption", { name: coinName(t, type), count: profile[type] })}
                  </option>
                ))}
              </select>
            </div>
            <div className="pb-2.5 text-2xl text-amber-300">→</div>
            <div>
              <label className="label">{t("exchange.to")}</label>
              <div className="input flex items-center gap-2">
                <CoinIcon type={to} size={20} /> {coinName(t, to)}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="label">{t("exchange.amount")}</label>
            <input
              type="number"
              min={1}
              className="input"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            />
          </div>

          <div className="mt-5 flex items-center justify-center gap-4 rounded-xl bg-black/30 p-5">
            <div className="flex items-center gap-2">
              <CoinIcon type={from} size={40} />
              <span className="text-xl font-bold">{amount}</span>
            </div>
            <span className="text-2xl text-amber-300">→</span>
            <div className="flex items-center gap-2">
              <CoinIcon type={to} size={40} />
              <span className="text-xl font-bold">{received.toLocaleString()}</span>
            </div>
          </div>

          {!enough && (
            <p className="mt-3 text-center text-sm text-red-300">
              {t("exchange.notEnough", { name: coinName(t, from) })}
            </p>
          )}

          <button onClick={submit} disabled={busy || !enough} className="btn-gold mt-4 w-full text-lg">
            {busy ? t("exchange.exchanging") : t("exchange.action")}
          </button>
        </div>

        {/* Quick presets */}
        <div className="card p-6">
          <h2 className="text-lg font-bold">{t("exchange.quickTitle")}</h2>
          <div className="mt-4 space-y-2">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setFrom(p.from);
                  setAmount(p.amount);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm transition hover:border-amber-300/40 hover:bg-white/5"
              >
                <span>{t(p.label)}</span>
                <span className="text-amber-300">›</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">{t("exchange.upgradeDisabled")}</p>
        </div>
      </div>
    </div>
  );
}
