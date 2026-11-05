// Bills — calendar, loans, accounts.
import { useMemo, useState } from "react";
import { useApp } from "../context";
import { dueDateIn, inr, upcomingDues, ymKey, type DueItem } from "../engine";
import { LOAN_TYPE_LABEL } from "../types";
import { Button, Card, Empty, List, Row, Screen, Section, Segmented } from "../components";
import { Icon } from "../icons";
import { LOAN_ICON, ago, isStale } from "../labels";
import { statusPill, useMarkPaid } from "../dues";

type Sub = "calendar" | "loans" | "accounts";

export default function Bills() {
  const { sub, go, open, state } = useApp();
  const view: Sub = (["calendar", "loans", "accounts"] as Sub[]).includes(sub as Sub) ? (sub as Sub) : "calendar";
  return (
    <Screen title="Bills & accounts" subtitle={`${state.loans.length} EMIs · ${state.accounts.length} accounts`}
      action={<button className="icon-btn" aria-label="Reminders" onClick={() => open({ kind: "reminders" })}><Icon name="bell" /></button>}>
      <Segmented label="Bills view" value={view} onChange={v => go("bills", v)} options={[
        { value: "calendar", label: "Calendar" }, { value: "loans", label: "Loans" }, { value: "accounts", label: "Accounts" },
      ]} />
      {view === "calendar" && <CalendarView />}
      {view === "loans" && <LoansView />}
      {view === "accounts" && <AccountsView />}
    </Screen>
  );
}

function CalendarView() {
  const { state, open } = useApp();
  const today = new Date();
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<number | null>(today.getDate());
  const markPaid = useMarkPaid();
  const base = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const y = base.getFullYear(), m = base.getMonth();
  const ym = ymKey(base);
  const dim = new Date(y, m + 1, 0).getDate();
  const lead = (base.getDay() + 6) % 7; // Monday first

  // EMI occurrences in the visible month, with status where we have it.
  const items = useMemo(() => {
    const known = upcomingDues(state, today, 70);
    return state.loans.map(loan => {
      const date = dueDateIn(loan, y, m);
      const k = known.find(d => d.loan.id === loan.id && d.ym === ym);
      const paid = loan.paidMonths.includes(ym);
      return k ?? ({ loan, date, fundBy: date, ym, daysLeft: 0, status: paid ? "paid" : date < today ? "confirm" : "upcoming" } as DueItem);
    });
  }, [state, y, m, ym]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = new Map<number, DueItem[]>();
  for (const it of items) byDay.set(it.date.getDate(), [...(byDay.get(it.date.getDate()) ?? []), it]);
  const monthTotal = items.reduce((s, i) => s + i.loan.emi, 0);
  const paidTotal = items.filter(i => i.status === "paid").reduce((s, i) => s + i.loan.emi, 0);
  const selItems = sel ? byDay.get(sel) ?? [] : [];

  if (!state.loans.length) return <Empty icon="calendar" title="No EMIs yet" text="Add your EMIs to see them on a calendar." action={<Button variant="primary" icon="plus" onClick={() => open({ kind: "loan" })}>Add EMI</Button>} />;

  return (
    <>
      <Card>
        <div className="cal-head">
          <button className="icon-btn" aria-label="Previous month" onClick={() => { setOffset(o => o - 1); setSel(null); }}><Icon name="back" /></button>
          <div><b>{base.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</b><small>{inr(paidTotal)} paid of {inr(monthTotal)}</small></div>
          <button className="icon-btn" aria-label="Next month" onClick={() => { setOffset(o => o + 1); setSel(null); }}><Icon name="chevron" /></button>
        </div>
        <div className="cal-grid" role="grid">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={"b" + i} />)}
          {Array.from({ length: dim }, (_, i) => i + 1).map(d => {
            const its = byDay.get(d) ?? [];
            const isToday = offset === 0 && d === today.getDate();
            const worst = its.some(i => i.status === "confirm") ? "danger" : its.some(i => i.status === "fund-now" || i.status === "due-today") ? "warn" : its.length && its.every(i => i.status === "paid") ? "good" : "";
            return (
              <button key={d} type="button" className={`cal-day ${isToday ? "today" : ""} ${sel === d ? "sel" : ""} ${its.length ? "has" : ""}`} onClick={() => setSel(d)} aria-label={`${d}${its.length ? `, ${its.length} EMI` : ""}`}>
                {d}{its.length > 0 && <span className={"cal-dot" + (worst ? " t-" + worst : "")} />}
              </button>
            );
          })}
        </div>
        <div className="cal-legend"><span><i className="cal-dot" />Upcoming</span><span><i className="cal-dot t-warn" />Fund now</span><span><i className="cal-dot t-good" />Paid</span><span><i className="cal-dot t-danger" />Check</span></div>
      </Card>
      <Section title={sel ? `${sel} ${base.toLocaleDateString("en-IN", { month: "long" })}` : "Select a day"}>
        {selItems.length === 0 ? <p className="muted">No EMIs on this day.</p> : (
          <List>
            {selItems.map(d => (
              <div key={d.loan.id} className="row">
                <span className="row-icon brand"><Icon name={LOAN_ICON[d.loan.type]} /></span>
                <span className="row-main"><span className="row-title">{d.loan.name}</span><span className="row-sub">{inr(d.loan.emi)} · {state.accounts.find(a => a.id === d.loan.accountId)?.name}</span><span>{statusPill(d)}</span></span>
                {offset === 0 && d.status !== "paid" && <Button size="sm" onClick={() => markPaid(d, true)}>Paid</Button>}
              </div>
            ))}
          </List>
        )}
      </Section>
    </>
  );
}

