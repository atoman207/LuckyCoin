"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

// =====================================================================
//  管理画面「入金履歴」タブ。
//
//  /api/admin/stripe/payments は、共有 Stripe アカウントの中から
//  「本システム経由の決済」だけを選んで返します（他サイトの入金は入りません）。
//  ここではそれを 3 つの見せ方で表示します:
//    ・要点をつかむための集計カード
//    ・売上の推移（面グラフ）と決済件数（棒グラフ）
//    ・1 件ずつ確認するための明細テーブル
//
//  「リアルタイム」は 5 秒ごとのポーリングで実現しています。タブが見えていない
//  ときは止め、前の応答が返ってから次を投げるので、リクエストは重なりません。
// =====================================================================

const POLL_MS = 5_000;

// グラフの配色。dataviz の検証済みパレットのスロット 1（青）と 2（橙）を、
// 白い面の上で使う前提で採用しています（validate_palette.js で全項目 PASS:
// 隣接 CVD ΔE 24.7 / 通常視 ΔE 33.6 / コントラスト 3:1 以上）。
// 系列はグラフごとに 1 本なので凡例は置かず、見出しがその系列を名指しします。
const SERIES_REVENUE_LIGHT = "#2a78d6";
const SERIES_COUNT_LIGHT = "#eb6834";
const SERIES_REVENUE_DARK = "#e0b35a";
const SERIES_COUNT_DARK = "#4a8dff";
// 目盛りや罫線は控えめに。データより前に出ないようにします。
const GRID_LIGHT = "#ece4d6";
const AXIS_INK_LIGHT = "#8a7b66";
const GRID_DARK = "rgba(255,255,255,0.06)";
const AXIS_INK_DARK = "#8b95a8";

type Row = {
  id: string;
  created: string;
  amount: number;
  refunded: number;
  net: number;
  currency: string;
  status: string;
  buyerName: string | null;
  buyerEmail: string | null;
  silver: number | null;
  orderId: string | null;
  credited: boolean | null;
  receiptEmail: string | null;
  brand: string | null;
  last4: string | null;
};

type Point = { date: string; net: number; count: number };

type Summary = {
  currency: string;
  grossTotal: number;
  refundTotal: number;
  netTotal: number;
  count: number;
  todayNet: number;
  todayCount: number;
  average: number;
  days: number;
  truncated: boolean;
};

type Payload = {
  payments: Row[];
  series: Point[];
  summary: Summary;
  fetchedAt: string;
};

const RANGES: { days: number; label: MessageKey }[] = [
  { days: 7, label: "admin.payRange7" },
  { days: 30, label: "admin.payRange30" },
  { days: 90, label: "admin.payRange90" },
  { days: 365, label: "admin.payRange365" },
];

// PaymentIntent の状態 → 表示ラベルと色。色だけに意味を持たせないよう、
// 必ずラベルと丸印をセットで出します。
const STATUS: Record<string, { label: MessageKey; tone: string; dot: string }> = {
  succeeded: { label: "admin.payStatusSucceeded", tone: "text-emerald-700 bg-emerald-50", dot: "#0ca30c" },
  processing: { label: "admin.payStatusProcessing", tone: "text-amber-800 bg-amber-50", dot: "#fab219" },
  requires_payment_method: { label: "admin.payStatusRequiresPayment", tone: "text-muted bg-cream", dot: "#ab9d89" },
  requires_action: { label: "admin.payStatusRequiresAction", tone: "text-amber-800 bg-amber-50", dot: "#fab219" },
  requires_confirmation: { label: "admin.payStatusRequiresAction", tone: "text-amber-800 bg-amber-50", dot: "#fab219" },
  canceled: { label: "admin.payStatusCanceled", tone: "text-red-700 bg-red-50", dot: "#d03b3b" },
};

const TABLE_PAGE = 50;

