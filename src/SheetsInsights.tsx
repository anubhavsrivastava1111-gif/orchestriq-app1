import React, { useMemo, useState } from "react";
import type { Cell } from "./lib/SheetsEngine";
import { toTable, profile, facts, numericCols, categoryCols, dateCol, groupBy, pivot, pivotSheetRows, parseQuery, runQuery, parseNarrative, analysisSheetRows, emailHtml, emailText, buildApp, reportBlocks, fmtNum, pct, ANALYSIS_SYSTEM, ASK_SYSTEM, type Table, type Agg, type PivotSpec, type Narrative, type AppModel } from "./lib/SheetsAnalytics";
import { renderPdf } from "./lib/ProjectReportRender";

// Insight panels for OrchestrIQ Sheets. All numbers are computed by SheetsAnalytics; the AI
// only picks what to compute (validated) or explains computed facts (numbers verified).
const V = { text: "var(--oiq-ink)", text2: "var(--oiq-body)", text3: "var(--oiq-muted)", border: "var(--oiq-border)", surface: "var(--oiq-surface)", surface2: "var(--oiq-surface2)", accent: "var(--oiq-accent)", ok: "var(--oiq-success)", warn: "var(--oiq-warning)", bad: "var(--oiq-danger)" };
const inp: React.CSSProperties = { minHeight: 34, padding: "0 8px", borderRadius: 8, border: "1px solid " + V.border, background: V.surface, color: V.text, fontSize: 12.5, boxSizing: "border-box", width: "100%" };
const btn = (on = false): React.CSSProperties => ({ minHeight: 34, padding: "0 10px", borderRadius: 8, border: "1px solid " + (on ? V.accent : V.border), background: on ? V.accent : V.surface, color: on ? "#fff" : V.text, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" });
const PALETTE = ["#2563EB", "#16A34A", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#DB2777", "#65A30D", "#EA580C", "#475569", "#0D9488", "#9333EA"];
type Ask = (sys: string, msgs: { role: string; content: string }[], maxT?: number) => Promise<string>;
export interface InsightCtx { getValues: () => Cell[][]; sheetName: string; version: number;   // sheetName = real name used in formulas; version = refresh counter
  ask?: Ask; addSheet: (name: string, rows: Cell[][]) => void; toast: (m: string, k?: string) => void; workbookName: string }

function L({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: V.text2 }}>{label}{children}</label>; }
function Note({ kind, children }: { kind: "ok" | "warn" | "bad" | "info"; children: React.ReactNode }) { return <div role="status" style={{ fontSize: 12.5, marginTop: 8, color: kind === "ok" ? V.ok : kind === "warn" ? V.warn : kind === "bad" ? V.bad : V.text3 }}>{children}</div>; }

// ── Charts (pure SVG, theme-aware, no paid libraries) ──
export function Chart({ type, data, title, onPick, height = 220 }: { type: "bar" | "line" | "pie"; data: { key: string; value: number }[]; title?: string; onPick?: (key: string) => void; height?: number }) {
  const W = 520, H = height, pad = { l: 56, r: 12, t: title ? 24 : 10, b: 46 };
  if (!data.length) return <div style={{ fontSize: 12, color: V.text3 }}>No data to chart.</div>;
  if (type === "pie") { const tot = data.reduce((a, b) => a + Math.max(0, b.value), 0) || 1; let ang = -Math.PI / 2; const cx = 130, cy = H / 2 + 6, rad = Math.min(95, H / 2 - 18);
    return <svg data-testid="chart-svg" viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto" }} role="img" aria-label={title || "Pie chart"}>
      {title && <text x={6} y={16} style={{ fill: "var(--oiq-ink)", fontSize: 13, fontWeight: 700 }}>{title}</text>}
      {data.map((d, i) => { const a0 = ang, a1 = ang + (Math.max(0, d.value) / tot) * Math.PI * 2; ang = a1; const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = data.length === 1 ? "M" + (cx - rad) + "," + cy + " a" + rad + "," + rad + " 0 1,0 " + 2 * rad + ",0 a" + rad + "," + rad + " 0 1,0 " + -2 * rad + ",0" : "M" + cx + "," + cy + " L" + (cx + rad * Math.cos(a0)) + "," + (cy + rad * Math.sin(a0)) + " A" + rad + "," + rad + " 0 " + large + ",1 " + (cx + rad * Math.cos(a1)) + "," + (cy + rad * Math.sin(a1)) + " Z";
        return <path key={d.key} d={p} fill={PALETTE[i % PALETTE.length]} style={{ cursor: onPick ? "pointer" : "default" }} onClick={() => onPick && onPick(d.key)}><title>{d.key + ": " + fmtNum(d.value) + " (" + pct(d.value, tot).toFixed(1) + "%)"}</title></path>; })}
      {data.slice(0, 10).map((d, i) => <g key={"l" + d.key}><rect x={260} y={(title ? 26 : 10) + i * 18} width={10} height={10} fill={PALETTE[i % PALETTE.length]} /><text x={276} y={(title ? 35 : 19) + i * 18} style={{ fill: "var(--oiq-body)", fontSize: 11 }}>{(d.key.length > 22 ? d.key.slice(0, 21) + "…" : d.key) + " — " + pct(d.value, tot).toFixed(1) + "%"}</text></g>)}
    </svg>; }
  const max = Math.max(0, ...data.map((d) => d.value)), min = Math.min(0, ...data.map((d) => d.value)), span = max - min || 1; const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const y = (v: number) => pad.t + ih - ((v - min) / span) * ih; const bw = iw / data.length;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + span * f);
  return <svg data-testid="chart-svg" viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto" }} role="img" aria-label={title || "Chart"}>
    {title && <text x={6} y={16} style={{ fill: "var(--oiq-ink)", fontSize: 13, fontWeight: 700 }}>{title}</text>}
    {ticks.map((v, i) => <g key={i}><line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} style={{ stroke: "var(--oiq-border)" }} strokeWidth={0.6} /><text x={pad.l - 6} y={y(v) + 4} textAnchor="end" style={{ fill: "var(--oiq-muted)", fontSize: 10 }}>{Math.abs(v) >= 1e7 ? (v / 1e7).toFixed(1) + "Cr" : Math.abs(v) >= 1e5 ? (v / 1e5).toFixed(1) + "L" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + "k" : fmtNum(v)}</text></g>)}
    {type === "bar" ? data.map((d, i) => { const h = Math.abs(y(d.value) - y(0)); return <rect key={d.key} data-key={d.key} x={pad.l + i * bw + bw * 0.15} y={Math.min(y(d.value), y(0))} width={bw * 0.7} height={Math.max(1, h)} fill={PALETTE[0]} rx={2} style={{ cursor: onPick ? "pointer" : "default" }} onClick={() => onPick && onPick(d.key)}><title>{d.key + ": " + fmtNum(d.value)}</title></rect>; })
      : <polyline fill="none" stroke={PALETTE[0]} strokeWidth={2} points={data.map((d, i) => (pad.l + i * bw + bw / 2) + "," + y(d.value)).join(" ")} />}
    {type === "line" && data.map((d, i) => <circle key={d.key} cx={pad.l + i * bw + bw / 2} cy={y(d.value)} r={3} fill={PALETTE[0]}><title>{d.key + ": " + fmtNum(d.value)}</title></circle>)}
    {data.map((d, i) => (data.length <= 14 || i % Math.ceil(data.length / 14) === 0) && <text key={"x" + d.key} x={pad.l + i * bw + bw / 2} y={H - pad.b + 14} textAnchor="middle" style={{ fill: "var(--oiq-muted)", fontSize: 10 }}>{d.key.length > 10 ? d.key.slice(0, 9) + "…" : d.key}</text>)}
  </svg>;
}

