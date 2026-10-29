// SHEETS ANALYTICS - every number is computed here by code, never by the AI.
// Profiling, facts, pivots (as live formulas where practical), chart series, "ask your
// data" queries, verification of numbers in AI text, and output builders (email, report,
// slides). The AI only chooses what to compute (validated) and explains computed facts.
import type { Cell, WorkbookGrid } from "./SheetsEngine";
import { colToLetters } from "./SheetsEngine";

export type ColType = "number" | "date" | "text" | "empty";
export interface Table { headers: string[]; rows: Cell[][]; types: ColType[]; excludedTotals?: number }
export interface ColProfile { name: string; index: number; type: ColType; count: number; blanks: number; distinct: number; sum?: number; mean?: number; min?: number; max?: number; median?: number; outliers?: number; top?: { value: string; count: number }[]; dateMin?: string; dateMax?: string }
export interface Profile { rows: number; cols: number; columns: ColProfile[]; duplicateRows: number }
export interface Fact { id: string; text: string; nums: number[] }

const isBlank = (v: Cell) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
export const toNum = (v: Cell): number | null => { if (typeof v === "number") return isFinite(v) ? v : null; if (typeof v === "boolean" || v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[,\u20b9$\u20ac\u00a3\s]/g, ""); if (!s || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?%?$/i.test(s)) return null; const n = parseFloat(s); return s.endsWith("%") ? n / 100 : n; };
const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})|^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/;
export const toMonth = (v: Cell): string | null => { if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 7); }
  const m = String(v ?? "").trim().match(DATE_RE); if (!m) return null; if (m[1]) return m[1] + "-" + m[2].padStart(2, "0"); return m[6] + "-" + m[5].padStart(2, "0"); };
export const fmtNum = (n: number | null | undefined, dp = 2) => (n === null || n === undefined || !isFinite(n) ? "\u2014" : Math.abs(n) >= 1000 || Number.isInteger(n) ? Math.round(n).toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: dp }));
export const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

// ── Table from sheet values (row 1 = header) ──
export function toTable(values: Cell[][]): Table {
  const head = (values[0] || []).map((h, i) => (isBlank(h) ? "Column " + colToLetters(i) : String(h).trim()));
  const width = Math.max(head.length, ...values.slice(1, 200).map((r) => (r || []).length));
  const headers = Array.from({ length: width }, (_, i) => head[i] || "Column " + colToLetters(i));
  // Total / subtotal rows would be double-counted by sums, pivots and charts, so they are excluded (and reported).
  const isTotalRow = (r: Cell[]) => r.some((v) => typeof v === "string" && /^\s*(grand\s+)?(sub\s*-?\s*)?totals?\s*:?\s*$/i.test(v));
  const nonEmpty = values.slice(1).filter((r) => r && r.some((v) => !isBlank(v)));
  const rows = nonEmpty.filter((r) => !isTotalRow(r)).map((r) => Array.from({ length: width }, (_, i) => (r[i] === undefined ? null : r[i])));
  const excludedTotals = nonEmpty.length - rows.length;
  // Real spreadsheet dates arrive as serial numbers; a date-named column of serials is a date column.
  const dateName = (h: string) => /date|day|month|period|time|dt\b|when/i.test(h);
  const types = headers.map((h, c) => { let n = 0, d = 0, t = 0; const dn = dateName(h); for (const r of rows.slice(0, 2000)) { const v = r[c]; if (isBlank(v)) continue; if (dn && typeof v === "number" && v > 20000 && v < 80000) d++; else if (toNum(v) !== null) n++; else if (toMonth(v)) d++; else t++; }
    const tot = n + d + t; return !tot ? "empty" : d / tot >= 0.8 ? "date" : n / tot >= 0.8 ? "number" : "text"; }) as ColType[];
  return { headers, rows, types, excludedTotals };
}
export function findCol(t: Table, name: string | null | undefined): number { if (!name) return -1; const n = String(name).trim().toLowerCase(); let i = t.headers.findIndex((h) => h.toLowerCase() === n); if (i < 0) i = t.headers.findIndex((h) => h.toLowerCase().includes(n)); return i; }

