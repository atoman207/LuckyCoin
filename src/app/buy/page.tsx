"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import { COIN_PACKS, CUSTOM_SILVER_MIN, CUSTOM_SILVER_MAX, customCost } from "@/lib/coins";
import { formatUsdAsJpy, usdToJpy, USD_JPY_BOOK_RATE } from "@/lib/fx-book";
import { PURCHASE_BANK } from "@/lib/purchase-bank";
import { useI18n } from "@/lib/i18n/provider";

type Selection = { silver: number; jpy: number; label: string };
type PayStep = "choose" | "stripe" | "bank";

// Stripe から戻った直後に決済が未確定だった場合の再確認（回数と間隔）。
const CONFIRM_RETRIES = 5;
const CONFIRM_RETRY_MS = 2000;

/** Official-style Stripe mark (purple). */
function StripeIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#635BFF" />
      <path
        fill="#fff"
        d="M13.5 10.3c0-.7.57-1 1.5-1 1.33 0 3 .4 4.3 1.12V7.3A11.3 11.3 0 0 0 15 6.4c-3.2 0-5.35 1.67-5.35 4.45 0 4.34 5.98 3.64 5.98 5.5 0 .83-.72 1.1-1.72 1.1-1.48 0-3.38-.61-4.88-1.42v3.2A12.1 12.1 0 0 0 14.9 20c3.35 0 5.5-1.65 5.5-4.5-.02-4.68-6-3.85-6-5.2z"
      />
    </svg>
  );
}

/** Bank / transfer building icon. */
function BankIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#0F766E" />
      <path
        fill="#fff"
        d="M12 4.5 4.5 8v1.5h15V8L12 4.5zm-6 6v5H7.2v-5H6zm3.3 0v5h1.2v-5H9.3zm3.3 0v5h1.2v-5H12.6zm3.3 0v5H17.1v-5H15.9zM5 17.2V19h14v-1.8H5z"
      />
    </svg>
  );
}

