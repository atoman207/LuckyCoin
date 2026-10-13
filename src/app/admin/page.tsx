"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/components/UserProvider";
import Avatar from "@/components/Avatar";
import CoinIcon from "@/components/CoinIcon";
import { coinName } from "@/lib/coins";
import { formatBankAccount, parseBankAccount } from "@/lib/bank-account";
import { getPayoutMethod } from "@/lib/payout-methods";
import RichText from "@/components/RichText";
import StripePaymentsPanel from "@/components/StripePaymentsPanel";
import SubscriberChart from "@/components/SubscriberChart";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey, TFunction } from "@/lib/i18n";

type Row = {
  id: string;
  nickname: string;
  email: string;
  nationality: string | null;
  discord_id: string | null;
  avatar_url: string | null;
  gold: number;
  silver: number;
  bronze: number;
  is_admin: boolean;
  kind: string; // 'real' | 'bot'
  streak: number;
  last_bonus_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  draws: number; // daily prize-wheel spins
};

type Stats = {
  visitorsTotal: number;
  visitorsToday: number;
  membersTotal: number;
  membersToday: number;
};

type SortKey = "created_at" | "nickname" | "last_sign_in_at" | "gold" | "silver" | "bronze";
const PAGE_SIZE = 20;

function SelectAllCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 accent-amber-400"
    />
  );
}

type Txn = {
  id: string;
  silver: number;
  usd_amount: number;
  currency: string | null;
  method: string;
  status: string;
  credited: boolean; // paid and coins granted — false for an order that was only opened
  created_at: string;
  profiles: { nickname: string; email: string } | null;
};

type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  message: string;
  handled: boolean;
  created_at: string;
};

type Sell = {
  id: string;
  gold: number;
  usdt_amount: number;
  method_id: string | null;
  payout_address: string | null;
  status: string;
  created_at: string;
  profiles: { nickname: string; email: string } | null;
};

// Tab + column labels live in the message catalogue.
const TAB_LABEL: Record<Tab, MessageKey> = {
  users: "admin.tabUsers",
  transactions: "admin.tabTransactions",
  sells: "admin.tabSells",
  messages: "admin.tabMessages",
  bots: "admin.tabBots",
  payments: "admin.tabPayments",
};
const KIND_LABEL: Record<"all" | "real" | "bot", MessageKey> = {
  all: "admin.filterAll",
  real: "admin.filterReal",
  bot: "admin.filterBot",
};
// Order/sell statuses are stored in English in the database; show them
// translated without changing what is persisted.
const STATUS_LABEL: Record<string, MessageKey> = {
  paid: "admin.statusPaid",
  requested: "admin.statusRequested",
  completed: "admin.statusCompleted",
  awaiting_payment: "admin.statusAwaiting",
  verification_failed: "admin.statusFailed",
  failed: "admin.statusFailed",
  canceled: "admin.statusCanceled",
};
const statusLabel = (t: TFunction, status: string) =>
  STATUS_LABEL[status] ? t(STATUS_LABEL[status]) : status;

// Purchase orders: green is reserved for orders that were actually paid, so an
// order that only reached the Stripe page can't be mistaken for a sale.
const TXN_STATUS_TONE: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700",
  awaiting_payment: "bg-amber-50 text-amber-800",
  failed: "bg-red-50 text-red-700",
  verification_failed: "bg-red-50 text-red-700",
};
const TXN_SCOPE_LABEL: Record<"paid" | "all", MessageKey> = {
  paid: "admin.txnPaidOnly",
  all: "admin.txnAll",
};

type Tab = "users" | "transactions" | "sells" | "messages" | "bots" | "payments";

