// Lifeline — builds the list of phone notifications for the next few months.
import type { MoneyState } from "./types";
import { addDays, dueDateIn, inrRaw, loansOf, ymKey } from "./engine";
import { dueAfter, estimateStatement } from "./cards";
import type { NativeReminder } from "./native";

const MONTHS_AHEAD = 4;

/** Stable 31-bit id so the same reminder keeps the same alarm across reschedules. */
function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 1) || 1;
}

/**
 * Fewer, smarter notifications:
 *  • one "keep money ready" nudge per due date (all payments that day together), and none at all
 *    when the accounts already hold enough for everything due by then;
 *  • a "did these go through?" check the day after, only when bank messages are off
 *    (with messages on, Lifeline already knows);
 *  • card statement-day notices only when bank messages are off (the bank's statement SMS is read instead);
 *  • one salary-day nudge a month to open the plan.
 */
export function buildReminders(state: MoneyState, now = new Date()): NativeReminder[] {
  const out: NativeReminder[] = [];
  const nowMs = now.getTime();
  const sms = state.settings.smsCapture;
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const acctName = (id: string) => state.accounts.find(a => a.id === id)?.name ?? "your account";

  interface Due { date: Date; name: string; amount: number; accountId: string }
  const dues: Due[] = [];
  for (const loan of loansOf(state, now)) {
    for (let k = 0; k <= MONTHS_AHEAD; k++) {
      const m = now.getMonth() + k;
      const due = dueDateIn(loan, now.getFullYear() + Math.floor(m / 12), m % 12);
      if (loan.paidMonths.includes(ymKey(due)) || loan.emi <= 0) continue;
      if (due.getTime() < nowMs - 86400000) continue;
      dues.push({ date: due, name: loan.cardId ? `${loan.name} bill` : /emi$/i.test(loan.name) ? loan.name : `${loan.name} EMI`, amount: loan.emi, accountId: loan.accountId });
    }
  }
  const byDay = new Map<string, Due[]>();
  for (const d of dues) { const k = d.date.toDateString(); byDay.set(k, [...(byDay.get(k) ?? []), d]); }

  // Spare money now per account (balance above the minimum), to skip nudges that aren't needed.
  const spare = new Map(state.accounts.map(a => [a.id, a.balance - a.minBalance]));
  const soon = nowMs + 35 * 86400000;
  for (const [, group] of [...byDay.entries()].sort((a, b) => a[1][0].date.getTime() - b[1][0].date.getTime())) {
    const due = group[0].date;
    const perAcct = new Map<string, number>();
    for (const d of group) perAcct.set(d.accountId, (perAcct.get(d.accountId) ?? 0) + d.amount);
    // Already covered? (only judged for the next 5 weeks, where today's balances mean something)
    if (due.getTime() < soon) {
      const covered = [...perAcct.keys()].every(id => {
        const needUpTo = dues.filter(d => d.accountId === id && d.date.getTime() <= due.getTime() && d.date.getTime() >= nowMs - 86400000).reduce((n, d) => n + d.amount, 0);
        return (spare.get(id) ?? 0) >= needUpTo;
      });
      if (covered) continue;
    }
    const fund = addDays(due, -state.settings.bufferDays); fund.setHours(9, 0, 0, 0);
    const at = fund.getTime() > nowMs ? fund.getTime() : due.getTime() - 86400000 > nowMs ? nowMs + 60000 : 0;
    if (!at) continue;
    const total = group.reduce((n, d) => n + d.amount, 0);
    const keep = [...perAcct.entries()].map(([id, amt]) => `${inrRaw(amt)} in ${acctName(id)}`).join(", ");
    out.push({
      id: hashId(`fund:${due.toDateString()}`), at,
      title: group.length === 1 ? `${group[0].name} on ${fmt(due)}: keep ${inrRaw(total)} ready` : `${group.length} payments on ${fmt(due)}: ${inrRaw(total)}`,
      body: `Keep ${keep}${group.length > 1 ? ` (${group.map(d => d.name).join(", ")})` : ""}. Open Lifeline for the plan if money is short.`,
    });
    if (!sms) {
      const check = new Date(due); check.setDate(check.getDate() + 1); check.setHours(19, 0, 0, 0);
      if (check.getTime() > nowMs) out.push({
        id: hashId(`check:${due.toDateString()}`), at: check.getTime(),
        title: group.length === 1 ? `Did ${group[0].name} go through?` : "Did yesterday's payments go through?",
        body: `${group.map(d => d.name).join(", ")}. Open Lifeline and tap Paid or Bounced.`,
      });
    }
  }

  // Card statement day: only without bank messages (otherwise the bank's statement SMS fills it in).
  if (!sms) {
    for (const card of state.cards) {
      for (let k = 0; k <= MONTHS_AHEAD; k++) {
        const m = now.getMonth() + k;
        const stmt = dueDateIn({ dueDay: card.statementDay }, now.getFullYear() + Math.floor(m / 12), m % 12);
        stmt.setHours(18, 0, 0, 0);
        if (stmt.getTime() <= nowMs) continue;
        const est = estimateStatement(card, new Date(stmt.getTime() - 86400000));
        out.push({ id: hashId(`stmt:${card.id}:${ymKey(stmt)}`), at: stmt.getTime(), title: `${card.name}: new bill today`,
          body: `About ${inrRaw(est.tad)} total, ${inrRaw(est.mad)} minimum, due ${fmt(dueAfter(card, stmt))}. Enter the exact figures from the bank's SMS.` });
      }
    }
  }

  // Salary day: one nudge a month.
  const salary = state.incomes.find(i => i.kind === "salary" && i.day);
  if (salary?.day && (state.loans.length || state.cards.length)) {
    for (let k = 0; k <= MONTHS_AHEAD; k++) {
      const m = now.getMonth() + k;
      const d = dueDateIn({ dueDay: salary.day }, now.getFullYear() + Math.floor(m / 12), m % 12);
      d.setHours(11, 0, 0, 0);
      if (d.getTime() > nowMs) out.push({ id: hashId(`salary:${ymKey(d)}`), at: d.getTime(), title: "Salary day: your plan for this month",
        body: sms ? "Your balances are already up to date. Tap Plan my payments to see what to pay, when, and from where." : "Update balances (20 seconds), then tap Plan my payments." });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 200);
}
