import React, { useMemo, useRef, useState } from "react";
import type { Cell } from "./lib/SheetsEngine";
import { colToLetters, lettersToCol, parseRange, parseCell } from "./lib/SheetsEngine";
import { toTable, profile, numericCols, avgCols, categoryCols, dateCol, pivot, pivotSheetRows, analysisSheetRows, fmtNum, type PivotSpec } from "./lib/SheetsAnalytics";
import { computeChart } from "./lib/SheetsSmart";
import { healthScan, applyFixes, bridge, bridgeSheetRows, periodsOf } from "./lib/SheetsAutomate";
import { unpivot } from "./lib/SheetsUnderstand";
import { AGENT_SYSTEM, validatePlan, describeStep, scorecardRows, FILL_SYSTEM, fillPrompt, parseFill, FILL_BATCH, textToTable, TEXT_SYSTEM, parseTextTable, diagnose, DOCTOR_SYSTEM, parseDoctor, sensitivitySteps, goalSeek, type SheetInfo, type Plan, type Step, type Diagnosis } from "./lib/SheetsAgent";
import { makeReport, downloadPdf, downloadPpt, type BasketItem, type SheetStyle } from "./SheetsInsights";
import { EChartRaw, themeInk } from "./SheetsCharts";

// ✨ AGENT: one instruction → a plan you approve → built step by step, with one-click undo.
// Plus Fill column with AI, Paste text → table, and the Formula Doctor.
const V = { text: "var(--oiq-ink)", text2: "var(--oiq-body)", text3: "var(--oiq-muted)", border: "var(--oiq-border)", surface: "var(--oiq-surface)", surface2: "var(--oiq-surface2)", accent: "var(--oiq-accent)", ok: "var(--oiq-success)", warn: "var(--oiq-warning)", bad: "var(--oiq-danger)" };
const inp: React.CSSProperties = { minHeight: 34, padding: "0 8px", borderRadius: 8, border: "1px solid " + V.border, background: V.surface, color: V.text, fontSize: 12.5, boxSizing: "border-box", width: "100%" };
const btn = (on = false): React.CSSProperties => ({ minHeight: 34, padding: "0 10px", borderRadius: 8, border: "1px solid " + (on ? V.accent : V.border), background: on ? V.accent : V.surface, color: on ? "#fff" : V.text, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" });
type Ask = (sys: string, msgs: { role: string; content: string }[], maxT?: number) => Promise<string>;
export interface AgentCtx {
  ask?: Ask; toast: (m: string, k?: string) => void; sheets: () => string[]; active: () => string; values: (s?: string) => Cell[][]; formulas: (s?: string) => Cell[][];
  addSheet: (name: string, rows: Cell[][], style?: SheetStyle) => void; replaceValues: (s: string, rows: Cell[][]) => void; write: (s: string, cells: { r: number; c: number; v: Cell }[]) => void;
  format: (s: string, range: string, o: { numberFormat?: string; bold?: boolean; fill?: string }) => void; backup: () => void; revert: () => void; canRevert: boolean;
  basket: BasketItem[]; setBasket: (b: BasketItem[]) => void; workbookName: string; select: (s: string, a1: string) => void;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function sheetInfos(ctx: AgentCtx): SheetInfo[] { return ctx.sheets().map((name) => { const t = toTable(ctx.values(name)); const p = profile(t); return { name, headers: t.headers, rows: t.rows.length, measures: numericCols(p).map((c) => c.name), averaged: avgCols(p).map((c) => c.name), dims: categoryCols(p).map((c) => c.name), time: dateCol(p)?.name || null, description: t.und?.description || "" }; }); }

export default function AgentPanel({ ctx }: { ctx: AgentCtx }) {
  const [mode, setMode] = useState<"do" | "fill" | "paste" | "fix">("do");
  return <div data-testid="agent-panel">
    <div role="tablist" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 10 }}>{([["do", "Do it"], ["fill", "Fill column"], ["paste", "Paste text"], ["fix", "Fix formulas"]] as const).map(([k, l]) =>
      <button key={k} role="tab" aria-selected={mode === k} data-testid={"ag-mode-" + k} onClick={() => setMode(k)} style={{ ...btn(mode === k), minHeight: 30, fontSize: 11.5, padding: "0 4px" }}>{l}</button>)}</div>
    {mode === "do" && <DoIt ctx={ctx} />}{mode === "fill" && <Fill key={"fill:" + ctx.active()} ctx={ctx} />}{mode === "paste" && <Paste ctx={ctx} />}{mode === "fix" && <Doctor key={"fix:" + ctx.active()} ctx={ctx} />}
  </div>;
}

// ── Do it: multi-step agent ──
const EXAMPLES = ["Build a dashboard of sales by region with KPI cards, a pivot by product and a PDF", "Clean this data and add a GST column at 18% on Amount", "Explain why sales moved last month and make a PowerPoint", "Create a 12-month cash-flow forecast template for a small business"];
function DoIt({ ctx }: { ctx: AgentCtx }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [plan, setPlan] = useState<Plan | null>(null);
  const [run, setRun] = useState<{ step: string; status: "wait" | "run" | "ok" | "fail"; msg: string }[]>([]); const [done, setDone] = useState<string | null>(null);
  const propose = async () => { if (!ctx.ask || !q.trim()) return; setBusy(true); setPlan(null); setRun([]); setDone(null);
    try { const infos = sheetInfos(ctx); const context = "Workbook: " + ctx.workbookName + "\nActive sheet: " + ctx.active() + "\nSheets:\n" + infos.map((s) => "- " + s.name + ": " + s.rows + " rows; columns: " + s.headers.join(", ") + (s.measures.length ? "; add-up measures: " + s.measures.join(", ") : "") + (s.averaged.length ? "; averaged: " + s.averaged.join(", ") : "") + (s.dims.length ? "; break-downs: " + s.dims.slice(0, 5).join(", ") : "") + (s.time ? "; time: " + s.time : "")).join("\n");
      const r = await ctx.ask(AGENT_SYSTEM, [{ role: "user", content: context + "\n\nInstruction: " + q.trim() }], 3000); setPlan(validatePlan(r, infos)); }
    catch (e: any) { setPlan({ goal: "", steps: [], errors: ["AI request failed: " + (e?.message || e)], notes: [] }); } setBusy(false); };
  const execute = async () => { if (!plan) return; ctx.backup(); type RunRow = { step: string; status: "wait" | "run" | "ok" | "fail"; msg: string }; const st: RunRow[] = plan.steps.map((s) => ({ step: describeStep(s), status: "wait", msg: "" })); setRun(st); let basket = [...ctx.basket]; const created: string[] = [];
    const set = (i: number, status: "run" | "ok" | "fail", msg = "") => { st[i] = { ...st[i], status, msg }; setRun([...st]); };
    for (let i = 0; i < plan.steps.length; i++) { const s = plan.steps[i]; set(i, "run"); await wait(60);
      try { const msg = await doStep(ctx, s, basket, (b) => { basket = b; ctx.setBasket(b); }, created); set(i, "ok", msg); } catch (e: any) { set(i, "fail", String(e?.message || e)); } await wait(80); }
    await wait(500); let errs = 0; for (const name of created) { const v = ctx.values(name); for (const row of v) for (const x of row) if (typeof x === "string" && /^#(REF!|NAME\?|DIV\/0!|VALUE!|N\/A|NUM!)/.test(x)) errs++; }
    setDone((st.filter((x) => x.status === "ok").length + " of " + st.length + " steps done.") + (created.length ? " Created: " + created.join(", ") + "." : "") + (errs ? " ⚠ " + errs + " formula error(s) in new sheets: open Fix formulas." : " New formulas checked: no errors.")); };
  const ans = plan?.steps.filter((s) => s.do === "answer") as { do: "answer"; text: string }[] | undefined; const acts = plan?.steps.filter((s) => s.do !== "answer") || [];
  return <div data-testid="ag-do">
    <div style={{ fontSize: 12.5, color: V.text3, marginBottom: 6 }}>Describe the outcome. The agent plans the steps (sheets, formulas, pivots, dashboards, cleaning, charts, reports) and builds them after you approve.</div>
    <textarea data-testid="ag-q" value={q} onChange={(e) => setQ(e.target.value)} rows={3} placeholder="e.g. Build a dashboard of sales by region with KPI cards and a PDF" style={{ ...inp, minHeight: 70, padding: 8 }} />
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "6px 0" }}>{EXAMPLES.map((x) => <button key={x} onClick={() => setQ(x)} style={{ ...btn(), fontSize: 11, minHeight: 28, fontWeight: 600, whiteSpace: "normal", textAlign: "left" }}>{x}</button>)}</div>
    <button data-testid="ag-plan" disabled={!ctx.ask || busy || !q.trim()} onClick={propose} style={{ ...btn(true), width: "100%", opacity: !ctx.ask || busy || !q.trim() ? 0.6 : 1 }}>{busy ? "Planning…" : ctx.ask ? "Plan it" : "AI not available"}</button>
    {plan && <div data-testid="ag-planbox" style={{ marginTop: 10, border: "1px solid " + V.border, borderRadius: 12, padding: "10px 12px" }}>
      {plan.goal && <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>{plan.goal}</div>}
      {ans?.map((a, i) => <div key={i} style={{ fontSize: 13, color: V.text2, whiteSpace: "pre-wrap", marginBottom: 6 }}>{a.text}</div>)}
      {acts.length > 0 && <ol data-testid="ag-steps" style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>{acts.map((s, i) => { const r = run[plan.steps.indexOf(s)];
        return <li key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid " + V.border, fontSize: 12.5 }}>
          <span style={{ width: 20, height: 20, borderRadius: 10, flex: "0 0 20px", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, color: "#fff", background: !r ? V.text3 : r.status === "ok" ? V.ok : r.status === "fail" ? V.bad : r.status === "run" ? V.accent : V.text3 }}>{!r || r.status === "wait" ? i + 1 : r.status === "ok" ? "✓" : r.status === "fail" ? "!" : "…"}</span>
          <span><span style={{ color: V.text }}>{describeStep(s)}</span>{r?.msg && <span style={{ display: "block", color: r.status === "fail" ? V.bad : V.text3, fontSize: 12 }}>{r.msg}</span>}</span></li>; })}</ol>}
      {plan.notes.map((n, i) => <div key={i} style={{ fontSize: 12, color: V.text3, marginTop: 4 }}>ℹ {n}</div>)}
      {plan.errors.length > 0 && <div data-testid="ag-errors" style={{ marginTop: 6, fontSize: 12.5, color: V.bad }}><b>Not allowed:</b><ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{plan.errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {acts.length > 0 && !run.length && <button data-testid="ag-run" onClick={execute} style={btn(true)}>Approve and build ({acts.length} step{acts.length > 1 ? "s" : ""})</button>}
        {!run.length && <button onClick={() => setPlan(null)} style={btn()}>Discard</button>}
        {run.length > 0 && ctx.canRevert && <button data-testid="ag-undo" onClick={() => { ctx.revert(); setRun([]); setDone("Undone: the workbook is back to how it was before this run."); }} style={btn()}>Undo this whole run</button>}
      </div>
      {done && <div data-testid="ag-done" role="status" style={{ marginTop: 8, fontSize: 12.5, color: /⚠/.test(done) ? V.warn : V.ok }}>{done}</div>}
    </div>}
  </div>;
}
const pStyle = (rows: Cell[][]): SheetStyle => { const n = Math.max(...rows.map((r) => r.length)); return { titleRow: 0, headerRows: [2], totalRows: [rows.length - 1], freezeRows: 3, widths: [200, ...Array(Math.max(0, n - 1)).fill(120)], numFmt: [{ r1: 3, r2: rows.length - 1, c1: 1, c2: n - 1, pattern: "#,##0" }] }; };
async function doStep(ctx: AgentCtx, s: Step, basket: BasketItem[], setBasket: (b: BasketItem[]) => void, created: string[]): Promise<string> {
  const before = new Set(ctx.sheets()); const track = () => ctx.sheets().filter((n) => !before.has(n)).forEach((n) => created.push(n));
  switch (s.do) {
    case "newSheet": { const nf: { r1: number; r2: number; c1: number; c2: number; pattern: string }[] = []; const add = (rs: string[] | undefined, pat: string) => (rs || []).forEach((x) => { const g = parseRange(x); if (g) nf.push({ r1: g.r1, r2: g.r2, c1: g.c1, c2: g.c2, pattern: pat }); });
      add(s.currency, "#,##0"); add(s.percent, "0.0%"); ctx.addSheet(s.name, s.rows, { headerRows: s.headerRows || [0], totalRows: s.totalRows, numFmt: nf, widths: s.widths || [200, ...Array(Math.max(0, Math.max(...s.rows.map((r) => r.length)) - 1)).fill(120)], freezeRows: (s.headerRows || [0])[0] + 1 }); track(); return s.rows.length + " rows written."; }
    case "formulaColumn": { const t = toTable(ctx.values(s.sheet)); const c = lettersToCol(s.column);
      const hdrRow = t.und?.layout.headerRow ?? 0; const cells: { r: number; c: number; v: Cell }[] = [{ r: hdrRow, c, v: s.header }]; (t.rowIdx || []).forEach((r) => cells.push({ r, c, v: s.template.replace(/\{r\}/g, String(r + 1)) })); ctx.write(s.sheet, cells); return (cells.length - 1) + " rows filled."; }
    case "pivot": { const t = toTable(ctx.values(s.sheet)); const spec: PivotSpec = { rows: s.rows, cols: s.cols, value: s.value, agg: s.agg }; const res: any = pivot(t, spec); if ("error" in res) throw new Error(res.error); const ps = pivotSheetRows(t, spec, res, s.sheet); ctx.addSheet("Pivot", ps.rows, pStyle(ps.rows)); track(); return ps.live ? "Live formulas." : ps.note; }
    case "scorecards": { const t = toTable(ctx.values(s.sheet)); const p = profile(t); const avg = avgCols(p).map((c) => c.name); const rows = scorecardRows(s.sheet, t, s.measures, avg, s.by); ctx.addSheet("Dashboard", rows, { titleRow: 0, headerRows: [2, ...(s.by ? [s.measures.length + 5] : [])], widths: [220, 150, 150, 150, 150], numFmt: [{ r1: 3, r2: 2 + s.measures.length, c1: 1, c2: 1, pattern: "#,##0" }] }); track();
      if (s.by && s.measures[0]) { const d = computeChart(t, { type: "column", x: s.by, y: s.measures[0], agg: avg.includes(s.measures[0]) ? "avg" : "sum" }); if (!("error" in d)) setBasket([...basket, { id: "ag-" + Date.now(), title: d.title, why: "From the dashboard.", type: "column", data: d }]); } return "KPI cards and breakdown created."; }
    case "analysis": { const t = toTable(ctx.values(s.sheet)); ctx.addSheet("Analysis", analysisSheetRows(t, profile(t), s.sheet), { titleRow: 0, widths: [220, 140, 140, 140, 140, 100] }); track(); return "Analysis sheet created."; }
    case "clean": { const v = ctx.values(s.sheet), f = ctx.formulas(s.sheet); const grid = v.map((row, r) => row.map((x, c) => (typeof f[r]?.[c] === "string" && String(f[r][c]).startsWith("=") ? f[r][c] : x))); const t = toTable(v); const hasF = grid.some((r) => r.some((x) => typeof x === "string" && x.startsWith("=")));
      const issues = healthScan(t).filter((i) => i.fixable && !i.optIn && !(i.kind === "duplicates" && hasF)); const fx = applyFixes(grid, issues); if (fx.log.length) ctx.replaceValues(s.sheet, fx.values); return fx.log.length ? fx.log.join(" ") : "Nothing needed fixing."; }
    case "unpivot": { const t = toTable(ctx.values(s.sheet)); const u = t.und; if (!u?.wide) return "This sheet isn't in months-across layout; nothing to convert."; const lg = unpivot(u.headers, u.rows, u.wide, "Amount"); ctx.addSheet("Long format", [lg.headers, ...lg.rows], { headerRows: [0], freezeRows: 1 }); track(); return lg.rows.length + " rows."; }
    case "bridge": { const t = toTable(ctx.values(s.sheet)); const per = periodsOf(t, s.period); const from = s.from && per.includes(s.from) ? s.from : per[per.length - 2], to = s.to && per.includes(s.to) ? s.to : per[per.length - 1]; if (!from || !to) throw new Error("Needs at least two periods.");
      const p = profile(t); const spec = { measure: s.measure, periodCol: s.period, from, to, dims: s.by && s.by.length ? s.by : categoryCols(p).slice(0, 2).map((c) => c.name), units: numericCols(p).find((c) => /unit|qty|quant/i.test(c.name))?.name, priceDim: categoryCols(p).find((c) => /product|item|sku|service/i.test(c.name))?.name };
      const b = bridge(t, spec); if ("error" in b) throw new Error(b.error); ctx.addSheet("Bridge", bridgeSheetRows(spec, b), { titleRow: 0, headerRows: [2], widths: [220, 140, 140, 120, 100] }); track(); return b.commentary[0]; }
    case "format": ctx.format(s.sheet, s.range, { numberFormat: s.numberFormat, bold: s.bold, fill: s.fill }); return "Formatted.";
    case "chart": { const t = toTable(ctx.values(s.sheet)); const d = computeChart(t, { type: s.type, x: s.x, y: s.y || null, agg: (s.agg || "sum") as any, split: s.split }); if ("error" in d) throw new Error(d.error); setBasket([...basket, { id: "ag-" + Date.now() + Math.random(), title: d.title, why: "Built by the agent.", type: s.type, data: d }]); return "Added to the report: " + d.title + "."; }
    case "report": { const src = ctx.sheets().find((n) => toTable(ctx.values(n)).rows.length > 0) || ctx.active(); const t = toTable(ctx.values(src)); const r = await makeReport(t, basket, ctx.workbookName + " — report", "all data"); if (s.format === "pptx") await downloadPpt(r); else await downloadPdf(r); return (s.format === "pptx" ? "PowerPoint" : "PDF") + " downloaded with " + r.items.length + " chart(s)."; }
    case "answer": return "";
  }
}

// ── Fill column with AI ──
function Fill({ ctx }: { ctx: AgentCtx }) {
  const sheet = ctx.active(); const t = useMemo(() => toTable(ctx.values()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [src, setSrc] = useState<string[]>(() => { const tx = (t.sem || []).filter((c) => c.role === "text" || c.kind === "entity" || c.kind === "category"); return tx.length ? [tx[0].name] : t.headers.slice(0, 1); });
  const [instr, setInstr] = useState(""); const [allowed, setAllowed] = useState(""); const [out, setOut] = useState("AI result"); const [limit, setLimit] = useState(Math.min(500, t.rows.length));
  const [preview, setPreview] = useState<string[] | null>(null); const [busy, setBusy] = useState(""); const [prog, setProg] = useState(0); const [probs, setProbs] = useState<string[]>([]);
  const cols = src.map((h) => t.headers.indexOf(h)).filter((i) => i >= 0); const allow = allowed.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  const call = async (rows: Cell[][]) => { const r = await ctx.ask!(FILL_SYSTEM, [{ role: "user", content: fillPrompt(instr, src, rows.map((row) => cols.map((c) => row[c])), allow) }], 1500); return parseFill(r, rows.length, allow); };
  const runPreview = async () => { if (!ctx.ask || !instr.trim() || !cols.length) return; setBusy("preview"); try { const r = await call(t.rows.slice(0, 10)); setPreview(r.values); setProbs(r.problems); } catch (e: any) { setProbs(["AI request failed: " + (e?.message || e)]); } setBusy(""); };
  const runAll = async () => { if (!ctx.ask) return; setBusy("all"); setProg(0); ctx.backup(); const n = Math.min(limit, t.rows.length); const values: string[] = []; const pr: string[] = [];
    for (let i = 0; i < n; i += FILL_BATCH) { try { const r = await call(t.rows.slice(i, Math.min(n, i + FILL_BATCH))); values.push(...r.values); pr.push(...r.problems.map((p) => p.replace(/^Row (\d+)/, (_m, k) => "Row " + (i + Number(k))))); } catch (e: any) { values.push(...Array(Math.min(FILL_BATCH, n - i)).fill("")); pr.push("Rows " + (i + 1) + "–" + Math.min(n, i + FILL_BATCH) + ": AI request failed."); } setProg(Math.min(n, i + FILL_BATCH) / n); }
    const L = t.und?.layout; const outCol = (L?.colStart || 0) + t.headers.length; const cells: { r: number; c: number; v: Cell }[] = [{ r: L?.headerRow ?? 0, c: outCol, v: out || "AI result" }];
    (t.rowIdx || []).slice(0, n).forEach((r, k) => cells.push({ r, c: outCol, v: values[k] ?? "" })); ctx.write(sheet, cells); setProbs(pr.slice(0, 10)); setBusy(""); ctx.toast("Filled " + n + " rows in column " + colToLetters(outCol) + " “" + out + "”. Undo is available.", "success"); };
  return <div data-testid="ag-fill">
    <div style={{ fontSize: 12.5, color: V.text3, marginBottom: 8 }}>The AI reads each row and writes one short answer in a new column: categorise, extract, summarise, translate, or flag. You see 10 rows first.</div>
    <div style={{ fontSize: 12, color: V.text2, marginBottom: 4 }}>Read from</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>{t.headers.map((h) => <button key={h} data-testid={"fl-src-" + h} aria-pressed={src.includes(h)} onClick={() => setSrc(src.includes(h) ? src.filter((x) => x !== h) : [...src, h])} style={{ ...btn(src.includes(h)), minHeight: 28, fontSize: 11.5, fontWeight: 600 }}>{h}</button>)}</div>
    <textarea data-testid="fl-instr" value={instr} onChange={(e) => setInstr(e.target.value)} rows={2} placeholder="e.g. Categorise each expense; Extract the vendor name; Is this complaint urgent?" style={{ ...inp, minHeight: 52, padding: 8 }} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
      <label style={{ fontSize: 11.5, color: V.text2 }}>Allowed answers (optional)<input data-testid="fl-allowed" value={allowed} onChange={(e) => setAllowed(e.target.value)} placeholder="Travel, Meals, Software, Other" style={inp} /></label>
      <label style={{ fontSize: 11.5, color: V.text2 }}>New column name<input data-testid="fl-out" value={out} onChange={(e) => setOut(e.target.value)} style={inp} /></label></div>
    <label style={{ fontSize: 11.5, color: V.text2, display: "block", marginTop: 6 }}>Rows to fill (of {t.rows.length.toLocaleString("en-IN")})<input type="number" min={1} max={t.rows.length} value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(t.rows.length, Number(e.target.value) || 1)))} style={{ ...inp, width: 140 }} /></label>
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}><button data-testid="fl-preview" disabled={!ctx.ask || !instr.trim() || !cols.length || !!busy} onClick={runPreview} style={btn()}>{busy === "preview" ? "Reading…" : "Preview 10 rows"}</button>
      {preview && <button data-testid="fl-all" disabled={!!busy} onClick={runAll} style={btn(true)}>{busy === "all" ? "Filling " + Math.round(prog * 100) + "%…" : "Fill " + Math.min(limit, t.rows.length).toLocaleString("en-IN") + " rows"}</button>}</div>
    {preview && <table data-testid="fl-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 }}><thead><tr>{[...src, out].map((h) => <th key={h} style={{ textAlign: "left", padding: "4px 6px", background: "#11264A", color: "#fff" }}>{h}</th>)}</tr></thead>
      <tbody>{t.rows.slice(0, 10).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} style={{ padding: "3px 6px", borderBottom: "1px solid " + V.border, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r[c] ?? "")}</td>)}<td style={{ padding: "3px 6px", borderBottom: "1px solid " + V.border, fontWeight: 700 }}>{preview[i]}</td></tr>)}</tbody></table>}
    {probs.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: V.warn }}>{probs.map((p, i) => <li key={i}>{p}</li>)}</ul>}
    <div style={{ fontSize: 11.5, color: V.text3, marginTop: 8 }}>Sends only the chosen columns of each row to your AI provider. Large files take one request per {FILL_BATCH} rows.</div>
  </div>;
}

