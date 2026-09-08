"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserProvider";
import Avatar from "@/components/Avatar";
import CoinBalance from "@/components/CoinBalance";
import { useI18n } from "@/lib/i18n/provider";

export default function ProfilePage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const { t, intlLocale } = useI18n();
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
        <h1 className="text-2xl font-bold">{t("profile.loginTitle")}</h1>
        <button onClick={openAuth} className="btn-gold mt-6">{t("common.loginRegister")}</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-slate-400">{t("common.loading")}</div>;

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
      flash(t("profile.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.saveFailed"));
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
      flash(t("profile.avatarUpdated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const joined = new Date(profile.created_at).toLocaleDateString(intlLocale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold">
          {profile.is_admin ? t("profile.titleAdmin") : t("profile.title")}
        </h1>
        {profile.is_admin && (
          <Link href="/admin" className="btn-ghost text-sm">{t("profile.adminDashboard")}</Link>
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
            {uploading ? t("profile.uploading") : t("profile.uploadAvatar")}
          </button>
          <p className="text-xs text-slate-500">{t("profile.avatarNote")}</p>

          <div className="mt-2 w-full space-y-2 border-t border-white/10 pt-4 text-left text-sm">
            <div className="flex justify-between"><span className="text-slate-400">{t("profile.email")}</span><span>{profile.email}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">{t("profile.memberSince")}</span><span>{joined}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">{t("profile.loginStreak")}</span><span>{t("profile.days", { count: profile.streak })}</span></div>
            {profile.is_admin && (
              <div className="flex justify-between"><span className="text-slate-400">{t("profile.role")}</span><span className="text-amber-300">{t("profile.administrator")}</span></div>
            )}
          </div>
          <div className="w-full border-t border-white/10 pt-4">
            <div className="mb-2 text-left text-sm text-slate-400">{t("profile.coinsHeld")}</div>
            <CoinBalance profile={profile} size={24} />
          </div>
        </div>

        {/* Editable info */}
        <form onSubmit={save} className="card space-y-4 p-6">
          <h2 className="text-lg font-bold">{t("profile.personalInfo")}</h2>
          <div>
            <label className="label">{t("profile.nickname")}</label>
            <input className="input" value={form.nickname} onChange={set("nickname")} required />
          </div>
          <div>
            <label className="label">{t("profile.email")}</label>
            <input className="input opacity-60" value={profile.email} disabled />
            <p className="mt-1 text-xs text-slate-500">{t("profile.emailNote")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{t("profile.nationality")}</label>
              <input
                className="input"
                value={form.nationality}
                onChange={set("nationality")}
                placeholder={t("profile.nationalityPlaceholder")}
              />
            </div>
            <div>
              <label className="label">{t("profile.discordId")}</label>
              <input className="input" value={form.discord_id} onChange={set("discord_id")} placeholder="name#0000" />
            </div>
          </div>
          <button type="submit" className="btn-gold w-full" disabled={saving}>
            {saving ? t("common.saving") : t("profile.saveChanges")}
          </button>
        </form>
      </div>
    </div>
  );
}
