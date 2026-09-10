"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";
import { useI18n } from "@/lib/i18n/provider";

export default function ContactPage() {
  const { profile } = useUser();
  const { t } = useI18n();
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
    setTimeout(() => setToast((current) => (current === msg ? null : current)), 4000);
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
      showToast(data.message ?? t("contact.sent"));
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("contact.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Success toast */}
      {toast && (
        <div className="fixed left-1/2 top-6 z-[60] -translate-x-1/2">
          <div className="card animate-pop flex items-center gap-2 border-emerald-300 bg-emerald-50 px-5 py-3 font-semibold text-emerald-700 shadow-2xl">
            <span className="text-lg">✓</span> {toast}
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-extrabold">{t("contact.title")}</h1>
        <p className="text-muted">{t("contact.subtitle")}</p>
      </div>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-center text-red-600">{error}</div>}

      <form onSubmit={submit} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{t("contact.yourName")}</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder={t("contact.yourNamePlaceholder")}
            />
          </div>
          <div>
            <label className="label">{t("contact.yourEmail")}</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t("contact.yourEmailPlaceholder")}
            />
          </div>
        </div>

        <div>
          <label className="label">{t("contact.inquiry")}</label>
          <textarea
            className="input min-h-[140px] resize-y"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={4000}
            placeholder={t("contact.inquiryPlaceholder")}
          />
        </div>

        <button
          type="submit"
          disabled={busy || !name.trim() || !email.trim() || !message.trim()}
          className="btn-gold w-full text-lg"
        >
          {busy ? t("contact.sending") : t("contact.send")}
        </button>
      </form>
    </div>
  );
}
