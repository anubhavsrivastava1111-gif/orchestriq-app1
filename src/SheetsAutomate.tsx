import React, { useMemo, useState } from "react";
import type { Cell } from "./lib/SheetsEngine";
import { toTable, profile, numericCols, categoryCols, dateCol, pivot, pivotSheetRows, analysisSheetRows, fmtNum, type PivotSpec } from "./lib/SheetsAnalytics";
import { suggest } from "./lib/SheetsSmart";
import { guessRecon, reconcile, reconSheets, bridge, bridgeSheetRows, periodsOf, healthScan, applyFixes, benford, formulaRisks, snapshotFor, compareRuns, headerMatch, RECIPE_KEY, type Recipe, type ReconOptions, type ReconResult, type BridgeResult, type HealthIssue, type FormulaRisk } from "./lib/SheetsAutomate";
import { EChartRaw, themeInk } from "./SheetsCharts";
import { makeReport, downloadPdf, downloadPpt, type SheetStyle } from "./SheetsInsights";

// ⚡ AUTOMATE: the analyst's monthly grind, inside Sheets. Every figure is computed by
// SheetsAutomate; nothing here is written by an AI.
const V = { text: "var(--oiq-ink)", text2: "var(--oiq-body)", text3: "var(--oiq-muted)", border: "var(--oiq-border)", surface: "var(--oiq-surface)", surface2: "var(--oiq-surface2)", accent: "var(--oiq-accent)", ok: "var(--oiq-success)", warn: "var(--oiq-warning)", bad: "var(--oiq-danger)" };
const inp: React.CSSProperties = { minHeight: 38, padding: "0 10px", borderRadius: 10, border: "1px solid " + V.border, background: V.surface, color: V.text, fontSize: 13.5, boxSizing: "border-box", width: "100%" };
const btn = (on = false): React.CSSProperties => ({ minHeight: 38, padding: "0 14px", borderRadius: 10, border: "1px solid " + (on ? V.accent : V.border), background: on ? V.accent : V.surface, color: on ? "#fff" : V.text, fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" });
const H1 = ({ children }: { children: React.ReactNode }) => <h2 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: -0.3, color: V.text }}>{children}</h2>;
const Lede = ({ children }: { children: React.ReactNode }) => <p style={{ margin: "0 0 18px", fontSize: 14.5, color: V.text2, maxWidth: 760, lineHeight: 1.55 }}>{children}</p>;
function L({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: V.text2, minWidth: 0 }}>{label}{children}</label>; }
function Tile({ label, value, sub, tone, testid }: { label: string; value: string; sub?: string; tone?: "ok" | "bad" | "warn"; testid?: string }) {
  return <div data-testid={testid} style={{ padding: "14px 16px", borderRadius: 14, background: V.surface, border: "1px solid " + V.border, borderTop: "4px solid " + (tone === "bad" ? V.bad : tone === "warn" ? V.warn : tone === "ok" ? V.ok : V.accent) }}>
    <div style={{ fontSize: 12.5, color: V.text3 }}>{label}</div><div style={{ fontSize: 24, fontWeight: 800, margin: "2px 0" }}>{value}</div>{sub && <div style={{ fontSize: 12.5, color: V.text3 }}>{sub}</div>}</div>;
}
function Table2({ head, rows, max = 15, testid }: { head: string[]; rows: Cell[][]; max?: number; testid?: string }) {
  return <div style={{ overflowX: "auto", border: "1px solid " + V.border, borderRadius: 12 }}><table data-testid={testid} style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
    <thead><tr>{head.map((h, i) => <th key={i} style={{ textAlign: i ? "right" : "left", padding: "8px 10px", background: "#11264A", color: "#fff", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
    <tbody>{rows.slice(0, max).map((r, i) => <tr key={i} style={{ background: i % 2 ? V.surface2 : V.surface }}>{r.map((v, j) => <td key={j} style={{ padding: "6px 10px", textAlign: typeof v === "number" ? "right" : "left", whiteSpace: "nowrap", color: typeof v === "number" && v < 0 ? V.bad : V.text }}>{typeof v === "number" ? fmtNum(v) : String(v ?? "")}</td>)}</tr>)}</tbody></table>
    {rows.length > max && <div style={{ padding: "6px 10px", fontSize: 12, color: V.text3 }}>Showing {max} of {rows.length.toLocaleString("en-IN")}. The sheet has all of them.</div>}</div>;
}
export interface AutomateCtx {
  sheets: () => string[]; active: () => string; values: (sheet?: string) => Cell[][]; formulas: (sheet?: string) => Cell[][];
  addSheet: (name: string, rows: Cell[][], style?: SheetStyle) => void; replaceValues: (sheet: string, rows: Cell[][]) => void;
  backup: () => void; revert: () => void; canRevert: boolean; select: (sheet: string, a1: string) => void;
  toast: (m: string, k?: string) => void; workbookName: string; importFile: (f: File) => Promise<string[]>;
}
type Tool = "autopilot" | "bridge" | "recon" | "health";
const TOOLS: { k: Tool; icon: string; name: string; line: string }[] = [
  { k: "autopilot", icon: "⚡", name: "Report Autopilot", line: "Build your monthly report once. Re-run it on next month’s file in one click." },
  { k: "bridge", icon: "≋", name: "Variance bridge", line: "Why did the number move? Waterfall, drivers, price · volume · mix." },
  { k: "recon", icon: "⇄", name: "Reconcile", line: "Match two sheets: bank vs ledger, AP vs statement, system A vs B." },
  { k: "health", icon: "✚", name: "Data health & risk", line: "Fix dirty data. Find risky formulas. Benford fraud check." },
];

export default function SheetsAutomate({ ctx, onClose }: { ctx: AutomateCtx; onClose: () => void }) {
  const [tool, setTool] = useState<Tool>("autopilot");
  return <div data-testid="automate" role="dialog" aria-label="Automate" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--oiq-bg)", color: V.text, display: "grid", gridTemplateColumns: "minmax(240px, 290px) 1fr", minHeight: 0 }}>
    <nav aria-label="Automation tools" style={{ borderRight: "1px solid " + V.border, padding: "18px 14px", background: V.surface, overflowY: "auto" }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>Automate</div>
      <div style={{ fontSize: 12.5, color: V.text3, marginBottom: 16 }}>{ctx.workbookName}: sheet “{ctx.active()}”</div>
      {TOOLS.map((t) => <button key={t.k} data-testid={"au-tool-" + t.k} aria-current={tool === t.k} onClick={() => setTool(t.k)} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 8, padding: "12px 12px", borderRadius: 12, cursor: "pointer", border: "1px solid " + (tool === t.k ? V.accent : V.border), background: tool === t.k ? V.surface2 : V.surface, color: V.text }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: tool === t.k ? V.accent : V.surface2, color: tool === t.k ? "#fff" : V.text, fontWeight: 800 }}>{t.icon}</span><b style={{ fontSize: 14 }}>{t.name}</b></div>
        <div style={{ fontSize: 12, color: V.text3, marginTop: 6, lineHeight: 1.45 }}>{t.line}</div></button>)}
      <button data-testid="au-close" onClick={onClose} style={{ ...btn(), width: "100%", marginTop: 8 }}>Back to the sheet</button>
      {ctx.canRevert && <button data-testid="au-revert" onClick={() => { ctx.revert(); ctx.toast("Restored the workbook as it was before the last automation.", "success"); }} style={{ ...btn(), width: "100%", marginTop: 8 }}>Undo last automation</button>}
    </nav>
    <main style={{ overflowY: "auto", padding: "26px 32px 60px", minWidth: 0 }}>
      {tool === "autopilot" && <Autopilot ctx={ctx} />}
      {tool === "bridge" && <Bridge ctx={ctx} />}
      {tool === "recon" && <Recon ctx={ctx} />}
      {tool === "health" && <Health ctx={ctx} />}
    </main>
  </div>;
}

// ═════════ Report Autopilot ═════════
const loadRecipes = (): Recipe[] => { try { return JSON.parse(localStorage.getItem(RECIPE_KEY) || "[]"); } catch { return []; } };
const saveRecipes = (r: Recipe[]) => { try { localStorage.setItem(RECIPE_KEY, JSON.stringify(r)); } catch {} };
const pStyle = (rows: Cell[][]): SheetStyle => { const n = Math.max(...rows.map((r) => r.length)); return { titleRow: 0, headerRows: [2], totalRows: [rows.length - 1], freezeRows: 3, widths: [200, ...Array(Math.max(0, n - 1)).fill(120)], numFmt: [{ r1: 3, r2: rows.length - 1, c1: 1, c2: n - 1, pattern: "#,##0" }] }; };
function Autopilot({ ctx }: { ctx: AutomateCtx }) {
  const t = useMemo(() => toTable(ctx.values()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = useMemo(() => profile(t), [t]); const sg = useMemo(() => suggest(t, p).filter((s) => s.pivot), [t, p]);
  const [recipes, setRecipes] = useState<Recipe[]>(loadRecipes); const matching = recipes.map((r) => ({ r, m: headerMatch(r, t.headers) })).filter((x) => x.m >= 0.8).sort((a, b) => b.m - a.m);
  const [name, setName] = useState(ctx.workbookName.replace(/\.(csv|xlsx)$/i, "") + " monthly report");
  const [steps, setSteps] = useState({ clean: true, analysis: true, bridge: !!dateCol(p), report: true }); const [pv, setPv] = useState<string[]>(sg.slice(0, 3).map((s) => s.id));
  const [log, setLog] = useState<{ step: string; result: string }[]>([]); const [changed, setChanged] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const save = () => { const r: Recipe = { id: "r" + Date.now(), name: name.trim() || "Monthly report", headers: t.headers, created: new Date().toISOString(), steps: { ...steps, pivots: sg.filter((s) => pv.includes(s.id)).map((s) => s.pivot as any) } };
    const next = [r, ...recipes]; setRecipes(next); saveRecipes(next); ctx.toast("Saved “" + r.name + "”. Next month, open the new file and click Run.", "success"); };
  const run = async (r: Recipe) => { if (!t.rows.length) return; setBusy(true); setLog([]); setChanged([]); ctx.backup(); const out: { step: string; result: string }[] = []; const push = (step: string, result: string) => { out.push({ step, result }); setLog([...out]); };
    const sheet = ctx.active(); let tt = t;
    try {
      if (r.steps.clean) { const fs = ctx.formulas(); const hasF = fs.some((row) => row.some((v) => typeof v === "string" && v.startsWith("="))); const issues = healthScan(tt).filter((i) => i.fixable && !i.optIn && !(i.kind === "duplicates" && hasF));   /* Autopilot never removes rows it cannot be sure are duplicates */
        const grid = fs.map((row, ri) => row.map((v, ci) => (typeof v === "string" && v.startsWith("=") ? v : ctx.values()[ri]?.[ci] ?? null)));
        const fx = applyFixes(grid, issues); if (fx.log.length) { ctx.replaceValues(sheet, fx.values); tt = toTable(fx.values); } push("Clean the data", fx.log.length ? fx.log.join(" ") : "Nothing to fix."); await tick(); }
      if (r.steps.analysis) { const rows = analysisSheetRows(tt, profile(tt), sheet); ctx.addSheet("Analysis", rows, { titleRow: 0, widths: [220, 140, 140, 140, 140, 100] }); push("Analysis sheet", "Totals, averages and breakdown, as live formulas."); await tick(); }
      for (const spec of r.steps.pivots) { const res: any = pivot(tt, spec as PivotSpec); if ("error" in res) { push("Pivot", "Skipped: " + res.error); continue; } const ps = pivotSheetRows(tt, spec as PivotSpec, res, sheet); ctx.addSheet("Pivot", ps.rows, pStyle(ps.rows)); push("Pivot: " + res.title, ps.live ? "Live formulas." : "Values (month grouping)."); await tick(); }
      if (r.steps.bridge) { const dc = dateCol(profile(tt)); const meas = numericCols(profile(tt))[0]; if (dc && meas) { const per = periodsOf(tt, dc.name); if (per.length >= 2) { const spec = { measure: meas.name, periodCol: dc.name, from: per[per.length - 2], to: per[per.length - 1], dims: categoryCols(profile(tt)).slice(0, 2).map((c) => c.name), units: numericCols(profile(tt)).find((c) => /unit|qty|quant/i.test(c.name))?.name, priceDim: categoryCols(profile(tt)).find((c) => /product|item|sku|model|service|plan|category/i.test(c.name))?.name };
        const b = bridge(tt, spec); if (!("error" in b)) { ctx.addSheet("Bridge", bridgeSheetRows(spec, b), { titleRow: 0, headerRows: [2], widths: [220, 140, 140, 120, 100] }); push("Variance bridge " + spec.from + " → " + spec.to, b.commentary[0]); } } } await tick(); }
      const now = snapshotFor(tt, r.lastRun ? Object.keys(r.lastRun.byDim) : undefined);
      const diff = r.lastRun ? compareRuns(r.lastRun, now) : ["First run: next month you’ll see what changed against these figures."]; setChanged(diff);
      ctx.addSheet("What changed", [["What changed since the last run (" + (r.lastRun ? new Date(r.lastRun.at).toLocaleDateString("en-IN") : "first run") + ")"], [], ...diff.map((d) => [d] as Cell[])], { titleRow: 0, widths: [700] }); push("What changed since last run", diff[0]);
      if (r.steps.report) { const rep = await makeReport(tt, [], r.name, "all data", { summary: r.lastRun ? diff.slice(0, 6) : undefined }); await downloadPdf(rep); push("PDF report", rep.items.length + " charts, tables and the pivot."); }
      const next = recipes.map((x) => (x.id === r.id ? { ...x, lastRun: now } : x)); setRecipes(next); saveRecipes(next); ctx.toast("“" + r.name + "” is ready.", "success");
    } catch (e: any) { push("Stopped", String(e?.message || e)); }
    setBusy(false); };
  return <div data-testid="au-autopilot">
    <H1>Report Autopilot</H1>
    <Lede>Every month the same report: clean the data, rebuild the pivots, explain what moved, send the pack. Set it up once as a recipe. Next month, open the new file here and run it: everything is rebuilt, and you get a written “what changed since last month”.</Lede>
    {matching.length > 0 && <div data-testid="au-match" style={{ padding: 18, borderRadius: 16, border: "2px solid " + V.accent, background: V.surface, marginBottom: 22 }}>
      <div style={{ fontSize: 13, color: V.text3 }}>This sheet matches a saved recipe</div>
      {matching.map(({ r }) => <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <div style={{ flex: 1, minWidth: 220 }}><div style={{ fontSize: 18, fontWeight: 800 }}>{r.name}</div><div style={{ fontSize: 12.5, color: V.text3 }}>{[r.steps.clean && "clean", r.steps.analysis && "analysis", r.steps.pivots.length && r.steps.pivots.length + " pivot(s)", r.steps.bridge && "variance bridge", r.steps.report && "PDF pack"].filter(Boolean).join(", ")}{r.lastRun ? "; last run " + new Date(r.lastRun.at).toLocaleDateString("en-IN") : "; never run"}</div></div>
        <button data-testid={"au-run-" + r.id} disabled={busy} onClick={() => run(r)} style={{ ...btn(true), minHeight: 46, fontSize: 15, padding: "0 22px" }}>{busy ? "Running…" : "⚡ Run this month’s report"}</button>
        <button onClick={() => { const next = recipes.filter((x) => x.id !== r.id); setRecipes(next); saveRecipes(next); }} style={btn()}>Delete</button></div>)}
    </div>}
    {log.length > 0 && <div data-testid="au-log" style={{ marginBottom: 22 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Run log</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, borderLeft: "2px solid " + V.border }}>{log.map((l, i) => <li key={i} style={{ position: "relative", padding: "6px 0 6px 18px" }}><span style={{ position: "absolute", left: -7, top: 11, width: 12, height: 12, borderRadius: 6, background: l.step === "Stopped" ? V.bad : V.ok }} /><b style={{ fontSize: 13.5 }}>{l.step}</b><div style={{ fontSize: 12.5, color: V.text3 }}>{l.result}</div></li>)}</ol>
      {changed.length > 0 && <div data-testid="au-changed" style={{ marginTop: 14, padding: 16, borderRadius: 14, background: V.surface, border: "1px solid " + V.border }}><div style={{ fontWeight: 800, marginBottom: 6 }}>What changed since last run</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>{changed.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
    </div>}
    <div style={{ padding: 18, borderRadius: 16, border: "1px solid " + V.border, background: V.surface }}>
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>{matching.length ? "Create another recipe" : "Create a recipe from this sheet"}</div>
      {!t.rows.length ? <div style={{ color: V.text3 }}>This sheet has no data. Open your data file first.</div> : <>
        <L label="Recipe name"><input data-testid="au-name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inp, maxWidth: 460 }} /></L>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, margin: "14px 0" }}>
          {([["clean", "Clean the data first", "Fix spaces, spelling variants, text-numbers, duplicates"], ["analysis", "Analysis sheet", "Totals and breakdown as live formulas"], ["bridge", "Variance bridge", dateCol(p) ? "Last two periods, with drivers" : "Needs a date column"], ["report", "PDF report pack", "Charts, tables, pivot, what changed"]] as const).map(([k, h, d]) =>
            <label key={k} style={{ display: "flex", gap: 10, padding: 12, borderRadius: 12, border: "1px solid " + V.border, cursor: "pointer", opacity: k === "bridge" && !dateCol(p) ? 0.5 : 1 }}><input type="checkbox" data-testid={"au-step-" + k} checked={(steps as any)[k]} disabled={k === "bridge" && !dateCol(p)} onChange={(e) => setSteps({ ...steps, [k]: e.target.checked })} /><span><b style={{ fontSize: 13.5 }}>{h}</b><div style={{ fontSize: 12, color: V.text3 }}>{d}</div></span></label>)}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, margin: "4px 0 6px" }}>Pivots to rebuild every month</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>{sg.map((s) => <button key={s.id} data-testid={"au-pv-" + s.id} aria-pressed={pv.includes(s.id)} onClick={() => setPv(pv.includes(s.id) ? pv.filter((x) => x !== s.id) : [...pv, s.id])} style={{ ...btn(pv.includes(s.id)), fontWeight: 600, fontSize: 12.5 }}>{pv.includes(s.id) ? "✓ " : ""}{s.title}</button>)}</div>
        <button data-testid="au-save" onClick={save} style={btn(true)}>Save recipe</button>
      </>}
    </div>
  </div>;
}
const tick = () => new Promise((r) => setTimeout(r, 30));

// ═════════ Variance bridge ═════════
function Bridge({ ctx }: { ctx: AutomateCtx }) {
  const t = useMemo(() => toTable(ctx.values()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = useMemo(() => profile(t), [t]); const nums = numericCols(p), cats = categoryCols(p);
  const periodCols = [...p.columns.filter((c) => c.type === "date"), ...cats];
  const [meas, setMeas] = useState(nums[0]?.name || ""); const [pc, setPc] = useState(periodCols[0]?.name || "");
  const per = useMemo(() => (pc ? periodsOf(t, pc) : []), [t, pc]); const [from, setFrom] = useState(per[per.length - 2] || per[0] || ""); const [to, setTo] = useState(per[per.length - 1] || "");
  const [dims, setDims] = useState<string[]>(cats.filter((c) => c.name !== pc).slice(0, 2).map((c) => c.name)); const units = nums.find((c) => /unit|qty|quant|volume/i.test(c.name))?.name;
  const priceDim = (cats.find((c) => /product|item|sku|model|service|plan|category/i.test(c.name)) || cats.find((c) => dims.includes(c.name)))?.name;   /* prices belong to products */
  const r = useMemo(() => (meas && pc && from && to ? bridge(t, { measure: meas, periodCol: pc, from, to, dims, units, priceDim }) : { error: "Choose a measure and two periods." }), [t, meas, pc, from, to, dims, units, priceDim]);
  const K = themeInk(); const ok = !("error" in r); const R = r as BridgeResult;
  const option = useMemo(() => { if (!ok) return null; let run = 0; const base: number[] = [], up: number[] = [], down: number[] = [], tot: (number | string)[] = [];
    R.waterfall.forEach((w) => { if (w.kind === "total") { base.push(0); up.push(0); down.push(0); tot.push(w.value); run = w.value; } else { const start = w.value >= 0 ? run : run + w.value; base.push(start); up.push(w.value >= 0 ? w.value : 0); down.push(w.value < 0 ? -w.value : 0); tot.push("-"); run += w.value; } });
    // Start the axis just below the lowest running total so the movements are visible (as in finance waterfalls).
    let lo = Infinity, hi = -Infinity, rr = 0; R.waterfall.forEach((w) => { if (w.kind === "total") rr = w.value; else rr += w.value; lo = Math.min(lo, rr, w.kind === "total" ? w.value : rr - w.value); hi = Math.max(hi, rr); });
    const span = Math.max(1, hi - lo); const mag = Math.pow(10, Math.floor(Math.log10(span))); const yMin = lo > 0 ? Math.max(0, Math.floor((lo - span * 0.6) / mag) * mag) : undefined;
    return { animation: true, grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true }, tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps: any[]) => { const i = ps[0].dataIndex; const w = R.waterfall[i]; return w.label + ": " + (w.kind === "total" ? "" : w.value >= 0 ? "+" : "−") + fmtNum(Math.abs(w.value)); } },
      xAxis: { type: "category", data: R.waterfall.map((w) => w.label), axisLabel: { color: K.muted, interval: 0, rotate: R.waterfall.length > 7 ? 25 : 0 }, axisTick: { show: false } }, yAxis: { type: "value", min: yMin, axisLabel: { color: K.muted, formatter: (v: number) => (Math.abs(v) >= 1e5 ? (v / 1e5).toFixed(1) + " L" : fmtNum(v)) }, splitLine: { lineStyle: { color: "rgba(100,116,139,.18)" } } },
      series: [{ type: "bar", stack: "w", itemStyle: { color: "transparent" }, data: base, emphasis: { disabled: true } },
        { name: "Total", type: "bar", stack: "w", data: tot, itemStyle: { color: "#11264A", borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top", color: K.text, fontWeight: 700, formatter: (q: any) => (q.value === "-" ? "" : fmtNum(q.value)) } },
        { name: "Increase", type: "bar", stack: "w", data: up, itemStyle: { color: "#16A34A", borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top", color: "#16A34A", fontWeight: 700, formatter: (q: any) => (q.value ? "+" + fmtNum(q.value) : "") } },
        { name: "Decrease", type: "bar", stack: "w", data: down, itemStyle: { color: "#DC2626", borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "bottom", color: "#DC2626", fontWeight: 700, formatter: (q: any) => (q.value ? "−" + fmtNum(q.value) : "") } }] }; }, [ok, R, K.muted, K.text]);
  return <div data-testid="au-bridge">
    <H1>Variance bridge</H1>
    <Lede>Pick two periods. The bridge shows exactly where the change came from, by driver, and when units are available, how much was <b>volume</b> (selling more), <b>price</b> (charging more) and <b>mix</b> (selling a different mix). The three always add up to the total change.</Lede>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
      <L label="Measure"><select data-testid="br-meas" value={meas} onChange={(e) => setMeas(e.target.value)} style={inp}>{nums.map((c) => <option key={c.name}>{c.name}</option>)}</select></L>
      <L label="Period column"><select data-testid="br-pc" value={pc} onChange={(e) => { setPc(e.target.value); const ps = periodsOf(t, e.target.value); setFrom(ps[ps.length - 2] || ps[0] || ""); setTo(ps[ps.length - 1] || ""); }} style={inp}>{periodCols.map((c) => <option key={c.name}>{c.name}</option>)}</select></L>
      <L label="From"><select data-testid="br-from" value={from} onChange={(e) => setFrom(e.target.value)} style={inp}>{per.map((x) => <option key={x}>{x}</option>)}</select></L>
      <L label="To"><select data-testid="br-to" value={to} onChange={(e) => setTo(e.target.value)} style={inp}>{per.map((x) => <option key={x}>{x}</option>)}</select></L>
    </div>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}><span style={{ fontSize: 12.5, color: V.text3 }}>Explain by:</span>{cats.filter((c) => c.name !== pc).map((c) => <button key={c.name} data-testid={"br-dim-" + c.name} aria-pressed={dims.includes(c.name)} onClick={() => setDims(dims.includes(c.name) ? dims.filter((x) => x !== c.name) : [...dims, c.name])} style={{ ...btn(dims.includes(c.name)), minHeight: 32, fontWeight: 600 }}>{c.name}</button>)}{units && <span style={{ fontSize: 12.5, color: V.text3 }}>· price/volume/mix uses “{units}”</span>}</div>
    {!ok ? <div style={{ color: V.warn }}>{(r as any).error}</div> : <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Tile label={meas + " in " + from} value={fmtNum(R.from)} /><Tile label={meas + " in " + to} value={fmtNum(R.to)} /><Tile testid="br-change" label="Change" value={(R.change >= 0 ? "+" : "−") + fmtNum(Math.abs(R.change))} sub={(R.pct >= 0 ? "+" : "−") + Math.abs(R.pct).toFixed(1) + "%"} tone={R.change >= 0 ? "ok" : "bad"} />
        {R.pvm && <Tile testid="br-pvm" label="Volume · Price · Mix" value={[R.pvm.volume, R.pvm.price, R.pvm.mix].map((v) => (v >= 0 ? "+" : "−") + (Math.abs(v) >= 1e5 ? (Math.abs(v) / 1e5).toFixed(1) + "L" : fmtNum(Math.round(Math.abs(v))))).join("  ")} sub={"by " + R.pvm.dim} />}
      </div>
      <div style={{ padding: 14, borderRadius: 16, border: "1px solid " + V.border, background: V.surface, marginBottom: 14 }}>{option && <EChartRaw option={option} height={340} testid="br-waterfall" />}</div>
      <div data-testid="br-commentary" style={{ padding: 16, borderRadius: 14, background: V.surface2, marginBottom: 14, fontSize: 14.5, lineHeight: 1.65 }}>{R.commentary.map((c, i) => <p key={i} style={{ margin: "0 0 6px" }}>{c}</p>)}<div style={{ fontSize: 12, color: V.text3 }}>Every figure is calculated from the rows; nothing is estimated.</div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <button data-testid="br-sheet" onClick={() => { const spec = { measure: meas, periodCol: pc, from, to, dims, units, priceDim }; ctx.addSheet("Bridge", bridgeSheetRows(spec, R), { titleRow: 0, headerRows: [2], widths: [220, 140, 140, 120, 100] }); ctx.toast("Bridge sheet created.", "success"); }} style={btn(true)}>Create bridge sheet</button>
        <button onClick={async () => { try { await navigator.clipboard.writeText(R.commentary.join("\n")); ctx.toast("Commentary copied.", "success"); } catch { ctx.toast("Copy blocked by the browser.", "warning"); } }} style={btn()}>Copy commentary</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>{R.drivers.map((d) => <div key={d.dim}><div style={{ fontWeight: 800, marginBottom: 6 }}>By {d.dim}</div><Table2 testid={"br-tbl-" + d.dim} head={[d.dim, from, to, "Change"]} rows={d.items.map((x) => [x.key, x.a, x.b, x.d])} max={10} /></div>)}</div>
    </>}
  </div>;
}

// ═════════ Reconcile ═════════
function Recon({ ctx }: { ctx: AutomateCtx }) {
  const names = ctx.sheets(); const [na, setNa] = useState(names[0] || ""); const [nb, setNb] = useState(names[1] || names[0] || "");
  const ta = useMemo(() => toTable(ctx.values(na)), [na]); const tb = useMemo(() => toTable(ctx.values(nb)), [nb]); // eslint-disable-line react-hooks/exhaustive-deps
  const [o, setO] = useState<ReconOptions>(() => guessRecon(ta, tb)); const [res, setRes] = useState<ReconResult | null>(null);
  const refresh = (a: string, b: string) => { const A = toTable(ctx.values(a)), B = toTable(ctx.values(b)); setO(guessRecon(A, B)); setRes(null); };
  const sel = (label: string, t: typeof ta, v: number, set: (n: number) => void, id: string, numOnly = false) => <L label={label}><select data-testid={id} value={v} onChange={(e) => set(Number(e.target.value))} style={inp}><option value={-1}>(none)</option>{t.headers.map((h, i) => (!numOnly || t.types[i] === "number") && <option key={i} value={i}>{h}</option>)}</select></L>;
  const sumOf = (t: typeof ta, ix: number[], c: number) => ix.reduce((s, i) => s + (Number(t.rows[i][c]) || 0), 0);
  return <div data-testid="au-recon">
    <H1>Reconcile two sheets</H1>
    <Lede>Bank statement vs ledger, AP ledger vs vendor statement, system A vs system B. Matching by reference ignores case, spaces, dashes and leading zeros. Rows without a common reference are matched by amount within a tolerance and date within a few days, one to one, closest first.</Lede>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
      <label data-testid="rc-add" style={{ ...btn(), display: "inline-flex", alignItems: "center", cursor: "pointer" }}>＋ Add a file as a sheet<input data-testid="rc-file" type="file" accept=".csv,.xlsx" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const added = await ctx.importFile(f); e.target.value = ""; if (added.length) { ctx.toast("Added " + added.join(", ") + ".", "success"); setNb(added[0]); refresh(na, added[0]); } }} /></label>
      <span style={{ fontSize: 12.5, color: V.text3 }}>{names.length < 2 ? "Add the second file (for example the bank statement) to compare it with this sheet." : names.length + " sheets in this workbook."}</span></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {[["First sheet", na, (v: string) => { setNa(v); refresh(v, nb); }, "rc-a", ta, "A"], ["Second sheet", nb, (v: string) => { setNb(v); refresh(na, v); }, "rc-b", tb, "B"]].map(([lab, val, set, id, t, side]: any) =>
        <div key={id} style={{ padding: 14, borderRadius: 14, border: "1px solid " + V.border, background: V.surface, display: "grid", gap: 8 }}>
          <L label={lab}><select data-testid={id} value={val} onChange={(e) => set(e.target.value)} style={inp}>{names.map((n) => <option key={n}>{n}</option>)}</select></L>
          <div style={{ fontSize: 12, color: V.text3 }}>{t.rows.length.toLocaleString("en-IN")} rows</div>
          {sel("Reference / key", t, side === "A" ? o.keyA : o.keyB, (n) => setO({ ...o, [side === "A" ? "keyA" : "keyB"]: n }), id + "-key")}
          {sel("Amount", t, side === "A" ? o.amtA : o.amtB, (n) => setO({ ...o, [side === "A" ? "amtA" : "amtB"]: n }), id + "-amt", true)}
          {sel("Date", t, side === "A" ? o.dateA : o.dateB, (n) => setO({ ...o, [side === "A" ? "dateA" : "dateB"]: n }), id + "-date")}
        </div>)}
    </div>
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", margin: "14px 0 20px" }}>
      <L label="Amount tolerance"><input data-testid="rc-tol" type="number" min={0} value={o.amtTol} onChange={(e) => setO({ ...o, amtTol: Math.max(0, Number(e.target.value) || 0) })} style={{ ...inp, width: 140 }} /></L>
      <L label="Date tolerance (days)"><input data-testid="rc-days" type="number" min={0} value={o.dateTolDays} onChange={(e) => setO({ ...o, dateTolDays: Math.max(0, Number(e.target.value) || 0) })} style={{ ...inp, width: 160 }} /></L>
      <button data-testid="rc-run" disabled={na === nb} onClick={() => setRes(reconcile(ta, tb, o))} style={{ ...btn(true), minHeight: 44, fontSize: 14 }}>Reconcile</button>
      {na === nb && <span style={{ fontSize: 12.5, color: V.warn }}>Choose two different sheets.</span>}
    </div>
    {res && <div data-testid="rc-result">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Tile testid="rc-matched" label="Matched" value={res.matched.length.toLocaleString("en-IN")} sub={fmtNum(res.matchedValue)} tone="ok" />
        <Tile testid="rc-diff" label="Amount differences" value={res.differences.length.toLocaleString("en-IN")} sub={fmtNum(res.differences.reduce((s, x) => s + x.diff, 0)) + " net"} tone={res.differences.length ? "warn" : "ok"} />
        <Tile testid="rc-onlya" label={"Only in " + na} value={res.onlyA.length.toLocaleString("en-IN")} sub={fmtNum(sumOf(ta, res.onlyA, o.amtA))} tone={res.onlyA.length ? "bad" : "ok"} />
        <Tile testid="rc-onlyb" label={"Only in " + nb} value={res.onlyB.length.toLocaleString("en-IN")} sub={fmtNum(sumOf(tb, res.onlyB, o.amtB))} tone={res.onlyB.length ? "bad" : "ok"} />
      </div>
      <div style={{ padding: 14, borderRadius: 14, background: V.surface2, marginBottom: 14, fontSize: 14, lineHeight: 1.6 }}>{res.summary.map((s, i) => <div key={i}>{s}</div>)}</div>
      <button data-testid="rc-sheets" onClick={() => { reconSheets(ta, tb, o, res, na, nb).forEach((s) => ctx.addSheet(s.name, s.rows, s.name === "Recon summary" ? { titleRow: 0, headerRows: [2], widths: [260, 100, 140], numFmt: [{ r1: 3, r2: 10, c1: 2, c2: 2, pattern: "#,##0.00" }] } : { headerRows: [0], freezeRows: 1 })); ctx.toast("Five result sheets added: summary, differences, only in each, matched.", "success"); }} style={{ ...btn(true), marginBottom: 18 }}>Create result sheets</button>
      {res.differences.length > 0 && <><div style={{ fontWeight: 800, margin: "6px 0" }}>Amount differences</div><Table2 testid="rc-tbl-diff" head={["Reference", na + " amount", nb + " amount", "Difference"]} rows={res.differences.map((d) => [String(ta.rows[d.a][o.keyA] ?? ""), Number(ta.rows[d.a][o.amtA]) || 0, Number(tb.rows[d.b][o.amtB]) || 0, d.diff])} /></>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14, marginTop: 14 }}>
        <div><div style={{ fontWeight: 800, marginBottom: 6 }}>Only in {na}</div><Table2 testid="rc-tbl-a" head={ta.headers} rows={res.onlyA.map((i) => ta.rows[i])} max={10} /></div>
        <div><div style={{ fontWeight: 800, marginBottom: 6 }}>Only in {nb}</div><Table2 testid="rc-tbl-b" head={tb.headers} rows={res.onlyB.map((j) => tb.rows[j])} max={10} /></div>
      </div>
    </div>}
  </div>;
}

// ═════════ Data health & formula risk ═════════
function Health({ ctx }: { ctx: AutomateCtx }) {
  const [ver, setVer] = useState(0); const sheet = ctx.active();
  const grid = useMemo(() => { const v = ctx.values(), f = ctx.formulas(); return v.map((row, r) => row.map((x, c) => (typeof f[r]?.[c] === "string" && String(f[r][c]).startsWith("=") ? f[r][c] : x))); }, [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = useMemo(() => toTable(ctx.values()), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasF = grid.some((r) => r.some((v) => typeof v === "string" && v.startsWith("=")));
  const issues = useMemo(() => healthScan(t).map((i) => (i.kind === "duplicates" && hasF ? { ...i, fixable: false, detail: i.detail + " Not removed automatically because this sheet has formulas that would shift." } : i)), [t, hasF]);
  const risks: FormulaRisk[] = useMemo(() => formulaRisks(ctx.formulas(), ctx.values()), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const amt = numericCols(profile(t)).find((c) => /amount|value|revenue|sales|total|invoice|payment|debit|credit|expense/i.test(c.name)) || numericCols(profile(t))[0];
  const bf = useMemo(() => (amt ? benford(t.rows.map((r) => Number(r[amt.index]))) : null), [t, amt]);
  const [pick, setPick] = useState<string[]>(() => issues.filter((i) => i.fixable && !i.optIn).map((i) => i.id));   /* opt-in fixes start unticked */ const [log, setLog] = useState<string[]>([]);
  const K = themeInk(); const sevC = { high: V.bad, medium: V.warn, low: V.text3 };
  const fix = () => { const chosen = issues.filter((i) => pick.includes(i.id) && i.fixable); if (!chosen.length) return; ctx.backup(); const r = applyFixes(grid, chosen as HealthIssue[]); ctx.replaceValues(sheet, r.values); setLog(r.log); setTimeout(() => setVer((x) => x + 1), 400); ctx.toast("Fixed: " + r.log.length + " type(s) of issue. Use “Undo last automation” to reverse.", "success"); };
  return <div data-testid="au-health">
    <H1>Data health & risk</H1>
    <Lede>Before you report, make sure the data and the model can be trusted. Fixes never touch formulas, and one click undoes them.</Lede>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 18 }}>
      <Tile testid="hl-issues" label="Data issues" value={String(issues.length)} sub={issues.filter((i) => i.severity === "high").length + " high priority"} tone={issues.some((i) => i.severity === "high") ? "bad" : issues.length ? "warn" : "ok"} />
      <Tile testid="hl-risks" label="Formula risks" value={String(risks.length)} sub={risks.filter((r) => r.kind === "inconsistent").length + " inconsistent, " + risks.filter((r) => r.kind === "hardcoded").length + " hard-coded"} tone={risks.length ? "warn" : "ok"} />
      <Tile testid="hl-benford" label={"Benford check" + (amt ? ": " + amt.name : "")} value={bf ? bf.verdict[0].toUpperCase() + bf.verdict.slice(1) : "Not enough data"} sub={bf ? bf.n.toLocaleString("en-IN") + " amounts, deviation " + bf.mad.toFixed(4) : "Needs 300+ amounts"} tone={bf ? (bf.verdict === "nonconforming" ? "bad" : bf.verdict === "marginal" ? "warn" : "ok") : undefined} />
    </div>
    <div style={{ fontWeight: 800, fontSize: 17, margin: "4px 0 8px" }}>Data issues</div>
    {!issues.length ? <div style={{ padding: 14, borderRadius: 12, background: V.surface2 }}>No data issues found.</div> : <div data-testid="hl-list" style={{ display: "grid", gap: 8 }}>{issues.map((i) =>
      <label key={i.id} data-testid={"hl-" + i.id} style={{ display: "flex", gap: 12, padding: 14, borderRadius: 14, border: "1px solid " + V.border, background: V.surface, cursor: i.fixable ? "pointer" : "default" }}>
        <input type="checkbox" disabled={!i.fixable} checked={i.fixable && pick.includes(i.id)} onChange={(e) => setPick(e.target.checked ? [...pick, i.id] : pick.filter((x) => x !== i.id))} style={{ marginTop: 3 }} />
        <span style={{ flex: 1 }}><span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><b style={{ fontSize: 14 }}>{i.title}</b><span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: sevC[i.severity], borderRadius: 99, padding: "1px 8px" }}>{i.severity}</span><span style={{ fontSize: 12.5, color: V.text3 }}>{i.count.toLocaleString("en-IN")} {i.kind === "benford" ? "amounts" : "cells/rows"}</span></span>
          <span style={{ display: "block", fontSize: 13, color: V.text2, marginTop: 2 }}>{i.detail}</span>{i.examples.length > 0 && <span style={{ display: "block", fontSize: 12.5, color: V.text3, marginTop: 4 }}>e.g. {i.examples.join("; ")}</span>}</span>
      </label>)}</div>}
    {issues.some((i) => i.fixable) && <button data-testid="hl-fix" onClick={fix} disabled={!pick.length} style={{ ...btn(true), marginTop: 10 }}>Fix selected ({pick.filter((id) => issues.find((i) => i.id === id)?.fixable).length})</button>}
    {log.length > 0 && <div data-testid="hl-log" style={{ marginTop: 10, padding: 12, borderRadius: 12, background: V.surface2, fontSize: 13.5 }}>{log.map((l, i) => <div key={i}>✓ {l}</div>)}</div>}
    {bf && <div style={{ marginTop: 22 }}><div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Benford’s law: first digits of {amt!.name}</div><div style={{ fontSize: 13, color: V.text2, marginBottom: 8, maxWidth: 760 }}>In genuine financial data about 30% of amounts start with 1 and under 5% start with 9. Invented, rounded or split amounts break this pattern. A deviation is a reason to look closer, not proof of fraud.</div>
      <div style={{ padding: 12, borderRadius: 14, border: "1px solid " + V.border, background: V.surface }}><EChartRaw testid="hl-benford-chart" height={260} option={{ grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true }, legend: { top: 0, textStyle: { color: K.muted } }, tooltip: { trigger: "axis", valueFormatter: (v: number) => (v * 100).toFixed(1) + "%" }, xAxis: { type: "category", data: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], axisLabel: { color: K.muted } }, yAxis: { type: "value", axisLabel: { color: K.muted, formatter: (v: number) => (v * 100).toFixed(0) + "%" }, splitLine: { lineStyle: { color: "rgba(100,116,139,.18)" } } },
        series: [{ name: "Your data", type: "bar", data: bf.observed, itemStyle: { color: bf.verdict === "nonconforming" ? "#DC2626" : "#2563EB", borderRadius: [4, 4, 0, 0] } }, { name: "Benford expected", type: "line", data: bf.expected, symbolSize: 7, lineStyle: { color: "#F59E0B", width: 2.5 }, itemStyle: { color: "#F59E0B" } }] }} /></div></div>}
    <div style={{ fontWeight: 800, fontSize: 17, margin: "22px 0 8px" }}>Formula risks</div>
    {!risks.length ? <div style={{ padding: 14, borderRadius: 12, background: V.surface2 }}>{hasF ? "No risky formulas found." : "This sheet has no formulas to check."}</div> : <div data-testid="hl-risklist" style={{ display: "grid", gap: 6 }}>{risks.slice(0, 60).map((r, i) =>
      <button key={i} data-testid={"hl-risk-" + r.cell} onClick={() => ctx.select(sheet, r.cell)} style={{ textAlign: "left", display: "flex", gap: 12, padding: "10px 12px", borderRadius: 12, border: "1px solid " + V.border, background: V.surface, color: V.text, cursor: "pointer" }}>
        <b style={{ minWidth: 52, color: r.kind === "error" ? V.bad : r.kind === "inconsistent" ? V.warn : V.accent }}>{r.cell}</b>
        <span style={{ flex: 1, fontSize: 13 }}><code style={{ fontSize: 12.5, background: V.surface2, padding: "1px 6px", borderRadius: 6 }}>{r.formula}</code><span style={{ display: "block", color: V.text2, marginTop: 3 }}>{r.why}</span></span></button>)}</div>}
  </div>;
}
