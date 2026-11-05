// Lifeline — data model. Everything is stored on the user's phone only (localStorage).

export type Freq = "monthly" | "weekly" | "yearly" | "one-off";

export type LoanType =
  | "home" | "personal" | "car" | "two-wheeler" | "education" | "gold"
  | "credit-card" | "bnpl" | "consumer-durable" | "business" | "other";

export interface Account {
  id: string;
  name: string;          // e.g. "HDFC Salary A/c"
  balance: number;       // last known balance
  minBalance: number;    // amount the bank requires you to keep (avoid charges)
  updatedAt: string;     // ISO date of last balance update
}

export interface Loan {
  id: string;
  name: string;          // e.g. "Bike loan"
  lender: string;
  type: LoanType;
  emi: number;           // monthly instalment (for credit cards: the amount you plan to pay)
  dueDay: number;        // 1–31, day of month the auto-debit happens
  accountId: string;     // which bank account the EMI is debited from
  outstanding: number;   // principal still owed
  ratePct: number;       // annual interest rate %
  paidMonths: string[];  // "YYYY-MM" months the user confirmed as paid
}

export type IncomeKind = "salary" | "business" | "freelance" | "rental" | "family" | "side-income" | "other";

export interface Income {
  id: string;
  source: string;
  kind: IncomeKind;
  amount: number;
  freq: Freq;
  day?: number;          // pay day (monthly)
  accountId?: string;
}

export type ExpenseCategory =
  | "rent" | "groceries" | "utilities" | "transport" | "education" | "medical" | "insurance"
  | "family-support" | "subscriptions" | "eating-out" | "shopping" | "entertainment"
  | "personal-care" | "travel" | "other";

export interface Expense {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  freq: Freq;
  essential: boolean;
}

export interface EarnProfile {
  skills: string[];      // tags from SKILL_TAGS
  hoursPerWeek: number;
  urgency: "this-month" | "3-months" | "long-term";
  languages: string;     // free text, e.g. "Hindi, English"
  shortlist: string[];   // opportunity ids the user wants to try
}

export interface Settings {
  bufferDays: number;    // fund the account this many days before the due date
  bounceFee: number;     // typical bounce/NACH-return charge per failed EMI (incl. GST)
  remindersOn: boolean;
  name: string;          // used for greeting and lender letters
  hideAmounts: boolean;  // privacy mode
  theme: "system" | "light" | "dark";
  pinHash: string;       // SHA-256 of app PIN ("" = no lock)
  setupDismissed: boolean;
  calendarAdded: boolean;  // user downloaded/added calendar reminders
}

export interface MoneyState {
  version: 1;
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  expenses: Expense[];
  profile: EarnProfile;
  settings: Settings;
}

export const LOAN_TYPE_LABEL: Record<LoanType, string> = {
  home: "Home loan", personal: "Personal loan", car: "Car loan", "two-wheeler": "Two-wheeler loan",
  education: "Education loan", gold: "Gold loan", "credit-card": "Credit card", bnpl: "Buy-now-pay-later",
  "consumer-durable": "Consumer durable (phone/TV EMI)", business: "Business loan", other: "Other",
};

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  rent: "Rent", groceries: "Groceries", utilities: "Electricity / water / phone", transport: "Fuel / transport",
  education: "School / tuition fees", medical: "Medical", insurance: "Insurance premiums",
  "family-support": "Family support", subscriptions: "Subscriptions (OTT, apps)", "eating-out": "Eating out / food delivery",
  shopping: "Shopping", entertainment: "Entertainment", "personal-care": "Personal care", travel: "Travel", other: "Other",
};

export const ESSENTIAL_DEFAULT: Record<ExpenseCategory, boolean> = {
  rent: true, groceries: true, utilities: true, transport: true, education: true, medical: true, insurance: true,
  "family-support": true, subscriptions: false, "eating-out": false, shopping: false, entertainment: false,
  "personal-care": false, travel: false, other: false,
};

export const INCOME_LABEL: Record<IncomeKind, string> = {
  salary: "Salary", business: "Business", freelance: "Freelance", rental: "Rent received",
  family: "Family support", "side-income": "Side income", other: "Other",
};
