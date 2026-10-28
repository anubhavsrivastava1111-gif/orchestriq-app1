// SHEETS ENGINE - pure, testable logic behind OrchestrIQ Sheets (no UI, no Univer import).
// - Converts between a simple grid model, Univer workbook snapshots, Excel (.xlsx) and CSV.
// - Ready business templates built from real, recalculating formulas.
// - Importers that turn OrchestrIQ module data into sheets.
// - The AI automation contract: the AI may only PROPOSE a plan made of a few safe,
//   validated operation types; the user approves before anything changes; the AI writes
//   formulas, the spreadsheet calculates (no AI-generated numbers).

export type Cell = string | number | boolean | null;
// formats: number formats by cell or range, e.g. { "B4": "#,##0.00", "B7:E18": "#,##0.00", "E2:E7": "0.0%" }
export interface SheetGrid { name: string; rows: Cell[][]; formats?: Record<string, string> }
export interface WorkbookGrid { name: string; sheets: SheetGrid[] }

// ── A1 helpers ──
export function colToLetters(c: number): string { let s = ""; c += 1; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
export function lettersToCol(l: string): number { let n = 0; for (const ch of l.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
export function parseCell(a1: string): { r: number; c: number } | null { const m = String(a1 || "").trim().toUpperCase().match(/^\$?([A-Z]{1,3})\$?(\d{1,7})$/); if (!m) return null; const r = parseInt(m[2], 10) - 1, c = lettersToCol(m[1]); return r >= 0 && c >= 0 && c < 16384 && r < 1048576 ? { r, c } : null; }
export function parseRange(a1: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const [a, b] = String(a1 || "").split(":"); const p = parseCell(a); const q = b ? parseCell(b) : p; if (!p || !q) return null;
  return { r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) };
}
export const isFormula = (v: Cell) => typeof v === "string" && v.startsWith("=");

// ── Univer snapshot <-> grid ──
export function gridToSnapshot(wb: WorkbookGrid, id = "wb-" + Date.now()): any {
  const sheets: any = {}; const sheetOrder: string[] = []; const styles: any = {}; const styleId = (pattern: string) => { const k = "nf-" + pattern.replace(/[^A-Za-z0-9]/g, "_"); styles[k] = { n: { pattern } }; return k; };
  wb.sheets.forEach((s, i) => {
    const sid = "sheet-" + (i + 1); sheetOrder.push(sid); const cellData: any = {};
    s.rows.forEach((row, r) => row.forEach((v, c) => {
      if (v === null || v === undefined || v === "") return;
      (cellData[r] = cellData[r] || {})[c] = isFormula(v) ? { f: v } : typeof v === "number" ? { v, t: 2 } : typeof v === "boolean" ? { v, t: 3 } : { v: String(v), t: 1 };
    }));
    for (const [ref, pattern] of Object.entries(s.formats || {})) { const rg = parseRange(ref); if (!rg || !pattern) continue; const sidStyle = styleId(pattern);
      for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) { const row = (cellData[r] = cellData[r] || {}); row[c] = { ...(row[c] || {}), s: sidStyle }; } }
    const maxC = Math.max(0, ...s.rows.map((r) => r.length));
    sheets[sid] = { id: sid, name: s.name || "Sheet" + (i + 1), rowCount: Math.max(100, s.rows.length + 50), columnCount: Math.max(26, maxC + 5), cellData };
  });
  return { id, name: wb.name, sheetOrder, sheets, locale: "enUS", styles };
}
export function snapshotToGrid(snap: any): WorkbookGrid {
  const order: string[] = snap?.sheetOrder || Object.keys(snap?.sheets || {});
  return { name: snap?.name || "Workbook", sheets: order.map((sid) => { const s = snap.sheets[sid] || {}; const rows: Cell[][] = [];
    for (const [rk, cols] of Object.entries<any>(s.cellData || {})) { const r = Number(rk); for (const [ck, cell] of Object.entries<any>(cols || {})) { const c = Number(ck); if (!cell) continue;
      const v: Cell = cell.f ? String(cell.f) : cell.si && cell.f === undefined && cell.v !== undefined ? cell.v : cell.v === undefined ? null : cell.v;
      if (v === null || v === undefined || v === "") continue; while (rows.length <= r) rows.push([]); const row = rows[r]; while (row.length <= c) row.push(null); row[c] = v; } }
    return { name: s.name || sid, rows }; }) };
}
// Computed values alongside formulas (for AI context and error checks).
export function snapshotValues(snap: any, sheetIndex = 0): Cell[][] {
  const sid = (snap?.sheetOrder || Object.keys(snap?.sheets || {}))[sheetIndex]; const s = snap?.sheets?.[sid] || {}; const rows: Cell[][] = [];
  for (const [rk, cols] of Object.entries<any>(s.cellData || {})) { const r = Number(rk); for (const [ck, cell] of Object.entries<any>(cols || {})) { const c = Number(ck);
    while (rows.length <= r) rows.push([]); const row = rows[r]; while (row.length <= c) row.push(null); row[c] = cell?.v === undefined ? null : cell.v; } }
  return rows;
}

// ── CSV ──
export function parseCsv(text: string): Cell[][] {
  const s = String(text || "").replace(/^\ufeff/, ""); const head = s.split(/\r?\n/)[0] || ""; const cnt = (ch: string) => head.split(ch).length - 1;
  const sep = cnt(",") >= cnt(";") && cnt(",") >= cnt("\t") ? "," : cnt(";") >= cnt("\t") ? ";" : "\t";
  const out: Cell[][] = []; let row: Cell[] = [], cell = "", q = false;
  const push = () => { const t = cell; row.push(t !== "" && /^-?\d+(\.\d+)?$/.test(t.trim()) && !/^0\d/.test(t.trim()) ? Number(t) : t); cell = ""; };
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) push(); else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; push(); if (row.some((c) => c !== "")) out.push(row); row = []; } else cell += ch; }
  push(); if (row.some((c) => c !== "")) out.push(row); return out;
}
export function gridToCsv(rows: Cell[][]): string { return rows.map((r) => r.map((v) => { const t = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(",")).join("\n"); }

// ── Excel (.xlsx) via ExcelJS (passed in, so this file stays dependency-free) ──
export async function xlsxToGrid(ExcelJS: any, data: ArrayBuffer, name = "Imported"): Promise<WorkbookGrid> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(data); const sheets: SheetGrid[] = [];
  wb.eachSheet((ws: any) => { const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row: any, rn: number) => { const out: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell: any, cn: number) => { let v: Cell = null; const raw = cell.value;
        const f = cell.formula || (raw && typeof raw === "object" && (raw.formula || raw.sharedFormula));
        if (f) v = "=" + String(cell.formula || raw.formula || raw.sharedFormula).replace(/^=/, "");
        else if (raw === null || raw === undefined) v = null;
        else if (raw instanceof Date) v = raw.toISOString().slice(0, 10);
        else if (typeof raw === "object" && raw.richText) v = raw.richText.map((t: any) => t.text).join("");
        else if (typeof raw === "object" && "text" in raw) v = String(raw.text);
        else if (typeof raw === "object" && "error" in raw) v = String(raw.error);
        else if (typeof raw === "object" && "result" in raw) v = raw.result as Cell;
        else v = raw as Cell;
        while (out.length < cn - 1) out.push(null); out[cn - 1] = v; });
      while (rows.length < rn - 1) rows.push([]); rows[rn - 1] = out; });
    sheets.push({ name: ws.name, rows }); });
  return { name, sheets: sheets.length ? sheets : [{ name: "Sheet1", rows: [] }] };
}
export async function gridToXlsx(ExcelJS: any, wb: WorkbookGrid, values?: Cell[][][]): Promise<ArrayBuffer> {
  const x = new ExcelJS.Workbook(); x.creator = "OrchestrIQ Sheets";
  wb.sheets.forEach((s, si) => { const ws = x.addWorksheet((s.name || "Sheet" + (si + 1)).slice(0, 31));
    s.rows.forEach((row, r) => row.forEach((v, c) => { if (v === null || v === undefined || v === "") return; const cell = ws.getCell(r + 1, c + 1);
      if (isFormula(v)) { const res = values?.[si]?.[r]?.[c]; cell.value = { formula: String(v).slice(1), result: res === null || res === undefined ? undefined : res }; }
      else cell.value = v; }));
    ws.columns?.forEach((col: any) => { col.width = 16; }); });
  return await x.xlsx.writeBuffer();
}

