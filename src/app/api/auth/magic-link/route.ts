import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mailer";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// Generates a one-time login link with the Supabase admin API and emails it via
// our own SMTP (not Supabase's email service). The link points at /auth/confirm.
// The email is written in the language the visitor is using on the site.
export async function POST(req: Request) {
  const t = await getT();
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: t("api.auth.validEmail") }, { status: 400 });
  }
  const to = email.trim().toLowerCase();
  const origin = new URL(req.url).origin;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: to });
  if (error || !data?.properties?.hashed_token) {
    console.error("[auth/magic-link] could not create link:", error);
    return NextResponse.json({ error: t("api.auth.linkFailed") }, { status: 400 });
  }

  const next = encodeURIComponent("/?welcome=1");
  const link = `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=${next}`;

  try {
    await sendMail({
      to,
      subject: t("email.login.subject"),
      text: `${t("email.login.text")}\n${link}`,
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#0b0f1a">${t("email.login.heading")}</h2>
          <p>${t("email.login.body")}</p>
          <p style="margin:24px 0">
            <a href="${link}" style="background:#f5b73d;color:#0b0f1a;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${t("email.login.button")}</a>
          </p>
          <p style="font-size:12px;color:#667">${t("email.login.fallback")}<br>${link}</p>
        </div>`,
    });
  } catch (e) {
    // The underlying SMTP text is English and technical — log it, show ours.
    console.error("[auth/magic-link] could not send email:", e);
    return NextResponse.json({ error: t("api.auth.mailFailed") }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
