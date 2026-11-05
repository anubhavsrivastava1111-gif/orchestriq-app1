// Lifeline — plans. Core EMI safety stays free forever; Pro adds the tools people pay for.
// Billing is not wired yet: during early access every Pro feature is unlocked at no charge.
// To launch paid plans, connect Google Play Billing and set `plan` from the verified purchase.
import type { MoneyState } from "./types";

export const PRICES = { monthly: 149, yearly: 999, currency: "₹" } as const;

export const FREE_FEATURES = [
  "Unlimited EMIs, accounts and reminders",
  "Phone notifications before every EMI",
  "Which account to top up, and by when",
  "Encrypted vault with passcode and fingerprint",
  "Earning opportunities and help resources",
];

export const PRO_FEATURES: { id: ProFeature; title: string; detail: string; icon: string }[] = [
  { id: "ai", title: "AI money assistant", detail: "Ask anything about your money; share a private summary with Gemini, ChatGPT or Claude", icon: "sparkle" },
  { id: "invest", title: "Investments with live prices", detail: "Mutual-fund NAVs and stock prices, portfolio vs debt analysis", icon: "chart" },
  { id: "forecast", title: "30-day cash forecast & safe-to-spend", detail: "Know your lowest balance before it happens", icon: "grow" },
  { id: "debt", title: "Debt-free planner", detail: "Avalanche vs snowball, debt-free date, interest saved", icon: "card" },
  { id: "letters", title: "Letters to lenders", detail: "EMI date change, restructuring, harassment complaints", icon: "doc" },
  { id: "backup", title: "Encrypted backups", detail: "Password-protected backup you can restore on a new phone", icon: "shield" },
];

export type ProFeature = "ai" | "invest" | "forecast" | "debt" | "letters" | "backup";

export const isPro = (s: MoneyState) => s.settings.plan !== "free";
export const planLabel = (s: MoneyState) => (s.settings.plan === "pro" ? "Pro" : s.settings.plan === "early-access" ? "Pro · Early access" : "Free");
