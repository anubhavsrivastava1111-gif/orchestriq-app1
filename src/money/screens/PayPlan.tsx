// Payment Plan (opened on request, after balances are confirmed): before salary, after salary, then optional detail.
import { useMemo } from "react";
import { useApp } from "../context";
import { inr, loansOf } from "../engine";
import { buildCyclePlan, glidePath, monthName, monthsLeft, type PayPlan } from "../payplan";
import { ago } from "../labels";
import { emiAmount } from "../cards";
import { RIGHTS } from "../rights";
import type { LetterKind } from "../letters";
import { Button, Card, Disclosure, Empty, MeterBar, Pill } from "../components";
import { Icon } from "../icons";
import { StepRow } from "../planUi";

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function statusOf(plan: PayPlan) {
  return plan.mode === "clear" ? { tone: "good" as const, text: "Covered" }
    : plan.mode === "rotate" ? { tone: "warn" as const, text: `Covered with a card draw · ${inr(plan.cost)} fee` }
    : plan.mode === "carry" ? { tone: "warn" as const, text: `Covered by part-paying a card · ~${inr(plan.cost)}` }
    : { tone: "danger" as const, text: `${inr(plan.shortfall)} short` };
}

function Phase({ n, title, plan, inLabel }: { n: number; title: string; plan: PayPlan; inLabel: string }) {
  const st = statusOf(plan);
  const gap = Math.max(0, plan.needed - plan.available);
  return (
    <section className={"phase" + (plan.mode === "short" ? " short" : "")} aria-label={title}>
      <header className="phase-head">
        <span className="phase-n">{n}</span>
        <div><b>{title}</b><small>{fmt(plan.start)} to {fmt(plan.end)}</small></div>
        <Pill tone={st.tone}>{st.text}</Pill>
      </header>
      <div className="phase-flow">
        <div><small>Money you'll have</small><b>{inr(plan.available)}</b><span>{inLabel}{plan.incomeIn > 0 ? ` + income ${inr(plan.incomeIn)}` : ""}</span></div>
        <Icon name="arrowRight" />
        <div><small>To pay</small><b>{inr(plan.needed)}</b><span>{plan.loanDue > 0 ? `EMIs ${inr(plan.loanDue)}` : "No EMIs"}{plan.cardFull > 0 ? ` · cards ${inr(plan.cardFull)}` : ""}</span></div>
      </div>
      {plan.mode === "clear"
        ? <p className="phase-note good">{plan.steps.length ? `All covered. ${inr(plan.leftover)} spare after these payments.` : "Nothing is due in this period."}</p>
        : <p className="phase-note">Gap of {inr(gap)}. The steps below cover it the cheapest way and keep every EMI and card minimum safe.</p>}
      {plan.steps.length > 0 && <div className="steps">{plan.steps.map(s => <StepRow key={s.key} step={s} />)}</div>}
      {plan.options.length > 0 && (
        <Disclosure summary={<b>Ways to cover the gap, compared</b>}>
          {plan.options.map(o => (
            <div key={o.id} className={"opt" + (o.best ? " best" : "") + (o.feasible ? "" : " off")}>
              <div className="opt-head"><b>{o.title}</b><span>{inr(o.cost)}{o.best ? <Pill tone="good">Cheapest</Pill> : !o.feasible ? <Pill>Not enough room</Pill> : null}</span></div>
              <p>{o.note}</p>
            </div>
          ))}
        </Disclosure>
      )}
    </section>
  );
}