// ── Paste text → table ──
function Paste({ ctx }: { ctx: AgentCtx }) {
  const [txt, setTxt] = useState(""); const [rows, setRows] = useState<Cell[][] | null>(null); const [how, setHow] = useState(""); const [busy, setBusy] = useState(false);
  const convert = async () => { const d = textToTable(txt); if (d) { setRows(d.rows); setHow("Read as " + d.how + " (no AI needed)."); return; } if (!ctx.ask) { setHow("Couldn't find a table structure, and AI is not available."); return; }
    setBusy(true); try { const r = await ctx.ask(TEXT_SYSTEM, [{ role: "user", content: txt.slice(0, 20000) }], 3000); const p = parseTextTable(r); setRows(p); setHow(p ? "Structured by AI: check the values below before creating the sheet." : "The AI couldn't structure this text."); } catch (e: any) { setHow("AI request failed: " + (e?.message || e)); } setBusy(false); };
  return <div data-testid="ag-paste">
    <div style={{ fontSize: 12.5, color: V.text3, marginBottom: 6 }}>Paste text from an email, PDF, web page or chat. Tables, aligned columns and “Label: value” blocks are read directly; anything else is structured by AI.</div>
    <textarea data-testid="ps-text" value={txt} onChange={(e) => { setTxt(e.target.value); setRows(null); }} rows={7} placeholder={"Invoice: INV-9\nVendor: Acme\nAmount: 5,000"} style={{ ...inp, minHeight: 130, padding: 8, fontFamily: "ui-monospace, Menlo, Consolas, monospace" }} />
    <button data-testid="ps-go" disabled={!txt.trim() || busy} onClick={convert} style={{ ...btn(true), width: "100%", marginTop: 6 }}>{busy ? "Structuring…" : "Convert to table"}</button>
    {how && <div style={{ fontSize: 12, color: V.text3, marginTop: 6 }}>{how}</div>}
    {rows && <><div style={{ overflowX: "auto", marginTop: 6 }}><table data-testid="ps-table" style={{ borderCollapse: "collapse", fontSize: 12 }}><tbody>{rows.slice(0, 12).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={{ padding: "3px 8px", border: "1px solid " + V.border, fontWeight: i === 0 ? 800 : 400, whiteSpace: "nowrap" }}>{String(v ?? "")}</td>)}</tr>)}</tbody></table></div>
      <button data-testid="ps-create" onClick={() => { ctx.addSheet("Pasted", rows, { headerRows: [0], freezeRows: 1 }); ctx.toast("Sheet created: " + (rows.length - 1) + " rows.", "success"); }} style={{ ...btn(true), marginTop: 6 }}>Create sheet ({rows.length - 1} rows)</button></>}
  </div>;
}