function LoansView() {
  const { state, open } = useApp();
  const totalEmi = state.loans.reduce((s, l) => s + l.emi, 0);
  const out = state.loans.reduce((s, l) => s + l.outstanding, 0);
  const wRate = out ? state.loans.reduce((s, l) => s + l.ratePct * l.outstanding, 0) / out : 0;
  return (
    <>
      <div className="stat-strip">
        <div><small>Monthly EMIs</small><b>{inr(totalEmi)}</b></div>
        <div><small>Total owed</small><b>{inr(out)}</b></div>
        <div><small>Avg. interest</small><b>{wRate.toFixed(1)}%</b></div>
      </div>
      <Section title="Your loans" action={<Button size="sm" variant="primary" icon="plus" onClick={() => open({ kind: "loan" })}>Add</Button>}>
        {state.loans.length === 0 ? <Empty icon="card" title="No EMIs yet" text="Add each loan, credit card or EMI purchase." /> : (
          <List>
            {[...state.loans].sort((a, b) => a.dueDay - b.dueDay).map(l => (
              <Row key={l.id} icon={LOAN_ICON[l.type]} iconTone={l.ratePct >= 24 ? "danger" : "brand"} title={l.name}
                subtitle={`Day ${l.dueDay} · ${l.lender || LOAN_TYPE_LABEL[l.type]} · ${l.ratePct}%${l.outstanding ? ` · ${inr(l.outstanding)} owed` : ""}`}
                value={inr(l.emi)} onClick={() => open({ kind: "loan", item: l })} />
            ))}
          </List>
        )}
      </Section>
      <Section title="Tools">
        <List>
          <Row icon="bell" iconTone="brand" title="Reminders" subtitle={state.settings.calendarAdded ? "Added to calendar · re-add after changes" : "Not set up yet"} onClick={() => open({ kind: "reminders" })} />
          <Row icon="doc" iconTone="brand" title="Letters to your lender" subtitle="Change EMI date, lower EMI, statement, complaints" onClick={() => open({ kind: "letter" })} />
        </List>
      </Section>
    </>
  );
}

function AccountsView() {
  const { state, open } = useApp();
  const total = state.accounts.reduce((s, a) => s + a.balance, 0);
  return (
    <>
      <div className="stat-strip">
        <div><small>Total balance</small><b>{inr(total)}</b></div>
        <div><small>Accounts</small><b>{state.accounts.length}</b></div>
      </div>
      {state.accounts.length > 0 && <Button variant="primary" full icon="refresh" onClick={() => open({ kind: "balances" })}>Update all balances</Button>}
      <Section title="Bank accounts" action={<Button size="sm" icon="plus" onClick={() => open({ kind: "account" })}>Add</Button>}>
        {state.accounts.length === 0 ? <Empty icon="bank" title="No accounts yet" text="Add the accounts your EMIs debit from." /> : (
          <List>
            {state.accounts.map(a => {
              const stale = isStale(a.updatedAt);
              const n = state.loans.filter(l => l.accountId === a.id).length;
              return (
                <Row key={a.id} icon="bank" iconTone="brand" title={a.name}
                  subtitle={<>{n} EMI{n === 1 ? "" : "s"} · updated <span className={stale ? "neg" : ""}>{ago(a.updatedAt)}</span>{a.minBalance ? ` · keeps ${inr(a.minBalance)}` : ""}</>}
                  value={inr(a.balance)} onClick={() => open({ kind: "account", item: a })} />
              );
            })}
          </List>
        )}
      </Section>
    </>
  );
}