const useTable = (ctx: InsightCtx, tick: number) => useMemo(() => { const t = toTable(ctx.getValues()); return { t, p: profile(t) }; }, [tick, ctx.version]); // eslint-disable-line react-hooks/exhaustive-deps

// ── Analyze (Gemini-style, with verified numbers) ──
export function AnalyzePanel({ ctx, onOpenApp }: { ctx: InsightCtx; onOpenApp: () => void }) {
  const [tick, setTick] = useState(0); const { t, p } = useTable(ctx, tick); const fs = useMemo(() => facts(t, p), [t, p]);
  const [nar, setNar] = useState<Narrative | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const runAI = async () => { if (!ctx.ask) return; setBusy(true); setErr(""); try { const r = await ctx.ask(ANALYSIS_SYSTEM, [{ role: "user", content: "Sheet: " + ctx.sheetName + "\nColumns: " + t.headers.join(", ") + "\nFACTS:\n" + fs.map((f) => "- " + f.text).join("\n") }], 1500); const n = parseNarrative(r, fs); if (!n) setErr("The AI's reply could not be read. Try again."); setNar(n); } catch (e: any) { setErr("AI request failed: " + (e?.message || e)); } setBusy(false); };
  if (!p.rows) return <Note kind="info">This sheet has no data rows yet. Put a header row in row 1 and data below it.</Note>;
  return <div data-testid="an-panel">
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
      <button data-testid="an-refresh" onClick={() => { setTick((x) => x + 1); setNar(null); }} style={btn()}>Re-analyse</button>
      <button data-testid="an-ai" disabled={!ctx.ask || busy} onClick={runAI} style={{ ...btn(true), opacity: !ctx.ask || busy ? 0.6 : 1 }}>{busy ? "Writing insights…" : "AI insights"}</button>
      <button data-testid="an-sheet" onClick={() => { ctx.addSheet("Analysis", analysisSheetRows(t, p, ctx.sheetName)); ctx.toast("Analysis sheet created with live formulas.", "success"); }} style={btn()}>Create analysis sheet</button>
      <button data-testid="an-app" onClick={onOpenApp} style={btn()}>Build an app from this data</button>
    </div>
    <div style={{ fontWeight: 800, fontSize: 13 }}>What the data says (computed from all {p.rows.toLocaleString("en-IN")} rows)</div>
    <ul data-testid="an-facts" style={{ margin: "4px 0 8px", paddingLeft: 18, fontSize: 12.5, color: V.text2 }}>{fs.map((f) => <li key={f.id}>{f.text}</li>)}</ul>
    {err && <Note kind="bad">{err}</Note>}
    {nar && <div data-testid="an-narrative" style={{ border: "1px solid " + V.border, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>{nar.headline}</div>
      {[["Insights", nar.insights], ["Recommendations", nar.recommendations]].map(([h, list]: any) => list.length ? <div key={h}><div style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>{h}</div><ul style={{ margin: "2px 0", paddingLeft: 18, fontSize: 12.5, color: V.text2 }}>{list.map((x: any, i: number) => <li key={i}>{x.text}{x.unverified.length > 0 && <span data-testid="an-unverified" style={{ color: V.bad, fontWeight: 700 }}> ⚠ unverified number: {x.unverified.join(", ")}</span>}</li>)}</ul></div> : null)}
      {nar.questions.length > 0 && <div style={{ fontSize: 12, color: V.text3, marginTop: 4 }}>Worth asking next: {nar.questions.join(" · ")}</div>}
      <Note kind="info">Every number in the AI's text is checked against the computed facts; anything not found is marked ⚠.</Note>
    </div>}
  </div>;
}

// ── Ask your data ──
export function AskPanel({ ctx }: { ctx: InsightCtx }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [out, setOut] = useState<any>(null); const [err, setErr] = useState("");
  const go = async () => { if (!ctx.ask || !q.trim()) return; setBusy(true); setErr(""); setOut(null);
    try { const t = toTable(ctx.getValues()); const prof = profile(t);
      const cols = prof.columns.map((c) => c.name + " (" + c.type + (c.top ? "; e.g. " + c.top.slice(0, 5).map((x) => x.value).join(", ") : "") + ")").join("\n");
      const r = await ctx.ask(ASK_SYSTEM, [{ role: "user", content: "Columns:\n" + cols + "\n\nQuestion: " + q.trim() }], 600); const pq = parseQuery(r, t);
      if (pq.error) setErr(pq.error); else if (pq.explain) setOut({ explain: pq.explain }); else setOut({ ...runQuery(t, pq.query!), q: pq.query });
    } catch (e: any) { setErr("AI request failed: " + (e?.message || e)); } setBusy(false); };
  return <div data-testid="ask-panel">
    <textarea data-testid="ask-q" value={q} onChange={(e) => setQ(e.target.value)} rows={2} placeholder="e.g. Which region had the highest sales in March for product A?" style={{ ...inp, minHeight: 56, padding: 8 }} />
    <button data-testid="ask-go" disabled={!ctx.ask || busy || !q.trim()} onClick={go} style={{ ...btn(true), width: "100%", marginTop: 6, opacity: !ctx.ask || busy || !q.trim() ? 0.6 : 1 }}>{busy ? "Working…" : "Ask"}</button>
    <Note kind="info">The AI only decides what to calculate; the numbers are computed from every row.</Note>
    {err && <Note kind="bad">{err}</Note>}
    {out?.explain && <div style={{ fontSize: 13, color: V.text2, marginTop: 8, whiteSpace: "pre-wrap" }}>{out.explain}</div>}
    {out?.rows && <div data-testid="ask-out" style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>{out.title}</div><div data-testid="ask-summary" style={{ fontSize: 12.5, color: V.text2, margin: "2px 0 6px" }}>{out.summary}</div>
      {out.rows.length > 1 && <Chart type={out.q?.byMonth ? "line" : "bar"} data={out.rows.map((r: any) => ({ key: r[0], value: r[1] }))} />}
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}><tbody>{out.rows.map((r: any) => <tr key={r[0]}><td style={{ padding: "3px 6px", borderBottom: "1px solid " + V.border }}>{r[0]}</td><td style={{ padding: "3px 6px", borderBottom: "1px solid " + V.border, textAlign: "right" }}>{fmtNum(r[1])}</td></tr>)}</tbody></table>
      <button data-testid="ask-sheet" onClick={() => { ctx.addSheet("Answer", [[out.title], [], [out.q?.groupBy || "Item", (out.q?.agg || "value") + (out.q?.value ? " of " + out.q.value : "")], ...out.rows]); ctx.toast("Answer copied to a new sheet.", "success"); }} style={{ ...btn(), marginTop: 6 }}>Copy answer to a new sheet</button>
    </div>}
  </div>;
}

// ── Pivot table ──
export function PivotPanel({ ctx }: { ctx: InsightCtx }) {
  const t = useMemo(() => toTable(ctx.getValues()), [ctx.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = useMemo(() => profile(t), [t]); const nums = numericCols(p), cats = [...categoryCols(p), ...p.columns.filter((c) => c.type === "date")];
  const [s, setS] = useState<PivotSpec>({ rows: cats[0]?.name || t.headers[0] || "", cols: "", value: nums[0]?.name || "", agg: nums[0] ? "sum" : "count", byMonth: false });
  const res: any = useMemo(() => (s.rows ? pivot(t, { ...s, cols: s.cols || undefined, value: s.value || undefined }) : { error: "Choose rows." }), [t, s]);
  const isDate = t.types[t.headers.indexOf(s.rows)] === "date";
  return <div data-testid="pv-panel">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      <L label="Rows"><select data-testid="pv-rows" value={s.rows} onChange={(e) => setS({ ...s, rows: e.target.value, byMonth: t.types[t.headers.indexOf(e.target.value)] === "date" })} style={inp}>{t.headers.map((h) => <option key={h}>{h}</option>)}</select></L>
      <L label="Columns (optional)"><select data-testid="pv-cols" value={s.cols} onChange={(e) => setS({ ...s, cols: e.target.value })} style={inp}><option value="">(none)</option>{t.headers.filter((h) => h !== s.rows).map((h) => <option key={h}>{h}</option>)}</select></L>
      <L label="Values"><select data-testid="pv-value" value={s.value} onChange={(e) => setS({ ...s, value: e.target.value })} style={inp}><option value="">(count rows)</option>{nums.map((c) => <option key={c.name}>{c.name}</option>)}</select></L>
      <L label="Summarise by"><select data-testid="pv-agg" value={s.agg} onChange={(e) => setS({ ...s, agg: e.target.value as Agg })} style={inp}>{(["sum", "count", "avg", "min", "max"] as Agg[]).map((a) => <option key={a} value={a}>{({ sum: "Sum", count: "Count", avg: "Average", min: "Min", max: "Max" } as any)[a]}</option>)}</select></L>
    </div>
    {isDate && <label style={{ fontSize: 12, color: V.text2, display: "block", marginTop: 6 }}><input type="checkbox" checked={!!s.byMonth} onChange={(e) => setS({ ...s, byMonth: e.target.checked })} /> Group dates by month</label>}
    {"error" in res ? <Note kind="warn">{res.error}</Note> : <div data-testid="pv-preview" style={{ marginTop: 8, overflowX: "auto" }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 4 }}>{res.title} — {res.rowKeys.length} row(s){res.colKeys.length > 1 ? " × " + res.colKeys.length + " column(s)" : ""}</div>
      <table style={{ borderCollapse: "collapse", fontSize: 11.5 }}><thead><tr><th style={{ padding: "3px 6px", textAlign: "left", borderBottom: "1px solid " + V.border }}>{s.rows}</th>{(s.cols ? res.colKeys : ["Value"]).slice(0, 8).map((k: string) => <th key={k} style={{ padding: "3px 6px", textAlign: "right", borderBottom: "1px solid " + V.border }}>{k}</th>)}{s.cols && <th style={{ padding: "3px 6px", textAlign: "right", borderBottom: "1px solid " + V.border }}>Total</th>}</tr></thead>
        <tbody>{res.rowKeys.slice(0, 12).map((k: string, i: number) => <tr key={k}><td style={{ padding: "3px 6px" }}>{k}</td>{(s.cols ? res.cells[i] : [res.cells[i][0]]).slice(0, 8).map((v: number, j: number) => <td key={j} style={{ padding: "3px 6px", textAlign: "right" }}>{fmtNum(v)}</td>)}{s.cols && <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700 }}>{fmtNum(res.rowTotals[i])}</td>}</tr>)}
          <tr><td style={{ padding: "3px 6px", fontWeight: 800 }}>Total</td>{(s.cols ? res.colTotals : [res.grand]).slice(0, 8).map((v: number, j: number) => <td key={j} style={{ padding: "3px 6px", textAlign: "right", fontWeight: 800 }}>{fmtNum(v)}</td>)}{s.cols && <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 800 }}>{fmtNum(res.grand)}</td>}</tr></tbody></table>
      {res.rowKeys.length > 12 && <Note kind="info">Showing 12 of {res.rowKeys.length} rows; the sheet will contain all of them.</Note>}
      <button data-testid="pv-create" onClick={() => { const ps = pivotSheetRows(t, { ...s, cols: s.cols || undefined, value: s.value || undefined }, res, ctx.sheetName); ctx.addSheet("Pivot", ps.rows); ctx.toast(ps.note, ps.live ? "success" : "info"); }} style={{ ...btn(true), marginTop: 8 }}>Create pivot sheet</button>
      <Note kind="info">Pivot sheets use live SUMIFS / COUNTIFS formulas when practical, so they update when the data changes.</Note>
    </div>}
  </div>;
}

