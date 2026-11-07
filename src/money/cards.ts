// Lifeline — credit-card engine (India rules of thumb, all editable per card).
//
// Model of one card cycle:
//   statement day ── spends, card cash, EMI instalments billed ── next statement ── due day
//   Total due  = carried balance + interest on it (+GST) + new spends + card cash + its fees (+GST)
//                + EMI instalments (principal + interest + GST on interest) + processing fees (+GST) + late fee (+GST)
//   Minimum due = max(floor, min% × non-EMI principal) + 100% of EMI instalments + all interest, fees and GST + over-limit
//
// All figures are estimates from the card's terms; banks' exact daily-balance methods differ slightly.
import type { CardEmi, CardCashOut, CardStatement, CreditCard, Loan, MoneyState } from "./types";

export const GST = 0.18;

// ─── Dates ──────────────────────────────────────────────────────────────────
const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dim = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const dayIn = (y: number, m: number, d: number) => { const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; return new Date(yy, mm, Math.min(d, dim(yy, mm))); };
export const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const ymAdd = (ym: string, k: number) => { const [y, m] = ym.split("-").map(Number); return ymOf(new Date(y, m - 1 + k, 1)); };
export const ymDiff = (a: string, b: string) => { const [ya, ma] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number); return (yb - ya) * 12 + (mb - ma); };
const days = (a: Date, b: Date) => Math.round((sod(b).getTime() - sod(a).getTime()) / 86400000);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Latest statement date on or before `today`. */
export function lastStatementDate(card: Pick<CreditCard, "statementDay">, today = new Date()): Date {
  const t = sod(today);
  const c = dayIn(t.getFullYear(), t.getMonth(), card.statementDay);
  return c <= t ? c : dayIn(t.getFullYear(), t.getMonth() - 1, card.statementDay);
}
export function nextStatementDate(card: Pick<CreditCard, "statementDay">, today = new Date()): Date {
  const l = lastStatementDate(card, today);
  return dayIn(l.getFullYear(), l.getMonth() + 1, card.statementDay);
}
/** Payment due date for a statement generated on `stmt`. */
export function dueAfter(card: Pick<CreditCard, "dueDay">, stmt: Date): Date {
  const d = dayIn(stmt.getFullYear(), stmt.getMonth(), card.dueDay);
  return d > stmt ? d : dayIn(stmt.getFullYear(), stmt.getMonth() + 1, card.dueDay);
}

