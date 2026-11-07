// Lifeline — Payment Organizer.
// Works out, for the next ~5 weeks, what is due when, from which account, in what order, and how to cover
// any shortfall at the lowest cost while protecting the credit history (no bounced EMI, no missed card minimum).
//
// Priorities when money is short:
//   1. Auto-debit EMIs must never bounce (bounce charges + a late mark on the credit report).
//   2. Every card's minimum due must be paid (late fee + credit report mark after 3 days overdue).
//   3. Cards paid in full where possible (keeps the interest-free period on new spends).
//   4. Any remaining gap is covered by the cheapest option: drawing money back from a card that was just paid
//      ("rotation", one-time fee), or carrying part of the card balance (monthly interest), whichever costs less.
import type { CardCashOut, CreditCard, Loan, MoneyState } from "./types";
import { addDays, cashFlow, daysBetween, dueDateIn, inr, upcomingDues, ymKey } from "./engine";
import { GST, emiAmount, emiRowFor, estimateStatement, nextPayment, ymAdd, ymOf } from "./cards";

const WINDOW_DAYS = 35;
export const DEFAULT_DRAW_FEE = 3;
export const drawFeePct = (c: CreditCard) => c.drawFeePct ?? DEFAULT_DRAW_FEE;
/** Fee per ₹1 drawn from a card to the bank, including GST on the fee. */
export const drawFeeRate = (c: CreditCard) => (drawFeePct(c) / 100) * (c.drawFeeIncludesGst ? 1 : 1 + GST);
const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export type StepKind = "income" | "pay-card" | "card-draw" | "transfer" | "emi" | "warn";
export interface PlanStep {
  key: string; date: Date; kind: StepKind; title: string; detail: string; amount: number;
  accountId?: string; fromId?: string; toId?: string; cardId?: string; loanId?: string; ym?: string;
  cost?: number; late: boolean;
}
export interface CardDecision { card: CreditCard; tad: number; mad: number; pay: number; due: Date; ym: string }
export interface Option { id: "rotate" | "carry" | "topup" | "emi"; title: string; cost: number; note: string; feasible: boolean; best?: boolean }
export interface PayPlan {
  start: Date; end: Date;
  cashNow: number; incomeIn: number; available: number;
  loanDue: number; cardFull: number; cardMin: number; needed: number;
  mode: "clear" | "carry" | "rotate" | "short";
  rotation: { amount: number; fee: number; card: CreditCard } | null;
  carry: { amount: number; interest: number } | null;
  shortfall: number; cost: number; leftover: number;
  steps: PlanStep[]; options: Option[]; cards: CardDecision[];
}

interface Credit { date: Date; amount: number; accountId: string; incomeId: string; source: string; pending: boolean }

/** Next pay day per income source (plus one that may have just arrived but isn't in the balance yet). */
function credits(state: MoneyState, today: Date): { list: Credit[]; following: Date | null } {
  const out: Credit[] = [];
  const t = sod(today);
  let following: Date | null = null;
  const fallback = state.accounts[0]?.id ?? "";
  for (const inc of state.incomes) {
    if (inc.freq !== "monthly" || !inc.day) continue;
    const acct = state.accounts.find(a => a.id === inc.accountId) ?? state.accounts.find(a => a.id === fallback);
    if (!acct) continue;
    const dates: Date[] = [];
    for (let k = -1; k < 3; k++) { const m = t.getMonth() + k; dates.push(dueDateIn({ dueDay: inc.day }, t.getFullYear() + Math.floor(m / 12), ((m % 12) + 12) % 12)); }
    const recent = dates.find(d => d <= t && daysBetween(d, t) <= 5 && new Date(acct.updatedAt) < d);
    const next = dates.find(d => d > t);
    if (recent) out.push({ date: recent, amount: inc.amount, accountId: acct.id, incomeId: inc.id, source: inc.source, pending: true });
    else if (next) out.push({ date: next, amount: inc.amount, accountId: acct.id, incomeId: inc.id, source: inc.source, pending: false });
    // The pay day after this cycle's one ends the planning window (that money belongs to next month's plan).
    const anchor = recent ?? next;
    const after = anchor ? dates.find(d => d > anchor) : undefined;
    if (inc.kind === "salary" && after && (!following || after < following)) following = after;
  }
  return { list: out.sort((a, b) => a.date.getTime() - b.date.getTime()), following };
}

