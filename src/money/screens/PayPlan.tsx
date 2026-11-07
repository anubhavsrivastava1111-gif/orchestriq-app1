// Payment Plan — this month's step-by-step plan, the cheapest way to cover a gap, the next 12 months, and fixes.
import { useMemo } from "react";
import { useApp } from "../context";
import { inr, loansOf } from "../engine";
import { buildPayPlan, glidePath, monthName, monthsLeft } from "../payplan";
import { emiAmount } from "../cards";
import { RIGHTS } from "../rights";
import type { LetterKind } from "../letters";
import { Button, Card, Disclosure, Empty, MeterBar, Pill, Section } from "../components";
import { Icon } from "../icons";
import { StepRow } from "../planUi";

export default function PayPlan() {
  const { state, go, open } = useApp();
  const plan = useMemo(() => buildPayPlan(state), [state]);
  const glide = useMemo(() => glidePath(state), [state]);
  const nothing = !state.loans.length && !state.cards.length;
  if (nothing) return <Empty icon="calendar" title="Nothing to plan yet" text="Add your loans and credit cards. Lifeline then plans every payment for you." action={<Button variant="primary" onClick={() => open({ kind: "quick-add" })}>Add</Button>} />;

  const status = plan.mode === "clear" ? { tone: "good", text: "Everything is covered" } : plan.mode === "rotate" ? { tone: "warn", text: `Covered with a card draw · costs ${inr(plan.cost)}` } : plan.mode === "carry" ? { tone: "warn", text: `Covered by paying part of the card · costs ~${inr(plan.cost)}` } : { tone: "danger", text: `${inr(plan.shortfall)} short: act now` };
  const fixes = buildFixes(state, plan, glide);

  return (
    <div className="screen">
      <div className="screen-head">
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => go("home")}><Icon name="back" /></button>
        <div className="screen-titles" style={{ flex: 1 }}><h1>Payment plan</h1><p>{plan.start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} to {plan.end.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · this pay cycle</p></div>
      </div>

      <div className={"hero" + (plan.mode === "short" ? " hero-alert" : "")}>
        <div className="hero-top"><span>This cycle</span><Pill tone={status.tone as "good"}>{status.text}</Pill></div>
        <div className="plan-flow">
          <div><small>Money in</small><b>{inr(plan.available)}</b><span>bank {inr(plan.cashNow)} + income {inr(plan.incomeIn)}</span></div>
          <Icon name="arrowRight" />
          <div><small>To pay</small><b>{inr(plan.needed)}</b><span>EMIs {inr(plan.loanDue)} + cards {inr(plan.cardFull)}</span></div>
        </div>
        {plan.mode === "clear" && <p className="hero-sub">{inr(plan.leftover)} left after every payment.</p>}
        {plan.mode !== "clear" && <p className="hero-sub">Gap {inr(Math.max(0, plan.needed - plan.available))}. The steps below cover it the cheapest way and keep every EMI and card minimum safe.</p>}
      </div>

      <Section title="Step by step" hint="Tap the button when each step is done. Balances and the plan update instantly.">
        {plan.steps.length === 0 ? <Card><p>Nothing due in this cycle.</p></Card> : <div className="steps">{plan.steps.map(s => <StepRow key={s.key} step={s} />)}</div>}
      </Section>

      {plan.options.length > 0 && (
        <Section title="Ways to cover the gap, compared" hint="Monthly cost of each option for this cycle.">
          {plan.options.map(o => (
            <Card key={o.id} className={"opt" + (o.best ? " best" : "") + (o.feasible ? "" : " off")}>
              <div className="opt-head"><b>{o.title}</b><span>{inr(o.cost)}{o.best ? <Pill tone="good">Cheapest</Pill> : !o.feasible ? <Pill>Not enough room</Pill> : null}</span></div>
              <p>{o.note}</p>
            </Card>
          ))}
        </Section>
      )}

      <Section title="Next 12 months" hint={glide.fitsFrom ? `Your payments fit your income from ${monthName(glide.fitsFrom)}.` : "At today's EMIs, payments don't fit your income within 12 months. The fixes below change that."}>
        <Card>
          <div className="glide-head"><div><small>Card fees over 12 months</small><b className={glide.totalFees > 0 ? "neg" : "pos"}>{inr(glide.totalFees)}</b></div><div><small>Biggest monthly draw</small><b>{inr(glide.peakRotation)}</b></div></div>
          <div className="glide">
            {glide.months.map(m => (
              <div key={m.ym} className="glide-row">
                <span className="g-month">{monthName(m.ym).replace(" 20", " '")}</span>
                <div className="g-bar"><MeterBar value={Math.min(m.outgo, m.income * 1.6)} max={m.income * 1.6 || 1} cls={m.rotation > 0.5 || m.short > 0.5 ? "fill-danger" : "fill-good"} /><i style={{ left: `${(1 / 1.6) * 100}%` }} /></div>
                <span className={"g-val" + (m.rotation > 0.5 ? " neg" : "")}>{m.short > 0.5 ? `short ${inr(m.short)}` : m.rotation > 0.5 ? `draw ${inr(m.rotation)}` : "fits"}</span>
                {m.events.length > 0 && <span className="g-event">{m.events.join(" · ")}</span>}
              </div>
            ))}
          </div>
          <p className="note">Bar = what goes out vs income (the line). Red months need money drawn from a card; it's repaid with the next bill, plus fees.</p>
        </Card>
      </Section>

      {fixes.length > 0 && (
        <Section title="Ways to lighten the load" hint="Ordered by how much they save each month.">
          {fixes.map(f => (
            <Card key={f.id}>
              <div className="opt-head"><b>{f.title}</b>{f.saves > 0 && <span className="impact">saves ~{inr(f.saves)}/mo</span>}</div>
              <p>{f.detail}</p>
              <div className="btn-row wrap">
                {f.letter && <Button size="sm" icon="doc" onClick={() => open({ kind: "letter", letter: f.letter, loanId: f.loanId })}>Draft the email</Button>}
                {f.go && <Button size="sm" onClick={() => go(f.go!.tab as "earn", f.go!.sub)}>{f.go.label}</Button>}
              </div>
            </Card>
          ))}
        </Section>
      )}

      <Section title="Your rights (RBI rules)">
        {RIGHTS.slice(0, 5).map(r => (
          <Disclosure key={r.id} summary={<b>{r.title}</b>}>
            <p>{r.rule}</p><p><b>Use it:</b> {r.use}</p><small className="note">{r.source}</small>
            {r.letter && <Button size="sm" icon="doc" onClick={() => open({ kind: "letter", letter: r.letter })}>Draft the email</Button>}
          </Disclosure>
        ))}
        <Button size="sm" variant="ghost" onClick={() => go("more")}>All rights and help →</Button>
      </Section>
      <p className="note">Card draws and part-payments are short-term bridges. They cost money every month. The aim is to reach a month where payments fit your income.</p>
    </div>
  );
}

