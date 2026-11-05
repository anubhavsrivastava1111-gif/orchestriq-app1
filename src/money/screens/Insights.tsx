// Insights — cash flow, action plan, debt-free plan.
import { useMemo, useState } from "react";
import { useApp, type Tab } from "../context";
import { cashFlow, debtFreeDate, inr, insights, monthly, simulatePayoff, type Insight } from "../engine";
import { payoffDebts } from "../cards";
import { EXPENSE_LABEL, INCOME_LABEL, type ExpenseCategory } from "../types";
import { Button, Card, Disclosure, Empty, List, MeterBar, Pill, Row, Screen, Section, Segmented, Slider, StackBar } from "../components";
import { Icon } from "../icons";
import { EXPENSE_ICON } from "../labels";

type Sub = "overview" | "plan" | "debt";

export default function Insights() {
  const { sub, go } = useApp();
  const view: Sub = (["overview", "plan", "debt"] as Sub[]).includes(sub as Sub) ? (sub as Sub) : "overview";
  return (
    <Screen title="Insights" subtitle="Where money goes and how to keep more of it">
      <Segmented label="Insights view" value={view} onChange={v => go("insights", v)} options={[
        { value: "overview", label: "Cash flow" }, { value: "plan", label: "Plan" }, { value: "debt", label: "Debt-free" },
      ]} />
      {view === "overview" && <Overview />}
      {view === "plan" && <Plan />}
      {view === "debt" && <DebtFree />}
    </Screen>
  );
}

function Overview() {
  const { state, open } = useApp();
  const cf = useMemo(() => cashFlow(state), [state]);
  const foir = Math.round(cf.foir * 100);
  const foirTone = foir > 50 ? "danger" : foir > 40 ? "warn" : "good";
  const expenses = [...state.expenses].sort((a, b) => monthly(b.amount, b.freq) - monthly(a.amount, a.freq));
  return (
    <>
      <Card>
        <div className="kpi-row">
          <div><small>Money in</small><b className="pos">{inr(cf.income)}</b></div>
          <div><small>Money out</small><b>{inr(cf.emi + cf.essentials + cf.discretionary)}</b></div>
          <div><small>{cf.surplus < 0 ? "Monthly gap" : "Left over"}</small><b className={cf.surplus < 0 ? "neg" : "pos"}>{inr(cf.surplus)}</b></div>
        </div>
        <StackBar parts={[
          { label: "EMIs", value: cf.emi, cls: "c-emi" },
          { label: "Essentials", value: cf.essentials, cls: "c-ess" },
          { label: "Non-essentials", value: cf.discretionary, cls: "c-non" },
          { label: cf.surplus < 0 ? "Gap (borrowed/overdrawn)" : "Left over", value: Math.abs(cf.surplus), cls: cf.surplus < 0 ? "c-gap" : "c-left" },
        ]} />
      </Card>

      <Card>
        <div className="foir">
          <div><b>EMIs take {foir}% of your income</b><p>Banks call this FOIR. Below 40% is healthy. Above 50%, lenders see you as over-borrowed.</p></div>
          <Pill tone={foirTone}>{foir > 50 ? "Too high" : foir > 40 ? "Watch" : "Healthy"}</Pill>
        </div>
        <div className="foir-meter"><span className={"fill-" + foirTone} style={{ width: Math.min(100, foir) + "%" }} /><i style={{ left: "40%" }} /><i style={{ left: "50%" }} /></div>
      </Card>

      <Section title="Money in" action={<Button size="sm" icon="plus" onClick={() => open({ kind: "income" })}>Add</Button>}>
        {state.incomes.length === 0 ? <Empty icon="income" title="No income added" text="Add salary and any side income." /> : (
          <List>
            {state.incomes.map(i => (
              <Row key={i.id} icon="income" iconTone="good" title={i.source} subtitle={`${INCOME_LABEL[i.kind]} · ${i.freq}${i.day ? ` · arrives day ${i.day}` : ""}`}
                value={inr(i.amount)} valueTone="pos" onClick={() => open({ kind: "income", item: i })} />
            ))}
          </List>
        )}
      </Section>

      <Section title="Money out by category">
        {cf.bySpend.length === 0 ? (
          <Empty icon="spend" title="No spends added" text="Add your regular monthly spends in one go." action={<Button variant="primary" size="sm" onClick={() => open({ kind: "quick-spends" })}>Add monthly spends</Button>} />
        ) : (
          <Card>
            {cf.bySpend.map(s => (
              <div key={s.label} className="cat-bar">
                <div className="cat-bar-head">
                  <span><Icon name={EXPENSE_ICON[s.label as ExpenseCategory] ?? "info"} size={16} /> {EXPENSE_LABEL[s.label as ExpenseCategory] ?? s.label}</span>
                  <b>{inr(s.value)}</b>
                </div>
                <MeterBar value={s.value} max={cf.bySpend[0].value} cls={s.essential ? "fill-ess" : "fill-non"} />
              </div>
            ))}
          </Card>
        )}
      </Section>

      {expenses.length > 0 && (
        <Section title="All spends" action={<Button size="sm" icon="plus" onClick={() => open({ kind: "expense" })}>Add</Button>}>
          <List>
            {expenses.map(e => (
              <Row key={e.id} icon={EXPENSE_ICON[e.category]} iconTone={e.essential ? "" : "warn"} title={e.name}
                subtitle={`${EXPENSE_LABEL[e.category]} · ${e.freq} · ${e.essential ? "essential" : "can cut"}`}
                value={inr(e.amount)} onClick={() => open({ kind: "expense", item: e })} />
            ))}
          </List>
        </Section>
      )}
    </>
  );
}

