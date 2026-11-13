// Lifeline — turns bank messages into updates: balances, card bills, EMIs paid, and plan steps done.
//
// Each message only changes the thing it is about, so nothing is counted twice:
//   • a bank-account message sets that account's balance ("Avl Bal"), or adds / subtracts the amount;
//   • a credit-card message changes that card (new spend, payment received, statement);
//   • an EMI debit marks the matching loan paid for that month (the balance already moved with the message).
// Messages older than the last balance you entered don't change the balance again.
import type { CardCashOut, CreditCard, MoneyState, PlanMark, Txn } from "./types";
import { parseSms, bankName, type ParsedSms } from "./sms";
import { applyPayment, dueAfter, lastStatementDate, logCard, ymOf } from "./cards";
import { buildCyclePlan, drawFeePct, type PlanStep } from "./payplan";
import { dueDateIn, inrRaw } from "./engine";
import { uid } from "./store";

export interface RawSms { from: string; body: string; ts: number }
export interface IngestResult { state: MoneyState; added: Txn[]; review: number; skipped: number; dupes: number }

const MAX_TXNS = 2000;
const day = 86400000;

/** Reads a batch of messages (oldest first) and applies each one. */
export function ingestMessages(state: MoneyState, msgs: RawSms[], source: Txn["source"] = "sms", now = new Date()): IngestResult {
  let s = state;
  const added: Txn[] = [];
  let skipped = 0, dupes = 0;
  const steps = openSteps(state, now);
  for (const m of [...msgs].sort((a, b) => a.ts - b.ts)) {
    const p = parseSms(m.body, m.from);
    if (!p) { skipped++; continue; }
    const txn: Txn = {
      id: uid(), date: new Date(m.ts).toISOString(), amount: p.amount, dir: p.dir, kind: p.kind, party: p.party,
      last4: p.last4, balanceAfter: p.balanceAfter, ref: p.ref, bank: bankName(m.from, m.body), text: m.body.slice(0, 400),
      status: "review", source, stmt: p.stmt && { tad: p.stmt.tad, mad: p.stmt.mad, due: p.stmt.due },
    };
    if (isDuplicate([...s.txns, ...added], txn)) { dupes++; continue; }
    const target = findTarget(s, p, txn.bank ?? "");
    if (target.learn) {
      // Remember the digits so the next message matches directly.
      s = { ...s,
        accounts: s.accounts.map(a => (a.id === target.accountId ? { ...a, last4: target.learn } : a)),
        cards: s.cards.map(c => (c.id === target.cardId ? { ...c, last4: target.learn } : c)) };
    }
    const r = applyTxn(s, txn, target, p, steps);
    s = r.state;
    added.push(r.txn);
  }
  if (!added.length) return { state, added, review: 0, skipped, dupes };
  s = pairTransfers({ ...s, txns: [...added.slice().reverse(), ...s.txns].slice(0, MAX_TXNS) }, steps);
  return { state: s, added, review: added.filter(t => t.status === "review").length, skipped, dupes };
}

/** The user tells Lifeline which account / card a message belongs to. Optionally remembers the digits. */
export function linkTxn(state: MoneyState, txnId: string, target: { accountId?: string; cardId?: string }, remember: boolean, now = new Date()): MoneyState {
  const txn = state.txns.find(t => t.id === txnId);
  if (!txn) return state;
  let s = state;
  if (remember && txn.last4) {
    s = { ...s,
      accounts: s.accounts.map(a => (a.id === target.accountId ? { ...a, last4: txn.last4 } : a)),
      cards: s.cards.map(c => (c.id === target.cardId ? { ...c, last4: txn.last4 } : c)) };
  }
  const p = parseSms(txn.text, txn.bank ?? "") ?? fromTxn(txn);
  const r = applyTxn(s, { ...txn }, target, { ...p, isCard: !!target.cardId, kind: target.cardId && p.kind === "spend" ? "card-spend" : !target.cardId && p.kind === "card-spend" ? "spend" : p.kind }, openSteps(state, now));
  s = { ...r.state, txns: r.state.txns.map(t => (t.id === txnId ? r.txn : t)) };
  // Other waiting messages with the same digits now match too.
  if (remember && txn.last4) {
    for (const other of s.txns.filter(t => t.status === "review" && t.last4 === txn.last4 && t.id !== txnId)) s = linkTxn(s, other.id, target, false, now);
  }
  return s;
}

