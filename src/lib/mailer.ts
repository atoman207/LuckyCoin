import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";

// =====================================================================
//  SMTP メール送信。サーバー専用。
//  Supabase 組み込みのメール送信は使わず、自前の SMTP から送っています。
//
//  ■ 迷惑メールに入れられないために、いちばん重要なこと
//
//  受信側（Gmail / Outlook など）は「From のドメイン」で送信者を判断します。
//  差出人を自社ドメイン（例 no-reply@luckybronzecoin.com）にしたうえで、
//  そのドメインの DNS に SPF / DKIM / DMARC を設定してください。
//  設定手順は .env.example と README の「メール配信」を参照。
//
//  逆に、フリーメール（@gmail.com など）を From にしたままだと、
//  ここのコードを何をどう直しても受信トレイには入りません。gmail.com の
//  DNS は自分では触れないため、SPF/DKIM/DMARC を自社ブランドに揃えられず、
//  「ブランドを名乗る自動送信メールが、無関係なフリーメールから届いた」
//  という、迷惑メール判定でいちばん強い型に当てはまってしまうためです。
//  （Gmail の送信者ガイドラインも、送信ドメインに一致した SPF+DKIM+DMARC を
//  求めています。）そのため、設定を読んだ時点で警告をログに出します。
// =====================================================================

let cached: nodemailer.Transporter | null = null;

// From に使うと確実に迷惑メール判定されるフリーメールのドメイン。
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.jp", "ymail.com",
  "outlook.com", "outlook.jp", "hotmail.com", "hotmail.co.jp", "live.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "gmx.com", "proton.me",
  "protonmail.com", "zoho.com", "docomo.ne.jp", "ezweb.ne.jp", "softbank.ne.jp",
]);

/** "Lucky Coin <a@b.com>" → "a@b.com"。素のアドレスはそのまま返します。 */
function addressOf(value: string): string {
  const m = /<([^>]+)>/.exec(value);
  return (m ? m[1] : value).trim().toLowerCase();
}

function domainOf(address: string): string {
  return address.split("@")[1] ?? "";
}

// 警告は起動後 1 回だけ。毎回のログを埋めないようにします。
let warned = false;
function warnAboutFreeMailFrom(fromAddress: string) {
  if (warned) return;
  warned = true;
  const domain = domainOf(fromAddress);
  if (!FREE_MAIL_DOMAINS.has(domain)) return;
  console.warn(
    `[mailer] 差出人が フリーメール (${fromAddress}) です。${domain} の DNS には ` +
      `SPF / DKIM / DMARC を設定できないため、送信したメールは受信側で迷惑メールに ` +
      `振り分けられます。SMTP_FROM を自社ドメインのアドレスに変更し、そのドメインで ` +
      `SPF / DKIM / DMARC を設定してください（詳細は .env.example を参照）。`
  );
}

function transporter() {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT || 465);

  // 独自ドメインを、DKIM 署名を代行しない SMTP サーバーから送る場合のために、
  // 送信側で DKIM 署名できるようにしてあります。Resend / SES / SendGrid など
  // の送信サービスは各社側で署名するため、この 3 つは未設定で構いません。
  const dkimDomain = process.env.DKIM_DOMAIN?.trim();
  const dkimSelector = process.env.DKIM_SELECTOR?.trim();
  const dkimKey = process.env.DKIM_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = 暗黙的 TLS / 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // SMTP サーバーが遅いときにリクエストごと止まらないよう、早めに失敗させます。
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    ...(dkimDomain && dkimSelector && dkimKey
      ? { dkim: { domainName: dkimDomain, keySelector: dkimSelector, privateKey: dkimKey } }
      : {}),
  });
  return cached;
}

// HTML から読める本文を起こします。text + html の multipart/alternative は
// HTML のみのメールよりも迷惑メール判定されにくいため、常に両方送ります。
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

  // 認証に使うアカウント。エンベロープ送信者（SMTP の MAIL FROM）をこれに
  // 揃えることで、SPF の判定対象と実際の送信者が一致します。
  const authUser = process.env.SMTP_USER!;
  const from = process.env.SMTP_FROM || authUser;
  const fromAddress = addressOf(from);

  warnAboutFreeMailFrom(fromAddress);

  // Message-ID は From のドメインで発行します（送信ドメインと Message-ID の
  // ドメインが食い違うのも、受信側が嫌う形のひとつです）。
  const messageId = `<${randomUUID()}@${domainOf(fromAddress) || "localhost"}>`;

  // https のエンドポイントでなければ One-Click 配信停止として無効なので、
  // その場合はヘッダーごと付けません。
  const configuredUnsubscribe = process.env.MAIL_UNSUBSCRIBE_URL?.trim();
  const unsubscribeUrl = configuredUnsubscribe?.startsWith("https://")
    ? configuredUnsubscribe
    : null;

  await transporter().sendMail({
    from,
    // エンベロープ送信者は認証アカウントに合わせます。Sender: ヘッダーは
    // From と一致するときは付けません（一部のクライアントが余計な
    // 「〜の代理で送信」表示をしてしまうため）。
    envelope: { from: authUser, to: opts.to },
    ...(addressOf(authUser) === fromAddress ? {} : { sender: authUser }),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    // 本文のプレーンテキスト版は必ず添えます（渡されなければ HTML から起こす）。
    text: opts.text ?? htmlToText(opts.html),
    replyTo: opts.replyTo || from,
    messageId,
    date: new Date(),
    headers: {
      // 自動送信であることを明示します。受信側の自動応答（不在通知など）を
      // 抑止し、機械的な一斉配信ではなく取引メールとして扱われやすくなります。
      "Auto-Submitted": "auto-generated",
      "X-Auto-Response-Suppress": "All",
      // Gmail が同じ内容のメールをまとめてしまわないよう、1 通ごとに違う値。
      // （定数にすると逆にまとめられてしまうので、必ずユニークにします。）
      "X-Entity-Ref-ID": messageId,
      // 配信停止リンクは「広告メール」の目印なので、ログインやパスワード
      // 再設定のような取引メールには既定では付けません。運用上どうしても
      // 必要な場合だけ、RFC 8058 が求める https のエンドポイントを
      // MAIL_UNSUBSCRIBE_URL に設定してください。mailto: だけで One-Click を
      // 名乗るのは規格違反で、かえって減点されます。
      ...(unsubscribeUrl
        ? {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : {}),
    },
  });
}
