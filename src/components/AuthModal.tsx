"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/components/UserProvider";
import Avatar from "@/components/Avatar";

type Mode = "login" | "register";

const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB (matches the upload route)

export default function AuthModal() {
  const { authOpen, closeAuth, refresh, openWelcome } = useUser();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    nickname: "",
    email: "",
    password: "",
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
    if (m === "login") clearAvatar();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Registration failed.");
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (signInErr) throw new Error(signInErr.message);

      // Upload the chosen avatar now that the user is authenticated. A failure
      // here shouldn't undo a successful registration/sign-in.
      if (mode === "register" && avatarFile) {
        try {
          const fd = new FormData();
          fd.append("avatar", avatarFile);
          await fetch("/api/profile/avatar", { method: "POST", body: fd });
        } catch {
          /* avatar can be set later from the profile page */
        }
      }

      clearAvatar();
      await refresh();
      closeAuth();
      // Welcome the new member with the lucky-coin message.
      if (mode === "register") openWelcome();
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
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {mode === "login"
            ? "Log in to pick your lucky coin."
            : "Register and get a starting bonus of coins."}
        </p>

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
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={form.password} onChange={set("password")} required placeholder="••••••••" minLength={6} />
          </div>

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

          {error && (
            <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
          )}

          <button type="submit" className="btn-gold w-full" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
