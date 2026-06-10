"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/components/UserProvider";
import Avatar from "@/components/Avatar";

type Mode = "login" | "register" | "forgot";

const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB (matches the upload route)
const MIN_PASSWORD = 8;

export default function AuthModal() {
  const { authOpen, closeAuth, refresh } = useUser();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    nickname: "",
    email: "",
    password: "",
    confirm: "",
    nationality: "",
    discord_id: "",
  });

  // Avatar chosen during registration (uploaded right after sign-in).
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

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
      setError("Avatar must be a PNG, JPG, WEBP or GIF image.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError("Avatar must be 2 MB or smaller.");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createClient();
    const email = form.email.trim().toLowerCase();

    // Send the login email via our SMTP-backed route (not Supabase email).
    async function sendMagicLink() {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not send the login email.");
    }

    try {
      if (mode === "forgot") {
        await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setNotice(`If an account exists for ${email}, we've sent a password-reset link. Open it in this browser.`);
        return;
      }

      if (mode === "register") {
        if (form.password.length < MIN_PASSWORD) {
          throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
        }
        if (form.password !== form.confirm) {
          throw new Error("Passwords don't match.");
        }
        // Multipart so the avatar is uploaded at sign-up.
        const fd = new FormData();
        fd.append("nickname", form.nickname);
        fd.append("email", email);
        fd.append("password", form.password);
        fd.append("nationality", form.nationality);
        fd.append("discord_id", form.discord_id);
        if (avatarFile) fd.append("avatar", avatarFile);

        const res = await fetch("/api/register", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Registration failed.");

        // First login is confirmed by an email magic link (sent via SMTP).
        await sendMagicLink();
        clearAvatar();
        setNotice(`Account created! We've emailed a login link to ${email}. Open it to finish your first login.`);
        return;
      }

      // Login with password.
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: form.password });
      if (signInErr) throw new Error(signInErr.message);

      // First login still needs email confirmation — send the link and sign out.
      const meRes = await fetch("/api/me", { cache: "no-store" });
      const me = meRes.ok ? await meRes.json() : null;
      if (me?.profile && me.profile.first_login_done === false) {
        await supabase.auth.signOut();
        await sendMagicLink();
        setNotice(`For security, your first login must be confirmed by email. We've sent a login link to ${email}.`);
        return;
      }

      await refresh();
      closeAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={closeAuth}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="card relative w-full max-w-md p-6 sm:p-8 animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeAuth}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-2xl font-bold">
          {mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : "Reset your password"}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {mode === "login"
            ? "Log in to pick your lucky coin."
            : mode === "register"
              ? "Register and get a starting bonus of coins."
              : "Enter your email and we'll send a reset link."}
        </p>

        {mode !== "forgot" && (
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-black/30 p-1">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`rounded-lg py-2 text-sm font-semibold capitalize transition ${
                  mode === m ? "bg-amber-400 text-slate-900" : "text-slate-300 hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          {mode === "register" && (
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative rounded-full transition hover:opacity-90"
                aria-label="Choose an avatar"
              >
                <Avatar src={avatarPreview} name={form.nickname || "?"} size={76} />
                <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-amber-400 text-sm font-bold text-slate-900 ring-2 ring-[#121829]">
                  ＋
                </span>
              </button>
              <p className="text-xs text-slate-400">Add a profile avatar (optional)</p>
              {avatarPreview && (
                <button type="button" onClick={clearAvatar} className="text-xs text-red-300 hover:underline">
                  Remove
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
              <label className="label">Nickname</label>
              <input className="input" value={form.nickname} onChange={set("nickname")} required placeholder="CoinHunter" />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={set("email")} required placeholder="you@example.com" />
          </div>

          {mode !== "forgot" && (
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={set("password")}
                required
                placeholder="At least 8 characters"
                minLength={MIN_PASSWORD}
              />
              {mode === "register" && (
                <p className="mt-1 text-xs text-slate-500">Use at least {MIN_PASSWORD} characters.</p>
              )}
            </div>
          )}

          {mode === "register" && (
            <div>
              <label className="label">Confirm password</label>
              <input
                className="input"
                type="password"
                value={form.confirm}
                onChange={set("confirm")}
                required
                placeholder="Re-enter your password"
                minLength={MIN_PASSWORD}
              />
            </div>
          )}

          {mode === "login" && (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="text-xs text-amber-300 hover:underline"
            >
              Forgot password?
            </button>
          )}

          {mode === "register" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Nationality</label>
                <input className="input" value={form.nationality} onChange={set("nationality")} placeholder="e.g. USA" />
              </div>
              <div>
                <label className="label">Discord ID</label>
                <input className="input" value={form.discord_id} onChange={set("discord_id")} placeholder="name#0000" />
              </div>
            </div>
          )}

          {notice && (
            <p className="rounded-lg bg-emerald-400/15 px-3 py-2 text-sm text-emerald-200">✉️ {notice}</p>
          )}
          {error && (
            <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
          )}

          <button type="submit" className="btn-gold w-full" disabled={loading}>
            {loading
              ? "Please wait…"
              : mode === "login"
                ? "Log in"
                : mode === "register"
                  ? "Create account"
                  : "Send reset link"}
          </button>

          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="block w-full text-center text-xs text-slate-400 hover:underline"
            >
              ← Back to login
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
