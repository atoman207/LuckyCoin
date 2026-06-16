"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";

export default function ContactPage() {
  const { profile } = useUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Prefill name/email from the signed-in profile, but keep them editable.
  useEffect(() => {
    if (!profile) return;
    setName((n) => n || profile.nickname || "");
    setEmail((e) => e || profile.email || "");
  }, [profile]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(data.message ?? "Your message has been sent successfully!");
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Success toast */}
      {toast && (
        <div className="fixed left-1/2 top-6 z-[60] -translate-x-1/2">
          <div className="card animate-pop flex items-center gap-2 border-emerald-300/40 bg-emerald-300/10 px-5 py-3 font-semibold text-emerald-100 shadow-2xl">
            <span className="text-lg">✓</span> {toast}
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-extrabold">Contact us</h1>
        <p className="text-slate-400">
          Got a question, a bug, or a wild idea? Drop us a message and a real human will get back to
          you (no robots, mostly).
        </p>
      </div>

      {error && <div className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-red-300">{error}</div>}

      <form onSubmit={submit} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Your name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="label">Your email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="So we can reply"
            />
          </div>
        </div>

        <div>
          <label className="label">Inquiry</label>
          <textarea
            className="input min-h-[140px] resize-y"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={4000}
            placeholder="How can we help?"
          />
        </div>

        <button
          type="submit"
          disabled={busy || !name.trim() || !email.trim() || !message.trim()}
          className="btn-gold w-full text-lg"
        >
          {busy ? "Sending…" : "Send message"}
        </button>
      </form>
    </div>
  );
}
