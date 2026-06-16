"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";
import Avatar from "@/components/Avatar";
import CoinIcon from "@/components/CoinIcon";
import { COIN_VALUE } from "@/lib/coins";
import { getPaymentMethod } from "@/lib/wallets";

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

type Txn = {
  id: string;
  silver: number;
  usd_amount: number;
  currency: string | null;
  wallet_address: string | null;
  to_address: string | null;
  method: string;
  status: string;
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

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

export default function AdminPage() {
  const { profile, loading } = useUser();
  const [tab, setTab] = useState<"users" | "transactions" | "sells" | "messages" | "bots">("users");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [sells, setSells] = useState<Sell[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "real" | "bot">("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); // signup order by default
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | "new" | null>(null);

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

  if (loading) return <div className="py-20 text-center text-slate-400">Loading…</div>;
  if (!profile?.is_admin) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Admins only</h1>
        <p className="mt-2 text-slate-400">This area is restricted.</p>
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

  const botCount = (rows ?? []).filter((r) => r.kind === "bot").length;
  const realCount = (rows ?? []).filter((r) => r.kind === "real").length;

  const totals = (rows ?? []).reduce(
    (a, r) => ({ gold: a.gold + r.gold, silver: a.silver + r.silver, bronze: a.bronze + r.bronze }),
    { gold: 0, silver: 0, bronze: 0 }
  );

  async function remove(r: Row) {
    if (!confirm(`Delete ${r.nickname} (${r.email})? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users?id=${r.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    loadUsers();
  }

  return (
    // Break out of the layout's centered max-w container to full width, with
    // 3vw left/right margins instead.
    <div className="space-y-6 mx-[calc(50%-50vw)] w-screen px-[3vw]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Admin dashboard</h1>
          <p className="text-slate-400">
            {rows?.length ?? 0} players ({realCount} real · {botCount} bot) · {txns?.length ?? 0} transactions · {sells?.length ?? 0} sell requests
          </p>
        </div>
        <div className="flex gap-2 rounded-xl bg-black/30 p-1">
          {(["users", "transactions", "sells", "messages", "bots"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition ${
                tab === t ? "bg-amber-400 text-slate-900" : "text-slate-300 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/15 px-4 py-3 text-red-300">
          {error} <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Visitor / member stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total visitors", value: stats?.visitorsTotal, hint: "tried for free", tone: "text-sky-300" },
          { label: "Visitors today", value: stats?.visitorsToday, hint: "today", tone: "text-sky-300" },
          { label: "Total members", value: stats?.membersTotal, hint: "registered", tone: "text-emerald-300" },
          { label: "Members today", value: stats?.membersToday, hint: "joined/logged in", tone: "text-emerald-300" },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className="text-sm text-slate-400">{s.label}</div>
            <div className={`mt-1 text-3xl font-extrabold tabular-nums ${s.tone}`}>
              {s.value === undefined ? "…" : s.value.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500">{s.hint}</div>
          </div>
        ))}
      </div>

      {tab === "users" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {(["gold", "silver", "bronze"] as const).map((t) => (
              <div key={t} className="card flex items-center gap-3 p-5">
                <CoinIcon type={t} size={44} />
                <div>
                  <div className="text-sm capitalize text-slate-400">Total {t}</div>
                  <div className="text-2xl font-extrabold">{totals[t].toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              className="input max-w-xs flex-1"
              placeholder="Search name, email, country, Discord, type…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />

            {/* Kind filter */}
            <div className="flex gap-1 rounded-xl bg-black/30 p-1 text-sm">
              {(["all", "real", "bot"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setKindFilter(k);
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 font-semibold capitalize transition ${
                    kindFilter === k ? "bg-amber-400 text-slate-900" : "text-slate-300 hover:text-white"
                  }`}
                >
                  {k}
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
              <option value="created_at">Sort: Signup date</option>
              <option value="nickname">Sort: Name</option>
              <option value="last_sign_in_at">Sort: Last login</option>
              <option value="gold">Sort: Gold</option>
              <option value="silver">Sort: Silver</option>
              <option value="bronze">Sort: Bronze</option>
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10"
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
            </button>

            <button onClick={() => setEditing("new")} className="btn-gold ml-auto text-sm">+ New user</button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Discord</th>
                  <th className="px-4 py-3">Last login</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Draws</th>
                  <th className="px-4 py-3 text-right">Gold</th>
                  <th className="px-4 py-3 text-right">Silver</th>
                  <th className="px-4 py-3 text-right">Bronze</th>
                  <th className="px-4 py-3 text-center">Admin</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows === null ? (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-slate-500">No players found.</td></tr>
                ) : (
                  pageRows.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar src={r.avatar_url} name={r.nickname} size={34} />
                          <div>
                            <div className="font-semibold">{r.nickname}</div>
                            <div className="text-xs text-slate-500">{r.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            r.kind === "bot"
                              ? "bg-sky-400/15 text-sky-300"
                              : "bg-emerald-400/15 text-emerald-300"
                          }`}
                        >
                          {r.kind === "bot" ? "bot" : "real"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{r.nationality ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-300">{r.discord_id ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400">{fmt(r.last_sign_in_at)}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-sky-300">{r.draws}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-300">{r.gold}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-200">{r.silver}</td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-300">{r.bronze}</td>
                      <td className="px-4 py-3 text-center">{r.is_admin ? "✅" : "—"}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setEditing(r)} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10">Edit</button>
                        <button onClick={() => remove(r)} className="ml-2 rounded-lg border border-red-400/30 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10">Delete</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination — 20 users per page */}
          {sorted.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
              <span>
                Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, sorted.length)} of{" "}
                {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={current === 1}
                  className="rounded-lg border border-white/15 px-2.5 py-1 disabled:opacity-40 hover:bg-white/10"
                >
                  « First
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={current === 1}
                  className="rounded-lg border border-white/15 px-2.5 py-1 disabled:opacity-40 hover:bg-white/10"
                >
                  ‹ Prev
                </button>
                <span className="px-2 font-semibold text-slate-200">
                  Page {current} / {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={current === pageCount}
                  className="rounded-lg border border-white/15 px-2.5 py-1 disabled:opacity-40 hover:bg-white/10"
                >
                  Next ›
                </button>
                <button
                  onClick={() => setPage(pageCount)}
                  disabled={current === pageCount}
                  className="rounded-lg border border-white/15 px-2.5 py-1 disabled:opacity-40 hover:bg-white/10"
                >
                  Last »
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "transactions" && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-white/10 text-slate-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3 text-right">Silver</th>
                <th className="px-4 py-3 text-right">Price (USD)</th>
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3">Paid from</th>
                <th className="px-4 py-3">Paid to</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {txns === null ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
              ) : txns.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No transactions yet.</td></tr>
              ) : (
                txns.map((t) => (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="px-4 py-3 text-slate-400">{fmt(t.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.profiles?.nickname ?? "—"}</div>
                      <div className="text-xs text-slate-500">{t.profiles?.email ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-200">{t.silver.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-300">${Number(t.usd_amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-300">{t.currency ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400 break-all">{t.wallet_address ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-amber-200/80 break-all">{t.to_address ?? "—"}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-200">{t.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "sells" && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-white/10 text-slate-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3 text-right">Gold</th>
                <th className="px-4 py-3 text-right">Payout (USDT)</th>
                <th className="px-4 py-3">Receive as</th>
                <th className="px-4 py-3">Wallet address</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sells === null ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
              ) : sells.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No sell requests yet.</td></tr>
              ) : (
                sells.map((s) => {
                  const method = getPaymentMethod(s.method_id);
                  const paid = s.status === "paid";
                  return (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-3 text-slate-400">{fmt(s.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{s.profiles?.nickname ?? "—"}</div>
                        <div className="text-xs text-slate-500">{s.profiles?.email ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-300">{s.gold.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-300">{Number(s.usdt_amount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">{method?.label ?? s.method_id ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400 break-all">{s.payout_address ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${paid ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-200"}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => markSell(s.id, paid ? "requested" : "paid")}
                          className="btn-ghost text-xs"
                        >
                          {paid ? "Mark unpaid" : "Mark paid"}
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
        <div className="card divide-y divide-white/5 p-0">
          {contacts === null ? (
            <div className="px-4 py-8 text-center text-slate-500">Loading…</div>
          ) : contacts.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500">No messages yet.</div>
          ) : (
            contacts.map((c) => (
              <div key={c.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">
                    {c.name ?? "Anonymous"}{" "}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-sm font-normal text-amber-300 hover:underline">
                        &lt;{c.email}&gt;
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{fmt(c.created_at)}</div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{c.message}</p>
              </div>
            ))
          )}
        </div>
      )}

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
type BotConfig = { enabled: boolean; mode: "auto" | "manual"; count: number; min: number; max: number };
type BotToday = { day: string; target: number; added: number; updated_at: string } | null;

function BotsPanel({ onError }: { onError: (m: string) => void }) {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [today, setToday] = useState<BotToday>(null);
  const [counts, setCounts] = useState<{ bots: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/bot-config", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return onError(data.error);
    setConfig(data.config);
    setToday(data.today);
    setCounts(data.counts);
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!config) return;
    if (config.mode === "auto" && config.max < config.min) return onError("Max must be ≥ min.");
    if (config.mode === "manual" && config.count < 1) return onError("Enter how many users to add per day (1 or more).");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/bot-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSavedAt(new Date());
      load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <div className="card p-6 text-slate-400">Loading bot settings…</div>;

  const pct = today && today.target > 0 ? Math.min(100, Math.round((today.added / today.target) * 100)) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Settings */}
      <div className="card space-y-5 p-6">
        <div>
          <h2 className="text-lg font-bold">Daily new users</h2>
          <p className="mt-1 text-sm text-slate-400">
            New players are added in batches throughout each day. Choose a fixed number yourself
            (Manual), or let the bot add a random number for you (Automatic). Coins are random
            (gold ≤ 10, silver &amp; bronze &lt; 1,000,000).
          </p>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <span className="text-sm font-semibold">Enabled</span>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="h-5 w-5"
          />
        </label>

        {/* Mode: Automatic (random) vs Manual (admin sets the number) */}
        <div className="flex gap-1 rounded-xl bg-black/30 p-1 text-sm">
          {(["auto", "manual"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setConfig({ ...config, mode: m })}
              className={`flex-1 rounded-lg px-3 py-2 font-semibold capitalize transition ${
                config.mode === m ? "bg-amber-400 text-slate-900" : "text-slate-300 hover:text-white"
              }`}
            >
              {m === "auto" ? "Automatic" : "Manual"}
            </button>
          ))}
        </div>

        {config.mode === "manual" ? (
          <div>
            <label className="label">Users to add per day</label>
            <input
              className="input"
              type="number"
              min={50}
              value={config.count}
              onChange={(e) => setConfig({ ...config, count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
            <p className="mt-1 text-xs text-slate-500">
              Exactly this many new users are added each day (dripped in batches over 24h).
              Minimum 50/day is always enforced.
            </p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Min users / day</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={config.min}
                  onChange={(e) => setConfig({ ...config, min: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
              </div>
              <div>
                <label className="label">Max users / day</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={config.max}
                  onChange={(e) => setConfig({ ...config, max: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              The bot picks a random number in this range each day (default 100–1000, never below 50).
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={save} className="btn-gold" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
          {savedAt && <span className="text-xs text-emerald-300">Saved {savedAt.toLocaleTimeString()}</span>}
        </div>
        <p className="text-xs text-slate-500">
          Manual changes apply to <strong>today</strong> right away. Automatic-range changes affect
          future days — today&apos;s random target was already rolled (shown on the right).
        </p>
      </div>

      {/* Today's progress + totals */}
      <div className="card space-y-5 p-6">
        <h2 className="text-lg font-bold">Today</h2>
        {today ? (
          <>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-sm text-slate-400">Added / target ({today.day})</div>
                <div className="text-3xl font-extrabold tabular-nums">
                  {today.added.toLocaleString()}{" "}
                  <span className="text-lg font-medium text-slate-400">/ {today.target.toLocaleString()}</span>
                </div>
              </div>
              <div className="text-2xl font-bold text-emerald-300">{pct}%</div>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-slate-500">Last run: {new Date(today.updated_at).toLocaleString()}</div>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            No run yet today. The first hourly run will roll today&apos;s target and begin adding players.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
          <div>
            <div className="text-sm text-slate-400">Total players</div>
            <div className="text-2xl font-extrabold tabular-nums text-emerald-300">
              {counts?.total.toLocaleString() ?? "…"}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-400">Bot players</div>
            <div className="text-2xl font-extrabold tabular-nums text-sky-300">
              {counts?.bots.toLocaleString() ?? "…"}
            </div>
          </div>
        </div>
        <button onClick={load} className="btn-ghost text-sm">Refresh</button>
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
      onError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="card relative w-full max-w-lg p-6 animate-pop" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-white">✕</button>
        <h2 className="text-xl font-bold">{isNew ? "Create user" : `Edit ${row!.nickname}`}</h2>

        <form onSubmit={submit} className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Nickname</label>
            <input className="input" value={f.nickname} onChange={(e) => upd("nickname", e.target.value)} required />
          </div>
          <div className="col-span-2">
            <label className="label">Email</label>
            <input className="input" type="email" value={f.email} onChange={(e) => upd("email", e.target.value)} required />
          </div>
          <div className="col-span-2">
            <label className="label">{isNew ? "Password" : "New password (leave blank to keep)"}</label>
            <input className="input" type="text" value={f.password} onChange={(e) => upd("password", e.target.value)} required={isNew} placeholder={isNew ? "" : "••••••"} />
          </div>
          <div>
            <label className="label">Nationality</label>
            <input className="input" value={f.nationality} onChange={(e) => upd("nationality", e.target.value)} />
          </div>
          <div>
            <label className="label">Discord ID</label>
            <input className="input" value={f.discord_id} onChange={(e) => upd("discord_id", e.target.value)} />
          </div>
          <div>
            <label className="label">Gold</label>
            <input className="input" type="number" min={0} value={f.gold} onChange={(e) => upd("gold", Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Silver</label>
            <input className="input" type="number" min={0} value={f.silver} onChange={(e) => upd("silver", Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Bronze</label>
            <input className="input" type="number" min={0} value={f.bronze} onChange={(e) => upd("bronze", Number(e.target.value))} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_admin} onChange={(e) => upd("is_admin", e.target.checked)} className="h-4 w-4" />
            Administrator
          </label>
          <button type="submit" className="btn-gold col-span-2 mt-2" disabled={saving}>
            {saving ? "Saving…" : isNew ? "Create user" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
