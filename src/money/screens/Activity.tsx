// Activity — every transaction captured from bank messages: spends, money received, cash, card swipes, EMIs.
import { useState } from "react";
import { useApp } from "../context";
import { inr } from "../engine";
import { monthSummary } from "../ingest";
import { ymOf } from "../cards";
import type { Txn, TxnKind } from "../types";
import { Button, Card, Empty, List, Row } from "../components";
import { Icon } from "../icons";
import { ago } from "../labels";
import { smsStatus, smsSupported } from "../native";

type Filter = "all" | "spends" | "received" | "cash" | "card" | "emi";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" }, { value: "spends", label: "Spends" }, { value: "received", label: "Received" },
  { value: "cash", label: "Cash" }, { value: "card", label: "Card" }, { value: "emi", label: "EMIs" },
];
const match: Record<Filter, (t: Txn) => boolean> = {
  all: () => true,
  spends: t => t.dir === "debit" && (t.kind === "spend" || t.kind === "card-spend"),
  received: t => t.dir === "credit" && (t.kind === "received" || t.kind === "salary" || t.kind === "refund" || t.kind === "cash-in"),
  cash: t => t.kind === "atm" || t.kind === "cash-in",
  card: t => !!t.cardId || t.kind === "card-spend" || t.kind === "card-payment" || t.kind === "statement",
  emi: t => t.kind === "emi",
};
const ICON: Record<TxnKind, { icon: string; tone: string }> = {
  spend: { icon: "spend", tone: "brand" }, "card-spend": { icon: "card", tone: "brand" }, atm: { icon: "wallet", tone: "warn" }, "cash-in": { icon: "wallet", tone: "good" },
  received: { icon: "income", tone: "good" }, salary: { icon: "income", tone: "good" }, emi: { icon: "calendar", tone: "warn" }, "card-payment": { icon: "check", tone: "good" },
  transfer: { icon: "transfer", tone: "neutral" }, refund: { icon: "refresh", tone: "good" }, statement: { icon: "doc", tone: "brand" }, other: { icon: "info", tone: "neutral" },
};
const KIND_WORD: Record<TxnKind, string> = {
  spend: "Paid", "card-spend": "Card", atm: "Cash withdrawn", "cash-in": "Cash deposit", received: "Received", salary: "Salary", emi: "EMI",
  "card-payment": "Card bill paid", transfer: "Transfer", refund: "Refund", statement: "Card bill", other: "Other",
};

