// Investments — portfolio with live prices, set against the user's debts.
import { useState } from "react";
import { useApp } from "../context";
import { inr, loansOf } from "../engine";
import { HOLDING_LABEL, type HoldingKind } from "../types";
import { holdingInvested, holdingValue, isPriced, portfolio, refreshPrices } from "../market";
import { isPro } from "../entitlements";
import { Button, Card, Empty, List, Pill, Row, Section, StackBar } from "../components";
import { Icon } from "../icons";

const KIND_ICON: Record<HoldingKind, string> = { stock: "chart", mf: "grow", fd: "bank", gold: "star", epf: "shield", crypto: "sparkle", other: "wallet" };
const KIND_CLS: Record<HoldingKind, string> = { stock: "c-ess", mf: "c-left", fd: "c-emi", gold: "c-gold", epf: "c-non", crypto: "c-gap", other: "c-non" };

export default function Invest() {
  const { state, update, open, toast, go } = useApp();
  const [busy, setBusy] = useState(false);
  const p = portfolio(state.holdings);
  const costly = loansOf(state).filter(l => l.ratePct >= 18 && l.outstanding > 0);
  const costlyOwed = costly.reduce((s, l) => s + l.outstanding, 0);
  const pricedCount = state.holdings.filter(isPriced).length;

  const refresh = async () => {
    if (!isPro(state)) { open({ kind: "paywall", feature: "invest" }); return; }
    setBusy(true);
    try {
      const r = await refreshPrices(state);
      update(s => ({ ...s, holdings: r.holdings }));
      toast(r.errors.length ? r.errors[0] : `Updated ${r.updated} price${r.updated === 1 ? "" : "s"}`);
    } finally { setBusy(false); }
  };

  if (!state.holdings.length) {
    return (
      <Empty icon="chart" title="Track your investments" text="Add mutual funds, stocks, FDs, gold or PF. Lifeline fetches fund NAVs automatically and checks whether investments should be used to clear expensive debt."
        action={<Button variant="primary" icon="plus" onClick={() => open({ kind: "holding" })}>Add investment</Button>} />
    );
  }

  return (
    <>
      <div className="hero hero-calm">
        <div className="hero-top"><span>Portfolio value</span><Pill tone={p.gain >= 0 ? "good" : "danger"}>{p.gain >= 0 ? "+" : ""}{p.gainPct.toFixed(1)}%</Pill></div>
        <div className="hero-amount">{inr(p.value)}</div>
        <p className="hero-sub">Invested {inr(p.invested)} · {p.gain >= 0 ? "Gain" : "Loss"} {inr(Math.abs(p.gain))}</p>
        <div className="hero-stats">
          <div><small>Liquid (quick to withdraw)</small><b>{inr(p.liquid)}</b></div>
          <div><small>Expensive debt (18%+)</small><b className={costlyOwed ? "neg-light" : ""}>{inr(costlyOwed)}</b></div>
        </div>
      </div>

      {costlyOwed > 0 && p.liquid > 0 && (
        <Card tone="warn">
          <div className="action">
            <span className="action-icon warn"><Icon name="alert" /></span>
            <div className="action-body">
              <b>Your debt costs more than your investments earn</b>
              <p>{costly.map(l => `${l.name} at ${l.ratePct}%`).join(", ")}. Investments rarely beat 18%+ reliably. Using up to {inr(Math.min(p.liquid, costlyOwed))} of liquid investments to repay could save about {inr(Math.min(p.liquid, costlyOwed) * (costly.reduce((s, l) => s + l.ratePct * l.outstanding, 0) / costlyOwed - 12) / 100)} a year. Keep 3 months of expenses aside first.</p>
              <div className="btn-row"><Button size="sm" onClick={() => go("ai")} icon="sparkle">Ask AI to check this</Button></div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <StackBar parts={p.byKind.map(k => ({ label: HOLDING_LABEL[k.kind], value: k.value, cls: KIND_CLS[k.kind] }))} />
      </Card>

      <Section title="Holdings" action={<div className="btn-row tight">
        {pricedCount > 0 && <Button size="sm" icon="refresh" onClick={refresh} disabled={busy}>{busy ? "Updating…" : "Prices"}</Button>}
        <Button size="sm" variant="primary" icon="plus" onClick={() => open({ kind: "holding" })}>Add</Button>
      </div>}>
        <List>
          {state.holdings.map(h => {
            const v = holdingValue(h), inv = holdingInvested(h), g = v - inv;
            return (
              <Row key={h.id} icon={KIND_ICON[h.kind]} iconTone={g >= 0 ? "good" : "danger"} title={h.name}
                subtitle={<>{HOLDING_LABEL[h.kind]}{h.symbol ? ` · ${h.symbol}` : ""} · <span className={g >= 0 ? "pos" : "neg"}>{g >= 0 ? "+" : ""}{inr(g)}</span>{h.priceAt ? ` · price ${new Date(h.priceAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</>}
                value={inr(v)} onClick={() => open({ kind: "holding", item: h })} />
            );
          })}
        </List>
      </Section>
      <p className="note">Prices: mutual funds from AMFI via mfapi.in; stocks from Alpha Vantage (your key). Values are indicative. Lifeline doesn't give buy/sell recommendations.</p>
    </>
  );
}
