import React, { useEffect, useMemo, useRef, useState } from "react";
import { serialToIso, type Cell } from "./lib/SheetsEngine";
import { toTable, profile, facts, numericCols, categoryCols, dateCol, groupBy, pivot, pivotSheetRows, parseQuery, runQuery, parseNarrative, analysisSheetRows, buildApp, fmtNum, toMonth, ANALYSIS_SYSTEM, ASK_SYSTEM, type Table, type Agg, type PivotSpec, type Narrative } from "./lib/SheetsAnalytics";
import { suggest, computeChart, pivotView, chartTitle, draftEmail, emailPrompt, mergeAIEmail, allowedFacts, emailHtml, emailText, gmailUrl, outlookUrl, AUDIENCES, PURPOSES, EMAIL_SYSTEM, type ChartSpec, type ChartType, type ChartData, type ShowAs, type Audience, type Purpose, type Tone, type EmailContext } from "./lib/SheetsSmart";
import { buildPdf, buildPpt, type Report } from "./lib/SheetsReport";
import { EChart, chartPng } from "./SheetsCharts";

// Insight panels for OrchestrIQ Sheets. Numbers: computed by code. AI: chooses what to compute
// or writes wording, and every number it writes is verified against the computed facts.
const V = { text: "var(--oiq-ink)", text2: "var(--oiq-body)", text3: "var(--oiq-muted)", border: "var(--oiq-border)", surface: "var(--oiq-surface)", surface2: "var(--oiq-surface2)", accent: "var(--oiq-accent)", ok: "var(--oiq-success)", warn: "var(--oiq-warning)", bad: "var(--oiq-danger)" };
const inp: React.CSSProperties = { minHeight: 34, padding: "0 8px", borderRadius: 8, border: "1px solid " + V.border, background: V.surface, color: V.text, fontSize: 12.5, boxSizing: "border-box", width: "100%" };
const btn = (on = false): React.CSSProperties => ({ minHeight: 34, padding: "0 10px", borderRadius: 8, border: "1px solid " + (on ? V.accent : V.border), background: on ? V.accent : V.surface, color: on ? "#fff" : V.text, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" });
const card: React.CSSProperties = { border: "1px solid " + V.border, borderRadius: 12, padding: 10, background: V.surface };
type Ask = (sys: string, msgs: { role: string; content: string }[], maxT?: number) => Promise<string>;
export interface SheetStyle { headerRows?: number[]; totalRows?: number[]; titleRow?: number; numFmt?: { r1: number; r2: number; c1: number; c2: number; pattern: string }[]; freezeRows?: number; widths?: number[] }
export interface BasketItem { id: string; title: string; why: string; type: ChartType; spec?: ChartSpec; data?: ChartData }
export interface InsightCtx {
  getValues: () => Cell[][]; sheetName: string; version: number; ask?: Ask; workbookName: string;
  addSheet: (name: string, rows: Cell[][], style?: SheetStyle) => void; toast: (m: string, k?: string) => void;
  basket: BasketItem[]; setBasket: (b: BasketItem[]) => void;
}
function L({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: V.text2, minWidth: 0 }}>{label}{children}</label>; }
function Note({ kind, children }: { kind: "ok" | "warn" | "bad" | "info"; children: React.ReactNode }) { return <div role="status" style={{ fontSize: 12, marginTop: 6, color: kind === "ok" ? V.ok : kind === "warn" ? V.warn : kind === "bad" ? V.bad : V.text3 }}>{children}</div>; }
const useData = (ctx: InsightCtx) => useMemo(() => { const t = toTable(ctx.getValues()); return { t, p: profile(t) }; }, [ctx.version, ctx.sheetName]); // eslint-disable-line react-hooks/exhaustive-deps
const TYPES: { k: ChartType; label: string; icon: string }[] = [{ k: "column", label: "Column", icon: "▁▃▆" }, { k: "bar", label: "Bar", icon: "≡" }, { k: "stacked", label: "Stacked", icon: "▦" }, { k: "line", label: "Line", icon: "⟋" }, { k: "area", label: "Area", icon: "◢" }, { k: "doughnut", label: "Doughnut", icon: "◔" }, { k: "combo", label: "Pareto", icon: "▁▃∕" }];
const inBasket = (b: BasketItem[], id: string) => b.some((x) => x.id === id);
function loadScript(src: string) { return new Promise<void>((res, rej) => { if (document.querySelector('script[src="' + src + '"]')) { res(); return; } const s = document.createElement("script"); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s); }); }
function dl(name: string, blob: Blob) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); }
const pivotStyle = (rows: Cell[][]): SheetStyle => { const nCols = Math.max(...rows.map((r) => r.length)); const last = rows.length - 1;
  return { titleRow: 0, headerRows: [2], totalRows: [last], freezeRows: 3, widths: [200, ...Array(Math.max(0, nCols - 1)).fill(120)], numFmt: [{ r1: 3, r2: last, c1: 1, c2: nCols - 1, pattern: "#,##0" }] }; };

