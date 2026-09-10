// サーバー側の文言解決。日本語専用サイトなので言語判定はありません。
// API ルートやサーバーコンポーネントは、クライアントと同じ辞書を使います。

import { DEFAULT_LOCALE, type Locale } from "./config";
import { createTranslator, type TFunction } from "./index";

export async function getLocale(): Promise<Locale> {
  return DEFAULT_LOCALE;
}

// このリクエスト用の翻訳関数。
export async function getT(): Promise<TFunction> {
  return createTranslator();
}
