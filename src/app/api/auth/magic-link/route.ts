import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mailer";
import { renderEmail, renderEmailText } from "@/lib/email-template";
import { getSiteOrigin } from "@/lib/site-url";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// Supabase の管理 API でワンタイムのログインリンクを作り、Supabase のメール
// 送信ではなく自前の SMTP から送ります。リンク先は /auth/confirm です。
//
// 新規登録の直後にもこのルートが呼ばれ、これが「メールアドレスの確認メール」に
// なります。
export async function POST(req: Request) {
  const t = await getT();
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: t("api.auth.validEmail") }, { status: 400 });
  }
  const to = email.trim().toLowerCase();

  // リバースプロキシ越しでも公開ドメインになるよう、共通のヘルパーで解決します。
  // リクエストの Host をそのまま使うと、本番でも内部ホスト名やプレビュー URL が
  // メールに載ることがあり、リンクが動かないうえに迷惑メール判定も強まります。
  const origin = getSiteOrigin(req);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: to });
  if (error || !data?.properties?.hashed_token) {
    console.error("[auth/magic-link] could not create link:", error);
    return NextResponse.json({ error: t("api.auth.linkFailed") }, { status: 400 });
  }

  const next = encodeURIComponent("/?welcome=1");
  const link = `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=${next}`;

  const content = {
    heading: t("email.login.heading"),
    body: t("email.login.body"),
    buttonLabel: t("email.login.button"),
    preheader: t("email.login.preheader"),
    note: t("email.login.note"),
    url: link,
  };

  try {
    await sendMail({
      to,
      subject: t("email.login.subject"),
      html: renderEmail(t, origin, content),
      text: renderEmailText(t, origin, content),
    });
  } catch (e) {
    // SMTP のエラー文は英語で技術的なので、ログにだけ残して自前の文言を返します。
    console.error("[auth/magic-link] could not send email:", e);
    return NextResponse.json({ error: t("api.auth.mailFailed") }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
