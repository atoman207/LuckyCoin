import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mailer";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// Contact form: stores the message (shown on the admin page) and emails a copy
// to the contact address via SMTP. Works for logged-in and anonymous senders.
export async function POST(req: Request) {
  const t = await getT();
  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: t("api.contact.enterMessage") }, { status: 400 });
  if (message.length > 4000) return NextResponse.json({ error: t("api.contact.tooLong") }, { status: 400 });

  let name = String(body.name ?? "").trim() || null;
  let email = String(body.email ?? "").trim().toLowerCase() || null;
  let userId: string | null = null;

  // Attach the logged-in user's identity when available.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    userId = user.id;
    const { data: prof } = await createAdminClient()
      .from("profiles")
      .select("nickname, email")
      .eq("id", user.id)
      .maybeSingle();
    name = name || prof?.nickname || null;
    email = email || prof?.email || user.email || null;
  }

  const { error } = await createAdminClient().from("contacts").insert({
    user_id: userId,
    name,
    email,
    message,
  });
  if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });

  // Email a copy to the contact address (best-effort).
  const contactTo = process.env.CONTACT_EMAIL;
  if (contactTo) {
    try {
      await sendMail({
        to: contactTo,
        subject: name
          ? t("email.contact.subjectFrom", { name })
          : t("email.contact.subject"),
        replyTo: email || undefined,
        text: `${t("email.contact.from")}: ${name || t("email.contact.anonymous")} <${
          email || t("email.contact.noEmail")
        }>\n\n${message}`,
        html: `<p><b>${t("email.contact.from")}:</b> ${name || t("email.contact.anonymous")} &lt;${
          email || t("email.contact.noEmail")
        }&gt;</p><p>${message.replace(/\n/g, "<br>")}</p>`,
      });
    } catch {
      /* still saved to the admin page even if the email fails */
    }
  }

  return NextResponse.json({ ok: true, message: t("api.contact.sent") });
}
