// Lifeline — EMI & money rescue app for people under financial stress.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Account, Expense, Income, Loan, MoneyState } from "./types";
import { ESSENTIAL_DEFAULT, EXPENSE_LABEL, INCOME_LABEL, LOAN_TYPE_LABEL } from "./types";
import { cashFlow, fundingPlan, healthScore, inr, insights, simulatePayoff, unassignedLoans, upcomingDues, ymKey, type DueItem, type Insight } from "./engine";
import { demoState, download, EMPTY, exportJson, parseBackup, uid, useMoneyState } from "./store";
import { buildIcs, googleCalendarLink } from "./calendar";
import { CATEGORY_LABEL, rankOpportunities, SKILL_TAGS, type Category } from "./opportunities";
import { RED_FLAGS, RESOURCES } from "./resources";
import { Bar, Card, Empty, FormSheet, type FieldSpec } from "./ui";

type Tab = "today" | "emis" | "flow" | "save" | "earn" | "help";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "◉" },
  { id: "emis", label: "EMIs", icon: "▦" },
  { id: "flow", label: "Money flow", icon: "⇅" },
  { id: "save", label: "Save", icon: "↓" },
  { id: "earn", label: "Earn", icon: "↑" },
  { id: "help", label: "Help", icon: "?" },
];

const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const opts = <T extends string>(rec: Record<T, string>) => (Object.keys(rec) as T[]).map(k => ({ value: k, label: rec[k] }));

type Editing =
  | { kind: "account"; item: Account | null }
  | { kind: "loan"; item: Loan | null }
  | { kind: "income"; item: Income | null }
  | { kind: "expense"; item: Expense | null }
  | null;

export default function MoneyApp() {
  const [state, setState] = useMoneyState();
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.slice(1) as Tab;
    return TABS.some(t => t.id === h) ? h : "today";
  });
  const [editing, setEditing] = useState<Editing>(null);
  useEffect(() => { history.replaceState(null, "", "#" + tab); window.scrollTo(0, 0); }, [tab]);

  const health = useMemo(() => healthScore(state), [state]);
  useReminderNotifications(state);

  const isEmpty = !state.loans.length && !state.accounts.length && !state.incomes.length;
  const update = (fn: (s: MoneyState) => MoneyState) => setState(s => fn(s));

  return (
    <div className="ll-app">
      <header className="ll-top">
        <div>
          <h1>Lifeline</h1>
          <p>EMIs · cash flow · savings · earning</p>
        </div>
        {!isEmpty && <span className={"ll-health ll-h-" + health.label.toLowerCase()} title="Financial stress score">{health.score} · {health.label}</span>}
      </header>

      <main className="ll-main">
        {isEmpty && tab !== "help" ? (
          <Onboarding onDemo={() => setState(demoState())} onStart={() => { setTab("emis"); setEditing({ kind: "account", item: null }); }} />
        ) : (
          <>
            {tab === "today" && <TodayTab state={state} update={update} go={setTab} health={health} />}
            {tab === "emis" && <EmisTab state={state} update={update} edit={setEditing} />}
            {tab === "flow" && <FlowTab state={state} edit={setEditing} />}
            {tab === "save" && <SaveTab state={state} go={setTab} />}
            {tab === "earn" && <EarnTab state={state} update={update} />}
          </>
        )}
        {tab === "help" && <HelpTab state={state} setState={setState} />}
      </main>

      <nav className="ll-nav" aria-label="Sections">
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
            <span aria-hidden>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>

      {editing && <Editor editing={editing} state={state} update={update} close={() => setEditing(null)} />}
    </div>
  );
}

// ─── Onboarding ─────────────────────────────────────────────────────────────
function Onboarding({ onDemo, onStart }: { onDemo: () => void; onStart: () => void }) {
  return (
    <Card title="Never miss an EMI again">
      <p>Lifeline tells you <b>how much to put in which account, and by when</b>, so auto-debits don't bounce. It also shows where your money comes from and goes, finds savings, and matches you to realistic ways to earn more.</p>
      <ol className="ll-steps">
        <li>Add your bank accounts and their current balance.</li>
        <li>Add each EMI: amount, due date, and which account it's debited from.</li>
        <li>Add your income and regular spends.</li>
        <li>Turn on calendar reminders so your phone alerts you before each due date.</li>
      </ol>
      <p className="ll-muted">Your data stays on this phone. Nothing is uploaded. No bank login or SMS access is needed.</p>
      <div className="ll-row">
        <button className="ll-btn ll-primary" onClick={onStart}>Start — add my first account</button>
        <button className="ll-btn ll-ghost" onClick={onDemo}>Try with sample data</button>
      </div>
    </Card>
  );
}

