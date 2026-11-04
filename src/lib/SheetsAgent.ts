// SHEETS AGENT - one instruction → a multi-step plan the user approves → executed step by step.
// The AI only proposes; every step is validated here against the real workbook (sheet and
// column names, safe formulas, size limits) before anything changes. Also: Fill-with-AI,
// text → table, Formula Doctor fixes, and what-if / goal-seek maths.
import type { Cell } from "./SheetsEngine";
import { checkFormula, parseCell, parseRange, colToLetters, lettersToCol } from "./SheetsEngine";
import { relForm } from "./SheetsAutomate";
import { liveRange, toNum, groupBy, type Table } from "./SheetsAnalytics";

// ════════════ 1. PLAN CONTRACT ════════════
export interface SheetInfo { name: string; headers: string[]; rows: number; measures: string[]; averaged: string[]; dims: string[]; time: string | null; description: string }
export type Step =
  | { do: "newSheet"; name: string; rows: Cell[][]; currency?: string[]; percent?: string[]; headerRows?: number[]; totalRows?: number[]; widths?: number[] }
  | { do: "formulaColumn"; sheet: string; column: string; header: string; template: string; fromRow?: number; toRow?: number }
  | { do: "pivot"; sheet: string; rows: string; cols?: string; value?: string; agg: "sum" | "count" | "avg" | "min" | "max" }
  | { do: "scorecards"; sheet: string; measures: string[]; by?: string }
  | { do: "analysis"; sheet: string } | { do: "clean"; sheet: string } | { do: "unpivot"; sheet: string }
  | { do: "bridge"; sheet: string; measure: string; period: string; from?: string; to?: string; by?: string[] }
  | { do: "format"; sheet: string; range: string; numberFormat?: string; bold?: boolean; fill?: string }
  | { do: "chart"; sheet: string; type: "column" | "bar" | "stacked" | "line" | "area" | "doughnut" | "combo"; x: string; y?: string; agg?: "sum" | "avg" | "count"; split?: string }
  | { do: "report"; format: "pdf" | "pptx" }
  | { do: "answer"; text: string };
