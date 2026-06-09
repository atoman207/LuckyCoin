"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/components/UserProvider";

type Mode = "login" | "register";

export default function AuthModal() {
  const { authOpen, closeAuth, refresh } = useUser();
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

  if (!authOpen) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
              onClick={() => {
                setMode(m);
                setError(null);
              }}
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