export function ignoreTxn(state: MoneyState, txnId: string): MoneyState {
  return { ...state, txns: state.txns.map(t => (t.id === txnId ? { ...t, status: "ignored" as const, note: "Ignored. Nothing was changed." } : t)) };
}

// ─── internals ──────────────────────────────────────────────────────────────
function fromTxn(t: Txn): ParsedSms {
  return { amount: t.amount, dir: t.dir, kind: t.kind, party: t.party, last4: t.last4, isCard: !!t.cardId, balanceAfter: t.balanceAfter, ref: t.ref, stmt: t.stmt };
}

function openSteps(state: MoneyState, now: Date): PlanStep[] {
  if (!state.loans.length && !state.cards.length) return [];
  try {
    const cp = buildCyclePlan(state, now);
    return [...cp.before.steps, ...(cp.after?.steps ?? [])].filter(st => !state.planLog[st.key]);
  } catch { return []; }
}

function isDuplicate(list: Txn[], t: Txn): boolean {
  const ts = new Date(t.date).getTime();
  return list.some(o => {
    const dt = Math.abs(new Date(o.date).getTime() - ts);
    if (o.text === t.text && dt < 10 * 60000) return true;
    if (t.ref && o.ref === t.ref && o.amount === t.amount && o.dir === t.dir) return true;
    return o.amount === t.amount && o.dir === t.dir && o.kind === t.kind && o.last4 === t.last4 && dt < 3 * 60000;
  });
}

function findTarget(s: MoneyState, p: ParsedSms, bank: string): { accountId?: string; cardId?: string; learn?: string } {
  if (p.last4) {
    const card = s.cards.find(c => c.last4 && c.last4 === p.last4);
    const acct = s.accounts.find(a => a.last4 && a.last4 === p.last4);
    if (p.isCard && card) return { cardId: card.id };
    if (acct) return { accountId: acct.id };
    if (card) return { cardId: card.id };
    // New digits: if exactly one account (or card) at this bank has no digits saved yet, it's that one.
    const short = bank.split(" ")[0].toLowerCase();
    if (!short || short === "bank") return {};
    if (p.isCard) {
      const cs = s.cards.filter(c => !c.last4 && `${c.bank} ${c.name}`.toLowerCase().includes(short));
      return cs.length === 1 && s.cards.filter(c => `${c.bank} ${c.name}`.toLowerCase().includes(short)).length === 1 ? { cardId: cs[0].id, learn: p.last4 } : {};
    }
    const all = s.accounts.filter(a => a.name.toLowerCase().includes(short));
    return all.length === 1 && !all[0].last4 ? { accountId: all[0].id, learn: p.last4 } : {};
  }
  // No digits in the message: match by bank name only when exactly one account / card is with that bank.
  const short = bank.split(" ")[0].toLowerCase();
  if (!short || short === "bank") return {};
  if (p.isCard) {
    const cs = s.cards.filter(c => `${c.bank} ${c.name}`.toLowerCase().includes(short));
    return cs.length === 1 ? { cardId: cs[0].id } : {};
  }
  const as = s.accounts.filter(a => a.name.toLowerCase().includes(short));
  return as.length === 1 ? { accountId: as[0].id } : {};
}

const keyMark = (st: PlanStep, amount: number, auto: boolean): PlanMark => ({ status: "done", amount, at: new Date().toISOString(), auto, title: st.title, planned: st.amount });