// ── Profiling ──
export function profile(t: Table): Profile {
  const columns: ColProfile[] = t.headers.map((name, c) => {
    const vals = t.rows.map((r) => r[c]); const non = vals.filter((v) => !isBlank(v)); const p: ColProfile = { name, index: c, type: t.types[c], count: non.length, blanks: vals.length - non.length, distinct: new Set(non.map((v) => String(v).trim().toLowerCase())).size };
    if (t.types[c] === "number") { const nums = non.map(toNum).filter((x): x is number => x !== null).sort((a, b) => a - b);
      if (nums.length) { p.sum = nums.reduce((a, b) => a + b, 0); p.mean = p.sum / nums.length; p.min = nums[0]; p.max = nums[nums.length - 1]; p.median = nums[Math.floor(nums.length / 2)];
        const q1 = nums[Math.floor(nums.length * 0.25)], q3 = nums[Math.floor(nums.length * 0.75)], iqr = q3 - q1; p.outliers = iqr > 0 ? nums.filter((x) => x < q1 - 3 * iqr || x > q3 + 3 * iqr).length : 0; } }
    if (t.types[c] === "text") { const m = new Map<string, number>(); non.forEach((v) => { const k = String(v).trim(); m.set(k, (m.get(k) || 0) + 1); }); p.top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, count]) => ({ value, count })); }
    if (t.types[c] === "date") { const ms = non.map(toMonth).filter(Boolean).sort() as string[]; p.dateMin = ms[0]; p.dateMax = ms[ms.length - 1]; }
    return p; });
  const seen = new Set<string>(); let dup = 0; for (const r of t.rows) { const k = JSON.stringify(r); if (seen.has(k)) dup++; else seen.add(k); }
  return { rows: t.rows.length, cols: t.headers.length, columns, duplicateRows: dup };
}
export const numericCols = (p: Profile) => p.columns.filter((c) => c.type === "number" && c.sum !== undefined).sort((a, b) => Math.abs(b.sum!) - Math.abs(a.sum!));
// Main dimension = what a person would pick: a column with 3-12 distinct values (e.g. Region),
// earliest first; 2-value flags (Online/Store) and long lists (25 reps) rank after.
export const categoryCols = (p: Profile) => p.columns.filter((c) => c.type === "text" && c.distinct >= 2 && c.distinct <= 50)
  .sort((a, b) => ((a.distinct >= 3 && a.distinct <= 12 ? 0 : 1) - (b.distinct >= 3 && b.distinct <= 12 ? 0 : 1)) || a.index - b.index);
export const dateCol = (p: Profile) => p.columns.find((c) => c.type === "date");

// ── Grouping (used by pivots, charts, queries, apps) ──
export type Agg = "sum" | "count" | "avg" | "min" | "max";
export function groupBy(t: Table, keyCol: number, valCol: number, agg: Agg, byMonth = false): { key: string; value: number; n: number }[] {
  const m = new Map<string, { s: number; n: number; mn: number; mx: number }>();
  for (const r of t.rows) { const raw = r[keyCol]; const key = byMonth ? toMonth(raw) || "(no date)" : isBlank(raw) ? "(blank)" : String(raw).trim();
    const v = valCol >= 0 ? toNum(r[valCol]) : 1; if (agg !== "count" && v === null) continue; const e = m.get(key) || { s: 0, n: 0, mn: Infinity, mx: -Infinity };
    e.n++; if (v !== null) { e.s += v; e.mn = Math.min(e.mn, v); e.mx = Math.max(e.mx, v); } m.set(key, e); }
  return [...m.entries()].map(([key, e]) => ({ key, n: e.n, value: agg === "sum" ? e.s : agg === "count" ? e.n : agg === "avg" ? (e.n ? e.s / e.n : 0) : agg === "min" ? e.mn : e.mx }));
}

