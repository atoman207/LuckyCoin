// =====================================================================
//  言語設定 — 本サイトは日本語専用です。
//  かつては日本語／英語の切り替えを備えていましたが、日本国内向けの
//  単一言語サイトになったため、ロケールは "ja" に固定しています。
//  型と定数だけを残してあるのは、既存の呼び出し側（t() や Intl 書式）を
//  そのまま動かし続けるためです。
// =====================================================================

export const LOCALES = ["ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ja";

// <html lang> と Intl の日付／数値書式に使う値。
export const HTML_LANG = "ja";
export const INTL_LOCALE = "ja-JP";
