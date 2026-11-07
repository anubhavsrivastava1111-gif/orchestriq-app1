// Lifeline — shared icon maps and small helpers (kept out of component files).
import type { ExpenseCategory, LoanType } from "./types";

export const LOAN_ICON: Record<LoanType, string> = {
  home: "home", personal: "wallet", car: "card", "two-wheeler": "card", education: "doc", gold: "star",
  "credit-card": "card", bnpl: "phone", "consumer-durable": "phone", business: "bank", other: "wallet",
};
export const EXPENSE_ICON: Record<ExpenseCategory, string> = {
  rent: "home", groceries: "wallet", utilities: "sparkle", transport: "arrowRight", education: "doc", medical: "heart",
  insurance: "shield", "family-support": "user", subscriptions: "refresh", "eating-out": "star", shopping: "card",
  entertainment: "sparkle", "personal-care": "heart", travel: "arrowRight", other: "info",
};

export function ago(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

export const isStale = (iso: string, days = 7) => Date.now() - new Date(iso).getTime() > days * 86400000;

export const NETWORKS: { value: import("./types").CardNetwork; label: string }[] = [
  { value: "visa", label: "Visa" }, { value: "mastercard", label: "Mastercard" }, { value: "rupay", label: "RuPay" },
  { value: "amex", label: "Amex" }, { value: "diners", label: "Diners" },
];
