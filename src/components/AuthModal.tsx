"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/components/UserProvider";
import Avatar from "@/components/Avatar";
import PasswordInput from "@/components/PasswordInput";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import { authErrorMessage } from "@/lib/i18n/auth-errors";

type Mode = "login" | "register" | "forgot";

const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB (matches the upload route)
const MIN_PASSWORD = 8;

const TAB_LABEL: Record<"login" | "register", MessageKey> = {
  login: "auth.tabLogin",
  register: "auth.tabRegister",
};

export default function AuthModal() {
  const { authOpen, closeAuth, refresh, openWelcome } = useUser();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    nickname: "",
    email: "",
    password: "",
    confirm: "",
    chatwork_id: "",
    phone: "",
  });

  // Avatar chosen during registration (uploaded right after sign-in).
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // If a social login bounced back with an error, show the reason and clean
  // the URL so it doesn't reappear on refresh.
  useEffect(() => {
    if (!authOpen) return;
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("login_error");
    if (reason) {
      setError(reason === "1" ? t("auth.signInFailed") : decodeURIComponent(reason));
      window.history.replaceState({}, "", "/");
    }
  }, [authOpen, t]);

  if (!authOpen) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function clearAvatar() {
    setAvatarPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setAvatarFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      setError(t("auth.avatarType"));
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError(t("auth.avatarSize"));
      return;
    }
    setError(null);
    setAvatarPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setAvatarFile(file);
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
    if (m !== "register") clearAvatar();
  }

  // Sign in with Google via our server route. The browser talks to Google and
  // luckybronzecoin.com only — not supabase.co — so login works when
  // supabase.co is blocked on the user's network.
  function handleOAuth() {
    setError(null);
    setNotice(null);
    window.location.href = "/api/auth/google";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createClient();
    const email = form.email.trim().toLowerCase();

    try {
      if (mode === "forgot") {
        await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setNotice(t("auth.forgotSent", { email }));
        return;
      }

      if (mode === "register") {
        if (form.password.length < MIN_PASSWORD) {
          throw new Error(t("auth.passwordTooShort", { min: MIN_PASSWORD }));
        }
        if (form.password !== form.confirm) {
          throw new Error(t("auth.passwordMismatch"));
        }
        // Multipart so the avatar is uploaded at sign-up.
        const fd = new FormData();
        fd.append("nickname", form.nickname);
        fd.append("email", email);
        fd.append("password", form.password);
        fd.append("chatwork_id", form.chatwork_id);
        fd.append("phone", form.phone);
        if (avatarFile) fd.append("avatar", avatarFile);

        const res = await fetch("/api/register", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("auth.registerFailed"));

        // Sign in immediately with the password just registered — no email link.
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password: form.password,
        });
        if (signInErr) throw new Error(authErrorMessage(t, signInErr.message));

        clearAvatar();
        await refresh();
        closeAuth();
        openWelcome();
        return;
      }

      // Login with registered email + password.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: form.password,
      });
      if (signInErr) throw new Error(authErrorMessage(t, signInErr.message));

      await refresh();
      closeAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={closeAuth}
    >
      <div className="absolute inset-0 bg-[#4a3f31]/35 backdrop-blur-sm" />
      <div
        className={`card relative w-full animate-pop ${
          mode === "register"
            ? "max-w-lg p-5 sm:p-6"
            : "max-w-md p-6 sm:p-8"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeAuth}
          className="btn-close absolute right-3 top-3"
          aria-label={t("common.close")}
        >
          ✕
        </button>

        <h2 className="text-center text-2xl font-bold">
          {mode === "login"
            ? t("auth.loginTitle")
            : mode === "register"
              ? t("auth.registerTitle")
              : t("auth.forgotTitle")}
        </h2>
        <p className="mt-1 text-center text-sm text-muted">
          {mode === "login"
            ? t("auth.loginLead")
            : mode === "register"
              ? t("auth.registerLead")
              : t("auth.forgotLead")}
        </p>

        {mode !== "forgot" && (
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-cream p-1">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`btn-tab rounded-lg py-2 text-sm ${mode === m ? "btn-tab-on" : ""}`}
              >
                {t(TAB_LABEL[m])}
              </button>
            ))}
          </div>
        )}

        {mode !== "forgot" && (
          <div className="mt-5 space-y-2.5">
            <button
              type="button"
              onClick={handleOAuth}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-body transition hover:bg-cream disabled:cursor-not-allowed disabled:opacity-55"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 43.5c5.5 0 10.3-1.9 13.8-5.1l-6.4-5.4c-2 1.5-4.6 2.5-7.4 2.5-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.4 5.4c-.5.4 6.8-5 6.8-14.9 0-1.2-.1-2.3-.4-3.5z" />
              </svg>
              {t("auth.google")}
            </button>
            <div className="flex items-center gap-3 py-1 text-xs text-faint">
              <span className="h-px flex-1 bg-sand" />
              {t("auth.orEmail")}
              <span className="h-px flex-1 bg-sand" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-2 space-y-3">
          {mode === "register" && (
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative rounded-full transition hover:opacity-90"
                aria-label={t("auth.chooseAvatar")}
              >
                <Avatar src={avatarPreview} name={form.nickname || "?"} size={76} />
                <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-amber-400 text-sm font-bold text-slate-900 ring-2 ring-white">
                  ＋
                </span>
              </button>
              <p className="text-xs text-muted">{t("auth.avatarOptional")}</p>
              {avatarPreview && (
                <button type="button" onClick={clearAvatar} className="text-xs text-red-600 hover:underline">
                  {t("auth.remove")}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={onAvatarChange}
              />
            </div>
          )}
          {mode === "register" && (
            <div>
              <label className="label">
                {t("auth.nickname")}
                <span className="ml-0.5 align-super text-xs font-bold text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                className="input"
                value={form.nickname}
                onChange={set("nickname")}
                required
                placeholder={t("auth.nicknamePlaceholder")}
              />
            </div>
          )}
          <div>
            <label className="label">
              {t("auth.email")}
              <span className="ml-0.5 align-super text-xs font-bold text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={set("email")}
              required
              placeholder={t("auth.emailPlaceholder")}
            />
          </div>

          {mode !== "forgot" && (
            <div>
              <label className="label">
                {t("auth.password")}
                <span className="ml-0.5 align-super text-xs font-bold text-red-500" aria-hidden="true">*</span>
              </label>
              <PasswordInput
                value={form.password}
                onChange={set("password")}
                required
                placeholder={t("auth.passwordPlaceholder")}
                minLength={MIN_PASSWORD}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {mode === "register" && (
                <p className="mt-1 text-xs text-faint">{t("auth.passwordHint", { min: MIN_PASSWORD })}</p>
              )}
            </div>
          )}

          {mode === "register" && (
            <div>
              <label className="label">
                {t("auth.confirmPassword")}
                <span className="ml-0.5 align-super text-xs font-bold text-red-500" aria-hidden="true">*</span>
              </label>
              <PasswordInput
                value={form.confirm}
                onChange={set("confirm")}
                required
                placeholder={t("auth.confirmPlaceholder")}
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
              />
            </div>
          )}

          {mode === "login" && (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="text-xs text-amber-600 hover:underline"
            >
              {t("auth.forgotLink")}
            </button>
          )}

          {mode === "register" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="label">{t("auth.chatworkId")}</label>
                <input
                  className="input"
                  value={form.chatwork_id}
                  onChange={set("chatwork_id")}
                  placeholder={t("auth.chatworkPlaceholder")}
                  autoComplete="off"
                />
              </div>
              <div className="min-w-0">
                <label className="label">{t("auth.phone")}</label>
                <input
                  className="input"
                  type="tel"
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder={t("auth.phonePlaceholder")}
                  autoComplete="tel"
                />
              </div>
            </div>
          )}

          {notice && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✉️ {notice}</p>
          )}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button type="submit" className="btn-gold w-full" disabled={loading}>
            {loading
              ? t("common.pleaseWait")
              : mode === "login"
                ? t("auth.submitLogin")
                : mode === "register"
                  ? t("auth.submitRegister")
                  : t("auth.submitReset")}
          </button>

          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="block w-full text-center text-xs text-muted hover:underline"
            >
              {t("auth.backToLogin")}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