function applyTxn(state: MoneyState, txn: Txn, target0: { accountId?: string; cardId?: string }, p: ParsedSms, steps: PlanStep[]): { state: MoneyState; txn: Txn } {
  let s = state;
  let target = target0;
  const t = new Date(txn.date);
  const mark = (st: PlanStep | undefined, amount: number) => {
    if (!st || s.planLog[st.key]) return;
    s = { ...s, planLog: { ...s.planLog, [st.key]: keyMark(st, amount, true) } };
    txn.note = (txn.note ? txn.note + " " : "") + "Plan step marked done.";
  };

  if (txn.kind === "statement" && !target.cardId) target = {};

  // ─── Bank account ───
  if (target.accountId) {
    const acct = s.accounts.find(a => a.id === target.accountId);
    if (!acct) return { state: s, txn };
    txn.accountId = acct.id; txn.cardId = undefined; txn.status = "applied";
    if (txn.kind === "card-spend") txn.kind = "spend";
    const newer = t.getTime() >= new Date(acct.updatedAt).getTime() - 60000;
    if (newer && txn.dir !== "info") {
      const bal = p.balanceAfter !== undefined && !Number.isNaN(p.balanceAfter) ? p.balanceAfter : acct.balance + (txn.dir === "credit" ? txn.amount : -txn.amount);
      s = { ...s, accounts: s.accounts.map(a => (a.id === acct.id ? { ...a, balance: Math.round(bal * 100) / 100, updatedAt: t.toISOString(), balanceSource: "sms" as const } : a)) };
      txn.note = p.balanceAfter !== undefined ? `${acct.name} balance set to ${inrRaw(bal)} from the message.` : `${acct.name} balance ${txn.dir === "credit" ? "+" : "−"}${inrRaw(txn.amount)}.`;
    } else {
      txn.note = `Older than your last balance update for ${acct.name}, so the balance was left as it is.`;
    }
    if (txn.dir === "debit") {
      // EMI auto-debit: mark the matching loan paid for that month.
      const loan = s.loans.filter(l => !l.cardId && (l.accountId === acct.id || txn.kind === "emi"))
        .find(l => Math.abs(l.emi - txn.amount) <= Math.max(5, l.emi * 0.01) && (txn.kind === "emi" || l.accountId === acct.id));
      if (loan) {
        const ym = nearestDueYm(loan.dueDay, t);
        txn.kind = "emi"; txn.loanId = loan.id; txn.party = txn.party && txn.party !== txn.bank ? txn.party : loan.name;
        if (!loan.paidMonths.includes(ym)) {
          s = { ...s, loans: s.loans.map(l => (l.id === loan.id ? { ...l, paidMonths: [...new Set([...l.paidMonths, ym])] } : l)) };
          txn.note += ` ${loan.name} marked paid for ${monthLabel(ym)}.`;
        }
        mark(steps.find(st => st.kind === "emi" && st.loanId === loan.id && st.ym === ym), txn.amount);
      } else if (txn.kind === "emi") txn.note += " Looks like an EMI, but no loan has this amount. Check your loan list.";
    } else if (txn.dir === "credit" && (txn.kind === "salary" || txn.kind === "received")) {
      mark(steps.find(st => st.kind === "income" && st.accountId === acct.id && txn.amount >= st.amount * 0.65 && txn.amount <= st.amount * 1.35), txn.amount);
    }
    return { state: s, txn };
  }

  // ─── Credit card ───
  if (target.cardId) {
    const card = s.cards.find(c => c.id === target.cardId);
    if (!card) return { state: s, txn };
    txn.cardId = card.id; txn.accountId = undefined; txn.status = "applied";
    const setCard = (c: CreditCard) => { s = { ...s, cards: s.cards.map(x => (x.id === c.id ? c : x)) }; };
    if (txn.kind === "statement" && txn.stmt) {
      const stmtDate = lastStatementDate(card, t);
      const ls0 = card.lastStatement;
      if (ls0 && !ls0.estimated && ymOf(stmtDate) <= ls0.ym) {
        txn.note = `${card.name} already has this statement, so nothing changed.`;
        return { state: s, txn };
      }
      const due = txn.stmt.due ? new Date(txn.stmt.due) : dueAfter(card, stmtDate);
      const tad = txn.stmt.tad;
      const mad = Number.isNaN(txn.stmt.mad) || !(txn.stmt.mad >= 0) ? Math.min(tad, Math.max(card.minFloor, tad * card.minPct / 100)) : Math.min(txn.stmt.mad, tad);
      const ym = ymOf(stmtDate);
      const prevPaid = card.lastStatement && card.lastStatement.ym === ym ? card.lastStatement.paidAmount : 0;
      const since = s.txns.filter(x => x.cardId === card.id && x.status === "applied" && new Date(x.date) > stmtDate);
      const unbilled = since.length ? Math.max(0, since.reduce((n, x) => n + (x.kind === "card-spend" ? x.amount : x.kind === "refund" ? -x.amount : 0), 0)) : card.lastStatement?.ym === ym ? card.unbilled : 0;
      setCard(logCard({ ...card, cycleYm: ym, revolving: 0, unbilled, cashOuts: card.cashOuts.filter(x => new Date(x.date) > stmtDate),
        lastStatement: { ym, date: stmtDate.toISOString(), due: due.toISOString(), tad, mad, paidAmount: prevPaid, estimated: false } },
        { kind: "statement", label: "Statement (from bank message)", amount: tad, date: stmtDate.toISOString() }));
      txn.note = `${card.name} bill saved: ${inrRaw(tad)} total, ${inrRaw(mad)} minimum, due ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`;
      return { state: s, txn };
    }
    if (card.syncedAt && t.getTime() < new Date(card.syncedAt).getTime() - 60000) {
      txn.note = `Older than your last update of ${card.name}, so its bill wasn't changed.`;
      if (txn.kind !== "card-payment" && txn.dir === "debit") txn.kind = txn.kind === "atm" ? "atm" : "card-spend";
      if (txn.dir === "credit" && txn.kind !== "refund") txn.kind = "card-payment";
      return { state: s, txn };
    }
    if (txn.kind === "card-payment" || (txn.dir === "credit" && txn.kind !== "refund")) {
      txn.kind = "card-payment";
      setCard(applyPayment(card, txn.amount, t));
      txn.note = `Payment of ${inrRaw(txn.amount)} recorded on ${card.name}.`;
      mark(steps.find(st => st.kind === "pay-card" && st.cardId === card.id), txn.amount);
      return { state: s, txn };
    }
    if (txn.kind === "refund") {
      setCard({ ...card, unbilled: Math.max(0, card.unbilled - txn.amount) });
      txn.note = `Refund of ${inrRaw(txn.amount)} taken off ${card.name}'s next bill.`;
      return { state: s, txn };
    }
    // Spend (or card cash)
    txn.kind = txn.kind === "atm" ? "atm" : "card-spend";
    const lastStmt = lastStatementDate(card, new Date(Math.max(t.getTime(), Date.now())));
    if (t < lastStmt && (card.lastStatement?.ym === ymOf(lastStmt))) {
      txn.note = `Already part of ${card.name}'s statement of ${lastStmt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, so the bill wasn't changed.`;
      return { state: s, txn };
    }
    const draw = steps.find(st => st.kind === "card-draw" && st.cardId === card.id && txn.amount >= st.amount * 0.85 && txn.amount <= st.amount * 1.2);
    if (draw || txn.kind === "atm") {
      const cash: CardCashOut = { id: uid(), date: txn.date, amount: txn.amount, method: txn.kind === "atm" ? "atm" : "app", feePct: txn.kind === "atm" ? card.atmFeePct : drawFeePct(card), feeIncludesGst: !!card.drawFeeIncludesGst, note: txn.party || "Card to bank" };
      setCard(logCard({ ...card, cashOuts: [...card.cashOuts, cash] }, { kind: "cash", label: draw ? "Moved to bank (plan step)" : "ATM cash", amount: txn.amount, date: txn.date }));
      txn.note = `Recorded as card cash on ${card.name}. Its fee is added to the next bill.`;
      mark(draw, txn.amount);
      return { state: s, txn };
    }
    setCard({ ...card, unbilled: card.unbilled + txn.amount });
    txn.note = `Added to ${card.name}'s next bill.`;
    return { state: s, txn };
  }

  txn.status = txn.dir === "info" && !txn.stmt ? "ignored" : "review";
  txn.note = txn.last4 ? `Which of your accounts or cards ends in ${txn.last4}? Link it once and Lifeline remembers.` : "This message doesn't say which account it is. Link it to one.";
  return { state: s, txn };
}

