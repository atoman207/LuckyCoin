// Supabase returns its auth errors in English only. Map the ones a real user
// can actually hit onto our own messages so the whole flow stays in the
// selected language; anything unrecognised falls back to a generic sentence
// (the raw text is logged, never shown).

import type { MessageKey, TFunction } from "./index";

const PATTERNS: { test: RegExp; key: MessageKey }[] = [
  { test: /invalid login credentials|invalid email or password/i, key: "auth.invalidCredentials" },
  { test: /email not confirmed|confirm your email/i, key: "auth.emailNotConfirmed" },
  { test: /rate limit|too many requests|for security purposes/i, key: "auth.tooManyRequests" },
  { test: /user not found|no user found/i, key: "auth.userNotFound" },
  { test: /password.*(weak|short|at least)/i, key: "auth.weakPassword" },
  { test: /(token|session|link).*(expired|invalid)/i, key: "auth.sessionExpired" },
  { test: /already registered|already exists/i, key: "api.register.emailTaken" },
];

export function authErrorMessage(t: TFunction, raw: string | null | undefined): string {
  if (raw) {
    for (const { test, key } of PATTERNS) {
      if (test.test(raw)) return t(key);
    }
  }
  return t("auth.genericFailed");
}