// ── Build a report (PDF / PowerPoint) from the basket, or the best suggestions ──
export async function makeReport(t: Table, items: BasketItem[], title: string, scope: string, extra: { summary?: string[]; recommendations?: string[] } = {}): Promise<Report> {
  const p = profile(t); const fs = facts(t, p); const nums = numericCols(p); const sg = suggest(t, p);
  const list: BasketItem[] = items.length ? items : sg.slice(0, 4).map((s) => ({ id: s.id, title: s.title, why: s.why, type: s.chart.type, spec: s.chart }));
  const out: Report["items"] = [];
  for (const it of list) { const d = it.data || (it.spec ? computeChart(t, it.spec) : null); if (!d || "error" in d) continue; out.push({ title: it.title, why: it.why, type: it.type, data: d, png: await chartPng(d, it.type) }); }
  const kpis = [{ label: "Records", value: t.rows.length }, ...nums.slice(0, 3).map((c) => ({ label: "Total " + c.name, value: c.sum || 0 }))];
  const cat = categoryCols(p)[0]; let pv: Report["pivot"];
  if (cat && nums[0]) { const m = sg.find((x) => x.id === "matrix"); const spec: PivotSpec = (m?.pivot as PivotSpec) || { rows: cat.name, value: nums[0].name, agg: "sum" }; const res: any = pivot(t, spec);
    if (!("error" in res)) { const multi = res.colKeys.length > 1 && !!spec.cols;
      pv = { title: res.title, head: [spec.rows, ...(multi ? res.colKeys : ["Value"]), ...(multi ? ["Total"] : [])], rows: [...res.rowKeys.map((k: string, i: number) => [k, ...(multi ? res.cells[i] : [res.cells[i][0]]).map((v: number) => fmtNum(v)), ...(multi ? [fmtNum(res.rowTotals[i])] : [])]), ["Total", ...(multi ? res.colTotals : [res.grand]).map((v: number) => fmtNum(v)), ...(multi ? [fmtNum(res.grand)] : [])]] }; } }
  const recs = extra.recommendations || (() => { const d0 = out[0]?.data; if (!d0) return []; const s = d0.series[0]; const n = d0.categories.length; const r: string[] = [];
    if (n) r.push("Understand what drives " + d0.categories[0] + " and replicate it where possible."); if (n > 2) r.push("Agree an improvement plan for " + d0.categories[n - 1] + " with a named owner."); if (p.duplicateRows) r.push("Remove " + p.duplicateRows + " duplicate rows before final reporting."); void s; return r; })();
  return { title, subtitle: "Prepared with OrchestrIQ Sheets", scope, rows: t.rows.length, kpis, summary: extra.summary || fs.filter((f) => f.id !== "size").slice(0, 5).map((f) => f.text), items: out, pivot: pv,
    recommendations: recs, notes: ["Every figure in this report is computed directly from the data" + (t.excludedTotals ? "; " + t.excludedTotals + " total row(s) were excluded so nothing is counted twice" : "") + "."] };
}
export async function downloadPdf(r: Report) { const w: any = window; if (!w.jspdf?.jsPDF) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"); if (!w.jspdf?.jsPDF?.API?.autoTable) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"); dl(r.title.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 60) + ".pdf", buildPdf(w.jspdf.jsPDF, r).output("blob")); }
export async function downloadPpt(r: Report) { const w: any = window; if (!w.PptxGenJS) await loadScript("https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"); const P = await buildPpt(w.PptxGenJS, r); await P.writeFile({ fileName: r.title.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 60) + ".pptx" }); }

function ReportBar({ ctx, t, scope }: { ctx: InsightCtx; t: Table; scope: string }) {
  const [busy, setBusy] = useState(""); const [mail, setMail] = useState(false);
  const run = async (k: "pdf" | "ppt") => { setBusy(k); try { const r = await makeReport(t, ctx.basket, ctx.workbookName + " — report", scope); if (k === "pdf") await downloadPdf(r); else await downloadPpt(r); ctx.toast((k === "pdf" ? "PDF" : "PowerPoint") + " downloaded with " + r.items.length + " chart(s), tables and a pivot.", "success"); } catch (e: any) { ctx.toast("Could not build the file: " + (e?.message || e), "warning"); } setBusy(""); };
  return <div data-testid="report-bar" style={{ ...card, marginTop: 10, background: V.surface2 }}>
    <div style={{ fontWeight: 800, fontSize: 12.5 }}>Report basket ({ctx.basket.length})</div>
    {ctx.basket.length ? <ul style={{ margin: "4px 0 6px", paddingLeft: 18, fontSize: 12, color: V.text2 }}>{ctx.basket.map((b) => <li key={b.id}>{b.title} <button onClick={() => ctx.setBasket(ctx.basket.filter((x) => x.id !== b.id))} style={{ border: "none", background: "none", color: V.bad, cursor: "pointer", fontSize: 11 }}>remove</button></li>)}</ul>
      : <div style={{ fontSize: 12, color: V.text3, margin: "4px 0 6px" }}>Empty: reports use the best 4 suggestions automatically.</div>}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button data-testid="rb-pdf" disabled={!!busy} onClick={() => run("pdf")} style={btn(true)}>{busy === "pdf" ? "Building…" : "PDF report"}</button>
      <button data-testid="rb-ppt" disabled={!!busy} onClick={() => run("ppt")} style={btn()}>{busy === "ppt" ? "Building…" : "PowerPoint"}</button>
      <button data-testid="rb-email" onClick={() => setMail(true)} style={btn()}>Business email</button></div>
    {mail && <EmailComposer ctx={ctx} t={t} scope={scope} onClose={() => setMail(false)} />}
  </div>;
}

