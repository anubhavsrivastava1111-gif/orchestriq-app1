import React, { useMemo, useState } from "react";
import type { Cell } from "./lib/SheetsEngine";
import { toTable, profile, columnInsights } from "./lib/SheetsAnalytics";
import { setOverrides, getOverrides, unpivot, kindWord, mergeAI, understandPrompt, UNDERSTAND_SYSTEM, type Role, type ColSem } from "./lib/SheetsUnderstand";

// 🔍 UNDERSTAND: before any analysis, show exactly how the sheet was read: where the table is,
// what each column means, how it will be aggregated, and how trustworthy the data is.
// Every correction you make here is remembered and used by Smart, Analyze, Pivot, Chart, Ask,
// the dashboard, Automate and all reports.
const V = { text: "var(--oiq-ink)", text2: "var(--oiq-body)", text3: "var(--oiq-muted)", border: "var(--oiq-border)", surface: "var(--oiq-surface)", surface2: "var(--oiq-surface2)", accent: "var(--oiq-accent)", ok: "var(--oiq-success)", warn: "var(--oiq-warning)", bad: "var(--oiq-danger)" };
const btn = (on = false): React.CSSProperties => ({ minHeight: 34, padding: "0 10px", borderRadius: 8, border: "1px solid " + (on ? V.accent : V.border), background: on ? V.accent : V.surface, color: on ? "#fff" : V.text, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" });
type Ask = (sys: string, msgs: { role: string; content: string }[], maxT?: number) => Promise<string>;
export interface UnderstandCtx { getValues: () => Cell[][]; version: number; sheetName: string; ask?: Ask; addSheet: (name: string, rows: Cell[][], style?: any) => void; toast: (m: string, k?: string) => void; refresh: () => void; analyse: () => void }
const ROLE_LABEL: Record<Role, string> = { measure: "Add up", "measure-avg": "Average", dimension: "Break down by", time: "Time", identifier: "ID (count)", text: "Text", ignore: "Ignore" };
const ROLE_COLOR: Record<Role, string> = { measure: "#2563EB", "measure-avg": "#7C3AED", dimension: "#0891B2", time: "#16A34A", identifier: "#64748B", text: "#94A3B8", ignore: "#CBD5E1" };

export default function UnderstandPanel({ ctx }: { ctx: UnderstandCtx }) {
  const t = useMemo(() => toTable(ctx.getValues()), [ctx.version, ctx.sheetName]); // eslint-disable-line react-hooks/exhaustive-deps
  const u = t.und; const p = useMemo(() => profile(t), [t]); const ins = useMemo(() => columnInsights(t, p), [t, p]);
  const [ai, setAi] = useState<{ dataset: string; questions: string[]; changes: string[] } | null>(null); const [busy, setBusy] = useState(false); const [open, setOpen] = useState<number | null>(null);
  if (!u || !u.headers.length) return <div style={{ fontSize: 13, color: V.text3 }}>Open a data file (Excel or CSV) or paste data into this sheet. Studio will find the table and explain every column.</div>;
  const setRole = (c: ColSem, role: Role) => { const ov = { ...getOverrides(u.headers) }; ov[c.name] = { ...(ov[c.name] || {}), role, agg: role === "measure" ? "sum" : role === "measure-avg" ? "avg" : role === "identifier" ? "count" : "none" }; setOverrides(u.headers, ov); ctx.refresh(); ctx.toast(c.name + " is now: " + ROLE_LABEL[role] + ". Every analysis will use this.", "success"); };
  const readAI = async () => { if (!ctx.ask) return; setBusy(true); try { const r = await ctx.ask(UNDERSTAND_SYSTEM, [{ role: "user", content: understandPrompt(u) }], 1500); const m = mergeAI(u, r);
      if (!m) { ctx.toast("The AI's reply could not be read. Try again.", "warning"); } else { const ov = { ...getOverrides(u.headers) }; m.cols.forEach((c) => { const o = u.cols.find((x) => x.name === c.name)!; if (c.meaning || c.role !== o.role) ov[c.name] = { ...(ov[c.name] || {}), meaning: c.meaning, ...(c.role !== o.role ? { role: c.role, agg: c.agg } : {}) }; }); setOverrides(u.headers, ov); setAi(m); ctx.refresh(); } }
    catch (e: any) { ctx.toast("AI request failed: " + (e?.message || e), "warning"); } setBusy(false); };
  const q = u.quality; const qc = q.score >= 90 ? V.ok : q.score >= 75 ? V.accent : q.score >= 55 ? V.warn : V.bad;
  return <div data-testid="und-panel">
    <div style={{ fontWeight: 800, fontSize: 14 }}>What this data is</div>
    <div data-testid="und-desc" style={{ fontSize: 13, color: V.text2, margin: "4px 0 8px", lineHeight: 1.5 }}>{ai?.dataset || u.description}</div>
    {ai?.dataset && <div style={{ fontSize: 11.5, color: V.text3, marginTop: -4, marginBottom: 8 }}>Detected: {u.description}</div>}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
      <button data-testid="und-analyse" onClick={ctx.analyse} style={btn(true)}>Analyse with this understanding →</button>
      <button data-testid="und-ai" disabled={!ctx.ask || busy} onClick={readAI} style={{ ...btn(), opacity: !ctx.ask || busy ? 0.6 : 1 }}>{busy ? "Reading…" : "Ask AI to read it"}</button>
    </div>
    {ai && (ai.questions.length > 0 || ai.changes.length > 0) && <div data-testid="und-ai-out" style={{ fontSize: 12.5, color: V.text2, marginBottom: 10, padding: "8px 10px", borderRadius: 10, background: V.surface2 }}>
      {ai.changes.length > 0 && <div><b>AI adjusted:</b> {ai.changes.join("; ")}</div>}{ai.questions.length > 0 && <div><b>This data can answer:</b> {ai.questions.join(" · ")}</div>}</div>}

    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, border: "1px solid " + V.border, marginBottom: 10 }}>
      <div data-testid="und-score" style={{ width: 54, height: 54, borderRadius: 27, display: "grid", placeItems: "center", border: "4px solid " + qc, fontWeight: 800, fontSize: 17 }}>{q.score}</div>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>Data quality: {q.grade}</div><div style={{ fontSize: 12, color: V.text3 }}>{q.issues.length ? q.issues.length + " thing" + (q.issues.length > 1 ? "s" : "") + " to know" : "No issues found."}</div></div></div>
    {q.issues.length > 0 && <ul data-testid="und-issues" style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 12.5, color: V.text2 }}>{q.issues.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}</ul>}

    {(u.layout.findings.length > 0 || u.layout.titles.length > 0) && <div data-testid="und-layout" style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>How the sheet was read</div>
      {u.layout.titles.length > 0 && <div style={{ fontSize: 12.5, color: V.text2 }}>Title: <i>{u.layout.titles.join(" · ")}</i></div>}
      <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 12.5, color: V.text2 }}>{u.layout.findings.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      {(u.layout.headerRow > 0 || u.layout.colStart > 0 || u.layout.totalRows.length > 0 || u.layout.notes.length > 0 || u.layout.blankRows > 0) && <button data-testid="und-clean" onClick={() => { ctx.addSheet("Clean data", [u.headers, ...(t.rows as Cell[][])], { headerRows: [0], freezeRows: 1 }); ctx.toast("Clean table created: " + t.rows.length + " rows with one header row.", "success"); }} style={btn()}>Create clean table</button>}
      {u.wide && <button data-testid="und-long" onClick={() => { const ctxText = [...u.layout.titles, ...u.headers].join(" "); const unit = /crore|\bcr\b/i.test(ctxText) ? " (₹ crore)" : /lakh|lac/i.test(ctxText) ? " (₹ lakh)" : /'000|thousand/i.test(ctxText) ? " ('000)" : /₹|\brs\b|inr/i.test(ctxText) ? " (₹)" : "";
        const val = (/lakh|crore|₹|\brs\b|amount|value|revenue|sales|cost|p&l|profit|expense|budget/i.test(ctxText) ? "Amount" : "Value") + unit;   /* the scale often lives in the title line */ const lg = unpivot(u.headers, u.rows as Cell[][], u.wide!, val); ctx.addSheet("Long format", [lg.headers, ...lg.rows], { headerRows: [0], freezeRows: 1 }); ctx.toast("Converted to long format: " + lg.rows.length + " rows (one per item and period). Analyse that sheet to trend by period.", "success"); }} style={btn(true)}>Convert to long format</button>}
    </div>

    <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Column dictionary ({u.cols.length})</div>
    <div data-testid="und-cols" style={{ display: "grid", gap: 6 }}>
      {u.cols.map((c) => <div key={c.index} data-testid={"und-col-" + c.index} style={{ border: "1px solid " + V.border, borderRadius: 10, padding: "8px 10px", background: V.surface }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 13 }}>{c.name}</b>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: ROLE_COLOR[c.role], borderRadius: 99, padding: "1px 8px" }}>{ROLE_LABEL[c.role]}</span>
          <span style={{ fontSize: 11.5, color: V.text3 }}>{kindWord(c.kind)}{c.unit ? " · " + c.unit : ""}{c.agg === "weighted-avg" ? " · weighted" : ""}</span>
          {c.confidence !== "high" && <span style={{ fontSize: 11, color: c.confidence === "low" ? V.bad : V.warn }}>{c.confidence} confidence</span>}
          <select aria-label={"How to use " + c.name} data-testid={"und-role-" + c.index} value={c.role} onChange={(e) => setRole(c, e.target.value as Role)} style={{ marginLeft: "auto", minHeight: 28, borderRadius: 7, border: "1px solid " + V.border, background: V.surface, color: V.text, fontSize: 12 }}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        </div>
        {c.meaning && <div style={{ fontSize: 12.5, color: V.text2, marginTop: 3 }}>{c.meaning}</div>}
        <div style={{ fontSize: 12, color: V.text3, marginTop: 3 }}>{Math.round(c.filled * 100)}% filled · {c.distinct.toLocaleString("en-IN")} distinct · e.g. {c.sample.slice(0, 3).join(", ")}
          <button onClick={() => setOpen(open === c.index ? null : c.index)} style={{ border: "none", background: "none", color: V.accent, cursor: "pointer", fontSize: 12, marginLeft: 6 }}>{open === c.index ? "less" : "why?"}</button></div>
        {open === c.index && <div data-testid={"und-why-" + c.index} style={{ fontSize: 12, color: V.text2, marginTop: 4 }}>{c.reason}</div>}
      </div>)}
    </div>

    {ins.length > 0 && <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Column by column</div>
      <div data-testid="und-insights" style={{ display: "grid", gap: 6 }}>{ins.map((x, i) => <div key={i} style={{ fontSize: 12.5, color: V.text2, borderLeft: "3px solid " + V.accent, padding: "2px 0 2px 10px" }}><b style={{ color: V.text }}>{x.column}:</b> {x.line}</div>)}</div></div>}
  </div>;
}
