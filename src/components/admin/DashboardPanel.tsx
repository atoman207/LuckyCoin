"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import SubscriberChart from "@/components/SubscriberChart";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

type Dash = {
  kpis: {
    membersTotal: number;
    membersToday: number;
    activeUsers: number;
    coinCirculation: number;
    coins: { gold: number; silver: number; bronze: number };
    todaySales: number;
    todaySalesCount: number;
    salesCurrency: string;
  };
  salesSeries: { date: string; net: number; count: number }[];
  consumption: { id: string; value: number }[];
  holdings: { id: string; count: number }[];
  recentActivity: {
    id: string;
    type: string;
    at: string;
    title: string;
    detail: string;
  }[];
};

const PIE = ["#525252", "#737373", "#a3a3a3", "#404040", "#d4d4d4"];
const HOLDING_LABEL: Record<string, MessageKey> = {
  bronze: "admin.dashBucketBronze",
  silver: "admin.dashBucketSilver",
  gold: "admin.dashBucketGold",
  platinum: "admin.dashBucketPlatinum",
  diamond: "admin.dashBucketDiamond",
};
const CONSUME_LABEL: Record<string, MessageKey> = {
  play: "admin.dashConsumePlay",
  purchase: "admin.dashConsumePurchase",
  sell: "admin.dashConsumeSell",
};
const ACTIVITY_LABEL: Record<string, MessageKey> = {
  purchase: "admin.dashTypePurchase",
  sell: "admin.dashTypeSell",
  contact: "admin.dashTypeContact",
  signup: "admin.dashTypeSignup",
};

export default function DashboardPanel() {
  const { t, intlLocale } = useI18n();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) setError(json.error ?? t("common.somethingWrong"));
        else setData(json);
      } catch {
        if (alive) setError(t("common.somethingWrong"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  const salesChart = useMemo(() => {
    if (!data) return [];
    const fmt = new Intl.DateTimeFormat(intlLocale, { month: "numeric", day: "numeric" });
    return data.salesSeries.map((s) => ({
      ...s,
      label: fmt.format(new Date(s.date + "T00:00:00Z")),
    }));
  }, [data, intlLocale]);

  const consumeChart = useMemo(() => {
    if (!data) return [];
    return data.consumption
      .filter((c) => c.value > 0)
      .map((c) => ({
        name: t(CONSUME_LABEL[c.id] ?? "admin.dashConsumePlay"),
        value: c.value,
      }));
  }, [data, t]);

  const holdingsChart = useMemo(() => {
    if (!data) return [];
    return data.holdings.map((h) => ({
      name: t(HOLDING_LABEL[h.id] ?? "admin.dashBucketBronze"),
      value: h.count,
    }));
  }, [data, t]);

  const axis = { fill: "#525252", fontSize: 11 };
  const tip = {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 4,
    color: "#171717",
  };

  if (error) {
    return <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
  }
  if (!data) {
    return <div className="py-12 text-center text-sm text-neutral-500">{t("common.loading")}</div>;
  }

  const { kpis } = data;
  const money = (n: number) =>
    kpis.salesCurrency === "JPY"
      ? `¥${Math.round(n).toLocaleString(intlLocale)}`
      : `${kpis.salesCurrency} ${n.toLocaleString(intlLocale)}`;

  const kpisRow = [
    { label: t("admin.dashKpiMembers"), value: kpis.membersTotal.toLocaleString(intlLocale), hint: t("admin.dashKpiMembersHint", { n: kpis.membersToday }) },
    { label: t("admin.dashKpiActive"), value: kpis.activeUsers.toLocaleString(intlLocale), hint: t("admin.dashKpiActiveHint") },
    {
      label: t("admin.dashKpiCoins"),
      value: kpis.coinCirculation.toLocaleString(intlLocale),
      hint: t("admin.dashKpiCoinsHint", { g: kpis.coins.gold, s: kpis.coins.silver, b: kpis.coins.bronze }),
    },
    { label: t("admin.dashKpiSales"), value: money(kpis.todaySales), hint: t("admin.dashKpiSalesHint", { n: kpis.todaySalesCount }) },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-600">{t("admin.dashLead")}</p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpisRow.map((k) => (
          <div key={k.label} className="rounded border border-neutral-200 bg-white p-4">
            <div className="text-xs text-neutral-500">{k.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
            <div className="mt-1 text-xs text-neutral-500">{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Signup chart: bar / line / pie */}
      <div className="rounded border border-neutral-200">
        <SubscriberChart />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded border border-neutral-200 p-4">
          <div className="text-sm font-bold">{t("admin.dashSalesTrend")}</div>
          <div className="mt-1 text-xs text-neutral-500">{t("admin.dashSalesTrendLead")}</div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesChart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tip} />
                <Line type="monotone" dataKey="net" name={t("admin.payChartNet")} stroke="#404040" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded border border-neutral-200 p-4">
          <div className="text-sm font-bold">{t("admin.dashConsumeTitle")}</div>
          <div className="mt-1 text-xs text-neutral-500">{t("admin.dashConsumeLead")}</div>
          <div className="mt-3 h-56">
            {consumeChart.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-neutral-400">{t("admin.dashNoData")}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip contentStyle={tip} />
                  <Pie data={consumeChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={40}>
                    {consumeChart.map((_, i) => (
                      <Cell key={i} fill={PIE[i % PIE.length]} stroke="#fff" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded border border-neutral-200 p-4">
          <div className="text-sm font-bold">{t("admin.dashHoldingsTitle")}</div>
          <div className="mt-1 text-xs text-neutral-500">{t("admin.dashHoldingsLead")}</div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={holdingsChart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="value" name={t("admin.dashHoldingsSeries")} fill="#525252" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded border border-neutral-200 p-4">
          <div className="text-sm font-bold">{t("admin.dashActivityTitle")}</div>
          <div className="mt-1 text-xs text-neutral-500">{t("admin.dashActivityLead")}</div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-neutral-200 text-neutral-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t("admin.colDate")}</th>
                  <th className="py-2 pr-3 font-medium">{t("admin.dashColType")}</th>
                  <th className="py-2 font-medium">{t("admin.dashColContent")}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-neutral-400">{t("admin.dashNoData")}</td>
                  </tr>
                ) : (
                  data.recentActivity.map((a) => (
                    <tr key={a.id} className="border-b border-neutral-100">
                      <td className="whitespace-nowrap py-2 pr-3 text-neutral-500">
                        {new Date(a.at).toLocaleString(intlLocale)}
                      </td>
                      <td className="py-2 pr-3">{t(ACTIVITY_LABEL[a.type] ?? "admin.dashTypeSignup")}</td>
                      <td className="py-2">
                        <div className="font-medium">{a.title}</div>
                        <div className="text-xs text-neutral-500">{a.detail}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