export interface PlanOptions { extraCash?: number; today?: Date }

export function buildPayPlan(state: MoneyState, opts: PlanOptions = {}): PayPlan {
  const today = opts.today ?? new Date();
  const t = sod(today);
  const { list: inc, following } = credits(state, today);
  const end = following ? new Date(Math.min(addDays(t, WINDOW_DAYS).getTime(), addDays(following, -1).getTime())) : addDays(t, WINDOW_DAYS);
  const spare = new Map(state.accounts.map(a => [a.id, a.balance - a.minBalance]));
  const cashNow = [...spare.values()].reduce((s, v) => s + Math.max(0, v), 0) - (opts.extraCash ?? 0);
  const incomeIn = inc.reduce((s, c) => s + c.amount, 0);
  const available = cashNow + incomeIn;

  const loanDues = upcomingDues({ ...state, cards: [] }, today, daysBetween(t, end))
    .filter(d => (d.status === "upcoming" || d.status === "fund-now" || d.status === "due-today") && d.date <= end);
  const loanDue = loanDues.reduce((s, d) => s + d.loan.emi, 0);

  const cards: CardDecision[] = [];
  for (const card of state.cards) {
    const p = nextPayment(card, today);
    if (card.paidMonths.includes(p.ym) || p.date > end) continue;
    const tad = Math.max(0, p.tad - p.paidSoFar), mad = Math.max(0, p.mad - p.paidSoFar);
    if (tad < 1) continue;
    cards.push({ card, tad, mad, pay: tad, due: p.date, ym: p.ym });
  }
  const cardFull = cards.reduce((s, c) => s + c.tad, 0);
  const cardMin = cards.reduce((s, c) => s + c.mad, 0);
  const needed = loanDue + cardFull;

  // ─── Decide how to cover a gap ─────────────────────────────────────────────
  let mode: PayPlan["mode"] = "clear";
  let rotation: PayPlan["rotation"] = null;
  let carry: PayPlan["carry"] = null;
  let shortfall = 0;
  const gap = Math.max(0, needed - available);
  const options: Option[] = [];
  if (gap > 0.5) {
    // Rotation: pay cards in full, then draw the gap back from the card with the most room (limit freed by paying).
    // Free limit once this bill is paid as planned (the estimate already assumes that payment).
    const capacity = (c: CardDecision) => Math.max(0, estimateStatement(c.card, today).available) / (1 + drawFeeRate(c.card));
    const best = [...cards].sort((a, b) => capacity(b) - capacity(a))[0];
    const rotCap = best ? capacity(best) : 0;
    const rotAmt = Math.min(gap, rotCap);
    const rotFee = best ? rotAmt * drawFeeRate(best.card) : 0;
    // Carry: pay only part of the card bills (down to the minimum); interest on the unpaid part + new spends lose the grace period.
    const carryRoom = cardFull - cardMin;
    const carryAmt = Math.min(gap, carryRoom);
    const carryInterest = cards.reduce((s, c) => {
      const share = carryRoom > 0 ? (c.tad - c.mad) / carryRoom : 0;
      const r = c.card.monthlyRatePct / 100;
      return s + (carryAmt * share * r + (share > 0 ? c.card.unbilled * r * 0.5 : 0)) * (1 + GST);
    }, 0);
    options.push(
      { id: "rotate", title: "Pay the card in full, then move money back to the bank", cost: rotFee, feasible: rotAmt >= gap - 0.5 && !!best,
        note: best ? `${drawFeePct(best.card)}% fee${best.card.drawFeeIncludesGst ? "" : " + GST"} on ${fmtInr(gap)} via a payment app (rent/EMI payments). No interest if next bill is paid in full. Room on ${best.card.name}: ${fmtInr(rotCap)}.` : "Needs a credit card with free limit." },
      { id: "carry", title: "Pay only part of the card (at least the minimum)", cost: carryInterest, feasible: carryAmt >= gap - 0.5,
        note: carryRoom > 0 ? `Interest ~${cards[0]?.card.monthlyRatePct ?? 3.6}%/month + GST on the unpaid part, and new spends lose the interest-free period.` : "Card minimum leaves no room." },
      { id: "topup", title: "Cheaper loan (bank personal loan / gold loan)", cost: gap * 0.14 / 12, feasible: true, note: "≈14% a year from your own bank, or ~10% for a bank gold loan. Takes a few days, but ends the monthly fees." },
    );
    const feasible = options.filter(o => o.feasible && o.id !== "topup").sort((a, b) => a.cost - b.cost);
    if (feasible.length) {
      feasible[0].best = true;
      if (feasible[0].id === "rotate" && best) { mode = "rotate"; rotation = { amount: rotAmt, fee: rotFee, card: best.card }; }
      else {
        mode = "carry"; carry = { amount: carryAmt, interest: carryInterest };
        let left = carryAmt;
        for (const c of cards) { const cut = Math.min(left, c.tad - c.mad); c.pay = c.tad - cut; left -= cut; }
      }
    } else {
      // Even minimums + EMIs don't fit: use the most we can, and flag the rest.
      mode = "short";
      if (best && rotAmt > 0) { rotation = { amount: rotAmt, fee: rotFee, card: best.card }; }
      shortfall = gap - rotAmt;
      options.find(o => o.id === "topup")!.best = true;
    }
  }

  // ─── Turn the decisions into dated steps (simulate each account) ──────────
  type Ev = { date: Date; order: number; run: () => void };
  const evs: Ev[] = [];
  const steps: PlanStep[] = [];
  const bal = new Map(spare);
  const take = (acct: string, amt: number) => bal.set(acct, (bal.get(acct) ?? 0) - amt);
  const give = (acct: string, amt: number) => bal.set(acct, (bal.get(acct) ?? 0) + amt);
  const name = (id?: string) => state.accounts.find(a => a.id === id)?.name ?? "your account";
  const late = (d: Date) => d < t;
  const firstIncome = inc[0]?.date;
  const ensure = (acct: string, amt: number, by: Date, why: string) => {
    let need = amt - (bal.get(acct) ?? 0);
    if (need <= 0.5) return;
    const donors = [...bal.entries()].filter(([id, v]) => id !== acct && v > 0).sort((a, b) => b[1] - a[1]);
    for (const [id, v] of donors) {
      if (need <= 0.5) break;
      const mv = Math.ceil(Math.min(v, need) / 100) * 100;
      take(id, mv); give(acct, mv); need -= mv;
      const date = new Date(Math.max(t.getTime(), addDays(by, -1).getTime()));
      steps.push({ key: `xfer:${id}:${acct}:${ymKey(by)}:${why}`, date, kind: "transfer", title: `Move ${fmtInr(mv)} to ${name(acct)}`, detail: `From ${name(id)} (UPI / net banking, free) so ${why} doesn't fail.`, amount: mv, fromId: id, toId: acct, late: false });
    }
  };

  for (const c of inc) {
    evs.push({ date: c.date, order: 0, run: () => {
      give(c.accountId, c.amount);
      steps.push({ key: `income:${c.incomeId}:${ymKey(c.date)}`, date: c.date, kind: "income", title: `${c.source} ${c.pending ? "should have arrived" : "arrives"}: ${fmtInr(c.amount)}`, detail: c.pending ? `Into ${name(c.accountId)}. Tap Received once it's in, so the plan uses the real balance.` : `Into ${name(c.accountId)}.`, amount: c.amount, accountId: c.accountId, late: c.pending });
    } });
  }
  for (const c of cards) {
    // Pay cards as soon as money is in (needed before drawing back), but never after the due date.
    const when = mode === "rotate" || mode === "short" ? (firstIncome && firstIncome <= c.due ? firstIncome : t) : new Date(Math.min(c.due.getTime(), Math.max(t.getTime(), addDays(c.due, -state.settings.bufferDays).getTime(), (firstIncome && firstIncome <= c.due ? firstIncome : t).getTime())));
    const date = new Date(Math.max(when.getTime(), t.getTime()));
    evs.push({ date, order: 1, run: () => {
      ensure(c.card.accountId, c.pay, date, `${c.card.name} payment`);
      take(c.card.accountId, c.pay);
      const kindLabel = c.pay >= c.tad - 0.5 ? "in full" : c.pay <= c.mad + 0.5 ? "minimum" : "part";
      steps.push({ key: `pay:${c.card.id}:${c.ym}`, date, kind: "pay-card", title: `Pay ${c.card.name} ${fmtInr(c.pay)} (${kindLabel})`, detail: `Due ${fmtDate(c.due)}. Total ${fmtInr(c.tad)} · minimum ${fmtInr(c.mad)}. Pay from ${name(c.card.accountId)}.`, amount: c.pay, cardId: c.card.id, accountId: c.card.accountId, ym: c.ym, late: late(date) });
    } });
  }
  if (rotation && rotation.amount > 0.5) {
    const payDay = cards.find(c => c.card.id === rotation!.card.id);
    const date = addDays(payDay ? (firstIncome && firstIncome <= payDay.due ? firstIncome : t) : t, 1);
    const target = loanDues[0]?.loan.accountId ?? rotation.card.accountId;
    evs.push({ date: new Date(Math.max(date.getTime(), t.getTime())), order: 2, run: () => {
      give(target, rotation!.amount);
      steps.push({ key: `draw:${rotation!.card.id}:${ymKey(date)}`, date: new Date(Math.max(date.getTime(), t.getTime())), kind: "card-draw", title: `Draw ${fmtInr(rotation!.amount)} from ${rotation!.card.name} to ${name(target)}`, detail: `Use a card-to-bank / rent-payment app. Fee ≈ ${fmtInr(rotation!.fee)} (${drawFeePct(rotation!.card)}%${rotation!.card.drawFeeIncludesGst ? "" : " + GST"}). Pay this back in full with next month's bill.`, amount: rotation!.amount, cardId: rotation!.card.id, toId: target, cost: rotation!.fee, late: false });
    } });
  }
  for (const d of loanDues) {
    evs.push({ date: d.date, order: 3, run: () => {
      ensure(d.loan.accountId, d.loan.emi, d.date, d.loan.name);
      const short = d.loan.emi - (bal.get(d.loan.accountId) ?? 0);
      take(d.loan.accountId, d.loan.emi);
      steps.push({ key: `emi:${d.loan.id}:${d.ym}`, date: d.date, kind: "emi", title: `${/emi$/i.test(d.loan.name.trim()) ? d.loan.name : d.loan.name + " EMI"} ${fmtInr(d.loan.emi)} auto-debits`, detail: `From ${name(d.loan.accountId)}.${short > 0.5 ? "" : " Covered."}`, amount: d.loan.emi, loanId: d.loan.id, accountId: d.loan.accountId, ym: d.ym, late: false });
      if (short > 0.5) steps.push({ key: `warn:${d.loan.id}:${d.ym}`, date: addDays(d.date, -3), kind: "warn", title: `${fmtInr(short)} missing for ${d.loan.name}: risk of bounce`, detail: "Call the lender now: ask for a few days' extension or to move the EMI date. Avoid instant-loan apps. See cheaper options below.", amount: short, loanId: d.loan.id, late: false });
    } });
  }
  evs.sort((a, b) => a.date.getTime() - b.date.getTime() || a.order - b.order).forEach(e => e.run());
  steps.sort((a, b) => a.date.getTime() - b.date.getTime() || order(a.kind) - order(b.kind));

  const cost = (rotation?.fee ?? 0) + (carry?.interest ?? 0);
  const leftover = Math.max(0, available + (rotation?.amount ?? 0) - loanDue - cards.reduce((s, c) => s + c.pay, 0));
  return { start: t, end, cashNow, incomeIn, available, loanDue, cardFull, cardMin, needed, mode, rotation, carry, shortfall, cost, leftover, steps, options, cards };
}
const order = (k: StepKind) => ({ income: 0, transfer: 1, "pay-card": 2, "card-draw": 3, warn: 4, emi: 5 }[k]);

