import nodemailer from "nodemailer";

// SMTP mailer (Gmail app password). SERVER ONLY. We send our own emails instead
// of using Supabase's built-in email service.
let cached: nodemailer.Transporter | null = null;

function transporter() {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT || 465);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // Fail fast instead of hanging the request if the SMTP server is slow.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return cached;
}

// Strip HTML to a readable plain-text fallback. A multipart/alternative message
// (text + html) looks far less like spam to Gmail than HTML-only, so we always
// send both parts.
function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP is not configured.");
  }

  // The address we authenticate as. Gmail DKIM-signs mail from this account, so
  // keeping the envelope/From aligned to it is what actually lands us in the
  // inbox rather than the spam folder.
  const sender = process.env.SMTP_USER!;
  const from = process.env.SMTP_FROM || sender;

  await transporter().sendMail({
    from,
    sender, // align the envelope-from with the authenticated/DKIM-signing account
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    // Always provide a plain-text alternative (derive one if not supplied).
    text: opts.text ?? htmlToText(opts.html),
    replyTo: opts.replyTo || sender,
    headers: {
      // Signals a legitimate, unsubscribable transactional sender — improves
      // Gmail inbox placement and reduces "looks like bulk spam" scoring.
      "List-Unsubscribe": `<mailto:${sender}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Entity-Ref-ID": "lucky-coin",
    },
  });
}
