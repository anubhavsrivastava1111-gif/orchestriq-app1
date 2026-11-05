// Lifeline — app-wide context: state, navigation, sheets, toasts.
import { createContext, useContext } from "react";
import type { Account, Expense, Holding, Income, Loan, MoneyState } from "./types";
import type { LetterKind } from "./letters";

export type Tab = "home" | "bills" | "insights" | "earn" | "more" | "ai" | "connect";

export type SheetState =
  | { kind: "quick-add" }
  | { kind: "account"; item?: Account }
  | { kind: "loan"; item?: Loan }
  | { kind: "income"; item?: Income }
  | { kind: "expense"; item?: Expense }
  | { kind: "quick-spends" }
  | { kind: "balances" }
  | { kind: "reminders" }
  | { kind: "letter"; letter?: LetterKind; loanId?: string }
  | { kind: "earn-profile" }
  | { kind: "passcode" }
  | { kind: "backup" }
  | { kind: "restore"; text: string }
  | { kind: "holding"; item?: Holding }
  | { kind: "paywall"; feature?: string }
  | { kind: "bounced"; loanId: string };

export interface AppCtx {
  state: MoneyState;
  update: (fn: (s: MoneyState) => MoneyState) => void;
  replace: (s: MoneyState) => void;
  go: (t: Tab, sub?: string) => void;
  sub: string;                      // sub-view within a tab (segmented control)
  open: (s: SheetState) => void;
  close: () => void;
  toast: (msg: string, undo?: () => void) => void;
  lockNow: () => void;
  resetApp: () => void;
}

export const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("Lifeline context missing");
  return c;
};
