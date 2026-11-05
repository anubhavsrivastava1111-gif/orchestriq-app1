// One credit card in detail: next bill (estimated), EMIs on the card, card cash, and settings.
import { useState } from "react";
import { useApp } from "../context";
import { inr } from "../engine";
import { cashCost, emiRemaining, emiRowFor, estimateStatement, minimumTrap, nextPayment, planAmount, ymOf } from "../cards";
import type { CreditCard } from "../types";
import { Button, Card, Empty, Field, List, MoneyInput, Pill, Row, Section, Segmented } from "../components";
import { Icon } from "../icons";

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function CardDetail() {
  const { state, sub, go } = useApp();
  const card = state.cards.find(c => c.id === sub);
  if (!card) {
    return <Empty icon="card" title="Card not found" action={<Button onClick={() => go("bills", "cards")}>Back to cards</Button>} />;
  }
  return <CardView card={card} />;
}

function CardView({ card }: { card: CreditCard }) {
  const { update, open, go } = useApp();
  const est = estimateStatement(card);
  const pay = nextPayment(card);
  const trap = minimumTrap(card, est.nonEmiPrincipal);
  const pct = Math.min(100, Math.round(est.utilization * 100));
  const setCard = (patch: Partial<CreditCard>) => update(s => ({ ...s, cards: s.cards.map(c => (c.id === card.id ? { ...c, ...patch } : c)) }));
  const ym = est.ym;

  return (
    <div className="screen">
      <div className="screen-head">
        <button type="button" className="icon-btn" aria-label="Back to cards" onClick={() => go("bills", "cards")}><Icon name="back" /></button>
        <div className="screen-titles" style={{ flex: 1 }}>
          <h1>{card.name}</h1>
          <p>{card.bank} · statement on {card.statementDay}, due on {card.dueDay}</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Card settings" onClick={() => open({ kind: "card", item: card })}><Icon name="edit" /></button>
      </div>

      <div className="cc cc-big">
        <div className="cc-top"><span className="cc-bank">{card.bank || "Credit card"}</span><span className="cc-chip" aria-hidden /></div>
        <div className="cc-limit"><span>Available {inr(est.available)}</span><span>Limit {inr(card.limit)}</span></div>
        <div className="cc-bar"><span className={pct > 70 ? "hot" : ""} style={{ width: pct + "%" }} /></div>
        <div className="cc-due">
          <div><small>Used</small><b>{inr(est.used)}</b></div>
          <div><small>Usage</small><b>{pct}%</b></div>
          <div><small>Interest</small><b>{card.monthlyRatePct}%/mo</b></div>
        </div>
        {est.overLimit > 0 && <p className="cc-warn">Over limit by {inr(est.overLimit)}. That amount is added to the minimum due.</p>}
      </div>

      {/* ─── Next payment ─── */}
      <Section title={pay.source === "statement" ? "Statement to pay" : "Next bill (estimated)"}
        hint={pay.source === "statement" ? `Generated ${card.lastStatement?.estimated ? "by Lifeline" : "from your statement"}` : `Statement on ${fmt(est.date)} · due ${fmt(est.due)}. Calculated from your card's terms. No statement needed.`}>
        <Card>
          <div className="kpi-row">
            <div><small>Total due</small><b>{inr(pay.tad)}</b></div>
            <div><small>Minimum due</small><b>{inr(pay.mad)}</b></div>
            <div><small>Pay by</small><b>{fmt(pay.date)}</b></div>
          </div>
          <Field label="How will you pay?">{() => (
            <Segmented label="Payment plan" value={card.plan} onChange={v => setCard({ plan: v })} options={[
              { value: "full", label: "In full" }, { value: "minimum", label: "Minimum" }, { value: "custom", label: "Fixed ₹" },
            ]} />
          )}</Field>
          {card.plan === "custom" && (
            <Field label="Amount I'll pay each month">{id => <MoneyInput id={id} value={String(card.customPay || "")} onChange={v => setCard({ customPay: Number(v) || 0 })} />}</Field>
          )}
          <div className="plan-line">
            <span>Lifeline will remind you to keep</span><b>{inr(pay.amount)}</b>
          </div>
          {card.plan !== "full" && pay.tad - planAmount(card, pay.tad, pay.mad) > 1 && (
            <p className="field-error">Anything unpaid ({inr(pay.tad - planAmount(card, pay.tad, pay.mad))}) carries over at {card.monthlyRatePct}%/month + GST, and new spends lose the interest-free period.</p>
          )}
          {card.plan === "custom" && card.customPay < pay.mad && <p className="field-error">This is below the minimum due. That means a late fee of about {inr(card.lateFee * 1.18)} and a late mark on your credit report.</p>}
          <div className="btn-row">
            <Button variant="primary" icon="check" onClick={() => open({ kind: "card-pay", cardId: card.id })}>Record a payment</Button>
          </div>
        </Card>
      </Section>

      {est.lines.length > 0 && (
        <Section title={pay.source === "estimate" ? "How the bill adds up" : "Your next statement (building up)"} hint={pay.source === "estimate" ? undefined : `Statement on ${fmt(est.date)} · due ${fmt(est.due)}. Assumes you pay the statement above as planned.`}>
          <Card>
            <div className="breakdown">
              {est.lines.map(l => (
                <div key={l.label} className={"bd-row bd-" + l.kind}><span>{l.label}</span><b>{inr(l.amount)}</b></div>
              ))}
              <div className="bd-row bd-total"><span>Total due</span><b>{inr(est.tad)}</b></div>
              <div className="bd-row bd-min"><span>Minimum due</span><b>{inr(est.mad)}</b></div>
            </div>
            <p className="note">Minimum = {card.minPct}% of the non-EMI balance (at least {inr(card.minFloor)}) + the full EMI instalments + all interest, fees and GST{est.overLimit > 0 ? " + over-limit amount" : ""}.</p>
          </Card>
        </Section>
      )}

      {est.nonEmiPrincipal > 1000 && (
        <Card tone={card.plan === "minimum" ? "danger" : "warn"}>
          <div className="action">
            <span className={"action-icon " + (card.plan === "minimum" ? "danger" : "warn")}><Icon name="alert" /></span>
            <div className="action-body">
              <b>If you pay only the minimum</b>
              <p>Interest next month: about <b>{inr(trap.nextMonthInterest)}</b>. Clearing {inr(est.nonEmiPrincipal)} would take <b>{trap.capped ? "forever" : `${Math.floor(trap.months / 12)} yr ${trap.months % 12} mo`}</b> and cost about <b>{inr(trap.interest)}</b> in interest + GST.</p>
              <div className="btn-row wrap">
                <Button size="sm" onClick={() => open({ kind: "card-emi", cardId: card.id })}>Convert balance to EMI</Button>
                <Button size="sm" icon="sparkle" onClick={() => go("ai")}>Ask AI for a plan</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ─── EMIs ─── */}
      <Section title="EMIs on this card" action={<Button size="sm" variant="primary" icon="plus" onClick={() => open({ kind: "card-emi", cardId: card.id })}>Add</Button>}>
        {card.emis.length === 0 ? (
          <Empty icon="calendar" title="No EMIs on this card" text="Add purchases or balances you converted to EMI. Lifeline splits each month into principal, interest and GST, and adds the processing fee." />
        ) : (
          <List>
            {card.emis.map(e => {
              const row = emiRowFor(e, ym);
              const k = row ? row.k : 0;
              const left = emiRemaining(e, ym) + (row?.principal ?? 0);
              const done = !row && left < 1;
              return (
                <Row key={e.id} icon="calendar" iconTone={done ? "good" : "brand"} title={e.label}
                  subtitle={done ? "Fully paid" : row ? `Instalment ${k} of ${e.tenure} · ${inr(row.principal)} principal + ${inr(row.interest)} interest + ${inr(row.gst)} GST${row.fee ? ` + fee ${inr(row.fee + row.feeGst)}` : ""}` : `Starts ${e.startYm} · ${inr(left)} principal`}
                  value={row ? inr(row.billed) : "–"} onClick={() => open({ kind: "card-emi-detail", cardId: card.id, emiId: e.id })} />
              );
            })}
          </List>
        )}
      </Section>

      {/* ─── Card cash ─── */}
      <Section title="Cash taken via this card" hint="ATM withdrawals, or paying rent, EMIs or wallets through an app for a fee." action={<Button size="sm" icon="plus" onClick={() => open({ kind: "card-cash", cardId: card.id })}>Add</Button>}>
        {card.cashOuts.length === 0 ? (
          <Card onClick={() => open({ kind: "card-cash", cardId: card.id })}>
            <div className="profile-sum"><span className="action-icon warn"><Icon name="wallet" /></span><div><b>Check the real cost before you do it</b><p>Enter the amount and fee. Lifeline shows the fee, GST, interest and the yearly cost, compared with a personal or gold loan.</p></div><Icon name="chevron" size={18} /></div>
          </Card>
        ) : (
          <List>
            {card.cashOuts.map(c => {
              const k = cashCost(card, c);
              return (
                <Row key={c.id} icon={c.method === "atm" ? "bank" : "transfer"} iconTone="warn" title={c.note || (c.method === "atm" ? "ATM withdrawal" : "Paid via app")}
                  subtitle={`${new Date(c.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · cost ${inr(k.total)} (~${k.annualPct.toFixed(0)}%/yr)`}
                  value={inr(c.amount)} onClick={() => open({ kind: "card-cash", cardId: card.id, item: c })} />
              );
            })}
          </List>
        )}
      </Section>

      <BalanceEditor card={card} onSave={patch => setCard(patch)} />

      <Section title="Card terms Lifeline uses">
        <Card onClick={() => open({ kind: "card", item: card })}>
          <div className="terms">
            <span>Interest <b>{card.monthlyRatePct}%/mo</b></span>
            <span>Minimum <b>{card.minPct}% (≥{inr(card.minFloor)})</b></span>
            <span>ATM fee <b>{card.atmFeePct}% (≥{inr(card.atmMinFee)})</b></span>
            <span>Late fee <b>{inr(card.lateFee)}</b></span>
            <span>GST <b>18%</b></span>
          </div>
          <p className="note">Tap to change. Find these in your card's “Most Important Terms & Conditions” (MITC) on the bank's website.</p>
        </Card>
      </Section>
      <p className="note center">Statement month {ymOf(est.date)} · figures are estimates from your card's terms. Banks calculate interest on daily balances, so small differences are normal.</p>
    </div>
  );
}

function BalanceEditor({ card, onSave }: { card: CreditCard; onSave: (p: Partial<CreditCard>) => void }) {
  const { toast } = useApp();
  const [carried, setCarried] = useState(String(card.revolving));
  const [spends, setSpends] = useState(String(card.unbilled));
  return (
    <Section title="Keep it accurate" hint="Optional: update spends since the last statement from your card app. Lifeline handles everything else.">
      <Card>
        <div className="inline-2">
          <Field label="New spends this cycle">{id => <MoneyInput id={id} value={spends} onChange={setSpends} />}</Field>
          <Field label="Older unpaid balance" hint="Usually 0">{id => <MoneyInput id={id} value={carried} onChange={setCarried} />}</Field>
        </div>
        <Button size="sm" variant="primary" onClick={() => { onSave({ unbilled: Number(spends) || 0, revolving: Number(carried) || 0 }); toast("Card updated. Bill recalculated"); }}>Update</Button>
        {card.lastStatement && (
          <p className="note">Last statement {card.lastStatement.ym}: total {inr(card.lastStatement.tad)}, minimum {inr(card.lastStatement.mad)}, paid {inr(card.lastStatement.paidAmount)} <Pill tone={card.lastStatement.paidAmount >= card.lastStatement.tad - 1 ? "good" : card.lastStatement.paidAmount >= card.lastStatement.mad - 1 ? "warn" : "danger"}>{card.lastStatement.paidAmount >= card.lastStatement.tad - 1 ? "Paid" : card.lastStatement.paidAmount >= card.lastStatement.mad - 1 ? "Part paid" : "Unpaid"}</Pill></p>
        )}
      </Card>
    </Section>
  );
}