// ─── 12-month glide path ────────────────────────────────────────────────────
export interface GlideMonth { ym: string; income: number; outgo: number; rotation: number; fee: number; short: number; events: string[] }
export interface Glide { months: GlideMonth[]; fitsFrom: string | null; totalFees: number; peakRotation: number }

/** Months left on a loan at its current EMI (reducing balance). */
export function monthsLeft(l: Pick<Loan, "outstanding" | "ratePct" | "emi">): number {
  if (l.outstanding <= 0 || l.emi <= 0) return 0;
  const r = l.ratePct / 1200;
  if (r === 0) return Math.ceil(l.outstanding / l.emi);
  const x = 1 - (r * l.outstanding) / l.emi;
  if (x <= 0) return 999;
  return Math.ceil(-Math.log(x) / Math.log(1 + r));
}

export function glidePath(state: MoneyState, opts: { extraNow?: number; extraMonthly?: number; extraMonths?: number; today?: Date } = {}): Glide {
  const today = opts.today ?? new Date();
  const cf = cashFlow(state);
  const income = cf.income;
  const spends = cf.essentials + cf.discretionary;
  const card0 = state.cards[0];
  const feeRate = card0 ? drawFeeRate(card0) : (DEFAULT_DRAW_FEE / 100) * (1 + GST);
  const capacity = state.cards.reduce((s, c) => s + Math.max(0, estimateStatement(c, today).available), 0);
  // Card balances that are not this month's spends or EMIs: they must be paid off (or rotated) too.
  let carryIn = state.cards.reduce((s, c) => {
    const p = nextPayment(c, today);
    const est = estimateStatement(c, today);
    const emiBilled = est.emiLines.reduce((x, l) => x + l.row.billed, 0);
    return s + Math.max(0, p.tad - p.paidSoFar - c.unbilled - (p.source === "estimate" ? emiBilled : 0));
  }, 0) + (opts.extraNow ?? 0);
  const startYm = ymOf(today);
  const months: GlideMonth[] = [];
  const closed = new Set<string>();
  for (let m = 0; m < 12; m++) {
    const ym = ymAdd(startYm, m);
    const events: string[] = [];
    let loanEmi = 0;
    for (const l of state.loans) {
      const left = monthsLeft(l);
      if (m < left) loanEmi += l.emi;
      else if (!closed.has(l.id) && l.outstanding > 0) { closed.add(l.id); events.push(`${l.name} closes · +${fmtInr(l.emi)}/mo free`); }
    }
    let cardEmi = 0;
    for (const c of state.cards) for (const e of c.emis) {
      const row = emiRowFor(e, ym);
      if (row) { cardEmi += row.billed; if (row.k === e.tenure) events.push(`${e.label} (card EMI) ends`); }
    }
    const extra = opts.extraMonthly && m < (opts.extraMonths ?? 0) ? opts.extraMonthly : 0;
    const outgo = loanEmi + cardEmi + spends + carryIn + extra;
    const need = Math.max(0, outgo - income);
    const rotation = Math.min(need, capacity / (1 + feeRate));
    const fee = rotation * feeRate;
    const short = need - rotation;
    months.push({ ym, income, outgo, rotation, fee, short, events });
    carryIn = rotation + fee; // drawn money + fee sits on next month's card bill
  }
  let fitsFrom: string | null = null;
  for (let i = months.length - 1; i >= 0; i--) { if (months[i].rotation > 0.5 || months[i].short > 0.5) break; fitsFrom = months[i].ym; }
  return { months, fitsFrom, totalFees: months.reduce((s, x) => s + x.fee, 0), peakRotation: Math.max(0, ...months.map(x => x.rotation)) };
}

