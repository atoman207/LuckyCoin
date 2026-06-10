import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mailer";

export const runtime = "nodejs";

// Generates a one-time login link with the Supabase admin API and emails it via
// our own SMTP (not Supabase's email service). The link points at /auth/confirm.
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  }
  const to = email.trim().toLowerCase();
  const origin = new URL(req.url).origin;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: to });
  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: error?.message ?? "Could not create login link." }, { status: 400 });
  }

  const next = encodeURIComponent("/?welcome=1");
  const link = `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=${next}`;

  try {
    await sendMail({
      to,
      subject: "Your Lucky Coin login link",
      text: `Click to log in to Lucky Coin:\n${link}\n\nThis link expires shortly and can be used once.`,
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#0b0f1a">🪙 Lucky Coin login</h2>
          <p>Click the button below to log in. This link expires shortly and can be used once.</p>
          <p style="margin:24px 0">
            <a href="${link}" style="background:#f5b73d;color:#0b0f1a;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Log in to Lucky Coin</a>
          </p>
          <p style="font-size:12px;color:#667">If the button doesn't work, paste this link:<br>${link}</p>
        </div>`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send the email." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