// ── Templates (formulas recalculate; tested against hand calculations) ──
export interface Template { id: string; name: string; why: string; build: () => WorkbookGrid }
export const TEMPLATES: Template[] = [
  { id: "budget", name: "Budget vs actual", why: "See where spending is over or under plan, by category, with variance and status.", build: () => ({ name: "Budget vs actual", sheets: [{ name: "Budget", rows: [
    ["Category", "Budget", "Actual", "Variance", "Variance %", "Status"],
    ...[["Salaries", 500000, 520000], ["Rent", 120000, 120000], ["Marketing", 80000, 65000], ["Travel", 40000, 52000], ["Software", 30000, 28000]].map((r, i) => {
      const n = i + 2; return [r[0], r[1], r[2], "=C" + n + "-B" + n, "=IF(B" + n + "=0,\"\",D" + n + "/B" + n + ")", "=IF(D" + n + ">0,\"Over budget\",\"Within budget\")"] as Cell[]; }),
    ["Total", "=SUM(B2:B6)", "=SUM(C2:C6)", "=C7-B7", "=IF(B7=0,\"\",D7/B7)", "=IF(D7>0,\"Over budget\",\"Within budget\")"]], formats: { "B2:D7": "#,##0", "E2:E7": "0.0%" } }] }) },
  { id: "cashflow", name: "12-month cash flow", why: "Track opening cash, receipts, payments and closing cash month by month.", build: () => {
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]; const L = (i: number) => colToLetters(i + 1);
    const header: Cell[] = ["Particulars", ...months];
    const opening: Cell[] = ["Opening cash", 1000000, ...months.slice(1).map((_, i) => "=" + L(i) + "6")];
    const receipts: Cell[] = ["Receipts", ...months.map(() => 400000)]; const payments: Cell[] = ["Payments", ...months.map(() => 350000)];
    const net: Cell[] = ["Net cash flow", ...months.map((_, i) => "=" + L(i) + "3-" + L(i) + "4")];
    const closing: Cell[] = ["Closing cash", ...months.map((_, i) => "=" + L(i) + "2+" + L(i) + "5")];
    return { name: "Cash flow", sheets: [{ name: "Cash flow", rows: [header, opening, receipts, payments, net, closing], formats: { "B2:M6": "#,##0" } }] }; } },
  { id: "invoices", name: "Invoice register with duplicate check", why: "Log supplier invoices; possible duplicates (same vendor and amount) and missing POs are flagged automatically.", build: () => ({ name: "Invoice register", sheets: [{ name: "Invoices", rows: [
    ["Invoice no", "Vendor", "Date", "Amount", "PO number", "Duplicate?", "PO check"],
    ...[["INV-778", "Acme Supplies", "2026-08-02", 125000, "PO4501"], ["INV778", "Acme Supplies", "2026-08-02", 125000, ""], ["B-101", "Beta Services", "2026-08-05", 46000, "PO4502"], ["C-55", "Gamma Print", "2026-08-09", 18000, ""]].map((r, i) => {
      const n = i + 2; return [...r, "=IF(COUNTIFS(B$2:B$200,B" + n + ",D$2:D$200,D" + n + ")>1,\"Check\",\"\")", "=IF(E" + n + "=\"\",\"No PO\",\"\")"] as Cell[]; })] }] }) },
  { id: "emi", name: "Loan EMI schedule", why: "Monthly instalment, interest and principal for a term loan; change the inputs and everything recalculates.", build: () => {
    const rows: Cell[][] = [["Loan amount", 1000000], ["Annual interest %", 12], ["Tenure (months)", 12], ["Monthly EMI", "=PMT(B2/100/12,B3,-B1)"], [],
      ["Month", "Opening", "Interest", "Principal", "Closing"]];
    for (let m = 1; m <= 12; m++) { const n = 6 + m; rows.push([m, m === 1 ? "=B1" : "=E" + (n - 1), "=B" + n + "*$B$2/100/12", "=$B$4-C" + n, "=B" + n + "-D" + n]); }
    return { name: "Loan EMI", sheets: [{ name: "EMI", rows, formats: { "B1": "#,##0", "B4": "#,##0.00", "B7:E18": "#,##0.00" } }] }; } },
  { id: "gst", name: "GST invoice calculator", why: "Taxable value, GST and total per line, with a totals row.", build: () => ({ name: "GST calculator", sheets: [{ name: "GST", rows: [
    ["Item", "Qty", "Rate", "Taxable value", "GST %", "GST amount", "Total"],
    ...[["Consulting hours", 10, 2500, 18], ["Software licence", 2, 12000, 18], ["Printed manuals", 50, 120, 12]].map((r, i) => { const n = i + 2; return [r[0], r[1], r[2], "=B" + n + "*C" + n, r[3], "=D" + n + "*E" + n + "/100", "=D" + n + "+F" + n] as Cell[]; }),
    ["Total", "", "", "=SUM(D2:D4)", "", "=SUM(F2:F4)", "=SUM(G2:G4)"]], formats: { "C2:D5": "#,##0.00", "F2:G5": "#,##0.00" } }] }) },
];

