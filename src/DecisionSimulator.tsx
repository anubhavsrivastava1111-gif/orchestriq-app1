import React, { useMemo, useState } from "react";
import {
  compute, runScenario, parseChallenges, compareScenarios, decisionResponse, buildDecisionMap, explainDecisionChange, applyChallengesFromScenario,
  quickWhatIfs, fmt, INPUT_LABEL, SCENARIO_PRESETS, HORIZONS, DECISION_RANK, diagnose,
  type Inputs, type ScenarioState, type Challenge, type DecisionHandoff, type DecisionResponse,
} from "./lib/DecisionCockpit";
import { plainDecision } from "./lib/DecisionExperience";

// DECISION SIMULATOR (Time Machine) + OPERATING PLANNER (Autopilot).
// Both run on the Boardroom's canonical inputs (persisted handoff) with the
// deterministic engine: no AI call, nothing executed, every result labelled.
const P = { text: "inherit", muted: "rgba(148,163,184,.95)", border: "rgba(148,163,184,.35)", surface: "rgba(148,163,184,.07)", accent: "#8B5CF6", warn: "#F59E0B", danger: "#EF4444", success: "#10B981" };
const box: React.CSSProperties = { border: `1px solid ${P.border}`, borderRadius: 10, padding: "12px 14px", background: P.surface, marginBottom: 12 };
const h: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: P.muted, marginBottom: 6 };
const btn = (primary = false): React.CSSProperties => ({ padding: "6px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${primary ? P.accent : P.border}`, background: primary ? P.accent : "transparent", color: primary ? "#fff" : "inherit" });
const inputS: React.CSSProperties = { fontSize: 12.5, padding: "7px 10px", borderRadius: 7, border: `1px solid ${P.border}`, background: "transparent", color: "inherit" };
const dColor = (d: string) => (d === "PROCEED" ? P.success : d === "STOP" || d === "DO NOT PROCEED" ? P.danger : P.warn);

function NoBase({ what }: { what: string }) {
  return <div style={box}><div style={h}>{what}</div><div style={{ fontSize: 12.5, color: P.muted }}>Run an AI Boardroom question with figures (price, volume or revenue, costs, funding) first. The {what.toLowerCase()} uses that decision's canonical numbers — it never invents them.</div></div>;
}

// Magnitude questions for challenges whose size is unknown (never invented).
function Magnitudes({ pending, setPending }: { pending: { challenges: Challenge[]; questions: string[] }; setPending: (p: any) => void }) {
  const open = pending.challenges.filter((c) => c.change === null || (c.component && (c.share === null || c.share === undefined)));
  if (!open.length) return null;
  return (
    <div style={{ marginTop: 8, fontSize: 12.5 }}>
      <div style={{ color: P.muted }}>Impact direction known; magnitude uncertain. Enter a value to calculate it — or run with direction only (nothing is invented).</div>
      {open.map((c) => (
        <label key={c.id} style={{ display: "block", marginTop: 6 }}>{c.component && c.share == null ? "What share of your running costs is " + c.component + "? (%)" : c.variable === "funding" ? "How much funding do you actually have? (\u20b9, e.g. 8000000)" : c.variable === "delay" ? "Delay in months" : c.name + " \u2014 by how much? (" + (c.changeType === "pp" ? "percentage points" : "%") + ")"}
          <input style={{ ...inputS, marginLeft: 6, width: 130 }} onChange={(e: any) => { const n = parseFloat(e.target.value); const ok = isFinite(n);
            setPending({ ...pending, challenges: pending.challenges.map((x) => x.id !== c.id ? x : c.component && c.share == null ? { ...x, share: ok ? n : null }
              : c.variable === "funding" ? { ...x, change: ok ? n : null, changeType: "abs" } : { ...x, change: ok ? (c.direction === "down" && n > 0 && c.variable !== "delay" ? -n : n) : null, confidence: ok ? "user-stated" : "unknown-magnitude" }) }); }} /></label>))}
    </div>);
}

function Explained({ base, r }: { base: Inputs; r: ScenarioState }) {
  const why = explainDecisionChange(base, applyChallengesFromScenario(base, r), r.baseDecision, r.decisionResult);
  const o = r.simulationOutputs, b = compute(base);
  return (
    <div style={{ ...box, borderColor: dColor(r.decisionResult) }}>
      <div style={{ ...h, color: P.warn }}>SIMULATION — NOT A FORECAST · {r.name} · {r.horizonMonths} months</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, fontSize: 12.5 }}>
        <div><b>What changed?</b><br />{why.variables.length ? why.variables.join("; ") : "Nothing \u2014 base case."}{r.notApplied.length ? <div style={{ color: P.warn }}>Not calculated: {r.notApplied.join(" \u00b7 ")}</div> : null}</div>
        <div><b>What happens?</b><br />Decision: <b style={{ color: dColor(r.decisionResult) }}>{plainDecision(r.decisionResult)}</b>{r.decisionChanged ? " (was " + plainDecision(r.baseDecision) + ")" : ""}<br />
          Revenue {fmt(o.revenue, "INR")}{b.revenue ? " (" + Math.round(((o.revenue || 0) / b.revenue - 1) * 100) + "%)" : ""} · profit {fmt(o.profit, "INR")}/month<br />Cash at start {fmt(o.cashStart, "INR")} · runway {fmt(o.runwayMonths, "MONTHS")}</div>
        <div><b>Why does the decision {r.decisionChanged ? "change" : "hold"}?</b><br />{why.headline.replace(r.baseDecision, plainDecision(r.baseDecision)).replace(r.decisionResult, plainDecision(r.decisionResult))}{why.because.length ? <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>{why.because.slice(0, 4).map((x, i) => <li key={i}>{x}</li>)}</ul> : null}</div>
        <div><b>What should I do?</b><ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>{r.recommendedActions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><b>What could go wrong?</b><br />{r.projection.failureMonth !== null ? "Cash runs out in month " + r.projection.failureMonth + ". " + r.projection.recovery : "No cash failure within " + r.horizonMonths + " months on these assumptions."}</div>
      </div>
    </div>);
}

function CashChart({ runs }: { runs: ScenarioState[] }) {
  const rs = runs.filter((r) => r.projection.points.some((p) => p.cash !== null)); if (!rs.length) return null;
  const W = 560, H = 160, M = 30; const vals = rs.flatMap((r) => r.projection.points.map((p) => p.cash as number).filter((v) => v !== null));
  const mn = Math.min(0, ...vals), mx = Math.max(1, ...vals); const months = Math.max(...rs.map((r) => r.horizonMonths));
  const x = (m: number) => M + (W - 2 * M) * m / months, y = (v: number) => H - M - (H - 2 * M) * (v - mn) / (mx - mn || 1);
  const col = [P.accent, P.warn, P.danger, P.success, P.muted];
  return (<svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 600, height: "auto" }} role="img" aria-label="Cash over time by scenario (simulation)">
    <line x1={M} x2={W - M} y1={y(0)} y2={y(0)} stroke={P.border} strokeDasharray="4 3" /><text x={M} y={y(0) - 3} fontSize="9" fill={P.muted}>cash = 0</text>
    {rs.map((r, i) => <polyline key={r.scenarioId} fill="none" stroke={col[i % col.length]} strokeWidth="2" points={r.projection.points.filter((p) => p.cash !== null).map((p) => x(p.month) + "," + y(p.cash as number)).join(" ")} />)}
    {rs.map((r, i) => <text key={r.scenarioId + "t"} x={W - M} y={12 + i * 11} fontSize="9" textAnchor="end" fill={col[i % col.length]}>{r.name}</text>)}
    <text x={M} y={H - 8} fontSize="9" fill={P.muted}>month 0</text><text x={W - M} y={H - 8} fontSize="9" textAnchor="end" fill={P.muted}>month {months}</text></svg>);
}