interface Fix { id: string; title: string; detail: string; saves: number; letter?: LetterKind; loanId?: string; go?: { tab: string; sub?: string; label: string } }

function buildFixes(state: ReturnType<typeof useApp>["state"], plan: ReturnType<typeof buildPayPlan>, glide: ReturnType<typeof glidePath>): Fix[] {
  const out: Fix[] = [];
  const rot = glide.peakRotation;
  const monthlyFee = glide.totalFees / 12;
  if (rot > 1000 && state.cards.length) {
    const emi12 = emiAmount(rot, 16, 12) * 1.03;
    const interestPerMonth = rot * 0.16 / 12 * 1.18;
    const card = state.cards[0];
    out.push({ id: "card-emi", title: `Convert ${inr(rot)} of card dues to a 12-month EMI`, letter: "card-to-emi", loanId: "card:" + card.id,
      detail: `Instead of drawing it back every month (≈${inr(monthlyFee)}/month in fees, growing), pay about ${inr(emi12)}/month that actually clears it in a year. Interest ≈ ${inr(interestPerMonth)}/month at ~16%.`, saves: Math.max(0, monthlyFee - interestPerMonth) });
  }
  const loans = [...state.loans].filter(l => l.outstanding > 0).sort((a, b) => b.emi - a.emi);
  const big = loans[0];
  if (big && plan.mode !== "clear") {
    const left = monthsLeft(big);
    const newEmi = emiAmount(big.outstanding, big.ratePct, Math.min(left + 24, 84));
    if (newEmi < big.emi - 500) out.push({ id: "tenure", title: `Ask ${big.lender || "the lender"} to extend ${big.name} by 2 years`, letter: big.type === "home" ? "rate-reset" : "restructure", loanId: big.id,
      detail: `EMI could fall from ${inr(big.emi)} to about ${inr(newEmi)}. You pay more interest overall, but no more monthly card fees or bounce risk.`, saves: big.emi - newEmi });
  }
  const salaryDay = state.incomes.find(i => i.kind === "salary" && i.day)?.day;
  if (salaryDay) {
    const clash = loansOf(state).filter(l => l.dueDay < salaryDay || l.dueDay - salaryDay > 10);
    if (clash.length) {
      const c = clash[0];
      out.push({ id: "dates", title: `Move ${c.name}'s due date to just after salary`, letter: c.cardId ? "card-billing-cycle" : "date-change", loanId: c.id,
        detail: `Salary arrives on day ${salaryDay}, but ${clash.map(x => `${x.name} (day ${x.dueDay})`).join(", ")} ${clash.length > 1 ? "fall" : "falls"} at the wrong time. Lenders and card issuers can change this. For cards it's your right under RBI rules.`, saves: 0 });
    }
  }
  const smallest = [...loans].sort((a, b) => a.outstanding - b.outstanding)[0];
  if (smallest && smallest.outstanding < smallest.emi * 6 && loans.length > 1) out.push({ id: "snowball", title: `Close ${smallest.name} early`, go: { tab: "insights", sub: "debt", label: "Debt-free plan" },
    detail: `Only ${inr(smallest.outstanding)} left. Clearing it frees ${inr(smallest.emi)} every month for the bigger loans.`, saves: smallest.emi });
  if (plan.mode !== "clear") out.push({ id: "earn", title: "Bring in a little extra each month", go: { tab: "earn", sub: "earn", label: "Ways to earn" },
    detail: `Even ${inr(Math.max(0, plan.needed - plan.available) / 2)} a month extra halves the gap and the card fees.`, saves: 0 });
  return out.sort((a, b) => b.saves - a.saves);
}
