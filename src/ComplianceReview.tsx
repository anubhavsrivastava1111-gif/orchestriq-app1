import React, { useMemo, useState } from "react";
import { REVIEW_PROCESSES, SCOPE_QUESTIONS, relevantQuestions, processRisk, evaluate, buildPlan, CASES, ROLE_CARDS, DETECT_TESTS, ANSWER_LABEL, boardroomQuestion, type ReviewProcess, type ScopeAnswers, type AnswerRec, type Answer } from "./lib/compliance/ReviewGuide";
import { parseCsv, runTests, templateCsv, DEFAULT_SETTINGS, type Settings, type TestResult } from "./lib/compliance/Analytics";
import { summariseAll, entityPatch, type BoardroomSummary } from "./lib/compliance/BoardroomLink";
import { ALL_CONTROLS } from "./lib/compliance/ControlLibrary";
import type { Entity } from "./lib/compliance/Frameworks";

// VP / CFO FACING LAYER of Compliance & Controls: why it matters, a guided review of a
// process (scope -> interview -> evaluate -> detect -> plan), and who does what.
export const V = { text: "var(--oiq-ink)", text2: "var(--oiq-body)", text3: "var(--oiq-muted)", border: "var(--oiq-border)", surface: "var(--oiq-surface)", surface2: "var(--oiq-surface2)", accent: "var(--oiq-accent)", ok: "var(--oiq-success)", warn: "var(--oiq-warning)", bad: "var(--oiq-danger)" };
const card: React.CSSProperties = { border: "1px solid " + V.border, borderRadius: 12, background: V.surface, padding: "16px 18px", marginBottom: 14 };
const inp: React.CSSProperties = { minHeight: 38, padding: "0 10px", borderRadius: 8, border: "1px solid " + V.border, background: V.surface, color: V.text, fontSize: 13.5, width: "100%", boxSizing: "border-box" };
const btn = (on = false): React.CSSProperties => ({ minHeight: 38, padding: "0 14px", borderRadius: 8, border: "1px solid " + (on ? V.accent : V.border), background: on ? V.accent : V.surface, color: on ? "#fff" : V.text, fontWeight: 700, fontSize: 13, cursor: "pointer" });
const H = ({ children }: { children: React.ReactNode }) => <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: V.text }}>{children}</div>;
const P = ({ children, small }: { children: React.ReactNode; small?: boolean }) => <p style={{ margin: "4px 0 8px", fontSize: small ? 12.5 : 14, color: small ? V.text3 : V.text2, lineHeight: 1.5 }}>{children}</p>;
const MAT_COLOR: Record<string, string> = { Strong: "#16A34A", Adequate: "#2563EB", Weak: "#D97706", Missing: "#DC2626", "Not reviewed": "#94A3B8" };
const chip = (t: string, c: string) => <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: "#fff", background: c, whiteSpace: "nowrap" }}>{t}</span>;
const ctlText = (id: string) => ALL_CONTROLS.find((c) => c.id === id);

export interface ReviewState { scope: ScopeAnswers; answers: Record<string, AnswerRec>; settings?: Settings; results?: TestResult[] | null; fileName?: string; ranAt?: string; explained?: Record<string, number>; step?: number }
export interface LinkState { id: string; question: string; date: string; decision: string; risks: string[] }