// ── TIME MACHINE: deterministic decision simulator ───────────────────────────
export function TimeMachineSimulator({ handoff, saved, onSave, onSendToAutopilot }: { handoff: DecisionHandoff | null; saved: ScenarioState[]; onSave: (runs: ScenarioState[]) => void; onSendToAutopilot?: (actions: string[], label: string) => void }) {
  const base: Inputs = (handoff && handoff.inputs) || {};
  const [horizon, setHorizon] = useState(12); const [text, setText] = useState(""); const [pending, setPending] = useState<any>(null); const [active, setActive] = useState<ScenarioState | null>(null);
  const have = compute(base).revenue !== null;
  const runs = useMemo(() => (saved || []).filter((r) => !handoff || r.parentDecisionId === String(handoff.sessionId)).slice(-6), [saved, handoff]);
  if (!handoff || !Object.keys(base).length) return <NoBase what="Decision simulator" />;
  const go = (type: ScenarioState["scenarioType"], ch: Challenge[] = [], name?: string) => {
    const r = runScenario(base, type, ch, { parentDecisionId: String(handoff.sessionId), horizonMonths: horizon, name });
    setActive(r); onSave([...(saved || []), r].slice(-24));
  };
  const test = (t: string) => { const p = parseChallenges(t); if (!p.challenges.length) { setPending({ challenges: [], questions: [], summary: p.summary }); return; } setPending({ ...p, text: t }); };
  const cmp = runs.length ? compareScenarios(runs) : [];
  return (
    <div>
      <div style={box}>
        <div style={h}>Decision simulator — based on your Boardroom decision</div>
        <div style={{ fontSize: 12.5, marginBottom: 8 }}>“{handoff.question.slice(0, 140)}” → <b style={{ color: dColor(handoff.decision) }}>{plainDecision(handoff.decision)}</b>. Every result below is CALCULATED from that decision's numbers and labelled SIMULATION — not a forecast.</div>
        {!have && <div style={{ fontSize: 12.5, color: P.warn }}>The Boardroom decision has no revenue figure yet, so outcomes cannot be calculated. Add price × volume or monthly revenue in a follow-up question.</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {(Object.keys(SCENARIO_PRESETS) as ScenarioState["scenarioType"][]).map((k) => <button key={k} style={btn()} onClick={() => go(k)}>{SCENARIO_PRESETS[k].label}</button>)}
          <select value={horizon} onChange={(e: any) => setHorizon(parseInt(e.target.value))} style={inputS}>{HORIZONS.map((m) => <option key={m} value={m}>{m < 12 ? m + " months" : m === 12 ? "12 months" : m / 12 + " years"}</option>)}</select>
        </div>
        <div style={{ ...h, marginTop: 12, color: P.accent }}>What happens if… (you can combine several)</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={text} onChange={(e: any) => setText(e.target.value)} onKeyDown={(e: any) => e.key === "Enter" && text.trim() && test(text)} style={{ ...inputS, flex: 1 }}
            placeholder="e.g. Demand falls 20%, electricity costs rise 15%, and customers pay 30 days later" />
          <button style={btn(true)} onClick={() => text.trim() && test(text)}>Test it</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{quickWhatIfs(base).map((q, i) => <button key={i} style={btn()} onClick={() => test(q.text)}>What if {q.label.toLowerCase()}?</button>)}</div>
        {pending && (<div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: `1px solid ${P.border}` }}>
          <div style={{ fontSize: 12.5 }}><b>Understood:</b> {pending.summary}</div>
          <Magnitudes pending={pending} setPending={setPending} />
          {pending.challenges.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 8 }}><button style={btn(true)} onClick={() => { go("custom", pending.challenges, (pending.text || pending.summary).slice(0, 60)); setPending(null); }}>Run combined scenario</button><button style={btn()} onClick={() => setPending(null)}>Cancel</button></div>}
        </div>)}
      </div>
      {active && <Explained base={base} r={active} />}
      {runs.length > 0 && (<div style={box}>
        <div style={h}>Scenario comparison (SIMULATION — NOT A FORECAST)</div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr><th style={{ textAlign: "left", padding: 4 }}>Metric</th>{runs.map((r) => <th key={r.scenarioId} style={{ textAlign: "left", padding: 4 }}>{r.name}</th>)}</tr></thead>
          <tbody>{[...cmp, { metric: "Interest / month (debt burden)", values: runs.map((r) => fmt(r.simulationOutputs.interestCost, "INR")) }, { metric: "Payback", values: runs.map((r) => r.simulationOutputs.paybackMonths ? Math.round(r.simulationOutputs.paybackMonths) + " months" : "\u2014") }]
            .map((row) => <tr key={row.metric} style={{ borderTop: `1px solid ${P.border}` }}><td style={{ padding: 4, color: P.muted }}>{row.metric}</td>{row.values.map((v, i) => <td key={i} style={{ padding: 4, fontWeight: row.metric === "Decision" ? 700 : 400 }}>{row.metric === "Decision" ? plainDecision(v) : v}</td>)}</tr>)}</tbody>
        </table></div>
        <CashChart runs={runs} />
        {onSendToAutopilot && <button style={{ ...btn(true), marginTop: 8 }} onClick={() => { const ok = runs.filter((r) => DECISION_RANK[r.decisionResult] >= 2); const src = ok.length ? ok : runs;
          onSendToAutopilot(Array.from(new Set(src.flatMap((r) => r.recommendedActions))).slice(0, 6), "Time Machine \u2014 " + (ok.length ? "surviving scenarios" : "all scenarios")); }}>Send surviving actions to Autopilot / Action Tracker</button>}
      </div>)}
    </div>);
}

