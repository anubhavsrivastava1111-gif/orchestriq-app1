// Lifeline — builds the list of phone notifications for the next few months.
import type { MoneyState } from "./types";
import { addDays, dueDateIn, inrRaw, loansOf, ymKey } from "./engine";
import type { NativeReminder } from "./native";

const MONTHS_AHEAD = 4;

/** Stable 31-bit id so the same reminder keeps the same alarm across reschedules. */
function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 1) || 1;
}

export function buildReminders(state: MoneyState, now = new Date()): NativeReminder[] {
  const out: NativeReminder[] = [];
  const nowMs = now.getTime();
  for (const loan of loansOf(state, now)) {
    const acct = state.accounts.find(a => a.id === loan.accountId)?.name ?? "your account";
    for (let k = 0; k <= MONTHS_AHEAD; k++) {
      const m = now.getMonth() + k;
      const due = dueDateIn(loan, now.getFullYear() + Math.floor(m / 12), m % 12);
      const ym = ymKey(due);
      if (loan.paidMonths.includes(ym)) continue;
      const fund = addDays(due, -state.settings.bufferDays);
      fund.setHours(9, 0, 0, 0);
      const dueAt = new Date(due); dueAt.setHours(8, 0, 0, 0);
      if (fund.getTime() > nowMs) out.push({
        id: hashId(`fund:${loan.id}:${ym}`), at: fund.getTime(),
        title: loan.cardId ? `Card bill: keep ${inrRaw(loan.emi)} in ${acct}` : `Fund ${acct} for ${loan.name}`,
        body: `${inrRaw(loan.emi)} auto-debits on ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. Check the balance and top up today if needed.`,
      });
      if (dueAt.getTime() > nowMs) out.push({
        id: hashId(`due:${loan.id}:${ym}`), at: dueAt.getTime(),
        title: loan.cardId ? `${loan.name} bill due today` : `EMI today: ${loan.name}`,
        body: `${inrRaw(loan.emi)} from ${acct}. Open Lifeline and mark it paid once it goes through.`,
      });
    }
  }
  // Salary day: a nudge to update balances so the funding plan stays accurate.
  const salary = state.incomes.find(i => i.kind === "salary" && i.day);
  if (salary?.day && (state.loans.length || state.cards.length)) {
    for (let k = 0; k <= MONTHS_AHEAD; k++) {
      const m = now.getMonth() + k;
      const d = dueDateIn({ dueDay: salary.day }, now.getFullYear() + Math.floor(m / 12), m % 12);
      d.setHours(11, 0, 0, 0);
      if (d.getTime() > nowMs) out.push({ id: hashId(`salary:${ymKey(d)}`), at: d.getTime(), title: "Salary day: plan your EMIs", body: "Update your balances in Lifeline (20 seconds) to see exactly how much to keep in each account." });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 380);
}