// ── SMART: suggestions you can build in one click ──
export function SmartPanel({ ctx }: { ctx: InsightCtx }) {
  const { t, p } = useData(ctx); const sg = useMemo(() => suggest(t, p).slice(0, 6), [t, p]);
  if (!p.rows) return <Note kind="info">Put a header row in row 1 and data below it; suggestions appear automatically.</Note>;
  const cats = categoryCols(p), nums = numericCols(p), dc = dateCol(p);
  return <div data-testid="smart-panel">
    <div style={{ fontSize: 12.5, color: V.text2, marginBottom: 8 }}><b style={{ color: V.text }}>{p.rows.toLocaleString("en-IN")} rows</b> · measures: {nums.slice(0, 3).map((c) => c.name).join(", ") || "none"} · dimensions: {cats.slice(0, 3).map((c) => c.name).join(", ") || "none"}{dc ? " · dates: " + dc.name : ""}{t.excludedTotals ? " · " + t.excludedTotals + " total row(s) excluded" : ""}</div>
    <button data-testid="smart-addall" onClick={() => { const add = sg.slice(0, 4).filter((s) => !inBasket(ctx.basket, s.id)).map((s) => ({ id: s.id, title: s.title, why: s.why, type: s.chart.type, spec: s.chart })); ctx.setBasket([...ctx.basket, ...add]); ctx.toast("Top suggestions added to the report.", "success"); }} style={{ ...btn(true), marginBottom: 8 }}>Add top 4 to report</button>
    {sg.map((s) => { const d = computeChart(t, s.chart); const added = inBasket(ctx.basket, s.id);
      return <div key={s.id} data-testid={"sg-" + s.id} style={{ ...card, marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{s.title}</div><div style={{ fontSize: 11.5, color: V.text3 }}>{s.why}</div>
        {!("error" in d) && <EChart data={{ ...d, title: "" }} type={s.chart.type} height={170} testid={"sg-chart-" + s.id} />}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button data-testid={"sg-add-" + s.id} onClick={() => ctx.setBasket(added ? ctx.basket.filter((x) => x.id !== s.id) : [...ctx.basket, { id: s.id, title: s.title, why: s.why, type: s.chart.type, spec: s.chart }])} style={btn(added)}>{added ? "✓ In report" : "Add to report"}</button>
          {s.pivot && <button data-testid={"sg-pivot-" + s.id} onClick={() => { const res: any = pivot(t, s.pivot as PivotSpec); if ("error" in res) return; const ps = pivotSheetRows(t, s.pivot as PivotSpec, res, ctx.sheetName); ctx.addSheet("Pivot", ps.rows, pivotStyle(ps.rows)); ctx.toast(ps.note, ps.live ? "success" : "info"); }} style={btn()}>Create pivot sheet</button>}
        </div></div>; })}
    <ReportBar ctx={ctx} t={t} scope="all data" />
  </div>;
}

// ── CHART builder ──
export function ChartPanel({ ctx }: { ctx: InsightCtx }) {
  const { t, p } = useData(ctx); const nums = numericCols(p);
  const rec = useMemo(() => suggest(t, p).slice(0, 5), [t, p]);
  const [s, setS] = useState<ChartSpec>(() => rec[0]?.chart || { type: "column", x: categoryCols(p)[0]?.name || t.headers[0] || "", y: nums[0]?.name || null, agg: "sum" });
  const d = useMemo(() => computeChart(t, s), [t, s]); const id = "chart-" + s.type + "-" + chartTitle(s);
  return <div data-testid="ch-panel">
    <div style={{ fontSize: 11.5, color: V.text3, marginBottom: 4 }}>Recommended for this data</div>
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>{rec.map((r) => <button key={r.id} data-testid={"ch-rec-" + r.id} onClick={() => setS(r.chart)} style={{ ...btn(chartTitle(s) === chartTitle(r.chart) && s.type === r.chart.type), fontSize: 11, minHeight: 28, fontWeight: 600 }}>{r.title}</button>)}</div>
    <div role="group" aria-label="Chart type" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>{TYPES.map((x) => <button key={x.k} data-testid={"ch-type-" + x.k} aria-pressed={s.type === x.k} title={x.label} onClick={() => setS({ ...s, type: x.k, split: x.k === "doughnut" || x.k === "combo" ? null : s.split, topN: x.k === "combo" ? s.topN || 10 : s.topN })} style={{ ...btn(s.type === x.k), minHeight: 30, fontSize: 11 }}>{x.icon} {x.label}</button>)}</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      <L label="Categories / dates (X)"><select data-testid="ch-x" value={s.x} onChange={(e) => setS({ ...s, x: e.target.value })} style={inp}>{t.headers.map((h) => <option key={h}>{h}</option>)}</select></L>
      <L label="Values (Y)"><select data-testid="ch-y" value={s.y || ""} onChange={(e) => setS({ ...s, y: e.target.value || null })} style={inp}><option value="">Count of rows</option>{nums.map((c) => <option key={c.name}>{c.name}</option>)}</select></L>
      <L label="Summarise by"><select value={s.agg} onChange={(e) => setS({ ...s, agg: e.target.value as Agg })} style={inp}>{(["sum", "avg", "count", "min", "max"] as Agg[]).map((a) => <option key={a} value={a}>{({ sum: "Sum", avg: "Average", count: "Count", min: "Min", max: "Max" } as any)[a]}</option>)}</select></L>
      <L label="Split into series"><select data-testid="ch-split" value={s.split || ""} disabled={s.type === "doughnut" || s.type === "combo"} onChange={(e) => setS({ ...s, split: e.target.value || null })} style={inp}><option value="">(none)</option>{categoryCols(p).filter((c) => c.name !== s.x && c.distinct <= 8).map((c) => <option key={c.name}>{c.name}</option>)}</select></L>
      <L label="Show"><select value={String(s.topN || 0)} onChange={(e) => setS({ ...s, topN: Number(e.target.value) || undefined })} style={inp}><option value="0">All</option><option value="5">Top 5 + Others</option><option value="10">Top 10 + Others</option><option value="20">Top 20 + Others</option></select></L>
    </div>
    <div style={{ ...card, marginTop: 8 }}>{"error" in d ? <Note kind="warn">{d.error}</Note> : <EChart data={d} type={s.type} height={320} testid="ch-chart" />}</div>
    {!("error" in d) && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
      <button data-testid="ch-add" onClick={() => { if (!inBasket(ctx.basket, id)) ctx.setBasket([...ctx.basket, { id, title: d.title, why: "Chart built in Sheets.", type: s.type, spec: s }]); ctx.toast("Chart added to the report.", "success"); }} style={btn(true)}>{inBasket(ctx.basket, id) ? "✓ In report" : "Add to report"}</button>
      <button data-testid="ch-png" onClick={async () => { const u = await chartPng(d, s.type); const b = await (await fetch(u)).blob(); dl("chart.png", b); }} style={btn()}>Download PNG</button>
    </div>}
    <ReportBar ctx={ctx} t={t} scope="all data" />
  </div>;
}

// ── PIVOT builder ──
export function PivotPanel({ ctx }: { ctx: InsightCtx }) {
  const { t, p } = useData(ctx); const nums = numericCols(p); const sug = useMemo(() => suggest(t, p).find((x) => x.pivot && x.pivot.cols) || suggest(t, p).find((x) => x.pivot), [t, p]);
  const [s, setS] = useState<PivotSpec>(() => ({ rows: sug?.pivot?.rows || categoryCols(p)[0]?.name || t.headers[0] || "", cols: sug?.pivot?.cols || "", value: sug?.pivot?.value || nums[0]?.name || "", agg: (sug?.pivot?.agg as Agg) || (nums[0] ? "sum" : "count"), byMonth: !!sug?.pivot?.byMonth }));
  const [showAs, setShowAs] = useState<ShowAs>("value"); const [topN, setTopN] = useState(0); const [sort, setSort] = useState<"value" | "label">("value");
  const res: any = useMemo(() => (s.rows ? pivot(t, { ...s, cols: s.cols || undefined, value: s.value || undefined }) : { error: "Choose rows." }), [t, s]);
  const view = useMemo(() => ("error" in res ? null : pivotView(res, showAs, topN, sort)), [res, showAs, topN, sort]);
  const isDate = t.types[t.headers.indexOf(s.rows)] === "date"; const f = (v: number) => (view?.isPct ? v.toFixed(1) + "%" : fmtNum(v));
  const showLabel = ({ pctGrand: "% of grand total", pctRow: "% of row", pctCol: "% of column" } as any)[showAs];
  const chartData: ChartData | null = view ? { title: res.title, categories: view.rowKeys.slice(0, 15), series: (s.cols ? view.colKeys.slice(0, 8) : ["Value"]).map((k, j) => ({ name: s.cols ? k : res.title.split(" by ")[0], values: view.cells.slice(0, 15).map((r) => r[j]) })), xLabel: s.rows, yLabel: s.value || "Rows", total: view.grand } : null;
  const create = () => { if (!view) return;
    if (showAs === "value" && !topN) { const ps = pivotSheetRows(t, { ...s, cols: s.cols || undefined, value: s.value || undefined }, res, ctx.sheetName); ctx.addSheet("Pivot", ps.rows, pivotStyle(ps.rows)); ctx.toast(ps.note, ps.live ? "success" : "info"); return; }
    const head = [s.rows, ...(s.cols ? view.colKeys : [showAs === "value" ? "Value" : "Share"]), ...(s.cols ? ["Total"] : [])]; const k = view.isPct ? 0.01 : 1;
    const rows: Cell[][] = [[res.title + (view.isPct ? " (" + showLabel + ")" : "") + (topN ? " — top " + topN : "")], [], head,
      ...view.rowKeys.map((rk, i) => [rk, ...(s.cols ? view.cells[i] : [view.cells[i][0]]).map((v) => v * k), ...(s.cols ? [view.rowTotals[i] * k] : [])] as Cell[]),
      ["Total", ...(s.cols ? view.colTotals : [view.grand]).map((v) => v * k), ...(s.cols ? [view.grand * k] : [])] as Cell[]];
    const st = pivotStyle(rows); if (view.isPct) st.numFmt = [{ r1: 3, r2: rows.length - 1, c1: 1, c2: head.length - 1, pattern: "0.0%" }]; ctx.addSheet("Pivot", rows, st); ctx.toast("Pivot sheet created (values; rebuild after data changes).", "info"); };
  return <div data-testid="pv-panel">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      <L label="Rows"><select data-testid="pv-rows" value={s.rows} onChange={(e) => setS({ ...s, rows: e.target.value, byMonth: t.types[t.headers.indexOf(e.target.value)] === "date" })} style={inp}>{t.headers.map((h) => <option key={h}>{h}</option>)}</select></L>
      <L label="Columns"><select data-testid="pv-cols" value={s.cols} onChange={(e) => setS({ ...s, cols: e.target.value })} style={inp}><option value="">(none)</option>{t.headers.filter((h) => h !== s.rows).map((h) => <option key={h}>{h}</option>)}</select></L>
      <L label="Values"><select data-testid="pv-value" value={s.value} onChange={(e) => setS({ ...s, value: e.target.value, agg: e.target.value ? (s.agg === "count" ? "sum" : s.agg) : "count" })} style={inp}><option value="">(count rows)</option>{nums.map((c) => <option key={c.name}>{c.name}</option>)}</select></L>
      <L label="Summarise by"><select data-testid="pv-agg" value={s.agg} onChange={(e) => setS({ ...s, agg: e.target.value as Agg })} style={inp}>{(["sum", "count", "avg", "min", "max"] as Agg[]).map((a) => <option key={a} value={a}>{({ sum: "Sum", count: "Count", avg: "Average", min: "Min", max: "Max" } as any)[a]}</option>)}</select></L>
      <L label="Show values as"><select data-testid="pv-showas" value={showAs} onChange={(e) => setShowAs(e.target.value as ShowAs)} style={inp}><option value="value">Values</option><option value="pctGrand">% of grand total</option><option value="pctRow">% of row total</option><option value="pctCol">% of column total</option></select></L>
      <L label="Rows to show"><select data-testid="pv-top" value={String(topN)} onChange={(e) => setTopN(Number(e.target.value))} style={inp}><option value="0">All</option><option value="5">Top 5 + Others</option><option value="10">Top 10 + Others</option><option value="20">Top 20 + Others</option></select></L>
    </div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: V.text2, marginTop: 6 }}>
      <label><input type="radio" checked={sort === "value"} onChange={() => setSort("value")} /> Largest first</label><label><input type="radio" checked={sort === "label"} onChange={() => setSort("label")} /> A–Z</label>
      {isDate && <label><input type="checkbox" checked={!!s.byMonth} onChange={(e) => setS({ ...s, byMonth: e.target.checked })} /> Group by month</label>}</div>
    {"error" in res || !view ? <Note kind="warn">{res.error}</Note> : <>
      <div data-testid="pv-preview" style={{ ...card, marginTop: 8, overflowX: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 4 }}>{res.title}{view.isPct ? " · " + showLabel : ""} — {res.rowKeys.length} row(s){res.colKeys.length > 1 ? " × " + res.colKeys.length + " column(s)" : ""}</div>
        <table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }}><thead><tr><th style={{ padding: "4px 6px", textAlign: "left", background: "#11264A", color: "#fff" }}>{s.rows}</th>{(s.cols ? view.colKeys : [showAs === "value" ? "Value" : "Share"]).slice(0, 10).map((k) => <th key={k} style={{ padding: "4px 6px", textAlign: "right", background: "#11264A", color: "#fff" }}>{k}</th>)}{s.cols && <th style={{ padding: "4px 6px", textAlign: "right", background: "#11264A", color: "#fff" }}>Total</th>}</tr></thead>
          <tbody>{view.rowKeys.slice(0, 15).map((k, i) => <tr key={k}><td style={{ padding: "3px 6px", borderBottom: "1px solid " + V.border, fontWeight: 600 }}>{k}</td>
            {(s.cols ? view.cells[i] : [view.cells[i][0]]).slice(0, 10).map((v, j) => <td key={j} data-heat={view.heat[i][j].toFixed(2)} style={{ padding: "3px 6px", textAlign: "right", borderBottom: "1px solid " + V.border, background: "rgba(37,99,235," + (0.06 + view.heat[i][j] * 0.42).toFixed(2) + ")" }}>{f(v)}</td>)}
            {s.cols && <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 800, borderBottom: "1px solid " + V.border }}>{f(view.rowTotals[i])}</td>}</tr>)}
            <tr><td style={{ padding: "4px 6px", fontWeight: 800 }}>Total</td>{(s.cols ? view.colTotals : [view.grand]).slice(0, 10).map((v, j) => <td key={j} style={{ padding: "4px 6px", textAlign: "right", fontWeight: 800 }}>{f(v)}</td>)}{s.cols && <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 800 }}>{f(view.grand)}</td>}</tr></tbody></table>
        {view.rowKeys.length > 15 && <Note kind="info">Preview shows 15 of {view.rowKeys.length} rows; the sheet will contain all.</Note>}</div>
      {chartData && <div style={{ ...card, marginTop: 8 }}><EChart data={chartData} type={s.cols ? "stacked" : s.byMonth ? "area" : "column"} height={260} testid="pv-chart" /></div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <button data-testid="pv-create" onClick={create} style={btn(true)}>Create pivot sheet</button>
        {chartData && <button data-testid="pv-add" onClick={() => { const id = "pivot-" + res.title + showAs; if (!inBasket(ctx.basket, id)) ctx.setBasket([...ctx.basket, { id, title: res.title, why: "Pivot built in Sheets.", type: s.cols ? "stacked" : "column", data: chartData }]); ctx.toast("Pivot chart added to the report.", "success"); }} style={btn()}>Add to report</button>}
      </div>
      <Note kind="info">{showAs === "value" && !topN ? "Creates a formatted sheet with live SUMIFS/COUNTIFS formulas that update when data changes." : "Percentages and Top N create a formatted sheet of values (rebuild after data changes)."}</Note>
    </>}
  </div>;
}