// ── Chart builder ──
export function ChartPanel({ ctx }: { ctx: InsightCtx }) {
  const t = useMemo(() => toTable(ctx.getValues()), [ctx.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = useMemo(() => profile(t), [t]); const nums = numericCols(p); const dims = [...categoryCols(p), ...p.columns.filter((c) => c.type === "date")];
  const [x, setX] = useState(dims[0]?.name || t.headers[0] || ""); const [yv, setY] = useState(nums[0]?.name || ""); const [agg, setAgg] = useState<Agg>("sum"); const [type, setType] = useState<"bar" | "line" | "pie">("bar");
  const xi = t.headers.indexOf(x), yi = t.headers.indexOf(yv); const byMonth = t.types[xi] === "date";
  const data = useMemo(() => (xi < 0 ? [] : groupBy(t, xi, yi, yv ? agg : "count", byMonth).sort((a, b) => (byMonth ? a.key.localeCompare(b.key) : b.value - a.value)).slice(0, byMonth ? 60 : 15)), [t, xi, yi, agg, byMonth, yv]);
  const svgRef = React.useRef<HTMLDivElement>(null);
  const png = () => { const svg = svgRef.current?.querySelector("svg"); if (!svg) return; const s = new XMLSerializer().serializeToString(svg).replace(/var\(--oiq-[a-z0-9]+\)/g, "#334155");
    const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = 1040; c.height = 440; const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); c.toBlob((b) => { if (!b) return; const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "chart.png"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s); };
  return <div data-testid="ch-panel">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      <L label="Category / date (X)"><select data-testid="ch-x" value={x} onChange={(e) => setX(e.target.value)} style={inp}>{t.headers.map((h) => <option key={h}>{h}</option>)}</select></L>
      <L label="Value (Y)"><select data-testid="ch-y" value={yv} onChange={(e) => setY(e.target.value)} style={inp}><option value="">(count rows)</option>{nums.map((c) => <option key={c.name}>{c.name}</option>)}</select></L>
      <L label="Summarise by"><select value={agg} onChange={(e) => setAgg(e.target.value as Agg)} style={inp}>{(["sum", "avg", "count", "min", "max"] as Agg[]).map((a) => <option key={a} value={a}>{a}</option>)}</select></L>
      <L label="Chart type"><select data-testid="ch-type" value={type} onChange={(e) => setType(e.target.value as any)} style={inp}><option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option></select></L>
    </div>
    <div ref={svgRef} style={{ marginTop: 8 }}><Chart type={type} data={data} title={(yv ? agg + " of " + yv : "Rows") + " by " + x + (byMonth ? " (month)" : "")} /></div>
    <button onClick={png} style={{ ...btn(), marginTop: 6 }}>Download chart (PNG)</button>
  </div>;
}

// ── Data App: auto-built dashboard with filters, drill-down and outputs ──
async function loadScript(src: string) { if (document.querySelector('script[src="' + src + '"]')) return; await new Promise<void>((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s); }); }
function dl(name: string, blob: Blob) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); }