// ── Module importers (pure: callers pass the module data) ──
export function ledgerToGrid(entries: { id: number; date: string; narration: string; lines: { accountCode: string; debit: number; credit: number }[] }[], accountName: (code: string) => string): WorkbookGrid {
  const rows: Cell[][] = [["Date", "Entry", "Narration", "Account code", "Account", "Debit", "Credit"]];
  for (const e of entries || []) for (const l of e.lines || []) rows.push([e.date, e.id, e.narration, l.accountCode, accountName(l.accountCode), Number(l.debit) || 0, Number(l.credit) || 0]);
  const last = rows.length; rows.push(["Total", "", "", "", "", "=SUM(F2:F" + last + ")", "=SUM(G2:G" + last + ")"], ["Difference (must be 0)", "", "", "", "", "=F" + (last + 1) + "-G" + (last + 1)]);
  return { name: "Ledger export", sheets: [{ name: "Journal", rows }] };
}
export function pairsToGrid(title: string, items: { label: string; value: Cell; source?: string }[]): WorkbookGrid {
  return { name: title, sheets: [{ name: "Data", rows: [["Item", "Value", "Source"], ...items.map((i) => [i.label, i.value, i.source || ""] as Cell[])] }] };
}
export function tableToGrid(title: string, sheet: string, header: string[], rows: Cell[][]): WorkbookGrid { return { name: title, sheets: [{ name: sheet, rows: [header, ...rows] }] }; }

