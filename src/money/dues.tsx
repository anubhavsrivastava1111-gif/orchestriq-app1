// Lifeline — EMI status helpers shared by Home and Bills.
import { useApp } from "./context";
import { inr, type DueItem } from "./engine";
import { Pill } from "./components";

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function useMarkPaid() {
  const { update, toast } = useApp();
  return (d: DueItem, paid: boolean) => {
    const apply = (on: boolean) => update(s => ({
      ...s,
      loans: s.loans.map(l => (l.id !== d.loan.id ? l : { ...l, paidMonths: on ? [...new Set([...l.paidMonths, d.ym])] : l.paidMonths.filter(m => m !== d.ym) })),
      accounts: s.accounts.map(a => (a.id !== d.loan.accountId ? a : { ...a, balance: a.balance + (on ? -d.loan.emi : d.loan.emi) })),
    }));
    apply(paid);
    if (paid) toast(`${d.loan.name} marked paid · ${inr(d.loan.emi)} deducted from balance`, () => apply(false));
  };
}

export function statusPill(d: DueItem) {
  switch (d.status) {
    case "paid": return <Pill tone="good">Paid</Pill>;
    case "confirm": return <Pill tone="danger">Check if paid</Pill>;
    case "due-today": return <Pill tone="warn">Debits today</Pill>;
    case "fund-now": return <Pill tone="warn">Due in {d.daysLeft}d</Pill>;
    default: return <Pill>Fund by {fmt(d.fundBy)}</Pill>;
  }
}