// ── AUTOPILOT: operating plan under the user's constraints ───────────────────
export function OperatingPlanner({ handoff, onAddActions, onSave }: { handoff: DecisionHandoff | null; onAddActions?: (texts: string[], label: string, notes?: string[]) => void; onSave?: (r: any) => void }) {
  const base: Inputs = (handoff && handoff.inputs) || {};
  const [text, setText] = useState(""); const [pending, setPending] = useState<any>(null); const [res, setRes] = useState<{ r: DecisionResponse; scen: ScenarioState; because: string } | null>(null);
  if (!handoff || !Object.keys(base).length) return <NoBase what="Operating planner" />;
  const plan = (ch: Challenge[], label: string) => {
    const scen = runScenario(base, "custom", ch, { parentDecisionId: String(handoff.sessionId), horizonMonths: 12, name: label });
    const map = buildDecisionMap({ analysis: { decision: { decision: plainDecision(handoff.decision), confidence: handoff.confidence, why: [] } }, inputs: base, intel: {} });
    const r = decisionResponse({ map, base, scenario: scen, priorDecision: { decision: handoff.decision, at: handoff.at } });
    const newIssue = diagnose(scen.simulationOutputs).find((x) => x.severity === "blocking") || diagnose(scen.simulationOutputs)[0];
    const alt = r.alternatives.find((a) => DECISION_RANK[a.decision] >= 2);
    const because = DECISION_RANK[scen.decisionResult] < DECISION_RANK[handoff.decision]
      ? "Because you introduced \u201c" + label + "\u201d, the original plan no longer works" + (newIssue ? ": " + newIssue.issue.charAt(0).toLowerCase() + newIssue.issue.slice(1) : ".") + (alt ? " Recommended alternative: " + alt.name + " (" + plainDecision(alt.decision) + ", calculated)." : " No calculated alternative restores it \u2014 protect cash and re-test when conditions change.")
      : "Under \u201c" + label + "\u201d the original plan still holds (" + plainDecision(scen.decisionResult) + ").";
    setRes({ r, scen, because }); onSave && onSave({ at: new Date().toISOString(), constraint: label, ...r, because });
  };
  const test = (t: string) => { const p = parseChallenges(t); setPending({ ...p, text: t }); };
  const F = res ? res.r : null;
  return (
    <div>
      <div style={box}>
        <div style={h}>Operating plan — “if I were running this business under these conditions, what would I do next?”</div>
        <div style={{ fontSize: 12.5, marginBottom: 8 }}>Starts from your Boardroom decision (<b style={{ color: dColor(handoff.decision) }}>{plainDecision(handoff.decision)}</b>). Advisory only — nothing is executed unless you add it to the Action Tracker yourself.</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={text} onChange={(e: any) => setText(e.target.value)} onKeyDown={(e: any) => e.key === "Enter" && text.trim() && test(text)} style={{ ...inputS, flex: 1 }}
            placeholder="e.g. Assume I have only ₹1 crore and my biggest customer pays 90 days late" />
          <button style={btn(true)} onClick={() => text.trim() && test(text)}>Re-plan</button>
          <button style={btn()} onClick={() => plan([], "current conditions")}>Plan as-is</button>
        </div>
        {pending && (<div style={{ marginTop: 10, fontSize: 12.5 }}><b>Constraints understood:</b> {pending.summary}
          <Magnitudes pending={pending} setPending={setPending} />
          <button style={{ ...btn(true), marginTop: 8 }} onClick={() => { plan(pending.challenges, (pending.text || pending.summary).slice(0, 80)); setPending(null); }}>Build operating plan</button></div>)}
      </div>
      {F && res && (<div style={box}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>{res.because}</div>
        {F.changedFromPrior && <div style={{ fontSize: 12.5, color: P.warn, marginBottom: 6 }}>Recommendation changed: {plainDecision(F.changedFromPrior.from)} → {plainDecision(F.changedFromPrior.to)}.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8, fontSize: 12.5 }}>
          {([["Current state", F.currentState], ["Recommended action", F.recommendedAction], ["Why", F.why], ["Expected impact", F.expectedImpact], ["Risk", F.risk], ["Trigger", F.trigger],
            ["Owner", F.owner], ["Deadline", F.deadline], ["Stop condition", F.stopCondition], ["Escalation", F.escalationCondition]] as [string, string][]).map(([k, v]) => <div key={k}><b>{k}</b><br />{v}</div>)}
          {F.alternatives.length > 0 && <div style={{ gridColumn: "1/-1" }}><b>Alternatives (calculated)</b><ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>{F.alternatives.map((a, i) => <li key={i}>{a.name} → {plainDecision(a.decision)} ({a.note})</li>)}</ul></div>}
          {(F.triggerStatus.stop || F.triggerStatus.escalate) && <div style={{ gridColumn: "1/-1", color: P.danger, fontWeight: 700 }}>{F.triggerStatus.stop ? "STOP CONDITION MET. " : ""}{F.triggerStatus.escalate ? "ESCALATION CONDITION MET. " : ""}{F.triggerStatus.reasons.join(" ")}</div>}
        </div>
        <div style={{ fontSize: 12, color: P.muted, marginTop: 8 }}>What should I monitor? {F.trigger}. {F.stopCondition} {F.escalationCondition}</div>
        {onAddActions && <button style={{ ...btn(true), marginTop: 8 }} onClick={() => onAddActions([F.recommendedAction], "Autopilot \u2014 " + res.scen.name, ["Owner: " + F.owner + " \u00b7 Deadline: " + F.deadline + " \u00b7 Trigger: " + F.trigger + " \u00b7 Stop: " + F.stopCondition + " \u00b7 Escalate: " + F.escalationCondition])}>Add to Action Tracker (you decide)</button>}
      </div>)}
    </div>);
}