// ── Formula Doctor ──
function Doctor({ ctx }: { ctx: AgentCtx }) {
  const sheet = ctx.active(); const [ver, setVer] = useState(0);
  const list = useMemo(() => diagnose(ctx.formulas(), ctx.values()), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ai, setAi] = useState<Record<string, { fix: string | null; why: string }>>({}); const [busy, setBusy] = useState(""); const fixOf = (d: Diagnosis) => d.fix || ai[d.cell]?.fix || null;
  const apply = (ds: Diagnosis[]) => { const cells = ds.map((d) => ({ d, f: fixOf(d) })).filter((x) => x.f).map((x) => { const p = parseCell(x.d.cell)!; return { r: p.r, c: p.c, v: x.f as Cell }; }); if (!cells.length) return; ctx.backup(); ctx.write(sheet, cells); ctx.toast("Applied " + cells.length + " fix" + (cells.length > 1 ? "es" : "") + ". Undo is available.", "success"); setTimeout(() => setVer((x) => x + 1), 600); };
  const askAI = async (d: Diagnosis) => { if (!ctx.ask) return; setBusy(d.cell); const p = parseCell(d.cell)!; const f = ctx.formulas(); const head = String(ctx.values()[0]?.[p.c] ?? "");
    const around = [-2, -1, 1, 2].map((k) => f[p.r + k]?.[p.c]).filter((x) => typeof x === "string" && x.startsWith("=")).join("  ");
    try { const r = await ctx.ask(DOCTOR_SYSTEM, [{ role: "user", content: "Cell " + d.cell + " (column header: " + head + ")\nFormula: " + d.formula + "\nError: " + d.error + "\nFormulas above/below: " + (around || "none") }], 500); setAi({ ...ai, [d.cell]: parseDoctor(r) }); } catch (e: any) { setAi({ ...ai, [d.cell]: { fix: null, why: "AI request failed: " + (e?.message || e) } }); } setBusy(""); };
  const ready = list.filter((d) => fixOf(d));
  return <div data-testid="ag-fix">
    <div style={{ fontSize: 12.5, color: V.text3, marginBottom: 8 }}>Every error and odd formula on “{sheet}”, with what went wrong and a proposed fix. Nothing changes until you apply it.</div>
    {!list.length ? <div data-testid="dr-none" style={{ padding: 12, borderRadius: 10, background: V.surface2, fontSize: 13 }}>No formula errors or inconsistent formulas on this sheet.</div> : <>
      {ready.length > 1 && <button data-testid="dr-all" onClick={() => apply(ready)} style={{ ...btn(true), marginBottom: 8 }}>Apply all {ready.length} proposed fixes</button>}
      <div data-testid="dr-list" style={{ display: "grid", gap: 6 }}>{list.map((d) => { const fx = fixOf(d);
        return <div key={d.cell} data-testid={"dr-" + d.cell} style={{ border: "1px solid " + V.border, borderRadius: 10, padding: "8px 10px", background: V.surface }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><button onClick={() => ctx.select(sheet, d.cell)} style={{ border: "none", background: "none", color: V.accent, fontWeight: 800, cursor: "pointer", padding: 0 }}>{d.cell}</button><span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: d.error === "inconsistent" ? V.warn : V.bad, borderRadius: 99, padding: "1px 8px" }}>{d.error === "inconsistent" ? "odd one out" : d.error}</span></div>
          <code style={{ display: "block", fontSize: 12, marginTop: 4, color: V.text2 }}>{d.formula}</code>
          <div style={{ fontSize: 12.5, color: V.text2, marginTop: 3 }}>{d.explain}{ai[d.cell]?.why ? " " + ai[d.cell].why : ""}</div>
          {fx ? <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}><span style={{ fontSize: 12 }}>Fix:</span><code data-testid={"dr-fix-" + d.cell} style={{ fontSize: 12, background: V.surface2, padding: "2px 6px", borderRadius: 6 }}>{fx}</code><button data-testid={"dr-apply-" + d.cell} onClick={() => apply([d])} style={{ ...btn(true), minHeight: 28 }}>Apply</button></div>
            : <button data-testid={"dr-ai-" + d.cell} disabled={!ctx.ask || busy === d.cell} onClick={() => askAI(d)} style={{ ...btn(), minHeight: 28, marginTop: 6 }}>{busy === d.cell ? "Thinking…" : "Ask AI for a fix"}</button>}
        </div>; })}</div></>}
    <button onClick={() => setVer((x) => x + 1)} style={{ ...btn(), marginTop: 8 }}>Re-check</button>
  </div>;
}