const SEV: Record<Insight["severity"], { label: string; tone: "danger" | "warn" | "brand" | "neutral"; icon: string }> = {
  urgent: { label: "Urgent", tone: "danger", icon: "alert" },
  high: { label: "High impact", tone: "warn", icon: "sparkle" },
  medium: { label: "Worth doing", tone: "brand", icon: "scissors" },
  tip: { label: "Quick tip", tone: "neutral", icon: "info" },
};

function Plan() {
  const { state, go, open } = useApp();
  const all = useMemo(() => insights(state), [state]);
  const potential = all.filter(i => i.severity !== "urgent").reduce((s, i) => s + (i.monthlyImpact || 0), 0);
  if (!all.length) return <Empty icon="sparkle" title="Nothing to fix right now" text="Add your EMIs, income and spends for personalised ideas." />;
  return (
    <>
      {potential > 0 && (
        <div className="potential">
          <Icon name="sparkle" size={22} />
          <div><small>Potential monthly savings</small><b>{inr(potential)}</b></div>
          <span>{inr(potential * 12)}/yr</span>
        </div>
      )}
      {all.map((i, n) => {
        const sev = SEV[i.severity];
        const letter = i.id === "align-dates" ? "date-change" : i.id === "foir" ? "restructure" : null;
        return (
          <Card key={i.id} className="insight">
            <div className="insight-top">
              <span className={"action-icon " + sev.tone}><Icon name={sev.icon} /></span>
              <Pill tone={sev.tone === "neutral" ? "neutral" : sev.tone}>{n + 1}. {sev.label}</Pill>
              {i.monthlyImpact ? <span className="impact">~{inr(i.monthlyImpact)}/mo</span> : null}
            </div>
            <h3>{i.title}</h3>
            <Disclosure summary={<span>Why and how</span>}><p>{i.detail}</p></Disclosure>
            {(i.action?.tab || letter) && (
              <div className="btn-row">
                {i.action?.tab && <Button size="sm" variant="primary" onClick={() => go((i.action!.tab === "save" ? "insights" : i.action!.tab) as Tab, i.action!.tab === "save" ? "debt" : i.id === "invest-vs-debt" ? "invest" : i.id === "deficit" ? "earn" : i.id.startsWith("card-") ? "cards" : undefined)}>{i.action.label}</Button>}
                {letter && <Button size="sm" icon="doc" onClick={() => open({ kind: "letter", letter })}>Draft the letter</Button>}
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

function DebtFree() {
  const { state, open } = useApp();
  const cf = cashFlow(state);
  const [extra, setExtra] = useState(() => Math.max(0, Math.round(Math.min(Math.max(cf.surplus, 0), 10000) / 500) * 500));
  const [strategy, setStrategy] = useState<"avalanche" | "snowball">("avalanche");
  const debts = useMemo(() => [...state.loans, ...payoffDebts(state)], [state]);  
  const base = useMemo(() => simulatePayoff(debts, 0, "avalanche", false), [debts]);
  const plan = useMemo(() => simulatePayoff(debts, extra, strategy), [debts, extra, strategy]);
  if (!debts.some(l => l.outstanding > 0)) return <Empty icon="card" title="Add how much you still owe" text="Open each loan in Bills → Loans and fill “Amount still owed” to see your debt-free date." action={<Button size="sm" onClick={() => open({ kind: "loan", item: state.loans[0] })} disabled={!state.loans.length}>Edit a loan</Button>} />;
  const yrs = (m: number) => (m >= 12 ? `${Math.floor(m / 12)} yr ${m % 12} mo` : `${m} mo`);
  const when = (m: number) => debtFreeDate(m).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  const savedI = Math.max(0, base.totalInterest - plan.totalInterest);
  const savedM = Math.max(0, base.months - plan.months);
  return (
    <>
      <div className="hero hero-calm">
        <div className="hero-top"><span>Debt-free by</span><Pill tone="good">{strategy === "avalanche" ? "Highest interest first" : "Smallest loan first"}</Pill></div>
        <div className="hero-amount">{plan.capped ? "Not on track" : when(plan.months)}</div>
        <p className="hero-sub">{plan.capped ? "At least one payment is lower than its interest, so the balance never falls." : `${yrs(plan.months)} from now · ${inr(plan.totalInterest)} total interest`}</p>
        {!plan.capped && (savedI > 0 || savedM > 0) && <div className="hero-stats"><div><small>Interest saved</small><b>{inr(savedI)}</b></div><div><small>Time saved</small><b>{yrs(savedM)}</b></div></div>}
      </div>

      <Card>
        <label className="slider-label" htmlFor="extra">Extra I'll pay each month <b>{inr(extra)}</b></label>
        <Slider id="extra" value={extra} min={0} max={30000} step={500} onChange={setExtra} />
        <div className="slider-scale"><span>₹0</span><span>₹30,000</span></div>
        <Segmented label="Strategy" value={strategy} onChange={setStrategy} options={[{ value: "avalanche", label: "Highest interest first" }, { value: "snowball", label: "Smallest loan first" }]} />
        <p className="note">{strategy === "avalanche" ? "Saves the most money. Recommended." : "Clears small loans fast for a sense of progress. Costs a little more."} When a loan closes, its EMI goes to the next one automatically.</p>
      </Card>

      <Section title="Order to clear">
        <ol className="timeline">
          {plan.cleared.map((c, i) => (
            <li key={c.name + i}><span className="tl-dot">{i + 1}</span><div><b>{c.name}</b><small>Closed by {when(c.month)}</small></div></li>
          ))}
        </ol>
      </Section>

      <Section title="Compare">
        <div className="compare">
          <div><small>Only EMIs</small><b>{base.capped ? "Never" : yrs(base.months)}</b><span>{inr(base.totalInterest)} interest</span></div>
          <div className="best"><small>Your plan</small><b>{plan.capped ? "Never" : yrs(plan.months)}</b><span>{inr(plan.totalInterest)} interest</span></div>
        </div>
      </Section>
    </>
  );
}