// ─── Today ──────────────────────────────────────────────────────────────────
function TodayTab({ state, update, go, health }: { state: MoneyState; update: (fn: (s: MoneyState) => MoneyState) => void; go: (t: Tab) => void; health: ReturnType<typeof healthScore> }) {
  const plans = fundingPlan(state);
  const dues = upcomingDues(state, new Date(), 21);
  const acts = insights(state).filter(i => i.severity === "urgent" || i.severity === "high").slice(0, 3);
  const orphan = unassignedLoans(state);
  const markPaid = (d: DueItem, paid: boolean) => update(s => ({
    ...s,
    loans: s.loans.map(l => l.id !== d.loan.id ? l : { ...l, paidMonths: paid ? [...new Set([...l.paidMonths, d.ym])] : l.paidMonths.filter(m => m !== d.ym) }),
    // Paying an EMI reduces that account's balance, so the funding plan stays correct.
    accounts: s.accounts.map(a => a.id !== d.loan.accountId ? a : { ...a, balance: a.balance + (paid ? -d.loan.emi : d.loan.emi) }),
  }));

  return (
    <>
      <Card title="Accounts to fund" right={<button className="ll-link" onClick={() => go("emis")}>Edit</button>}>
        {plans.length === 0 && <Empty>Add a bank account in the EMIs tab.</Empty>}
        {plans.map(p => (
          <div key={p.account.id} className={"ll-fund " + (p.shortfall > 0 ? "bad" : "good")}>
            <div className="ll-fund-head">
              <b>{p.account.name}</b>
              <span>{p.shortfall > 0 ? `Add ${inr(p.shortfall)}` : "✓ Enough"}</span>
            </div>
            <div className="ll-fund-meta">
              Balance {inr(p.account.balance)}{p.account.minBalance ? ` (keep ${inr(p.account.minBalance)})` : ""} · Next 31 days EMIs {inr(p.totalDue)}
              {p.shortfall > 0 && p.fundBy && <> · <b>top up by {fmtDate(p.fundBy)}</b></>}
              {p.credits.length > 0 && <div>Counting expected: {p.credits.map(c => `${c.source} ${inr(c.amount)} on ${fmtDate(c.date)}`).join(", ")}. If it's late, you'll need more.</div>}
            </div>
            <BalanceQuickEdit account={p.account} onSave={bal => update(s => ({ ...s, accounts: s.accounts.map(a => a.id === p.account.id ? { ...a, balance: bal, updatedAt: new Date().toISOString() } : a) }))} />
          </div>
        ))}
        <p className="ll-muted ll-sm">Tip: “Mark paid” deducts the EMI from the balance shown here. If you update the balance from your bank app after the debit, do that last.</p>
        {orphan.length > 0 && <p className="ll-err">{orphan.length} EMI(s) are not linked to an account and can't be checked: {orphan.map(l => l.name).join(", ")}.</p>}
      </Card>

      <Card title="EMIs in the next 3 weeks">
        {dues.length === 0 && <Empty>No EMIs due. Add them in the EMIs tab.</Empty>}
        <ul className="ll-dues">
          {dues.map(d => (
            <li key={d.loan.id + d.ym} className={"ll-due s-" + d.status}>
              <div className="ll-due-date"><b>{d.date.getDate()}</b><span>{d.date.toLocaleDateString("en-IN", { month: "short" })}</span></div>
              <div className="ll-due-body">
                <b>{d.loan.name}</b> <span className="ll-muted">· {d.loan.lender}</span>
                <div className="ll-muted">{inr(d.loan.emi)} from {state.accounts.find(a => a.id === d.loan.accountId)?.name || "—"}</div>
                <span className="ll-chip">{statusText(d)}</span>
              </div>
              {d.status === "paid"
                ? <button className="ll-btn ll-ghost ll-sm" onClick={() => markPaid(d, false)}>Undo</button>
                : <button className="ll-btn ll-sm" onClick={() => markPaid(d, true)}>Mark paid</button>}
            </li>
          ))}
        </ul>
      </Card>

      {acts.length > 0 && (
        <Card title="Do these first">
          {acts.map(i => <InsightRow key={i.id} i={i} go={go} />)}
          <button className="ll-link" onClick={() => go("save")}>See all savings ideas →</button>
        </Card>
      )}

      <Card title={`Stress score: ${health.score}/100 (${health.label})`}>
        {health.reasons.length ? <ul className="ll-list">{health.reasons.map(r => <li key={r}>{r}</li>)}</ul> : <p>No warning signs right now. Keep a one-month EMI buffer.</p>}
      </Card>
    </>
  );
}

function statusText(d: DueItem): string {
  switch (d.status) {
    case "paid": return "Paid ✓";
    case "confirm": return "Did it go through? Check your bank SMS";
    case "due-today": return "Debits today";
    case "fund-now": return `Fund now — due in ${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"}`;
    default: return `Fund by ${fmtDate(d.fundBy)}`;
  }
}

function BalanceQuickEdit({ account, onSave }: { account: Account; onSave: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(String(account.balance));
  if (!open) return <button className="ll-link ll-sm" onClick={() => { setVal(String(account.balance)); setOpen(true); }}>Update balance (last: {new Date(account.updatedAt).toLocaleDateString("en-IN")})</button>;
  return (
    <form className="ll-row" onSubmit={e => { e.preventDefault(); onSave(Number(val) || 0); setOpen(false); }}>
      <input className="ll-input" type="number" inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} aria-label={`Balance of ${account.name}`} autoFocus />
      <button className="ll-btn ll-primary ll-sm">Save</button>
      <button type="button" className="ll-btn ll-ghost ll-sm" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}

function InsightRow({ i, go }: { i: Insight; go: (t: Tab) => void }) {
  return (
    <div className={"ll-insight sev-" + i.severity}>
      <div className="ll-insight-head">
        <span className="ll-sev">{i.severity === "urgent" ? "Urgent" : i.severity === "high" ? "High impact" : i.severity === "medium" ? "Worth doing" : "Tip"}</span>
        {i.monthlyImpact ? <span className="ll-gain">~{inr(i.monthlyImpact)}/mo</span> : null}
      </div>
      <b>{i.title}</b>
      <p>{i.detail}</p>
      {i.action?.tab && <button className="ll-link" onClick={() => go(i.action!.tab as Tab)}>{i.action.label} →</button>}
    </div>
  );
}

// ─── EMIs & accounts ────────────────────────────────────────────────────────
function EmisTab({ state, update, edit }: { state: MoneyState; update: (fn: (s: MoneyState) => MoneyState) => void; edit: (e: Editing) => void }) {
  const totalEmi = state.loans.reduce((s, l) => s + l.emi, 0);
  const totalOut = state.loans.reduce((s, l) => s + l.outstanding, 0);
  const notifSupported = typeof Notification !== "undefined";
  const enableNotifs = async () => {
    if (!notifSupported) return;
    const p = await Notification.requestPermission();
    update(s => ({ ...s, settings: { ...s.settings, remindersOn: p === "granted" } }));
  };
  return (
    <>
      <Card title="Bank accounts" right={<button className="ll-btn ll-sm" onClick={() => edit({ kind: "account", item: null })}>+ Add</button>}>
        {state.accounts.length === 0 && <Empty>Add the accounts your EMIs are debited from.</Empty>}
        {state.accounts.map(a => (
          <button key={a.id} className="ll-item" onClick={() => edit({ kind: "account", item: a })}>
            <span><b>{a.name}</b><small>{state.loans.filter(l => l.accountId === a.id).length} EMI(s) debit here</small></span>
            <b>{inr(a.balance)}</b>
          </button>
        ))}
      </Card>

      <Card title="Loans & EMIs" right={<button className="ll-btn ll-sm" disabled={!state.accounts.length} onClick={() => edit({ kind: "loan", item: null })}>+ Add</button>}>
        {!state.accounts.length && <Empty>Add a bank account first — every EMI is linked to the account it's debited from.</Empty>}
        {[...state.loans].sort((a, b) => a.dueDay - b.dueDay).map(l => (
          <button key={l.id} className="ll-item" onClick={() => edit({ kind: "loan", item: l })}>
            <span><b>{l.name}</b><small>Day {l.dueDay} · {l.lender} · {l.ratePct}% · {inr(l.outstanding)} left</small></span>
            <b>{inr(l.emi)}</b>
          </button>
        ))}
        {state.loans.length > 0 && <p className="ll-total">Total EMI {inr(totalEmi)}/month · Outstanding {inr(totalOut)}</p>}
      </Card>

      <Card title="Reminders on your phone">
        <p>The most reliable reminder on Android is your calendar — it rings even when this app is closed. We create two alerts per EMI: <b>“fund the account”</b> {state.settings.bufferDays} day(s) before, and <b>“EMI today”</b> on the due date.</p>
        <div className="ll-row">
          <button className="ll-btn ll-primary" disabled={!state.loans.length} onClick={() => download(new Blob([buildIcs(state.loans, state.accounts, state.settings)], { type: "text/calendar" }), "emi-reminders.ics")}>Download all reminders (.ics)</button>
        </div>
        <p className="ll-muted ll-sm">On Android: open the downloaded file → choose Google Calendar → Save. Or add them one by one:</p>
        <ul className="ll-list">
          {state.loans.map(l => {
            const acct = state.accounts.find(a => a.id === l.accountId);
            return (
              <li key={l.id}>{l.name}: <a href={googleCalendarLink(l, acct, state.settings, "fund")} target="_blank" rel="noreferrer">fund reminder</a> · <a href={googleCalendarLink(l, acct, state.settings, "due")} target="_blank" rel="noreferrer">due-day reminder</a></li>
            );
          })}
        </ul>
        {notifSupported && (
          <p className="ll-sm">
            In-app alerts when you open Lifeline: <b>{state.settings.remindersOn ? "On" : "Off"}</b>{" "}
            {!state.settings.remindersOn && <button className="ll-link" onClick={enableNotifs}>Turn on</button>}
          </p>
        )}
      </Card>
    </>
  );
}

// ─── Money flow ─────────────────────────────────────────────────────────────
function FlowTab({ state, edit }: { state: MoneyState; edit: (e: Editing) => void }) {
  const cf = cashFlow(state);
  const max = Math.max(cf.income, cf.emi + cf.essentials + cf.discretionary, 1);
  const foirPct = Math.round(cf.foir * 100);
  return (
    <>
      <Card title="Your month at a glance">
        <Bar label="Money in" value={cf.income} max={max} tone="in" right={inr(cf.income)} />
        <Bar label="EMIs" value={cf.emi} max={max} tone="emi" right={inr(cf.emi)} />
        <Bar label="Essential spends" value={cf.essentials} max={max} tone="out" right={inr(cf.essentials)} />
        <Bar label="Non-essential spends" value={cf.discretionary} max={max} tone="soft" right={inr(cf.discretionary)} />
        <p className={"ll-total " + (cf.surplus < 0 ? "neg" : "pos")}>{cf.surplus < 0 ? "Monthly gap" : "Left over"}: {inr(cf.surplus)}</p>
        <p className="ll-muted ll-sm">EMIs take {foirPct}% of income. Banks call this FOIR; under 40% is healthy, over 50% means lenders see you as over-borrowed.</p>
      </Card>

      <Card title="Where money comes from" right={<button className="ll-btn ll-sm" onClick={() => edit({ kind: "income", item: null })}>+ Add</button>}>
        {state.incomes.length === 0 && <Empty>Add salary and any other income.</Empty>}
        {state.incomes.map(i => (
          <button key={i.id} className="ll-item" onClick={() => edit({ kind: "income", item: i })}>
            <span><b>{i.source}</b><small>{INCOME_LABEL[i.kind]} · {i.freq}{i.day ? ` · day ${i.day}` : ""}</small></span>
            <b className="pos">{inr(i.amount)}</b>
          </button>
        ))}
      </Card>

      <Card title="Where money goes" right={<button className="ll-btn ll-sm" onClick={() => edit({ kind: "expense", item: null })}>+ Add</button>}>
        {cf.bySpend.length > 0 && cf.bySpend.map(s => (
          <Bar key={s.label} label={EXPENSE_LABEL[s.label as keyof typeof EXPENSE_LABEL] || s.label} value={s.value} max={cf.bySpend[0].value} tone={s.essential ? "out" : "soft"} right={inr(s.value) + "/mo"} />
        ))}
        {state.expenses.length === 0 && <Empty>Add rent, groceries, bills, subscriptions… Rough numbers are fine.</Empty>}
        <details className="ll-details"><summary>Edit individual spends ({state.expenses.length})</summary>
          {state.expenses.map(e => (
            <button key={e.id} className="ll-item" onClick={() => edit({ kind: "expense", item: e })}>
              <span><b>{e.name}</b><small>{EXPENSE_LABEL[e.category]} · {e.freq} · {e.essential ? "essential" : "non-essential"}</small></span>
              <b>{inr(e.amount)}</b>
            </button>
          ))}
        </details>
      </Card>
    </>
  );
}

// ─── Save ───────────────────────────────────────────────────────────────────
function SaveTab({ state, go }: { state: MoneyState; go: (t: Tab) => void }) {
  const all = insights(state);
  const cf = cashFlow(state);
  const [extra, setExtra] = useState(() => Math.max(0, Math.round(Math.min(cf.surplus, 10000) / 500) * 500));
  const base = useMemo(() => simulatePayoff(state.loans, 0, "avalanche", false), [state.loans]);
  const ava = useMemo(() => simulatePayoff(state.loans, extra, "avalanche"), [state.loans, extra]);
  const snow = useMemo(() => simulatePayoff(state.loans, extra, "snowball"), [state.loans, extra]);
  const totalImpact = all.reduce((s, i) => s + (i.severity !== "urgent" ? i.monthlyImpact || 0 : 0), 0);
  const yrs = (m: number) => m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}m` : `${m}m`;

  return (
    <>
      <Card title="Savings & action plan" right={totalImpact > 0 ? <span className="ll-gain">up to ~{inr(totalImpact)}/mo</span> : undefined}>
        {all.length === 0 && <Empty>Add your EMIs, income and spends to get personalised ideas.</Empty>}
        {all.map(i => <InsightRow key={i.id} i={i} go={go} />)}
      </Card>

      {state.loans.some(l => l.outstanding > 0) && (
        <Card title="Debt-free plan">
          <label className="ll-field">
            <span>Extra I can pay each month on top of EMIs: <b>{inr(extra)}</b></span>
            <input type="range" min={0} max={30000} step={500} value={extra} onChange={e => setExtra(Number(e.target.value))} />
          </label>
          <table className="ll-table">
            <thead><tr><th></th><th>Debt-free in</th><th>Total interest</th></tr></thead>
            <tbody>
              <tr><td>Only EMIs<small>closed loans’ EMIs are spent, not reused</small></td><td>{base.capped ? "Never*" : yrs(base.months)}</td><td>{inr(base.totalInterest)}</td></tr>
              <tr><td><b>Highest interest first</b><small>“avalanche” — saves most money</small></td><td>{ava.capped ? "Never*" : yrs(ava.months)}</td><td>{inr(ava.totalInterest)}</td></tr>
              <tr><td><b>Smallest loan first</b><small>“snowball” — quick wins, more motivating</small></td><td>{snow.capped ? "Never*" : yrs(snow.months)}</td><td>{inr(snow.totalInterest)}</td></tr>
            </tbody>
          </table>
          {extra > 0 && !ava.capped && <p className="ll-total pos">Paying {inr(extra)} extra saves {inr(base.totalInterest - ava.totalInterest)} interest and {yrs(Math.max(0, base.months - ava.months))}.</p>}
          {(base.capped || ava.capped) && <p className="ll-err">* At least one payment is lower than the interest charged, so the balance never falls. Common with credit cards paid at minimum due.</p>}
          <p className="ll-muted ll-sm">Order to clear (avalanche): {ava.order.join(" → ") || "—"}. When a loan closes, add its EMI to the next one instead of spending it.</p>
        </Card>
      )}
    </>
  );
}

// ─── Earn ───────────────────────────────────────────────────────────────────
function EarnTab({ state, update }: { state: MoneyState; update: (fn: (s: MoneyState) => MoneyState) => void }) {
  const cf = cashFlow(state);
  const gap = Math.max(0, -cf.surplus);
  const p = state.profile;
  const [cat, setCat] = useState<Category | "all">("all");
  const ranked = useMemo(() => rankOpportunities(p, gap), [p, gap]);
  const shown = ranked.filter(m => cat === "all" || m.opp.category === cat);
  const setP = (patch: Partial<typeof p>) => update(s => ({ ...s, profile: { ...s.profile, ...patch } }));
  const toggle = (id: string) => setP({ skills: p.skills.includes(id) ? p.skills.filter(x => x !== id) : [...p.skills, id] });

  return (
    <>
      <Card title="What you need to earn">
        {gap > 0
          ? <p>Your monthly gap is <b className="neg">{inr(gap)}</b>. At {p.hoursPerWeek} hrs/week that's about <b>{inr(gap / (p.hoursPerWeek * 4.3))}/hour</b> of extra work — use this to judge which options below are worth your time.</p>
          : <p>You have no monthly gap right now. Extra income can go straight to the debt-free plan in the Save tab.</p>}
        <p className="ll-muted ll-sm">Fastest wins first: sell unused items, tuition, freelance, delivery. YouTube and Instagram take 6+ months to pay — build them alongside, not instead.</p>
      </Card>

      <Card title="Tell us about you">
        <div className="ll-chips">
          {SKILL_TAGS.map(s => <button key={s.id} className={"ll-chipbtn" + (p.skills.includes(s.id) ? " on" : "")} aria-pressed={p.skills.includes(s.id)} onClick={() => toggle(s.id)}>{s.label}</button>)}
        </div>
        <div className="ll-grid2">
          <label className="ll-field"><span>Hours per week: <b>{p.hoursPerWeek}</b></span>
            <input type="range" min={2} max={40} value={p.hoursPerWeek} onChange={e => setP({ hoursPerWeek: Number(e.target.value) })} /></label>
          <label className="ll-field"><span>I need money</span>
            <select value={p.urgency} onChange={e => setP({ urgency: e.target.value as typeof p.urgency })}>
              <option value="this-month">This month</option><option value="3-months">Within 3 months</option><option value="long-term">Building for the long term</option>
            </select></label>
        </div>
      </Card>

      <div className="ll-chips ll-filter" role="tablist" aria-label="Filter by type">
        <button className={"ll-chipbtn" + (cat === "all" ? " on" : "")} onClick={() => setCat("all")}>Best matches</button>
        {(Object.keys(CATEGORY_LABEL) as Category[]).map(c => <button key={c} className={"ll-chipbtn" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>)}
      </div>

      {shown.map(({ opp, why }, idx) => (
        <Card key={opp.id} title={<>{cat === "all" && idx < 3 && <span className="ll-rank">#{idx + 1}</span>}{opp.title}</>}>
          <p>{opp.what}</p>
          <div className="ll-facts">
            <span>⏱ First income: <b>{opp.speed}</b></span>
            <span>₹ {opp.earning}</span>
            <span>Investment: {opp.investment}</span>
            <span>{opp.region === "IN" ? "India" : "Worldwide"}</span>
          </div>
          {opp.needs && <p className="ll-sm"><b>Needs:</b> {opp.needs}</p>}
          <p className="ll-sm ll-why">{why.join(" · ")}</p>
          <p className="ll-reality"><b>Reality check:</b> {opp.reality}</p>
          <div className="ll-row ll-wrap">{opp.links.map(l => <a key={l.url} className="ll-btn ll-sm" href={l.url} target="_blank" rel="noreferrer noopener">{l.label} ↗</a>)}</div>
        </Card>
      ))}
      <p className="ll-muted ll-sm">Lifeline earns nothing from these links. Earnings are indicative ranges — check each platform's current terms.</p>
    </>
  );
}

// ─── Help & settings ────────────────────────────────────────────────────────
function HelpTab({ state, setState }: { state: MoneyState; setState: (s: MoneyState | ((p: MoneyState) => MoneyState)) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const setSetting = (k: "bufferDays" | "bounceFee", v: number) => setState(s => ({ ...s, settings: { ...s.settings, [k]: v } }));
  const restore = async (f: File) => {
    const parsed = parseBackup(await f.text());
    if (!parsed) return setMsg("That file isn't a Lifeline backup.");
    setState(parsed); setMsg("Backup restored.");
  };
  return (
    <>
      <Card title="Stay safe" tone="high">
        <ul className="ll-list">{RED_FLAGS.map(r => <li key={r}>{r}</li>)}</ul>
      </Card>
      {RESOURCES.map(g => (
        <Card key={g.id} title={g.title}>
          {g.items.map(r => (
            <div key={r.title} className="ll-res">
              <b>{r.title}</b>
              <p>{r.what}</p>
              <div className="ll-row ll-wrap">
                {r.url && <a className="ll-btn ll-sm" href={r.url} target="_blank" rel="noreferrer noopener">Open ↗</a>}
                {r.phone && <a className="ll-btn ll-sm ll-primary" href={"tel:" + r.phone}>Call {r.phone}</a>}
              </div>
            </div>
          ))}
        </Card>
      ))}

      <Card title="Settings">
        <label className="ll-field"><span>Remind me to fund accounts <b>{state.settings.bufferDays}</b> day(s) before the EMI</span>
          <input type="range" min={1} max={7} value={state.settings.bufferDays} onChange={e => setSetting("bufferDays", Number(e.target.value))} /></label>
        <label className="ll-field"><span>Typical cost of one bounced EMI (bank + lender charges)</span>
          <input className="ll-input" type="number" inputMode="decimal" value={state.settings.bounceFee} onChange={e => setSetting("bounceFee", Number(e.target.value) || 0)} /></label>
      </Card>

      <Card title="Your data">
        <p className="ll-muted">Everything is stored only in this phone's browser storage. Clearing browser data or uninstalling deletes it — export a backup monthly.</p>
        <div className="ll-row ll-wrap">
          <button className="ll-btn" onClick={() => exportJson(state)}>Export backup</button>
          <button className="ll-btn" onClick={() => fileRef.current?.click()}>Restore backup</button>
          <button className="ll-btn ll-ghost" onClick={() => { if (confirm("Replace your data with sample data?")) setState(demoState()); }}>Load sample data</button>
          <button className="ll-btn ll-danger" onClick={() => { if (confirm("Delete all your Lifeline data from this phone? This cannot be undone.")) setState(EMPTY); }}>Delete all data</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
        {msg && <p role="status">{msg}</p>}
      </Card>
      <p className="ll-muted ll-sm ll-center">Lifeline gives general guidance, not regulated financial advice. Part of <a href="/">OrchestrIQ</a>.</p>
    </>
  );
}

// ─── Add / edit sheets ──────────────────────────────────────────────────────
function Editor({ editing, state, update, close }: { editing: NonNullable<Editing>; state: MoneyState; update: (fn: (s: MoneyState) => MoneyState) => void; close: () => void }) {
  const acctOpts = state.accounts.map(a => ({ value: a.id, label: a.name }));
  const freqOpts = [{ value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }, { value: "yearly", label: "Yearly" }, { value: "one-off", label: "One-off" }];

  if (editing.kind === "account") {
    const it = editing.item;
    const fields: FieldSpec[] = [
      { key: "name", label: "Account name", type: "text", placeholder: "e.g. SBI salary account", required: true },
      { key: "balance", label: "Current balance (₹)", type: "number", required: true },
      { key: "minBalance", label: "Minimum balance to keep (₹)", type: "number", min: 0, hint: "Amount the bank charges you for going below. 0 if none." },
    ];
    return <FormSheet title={it ? "Edit account" : "Add bank account"} fields={fields}
      initial={it ?? { name: "", balance: "", minBalance: 0 }} onCancel={close}
      onDelete={it ? () => { if (confirm(`Delete ${it.name}? EMIs linked to it will need a new account.`)) { update(s => ({ ...s, accounts: s.accounts.filter(a => a.id !== it.id) })); close(); } } : undefined}
      onSave={v => { const rec = { ...(it ?? { id: uid() }), ...v, updatedAt: new Date().toISOString() } as Account; update(s => ({ ...s, accounts: it ? s.accounts.map(a => a.id === it.id ? rec : a) : [...s.accounts, rec] })); close(); }} />;
  }
  if (editing.kind === "loan") {
    const it = editing.item;
    const fields: FieldSpec[] = [
      { key: "name", label: "Name", type: "text", placeholder: "e.g. Bike loan", required: true },
      { key: "lender", label: "Lender", type: "text", placeholder: "e.g. Bajaj Finance" },
      { key: "type", label: "Type", type: "select", options: opts(LOAN_TYPE_LABEL) },
      { key: "emi", label: "Monthly EMI (₹)", type: "number", min: 1, required: true, hint: "For credit cards, the amount you pay each month." },
      { key: "dueDay", label: "Due day of month (1–31)", type: "number", min: 1, max: 31, step: 1, required: true },
      { key: "accountId", label: "Debited from", type: "select", options: acctOpts },
      { key: "outstanding", label: "Amount still owed (₹)", type: "number", min: 0, hint: "From your loan statement or lender app." },
      { key: "ratePct", label: "Interest rate (% per year)", type: "number", min: 0, max: 100, hint: "Credit cards are usually 36–45%." },
    ];
    return <FormSheet title={it ? "Edit EMI" : "Add EMI"} fields={fields}
      initial={it ?? { name: "", lender: "", type: "personal", emi: "", dueDay: 5, accountId: state.accounts[0]?.id ?? "", outstanding: "", ratePct: "" }} onCancel={close}
      onDelete={it ? () => { if (confirm(`Delete ${it.name}?`)) { update(s => ({ ...s, loans: s.loans.filter(l => l.id !== it.id) })); close(); } } : undefined}
      onSave={v => { const rec = { paidMonths: [], ...(it ?? { id: uid() }), ...v, dueDay: Math.round(Number(v.dueDay)) } as Loan; update(s => ({ ...s, loans: it ? s.loans.map(l => l.id === it.id ? rec : l) : [...s.loans, rec] })); close(); }} />;
  }
  if (editing.kind === "income") {
    const it = editing.item;
    const fields: FieldSpec[] = [
      { key: "source", label: "Source", type: "text", placeholder: "e.g. Salary — ABC Ltd", required: true },
      { key: "kind", label: "Type", type: "select", options: opts(INCOME_LABEL) },
      { key: "amount", label: "Amount (₹)", type: "number", min: 0, required: true },
      { key: "freq", label: "How often", type: "select", options: freqOpts },
      { key: "day", label: "Day it arrives (optional)", type: "number", min: 0, max: 31, step: 1 },
      { key: "accountId", label: "Credited to", type: "select", options: [{ value: "", label: "—" }, ...acctOpts] },
    ];
    return <FormSheet title={it ? "Edit income" : "Add income"} fields={fields}
      initial={it ?? { source: "", kind: "salary", amount: "", freq: "monthly", day: "", accountId: state.accounts[0]?.id ?? "" }} onCancel={close}
      onDelete={it ? () => { update(s => ({ ...s, incomes: s.incomes.filter(x => x.id !== it.id) })); close(); } : undefined}
      onSave={v => { const rec = { ...(it ?? { id: uid() }), ...v, day: Number(v.day) || undefined } as Income; update(s => ({ ...s, incomes: it ? s.incomes.map(x => x.id === it.id ? rec : x) : [...s.incomes, rec] })); close(); }} />;
  }
  const it = editing.item;
  const fields: FieldSpec[] = [
    { key: "name", label: "What", type: "text", placeholder: "e.g. Room rent", required: true },
    { key: "category", label: "Category", type: "select", options: opts(EXPENSE_LABEL) },
    { key: "amount", label: "Amount (₹)", type: "number", min: 0, required: true },
    { key: "freq", label: "How often", type: "select", options: freqOpts },
    { key: "ess", label: "Essential?", type: "select", options: [{ value: "auto", label: "Decide from category" }, { value: "yes", label: "Essential — can't cut without hardship" }, { value: "no", label: "Non-essential — can be cut" }] },
  ];
  return <FormSheet title={it ? "Edit spend" : "Add spend"} fields={fields}
    initial={it ? { ...it, ess: it.essential ? "yes" : "no" } : { name: "", category: "groceries", amount: "", freq: "monthly", ess: "auto" }} onCancel={close}
    onDelete={it ? () => { update(s => ({ ...s, expenses: s.expenses.filter(x => x.id !== it.id) })); close(); } : undefined}
    onSave={({ ess, ...v }) => {
      const essential = ess === "auto" ? ESSENTIAL_DEFAULT[v.category as Expense["category"]] : ess === "yes";
      const rec = { ...(it ?? { id: uid() }), ...v, essential } as Expense;
      update(s => ({ ...s, expenses: it ? s.expenses.map(x => x.id === it.id ? rec : x) : [...s.expenses, rec] })); close();
    }} />;
}

// ─── In-app notifications on open (calendar is the primary channel) ─────────
function useReminderNotifications(state: MoneyState) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !state.settings.remindersOn || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    done.current = true;
    const key = "lifeline-notified-" + new Date().toDateString();
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch { /* ignore */ }
    const urgent = upcomingDues(state).filter(d => d.status === "fund-now" || d.status === "due-today");
    const short = fundingPlan(state).filter(p => p.shortfall > 0);
    if (!urgent.length && !short.length) return;
    const body = short.length
      ? short.map(p => `Add ${inr(p.shortfall)} to ${p.account.name}`).join(" · ")
      : urgent.map(d => `${d.loan.name} ${inr(d.loan.emi)} on ${fmtDate(d.date)}`).join(" · ");
    navigator.serviceWorker?.getRegistration("/money/").then(reg => {
      if (reg) reg.showNotification("Lifeline: EMI action needed", { body, icon: "/icon-192.png", tag: "lifeline-" + ymKey(new Date()) });
      else new Notification("Lifeline: EMI action needed", { body });
    }).catch(() => { /* ignore */ });
  }, [state]);
}
