// Lifeline — calculation engine. Pure functions, no network, no AI.
import type { Account, Freq, Loan, MoneyState } from "./types";
import { cardLoans, estimateStatement, minimumTrap, recentCardCash } from "./cards";

// ─── Dates ──────────────────────────────────────────────────────────────────
export const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);

/** Due date for a loan in a given month; day 31 becomes the last day of short months. */
export function dueDateIn(loan: Pick<Loan, "dueDay">, year: number, month: number): Date {
  return new Date(year, month, Math.min(loan.dueDay, daysInMonth(year, month)));
}

export function addDays(d: Date, n: number): Date {
  const x = startOfDay(d); x.setDate(x.getDate() + n); return x;
}

// ─── Money helpers ──────────────────────────────────────────────────────────
export function monthly(amount: number, freq: Freq): number {
  switch (freq) {
    case "weekly": return (amount * 52) / 12;
    case "yearly": return amount / 12;
    case "one-off": return 0; // one-offs are not part of the regular monthly picture
    default: return amount;
  }
}

/** Exact amount, always visible (used for exports like calendar files). */
export const inrRaw = (n: number) =>
  (n < 0 ? "−" : "") + "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");

// Privacy mode: every on-screen amount (including text built here) is masked.
let HIDE = false;
export const setHideAmounts = (on: boolean) => { HIDE = on; };
export const inr = (n: number) => (HIDE ? "₹ ••••" : inrRaw(n));

/** Every monthly repayment: loans/EMIs plus one payment per detailed credit card. */
export const loansOf = (s: MoneyState, today = new Date()): Loan[] => [...s.loans, ...cardLoans(s, today)];

// ─── Upcoming EMIs ──────────────────────────────────────────────────────────
export type DueStatus = "paid" | "confirm" | "due-today" | "fund-now" | "upcoming";

export interface DueItem {
  loan: Loan;
  date: Date;
  fundBy: Date;
  ym: string;
  daysLeft: number;
  status: DueStatus;
}

/**
 * Every EMI occurrence from the start of this month up to `horizonDays` ahead.
 * "confirm" = due date has passed this month but the user hasn't marked it paid
 * (it may have auto-debited, or it may have bounced — the user must check).
 */
