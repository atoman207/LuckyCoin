import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_TAG, fromStripeAmount, getStripe, isStripeConfigured } from "@/lib/stripe";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOLDING_BUCKETS = [
  { id: "bronze", min: 0, max: 9 },
  { id: "silver", min: 10, max: 49 },
  { id: "gold", min: 50, max: 199 },
  { id: "platinum", min: 200, max: 999 },
  { id: "diamond", min: 1000, max: Number.POSITIVE_INFINITY },
] as const;

type ActivityType = "purchase" | "sell" | "contact" | "signup";

export async function GET() {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: t("api.admin.only") }, { status: 403 });

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, nickname, email, kind, gold, silver, bronze, created_at, is_admin");

  const all = profiles ?? [];
  const real = all.filter((p) => p.kind !== "bot");
  const membersTotal = real.length;

  // Active = real users with auth login in last 24h
  const activeIds = new Set<string>();
  const botIds = new Set(all.filter((p) => p.kind === "bot").map((p) => p.id));
  for (let page = 1; page <= 40; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 50 });
    if (error) break;
    for (const u of data.users) {
      if (!u.last_sign_in_at) continue;
      if (u.last_sign_in_at < since24h) continue;
      if (botIds.has(u.id)) continue;
      activeIds.add(u.id);
    }
    if (data.users.length < 50) break;
  }

  const coins = real.reduce(
    (a, p) => ({
      gold: a.gold + (p.gold ?? 0),
      silver: a.silver + (p.silver ?? 0),
      bronze: a.bronze + (p.bronze ?? 0),
    }),
    { gold: 0, silver: 0, bronze: 0 }
  );
  const coinCirculation = coins.gold + coins.silver + coins.bronze;

  const holdings = HOLDING_BUCKETS.map((b) => ({
    id: b.id,
    count: real.filter((p) => {
      const g = p.gold ?? 0;
      return g >= b.min && g <= b.max;
    }).length,
  }));

  // Consumption-style breakdown
  const [{ count: roundsCount }, { data: sellRows }, { data: purchaseRows }] = await Promise.all([
    admin.from("game_rounds").select("id", { count: "exact", head: true }),
    admin.from("sells").select("gold, status, created_at, profiles(nickname, email)").limit(2000),
    admin
      .from("purchases")
      .select("id, silver, credited, created_at, status, profiles(nickname, email)")
      .limit(2000),
  ]);

  type Prof = { nickname?: string; email?: string } | null;
  const soldGold = (sellRows ?? [])
    .filter((s) => s.status === "paid" || s.status === "completed")
    .reduce((n, s) => n + (s.gold ?? 0), 0);
  const purchasedSilver = (purchaseRows ?? [])
    .filter((p) => p.credited)
    .reduce((n, p) => n + (p.silver ?? 0), 0);

  const consumption = [
    { id: "play", value: roundsCount ?? 0 },
    { id: "purchase", value: purchasedSilver },
    { id: "sell", value: soldGold },
  ];

  // Recent activity feed
  const { data: contacts } = await admin
    .from("contacts")
    .select("id, name, email, created_at")
    .order("created_at", { ascending: false })
    .limit(12);

  const activity: {
    id: string;
    type: ActivityType;
    at: string;
    title: string;
    detail: string;
  }[] = [];

  for (const p of (purchaseRows ?? [])
    .filter((x) => x.credited)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 10)) {
    const prof = p.profiles as unknown as Prof;
    activity.push({
      id: `purchase-${p.id}`,
      type: "purchase",
      at: p.created_at,
      title: prof?.nickname ?? prof?.email ?? "—",
      detail: `silver × ${p.silver}`,
    });
  }
  for (const s of (sellRows ?? [])
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 10)) {
    const prof = (s as { profiles?: Prof }).profiles ?? null;
    activity.push({
      id: `sell-${s.created_at}-${s.gold}`,
      type: "sell",
      at: s.created_at,
      title: prof?.nickname ?? t("admin.dashActivitySell"),
      detail: `gold × ${s.gold} · ${s.status}`,
    });
  }
  for (const c of contacts ?? []) {
    activity.push({
      id: `contact-${c.id}`,
      type: "contact",
      at: c.created_at,
      title: c.name ?? c.email ?? "—",
      detail: t("admin.dashActivityContact"),
    });
  }
  for (const p of real
    .slice()
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 10)) {
    activity.push({
      id: `signup-${p.id}`,
      type: "signup",
      at: p.created_at,
      title: p.nickname,
      detail: t("admin.dashActivitySignup"),
    });
  }
  activity.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const recentActivity = activity.slice(0, 8);

  // Sales series from Stripe (best effort)
  let todaySales = 0;
  let todaySalesCount = 0;
  let salesCurrency = "JPY";
  const series: { date: string; net: number; count: number }[] = [];
  const days = 30;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    series.push({ date: d, net: 0, count: 0 });
  }

  if (isStripeConfigured()) {
    try {
      const stripe = getStripe();
      const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
      const { data: orders } = await admin
        .from("purchases")
        .select("id")
        .eq("method", "stripe")
        .gte("created_at", new Date((since - 86400) * 1000).toISOString())
        .limit(2000);
      const orderIds = new Set((orders ?? []).map((o) => o.id));

      let startingAfter: string | undefined;
      const perDay = new Map(series.map((s) => [s.date, s]));

      for (let page = 0; page < 10; page++) {
        const res: Stripe.ApiList<Stripe.PaymentIntent> = await stripe.paymentIntents.list({
          limit: 100,
          created: { gte: since },
          starting_after: startingAfter,
          expand: ["data.latest_charge"],
        });
        for (const pi of res.data) {
          if (pi.status !== "succeeded") continue;
          const orderId = pi.metadata?.order_id ?? "";
          const isOurs = pi.metadata?.app === APP_TAG || orderIds.has(orderId);
          if (!isOurs) continue;
          const charge =
            pi.latest_charge && typeof pi.latest_charge !== "string" ? pi.latest_charge : null;
          const amount = fromStripeAmount(pi.amount_received || 0, pi.currency);
          const refunded = fromStripeAmount(charge?.amount_refunded ?? 0, pi.currency);
          const net = amount - refunded;
          const d = new Date(pi.created * 1000).toISOString().slice(0, 10);
          const bucket = perDay.get(d);
          if (bucket) {
            bucket.net += net;
            bucket.count += 1;
          }
          salesCurrency = pi.currency.toUpperCase();
          if (d === today) {
            todaySales += net;
            todaySalesCount += 1;
          }
        }
        if (!res.has_more) break;
        startingAfter = res.data[res.data.length - 1]?.id;
        if (!startingAfter) break;
      }
    } catch (e) {
      console.error("[admin/dashboard] stripe series failed:", e);
    }
  }

  const membersToday = real.filter((p) => (p.created_at ?? "").slice(0, 10) === today).length;

  return NextResponse.json({
    kpis: {
      membersTotal,
      membersToday,
      activeUsers: activeIds.size,
      coinCirculation,
      coins,
      todaySales,
      todaySalesCount,
      salesCurrency,
    },
    salesSeries: series,
    consumption,
    holdings,
    recentActivity,
    fetchedAt: new Date().toISOString(),
  });
}