export interface Plan { goal: string; steps: Step[]; errors: string[]; notes: string[] }
export const AGENT_SYSTEM = `You are a spreadsheet agent inside OrchestrIQ Sheets, working for finance and business analysts. You turn ONE instruction into a short plan of steps that build or edit the workbook. You NEVER calculate numbers yourself: you build formulas, pivots and analyses, and the spreadsheet computes them.
Reply ONLY with JSON: {"goal":"one sentence","steps":[ ... ]}. Allowed steps (use real sheet and column names from the context; a sheet created by an earlier step may be used by later steps):
{"do":"newSheet","name":"Budget","rows":[["Item","Jan","Feb","Total"],["Rent",50000,50000,"=SUM(B2:C2)"]],"currency":["B2:D20"],"percent":[],"headerRows":[0],"totalRows":[]}   // build a sheet from scratch: labels, input numbers the user gave or clearly marked sample assumptions, and formulas
{"do":"formulaColumn","sheet":"Data","column":"H","header":"GST","template":"=F{r}*18%"}   // {r} = row number; fills every data row
{"do":"pivot","sheet":"Data","rows":"Region","cols":"Product","value":"Sales","agg":"sum"}
{"do":"scorecards","sheet":"Data","measures":["Sales","Units"],"by":"Region"}   // a Dashboard sheet: KPI totals + breakdown, as live formulas
{"do":"analysis","sheet":"Data"}   {"do":"clean","sheet":"Data"}   {"do":"unpivot","sheet":"PnL"}
{"do":"bridge","sheet":"Data","measure":"Sales","period":"Month","from":"2026-08","to":"2026-09","by":["Region"]}
{"do":"format","sheet":"Budget","range":"B2:D20","numberFormat":"#,##0","bold":false,"fill":"#E8EEF7"}
{"do":"chart","sheet":"Data","type":"column","x":"Region","y":"Sales","agg":"sum"}   // adds a chart to the report
{"do":"report","format":"pdf"}   // builds the PDF or PowerPoint from the charts
{"do":"answer","text":"..."}   // explain, or ask for what you need when the request is unclear
Rules: 1-8 steps. Never use WEBSERVICE, IMPORTDATA, IMPORTXML, IMPORTHTML, IMPORTRANGE, HYPERLINK. Sums only for amounts and quantities; percentages, prices and ratings are averaged. If sample numbers are invented for a template, say so in the sheet (a note row) and in "goal".`;
const AGGS = ["sum", "count", "avg", "min", "max"]; const CHARTS = ["column", "bar", "stacked", "line", "area", "doughnut", "combo"];
const NUMFMT = /^(#,##0(\.0{1,2})?|0(\.0{1,2})?%|0\.0{1,2}|yyyy-mm-dd|dd-mm-yyyy|dd\/mm\/yyyy|mmm-yy|₹#,##0(\.00)?|"₹"#,##0(\.00)?|\[\$₹\]#,##0(\.00)?)$/;
const MAX_NEW_CELLS = 5000, MAX_STEPS = 8;
const findSheet = (sheets: SheetInfo[], name: string) => sheets.find((s) => s.name.toLowerCase() === String(name || "").trim().toLowerCase());
const hasCol = (s: SheetInfo | undefined, c: string) => !!s && s.headers.some((h) => h.toLowerCase() === String(c || "").trim().toLowerCase());
const colName = (s: SheetInfo, c: string) => s.headers.find((h) => h.toLowerCase() === String(c).trim().toLowerCase())!;
export function validatePlan(text: string, sheets: SheetInfo[]): Plan {
  const plan: Plan = { goal: "", steps: [], errors: [], notes: [] }; let j: any;
  try { const raw = String(text || "").replace(/```json|```/g, ""); j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { plan.errors.push("The AI's reply could not be read as a plan. Try rephrasing."); return plan; }
  plan.goal = String(j?.goal || "").slice(0, 300); const steps: any[] = Array.isArray(j?.steps) ? j.steps : [];
  if (!steps.length) plan.errors.push("The plan has no steps."); if (steps.length > MAX_STEPS) plan.notes.push("Only the first " + MAX_STEPS + " steps are used.");
  const known: SheetInfo[] = sheets.map((s) => ({ ...s })); // sheets created by earlier steps become available to later ones
  steps.slice(0, MAX_STEPS).forEach((s, i) => { const tag = "Step " + (i + 1) + ": "; const err = (m: string) => plan.errors.push(tag + m);
    switch (s?.do) {
      case "answer": if (s.text) plan.steps.push({ do: "answer", text: String(s.text).slice(0, 3000) }); return;
      case "newSheet": { const rows = Array.isArray(s.rows) ? s.rows.filter((r: any) => Array.isArray(r)) : []; const name = String(s.name || "").replace(/[\\/?*[\]:']/g, "").slice(0, 28).trim();
        if (!name || !rows.length) return err("a new sheet needs a name and rows.");
        const cells = rows.reduce((n: number, r: any[]) => n + r.length, 0); if (cells > MAX_NEW_CELLS) return err("the new sheet is too large (" + cells + " cells; limit " + MAX_NEW_CELLS + ").");
        const flat = rows.flat(); if (flat.some((v: any) => v !== null && typeof v === "object")) return err("cells must be text, numbers or formulas.");
        const bad = flat.filter((v: any) => typeof v === "string" && v.startsWith("=")).map((f: string) => checkFormula(f)).find(Boolean); if (bad) return err(bad);
        const ranges = (x: any) => (Array.isArray(x) ? x.filter((r: any) => parseRange(r)).map(String) : []);
        plan.steps.push({ do: "newSheet", name, rows, currency: ranges(s.currency), percent: ranges(s.percent), headerRows: Array.isArray(s.headerRows) ? s.headerRows.filter((n: any) => Number.isInteger(n) && n >= 0 && n < rows.length) : [0], totalRows: Array.isArray(s.totalRows) ? s.totalRows.filter((n: any) => Number.isInteger(n) && n >= 0 && n < rows.length) : [], widths: Array.isArray(s.widths) ? s.widths.filter((n: any) => n > 20 && n < 600) : undefined });
        known.push({ name, headers: (rows[0] || []).map((h: any) => String(h ?? "")), rows: rows.length - 1, measures: [], averaged: [], dims: [], time: null, description: "" }); return; }
      case "formulaColumn": { const sh = findSheet(known, s.sheet); if (!sh) return err("sheet “" + s.sheet + "” doesn't exist.");
        if (!/^[A-Z]{1,3}$/i.test(String(s.column || ""))) return err("choose a column letter."); if (typeof s.template !== "string" || !s.template.includes("{r}")) return err("the formula must use {r} for the row.");
        const e = checkFormula(s.template.replace(/\{r\}/g, "2")); if (e) return err(e); const refs = (s.template.match(/\b([A-Z]{1,3})\{r\}/g) || []).map((x: string) => x.replace("{r}", "")); const last = colToLetters(Math.max(0, sh.headers.length - 1));
        if (refs.some((c: string) => lettersToCol(c) > lettersToCol(last) + 1)) plan.notes.push(tag + "the formula refers to columns beyond the data (" + refs.join(", ") + ").");
        plan.steps.push({ do: "formulaColumn", sheet: sh.name, column: String(s.column).toUpperCase(), header: String(s.header || "New").slice(0, 60), template: s.template, fromRow: 2, toRow: sh.rows + 1 }); return; }
      case "pivot": { const sh = findSheet(known, s.sheet); if (!sh) return err("sheet “" + s.sheet + "” doesn't exist."); if (!hasCol(sh, s.rows)) return err("column “" + s.rows + "” isn't in " + sh.name + ".");
        if (s.cols && !hasCol(sh, s.cols)) return err("column “" + s.cols + "” isn't in " + sh.name + "."); if (s.value && !hasCol(sh, s.value)) return err("column “" + s.value + "” isn't in " + sh.name + ".");
        let agg = AGGS.includes(s.agg) ? s.agg : s.value ? "sum" : "count"; if (agg === "sum" && s.value && sh.averaged.some((a) => a.toLowerCase() === String(s.value).toLowerCase())) { agg = "avg"; plan.notes.push(tag + s.value + " is averaged, not summed."); }
        plan.steps.push({ do: "pivot", sheet: sh.name, rows: colName(sh, s.rows), cols: s.cols ? colName(sh, s.cols) : undefined, value: s.value ? colName(sh, s.value) : undefined, agg }); return; }
      case "scorecards": { const sh = findSheet(known, s.sheet); if (!sh) return err("sheet “" + s.sheet + "” doesn't exist."); const ms = (Array.isArray(s.measures) ? s.measures : []).filter((m: string) => hasCol(sh, m)).map((m: string) => colName(sh, m));
        if (!ms.length) return err("choose measures that exist in " + sh.name + "."); if (s.by && !hasCol(sh, s.by)) return err("column “" + s.by + "” isn't in " + sh.name + ".");
        plan.steps.push({ do: "scorecards", sheet: sh.name, measures: ms.slice(0, 4), by: s.by ? colName(sh, s.by) : undefined }); return; }
      case "analysis": case "clean": case "unpivot": { const sh = findSheet(known, s.sheet); if (!sh) return err("sheet “" + s.sheet + "” doesn't exist."); plan.steps.push({ do: s.do, sheet: sh.name } as Step); return; }
      case "bridge": { const sh = findSheet(known, s.sheet); if (!sh) return err("sheet “" + s.sheet + "” doesn't exist."); if (!hasCol(sh, s.measure) || !hasCol(sh, s.period)) return err("choose a measure and a period column that exist.");
        plan.steps.push({ do: "bridge", sheet: sh.name, measure: colName(sh, s.measure), period: colName(sh, s.period), from: s.from ? String(s.from) : undefined, to: s.to ? String(s.to) : undefined, by: (Array.isArray(s.by) ? s.by : []).filter((b: string) => hasCol(sh, b)).map((b: string) => colName(sh, b)) }); return; }
      case "format": { const sh = findSheet(known, s.sheet); if (!sh) return err("sheet “" + s.sheet + "” doesn't exist."); if (!parseRange(s.range)) return err("“" + s.range + "” isn't a valid range.");
        if (s.numberFormat && !NUMFMT.test(String(s.numberFormat))) return err("number format “" + s.numberFormat + "” isn't allowed (use #,##0, 0.0%, yyyy-mm-dd…).");
        plan.steps.push({ do: "format", sheet: sh.name, range: String(s.range).toUpperCase(), numberFormat: s.numberFormat, bold: !!s.bold, fill: /^#[0-9a-f]{6}$/i.test(s.fill || "") ? s.fill : undefined }); return; }
      case "chart": { const sh = findSheet(known, s.sheet); if (!sh) return err("sheet “" + s.sheet + "” doesn't exist."); if (!hasCol(sh, s.x)) return err("column “" + s.x + "” isn't in " + sh.name + "."); if (s.y && !hasCol(sh, s.y)) return err("column “" + s.y + "” isn't in " + sh.name + ".");
        const y = s.y ? colName(sh, s.y) : undefined; const agg = y && sh.averaged.includes(y) ? "avg" : ["sum", "avg", "count"].includes(s.agg) ? s.agg : y ? "sum" : "count";
        plan.steps.push({ do: "chart", sheet: sh.name, type: CHARTS.includes(s.type) ? s.type : "column", x: colName(sh, s.x), y, agg, split: s.split && hasCol(sh, s.split) ? colName(sh, s.split) : undefined }); return; }
      case "report": plan.steps.push({ do: "report", format: s.format === "pptx" ? "pptx" : "pdf" }); return;
      default: err("unknown step “" + String(s?.do) + "” was ignored.");
    } });
  return plan;
}
export function describeStep(s: Step): string {
  switch (s.do) {
    case "newSheet": return "Create sheet “" + s.name + "” (" + s.rows.length + " rows × " + Math.max(...s.rows.map((r) => r.length)) + " columns, " + s.rows.flat().filter((v) => typeof v === "string" && v.startsWith("=")).length + " formulas).";
    case "formulaColumn": return "In “" + s.sheet + "”, add column " + s.column + " “" + s.header + "”: " + s.template.replace(/\{r\}/g, "2") + " copied to every row.";
    case "pivot": return "Pivot “" + s.sheet + "”: " + ({ sum: "Sum", count: "Count", avg: "Average", min: "Min", max: "Max" } as any)[s.agg] + (s.value ? " of " + s.value : "") + " by " + s.rows + (s.cols ? " and " + s.cols : "") + ".";
    case "scorecards": return "Dashboard sheet from “" + s.sheet + "”: KPI cards for " + s.measures.join(", ") + (s.by ? ", broken down by " + s.by : "") + " (live formulas).";
    case "analysis": return "Analysis sheet for “" + s.sheet + "” (totals, averages, breakdown as formulas).";
    case "clean": return "Clean “" + s.sheet + "”: fix spaces, spelling variants and numbers stored as text.";
    case "unpivot": return "Convert “" + s.sheet + "” from months-across to rows (long format).";
    case "bridge": return "Variance bridge of " + s.measure + " in “" + s.sheet + "”" + (s.from && s.to ? ", " + s.from + " → " + s.to : ", last two periods") + ".";
    case "format": return "Format " + s.range + " in “" + s.sheet + "”" + (s.numberFormat ? " as " + s.numberFormat : "") + (s.bold ? ", bold" : "") + (s.fill ? ", shaded" : "") + ".";
    case "chart": return "Chart: " + s.type + " of " + (s.y ? (s.agg === "avg" ? "average " : "total ") + s.y : "row count") + " by " + s.x + (s.split ? " split by " + s.split : "") + " (added to the report).";
    case "report": return "Build the " + (s.format === "pptx" ? "PowerPoint" : "PDF") + " report from the charts.";
    case "answer": return s.text.slice(0, 200) + (s.text.length > 200 ? "…" : "");
  }
}
// Dashboard sheet: live formulas when the data block is clean, computed values otherwise.
export function scorecardRows(sheet: string, t: Table, measures: string[], averaged: string[], by?: string): Cell[][] {
  const lr = liveRange(t, sheet); const ci = (h: string) => t.headers.indexOf(h); const ref = (h: string) => lr!.ref(ci(h));
  const vals = (h: string, rows = t.rows) => rows.map((r) => toNum(r[ci(h)])).filter((x): x is number => x !== null);
  const total = (h: string, rows = t.rows) => vals(h, rows).reduce((a, b) => a + b, 0), avg = (h: string, rows = t.rows) => { const v = vals(h, rows); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  const out: Cell[][] = [["Dashboard: " + sheet + (lr ? "" : " (values computed now; the data has total or blank rows inside it)")], [], ["Measure", "Value", "How it is calculated"]];
  measures.forEach((m) => out.push([averaged.includes(m) ? "Average " + m : "Total " + m, lr ? (averaged.includes(m) ? "=IFERROR(AVERAGE(" + ref(m) + "),0)" : "=SUM(" + ref(m) + ")") : averaged.includes(m) ? avg(m) : total(m), averaged.includes(m) ? "Average (never added up)" : "Sum of all rows"]));
  out.push(["Rows", lr ? "=COUNTA(" + ref(t.headers[0]) + ")" : t.rows.length, "Count of records"]);
  if (by) { const keys = groupBy(t, ci(by), measures[0] && !averaged.includes(measures[0]) ? ci(measures[0]) : -1, measures[0] && !averaged.includes(measures[0]) ? "sum" : "count").sort((a, b) => b.value - a.value).map((g) => g.key).filter((k) => k !== "(blank)").slice(0, 30);
    out.push([], [by, ...measures.map((m) => (averaged.includes(m) ? "Avg " : "") + m), measures[0] && !averaged.includes(measures[0]) ? "Share of " + measures[0] : ""]); const start = out.length + 1;
    keys.forEach((v, i) => { const r = start + i; const sub = t.rows.filter((row) => String(row[ci(by)] ?? "").trim() === v);
      out.push([v, ...measures.map((m) => (lr ? (averaged.includes(m) ? "=IFERROR(AVERAGEIFS(" + ref(m) + "," + ref(by) + ",$A" + r + "),0)" : "=SUMIFS(" + ref(m) + "," + ref(by) + ",$A" + r + ")") : averaged.includes(m) ? avg(m, sub) : total(m, sub))),
        measures[0] && !averaged.includes(measures[0]) ? (lr ? "=IFERROR(B" + r + "/SUM(" + ref(measures[0]) + "),0)" : total(measures[0]) ? total(measures[0], sub) / total(measures[0]) : 0) : ""]); }); }
  return out;
}

// ════════════ 2. FILL WITH AI ════════════
export const FILL_SYSTEM = "You fill one spreadsheet column, row by row. You receive an instruction and numbered input rows. Reply ONLY with a JSON array of strings, exactly one per input row, in the same order. Keep each answer short (under 80 characters). If an input is empty or you cannot tell, return \"\". Never invent facts that are not in the row.";
export function fillPrompt(instruction: string, cols: string[], rows: Cell[][], allowed?: string[]): string {
  return "Instruction: " + instruction + (allowed && allowed.length ? "\nAnswer with exactly one of: " + allowed.join(" | ") : "") + "\nInput columns: " + cols.join(" | ") + "\nRows:\n" + rows.map((r, i) => (i + 1) + ". " + r.map((v) => String(v ?? "").replace(/\s+/g, " ").slice(0, 200)).join(" | ")).join("\n");
}
export function parseFill(text: string, n: number, allowed?: string[]): { values: string[]; problems: string[] } {
  const problems: string[] = []; let arr: any;
  try { const raw = String(text || "").replace(/```json|```/g, ""); arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1)); } catch { return { values: Array(n).fill(""), problems: ["The AI's reply could not be read; these rows were left blank."] }; }
  if (!Array.isArray(arr)) return { values: Array(n).fill(""), problems: ["The AI didn't return a list."] };
  if (arr.length !== n) problems.push("Expected " + n + " answers, got " + arr.length + "; " + (arr.length < n ? "missing ones left blank." : "extras ignored."));
  const norm = (s: string) => s.trim().toLowerCase(); const values = Array.from({ length: n }, (_, i) => { let v = String(arr[i] ?? "").slice(0, 200).trim();
    if (allowed && allowed.length && v) { const hit = allowed.find((a) => norm(a) === norm(v)); if (!hit) { problems.push("Row " + (i + 1) + ": “" + v + "” isn't one of the allowed values; left blank."); v = ""; } else v = hit; } return v; });
  return { values, problems: problems.slice(0, 8) };
}
export const FILL_BATCH = 40;

// ════════════ 3. TEXT → TABLE ════════════
export function textToTable(text: string): { rows: Cell[][]; how: string } | null {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  if (lines.length < 2) return null; const toCell = (s: string): Cell => { const t = s.trim(); const n = t.replace(/[,₹$\s]/g, ""); return t !== "" && /^-?\d+(\.\d+)?$/.test(n) && !/^0\d/.test(n) ? Number(n) : t; };
  for (const [sep, how] of [["\t", "tab-separated"], ["|", "pipe-separated"], [";", "semicolon-separated"], [",", "comma-separated"]] as const) {
    const parts = lines.map((l) => l.split(sep).map((x) => x.trim())).map((r) => (sep === "|" ? r.filter((x, i, a) => !((i === 0 || i === a.length - 1) && x === "")) : r)).filter((r) => !(sep === "|" && r.every((x) => /^:?-{2,}:?$/.test(x))));
    const w = parts[0].length; if (w >= 2 && parts.filter((r) => r.length === w).length >= parts.length * 0.8) return { rows: parts.map((r) => r.map(toCell)), how };
  }
  const multi = lines.map((l) => l.trim().split(/\s{2,}/)); const w = multi[0].length; if (w >= 2 && multi.filter((r) => r.length === w).length >= multi.length * 0.8) return { rows: multi.map((r) => r.map(toCell)), how: "aligned columns" };
  const kv = lines.map((l) => l.match(/^\s*([^:]{1,40}):\s*(.+)$/)); if (kv.filter(Boolean).length >= lines.length * 0.8) { const rec: Record<string, Cell>[] = []; let cur: Record<string, Cell> = {};
    for (const m of kv) { if (!m) continue; const k = m[1].trim(); if (k in cur) { rec.push(cur); cur = {}; } cur[k] = toCell(m[2]); } rec.push(cur); const keys = Array.from(new Set(rec.flatMap((r) => Object.keys(r)))); return { rows: [keys, ...rec.map((r) => keys.map((k) => r[k] ?? null))], how: "label: value lines" }; }
  return null;
}
export const TEXT_SYSTEM = "Convert the pasted text into one clean table. Reply ONLY with JSON {\"headers\":[...],\"rows\":[[...],...]}. Copy values exactly as written (numbers as numbers, without currency symbols or thousands separators); do not invent, calculate or summarise anything. Use short, clear headers.";
export function parseTextTable(text: string): Cell[][] | null { try { const raw = String(text || "").replace(/```json|```/g, ""); const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); if (!Array.isArray(j.headers) || !Array.isArray(j.rows)) return null;
  const w = j.headers.length; return [j.headers.map(String), ...j.rows.filter((r: any) => Array.isArray(r)).slice(0, 2000).map((r: any[]) => Array.from({ length: w }, (_, i) => { const v = r[i]; return v === null || v === undefined ? null : typeof v === "number" ? v : String(v).slice(0, 300); }))]; } catch { return null; } }

// ════════════ 4. FORMULA DOCTOR ════════════
export const KNOWN_FUNCTIONS = ["SUM", "SUMIF", "SUMIFS", "SUMPRODUCT", "AVERAGE", "AVERAGEIF", "AVERAGEIFS", "COUNT", "COUNTA", "COUNTIF", "COUNTIFS", "COUNTBLANK", "MIN", "MAX", "MINIFS", "MAXIFS", "ROUND", "ROUNDUP", "ROUNDDOWN", "INT", "ABS", "IF", "IFS", "IFERROR", "IFNA", "AND", "OR", "NOT", "VLOOKUP", "HLOOKUP", "XLOOKUP", "INDEX", "MATCH", "XMATCH", "LOOKUP", "CHOOSE", "TEXT", "VALUE", "LEFT", "RIGHT", "MID", "LEN", "TRIM", "UPPER", "LOWER", "PROPER", "CONCAT", "CONCATENATE", "TEXTJOIN", "SUBSTITUTE", "FIND", "SEARCH", "DATE", "TODAY", "NOW", "YEAR", "MONTH", "DAY", "EOMONTH", "EDATE", "DATEDIF", "NETWORKDAYS", "WEEKDAY", "PMT", "IPMT", "PPMT", "NPV", "IRR", "XNPV", "XIRR", "FV", "PV", "RATE", "NPER", "MEDIAN", "MODE", "STDEV", "STDEV.S", "PERCENTILE", "RANK", "LARGE", "SMALL", "UNIQUE", "FILTER", "SORT", "SEQUENCE", "LET", "ISBLANK", "ISNUMBER", "ISERROR", "ISTEXT", "MOD", "POWER", "SQRT", "EXP", "LN", "LOG", "SUBTOTAL", "OFFSET", "INDIRECT", "ROWS", "COLUMNS", "TRANSPOSE"];
const lev = (a: string, b: string) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
export interface Diagnosis { cell: string; formula: string; error: string; explain: string; fix: string | null; how: "rule" | "pattern" | "ai" | "none" }
// Turn a relative pattern back into an A1 formula for a given row/col (used to repair the odd formula in a column).
export function fromRelForm(rf: string, r: number, c: number): string { return rf.replace(/C(\[(-?\d+)\]|(\d+))R(\[(-?\d+)\]|(\d+))/g, (_m, _c, cRel, cAbs, _r, rRel, rAbs) => { const cc = cRel !== undefined ? c + Number(cRel) : Number(cAbs); const rr = rRel !== undefined ? r + Number(rRel) : Number(rAbs); return (cAbs !== undefined ? "$" : "") + colToLetters(cc) + (rAbs !== undefined ? "$" : "") + (rr + 1); }); }
export function diagnose(formulas: Cell[][], values: Cell[][]): Diagnosis[] {
  const out: Diagnosis[] = []; const cols = Math.max(0, ...formulas.map((r) => (r || []).length));
  const majority = (c: number) => { const cnt = new Map<string, number>(); let n = 0; for (let r = 0; r < formulas.length; r++) { const f = formulas[r]?.[c]; if (typeof f === "string" && f.startsWith("=") && !/^=\s*(SUM|SUBTOTAL|AVERAGE|COUNT)\(/i.test(f) && !/["]/.test(f)) { n++; const k = relForm(f, r, c); cnt.set(k, (cnt.get(k) || 0) + 1); } } const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]; return top && n >= 4 && top[1] / n >= 0.7 ? { rf: top[0], n: top[1] } : null; };
  const maj = Array.from({ length: cols }, (_, c) => majority(c));
  for (let r = 0; r < formulas.length; r++) for (let c = 0; c < (formulas[r] || []).length; c++) { const f = formulas[r][c]; if (typeof f !== "string" || !f.startsWith("=")) continue; const v = values[r]?.[c]; const cell = colToLetters(c) + (r + 1);
    const m = maj[c]; const odd = m && relForm(f, r, c) !== m.rf && !/^=\s*(SUM|SUBTOTAL|AVERAGE|COUNT)\(/i.test(f);
    const err = typeof v === "string" && /^#(REF!|NAME\?|DIV\/0!|VALUE!|N\/A|NUM!|NULL!)/.test(v) ? v : null;
    if (!err && !odd) continue;
    if (odd && m) { const fix = fromRelForm(m.rf, r, c); out.push({ cell, formula: f, error: err || "inconsistent", explain: "This formula differs from the " + m.n + " others in column " + colToLetters(c) + (err ? " and shows " + err : "") + ". Making it match the column usually fixes a broken copy.", fix, how: "pattern" }); continue; }
    if (err === "#DIV/0!") { out.push({ cell, formula: f, error: err, explain: "It divides by zero or by an empty cell (for example a month with no sales).", fix: "=IFERROR(" + f.slice(1) + ",0)", how: "rule" }); continue; }
    if (err === "#N/A" && /LOOKUP|MATCH|XLOOKUP|INDEX/i.test(f)) { out.push({ cell, formula: f, error: err, explain: "The lookup didn't find the value it was searching for.", fix: "=IFERROR(" + f.slice(1) + ",\"Not found\")", how: "rule" }); continue; }
    if (err === "#NAME?") { const names = (f.match(/[A-Z][A-Z0-9.]*(?=\s*\()/gi) || []).map((x) => x.toUpperCase()); const unknown = names.find((n) => !KNOWN_FUNCTIONS.includes(n));
      if (unknown) { const best = KNOWN_FUNCTIONS.map((k) => ({ k, d: lev(unknown, k) })).sort((a, b) => a.d - b.d)[0]; if (best && best.d <= 2) { out.push({ cell, formula: f, error: err, explain: "“" + unknown + "” isn't a function; it looks like a typo of " + best.k + ".", fix: f.replace(new RegExp("\\b" + unknown + "(?=\\s*\\()", "i"), best.k), how: "rule" }); continue; } }
      out.push({ cell, formula: f, error: err, explain: "The formula uses a name the spreadsheet doesn't recognise (a typo, or text without quotes).", fix: null, how: "ai" }); continue; }
    if (err === "#VALUE!") { out.push({ cell, formula: f, error: err, explain: "It does arithmetic on text, often a number stored as text or a stray space. Data health can convert those.", fix: null, how: "ai" }); continue; }
    if (err === "#REF!") { out.push({ cell, formula: f, error: err, explain: "It points to cells that were deleted. The original reference has to be rebuilt.", fix: null, how: "ai" }); continue; }
    out.push({ cell, formula: f, error: err || "", explain: "The formula returns " + err + ".", fix: null, how: "ai" }); }
  return out;
}
export const DOCTOR_SYSTEM = "You fix one broken spreadsheet formula. You receive the cell, its formula, the error, the column header and the formulas in the cells around it. Reply ONLY with JSON {\"fix\":\"=...\",\"why\":\"one sentence\"} or {\"fix\":null,\"why\":\"what the user must decide\"}. Keep the formula's purpose; never use WEBSERVICE, IMPORT* or HYPERLINK.";
export function parseDoctor(text: string): { fix: string | null; why: string } { try { const raw = String(text || "").replace(/```json|```/g, ""); const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); const fx = typeof j.fix === "string" && j.fix.startsWith("=") && !checkFormula(j.fix) ? j.fix : null; return { fix: fx, why: String(j.why || "").slice(0, 300) || (fx ? "" : "No safe fix proposed.") }; } catch { return { fix: null, why: "The AI's reply could not be read." }; } }

// ════════════ 5. WHAT-IF & GOAL SEEK ════════════
// evaluate(x) sets the input, lets the sheet recalculate, and returns the output.
export function sensitivitySteps(base: number, pcts = [-20, -10, -5, 0, 5, 10, 20]): { pct: number; input: number }[] { return pcts.map((p) => ({ pct: p, input: +(base * (1 + p / 100)).toFixed(10) })); }
export async function goalSeek(evaluate: (x: number) => Promise<number>, target: number, start: number, opts: { tol?: number; maxIter?: number } = {}): Promise<{ ok: boolean; x: number; y: number; iterations: number; why?: string }> {
  const tol = opts.tol ?? Math.max(1e-6, Math.abs(target) * 1e-6), maxIter = opts.maxIter ?? 60; let iterations = 0; const f = async (x: number) => { iterations++; return (await evaluate(x)) - target; };
  // 1) bracket the root by expanding outwards from the start value
  let a = start, fa = await f(a); if (Math.abs(fa) <= tol) return { ok: true, x: a, y: fa + target, iterations };
  let step = Math.abs(start) > 0 ? Math.abs(start) * 0.1 : 1, b = a, fb = fa, found = false;
  for (let k = 0; k < 40 && !found; k++) { for (const dir of [1, -1]) { const x = start + dir * step; const fx = await f(x); if (Math.sign(fx) !== Math.sign(fa)) { b = x; fb = fx; found = true; break; } } step *= 2; }
  if (!found) return { ok: false, x: start, y: fa + target, iterations, why: "No input value in a wide range reaches the target; the output may not depend on this input, or the target is out of reach." };
  // 2) bisection, safe for any monotonic stretch
  for (let i = 0; i < maxIter; i++) { const m = (a + b) / 2, fm = await f(m); if (Math.abs(fm) <= tol || Math.abs(b - a) < 1e-9 * Math.max(1, Math.abs(m))) return { ok: true, x: m, y: fm + target, iterations }; if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { b = m; fb = fm; } }
  void fb; return { ok: true, x: (a + b) / 2, y: (await f((a + b) / 2)) + target, iterations };
}
export const isCellRef = (s: string) => !!parseCell(s);
