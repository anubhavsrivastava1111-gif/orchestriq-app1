// SHEETS SMART LAYER - suggestions, chart data, professional chart options, pivot display,
// and an audience-aware business email composer. Pure functions: every number is computed
// from the table; the AI (optional) only writes wording, and its numbers are verified.
import type { Cell } from "./SheetsEngine";
import { toNum, toMonth, groupBy, findCol, numericCols, categoryCols, dateCol, fmtNum, pct, verifyText, type Table, type Profile, type Agg, type Fact, type PivotResult } from "./SheetsAnalytics";

// ── Chart model ──
export type ChartType = "column" | "bar" | "stacked" | "line" | "area" | "doughnut" | "combo";
export interface ChartSpec { type: ChartType; x: string; y: string | null; agg: Agg; split?: string | null; byMonth?: boolean; topN?: number; title?: string }
export interface ChartData { title: string; categories: string[]; series: { name: string; values: number[] }[]; xLabel: string; yLabel: string; total: number }
const aggWord: Record<Agg, string> = { sum: "Total", count: "Count of rows", avg: "Average", min: "Minimum", max: "Maximum" };
const isBlank = (v: Cell) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const keyOf = (v: Cell, month: boolean) => (month ? toMonth(v) || "(no date)" : isBlank(v) ? "(blank)" : String(v).trim());

export function chartTitle(s: ChartSpec): string { return s.title || (s.y ? aggWord[s.agg] + " " + s.y : "Count of rows") + " by " + s.x + (s.split ? " and " + s.split : "") + (s.byMonth ? " (monthly)" : ""); }
export function computeChart(t: Table, s: ChartSpec): ChartData | { error: string } {
  const xi = findCol(t, s.x), yi = s.y ? findCol(t, s.y) : -1, si = s.split ? findCol(t, s.split) : -1;
  if (xi < 0) return { error: "Choose a category or date column for the X axis." }; if (s.y && yi < 0) return { error: "Value column not found." }; if (s.split && si < 0) return { error: "Split column not found." };
  const agg: Agg = yi < 0 ? "count" : s.agg; const month = !!s.byMonth || t.types[xi] === "date";
  const base = groupBy(t, xi, yi, agg, month).filter((g) => g.key !== "(no date)");
  let cats = month ? base.map((g) => g.key).sort() : base.sort((a, b) => b.value - a.value).map((g) => g.key);
  const topN = s.topN && s.topN > 0 && !month ? s.topN : 0; let other = false;
  if (topN && cats.length > topN) { cats = cats.slice(0, topN); other = agg === "sum" || agg === "count"; }
  const total = base.reduce((a, b) => a + b.value, 0);
  if (si < 0) { const m = new Map(base.map((g) => [g.key, g.value])); const values = cats.map((c) => m.get(c) || 0);
    if (other) { cats = [...cats, "Others"]; values.push(total - values.reduce((a, b) => a + b, 0)); }
    return { title: chartTitle(s), categories: cats, series: [{ name: s.y ? aggWord[agg] + " " + s.y : "Rows", values }], xLabel: t.headers[xi], yLabel: s.y || "Rows", total }; }
  // split into series (top 8 series values)
  const sg = groupBy(t, si, yi, agg).sort((a, b) => b.value - a.value).map((g) => g.key).slice(0, 8);
  const acc = new Map<string, { s: number; n: number; mn: number; mx: number }>();
  for (const r of t.rows) { const a = keyOf(r[xi], month), b = keyOf(r[si], false); if (!sg.includes(b)) continue; const v = yi >= 0 ? toNum(r[yi]) : 1; if (agg !== "count" && v === null) continue;
    const k = a + "\u0000" + b; const e = acc.get(k) || { s: 0, n: 0, mn: Infinity, mx: -Infinity }; e.n++; if (v !== null) { e.s += v; e.mn = Math.min(e.mn, v); e.mx = Math.max(e.mx, v); } acc.set(k, e); }
  const val = (e?: { s: number; n: number; mn: number; mx: number }) => (!e ? 0 : agg === "sum" ? e.s : agg === "count" ? e.n : agg === "avg" ? e.s / e.n : agg === "min" ? e.mn : e.mx);
  return { title: chartTitle(s), categories: cats, series: sg.map((b) => ({ name: b, values: cats.map((a) => val(acc.get(a + "\u0000" + b))) })), xLabel: t.headers[xi], yLabel: s.y || "Rows", total };
}