export default function Activity() {
  const { state, open } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + monthOffset);
  const ym = ymOf(base);
  const sum = monthSummary(state.txns, ym);
  const review = state.txns.filter(t => t.status === "review");
  const list = state.txns.filter(t => t.status !== "ignored" && ymOf(new Date(t.date)) === ym && match[filter](t));
  const groups = new Map<string, Txn[]>();
  for (const t of list) { const k = new Date(t.date).toDateString(); groups.set(k, [...(groups.get(k) ?? []), t]); }
  const nameOf = (t: Txn) => (t.accountId ? state.accounts.find(a => a.id === t.accountId)?.name : t.cardId ? state.cards.find(c => c.id === t.cardId)?.name : undefined) ?? (t.last4 ? `ends ${t.last4}` : "Not linked");
  const sms = smsStatus();
  const smsOn = state.settings.smsCapture && sms.granted;

  // Group the review queue by account digits so one tap links many messages.
  const reviewGroups = new Map<string, Txn[]>();
  for (const t of review) { const k = t.last4 ?? "?"; reviewGroups.set(k, [...(reviewGroups.get(k) ?? []), t]); }

  return (
    <div className="screen">
      <div className="screen-head">
        <div className="screen-titles" style={{ flex: 1 }}><h1>Activity</h1><p>{smsOn ? `Reading bank messages${state.settings.smsScannedAt ? ` · inbox read ${ago(state.settings.smsScannedAt)}` : ""}` : "Spends, money in, cash and EMIs"}</p></div>
        <Button size="sm" icon={smsSupported() ? "refresh" : "doc"} onClick={() => open({ kind: smsSupported() ? "sms-setup" : "paste-sms" })}>{smsSupported() ? (smsOn ? "Sync" : "Turn on") : "Paste"}</Button>
      </div>

      {!smsOn && (
        <Card className="sms-cta" onClick={() => open({ kind: "sms-setup" })}>
          <span className="action-icon brand"><Icon name="bell" /></span>
          <div><b>Stop updating by hand</b><p>{smsSupported() ? "Let Lifeline read your bank messages. Balances, card swipes, cash, money received and EMIs are recorded automatically. OTPs and personal messages are never read." : "On Android, Lifeline reads bank messages for you. Here, paste a bank SMS and it's recorded in one tap."}</p></div>
          <Icon name="chevron" size={18} />
        </Card>
      )}

      {reviewGroups.size > 0 && (
        <Card tone="warn">
          <b className="review-title">{review.length} message{review.length > 1 ? "s" : ""} need you to pick the account</b>
          <List>
            {[...reviewGroups.entries()].map(([k, ts]) => (
              <Row key={k} icon="alert" iconTone="warn" title={k === "?" ? `${ts.length} without account digits` : `Account / card ending ${k}`}
                subtitle={`${ts.length} message${ts.length > 1 ? "s" : ""} · ${ts[0].bank ?? ""} · latest ${inr(ts[0].amount)}`} onClick={() => open({ kind: "txn", txnId: ts[0].id })} />
            ))}
          </List>
          <p className="note">Link it once. Lifeline remembers the digits and applies all of them.</p>
        </Card>
      )}

      <div className="month-nav">
        <button className="icon-btn" aria-label="Previous month" onClick={() => setMonthOffset(o => o - 1)}><Icon name="back" /></button>
        <b>{base.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</b>
        <button className="icon-btn" aria-label="Next month" disabled={monthOffset >= 0} onClick={() => setMonthOffset(o => Math.min(0, o + 1))}><Icon name="chevron" /></button>
      </div>
      <div className="act-summary">
        <button type="button" className={filter === "spends" ? "on" : ""} onClick={() => setFilter(f => (f === "spends" ? "all" : "spends"))}><small>Spent</small><b>{inr(sum.spent + sum.card)}</b><span>card {inr(sum.card)}</span></button>
        <button type="button" className={filter === "received" ? "on" : ""} onClick={() => setFilter(f => (f === "received" ? "all" : "received"))}><small>Received</small><b className="pos">{inr(sum.received)}</b></button>
        <button type="button" className={filter === "cash" ? "on" : ""} onClick={() => setFilter(f => (f === "cash" ? "all" : "cash"))}><small>Cash out</small><b>{inr(sum.cash)}</b></button>
        <button type="button" className={filter === "emi" ? "on" : ""} onClick={() => setFilter(f => (f === "emi" ? "all" : "emi"))}><small>EMIs</small><b>{inr(sum.emi)}</b></button>
      </div>
      <div className="filter-scroll chips" role="radiogroup" aria-label="Filter">
        {FILTERS.map(f => <button key={f.value} type="button" role="radio" aria-checked={filter === f.value} className={"chip" + (filter === f.value ? " on" : "")} onClick={() => setFilter(f.value)}>{f.label}</button>)}
      </div>

      {list.length === 0 ? (
        <Empty icon="chart" title={state.txns.length ? "Nothing here for this month" : "No transactions yet"}
          text={state.txns.length ? "Try another month or filter." : smsSupported() ? "Turn on bank messages and your spends, cash and money received appear here by themselves." : "Paste a bank message to record it."} />
      ) : [...groups.entries()].map(([d, ts]) => (
        <section key={d} className="day-group">
          <div className="day-head"><span>{new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span><span>{dayNet(ts)}</span></div>
          <List>
            {ts.map(t => (
              <Row key={t.id} icon={ICON[t.kind].icon} iconTone={t.status === "review" ? "warn" : ICON[t.kind].tone}
                title={t.party || KIND_WORD[t.kind]}
                subtitle={`${KIND_WORD[t.kind]} · ${nameOf(t)} · ${new Date(t.date).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}${t.status === "review" ? " · tap to link" : ""}`}
                value={t.kind === "statement" ? inr(t.amount) : `${t.dir === "credit" ? "+" : "−"}${inr(t.amount)}`} valueTone={t.dir === "credit" ? "pos" : undefined}
                onClick={() => open({ kind: "txn", txnId: t.id })} />
            ))}
          </List>
        </section>
      ))}
      <p className="note center">Tap any transaction to see the original message and what Lifeline changed.</p>
    </div>
  );
}

function dayNet(ts: Txn[]): string {
  const out = ts.filter(t => t.kind !== "transfer" && t.kind !== "statement" && t.kind !== "card-payment").reduce((n, t) => n + (t.dir === "credit" ? t.amount : t.dir === "debit" ? -t.amount : 0), 0);
  return out === 0 ? "" : (out > 0 ? "+" : "−") + inr(Math.abs(out));
}