export function upcomingDues(state: MoneyState, today = new Date(), horizonDays = 35): DueItem[] {
  const out: DueItem[] = [];
  const t = startOfDay(today);
  const end = addDays(t, horizonDays);
  for (const loan of loansOf(state, today)) {
    for (let k = 0; k < 3; k++) {
      const y = t.getFullYear(), m = t.getMonth() + k;
      const date = dueDateIn(loan, y + Math.floor(m / 12), m % 12);
      if (date > end) break;
      const ym = ymKey(date);
      const daysLeft = daysBetween(t, date);
      if (daysLeft < 0 && k > 0) continue;
      const fundBy = addDays(date, -state.settings.bufferDays);
      let status: DueStatus;
      if (loan.paidMonths.includes(ym)) status = "paid";
      else if (daysLeft < 0) status = "confirm";
      else if (daysLeft === 0) status = "due-today";
      else if (t >= fundBy) status = "fund-now";
      else status = "upcoming";
      out.push({ loan, date, fundBy, ym, daysLeft, status });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ─── Funding plan per bank account ──────────────────────────────────────────
export interface Credit { date: Date; amount: number; source: string }

export interface AccountPlan {
  account: Account;
  dues: DueItem[];          // unpaid EMIs from this account in the window
  credits: Credit[];        // expected income landing in this account in the window
  totalDue: number;
  available: number;        // balance minus required minimum balance
  shortfall: number;        // how much to add (0 if fine)
  fundBy: Date | null;      // latest safe date to add the money
  firstFailing: DueItem | null; // the first EMI that would bounce
  lowest: number;           // lowest projected spare balance in the window (negative = short)
  timeline: { date: Date; delta: number }[]; // dated credits (+) and EMIs (−)
}

/**
 * Walks each account day by day: expected monthly income (with a pay day) is added,
 * EMIs are deducted. On the same day the EMI is deducted first (conservative —
 * auto-debits often run before salary is credited).
 */
export function fundingPlan(state: MoneyState, today = new Date(), horizonDays = 31): AccountPlan[] {
  const t = startOfDay(today);
  const end = addDays(t, horizonDays);
  const dues = upcomingDues(state, today, horizonDays).filter(d => d.status !== "paid" && d.status !== "confirm");
  return state.accounts.map(account => {
    const mine = dues.filter(d => d.loan.accountId === account.id);
    const credits: Credit[] = [];
    for (const inc of state.incomes) {
      if (inc.accountId !== account.id || inc.freq !== "monthly" || !inc.day) continue;
      for (let k = 0; k < 3; k++) {
        const m = t.getMonth() + k;
        const date = dueDateIn({ dueDay: inc.day }, t.getFullYear() + Math.floor(m / 12), m % 12);
        if (date > t && date <= end) credits.push({ date, amount: inc.amount, source: inc.source });
      }
    }
    type Ev = { date: Date; delta: number; due?: DueItem };
    const events: Ev[] = [
      ...mine.map(d => ({ date: d.date, delta: -d.loan.emi, due: d })),
      ...credits.map(c => ({ date: c.date, delta: c.amount })),
    ].sort((x, y) => x.date.getTime() - y.date.getTime() || x.delta - y.delta);
    const available = account.balance - account.minBalance;
    let running = available, lowest = available;
    let firstFailing: DueItem | null = null;
    for (const ev of events) {
      running += ev.delta;
      if (ev.due && running < 0 && !firstFailing) firstFailing = ev.due;
      lowest = Math.min(lowest, running);
    }
    return {
      account, dues: mine, credits,
      totalDue: mine.reduce((s, d) => s + d.loan.emi, 0),
      available, shortfall: Math.max(0, -lowest),
      fundBy: firstFailing ? firstFailing.fundBy : null,
      firstFailing, lowest,
      timeline: events.map(e => ({ date: e.date, delta: e.delta })),
    };
  });
}

// ─── Premium: forecast, transfers, safe-to-spend ────────────────────────────
export interface ForecastPoint { date: Date; total: number }

/** Projected spare money across all accounts for each of the next `days` days (EMIs + dated income only). */
export function forecast(state: MoneyState, today = new Date(), days = 30): ForecastPoint[] {
  const plans = fundingPlan(state, today, days);
  const t = startOfDay(today);
  let total = plans.reduce((s, p) => s + p.available, 0);
  const all = plans.flatMap(p => p.timeline);
  const out: ForecastPoint[] = [];
  for (let i = 0; i <= days; i++) {
    const d = addDays(t, i);
    for (const ev of all) if (daysBetween(ev.date, d) === 0) total += ev.delta;
    out.push({ date: d, total });
  }
  return out;
}

export interface Transfer { from: Account | null; to: Account; amount: number; by: Date | null }

/**
 * Cover each account's shortfall from other accounts' spare money first;
 * only the rest needs fresh money ("from" = null).
 */
export function transferPlan(plans: AccountPlan[]): Transfer[] {
  const spare = new Map(plans.map(p => [p.account.id, Math.max(0, Math.floor(p.lowest / 100) * 100)]));
  const out: Transfer[] = [];
  for (const need of plans.filter(p => p.shortfall > 0).sort((a, b) => (a.fundBy?.getTime() ?? 0) - (b.fundBy?.getTime() ?? 0))) {
    let left = need.shortfall;
    for (const donor of plans) {
      if (donor === need || left <= 0) continue;
      const avail = spare.get(donor.account.id) || 0;
      if (avail <= 0) continue;
      const amt = Math.min(avail, Math.ceil(left / 100) * 100);
      spare.set(donor.account.id, avail - amt);
      left -= amt;
      out.push({ from: donor.account, to: need.account, amount: amt, by: need.fundBy });
    }
    if (left > 0) out.push({ from: null, to: need.account, amount: Math.ceil(left / 100) * 100, by: need.fundBy });
  }
  return out;
}

export interface SafeToSpend { perDay: number; total: number; until: Date; days: number; committed: number }

/**
 * What can be spent per day until the next income without endangering EMIs or essentials.
 * total = spare money − EMIs due before next income − essentials for those days − any shortfall.
 */
export function safeToSpend(state: MoneyState, today = new Date()): SafeToSpend {
  const t = startOfDay(today);
  const plans = fundingPlan(state, today, 31);
  const nextIncome = plans.flatMap(p => p.credits).map(c => c.date).sort((a, b) => a.getTime() - b.getTime())[0];
  const until = nextIncome ?? addDays(t, 30);
  const days = Math.max(1, daysBetween(t, until));
  const spare = plans.reduce((s, p) => s + Math.max(0, p.available), 0);
  const emis = plans.flatMap(p => p.dues).filter(d => d.date < until || daysBetween(d.date, until) === 0).reduce((s, d) => s + d.loan.emi, 0);
  const essentials = state.expenses.filter(e => e.essential).reduce((s, e) => s + monthly(e.amount, e.freq), 0) * (days / 30);
  const committed = emis + essentials;
  const total = Math.max(0, spare - committed);
  return { perDay: total / days, total, until, days, committed };
}

/** Month the last loan closes, following the chosen plan. */
export function debtFreeDate(months: number, today = new Date()): Date {
  return new Date(today.getFullYear(), today.getMonth() + months, 1);
}

/** EMIs whose debit account no longer exists (e.g. deleted account) — they can't be planned. */
export const unassignedLoans = (s: MoneyState) => loansOf(s).filter(l => !s.accounts.some(a => a.id === l.accountId));

// ─── Cash flow ──────────────────────────────────────────────────────────────
export interface CashFlow {
  income: number;
  emi: number;
  essentials: number;
  discretionary: number;
  surplus: number;           // income − emi − all expenses
  foir: number;              // EMI ÷ income (banks call this FOIR)
  bySource: { label: string; value: number }[];
  bySpend: { label: string; value: number; essential: boolean }[];
}

export function cashFlow(state: MoneyState): CashFlow {
  const income = state.incomes.reduce((s, i) => s + monthly(i.amount, i.freq), 0);
  const emi = loansOf(state).reduce((s, l) => s + (l.monthlyCost ?? l.emi), 0);
  let essentials = 0, discretionary = 0;
  const spend = new Map<string, { value: number; essential: boolean }>();
  for (const e of state.expenses) {
    const v = monthly(e.amount, e.freq);
    if (e.essential) essentials += v; else discretionary += v;
    const cur = spend.get(e.category) || { value: 0, essential: e.essential };
    spend.set(e.category, { value: cur.value + v, essential: cur.essential && e.essential });
  }
  const bySource = state.incomes
    .map(i => ({ label: i.source, value: monthly(i.amount, i.freq) }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const bySpend = [...spend.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value);
  return {
    income, emi, essentials, discretionary,
    surplus: income - emi - essentials - discretionary,
    foir: income > 0 ? emi / income : emi > 0 ? 1 : 0,
    bySource, bySpend,
  };
}

// ─── Financial stress score ─────────────────────────────────────────────────
export interface Health { score: number; label: "Stable" | "Watch" | "Stressed" | "Critical"; reasons: string[] }

export function healthScore(state: MoneyState, today = new Date()): Health {
  const cf = cashFlow(state);
  const plans = fundingPlan(state, today);
  const reasons: string[] = [];
  let score = 100;

  if (cf.foir > 0.6) { score -= 35; reasons.push(`${Math.round(cf.foir * 100)}% of income goes to EMIs (banks treat >50% as over-leveraged).`); }
  else if (cf.foir > 0.4) { score -= 20; reasons.push(`${Math.round(cf.foir * 100)}% of income goes to EMIs — above the comfortable 40% mark.`); }

  if (cf.income > 0 && cf.surplus < 0) { score -= 25; reasons.push(`You spend ${inr(-cf.surplus)} more than you earn each month.`); }
  else if (cf.income > 0 && cf.surplus < cf.income * 0.05) { score -= 10; reasons.push("Almost nothing is left over at month end — any surprise expense will cause a bounce."); }

  const short = plans.filter(p => p.shortfall > 0);
  if (short.length) { score -= 15; reasons.push(`${short.length} account(s) don't have enough money for upcoming EMIs.`); }

  const costly = loansOf(state, today).filter(l => l.ratePct >= 24 && l.outstanding > 0);
  if (costly.length) { score -= 10; reasons.push(`${costly.length} high-cost debt(s) at 24%+ interest.`); }

  const unconfirmed = upcomingDues(state, today).filter(d => d.status === "confirm");
  if (unconfirmed.length) { score -= 5; reasons.push(`${unconfirmed.length} EMI(s) this month not yet confirmed as paid.`); }

  score = Math.max(0, Math.min(100, score));
  const label = score >= 75 ? "Stable" : score >= 55 ? "Watch" : score >= 35 ? "Stressed" : "Critical";
  return { score, label, reasons };
}

// ─── Debt payoff simulation (avalanche vs snowball) ─────────────────────────
export interface PayoffResult {
  months: number;
  totalInterest: number;
  order: string[];         // loan names in the order they get cleared
  cleared: { name: string; month: number }[]; // month (from now) each loan closes
  capped: boolean;         // true if it never finishes within 50 years (EMI too low for the interest)
}

/** rollover=false models "just keep paying EMIs": a closed loan's EMI is not redirected to other loans. */
export function simulatePayoff(loans: Loan[], extraPerMonth: number, strategy: "avalanche" | "snowball", rollover = true): PayoffResult {
  const live = loans
    .filter(l => l.outstanding > 0)
    .map(l => ({ name: l.name, bal: l.outstanding, r: l.ratePct / 1200, min: l.emi }));
  const order: string[] = [];
  const cleared: { name: string; month: number }[] = [];
  let months = 0, totalInterest = 0;
  const budget = live.reduce((s, l) => s + l.min, 0) + Math.max(0, extraPerMonth);
  while (live.some(l => l.bal > 0.5) && months < 600) {
    months++;
    for (const l of live) if (l.bal > 0) { const i = l.bal * l.r; l.bal += i; totalInterest += i; }
    // Minimums first, then everything left (freed-up EMIs + extra) goes to the target loan.
    let pool = rollover ? budget : Math.max(0, extraPerMonth) + live.filter(l => l.bal > 0).reduce((s, l) => s + l.min, 0);
    for (const l of live) if (l.bal > 0) { const p = Math.min(l.min, l.bal); l.bal -= p; pool -= p; }
    const targets = live.filter(l => l.bal > 0.5).sort((a, b) =>
      strategy === "avalanche" ? b.r - a.r || a.bal - b.bal : a.bal - b.bal || b.r - a.r);
    for (const tgt of targets) { if (pool <= 0) break; const p = Math.min(pool, tgt.bal); tgt.bal -= p; pool -= p; }
    for (const l of live) if (l.bal <= 0.5 && !order.includes(l.name)) { l.bal = 0; order.push(l.name); cleared.push({ name: l.name, month: months }); }
  }
  return { months, totalInterest, order, cleared, capped: months >= 600 };
}

// ─── Savings & action insights (rule based) ─────────────────────────────────
export interface Insight {
  id: string;
  severity: "urgent" | "high" | "medium" | "tip";
  title: string;
  detail: string;
  monthlyImpact?: number;   // estimated ₹/month freed up or protected
  action?: { label: string; tab?: string; href?: string };
}

export function insights(state: MoneyState, today = new Date()): Insight[] {
  const cf = cashFlow(state);
  const out: Insight[] = [];
  const plans = fundingPlan(state, today);

  // 1. Imminent bounces
  for (const p of plans.filter(p => p.shortfall > 0 && p.firstFailing)) {
    const n = p.dues.filter(d => p.firstFailing && d.date >= p.firstFailing.date).length;
    out.push({
      id: "short-" + p.account.id, severity: "urgent",
      title: `Add ${inr(p.shortfall)} to ${p.account.name}${p.fundBy ? " by " + p.fundBy.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}`,
      detail: `Otherwise up to ${n} EMI(s) can bounce. Each bounce typically costs ~${inr(state.settings.bounceFee)} in combined bank + lender charges, plus a late-payment mark on your credit report (CIBIL) that stays for years.`,
      monthlyImpact: n * state.settings.bounceFee,
    });
  }

  // 2. Scattered due dates
  const all = loansOf(state, today);
  const days = [...new Set(all.map(l => l.dueDay))];
  const salaryDay = state.incomes.find(i => i.kind === "salary" && i.day)?.day;
  if (all.length >= 2 && days.length >= 2) {
    out.push({
      id: "align-dates", severity: "high",
      title: "Move all EMI dates to 2–5 days after your income arrives",
      detail: `Your EMIs debit on ${days.length} different dates (${days.sort((a, b) => a - b).join(", ")}). Most banks and NBFCs let you change the EMI date once (sometimes with a small fee and one-time broken-period interest). ${salaryDay ? `Your salary arrives on day ${salaryDay}; ask for day ${Math.min(28, salaryDay + 3)}.` : "Pick a date just after your main income lands."} One date = one funding check per month instead of ${days.length}.`,
    });
  }

  // 3. Spread across accounts
  const acctsUsed = new Set(all.map(l => l.accountId));
  if (acctsUsed.size >= 3) {
    out.push({
      id: "consolidate-accounts", severity: "medium",
      title: `Your EMIs debit from ${acctsUsed.size} different accounts`,
      detail: "Each account must be funded separately and each carries its own minimum balance. Moving mandates (NACH/e-mandate) to one or two accounts reduces the chance of forgetting one.",
    });
  }

  // 4. High-cost debt
  const costly = all.filter(l => l.ratePct >= 24 && l.outstanding > 0).sort((a, b) => b.ratePct - a.ratePct);
  if (costly.length) {
    const interestNow = costly.reduce((s, l) => s + (l.outstanding * l.ratePct) / 1200, 0);
    const interestAt12 = costly.reduce((s, l) => s + (l.outstanding * 12) / 1200, 0);
    out.push({
      id: "costly-debt", severity: "high",
      title: `Replace ${costly.length} high-interest debt(s) — ${costly.map(l => `${l.name} @ ${l.ratePct}%`).join(", ")}`,
      detail: `You pay about ${inr(interestNow)} a month in interest on these. Cheaper, regulated options to refinance: a loan against your fixed deposit, a gold loan from a bank, a top-up on your home loan, or a personal loan from your own bank (typically 9–16%). At ~12% the interest would be about ${inr(interestAt12)}. Close the credit card/BNPL after transfer, or the debt usually comes back.`,
      monthlyImpact: Math.max(0, interestNow - interestAt12),
    });
  }

  // 4a. Credit-card specific
  for (const card of state.cards ?? []) {
    const est = estimateStatement(card, today);
    if (card.plan === "minimum" && est.nonEmiPrincipal > 1000) {
      const trap = minimumTrap(card, est.nonEmiPrincipal);
      out.push({
        id: "card-min-" + card.id, severity: "high",
        title: `Paying only the minimum on ${card.name} costs ~${inr(trap.nextMonthInterest)} interest a month`,
        detail: `At ${card.monthlyRatePct}% a month (${(card.monthlyRatePct * 12).toFixed(0)}% a year + GST), the ${inr(est.nonEmiPrincipal)} balance would take ${trap.capped ? "forever" : Math.ceil(trap.months / 12) + " years"} and ~${inr(trap.interest)} in interest to clear by paying the minimum. Move it to a cheaper loan, or pay a fixed amount above the minimum every month.`,
        monthlyImpact: trap.nextMonthInterest,
        action: { label: "Open card", tab: "bills" },
      });
    }
    if (est.utilization > 0.7) {
      out.push({
        id: "card-util-" + card.id, severity: "medium",
        title: `${card.name} is ${Math.round(est.utilization * 100)}% used, which lowers your credit score`,
        detail: "Lenders and credit bureaus prefer card usage under 30% of the limit. Paying part of the balance before the statement date lowers the usage reported to CIBIL.",
      });
    }
  }
  const rc = recentCardCash(state, today);
  if (rc.amount > 0) {
    out.push({
      id: "card-cash", severity: rc.annualPct > 30 ? "high" : "medium",
      title: `${inr(rc.amount)} taken out via credit card recently cost ${inr(rc.cost)} (~${rc.annualPct.toFixed(0)}% a year)`,
      detail: "Using the card to pay EMIs or withdraw cash keeps the gap hidden, and it gets costlier every month. For a gap that repeats, a personal loan (~12–16%) or a bank gold loan (~9–11%) is far cheaper. Ask your bank about converting the card balance to EMI as well.",
      monthlyImpact: rc.cost,
    });
  }

  // 4b. Liquid investments while paying expensive interest
  const liquid = (state.holdings ?? []).filter(h => h.liquid).reduce((sum, h) => sum + (h.lastPrice !== undefined && (h.kind === "stock" || h.kind === "mf" || h.kind === "crypto") ? h.units * h.lastPrice : h.manualValue ?? h.units * h.avgPrice), 0);
  if (costly.length && liquid > 0) {
    const owed = costly.reduce((sum, l) => sum + l.outstanding, 0);
    const use = Math.min(liquid, owed);
    const avgRate = costly.reduce((sum, l) => sum + l.ratePct * l.outstanding, 0) / owed;
    out.push({
      id: "invest-vs-debt", severity: "high",
      title: `Use up to ${inr(use)} of investments to clear ${avgRate.toFixed(0)}% debt`,
      detail: `You hold ${inr(liquid)} in liquid investments while paying ~${avgRate.toFixed(0)}% on ${inr(owed)} of debt. Few investments reliably beat that. Keep 3 months of essentials as an emergency fund, then repay the costliest debt first. Check exit loads and tax before redeeming.`,
      monthlyImpact: (use * Math.max(0, avgRate - 12)) / 1200,
      action: { label: "See investments", tab: "insights" },
    });
  }

  // 5. Over-leveraged
  if (cf.foir > 0.5) {
    out.push({
      id: "foir", severity: "high",
      title: "EMIs are more than half your income — talk to your lenders before you miss a payment",
      detail: "Ask in writing for a tenure extension (lower EMI) or restructuring. Lenders respond far better before a default than after. Do NOT take a new loan (especially instant-loan apps) to pay an EMI — that is how a debt trap starts.",
    });
  }

  // 6. Structural deficit → earning gap
  if (cf.income > 0 && cf.surplus < 0) {
    out.push({
      id: "deficit", severity: "urgent",
      title: `Monthly gap of ${inr(-cf.surplus)} — cutting alone may not close it`,
      detail: "Combine three levers: cut discretionary spends (below), lower EMIs (refinance/extend tenure), and add a side income sized to the remaining gap.",
      action: { label: "Find ways to earn", tab: "earn" },
    });
  }

  // 7. Discretionary spends
  if (cf.income > 0 && cf.discretionary > cf.income * 0.15) {
    const target = cf.discretionary * 0.3;
    out.push({
      id: "discretionary", severity: "medium",
      title: `Trim non-essential spends by 30% → ${inr(target)}/month`,
      detail: `Non-essentials are ${Math.round((cf.discretionary / cf.income) * 100)}% of income. Largest: ${cf.bySpend.filter(s => !s.essential).slice(0, 3).map(s => s.label).join(", ") || "—"}. Set a weekly cash/UPI limit for these categories rather than a monthly one — it is easier to stick to.`,
      monthlyImpact: target,
    });
  }

  // 8. Subscriptions
  const subs = state.expenses.filter(e => e.category === "subscriptions").reduce((s, e) => s + monthly(e.amount, e.freq), 0);
  if (subs > 0) {
    out.push({
      id: "subs", severity: "tip",
      title: `Audit subscriptions (${inr(subs)}/month)`,
      detail: "Open Google Play → Profile → Payments & subscriptions, and your UPI app's 'Autopay' section. Cancel anything not used in the last 30 days; share family plans where allowed.",
      monthlyImpact: subs * 0.5,
    });
  }

  // 9. Emergency buffer
  const totalBal = state.accounts.reduce((s, a) => s + Math.max(0, a.balance - a.minBalance), 0);
  if (cf.emi > 0 && totalBal < cf.emi) {
    out.push({
      id: "buffer", severity: "medium",
      title: "Build a one-EMI-cycle buffer",
      detail: `Your spare balance (${inr(totalBal)}) is less than one month of EMIs (${inr(cf.emi)}). Park even ₹500–1,000 a week in a separate savings account or sweep FD until it covers one full cycle — this alone prevents most bounces.`,
    });
  }

  // 10. Prepayment check
  const floating = all.filter(l => ["home", "personal", "car", "education"].includes(l.type) && l.outstanding > 0);
  if (floating.length && cf.surplus > 0 && !costly.length) {
    out.push({
      id: "prepay", severity: "tip",
      title: "Use part of your surplus to prepay the highest-rate loan",
      detail: "Floating-rate loans to individuals (most home loans) carry no prepayment penalty under RBI rules; fixed-rate loans may charge 2–5%, so ask first. Check the Plan tab to see how much interest and how many months you save.",
      action: { label: "Open payoff plan", tab: "save" },
    });
  }

  const order = { urgent: 0, high: 1, medium: 2, tip: 3 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
