// ============================================================================
// ExcelStyleEngine.ts — OrchestrIQ benchmark-grade Excel renderer
// Replaces SheetJS output path. Requires dependency: exceljs (^4.4.0)
//
// WHY THIS EXISTS:
// 1. SheetJS community edition cannot write ANY styling (fills, fonts,
//    borders, widths). Benchmark-quality output is impossible with it.
// 2. AI models return markdown instead of strict JSON; the old fallback
//    pasted raw markdown strings into cells. This engine has a 4-strategy
//    JSON extractor AND a markdown-table converter so the worst case is
//    still a fully styled workbook — never raw markdown in cells.
//
// USAGE:
//   import { ExcelStyleEngine, EXCEL_SPEC_SYSTEM_PROMPT } from "./lib/ExcelStyleEngine";
//   const spec = ExcelStyleEngine.parseWorkbookSpec(aiRawText);
//   const blob = await ExcelStyleEngine.exportWorkbook(spec);
//   ExcelStyleEngine.download(blob, spec.title);
// ============================================================================

import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// TYPES — this is the strict JSON contract the AI must emit
// ---------------------------------------------------------------------------

export type ColType =
  | "text" | "inr" | "inr2" | "number" | "number1"
  | "percent" | "days" | "date" | "ratio";

export type Status = "good" | "bad" | "warn" | "neutral" | "info";

export interface KpiCard {
  label: string;
  value: number | string;
  formula?: string;          // optional real Excel formula, e.g. "SUM('Data'!C2:C13)"
  status?: Status;
  sublabel?: string;
}

export type CellVal =
  | string | number | null
  | { v?: string | number; f?: string; status?: Status; bold?: boolean };

export interface KpiRowBlock { type: "kpis"; cards: KpiCard[]; }
export interface SectionBlock { type: "section"; text: string; }
export interface BannerBlock { type: "banner"; text: string; severity: "alert" | "warn" | "good" | "info"; }
export interface NoteBlock { type: "note"; text: string; }
export interface LegendBlock { type: "legend"; items: { color: Status; text: string }[]; }
export interface TableBlock {
  type: "table";
  title?: string;
  headers: string[];
  colTypes?: ColType[];      // one per header; defaults to "text"
  rows: CellVal[][];
  totalRow?: CellVal[];      // rendered dark navy, bold white
  zebra?: boolean;           // default true
}

export type Block = KpiRowBlock | SectionBlock | BannerBlock | NoteBlock | LegendBlock | TableBlock;

export interface SheetSpec {
  name: string;              // include an emoji prefix, e.g. "📊 Dashboard"
  blocks: Block[];
}

export interface WorkbookSpec {
  title: string;
  subtitle?: string;
  sheets: SheetSpec[];
}

// ---------------------------------------------------------------------------
// THEME — tokens extracted from benchmark workbooks
// ---------------------------------------------------------------------------

const T = {
  navy: "FF0D1B2A",       // title banner
  navyMid: "FF1A2744",    // section headers / total rows
  navyCard: "FF1B2A4A",   // info KPI card
  headSlate: "FF2C3E50",  // table header
  gold: "FFC9A84C",
  white: "FFFFFFFF",
  black: "FF000000",
  grayLbl: "FFAAAAAA",
  cardBg: "FF111111",
  red: "FFC0392B",
  redDark: "FF7B241C",
  green: "FF1E8449",
  greenDark: "FF145A32",
  amber: "FF9A7D0A",
  blue: "FF1A5276",
  zebraA: "FFF4F6F7",
  zebraB: "FFFFFFFF",
  font: "Arial",
};

const STATUS_FILL: Record<Status, string> = {
  good: T.green, bad: T.red, warn: T.amber, neutral: T.blue, info: T.navyCard,
};
const BANNER_FILL: Record<string, string> = {
  alert: T.redDark, warn: T.amber, good: T.greenDark, info: T.blue,
};

const NUMFMT: Record<ColType, string> = {
  text: "General",
  inr: "#,##0",
  inr2: "#,##0.00",
  number: "#,##0",
  number1: "#,##0.0",
  percent: "0.0%",
  days: '#,##0" d"',
  date: "dd-mmm-yy",
  ratio: "0.0x",
};

const FIRST_COL = 2;        // content starts at column B; A is a 2-wide spacer
const MAX_TABLE_COLS = 12;

