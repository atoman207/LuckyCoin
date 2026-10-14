// Deposit account shown on /buy for bank-transfer purchases.
// Coins are credited manually after the transfer is confirmed.

export type PurchaseBankAccount = {
  bankName: string;
  bankCode: string;
  branchNumber: string;
  branchName: string;
  accountType: "ordinary" | "checking";
  accountNumber: string;
  accountHolder: string;
};

export const PURCHASE_BANK: PurchaseBankAccount = {
  bankName: "PayPay銀行",
  bankCode: "0033",
  branchNumber: "005",
  branchName: "法人営業部",
  accountType: "checking",
  accountNumber: "2274002",
  accountHolder: "株式会社アクシス",
};
