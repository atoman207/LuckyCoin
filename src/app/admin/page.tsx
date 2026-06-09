"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";
import Avatar from "@/components/Avatar";
import CoinIcon from "@/components/CoinIcon";
import { COIN_VALUE } from "@/lib/coins";

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
  streak: number;
  last_bonus_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

type Txn = {
  id: string;
  silver: number;
  usd_amount: number;
  currency: string | null;
  wallet_address: string | null;
  method: string;
  status: string;
  created_at: string;
  profiles: { nickname: string; email: string } | null;
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

export default function AdminPage() {
  const { profile, loading } = useUser();
  const [tab, setTab] = useState<"users" | "transactions">("users");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
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

  useEffect(() => {
    if (!profile?.is_admin) return;
    loadUsers();
    loadTxns();
  }, [profile, loadUsers, loadTxns]);

  if (loading) return <div className="py-20 text-center text-slate-400">Loading…</div>;
  if (!profile?.is_admin) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Admins only</h1>
        <p className="mt-2 text-slate-400">This area is restricted.</p>
      </div>
    );
  }

  const filtered = (rows ?? []).filter(
    (r) =>
      r.nickname.toLowerCase().includes(q.toLowerCase()) ||
      r.email.toLowerCase().includes(q.toLowerCase())
  );

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Admin dashboard</h1>
          <p className="text-slate-400">{rows?.length ?? 0} players · {txns?.length ?? 0} transactions</p>
        </div>
        <div className="flex gap-2 rounded-xl bg-black/30 p-1">
          {(["users", "transactions"] as const).map((t) => (
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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              className="input max-w-xs"
              placeholder="Search nickname or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button onClick={() => setEditing("new")} className="btn-gold text-sm">+ New user</button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Discord</th>
                  <th className="px-4 py-3">Last login</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Gold</th>
                  <th className="px-4 py-3 text-right">Silver</th>
                  <th className="px-4 py-3 text-right">Bronze</th>
                  <th className="px-4 py-3 text-center">Admin</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows === null ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">No players found.</td></tr>
                ) : (
                  filtered.map((r) => (
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
                      <td className="px-4 py-3 text-slate-300">{r.nationality ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-300">{r.discord_id ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400">{fmt(r.last_sign_in_at)}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDate(r.created_at)}</td>
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
                <th className="px-4 py-3">Wallet address</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {txns === null ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
              ) : txns.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No transactions yet.</td></tr>
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
                    <td className="px-4 py-3"><span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-200">{t.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

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