export default function AdminPage() {
  const { profile, loading } = useUser();
  const { t, intlLocale } = useI18n();
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString(intlLocale) : "—");
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(intlLocale) : "—");
  const [tab, setTab] = useState<Tab>("users");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [txnScope, setTxnScope] = useState<"paid" | "all">("paid");
  const [sells, setSells] = useState<Sell[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "real" | "bot">("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc"); // newest signups first
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) setRows(data.users);
    else setError(data.error);
  }, []);

  const loadTxns = useCallback(async () => {
    const res = await fetch("/api/admin/transactions", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) setTxns(data.transactions);
    else setError(data.error);
  }, []);

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) setStats(data);
  }, []);

  const loadContacts = useCallback(async () => {
    const res = await fetch("/api/admin/contacts", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) setContacts(data.contacts);
    else setError(data.error);
  }, []);

  const loadSells = useCallback(async () => {
    const res = await fetch("/api/admin/sells", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) setSells(data.sells);
    else setError(data.error);
  }, []);

  useEffect(() => {
    if (!profile?.is_admin) return;
    loadUsers();
    loadTxns();
    loadStats();
    loadContacts();
    loadSells();
  }, [profile, loadUsers, loadTxns, loadStats, loadContacts, loadSells]);

  async function markSell(id: string, status: "paid" | "requested") {
    const res = await fetch("/api/admin/sells", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    loadSells();
  }

  if (loading) return <div className="py-20 text-center text-muted">{t("common.loading")}</div>;
  if (!profile?.is_admin) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">{t("admin.onlyTitle")}</h1>
        <p className="mt-2 text-muted">{t("admin.onlyBody")}</p>
      </div>
    );
  }

  // Search across ALL visible fields, then filter by kind, then sort.
  const needle = q.trim().toLowerCase();
  const filtered = (rows ?? [])
    .filter((r) => (kindFilter === "all" ? true : r.kind === kindFilter))
    .filter((r) => {
      if (!needle) return true;
      const hay = [
        r.nickname,
        r.email,
        r.nationality,
        r.discord_id,
        r.kind,
        r.is_admin ? "admin" : "",
        String(r.gold),
        String(r.silver),
        String(r.bronze),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "nickname") cmp = a.nickname.localeCompare(b.nickname);
    else if (sortKey === "gold" || sortKey === "silver" || sortKey === "bronze") cmp = a[sortKey] - b[sortKey];
    else cmp = new Date(a[sortKey] ?? 0).getTime() - new Date(b[sortKey] ?? 0).getTime();
    return sortDir === "asc" ? cmp : -cmp;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const selectableIds = sorted.filter((r) => r.id !== profile.id).map((r) => r.id);
  const selectedCount = selectableIds.filter((id) => selected.has(id)).length;
  const allFilteredSelected = selectableIds.length > 0 && selectedCount === selectableIds.length;
  const someFilteredSelected = selectedCount > 0 && !allFilteredSelected;

  const botCount = (rows ?? []).filter((r) => r.kind === "bot").length;
  const realCount = (rows ?? []).filter((r) => r.kind === "real").length;

  // Only paid orders are purchases. The rest were opened and never paid.
  const paidTxns = (txns ?? []).filter((x) => x.credited);
  const shownTxns = txnScope === "paid" ? paidTxns : txns ?? [];

  const totals = (rows ?? []).reduce(
    (a, r) => ({ gold: a.gold + r.gold, silver: a.silver + r.silver, bronze: a.bronze + r.bronze }),
    { gold: 0, silver: 0, bronze: 0 }
  );

  async function remove(r: Row) {
    if (!confirm(t("admin.deleteConfirm", { nickname: r.nickname, email: r.email }))) return;
    const res = await fetch(`/api/admin/users?id=${r.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(r.id);
      return next;
    });
    loadUsers();
  }

  function toggleSelected(id: string) {
    // Hoisted declaration, so `profile` is not narrowed by the guard above.
    if (id === profile?.id) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const id of selectableIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of selectableIds) next.add(id);
      return next;
    });
  }

  async function removeSelected() {
    const ids = selectableIds.filter((id) => selected.has(id));
    if (ids.length === 0) {
      setError(t("admin.deleteSelectedNone"));
      return;
    }
    if (!confirm(t("admin.deleteSelectedConfirm", { count: ids.length }))) return;
    setDeletingSelected(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      if (data.error) setError(data.error);
      setSelected(new Set());
      await loadUsers();
    } finally {
      setDeletingSelected(false);
    }
  }

  return (
    // Break out of the layout's centered max-w container to full width, with
    // 3vw left/right margins instead.
    <div className="space-y-6 mx-[calc(50%-50vw)] w-screen px-[3vw]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">{t("admin.title")}</h1>
          <p className="text-muted">
            {t("admin.summary", {
              players: rows?.length ?? 0,
              real: realCount,
              bots: botCount,
              txns: paidTxns.length,
              sells: sells?.length ?? 0,
            })}
          </p>
        </div>
        <div className="flex gap-2 rounded-xl bg-cream p-1">
          {(["users", "payments", "transactions", "sells", "messages", "bots"] as const).map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                tab === name ? "bg-amber-400 text-slate-900" : "text-body hover:text-body"
              }`}
            >
              {t(TAB_LABEL[name])}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-red-600">
          {error}{" "}
          <button onClick={() => setError(null)} className="ml-2 underline">
            {t("common.dismiss")}
          </button>
        </div>
      )}

      {/* Visitor / member stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "admin.visitorsTotal" as const, value: stats?.visitorsTotal, hint: "admin.visitorsTotalHint" as const, tone: "text-sky-600" },
          { label: "admin.visitorsToday" as const, value: stats?.visitorsToday, hint: "admin.visitorsTodayHint" as const, tone: "text-sky-600" },
          { label: "admin.membersTotal" as const, value: stats?.membersTotal, hint: "admin.membersTotalHint" as const, tone: "text-emerald-600" },
          { label: "admin.membersToday" as const, value: stats?.membersToday, hint: "admin.membersTodayHint" as const, tone: "text-emerald-600" },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className="text-sm text-muted">{t(s.label)}</div>
            <div className={`mt-1 text-3xl font-extrabold tabular-nums ${s.tone}`}>
              {s.value === undefined ? "…" : s.value.toLocaleString()}
            </div>
            <div className="text-xs text-faint">{t(s.hint)}</div>
          </div>
        ))}
      </div>

      {tab === "users" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {(["gold", "silver", "bronze"] as const).map((type) => (
              <div key={type} className="card flex items-center gap-3 p-5">
                <CoinIcon type={type} size={44} />
                <div>
                  <div className="text-sm text-muted">{t("admin.totalCoin", { name: coinName(t, type) })}</div>
                  <div className="text-2xl font-extrabold">{totals[type].toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 新規登録者数の推移。以前はトップページに出していましたが、
              運営用の指標なので管理画面に移しました（API 側も管理者限定）。 */}
          <div className="card">
            <SubscriberChart />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              className="input max-w-xs flex-1"
              placeholder={t("admin.searchPlaceholder")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />

            {/* Kind filter */}
            <div className="flex gap-1 rounded-xl bg-cream p-1 text-sm">
              {(["all", "real", "bot"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setKindFilter(k);
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                    kindFilter === k ? "bg-amber-400 text-slate-900" : "text-body hover:text-body"
                  }`}
                >
                  {t(KIND_LABEL[k])}
                  {k === "real" && ` (${realCount})`}
                  {k === "bot" && ` (${botCount})`}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="input max-w-[12rem]"
            >
              <option value="created_at">{t("admin.sortCreated")}</option>
              <option value="nickname">{t("admin.sortName")}</option>
              <option value="last_sign_in_at">{t("admin.sortLastLogin")}</option>
              <option value="gold">{t("admin.sortGold")}</option>
              <option value="silver">{t("admin.sortSilver")}</option>
              <option value="bronze">{t("admin.sortBronze")}</option>
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-sand"
              title={sortDir === "asc" ? t("admin.ascending") : t("admin.descending")}
            >
              {sortDir === "asc" ? t("admin.asc") : t("admin.desc")}
            </button>

            <button onClick={() => setEditing("new")} className="btn-gold ml-auto text-sm">{t("admin.newUser")}</button>
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={selectableIds.length === 0}
              className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-sand disabled:opacity-40"
            >
              {allFilteredSelected ? t("admin.deselectAll") : t("admin.selectAll")}
            </button>
            <button
              type="button"
              onClick={removeSelected}
              disabled={selectedCount === 0 || deletingSelected}
              className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40"
            >
              {deletingSelected
                ? t("common.loading")
                : `${t("admin.deleteSelected")}${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
            </button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <SelectAllCheckbox
                      checked={allFilteredSelected}
                      indeterminate={someFilteredSelected}
                      disabled={selectableIds.length === 0}
                      onChange={toggleSelectAll}
                      label={t("admin.selectAll")}
                    />
                  </th>
                  <th className="px-4 py-3">{t("admin.colPlayer")}</th>
                  <th className="px-4 py-3">{t("admin.colType")}</th>
                  <th className="px-4 py-3">{t("admin.colCountry")}</th>
                  <th className="px-4 py-3">{t("admin.colDiscord")}</th>
                  <th className="px-4 py-3">{t("admin.colLastLogin")}</th>
                  <th className="px-4 py-3">{t("admin.colJoined")}</th>
                  <th className="px-4 py-3 text-right">{t("admin.colDraws")}</th>
                  <th className="px-4 py-3 text-right">{t("coin.gold")}</th>
                  <th className="px-4 py-3 text-right">{t("coin.silver")}</th>
                  <th className="px-4 py-3 text-right">{t("coin.bronze")}</th>
                  <th className="px-4 py-3 text-center">{t("admin.colAdmin")}</th>
                  <th className="px-4 py-3 text-right">{t("admin.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows === null ? (
                  <tr><td colSpan={13} className="px-4 py-8 text-center text-faint">{t("common.loading")}</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-8 text-center text-faint">{t("admin.noPlayers")}</td></tr>
                ) : (
                  pageRows.map((r) => (
                    <tr key={r.id} className="border-b border-line hover:bg-cream">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          disabled={r.id === profile.id}
                          onChange={() => toggleSelected(r.id)}
                          aria-label={t("admin.colSelect")}
                          className="h-4 w-4 accent-amber-400 disabled:opacity-30"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar src={r.avatar_url} name={r.nickname} size={34} />
                          <div>
                            <div className="font-semibold">{r.nickname}</div>
                            <div className="text-xs text-faint">{r.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            r.kind === "bot"
                              ? "bg-sky-50 text-sky-600"
                              : "bg-emerald-50 text-emerald-600"
                          }`}
                        >
                          {r.kind === "bot" ? t("admin.typeBot") : t("admin.typeReal")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-body">{r.nationality ?? "—"}</td>
                      <td className="px-4 py-3 text-body">{r.discord_id ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{fmt(r.last_sign_in_at)}</td>
                      <td className="px-4 py-3 text-muted">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-sky-600">{r.draws}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-600">{r.gold}</td>
                      <td className="px-4 py-3 text-right font-semibold text-body">{r.silver}</td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-600">{r.bronze}</td>
                      <td className="px-4 py-3 text-center">{r.is_admin ? "✅" : "—"}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setEditing(r)} className="rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-sand">{t("common.edit")}</button>
                        <button onClick={() => remove(r)} className="ml-2 rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-100">{t("common.delete")}</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination — 20 users per page */}
          {sorted.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
              <span>
                {t("admin.showing", {
                  from: (current - 1) * PAGE_SIZE + 1,
                  to: Math.min(current * PAGE_SIZE, sorted.length),
                  total: sorted.length,
                })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={current === 1}
                  className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40 hover:bg-sand"
                >
                  {t("admin.pageFirst")}
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={current === 1}
                  className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40 hover:bg-sand"
                >
                  {t("admin.pagePrev")}
                </button>
                <span className="px-2 font-semibold text-body">
                  {t("admin.pageIndicator", { current, total: pageCount })}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={current === pageCount}
                  className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40 hover:bg-sand"
                >
                  {t("admin.pageNext")}
                </button>
                <button
                  onClick={() => setPage(pageCount)}
                  disabled={current === pageCount}
                  className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40 hover:bg-sand"
                >
                  {t("admin.pageLast")}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "transactions" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-[16rem] flex-1 text-sm text-muted">{t("admin.txnLead")}</p>
            <div className="flex gap-1 rounded-xl bg-cream p-1 text-sm">
              {(["paid", "all"] as const).map((scope) => (
                <button
                  key={scope}
                  onClick={() => setTxnScope(scope)}
                  aria-pressed={txnScope === scope}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                    txnScope === scope ? "bg-amber-400 text-slate-900" : "text-body hover:text-body"
                  }`}
                >
                  {t(TXN_SCOPE_LABEL[scope])}
                  {txns && ` (${scope === "paid" ? paidTxns.length : txns.length})`}
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="px-4 py-3">{t("admin.colDate")}</th>
                  <th className="px-4 py-3">{t("admin.colBuyer")}</th>
                  <th className="px-4 py-3 text-right">{t("coin.silver")}</th>
                  <th className="px-4 py-3 text-right">{t("admin.colPriceUsd")}</th>
                  <th className="px-4 py-3">{t("admin.colCurrency")}</th>
                  <th className="px-4 py-3">{t("admin.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {txns === null ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-faint">{t("common.loading")}</td></tr>
                ) : shownTxns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-faint">
                      {t(txnScope === "paid" ? "admin.noPaidTransactions" : "admin.noTransactions")}
                    </td>
                  </tr>
                ) : (
                  shownTxns.map((txn) => (
                    <tr key={txn.id} className="border-b border-line hover:bg-cream">
                      <td className="px-4 py-3 text-muted">{fmt(txn.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{txn.profiles?.nickname ?? "—"}</div>
                        <div className="text-xs text-faint">{txn.profiles?.email ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-body">{txn.silver.toLocaleString("ja-JP")}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${txn.credited ? "text-emerald-600" : "text-faint"}`}>
                        ${Number(txn.usd_amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-body">{txn.currency ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${TXN_STATUS_TONE[txn.status] ?? "bg-cream text-muted"}`}>
                          {statusLabel(t, txn.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "sells" && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3">{t("admin.colDate")}</th>
                <th className="px-4 py-3">{t("admin.colSeller")}</th>
                <th className="px-4 py-3 text-right">{t("coin.gold")}</th>
                <th className="px-4 py-3 text-right">{t("admin.colPayoutJpy")}</th>
                <th className="px-4 py-3">{t("admin.colReceiveAs")}</th>
                <th className="px-4 py-3">{t("admin.colBankAccount")}</th>
                <th className="px-4 py-3">{t("admin.colStatus")}</th>
                <th className="px-4 py-3 text-right">{t("admin.colAction")}</th>
              </tr>
            </thead>
            <tbody>
              {sells === null ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-faint">{t("common.loading")}</td></tr>
              ) : sells.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-faint">{t("admin.noSells")}</td></tr>
              ) : (
                sells.map((s) => {
                  const method = getPayoutMethod(s.method_id);
                  const bank = parseBankAccount(s.payout_address);
                  const paid = s.status === "paid";
                  return (
                    <tr key={s.id} className="border-b border-line hover:bg-cream">
                      <td className="px-4 py-3 text-muted">{fmt(s.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{s.profiles?.nickname ?? "—"}</div>
                        <div className="text-xs text-faint">{s.profiles?.email ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-600">{s.gold.toLocaleString("ja-JP")}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {Number(s.usdt_amount).toLocaleString("ja-JP")}円
                      </td>
                      <td className="px-4 py-3 text-body">{method?.label ?? s.method_id ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-pre-line">
                        {bank ? formatBankAccount(bank) : (s.payout_address ?? "—")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${paid ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {statusLabel(t, s.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => markSell(s.id, paid ? "requested" : "paid")}
                          className="btn-ghost text-xs"
                        >
                          {paid ? t("admin.markUnpaid") : t("admin.markPaid")}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "messages" && (
        <div className="card divide-y divide-line p-0">
          {contacts === null ? (
            <div className="px-4 py-8 text-center text-faint">{t("common.loading")}</div>
          ) : contacts.length === 0 ? (
            <div className="px-4 py-8 text-center text-faint">{t("admin.noMessages")}</div>
          ) : (
            contacts.map((c) => (
              <div key={c.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">
                    {c.name ?? t("admin.anonymous")}{" "}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-sm font-normal text-amber-600 hover:underline">
                        &lt;{c.email}&gt;
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-faint">{fmt(c.created_at)}</div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-body">{c.message}</p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "payments" && <StripePaymentsPanel onError={setError} />}

      {tab === "bots" && <BotsPanel onError={setError} />}

      {editing && (
        <UserModal
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadUsers();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

// -------- Bots: daily drip settings + today's progress ------------------
type BotConfig = {
  enabled: boolean;
  mode: "auto" | "manual";
  specificCount: number;
  count: number;
  min: number;
  max: number;
};
type BotToday = { day: string; target: number; added: number; updated_at: string } | null;
// What POST /api/admin/bots/generate reports back after a run.
type BotRunResult = { target: number; created: number; failed: number; todayTotal: number };

function BotsPanel({ onError }: { onError: (m: string) => void }) {
  const { t, intlLocale } = useI18n();
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [today, setToday] = useState<BotToday>(null);
  const [counts, setCounts] = useState<{ bots: number; total: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<BotRunResult | null>(null);
  // Server-owned cap on one Generate press (see lib/bots.ts).
  const [maxPerRun, setMaxPerRun] = useState(500);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/bot-config", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return onError(data.error);
    setConfig(data.config);
    setToday(data.today);
    setCounts(data.counts);
    if (typeof data.maxPerRun === "number") setMaxPerRun(data.maxPerRun);
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  // The Generate button: create today's players right now. "exact" uses the
  // number the admin typed; "range" rolls a random count inside [min, max].
  async function generate() {
    if (!config || generating) return;
    const exact = config.mode === "manual";
    if (exact && config.count < 1) return onError(t("admin.botCountError"));
    if (!exact && config.max < config.min) return onError(t("admin.botMaxError"));
    if (!confirm(t("admin.botGenerateConfirm"))) return;

    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/bots/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          exact
            ? { mode: "exact", count: config.count }
            : { mode: "range", min: config.min, max: config.max }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data as BotRunResult);
      load();
    } catch (e) {
      onError(e instanceof Error ? e.message : t("common.saveFailed"));
    } finally {
      setGenerating(false);
    }
  }

  if (!config) return <div className="card p-6 text-muted">{t("admin.botLoading")}</div>;

  const exact = config.mode === "manual";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Generate */}
      <div className="card space-y-5 p-6">
        <div>
          <h2 className="text-lg font-bold">{t("admin.botDailyTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("admin.botDailyLead")}</p>
        </div>

        {/* How today's number is decided: an exact figure, or a random range. */}
        <div className="flex gap-1 rounded-xl bg-cream p-1 text-sm">
          {(["manual", "auto"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setConfig({ ...config, mode: m })}
              className={`flex-1 rounded-lg px-3 py-2 font-semibold transition ${
                config.mode === m ? "bg-amber-400 text-slate-900" : "text-body hover:text-body"
              }`}
            >
              {m === "manual" ? t("admin.botModeManual") : t("admin.botModeAuto")}
            </button>
          ))}
        </div>

        {exact ? (
          <div>
            <label className="label">{t("admin.botCount")}</label>
            <input
              className="input"
              type="number"
              min={1}
              max={maxPerRun}
              value={config.count}
              onChange={(e) => setConfig({ ...config, count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
            <p className="mt-1 text-xs text-faint">{t("admin.botCountHint")}</p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t("admin.botMin")}</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={maxPerRun}
                  value={config.min}
                  onChange={(e) => setConfig({ ...config, min: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
              </div>
              <div>
                <label className="label">{t("admin.botMax")}</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={maxPerRun}
                  value={config.max}
                  onChange={(e) => setConfig({ ...config, max: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-faint">{t("admin.botRangeHint")}</p>
          </div>
        )}

        <button onClick={generate} className="btn-gold w-full" disabled={generating}>
          {generating ? t("admin.botGenerating") : t("admin.botGenerate")}
        </button>

        {generating && <p className="text-xs text-amber-700">{t("admin.botGeneratingHint")}</p>}

        {result && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {t("admin.botGenerated", { created: result.created, total: result.todayTotal })}
            {result.failed > 0 && ` ${t("admin.botGenerateFailed", { failed: result.failed })}`}
          </p>
        )}

        <p className="text-xs text-faint">{t("admin.botMaxHint", { max: maxPerRun })}</p>
      </div>

      {/* Today's totals */}
      <div className="card space-y-5 p-6">
        <h2 className="text-lg font-bold">{t("admin.botToday")}</h2>
        {today ? (
          <>
            <div>
              <div className="text-sm text-muted">{t("admin.botAddedToday", { day: today.day })}</div>
              <div className="text-4xl font-extrabold tabular-nums text-emerald-600">
                {today.added.toLocaleString()}
              </div>
            </div>
            <div className="text-xs text-faint">
              {t("admin.botLastRun", { time: new Date(today.updated_at).toLocaleString(intlLocale) })}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">{t("admin.botNoRun")}</p>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
          <div>
            <div className="text-sm text-muted">{t("admin.botTotalPlayers")}</div>
            <div className="text-2xl font-extrabold tabular-nums text-emerald-600">
              {counts?.total.toLocaleString() ?? "…"}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted">{t("admin.botPlayers")}</div>
            <div className="text-2xl font-extrabold tabular-nums text-sky-600">
              {counts?.bots.toLocaleString() ?? "…"}
            </div>
          </div>
        </div>
        <button onClick={load} className="btn-ghost text-sm">{t("common.refresh")}</button>
      </div>
    </div>
  );
}

// -------- Create / edit modal -------------------------------------------
function UserModal({
  row,
  onClose,
  onSaved,
  onError,
}: {
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useI18n();
  const isNew = row === null;
  const [f, setF] = useState({
    nickname: row?.nickname ?? "",
    email: row?.email ?? "",
    password: "",
    nationality: row?.nationality ?? "",
    discord_id: row?.discord_id ?? "",
    gold: row?.gold ?? 0,
    silver: row?.silver ?? 0,
    bronze: row?.bronze ?? 0,
    is_admin: row?.is_admin ?? false,
  });
  const [saving, setSaving] = useState(false);

  const upd = (k: keyof typeof f, v: string | number | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? f : { id: row!.id, ...f }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-[#4a3f31]/35 backdrop-blur-sm" />
      <div className="card relative w-full max-w-lg p-6 animate-pop" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-muted hover:text-body">✕</button>
        <h2 className="text-xl font-bold">
          {isNew ? t("admin.createUser") : t("admin.editUser", { nickname: row!.nickname })}
        </h2>

        <form onSubmit={submit} className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">{t("profile.nickname")}</label>
            <input className="input" value={f.nickname} onChange={(e) => upd("nickname", e.target.value)} required />
          </div>
          <div className="col-span-2">
            <label className="label">{t("profile.email")}</label>
            <input className="input" type="email" value={f.email} onChange={(e) => upd("email", e.target.value)} required />
          </div>
          <div className="col-span-2">
            <label className="label">{isNew ? t("admin.password") : t("admin.newPassword")}</label>
            <input className="input" type="text" value={f.password} onChange={(e) => upd("password", e.target.value)} required={isNew} placeholder={isNew ? "" : "••••••"} />
          </div>
          <div>
            <label className="label">{t("profile.nationality")}</label>
            <input className="input" value={f.nationality} onChange={(e) => upd("nationality", e.target.value)} />
          </div>
          <div>
            <label className="label">{t("profile.discordId")}</label>
            <input className="input" value={f.discord_id} onChange={(e) => upd("discord_id", e.target.value)} />
          </div>
          <div>
            <label className="label">{t("coin.gold")}</label>
            <input className="input" type="number" min={0} value={f.gold} onChange={(e) => upd("gold", Number(e.target.value))} />
          </div>
          <div>
            <label className="label">{t("coin.silver")}</label>
            <input className="input" type="number" min={0} value={f.silver} onChange={(e) => upd("silver", Number(e.target.value))} />
          </div>
          <div>
            <label className="label">{t("coin.bronze")}</label>
            <input className="input" type="number" min={0} value={f.bronze} onChange={(e) => upd("bronze", Number(e.target.value))} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_admin} onChange={(e) => upd("is_admin", e.target.checked)} className="h-4 w-4" />
            {t("admin.administrator")}
          </label>
          <button type="submit" className="btn-gold col-span-2 mt-2" disabled={saving}>
            {saving ? t("common.saving") : isNew ? t("admin.createUser") : t("admin.saveChanges")}
          </button>
        </form>
      </div>
    </div>
  );
}