// ─── EMI maths ──────────────────────────────────────────────────────────────
export function emiAmount(principal: number, ratePct: number, months: number): number {
  if (months <= 0) return 0;
  const r = ratePct / 1200;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export interface EmiRow { k: number; ym: string; opening: number; principal: number; interest: number; gst: number; emi: number; fee: number; feeGst: number; billed: number; closing: number }

/** Month-by-month schedule (reducing balance). Processing fee + GST is billed with the first instalment. */
export function emiSchedule(e: CardEmi): EmiRow[] {
  const r = e.ratePct / 1200;
  const E = emiAmount(e.principal, e.ratePct, e.tenure);
  const rows: EmiRow[] = [];
  let bal = e.principal;
  for (let k = 1; k <= e.tenure; k++) {
    const interest = bal * r;
    const principal = k === e.tenure ? bal : E - interest;
    const gst = interest * GST;
    const fee = k === 1 ? e.processingFee : 0;
    const feeGst = fee * GST;
    const closing = Math.max(0, bal - principal);
    rows.push({ k, ym: ymAdd(e.startYm, k - 1), opening: r2(bal), principal: r2(principal), interest: r2(interest), gst: r2(gst), emi: r2(principal + interest), fee: r2(fee), feeGst: r2(feeGst), billed: r2(principal + interest + gst + fee + feeGst), closing: r2(closing) });
    bal = closing;
  }
  return rows;
}

/** The instalment that lands on the statement of month `ym` (null if not active that month). */
export const emiRowFor = (e: CardEmi, ym: string): EmiRow | null => emiSchedule(e).find(r => r.ym === ym) ?? null;

/** Principal still owed on an EMI after the statement of `ym`. */
export function emiRemaining(e: CardEmi, ym: string): number {
  const rows = emiSchedule(e);
  const k = ymDiff(e.startYm, ym) + 1;
  if (k < 1) return e.principal;
  if (k > e.tenure) return 0;
  return rows[k - 1].closing;
}

/** Yearly cost including fees and GST, from monthly cash flows (IRR). */
export function effectiveAnnualPct(received: number, payments: number[]): number {
  if (received <= 0 || !payments.length) return 0;
  const npv = (i: number) => payments.reduce((s, p, t) => s + p / Math.pow(1 + i, t + 1), 0) - received;
  let lo = 0, hi = 1;
  if (npv(lo) <= 0) return 0;
  for (let n = 0; n < 100; n++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  return (Math.pow(1 + lo, 12) - 1) * 100;
}

export interface EmiQuote { emi: number; firstBill: number; totalInterest: number; gstOnInterest: number; fee: number; feeGst: number; totalCost: number; totalPaid: number; effectivePct: number }
export function emiQuote(principal: number, ratePct: number, tenure: number, processingFee: number): EmiQuote {
  const rows = emiSchedule({ id: "q", label: "", principal, ratePct, tenure, processingFee, startYm: "2000-01" });
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  const gstOnInterest = rows.reduce((s, r) => s + r.gst, 0);
  const fee = processingFee, feeGst = processingFee * GST;
  const totalPaid = rows.reduce((s, r) => s + r.billed, 0);
  return {
    emi: rows[0]?.emi ?? 0, firstBill: rows[0]?.billed ?? 0, totalInterest, gstOnInterest, fee, feeGst,
    totalCost: totalInterest + gstOnInterest + fee + feeGst, totalPaid,
    effectivePct: effectiveAnnualPct(principal, rows.map(r => r.billed)),
  };
}

// ─── Card cash (ATM withdrawal or paying through an app for a fee) ──────────
export interface CashCost { fee: number; gst: number; interest: number; total: number; perHundred: number; annualPct: number; chargedToCard: number; daysCarried: number }

/** Cost of one card-cash transaction, assuming the card bill is paid on the due date (and in full if `payInFull`). */
export function cashCost(card: CreditCard, c: Pick<CardCashOut, "amount" | "method" | "feePct" | "feeIncludesGst" | "date">, payInFull = card.plan === "full"): CashCost {
  const r = card.monthlyRatePct / 100;
  const when = new Date(c.date);
  const stmt = nextStatementDate(card, when);
  const due = dueAfter(card, stmt);
  const daysCarried = Math.max(1, days(when, due));
  const fee = c.method === "atm" ? Math.max(c.amount * (c.feePct / 100), card.atmMinFee) : c.amount * (c.feePct / 100);
  const gst = c.method === "atm" || !c.feeIncludesGst ? fee * GST : 0;
  // ATM cash: interest from the day of withdrawal. App payments: interest only if the bill isn't paid in full.
  let interest = c.method === "atm" ? c.amount * r * (daysCarried / 30) : 0;
  if (!payInFull) interest += c.amount * r; // roughly one more month of revolving interest
  interest *= 1 + GST;
  const total = fee + gst + interest;
  return {
    fee: r2(fee), gst: r2(gst), interest: r2(interest), total: r2(total),
    perHundred: c.amount ? (total / c.amount) * 100 : 0,
    annualPct: c.amount ? (total / c.amount) * (365 / daysCarried) * 100 : 0,
    chargedToCard: r2(c.amount + fee + (c.method === "atm" ? 0 : gst)), daysCarried,
  };
}

/** What the same money would cost from cheaper regulated sources over the same days. */
export const alternativeCost = (amount: number, ratePct: number, daysHeld: number) => amount * (ratePct / 100) * (daysHeld / 365);

// ─── Statement estimate ─────────────────────────────────────────────────────
export interface StatementLine { label: string; amount: number; kind: "principal" | "interest" | "fee" | "gst" | "emi" }
export interface StatementEstimate {
  ym: string; date: Date; due: Date;
  carried: number; carriedInterest: number; spendInterest: number;
  newSpends: number; cash: number; cashFees: number; cashGst: number; cashInterest: number;
  emiPrincipal: number; emiInterest: number; emiGst: number; procFee: number; procGst: number;
  lateFee: number; lateGst: number; interestGst: number;
  emiLines: { emi: CardEmi; row: EmiRow }[];
  lines: StatementLine[];
  tad: number; mad: number; nonEmiPrincipal: number;
  used: number; available: number; overLimit: number; utilization: number;
}

/** Balance carried into the next statement, given the pending statement and the payment plan. */
export function carryForward(card: CreditCard, today = new Date()): { carried: number; missed: boolean } {
  const ls = card.lastStatement;
  if (!ls) return { carried: card.revolving, missed: false };
  // Before the due date we assume the planned payment will be made; after it, only what was actually paid counts.
  const pastDue = sod(today) > sod(new Date(ls.due));
  const paid = pastDue ? ls.paidAmount : Math.max(ls.paidAmount, planAmount(card, ls.tad, ls.mad));
  return { carried: card.revolving + Math.max(0, ls.tad - paid), missed: pastDue && ls.paidAmount < ls.mad - 0.5 };
}

export function planAmount(card: CreditCard, tad: number, mad: number): number {
  if (card.plan === "full") return tad;
  if (card.plan === "minimum") return Math.min(mad, tad);
  return Math.min(tad, Math.max(0, card.customPay));
}

/** Estimate of the next statement this card will generate. */
export function estimateStatement(card: CreditCard, today = new Date()): StatementEstimate {
  const date = nextStatementDate(card, today);
  const ym = ymOf(date);
  const due = dueAfter(card, date);
  const r = card.monthlyRatePct / 100;
  const { carried, missed } = carryForward(card, today);

  // Interest: carried balance for ~a month; new spends lose the interest-free period while a balance is carried.
  const carriedInterest = carried * r;
  const cashOuts = card.cashOuts;
  const appCash = cashOuts.filter(c => c.method === "app").reduce((s, c) => s + c.amount, 0);
  const spendInterest = carried > 0 ? (card.unbilled + appCash) * r * 0.5 : 0;
  let cashFees = 0, cashGst = 0, cashInterest = 0;
  for (const c of cashOuts) {
    const fee = c.method === "atm" ? Math.max(c.amount * (c.feePct / 100), card.atmMinFee) : c.amount * (c.feePct / 100);
    cashFees += fee;
    if (c.method === "atm" || !c.feeIncludesGst) cashGst += fee * GST;
    if (c.method === "atm") cashInterest += c.amount * r * (Math.max(1, days(new Date(c.date), date)) / 30);
  }
  const cash = cashOuts.reduce((s, c) => s + c.amount, 0);

  const emiLines = card.emis.map(emi => ({ emi, row: emiRowFor(emi, ym) })).filter((x): x is { emi: CardEmi; row: EmiRow } => !!x.row);
  const emiPrincipal = emiLines.reduce((s, x) => s + x.row.principal, 0);
  const emiInterest = emiLines.reduce((s, x) => s + x.row.interest, 0);
  const emiGst = emiLines.reduce((s, x) => s + x.row.gst, 0);
  const procFee = emiLines.reduce((s, x) => s + x.row.fee, 0);
  const procGst = emiLines.reduce((s, x) => s + x.row.feeGst, 0);
  const lateFee = missed ? card.lateFee : 0;
  const lateGst = lateFee * GST;
  const interestGst = (carriedInterest + spendInterest + cashInterest) * GST;

  const nonEmiPrincipal = carried + card.unbilled + cash;
  const tad = nonEmiPrincipal + carriedInterest + spendInterest + cashInterest + interestGst + cashFees + cashGst
    + emiPrincipal + emiInterest + emiGst + procFee + procGst + lateFee + lateGst;
  const emiOutstanding = card.emis.reduce((s, e) => s + emiRemaining(e, ym), 0);
  const used = nonEmiPrincipal + cashFees + cashGst + emiOutstanding + emiPrincipal;
  const overLimit = Math.max(0, used - card.limit);
  const base = nonEmiPrincipal > 0 ? Math.min(nonEmiPrincipal, Math.max(card.minFloor, nonEmiPrincipal * (card.minPct / 100))) : 0;
  const charges = carriedInterest + spendInterest + cashInterest + interestGst + cashFees + cashGst + lateFee + lateGst;
  const emiBilled = emiPrincipal + emiInterest + emiGst + procFee + procGst;
  const mad = Math.min(tad, base + emiBilled + charges + overLimit);

  const allLines: StatementLine[] = [
    { label: "Unpaid balance carried forward", amount: carried, kind: "principal" },
    { label: "Interest on carried balance", amount: carriedInterest + spendInterest, kind: "interest" },
    { label: "New spends this cycle", amount: card.unbilled, kind: "principal" },
    { label: "Card cash used", amount: cash, kind: "principal" },
    { label: "Cash / transfer fees", amount: cashFees, kind: "fee" },
    { label: "Interest on ATM cash", amount: cashInterest, kind: "interest" },
    { label: "EMI principal", amount: emiPrincipal, kind: "emi" },
    { label: "EMI interest", amount: emiInterest, kind: "emi" },
    { label: "Processing fees", amount: procFee, kind: "fee" },
    { label: "Late payment fee", amount: lateFee, kind: "fee" },
    { label: "GST 18% on interest & fees", amount: interestGst + cashGst + emiGst + procGst + lateGst, kind: "gst" },
  ];
  const lines = allLines.filter(l => l.amount > 0.5);

  return {
    ym, date, due, carried, carriedInterest, spendInterest, newSpends: card.unbilled, cash, cashFees, cashGst, cashInterest,
    emiPrincipal, emiInterest, emiGst, procFee, procGst, lateFee, lateGst, interestGst, emiLines, lines,
    tad: r2(tad), mad: r2(mad), nonEmiPrincipal, used, available: Math.max(0, card.limit - used), overLimit,
    utilization: card.limit > 0 ? used / card.limit : 0,
  };
}

// ─── Next payment (pending statement first, otherwise the estimate) ─────────
export interface CardPayment { date: Date; ym: string; tad: number; mad: number; amount: number; source: "statement" | "estimate"; paidSoFar: number }
export function nextPayment(card: CreditCard, today = new Date()): CardPayment {
  const ls = card.lastStatement;
  // An unpaid statement stays the next payment, even after its due date (then it's overdue), until it's paid.
  if (ls && ls.paidAmount < planAmount(card, ls.tad, ls.mad) - 0.5) {
    const due = new Date(ls.due);
    return { date: due, ym: ymOf(due), tad: ls.tad, mad: ls.mad, amount: Math.max(0, planAmount(card, ls.tad, ls.mad) - ls.paidAmount), source: "statement", paidSoFar: ls.paidAmount };
  }
  const est = estimateStatement(card, today);
  return { date: est.due, ym: ymOf(est.due), tad: est.tad, mad: est.mad, amount: planAmount(card, est.tad, est.mad), source: "estimate", paidSoFar: 0 };
}

/** What the card adds to monthly outgo, excluding everyday spends (already counted under spends). */
export function monthlyCardCost(card: CreditCard, today = new Date()): number {
  const p = nextPayment(card, today);
  const spends = p.source === "estimate" ? card.unbilled : 0;
  return Math.max(0, p.amount - spends);
}

export function cardDebt(card: CreditCard, today = new Date()): number {
  const est = estimateStatement(card, today);
  return est.nonEmiPrincipal + card.emis.reduce((s, e) => s + emiRemaining(e, est.ym), 0) + est.emiPrincipal;
}

// ─── If only the minimum is paid ────────────────────────────────────────────
export function minimumTrap(card: CreditCard, startBalance: number): { months: number; interest: number; capped: boolean; nextMonthInterest: number } {
  const r = (card.monthlyRatePct / 100) * (1 + GST);
  let bal = startBalance, months = 0, interest = 0;
  const nextMonthInterest = bal * r;
  while (bal > 1 && months < 600) {
    const i = bal * r;
    interest += i;
    const pay = Math.min(bal + i, Math.max(card.minFloor, bal * (card.minPct / 100)) + i);
    bal = bal + i - pay;
    months++;
  }
  return { months, interest, capped: months >= 600, nextMonthInterest };
}

// ─── Statement roll-over (runs on app open) ─────────────────────────────────
/** Generates any statements that have come due since the card was last updated. Returns the same object if nothing changed. */
export function rollCard(card: CreditCard, today = new Date()): CreditCard {
  const latest = lastStatementDate(card, today);
  const latestYm = ymOf(latest);
  if (!card.cycleYm || ymDiff(card.cycleYm, latestYm) <= 0) return card;
  let c = card;
  for (let guard = 0; guard < 6 && ymDiff(c.cycleYm, latestYm) > 0; guard++) {
    // Estimate the statement generated in the month after the current cycle.
    const prevStmt = dayIn(Number(c.cycleYm.slice(0, 4)), Number(c.cycleYm.slice(5, 7)) - 1, c.statementDay);
    const dayBefore = new Date(dayIn(prevStmt.getFullYear(), prevStmt.getMonth() + 1, c.statementDay).getTime() - 86400000);
    const est = estimateStatement(c, dayBefore);
    const stmt: CardStatement = { ym: est.ym, date: est.date.toISOString(), due: est.due.toISOString(), tad: est.tad, mad: est.mad, paidAmount: 0, estimated: true };
    c = { ...c, lastStatement: stmt, revolving: 0, unbilled: 0, cashOuts: [], cycleYm: est.ym };
  }
  return c;
}

export function rollAllCards(state: MoneyState, today = new Date()): MoneyState {
  let changed = false;
  const cards = state.cards.map(c => { const n = rollCard(c, today); if (n !== c) changed = true; return n; });
  return changed ? { ...state, cards } : state;
}

// ─── Recording a payment ────────────────────────────────────────────────────
export function applyPayment(card: CreditCard, amount: number, today = new Date()): CreditCard {
  const p = nextPayment(card, today);
  const paidMonths = amount + p.paidSoFar >= Math.min(p.amount + p.paidSoFar, p.tad) - 0.5 ? [...new Set([...card.paidMonths, p.ym])] : card.paidMonths;
  if (p.source === "statement" && card.lastStatement) {
    return { ...card, lastStatement: { ...card.lastStatement, paidAmount: card.lastStatement.paidAmount + amount }, paidMonths };
  }
  // Paying in advance of the statement: reduces the carried balance first, then this cycle's spends.
  let left = amount;
  const revolving = Math.max(0, card.revolving - left); left = Math.max(0, left - card.revolving);
  const unbilled = Math.max(0, card.unbilled - left);
  return { ...card, revolving, unbilled, paidMonths };
}

// ─── Integration with the rest of the app ───────────────────────────────────
/** Each card appears to EMI screens, reminders and the funding plan as one monthly payment. */
export function cardLoans(state: MoneyState, today = new Date()): Loan[] {
  return (state.cards ?? []).map(card => {
    const p = nextPayment(card, today);
    return {
      id: "card:" + card.id, cardId: card.id, name: card.name, lender: card.bank, type: "credit-card" as const,
      emi: Math.round(p.amount), monthlyCost: Math.round(monthlyCardCost(card, today)), dueDay: card.dueDay, accountId: card.accountId,
      outstanding: Math.round(cardDebt(card, today)), ratePct: card.monthlyRatePct * 12, paidMonths: card.paidMonths,
    };
  });
}

/** Breaks cards into separate debts (carried balance at card rate, each EMI at its own rate) for the debt-free planner. */
export function payoffDebts(state: MoneyState, today = new Date()): Loan[] {
  const out: Loan[] = [];
  for (const card of state.cards ?? []) {
    const est = estimateStatement(card, today);
    if (est.nonEmiPrincipal > 1) {
      out.push({ id: "cardbal:" + card.id, name: `${card.name} balance`, lender: card.bank, type: "credit-card", ratePct: card.monthlyRatePct * 12 * (1 + GST),
        emi: Math.max(card.minFloor, est.nonEmiPrincipal * (card.minPct / 100)) + est.nonEmiPrincipal * (card.monthlyRatePct / 100) * (1 + GST),
        outstanding: est.nonEmiPrincipal, dueDay: card.dueDay, accountId: card.accountId, paidMonths: [] });
    }
    for (const e of card.emis) {
      const rem = emiRemaining(e, est.ym) + (emiRowFor(e, est.ym)?.principal ?? 0);
      if (rem > 1) out.push({ id: "cardemi:" + e.id, name: e.label, lender: card.name, type: "credit-card", ratePct: e.ratePct * (1 + GST), emi: emiAmount(e.principal, e.ratePct, e.tenure), outstanding: rem, dueDay: card.dueDay, accountId: card.accountId, paidMonths: [] });
    }
  }
  return out;
}

/** Card cash used in the last ~35 days, across cards. */
export function recentCardCash(state: MoneyState, today = new Date()): { amount: number; cost: number; annualPct: number } {
  let amount = 0, cost = 0, wd = 0;
  for (const card of state.cards ?? []) for (const c of card.cashOuts) {
    if (days(new Date(c.date), today) > 35) continue;
    const k = cashCost(card, c);
    amount += c.amount; cost += k.total; wd += k.annualPct * c.amount;
  }
  return { amount, cost, annualPct: amount ? wd / amount : 0 };
}

export const DEFAULT_CARD: Omit<CreditCard, "id" | "name" | "bank" | "accountId"> = {
  limit: 100000, statementDay: 15, dueDay: 5, monthlyRatePct: 3.6, revolving: 0, unbilled: 0,
  plan: "full", customPay: 0, minPct: 5, minFloor: 200, lateFee: 1000, atmFeePct: 2.5, atmMinFee: 500,
  emis: [], cashOuts: [], paidMonths: [], lastStatement: null, cycleYm: "",
};