/** Marks money moved between your own accounts as a transfer (not spending or income). */
function pairTransfers(s: MoneyState, steps: PlanStep[]): MoneyState {
  const recent = s.txns.filter(t => t.status === "applied" && t.accountId && Date.now() - new Date(t.date).getTime() < 40 * day);
  let txns = s.txns;
  let planLog = s.planLog;
  for (const d of recent.filter(t => t.dir === "debit" && t.kind !== "transfer" && t.kind !== "emi")) {
    const toAcct = d.text && s.accounts.find(a => a.id !== d.accountId && a.last4 && new RegExp(`(to|credited to)\\s+(?:a\\/?c\\s*)?[x*]*${a.last4}\\b`, "i").test(d.text));
    const c = recent.find(t => t.dir === "credit" && t.accountId !== d.accountId && t.amount === d.amount && t.kind !== "transfer" && Math.abs(new Date(t.date).getTime() - new Date(d.date).getTime()) < 2 * day && (!toAcct || t.accountId === toAcct.id));
    const toId = c?.accountId ?? (toAcct ? toAcct.id : undefined);
    if (!toId) continue;
    const from = s.accounts.find(a => a.id === d.accountId)!, to = s.accounts.find(a => a.id === toId)!;
    txns = txns.map(t => (t.id === d.id ? { ...t, kind: "transfer" as const, party: `To ${to.name}` } : c && t.id === c.id ? { ...t, kind: "transfer" as const, party: `From ${from.name}` } : t));
    const st = steps.find(x => x.kind === "transfer" && x.fromId === from.id && x.toId === to.id && !planLog[x.key]);
    if (st) planLog = { ...planLog, [st.key]: keyMark(st, d.amount, true) };
  }
  return { ...s, txns, planLog };
}

