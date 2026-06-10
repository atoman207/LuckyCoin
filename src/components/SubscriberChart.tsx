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

type Stats = {
  total: number;
  today: number;
  launch: string;
  series: { date: string; count: number }[];
};

type ChartType = "bar" | "line" | "pie";
type Granularity = "day" | "month" | "year";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PIE_COLORS = ["#f5b73d", "#34d399", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c", "#22d3ee", "#facc15", "#4ade80", "#f87171", "#c084fc", "#2dd4bf"];

// Roll the daily series up to the chosen granularity.
function aggregate(series: { date: string; count: number }[], gran: Granularity) {
  if (gran === "day") {
    return series.map((s) => {
      const d = new Date(s.date + "T00:00:00Z");
      return { label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, value: s.count };
    });
  }
  const buckets = new Map<string, number>();
  for (const s of series) {
    const key = gran === "month" ? s.date.slice(0, 7) : s.date.slice(0, 4); // YYYY-MM | YYYY
    buckets.set(key, (buckets.get(key) ?? 0) + s.count);
  }
  return [...buckets.entries()].map(([key, value]) => ({
    label: gran === "month" ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : key,
    value,
  }));
}

export default function SubscriberChart() {
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

  const data = useMemo(() => (stats ? aggregate(stats.series, gran) : []), [stats, gran]);

  const axis = { fill: "#94a3b8", fontSize: 12 };
  const tooltipStyle = {
    background: "#121829",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    color: "#e7ecf5",
  };

  return (
    <section className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">New subscribers</h2>
          <p className="text-slate-400">
            Sign-ups since launch on {stats ? new Date(stats.launch + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Jun 1, 2026"}.
          </p>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-400">Total</div>
            <div className="text-3xl font-extrabold tabular-nums text-amber-300">
              {stats ? stats.total.toLocaleString() : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-400">Today</div>
            <div className="text-3xl font-extrabold tabular-nums text-emerald-300">
              {stats ? `+${stats.today.toLocaleString()}` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-black/30 p-1 text-sm">
          {(["bar", "line", "pie"] as ChartType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg px-3 py-1.5 font-semibold capitalize transition ${
                type === t ? "bg-amber-400 text-slate-900" : "text-slate-300 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl bg-black/30 p-1 text-sm">
          {(["day", "month", "year"] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGran(g)}
              className={`rounded-lg px-3 py-1.5 font-semibold capitalize transition ${
                gran === g ? "bg-amber-400 text-slate-900" : "text-slate-300 hover:text-white"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="mt-6 h-72 w-full">
        {data.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-slate-500">Loading chart…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {type === "bar" ? (
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="value" name="Sign-ups" fill="#f5b73d" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            ) : type === "line" ? (
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="value" name="Sign-ups" stroke="#f5b73d" strokeWidth={3} dot={{ r: 3, fill: "#f5b73d" }} activeDot={{ r: 5 }} />
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
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#0b0f1a" />
                  ))}
                </Pie>
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        Live from the database · refreshes automatically
      </p>
    </section>
  );
}