// ── AI automation: context, contract, validation ──
export function buildContext(values: Cell[][], formulas: Cell[][], sheetName: string, maxRows = 20): string {
  const rows = Math.max(values.length, formulas.length); const cols = Math.max(0, ...[...values, ...formulas].map((r) => (r || []).length));
  if (!rows) return "Sheet \"" + sheetName + "\" is empty.";
  const show = (r: number) => "Row " + (r + 1) + ": " + Array.from({ length: cols }, (_, c) => { const f = formulas[r]?.[c]; const v = values[r]?.[c];
    return colToLetters(c) + "=" + (isFormula(f as Cell) ? String(f) + " (→ " + String(v ?? "") + ")" : String(v ?? f ?? "")).slice(0, 40); }).join(" | ");
  const idx = rows <= maxRows + 3 ? Array.from({ length: rows }, (_, i) => i) : [...Array.from({ length: maxRows }, (_, i) => i), rows - 3, rows - 2, rows - 1];
  return "Sheet \"" + sheetName + "\": " + rows + " rows × " + cols + " columns (A–" + colToLetters(Math.max(0, cols - 1)) + "). Row 1 is usually the header.\n" + idx.map(show).join("\n");
}
export const AI_SYSTEM = `You are a spreadsheet automation assistant inside OrchestrIQ Sheets. You NEVER calculate numbers yourself: you write spreadsheet formulas and the spreadsheet calculates.
Reply with ONLY a JSON object, no prose, no markdown fences:
{"summary":"one sentence describing the change in plain English","ops":[ ... ]}
Allowed ops (use the fewest needed):
{"op":"fillFormula","column":"F","fromRow":2,"toRow":20,"template":"=D{r}*18%","header":"GST"}  // writes the template in each row, {r} = row number; header (optional) goes in row 1
{"op":"setFormula","cell":"F21","formula":"=SUM(F2:F20)"}
{"op":"setValues","start":"A1","values":[["Label",123]]}            // labels or user-supplied inputs only
{"op":"highlight","range":"A2:G20","column":"D","condition":"gt|lt|eq|contains|blank|duplicate","value":0,"color":"#FDE68A"}  // colours whole rows where the column meets the condition
{"op":"sort","range":"A2:G20","column":"C","order":"asc|desc"}          // only for ranges without formulas
{"op":"answer","text":"..."}                                          // for questions: explain, do not change the sheet
Rules: use real A1 references from the context; prefer Excel-compatible functions (SUM, SUMIF, SUMIFS, COUNTIF, COUNTIFS, IF, IFERROR, AVERAGE, ROUND, VLOOKUP, XLOOKUP, INDEX, MATCH, PMT, TODAY, DATEDIF, TEXT, LEFT, RIGHT, MID, LEN, UPPER, TRIM); never use WEBSERVICE, IMPORTDATA, IMPORTXML, IMPORTHTML, IMPORTRANGE, HYPERLINK, FILTERXML or macros; if the request is unclear or impossible, return only an "answer" op explaining what you need.`;
export const BLOCKED_FUNCTIONS = ["WEBSERVICE", "IMPORTDATA", "IMPORTXML", "IMPORTHTML", "IMPORTFEED", "IMPORTRANGE", "HYPERLINK", "FILTERXML", "CALL", "REGISTER", "EXEC", "RTD", "DDE"];
export const MAX_CELLS = 5000, MAX_OPS = 20;