export function DataApp({ ctx, onClose }: { ctx: InsightCtx; onClose: () => void }) {
  const t = useMemo(() => toTable(ctx.getValues()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = useMemo(() => profile(t), [t]); const fs = useMemo(() => facts(t, p), [t, p]);
  const [filter, setFilter] = useState<string[]>([]); const [month, setMonth] = useState(""); const [valueCol, setValueCol] = useState<number | undefined>(undefined);
  const m: AppModel = useMemo(() => buildApp(t, p, { filter, month: month || undefined, valueCol }, ctx.workbookName + " — data app"), [t, p, filter, month, valueCol, ctx.workbookName]);
  const [email, setEmail] = useState<string | null>(null); const [aud, setAud] = useState("Leadership team"); const [sender, setSender] = useState("Regards,\nAnalytics team"); const [busy, setBusy] = useState("");
  const cat = m.filterCol >= 0 ? t.headers[m.filterCol] : ""; const val = m.valueCol >= 0 ? t.headers[m.valueCol] : "";
  const insights = fs.filter((f) => f.id !== "size").slice(0, 5).map((f) => f.text);
  const tot = m.byCategory.reduce((a, b) => a + b.value, 0);
  const actions = [m.byCategory[0] ? "Review what drives " + m.byCategory[0].key + " (" + pct(m.byCategory[0].value, tot).toFixed(1) + "% of " + val + ") and whether it can be replicated." : "", m.byCategory.length > 2 ? "Investigate the lowest " + cat + ": " + m.byCategory[m.byCategory.length - 1].key + "." : "", p.duplicateRows ? "Remove " + p.duplicateRows + " duplicate rows before final reporting." : ""].filter(Boolean);
  const scope = (filter.length ? cat + ": " + filter.join(", ") : "all " + cat + "s") + (month ? ", " + month : "");
  const emailInput = { subject: m.title, audience: aud, salutation: "Dear " + aud + ",", intro: "Please find below the key figures and insights from " + ctx.workbookName + " (" + m.matched.toLocaleString("en-IN") + " rows, " + scope + ").",
    kpis: m.kpis.map((k) => ({ label: k.label, value: fmtNum(k.value) })), insights, tableHead: [cat || "Item", val, "Share"], tableRows: m.byCategory.slice(0, 10).map((x) => [x.key, x.value, pct(x.value, tot).toFixed(1) + "%"] as Cell[]), actions, closing: sender.split("\n")[0] || "Regards,", sender: sender.split("\n").slice(1).join(" ") };
  const drill = (key: string) => { const rows = t.rows.filter((r) => String(r[m.filterCol] ?? "").trim() === key); ctx.addSheet(key.slice(0, 20), [t.headers, ...rows]); ctx.toast("Opened " + rows.length.toLocaleString("en-IN") + " rows for “" + key + "” in a new sheet.", "success"); };
  const pdf = async () => { setBusy("pdf"); try { const w: any = window; if (!w.jspdf?.jsPDF) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"); if (!w.jspdf?.jsPDF?.API?.autoTable) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
      const d = renderPdf(w.jspdf.jsPDF, reportBlocks(m.title, m, t, insights, actions) as any); dl("Data-report.pdf", d.output("blob")); ctx.toast("PDF downloaded.", "success"); } catch (e: any) { ctx.toast("PDF failed: " + (e?.message || e), "warning"); } setBusy(""); };
  const ppt = async () => { setBusy("ppt"); try { const w: any = window; if (!w.PptxGenJS) await loadScript("https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"); const P = new w.PptxGenJS(); P.layout = "LAYOUT_WIDE";
      const navy = "11264A"; const title = (s: any, txt: string) => s.addText(txt, { x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontSize: 24, bold: true, color: navy });
      let s = P.addSlide(); s.background = { color: navy }; s.addText(m.title, { x: 0.6, y: 2.4, w: 12, h: 1, fontSize: 34, bold: true, color: "FFFFFF" }); s.addText(m.matched.toLocaleString("en-IN") + " rows · " + scope + " · " + new Date().toLocaleDateString("en-IN"), { x: 0.6, y: 3.5, w: 12, h: 0.5, fontSize: 16, color: "D6DEEA" });
      s = P.addSlide(); title(s, "Key figures"); m.kpis.forEach((k, i) => { s.addShape(P.ShapeType.roundRect, { x: 0.5 + i * 2.5, y: 1.4, w: 2.3, h: 1.4, fill: { color: "F1F5F9" }, line: { color: "E2E8F0" }, rectRadius: 0.1 }); s.addText([{ text: k.label + "\n", options: { fontSize: 11, color: "64748B" } }, { text: fmtNum(k.value), options: { fontSize: 20, bold: true, color: navy } }], { x: 0.55 + i * 2.5, y: 1.45, w: 2.2, h: 1.3, align: "center", valign: "middle" }); });
      if (insights.length) s.addText(insights.map((x) => ({ text: x, options: { bullet: true } })), { x: 0.6, y: 3.2, w: 12, h: 3.6, fontSize: 14, color: "1F2937" });
      if (m.byCategory.length) { s = P.addSlide(); title(s, val + " by " + cat); s.addChart(P.ChartType.bar, [{ name: val, labels: m.byCategory.map((x) => x.key), values: m.byCategory.map((x) => x.value) }], { x: 0.6, y: 1.1, w: 12, h: 5.8, barDir: "col", chartColors: ["2563EB"], showValue: m.byCategory.length <= 10, dataLabelFormatCode: "#,##0" }); }
      if (m.byMonth.length > 1) { s = P.addSlide(); title(s, val + " by month"); s.addChart(P.ChartType.line, [{ name: val, labels: m.byMonth.map((x) => x.key), values: m.byMonth.map((x) => x.value) }], { x: 0.6, y: 1.1, w: 12, h: 5.8, chartColors: ["16A34A"], lineDataSymbol: "circle" }); }
      if (actions.length) { s = P.addSlide(); title(s, "Recommended next steps"); s.addText(actions.map((x) => ({ text: x, options: { bullet: { type: "number" } } })), { x: 0.6, y: 1.2, w: 12, h: 5, fontSize: 16, color: "1F2937" }); }
      await P.writeFile({ fileName: "Data-presentation.pptx" }); ctx.toast("PowerPoint downloaded (charts are editable in PowerPoint).", "success"); } catch (e: any) { ctx.toast("PowerPoint failed: " + (e?.message || e), "warning"); } setBusy(""); };
  const copyHtml = async () => { const html = emailHtml(emailInput); try { const w: any = window; if (w.ClipboardItem && navigator.clipboard?.write) await navigator.clipboard.write([new w.ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([emailText(emailInput)], { type: "text/plain" }) })]); else await navigator.clipboard.writeText(html); ctx.toast("Email copied — paste it into Gmail or Outlook.", "success"); } catch { ctx.toast("Copy blocked by the browser; use Download instead.", "warning"); } };
  return <div data-testid="data-app" role="dialog" aria-label="Data app" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--oiq-bg)", overflowY: "auto", color: V.text }}>
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}><div><div style={{ fontSize: 20, fontWeight: 800 }}>{m.title}</div><div style={{ fontSize: 12.5, color: V.text3 }}>Built automatically from {t.rows.length.toLocaleString("en-IN")} rows{t.excludedTotals ? " (" + t.excludedTotals + " total row" + (t.excludedTotals > 1 ? "s" : "") + " excluded so nothing is counted twice)" : ""}. Click a bar to open those rows as a new sheet.</div></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button data-testid="app-email" onClick={() => setEmail(emailHtml(emailInput))} style={btn(true)}>Create email</button><button data-testid="app-pdf" disabled={!!busy} onClick={pdf} style={btn()}>{busy === "pdf" ? "Preparing…" : "PDF report"}</button><button data-testid="app-ppt" disabled={!!busy} onClick={ppt} style={btn()}>{busy === "ppt" ? "Preparing…" : "PowerPoint"}</button><button data-testid="app-close" onClick={onClose} style={btn()}>Close</button></div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {m.filterCol >= 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}><span style={{ fontSize: 12, color: V.text3 }}>{cat}:</span>{m.filterValues.slice(0, 15).map((v) => <button key={v} data-testid={"app-f-" + v} aria-pressed={filter.includes(v)} onClick={() => setFilter(filter.includes(v) ? filter.filter((x) => x !== v) : [...filter, v])} style={{ ...btn(filter.includes(v)), minHeight: 28, fontWeight: 600 }}>{v}</button>)}{filter.length > 0 && <button onClick={() => setFilter([])} style={{ ...btn(), minHeight: 28 }}>Clear</button>}</div>}
        {m.dateCol >= 0 && <select aria-label="Month" data-testid="app-month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inp, width: "auto" }}><option value="">All months</option>{groupBy(t, m.dateCol, -1, "count", true).map((x) => x.key).filter((k) => k !== "(no date)").sort().map((k) => <option key={k}>{k}</option>)}</select>}
        {numericCols(p).length > 1 && <select aria-label="Measure" value={m.valueCol} onChange={(e) => setValueCol(Number(e.target.value))} style={{ ...inp, width: "auto" }}>{numericCols(p).map((c) => <option key={c.index} value={c.index}>{c.name}</option>)}</select>}
      </div>
      <div data-testid="app-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>{m.kpis.map((k) => <div key={k.label} style={{ border: "1px solid " + V.border, borderRadius: 12, padding: "10px 12px", background: V.surface }}><div style={{ fontSize: 11.5, color: V.text3 }}>{k.label}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{fmtNum(k.value)}</div></div>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, marginTop: 12 }}>
        {m.byCategory.length > 0 && <div data-testid="app-bar" style={{ border: "1px solid " + V.border, borderRadius: 12, padding: 10, background: V.surface }}><Chart type="bar" data={m.byCategory} title={val + " by " + cat} onPick={drill} /></div>}
        {m.byMonth.length > 1 && <div style={{ border: "1px solid " + V.border, borderRadius: 12, padding: 10, background: V.surface }}><Chart type="line" data={m.byMonth} title={val + " by month"} /></div>}
        {m.byCategory.length > 1 && <div style={{ border: "1px solid " + V.border, borderRadius: 12, padding: 10, background: V.surface }}><Chart type="pie" data={m.byCategory.slice(0, 8)} title={"Share of " + val} onPick={drill} /></div>}
      </div>
      <div style={{ border: "1px solid " + V.border, borderRadius: 12, padding: 10, background: V.surface, marginTop: 12, overflowX: "auto" }}><div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Rows ({Math.min(50, m.matched)} of {m.matched.toLocaleString("en-IN")})</div>
        <table data-testid="app-table" style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 600 }}><thead><tr>{t.headers.slice(0, 10).map((h) => <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid " + V.border, color: V.text3 }}>{h}</th>)}</tr></thead>
          <tbody>{m.rows.map((r, i) => <tr key={i}>{r.slice(0, 10).map((v, j) => <td key={j} style={{ padding: "3px 6px", borderBottom: "1px solid " + V.border, textAlign: typeof v === "number" ? "right" : "left" }}>{typeof v === "number" ? fmtNum(v) : String(v ?? "")}</td>)}</tr>)}</tbody></table></div>
      {email !== null && <div data-testid="app-email-box" style={{ border: "2px solid " + V.accent, borderRadius: 12, padding: 12, background: V.surface, marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}><L label="Audience"><input data-testid="app-aud" value={aud} onChange={(e) => { setAud(e.target.value); }} style={inp} /></L><L label="Closing and sender (line 1 = closing)"><textarea value={sender} onChange={(e) => setSender(e.target.value)} rows={2} style={{ ...inp, padding: 6 }} /></L></div>
        <div style={{ fontSize: 12, color: V.text3, margin: "6px 0" }}>Subject: <b style={{ color: V.text }}>{emailInput.subject}</b></div>
        <iframe data-testid="app-email-preview" title="Email preview" srcDoc={"<body style='margin:8px;background:#fff'>" + emailHtml(emailInput) + "</body>"} style={{ width: "100%", height: 360, border: "1px solid " + V.border, borderRadius: 8, background: "#fff" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}><button data-testid="app-copy" onClick={copyHtml} style={btn(true)}>Copy email (paste into Gmail / Outlook)</button>
          <button onClick={() => dl("email.html", new Blob([emailHtml(emailInput)], { type: "text/html" }))} style={btn()}>Download HTML</button>
          <a href={"mailto:?subject=" + encodeURIComponent(emailInput.subject) + "&body=" + encodeURIComponent(emailText(emailInput).slice(0, 1800))} style={{ ...btn(), display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Open in email app (plain text)</a>
          <button onClick={() => setEmail(null)} style={btn()}>Close email</button></div></div>}
    </div>
  </div>;
}
