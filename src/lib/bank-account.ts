// =====================================================================
//  国内銀行口座 — ゴールド売却の振込先としてユーザーが登録する情報です。
//  profiles.payout_address / sells.payout_address には JSON 文字列として保存します。
// =====================================================================

export type AccountType = "ordinary" | "checking";

export type BankAccount = {
  bankName: string;
  branchName: string;
  accountType: AccountType;
  accountNumber: string;
  /** 口座名義（カタカナ）。振込照合用。 */
  holderKana: string;
  /** 口座名義（漢字）。任意。 */
  holderName?: string;
};

export const ACCOUNT_TYPES: { id: AccountType; label: string }[] = [
  { id: "ordinary", label: "普通" },
  { id: "checking", label: "当座" },
];

export function accountTypeLabel(type: AccountType | string | null | undefined): string {
  if (type === "ordinary") return "普通";
  if (type === "checking") return "当座";
  return "—";
}

export function emptyBankAccount(): BankAccount {
  return {
    bankName: "",
    branchName: "",
    accountType: "ordinary",
    accountNumber: "",
    holderKana: "",
    holderName: "",
  };
}

/** 半角カナ・ひらがなを全角カタカナへ寄せ、空白を全角スペースに揃えます。 */
export function normalizeHolderKana(raw: string): string {
  return raw
    .normalize("NFKC") // 半角カナ → 全角カナ
    .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[ \t]+/g, "　")
    .trim();
}

export function normalizeBankAccount(input: Partial<BankAccount>): BankAccount {
  const accountType: AccountType =
    input.accountType === "checking" ? "checking" : "ordinary";
  return {
    bankName: (input.bankName ?? "").trim(),
    branchName: (input.branchName ?? "").trim(),
    accountType,
    accountNumber: (input.accountNumber ?? "").replace(/\D/g, ""),
    holderKana: normalizeHolderKana(input.holderKana ?? ""),
    holderName: (input.holderName ?? "").trim() || undefined,
  };
}

export function serializeBankAccount(account: BankAccount): string {
  const n = normalizeBankAccount(account);
  return JSON.stringify({
    bankName: n.bankName,
    branchName: n.branchName,
    accountType: n.accountType,
    accountNumber: n.accountNumber,
    holderKana: n.holderKana,
    ...(n.holderName ? { holderName: n.holderName } : {}),
  });
}

export function parseBankAccount(raw: string | null | undefined): BankAccount | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Partial<BankAccount>;
    if (
      typeof o !== "object" ||
      o === null ||
      typeof o.bankName !== "string" ||
      typeof o.branchName !== "string" ||
      typeof o.accountNumber !== "string" ||
      typeof o.holderKana !== "string"
    ) {
      return null;
    }
    const account = normalizeBankAccount(o);
    if (!account.bankName || !account.branchName || !account.accountNumber || !account.holderKana) {
      return null;
    }
    return account;
  } catch {
    // 旧ウォレットアドレスなど JSON 以外は銀行口座として扱わない
    return null;
  }
}

export type BankAccountError =
  | "bankName"
  | "branchName"
  | "accountNumber"
  | "holderKana"
  | "incomplete";

/** 必須項目の簡易検証。問題なければ null。 */
export function validateBankAccount(account: Partial<BankAccount>): BankAccountError | null {
  const n = normalizeBankAccount(account);
  if (!n.bankName) return "bankName";
  if (!n.branchName) return "branchName";
  if (!/^\d{4,8}$/.test(n.accountNumber)) return "accountNumber";
  // カタカナ・長音・中点・全角スペース
  if (!n.holderKana || !/^[ァ-ヶー・　]+$/.test(n.holderKana)) return "holderKana";
  return null;
}

export function isBankAccountComplete(account: Partial<BankAccount> | null | undefined): boolean {
  if (!account) return false;
  return validateBankAccount(account) === null;
}

/** 管理画面・確認メッセージ用の一行表示。 */
export function formatBankAccount(account: BankAccount): string {
  const type = accountTypeLabel(account.accountType);
  const name = account.holderName
    ? `${account.holderKana}（${account.holderName}）`
    : account.holderKana;
  return `${account.bankName} ${account.branchName}支店／${type} ${account.accountNumber}／${name}`;
}

/** 複数行の読みやすい表示（改行区切り）。 */
export function formatBankAccountLines(account: BankAccount): string {
  const type = accountTypeLabel(account.accountType);
  const lines = [
    `銀行名: ${account.bankName}`,
    `支店名: ${account.branchName}`,
    `口座種別: ${type}`,
    `口座番号: ${account.accountNumber}`,
    `口座名義（カナ）: ${account.holderKana}`,
  ];
  if (account.holderName) lines.push(`口座名義: ${account.holderName}`);
  return lines.join("\n");
}