// ── START HERE ────────────────────────────────────────────────────────────
export function StartHere({ onStart }: { onStart: (p: ReviewProcess) => void }) {
  return <div data-testid="cmp-start">
    <div style={{ ...card, borderLeft: "5px solid " + V.accent }}>
      <H>What this module is for</H>
      <P>Internal control is how a company makes sure that <b>the numbers are right, the law is followed, and fraud is stopped or caught early</b>. Regulators require it: SOX in the US, and in India the Companies Act (internal financial controls), CARO and SEBI LODR. Lenders and investors rely on it.</P>
      <P>This module lets a <b>VP of Compliance & Controls, a CFO or an internal auditor</b> review any process the way an experienced practitioner would: ask the right questions, judge the answers, prove with data whether controls actually catch problems, and build what is missing, with a named owner for every control.</P>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginTop: 10 }}>
        {[["Know what applies", "Which laws and frameworks bind each entity and country, and why."], ["Know the gaps", "A structured interview shows where a process is weak, before an auditor or a fraudster finds it."], ["Know it works", "Run detection tests on real data: duplicates, self-approvals, split payments. Evidence, not opinions."], ["Know who owns it", "Every control has an owner, a performer and a reviewer, and everyone sees their responsibilities."]].map(([t, d]) =>
          <div key={t} style={{ background: V.surface2, borderRadius: 10, padding: "10px 12px" }}><div style={{ fontWeight: 800, color: V.text }}>{t}</div><div style={{ fontSize: 13, color: V.text2 }}>{d}</div></div>)}
      </div>
    </div>
    <div style={card}>
      <H>How a review works — five steps</H>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        {[["1. Scope", "A few questions decide which parts of the process matter for this business and how risky it is."], ["2. Interview", "Ask the process owner the right questions; each comes with what a good answer sounds like and the red flags."], ["3. Evaluate", "Answers become a maturity rating per area, a gap list, and a list of claims you still need to see evidence for."], ["4. Detect", "Upload expense, invoice or journal data; tests run on every row and show whether controls are really catching problems."], ["5. Plan", "Each gap becomes a control with an owner, steps, evidence and a 30/60/90-day deadline; the Board can be asked to prioritise."]].map(([t, d]) =>
          <div key={t} style={{ border: "1px solid " + V.border, borderRadius: 10, padding: "10px 12px" }}><div style={{ fontWeight: 800, color: V.accent }}>{t}</div><div style={{ fontSize: 13, color: V.text2 }}>{d}</div></div>)}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {REVIEW_PROCESSES.map((p) => <button key={p.id} data-testid={"cmp-startreview-" + p.id} onClick={() => onStart(p.id)} style={btn(true)}>Review {p.name.split(" (")[0]}</button>)}
      </div>
    </div>
    <div style={card}>
      <H>Who uses it, and for what</H>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
        {[["VP Compliance / CFO", "Review processes, see the landscape across entities and countries, decide priorities, report to the Audit Committee."], ["Process owners", "See the gaps in their process, the controls they must run, and the evidence they must keep."], ["Staff in the process", "Understand their role: what to do, why it matters, and what they must never do (“Who does what”)."], ["Internal / external auditors", "Use the control matrix, test sheets and deficiency evaluation; export to Excel."]].map(([t, d]) =>
          <div key={t}><div style={{ fontWeight: 800, color: V.text }}>{t}</div><div style={{ fontSize: 13, color: V.text2 }}>{d}</div></div>)}
      </div>
    </div>
    <div style={card}>
      <H>Key words in plain language</H>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8, fontSize: 13, color: V.text2 }}>
        {[["Risk", "What could go wrong — e.g. paying a fake supplier."], ["Control", "A check that stops or catches it — e.g. calling the supplier back before changing bank details."], ["Key control", "A control that, on its own, would stop a material error; auditors test these first."], ["Preventive / detective", "Stops the problem before it happens / finds it afterwards."], ["Design effectiveness", "Would the control work if done as described?"], ["Operating effectiveness", "Was it actually done, every time, with evidence?"], ["Deficiency / significant deficiency / material weakness", "Rising levels of seriousness; a material weakness must be reported and usually leads to an adverse audit opinion."], ["Evidence", "Proof that a control happened: a signed reconciliation, a system log, an approval record."]].map(([t, d]) =>
          <div key={t}><b style={{ color: V.text }}>{t}:</b> {d}</div>)}
      </div>
    </div>
    <div style={card}>
      <H>Why it matters — frauds that controls should have caught</H>
      <P small>Summaries of widely reported public cases; figures as reported at the time.</P>
      <div data-testid="cmp-cases" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
        {CASES.map((c) => <div key={c.id} style={{ border: "1px solid " + V.border, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontWeight: 800, color: V.text }}>{c.name} <span style={{ fontWeight: 600, color: V.text3, fontSize: 12 }}>· {c.year} · {c.where}</span></div>
          <div style={{ fontSize: 13, color: V.text2, marginTop: 4 }}>{c.what}</div>
          <div style={{ fontSize: 13, marginTop: 6 }}><b style={{ color: V.bad }}>Control that failed:</b> <span style={{ color: V.text2 }}>{c.failed}</span></div>
          <div style={{ fontSize: 13, marginTop: 4 }}><b style={{ color: V.ok }}>Lesson:</b> <span style={{ color: V.text2 }}>{c.lesson}</span></div>
        </div>)}
      </div>
    </div>
  </div>;
}

