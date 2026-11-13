// Plan step actions: apply a step as done (with the real amount), remind later, or not doing it.
import { useApp } from "./context";
import { inr } from "./engine";
import { applyDraw, applyIncome, applyTransfer, type PlanStep } from "./payplan";
import { uid } from "./store";
import type { MoneyState, PlanMark } from "./types";

/** Applies a step as done, with the amount actually moved. */
export function applyStep(s: MoneyState, step: PlanStep, amount: number): MoneyState {
  const st = { ...step, amount };
  if (step.kind === "income") return applyIncome(s, st);
  if (step.kind === "transfer") return applyTransfer(s, st);
  if (step.kind === "card-draw") return applyDraw(s, st, uid);
  if (step.kind === "emi" && step.loanId && step.ym) {
    const loan = s.loans.find(l => l.id === step.loanId);
    if (!loan) return s;
    return {
      ...s,
      loans: s.loans.map(l => (l.id !== loan.id ? l : { ...l, paidMonths: [...new Set([...l.paidMonths, step.ym!])] })),
      accounts: s.accounts.map(a => (a.id !== loan.accountId ? a : { ...a, balance: a.balance - amount })),
    };
  }
  return s;
}

/** Records what the user did with a step (keeps the last ~75 days). */
export function markStep(s: MoneyState, step: PlanStep, status: PlanMark["status"], amount?: number): MoneyState {
  const cutoff = Date.now() - 75 * 86400000;
  const kept = Object.fromEntries(Object.entries(s.planLog).filter(([, m]) => new Date(m.at).getTime() > cutoff));
  const until = status === "skipped" ? new Date(Date.now() + 20 * 3600000).toISOString() : undefined;
  return { ...s, planLog: { ...kept, [step.key]: { status, amount, until, at: new Date().toISOString(), title: step.title, planned: step.amount } } };
}

/** Steps still waiting for the user (done / not-doing are hidden, "later" comes back the next day). */
export function isOpen(s: MoneyState, step: PlanStep): boolean {
  if (step.kind === "warn") return true;
  const m = s.planLog[step.key];
  if (!m) return true;
  return m.status === "skipped" && !!m.until && new Date(m.until).getTime() < Date.now();
}

export function useStepActions() {
  const { state, update, toast, open } = useApp();
  return {
    done: (step: PlanStep, amount = step.amount) => {
      if (step.kind === "pay-card" && step.cardId) { open({ kind: "card-pay", cardId: step.cardId, amount, step }); return; }
      if (step.kind === "warn") { open({ kind: "letter", letter: "date-change", loanId: step.loanId }); return; }
      const before = state;
      update(s => markStep(applyStep(s, step, amount), step, "done", amount));
      toast(step.kind === "income" ? `${inr(amount)} added to balance` : step.kind === "card-draw" ? "Card draw recorded. It's on the next card bill" : amount !== step.amount ? `Done with ${inr(amount)}. Plan updated` : "Done. Plan updated", () => update(() => before));
    },
    later: (step: PlanStep) => { const before = state; update(s => markStep(s, step, "skipped")); toast("Hidden until tomorrow", () => update(() => before)); },
    notDoing: (step: PlanStep) => { const before = state; update(s => markStep(s, step, "ignored")); toast("Marked as not doing. The plan shows what that risks", () => update(() => before)); },
  };
}

