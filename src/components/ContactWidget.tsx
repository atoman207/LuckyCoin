"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";

// Floating "Contact" button pinned to the bottom-left corner. Opens a small
// panel where visitors enter their name, email and inquiry; submitting POSTs to
// /api/contact, which stores the message and emails a copy via SMTP.
export default function ContactWidget() {
  const { profile } = useUser();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape for convenience.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-3">
      {open && (
        <div className="card w-[min(92vw,22rem)] animate-pop space-y-3 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Contact us</h2>
              <p className="text-xs text-slate-400">
                Send a message and we&apos;ll get back to you.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          {done ? (
            <div className="rounded-xl border border-emerald-300/40 bg-emerald-300/10 px-3 py-3 text-center text-sm font-semibold text-emerald-100">
              ✓ {done}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {profile ? (
                <p className="text-xs text-slate-400">
                  Sending as <span className="font-semibold text-slate-200">{profile.nickname}</span> ({profile.email}).
                </p>
              ) : (
                <>
                  <div>
                    <label className="label">Your name</label>
                    <input
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Optional"
                    />
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
                </>
              )}

              <div>
                <label className="label">Inquiry</label>
                <textarea
                  className="input min-h-[110px] resize-y"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  maxLength={4000}
                  placeholder="How can we help?"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-500/15 px-3 py-2 text-center text-sm text-red-300">
                  {error}
                </div>
              )}

              <button type="submit" disabled={busy || !message.trim()} className="btn-gold w-full">
                {busy ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </div>
      )}

      <button
        onClick={() => {
          setOpen((o) => !o);
          setDone(null);
          setError(null);
        }}
        aria-label="Contact us"
        className="flex items-center gap-2 rounded-full bg-amber-400 px-4 py-3 font-semibold text-slate-900 shadow-lg transition hover:bg-amber-300"
      >
        {/* chat bubble icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Contact</span>
      </button>
    </div>
  );
}
