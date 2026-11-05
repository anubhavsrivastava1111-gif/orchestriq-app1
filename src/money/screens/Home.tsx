// Home — "Am I safe this month, and what must I do today?"
import { useMemo } from "react";
import { useApp } from "../context";
import { fundingPlan, forecast, healthScore, inr, safeToSpend, transferPlan, unassignedLoans, upcomingDues, type Transfer } from "../engine";
import { statusPill, useMarkPaid } from "../dues";
import { Button, Card, Empty, ForecastChart, List, Pill, Ring, Row, Section } from "../components";
import { Icon } from "../icons";
import { demoState } from "../store";
import { installedApps, isNative, notificationsEnabled, openApp } from "../native";
import { UPI_APPS } from "../market";

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function Home() {
  const { state, update, open, go, toast, replace } = useApp();
  const plans = useMemo(() => fundingPlan(state), [state]);
  const moves = useMemo(() => transferPlan(plans), [plans]);
  const sts = useMemo(() => safeToSpend(state), [state]);
  const fc = useMemo(() => forecast(state), [state]);
  const health = useMemo(() => healthScore(state), [state]);
  const dues = useMemo(() => upcomingDues(state, new Date(), 31), [state]);
  const markPaid = useMarkPaid();
  const upi = useMemo(() => { const have = installedApps(UPI_APPS.map(a => a.pkg)); return UPI_APPS.find(a => have.has(a.pkg)); }, []);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const isEmpty = !state.accounts.length && !state.loans.length && !state.cards.length;
  const confirmItems = dues.filter(d => d.status === "confirm");
  const next = dues.filter(d => d.status !== "confirm").slice(0, 5);
  const shortTotal = plans.reduce((s, p) => s + p.shortfall, 0);
  const thisMonth = dues.filter(d => d.date.getMonth() === new Date().getMonth());
  const paidCount = thisMonth.filter(d => d.status === "paid").length;

  const steps = [
    { done: state.accounts.length > 0, title: "Add your bank accounts", sub: "With today's balance", act: () => open({ kind: "account" }) },
    { done: state.loans.length + state.cards.length > 0, title: "Add your EMIs", sub: "Amount, date and account", act: () => open({ kind: "loan" }) },
    { done: state.incomes.some(i => i.day), title: "Add income and pay day", sub: "So we can count your salary", act: () => open({ kind: "income" }) },
    { done: state.expenses.length > 0, title: "Add monthly spends", sub: "Rough numbers are fine", act: () => open({ kind: "quick-spends" }) },
    { done: isNative ? notificationsEnabled() : state.settings.calendarAdded, title: "Turn on reminders", sub: "Alerts before every EMI", act: () => open({ kind: "reminders" }) },
  ];
  const doneCount = steps.filter(s => s.done).length;

  const applyMove = (m: Transfer) => {
    update(s => ({
      ...s,
      accounts: s.accounts.map(a => {
        if (a.id === m.to.id) return { ...a, balance: a.balance + m.amount, updatedAt: new Date().toISOString() };
        if (m.from && a.id === m.from.id) return { ...a, balance: a.balance - m.amount, updatedAt: new Date().toISOString() };
        return a;
      }),
    }));
    toast(m.from ? `Moved ${inr(m.amount)} to ${m.to.name}` : `Added ${inr(m.amount)} to ${m.to.name}`);
  };

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

      {/* Hero */}
      <div className={"hero" + (shortTotal > 0 ? " hero-alert" : "")}>
        <div className="hero-top">
          <span>Safe to spend</span>
          {shortTotal > 0 ? <Pill tone="danger">Action needed</Pill> : <Pill tone="good">EMIs covered</Pill>}
        </div>
        <div className="hero-amount">{inr(sts.perDay)}<small>/day</small></div>
        <p className="hero-sub">until {fmt(sts.until)} · {inr(sts.total)} in total after EMIs and essentials</p>
        <div className="hero-stats">
          <div><small>EMIs this month</small><b>{paidCount}/{thisMonth.length} paid</b></div>
          <div><small>Due in 30 days</small><b>{inr(plans.reduce((s, p) => s + p.totalDue, 0))}</b></div>
          <div><small>{shortTotal > 0 ? "Shortfall" : "Spare"}</small><b className={shortTotal > 0 ? "neg-light" : ""}>{inr(shortTotal > 0 ? shortTotal : plans.reduce((s, p) => s + Math.max(0, p.lowest), 0))}</b></div>
        </div>
      </div>

      {(moves.length > 0 || confirmItems.length > 0) && (
        <Section title="Do this now" hint="Each step prevents a bounce charge and a late mark on your credit score.">
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
          {moves.map((m, i) => (
            <Card key={i} tone="warn">
              <div className="action">
                <span className="action-icon warn"><Icon name={m.from ? "transfer" : "plus"} /></span>
                <div className="action-body">
                  <b>{m.from ? `Move ${inr(m.amount)}` : `Add ${inr(m.amount)}`}{m.by ? ` by ${fmt(m.by)}` : ""}</b>
                  <p>{m.from ? <>From <b>{m.from.name}</b> to <b>{m.to.name}</b>. That account has spare money after its own EMIs.</> : <>to <b>{m.to.name}</b> from salary, savings or another source.</>}</p>
                  <div className="btn-row">
                    <Button size="sm" variant="primary" icon="check" onClick={() => applyMove(m)}>Done</Button>
                    {!m.from && <Button size="sm" onClick={() => go("earn")}>Ways to raise it</Button>}
                    {m.from && upi && <Button size="sm" icon="transfer" onClick={() => openApp(upi.pkg)}>Open {upi.name}</Button>}
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

      <Section title="Upcoming EMIs" action={<button className="text-btn" onClick={() => go("bills", "calendar")}>Calendar</button>}>
        {next.length === 0 ? <Empty icon="calendar" title="No EMIs in the next 30 days" action={<Button size="sm" icon="plus" onClick={() => open({ kind: "loan" })}>Add EMI</Button>} /> : (
          <List>
            {next.map(d => (
              <div key={d.loan.id + d.ym} className={"row due-row" + (d.status === "paid" ? " is-paid" : "")}>
                <span className="date-badge"><b>{d.date.getDate()}</b><small>{d.date.toLocaleDateString("en-IN", { month: "short" })}</small></span>
                <span className="row-main">
                  <span className="row-title">{d.loan.name}</span>
                  <span className="row-sub">{inr(d.loan.emi)} · {state.accounts.find(a => a.id === d.loan.accountId)?.name ?? "No account"}</span>
                  <span>{statusPill(d)}</span>
                </span>
                {d.status === "paid"
                  ? <Button size="sm" variant="ghost" onClick={() => markPaid(d, false)}>Undo</Button>
                  : <Button size="sm" onClick={() => markPaid(d, true)} aria-label={`Mark ${d.loan.name} paid`}>Paid</Button>}
              </div>
            ))}
          </List>
        )}
      </Section>

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