// ── Facts: the only numbers the AI is allowed to talk about ──
export function facts(t: Table, p: Profile): Fact[] {
  const out: Fact[] = []; const F = (id: string, text: string, nums: number[]) => out.push({ id, text, nums });
  F("size", p.rows.toLocaleString("en-IN") + " rows and " + p.cols + " columns" + (t.excludedTotals ? " (" + t.excludedTotals + " total row" + (t.excludedTotals > 1 ? "s" : "") + " excluded so nothing is counted twice)" : "") + ".", [p.rows, p.cols, t.excludedTotals || 0]);
  const nums = numericCols(p).slice(0, 6), cats = categoryCols(p), dc = dateCol(p);
  for (const c of nums) F("num-" + c.index, c.name + ": total " + fmtNum(c.sum) + ", average " + fmtNum(c.mean) + ", min " + fmtNum(c.min) + ", max " + fmtNum(c.max) + ".", [c.sum!, c.mean!, c.min!, c.max!]);
  if (nums[0] && cats[0]) { const g = groupBy(t, cats[0].index, nums[0].index, "sum").sort((a, b) => b.value - a.value); const tot = g.reduce((a, b) => a + b.value, 0);
    g.slice(0, 3).forEach((x, i) => F("share-" + i, x.key + " has " + fmtNum(x.value) + " of " + nums[0].name + " (" + pct(x.value, tot).toFixed(1) + "% of " + fmtNum(tot) + ") by " + cats[0].name + ".", [x.value, +pct(x.value, tot).toFixed(1), tot]));
    const low = g[g.length - 1]; if (g.length > 3 && low) F("share-low", "Lowest " + cats[0].name + ": " + low.key + " with " + fmtNum(low.value) + " (" + pct(low.value, tot).toFixed(1) + "%).", [low.value, +pct(low.value, tot).toFixed(1)]); }
  if (nums[0] && dc) { const g = groupBy(t, dc.index, nums[0].index, "sum", true).filter((x) => x.key !== "(no date)").sort((a, b) => a.key.localeCompare(b.key));
    if (g.length >= 2) { const a = g[g.length - 2], b = g[g.length - 1]; const ch = a.value ? ((b.value - a.value) / Math.abs(a.value)) * 100 : 0; const best = [...g].sort((x, y) => y.value - x.value)[0];
      F("trend", nums[0].name + " in " + b.key + " was " + fmtNum(b.value) + ", " + (ch >= 0 ? "up " : "down ") + Math.abs(ch).toFixed(1) + "% from " + a.key + " (" + fmtNum(a.value) + "). Best month: " + best.key + " (" + fmtNum(best.value) + ").", [b.value, +Math.abs(ch).toFixed(1), a.value, best.value]); } }
  p.columns.filter((c) => c.blanks / Math.max(1, p.rows) > 0.05 && c.type !== "empty").slice(0, 4).forEach((c) => F("blank-" + c.index, c.name + " is blank in " + c.blanks.toLocaleString("en-IN") + " rows (" + pct(c.blanks, p.rows).toFixed(1) + "%).", [c.blanks, +pct(c.blanks, p.rows).toFixed(1)]));
  if (p.duplicateRows) F("dups", p.duplicateRows.toLocaleString("en-IN") + " exact duplicate rows.", [p.duplicateRows]);
  nums.filter((c) => (c.outliers || 0) > 0).slice(0, 3).forEach((c) => F("out-" + c.index, c.name + " has " + c.outliers + " extreme value(s) far outside the usual range.", [c.outliers!]));
  return out;
}

// ── Verify numbers in AI text against computed facts ──
export function numbersIn(text: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = []; const re = /([-+]?[\u20b9$]?\s?\d[\d,]*(?:\.\d+)?)\s*(%|crore|cr\b|lakh|lac|k\b|thousand|million|mn\b|bn|billion)?/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { const base = parseFloat(m[1].replace(/[\u20b9$,\s]/g, "")); if (!isFinite(base)) continue; const u = (m[2] || "").toLowerCase();
    const mult = u === "crore" || u === "cr" ? 1e7 : u === "lakh" || u === "lac" ? 1e5 : u === "k" || u === "thousand" ? 1e3 : u === "million" || u === "mn" ? 1e6 : u === "bn" || u === "billion" ? 1e9 : 1;
    out.push({ raw: m[0].trim(), value: base * mult }); } return out;
}
export function verifyText(text: string, fs: Fact[]): { ok: boolean; unverified: string[] } {
  const allowed = fs.flatMap((f) => f.nums).filter((n) => isFinite(n)); const unverified: string[] = [];
  for (const n of numbersIn(text)) { const v = n.value; if (Number.isInteger(v) && Math.abs(v) <= 12) continue; if (v >= 1900 && v <= 2100 && Number.isInteger(v)) continue;
    const hit = allowed.some((a) => Math.abs(a - v) <= Math.max(0.051, Math.abs(a) * 0.006)); if (!hit) unverified.push(n.raw); }
  return { ok: !unverified.length, unverified };
}
export const ANALYSIS_SYSTEM = "You are a senior business analyst. You receive FACTS computed exactly from a spreadsheet. Write insights for a busy manager. Use ONLY numbers that appear in the facts (you may round them as shown). Never invent or calculate new numbers. Reply ONLY with JSON: {\"headline\":\"one sentence\",\"insights\":[\"...\"],\"recommendations\":[\"...\"],\"questions\":[\"follow-up questions worth asking this data\"]}. 3-5 insights, 2-4 recommendations, 3 questions.";
export interface Narrative { headline: string; insights: { text: string; unverified: string[] }[]; recommendations: { text: string; unverified: string[] }[]; questions: string[] }
export function parseNarrative(text: string, fs: Fact[]): Narrative | null {
  try { const raw = String(text || "").replace(/```json|```/g, ""); const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const chk = (s: any) => { const t = String(s || "").slice(0, 600); return { text: t, unverified: verifyText(t, fs).unverified }; };
    return { headline: String(j.headline || "").slice(0, 300), insights: (Array.isArray(j.insights) ? j.insights : []).slice(0, 6).map(chk), recommendations: (Array.isArray(j.recommendations) ? j.recommendations : []).slice(0, 5).map(chk), questions: (Array.isArray(j.questions) ? j.questions : []).slice(0, 4).map((q: any) => String(q).slice(0, 200)) };
  } catch { return null; }
}