export type Op =
  | { op: "fillFormula"; column: string; fromRow: number; toRow: number; template: string; header?: string }
  | { op: "setFormula"; cell: string; formula: string }
  | { op: "setValues"; start: string; values: Cell[][] }
  | { op: "highlight"; range: string; column: string; condition: "gt" | "lt" | "eq" | "contains" | "blank" | "duplicate"; value?: Cell; color?: string }
  | { op: "sort"; range: string; column: string; order: "asc" | "desc" }
  | { op: "answer"; text: string };
export interface Plan { summary: string; ops: Op[]; errors: string[]; answer?: string }

export function checkFormula(f: string): string | null {
  if (typeof f !== "string" || !f.startsWith("=")) return "A formula must start with '='.";
  if (f.length > 2000) return "Formula is too long.";
  const up = f.toUpperCase().replace(/"[^"]*"/g, "\"\"");
  const bad = BLOCKED_FUNCTIONS.find((fn) => new RegExp("\\b" + fn + "\\s*\\(").test(up));
  if (bad) return "Blocked function " + bad + "(): it could reach outside the sheet.";
  let depth = 0; for (const ch of up) { if (ch === "(") depth++; if (ch === ")") depth--; if (depth < 0) return "Unbalanced brackets."; }
  return depth === 0 ? null : "Unbalanced brackets.";
}
const colOk = (c: any) => typeof c === "string" && /^[A-Z]{1,3}$/i.test(c.trim());
const colorOk = (c: any) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

