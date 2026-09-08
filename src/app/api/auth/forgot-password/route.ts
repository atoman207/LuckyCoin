import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mailer";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// Generates a password-recovery link with the Supabase admin API and emails it
// via our own SMTP. The link verifies on /auth/confirm and lands on
// /reset-password where the user sets a new password.
export async function POST(req: Request) {
  const t = await getT();
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: t("api.auth.validEmail") }, { status: 400 });
  }
  const to = email.trim().toLowerCase();
  const origin = new URL(req.url).origin;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: to });

  // Don't reveal whether the email exists — always respond ok.
  if (!error && data?.properties?.hashed_token) {
    const next = encodeURIComponent("/reset-password");
    const link = `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=${next}`;
    try {
      await sendMail({
        to,
        subject: t("email.reset.subject"),
        text: `${t("email.reset.text")}\n${link}\n\n${t("email.reset.ignore")}`,
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#0b0f1a">${t("email.reset.heading")}</h2>
            <p>${t("email.reset.body")}</p>
            <p style="margin:24px 0">
              <a href="${link}" style="background:#f5b73d;color:#0b0f1a;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${t("email.reset.button")}</a>
            </p>
            <p style="font-size:12px;color:#667">${t("email.reset.ignore")}<br>${link}</p>
          </div>`,
      });
    } catch {
      /* swallow — still respond ok to avoid leaking account existence */
    }
  }

  return NextResponse.json({ ok: true });
}