// ─── Purchase check ─────────────────────────────────────────────────────────
export type PayMode = "cash" | "card" | "card-emi";
export interface PurchaseVerdict { level: "safe" | "tight" | "out"; headline: string; lines: string[]; before: Glide; after: Glide; planBefore: PayPlan; planAfter: PayPlan }

export function checkPurchase(state: MoneyState, amount: number, mode: PayMode, emiMonths = 6, emiRate = 16, today = new Date()): PurchaseVerdict {
  const planBefore = buildPayPlan(state, { today });
  const before = glidePath(state, { today });
  let planAfter: PayPlan, after: Glide;
  if (mode === "cash") {
    planAfter = buildPayPlan(state, { extraCash: amount, today });
    after = glidePath(state, { extraNow: amount, today });
  } else if (mode === "card") {
    const s2 = cloneWithCardSpend(state, amount);
    planAfter = buildPayPlan(s2, { today });
    after = glidePath(state, { extraNow: amount, today });
  } else {
    const inst = emiAmount(amount, emiRate, emiMonths) * 1.03;
    planAfter = planBefore;
    after = glidePath(state, { extraMonthly: inst, extraMonths: emiMonths, today });
  }
  const cf = cashFlow(state);
  const extraFees = after.totalFees - before.totalFees;
  const lines: string[] = [];
  let level: PurchaseVerdict["level"] = "safe";
  const monthlyFree = Math.max(0, cf.surplus);
  if (mode === "card-emi") {
    const inst = emiAmount(amount, emiRate, emiMonths);
    lines.push(`Adds about ${fmtInr(inst)} a month for ${emiMonths} months (+ GST on interest and any processing fee).`);
    if (inst > monthlyFree) level = "out"; else if (inst > monthlyFree * 0.5) level = "tight";
  } else {
    if (amount > planBefore.leftover && planBefore.mode === "clear") level = amount > planBefore.leftover + monthlyFree ? "out" : "tight";
    if (planBefore.mode !== "clear") level = "out";
    if (planAfter.mode !== planBefore.mode && planAfter.mode !== "clear") level = "out";
  }
  if (extraFees > 1) lines.push(`Card fees over the next year rise by about ${fmtInr(extraFees)}.`);
  if (after.fitsFrom !== before.fitsFrom) lines.push(after.fitsFrom ? `Your payments fit your income from ${monthName(after.fitsFrom)} instead of ${before.fitsFrom ? monthName(before.fitsFrom) : "now"}.` : `Your payments would no longer fit your income within 12 months.`);
  if (planAfter.shortfall > planBefore.shortfall + 1) lines.push(`This month you'd be ${fmtInr(planAfter.shortfall)} short: an EMI could bounce.`);
  if (planBefore.mode !== "clear") lines.push("You're already covering this month with a card draw or carry. Any new spend adds to that cost.");
  if (!lines.length) lines.push(level === "safe" ? "It fits inside this month's spare money. Your EMIs and card dues stay covered." : "It uses most of your spare money for this month.");
  const headline = level === "safe" ? "Safe: you can afford it" : level === "tight" ? "Tight: it eats your buffer" : "Out of your safe zone";
  return { level, headline, lines, before, after, planBefore, planAfter };
}

