import React, { useMemo, useState, useEffect } from "react";
import {
  inputsFromRegistry, compute, buildDecisionMap, runScenario, parseChallenge, compareScenarios, decisionResponse, buildHandoff,
  quickWhatIfs, applyChallengesFromScenario, fmt, INPUT_LABEL, SCENARIO_PRESETS, HORIZONS, DECISION_RULES,
  type ScenarioState, type Challenge, type InputKey, type DecisionResponse,
} from "./lib/DecisionCockpit";
import { cockpitContext, businessReportMarkdown, deckMarkdown, buildExcelModel, auditMarkdown, type CockpitContext } from "./lib/DecisionExports";
import { GLOSSARY, stripIds, plainDecision } from "./lib/DecisionExperience";
import { actualsFromLedger, parseChallenges, explainDecisionChange } from "./lib/DecisionCockpit";
import { getAllAccounts } from "./Ledger";

// DECISION COCKPIT - the first thing a founder sees after a Boardroom run.
// Everything here is CALCULATED from the canonical model (no AI call). Simulations
// are labelled SIMULATION RESULT and never replace evidence.
const DTONE: Record<string, string> = { "PROCEED": "success", "PROCEED WITH CONDITIONS": "warn", "WAIT": "warn", "DO NOT PROCEED": "danger", "INSUFFICIENT EVIDENCE": "muted" };

