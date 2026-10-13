"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import CoinBalance from "@/components/CoinBalance";
import { COIN_PACKS, CUSTOM_SILVER_MIN, CUSTOM_SILVER_MAX, customCost } from "@/lib/coins";
import { formatUsdAsJpy, usdToJpy, USD_JPY_BOOK_RATE } from "@/lib/fx-book";
import { useI18n } from "@/lib/i18n/provider";

type Selection = { silver: number; jpy: number; label: string };

// Stripe から戻った直後に決済が未確定だった場合の再確認（回数と間隔）。
const CONFIRM_RETRIES = 5;
const CONFIRM_RETRY_MS = 2000;

// カードの輪郭。Stripe の選択肢が「ただのラジオボタン」ではなく支払い方法
// として一目で伝わるようにするための小さなアイコンです。
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
  const { t, intlLocale } = useI18n();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [customSilver, setCustomSilver] = useState(10);
  const [usingCustom, setUsingCustom] = useState(false);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectCustom(n: number) {
    const v = Math.max(CUSTOM_SILVER_MIN, Math.min(CUSTOM_SILVER_MAX, Math.floor(n) || CUSTOM_SILVER_MIN));
    setCustomSilver(v);
    setUsingCustom(true);
    setSelected({ silver: v, jpy: usdToJpy(customCost(v)), label: t("buy.customSilver", { count: v }) });
  }

  // ---- Stripe Checkout から戻ってきたとき ------------------------------
  // Stripe は購入者を /buy?stripe=success&session_id=… に返します。確定情報は
  // Webhook ですが、ここで Stripe に直接問い合わせることでコインが即座に
  // 反映されます。どちらの経路を通っても加算は 1 回だけです。
  //
  // 支払いがまだ確定していない（処理中）場合や、確認が一時的に失敗した場合は
  // 少し待って問い合わせ直します。それでも確定しなければ Webhook に任せます。
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
    window.history.replaceState({}, "", "/buy"); // 再読み込みで再実行しない

    if (outcome === "cancel") {
      setError(t("buy.stripeCanceled"));
      // 注文を「キャンセル」として記録します。請求もコインの加算も発生して
      // いないので、失敗しても購入者には影響しません。
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

  // Stripe のページからブラウザの「戻る」で戻ると、遷移直前の画面（ボタンが
  // 「移動しています…」で無効のまま）が復元されます。もう一度押せるように戻します。
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

  // カード決済: Stripe セッションを作成し、ブラウザを Stripe のホスト型ページへ
  // 渡します。カード情報が本サイトを通ることはありません。
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

  return (
    // 1 画面完結: ヘッダー + 内容がビューポート内に収まります（ページスクロールなし）。
    <div className="flex h-[calc(100dvh-var(--header-h)-4rem)] flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{t("buy.title")}</h1>
          <p className="hidden text-sm text-muted sm:block">{t("buy.subtitle")}</p>
        </div>
        <CoinBalance profile={profile} size={26} />
      </div>

      {done && (
        <div className="card animate-pop shrink-0 border-emerald-300 bg-emerald-50 px-4 py-2 text-center text-sm font-semibold text-emerald-700">
          {done}
        </div>
      )}
      {error && (
        <div className="shrink-0 rounded-xl bg-red-50 px-4 py-2 text-center text-sm text-red-600">{error}</div>
      )}

      {/* パック — デスクトップでは 1 行に収まります。 */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {COIN_PACKS.map((pack) => {
          const perJpy = usdToJpy(pack.usd) / pack.silver;
          const active = !usingCustom && selected?.silver === pack.silver;
          return (
            <button
              key={pack.silver}
              onClick={() => {
                setUsingCustom(false);
                setSelected({ silver: pack.silver, jpy: usdToJpy(pack.usd), label: t(pack.label) });
              }}
              className={`card relative flex flex-col items-center gap-1 p-3 text-center transition ${
                active ? "border-amber-400 ring-2 ring-amber-300" : "hover:border-amber-200"
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

        {/* 自由入力: シルバー 1〜100 枚 */}
        <div
          onClick={() => selectCustom(customSilver)}
          className={`card relative flex cursor-pointer flex-col items-center gap-1 p-3 text-center transition ${
            usingCustom ? "border-amber-400 ring-2 ring-amber-300" : "hover:border-amber-200"
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
          <div className="text-base font-extrabold text-amber-600">
            {formatUsdAsJpy(customCost(customSilver), intlLocale)}
          </div>
        </div>
      </div>

      {/* お支払い — 残りの高さを埋めます。 */}
      <div className="card flex min-h-0 flex-1 flex-col p-4">
        <h2 className="shrink-0 text-lg font-bold">{t("buy.checkout")}</h2>

        {!selected ? (
          <p className="mt-2 text-muted">{t("buy.selectPack")}</p>
        ) : (
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between rounded-xl bg-cream px-4 py-2">
              <span className="text-body">{selected.label}</span>
              <span className="text-xl font-bold text-amber-600">
                {formatUsdAsJpy(selected.jpy / USD_JPY_BOOK_RATE, intlLocale)}
              </span>
            </div>

            {/* 決済手段はカード（Stripe）のみです。 */}
            <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2">
              <CardIcon />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{t("buy.methodCard")}</span>
                <span className="block truncate text-xs text-muted">{t("buy.methodCardSub")}</span>
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 rounded-xl border border-line bg-cream p-4 text-sm">
              <div className="font-semibold text-body">{t("buy.cardTitle")}</div>
              <p className="text-muted">{t("buy.cardBody")}</p>
              <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                {t("buy.cardChargedIn", {
                  amount: formatUsdAsJpy(selected.jpy / USD_JPY_BOOK_RATE, intlLocale),
                  rate: String(USD_JPY_BOOK_RATE),
                })}
              </p>
              <p className="text-xs text-faint">{t("buy.cardBrands")}</p>
            </div>

            <button onClick={payByCard} disabled={busy} className="btn-gold w-full shrink-0">
              {busy
                ? t("buy.redirecting")
                : t("buy.payCardLocal", { amount: formatUsdAsJpy(selected.jpy / USD_JPY_BOOK_RATE, intlLocale) })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