export function parsePlan(text: string): Plan {
  const plan: Plan = { summary: "", ops: [], errors: [] };
  let j: any; try { const raw = String(text || "").replace(/```json|```/g, ""); const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); j = JSON.parse(raw.slice(s, e + 1)); }
  catch { plan.errors.push("The AI's reply could not be read as a plan. Try rephrasing the request."); return plan; }
  plan.summary = String(j?.summary || "").slice(0, 300);
  const ops: any[] = Array.isArray(j?.ops) ? j.ops : []; if (!ops.length) plan.errors.push("The plan contains no operations.");
  if (ops.length > MAX_OPS) plan.errors.push("Too many operations (" + ops.length + "); the limit is " + MAX_OPS + ".");
  let cells = 0;
  for (const [i, o] of ops.slice(0, MAX_OPS).entries()) { const tag = "Step " + (i + 1) + ": ";
    if (o?.op === "answer") { if (typeof o.text === "string" && o.text.trim()) { plan.ops.push({ op: "answer", text: o.text.slice(0, 4000) }); plan.answer = (plan.answer ? plan.answer + "\n" : "") + o.text; } continue; }
    if (o?.op === "fillFormula") { const from = Math.floor(Number(o.fromRow)), to = Math.floor(Number(o.toRow));
      if (!colOk(o.column) || !(from >= 1) || !(to >= from)) { plan.errors.push(tag + "fillFormula needs a column and a valid row range."); continue; }
      if (typeof o.template !== "string" || !o.template.includes("{r}")) { plan.errors.push(tag + "fillFormula template must use {r} for the row number."); continue; }
      const err = checkFormula(o.template.replace(/\{r\}/g, String(from))); if (err) { plan.errors.push(tag + err); continue; }
      cells += to - from + 1; plan.ops.push({ op: "fillFormula", column: o.column.toUpperCase().trim(), fromRow: from, toRow: to, template: o.template, header: typeof o.header === "string" ? o.header.slice(0, 60) : undefined }); continue; }
    if (o?.op === "setFormula") { if (!parseCell(o.cell)) { plan.errors.push(tag + "invalid cell " + o.cell + "."); continue; } const err = checkFormula(o.formula); if (err) { plan.errors.push(tag + err); continue; }
      cells += 1; plan.ops.push({ op: "setFormula", cell: String(o.cell).toUpperCase(), formula: o.formula }); continue; }
    if (o?.op === "setValues") { const st = parseCell(o.start); const vals = Array.isArray(o.values) ? o.values : null;
      if (!st || !vals || !vals.every((r: any) => Array.isArray(r))) { plan.errors.push(tag + "setValues needs a start cell and rows of values."); continue; }
      const flat = vals.flat(); const fErr = flat.filter((v: any) => isFormula(v)).map((v: any) => checkFormula(v)).find(Boolean); if (fErr) { plan.errors.push(tag + fErr); continue; }
      if (flat.some((v: any) => v !== null && typeof v === "object")) { plan.errors.push(tag + "values must be text, numbers or formulas."); continue; }
      cells += flat.length; plan.ops.push({ op: "setValues", start: String(o.start).toUpperCase(), values: vals }); continue; }
    if (o?.op === "highlight") { const rg = parseRange(o.range); const conds = ["gt", "lt", "eq", "contains", "blank", "duplicate"];
      if (!rg || !colOk(o.column) || !conds.includes(o.condition)) { plan.errors.push(tag + "highlight needs a range, a column and a valid condition."); continue; }
      cells += (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1); plan.ops.push({ op: "highlight", range: String(o.range).toUpperCase(), column: o.column.toUpperCase(), condition: o.condition, value: o.value ?? null, color: colorOk(o.color) ? o.color : "#FDE68A" }); continue; }
    if (o?.op === "sort") { const rg = parseRange(o.range); if (!rg || !colOk(o.column)) { plan.errors.push(tag + "sort needs a range and a column."); continue; }
      cells += (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1); plan.ops.push({ op: "sort", range: String(o.range).toUpperCase(), column: o.column.toUpperCase(), order: o.order === "desc" ? "desc" : "asc" }); continue; }
    plan.errors.push(tag + "unknown operation \"" + String(o?.op) + "\" was ignored.");
  }
  if (cells > MAX_CELLS) { plan.errors.push("The plan would change " + cells + " cells; the limit is " + MAX_CELLS + ". Narrow the request."); plan.ops = plan.ops.filter((o) => o.op === "answer"); }
  return plan;
}

// Plain-English description of each step (shown before the user approves).
export function describeOp(o: Op): string {
  switch (o.op) {
    case "fillFormula": return (o.header ? "Add column " + o.column + " \u201c" + o.header + "\u201d: " : "Column " + o.column + ": ") + "formula " + o.template.replace(/\{r\}/g, String(o.fromRow)) + " in row " + o.fromRow + ", copied down to row " + o.toRow + ".";
    case "setFormula": return "Cell " + o.cell + ": formula " + o.formula + ".";
    case "setValues": return "Write " + o.values.flat().length + " value(s) starting at " + o.start + ".";
    case "highlight": return "Highlight rows in " + o.range + " where column " + o.column + " " + ({ gt: "is greater than " + o.value, lt: "is less than " + o.value, eq: "equals " + o.value, contains: "contains \u201c" + o.value + "\u201d", blank: "is blank", duplicate: "has a duplicate value" } as any)[o.condition] + ".";
    case "sort": return "Sort " + o.range + " by column " + o.column + (o.order === "desc" ? " (largest first)." : " (smallest first).");
    case "answer": return "Answer only (no change): " + o.text.slice(0, 160) + (o.text.length > 160 ? "\u2026" : "");
  }
}

