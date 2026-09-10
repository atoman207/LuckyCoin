"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

type Stats = {
  total: number;
  today: number;
  launch: string;
  series: { date: string; count: number }[];
};

type ChartType = "bar" | "line" | "pie";
type Granularity = "day" | "month" | "year";

// Axis labels are formatted with Intl so they read naturally in both
// languages ("Jun 1" / "6月1日").
const CHART_TYPE_LABEL: Record<ChartType, MessageKey> = {
  bar: "chart.bar",
  line: "chart.line",
  pie: "chart.pie",
};
const GRANULARITY_LABEL: Record<Granularity, MessageKey> = {
  day: "chart.day",
  month: "chart.month",
  year: "chart.year",
};
// 白い面の上で読める検証済みパレット（dataviz の既定 8 スロット、明色モード）。
const PIE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

// Renders a single bar as a stack of golden coins instead of a flat column.
function CoinStack(props: { x?: number; y?: number; width?: number; height?: number }) {
  const { x = 0, y = 0, width = 0, height = 0 } = props;
  if (height < 1 || width < 1) return null;

  const rx = Math.min(width, 46) / 2; // coin radius
  const ry = Math.max(2.5, rx * 0.22); // perspective squash for the elliptical face
  const cx = x + width / 2;
  const bottom = y + height;

  const stepH = Math.max(8, rx * 0.7); // body height of each coin
  const n = Math.max(1, Math.round(height / stepH));
  const step = height / n; // exact step so coins fill the bar

  const coins = [];
  for (let i = 0; i < n; i++) {
    const cyBot = bottom - i * step;
    const cyTop = cyBot - step;
    const off = (i % 2 === 0 ? -1 : 1) * Math.min(2, rx * 0.06); // subtle hand-stacked wobble
    const ccx = cx + off;
    coins.push(
      <g key={i}>
        {/* cylinder body */}
        <path
          d={`M ${ccx - rx} ${cyTop} L ${ccx - rx} ${cyBot} A ${rx} ${ry} 0 0 0 ${ccx + rx} ${cyBot} L ${ccx + rx} ${cyTop} A ${rx} ${ry} 0 0 1 ${ccx - rx} ${cyTop} Z`}
          fill="url(#coinSide)"
        />
        {/* top face */}
        <ellipse cx={ccx} cy={cyTop} rx={rx} ry={ry} fill="url(#coinFace)" stroke="rgba(150,100,15,0.55)" strokeWidth={0.75} />
        {/* engraved ring */}
        <ellipse cx={ccx} cy={cyTop} rx={rx * 0.58} ry={ry * 0.58} fill="none" stroke="rgba(150,100,15,0.4)" strokeWidth={0.75} />
      </g>
    );
  }
  return <g>{coins}</g>;
}

// Roll the daily series up to the chosen granularity.
function aggregate(
  series: { date: string; count: number }[],
  gran: Granularity,
  locale: string
) {
  const dayFmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const monthFmt = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", timeZone: "UTC" });

  if (gran === "day") {
    return series.map((s) => ({
      label: dayFmt.format(new Date(s.date + "T00:00:00Z")),
      value: s.count,
    }));
  }
  const buckets = new Map<string, number>();
  for (const s of series) {
    const key = gran === "month" ? s.date.slice(0, 7) : s.date.slice(0, 4); // YYYY-MM | YYYY
    buckets.set(key, (buckets.get(key) ?? 0) + s.count);
  }
  return [...buckets.entries()].map(([key, value]) => ({
    label:
      gran === "month" ? monthFmt.format(new Date(key + "-01T00:00:00Z")) : key,
    value,
  }));
}

export default function SubscriberChart() {
  const { t, intlLocale } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [type, setType] = useState<ChartType>("bar");
  const [gran, setGran] = useState<Granularity>("day");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/stats/subscribers", { cache: "no-store" });
        const data = await res.json();
        if (alive && res.ok) setStats(data);
      } catch {
        /* keep last value */
      }
    }
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const data = useMemo(
    () => (stats ? aggregate(stats.series, gran, intlLocale) : []),
    [stats, gran, intlLocale]
  );

  const axis = { fill: "#8a7b66", fontSize: 12 };
  const tooltipStyle = {
    background: "#ffffff",
    border: "1px solid #f2e6d2",
    borderRadius: 12,
    color: "#4a3f31",
  };

  return (
    <section className="p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t("chart.title")}</h2>
          <p className="text-muted">
            {t("chart.lead", {
              date: stats
                ? new Date(stats.launch + "T00:00:00Z").toLocaleDateString(intlLocale, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })
                : "—",
            })}
          </p>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted">{t("chart.total")}</div>
            <div className="text-3xl font-extrabold tabular-nums text-amber-600">
              {stats ? stats.total.toLocaleString() : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted">{t("chart.today")}</div>
            <div className="text-3xl font-extrabold tabular-nums text-emerald-600">
              {stats ? `+${stats.today.toLocaleString()}` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-cream p-1 text-sm">
          {(["bar", "line", "pie"] as ChartType[]).map((c) => (
            <button
              key={c}
              onClick={() => setType(c)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                type === c ? "bg-amber-400 text-slate-900" : "text-body hover:text-body"
              }`}
            >
              {t(CHART_TYPE_LABEL[c])}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl bg-cream p-1 text-sm">
          {(["day", "month", "year"] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGran(g)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                gran === g ? "bg-amber-400 text-slate-900" : "text-body hover:text-body"
              }`}
            >
              {t(GRANULARITY_LABEL[g])}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="mt-6 h-72 w-full">
        {data.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-faint">{t("common.loadingChart")}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {type === "bar" ? (
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                <defs>
                  <linearGradient id="coinFace" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffe9a8" />
                    <stop offset="55%" stopColor="#f7c64b" />
                    <stop offset="100%" stopColor="#e0a52e" />
                  </linearGradient>
                  <linearGradient id="coinSide" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e9aa2f" />
                    <stop offset="100%" stopColor="#a96f17" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ece4d6" vertical={false} />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(180,140,70,0.08)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="value" name={t("chart.signups")} fill="#f5b73d" maxBarSize={46} shape={<CoinStack />} activeBar={<CoinStack />} />
              </BarChart>
            ) : type === "line" ? (
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ece4d6" vertical={false} />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="value" name={t("chart.signups")} stroke="#c98500" strokeWidth={2} dot={{ r: 3, fill: "#c98500" }} activeDot={{ r: 5 }} />
              </LineChart>
            ) : (
              <PieChart>
                <Tooltip contentStyle={tooltipStyle} />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={50}
                  paddingAngle={2}
                  label={(p: { label: string }) => p.label}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#ffffff" />
                  ))}
                </Pie>
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>


    </section>
  );
}
