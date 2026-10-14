// =====================================================================
//  取引メール（ログイン確認・パスワード再設定）の共通レイアウト。
//
//  メールクライアントは CSS をほとんど解釈しないため、<table> 組み・
//  インラインスタイルで書いています。サイト本体と同じ明るい配色に揃えつつ、
//  迷惑メール判定を避けるために次を守っています。
//
//   ・誰が何のために送ったメールなのかを、本文と署名の両方で明示する
//     （差出人の正体が読み取れないメールは、それだけで減点されます）
//   ・画像を一切使わない（画像 1 枚＋リンクだけ、という構成は
//     典型的な迷惑メールの型です）
//   ・リンクは 1 通につき 1 つだけ。アンカーの文言と実際の URL を一致させ、
//     文字列としての URL をむき出しで並べない
//   ・プレビュー行（preheader）を用意して、受信箱の一覧で内容が分かるようにする
// =====================================================================

import type { TFunction } from "@/lib/i18n";

export type EmailContent = {
  /** 見出し（本文の一行目）。 */
  heading: string;
  /** 説明文。 */
  body: string;
  /** ボタンの文言。 */
  buttonLabel: string;
  /** ボタンとフォールバックリンクの遷移先。 */
  url: string;
  /** 受信箱の一覧に出るプレビュー行。 */
  preheader: string;
  /** 本文の下に添える注意書き（任意）。 */
  note?: string;
};

const BRAND = "Lucky Coin";

// サイト本体と同じトーン（白地・クリーム・ゴールド・こげ茶）。
const C = {
  page: "#fff8ec",
  card: "#ffffff",
  line: "#f2e6d2",
  body: "#2a2018",
  muted: "#4e4335",
  faint: "#6b5d4b",
  gold: "#f7bd4a",
  goldInk: "#5a3a06",
};

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 本文の HTML。 */
export function renderEmail(t: TFunction, siteUrl: string, c: EmailContent): string {
  const url = escapeHtml(c.url);
  const host = (() => {
    try {
      return new URL(siteUrl).host;
    } catch {
      return siteUrl;
    }
  })();

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
  <!-- 受信箱の一覧に表示されるプレビュー行（本文中には見えません） -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(c.preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
    <tr>
      <td align="center" style="padding:28px 12px;">

        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0"
               style="width:480px;max-width:100%;background:${C.card};border:1px solid ${C.line};border-radius:16px;">
          <tr>
            <td style="padding:28px 26px;font-family:'Hiragino Maru Gothic ProN','Yu Gothic UI',Meiryo,sans-serif;color:${C.body};">

              <div style="font-size:15px;font-weight:bold;color:${C.goldInk};letter-spacing:.04em;">
                🪙 ${BRAND}
              </div>

              <h1 style="margin:14px 0 0;font-size:20px;line-height:1.5;font-weight:bold;color:${C.body};">
                ${escapeHtml(c.heading)}
              </h1>

              <p style="margin:14px 0 0;font-size:14px;line-height:1.9;color:${C.body};">
                ${escapeHtml(c.body)}
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
                <tr>
                  <td align="center" bgcolor="${C.gold}" style="border-radius:999px;">
                    <a href="${url}"
                       style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:bold;
                              color:${C.goldInk};text-decoration:none;border-radius:999px;">
                      ${escapeHtml(c.buttonLabel)}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:22px 0 0;font-size:12px;line-height:1.8;color:${C.muted};">
                ${escapeHtml(t("email.fallbackLead"))}<br>
                <a href="${url}" style="color:${C.goldInk};">${escapeHtml(t("email.fallbackLink"))}</a>
              </p>

              ${
                c.note
                  ? `<p style="margin:18px 0 0;padding:12px 14px;background:${C.page};border-radius:10px;
                               font-size:12px;line-height:1.8;color:${C.muted};">${escapeHtml(c.note)}</p>`
                  : ""
              }
            </td>
          </tr>
        </table>

        <!-- 署名: 誰が何のために送ったメールなのかを明示します -->
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0"
               style="width:480px;max-width:100%;">
          <tr>
            <td style="padding:18px 26px 0;font-family:'Hiragino Maru Gothic ProN','Yu Gothic UI',Meiryo,sans-serif;
                       font-size:11px;line-height:1.9;color:${C.faint};">
              ${escapeHtml(t("email.footerAuto"))}<br>
              ${escapeHtml(t("email.footerNoReply"))}<br>
              <a href="${escapeHtml(siteUrl)}" style="color:${C.faint};">${escapeHtml(host)}</a>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** 同じ内容のプレーンテキスト版。HTML から機械的に起こすより読みやすくなります。 */
export function renderEmailText(t: TFunction, siteUrl: string, c: EmailContent): string {
  return [
    `${BRAND}`,
    "",
    c.heading,
    "",
    c.body,
    "",
    `${c.buttonLabel}:`,
    c.url,
    ...(c.note ? ["", c.note] : []),
    "",
    "---",
    t("email.footerAuto"),
    t("email.footerNoReply"),
    siteUrl,
  ].join("\n");
}
