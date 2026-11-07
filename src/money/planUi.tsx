// Shared UI for the Payment Organizer: one step with a one-tap action that updates the data.
import { useApp } from "./context";
import { inr } from "./engine";
import { applyDraw, applyIncome, applyTransfer, type PlanStep } from "./payplan";
import { uid } from "./store";
import { Button } from "./components";
import { Icon } from "./icons";
import { installedApps, isNative, openApp } from "./native";
import { UPI_APPS } from "./market";

// First UPI app on the phone, used to make transfers in one tap.
let upiCache: (typeof UPI_APPS)[number] | null | undefined;
const upiApp = () => { if (upiCache === undefined) { const have = installedApps(UPI_APPS.map(a => a.pkg)); upiCache = UPI_APPS.find(a => have.has(a.pkg)) ?? null; } return upiCache; };

const ICON: Record<PlanStep["kind"], string> = { income: "income", "pay-card": "card", "card-draw": "transfer", transfer: "transfer", emi: "calendar", warn: "alert" };


export function StepRow({ step }: { step: PlanStep }) {
  const { state, update, open, toast } = useApp();
  const act = () => {
    const before = state;
    if (step.kind === "income") { update(s => applyIncome(s, step)); toast(`${inr(step.amount)} added to balance`, () => update(() => before)); }
    else if (step.kind === "transfer") { update(s => applyTransfer(s, step)); toast("Transfer recorded", () => update(() => before)); }
    else if (step.kind === "card-draw") { update(s => applyDraw(s, step, uid)); toast("Card draw recorded. It's on the next card bill", () => update(() => before)); }
    else if (step.kind === "pay-card" && step.cardId) open({ kind: "card-pay", cardId: step.cardId, amount: step.amount });
    else if (step.kind === "emi" && step.loanId && step.ym) {
      const loan = state.loans.find(l => l.id === step.loanId);
      if (!loan) return;
      update(s => ({
        ...s,
        loans: s.loans.map(l => (l.id !== loan.id ? l : { ...l, paidMonths: [...new Set([...l.paidMonths, step.ym!])] })),
        accounts: s.accounts.map(a => (a.id !== loan.accountId ? a : { ...a, balance: a.balance - loan.emi })),
      }));
      toast(`${loan.name} marked paid`, () => update(() => before));
    } else if (step.kind === "warn") open({ kind: "letter", letter: "date-change", loanId: step.loanId });
  };
  const label = step.kind === "income" ? "Received" : step.kind === "pay-card" ? "Pay" : step.kind === "warn" ? "Ask lender" : "Done";
  return (
    <div className={"step-row k-" + step.kind + (step.late ? " late" : "")}>
      <span className="step-date"><b>{step.date.getDate()}</b><small>{step.date.toLocaleDateString("en-IN", { month: "short" })}</small></span>
      <span className={"step-icon k-" + step.kind}><Icon name={ICON[step.kind]} size={18} /></span>
      <div className="step-body">
        <b>{step.title}</b>
        <p>{step.detail}</p>
        {step.cost ? <small className="step-cost">Cost: {inr(step.cost)}</small> : null}
      </div>
      <div className="step-actions">
        <Button size="sm" variant={step.kind === "warn" ? "danger" : step.kind === "pay-card" ? "primary" : "secondary"} onClick={act} aria-label={`${label}: ${step.title}`}>{label}</Button>
        {isNative && (step.kind === "transfer" || step.kind === "card-draw" || step.kind === "pay-card") && upiApp() && <Button size="sm" variant="ghost" onClick={() => openApp(upiApp()!.pkg)}>Open {upiApp()!.name}</Button>}
      </div>
    </div>
  );
}

