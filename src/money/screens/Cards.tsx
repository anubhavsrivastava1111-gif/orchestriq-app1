// Cards — a wallet of your credit cards. Pick a card, see where its bill stands, act in one tap.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { daysBetween, inr } from "../engine";
import { emiRemaining, emiRowFor, emiSchedule, estimateStatement, minimumTrap, nextPayment, nextStatementDate, planAmount } from "../cards";
import { drawFeePct } from "../payplan";
import type { CardEvent, CreditCard } from "../types";
import { Button, Card, Empty, List, MeterBar, Pill, Row, Section, Segmented, StackBar } from "../components";
import { Icon } from "../icons";
import { CardFace } from "../cardFace";

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const monthYear = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const suffix = (n: number) => (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

type View = "bill" | "emis" | "activity" | "details";

/** Where a card's bill stands today, in one line. */
function cardStatus(card: CreditCard, today = new Date()) {
  const p = nextPayment(card, today);
  const days = daysBetween(today, p.date);
  const left = Math.max(0, p.tad - p.paidSoFar);
  const minLeft = Math.max(0, p.mad - p.paidSoFar);
  const ls = card.lastStatement;
  if (p.source === "statement") {
    if (days < 0) return { tone: "danger" as const, label: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, amount: left, minLeft, days, p, billed: true };
    return { tone: days <= 3 ? "warn" as const : "brand" as const, label: days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`, amount: left, minLeft, days, p, billed: true };
  }
  const paidLast = !!ls && ls.paidAmount > 0.5;
  return { tone: "good" as const, label: paidLast ? "Last bill paid" : "No bill pending", amount: p.tad, minLeft: p.mad, days, p, billed: false };
}

export default function Cards() {
  const { state, sub, go, open } = useApp();
  const cards = state.cards;
  const card = cards.find(c => c.id === sub) ?? cards[0];
  const legacy = state.loans.filter(l => l.type === "credit-card");
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rail.current?.querySelector<HTMLElement>(`[data-id="${card?.id}"]`);
    el?.scrollIntoView?.({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [card?.id]);

  if (!cards.length) {
    return (
      <div className="screen">
        <div className="screen-head"><div className="screen-titles"><h1>Credit cards</h1></div></div>
        {legacy.length > 0 && <UpgradeBanner />}
        <Empty icon="card" title="No credit cards yet" text="Add a card once. Lifeline then works out every bill's total and minimum due, card EMIs, fees and GST, and reminds you before each due date."
          action={<Button variant="primary" icon="plus" onClick={() => open({ kind: "card" })}>Add a credit card</Button>} />
      </div>
    );
  }

  const st = cards.map(c => ({ c, s: cardStatus(c) }));
  const toPay = st.filter(x => x.s.billed).reduce((n, x) => n + x.s.amount, 0);
  const nextDue = st.filter(x => x.s.billed && x.s.amount > 0.5).sort((a, b) => a.s.p.date.getTime() - b.s.p.date.getTime())[0];
  const used = cards.reduce((n, c) => n + estimateStatement(c).used, 0);
  const limit = cards.reduce((n, c) => n + c.limit, 0);

  return (
    <div className="screen">
      <div className="screen-head">
        <div className="screen-titles" style={{ flex: 1 }}><h1>Credit cards</h1><p>{cards.length} card{cards.length > 1 ? "s" : ""} · {Math.round((used / (limit || 1)) * 100)}% of limits used</p></div>
        <Button size="sm" variant="primary" icon="plus" onClick={() => open({ kind: "card" })}>Add</Button>
      </div>

      {legacy.length > 0 && <UpgradeBanner />}

      <div className="cards-summary">
        <div><small>Billed, unpaid</small><b>{inr(toPay)}</b></div>
        <div><small>Next due</small><b>{nextDue ? fmt(nextDue.s.p.date) : "Nothing"}</b>{nextDue && <span>{nextDue.c.name}</span>}</div>
        <div><small>Limit used</small><b>{inr(used)}</b><span>of {inr(limit)}</span></div>
      </div>

      <div className="wallet" ref={rail} role="tablist" aria-label="Your cards">
        {st.map(({ c, s }) => (
          <button key={c.id} data-id={c.id} type="button" role="tab" aria-selected={c.id === card.id} className={"wallet-item" + (c.id === card.id ? " on" : "")} onClick={() => go("cards", c.id)}>
            <CardFace card={c} badge={<span className={"cf-badge t-" + s.tone}>{s.billed ? (s.days < 0 ? "Overdue" : `Due ${fmt(s.p.date)}`) : s.label === "Last bill paid" ? "Paid" : "No bill"}</span>} />
          </button>
        ))}
        <button type="button" className="wallet-add" onClick={() => open({ kind: "card" })}><Icon name="plus" size={24} /><span>Add card</span></button>
      </div>
      {cards.length > 1 && <div className="wallet-dots" aria-hidden>{cards.map(c => <i key={c.id} className={c.id === card.id ? "on" : ""} />)}</div>}

      <CardPanel key={card.id} card={card} />
    </div>
  );
}

function UpgradeBanner() {
  const { state, open } = useApp();
  const legacy = state.loans.filter(l => l.type === "credit-card");
  return (
    <Card tone="warn">
      <div className="action">
        <span className="action-icon warn"><Icon name="card" /></span>
        <div className="action-body">
          <b>Upgrade {legacy.length === 1 ? `“${legacy[0].name}”` : `${legacy.length} cards`} to detailed tracking</b>
          <p>Adds card EMIs, fees, GST, card cash and automatic minimum due. Your existing details are carried over.</p>
          <div className="btn-row wrap">{legacy.map(l => <Button key={l.id} size="sm" variant="primary" onClick={() => open({ kind: "card", fromLoan: l })}>Upgrade {l.name}</Button>)}</div>
        </div>
      </div>
    </Card>
  );
}

function CardPanel({ card }: { card: CreditCard }) {
  const { open } = useApp();
  const [view, setView] = useState<View>("bill");
  const s = cardStatus(card);
  const est = estimateStatement(card);
  const stmtDate = s.billed && card.lastStatement ? new Date(card.lastStatement.date) : est.date;

  return (
    <>
      <div className={"card-status t-" + s.tone}>
        <div className="cs-main">
          <Pill tone={s.tone === "brand" ? "brand" : s.tone}>{s.label}</Pill>
          {s.billed ? (
            <>
              <b className="cs-amount">{inr(s.amount)}</b>
              <span className="cs-sub">to pay by {fmt(s.p.date)}{s.p.paidSoFar > 0 ? ` · ${inr(s.p.paidSoFar)} paid already` : ""}</span>
            </>
          ) : (
            <>
              <b className="cs-amount">~{inr(est.tad)}</b>
              <span className="cs-sub">next bill on {fmt(est.date)}, due {fmt(est.due)}</span>
            </>
          )}
        </div>
        <div className="cs-facts">
          <div><small>Minimum</small><b>{inr(s.billed ? s.minLeft : est.mad)}</b></div>
          <div><small>Statement</small><b>{fmt(stmtDate)}</b></div>
          <div><small>Due date</small><b>{fmt(s.billed ? s.p.date : est.due)}</b></div>
        </div>
        {s.tone === "danger" && <p className="cs-warn">Pay at least the minimum today. Up to 3 days past due isn't reported late; after that, a late fee and a credit-report mark apply.</p>}
      </div>

      <div className="card-actions">
        <button type="button" className="ca-btn primary" onClick={() => open({ kind: "card-pay", cardId: card.id })}><Icon name="check" /><span>Pay</span></button>
        <button type="button" className="ca-btn" onClick={() => open({ kind: "card-statement", cardId: card.id })}><Icon name="doc" /><span>Enter bill</span></button>
        <button type="button" className="ca-btn" onClick={() => open({ kind: "card-emi", cardId: card.id })}><Icon name="calendar" /><span>Add EMI</span></button>
        <button type="button" className="ca-btn" onClick={() => open({ kind: "card-cash", cardId: card.id })}><Icon name="transfer" /><span>Card cash</span></button>
      </div>

      <Segmented label="Card view" value={view} onChange={setView} options={[
        { value: "bill", label: "Bill" }, { value: "emis", label: `EMIs${card.emis.length ? ` · ${card.emis.length}` : ""}` }, { value: "activity", label: "Activity" }, { value: "details", label: "Details" },
      ]} />
      {view === "bill" && <BillView card={card} />}
      {view === "emis" && <EmisView card={card} />}
      {view === "activity" && <ActivityView card={card} />}
      {view === "details" && <DetailsView card={card} />}
    </>
  );
}

// ─── Bill ───────────────────────────────────────────────────────────────────
function BillView({ card }: { card: CreditCard }) {
  const { update } = useApp();
  const s = cardStatus(card);
  const est = estimateStatement(card);
  const pay = s.p;
  const planned = planAmount(card, pay.tad, pay.mad);
  const setCard = (patch: Partial<CreditCard>) => update(st => ({ ...st, cards: st.cards.map(c => (c.id === card.id ? { ...c, ...patch } : c)) }));
  const trap = card.plan === "minimum" && est.nonEmiPrincipal > 1000 ? minimumTrap(card, est.nonEmiPrincipal) : null;
  const today = new Date();
  const stmt = s.billed && card.lastStatement ? new Date(card.lastStatement.date) : est.date;
  const due = s.billed ? pay.date : est.due;
  const span = Math.max(1, daysBetween(stmt, due));
  const pos = Math.max(0, Math.min(100, (daysBetween(stmt, today) / span) * 100));
  const paidFull = s.billed && pay.paidSoFar >= pay.tad - 0.5;

  const parts = [
    { label: "Spends & balance", value: est.carried + est.newSpends + est.cash, cls: "c-ess" },
    { label: "EMI instalments", value: est.emiPrincipal + est.emiInterest + est.procFee, cls: "c-emi" },
    { label: "Interest & fees", value: est.carriedInterest + est.spendInterest + est.cashInterest + est.cashFees + est.lateFee, cls: "c-gap" },
    { label: "GST", value: est.interestGst + est.cashGst + est.emiGst + est.procGst + est.lateGst, cls: "c-non" },
  ];

  return (
    <>
      <Card>
        <div className="bill-timeline" aria-label="Billing cycle">
          <div className="bt-track"><span className="bt-fill" style={{ width: pos + "%" }} />{today >= stmt && today <= due && <i className="bt-today" style={{ left: pos + "%" }} />}</div>
          <div className="bt-labels">
            <div><small>Statement</small><b>{fmt(stmt)}</b></div>
            <div className="bt-mid"><small>Today</small><b>{fmt(today)}</b></div>
            <div className="bt-end"><small>Due</small><b className={s.tone === "danger" ? "neg" : ""}>{fmt(due)}</b></div>
          </div>
        </div>
        <p className="note">Every month: statement on the {card.statementDay}{suffix(card.statementDay)}, due on the {card.dueDay}{suffix(card.dueDay)}. Reminders come on statement day and 3 days before the due date.</p>
      </Card>

      <Card>
        <div className="field"><label>I'll pay</label>
          <Segmented label="Payment plan" value={card.plan} onChange={v => setCard({ plan: v })} options={[{ value: "full", label: "Full amount" }, { value: "minimum", label: "Minimum" }, { value: "custom", label: "Fixed ₹" }]} />
        </div>
        {card.plan === "custom" && (
          <div className="key-input" style={{ marginTop: 10 }}>
            <input className="input" inputMode="numeric" aria-label="Fixed monthly payment" value={String(card.customPay || "")} onChange={e => setCard({ customPay: Number(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="Amount each month" />
          </div>
        )}
        <div className="plan-line"><span>{paidFull ? "This bill is paid" : `Keep ready by ${fmt(pay.date)}`}</span><b>{inr(Math.max(0, planned - pay.paidSoFar))}</b></div>
        {card.plan !== "full" && <p className="hint-warn">The unpaid {inr(Math.max(0, pay.tad - planned))} attracts {card.monthlyRatePct}%/month + GST, and new spends lose the interest-free period.{trap ? ` Paying only the minimum: ~${inr(trap.nextMonthInterest)} interest next month, and ${trap.capped ? "it never clears" : `${Math.floor(trap.months / 12)} yr ${trap.months % 12} mo to clear`}.` : ""}</p>}
      </Card>

      {est.tad > 0.5 && (
        <Section title={`Next bill · ${fmt(est.date)}`} hint={`Estimate: ${inr(est.tad)} total, ${inr(est.mad)} minimum, due ${fmt(est.due)}.`}>
          <Card>
            <StackBar parts={parts} />
            <div className="breakdown">
              {est.lines.map(l => <div key={l.label} className={"bd-row bd-" + l.kind}><span>{l.label}</span><b>{inr(l.amount)}</b></div>)}
              <div className="bd-row bd-total"><span>Total due</span><b>{inr(est.tad)}</b></div>
              <div className="bd-row bd-min"><span>Minimum due</span><b>{inr(est.mad)}</b></div>
            </div>
            <p className="note">Minimum = {card.minPct}% of balance (at least {inr(card.minFloor)}) + full EMI instalments + interest, fees and GST. Got the bank's statement? Tap “Enter bill” for exact figures.</p>
          </Card>
        </Section>
      )}
    </>
  );
}

// ─── EMIs ───────────────────────────────────────────────────────────────────
function EmisView({ card }: { card: CreditCard }) {
  const { open } = useApp();
  const ym = estimateStatement(card).ym;
  const emis = card.emis.map(e => {
    const rows = emiSchedule(e);
    const row = emiRowFor(e, ym);
    const future = rows.filter(r => r.ym >= ym);
    const paid = rows.length - future.length;
    return { e, row, paid, left: emiRemaining(e, ym) + (row?.principal ?? 0), interestLeft: future.reduce((s, r) => s + r.interest + r.gst, 0), endYm: rows[rows.length - 1].ym, done: future.length === 0 };
  });
  const active = emis.filter(x => !x.done);
  const monthly = active.reduce((s, x) => s + (x.row?.billed ?? 0), 0);
  const lastEnd = active.map(x => x.endYm).sort().pop();

  if (!emis.length) {
    return <Empty icon="calendar" title="No EMIs on this card" text="Converted a purchase or the balance to EMI? Add the amount, rate, months and processing fee. Lifeline works out every instalment, the GST and the payoff date."
      action={<Button variant="primary" icon="plus" onClick={() => open({ kind: "card-emi", cardId: card.id })}>Add EMI</Button>} />;
  }
  return (
    <>
      <div className="cards-summary">
        <div><small>Each month</small><b>{inr(monthly)}</b></div>
        <div><small>Still owed</small><b>{inr(active.reduce((s, x) => s + x.left, 0))}</b><span>+ {inr(active.reduce((s, x) => s + x.interestLeft, 0))} interest</span></div>
        <div><small>All end by</small><b>{lastEnd ? monthYear(lastEnd) : "Done"}</b></div>
      </div>
      {emis.map(x => (
        <Card key={x.e.id} className="emi-card" onClick={() => open({ kind: "card-emi-detail", cardId: card.id, emiId: x.e.id })}>
          <div className="emi-top">
            <b>{x.e.label}</b>
            {x.done ? <Pill tone="good">Paid off</Pill> : <span className="emi-amt">{inr(x.row?.billed ?? 0)}<small>/mo</small></span>}
          </div>
          <MeterBar value={x.done ? x.e.tenure : x.paid} max={x.e.tenure} cls="fill-good" />
          <div className="emi-meta">
            <span>{x.done ? `${x.e.tenure} of ${x.e.tenure} paid` : `${x.paid} of ${x.e.tenure} paid · ends ${monthYear(x.endYm)}`}</span>
            {!x.done && <span>Left {inr(x.left)} + {inr(x.interestLeft)} interest</span>}
          </div>
          <small className="emi-terms">{inr(x.e.principal)} at {x.e.ratePct}% for {x.e.tenure} months · fee {inr(x.e.processingFee)} + GST</small>
        </Card>
      ))}
      <Button full icon="plus" onClick={() => open({ kind: "card-emi", cardId: card.id })}>Add another EMI</Button>
    </>
  );
}

// ─── Activity ───────────────────────────────────────────────────────────────
const EV: Record<CardEvent["kind"], { icon: string; tone: "good" | "brand" | "warn" }> = {
  payment: { icon: "check", tone: "good" }, statement: { icon: "doc", tone: "brand" }, cash: { icon: "transfer", tone: "warn" }, emi: { icon: "calendar", tone: "brand" },
};
function ActivityView({ card }: { card: CreditCard }) {
  const { open } = useApp();
  const hist = card.history ?? [];
  return (
    <>
      {card.cashOuts.length > 0 && (
        <Section title="Card cash on the next bill" hint={`ATM cash or card-to-bank transfers (your fee: ${drawFeePct(card)}%). Tap to edit.`}>
          <List>
            {card.cashOuts.map(c => (
              <Row key={c.id} icon={c.method === "atm" ? "bank" : "transfer"} iconTone="warn" title={c.note || (c.method === "atm" ? "ATM withdrawal" : "Card to bank")}
                subtitle={`${fmt(new Date(c.date))} · fee ${c.feePct}%`} value={inr(c.amount)} onClick={() => open({ kind: "card-cash", cardId: card.id, item: c })} />
            ))}
          </List>
        </Section>
      )}
      <Section title="History">
        {hist.length === 0 ? <p className="muted">Payments, statements and card cash appear here as you record them.</p> : (
          <List>
            {hist.map((h, i) => (
              <Row key={h.date + i} icon={EV[h.kind].icon} iconTone={EV[h.kind].tone} title={h.label} subtitle={new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                value={(h.kind === "payment" ? "−" : "") + inr(h.amount)} valueTone={h.kind === "payment" ? "pos" : undefined} />
            ))}
          </List>
        )}
      </Section>
    </>
  );
}

// ─── Details ────────────────────────────────────────────────────────────────
function DetailsView({ card }: { card: CreditCard }) {
  const { state, open, update, toast, go } = useApp();
  const est = estimateStatement(card);
  const acct = state.accounts.find(a => a.id === card.accountId);
  const del = () => {
    if (!confirm(`Delete ${card.name} and its EMIs?`)) return;
    update(s => ({ ...s, cards: s.cards.filter(c => c.id !== card.id) })); toast("Card deleted"); go("cards");
  };
  const terms: [string, string][] = [
    ["Bill paid from", acct?.name ?? "Not set"],
    ["Statement day", `${card.statementDay}${suffix(card.statementDay)} of each month`],
    ["Due day", `${card.dueDay}${suffix(card.dueDay)} · next statement ${fmt(nextStatementDate(card))}`],
    ["Interest", `${card.monthlyRatePct}% a month (${(card.monthlyRatePct * 12).toFixed(1)}% a year) + GST`],
    ["Minimum due", `${card.minPct}% of balance, at least ${inr(card.minFloor)}`],
    ["Late fee", inr(card.lateFee)],
    ["ATM cash fee", `${card.atmFeePct}% (at least ${inr(card.atmMinFee)}) + GST`],
    ["Card-to-bank fee", `${drawFeePct(card)}%${card.drawFeeIncludesGst ? " incl. GST" : " + GST"}`],
  ];
  return (
    <>
      <Card>
        <div className="cat-bar-head"><span>Limit used</span><b>{inr(est.used)} of {inr(card.limit)}</b></div>
        <MeterBar value={est.used} max={card.limit} cls={est.utilization > 0.7 ? "fill-danger" : est.utilization > 0.3 ? "fill-warn" : "fill-good"} />
        <p className="note">{inr(est.available)} free once this bill is paid as planned.{est.utilization > 0.3 ? " Keeping usage under 30% helps your credit score." : ""}</p>
      </Card>
      <Card>
        <div className="terms">{terms.map(([k, v]) => <div key={k} className="bd-row"><span>{k}</span><b>{v}</b></div>)}</div>
      </Card>
      <div className="btn-row">
        <Button icon="edit" onClick={() => open({ kind: "card", item: card })}>Edit card</Button>
        <Button variant="danger" icon="trash" onClick={del}>Delete</Button>
      </div>
    </>
  );
}
