"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserProvider";
import Avatar from "@/components/Avatar";
import CoinBalance from "@/components/CoinBalance";

export default function ProfilePage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ nickname: "", nationality: "", discord_id: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setForm({
        nickname: profile.nickname ?? "",
        nationality: profile.nationality ?? "",
        discord_id: profile.discord_id ?? "",
      });
    }
  }, [profile]);

  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Log in to view your profile</h1>
        <button onClick={openAuth} className="btn-gold mt-6">Log in / Register</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-slate-400">Loading…</div>;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function flash(m: string) {
    setMsg(m);
    setError(null);
    setTimeout(() => setMsg((c) => (c === m ? null : c)), 3500);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfile(data.profile);
      flash("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("avatar", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfile(data.profile);
      flash("Avatar updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const joined = new Date(profile.created_at).toLocaleDateString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold">
          {profile.is_admin ? "Administrator profile" : "My profile"}
        </h1>
        {profile.is_admin && (
          <Link href="/admin" className="btn-ghost text-sm">Admin dashboard →</Link>
        )}
      </div>

      {msg && (
        <div className="card animate-pop border-emerald-300/40 bg-emerald-300/10 px-4 py-3 text-center font-semibold text-emerald-100">
          ✓ {msg}
        </div>
      )}
      {error && <div className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-red-300">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Avatar + summary */}
        <div className="card flex flex-col items-center gap-4 p-6 text-center">
          <Avatar src={profile.avatar_url} name={profile.nickname} size={120} />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onAvatar}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-ghost text-sm"
          >
            {uploading ? "Uploading…" : "Upload avatar"}
          </button>
          <p className="text-xs text-slate-500">PNG/JPG/WEBP/GIF, up to 2 MB.</p>

          <div className="mt-2 w-full space-y-2 border-t border-white/10 pt-4 text-left text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Email</span><span>{profile.email}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Member since</span><span>{joined}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Login streak</span><span>{profile.streak} day(s)</span></div>
            {profile.is_admin && (
              <div className="flex justify-between"><span className="text-slate-400">Role</span><span className="text-amber-300">Administrator</span></div>
            )}
          </div>
          <div className="w-full border-t border-white/10 pt-4">
            <div className="mb-2 text-left text-sm text-slate-400">Coins held</div>
            <CoinBalance profile={profile} size={24} />
          </div>
        </div>

        {/* Editable info */}
        <form onSubmit={save} className="card space-y-4 p-6">
          <h2 className="text-lg font-bold">Personal information</h2>
          <div>
            <label className="label">Nickname</label>
            <input className="input" value={form.nickname} onChange={set("nickname")} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input opacity-60" value={profile.email} disabled />
            <p className="mt-1 text-xs text-slate-500">Contact an administrator to change your email.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Nationality</label>
              <input className="input" value={form.nationality} onChange={set("nationality")} placeholder="e.g. USA" />
            </div>
            <div>
              <label className="label">Discord ID</label>
              <input className="input" value={form.discord_id} onChange={set("discord_id")} placeholder="name#0000" />
            </div>
          </div>
          <button type="submit" className="btn-gold w-full" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