// ---------------------------------------------------------------------------
// SANITIZERS — kill every markdown artifact before it reaches a cell
// ---------------------------------------------------------------------------

function clean(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/\*\*|__|`/g, "")
    .replace(/^#{1,6}\s*/g, "")
    .replace(/\r/g, "")
    .trim();
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const s = v.replace(/[₹$,%\s,]/g, "").replace(/[()]/g, m => (m === "(" ? "-" : ""));
  if (s === "" || isNaN(Number(s))) return null;
  return Number(s);
}

/** percent smart-parser: fractions stay, >1.5 assumed to be "15" meaning 15% */
function toPercent(v: unknown): number | null {
  const n = toNumber(v);
  if (n === null) return null;
  return Math.abs(n) > 1.5 ? n / 100 : n;
}

function normalizeFormula(f: string): string {
  let s = clean(f);
  if (s.startsWith("=")) s = s.slice(1);
  return s;
}

// ---------------------------------------------------------------------------
// RENDERER
// ---------------------------------------------------------------------------

function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Replace {row}/{start}/{end} tokens in formulas with real addresses. */
function resolveTokens(raw: CellVal, rowNum: number, start: number, end: number): CellVal {
  const fix = (f: string) => f
    .replace(/\{row\}/gi, String(rowNum))
    .replace(/\{start\}/gi, String(start))
    .replace(/\{end\}/gi, String(end));
  if (raw && typeof raw === "object" && raw.f) return { ...raw, f: fix(raw.f) };
  return raw;
}

function thinBorder(color = "FF3A4A63") {
  const side = { style: "thin" as const, color: { argb: color } };
  return { top: side, bottom: side, left: side, right: side };
}

class Renderer {
  wb: ExcelJS.Workbook;
  sheetNames: Set<string> = new Set();

  constructor() {
    this.wb = new ExcelJS.Workbook();
    this.wb.creator = "OrchestrIQ";
    this.wb.created = new Date();
  }

  uniqueName(raw: string): string {
    let name = clean(raw).replace(/[\\/?*[\]:]/g, "").slice(0, 28) || "Sheet";
    let n = name, i = 2;
    while (this.sheetNames.has(n.toLowerCase())) n = `${name} ${i++}`;
    this.sheetNames.add(n.toLowerCase());
    return n;
  }

  renderSheet(spec: SheetSpec, wbTitle: string, subtitle?: string) {
    const ws = this.wb.addWorksheet(this.uniqueName(spec.name), {
      views: [{ showGridLines: false }],
      properties: { defaultRowHeight: 16 },
    });
    ws.getColumn(1).width = 2;

    const widths: number[] = [];
    const bump = (ci: number, len: number) => {
      widths[ci] = Math.max(widths[ci] || 0, Math.min(42, Math.max(10, len + 3)));
    };

    // ---- Title banner (row 1, merged) ----
    let row = 1;
    const bannerSpan = 10;
    ws.mergeCells(row, FIRST_COL, row, FIRST_COL + bannerSpan - 1);
    const tc = ws.getCell(row, FIRST_COL);
    tc.value = `${clean(spec.name)}  —  ${clean(wbTitle)}`.toUpperCase();
    tc.font = { name: T.font, size: 14, bold: true, color: { argb: T.white } };
    tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.navy } };
    tc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(row).height = 30;
    row += 1;
    if (subtitle) {
      ws.mergeCells(row, FIRST_COL, row, FIRST_COL + bannerSpan - 1);
      const sc = ws.getCell(row, FIRST_COL);
      sc.value = clean(subtitle);
      sc.font = { name: T.font, size: 9, italic: true, color: { argb: T.grayLbl } };
      row += 1;
    }
    row += 1; // breathing room

    ws.views = [{ showGridLines: false, state: "frozen", ySplit: row - 1 }];

    for (const block of spec.blocks || []) {
      try {
        row = this.renderBlock(ws, block, row, bump);
      } catch {
        /* never let one bad block kill the workbook */
      }
      row += 1;
    }

    widths.forEach((w, ci) => { if (w) ws.getColumn(ci).width = w; });
    if (!ws.getColumn(FIRST_COL).width || ws.getColumn(FIRST_COL).width! < 22)
      ws.getColumn(FIRST_COL).width = 26;
  }

  renderBlock(ws: ExcelJS.Worksheet, b: Block, row: number, bump: (c: number, l: number) => void): number {
    switch (b.type) {
      case "kpis": return this.renderKpis(ws, b, row, bump);
      case "section": return this.renderSection(ws, clean(b.text), row);
      case "banner": return this.renderBanner(ws, b, row);
      case "note": return this.renderNote(ws, b, row);
      case "legend": return this.renderLegend(ws, b, row, bump);
      case "table": return this.renderTable(ws, b, row, bump);
      default: return row;
    }
  }

  renderKpis(ws: ExcelJS.Worksheet, b: KpiRowBlock, row: number, bump: (c: number, l: number) => void): number {
    const cards = (b.cards || []).slice(0, 10);
    const perRow = 4;
    for (let start = 0; start < cards.length; start += perRow) {
      const chunk = cards.slice(start, start + perRow);
      chunk.forEach((card, i) => {
        const c0 = FIRST_COL + i * 3; // 2 cols per card + 1 gap
        // label
        ws.mergeCells(row, c0, row, c0 + 1);
        const lb = ws.getCell(row, c0);
        lb.value = clean(card.label).toUpperCase();
        lb.font = { name: T.font, size: 9, color: { argb: T.grayLbl } };
        lb.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.cardBg } };
        lb.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        // value
        ws.mergeCells(row + 1, c0, row + 1, c0 + 1);
        const vc = ws.getCell(row + 1, c0);
        const num = toNumber(card.value);
        if (card.formula) vc.value = { formula: normalizeFormula(card.formula), result: num ?? undefined } as any;
        else vc.value = num !== null ? num : clean(card.value);
        if (num !== null || card.formula) vc.numFmt = "#,##0";
        const fill = STATUS_FILL[card.status || "info"];
        vc.font = {
          name: T.font, size: 15, bold: true,
          color: { argb: (card.status || "info") === "info" ? T.gold : T.white },
        };
        vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        vc.alignment = { horizontal: "center", vertical: "middle" };
        vc.border = thinBorder();
        // sublabel
        if (card.sublabel) {
          ws.mergeCells(row + 2, c0, row + 2, c0 + 1);
          const sb = ws.getCell(row + 2, c0);
          sb.value = clean(card.sublabel);
          sb.font = { name: T.font, size: 8, italic: true, color: { argb: T.grayLbl } };
          sb.alignment = { horizontal: "center" };
        }
        bump(c0, 12); bump(c0 + 1, 12);
      });
      ws.getRow(row).height = 22;
      ws.getRow(row + 1).height = 26;
      row += (chunk.some(c => c.sublabel) ? 3 : 2) + 1;
    }
    return row;
  }

  renderSection(ws: ExcelJS.Worksheet, text: string, row: number): number {
    ws.mergeCells(row, FIRST_COL, row, FIRST_COL + 9);
    const c = ws.getCell(row, FIRST_COL);
    c.value = text.toUpperCase();
    c.font = { name: T.font, size: 11, bold: true, color: { argb: T.white } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.navyMid } };
    c.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(row).height = 20;
    return row + 1;
  }

  renderBanner(ws: ExcelJS.Worksheet, b: BannerBlock, row: number): number {
    ws.mergeCells(row, FIRST_COL, row, FIRST_COL + 9);
    const c = ws.getCell(row, FIRST_COL);
    const icon = b.severity === "alert" ? "⚠  " : b.severity === "good" ? "✔  " : b.severity === "warn" ? "▲  " : "ℹ  ";
    c.value = icon + clean(b.text);
    c.font = { name: T.font, size: 10, bold: true, color: { argb: T.white } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANNER_FILL[b.severity] || T.blue } };
    c.alignment = { vertical: "middle", indent: 1, wrapText: true };
    ws.getRow(row).height = 22;
    return row + 1;
  }

  renderNote(ws: ExcelJS.Worksheet, b: NoteBlock, row: number): number {
    ws.mergeCells(row, FIRST_COL, row, FIRST_COL + 9);
    const c = ws.getCell(row, FIRST_COL);
    c.value = clean(b.text);
    c.font = { name: T.font, size: 9, italic: true, color: { argb: "FF666666" } };
    c.alignment = { wrapText: true, vertical: "top" };
    const lines = Math.ceil(clean(b.text).length / 110);
    ws.getRow(row).height = Math.max(14, lines * 13);
    return row + 1;
  }

  renderLegend(ws: ExcelJS.Worksheet, b: LegendBlock, row: number, bump: (c: number, l: number) => void): number {
    row = this.renderSection(ws, "Colour Legend — How to Read This Workbook", row);
    for (const item of (b.items || []).slice(0, 8)) {
      const sw = ws.getCell(row, FIRST_COL);
      sw.value = "■";
      sw.font = { name: T.font, size: 10, color: { argb: STATUS_FILL[item.color] || T.blue } };
      const tx = ws.getCell(row, FIRST_COL + 1);
      tx.value = clean(item.text);
      tx.font = { name: T.font, size: 9, color: { argb: T.black } };
      bump(FIRST_COL + 1, clean(item.text).length);
      row += 1;
    }
    return row;
  }

  renderTable(ws: ExcelJS.Worksheet, b: TableBlock, row: number, bump: (c: number, l: number) => void): number {
    if (b.title) row = this.renderSection(ws, clean(b.title), row);
    const headers = (b.headers || []).slice(0, MAX_TABLE_COLS).map(clean);
    if (!headers.length) return row;
    const types: ColType[] = headers.map((_, i) => (b.colTypes && b.colTypes[i]) || "text");

    // header row
    headers.forEach((h, i) => {
      const c = ws.getCell(row, FIRST_COL + i);
      c.value = h;
      c.font = { name: T.font, size: 9, bold: true, color: { argb: T.white } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.headSlate } };
      c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true, indent: i === 0 ? 1 : 0 };
      c.border = thinBorder();
      bump(FIRST_COL + i, h.length);
    });
    ws.getRow(row).height = 24;
    row += 1;

    const zebra = b.zebra !== false;
    const dataStart = row;
    (b.rows || []).forEach((r, ri) => {
      const fill = zebra ? (ri % 2 === 0 ? T.zebraA : T.zebraB) : T.zebraB;
      headers.forEach((_, ci) => {
        const cell = ws.getCell(row, FIRST_COL + ci);
        this.writeDataCell(cell, resolveTokens(r[ci], row, dataStart, dataStart + (b.rows?.length || 1) - 1), types[ci]);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        cell.border = thinBorder("FFD5D8DC");
        const disp = typeof r[ci] === "object" && r[ci] !== null ? String((r[ci] as any).v ?? "") : String(r[ci] ?? "");
        bump(FIRST_COL + ci, Math.min(38, disp.length));
      });
      row += 1;
    });

    if (b.totalRow && b.totalRow.length) {
      const dataEnd = row - 1;
      headers.forEach((_, ci) => {
        const cell = ws.getCell(row, FIRST_COL + ci);
        let tc = resolveTokens(b.totalRow![ci], row, dataStart, dataEnd);
        // "SUM" literal (or AUTO_SUM) → engine computes the correct range itself
        const isAuto = (x: any) => typeof x === "string" && /^(AUTO_)?SUM$/i.test(x.trim());
        if (isAuto(tc) || (tc && typeof tc === "object" && isAuto((tc as any).f))) {
          const colL = colLetter(FIRST_COL + ci);
          tc = { f: `SUM(${colL}${dataStart}:${colL}${dataEnd})` };
        }
        this.writeDataCell(cell, tc, types[ci]);
        cell.font = { name: T.font, size: 10, bold: true, color: { argb: T.white } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.navyMid } };
        cell.border = thinBorder();
      });
      ws.getRow(row).height = 18;
      row += 1;
    }
    return row;
  }

  writeDataCell(cell: ExcelJS.Cell, raw: CellVal, type: ColType) {
    let v: string | number | null = null;
    let f: string | undefined;
    let status: Status | undefined;
    let bold = false;

    if (raw !== null && typeof raw === "object") {
      f = raw.f ? normalizeFormula(raw.f) : undefined;
      v = raw.v ?? null;
      status = raw.status;
      bold = !!raw.bold;
    } else v = raw ?? null;

    let out: string | number | null = v;
    if (type === "percent") out = toPercent(v) ?? clean(v);
    else if (type === "inr" || type === "inr2" || type === "number" || type === "number1" || type === "days" || type === "ratio") {
      const n = toNumber(v);
      out = n !== null ? n : clean(v);
    } else if (type === "text" || type === "date") out = clean(v);

    if (f) cell.value = { formula: f, result: typeof out === "number" ? out : undefined } as any;
    else cell.value = out === "" ? null : out;

    cell.numFmt = NUMFMT[type] || "General";
    cell.font = {
      name: T.font, size: 10, bold,
      color: { argb: status ? STATUS_FILL[status] : T.black },
    };
    cell.alignment = { vertical: "middle", horizontal: type === "text" ? "left" : "right", indent: type === "text" ? 1 : 0 };
  }
}

// ---------------------------------------------------------------------------
// JSON EXTRACTION — 4 strategies, then markdown fallback. Raw markdown NEVER
// reaches a cell.
// ---------------------------------------------------------------------------

function tryParse(s: string): any | null {
  try { return JSON.parse(s); } catch { return null; }
}

function extractJson(raw: string): any | null {
  if (!raw) return null;
  // 1. direct
  let p = tryParse(raw.trim());
  if (p) return p;
  // 2. fenced ```json block
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { p = tryParse(fence[1].trim()); if (p) return p; }
  // 3. first { to last }
  const a = raw.indexOf("{"), z = raw.lastIndexOf("}");
  if (a >= 0 && z > a) { p = tryParse(raw.slice(a, z + 1)); if (p) return p; }
  // 4. balanced-brace scan from first {
  if (a >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = a; i < raw.length; i++) {
      const ch = raw[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
      if (inStr) continue;
      if (ch === "{") depth++;
      if (ch === "}") { depth--; if (depth === 0) { p = tryParse(raw.slice(a, i + 1)); if (p) return p; break; } }
    }
  }
  return null;
}

