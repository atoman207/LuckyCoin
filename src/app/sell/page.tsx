"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import {
  ACCOUNT_TYPES,
  emptyBankAccount,
  formatBankAccount,
  isBankAccountComplete,
  parseBankAccount,
  type BankAccount,
} from "@/lib/bank-account";
import { formatYen, SELL_PRICE_JPY, SELL_HOURS_KEY, sellStatus } from "@/lib/selling";
import { useI18n } from "@/lib/i18n/provider";

export default function SellPage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const { t } = useI18n();
  const [amount, setAmount] = useState(1);
  const [status, setStatus] = useState(() => sellStatus());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [bank, setBank] = useState<BankAccount>(() => emptyBankAccount());
  const [savingBank, setSavingBank] = useState(false);
  const [bankMsg, setBankMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const saved = parseBankAccount(profile.payout_address);
    if (saved) setBank(saved);
  }, [profile]);

  useEffect(() => {
    const id = setInterval(() => setStatus(sellStatus()), 30_000);
    return () => clearInterval(id);
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

  function updateBank<K extends keyof BankAccount>(key: K, value: BankAccount[K]) {
    setBank((prev) => ({ ...prev, [key]: value }));
    setBankMsg(null);
  }

  async function saveBank() {
    if (!isBankAccountComplete(bank)) {
      setError(t("sell.bankIncomplete"));
      return;
    }
    setSavingBank(true);
    setBankMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.profile) setProfile(data.profile);
      setBankMsg(t("sell.bankSaved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("sell.bankSaveFailed"));
    } finally {
      setSavingBank(false);
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
        body: JSON.stringify({ gold: amount, bank }),
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
  const registered = parseBankAccount(profile.payout_address);
  const bankReady = isBankAccountComplete(bank);
  const canSell = status.open && gold >= 1 && amount >= 1 && amount <= gold && bankReady;
  const receiveYen = Math.min(amount, gold || 0) * SELL_PRICE_JPY;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">{t("sell.title")}</h1>
        <p className="text-muted">
          {t("sell.subtitlePre")}
          <span className="font-semibold text-gold-ink">{formatYen(SELL_PRICE_JPY)}</span>
          {t("sell.subtitlePost")}
        </p>
      </div>

      <div className="text-sm text-muted">
        <span className="font-semibold text-gold-ink">{t("sell.openNow")}</span>{" "}
        {t("sell.openBody", { hours: t(SELL_HOURS_KEY) })}
      </div>

      {done && (
        <div className="animate-pop py-2 text-center text-sm font-semibold text-emerald-700">
          ✓ {done}
        </div>
      )}
      {error && <div className="py-2 text-center text-sm text-red-600">{error}</div>}

      {/* 振込先口座 — 入力のまとまりなので枠付き */}
      <section className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-bold">{t("sell.bankTitle")}</h2>
          <p className="mt-1 text-xs text-muted">{t("sell.bankLead")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">
              {t("sell.bankName")}
              <span className="ml-1 text-red-500">{t("sell.required")}</span>
            </label>
            <input
              className="input"
              value={bank.bankName}
              onChange={(e) => updateBank("bankName", e.target.value)}
              placeholder={t("sell.bankNamePlaceholder")}
              autoComplete="organization"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label">
              {t("sell.branchName")}
              <span className="ml-1 text-red-500">{t("sell.required")}</span>
            </label>
            <input
              className="input"
              value={bank.branchName}
              onChange={(e) => updateBank("branchName", e.target.value)}
              placeholder={t("sell.branchNamePlaceholder")}
            />
          </div>

          <div className="sm:col-span-2">
            <span className="label">
              {t("sell.accountType")}
              <span className="ml-1 text-red-500">{t("sell.required")}</span>
            </span>
            <div className="mt-1 flex flex-wrap gap-4">
              {ACCOUNT_TYPES.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-center gap-2 text-sm ${
                    bank.accountType === opt.id ? "font-semibold text-body" : "text-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    className="accent-amber-700"
                    checked={bank.accountType === opt.id}
                    onChange={() => updateBank("accountType", opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="label">
              {t("sell.accountNumber")}
              <span className="ml-1 text-red-500">{t("sell.required")}</span>
            </label>
            <input
              className="input tracking-wider"
              inputMode="numeric"
              pattern="[0-9]*"
              value={bank.accountNumber}
              onChange={(e) => updateBank("accountNumber", e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder={t("sell.accountNumberPlaceholder")}
              autoComplete="off"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label">
              {t("sell.holderKana")}
              <span className="ml-1 text-red-500">{t("sell.required")}</span>
            </label>
            <input
              className="input"
              value={bank.holderKana}
              onChange={(e) => updateBank("holderKana", e.target.value)}
              placeholder={t("sell.holderKanaPlaceholder")}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-faint">{t("sell.holderKanaHint")}</p>
          </div>

          <div className="sm:col-span-2">
            <label className="label">{t("sell.holderName")}</label>
            <input
              className="input"
              value={bank.holderName ?? ""}
              onChange={(e) => updateBank("holderName", e.target.value)}
              placeholder={t("sell.holderNamePlaceholder")}
              autoComplete="name"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={saveBank}
            disabled={savingBank || !bankReady}
            className="btn-ghost text-sm"
          >
            {savingBank ? t("common.saving") : t("sell.saveBank")}
          </button>
          {bankMsg && <p className="text-xs text-emerald-600">{bankMsg}</p>}
        </div>

        {registered ? (
          <p className="text-xs text-muted">
            {t("sell.registeredBank")}
            <span className="mt-1 block break-all font-medium text-body">{formatBankAccount(registered)}</span>
          </p>
        ) : !bankReady ? (
          <p className="text-xs text-amber-700">{t("sell.noBank")}</p>
        ) : null}

        <p className="text-xs text-muted">{t("sell.warning")}</p>
      </section>

      {/* 売却 */}
      <section className="card p-6">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-body">
            <CoinIcon type="gold" size={28} /> {t("sell.yourGold")}
          </span>
          <span className="text-xl font-bold text-gold-ink">{gold.toLocaleString("ja-JP")}</span>
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

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <span className="text-body">{t("sell.youReceive")}</span>
          <span className="text-xl font-extrabold text-gold-ink">{formatYen(receiveYen)}</span>
        </div>

        <button onClick={sell} disabled={busy || !canSell} className="btn-gold mt-5 w-full text-lg">
          {busy
            ? t("sell.processing")
            : gold < 1
              ? t("sell.noGold")
              : !bankReady
                ? t("sell.enterBank")
                : t("sell.sellAction", { count: Math.min(amount, gold) })}
        </button>

        <p className="mt-3 text-center text-xs text-faint">{t("sell.payoutNote")}</p>
      </section>
    </div>
  );
}