export default function BuyPage() {
  const router = useRouter();
  const { profile, loading, openAuth, setProfile } = useUser();
  const { t, intlLocale } = useI18n();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [customSilver, setCustomSilver] = useState(10);
  const [usingCustom, setUsingCustom] = useState(false);
  const [payStep, setPayStep] = useState<PayStep | null>(null);
  const [copied, setCopied] = useState(false);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function customSelection(n: number): Selection {
    const v = Math.max(CUSTOM_SILVER_MIN, Math.min(CUSTOM_SILVER_MAX, Math.floor(n) || CUSTOM_SILVER_MIN));
    return { silver: v, jpy: usdToJpy(customCost(v)), label: t("buy.customSilver", { count: v }) };
  }

  function openCheckout(sel: Selection, custom: boolean) {
    setUsingCustom(custom);
    setSelected(sel);
    setCopied(false);
    setPayStep("choose");
  }

  const stripeHandled = useRef(false);
  const confirmStripe = useCallback(
    async (sessionId: string) => {
      setBusy(true);
      try {
        for (let attempt = 0; ; attempt++) {
          const last = attempt >= CONFIRM_RETRIES;
          const res = await fetch("/api/purchase/stripe/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (res.status < 500 || last) throw new Error(data.error || t("buy.stripeCheckFailed"));
          } else {
            if (data.profile) setProfile(data.profile);
            if (data.status === "paid") {
              setDone(t("buy.stripeSuccess", { silver: Number(data.silver ?? 0).toLocaleString() }));
              setTimeout(() => router.push("/game"), 1600);
              return;
            }
            if (data.status === "canceled") {
              setError(t("buy.stripeCanceled"));
              return;
            }
            setDone(t("buy.stripeProcessing"));
            if (last) return;
          }
          await new Promise((resolve) => setTimeout(resolve, CONFIRM_RETRY_MS));
        }
      } catch (e) {
        setDone(null);
        setError(e instanceof Error && e.message ? e.message : t("buy.stripeCheckFailed"));
      } finally {
        setBusy(false);
      }
    },
    [router, setProfile, t]
  );

  useEffect(() => {
    if (stripeHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("stripe");
    if (!outcome) return;
    stripeHandled.current = true;
    window.history.replaceState({}, "", "/buy");

    if (outcome === "cancel") {
      setError(t("buy.stripeCanceled"));
      const orderId = params.get("order_id");
      if (orderId) {
        fetch("/api/purchase/stripe/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId }),
        }).catch(() => {});
      }
      return;
    }
    const sessionId = params.get("session_id");
    if (outcome === "success" && sessionId) confirmStripe(sessionId);
  }, [confirmStripe, t]);

  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">{t("buy.loginTitle")}</h1>
        <button onClick={openAuth} className="btn-gold mt-6">{t("common.loginRegister")}</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-muted">{t("common.loading")}</div>;

  async function payByCard() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/purchase/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ silver: selected.silver }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || t("buy.couldNotStart"));
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("buy.couldNotStart"));
      setBusy(false);
    }
  }

  const amountLabel = selected
    ? formatUsdAsJpy(selected.jpy / USD_JPY_BOOK_RATE, intlLocale)
    : "";

  const bankRows = [
    { label: t("buy.bankName"), value: PURCHASE_BANK.bankName },
    { label: t("buy.bankCode"), value: PURCHASE_BANK.bankCode },
    { label: t("buy.branchNumber"), value: PURCHASE_BANK.branchNumber },
    { label: t("buy.branchName"), value: PURCHASE_BANK.branchName },
    { label: t("buy.accountType"), value: t("buy.accountTypeChecking") },
    { label: t("buy.accountNumber"), value: PURCHASE_BANK.accountNumber },
    { label: t("buy.accountHolder"), value: PURCHASE_BANK.accountHolder },
  ];

  async function copyBankInfo() {
    const text = [
      ...bankRows.map((r) => `${r.label}: ${r.value}`),
      selected ? `${t("buy.bankAmountLabel")}: ${amountLabel}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function closePayModal() {
    if (busy) return;
    setPayStep(null);
    setCopied(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{t("buy.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("buy.subtitle")}</p>
        </div>
        <CoinBalance profile={profile} size={26} />
      </div>

      {done && (
        <div className="card animate-pop border-emerald-300 bg-emerald-50 px-4 py-2 text-center text-sm font-semibold text-emerald-700">
          {done}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-2 text-center text-sm text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {COIN_PACKS.map((pack) => {
          const perJpy = usdToJpy(pack.usd) / pack.silver;
          const active = payStep !== null && !usingCustom && selected?.silver === pack.silver;
          return (
            <button
              key={pack.silver}
              onClick={() =>
                openCheckout(
                  { silver: pack.silver, jpy: usdToJpy(pack.usd), label: t(pack.label) },
                  false
                )
              }
              className={`btn-option relative flex flex-col items-center gap-1 rounded-xl p-3 text-center ${
                active ? "btn-option-on" : ""
              }`}
            >
              {pack.tag && (
                <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                  {t(pack.tag)}
                </span>
              )}
              <CoinIcon type="silver" size={32} />
              <div className="text-sm font-bold">{t(pack.label)}</div>
              <div className="text-xl font-extrabold text-amber-600">
                {formatUsdAsJpy(pack.usd, intlLocale)}
              </div>
              <div className="text-[10px] text-muted">
                {t("buy.perSilver", { price: Math.round(perJpy).toLocaleString() })}
              </div>
            </button>
          );
        })}

        <div
          onClick={() => {
            const v = Math.max(
              CUSTOM_SILVER_MIN,
              Math.min(CUSTOM_SILVER_MAX, Math.floor(customSilver) || CUSTOM_SILVER_MIN)
            );
            setCustomSilver(v);
            openCheckout(customSelection(v), true);
          }}
          className={`btn-option relative flex cursor-pointer flex-col items-center gap-1 rounded-xl p-3 text-center ${
            payStep !== null && usingCustom ? "btn-option-on" : ""
          }`}
        >
          <CoinIcon type="silver" size={32} />
          <div className="text-sm font-bold">{t("buy.custom")}</div>
          <input
            type="number"
            min={CUSTOM_SILVER_MIN}
            max={CUSTOM_SILVER_MAX}
            value={customSilver}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = Number(e.target.value);
              setCustomSilver(v);
              setUsingCustom(true);
              const sel = customSelection(v);
              setSelected(sel);
              if (payStep) setPayStep("choose");
            }}
            className="input w-20 py-1 text-center text-base font-bold"
          />
          <div className="text-base font-extrabold text-amber-600">
            {formatUsdAsJpy(customCost(customSilver), intlLocale)}
          </div>
        </div>
      </div>

      {payStep && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closePayModal}>
          <div className="absolute inset-0 bg-[#4a3f31]/35 backdrop-blur-sm" />
          <div
            className="card relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden p-5 animate-pop sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closePayModal}
              className="btn-close absolute right-3 top-3"
              aria-label={t("common.close")}
              disabled={busy}
            >
              ✕
            </button>

            <h2 className="pr-8 text-lg font-bold">{t("buy.checkout")}</h2>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-cream px-4 py-2">
              <span className="text-body">{selected.label}</span>
              <span className="text-xl font-bold text-amber-600">{amountLabel}</span>
            </div>

            {payStep === "choose" && (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setCopied(false);
                    setPayStep("stripe");
                  }}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50"
                >
                  <StripeIcon />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{t("buy.methodStripe")}</span>
                    <span className="block truncate text-xs text-muted">{t("buy.methodStripeSub")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCopied(false);
                    setPayStep("bank");
                  }}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50"
                >
                  <BankIcon />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{t("buy.methodBank")}</span>
                    <span className="block truncate text-xs text-muted">{t("buy.methodBankSub")}</span>
                  </span>
                </button>
              </div>
            )}

            {payStep === "stripe" && (
              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setPayStep("choose")}
                  className="self-start text-xs text-muted hover:underline"
                >
                  ← {t("buy.checkout")}
                </button>
                <div className="flex items-center gap-2 text-lg font-bold text-body">
                  <StripeIcon size={26} />
                  {t("buy.cardTitle")}
                </div>
                <p className="text-sm text-muted">{t("buy.cardBody")}</p>
                <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                  {t("buy.cardChargedIn", {
                    amount: amountLabel,
                    rate: String(USD_JPY_BOOK_RATE),
                  })}
                </p>
                <p className="text-xs text-faint">{t("buy.cardBrands")}</p>
                <button onClick={payByCard} disabled={busy} className="btn-gold mt-1 w-full shrink-0">
                  {busy ? t("buy.redirecting") : t("buy.payCardLocal", { amount: amountLabel })}
                </button>
              </div>
            )}

            {payStep === "bank" && (
              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setPayStep("choose")}
                  className="self-start text-xs text-muted hover:underline"
                >
                  ← {t("buy.checkout")}
                </button>
                <div className="flex items-center gap-2 text-lg font-bold text-body">
                  <BankIcon size={26} />
                  {t("buy.bankTitle")}
                </div>
                <p className="text-sm text-muted">{t("buy.bankBody")}</p>
                <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                  {t("buy.bankAmountLabel")}: {amountLabel}
                </p>
                <dl className="grid gap-1.5 rounded-lg border border-line bg-cream px-3 py-3 text-sm">
                  {bankRows.map((row) => (
                    <div
                      key={row.label}
                      className="grid grid-cols-[7.5rem_1fr] items-baseline gap-2 sm:grid-cols-[9rem_1fr]"
                    >
                      <dt className="text-xs text-muted">{row.label}</dt>
                      <dd className="font-semibold tabular-nums text-body">{row.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-faint">{t("buy.bankNote")}</p>
                <button type="button" onClick={copyBankInfo} className="btn-gold mt-1 w-full shrink-0">
                  {copied ? t("buy.bankCopied") : t("buy.bankCopy")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
