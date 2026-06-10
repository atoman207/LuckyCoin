import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mailer";

export const runtime = "nodejs";

// Generates a password-recovery link with the Supabase admin API and emails it
// via our own SMTP. The link verifies on /auth/confirm and lands on
// /reset-password where the user sets a new password.
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
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
        subject: "Reset your Lucky Coin password",
        text: `Reset your password:\n${link}\n\nThis link expires shortly and can be used once. If you didn't request this, ignore this email.`,
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#0b0f1a">🪙 Reset your password</h2>
            <p>Click below to choose a new password. This link expires shortly and can be used once.</p>
            <p style="margin:24px 0">
              <a href="${link}" style="background:#f5b73d;color:#0b0f1a;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Reset password</a>
            </p>
            <p style="font-size:12px;color:#667">If you didn't request this, you can ignore this email.<br>${link}</p>
          </div>`,
      });
    } catch {
      /* swallow — still respond ok to avoid leaking account existence */
    }
  }

  return NextResponse.json({ ok: true });
}