// ── BOARDROOM LINK ────────────────────────────────────────────────────────
export function BoardroomLinkPanel({ sessions, current, location, company, link, onPlug, onUnplug }:
  { sessions: any[]; current?: any; location: string; company: string; link: LinkState | null; onPlug: (s: BoardroomSummary, patch: Partial<Entity>) => void; onUnplug: () => void }) {
  const list = useMemo(() => summariseAll(sessions || [], current, location), [sessions, current, location]);
  const [pick, setPick] = useState("");
  return <div data-testid="cmp-link" style={{ ...card, background: V.surface2 }}>
    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <div style={{ fontWeight: 800, color: V.text }}>{link ? "🔗 Linked to an AI Boardroom decision" : "AI Boardroom link (optional)"}</div>
      {link && <button data-testid="cmp-unplug" onClick={onUnplug} style={btn()}>Unplug</button>}
    </div>
    {link ? <>
      <P><b>{link.question}</b>{link.date ? " — " + link.date : ""}</P>
      {link.decision && <P small>Board's decision: {link.decision}</P>}
      <P small>Carried over: company profile (turnover, borrowings, headcount where known) and the processes in scope. Change anything on the Laws tab; unplug to make everything manual.</P>
      {link.risks.length > 0 && <div style={{ fontSize: 13, color: V.text2 }}><b style={{ color: V.text }}>Risks the Board raised — test these first:</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{link.risks.map((r) => <li key={r}>{r}</li>)}</ul></div>}
    </> : list.length ? <>
      <P small>Plug in a decision made in the AI Boardroom to pre-fill the company profile, the processes in scope and the risks the Board raised. Or start here without it.</P>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select aria-label="Boardroom decision" value={pick} onChange={(e) => setPick(e.target.value)} style={{ ...inp, width: "auto", maxWidth: "100%", flex: "1 1 260px" }}>
          <option value="">Choose a Boardroom decision…</option>{list.map((s) => <option key={s.id} value={s.id}>{s.question.slice(0, 80)}{s.date ? " (" + s.date + ")" : ""}</option>)}</select>
        <button data-testid="cmp-plug" disabled={!pick} onClick={() => { const s = list.find((x) => x.id === pick); if (s) onPlug(s, entityPatch(s, company, location)); }} style={btn(!!pick)}>Plug in</button>
      </div>
    </> : <P small>No finished AI Boardroom decision yet. You can review any process from here; when a Boardroom decision exists, you can plug it in to carry its profile and risks across.</P>}
  </div>;
}

// ── GUIDED REVIEW ─────────────────────────────────────────────────────────
const STEPS = ["Scope", "Interview", "Evaluate", "Detect", "Plan"];
function ScopeStep({ p, st, set }: { p: ReviewProcess; st: ReviewState; set: (patch: Partial<ReviewState>) => void }) {
  const qs = SCOPE_QUESTIONS.filter((q) => q.process === p); const risk = processRisk(p, st.scope); const rel = relevantQuestions(p, st.scope);
  return <div style={card}>
    <H>Step 1 — Is this process relevant here, and how risky is it?</H>
    <P small>Answer these first. They switch questions on or off so you only ask what matters for this business, and they set the risk level that drives priorities and deadlines.</P>
    {qs.map((q) => { const v = st.scope[q.id];
      return <div key={q.id} style={{ padding: "8px 0", borderBottom: "1px solid " + V.border }}>
        <div style={{ fontSize: 14, color: V.text, fontWeight: 600 }}>{q.q}</div><div style={{ fontSize: 12, color: V.text3 }}>{q.why}</div>
        {q.kind === "yesno" ? <div style={{ display: "flex", gap: 6, marginTop: 6 }}>{[["Yes", true], ["No", false]].map(([l, b]) => <button key={String(l)} data-testid={"cmp-scope-" + q.id + "-" + l} aria-pressed={v === b} onClick={() => set({ scope: { ...st.scope, [q.id]: b as boolean } })} style={btn(v === b)}>{l as string}</button>)}</div>
          : <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, maxWidth: 260 }}><input data-testid={"cmp-scope-" + q.id} inputMode="decimal" style={inp} value={v === undefined ? "" : String(v)} onChange={(e) => { const n = parseFloat(e.target.value); set({ scope: { ...st.scope, [q.id]: isFinite(n) && n >= 0 ? n : undefined } }); }} /><span style={{ fontSize: 12, color: V.text3, whiteSpace: "nowrap" }}>{q.unit}</span></div>}
      </div>; })}
    <div data-testid="cmp-risk" style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "2px solid " + (risk.level === "High" ? V.bad : risk.level === "Medium" ? V.warn : V.ok) }}>
      <b style={{ color: V.text }}>Risk level: {risk.level}</b> <span style={{ color: V.text2, fontSize: 13 }}>— {risk.why}</span>
      <div style={{ fontSize: 13, color: V.text2, marginTop: 4 }}>{rel.length ? rel.length + " questions are relevant for this business." : "No questions needed: this process does not apply here."}</div>
    </div>
  </div>;
}
function InterviewStep({ p, st, set, risks }: { p: ReviewProcess; st: ReviewState; set: (patch: Partial<ReviewState>) => void; risks: string[] }) {
  const qs = relevantQuestions(p, st.scope); const [open, setOpen] = useState<string | null>(null); const done = qs.filter((q) => st.answers[q.id]?.a).length;
  const areas = Array.from(new Set(qs.map((q) => q.area)));
  return <div style={card}>
    <H>Step 2 — Interview the process owner</H>
    <P small>Ask each question in the meeting. Open “How to judge the answer” to see what good looks like, the red flags, and the evidence to request. Mark “evidence seen” only when you have the document in hand — a claim is not evidence.</P>
    <div style={{ height: 8, background: V.surface2, borderRadius: 99, overflow: "hidden", margin: "6px 0 12px" }}><div style={{ width: (qs.length ? done / qs.length * 100 : 0) + "%", height: "100%", background: V.accent }} /></div>
    <div style={{ fontSize: 12.5, color: V.text3, marginBottom: 8 }}>{done} of {qs.length} answered</div>
    {risks.length > 0 && <div style={{ fontSize: 13, color: V.text2, background: V.surface2, borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}><b style={{ color: V.text }}>Board-raised risks to probe during the interview:</b> {risks.slice(0, 4).join(" · ")}</div>}
    {areas.map((area) => <div key={area} style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, color: V.accent, margin: "8px 0 4px" }}>{area}</div>
      {qs.filter((q) => q.area === area).map((q) => { const a = st.answers[q.id] || {}; const cs = CASES.find((c) => c.id === q.case);
        return <div key={q.id} data-testid={"cmp-q-" + q.id} style={{ border: "1px solid " + V.border, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}><div style={{ fontSize: 14, fontWeight: 700, color: V.text }}>{q.q}</div>{chip(q.weight === "High" ? "HIGH RISK" : "MEDIUM", q.weight === "High" ? "#B91C1C" : "#64748B")}</div>
          <div style={{ fontSize: 13, color: V.text2, marginTop: 4 }}><b>Why we ask:</b> {q.why}</div>
          <button onClick={() => setOpen(open === q.id ? null : q.id)} aria-expanded={open === q.id} style={{ border: "none", background: "none", color: V.accent, fontWeight: 700, cursor: "pointer", padding: "4px 0", fontSize: 13 }}>{open === q.id ? "Hide" : "How to judge the answer"}</button>
          {open === q.id && <div style={{ fontSize: 13, color: V.text2, background: V.surface2, borderRadius: 8, padding: "8px 10px" }}>
            <div><b style={{ color: V.ok }}>A good answer sounds like:</b> {q.good}</div>
            <div style={{ marginTop: 4 }}><b style={{ color: V.bad }}>Red flags:</b> {q.redFlags.join(" · ")}</div>
            <div style={{ marginTop: 4 }}><b style={{ color: V.text }}>Evidence to request:</b> {q.evidence}</div>
            <div style={{ marginTop: 4 }}><b style={{ color: V.text }}>Control it tests:</b> {q.controls.map((c) => c + (ctlText(c) ? " — " + ctlText(c)!.text.slice(0, 90) + "…" : "")).join(" | ")}</div>
            {cs && <div style={{ marginTop: 4 }}><b style={{ color: V.text }}>Real case:</b> {cs.name} ({cs.year}) — {cs.failed}</div>}
          </div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {(Object.keys(ANSWER_LABEL) as Answer[]).map((k) => <button key={k} data-testid={"cmp-a-" + q.id + "-" + k} aria-pressed={a.a === k} onClick={() => set({ answers: { ...st.answers, [q.id]: { ...a, a: k } } })} style={{ ...btn(a.a === k), fontSize: 12, minHeight: 34, padding: "0 10px" }}>{ANSWER_LABEL[k]}</button>)}
          </div>
          <input aria-label="Notes" placeholder="Notes: what they said, documents received" value={a.note || ""} onChange={(e) => set({ answers: { ...st.answers, [q.id]: { ...a, note: e.target.value } } })} style={{ ...inp, marginTop: 6 }} />
        </div>; })}
    </div>)}
  </div>;
}
function EvaluateStep({ ev }: { ev: ReturnType<typeof evaluate> }) {
  return <div style={card} data-testid="cmp-evaluate">
    <H>Step 3 — What the answers tell you</H>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{chip(ev.overall, MAT_COLOR[ev.overall])}<b style={{ color: V.text }}>{ev.headline}</b></div>
    <P small>Scoring: evidence seen = 3, claimed but not shown = 2, informal = 1, no or don't know = 0. Strong ≥ 2.6, Adequate ≥ 1.8, Weak ≥ 0.9, otherwise Missing. “Don't know” counts as a gap: if the owner cannot say whether a control exists, it cannot be relied on.</P>
    <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}><thead><tr>{["Area", "Maturity", "Answered"].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid " + V.border, color: V.text3, fontSize: 12 }}>{h}</th>)}</tr></thead>
      <tbody>{ev.areas.map((a) => <tr key={a.area}><td style={{ padding: "6px 8px", borderBottom: "1px solid " + V.border, color: V.text }}>{a.area}</td><td style={{ padding: "6px 8px", borderBottom: "1px solid " + V.border }}>{chip(a.maturity, MAT_COLOR[a.maturity])}</td><td style={{ padding: "6px 8px", borderBottom: "1px solid " + V.border, color: V.text2 }}>{a.answered}/{a.total}</td></tr>)}</tbody></table></div>
    {[["Gaps — controls weak or missing", ev.gaps, V.bad, "Each becomes an action in the plan (Step 5)."], ["Claimed but not evidenced — ask for the proof", ev.verify, V.warn, "Until you see the evidence, treat these as unverified."], ["Don't know — find out who owns these", ev.unknown, V.warn, "Nobody could answer; that is a finding in itself."]].map(([t, list, c, hint]: any) => list.length ? <div key={t} style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 800, color: c }}>{t} ({list.length})</div><div style={{ fontSize: 12, color: V.text3 }}>{hint}</div>
      <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13, color: V.text2 }}>{list.map((q: any) => <li key={q.id}>{q.weight === "High" ? "⚠ " : ""}{q.q} <span style={{ color: V.text3 }}>— evidence: {q.evidence}</span></li>)}</ul></div> : null)}
  </div>;
}
function DetectStep({ p, st, set, onRecord }: { p: ReviewProcess; st: ReviewState; set: (patch: Partial<ReviewState>) => void; onRecord: (control: string, population: number, exceptions: number, test: string) => void }) {
  const tests = DETECT_TESTS.filter((t) => t.process === p); const s = st.settings || DEFAULT_SETTINGS; const [err, setErr] = useState("");
  const download = () => { const u = URL.createObjectURL(new Blob([templateCsv(p)], { type: "text/csv" })); const a = document.createElement("a"); a.href = u; a.download = "OrchestrIQ-" + p + "-template.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); };
  const onFile = (f: File | undefined) => { if (!f) return; setErr(""); const r = new FileReader(); r.onload = () => { const rows = parseCsv(String(r.result || "")); const out = runTests(p, rows, s);
    if (out.missing.length) { setErr("These columns were not found: " + out.missing.join(", ") + ". Rename them to match the template (download it below) and try again."); return; }
    set({ results: out.results, fileName: f.name, ranAt: new Date().toISOString(), explained: {} }); }; r.readAsText(f); };
  const setS = (patch: Partial<Settings>) => set({ settings: { ...s, ...patch } });
  return <div style={card} data-testid="cmp-detect">
    <H>Step 4 — Are the controls actually catching problems?</H>
    <P>The interview tells you how the process is <i>supposed</i> to work. Data tells you whether it <i>does</i>. Upload a CSV export of {p === "te" ? "expense claims" : p === "p2p" ? "supplier invoices" : "journal entries"} for a period; every row is tested in your browser and nothing is sent anywhere.</P>
    <P small>How to judge: an exception is a lead, not proof. Investigate each one. If any turns out to be a real error or fraud, the control it maps to is <b>not operating effectively</b>, even if the interview said it exists.</P>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
      {p === "te" && <><label style={{ fontSize: 12, color: V.text2 }}>Receipt required from (₹)<input style={inp} inputMode="decimal" value={s.receiptThreshold} onChange={(e) => setS({ receiptThreshold: parseFloat(e.target.value) || 0 })} /></label><label style={{ fontSize: 12, color: V.text2 }}>Approval limit per claim (₹)<input style={inp} inputMode="decimal" value={s.approvalLimit} onChange={(e) => setS({ approvalLimit: parseFloat(e.target.value) || 0 })} /></label></>}
      {p === "p2p" && <label style={{ fontSize: 12, color: V.text2 }}>PO / approval threshold (₹)<input style={inp} inputMode="decimal" value={s.poThreshold} onChange={(e) => setS({ poThreshold: parseFloat(e.target.value) || 0 })} /></label>}
      {p === "r2r" && <><label style={{ fontSize: 12, color: V.text2 }}>Large journal threshold (₹)<input style={inp} inputMode="decimal" value={s.jeThreshold} onChange={(e) => setS({ jeThreshold: parseFloat(e.target.value) || 0 })} /></label><label style={{ fontSize: 12, color: V.text2 }}>Senior users (comma-separated names)<input style={inp} value={s.seniorUsers} onChange={(e) => setS({ seniorUsers: e.target.value })} /></label></>}
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <label style={{ ...btn(true), display: "inline-flex", alignItems: "center" }}>Upload CSV<input data-testid="cmp-upload" type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0])} /></label>
      <button onClick={download} style={btn()}>Download template</button>
      {st.fileName && <span style={{ fontSize: 12.5, color: V.text3 }}>Last run: {st.fileName}{st.ranAt ? " · " + new Date(st.ranAt).toLocaleString("en-IN") : ""}</span>}
    </div>
    {err && <div role="alert" style={{ color: V.bad, fontSize: 13, marginTop: 8 }}>{err}</div>}
    <div style={{ marginTop: 12 }}>{tests.map((t) => { const r = (st.results || []).find((x) => x.id === t.id); const exp = (st.explained || {})[t.id] || 0; const unexpl = r ? Math.max(0, r.exceptions - exp) : 0;
      return <div key={t.id} data-testid={"cmp-test-" + t.id} style={{ border: "1px solid " + V.border, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><b style={{ color: V.text }}>{t.name}</b>{r ? (r.note && !r.exceptions ? chip("NOT RUN", "#94A3B8") : r.exceptions ? chip(r.exceptions + " EXCEPTION" + (r.exceptions > 1 ? "S" : ""), "#DC2626") : chip("NONE FOUND", "#16A34A")) : chip("NOT RUN", "#94A3B8")}</div>
        <div style={{ fontSize: 13, color: V.text2 }}>{t.finds} {t.meaning} <span style={{ color: V.text3 }}>(control {t.control})</span></div>
        {r && <div style={{ fontSize: 12.5, color: V.text3, marginTop: 4 }}>{r.population} rows tested.{r.note ? " " + r.note : ""}</div>}
        {r && r.examples.length > 0 && <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12.5, color: V.text2 }}>{r.examples.map((x) => <li key={x}>{x}</li>)}{r.exceptions > r.examples.length && <li>…and {r.exceptions - r.examples.length} more</li>}</ul>}
        {r && r.exceptions > 0 && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <label style={{ fontSize: 12.5, color: V.text2 }}>Explained after investigation: <input inputMode="numeric" style={{ ...inp, width: 80, display: "inline-block" }} value={exp || ""} onChange={(e) => set({ explained: { ...(st.explained || {}), [t.id]: Math.min(r.exceptions, Math.max(0, parseInt(e.target.value) || 0)) } })} /></label>
          <span style={{ fontSize: 13, fontWeight: 700, color: unexpl ? V.bad : V.ok }}>{unexpl ? unexpl + " unexplained — control " + t.control + " is not working as designed" : "All explained"}</span>
          {unexpl > 0 && <button onClick={() => onRecord(t.control, r.population, unexpl, t.name)} style={{ ...btn(), fontSize: 12 }}>Record against {t.control}</button>}
        </div>}
        <details style={{ marginTop: 4 }}><summary style={{ fontSize: 12.5, color: V.accent, cursor: "pointer" }}>Run it in Excel instead</summary><div style={{ fontSize: 12.5, color: V.text2, marginTop: 4 }}>{t.excel}</div></details>
      </div>; })}</div>
  </div>;
}
function PlanStep({ p, ev, risk, unexplained, entity, onAsk, onExport, owners, setOwner }: { p: ReviewProcess; ev: ReturnType<typeof evaluate>; risk: "High" | "Medium" | "Low"; unexplained: string[]; entity: string; onAsk?: (q: string) => void; onExport: () => void; owners: Record<string, string>; setOwner: (control: string, name: string) => void }) {
  const plan = buildPlan(p, ev, risk); const proc = REVIEW_PROCESSES.find((x) => x.id === p)!;
  const due = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toLocaleDateString("en-IN"); };
  return <div style={card} data-testid="cmp-plan">
    <H>Step 5 — Build what is missing</H>
    <P small>Every gap becomes a control from the library with an owner, practical steps, the evidence to keep, and a deadline set by its risk. Name a real person for each; they will see their duties under “Who does what”.</P>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
      {plan.phases.map((ph) => <div key={ph.name} style={{ background: V.surface2, borderRadius: 10, padding: "10px 12px" }}><b style={{ color: V.text }}>{ph.name}</b> <span style={{ color: V.text3, fontSize: 12 }}>({ph.items} action{ph.items === 1 ? "" : "s"})</span><div style={{ fontSize: 13, color: V.text2, marginTop: 4 }}>{ph.focus}</div></div>)}
    </div>
    {unexplained.length > 0 && <div style={{ color: V.bad, fontSize: 13, marginBottom: 10 }}><b>Detection tests show controls failing in practice:</b> {unexplained.join("; ")}. Fix these alongside the design gaps below.</div>}
    {!plan.items.length ? <P>No design gaps recorded{ev.answered < ev.total ? " yet — finish the interview first" : ""}. Keep running the detection tests monthly and test operating effectiveness in the Control library.</P> :
      plan.items.map((it, i) => <div key={it.question.id} style={{ border: "1px solid " + V.border, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><b style={{ color: V.text }}>{i + 1}. {it.control ? it.control.id + " — " : ""}{it.question.area}</b>
          <span>{chip(it.priority === "High" ? "HIGH" : "MEDIUM", it.priority === "High" ? "#B91C1C" : "#64748B")} <span style={{ fontSize: 12, color: V.text3 }}>due {due(it.days)}</span></span></div>
        <div style={{ fontSize: 13, color: V.text2, marginTop: 4 }}><b>Gap:</b> {it.question.q}</div>
        {it.control && <div style={{ fontSize: 13, color: V.text2, marginTop: 2 }}><b>Control to put in place:</b> {it.control.text}</div>}
        <ol style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: V.text2 }}>{it.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        {it.control && <label style={{ display: "block", fontSize: 12.5, color: V.text2, marginTop: 6, maxWidth: 360 }}>Owner (role: {it.control.owner})<input style={inp} placeholder="Name" value={owners[it.control.id] || ""} onChange={(e) => setOwner(it.control!.id, e.target.value)} /></label>}
      </div>)}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      {onAsk && <button data-testid="cmp-ask-board" onClick={() => onAsk(boardroomQuestion(entity, proc.name, ev, unexplained))} style={btn(true)}>Ask the AI Boardroom to prioritise these</button>}
      <button data-testid="cmp-export-review" onClick={onExport} style={btn()}>Export this review (Excel)</button>
    </div>
    {onAsk && <P small>Opens the AI Boardroom with the question filled in. Nothing runs until you press Run there.</P>}
  </div>;
}