function cloneWithCardSpend(state: MoneyState, amount: number): MoneyState {
  if (!state.cards.length) return state;
  const [first, ...rest] = state.cards;
  return { ...state, cards: [{ ...first, unbilled: first.unbilled + amount }, ...rest] };
}

// ─── Applying plan steps to the data ────────────────────────────────────────
export function applyDraw(state: MoneyState, step: PlanStep, uidFn: () => string): MoneyState {
  if (!step.cardId) return state;
  const card = state.cards.find(c => c.id === step.cardId)!;
  const tx: CardCashOut = { id: uidFn(), date: new Date().toISOString(), amount: step.amount, method: "app", feePct: drawFeePct(card), feeIncludesGst: !!card.drawFeeIncludesGst, note: "Moved to bank to cover EMIs (Lifeline plan)" };
  return {
    ...state,
    cards: state.cards.map(c => (c.id === card.id ? { ...c, cashOuts: [...c.cashOuts, tx] } : c)),
    accounts: state.accounts.map(a => (a.id === step.toId ? { ...a, balance: a.balance + step.amount, updatedAt: new Date().toISOString() } : a)),
  };
}
export function applyTransfer(state: MoneyState, step: PlanStep): MoneyState {
  const now = new Date().toISOString();
  return { ...state, accounts: state.accounts.map(a => (a.id === step.fromId ? { ...a, balance: a.balance - step.amount, updatedAt: now } : a.id === step.toId ? { ...a, balance: a.balance + step.amount, updatedAt: now } : a)) };
}
export function applyIncome(state: MoneyState, step: PlanStep): MoneyState {
  return { ...state, accounts: state.accounts.map(a => (a.id === step.accountId ? { ...a, balance: a.balance + step.amount, updatedAt: new Date().toISOString() } : a)) };
}

// ─── helpers ────────────────────────────────────────────────────────────────
/** Respects the app's "hide amounts" privacy mode. */
export const fmtInr = (n: number) => inr(n);
const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const monthName = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