// ── Professional ECharts option (theme-aware) ──
export const PALETTE = ["#2563EB", "#16A34A", "#F59E0B", "#DC2626", "#7C3AED", "#0891B2", "#DB2777", "#65A30D", "#EA580C", "#475569"];
export const shortNum = (v: number) => { const a = Math.abs(v); return a >= 1e7 ? (v / 1e7).toFixed(a >= 1e8 ? 0 : 1) + " Cr" : a >= 1e5 ? (v / 1e5).toFixed(a >= 1e6 ? 0 : 1) + " L" : a >= 1e3 ? (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k" : fmtNum(v); };
export function chartOption(d: ChartData, type: ChartType, opts: { text?: string; muted?: string; grid?: string; animate?: boolean; labels?: boolean; forExport?: boolean } = {}): any {
  const text = opts.text || "#1f2937", muted = opts.muted || "#64748b", grid = opts.grid || "rgba(100,116,139,0.18)";
  const base: any = { color: PALETTE, animation: opts.animate !== false, textStyle: { fontFamily: "Inter, Segoe UI, Arial, sans-serif", color: text },
    title: { text: d.title, left: 4, top: 2, textStyle: { fontSize: opts.forExport ? 16 : 13, fontWeight: 700, color: text } },
    tooltip: { trigger: type === "doughnut" ? "item" : "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: any) => fmtNum(Number(v)) } };
  if (type === "doughnut") { const s = d.series[0]; const tot = s.values.reduce((a, b) => a + b, 0) || 1;
    return { ...base, legend: { type: "scroll", orient: "vertical", right: 6, top: 36, bottom: 8, textStyle: { color: muted, fontSize: opts.forExport ? 15 : 11 }, formatter: (n: string) => { const i = d.categories.indexOf(n); return n + "  " + pct(s.values[i] || 0, tot).toFixed(1) + "%"; } },
      series: [{ type: "pie", radius: ["45%", "72%"], center: ["36%", "56%"], avoidLabelOverlap: true, itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 4 },
        label: { show: true, position: "outside", color: muted, fontSize: opts.forExport ? 14 : 11, formatter: (p: any) => (p.percent >= 4 ? p.percent.toFixed(1) + "%" : "") }, labelLine: { length: 8, length2: 6 },
        data: d.categories.map((c, i) => ({ name: c, value: s.values[i] })) }] }; }
  const horizontal = type === "bar"; const many = d.categories.length > 12;
  const catAxis = { type: "category", data: d.categories, axisLabel: { color: muted, fontSize: opts.forExport ? 15 : 11, interval: many && !horizontal ? "auto" : 0, rotate: !horizontal && d.categories.length > 8 ? 30 : 0, formatter: (v: string) => (v.length > 14 ? v.slice(0, 13) + "\u2026" : v) }, axisLine: { lineStyle: { color: grid } }, axisTick: { show: false } };
  const valAxis = { type: "value", axisLabel: { color: muted, fontSize: opts.forExport ? 14 : 11, formatter: (v: number) => shortNum(v) }, splitLine: { lineStyle: { color: grid } } };
  const showLabels = opts.labels !== false && d.categories.length <= 12 && d.series.length <= 3;
  const series = d.series.map((s, i) => {
    const isLine = type === "line" || type === "area" || (type === "combo" && i > 0);
    return { name: s.name, type: isLine ? "line" : "bar", data: s.values, smooth: isLine, symbolSize: 6, stack: type === "stacked" ? "total" : undefined, barMaxWidth: 46,
      areaStyle: type === "area" ? { opacity: 0.18 } : undefined, itemStyle: isLine ? undefined : { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
      label: { show: showLabels && (type !== "stacked" || d.series.length === 1), position: horizontal ? "right" : "top", color: muted, fontSize: opts.forExport ? 14 : 10, formatter: (p: any) => shortNum(Number(p.value)) } }; });
  if (type === "combo" && d.series.length === 1) { const s = d.series[0]; let run = 0; const tot = s.values.reduce((a, b) => a + b, 0) || 1; series.push({ name: "Cumulative %", type: "line", data: s.values.map((v) => +(((run += v) / tot) * 100).toFixed(1)), smooth: true, symbolSize: 6, yAxisIndex: 1, label: { show: false } } as any); }
  return { ...base, legend: d.series.length > 1 || type === "combo" ? { top: 4, right: 6, textStyle: { color: muted, fontSize: opts.forExport ? 14 : 11 } } : undefined,
    grid: { left: 8, right: type === "combo" ? 44 : 16, top: 44, bottom: 8, containLabel: true },
    xAxis: horizontal ? valAxis : catAxis, yAxis: horizontal ? { ...catAxis, inverse: true } : type === "combo" ? [valAxis, { type: "value", max: 100, axisLabel: { color: muted, formatter: "{value}%" }, splitLine: { show: false } }] : valAxis, series };
}

// ── Smart suggestions (what a good analyst would build first) ──
export interface Suggestion { id: string; title: string; why: string; chart: ChartSpec; pivot?: { rows: string; cols?: string; value?: string; agg: Agg; byMonth?: boolean }; score: number }
export function suggest(t: Table, p: Profile): Suggestion[] {
  const out: Suggestion[] = []; const nums = numericCols(p), cats = categoryCols(p), dc = dateCol(p); const n0 = nums[0], n1 = nums[1], c0 = cats[0], c1 = cats[1];
  const add = (s: Suggestion) => { if (!out.some((x) => x.id === s.id)) out.push(s); };
  if (c0 && n0) add({ id: "by-" + c0.name, title: "Total " + n0.name + " by " + c0.name, why: "Shows which " + c0.name + " drives the most " + n0.name + ".", chart: { type: "column", x: c0.name, y: n0.name, agg: "sum" }, pivot: { rows: c0.name, value: n0.name, agg: "sum" }, score: 100 });
  if (dc && n0) add({ id: "trend", title: n0.name + " trend by month", why: "Reveals growth, decline and seasonality over time.", chart: { type: "area", x: dc.name, y: n0.name, agg: "sum", byMonth: true }, pivot: { rows: dc.name, value: n0.name, agg: "sum", byMonth: true }, score: 96 });
  if (c0 && c1 && n0 && c0.distinct <= 12 && c1.distinct <= 8) add({ id: "matrix", title: n0.name + " by " + c0.name + " and " + c1.name, why: "Cross-tab: which combinations perform best and worst.", chart: { type: "stacked", x: c0.name, y: n0.name, agg: "sum", split: c1.name }, pivot: { rows: c0.name, cols: c1.name, value: n0.name, agg: "sum" }, score: 92 });
  if (c0 && n0 && c0.distinct <= 8) add({ id: "share", title: "Share of " + n0.name + " by " + c0.name, why: "How concentrated " + n0.name + " is: risk and opportunity.", chart: { type: "doughnut", x: c0.name, y: n0.name, agg: "sum" }, score: 88 });
  const high = p.columns.find((c) => c.type === "text" && c.distinct >= 13 && c.distinct <= 2000);
  if (high && n0) add({ id: "top-" + high.name, title: "Top 10 " + high.name + " by " + n0.name, why: "The few that matter most (Pareto view with cumulative %).", chart: { type: "combo", x: high.name, y: n0.name, agg: "sum", topN: 10 }, pivot: { rows: high.name, value: n0.name, agg: "sum" }, score: 86 });
  if (dc && c0 && n0 && c0.distinct <= 6) add({ id: "trend-split", title: "Monthly " + n0.name + " by " + c0.name, why: "Compares how each " + c0.name + " moves over time.", chart: { type: "line", x: dc.name, y: n0.name, agg: "sum", byMonth: true, split: c0.name }, score: 80 });
  if (c0 && n1) add({ id: "avg-" + n1.name, title: "Average " + n1.name + " by " + c0.name, why: "Compares typical values, not just totals.", chart: { type: "bar", x: c0.name, y: n1.name, agg: "avg" }, pivot: { rows: c0.name, value: n1.name, agg: "avg" }, score: 72 });
  if (c0 && !n0) add({ id: "count-" + c0.name, title: "Rows by " + c0.name, why: "How records are distributed.", chart: { type: "column", x: c0.name, y: null, agg: "count" }, pivot: { rows: c0.name, agg: "count" }, score: 70 });
  return out.sort((a, b) => b.score - a.score);
}

// ── Pivot display options ──
export type ShowAs = "value" | "pctGrand" | "pctRow" | "pctCol";
export function pivotView(res: PivotResult, showAs: ShowAs, topN = 0, sort: "value" | "label" = "value"): { rowKeys: string[]; colKeys: string[]; cells: number[][]; rowTotals: number[]; colTotals: number[]; grand: number; heat: number[][]; isPct: boolean } {
  let idx = res.rowKeys.map((_, i) => i);
  if (sort === "label") idx.sort((a, b) => res.rowKeys[a].localeCompare(res.rowKeys[b])); else idx.sort((a, b) => res.rowTotals[b] - res.rowTotals[a]);
  let rowKeys = idx.map((i) => res.rowKeys[i]), cells = idx.map((i) => [...res.cells[i]]), rowTotals = idx.map((i) => res.rowTotals[i]);
  if (topN > 0 && rowKeys.length > topN) { const rest = cells.slice(topN); cells = [...cells.slice(0, topN), res.colKeys.map((_, j) => rest.reduce((a, r) => a + r[j], 0))]; rowTotals = [...rowTotals.slice(0, topN), rowTotals.slice(topN).reduce((a, b) => a + b, 0)]; rowKeys = [...rowKeys.slice(0, topN), "Others (" + (res.rowKeys.length - topN) + ")"]; }
  const g = res.grand || 1; const isPct = showAs !== "value";
  const conv = (v: number, i: number, j: number) => (showAs === "pctGrand" ? (v / g) * 100 : showAs === "pctRow" ? (rowTotals[i] ? (v / rowTotals[i]) * 100 : 0) : showAs === "pctCol" ? (res.colTotals[j] ? (v / res.colTotals[j]) * 100 : 0) : v);
  const out = cells.map((r, i) => r.map((v, j) => conv(v, i, j)));
  const rt = rowTotals.map((v) => (showAs === "pctGrand" ? (v / g) * 100 : showAs === "pctRow" ? 100 : showAs === "pctCol" ? (v / g) * 100 : v));
  const ct = res.colTotals.map((v) => (showAs === "pctGrand" ? (v / g) * 100 : showAs === "pctRow" ? (v / g) * 100 : showAs === "pctCol" ? 100 : v));
  const flat = out.flat(); const mx = flat.length ? Math.max(...flat) : 0, mn = flat.length ? Math.min(...flat) : 0; /* scale between actual min and max */ const heat = out.map((r) => r.map((v) => (mx === mn ? 0 : (v - mn) / (mx - mn))));
  return { rowKeys, colKeys: res.colKeys, cells: out, rowTotals: rt, colTotals: ct, grand: isPct ? 100 : res.grand, heat, isPct };
}

// ── Business email composer ──
export type Audience = "cfo" | "board" | "heads" | "team" | "client" | "vendor" | "investor";
export type Purpose = "update" | "decision" | "escalation" | "goodnews";
export type Tone = "formal" | "warm" | "direct";
export const AUDIENCES: Record<Audience, { label: string; greet: string; focus: string; detail: "brief" | "standard" | "detailed" }> = {
  cfo: { label: "CFO / Finance leadership", greet: "Dear {name},", focus: "financial impact, variances, risks and cash implications", detail: "standard" },
  board: { label: "CEO / Board", greet: "Dear {name},", focus: "the headline, strategic implications and any decision required", detail: "brief" },
  heads: { label: "Department heads", greet: "Dear {name},", focus: "operational drivers and the actions each team should take", detail: "detailed" },
  team: { label: "My team", greet: "Hi {name},", focus: "what happened, what it means for the team, and what to do next", detail: "detailed" },
  client: { label: "Client", greet: "Dear {name},", focus: "the value delivered and the outcomes that matter to them", detail: "standard" },
  vendor: { label: "Vendor / supplier", greet: "Dear {name},", focus: "performance against expectations and the actions required from them", detail: "standard" },
  investor: { label: "Investor", greet: "Dear {name},", focus: "growth, key metrics, outlook and risks (stated carefully)", detail: "brief" },
};
export const PURPOSES: Record<Purpose, { label: string; subject: string; ask: string }> = {
  update: { label: "Performance update", subject: "Update", ask: "No action needed; for your information." },
  decision: { label: "Decision needed", subject: "Decision needed", ask: "Your decision is needed on the recommendation below." },
  escalation: { label: "Escalation / concern", subject: "Attention required", ask: "Please review the concern below; it needs prompt action." },
  goodnews: { label: "Good news", subject: "Good news", ask: "Sharing a positive result with the team." },
};
export interface EmailDraft { subject: string; greeting: string; summary: string; what: string[]; why: string[]; recommendations: string[]; nextSteps: { action: string; owner: string; due: string }[]; closing: string; unverified: string[] }
export interface EmailContext { title: string; scope: string; facts: Fact[]; kpis: { label: string; value: number }[]; chart: ChartData | null; rows: number }
const addDays = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
export function draftEmail(c: EmailContext, a: Audience, pu: Purpose, tone: Tone, recipient: string): EmailDraft {
  const A = AUDIENCES[a], Pp = PURPOSES[pu]; const s = c.chart?.series[0]; const cats = c.chart?.categories || []; const tot = s ? s.values.reduce((x, y) => x + y, 0) : 0;
  const top = s && cats.length ? { k: cats[0], v: s.values[0], p: pct(s.values[0], tot) } : null; const low = s && cats.length > 2 ? { k: cats[cats.length - 1], v: s.values[cats.length - 1], p: pct(s.values[cats.length - 1], tot) } : null;
  const trend = c.facts.find((f) => f.id === "trend"); const dq = c.facts.filter((f) => f.id.startsWith("blank-") || f.id === "dups");
  const k0 = c.kpis.find((k) => k.label !== "Rows");
  const greeting = A.greet.replace("{name}", recipient || (a === "team" ? "team" : A.label.split(" /")[0]));
  const lead = tone === "direct" ? "" : tone === "warm" ? "I hope you are well. " : "";
  const summary = lead + (k0 ? k0.label + " is " + fmtNum(k0.value) + " across " + c.rows.toLocaleString("en-IN") + " records (" + c.scope + ")" : "Here is the summary for " + c.scope) + (top ? ", with " + top.k + " the largest contributor at " + top.p.toFixed(1) + "%" : "") + ". " + Pp.ask;
  const what = [top ? top.k + " contributes " + fmtNum(top.v) + " (" + top.p.toFixed(1) + "% of " + fmtNum(tot) + ")." : "", low ? "The smallest is " + low.k + " at " + fmtNum(low.v) + " (" + low.p.toFixed(1) + "%)." : "", trend ? trend.text : ""].filter(Boolean);
  const why: string[] = [];
  if (top && top.p >= 40) why.push("Concentration: " + top.p.toFixed(1) + "% depends on " + top.k + ", so a change there moves the whole result" + (a === "cfo" || a === "board" || a === "investor" ? " — a risk to monitor." : "."));
  if (top && low && top.p >= 3 * Math.max(low.p, 0.1)) why.push("A wide gap between " + top.k + " and " + low.k + " suggests practices worth replicating, or under-served areas.");
  if (trend) why.push(/\bdown\b/.test(trend.text) ? "Momentum is slowing compared with the previous month; early action limits the impact." : "Momentum is positive compared with the previous month; the drivers should be protected.");
  if (dq.length) why.push("Data quality: " + dq.map((d) => d.text.replace(/\.$/, "")).join("; ") + ". Figures should be read with this in mind.");
  if (!why.length) why.push("These figures give a reliable baseline for planning and follow-up.");
  const recommendations = [top ? (a === "vendor" ? "Maintain the standard achieved on " + top.k + " across all areas." : "Understand what drives " + top.k + " and replicate it where possible.") : "", low ? (a === "client" || a === "investor" ? "Focus the next period on improving " + low.k + "." : "Agree an improvement plan for " + low.k + " with a named owner.") : "", trend && /\bdown\b/.test(trend.text) ? "Review the latest month's decline with the teams involved this week." : "", dq.length && a !== "client" && a !== "investor" ? "Clean the data issues noted above before the next report." : ""].filter(Boolean);
  const owner = a === "team" ? "Team lead" : a === "vendor" ? "Vendor account manager" : a === "client" ? "Account manager" : "Owner to confirm";
  const nextSteps = recommendations.slice(0, 3).map((r, i) => ({ action: r, owner, due: addDays(7 * (i + 1)) }));
  const closing = tone === "warm" ? "Thank you, and happy to walk through the details." : tone === "direct" ? "Let me know if you need anything further." : "Please let me know if you would like to discuss the details.";
  return { subject: Pp.subject + ": " + c.title + (top ? " \u2014 " + top.k + " leads at " + top.p.toFixed(1) + "%" : ""), greeting, summary, what, why, recommendations, nextSteps, closing, unverified: [] };
}
export const EMAIL_SYSTEM = "You write business emails from computed data. Use ONLY numbers that appear in the FACTS (you may round them). Never invent numbers, dates or names. Reply ONLY with JSON: {\"subject\":\"\",\"summary\":\"2-3 sentences\",\"what\":[\"what happened\"],\"why\":[\"why it matters for this audience\"],\"recommendations\":[\"...\"],\"nextSteps\":[{\"action\":\"\",\"owner\":\"role\",\"due\":\"in N days\"}],\"closing\":\"one line\"}.";
export function emailPrompt(c: EmailContext, a: Audience, pu: Purpose, tone: Tone): string {
  return "Audience: " + AUDIENCES[a].label + " (focus on " + AUDIENCES[a].focus + "; " + AUDIENCES[a].detail + " detail)\nPurpose: " + PURPOSES[pu].label + "\nTone: " + tone + "\nTopic: " + c.title + " (" + c.scope + ")\nFACTS:\n"
    + [...c.kpis.map((k) => "- " + k.label + ": " + fmtNum(k.value)), ...c.facts.map((f) => "- " + f.text), ...(c.chart ? c.chart.categories.slice(0, 10).map((k, i) => "- " + c.chart!.xLabel + " " + k + ": " + fmtNum(c.chart!.series[0].values[i])) : [])].join("\n");
}
export function mergeAIEmail(base: EmailDraft, text: string, allowed: Fact[]): EmailDraft {
  try { const raw = String(text || "").replace(/```json|```/g, ""); const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); const un: string[] = [];
    const chk = (s: any) => { const v = String(s || "").slice(0, 700); un.push(...verifyText(v, allowed).unverified); return v; }; const list = (x: any, f: string[]) => (Array.isArray(x) && x.length ? x.slice(0, 6).map(chk).filter(Boolean) : f);
    const steps = Array.isArray(j.nextSteps) && j.nextSteps.length ? j.nextSteps.slice(0, 4).map((s: any, i: number) => ({ action: chk(s?.action), owner: String(s?.owner || "Owner to confirm").slice(0, 60), due: /^in\s+(\d+)\s+days?$/i.test(String(s?.due || "")) ? addDays(Number(String(s.due).match(/\d+/)![0])) : base.nextSteps[i]?.due || addDays(7) })) : base.nextSteps;
    return { ...base, subject: j.subject ? chk(j.subject).slice(0, 160) : base.subject, summary: j.summary ? chk(j.summary) : base.summary, what: list(j.what, base.what), why: list(j.why, base.why), recommendations: list(j.recommendations, base.recommendations), nextSteps: steps, closing: j.closing ? chk(j.closing) : base.closing, unverified: Array.from(new Set(un)) };
  } catch { return { ...base, unverified: [] }; }
}
// Factsfor verification = computed facts + KPIs + chart values (every number the email may cite)
export function allowedFacts(c: EmailContext): Fact[] { return [...c.facts, { id: "kpi", text: "", nums: c.kpis.map((k) => k.value) }, ...(c.chart ? [{ id: "chart", text: "", nums: [...c.chart.series[0].values, c.chart.total, ...c.chart.series[0].values.map((v) => +pct(v, c.chart!.total).toFixed(1))] }] : [])]; }

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Gmail / Outlook-safe HTML: tables + inline styles only; the chart is drawn with table cells (survives pasting).
export function emailHtml(d: EmailDraft, c: EmailContext, sender: { name: string; title: string; company: string }, opts: { chart?: boolean; table?: boolean } = { chart: true, table: true }): string {
  const navy = "#11264A", f = "font-family:Arial,Helvetica,sans-serif;"; const h = (t: string) => "<p style=\"" + f + "margin:18px 0 6px;font-size:14px;font-weight:bold;color:" + navy + "\">" + esc(t) + "</p>";
  const ul = (xs: string[]) => "<ul style=\"" + f + "margin:0 0 6px;padding-left:20px;font-size:14px;color:#1f2937\">" + xs.map((x) => "<li style=\"margin:0 0 5px\">" + esc(x) + "</li>").join("") + "</ul>";
  const kpis = c.kpis.slice(0, 4); const s = c.chart?.series[0]; const max = s ? Math.max(...s.values, 0) || 1 : 1; const tot = s ? s.values.reduce((a, b) => a + b, 0) : 0;
  let out = "<div style=\"" + f + "font-size:14px;line-height:1.55;color:#1f2937;max-width:680px\">";
  out += "<p style=\"margin:0 0 12px\">" + esc(d.greeting) + "</p><p style=\"margin:0 0 14px\">" + esc(d.summary) + "</p>";
  if (kpis.length) out += "<table cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:separate;border-spacing:6px 0;margin:4px 0 8px -6px\"><tr>" + kpis.map((k) => "<td style=\"" + f + "background:#F1F5F9;border:1px solid #E2E8F0;border-radius:6px;padding:10px 14px;min-width:120px\"><div style=\"font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.3px\">" + esc(k.label) + "</div><div style=\"font-size:20px;font-weight:bold;color:" + navy + "\">" + esc(fmtNum(k.value)) + "</div></td>").join("") + "</tr></table>";
  if (d.what.length) out += h("What happened") + ul(d.what);
  if (opts.chart !== false && s && c.chart) { out += h(c.chart.title) + "<table cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;margin:0 0 6px\">" + c.chart.categories.slice(0, 8).map((k, i) => { const w = Math.max(2, Math.round((s.values[i] / max) * 260));
    return "<tr><td style=\"" + f + "font-size:12px;color:#334155;padding:3px 10px 3px 0;white-space:nowrap\">" + esc(k) + "</td><td style=\"padding:3px 0\"><table cellpadding=\"0\" cellspacing=\"0\"><tr><td style=\"background:" + PALETTE[0] + ";width:" + w + "px;height:14px;font-size:1px;line-height:1px\">&nbsp;</td><td style=\"" + f + "font-size:12px;color:#334155;padding-left:8px;white-space:nowrap\">" + esc(fmtNum(s.values[i])) + " (" + pct(s.values[i], tot).toFixed(1) + "%)</td></tr></table></td></tr>"; }).join("") + "</table>"; }
  if (d.why.length) out += h("Why it matters") + ul(d.why);
  if (d.recommendations.length) out += h("Recommendations") + ul(d.recommendations);
  if (d.nextSteps.length) { const td = "style=\"" + f + "font-size:13px;border:1px solid #D9DEE7;padding:6px 10px\""; const th = "style=\"" + f + "font-size:12px;border:1px solid #D9DEE7;padding:6px 10px;background:" + navy + ";color:#ffffff;text-align:left\"";
    out += h("Next steps") + "<table cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;margin:0 0 8px\"><tr><th " + th + ">Action</th><th " + th + ">Owner</th><th " + th + ">By</th></tr>" + d.nextSteps.map((n) => "<tr><td " + td + ">" + esc(n.action) + "</td><td " + td + ">" + esc(n.owner) + "</td><td " + td + ">" + esc(n.due) + "</td></tr>").join("") + "</table>"; }
  if (opts.table !== false && s && c.chart && c.chart.categories.length > 8) out += "<p style=\"font-size:12px;color:#64748B;margin:4px 0\">Full breakdown of " + c.chart.categories.length + " items attached in the workbook.</p>";
  out += "<p style=\"margin:16px 0 4px\">" + esc(d.closing) + "</p><p style=\"margin:0;line-height:1.4\">Regards,<br><b>" + esc(sender.name || "") + "</b>" + (sender.title ? "<br>" + esc(sender.title) : "") + (sender.company ? "<br>" + esc(sender.company) : "") + "</p>";
  out += "<p style=\"font-size:11px;color:#94A3B8;margin:14px 0 0\">Figures computed from " + c.rows.toLocaleString("en-IN") + " records (" + esc(c.scope) + ").</p></div>"; return out;
}
export function emailText(d: EmailDraft, c: EmailContext, sender: { name: string; title: string; company: string }): string {
  const s = c.chart?.series[0];
  return [d.greeting, "", d.summary, "", ...c.kpis.slice(0, 4).map((k) => "\u2022 " + k.label + ": " + fmtNum(k.value)), "", "What happened:", ...d.what.map((x) => "- " + x), "", ...(s && c.chart ? [c.chart.title + ":", ...c.chart.categories.slice(0, 8).map((k, i) => "  " + k + ": " + fmtNum(s.values[i])), ""] : []), "Why it matters:", ...d.why.map((x) => "- " + x), "", "Recommendations:", ...d.recommendations.map((x) => "- " + x), "", "Next steps:", ...d.nextSteps.map((n, i) => (i + 1) + ". " + n.action + " (" + n.owner + ", by " + n.due + ")"), "", d.closing, "", "Regards,", sender.name, sender.title, sender.company].filter((l, i, a) => l !== undefined && !(l === "" && a[i - 1] === "")).join("\n");
}
export const gmailUrl = (subject: string, body: string, to = "") => "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to) + "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body.slice(0, 1800));
export const outlookUrl = (subject: string, body: string, to = "") => "https://outlook.office.com/mail/deeplink/compose?to=" + encodeURIComponent(to) + "&subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body.slice(0, 1800));
