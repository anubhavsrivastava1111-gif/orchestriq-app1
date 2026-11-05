// Lifeline — local storage. Financial data never leaves the phone unless the user exports it.
import { useEffect, useState } from "react";
import type { MoneyState } from "./types";
import { ymKey } from "./engine";

const KEY = "lifeline-money-v1";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const EMPTY: MoneyState = {
  version: 1,
  accounts: [],
  loans: [],
  incomes: [],
  expenses: [],
  profile: { skills: [], hoursPerWeek: 8, urgency: "this-month", languages: "Hindi, English" },
  settings: { bufferDays: 2, bounceFee: 1000, remindersOn: false },
};

function load(): MoneyState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<MoneyState>;
    return { ...EMPTY, ...parsed, settings: { ...EMPTY.settings, ...parsed.settings }, profile: { ...EMPTY.profile, ...parsed.profile } };
  } catch { return EMPTY; }
}

export function useMoneyState() {
  const [state, setState] = useState<MoneyState>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked/full */ } }, [state]);
  return [state, setState] as const;
}

export function exportJson(state: MoneyState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  download(blob, `lifeline-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export function parseBackup(text: string): MoneyState | null {
  try {
    const p = JSON.parse(text);
    if (p && p.version === 1 && Array.isArray(p.loans) && Array.isArray(p.accounts)) return { ...EMPTY, ...p };
  } catch { /* invalid */ }
  return null;
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Realistic sample profile so first-time users can see how the app works. */
export function demoState(): MoneyState {
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const prev = ymKey(lastMonth);
  const sal = "a1", sav = "a2";
  return {
    ...EMPTY,
    accounts: [
      { id: sal, name: "Salary account (SBI)", balance: 21500, minBalance: 0, updatedAt: new Date().toISOString() },
      { id: sav, name: "Savings account (HDFC)", balance: 6000, minBalance: 5000, updatedAt: new Date().toISOString() },
    ],
    loans: [
      { id: uid(), name: "Bike loan", lender: "Bajaj Finance", type: "two-wheeler", emi: 3400, dueDay: 3, accountId: sav, outstanding: 52000, ratePct: 14, paidMonths: [prev] },
      { id: uid(), name: "Phone EMI", lender: "Home Credit", type: "consumer-durable", emi: 2100, dueDay: 7, accountId: sav, outstanding: 12600, ratePct: 26, paidMonths: [prev] },
      { id: uid(), name: "Personal loan", lender: "HDFC Bank", type: "personal", emi: 9800, dueDay: 5, accountId: sal, outstanding: 210000, ratePct: 15.5, paidMonths: [prev] },
      { id: uid(), name: "Credit card", lender: "ICICI", type: "credit-card", emi: 4000, dueDay: 18, accountId: sal, outstanding: 64000, ratePct: 42, paidMonths: [prev] },
      { id: uid(), name: "Instant loan app", lender: "BNPL app", type: "bnpl", emi: 2500, dueDay: 22, accountId: sav, outstanding: 9000, ratePct: 36, paidMonths: [prev] },
    ],
    incomes: [
      { id: uid(), source: "Salary", kind: "salary", amount: 42000, freq: "monthly", day: 1, accountId: sal },
      { id: uid(), source: "Weekend tuition", kind: "side-income", amount: 1000, freq: "weekly" },
    ],
    expenses: [
      { id: uid(), name: "Room rent", category: "rent", amount: 9000, freq: "monthly", essential: true },
      { id: uid(), name: "Groceries", category: "groceries", amount: 5500, freq: "monthly", essential: true },
      { id: uid(), name: "Electricity + mobile", category: "utilities", amount: 1800, freq: "monthly", essential: true },
      { id: uid(), name: "Petrol + metro", category: "transport", amount: 2600, freq: "monthly", essential: true },
      { id: uid(), name: "Money sent home", category: "family-support", amount: 4000, freq: "monthly", essential: true },
      { id: uid(), name: "Swiggy / Zomato", category: "eating-out", amount: 650, freq: "weekly", essential: false },
      { id: uid(), name: "OTT + music apps", category: "subscriptions", amount: 799, freq: "monthly", essential: false },
      { id: uid(), name: "Online shopping", category: "shopping", amount: 2000, freq: "monthly", essential: false },
      { id: uid(), name: "Health insurance", category: "insurance", amount: 9600, freq: "yearly", essential: true },
    ],
    profile: { skills: ["teaching", "english", "excel"], hoursPerWeek: 8, urgency: "this-month", languages: "Hindi, English" },
  };
}
