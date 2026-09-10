import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mailer";
import { renderEmail, renderEmailText } from "@/lib/email-template";
import { getSiteOrigin } from "@/lib/site-url";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// Supabase の管理 API でパスワード再設定リンクを作り、自前の SMTP から送ります。
// リンクは /auth/confirm で検証され、/reset-password に着地します。
export async function POST(req: Request) {
  const t = await getT();
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: t("api.auth.validEmail") }, { status: 400 });
  }
  const to = email.trim().toLowerCase();

  // magic-link と同じ理由で、公開ドメインは共通ヘルパーから取ります。
  const origin = getSiteOrigin(req);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: to });

  // アカウントの有無を漏らさないよう、結果にかかわらず ok を返します。
  if (!error && data?.properties?.hashed_token) {
    const next = encodeURIComponent("/reset-password");
    const link = `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=${next}`;

    const content = {
      heading: t("email.reset.heading"),
      body: t("email.reset.body"),
      buttonLabel: t("email.reset.button"),
      preheader: t("email.reset.preheader"),
      note: t("email.reset.note"),
      url: link,
    };

    try {
      await sendMail({
        to,
        subject: t("email.reset.subject"),
        html: renderEmail(t, origin, content),
        text: renderEmailText(t, origin, content),
      });
    } catch (e) {
      // アカウントの存在を漏らさないため、応答は ok のまま。ログには残します。
      console.error("[auth/forgot-password] could not send email:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
