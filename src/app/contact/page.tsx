"use client";

import { useState } from "react";
import { useUser } from "@/components/UserProvider";

export default function ContactPage() {
  const { profile } = useUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDone(data.message ?? "Message sent.");
      setMessage("");
      if (!profile) {
        setName("");
        setEmail("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Contact us</h1>
        <p className="text-slate-400">
          Have a question or an issue? Send us a message and we&apos;ll get back to you.
        </p>
      </div>

      {done && (
        <div className="card animate-pop border-emerald-300/40 bg-emerald-300/10 px-4 py-3 text-center font-semibold text-emerald-100">
          ✓ {done}
        </div>
      )}
      {error && <div className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-red-300">{error}</div>}

      <form onSubmit={submit} className="card space-y-4 p-6">
        {profile ? (
          <p className="text-sm text-slate-400">
            Sending as <span className="font-semibold text-slate-200">{profile.nickname}</span> ({profile.email}).
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Your name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="label">Your email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="So we can reply"
              />
            </div>
          </div>
        )}

        <div>
          <label className="label">Message</label>
          <textarea
            className="input min-h-[140px] resize-y"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={4000}
            placeholder="How can we help?"
          />
        </div>

        <button type="submit" disabled={busy || !message.trim()} className="btn-gold w-full text-lg">
          {busy ? "Sending…" : "Send message"}
        </button>
      </form>
    </div>
  );
}