// ── ASK your data ──
export function AskPanel({ ctx }: { ctx: InsightCtx }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [out, setOut] = useState<any>(null); const [err, setErr] = useState("");
  const go = async () => { if (!ctx.ask || !q.trim()) return; setBusy(true); setErr(""); setOut(null);
    try { const t = toTable(ctx.getValues()); const prof = profile(t); const cols = prof.columns.map((c) => c.name + " (" + c.type + (c.top ? "; e.g. " + c.top.slice(0, 5).map((x) => x.value).join(", ") : "") + ")").join("\n");
      const r = await ctx.ask(ASK_SYSTEM, [{ role: "user", content: "Columns:\n" + cols + "\n\nQuestion: " + q.trim() }], 600); const pq = parseQuery(r, t);
      if (pq.error) setErr(pq.error); else if (pq.explain) setOut({ explain: pq.explain }); else setOut({ ...runQuery(t, pq.query!), q: pq.query });
    } catch (e: any) { setErr("AI request failed: " + (e?.message || e)); } setBusy(false); };
  const data: ChartData | null = out?.rows?.length > 1 ? { title: out.title, categories: out.rows.map((r: any) => r[0]), series: [{ name: out.q?.value || "Rows", values: out.rows.map((r: any) => r[1]) }], xLabel: out.q?.groupBy || "", yLabel: out.q?.value || "Rows", total: out.total } : null;
  return <div data-testid="ask-panel">
    <textarea data-testid="ask-q" value={q} onChange={(e) => setQ(e.target.value)} rows={2} placeholder="e.g. Which region had the highest sales in March for product A?" style={{ ...inp, minHeight: 56, padding: 8 }} />
    <button data-testid="ask-go" disabled={!ctx.ask || busy || !q.trim()} onClick={go} style={{ ...btn(true), width: "100%", marginTop: 6, opacity: !ctx.ask || busy || !q.trim() ? 0.6 : 1 }}>{busy ? "Working…" : "Ask"}</button>
    <Note kind="info">The AI decides what to calculate; the numbers are computed from every row.</Note>
    {err && <Note kind="bad">{err}</Note>}
    {out?.explain && <div style={{ fontSize: 13, color: V.text2, marginTop: 8, whiteSpace: "pre-wrap" }}>{out.explain}</div>}
    {out?.rows && <div data-testid="ask-out" style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>{out.title}</div><div data-testid="ask-summary" style={{ fontSize: 12.5, color: V.text2, margin: "2px 0 6px" }}>{out.summary}</div>
      {data && <div style={card}><EChart data={data} type={out.q?.byMonth ? "line" : "column"} height={240} testid="ask-chart" /></div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        <button data-testid="ask-sheet" onClick={() => { const rows: Cell[][] = [[out.title], [], [out.q?.groupBy || "Item", (out.q?.agg || "value") + (out.q?.value ? " of " + out.q.value : "")], ...out.rows]; ctx.addSheet("Answer", rows, { titleRow: 0, headerRows: [2], widths: [200, 140], numFmt: [{ r1: 3, r2: rows.length - 1, c1: 1, c2: 1, pattern: "#,##0" }] }); ctx.toast("Answer copied to a new sheet.", "success"); }} style={btn()}>Copy to a new sheet</button>
        {data && <button data-testid="ask-add" onClick={() => { ctx.setBasket([...ctx.basket, { id: "ask-" + Date.now(), title: out.title, why: out.summary, type: out.q?.byMonth ? "line" : "column", data }]); ctx.toast("Answer chart added to the report.", "success"); }} style={btn()}>Add to report</button>}
      </div></div>}
  </div>;
}

// ── ANALYZE (facts + verified AI insights) ──
export function AnalyzePanel({ ctx, onOpenApp }: { ctx: InsightCtx; onOpenApp: () => void }) {
  const { t, p } = useData(ctx); const fs = useMemo(() => facts(t, p), [t, p]);
  const [nar, setNar] = useState<Narrative | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const runAI = async () => { if (!ctx.ask) return; setBusy(true); setErr(""); try { const r = await ctx.ask(ANALYSIS_SYSTEM, [{ role: "user", content: "Sheet: " + ctx.sheetName + "\nColumns: " + t.headers.join(", ") + "\nFACTS:\n" + fs.map((f) => "- " + f.text).join("\n") }], 1500); const n = parseNarrative(r, fs); if (!n) setErr("The AI's reply could not be read. Try again."); setNar(n); } catch (e: any) { setErr("AI request failed: " + (e?.message || e)); } setBusy(false); };
  if (!p.rows) return <Note kind="info">This sheet has no data rows yet. Put a header row in row 1 and data below it.</Note>;
  return <div data-testid="an-panel">
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
      <button data-testid="an-ai" disabled={!ctx.ask || busy} onClick={runAI} style={{ ...btn(true), opacity: !ctx.ask || busy ? 0.6 : 1 }}>{busy ? "Writing insights…" : "AI insights"}</button>
      <button data-testid="an-sheet" onClick={() => { const rows = analysisSheetRows(t, p, ctx.sheetName); ctx.addSheet("Analysis", rows, { titleRow: 0, headerRows: rows.map((r, i) => (r[1] === "Total" ? i : -1)).filter((i) => i >= 0), widths: [220, 140, 140, 140, 140, 100], numFmt: [{ r1: 3, r2: rows.length - 1, c1: 1, c2: 1, pattern: "#,##0" }] }); ctx.toast("Analysis sheet created with live formulas.", "success"); }} style={btn()}>Create analysis sheet</button>
      <button data-testid="an-app" onClick={onOpenApp} style={btn()}>Build an app</button></div>
    <div style={{ fontWeight: 800, fontSize: 13 }}>What the data says (computed from all {p.rows.toLocaleString("en-IN")} rows)</div>
    <ul data-testid="an-facts" style={{ margin: "4px 0 8px", paddingLeft: 18, fontSize: 12.5, color: V.text2 }}>{fs.map((f) => <li key={f.id}>{f.text}</li>)}</ul>
    {err && <Note kind="bad">{err}</Note>}
    {nar && <div data-testid="an-narrative" style={card}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>{nar.headline}</div>
      {[["Insights", nar.insights], ["Recommendations", nar.recommendations]].map(([h, list]: any) => list.length ? <div key={h}><div style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>{h}</div><ul style={{ margin: "2px 0", paddingLeft: 18, fontSize: 12.5, color: V.text2 }}>{list.map((x: any, i: number) => <li key={i}>{x.text}{x.unverified.length > 0 && <span data-testid="an-unverified" style={{ color: V.bad, fontWeight: 700 }}> ⚠ unverified number: {x.unverified.join(", ")}</span>}</li>)}</ul></div> : null)}
      {nar.questions.length > 0 && <div style={{ fontSize: 12, color: V.text3, marginTop: 4 }}>Worth asking next: {nar.questions.join(" · ")}</div>}
      <Note kind="info">Every number in the AI's text is checked against the computed facts; anything not found is marked ⚠.</Note></div>}
    <ReportBar ctx={ctx} t={t} scope="all data" />
  </div>;
}

// ── BUSINESS EMAIL composer ──
const SENDER_KEY = "oiq-email-sender";
export function EmailComposer({ ctx, t, scope, onClose }: { ctx: InsightCtx; t: Table; scope: string; onClose: () => void }) {
  const p = useMemo(() => profile(t), [t]); const fs = useMemo(() => facts(t, p), [t, p]); const sg = useMemo(() => suggest(t, p), [t, p]);
  const first = ctx.basket.find((b) => b.spec || b.data);
  const chart = useMemo(() => { const d = first?.data || (first?.spec ? computeChart(t, { ...first.spec, split: null }) : sg[0] ? computeChart(t, { ...sg[0].chart, split: null }) : null); return d && !("error" in d) ? d : null; }, [t, first, sg]);
  const c: EmailContext = useMemo(() => ({ title: ctx.workbookName, scope, facts: fs, rows: t.rows.length, chart, kpis: numericCols(p).slice(0, 3).map((n) => ({ label: "Total " + n.name, value: n.sum || 0 })) }), [ctx.workbookName, scope, fs, t, chart, p]);
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SENDER_KEY) || "{}"); } catch { return {}; } })();
  const [aud, setAud] = useState<Audience>("cfo"); const [pur, setPur] = useState<Purpose>("update"); const [tone, setTone] = useState<Tone>("formal");
  const [rec, setRec] = useState(""); const [to, setTo] = useState(""); const [sender, setSender] = useState({ name: saved.name || "", title: saved.title || "", company: saved.company || "" });
  const [draft, setDraft] = useState(() => draftEmail(c, "cfo", "update", "formal", "")); const [busy, setBusy] = useState(false); const [usedAI, setUsedAI] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!usedAI) setDraft(draftEmail(c, aud, pur, tone, rec)); }, [aud, pur, tone, rec, c]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(SENDER_KEY, JSON.stringify(sender)); } catch {} }, [sender]);
  const html = emailHtml(draft, c, sender), text = emailText(draft, c, sender);
  const writeAI = async () => { if (!ctx.ask) return; setBusy(true); try { const base = draftEmail(c, aud, pur, tone, rec); const r = await ctx.ask(EMAIL_SYSTEM, [{ role: "user", content: emailPrompt(c, aud, pur, tone) }], 1400); setDraft(mergeAIEmail(base, r, allowedFacts(c))); setUsedAI(true); } catch (e: any) { ctx.toast("AI request failed: " + (e?.message || e), "warning"); } setBusy(false); };
  // Rich copy: HTML + plain text on the clipboard, so it pastes formatted into Gmail / Outlook.
  const copyRich = async (): Promise<boolean> => { const w: any = window;
    try { if (w.ClipboardItem && navigator.clipboard?.write) { await navigator.clipboard.write([new w.ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]); return true; } } catch {}
    try { const el = previewRef.current; if (!el) return false; const range = document.createRange(); range.selectNodeContents(el); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); const ok = document.execCommand("copy"); sel?.removeAllRanges(); return ok; } catch { return false; } };
  const copyAndOpen = async (where: "gmail" | "outlook" | "") => { const ok = await copyRich(); ctx.toast(ok ? (where ? "Email copied. In the compose window, click the message body and press Ctrl+V (Cmd+V on Mac)." : "Email copied — paste into Gmail or Outlook with Ctrl+V.") : "The browser blocked copying; use Download instead.", ok ? "success" : "warning");
    if (where) window.open(where === "gmail" ? gmailUrl(draft.subject, "", to) : outlookUrl(draft.subject, "", to), "_blank", "noopener"); };
  return <div data-testid="email-composer" role="dialog" aria-label="Business email" style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(2,6,23,0.55)", overflowY: "auto" }}>
    <div style={{ maxWidth: 1120, margin: "24px auto", background: "var(--oiq-bg)", borderRadius: 14, border: "1px solid " + V.border, padding: 16, color: V.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><div style={{ fontSize: 18, fontWeight: 800 }}>Business email</div><button data-testid="em-close" onClick={onClose} style={btn()}>Close</button></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
        <div style={{ flex: "1 1 280px", maxWidth: 360, display: "flex", flexDirection: "column", gap: 8 }}>
          <L label="Audience"><select data-testid="em-aud" value={aud} onChange={(e) => { setAud(e.target.value as Audience); setUsedAI(false); }} style={inp}>{(Object.keys(AUDIENCES) as Audience[]).map((k) => <option key={k} value={k}>{AUDIENCES[k].label}</option>)}</select></L>
          <div style={{ fontSize: 11.5, color: V.text3, marginTop: -4 }}>Focus: {AUDIENCES[aud].focus}.</div>
          <L label="Purpose"><select data-testid="em-purpose" value={pur} onChange={(e) => { setPur(e.target.value as Purpose); setUsedAI(false); }} style={inp}>{(Object.keys(PURPOSES) as Purpose[]).map((k) => <option key={k} value={k}>{PURPOSES[k].label}</option>)}</select></L>
          <L label="Tone"><select data-testid="em-tone" value={tone} onChange={(e) => { setTone(e.target.value as Tone); setUsedAI(false); }} style={inp}><option value="formal">Formal</option><option value="warm">Warm</option><option value="direct">Direct</option></select></L>
          <L label="Recipient name (for the greeting)"><input data-testid="em-rec" value={rec} onChange={(e) => { setRec(e.target.value); setUsedAI(false); }} placeholder="e.g. Priya" style={inp} /></L>
          <L label="Recipient email (optional, for Gmail / Outlook)"><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" style={inp} /></L>
          <L label="Your name"><input data-testid="em-name" value={sender.name} onChange={(e) => setSender({ ...sender, name: e.target.value })} style={inp} /></L>
          <L label="Your title"><input value={sender.title} onChange={(e) => setSender({ ...sender, title: e.target.value })} placeholder="e.g. VP, Financial Control" style={inp} /></L>
          <L label="Company"><input value={sender.company} onChange={(e) => setSender({ ...sender, company: e.target.value })} style={inp} /></L>
          <button data-testid="em-ai" disabled={!ctx.ask || busy} onClick={writeAI} style={{ ...btn(), opacity: !ctx.ask || busy ? 0.6 : 1 }}>{busy ? "Writing…" : usedAI ? "Rewrite with AI" : "Write with AI (numbers verified)"}</button>
          {usedAI && <button onClick={() => { setUsedAI(false); setDraft(draftEmail(c, aud, pur, tone, rec)); }} style={btn()}>Back to the standard draft</button>}
          <L label="Subject"><input data-testid="em-subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} style={inp} /></L>
          <L label="Opening summary (editable)"><textarea value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} rows={4} style={{ ...inp, padding: 6 }} /></L>
        </div>
        <div style={{ flex: "2 1 420px", minWidth: 0 }}>
          {draft.unverified.length > 0 && <div data-testid="em-unverified" style={{ ...card, borderColor: V.bad, color: V.bad, fontSize: 12.5, marginBottom: 8 }}>⚠ The AI used numbers not found in your data: {draft.unverified.join(", ")}. Edit them or go back to the standard draft before sending.</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <button data-testid="em-copy" onClick={() => copyAndOpen("")} style={btn(true)}>Copy for Gmail / Outlook</button>
            <button data-testid="em-gmail" onClick={() => copyAndOpen("gmail")} style={btn()}>Copy & open Gmail</button>
            <button data-testid="em-outlook" onClick={() => copyAndOpen("outlook")} style={btn()}>Copy & open Outlook</button>
            <button onClick={async () => { try { await navigator.clipboard.writeText(html); ctx.toast("HTML code copied.", "success"); } catch { ctx.toast("Copy blocked; use Download.", "warning"); } }} style={btn()}>Copy HTML code</button>
            <button onClick={() => dl("email.html", new Blob(["<html><head><meta charset='utf-8'><title>" + draft.subject + "</title></head><body>" + html + "</body></html>"], { type: "text/html" }))} style={btn()}>Download</button>
          </div>
          <div style={{ fontSize: 12, color: V.text3, marginBottom: 4 }}>Subject: <b style={{ color: V.text }}>{draft.subject}</b></div>
          <div data-testid="em-preview" ref={previewRef} style={{ background: "#ffffff", color: "#1f2937", borderRadius: 10, padding: 18, border: "1px solid #e2e8f0", overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  </div>;
}

// ── DATA APP: interactive dashboard with outputs ──
export function DataApp({ ctx, onClose }: { ctx: InsightCtx; onClose: () => void }) {
  const t0 = useMemo(() => toTable(ctx.getValues()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const p0 = useMemo(() => profile(t0), [t0]); const cat = categoryCols(p0)[0], dc = dateCol(p0), nums = numericCols(p0);
  const [filter, setFilter] = useState<string[]>([]); const [month, setMonth] = useState(""); const [vc, setVc] = useState(nums[0]?.index ?? -1); const [busy, setBusy] = useState(""); const [mail, setMail] = useState(false);
  const t = useMemo<Table>(() => ({ ...t0, rows: t0.rows.filter((r) => (!cat || !filter.length || filter.includes(String(r[cat.index] ?? "").trim())) && (!dc || !month || toMonth(r[dc.index]) === month)) }), [t0, filter, month, cat, dc]);
  const m = useMemo(() => buildApp(t, profile(t), { filter: [], valueCol: vc }, ctx.workbookName), [t, vc, ctx.workbookName]);
  const val = vc >= 0 ? t0.headers[vc] : "Rows"; const scope = (filter.length && cat ? cat.name + ": " + filter.join(", ") : "all " + (cat ? cat.name + "s" : "data")) + (month ? ", " + month : "");
  const catIdx = cat ? cat.index : -1; const byCatRaw = cat && vc >= 0 ? groupBy(t, catIdx, vc, "sum").sort((a, b) => b.value - a.value).slice(0, 12) : [];
  const byCat: ChartData | null = byCatRaw.length ? { title: val + " by " + cat!.name, categories: byCatRaw.map((x) => x.key), series: [{ name: val, values: byCatRaw.map((x) => x.value) }], xLabel: cat!.name, yLabel: val, total: byCatRaw.reduce((a, b) => a + b.value, 0) } : null;
  const byMonth: ChartData | null = m.byMonth.length > 1 ? { title: val + " by month", categories: m.byMonth.map((x) => x.key), series: [{ name: val, values: m.byMonth.map((x) => x.value) }], xLabel: "Month", yLabel: val, total: m.byMonth.reduce((a, b) => a + b.value, 0) } : null;
  // Drill-down copies keep dates as dates (serial numbers go back to ISO text; the new sheet formats them).
  const asDates = (r: Cell[]) => r.map((v, i) => (t0.types[i] === "date" && typeof v === "number" ? serialToIso(v) : v));
  const drill = (key: string) => { if (!cat) return; const rows = t.rows.filter((r) => String(r[cat.index] ?? "").trim() === key).map(asDates); ctx.addSheet(key.slice(0, 20), [t.headers, ...rows], { headerRows: [0], freezeRows: 1 }); ctx.toast("Opened " + rows.length.toLocaleString("en-IN") + " rows for “" + key + "” in a new sheet.", "success"); };
  const items: BasketItem[] = ctx.basket.length ? ctx.basket : ([byCat && { id: "a1", title: byCat.title, why: "Where " + val + " comes from.", type: "column" as ChartType, data: byCat }, byMonth && { id: "a2", title: byMonth.title, why: "How " + val + " moves over time.", type: "area" as ChartType, data: byMonth }, byCat && byCat.categories.length <= 8 && { id: "a3", title: "Share of " + val, why: "How concentrated it is.", type: "doughnut" as ChartType, data: { ...byCat, title: "Share of " + val } }].filter(Boolean) as BasketItem[]);
  const build = async (k: "pdf" | "ppt") => { setBusy(k); try { const r = await makeReport(t, items, ctx.workbookName + " — " + scope, scope); if (k === "pdf") await downloadPdf(r); else await downloadPpt(r); ctx.toast((k === "pdf" ? "PDF" : "PowerPoint") + " downloaded.", "success"); } catch (e: any) { ctx.toast("Could not build: " + (e?.message || e), "warning"); } setBusy(""); };
  return <div data-testid="data-app" role="dialog" aria-label="Data app" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--oiq-bg)", overflowY: "auto", color: V.text }}>
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "14px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}><div><div style={{ fontSize: 20, fontWeight: 800 }}>{ctx.workbookName} — dashboard</div><div style={{ fontSize: 12.5, color: V.text3 }}>{t.rows.length.toLocaleString("en-IN")} rows · {scope}{t0.excludedTotals ? " · " + t0.excludedTotals + " total row(s) excluded so nothing is counted twice" : ""}. Click a bar or slice to open those rows as a new sheet.</div></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button data-testid="app-email" onClick={() => setMail(true)} style={btn(true)}>Business email</button><button data-testid="app-pdf" disabled={!!busy} onClick={() => build("pdf")} style={btn()}>{busy === "pdf" ? "Building…" : "PDF report"}</button><button data-testid="app-ppt" disabled={!!busy} onClick={() => build("ppt")} style={btn()}>{busy === "ppt" ? "Building…" : "PowerPoint"}</button><button data-testid="app-close" onClick={onClose} style={btn()}>Close</button></div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0", alignItems: "center" }}>
        {cat && <><span style={{ fontSize: 12, color: V.text3 }}>{cat.name}:</span>{(cat.top || []).slice(0, 15).map((x) => x.value).map((v) => <button key={v} data-testid={"app-f-" + v} aria-pressed={filter.includes(v)} onClick={() => setFilter(filter.includes(v) ? filter.filter((y) => y !== v) : [...filter, v])} style={{ ...btn(filter.includes(v)), minHeight: 28, fontWeight: 600 }}>{v}</button>)}{filter.length > 0 && <button onClick={() => setFilter([])} style={{ ...btn(), minHeight: 28 }}>Clear</button>}</>}
        {dc && <select aria-label="Month" data-testid="app-month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inp, width: "auto" }}><option value="">All months</option>{groupBy(t0, dc.index, -1, "count", true).map((x) => x.key).filter((k) => k !== "(no date)").sort().map((k) => <option key={k}>{k}</option>)}</select>}
        {nums.length > 1 && <select aria-label="Measure" value={vc} onChange={(e) => setVc(Number(e.target.value))} style={{ ...inp, width: "auto" }}>{nums.map((c) => <option key={c.index} value={c.index}>{c.name}</option>)}</select>}
      </div>
      <div data-testid="app-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>{m.kpis.map((k) => <div key={k.label} style={{ ...card, padding: "12px 14px", borderLeft: "4px solid " + V.accent }}><div style={{ fontSize: 11.5, color: V.text3, textTransform: "uppercase", letterSpacing: 0.3 }}>{k.label}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtNum(k.value)}</div></div>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 12, marginTop: 12 }}>
        {byCat && <div data-testid="app-bar" style={card}><EChart data={byCat} type="column" height={300} onPick={drill} testid="app-bar-chart" /></div>}
        {byMonth && <div style={card}><EChart data={byMonth} type="area" height={300} testid="app-trend-chart" /></div>}
        {byCat && byCat.categories.length <= 10 && <div style={card}><EChart data={{ ...byCat, title: "Share of " + val }} type="doughnut" height={300} onPick={drill} testid="app-share-chart" /></div>}
      </div>
      <div style={{ ...card, marginTop: 12, overflowX: "auto" }}><div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Rows ({Math.min(50, m.matched)} of {m.matched.toLocaleString("en-IN")})</div>
        <table data-testid="app-table" style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 600, width: "100%" }}><thead><tr>{t.headers.slice(0, 10).map((h) => <th key={h} style={{ textAlign: "left", padding: "5px 6px", background: "#11264A", color: "#fff" }}>{h}</th>)}</tr></thead>
          <tbody>{m.rows.map((r, i) => <tr key={i} style={{ background: i % 2 ? V.surface2 : "transparent" }}>{r.slice(0, 10).map((v, j) => <td key={j} style={{ padding: "4px 6px", textAlign: typeof v === "number" ? "right" : "left" }}>{typeof v === "number" ? fmtNum(v) : String(v ?? "")}</td>)}</tr>)}</tbody></table></div>
    </div>
    {mail && <EmailComposer ctx={{ ...ctx, basket: items }} t={t} scope={scope} onClose={() => setMail(false)} />}
  </div>;
}
