// Goals — what to fund first, goal plans with scenarios, and the suggested mix for your risk profile.
import { useMemo } from "react";
import { useApp, type Tab } from "../context";
import { inr } from "../engine";
import { GOAL_KINDS, PROFILES, goalMonthlyTotal, nextRupeeLadder, planGoal } from "../wealth";
import type { GoalKind } from "../types";
import { BROKER_APPS } from "../market";
import { installedApps, isNative, openApp, openExternal } from "../native";
import { Button, Card, MeterBar, Pill, Section } from "../components";
import { Icon } from "../icons";

const QUICK: GoalKind[] = ["emergency", "car", "trip", "home", "education", "gadget", "wedding", "retirement"];

export default function Goals() {
  const { state, open, go } = useApp();
  const ladder = useMemo(() => nextRupeeLadder(state), [state]);
  const committed = goalMonthlyTotal(state);
  const free = ladder.investable - committed;
  const risk = state.wealth.risk;
  const spec = risk ? PROFILES[risk] : null;
  const brokers = useMemo(() => installedApps(BROKER_APPS.map(b => b.pkg)), []);

  return (
    <>
      <div className="hero hero-calm">
        <div className="hero-top"><span>You can invest each month</span>{spec ? <Pill tone="good">{spec.label} investor</Pill> : <Pill>Profile not set</Pill>}</div>
        <div className="hero-amount">{inr(Math.max(0, ladder.investable))}</div>
        <p className="hero-sub">{ladder.investable <= 0 ? "Close your monthly gap first. Investing borrowed money only adds risk." : committed > 0 ? `${inr(committed)} committed to goals · ${inr(Math.max(0, free))} still free` : "What's left after EMIs and spends. Give it a job below."}</p>
        <div className="btn-row"><Button size="sm" icon="user" onClick={() => open({ kind: "risk-quiz" })}>{risk ? "Retake risk quiz" : "Find my risk profile (1 min)"}</Button></div>
      </div>

      <Section title="Where your next rupee should go" hint="The order professionals follow. Skipping steps usually costs more than it earns.">
        <div className="ladder">
          {ladder.steps.map((s, i) => (
            <div key={s.id} className={"ladder-step " + s.status}>
              <span className="ladder-dot">{s.status === "done" ? <Icon name="check" size={14} /> : i + 1}</span>
              <div className="ladder-body">
                <div className="ladder-head"><b>{s.title}</b><span className="ladder-ret">{s.returnNote}</span></div>
                <p>{s.detail}</p>
                {s.status === "now" && s.action && <Button size="sm" variant="primary" onClick={() => go(s.action!.tab as Tab, s.action!.sub)}>{s.action.label}</Button>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Your goals" action={<Button size="sm" variant="primary" icon="plus" onClick={() => open({ kind: "goal" })}>New goal</Button>}>
        {state.goals.length === 0 && (
          <Card>
            <p>What are you saving for? Pick one to see exactly how much to put aside each month, with inflation and market ups and downs built in.</p>
            <div className="chips" style={{ marginTop: 10 }}>
              {QUICK.map(k => <button key={k} type="button" className="chip" onClick={() => open({ kind: "goal", preset: k })}><Icon name={GOAL_KINDS[k].icon} size={16} />{GOAL_KINDS[k].label}</button>)}
            </div>
          </Card>
        )}
        {state.goals.map(g => {
          const plan = planGoal(g);
          const progress = plan.futureCost > 0 ? Math.min(1, g.saved / plan.futureCost) : 0;
          const success = plan.chosen?.sim.successPct;
          return (
            <Card key={g.id} className="goal-card" onClick={() => open({ kind: "goal", item: g })}>
              <div className="goal-top">
                <span className="action-icon brand"><Icon name={GOAL_KINDS[g.kind].icon} /></span>
                <div className="goal-title"><b>{g.name}</b><small>{new Date(g.targetYm + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" })} · needs {inr(plan.futureCost)} then</small></div>
                {success !== undefined && <Pill tone={success >= 75 ? "good" : success >= 50 ? "warn" : "danger"}>{success.toFixed(0)}% on track</Pill>}
              </div>
              <MeterBar value={progress} max={1} cls="fill-good" />
              <div className="goal-meta"><span>Saved {inr(g.saved)}</span><span>{g.monthly > 0 ? `${inr(g.monthly)}/mo · ${PROFILES[g.profile].label}` : "Tap to plan"}</span></div>
            </Card>
          );
        })}
      </Section>

      {spec && (
        <Section title={`A ${spec.label.toLowerCase()} mix for long-term money`} hint={`Expected about ${spec.expected}% a year over the long run, with years as bad as ${spec.worstYear}%. Categories, not specific products.`}>
          <Card>
            {spec.mix.map(m => (
              <div key={m.label} className="cat-bar">
                <div className="cat-bar-head"><span>{m.label}</span><b>{m.pct}%</b></div>
                <MeterBar value={m.pct} max={100} cls="fill-brand" />
                <small className="mix-ex">{m.examples}</small>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Start investing safely" hint="Direct plans have lower costs. Always check the fund's factsheet first.">
        <div className="chips">
          {BROKER_APPS.map(b => <button key={b.id} type="button" className="chip" onClick={() => { if (!(isNative && brokers.has(b.pkg) && openApp(b.pkg))) openExternal(b.web); }}>{b.name}{brokers.has(b.pkg) ? " ✓" : ""}</button>)}
          <button type="button" className="chip" onClick={() => openExternal("https://app.mfcentral.com")}>MF Central</button>
          <button type="button" className="chip" onClick={() => openExternal("https://rbiretaildirect.org.in")}>RBI Retail Direct (bonds)</button>
        </div>
      </Section>

      <p className="note">Lifeline gives educational projections, not investment advice. Past returns don't guarantee future returns; markets can fall sharply. For personal advice, consult a SEBI-registered investment adviser.</p>
    </>
  );
}
