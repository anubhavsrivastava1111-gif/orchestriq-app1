// Home — "Am I safe this month, and what must I do today?"
import { useMemo } from "react";
import { useApp } from "../context";
import { forecast, healthScore, inr, safeToSpend, unassignedLoans, upcomingDues } from "../engine";
import { useMarkPaid } from "../dues";
import { buildPayPlan } from "../payplan";
import { StepRow } from "../planUi";
import { Button, Card, ForecastChart, List, Pill, Ring, Row, Section } from "../components";
import { Icon } from "../icons";
import { demoState } from "../store";
import { isNative, notificationsEnabled } from "../native";

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function Home() {
  const { state, update, open, go, toast, replace } = useApp();
  const plan = useMemo(() => buildPayPlan(state), [state]);
  const sts = useMemo(() => safeToSpend(state), [state]);
  const fc = useMemo(() => forecast(state), [state]);
  const health = useMemo(() => healthScore(state), [state]);
  const dues = useMemo(() => upcomingDues(state, new Date(), 31), [state]);
  const markPaid = useMarkPaid();

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const isEmpty = !state.accounts.length && !state.loans.length && !state.cards.length;
  const confirmItems = dues.filter(d => d.status === "confirm");

  const steps = [
    { done: state.accounts.length > 0, title: "Add your bank accounts", sub: "With today's balance", act: () => open({ kind: "account" }) },
    { done: state.loans.length + state.cards.length > 0, title: "Add your EMIs", sub: "Amount, date and account", act: () => open({ kind: "loan" }) },
    { done: state.incomes.some(i => i.day), title: "Add income and pay day", sub: "So we can count your salary", act: () => open({ kind: "income" }) },
    { done: state.expenses.length > 0, title: "Add monthly spends", sub: "Rough numbers are fine", act: () => open({ kind: "quick-spends" }) },
    { done: isNative ? notificationsEnabled() : state.settings.calendarAdded, title: "Turn on reminders", sub: "Alerts before every EMI", act: () => open({ kind: "reminders" }) },
  ];
  const doneCount = steps.filter(s => s.done).length;

  if (isEmpty) {
    return (
      <div className="screen">
        <div className="welcome">
          <span className="welcome-badge"><Icon name="shield" size={28} /></span>
          <h1>Never miss an EMI again</h1>
          <p>Lifeline tells you <b>how much to keep in which account, and by when</b>. It also shows where your money goes and how to bring in more.</p>
          <ul className="welcome-points">
            <li><Icon name="bell" /> Reminders before every EMI</li>
            <li><Icon name="transfer" /> Which account to top up, and from where</li>
            <li><Icon name="chart" /> Savings plan and debt-free date</li>
            <li><Icon name="grow" /> Realistic ways to earn more</li>
            <li><Icon name="lock" /> Data stays on your phone. No bank login</li>
          </ul>
          <Button variant="primary" full icon="plus" onClick={() => open({ kind: "account" })}>Set up in 5 minutes</Button>
          <Button variant="ghost" full onClick={() => { replace(demoState()); toast("Sample data loaded — explore freely"); }}>Explore with sample data</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="greeting">
        <div>
          <p>{greet}{state.settings.name ? "," : ""}</p>
          <h1>{state.settings.name || "Welcome back"}</h1>
        </div>
      </div>

      {/* Payment plan */}
      <div className={"hero" + (plan.mode === "short" ? " hero-alert" : "")}>
        <div className="hero-top">
          <span>This pay cycle</span>
          <Pill tone={plan.mode === "clear" ? "good" : plan.mode === "short" ? "danger" : "warn"}>{plan.mode === "clear" ? "All covered" : plan.mode === "short" ? `${inr(plan.shortfall)} short` : "Covered with a plan"}</Pill>
        </div>
        <div className="plan-flow">
          <div><small>Money in</small><b>{inr(plan.available)}</b></div>
          <Icon name="arrowRight" />
          <div><small>To pay</small><b>{inr(plan.needed)}</b></div>
        </div>
        <p className="hero-sub">{plan.mode === "clear" ? `${inr(plan.leftover)} left after all EMIs and card bills · safe to spend ${inr(sts.perDay)}/day` : plan.mode === "short" ? "Even with a card draw, an EMI is at risk. Follow the steps and talk to your lender now." : `Gap of ${inr(Math.max(0, plan.needed - plan.available))} covered the cheapest way (cost ${inr(plan.cost)}).`}</p>
        <div className="btn-row"><Button size="sm" onClick={() => go("payplan")}>See full plan & 12 months</Button></div>
      </div>

      {plan.steps.length > 0 && (
        <Section title="Your next steps" action={<button className="text-btn" onClick={() => go("payplan")}>All {plan.steps.length}</button>}>
          <div className="steps">{plan.steps.slice(0, 4).map(st => <StepRow key={st.key} step={st} />)}</div>
        </Section>
      )}

      <div className="quick">
        <button type="button" className="quick-btn" onClick={() => open({ kind: "afford" })}><Icon name="wallet" /><span>Can I afford it?</span></button>
        <button type="button" className="quick-btn" onClick={() => open({ kind: "balances" })} disabled={!state.accounts.length}><Icon name="refresh" /><span>Update balances</span></button>
        <button type="button" className="quick-btn" onClick={() => go("ai")}><Icon name="sparkle" /><span>Ask AI</span></button>
      </div>

      {confirmItems.length > 0 && (
        <Section title="Check these" hint="A bounced EMI costs charges and a late mark on your credit report. Confirm each one.">
          {confirmItems.map(d => (
            <Card key={d.loan.id + d.ym} tone="danger">
              <div className="action">
                <span className="action-icon danger"><Icon name="alert" /></span>
                <div className="action-body">
                  <b>Did {d.loan.name} go through on {fmt(d.date)}?</b>
                  <p>{inr(d.loan.emi)} from {state.accounts.find(a => a.id === d.loan.accountId)?.name ?? "your account"}. Check your bank SMS.</p>
                  <div className="btn-row">
                    <Button size="sm" variant="primary" icon="check" onClick={() => markPaid(d, true)}>Yes, paid</Button>
                    <Button size="sm" onClick={() => open({ kind: "bounced", loanId: d.loan.id })}>No, it bounced</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </Section>
      )}

      {!state.settings.setupDismissed && doneCount < steps.length && (
        <Section title={`Finish setup · ${doneCount} of ${steps.length}`} action={<button className="text-btn" onClick={() => update(s => ({ ...s, settings: { ...s.settings, setupDismissed: true } }))}>Hide</button>}>
          <div className="progress"><span style={{ width: (doneCount / steps.length) * 100 + "%" }} /></div>
          <List>
            {steps.map(s => (
              <Row key={s.title} icon={s.done ? "check" : "plus"} iconTone={s.done ? "good" : "brand"} title={s.title} subtitle={s.done ? "Done" : s.sub} onClick={s.act} />
            ))}
          </List>
        </Section>
      )}

      {state.accounts.length > 0 && (
        <Section title="Next 30 days" hint="Spare money across your accounts after EMIs, counting expected salary." action={<button className="text-btn" onClick={() => open({ kind: "balances" })}>Update balances</button>}>
          <Card><ForecastChart points={fc} /></Card>
        </Section>
      )}

      <Card className="ai-card" onClick={() => go("ai")}>
        <div className="profile-sum">
          <span className="action-icon ai"><Icon name="sparkle" /></span>
          <div><b>Ask AI about your money</b><p>Gemini, ChatGPT, Claude or the built-in assistant, with your private summary</p></div>
          <Icon name="chevron" size={18} />
        </div>
      </Card>

      <Section title="Financial health">
        <Card onClick={() => go("insights", "plan")}>
          <div className="health">
            <Ring value={health.score} label={health.label} tone={health.label.toLowerCase()} />
            <div className="health-body">
              <b>{health.label}</b>
              <p>{health.reasons[0] ?? "No warning signs. Keep one month of EMIs as a buffer."}</p>
              <span className="text-btn">See your action plan <Icon name="arrowRight" size={14} /></span>
            </div>
          </div>
        </Card>
      </Section>

      {unassignedLoans(state).length > 0 && (
        <Card tone="danger"><p>Some EMIs aren't linked to an account. Open each one in <b>Bills</b> and choose an account.</p></Card>
      )}
    </div>
  );
}