export function ProcessReview({ p, setP, st, set, entity, link, risks, onRecord, onAsk, owners, setOwner }:
  { p: ReviewProcess; setP: (p: ReviewProcess) => void; st: ReviewState; set: (patch: Partial<ReviewState>) => void; entity: string; link: LinkState | null; risks: string[];
    onRecord: (control: string, population: number, exceptions: number, test: string) => void; onAsk?: (q: string) => void; owners: Record<string, string>; setOwner: (c: string, n: string) => void }) {
  const ev = useMemo(() => evaluate(p, st.scope, st.answers), [p, st.scope, st.answers]); const risk = processRisk(p, st.scope);
  const unexplained = (st.results || []).map((r) => { const t = DETECT_TESTS.find((x) => x.id === r.id)!; const u = r.exceptions - ((st.explained || {})[r.id] || 0); return u > 0 ? t.name + " (" + u + ", control " + t.control + ")" : ""; }).filter(Boolean);
  const step = st.step || 1;
  const exportXlsx = async () => {
    try { const ExcelJS: any = (await import("exceljs")).default; const wb = new ExcelJS.Workbook(); const proc = REVIEW_PROCESSES.find((x) => x.id === p)!;
      const s1 = wb.addWorksheet("Interview"); s1.addRow(["Area", "Question", "Risk", "Answer", "Notes", "Why we ask", "Evidence to request", "Controls"]); s1.getRow(1).font = { bold: true };
      for (const q of ev.questions) s1.addRow([q.area, q.q, q.weight, st.answers[q.id]?.a ? ANSWER_LABEL[st.answers[q.id].a as Answer] : "Not answered", st.answers[q.id]?.note || "", q.why, q.evidence, q.controls.join(", ")]);
      const s2 = wb.addWorksheet("Gaps & plan"); s2.addRow(["Priority", "Gap", "Control", "Owner role", "Owner name", "Steps", "Due in (days)"]); s2.getRow(1).font = { bold: true };
      for (const it of buildPlan(p, ev, risk.level).items) s2.addRow([it.priority, it.question.q, it.control ? it.control.id + " " + it.control.text : "", it.control?.owner || "", it.control ? owners[it.control.id] || "" : "", it.steps.join("\n"), it.days]);
      const s3 = wb.addWorksheet("Detection tests"); s3.addRow(["Test", "Rows tested", "Exceptions", "Explained", "Unexplained", "Control", "Examples"]); s3.getRow(1).font = { bold: true };
      for (const t of DETECT_TESTS.filter((x) => x.process === p)) { const r = (st.results || []).find((x) => x.id === t.id); const e = (st.explained || {})[t.id] || 0; s3.addRow([t.name, r?.population ?? "", r?.exceptions ?? "Not run", r ? e : "", r ? Math.max(0, r.exceptions - e) : "", t.control, r ? r.examples.join("\n") : ""]); }
      const s4 = wb.addWorksheet("Summary"); [["Entity", entity], ["Process", proc.name], ["Risk level", risk.level + " — " + risk.why], ["Design maturity", ev.overall], ["Headline", ev.headline], ["Linked Boardroom decision", link ? link.question : "Not linked"], ["Prepared", new Date().toLocaleString("en-IN")], ["Note", "Prepared with OrchestrIQ. Practitioner guidance; final conclusions rest with management and auditors."]].forEach((r) => s4.addRow(r));
      [s1, s2, s3, s4].forEach((ws: any) => ws.columns.forEach((c: any) => { c.width = 34; c.alignment = { wrapText: true, vertical: "top" }; }));
      const buf = await wb.xlsx.writeBuffer(); const u = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); const a = document.createElement("a"); a.href = u; a.download = "Control-Review-" + p + "-" + (entity || "entity").replace(/[^A-Za-z0-9]+/g, "-") + ".xlsx"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    } catch (e) { console.warn(e); } };
  return <div data-testid="cmp-review">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 14 }}>
      {REVIEW_PROCESSES.map((x) => <button key={x.id} data-testid={"cmp-rp-" + x.id} onClick={() => setP(x.id)} style={{ textAlign: "left", border: "2px solid " + (p === x.id ? V.accent : V.border), background: V.surface, borderRadius: 12, padding: "10px 12px", cursor: "pointer", color: V.text }}>
        <div style={{ fontWeight: 800 }}>{x.name}</div><div style={{ fontSize: 12.5, color: V.text2 }}>{x.plain}</div></button>)}
    </div>
    <div role="tablist" aria-label="Review steps" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      {STEPS.map((s, i) => <button key={s} role="tab" aria-selected={step === i + 1} data-testid={"cmp-step-" + (i + 1)} onClick={() => set({ step: i + 1 })} style={btn(step === i + 1)}>{i + 1}. {s}</button>)}
    </div>
    {step === 1 && <ScopeStep p={p} st={st} set={set} />}
    {step === 2 && <InterviewStep p={p} st={st} set={set} risks={risks} />}
    {step === 3 && <EvaluateStep ev={ev} />}
    {step === 4 && <DetectStep p={p} st={st} set={set} onRecord={onRecord} />}
    {step === 5 && <PlanStep p={p} ev={ev} risk={risk.level} unexplained={unexplained} entity={entity} onAsk={onAsk} onExport={exportXlsx} owners={owners} setOwner={setOwner} />}
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <button disabled={step <= 1} onClick={() => set({ step: step - 1 })} style={{ ...btn(), opacity: step <= 1 ? 0.4 : 1 }}>← Back</button>
      <button data-testid="cmp-next" disabled={step >= 5} onClick={() => set({ step: step + 1 })} style={{ ...btn(true), opacity: step >= 5 ? 0.4 : 1 }}>Next: {STEPS[Math.min(4, step)]} →</button>
    </div>
  </div>;
}

