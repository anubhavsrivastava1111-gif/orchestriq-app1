// One credit card, simply: what's due, by when, what's inside the bill, and every EMI's payoff.
import { useApp } from "../context";
import { daysBetween, inr } from "../engine";
import { emiRemaining, emiRowFor, emiSchedule, estimateStatement, minimumTrap, nextPayment, nextStatementDate, planAmount, ymOf } from "../cards";
import { drawFeePct } from "../payplan";
import type { CreditCard } from "../types";
import { Button, Card, Empty, List, MeterBar, Pill, Row, Section, Segmented, StackBar } from "../components";
import { Icon } from "../icons";

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const monthYear = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });

export default function CardDetail() {
  const { state, sub, go } = useApp();
  const card = state.cards.find(c => c.id === sub);
  if (!card) return <Empty icon="card" title="Card not found" action={<Button onClick={() => go("bills", "cards")}>Back to cards</Button>} />;
  return <CardView card={card} />;
}

function CardView({ card }: { card: CreditCard }) {
  const { update, open, go } = useApp();
  const est = estimateStatement(card);
  const pay = nextPayment(card);
  const setCard = (patch: Partial<CreditCard>) => update(s => ({ ...s, cards: s.cards.map(c => (c.id === card.id ? { ...c, ...patch } : c)) }));
  const stmtDate = pay.source === "statement" && card.lastStatement ? new Date(card.lastStatement.date) : est.date;
  const daysLeft = daysBetween(new Date(), pay.date);
  const cycleDays = daysBetween(est.date, est.due);
  const remaining = Math.max(0, pay.tad - pay.paidSoFar);
  const planned = planAmount(card, pay.tad, pay.mad);
  const trap = card.plan === "minimum" && est.nonEmiPrincipal > 1000 ? minimumTrap(card, est.nonEmiPrincipal) : null;
  const sourceLabel = pay.source === "statement" ? (card.lastStatement?.estimated ? "Calculated by Lifeline" : "From your statement") : "Next bill · estimated";
  const ym = est.ym;

  // What's inside the next bill, in four plain groups
  const parts = [
    { label: "Spends & balance", value: est.carried + est.newSpends + est.cash, cls: "c-ess" },
    { label: "EMI instalments", value: est.emiPrincipal + est.emiInterest + est.procFee, cls: "c-emi" },
    { label: "Interest & fees", value: est.carriedInterest + est.spendInterest + est.cashInterest + est.cashFees + est.lateFee, cls: "c-gap" },
    { label: "GST", value: est.interestGst + est.cashGst + est.emiGst + est.procGst + est.lateGst, cls: "c-non" },
  ];

  const emis = card.emis.map(e => {
    const rows = emiSchedule(e);
    const row = emiRowFor(e, ym);
    const k = row ? row.k : Math.max(0, Math.min(e.tenure, Math.round((Number(ym.slice(0, 4)) - Number(e.startYm.slice(0, 4))) * 12 + Number(ym.slice(5)) - Number(e.startYm.slice(5)) + 1)));
    const future = rows.filter(r => r.ym >= ym);
    return { e, row, k, left: emiRemaining(e, ym) + (row?.principal ?? 0), interestLeft: future.reduce((s, r) => s + r.interest + r.gst, 0), endYm: rows[rows.length - 1].ym, done: future.length === 0 };
  });
  const lastEnd = emis.filter(x => !x.done).map(x => x.endYm).sort().pop();

  return (
    <div className="screen">
      <div className="screen-head">
        <button type="button" className="icon-btn" aria-label="Back to cards" onClick={() => go("bills", "cards")}><Icon name="back" /></button>
        <div className="screen-titles" style={{ flex: 1 }}><h1 className="h-small">{card.name}</h1><p>{card.bank}</p></div>
        <button type="button" className="icon-btn" aria-label="Card settings" onClick={() => open({ kind: "card", item: card })}><Icon name="edit" /></button>
      </div>

      {/* ─── The bill ─── */}
      <div className="due-hero">
        <div className="dh-top"><span>{pay.source === "statement" ? (daysLeft < 0 ? "Overdue bill" : "Current bill") : "Next bill"}</span><span className="dh-src">{sourceLabel}</span></div>
        {pay.source === "statement" && daysLeft < 0 && <p className="dh-overdue">Due {fmt(pay.date)}. Pay at least the minimum today. Within 3 days of the due date it isn't reported late; after that, late fees and a credit-report mark apply.</p>}
        <div className="dh-amounts">
          <div><small>Total due</small><b>{inr(remaining)}</b></div>
          <div><small>Minimum due</small><b>{inr(Math.max(0, pay.mad - pay.paidSoFar))}</b></div>
        </div>
        <div className="dh-dates">
          <div><small>Statement</small><b>{fmt(stmtDate)}</b></div>
          <div><small>Pay by</small><b>{fmt(pay.date)}</b></div>
          <div><small>Days left</small><b className={daysLeft <= 3 ? "dh-hot" : ""}>{daysLeft < 0 ? "Overdue" : daysLeft}</b></div>
        </div>
        <p className="dh-cycle">Every month: statement on the {card.statementDay}{suffix(card.statementDay)}, due on the {card.dueDay}{suffix(card.dueDay)} ({cycleDays} days to pay). You'll get reminders on statement day and before the due date.</p>
        {pay.paidSoFar > 0 && <p className="dh-cycle">Already paid {inr(pay.paidSoFar)} this cycle.</p>}
      </div>

      <Card>
        <div className="field"><label>I'll pay</label>
          <Segmented label="Payment plan" value={card.plan} onChange={v => setCard({ plan: v })} options={[{ value: "full", label: "Full amount" }, { value: "minimum", label: "Minimum" }, { value: "custom", label: "Fixed ₹" }]} />
        </div>
        {card.plan === "custom" && (
          <div className="key-input" style={{ marginTop: 10 }}>
            <input className="input" inputMode="numeric" aria-label="Fixed monthly payment" value={String(card.customPay || "")} onChange={e => setCard({ customPay: Number(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="Amount each month" />
          </div>
        )}
        <div className="plan-line"><span>Keep ready by {fmt(pay.date)}</span><b>{inr(Math.max(0, planned - pay.paidSoFar))}</b></div>
        {card.plan !== "full" && <p className="hint-warn">The unpaid {inr(Math.max(0, pay.tad - planned))} attracts {card.monthlyRatePct}%/month + GST, and new spends lose the interest-free period.{trap ? ` Paying only the minimum: ~${inr(trap.nextMonthInterest)} interest next month; clearing it takes ${trap.capped ? "forever" : `${Math.floor(trap.months / 12)} yr ${trap.months % 12} mo`}.` : ""}</p>}
        <div className="btn-row">
          <Button variant="primary" icon="check" onClick={() => open({ kind: "card-pay", cardId: card.id })}>Record payment</Button>
          <Button icon="doc" onClick={() => open({ kind: "card-statement", cardId: card.id })}>Enter statement</Button>
        </div>
      </Card>

      {/* ─── Inside the next bill ─── */}
      {est.tad > 0.5 && (
        <Section title={`Inside the ${pay.source === "statement" ? "next" : ""} bill · ${fmt(est.date)}`.replace("  ", " ")} hint={`Estimate: ${inr(est.tad)} total, ${inr(est.mad)} minimum, due ${fmt(est.due)}.`}>
          <Card>
            <StackBar parts={parts} />
            <details className="disclosure"><summary>Line by line<Icon name="chevron" size={16} /></summary>
              <div className="disclosure-body breakdown">
                {est.lines.map(l => <div key={l.label} className={"bd-row bd-" + l.kind}><span>{l.label}</span><b>{inr(l.amount)}</b></div>)}
                <div className="bd-row bd-total"><span>Total due</span><b>{inr(est.tad)}</b></div>
                <div className="bd-row bd-min"><span>Minimum due</span><b>{inr(est.mad)}</b></div>
                <p className="note">Minimum = {card.minPct}% of balance (at least {inr(card.minFloor)}) + full EMI instalments + interest, fees and GST.</p>
              </div>
            </details>
          </Card>
        </Section>
      )}

      {/* ─── EMIs ─── */}
      <Section title="EMIs on this card" hint={lastEnd ? `All EMIs on this card end by ${monthYear(lastEnd)}.` : undefined} action={<Button size="sm" variant="primary" icon="plus" onClick={() => open({ kind: "card-emi", cardId: card.id })}>Add EMI</Button>}>
        {emis.length === 0 ? (
          <Empty icon="calendar" title="No EMIs on this card" text="Converted a purchase or the balance to EMI? Add it with the amount, rate, months and processing fee. Lifeline then works out every instalment and the payoff date." />
        ) : emis.map(x => (
          <Card key={x.e.id} className="emi-card" onClick={() => open({ kind: "card-emi-detail", cardId: card.id, emiId: x.e.id })}>
            <div className="emi-top">
              <b>{x.e.label}</b>
              {x.done ? <Pill tone="good">Paid off</Pill> : <span className="emi-amt">{inr(x.row?.billed ?? 0)}<small>/mo</small></span>}
            </div>
            <MeterBar value={x.done ? x.e.tenure : Math.max(0, x.k - 1)} max={x.e.tenure} cls="fill-good" />
            <div className="emi-meta">
              <span>{x.done ? `${x.e.tenure} of ${x.e.tenure} paid` : `${Math.max(0, x.k - 1)} of ${x.e.tenure} paid · ends ${monthYear(x.endYm)}`}</span>
              {!x.done && <span>Left: {inr(x.left)} + {inr(x.interestLeft)} interest</span>}
            </div>
            <small className="emi-terms">{inr(x.e.principal)} at {x.e.ratePct}% for {x.e.tenure} months · fee {inr(x.e.processingFee)}</small>
          </Card>
        ))}
      </Section>

      {/* ─── Card cash ─── */}
      <Section title="Money moved out of this card" hint={`ATM cash or card-to-bank transfers (your fee: ${drawFeePct(card)}%). Added to the next bill automatically.`} action={<Button size="sm" icon="plus" onClick={() => open({ kind: "card-cash", cardId: card.id })}>Add</Button>}>
        {card.cashOuts.length > 0 && (
          <List>
            {card.cashOuts.map(c => (
              <Row key={c.id} icon={c.method === "atm" ? "bank" : "transfer"} iconTone="warn" title={c.note || (c.method === "atm" ? "ATM withdrawal" : "Card to bank")}
                subtitle={`${new Date(c.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · fee ${c.feePct}%`} value={inr(c.amount)} onClick={() => open({ kind: "card-cash", cardId: card.id, item: c })} />
            ))}
          </List>
        )}
      </Section>

      {/* ─── Limit ─── */}
      <Card>
        <div className="cat-bar-head"><span>Limit used</span><b>{inr(est.used)} of {inr(card.limit)}</b></div>
        <MeterBar value={est.used} max={card.limit} cls={est.utilization > 0.7 ? "fill-danger" : "fill-brand"} />
        <p className="note">{inr(est.available)} free after this bill is paid as planned.{est.utilization > 0.3 ? " Keeping usage under 30% helps your credit score." : ""}</p>
      </Card>

      <List>
        <Row icon="edit" iconTone="brand" title="Card settings & charges" subtitle={`${card.monthlyRatePct}%/month interest · minimum ${card.minPct}% · next statement ${fmt(nextStatementDate(card))}`} onClick={() => open({ kind: "card", item: card })} />
      </List>
      <p className="note center">Statement month {ymOf(est.date)}. Amounts are calculated from your card's terms. Use “Enter statement” to switch to the bank's exact figures.</p>
    </div>
  );
}

const suffix = (n: number) => (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
