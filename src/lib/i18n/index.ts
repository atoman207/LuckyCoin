// =====================================================================
//  Tiny translation runtime shared by the browser and the server.
//  Usage:
//    const t = createTranslator("ja");
//    t("game.freeRounds", { count: 3 })  →  "💎 無料ラウンド 3 回"
//  Placeholders are {name} and are replaced with the matching value.
// =====================================================================

import ja from "./messages/ja";
import en from "./messages/en";
import { DEFAULT_LOCALE, type Locale } from "./config";

export type MessageKey = keyof typeof ja;
export type Vars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: Vars) => string;

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { ja, en };

// True when a string is a known message key — used where a value may either be
// a key (e.g. a failure code from the chain verifier) or already-final text.
export function isMessageKey(v: unknown): v is MessageKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ja, v);
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
  );
}

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const table = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  // Fall back to the default locale, then to the key itself, so a missing
  // translation degrades to something readable instead of blank UI.
  const template = table[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? String(key);
  return interpolate(template, vars);
}

export function createTranslator(locale: Locale): TFunction {
  return (key, vars) => translate(locale, key, vars);
}

// Translates a value that MIGHT be a message key (server error payloads carry
// keys; third-party errors carry plain text). Plain text passes through.
export function translateMaybeKey(locale: Locale, value: string, vars?: Vars): string {
  return isMessageKey(value) ? translate(locale, value, vars) : value;
}

export { DEFAULT_LOCALE };
export type { Locale };