// ── WHO DOES WHAT ─────────────────────────────────────────────────────────
export function RolesView({ names }: { names: Record<string, string[]> }) {
  const [f, setF] = useState<ReviewProcess | "all">("all");
  const list = ROLE_CARDS.filter((r) => f === "all" || r.processes.includes(f));
  return <div data-testid="cmp-roles">
    <div style={card}><H>Who does what — and why it matters</H><P>Controls are only as strong as the people running them. Share this page with everyone in the process: each card explains the duty, why it is critical, the evidence to keep, the red lines, and how performance is judged.</P>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{([["all", "All roles"], ...REVIEW_PROCESSES.map((p) => [p.id, p.name.split(" (")[0]])] as [string, string][]).map(([k, l]) => <button key={k} aria-pressed={f === k} onClick={() => setF(k as any)} style={btn(f === k)}>{l}</button>)}</div></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
      {list.map((r) => { const cs = CASES.find((c) => c.id === r.case); const people = r.controls.flatMap((c) => names[c] || []);
        return <div key={r.role} style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: V.text }}>{r.role}</div>
          {people.length > 0 && <div style={{ fontSize: 12, color: V.accent, fontWeight: 700 }}>Assigned: {Array.from(new Set(people)).join(", ")}</div>}
          <div style={{ fontSize: 13, color: V.text2, marginTop: 6 }}><b style={{ color: V.text }}>Your duty:</b> {r.duty}</div>
          <div style={{ fontSize: 13, color: V.text2, marginTop: 4 }}><b style={{ color: V.text }}>Why it is critical:</b> {r.why}{cs ? " (" + cs.name + ", " + cs.year + ": " + cs.failed + ")" : ""}</div>
          <div style={{ fontSize: 13, color: V.text2, marginTop: 4 }}><b style={{ color: V.text }}>Evidence you keep:</b> {r.evidence}</div>
          <div style={{ fontSize: 13, color: V.text2, marginTop: 4 }}><b style={{ color: V.bad }}>Never:</b><ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{r.never.map((n) => <li key={n}>{n}</li>)}</ul></div>
          <div style={{ fontSize: 13, color: V.text2, marginTop: 4 }}><b style={{ color: V.text }}>How you are judged:</b> {r.measured}</div>
          <div style={{ fontSize: 12, color: V.text3, marginTop: 4 }}>Controls: {r.controls.join(", ")}</div>
        </div>; })}
    </div>
  </div>;
}