export default function StripePaymentsPanel({
  onError,
  variant = "light",
}: {
  onError: (m: string) => void;
  variant?: "light" | "admin";
}) {
  const dark = variant === "admin";
  const SERIES_REVENUE = dark ? SERIES_REVENUE_DARK : SERIES_REVENUE_LIGHT;
  const SERIES_COUNT = dark ? SERIES_COUNT_DARK : SERIES_COUNT_LIGHT;
  const GRID = dark ? GRID_DARK : GRID_LIGHT;
  const AXIS_INK = dark ? AXIS_INK_DARK : AXIS_INK_LIGHT;
  const { t, intlLocale } = useI18n();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);
  const [shown, setShown] = useState(TABLE_PAGE);

  // 直近の取得がまだ飛んでいる間に次を投げないためのガード。
  const inFlight = useRef(false);

  const load = useCallback(
    async (opts: { spinner?: boolean } = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (opts.spinner) setLoading(true);
      try {
        const res = await fetch(`/api/admin/stripe/payments?days=${days}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setData(json as Payload);
      } catch (e) {
        onError(e instanceof Error ? e.message : t("common.somethingWrong"));
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [days, onError, t]
  );

  // 期間を変えたら読み直し、テーブルの表示件数も先頭に戻します。
  useEffect(() => {
    setShown(TABLE_PAGE);
    load({ spinner: true });
  }, [load]);

  // リアルタイム更新。画面が見えているときだけ動かします。
  useEffect(() => {
    if (!auto) return;
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = setInterval(tick, POLL_MS);
    // 別タブから戻ってきた瞬間にも最新化します。
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [auto, load]);

  const money = useCallback(
    (n: number) =>
      new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency: data?.summary.currency || "JPY",
        maximumFractionDigits: (data?.summary.currency || "JPY") === "JPY" ? 0 : 2,
      }).format(n),
    [intlLocale, data?.summary.currency]
  );

  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(intlLocale, { month: "numeric", day: "numeric", timeZone: "UTC" }),
    [intlLocale]
  );
  const fullDayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }),
    [intlLocale]
  );

  const series = data?.series ?? [];
  const summary = data?.summary;
  const payments = data?.payments ?? [];

  // 軸のラベルは、期間が長いほど間引きます。
  const tickGap = days <= 7 ? 0 : days <= 30 ? 2 : days <= 90 ? 9 : 45;

  if (loading && !data) {
    return <div className="card p-6 text-muted">{t("common.loadingChart")}</div>;
  }

  return (
    <div className="space-y-5">
      {/* 見出しと、期間・更新のコントロールを 1 行にまとめます。 */}
      <div className="card flex flex-wrap items-end justify-between gap-4 p-5">
        <div className="min-w-[16rem] flex-1">
          <h2 className="text-xl font-extrabold">{t("admin.payTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("admin.payLead")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-muted">{t("admin.payRange")}</span>
          <div className="flex gap-1 rounded-xl bg-cream p-1 text-sm">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                aria-pressed={days === r.days}
                className={`btn-tab rounded-lg px-3 py-1.5 ${
                  days === r.days ? "btn-tab-on" : ""
                }`}
              >
                {t(r.label)}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAuto((a) => !a)}
            title={auto ? t("admin.payAutoOff") : t("admin.payAutoOn")}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
              auto
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-line bg-cream text-muted hover:text-body"
            }`}
          >
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${auto ? "animate-pulse" : ""}`}
              style={{ background: auto ? "#0ca30c" : "#ab9d89" }}
            />
            {auto ? t("admin.payLive") : t("admin.payPaused")}
          </button>

          <button onClick={() => load({ spinner: true })} className="btn-ghost !px-3 !py-1.5 text-xs">
            {t("admin.payRefresh")}
          </button>
        </div>
      </div>

      {summary?.truncated && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {t("admin.payTruncated")}
        </p>
      )}

      {/* 集計カード。単独の数字はグラフにせず、そのまま大きく出します。 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: "admin.payNetTotal" as const,
            value: summary ? money(summary.netTotal) : "…",
            hint: t("admin.payNetTotalHint"),
            tone: "text-emerald-700",
          },
          {
            label: "admin.payToday" as const,
            value: summary ? money(summary.todayNet) : "…",
            hint: summary ? t("admin.payTodayHint", { count: summary.todayCount }) : "",
            tone: "text-emerald-700",
          },
          {
            label: "admin.payCount" as const,
            value: summary ? summary.count.toLocaleString(intlLocale) : "…",
            hint: t("admin.payCountHint"),
            tone: "text-sky-700",
          },
          {
            label: "admin.payAverage" as const,
            value: summary ? money(summary.average) : "…",
            hint: t("admin.payAverageHint"),
            tone: "text-body",
          },
          {
            label: "admin.payRefundTotal" as const,
            value: summary ? money(summary.refundTotal) : "…",
            hint: t("admin.payRefundHint"),
            tone: summary && summary.refundTotal > 0 ? "text-red-700" : "text-muted",
          },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className="text-sm text-muted">{t(s.label)}</div>
            <div className={`mt-1 text-2xl font-extrabold ${s.tone}`}>{s.value}</div>
            <div className="mt-0.5 text-xs text-faint">{s.hint}</div>
          </div>
        ))}
      </div>

      {/* 売上の推移。系列は 1 本なので凡例は置かず、見出しが系列名を兼ねます。 */}
      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold">{t("admin.payChartTitle")}</h3>
          <span className="text-xs text-faint">{t("admin.payScopeNote")}</span>
        </div>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES_REVENUE} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={SERIES_REVENUE} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`))}
                interval={tickGap}
                tick={{ fill: AXIS_INK, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                minTickGap={8}
              />
              <YAxis
                width={64}
                tick={{ fill: AXIS_INK, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => money(v)}
              />
              <Tooltip
                cursor={{ stroke: AXIS_INK, strokeWidth: 1, strokeDasharray: "3 3" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Point;
                  return (
                    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg">
                      <div className="font-bold text-body">
                        {fullDayFmt.format(new Date(`${String(label)}T00:00:00Z`))}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: SERIES_REVENUE }}
                        />
                        <span className="text-muted">{t("admin.payChartNet")}</span>
                        <span className="ml-auto font-bold tabular-nums text-body">{money(p.net)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="text-muted">{t("admin.payChartCount")}</span>
                        <span className="ml-auto font-bold tabular-nums text-body">
                          {p.count.toLocaleString(intlLocale)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="net"
                stroke={SERIES_REVENUE}
                strokeWidth={2}
                fill="url(#revFill)"
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff", fill: SERIES_REVENUE }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 決済件数。金額と単位が違うので、同じ軸には載せず別のグラフにします。 */}
      <div className="card p-5">
        <h3 className="text-lg font-bold">{t("admin.payChartCount")}</h3>
        <div className="mt-4 h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`))}
                interval={tickGap}
                tick={{ fill: AXIS_INK, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                minTickGap={8}
              />
              <YAxis
                width={40}
                allowDecimals={false}
                tick={{ fill: AXIS_INK, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(235,104,52,0.08)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Point;
                  return (
                    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg">
                      <div className="font-bold text-body">
                        {fullDayFmt.format(new Date(`${String(label)}T00:00:00Z`))}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: SERIES_COUNT }}
                        />
                        <span className="text-muted">{t("admin.payChartCount")}</span>
                        <span className="ml-auto font-bold tabular-nums text-body">
                          {p.count.toLocaleString(intlLocale)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" fill={SERIES_COUNT} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 明細。グラフで気づいた山を 1 件ずつ確かめるための表です。 */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-3">{t("admin.payColDate")}</th>
              <th className="px-4 py-3">{t("admin.payColBuyer")}</th>
              <th className="px-4 py-3 text-right">{t("admin.payColAmount")}</th>
              <th className="px-4 py-3 text-right">{t("admin.payColRefund")}</th>
              <th className="px-4 py-3 text-right">{t("admin.payColSilver")}</th>
              <th className="px-4 py-3">{t("admin.payColCredited")}</th>
              <th className="px-4 py-3">{t("admin.payColCard")}</th>
              <th className="px-4 py-3">{t("admin.payColStatus")}</th>
              <th className="px-4 py-3">{t("admin.payColIntent")}</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-faint">
                  {t("admin.payNone")}
                </td>
              </tr>
            ) : (
              payments.slice(0, shown).map((r) => {
                const st = STATUS[r.status];
                return (
                  <tr key={r.id} className="border-b border-line hover:bg-cream">
                    <td className="px-4 py-3 whitespace-nowrap text-muted tabular-nums">
                      {new Date(r.created).toLocaleString(intlLocale)}
                    </td>
                    <td className="px-4 py-3">
                      {r.buyerName ? (
                        <>
                          <div className="font-bold">{r.buyerName}</div>
                          <div className="text-xs text-faint">{r.buyerEmail}</div>
                        </>
                      ) : (
                        <span className="text-xs text-faint">
                          {r.receiptEmail ?? t("admin.payGuest")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-emerald-700">
                      {money(r.amount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.refunded > 0 ? (
                        <span className="font-bold text-red-700">-{money(r.refunded)}</span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.silver === null ? <span className="text-faint">—</span> : r.silver.toLocaleString(intlLocale)}
                    </td>
                    <td className="px-4 py-3">
                      {r.credited === null ? (
                        <span className="text-faint">—</span>
                      ) : r.credited ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                          {t("admin.payCredited")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
                          {t("admin.payNotCredited")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {r.brand ? `${r.brand.toUpperCase()} ···· ${r.last4 ?? ""}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${
                          st?.tone ?? "text-muted bg-cream"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: st?.dot ?? "#ab9d89" }}
                        />
                        {st ? t(st.label) : t("admin.payStatusOther")}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-faint">{r.id}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          {payments.length > 0 &&
            t("admin.showing", {
              from: 1,
              to: Math.min(shown, payments.length),
              total: payments.length,
            })}
        </span>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-faint">
              {t("admin.payUpdatedAt", {
                time: new Date(data.fetchedAt).toLocaleTimeString(intlLocale),
              })}
            </span>
          )}
          {shown < payments.length && (
            <button onClick={() => setShown((n) => n + TABLE_PAGE)} className="btn-ghost text-xs">
              {t("admin.pageNext")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
