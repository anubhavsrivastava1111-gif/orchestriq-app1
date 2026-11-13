// Shared UI for the Payment Organizer: one plan step, with Done / different amount / later / not doing it.
import { useApp } from "./context";
import { inr } from "./engine";
import type { PlanStep } from "./payplan";
import { useStepActions } from "./planSteps";
import { Button } from "./components";
import { Icon } from "./icons";
import { installedApps, isNative, openApp } from "./native";
import { UPI_APPS } from "./market";

// First UPI app on the phone, used to make transfers in one tap.
let upiCache: (typeof UPI_APPS)[number] | null | undefined;
const upiApp = () => { if (upiCache === undefined) { const have = installedApps(UPI_APPS.map(a => a.pkg)); upiCache = UPI_APPS.find(a => have.has(a.pkg)) ?? null; } return upiCache; };

const ICON: Record<PlanStep["kind"], string> = { income: "income", "pay-card": "card", "card-draw": "transfer", transfer: "transfer", emi: "calendar", warn: "alert" };

export function StepRow({ step }: { step: PlanStep }) {
  const { open } = useApp();
  const act = useStepActions();
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
        <Button size="sm" variant={step.kind === "warn" ? "danger" : step.kind === "pay-card" ? "primary" : "secondary"} onClick={() => act.done(step)} aria-label={`${label}: ${step.title}`}>{label}</Button>
        {step.kind !== "warn" && <Button size="sm" variant="ghost" onClick={() => open({ kind: "step", step })} aria-label={`More options: ${step.title}`}>More</Button>}
        {isNative && (step.kind === "transfer" || step.kind === "card-draw" || step.kind === "pay-card") && upiApp() && <Button size="sm" variant="ghost" onClick={() => openApp(upiApp()!.pkg)}>Open {upiApp()!.name}</Button>}
      </div>
    </div>
  );
}