/** Last-resort: convert markdown headings + pipe tables into styled blocks. */
function markdownToSpec(raw: string, title: string): WorkbookSpec {
  const lines = (raw || "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (/^#{1,3}\s+/.test(line)) {
      blocks.push({ type: "section", text: clean(line) });
      i++; continue;
    }
    if (line.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
      const headers = line.split("|").map(clean).filter(Boolean);
      i += 2;
      const rows: CellVal[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].split("|").map(clean);
        rows.push(cells.slice(1, 1 + headers.length).map(c => {
          const n = toNumber(c);
          return n !== null && /[\d]/.test(c) && !/[a-zA-Z]{3,}/.test(c) ? n : c;
        }));
        i++;
      }
      const colTypes: ColType[] = headers.map((h, ci) => {
        const hl = h.toLowerCase();
        if (/%|percent|margin|rate|utili[sz]ation|growth/.test(hl)) return "percent";
        if (/₹|amount|revenue|cost|expense|profit|balance|price|value|inr|cash/.test(hl)) return "inr";
        if (rows.length && rows.every(r => typeof r[ci] === "number")) return "number";
        return "text";
      });
      blocks.push({ type: "table", headers, colTypes, rows });
      continue;
    }
    if (line.length > 0 && !line.startsWith("|")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().length > 0 && !lines[i].trim().startsWith("|") && !/^#{1,3}\s+/.test(lines[i].trim())) {
        buf.push(clean(lines[i])); i++;
      }
      const text = buf.join(" ").trim();
      if (text) blocks.push({ type: "note", text });
      continue;
    }
    i++;
  }
  return { title, sheets: [{ name: "📊 Report", blocks: blocks.length ? blocks : [{ type: "note", text: clean(raw).slice(0, 2000) }] }] };
}