// ═════════ WHAT-IF & GOAL SEEK (used in ⚡ Automate) ═════════
export interface WhatIfCtx { active: () => string; get: (a1: string) => Cell; getFormula: (a1: string) => string; set: (a1: string, v: Cell) => void; toast: (m: string, k?: string) => void }
export function WhatIf({ ctx }: { ctx: WhatIfCtx }) {
  const [inCell, setIn] = useState(""); const [outCell, setOut] = useState(""); const [target, setTarget] = useState(""); const [rows, setRows] = useState<{ pct: number; input: number; output: number }[]>([]);
  const [gs, setGs] = useState<{ ok: boolean; x: number; y: number; why?: string } | null>(null); const [busy, setBusy] = useState(""); const K = themeInk(); const orig = useRef<Cell>(null);
  const okRefs = !!parseCell(inCell) && !!parseCell(outCell); const inVal = okRefs ? Number(ctx.get(inCell)) : NaN; const outVal = okRefs ? Number(ctx.get(outCell)) : NaN;
  const dependsHint = okRefs && !ctx.getFormula(outCell) ? "The output cell has no formula, so it can't respond to the input." : "";
  // Set the input, let the sheet recalculate, read the output once it has settled.
  const evaluate = async (x: number) => { ctx.set(inCell, x); let last = NaN; for (let k = 0; k < 25; k++) { await wait(40); const v = Number(ctx.get(outCell)); if (v === last) return v; last = v; } return last; };
  const sens = async () => { if (!okRefs || !isFinite(inVal)) return; setBusy("sens"); orig.current = ctx.get(inCell); const out: typeof rows = []; for (const s of sensitivitySteps(inVal)) out.push({ ...s, output: await evaluate(s.input) }); ctx.set(inCell, orig.current); await wait(150); setRows(out); setBusy(""); };
  const seek = async () => { const tg = Number(String(target).replace(/,/g, "")); if (!okRefs || !isFinite(tg) || !isFinite(inVal)) return; setBusy("seek"); orig.current = ctx.get(inCell); const r = await goalSeek(evaluate, tg, inVal); ctx.set(inCell, orig.current); await wait(150); setGs(r); setBusy(""); };
  return <div data-testid="au-whatif">
    <h2 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, color: V.text }}>What-if & goal seek</h2>
    <p style={{ margin: "0 0 18px", fontSize: 14.5, color: V.text2, maxWidth: 760, lineHeight: 1.55 }}>Pick an assumption (input cell) and a result (output cell with a formula) on “{ctx.active()}”. See how the result moves when the assumption changes ±20%, or find the input that hits a target. Your sheet is restored afterwards; nothing changes unless you click Apply.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 12 }}>
      <label style={{ fontSize: 12.5, color: V.text2 }}>Input cell (assumption)<input data-testid="wi-in" value={inCell} onChange={(e) => { setIn(e.target.value.toUpperCase().trim()); setRows([]); setGs(null); }} placeholder="e.g. B2" style={{ ...inp, minHeight: 38 }} />{parseCell(inCell) && <span style={{ fontSize: 12, color: V.text3 }}>now {fmtNum(inVal)}</span>}</label>
      <label style={{ fontSize: 12.5, color: V.text2 }}>Output cell (result)<input data-testid="wi-out" value={outCell} onChange={(e) => { setOut(e.target.value.toUpperCase().trim()); setRows([]); setGs(null); }} placeholder="e.g. B4" style={{ ...inp, minHeight: 38 }} />{parseCell(outCell) && <span style={{ fontSize: 12, color: V.text3 }}>now {fmtNum(outVal)}{ctx.getFormula(outCell) ? " · " + ctx.getFormula(outCell) : ""}</span>}</label>
    </div>
    {dependsHint && <div style={{ color: V.warn, fontSize: 13, marginBottom: 8 }}>{dependsHint}</div>}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
      <button data-testid="wi-sens" disabled={!okRefs || !!busy || !isFinite(inVal)} onClick={sens} style={{ ...btn(true), minHeight: 40 }}>{busy === "sens" ? "Calculating…" : "Sensitivity table (±20%)"}</button>
      <label style={{ fontSize: 12.5, color: V.text2 }}>Target for the output<input data-testid="wi-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 50000" style={{ ...inp, minHeight: 38, width: 180 }} /></label>
      <button data-testid="wi-seek" disabled={!okRefs || !!busy || !target} onClick={seek} style={{ ...btn(), minHeight: 40 }}>{busy === "seek" ? "Searching…" : "Goal seek"}</button>
    </div>
    {gs && <div data-testid="wi-result" style={{ padding: 14, borderRadius: 14, border: "2px solid " + (gs.ok ? V.ok : V.warn), marginBottom: 14, fontSize: 14 }}>{gs.ok ? <>To make {outCell} = <b>{fmtNum(gs.y)}</b>, set {inCell} to <b>{fmtNum(gs.x)}</b> (now {fmtNum(inVal)}, a change of {inVal ? ((gs.x - inVal) / Math.abs(inVal) * 100).toFixed(1) + "%" : fmtNum(gs.x - inVal)}).
        <button data-testid="wi-apply" onClick={() => { ctx.set(inCell, +gs.x.toFixed(6)); ctx.toast(inCell + " set to " + fmtNum(gs.x) + ".", "success"); }} style={{ ...btn(true), marginLeft: 10 }}>Apply this value</button></> : gs.why}</div>}
    {rows.length > 0 && <div data-testid="wi-table" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 360px) 1fr", gap: 14 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}><thead><tr>{["Change", inCell + " (input)", outCell + " (result)", "Result change"].map((h) => <th key={h} style={{ textAlign: "right", padding: "6px 8px", background: "#11264A", color: "#fff" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => { const base = rows.find((x) => x.pct === 0)!.output; return <tr key={r.pct} style={{ background: r.pct === 0 ? V.surface2 : "transparent" }}><td style={{ textAlign: "right", padding: "5px 8px" }}>{r.pct > 0 ? "+" : ""}{r.pct}%</td><td style={{ textAlign: "right", padding: "5px 8px" }}>{fmtNum(r.input)}</td><td style={{ textAlign: "right", padding: "5px 8px", fontWeight: 700 }}>{fmtNum(r.output)}</td><td style={{ textAlign: "right", padding: "5px 8px", color: r.output - base >= 0 ? V.ok : V.bad }}>{base ? ((r.output - base) / Math.abs(base) * 100).toFixed(1) + "%" : ""}</td></tr>; })}</tbody></table>
      <EChartRaw height={260} testid="wi-chart" option={{ grid: { left: 8, right: 16, top: 20, bottom: 8, containLabel: true }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: rows.map((r) => (r.pct > 0 ? "+" : "") + r.pct + "%"), axisLabel: { color: K.muted } }, yAxis: { type: "value", scale: true, axisLabel: { color: K.muted, formatter: (v: number) => fmtNum(v) }, splitLine: { lineStyle: { color: "rgba(100,116,139,.18)" } } }, series: [{ type: "line", data: rows.map((r) => r.output), smooth: true, symbolSize: 8, lineStyle: { width: 3, color: "#2563EB" }, itemStyle: { color: "#2563EB" }, label: { show: true, position: "top", color: K.text, formatter: (q: any) => fmtNum(q.value) } }] }} />
    </div>}
  </div>;
}
