"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import { SELL_PRICE_USDT, SELL_HOURS_KEY, sellStatus } from "@/lib/selling";
import { PAYOUT_METHODS, getPayoutMethod } from "@/lib/payout-methods";
import { useI18n } from "@/lib/i18n/provider";

export default function SellPage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const { t } = useI18n();
  const [amount, setAmount] = useState(1);
  const [status, setStatus] = useState(() => sellStatus());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Payout wallet: the crypto/network and the address to receive funds.
  const [method, setMethod] = useState<string>(PAYOUT_METHODS[0].id);
  const [address, setAddress] = useState("");
  const [savingWallet, setSavingWallet] = useState(false);
  const [walletMsg, setWalletMsg] = useState<string | null>(null);

  // Prefill from the registered wallet once the profile loads.
  useEffect(() => {
    if (!profile) return;
    if (profile.payout_method) setMethod(profile.payout_method);
    setAddress((a) => a || profile.payout_address || "");
  }, [profile]);

  // Re-check the trading window every 30s so the UI opens/closes on time.
  useEffect(() => {
    const t = setInterval(() => setStatus(sellStatus()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">{t("sell.loginTitle")}</h1>
        <button onClick={openAuth} className="btn-gold mt-6">{t("common.loginRegister")}</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-muted">{t("common.loading")}</div>;

  async function saveWallet() {
    if (!address.trim()) return;
    setSavingWallet(true);
    setWalletMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payout_method: method, payout_address: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.profile) setProfile(data.profile);
      setWalletMsg(t("sell.walletSaved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("sell.walletSaveFailed"));
    } finally {
      setSavingWallet(false);
    }
  }

  async function sell() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gold: amount, method_id: method, payout_address: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.profile) setProfile(data.profile);
      setDone(data.message);
      setAmount(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("sell.failed"));
    } finally {
      setBusy(false);
    }
  }

  const gold = profile.gold;
  const registered = profile.payout_address || null;
  const hasAddress = !!address.trim();
  const canSell = status.open && gold >= 1 && amount >= 1 && amount <= gold && hasAddress;
  const registeredMethodLabel = getPayoutMethod(profile.payout_method)?.label;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">{t("sell.title")}</h1>
        <p className="text-muted">
          {t("sell.subtitlePre")}
          <span className="font-semibold text-amber-600">
            {SELL_PRICE_USDT.toLocaleString()} USDT
          </span>
          {t("sell.subtitlePost")}
        </p>
      </div>

      {/* Trading window banner */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        <span className="font-semibold">{t("sell.openNow")}</span>{" "}
        {t("sell.openBody", { hours: t(SELL_HOURS_KEY) })}
      </div>

      {done && (
        <div className="card animate-pop border-emerald-300 bg-emerald-50 px-4 py-3 text-center font-semibold text-emerald-700">
          ✓ {done}
        </div>
      )}
      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-center text-red-600">{error}</div>}

      {/* Payout wallet — choose the crypto/network and address. Editable any time,
          even with no gold, so you can register it in advance. */}
      <div className="card space-y-4 p-6">
        <h2 className="text-lg font-bold">{t("sell.walletTitle")}</h2>

        <div>
          <label className="label">{t("sell.receiveAs")}</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYOUT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.network}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">{t("sell.walletAddress")}</label>
          <div className="flex items-center gap-2">
            <input
              className="input font-mono text-sm"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("sell.walletPlaceholder")}
              spellCheck={false}
            />
            <button
              onClick={saveWallet}
              disabled={savingWallet || !hasAddress}
              className="btn-ghost shrink-0 text-sm"
            >
              {savingWallet ? t("common.saving") : t("common.save")}
            </button>
          </div>
          {walletMsg && <p className="mt-1 text-xs text-emerald-600">{walletMsg}</p>}

          {/* Registered-wallet / prompt messaging */}
          {registered ? (
            <p className="mt-2 text-xs text-muted">
              {t("sell.registeredWallet", {
                method: registeredMethodLabel ? ` (${registeredMethodLabel})` : "",
              })}
              <span className="font-mono text-body break-all">{registered}</span>
              {t("sell.registeredWalletTail")}
            </p>
          ) : !hasAddress ? (
            <p className="mt-2 text-xs text-amber-600">{t("sell.noWallet")}</p>
          ) : null}

          <p className="mt-2 text-xs text-amber-700">{t("sell.warning")}</p>
        </div>
      </div>

      {/* Sell */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-body">
            <CoinIcon type="gold" size={28} /> {t("sell.yourGold")}
          </span>
          <span className="text-xl font-bold text-amber-600">{gold}</span>
        </div>

        <div className="mt-5">
          <label className="label">{t("sell.goldToSell")}</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={gold}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="input"
              disabled={gold < 1}
            />
            <button
              onClick={() => setAmount(Math.max(1, gold))}
              className="btn-ghost shrink-0 text-sm"
              disabled={gold < 1}
            >
              {t("common.max")}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-cream px-4 py-3">
          <span className="text-body">{t("sell.youReceive")}</span>
          <span className="text-xl font-extrabold text-emerald-600">
            {(Math.min(amount, gold || 0) * SELL_PRICE_USDT).toLocaleString()} USDT
          </span>
        </div>

        <button onClick={sell} disabled={busy || !canSell} className="btn-gold mt-5 w-full text-lg">
          {busy
            ? t("sell.processing")
            : gold < 1
              ? t("sell.noGold")
              : !hasAddress
                ? t("sell.enterWallet")
                : t("sell.sellAction", { count: Math.min(amount, gold) })}
        </button>

        <p className="mt-3 text-center text-xs text-faint">{t("sell.payoutNote")}</p>
      </div>
    </div>
  );
}