function validateSpec(p: any, fallbackTitle: string): WorkbookSpec | null {
  if (!p || typeof p !== "object") return null;
  const sheets = Array.isArray(p.sheets) ? p.sheets : null;
  if (!sheets || !sheets.length) return null;
  const cleanSheets: SheetSpec[] = sheets
    .filter((s: any) => s && Array.isArray(s.blocks))
    .map((s: any) => ({
      name: clean(s.name) || "Sheet",
      blocks: s.blocks.filter((bl: any) => bl && typeof bl.type === "string"),
    }))
    .filter((s: SheetSpec) => s.blocks.length);
  if (!cleanSheets.length) return null;
  return { title: clean(p.title) || fallbackTitle, subtitle: p.subtitle ? clean(p.subtitle) : undefined, sheets: cleanSheets };
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

export const ExcelStyleEngine = {
  /** Never throws. Always returns a renderable spec. */
  parseWorkbookSpec(aiRawText: string, fallbackTitle = "Business Workbook"): WorkbookSpec {
    const json = extractJson(aiRawText);
    const spec = validateSpec(json, fallbackTitle);
    if (spec) return spec;
    return markdownToSpec(aiRawText, fallbackTitle);
  },

  async exportWorkbook(spec: WorkbookSpec): Promise<Blob> {
    const r = new Renderer();
    for (const s of spec.sheets) r.renderSheet(s, spec.title, spec.subtitle);
    const buf = await r.wb.xlsx.writeBuffer();
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  },

  download(blob: Blob, title: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${clean(title).replace(/[^\w\- ]/g, "").replace(/\s+/g, "_") || "Workbook"}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
};

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — inject this into the Excel-generation AI call. It forces
// strict JSON matching WorkbookSpec. NO markdown ever again.
// ---------------------------------------------------------------------------

export const EXCEL_SPEC_SYSTEM_PROMPT = `You are OrchestrIQ's Excel Architect. You output ONE JSON object and NOTHING else — no markdown, no backticks, no commentary, no code fences.

SCHEMA (all keys lowercase):
{
  "title": "string — workbook title",
  "subtitle": "string — one-line context (audience, period, source)",
  "sheets": [
    {
      "name": "string — MUST start with one emoji, e.g. '📊 Dashboard'",
      "blocks": [
        { "type": "kpis", "cards": [ { "label": "str", "value": number, "status": "good|bad|warn|neutral|info", "sublabel": "str optional" } ] },
        { "type": "section", "text": "str" },
        { "type": "banner", "severity": "alert|warn|good|info", "text": "one decisive insight with numbers" },
        { "type": "table", "title": "str optional", "headers": ["str"], "colTypes": ["text|inr|inr2|number|number1|percent|days|date|ratio"], "rows": [[cell]], "totalRow": [cell] (optional) },
        { "type": "note", "text": "str — assumptions, sources, methodology" },
        { "type": "legend", "items": [ { "color": "good|bad|warn|neutral|info", "text": "str" } ] }
      ]
    }
  ]
}

CELL RULES:
- A cell is a number, a string, or {"v": value, "f": "formula", "status": "good|bad|warn", "bold": true}.
- Numbers MUST be raw JSON numbers. NEVER "₹5,40,000" as a string — write 540000 and set colTypes to "inr".
- Percentages MUST be fractions: 0.152 means 15.2%. Set colTypes "percent".
- FORMULAS — NEVER guess cell addresses. Use tokens; the engine resolves them:
  * Within a table row, columns are fixed (first header = column B, second = C, ...). Use {row} for the row: e.g. Gross Profit = {"v": 380000, "f": "C{row}-D{row}"}. Margin = {"v": 0.148, "f": "G{row}/C{row}"}.
  * In totalRow, use the literal string "SUM" for any numeric column — the engine writes the correct SUM range itself. For derived totals use {start}/{end}: {"f": "SUM(G{start}:G{end})/SUM(C{start}:C{end})"}.
  * NEVER write absolute addresses like "=Data!B16" or "B10" — you cannot know final row positions. Always provide "v" (computed value) alongside "f".
- NEVER put markdown (**, \`, #) inside any string.

WORKBOOK STANDARDS (McKinsey/BCG deliverable quality):
1. Sheet 1 is ALWAYS "📊 Dashboard": one "kpis" block (6–8 cards with status colors), then 1–2 "banner" insights with hard numbers, then a summary table.
2. 4–8 sheets total, each themed with emoji: e.g. 📥 data, 📈 analysis, 🎯 strategy/recommendations, 🔢 scenarios/what-if, 📋 assumptions & sources.
3. Every table: correct colTypes for every column, a totalRow where summation is meaningful, first column is the descriptive text column.
4. Every sheet with analysis gets at least one "banner" stating the SO-WHAT with numbers, and a "note" documenting assumptions with [VERIFIED]/[ESTIMATE]/[ASSUMPTION] tags.
5. Last sheet "📋 Assumptions & Sources": table of every assumption, its value, its tag, its source.
6. Use realistic, internally consistent numbers. Totals must equal the sum of their parts.

OUTPUT: the JSON object only. First character "{", last character "}".`;

export default ExcelStyleEngine;
