// =====================================================================
//  ごく小さな文言ランタイム（ブラウザ／サーバー共通）。
//  使い方:
//    const t = createTranslator();
//    t("game.freeRounds", { count: 3 })  →  "💎 無料ラウンド 3 回"
//  プレースホルダは {name} 形式で、対応する値に置き換えられます。
//
//  本サイトは日本語専用のため、辞書は ja.ts ひとつだけです。
// =====================================================================

import ja from "./messages/ja";
import { DEFAULT_LOCALE, type Locale } from "./config";

export type MessageKey = keyof typeof ja;
export type Vars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: Vars) => string;

export const MESSAGES: Record<MessageKey, string> = ja;

// 文字列が既知のメッセージキーかどうか。API から返る値が「キー」の場合と
// 「確定済みの文章」の場合の両方がありうる箇所で使います。
export function isMessageKey(v: unknown): v is MessageKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ja, v);
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
  );
}

export function translate(key: MessageKey, vars?: Vars): string {
  // 未定義のキーはキー名そのものにフォールバックし、空欄の UI を避けます。
  return interpolate(ja[key] ?? String(key), vars);
}

export function createTranslator(): TFunction {
  return (key, vars) => translate(key, vars);
}

// 「メッセージキーかもしれない値」を訳します（サーバーのエラー応答はキー、
// 外部サービスのエラーは素の文章）。素の文章はそのまま通します。
export function translateMaybeKey(value: string, vars?: Vars): string {
  return isMessageKey(value) ? translate(value, vars) : value;
}

export { DEFAULT_LOCALE };
export type { Locale };
