import React, { useMemo, useState, useEffect } from "react";
import {
  inputsFromRegistry, compute, buildDecisionMap, runScenario, parseChallenge, compareScenarios, decisionResponse, buildHandoff,
  quickWhatIfs, applyChallengesFromScenario, fmt, INPUT_LABEL, SCENARIO_PRESETS, HORIZONS, DECISION_RULES,
  type ScenarioState, type Challenge, type InputKey, type DecisionResponse,
} from "./lib/DecisionCockpit";

// DECISION COCKPIT - the first thing a founder sees after a Boardroom run.
// Everything here is CALCULATED from the canonical model (no AI call). Simulations
// are labelled SIMULATION RESULT and never replace evidence.
const DTONE: Record<string, string> = { "PROCEED": "success", "PROCEED WITH CONDITIONS": "warn", "WAIT": "warn", "DO NOT PROCEED": "danger", "INSUFFICIENT EVIDENCE": "muted" };

export default function DecisionCockpitView({ cur, si, analysis, tok, saveCockpit, addCockpitActions, openInTimeMachine, showToast }: any) {
  const rs = cur?.researchState || {};
  const intel = rs.intelligence || {};
  const inputs = useMemo(() => inputsFromRegistry(analysis?.registry || {}), [analysis]);
  const saved: ScenarioState[] = Array.isArray(rs.scenarios) ? rs.scenarios : [];
  const map = useMemo(() => buildDecisionMap({ analysis, inputs, intel, scenarios: saved }), [analysis, inputs, intel, saved]);
  const [horizon, setHorizon] = useState<number>(12);
  const [challengeText, setChallengeText] = useState("");
  const [pending, setPending] = useState<{ challenges: Challenge[]; questions: string[]; summary: string } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [active, setActive] = useState<ScenarioState | null>(null);
  const [detail, setDetail] = useState(false);
  const [response, setResponse] = useState<DecisionResponse | null>(null);
  const [showOverrides, setShowOverrides] = useState(false);

  // Record the Boardroom decision once so Autopilot and later runs treat it as settled.
  useEffect(() => {
    if (!analysis || !saveCockpit || si !== (cur?.stages || []).length - 1) return;
    if (rs.cockpitDecision && rs.cockpitDecision.decision === map.decision) return;
    saveCockpit({ cockpitDecision: { decision: map.decision, at: new Date().toISOString() } },
      buildHandoff({ sessionId: cur.sessionId || "", question: cur.q || "", map, scenarios: saved }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.decision]);

  if (!analysis) return null;
  const tone = (d: string) => (tok as any)[DTONE[d] || "muted"] || tok.text2;
  const toneBg = (d: string) => (tok as any)[(DTONE[d] || "muted") + "Bg"] || tok.surface2;
  const card = (title: string, body: any, extra?: any) => (
    <div style={{ borderRadius: 10, border: `1px solid ${tok.border}`, background: tok.surface, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: tok.text3, letterSpacing: ".1em", textTransform: "uppercase" }}>{title}</div>
        <div style={{ marginLeft: "auto" }}>{extra}</div>
      </div>{body}</div>);
  const ul = (xs: string[]) => <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.55, color: tok.text2 }}>{xs.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  const btn = (label: string, onClick: () => void, primary = false, disabled = false) => (
    <button onClick={onClick} disabled={disabled} style={{ padding: "6px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: disabled ? "default" : "pointer",
      border: `1px solid ${primary ? tok.accent : tok.border}`, background: primary ? tok.accent : tok.surface, color: primary ? "#fff" : tok.text2, opacity: disabled ? .5 : 1 }}>{label}</button>);
  const openGates = map.gates.filter((g) => g.status !== "PASS").length;
  const lastOf = (stage: any) => stage?.question || cur?.q || "";

  const persistRun = (run: ScenarioState, newChallenges: Challenge[] = []) => {
    const scenarios = [...saved, run].slice(-12);
    const challenges = [...(Array.isArray(rs.challenges) ? rs.challenges : []), ...newChallenges].slice(-30);
    saveCockpit && saveCockpit({ scenarios, challenges }, buildHandoff({ sessionId: cur.sessionId || "", question: cur.q || "", map, scenarios, response }));
  };
  const run = (type: ScenarioState["scenarioType"], challenges: Challenge[] = [], name?: string) => {
    const ov = Object.entries(overrides).filter(([, v]) => v.trim() !== "" && isFinite(parseFloat(v))).map(([k, v]) => ({ variable: k as InputKey, to: parseFloat(v) }));
    const r = runScenario(inputs, type, challenges, { parentDecisionId: String(cur.sessionId || "") + ":stage-" + (si + 1), horizonMonths: horizon, openCriticalGates: openGates, name, overrides: ov });
    setActive(r); setDetail(false); persistRun(r, challenges.filter((c) => c.userEntered));
  };
  const parseAndRun = (text: string) => {
    const pc = parseChallenge(text);
    if (!pc.challenges.length) { showToast && showToast("Could not link that to a model variable. Try e.g. \u201cdemand falls 20%\u201d or \u201csevere water shortage\u201d.", "warning"); return; }
    if (pc.challenges.some((c) => c.change === null)) { setPending(pc); return; }   // ask for magnitude (max 3 questions) before running
    run("custom", pc.challenges, text.slice(0, 60));
  };
  const askAutopilot = () => {
    const prior = rs.cockpitDecision || null;
    const r = decisionResponse({ map, base: inputs, scenario: active, priorDecision: prior });
    setResponse(r);
    saveCockpit && saveCockpit({ decisionResponses: [...(Array.isArray(rs.decisionResponses) ? rs.decisionResponses : []), { ...r, at: new Date().toISOString(), scenario: active ? active.name : null }].slice(-10) },
      buildHandoff({ sessionId: cur.sessionId || "", question: cur.q || "", map, scenarios: saved, response: r }));
  };
  const compareSet = [...(saved.length ? saved.slice(-4) : [])];
  const cmp = compareSet.length ? compareScenarios(compareSet) : [];
  const baseOut = compute(inputs);

  // Cash trajectory chart (only when cash can be calculated) - compares scenarios.
  const chart = (() => {
    const runs = compareSet.filter((r) => r.projection.points.some((p) => p.cash !== null));
    if (!runs.length) return null;
    const W = 520, H = 150, P = 28; const all = runs.flatMap((r) => r.projection.points.map((p) => p.cash as number));
    const mn = Math.min(0, ...all), mx = Math.max(...all, 1); const months = Math.max(...runs.map((r) => r.horizonMonths));
    const x = (m: number) => P + (W - 2 * P) * m / months, y = (v: number) => H - P - (H - 2 * P) * (v - mn) / (mx - mn || 1);
    const colors = [tok.accent, tok.warn, tok.danger, tok.text3];
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 560, height: "auto" }} role="img" aria-label="Cash trajectory by scenario">
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke={tok.border} strokeDasharray="4 3" />
        <text x={P} y={y(0) - 3} fontSize="9" fill={tok.muted}>cash = 0</text>
        {runs.map((r, i) => <polyline key={r.scenarioId} fill="none" stroke={colors[i % colors.length]} strokeWidth="2"
          points={r.projection.points.filter((p) => p.cash !== null).map((p) => x(p.month) + "," + y(p.cash as number)).join(" ")} />)}
        {runs.map((r, i) => <text key={r.scenarioId + "l"} x={W - P} y={14 + i * 11} fontSize="9" textAnchor="end" fill={colors[i % colors.length]}>{r.name}</text>)}
        <text x={P} y={H - 8} fontSize="9" fill={tok.muted}>month 0</text><text x={W - P} y={H - 8} fontSize="9" textAnchor="end" fill={tok.muted}>month {months}</text>
      </svg>);
  })();

  return (
    <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 1-3: DECISION, CONFIDENCE, WHY */}
      <div style={{ borderRadius: 12, border: `1px solid ${tok.border}`, background: tok.surface, boxShadow: tok.shadow, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: tok.text3, letterSpacing: ".12em" }}>DECISION</span>
          <span style={{ fontSize: 17, fontWeight: 800, padding: "3px 10px", borderRadius: 6, background: toneBg(map.decision), color: tone(map.decision) }}>{map.decision}</span>
          <span style={{ fontSize: 12, color: tok.text3 }}>Confidence: <b style={{ color: tok.text }}>{map.confidence}</b></span>
          {map.modelDecision !== map.decision && map.modelDecision !== "INSUFFICIENT EVIDENCE" && <span style={{ fontSize: 11, color: tok.muted }}>(economics alone: {map.modelDecision})</span>}
        </div>
        <div style={{ fontSize: 14, color: tok.text, marginTop: 8, lineHeight: 1.5 }}>{map.oneSentence}</div>
        {map.simulationNotes.map((n, i) => <div key={i} style={{ fontSize: 11.5, color: tok.warn, marginTop: 4 }}>{n}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
        {card("Why this decision", ul(map.why.length ? map.why : ["No calculable reason yet."]))}
        {card("What matters most", ul(map.mattersMost.length ? map.mattersMost : ["Threshold cannot be calculated from current evidence."]))}
        {card("Next 3 actions", <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, color: tok.text }}>{map.nextActions.map((a, i) => <li key={i}>{a}</li>)}</ol>,
          addCockpitActions ? btn("Add to Action Tracker", () => addCockpitActions(map.nextActions, "Decision Cockpit \u2014 \u201c" + lastOf(cur.stages[si]).slice(0, 40) + "\u201d")) : null)}
      </div>
      {/* 6 + 20: DECISION GATES and the visual map generated from them */}
      {card("Decision gates", (<>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, margin: "4px 0 12px", fontSize: 11.5 }}>
          <div style={{ color: tok.muted }}>CURRENT POSITION</div><div>↓</div>
          <div style={{ fontWeight: 800, padding: "3px 10px", borderRadius: 6, background: toneBg(map.decision), color: tone(map.decision) }}>{map.decision}</div><div>↓</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {map.gates.slice(0, 5).map((g, i) => (
              <div key={i} title={g.name} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${g.status === "PASS" ? tok.success : g.status === "FAIL" ? tok.danger : tok.border}`,
                color: g.status === "PASS" ? tok.success : g.status === "FAIL" ? tok.danger : tok.text2, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.name.replace(/^Your answer: |^Evidence: /, "").slice(0, 28)} · <b>{g.status}</b></div>))}
          </div><div>↓</div>
          <div style={{ color: tok.text2 }}>{map.decision === "PROCEED" ? "SCALE" : "PILOT"} → Time Machine → Autopilot → SCALE / STOP</div>
        </div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead><tr style={{ color: tok.text3, textAlign: "left" }}>{["Gate", "Status", "Threshold", "Current", "Evidence", "Owner", "If pass", "If fail"].map((h) => <th key={h} style={{ padding: "4px 6px", borderBottom: `1px solid ${tok.border}` }}>{h}</th>)}</tr></thead>
          <tbody>{map.gates.map((g, i) => (<tr key={i} style={{ color: tok.text2 }}>
            <td style={{ padding: "4px 6px" }}>{g.name}</td><td style={{ padding: "4px 6px", fontWeight: 700, color: g.status === "PASS" ? tok.success : g.status === "FAIL" ? tok.danger : tok.warn }}>{g.status}</td>
            <td style={{ padding: "4px 6px" }}>{g.threshold}</td><td style={{ padding: "4px 6px" }}>{g.current}</td><td style={{ padding: "4px 6px" }}>{g.evidence}</td>
            <td style={{ padding: "4px 6px" }}>{g.owner}</td><td style={{ padding: "4px 6px" }}>{g.ifPass}</td><td style={{ padding: "4px 6px" }}>{g.ifFail}</td></tr>))}</tbody>
        </table></div></>))}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        {card("What would change the decision", ul(map.wouldChange))}
        {card("What you must decide", ul(map.userMustDecide.length ? map.userMustDecide : ["Nothing outstanding that only you can answer."]))}
        {card("What should I do now?", <div style={{ fontSize: 12.5, color: tok.text2, lineHeight: 1.6 }}>{map.tree.map((t, i) => <div key={i}><b style={{ color: tok.text }}>{t.step}</b> → {t.text}</div>)}</div>)}
      </div>

      {/* 8: SCENARIOS */}
      {card("Run a scenario (simulation \u2014 not a forecast)", (<>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {(Object.keys(SCENARIO_PRESETS) as ScenarioState["scenarioType"][]).map((k) => <span key={k}>{btn(SCENARIO_PRESETS[k].label, () => run(k))}</span>)}
          <select value={horizon} onChange={(e: any) => setHorizon(parseInt(e.target.value))} style={{ fontSize: 12, padding: "5px 6px", borderRadius: 6, border: `1px solid ${tok.border}`, background: tok.inputBg, color: tok.text }}>
            {HORIZONS.map((h) => <option key={h} value={h}>{h < 12 ? h + " months" : h === 12 ? "12 months" : h / 12 + " years"}</option>)}
          </select>
          {btn(showOverrides ? "Hide custom values" : "Custom values\u2026", () => setShowOverrides(!showOverrides))}
        </div>
        {showOverrides && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 6, marginTop: 8 }}>
            {(Object.keys(inputs) as InputKey[]).map((k) => (
              <label key={k} style={{ fontSize: 11.5, color: tok.text3 }}>{INPUT_LABEL[k].label} <span style={{ color: tok.muted }}>[{inputs[k]!.label}] now {fmt(inputs[k]!.value, INPUT_LABEL[k].unit)}</span>
                <input value={overrides[k] || ""} placeholder="new value" onChange={(e: any) => setOverrides({ ...overrides, [k]: e.target.value })}
                  style={{ width: "100%", fontSize: 12, padding: "4px 6px", borderRadius: 5, border: `1px solid ${tok.border}`, background: tok.inputBg, color: tok.text }} /></label>))}
            {!Object.keys(inputs).length && <div style={{ fontSize: 12, color: tok.muted }}>No quantified variables in this decision yet — answer the open questions or add figures in a follow-up.</div>}
            <div>{btn("Run custom scenario", () => run("custom", [], "Custom values"), true)}</div>
          </div>)}
        {/* 6: ADD A BUSINESS CHALLENGE */}
        <div style={{ marginTop: 12, fontSize: 10, fontWeight: 800, color: tok.accent, letterSpacing: ".1em" }}>ADD A BUSINESS CHALLENGE</div>
        <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
          <input value={challengeText} onChange={(e: any) => setChallengeText(e.target.value)} onKeyDown={(e: any) => e.key === "Enter" && challengeText.trim() && parseAndRun(challengeText)}
            placeholder="e.g. There is a severe water shortage in my area · Funding is only ₹12 crore · Demand falls 30%"
            style={{ flex: 1, fontSize: 12.5, padding: "7px 10px", borderRadius: 7, border: `1px solid ${tok.border}`, background: tok.inputBg, color: tok.text }} />
          {btn("Test it", () => challengeText.trim() && parseAndRun(challengeText), true, !challengeText.trim())}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {quickWhatIfs(inputs, (intel.risks || []).map((r: any) => r.text)).map((q, i) => <span key={i}>{btn("What if " + q.label.toLowerCase() + "?", () => parseAndRun(q.text))}</span>)}
        </div>
        {pending && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: tok.surface2, fontSize: 12, color: tok.text2 }}>
            <div><b>Understood:</b> {pending.summary}</div>
            <div style={{ marginTop: 4 }}>Impact direction known; magnitude uncertain. Enter a value to calculate it, or run with direction only (no number is invented).</div>
            {pending.challenges.filter((c) => c.change === null).map((c) => (
              <label key={c.id} style={{ display: "block", marginTop: 6 }}>{pending.questions[pending.challenges.filter((x) => x.change === null).indexOf(c)] || c.name}
                <input placeholder={c.variable === "delay" ? "months" : c.changeType === "pp" ? "percentage points, e.g. -10" : "%, e.g. " + (c.direction === "down" ? "-15" : "15")}
                  onChange={(e: any) => { const n = parseFloat(e.target.value); setPending({ ...pending, challenges: pending.challenges.map((x) => x.id === c.id ? { ...x, change: isFinite(n) ? (c.variable !== "delay" && c.direction === "down" && n > 0 ? -n : n) : null, confidence: isFinite(n) ? "user-stated" : "unknown-magnitude" } : x) }); }}
                  style={{ marginLeft: 6, width: 120, fontSize: 12, padding: "3px 6px", borderRadius: 5, border: `1px solid ${tok.border}`, background: tok.inputBg, color: tok.text }} /></label>))}
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>{btn("Run scenario", () => { run("custom", pending.challenges, challengeText.slice(0, 60) || pending.summary.slice(0, 60)); setPending(null); }, true)}{btn("Cancel", () => setPending(null))}</div>
          </div>)}
        {/* 10: WHAT HAPPENS? WHY? WHAT SHOULD I DO? ... */}
        {active && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: `1px solid ${tok.border}`, background: tok.surface2 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: tok.warn, letterSpacing: ".1em" }}>SIMULATION RESULT — {active.name} · {active.horizonMonths} months</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 8, fontSize: 12.5, color: tok.text2 }}>
              <div><b style={{ color: tok.text }}>What happens?</b><br />Result: <b style={{ color: tone(active.decisionResult) }}>{active.decisionResult}</b>{active.decisionChanged ? " (was " + active.baseDecision + ")" : ""}<br />
                Revenue: {fmt(active.simulationOutputs.revenue, "INR")}{baseOut.revenue ? " (" + Math.round(((active.simulationOutputs.revenue || 0) / baseOut.revenue - 1) * 100) + "%)" : ""}<br />
                Profit / month: {fmt(active.simulationOutputs.profit, "INR")}<br />Cash at start: {fmt(active.simulationOutputs.cashStart, "INR")}</div>
              <div><b style={{ color: tok.text }}>Why?</b><br />{active.decisionReasons.join(" ")}</div>
              <div><b style={{ color: tok.text }}>What should I do?</b>{ul(active.recommendedActions)}</div>
              <div><b style={{ color: tok.text }}>What could go wrong?</b><br />{active.projection.failureMonth !== null ? "Cash runs out in month " + active.projection.failureMonth + ". " + active.projection.recovery : "No cash failure within " + active.horizonMonths + " months on these assumptions."}{active.stopConditions[0] ? " " + active.stopConditions[0] : ""}</div>
              <div><b style={{ color: tok.text }}>What would change the outcome?</b>{ul(active.decisionThresholds.length ? active.decisionThresholds : ["Threshold cannot be calculated from current evidence."])}</div>
            </div>
            {active.notApplied.length > 0 && <div style={{ fontSize: 11.5, color: tok.warn, marginTop: 8 }}>Not calculated: {active.notApplied.join(" \u00b7 ")}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {btn(detail ? "Hide detailed analysis" : "View detailed analysis", () => setDetail(!detail))}
              {openInTimeMachine && btn("Explore in Time Machine", () => openInTimeMachine(lastOf(cur.stages[si]) + " \u2014 scenario: " + active.name + (active.userChallenges.length ? " (" + active.userChallenges.map((c) => c.name).join("; ") + ")" : "")))}
              {addCockpitActions && btn("Add these actions", () => addCockpitActions(active.recommendedActions, "Scenario \u2014 " + active.name))}
            </div>
            {detail && (<div style={{ marginTop: 10, fontSize: 11.5, color: tok.text3 }}>
              <div><b>Assumptions:</b> {active.assumptions.join(" \u00b7 ") || "\u2014"}</div>
              <div><b>Evidence used:</b> {active.evidence.join(" \u00b7 ") || "none retrieved for these variables"}</div>
              <div><b>Changed variables:</b> {active.affectedVariables.join(", ") || "\u2014"}</div>
              <div><b>Triggers:</b> {active.triggers.join(" \u00b7 ") || "\u2014"}</div>
              <div style={{ marginTop: 4 }}>{active.projection.caveat}</div>
              <div>Decision rules: below {DECISION_RULES.doNotProceedBelowBreakEvenRatio * 100}% of break-even → DO NOT PROCEED; below break-even or runway under {DECISION_RULES.minimumRunwayMonths} months → WAIT; under {DECISION_RULES.proceedMarginOfSafety * 100}% headroom or open gates → PROCEED WITH CONDITIONS.</div>
            </div>)}
          </div>)}
        {/* 9: COMPARISON */}
        {cmp.length > 0 && (<div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead><tr style={{ color: tok.text3, textAlign: "left" }}><th style={{ padding: "4px 6px" }}>Metric</th>{compareSet.map((r) => <th key={r.scenarioId} style={{ padding: "4px 6px" }}>{r.name}</th>)}</tr></thead>
            <tbody>{cmp.map((row) => <tr key={row.metric} style={{ color: tok.text2, borderTop: `1px solid ${tok.border}` }}><td style={{ padding: "4px 6px", color: tok.text3 }}>{row.metric}</td>{row.values.map((v, i) => <td key={i} style={{ padding: "4px 6px", fontWeight: row.metric === "Decision" ? 700 : 400 }}>{v}</td>)}</tr>)}</tbody>
          </table>
          {chart && <div style={{ marginTop: 8 }}>{chart}</div>}
        </div>)}
      </>))}

      {/* 9: ASK AUTOPILOT */}
      {card("Ask Autopilot \u2014 what would I do next?", (<>
        <div style={{ fontSize: 12, color: tok.text3, marginBottom: 8 }}>Uses the Boardroom decision{active ? " and the scenario \u201c" + active.name + "\u201d" : ""}. Advisory only — nothing is executed.</div>
        {btn(response ? "Refresh response" : "Ask Autopilot", askAutopilot, true)}
        {response && (<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8, marginTop: 10, fontSize: 12.5, color: tok.text2 }}>
          {response.settled && <div style={{ gridColumn: "1/-1", color: tok.success }}>{response.settledNote}</div>}
          {response.changedFromPrior && <div style={{ gridColumn: "1/-1", color: tok.warn }}>Recommendation changed from {response.changedFromPrior.from} to {response.changedFromPrior.to}: {response.changedFromPrior.reason}</div>}
          {([["Current state", response.currentState], ["Recommended action", response.recommendedAction], ["Why", response.why], ["Expected impact", response.expectedImpact], ["Risk", response.risk],
            ["Trigger", response.trigger], ["Owner", response.owner], ["Deadline", response.deadline], ["Stop condition", response.stopCondition], ["Escalation", response.escalationCondition]] as [string, string][])
            .map(([k, v]) => <div key={k}><b style={{ color: tok.text }}>{k}</b><br />{v}</div>)}
          {response.alternatives.length > 0 && <div style={{ gridColumn: "1/-1" }}><b style={{ color: tok.text }}>Alternatives (calculated)</b>{ul(response.alternatives.map((a) => a.name + " \u2192 " + a.decision + " (" + a.note + ")"))}</div>}
          {(response.triggerStatus.stop || response.triggerStatus.escalate) && <div style={{ gridColumn: "1/-1", color: tok.danger, fontWeight: 700 }}>{response.triggerStatus.stop ? "STOP CONDITION MET. " : ""}{response.triggerStatus.escalate ? "ESCALATION CONDITION MET. " : ""}{response.triggerStatus.reasons.join(" ")}</div>}
        </div>)}
      </>))}
    </div>
  );
}
