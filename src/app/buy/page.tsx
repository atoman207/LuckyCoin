"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import NetworkIcon from "@/components/NetworkIcon";
import CheckoutModal, { type CheckoutOrder } from "@/components/CheckoutModal";
import { COIN_PACKS, CUSTOM_SILVER_MIN, CUSTOM_SILVER_MAX, customCost } from "@/lib/coins";
import { formatUsdAsJpy, USD_JPY_BOOK_RATE } from "@/lib/fx-book";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/wallets";
import { useI18n } from "@/lib/i18n/provider";

type Selection = { silver: number; usd: number; label: string };
// What /api/purchase/stripe/quote reports: the currency the card is charged
// in and the USD rate used to get there.
type Quote = { currency: string; rate: number; zeroDecimal: boolean; minCharge: number };
// Card (Stripe) or on-chain crypto. Card is offered first.
type PayKind = "card" | "crypto";

// A small card outline, so the Stripe option reads as a payment method at a
// glance rather than as a plain radio button.
function CardIcon({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
      <path d="M6 15h4" strokeLinecap="round" />
    </svg>
  );
}

export default function BuyPage() {
  const router = useRouter();
  const { profile, loading, openAuth, setProfile } = useUser();
  const { t, tMaybe, intlLocale, locale } = useI18n();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [customSilver, setCustomSilver] = useState(10);
  const [usingCustom, setUsingCustom] = useState(false);

  const [payKind, setPayKind] = useState<PayKind>("card");
  const [method, setMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0]);
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prices are listed in USD. Japanese visitors see and pay yen at the
  // ¥150 / $1 book rate. The quote call still tells us the Stripe currency.
  const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/purchase/stripe/quote", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => {
        if (alive && q && typeof q.rate === "number") setQuote(q as Quote);
      })
      .catch(() => {
        /* Japanese still uses the book rate below */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Formats a USD price in yen for Japanese, or in the Stripe currency otherwise.
  const inCharged = useCallback(
    (usd: number): string | null => {
      if (locale === "ja") return formatUsdAsJpy(usd, intlLocale);
      if (!quote || quote.currency === "USD") return null;
      const amount = quote.zeroDecimal
        ? Math.round(usd * quote.rate)
        : Math.round(usd * quote.rate * 100) / 100;
      try {
        return new Intl.NumberFormat(intlLocale, {
          style: "currency",
          currency: quote.currency,
          maximumFractionDigits: quote.zeroDecimal ? 0 : 2,
        }).format(amount);
      } catch {
        return `${amount} ${quote.currency}`;
      }
    },
    [quote, intlLocale, locale]
  );

  function selectCustom(n: number) {
    const v = Math.max(CUSTOM_SILVER_MIN, Math.min(CUSTOM_SILVER_MAX, Math.floor(n) || CUSTOM_SILVER_MIN));
    setCustomSilver(v);
    setUsingCustom(true);
    setSelected({ silver: v, usd: customCost(v), label: t("buy.customSilver", { count: v }) });
  }

  // ---- Returning from Stripe Checkout --------------------------------
  // Stripe sends the buyer back to /buy?stripe=success&session_id=… . The
  // webhook is the authoritative confirmation, but asking Stripe directly here
  // means the coins show up immediately. Both paths credit at most once.
  const stripeHandled = useRef(false);
  const confirmStripe = useCallback(
    async (sessionId: string) => {
      setBusy(true);
      try {
        const res = await fetch("/api/purchase/stripe/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.profile) setProfile(data.profile);
        if (data.status === "paid") {
          setDone(t("buy.stripeSuccess", { silver: Number(data.silver ?? 0).toLocaleString() }));
          setTimeout(() => router.push("/game"), 1600);
        } else if (data.status === "canceled") {
          setError(t("buy.stripeCanceled"));
        } else {
          setDone(t("buy.stripeProcessing"));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("buy.stripeCheckFailed"));
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
    window.history.replaceState({}, "", "/buy"); // don't re-run on refresh

    if (outcome === "cancel") {
      setError(t("buy.stripeCanceled"));
      return;
    }
    const sessionId = params.get("session_id");
    if (outcome === "success" && sessionId) confirmStripe(sessionId);
  }, [confirmStripe, t]);

  // ---- Auto-detect crypto payment ------------------------------------
  // While the checkout modal is open, monitor the receiving wallet's network
  // once per second. The checks never overlap (the next one is scheduled only
  // after the previous response). As soon as a valid transaction is detected
  // the loop stops immediately and the coins are credited.
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
          setDone(t("buy.paymentReceived"));
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
  }, [order, router, setProfile, t]);

  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">{t("buy.loginTitle")}</h1>
        <button onClick={openAuth} className="btn-gold mt-6">{t("common.loginRegister")}</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-slate-400">{t("common.loading")}</div>;

  // Card checkout: create the Stripe session, then hand the browser over to
  // Stripe's hosted page. No card details ever touch this site.
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
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error);
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("buy.couldNotStart"));
      setBusy(false);
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
      setOrder({ ...data, method_id: method.id, item: selected.label } as CheckoutOrder);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("buy.couldNotStart"));
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
      setDone(t("buy.paymentVerified"));
      setOrder(null);
      setSelected(null);
      setTxHash("");
      setTimeout(() => router.push("/game"), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("buy.verifyFailed"));
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
          <h1 className="text-2xl font-extrabold sm:text-3xl">{t("buy.title")}</h1>
          <p className="hidden text-sm text-slate-400 sm:block">{t("buy.subtitle")}</p>
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
                setSelected({ silver: pack.silver, usd: pack.usd, label: t(pack.label) });
              }}
              className={`card relative flex flex-col items-center gap-1 p-3 text-center transition ${
                active ? "border-amber-300 ring-2 ring-amber-300" : "hover:border-white/25"
              }`}
            >
              {pack.tag && (
                <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                  {t(pack.tag)}
                </span>
              )}
              <CoinIcon type="silver" size={32} />
              <div className="text-sm font-bold">{t(pack.label)}</div>
              {locale === "ja" ? (
                <>
                  <div className="text-xl font-extrabold text-amber-300">{formatUsdAsJpy(pack.usd, intlLocale)}</div>
                  <div className="text-[11px] text-slate-400">${pack.usd}</div>
                </>
              ) : (
                <>
                  <div className="text-xl font-extrabold text-amber-300">${pack.usd}</div>
                  {inCharged(pack.usd) && (
                    <div className="text-[11px] font-semibold text-slate-300">
                      {t("buy.approx", { amount: inCharged(pack.usd)! })}
                    </div>
                  )}
                </>
              )}
              <div className="text-[10px] text-slate-400">{t("buy.perSilver", { price: per.toFixed(3) })}</div>
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
          <div className="text-sm font-bold">{t("buy.custom")}</div>
          <input
            type="number"
            min={CUSTOM_SILVER_MIN}
            max={CUSTOM_SILVER_MAX}
            value={customSilver}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => selectCustom(Number(e.target.value))}
            className="input w-20 py-1 text-center text-base font-bold"
          />
          <div className="text-base font-extrabold text-amber-300">
            {locale === "ja" ? formatUsdAsJpy(customCost(customSilver), intlLocale) : `$${customCost(customSilver)}`}
          </div>
          {locale === "ja" ? (
            <div className="text-[11px] text-slate-400">${customCost(customSilver)}</div>
          ) : (
            inCharged(customCost(customSilver)) && (
              <div className="text-[11px] font-semibold text-slate-300">
                {t("buy.approx", { amount: inCharged(customCost(customSilver))! })}
              </div>
            )
          )}
        </div>
      </div>

      {/* Checkout — fills the rest; the network list scrolls only if it must,
          keeping the Pay button always visible (no page scroll). */}
      <div className="card flex min-h-0 flex-1 flex-col p-4">
        <h2 className="shrink-0 text-lg font-bold">{t("buy.checkout")}</h2>

        {!selected ? (
          <p className="mt-2 text-slate-400">{t("buy.selectPack")}</p>
        ) : (
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between rounded-xl bg-black/30 px-4 py-2">
              <span className="text-slate-300">{selected.label}</span>
              <span className="text-xl font-bold text-amber-300">
                {locale === "ja" ? formatUsdAsJpy(selected.usd, intlLocale) : `$${selected.usd}`}
              </span>
            </div>

            {/* Card vs crypto */}
            <div className="grid shrink-0 grid-cols-2 gap-2">
              {(
                [
                  { kind: "card" as const, title: "buy.methodCard" as const, sub: "buy.methodCardSub" as const },
                  { kind: "crypto" as const, title: "buy.methodCrypto" as const, sub: "buy.methodCryptoSub" as const },
                ]
              ).map((o) => (
                <button
                  key={o.kind}
                  onClick={() => setPayKind(o.kind)}
                  aria-pressed={payKind === o.kind}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                    payKind === o.kind
                      ? "border-amber-300 bg-amber-300/15"
                      : "border-white/10 hover:border-white/25 hover:bg-white/5"
                  }`}
                >
                  {o.kind === "card" ? (
                    <CardIcon />
                  ) : (
                    <CoinIcon type="silver" size={26} />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{t(o.title)}</span>
                    <span className="block truncate text-xs text-slate-400">{t(o.sub)}</span>
                  </span>
                </button>
              ))}
            </div>

            {payKind === "card" ? (
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                <div className="font-semibold text-slate-200">{t("buy.cardTitle")}</div>
                <p className="text-slate-400">{t("buy.cardBody")}</p>
                {inCharged(selected.usd) && (
                  <p className="rounded-lg bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100">
                    {t("buy.cardChargedIn", {
                      amount: inCharged(selected.usd)!,
                      rate: String(locale === "ja" ? USD_JPY_BOOK_RATE : quote?.rate ?? ""),
                    })}
                  </p>
                )}
                <p className="text-xs text-slate-500">{t("buy.cardBrands")}</p>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <label className="label shrink-0">{t("buy.payWith")}</label>
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
            )}

            <button
              onClick={payKind === "card" ? payByCard : createOrder}
              disabled={busy}
              className="btn-gold w-full shrink-0"
            >
              {busy
                ? payKind === "card"
                  ? t("buy.redirecting")
                  : t("buy.gettingDetails")
                : payKind === "card"
                  ? inCharged(selected.usd)
                    ? t("buy.payCardLocal", { amount: inCharged(selected.usd)! })
                    : t("buy.payCard", { usd: selected.usd })
                  : t("buy.payCrypto", { usd: selected.usd, method: method.label })}
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
          memo={tMaybe(order.memo)}
        />
      )}
    </div>
  );
}
