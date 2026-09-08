"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { authErrorMessage } from "@/lib/i18n/auth-errors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("reset.tooShort"));
    if (password !== confirm) return setError(t("reset.mismatch"));

    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(authErrorMessage(t, error.message));
      setDone(true);
      setTimeout(() => router.push("/"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("reset.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{t("reset.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("reset.lead")}</p>

        {done ? (
          <div className="mt-6 rounded-lg bg-emerald-400/15 px-4 py-3 text-center font-semibold text-emerald-200">
            {t("reset.done")}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <div>
              <label className="label">{t("reset.newPassword")}</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder={t("auth.passwordPlaceholder")}
              />
            </div>
            <div>
              <label className="label">{t("reset.confirmPassword")}</label>
              <input
                type="password"
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                placeholder={t("auth.confirmPlaceholder")}
              />
            </div>
            {error && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={busy} className="btn-gold w-full">
              {busy ? t("reset.updating") : t("reset.update")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