// ── TWO-LAYER DECISION EXPERIENCE ────────────────────────────────────────────
// Layer 1 = plain-language answer. Layer 2 (on demand, or Advanced mode) =
// definitions, formulas, sources and internal references. Same data either way.
export function Explain({ k, tok, extra }: { k?: string; tok: any; extra?: { meaning?: string; source?: string; how?: string } }) {
  const [open, setOpen] = useState(false);
  const g: any = (k && (GLOSSARY as any)[k]) || null;
  if (!g && !extra) return null;
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button aria-label="What does this mean?" onClick={() => setOpen(!open)} style={{ marginLeft: 5, width: 17, height: 17, borderRadius: 9, border: `1px solid ${tok.border}`,
        background: open ? tok.accent : tok.surface2, color: open ? "#fff" : tok.text3, fontSize: 10, fontWeight: 800, cursor: "pointer", lineHeight: "15px", padding: 0 }}>?</button>
      {open && (
        <span style={{ display: "block", position: "absolute", zIndex: 30, top: 22, left: 0, width: "min(320px, 80vw)", padding: "10px 12px", borderRadius: 8, border: `1px solid ${tok.border}`,
          background: tok.surface, boxShadow: tok.shadow, fontSize: 12, lineHeight: 1.5, color: tok.text2, textAlign: "left", fontWeight: 400, whiteSpace: "normal" }}>
          {g && <><b style={{ color: tok.text }}>{g.term}</b><br /><b>What is it?</b> {g.what}<br /><b>Why it matters:</b> {g.why}<br /><b>How it is calculated:</b> {extra?.how || g.how}<br /></>}
          {extra?.meaning && <><b>What the current number means:</b> {extra.meaning}<br /></>}
          {g && <><b>What would improve it:</b> {g.better}<br /></>}
          {g?.formula && <><b>Formula:</b> {g.formula}<br /></>}
          {g?.healthy && <><b>What is healthy:</b> {g.healthy}<br /></>}
          {g?.need && <><b>What we need from you:</b> {g.need}<br /></>}
          {extra?.source && <><b>Where it comes from:</b> {extra.source}</>}
        </span>)}
    </span>);
}
const DCOLOR: Record<string, string> = { "PROCEED": "success", "CONDITIONAL PROCEED": "warn", "WAIT": "warn", "REWORK": "warn", "STOP": "danger", "INSUFFICIENT EVIDENCE": "muted" };
// Internal reference chip: the ID stays visible (traceability) with a plain explanation.
export function IdChip({ id, note, tok }: { id: string; note?: any; tok: any }) {
  const [open, setOpen] = useState(false); if (!id) return null;
  return (<span style={{ position: "relative", display: "inline-block", marginLeft: 6 }}>
    <button onClick={() => setOpen(!open)} aria-label={"What is " + id + "?"} style={{ fontFamily: "var(--font-mono),monospace", fontSize: 10.5, padding: "1px 6px", borderRadius: 5, border: `1px solid ${tok.border}`, background: tok.surface2, color: tok.text3, cursor: "pointer" }}>{id} ?</button>
    {open && note && <span style={{ display: "block", position: "absolute", zIndex: 30, top: 20, left: 0, width: "min(320px,80vw)", padding: "10px 12px", borderRadius: 8, border: `1px solid ${tok.border}`, background: tok.surface, boxShadow: tok.shadow, fontSize: 12, lineHeight: 1.5, color: tok.text2, whiteSpace: "normal" }}>
      <b style={{ color: tok.text }}>{note.id} — {note.kind}</b><br />{note.what} {note.why}{note.missing && <><br /><b>Missing:</b> {note.missing}</>}{note.provide && <><br /><b>What to provide:</b> {note.provide}</>}{note.ifUnresolved && <><br /><b>If unresolved:</b> {note.ifUnresolved}</>}</span>}
  </span>);
}
export function DecisionLayer({ ctx, tok, advanced, saveCockpit, addCockpitActions, onShowDebate, onRunScenarios, onTestChallenge, onAdvanced }: any) {
  const [showAllGaps, setShowAllGaps] = useState(false); const [openAction, setOpenAction] = useState<number | null>(null);
  const c: CockpitContext = ctx; const col = (tok as any)[DCOLOR[c.display] || "muted"] || tok.text2; const colBg = (tok as any)[(DCOLOR[c.display] || "muted") + "Bg"] || tok.surface2;
  const box = (id: string, title: string, body: any, right?: any) => (
    <section id={id} style={{ borderRadius: 10, border: `1px solid ${tok.border}`, background: tok.surface, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: tok.text3, letterSpacing: ".1em", textTransform: "uppercase" }}>{title}</div><div style={{ marginLeft: "auto" }}>{right}</div></div>{body}</section>);
  const plainList = (xs: string[]) => <ul style={{ margin: 0, paddingLeft: 17, fontSize: 13, lineHeight: 1.6, color: tok.text2 }}>{xs.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  const tidy = (s: string) => (advanced ? s : stripIds(s));
  const why = (c.issues.length ? c.issues.map((x) => x.issue) : c.map.why.map(tidy)).slice(0, 5);
  const know = [
    ...c.analysis.userInputs.filter((u) => !u.ambiguous && u.sourceType === "user").slice(0, 4).map((u) => "You told us: " + u.label.toLowerCase() + " " + fmt(u.value, u.unit) + "."),
    ...c.analysis.claims.filter((x) => x.support === "SUPPORTED").slice(0, 2).map((x) => "Confirmed by research: " + stripIds(x.text).replace(/\[[^\]]*\]\s*/g, "")),
  ].slice(0, 5);
  const btn = (label: string, onClick: () => void, primary = false) => (
    <button onClick={onClick} style={{ padding: "6px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${primary ? tok.accent : tok.border}`,
      background: primary ? tok.accent : tok.surface, color: primary ? "#fff" : tok.text2 }}>{label}</button>);
  const journey = [["dj-know", "What we know"], ["dj-matters", "What matters most"], ["dj-unknown", "What is uncertain"], ["dj-exec", "Executives"], ["dj-decision", "Decision"], ["dj-change", "What would change it"], ["dj-actions", "Next actions"], ["dj-scenarios", "Time Machine"], ["dj-autopilot", "Autopilot"]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* DECISION JOURNEY - conceptual navigation */}
      <nav aria-label="Decision journey" style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 11, color: tok.muted }}>
        {journey.map(([id, l], i) => <span key={id}><a href={"#" + id} style={{ color: tok.text3, textDecoration: "none" }}>{l}</a>{i < journey.length - 1 ? " \u2192 " : ""}</span>)}</nav>
      {/* A. DECISION HEADER */}
      <section id="dj-decision" style={{ borderRadius: 12, border: `1px solid ${tok.border}`, background: tok.surface, boxShadow: tok.shadow, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: tok.text3, letterSpacing: ".12em" }}>YOUR DECISION</span>
          <span style={{ fontSize: 18, fontWeight: 800, padding: "3px 11px", borderRadius: 6, background: colBg, color: col }}>{c.display}</span>
          <Explain tok={tok} extra={{ meaning: c.meaning }} />
          <span style={{ fontSize: 12.5, color: tok.text3 }}>Confidence: <b style={{ color: tok.text }}>{c.confidence.level}</b></span>
          <Explain k="confidence" tok={tok} extra={{ meaning: c.confidence.why + " What would increase it: " + c.confidence.increase + " What would reduce it: " + c.confidence.decrease }} />
        </div>
        <div style={{ fontSize: 15, color: tok.text, marginTop: 10, lineHeight: 1.55 }}>{c.oneSentence}</div>
        {c.map.simulationNotes.map((n, i) => <div key={i} style={{ fontSize: 11.5, color: tok.warn, marginTop: 4 }}>{n}</div>)}
        {!c.validation.ok && (
          <div role="alert" style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: tok.warnBg, color: tok.warn, fontSize: 12.5 }}>
            <b>MODEL VALIDATION REQUIRED</b> — treat this answer as provisional: {c.validation.checks.filter((x) => !x.pass).map((x) => x.name.charAt(0).toLowerCase() + x.name.slice(1) + (x.detail && advanced ? " (" + x.detail + ")" : "")).join("; ")}.</div>)}
        {c.provisional && c.readings.length > 1 && (
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${tok.warn}`, background: tok.surface2, fontSize: 12.5, color: tok.text2 }}>
            <b style={{ color: tok.text }}>INPUT AMBIGUITY — please confirm</b><br />{c.analysis.ambiguities[0]?.question}
            <div style={{ overflowX: "auto", marginTop: 6 }}><table style={{ borderCollapse: "collapse", fontSize: 12 }}><tbody>
              {c.readings.map((r) => <tr key={r.key}><td style={{ padding: "3px 8px 3px 0" }}><b>{r.key}</b> {r.label}</td><td style={{ padding: "3px 8px" }}>revenue {fmt(r.outputs.revenue, "INR")}/month</td>
                <td style={{ padding: "3px 8px" }}>profit {fmt(r.outputs.profit, "INR")}/month</td><td style={{ padding: "3px 8px", fontWeight: 700 }}>{(c.readingDecisions.find((x) => x.key === r.key) || { display: "" }).display}</td>
                <td style={{ padding: "3px 0" }}>{saveCockpit && btn("Use " + r.key, () => saveCockpit({ inputChoices: { revenueBasis: r.key } }))}</td></tr>)}</tbody></table></div>
          </div>)}
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        {/* B. WHY */}
        {box("dj-why", "Why this decision", plainList(why))}
        {/* C. WHAT MATTERS MOST */}
        {box("dj-matters", "What matters most", (<>
          {c.keyNumber && <div style={{ fontSize: 14, fontWeight: 700, color: tok.text, marginBottom: 8 }}>{c.keyNumber}</div>}
          {c.numbers.slice(0, advanced ? 8 : 4).map((n, i) => (
            <div key={i} style={{ fontSize: 12.5, color: tok.text2, padding: "5px 0", borderTop: i ? `1px solid ${tok.border}` : "none" }}>
              <b style={{ color: tok.text }}>{n.label}: {n.value}</b><Explain k={n.explain} tok={tok} extra={{ meaning: n.meaning + " " + n.comparison, source: n.kind }} />
              <div>{n.impact}</div></div>))}
        </>))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        {/* D. WHAT WE KNOW / DON'T KNOW */}
        {box("dj-know", "What we know", plainList(know.length ? know : ["Nothing has been independently confirmed yet."]), <Explain k="confirmed" tok={tok} />)}
        {box("dj-unknown", "What we don't know yet", (<>
          {c.unknowns.slice(0, showAllGaps ? 20 : 3).map((u, i) => (
            <div key={i} style={{ fontSize: 12.5, color: tok.text2, padding: "5px 0", borderTop: i ? `1px solid ${tok.border}` : "none" }}>
              <b style={{ color: tok.text }}>{tidy(u.missing)}</b><div>Why it matters: {u.whyMatters}</div><div>How to verify: {tidy(u.howToVerify)}</div>
              {u.technicalRef && <div style={{ marginTop: 2 }}>{String(u.technicalRef).split(/[ ,]+/).filter((x: string) => /^[A-Z]+-[A-Z0-9-]+$|^[A-Z]{2}-\d/.test(x)).map((id: string) => <IdChip key={id} id={id} note={c.idNotes[id]} tok={tok} />)}</div>}</div>))}
          {(c.unknowns.length > 3 || (c.analysis as any).contradictions) && btn(showAllGaps ? "Show fewer" : "Show all evidence gaps", () => setShowAllGaps(!showAllGaps))}
        </>), <Explain k="missing" tok={tok} />)}
      </div>
      {/* E. WHAT SHOULD I DO NOW? */}
      {/* THE BIGGEST THING HOLDING YOU BACK */}
      {box("dj-blocker", "The biggest thing holding you back", <div style={{ fontSize: 14, fontWeight: 600, color: tok.text, lineHeight: 1.5 }}>{c.biggestBlocker}</div>)}
      {c.analysisIncomplete && <div role="status" style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 8, background: tok.surface2, color: tok.text2 }}>{advanced ? c.analysisIncomplete.message : "Some analysis could not be completed. The decision uses the executives who did complete; open Advanced for details."}</div>}
      {box("dj-actions", "What should I do next?", (<>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: tok.text }}>
          {c.actions.slice(0, 5).map((a, i) => (
            <li key={i} style={{ marginBottom: 4 }}>{a.action} <span style={{ color: tok.muted }}>— {a.owner}, {a.deadline}</span>{" "}
              <button onClick={() => setOpenAction(openAction === i ? null : i)} style={{ border: "none", background: "none", color: tok.accent, cursor: "pointer", fontSize: 12 }}>{openAction === i ? "less" : "details"}</button>
              {(openAction === i || advanced) && <div style={{ fontSize: 12, color: tok.text2 }}>Why: {a.why} · Success: {a.success} · If it fails: {a.fail} · Escalate: {a.escalation}</div>}</li>))}
        </ol>
        <div style={{ marginTop: 8, fontSize: 12.5, color: tok.text2, lineHeight: 1.6 }}>
          <b style={{ color: tok.text }}>Decision path</b>
          {[["NOW", c.actions[0]?.action || "Review the gates below"], ["THEN", c.actions[1]?.action || "Run a downside scenario"],
            ...c.map.tree.filter((t) => /^IF |TRIGGER/.test(t.step)).map((t) => [t.step, tidy(t.text)])].map(([k, v], i) => <div key={i}><b style={{ color: tok.text }}>{k}</b> → {v}</div>)}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {addCockpitActions && btn("Send these actions to Autopilot / Action Tracker", () => addCockpitActions(c.actions.map((a) => a.action), "Decision Cockpit", c.actions.map((a) => "Owner: " + a.owner + " \u00b7 Deadline: " + a.deadline + " \u00b7 Success: " + a.success + " \u00b7 If it fails: " + a.fail + " \u00b7 Escalate: " + a.escalation)), true)}
          {onRunScenarios && btn("Test this in Time Machine", onRunScenarios)}
        </div>
      </>))}
      {/* WHAT WOULD CHANGE THE ANSWER */}
      {box("dj-change", "What would change the answer", plainList(c.wouldChange))}
      {/* F. DECISION GATES - educational */}
      {/* WHAT HAPPENS IF THINGS GO BADLY / WELL - calculated, labelled simulations */}
      {c.outcomes.length > 0 && box("dj-outcomes", "What happens if things go badly — or well? (simulation, not a forecast)", (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
          {c.outcomes.map((o, i) => (<div key={i} style={{ fontSize: 12.5, color: tok.text2, padding: "8px 10px", borderRadius: 8, border: `1px solid ${tok.border}`, borderLeft: `3px solid ${o.kind === "good" ? tok.success : o.kind === "stress" ? tok.danger : tok.warn}` }}>
            <div style={{ fontWeight: 800, color: tok.text }}>{o.kind === "good" ? "If things go well" : o.kind === "stress" ? "If things go very badly" : "If things go badly"} <span style={{ fontWeight: 400, color: tok.muted }}>({o.name})</span></div>
            <div>Decision: <b>{o.decision}</b> · profit {o.profit}/month{o.failureMonth !== null ? " · cash runs out in month " + o.failureMonth : ""}</div>
            <div style={{ color: tok.muted }}>{o.explanation}</div>
          </div>))}
          {onRunScenarios && <div><button onClick={onRunScenarios} style={{ padding: "6px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${tok.border}`, background: tok.surface, color: tok.text2 }}>Test your own scenario →</button></div>}
        </div>))}
      {/* EXTERNAL FACTORS - only retrieved ones are facts */}
      {c.externalFactors.length > 0 && box("dj-external", "Outside factors that could affect this", (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {c.externalFactors.slice(0, advanced ? 12 : 5).map((e, i) => (<div key={i} style={{ fontSize: 12.5, color: tok.text2, borderTop: i ? `1px solid ${tok.border}` : "none", paddingTop: i ? 6 : 0 }}>
            <b style={{ color: tok.text }}>{e.category}</b> <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: e.verified ? tok.successBg : tok.warnBg, color: e.verified ? tok.success : tok.warn }}>{e.verified ? "FACT (retrieved source)" : "ASSUMPTION"}</span>
            <div>{stripIds(e.text)}</div>
            <div style={{ color: tok.muted }}>Affects: {e.affectedVariable || "context only"} · direction: {e.direction} · magnitude: impact direction known; magnitude uncertain{advanced ? " · source: " + e.source : ""}</div>
            {onTestChallenge && e.affectedVariable && <button onClick={() => onTestChallenge(e.category + " — " + (e.direction === "down" ? "lower " : "higher ") + e.affectedVariable)} style={{ border: "none", background: "none", color: tok.accent, cursor: "pointer", fontSize: 12, padding: 0 }}>Test this as a scenario →</button>}
          </div>))}
        </div>))}
      {/* PLAN vs ACTUAL - actual results kept separate from simulations */}
      {c.actuals && box("dj-actuals", "Plan vs actual (from your General Ledger)", (
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}><thead><tr style={{ color: tok.text3, textAlign: "left" }}><th style={{ padding: 4 }}>Metric</th><th style={{ padding: 4 }}>Expected (plan)</th><th style={{ padding: 4 }}>ACTUAL RESULT</th></tr></thead>
          <tbody>{c.planVsActual.map((r) => <tr key={r.metric} style={{ borderTop: `1px solid ${tok.border}` }}><td style={{ padding: 4 }}>{r.metric}</td><td style={{ padding: 4 }}>{r.expected}</td><td style={{ padding: 4, fontWeight: 700 }}>{r.actual}</td></tr>)}</tbody></table>
          <div style={{ fontSize: 11.5, color: tok.muted, marginTop: 4 }}>{c.actuals.entries} journal entries, {c.actuals.from} to {c.actuals.to}. Actuals are never mixed with simulations.</div></div>))}
      {box("dj-gates", "What must be proven (decision gates)", (<>
        <div aria-label="Decision map" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, marginBottom: 10, fontSize: 11.5, color: tok.text2 }}>
          <div style={{ color: tok.muted }}>CURRENT POSITION</div><div>↓</div>
          <div style={{ fontWeight: 800, padding: "2px 10px", borderRadius: 6, background: colBg, color: col }}>{c.display}</div><div>↓</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
            {c.gates.map((g, i) => <span key={i} style={{ padding: "2px 7px", borderRadius: 6, border: `1px solid ${g.gate.status === "PASS" ? tok.success : g.gate.status === "FAIL" ? tok.danger : tok.border}`,
              color: g.gate.status === "PASS" ? tok.success : g.gate.status === "FAIL" ? tok.danger : tok.text2 }}>Gate {i + 1} · <b>{g.gate.status}</b></span>)}</div><div>↓</div>
          <div>{c.display === "PROCEED" ? "SCALE" : c.display === "CONDITIONAL PROCEED" ? "PILOT" : "PROVE / REWORK"} → Time Machine → Autopilot → SCALE / STOP</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 8 }}>
          {c.gates.map((g, i) => {
            const gc = g.gate.status === "PASS" ? tok.success : g.gate.status === "FAIL" ? tok.danger : tok.warn;
            return (<div key={i} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${tok.border}`, borderLeft: `3px solid ${gc}`, fontSize: 12.5, color: tok.text2 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: tok.muted }}>GATE {i + 1} · <span style={{ color: gc }}>{g.gate.status}</span></div>
              <div style={{ fontWeight: 700, color: tok.text, margin: "2px 0 4px" }}>{tidy(g.plain.title)}{g.plain.explain && <Explain k={g.plain.explain} tok={tok} extra={{ how: g.gate.threshold.replace(" [Calculation]", "") }} />}</div>
              <div>What we need: {tidy(g.plain.need)}</div>{g.plain.why && <div>Why: {g.plain.why}</div>}
              <div>Now: {tidy(g.gate.current)}</div><div style={{ color: tok.muted }}>If it passes: {g.gate.ifPass}. If it fails: {g.gate.ifFail}.</div>
              {advanced && <div style={{ color: tok.muted, fontSize: 11 }}>Threshold: {g.gate.threshold} · Owner: {g.gate.owner} · Evidence: {g.gate.evidence}</div>}</div>);
          })}
        </div></>))}
      {/* H. EXECUTIVE VIEWS - plain; full analysis behind the debate toggle */}
      {box("dj-exec", "What the executives think", (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
          {c.executives.map((e, i) => (
            <div key={i} style={{ fontSize: 12.5, color: tok.text2, padding: "8px 10px", borderRadius: 8, background: tok.surface2 }}>
              <div style={{ fontWeight: 800, color: tok.text }}>{e.name}{e.status && e.status !== "COMPLETE" && e.status !== "CONTINUATION_COMPLETE" ? <span style={{ color: tok.warn, fontWeight: 600 }}> · {e.status.toLowerCase().replace(/_/g, " ")}</span> : null}</div>
              <div style={{ margin: "3px 0" }}>{e.view.view || "No summary available."}</div>
              {e.view.worried.length > 0 && <div><b>Worried about:</b>{plainList(e.view.worried)}</div>}
              {e.view.wantsVerified.length > 0 && <div><b>Wants verified:</b>{plainList(e.view.wantsVerified)}</div>}
              {e.view.impact && <div><b>Impact on your decision:</b> {e.view.impact}</div>}
              {onShowDebate && <button onClick={onShowDebate} style={{ marginTop: 4, border: "none", background: "none", color: tok.accent, cursor: "pointer", fontSize: 12, padding: 0 }}>Read full {e.name} analysis →</button>}
            </div>))}
          {!c.executives.length && <div style={{ fontSize: 12.5, color: tok.muted }}>No usable executive contributions for this stage.</div>}
        </div>))}
      {box("dj-details", "Explore the details", (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {onShowDebate && <button onClick={onShowDebate} style={{ padding: "6px 11px", borderRadius: 7, fontSize: 12, cursor: "pointer", border: `1px solid ${tok.border}`, background: tok.surface, color: tok.text2 }}>Executive debate & evidence</button>}
          {onAdvanced && <button onClick={onAdvanced} style={{ padding: "6px 11px", borderRadius: 7, fontSize: 12, cursor: "pointer", border: `1px solid ${tok.border}`, background: tok.surface, color: tok.text2 }}>{advanced ? "Back to Standard view" : "Calculations, technical terms & audit trail (Advanced)"}</button>}
        </div>))}
      {/* ADVANCED: disagreements ledger + validation + canonical model */}
      {advanced && box("dj-audit", "Audit layer", (<div style={{ fontSize: 12, color: tok.text2 }}>
        <b>Material disagreements ({c.analysis.clusters.length}, from {c.analysis.contradictions.length} raw records)</b>
        {plainList(c.analysis.clusters.map((x) => x.label + " [" + x.severity + ", " + x.status + "] " + x.parties.join(" vs ") + " \u2014 " + x.whyDisagree + " Resolved by: " + x.whatResolves + " (" + x.ids.join(", ") + ")"))}
        <b>Validation checks</b>{plainList(c.validation.checks.map((x) => (x.pass ? "PASS " : "FAIL ") + x.name + (x.detail ? " \u2014 " + x.detail : "")))}
        <b>Canonical inputs</b>{plainList(c.analysis.userInputs.map((u) => u.id + " " + u.label + " = " + fmt(u.value, u.unit) + " \u00b7 " + u.source + " \u00b7 " + u.interpretation))}
        {c.analysis.modelConflicts.length > 0 && <><b>Model conflicts</b>{plainList(c.analysis.modelConflicts.map((m) => m.label + ": you said " + fmt(m.userValue, m.unit) + "; " + m.by + " said " + fmt(m.otherValue, m.unit) + " (your value kept)"))}</>}
      </div>))}
    </div>);
}

export default function DecisionCockpitView({ cur, si, analysis, tok, saveCockpit, addCockpitActions, openInTimeMachine, showToast, quickExport, exportVerbatimPDF, dlFile, cp, onShowDebate, company, location, ledgerEntries, customAccounts }: any) {
  // ONE context for the whole cockpit and every export (same canonical numbers everywhere).
  const actuals = useMemo(() => { try { return actualsFromLedger(ledgerEntries || [], getAllAccounts(customAccounts || [])); } catch { return null; } }, [ledgerEntries, customAccounts]);
  const ctx = useMemo(() => cockpitContext(cur, si, { location: location || "", actuals }), [cur, si, location, actuals]);
  const [advanced, setAdvanced] = useState(false);
  const [exporting, setExporting] = useState("");
  const rs = cur?.researchState || {};
  const intel = rs.intelligence || {};
  const inputs = useMemo(() => (ctx ? ctx.inputs : inputsFromRegistry(analysis?.registry || {})), [ctx, analysis]);
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
      buildHandoff({ sessionId: cur.sessionId || "", question: cur.q || "", inputs, map, scenarios: saved }));
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
    saveCockpit && saveCockpit({ scenarios, challenges }, buildHandoff({ sessionId: cur.sessionId || "", question: cur.q || "", inputs, map, scenarios, response }));
  };
  const run = (type: ScenarioState["scenarioType"], challenges: Challenge[] = [], name?: string) => {
    const ov = Object.entries(overrides).filter(([, v]) => v.trim() !== "" && isFinite(parseFloat(v))).map(([k, v]) => ({ variable: k as InputKey, to: parseFloat(v) }));
    const r = runScenario(inputs, type, challenges, { parentDecisionId: String(cur.sessionId || "") + ":stage-" + (si + 1), horizonMonths: horizon, openCriticalGates: openGates, name, overrides: ov });
    setActive(r); setDetail(false); persistRun(r, challenges.filter((c) => c.userEntered));
  };
  // "Test this in Time Machine": run the main lever at its current value, at the level
  // where the answer changes, and above it - then hand the set to Time Machine.
  const runLadder = () => {
    const runs: ScenarioState[] = []; const gates = openGates;
    const mk = (name: string, ov: { variable: InputKey; to: number }[]) => runScenario(inputs, "custom", [], { parentDecisionId: String(cur.sessionId || "") + ":stage-" + (si + 1), horizonMonths: horizon, openCriticalGates: gates, name, overrides: ov });
    const o = compute(inputs);
    if (inputs.utilisation && (inputs.revenueFull || inputs.dayRate) && o.revenue && o.breakEven) {
      const cur0 = inputs.utilisation.value, be = Math.min(100, Math.ceil(cur0 * o.breakEven / o.revenue));
      for (const x of Array.from(new Set([cur0, be, Math.min(100, Math.max(be, cur0) + 10)]))) runs.push(mk("Occupancy " + x + "%", [{ variable: "utilisation", to: x }]));
    } else if (ctx && ctx.driver && ctx.driver.required !== null) {
      for (const x of [ctx.driver.current, ctx.driver.required, ctx.driver.required * 1.1]) runs.push(mk(ctx.driver.label + " " + fmt(x, ctx.driver.unit), [{ variable: ctx.driver.variable, to: x }]));
    }
    if (!runs.length) { showToast && showToast("There is no calculable lever to test yet \u2014 confirm the inputs first.", "warning"); return; }
    setActive(runs[runs.length - 1]);
    const scenarios = [...saved, ...runs].slice(-12);
    saveCockpit && saveCockpit({ scenarios }, buildHandoff({ sessionId: cur.sessionId || "", question: cur.q || "", inputs, map, scenarios, response }));
    openInTimeMachine && showToast && showToast("Scenarios saved. Use \u201cExplore in Time Machine\u201d to simulate the timeline for any of them.", "info");
  };
  const parseAndRun = (text: string) => {
    const pc = parseChallenges(text);
    if (!pc.challenges.length) { showToast && showToast("Could not link that to a model variable. Try e.g. \u201cdemand falls 20%\u201d or \u201csevere water shortage\u201d.", "warning"); return; }
    if (pc.challenges.some((c) => c.change === null || (c.component && c.share == null))) { setPending(pc); return; }   // ask for magnitude (max 3 questions) before running
    run("custom", pc.challenges, text.slice(0, 60));
  };
  const askAutopilot = () => {
    const prior = rs.cockpitDecision || null;
    const r = decisionResponse({ map, base: inputs, scenario: active, priorDecision: prior });
    setResponse(r);
    saveCockpit && saveCockpit({ decisionResponses: [...(Array.isArray(rs.decisionResponses) ? rs.decisionResponses : []), { ...r, at: new Date().toISOString(), scenario: active ? active.name : null }].slice(-10) },
      buildHandoff({ sessionId: cur.sessionId || "", question: cur.q || "", inputs, map, scenarios: saved, response: r }));
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
      {/* STANDARD / ADVANCED - same data, different depth */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: tok.text3 }}>View:</span>
        {(["Standard", "Advanced"] as const).map((m) => (
          <button key={m} onClick={() => setAdvanced(m === "Advanced")} aria-pressed={advanced === (m === "Advanced")}
            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${tok.border}`,
              background: advanced === (m === "Advanced") ? tok.accent : tok.surface, color: advanced === (m === "Advanced") ? "#fff" : tok.text2 }}>{m}</button>))}
        <span style={{ fontSize: 11.5, color: tok.muted }}>{advanced ? "Technical terms, internal references and the audit layer are shown." : "Plain language; technical detail is one click away."}</span>
      </div>
      {ctx ? <DecisionLayer ctx={ctx} tok={tok} advanced={advanced} saveCockpit={saveCockpit} addCockpitActions={addCockpitActions} onShowDebate={onShowDebate}
        onAdvanced={() => setAdvanced(!advanced)} onTestChallenge={(t: string) => { setChallengeText(t); parseAndRun(t); try { document.getElementById("dj-scenarios")?.scrollIntoView({ behavior: "smooth" }); } catch {} }}
        onRunScenarios={() => { runLadder(); try { document.getElementById("dj-scenarios")?.scrollIntoView({ behavior: "smooth" }); } catch {} }} />
        : <div style={{ fontSize: 12.5, color: tok.muted }}>The decision layer could not be computed for this stage.</div>}
      {/* 8: SCENARIOS */}
      <div id="dj-scenarios" />
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
            {pending.challenges.filter((c) => c.change === null || (c.component && c.share == null)).map((c) => (
              <label key={c.id} style={{ display: "block", marginTop: 6 }}>{c.component && c.share == null ? "What share of your running costs is " + c.component + "? (%)" : c.variable === "funding" ? "How much funding do you actually have? (₹, e.g. 8000000)" : (pending.questions.find((q) => q.includes(c.variable)) || c.name)}
                <input placeholder={c.component && c.share == null ? "%, e.g. 20" : c.variable === "funding" ? "₹" : c.variable === "delay" ? "months" : c.changeType === "pp" ? "percentage points, e.g. -10" : "%, e.g. " + (c.direction === "down" ? "-15" : "15")}
                  onChange={(e: any) => { const n = parseFloat(e.target.value); const ok = isFinite(n); setPending({ ...pending, challenges: pending.challenges.map((x) => x.id !== c.id ? x
                    : c.component && c.share == null ? { ...x, share: ok ? n : null } : c.variable === "funding" ? { ...x, change: ok ? n : null, changeType: "abs" }
                    : { ...x, change: ok ? (c.variable !== "delay" && c.direction === "down" && n > 0 ? -n : n) : null, confidence: ok ? "user-stated" : "unknown-magnitude" }) }); }}
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
      <div id="dj-autopilot" />
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
      {/* J. EXPORTS - each format has a distinct purpose */}
      {ctx && (
        <section id="dj-exports" style={{ borderRadius: 10, border: `1px solid ${tok.border}`, background: tok.surface, padding: "12px 16px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: tok.text3, letterSpacing: ".1em", marginBottom: 8 }}>EXPORT</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
            {([
              ["PDF", "Complete business report", async () => { const md = businessReportMarkdown(cur, si, ctx, company || ""); if (exportVerbatimPDF) await exportVerbatimPDF("Decision Report \u2014 " + ctx.question.slice(0, 60), md); else if (quickExport) quickExport("pdf", "detailed", "Decision Report", md); }],
              ["PPT", "Executive presentation", async () => { if (quickExport) await quickExport("pptx", "strategy", "Decision \u2014 " + ctx.question.slice(0, 50), deckMarkdown(ctx, company || "")); }],
              ["Excel", "Interactive financial & decision model", async () => {
                const ExcelJS: any = (await import("exceljs")).default; const wb = await buildExcelModel(ExcelJS, ctx, company || ""); const buf = await wb.xlsx.writeBuffer();
                const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
                const el = document.createElement("a"); el.href = url; el.download = "Decision-Model-" + Date.now() + ".xlsx"; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }],
              ["MD", "Complete technical / audit record", async () => { dlFile && dlFile("Decision-Audit-" + Date.now() + ".md", auditMarkdown(cur, ctx), "text/markdown"); }],
            ] as [string, string, () => Promise<void>][]).map(([f, purpose, go]) => (
              <button key={f} disabled={!!exporting} onClick={async () => { setExporting(f); try { await go(); } catch (e: any) { showToast && showToast(f + " export failed: " + String(e?.message || e).slice(0, 160), "error"); } finally { setExporting(""); } }}
                style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, border: `1px solid ${tok.border}`, background: tok.surface2, cursor: exporting ? "default" : "pointer", color: tok.text }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{exporting === f ? "Preparing\u2026" : f}</div><div style={{ fontSize: 11.5, color: tok.text3 }}>{purpose}</div></button>))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {btn("Copy Decision Brief", () => { if (cp) cp(ctx.brief); showToast && showToast("Decision Brief copied \u2014 paste it into email, WhatsApp or Slack.", "success"); }, true)}
          </div>
        </section>)}
    </div>
  );
}