function nearestDueYm(dueDay: number, t: Date): string {
  let best = "", bestD = Infinity;
  for (const k of [-1, 0, 1]) {
    const d = dueDateIn({ dueDay }, t.getFullYear(), t.getMonth() + k);
    const dist = Math.abs(d.getTime() - t.getTime());
    if (dist < bestD) { bestD = dist; best = ymOf(d); }
  }
  return best;
}
const monthLabel = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });

// ─── Summaries for the Activity screen ──────────────────────────────────────
export interface MonthSummary { spent: number; received: number; cash: number; card: number; emi: number; count: number }
export function monthSummary(txns: Txn[], ym: string): MonthSummary {
  const out: MonthSummary = { spent: 0, received: 0, cash: 0, card: 0, emi: 0, count: 0 };
  for (const t of txns) {
    if (t.status === "ignored" || ymOf(new Date(t.date)) !== ym) continue;
    out.count++;
    if (t.kind === "transfer" || t.kind === "statement" || t.kind === "card-payment") continue;
    if (t.kind === "atm") out.cash += t.amount;
    else if (t.kind === "card-spend") out.card += t.amount;
    else if (t.kind === "emi") out.emi += t.amount;
    else if (t.dir === "debit") out.spent += t.amount;
    else if (t.dir === "credit") out.received += t.amount;
  }
  return out;
}