export default function PayPlan() {
  const { state, go, open } = useApp();
  const cycle = useMemo(() => buildCyclePlan(state), [state]);
  const glide = useMemo(() => glidePath(state), [state]);
  const nothing = !state.loans.length && !state.cards.length;
  if (nothing) return <Empty icon="calendar" title="Nothing to plan yet" text="Add your loans and credit cards. Lifeline then plans every payment for you." action={<Button variant="primary" onClick={() => open({ kind: "quick-add" })}>Add</Button>} />;

  const { before, after, nextSalary } = cycle;
  const bank = state.accounts.reduce((s, a) => s + a.balance, 0);
  const kept = state.accounts.reduce((s, a) => s + a.minBalance, 0);
  const worst = [before, after].filter((p): p is PayPlan => !!p).some(p => p.mode === "short") ? "danger" : [before, after].some(p => p && p.mode !== "clear") ? "warn" : "good";
  const fixes = buildFixes(state, after && after.mode !== "clear" ? after : before, glide);
  const oldest = cycle.asOf;

  return (
    <div className="screen">
      <div className="screen-head">
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => go("home")}><Icon name="back" /></button>
        <div className="screen-titles" style={{ flex: 1 }}><h1>Your payment plan</h1><p>Step 2 of 2 · {nextSalary ? `until ${fmt(after?.end ?? nextSalary)}` : "next 30 days"}</p></div>
      </div>

      <Card className="basis">
        <div className="basis-row">
          <div><small>Starting from your balances</small><b>{inr(bank)}</b><span>{kept > 0 ? `${inr(kept)} kept aside as minimum balance · ` : ""}checked {oldest ? ago(oldest.toISOString()) : "—"}</span></div>
          <Button size="sm" icon="refresh" onClick={() => open({ kind: "plan-start" })}>Change</Button>
        </div>
        {cycle.stale.length > 0 && <p className="hint-warn">{cycle.stale.join(", ")} {cycle.stale.length > 1 ? "were" : "was"} last updated over a day ago. Update to make the plan exact.</p>}
        <div className={"basis-verdict t-" + worst}>
          <Icon name={worst === "good" ? "check" : "alert"} size={18} />
          <span>{worst === "good" ? "Every EMI and card bill is covered." : worst === "warn" ? "Covered, with a small cost. Follow the steps in order." : "Money runs short. Follow the steps and use the fixes below."}</span>
        </div>
      </Card>

      <Phase n={1} title={nextSalary ? "Before your salary" : "Next 30 days"} plan={before} inLabel={`in banks ${inr(before.cashNow)}`} />
      {after && <Phase n={2} title={`After salary on ${fmt(nextSalary!)}`} plan={after} inLabel={`left over ${inr(after.cashNow)}`} />}
      {!nextSalary && <p className="note">Add your salary and pay day (+ → Add income) to see the plan split around pay day.</p>}
      <p className="note center">Tap each step's button when it's done. Balances update and the plan recalculates.</p>

      <Disclosure summary={<span><b>Next 12 months</b> <small>· {glide.fitsFrom ? `payments fit income from ${monthName(glide.fitsFrom)}` : "payments don't fit income yet"}</small></span>}>
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
        <p className="note">Bar = what goes out vs income (the line). Red months need money drawn from a card. It's repaid with the next bill, plus fees.</p>
      </Disclosure>

      {fixes.length > 0 && (
        <Disclosure summary={<span><b>Ways to lighten the load</b> <small>· {fixes.length} idea{fixes.length > 1 ? "s" : ""}</small></span>}>
          {fixes.map(f => (
            <div key={f.id} className="fix">
              <div className="opt-head"><b>{f.title}</b>{f.saves > 0 && <span className="impact">saves ~{inr(f.saves)}/mo</span>}</div>
              <p>{f.detail}</p>
              <div className="btn-row wrap">
                {f.letter && <Button size="sm" icon="doc" onClick={() => open({ kind: "letter", letter: f.letter, loanId: f.loanId })}>Draft the email</Button>}
                {f.go && <Button size="sm" onClick={() => go(f.go!.tab as "earn", f.go!.sub)}>{f.go.label}</Button>}
              </div>
            </div>
          ))}
        </Disclosure>
      )}

      <Disclosure summary={<b>Your rights (RBI rules)</b>}>
        {RIGHTS.slice(0, 5).map(r => (
          <div key={r.id} className="fix">
            <b>{r.title}</b><p>{r.rule}</p><p><b>Use it:</b> {r.use}</p><small className="note">{r.source}</small>
            {r.letter && <Button size="sm" icon="doc" onClick={() => open({ kind: "letter", letter: r.letter })}>Draft the email</Button>}
          </div>
        ))}
      </Disclosure>
      <p className="note">Card draws and part-payments are short-term bridges and cost money every month. The aim is to reach a month where payments fit your income.</p>
    </div>
  );
}

interface Fix { id: string; title: string; detail: string; saves: number; letter?: LetterKind; loanId?: string; go?: { tab: string; sub?: string; label: string } }

function buildFixes(state: ReturnType<typeof useApp>["state"], plan: PayPlan, glide: ReturnType<typeof glidePath>): Fix[] {
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
