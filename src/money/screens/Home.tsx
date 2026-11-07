// Home — calm overview. Shows your money as you entered it; plans only when you ask.
import { useMemo } from "react";
import { useApp } from "../context";
import { inr, upcomingDues } from "../engine";
import { useMarkPaid } from "../dues";
import { ago, isStale } from "../labels";
import { Button, Card, Empty, List, Pill, Row, Section } from "../components";
import { Icon } from "../icons";
import { demoState } from "../store";
import { isNative, notificationsEnabled } from "../native";

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function Home() {
  const { state, update, open, go, toast, replace } = useApp();
  const dues = useMemo(() => upcomingDues(state, new Date(), 14), [state]);
  const markPaid = useMarkPaid();

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const isEmpty = !state.accounts.length && !state.loans.length && !state.cards.length;
  const confirmItems = dues.filter(d => d.status === "confirm");
  const coming = dues.filter(d => d.status !== "paid" && d.status !== "confirm").slice(0, 4);
  const total = state.accounts.reduce((s, a) => s + a.balance, 0);
  const anyStale = state.accounts.some(a => isStale(a.updatedAt, 1));

  const steps = [
    { done: state.accounts.length > 0, title: "Add your bank accounts", sub: "With today's balance", act: () => open({ kind: "account" }) },
    { done: state.loans.length + state.cards.length > 0, title: "Add your loans and cards", sub: "EMIs, due dates, card bills", act: () => open({ kind: "quick-add" }) },
    { done: state.incomes.some(i => i.day), title: "Add income and pay day", sub: "So the plan knows when money arrives", act: () => open({ kind: "income" }) },
    { done: isNative ? notificationsEnabled() : state.settings.calendarAdded, title: "Turn on reminders", sub: "Alerts before every due date", act: () => open({ kind: "reminders" }) },
  ];
  const doneCount = steps.filter(s => s.done).length;

  if (isEmpty) {
    return (
      <div className="screen">
        <div className="welcome">
          <span className="welcome-badge"><Icon name="shield" size={28} /></span>
          <h1>Never miss an EMI again</h1>
          <p>Lifeline keeps track of every EMI and card bill. When you ask, it tells you <b>what to pay, when, and from where</b>.</p>
          <ul className="welcome-points">
            <li><Icon name="bell" /> Reminders before every due date</li>
            <li><Icon name="card" /> Credit cards: bills, minimum due, card EMIs</li>
            <li><Icon name="calendar" /> A payment plan whenever you want one</li>
            <li><Icon name="lock" /> Encrypted. Your data stays on your phone</li>
          </ul>
          <Button variant="primary" full icon="plus" onClick={() => open({ kind: "account" })}>Set up in 5 minutes</Button>
          <Button variant="ghost" full onClick={() => { replace(demoState()); toast("Sample data loaded. Explore freely"); }}>Explore with sample data</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="greeting"><div><p>{greet}{state.settings.name ? "," : ""}</p><h1>{state.settings.name || "Welcome back"}</h1></div></div>

      {/* Accounts, exactly as entered */}
      <Card className="acct-card">
        <div className="acct-head">
          <div><small>In your accounts</small><b>{inr(total)}</b></div>
          <Button size="sm" icon="refresh" onClick={() => open({ kind: "balances" })} disabled={!state.accounts.length}>Update</Button>
        </div>
        {state.accounts.length === 0 ? <p className="note">Add a bank account to start.</p> : (
          <div className="acct-list">
            {state.accounts.map(a => (
              <div key={a.id} className="acct-row">
                <span className="acct-name">{a.name}</span>
                <span className={"acct-when" + (isStale(a.updatedAt, 1) ? " stale" : "")}>{ago(a.updatedAt)}</span>
                <b>{inr(a.balance)}</b>
              </div>
            ))}
          </div>
        )}
        {anyStale && <p className="hint-warn">Some balances are over a day old. Update them before planning payments.</p>}
      </Card>

      {/* Plan only on request */}
      <Card className="plan-cta" onClick={() => open({ kind: "plan-start" })}>
        <span className="action-icon brand"><Icon name="calendar" /></span>
        <div><b>Plan my payments</b><p>Confirm your balances, then see what to pay, when, from which account, and how to cover any gap.</p></div>
        <Icon name="chevron" size={18} />
      </Card>

      <Section title="Coming up · next 14 days" action={<button className="text-btn" onClick={() => go("bills", "calendar")}>Calendar</button>}>
        {coming.length === 0 ? <Empty icon="calendar" title="Nothing due in the next 14 days" /> : (
          <List>
            {coming.map(d => (
              <Row key={d.loan.id + d.ym} icon={d.loan.cardId ? "card" : "calendar"} iconTone="brand" title={d.loan.name}
                subtitle={`${fmt(d.date)} · ${d.loan.cardId ? "card bill" : "EMI"} · ${state.accounts.find(a => a.id === d.loan.accountId)?.name ?? "no account"}`}
                value={inr(d.loan.emi)} onClick={() => (d.loan.cardId ? go("cards", d.loan.cardId) : go("bills", "loans"))} />
            ))}
          </List>
        )}
      </Section>

      {confirmItems.length > 0 && (
        <Section title="Did these go through?">
          {confirmItems.map(d => (
            <Card key={d.loan.id + d.ym}>
              <div className="confirm-row">
                <div><b>{d.loan.name}</b><small>{inr(d.loan.emi)} · due {fmt(d.date)}</small></div>
                <div className="btn-row tight">
                  <Button size="sm" variant="primary" onClick={() => markPaid(d, true)}>Paid</Button>
                  <Button size="sm" onClick={() => open({ kind: "bounced", loanId: d.loan.id })}>Bounced</Button>
                </div>
              </div>
            </Card>
          ))}
        </Section>
      )}

      <div className="quick">
        <button type="button" className="quick-btn" onClick={() => open({ kind: "afford" })}><Icon name="wallet" /><span>Can I afford it?</span></button>
        <button type="button" className="quick-btn" onClick={() => go("insights")}><Icon name="chart" /><span>Insights</span></button>
        <button type="button" className="quick-btn" onClick={() => go("ai")}><Icon name="sparkle" /><span>Ask AI</span></button>
      </div>

      {!state.settings.setupDismissed && doneCount < steps.length && (
        <Section title={`Finish setup · ${doneCount} of ${steps.length}`} action={<button className="text-btn" onClick={() => update(s => ({ ...s, settings: { ...s.settings, setupDismissed: true } }))}>Hide</button>}>
          <List>{steps.map(s => <Row key={s.title} icon={s.done ? "check" : "plus"} iconTone={s.done ? "good" : "brand"} title={s.title} subtitle={s.done ? "Done" : s.sub} onClick={s.act} />)}</List>
        </Section>
      )}
      {state.cards.length > 0 && <p className="note center"><Pill>{state.cards.length} card{state.cards.length > 1 ? "s" : ""}</Pill> Manage bills, EMIs and payments in the <b>Cards</b> tab.</p>}
    </div>
  );
}