// ── Pivot ──
export interface PivotSpec { rows: string; cols?: string; value?: string; agg: Agg; byMonth?: boolean }
export interface PivotResult { rowKeys: string[]; colKeys: string[]; cells: number[][]; rowTotals: number[]; colTotals: number[]; grand: number; title: string }
const aggName: Record<Agg, string> = { sum: "Sum", count: "Count", avg: "Average", min: "Min", max: "Max" };
export function pivot(t: Table, s: PivotSpec): PivotResult | { error: string } {
  const rc = findCol(t, s.rows), cc = s.cols ? findCol(t, s.cols) : -1, vc = s.value ? findCol(t, s.value) : -1;
  if (rc < 0) return { error: "Choose a column for rows." }; if (s.cols && cc < 0) return { error: "Column field not found." }; if (s.agg !== "count" && vc < 0) return { error: "Choose a number column for values." };
  const keyOf = (r: Cell[], c: number, month: boolean) => (month ? toMonth(r[c]) || "(no date)" : isBlank(r[c]) ? "(blank)" : String(r[c]).trim());
  const rk = new Map<string, number>(), ck = new Map<string, number>(); const acc = new Map<string, { s: number; n: number; mn: number; mx: number }>();
  for (const r of t.rows) { const a = keyOf(r, rc, !!s.byMonth), b = cc >= 0 ? keyOf(r, cc, false) : "Total"; const v = vc >= 0 ? toNum(r[vc]) : 1; if (s.agg !== "count" && v === null) continue;
    rk.set(a, (rk.get(a) || 0) + (v || 0)); ck.set(b, (ck.get(b) || 0) + (v || 0)); const k = a + "\u0000" + b; const e = acc.get(k) || { s: 0, n: 0, mn: Infinity, mx: -Infinity }; e.n++; if (v !== null) { e.s += v; e.mn = Math.min(e.mn, v); e.mx = Math.max(e.mx, v); } acc.set(k, e); }
  const rowKeys = [...rk.keys()].sort((a, b) => (s.byMonth ? a.localeCompare(b) : (rk.get(b)! - rk.get(a)!) || a.localeCompare(b)));
  const colKeys = [...ck.keys()].sort((a, b) => (ck.get(b)! - ck.get(a)!) || a.localeCompare(b));
  const val = (e?: { s: number; n: number; mn: number; mx: number }) => (!e ? 0 : s.agg === "sum" ? e.s : s.agg === "count" ? e.n : s.agg === "avg" ? e.s / e.n : s.agg === "min" ? e.mn : e.mx);
  const cells = rowKeys.map((a) => colKeys.map((b) => val(acc.get(a + "\u0000" + b))));
  const allFor = (pred: (a: string, b: string) => boolean) => { let e = { s: 0, n: 0, mn: Infinity, mx: -Infinity }; for (const [k, x] of acc) { const [a, b] = k.split("\u0000"); if (pred(a, b)) { e = { s: e.s + x.s, n: e.n + x.n, mn: Math.min(e.mn, x.mn), mx: Math.max(e.mx, x.mx) }; } } return e.n ? val(e) : 0; };
  return { rowKeys, colKeys, cells, rowTotals: rowKeys.map((a) => allFor((x) => x === a)), colTotals: colKeys.map((b) => allFor((_, y) => y === b)), grand: allFor(() => true),
    title: aggName[s.agg] + (vc >= 0 ? " of " + t.headers[vc] : "") + " by " + t.headers[rc] + (s.byMonth ? " (month)" : "") + (cc >= 0 ? " and " + t.headers[cc] : "") };
}
// Pivot as a new sheet. Live formulas (SUMIFS etc.) referencing the data sheet when practical;
// otherwise the computed values, clearly labelled. Returns rows for SheetsEngine.
export const LIVE_PIVOT_MAX_CELLS = 3000;
export function pivotSheetRows(t: Table, s: PivotSpec, res: PivotResult, dataSheet: string): { rows: Cell[][]; live: boolean; note: string } {
  const rc = findCol(t, s.rows), cc = s.cols ? findCol(t, s.cols) : -1, vc = s.value ? findCol(t, s.value) : -1; const n = t.rows.length + 1;
  const ref = (c: number) => "'" + dataSheet.replace(/'/g, "''") + "'!$" + colToLetters(c) + "$2:$" + colToLetters(c) + "$" + n;
  const live = !s.byMonth && res.rowKeys.length * Math.max(1, res.colKeys.length) <= LIVE_PIVOT_MAX_CELLS && t.types[rc] !== "date" && (cc < 0 || t.types[cc] !== "date");
  const header: Cell[] = [res.title], colHead: Cell[] = [t.headers[rc] + (s.byMonth ? " (month)" : "")]; const rows: Cell[][] = [header, [], colHead];
  if (cc >= 0) res.colKeys.forEach((k) => colHead.push(k)); else colHead.push(aggName[s.agg] + (vc >= 0 ? " of " + t.headers[vc] : ""));
  colHead.push("Total");
  if (!live) { res.rowKeys.forEach((k, i) => rows.push([k, ...(cc >= 0 ? res.cells[i] : [res.cells[i][0]]), res.rowTotals[i]])); rows.push(["Total", ...(cc >= 0 ? res.colTotals : [res.grand]), res.grand]);
    return { rows, live, note: "Values computed from " + t.rows.length.toLocaleString("en-IN") + " rows (too large or month-grouped for live formulas). Rebuild after the data changes." }; }
  const lit = (k: string) => (k === "(blank)" ? "\"=\"" : null);
  const crit = (c: number, cellRef: string, key: string) => ref(c) + "," + (lit(key) || cellRef);
  const f = (args: string) => { const fn = s.agg === "sum" ? "SUMIFS(" + ref(vc) + "," : s.agg === "count" ? "COUNTIFS(" : s.agg === "avg" ? "AVERAGEIFS(" + ref(vc) + "," : s.agg === "min" ? "MINIFS(" + ref(vc) + "," : "MAXIFS(" + ref(vc) + ",";
    const body = fn + args + ")"; return s.agg === "avg" ? "=IFERROR(" + body + ",\"\")" : "=" + body; };
  const firstRow = 4, lastRow = firstRow + res.rowKeys.length - 1, nCols = cc >= 0 ? res.colKeys.length : 1;
  res.rowKeys.forEach((k, i) => { const r = firstRow + i; const row: Cell[] = [k];
    for (let j = 0; j < nCols; j++) { const colL = colToLetters(1 + j); row.push(f(crit(rc, "$A" + r, k) + (cc >= 0 ? "," + crit(cc, colL + "$3", res.colKeys[j]) : ""))); }
    row.push(s.agg === "sum" || s.agg === "count" ? "=SUM(B" + r + ":" + colToLetters(nCols) + r + ")" : f(crit(rc, "$A" + r, k))); rows.push(row); });
  const tot: Cell[] = ["Total"]; for (let j = 0; j <= nCols; j++) { const L = colToLetters(1 + j);
    tot.push(s.agg === "sum" || s.agg === "count" ? "=SUM(" + L + firstRow + ":" + L + lastRow + ")" : j < nCols && cc >= 0 ? f(crit(cc, L + "$3", res.colKeys[j])) : f(ref(rc) + ",\"<>\"")); }
  rows.push(tot);
  return { rows, live, note: "Live pivot: formulas recalculate when the data changes. New categories need a rebuild." };
}

// ── Ask your data: the AI picks a query (validated), code computes the answer ──
export const ASK_SYSTEM = "You translate a business question about ONE spreadsheet table into a query. Reply ONLY with JSON. Either {\"type\":\"query\",\"title\":\"...\",\"groupBy\":\"<column or null>\",\"byMonth\":false,\"value\":\"<number column or null>\",\"agg\":\"sum|count|avg|min|max\",\"filters\":[{\"col\":\"...\",\"op\":\"eq|neq|gt|lt|contains\",\"value\":\"...\"}],\"sort\":\"desc|asc\",\"top\":10} or {\"type\":\"explain\",\"text\":\"...\"} when no calculation is needed. Use exact column names from the list. Never compute numbers yourself.";
export interface Query { type: "query"; title: string; groupBy: string | null; byMonth: boolean; value: string | null; agg: Agg; filters: { col: string; op: "eq" | "neq" | "gt" | "lt" | "contains"; value: string }[]; sort: "desc" | "asc"; top: number }
export function parseQuery(text: string, t: Table): { query?: Query; explain?: string; error?: string } {
  let j: any; try { const raw = String(text || "").replace(/```json|```/g, ""); j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { return { error: "The AI's reply could not be read. Try rephrasing the question." }; }
  if (j?.type === "explain") return { explain: String(j.text || "").slice(0, 3000) };
  const aggs: Agg[] = ["sum", "count", "avg", "min", "max"]; const agg: Agg = aggs.includes(j?.agg) ? j.agg : "sum";
  if (j?.groupBy && findCol(t, j.groupBy) < 0) return { error: "Column \u201c" + j.groupBy + "\u201d is not in this sheet." };
  if (j?.value && findCol(t, j.value) < 0) return { error: "Column \u201c" + j.value + "\u201d is not in this sheet." };
  if (agg !== "count" && !j?.value) return { error: "The question needs a number column to " + agg + "." };
  const filters = (Array.isArray(j?.filters) ? j.filters : []).slice(0, 5).filter((f: any) => f && findCol(t, f.col) >= 0 && ["eq", "neq", "gt", "lt", "contains"].includes(f.op)).map((f: any) => ({ col: f.col, op: f.op, value: String(f.value ?? "") }));
  return { query: { type: "query", title: String(j?.title || "Answer").slice(0, 120), groupBy: j?.groupBy || null, byMonth: !!j?.byMonth, value: j?.value || null, agg, filters, sort: j?.sort === "asc" ? "asc" : "desc", top: Math.max(1, Math.min(50, Math.floor(Number(j?.top) || 10))) } };
}
export function applyFilters(t: Table, filters: Query["filters"]): Table {
  if (!filters.length) return t; const fs = filters.map((f) => ({ ...f, c: findCol(t, f.col) }));
  return { ...t, rows: t.rows.filter((r) => fs.every((f) => { const v = r[f.c]; const a = toNum(v), b = toNum(f.value as any); const s = String(v ?? "").trim().toLowerCase(), q = f.value.trim().toLowerCase();
    return f.op === "eq" ? (a !== null && b !== null ? a === b : s === q) : f.op === "neq" ? s !== q : f.op === "gt" ? a !== null && b !== null && a > b : f.op === "lt" ? a !== null && b !== null && a < b : s.includes(q); })) };
}
export function runQuery(t: Table, q: Query): { title: string; rows: [string, number][]; total: number; summary: string; matched: number } {
  const ft = applyFilters(t, q.filters); const vc = q.value ? findCol(t, q.value) : -1; const fdesc = q.filters.map((f) => f.col + " " + ({ eq: "=", neq: "\u2260", gt: ">", lt: "<", contains: "contains" } as any)[f.op] + " " + f.value).join(", ");
  if (!q.groupBy) { const g = groupBy({ ...ft, rows: ft.rows.map((r) => ["All", ...r]) as any, headers: ["_", ...ft.headers], types: ["text", ...ft.types] }, 0, vc >= 0 ? vc + 1 : -1, q.agg);
    const v = g[0]?.value ?? 0; return { title: q.title, rows: [[q.agg + (q.value ? " of " + q.value : " of rows"), v]], total: v, matched: ft.rows.length, summary: (q.agg === "count" ? "Count" : q.agg[0].toUpperCase() + q.agg.slice(1)) + (q.value ? " of " + q.value : "") + ": " + fmtNum(v) + " across " + ft.rows.length.toLocaleString("en-IN") + " rows" + (fdesc ? " where " + fdesc : "") + "." }; }
  const gc = findCol(t, q.groupBy); const g = groupBy(ft, gc, vc, q.agg, q.byMonth).sort((a, b) => (q.byMonth ? a.key.localeCompare(b.key) : q.sort === "asc" ? a.value - b.value : b.value - a.value));
  const total = g.reduce((a, b) => a + b.value, 0); const shown = g.slice(0, q.byMonth ? 60 : q.top); const lead = shown[0];
  const summary = lead ? (q.byMonth ? "From " + shown[0].key + " to " + shown[shown.length - 1].key + ", " : (q.sort === "asc" ? "Lowest " : "Top ") + t.headers[gc] + ": " + lead.key + " with " + fmtNum(lead.value) + (q.agg === "sum" || q.agg === "count" ? " (" + pct(lead.value, total).toFixed(1) + "% of " + fmtNum(total) + ")" : "") + ". ") + shown.length + " group(s) shown from " + ft.rows.length.toLocaleString("en-IN") + " matching rows" + (fdesc ? " (" + fdesc + ")" : "") + "." : "No rows match" + (fdesc ? " " + fdesc : "") + ".";
  return { title: q.title, rows: shown.map((x) => [x.key, x.value]), total, summary, matched: ft.rows.length };
}

// ── Analysis sheet (formulas referencing the data sheet) ──
export function analysisSheetRows(t: Table, p: Profile, dataSheet: string): Cell[][] {
  const n = t.rows.length + 1; const ref = (c: number) => "'" + dataSheet.replace(/'/g, "''") + "'!" + colToLetters(c) + "2:" + colToLetters(c) + n;
  const rows: Cell[][] = [["Analysis of \u201c" + dataSheet + "\u201d (" + p.rows.toLocaleString("en-IN") + " rows). Formulas recalculate when the data changes."], [], ["Measure", "Total", "Average", "Minimum", "Maximum", "Count"]];
  numericCols(p).slice(0, 12).forEach((c) => rows.push([c.name, "=SUM(" + ref(c.index) + ")", "=IFERROR(AVERAGE(" + ref(c.index) + "),\"\")", "=MIN(" + ref(c.index) + ")", "=MAX(" + ref(c.index) + ")", "=COUNT(" + ref(c.index) + ")"]));
  const cat = categoryCols(p)[0], num = numericCols(p)[0];
  if (cat && num) { const keys = groupBy(t, cat.index, num.index, "sum").sort((a, b) => b.value - a.value).slice(0, 30).map((x) => x.key).filter((k) => k !== "(blank)");
    rows.push([], [num.name + " by " + cat.name, "Total", "Share %", "Rows"]); const start = rows.length + 1;
    keys.forEach((k, i) => { const r = start + i; rows.push([k, "=SUMIFS(" + ref(num.index) + "," + ref(cat.index) + ",A" + r + ")", "=IFERROR(B" + r + "/SUM(" + ref(num.index) + "),0)", "=COUNTIFS(" + ref(cat.index) + ",A" + r + ")"]); }); }
  return rows;
}

// ── Email (HTML that pastes cleanly into Gmail / Outlook) ──
const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export interface EmailInput { subject: string; audience: string; salutation: string; intro: string; kpis: { label: string; value: string }[]; insights: string[]; tableHead: string[]; tableRows: Cell[][]; actions: string[]; closing: string; sender: string }
export function emailHtml(e: EmailInput): string {
  const td = "padding:6px 10px;border:1px solid #d9dee7;font-size:13px;", th = td + "background:#11264a;color:#fff;text-align:left;";
  return "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:720px;line-height:1.5\">"
    + "<p style=\"margin:0 0 12px\">" + esc(e.salutation) + "</p><p style=\"margin:0 0 14px\">" + esc(e.intro) + "</p>"
    + (e.kpis.length ? "<table style=\"border-collapse:collapse;margin:0 0 16px\"><tr>" + e.kpis.map((k) => "<td style=\"padding:10px 14px;background:#f1f5f9;border:1px solid #e2e8f0;\"><div style=\"font-size:11px;color:#64748b;text-transform:uppercase\">" + esc(k.label) + "</div><div style=\"font-size:18px;font-weight:bold;color:#11264a\">" + esc(k.value) + "</div></td>").join("") + "</tr></table>" : "")
    + (e.insights.length ? "<p style=\"margin:0 0 6px;font-weight:bold;color:#11264a\">Key insights</p><ul style=\"margin:0 0 14px;padding-left:20px\">" + e.insights.map((i) => "<li style=\"margin-bottom:4px\">" + esc(i) + "</li>").join("") + "</ul>" : "")
    + (e.tableRows.length ? "<table style=\"border-collapse:collapse;margin:0 0 16px\"><tr>" + e.tableHead.map((h) => "<th style=\"" + th + "\">" + esc(h) + "</th>").join("") + "</tr>" + e.tableRows.map((r) => "<tr>" + r.map((v) => "<td style=\"" + td + (typeof v === "number" ? "text-align:right;" : "") + "\">" + esc(typeof v === "number" ? fmtNum(v) : v) + "</td>").join("") + "</tr>").join("") + "</table>" : "")
    + (e.actions.length ? "<p style=\"margin:0 0 6px;font-weight:bold;color:#11264a\">Recommended next steps</p><ol style=\"margin:0 0 14px;padding-left:20px\">" + e.actions.map((a) => "<li style=\"margin-bottom:4px\">" + esc(a) + "</li>").join("") + "</ol>" : "")
    + "<p style=\"margin:0 0 4px\">" + esc(e.closing) + "</p><p style=\"margin:0\">" + esc(e.sender) + "</p></div>";
}
export function emailText(e: EmailInput): string {
  return [e.salutation, "", e.intro, "", ...e.kpis.map((k) => "\u2022 " + k.label + ": " + k.value), "", e.insights.length ? "Key insights:" : "", ...e.insights.map((i) => "- " + i), "",
    e.tableRows.length ? e.tableHead.join(" | ") : "", ...e.tableRows.map((r) => r.map((v) => (typeof v === "number" ? fmtNum(v) : String(v ?? ""))).join(" | ")), "", e.actions.length ? "Recommended next steps:" : "", ...e.actions.map((a, i) => (i + 1) + ". " + a), "", e.closing, e.sender].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

// ── App (dashboard) model, built automatically from the data ──
export interface AppModel { title: string; kpis: { label: string; value: number; kind: "sum" | "avg" | "count" }[]; filterCol: number; filterValues: string[]; dateCol: number; valueCol: number; byCategory: { key: string; value: number }[]; byMonth: { key: string; value: number }[]; rows: Cell[][]; matched: number }
export function buildApp(t: Table, p: Profile, sel: { filter: string[]; month?: string; valueCol?: number }, title = "Data app"): AppModel {
  const cat = categoryCols(p)[0], dc = dateCol(p), nums = numericCols(p); const vc = sel.valueCol ?? nums[0]?.index ?? -1;
  let ft = t; if (cat && sel.filter.length) ft = { ...t, rows: t.rows.filter((r) => sel.filter.includes(isBlank(r[cat.index]) ? "(blank)" : String(r[cat.index]).trim())) };
  if (dc && sel.month) ft = { ...ft, rows: ft.rows.filter((r) => toMonth(r[dc.index]) === sel.month) };
  const kp = new Profile_(ft); const kpis: AppModel["kpis"] = [{ label: "Rows", value: ft.rows.length, kind: "count" }];
  nums.slice(0, 3).forEach((c) => { const s = kp.sum(c.index); kpis.push({ label: "Total " + c.name, value: s, kind: "sum" }); });
  if (nums[0]) kpis.push({ label: "Average " + nums[0].name, value: ft.rows.length ? kp.sum(nums[0].index) / Math.max(1, kp.count(nums[0].index)) : 0, kind: "avg" });
  return { title, kpis: kpis.slice(0, 5), filterCol: cat?.index ?? -1, filterValues: cat ? groupBy(t, cat.index, -1, "count").sort((a, b) => b.value - a.value).map((x) => x.key) : [], dateCol: dc?.index ?? -1, valueCol: vc,
    byCategory: cat && vc >= 0 ? groupBy(ft, cat.index, vc, "sum").sort((a, b) => b.value - a.value).slice(0, 12) : [], byMonth: dc && vc >= 0 ? groupBy(ft, dc.index, vc, "sum", true).filter((x) => x.key !== "(no date)").sort((a, b) => a.key.localeCompare(b.key)) : [], rows: ft.rows.slice(0, 50), matched: ft.rows.length };
}
class Profile_ { private t: Table; constructor(t: Table) { this.t = t; } sum(c: number) { let s = 0; for (const r of this.t.rows) { const v = toNum(r[c]); if (v !== null) s += v; } return s; } count(c: number) { let n = 0; for (const r of this.t.rows) if (toNum(r[c]) !== null) n++; return n; } }

// ── Report document blocks (rendered to PDF by the existing report renderer) ──
export function reportBlocks(title: string, model: AppModel, t: Table, insights: string[], actions: string[]) {
  const blocks: any[] = [{ t: "h1", text: "1. Summary" }, { t: "kv", rows: model.kpis.map((k) => [k.label, fmtNum(k.value)]) }];
  if (insights.length) blocks.push({ t: "h2", text: "Key insights" }, { t: "ul", items: insights });
  if (model.byCategory.length) blocks.push({ t: "h1", text: "2. " + t.headers[model.valueCol] + " by " + t.headers[model.filterCol] }, { t: "table", head: [t.headers[model.filterCol], t.headers[model.valueCol], "Share"], rows: (() => { const tot = model.byCategory.reduce((a, b) => a + b.value, 0); return model.byCategory.map((x) => [x.key, fmtNum(x.value), pct(x.value, tot).toFixed(1) + "%"]); })() });
  if (model.byMonth.length) blocks.push({ t: "h1", text: "3. Monthly trend" }, { t: "table", head: ["Month", t.headers[model.valueCol]], rows: model.byMonth.map((x) => [x.key, fmtNum(x.value)]) });
  if (actions.length) blocks.push({ t: "h1", text: "4. Recommended next steps" }, { t: "ul", items: actions });
  blocks.push({ t: "h1", text: "Data sample (first " + Math.min(15, model.rows.length) + " of " + model.matched.toLocaleString("en-IN") + " rows)" }, { t: "table", head: t.headers.slice(0, 7), rows: model.rows.slice(0, 15).map((r) => r.slice(0, 7).map((v) => (typeof v === "number" ? fmtNum(v) : String(v ?? "")))) });
  return { title, subtitle: "Prepared with OrchestrIQ Sheets \u2014 every figure computed from the data", meta: [["Rows analysed", model.matched.toLocaleString("en-IN")], ["Date", new Date().toLocaleDateString("en-IN")]] as [string, string][], blocks, toc: blocks.filter((b) => b.t === "h1").map((b) => b.text) };
}
export function workbookFromRows(name: string, sheetName: string, header: string[], rows: Cell[][]): WorkbookGrid { return { name, sheets: [{ name: sheetName, rows: [header, ...rows] }] }; }