// Expand ops into concrete cell writes. Values are only formulas/labels/inputs from the plan.
export interface Write { r: number; c: number; value: Cell }
export function expandWrites(o: Op): Write[] {
  if (o.op === "fillFormula") { const c = lettersToCol(o.column); const out: Write[] = [];
    if (o.header) out.push({ r: 0, c, value: o.header });
    for (let r = o.fromRow; r <= o.toRow; r++) out.push({ r: r - 1, c, value: o.template.replace(/\{r\}/g, String(r)) }); return out; }
  if (o.op === "setFormula") { const p = parseCell(o.cell)!; return [{ r: p.r, c: p.c, value: o.formula }]; }
  if (o.op === "setValues") { const p = parseCell(o.start)!; const out: Write[] = []; o.values.forEach((row, i) => row.forEach((v, j) => out.push({ r: p.r + i, c: p.c + j, value: v }))); return out; }
  return [];
}
// Which rows to colour, evaluated on the CURRENT computed values (a static highlight).
export function highlightRows(o: Extract<Op, { op: "highlight" }>, values: Cell[][]): number[] {
  const rg = parseRange(o.range)!; const col = lettersToCol(o.column); const vals: Cell[] = []; for (let r = rg.r1; r <= rg.r2; r++) vals.push(values[r]?.[col] ?? null);
  const num = (v: Cell) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && isFinite(Number(v)) ? Number(v) : NaN);
  const target = o.value as Cell; const seen = new Map<string, number>(); vals.forEach((v) => { const k = String(v ?? "").trim().toLowerCase(); if (k) seen.set(k, (seen.get(k) || 0) + 1); });
  const hit = (v: Cell) => { switch (o.condition) {
    case "gt": return num(v) > num(target); case "lt": return num(v) < num(target);
    case "eq": return isFinite(num(target)) && isFinite(num(v)) ? num(v) === num(target) : String(v ?? "").trim().toLowerCase() === String(target ?? "").trim().toLowerCase();
    case "contains": return String(v ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
    case "blank": return v === null || String(v).trim() === "";
    case "duplicate": { const k = String(v ?? "").trim().toLowerCase(); return !!k && (seen.get(k) || 0) > 1; } } };
  const out: number[] = []; vals.forEach((v, i) => { if (hit(v)) out.push(rg.r1 + i); }); return out;
}
// Sorting is only allowed where the range holds no formulas (moving formulas breaks references).
export function sortRows(o: Extract<Op, { op: "sort" }>, cells: Cell[][]): { ok: boolean; rows?: Cell[][]; why?: string } {
  const rg = parseRange(o.range)!; const block: Cell[][] = [];
  for (let r = rg.r1; r <= rg.r2; r++) { const row: Cell[] = []; for (let c = rg.c1; c <= rg.c2; c++) row.push(cells[r]?.[c] ?? null); block.push(row); }
  if (block.some((row) => row.some((v) => isFormula(v)))) return { ok: false, why: "The range contains formulas; sorting would break their references. Sort a values-only range, or copy values first." };
  const ci = lettersToCol(o.column) - rg.c1; if (ci < 0 || ci > rg.c2 - rg.c1) return { ok: false, why: "The sort column is outside the range." };
  const key = (v: Cell) => (typeof v === "number" ? v : v === null || v === "" ? null : isFinite(Number(v)) ? Number(v) : String(v).toLowerCase());
  const rows = [...block].sort((a, b) => { const x = key(a[ci]), y = key(b[ci]); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1;
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)); return o.order === "desc" ? -cmp : cmp; });
  return { ok: true, rows };
}
// After applying: find formula errors in the cells that changed.
export const ERROR_CODES = ["#REF!", "#NAME?", "#DIV/0!", "#VALUE!", "#N/A", "#NUM!", "#NULL!", "#SPILL!", "#CALC!", "#ERROR!"];
export function findErrors(values: Cell[][], touched: { r: number; c: number }[]): { cell: string; error: string }[] {
  return touched.map((t) => ({ cell: colToLetters(t.c) + (t.r + 1), v: values[t.r]?.[t.c] })).filter((x) => typeof x.v === "string" && ERROR_CODES.includes(String(x.v).trim()))
    .map((x) => ({ cell: x.cell, error: String(x.v) }));
}
