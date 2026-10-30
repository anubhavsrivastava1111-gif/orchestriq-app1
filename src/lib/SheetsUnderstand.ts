// SHEETS UNDERSTAND - read a sheet the way an analyst would before analysing it.
// 1. Find the real table: title rows, the header row (wherever it is), two-row headers,
//    blank separators, notes / source lines, total rows, other tables on the sheet.
// 2. Understand every column: what it represents, its role (measure / dimension / time /
//    identifier / text), how it may be aggregated (sum, average, weighted average, count),
//    its unit and scale, with confidence and the reason.
// 3. Detect "wide" layouts (months across) and reshape them to long form.
// 4. Score data quality. 5. Describe the dataset in plain English.
// Self-contained (no imports from SheetsAnalytics) so SheetsAnalytics can build on it.
export type Cell = string | number | boolean | null;
export type Kind = "id" | "date" | "period" | "year" | "currency" | "quantity" | "percent" | "rate" | "score" | "number" | "category" | "location" | "entity" | "boolean" | "email" | "phone" | "postal" | "taxid" | "text" | "empty";
export type Role = "measure" | "measure-avg" | "dimension" | "time" | "identifier" | "text" | "ignore";
export type AggRule = "sum" | "avg" | "weighted-avg" | "count" | "none";
export interface ColSem { index: number; name: string; kind: Kind; role: Role; agg: AggRule; unit: string; scale: number; confidence: "high" | "medium" | "low"; reason: string; filled: number; valid: number; distinct: number; sample: string[]; meaning?: string; weightBy?: number }
export interface Layout { headerRow: number; headerRows: number[]; dataStart: number; dataEnd: number; colStart: number; colEnd: number; titles: string[]; notes: string[]; totalRows: number[]; blankRows: number; otherTables: { headerRow: number; rows: number; headers: string[] }[]; findings: string[] }
export interface Wide { idCols: number[]; periodCols: number[]; periodLabels: string[] }
export interface Understanding { layout: Layout; headers: string[]; rows: Cell[][]; cols: ColSem[]; wide: Wide | null; quality: { score: number; grade: string; issues: string[] }; description: string; grain: string }

// ── small helpers (local copies, no cross-module cycle) ──
export const blank = (v: Cell) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const CUR = /[\u20b9$€£]|\b(rs\.?|inr|usd|eur|gbp)\b/i;
export function num(v: Cell): number | null { if (typeof v === "number") return isFinite(v) ? v : null; if (typeof v !== "string") return null;
  let s = v.trim(); if (!s) return null; let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } s = s.replace(CUR, "").replace(/[,\s]/g, "");
  if (/^-?\d*\.?\d+(e[-+]?\d+)?%$/i.test(s)) { const n = parseFloat(s) / 100; return neg ? -n : n; } if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null; const n = parseFloat(s); return neg ? -n : n; }
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON_RE = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)[\s'\-_/.]*(?<y>\d{4}|\d{2})?$/i;
export function isPeriodLabel(v: Cell): boolean { const s = String(v ?? "").trim(); return !!s && (MON_RE.test(s) || /^(q[1-4]|h[12])[\s'\-_/]*(fy)?\s*'?\d{0,4}$/i.test(s) || /^fy[\s'\-]?\d{2}(\d{2})?([\s\-/]\d{2,4})?$/i.test(s) || /^(19|20)\d{2}$/.test(s) || /^(19|20)\d{2}-(0?[1-9]|1[0-2])$/.test(s) || /^(19|20)\d{2}[\s-]?(q[1-4]|h[12])$/i.test(s)); }
export function isDateValue(v: Cell, dateNamed: boolean): boolean { if (typeof v === "number") return dateNamed && v > 20000 && v < 80000; const s = String(v ?? "").trim();
  return /^(19|20)\d{2}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])([T\s].*)?$/.test(s) || /^(0?[1-9]|[12]\d|3[01])[\/.-](0?[1-9]|1[0-2])[\/.-]((19|20)\d{2}|\d{2})$/.test(s) || /^(0?[1-9]|[12]\d|3[01])[\s-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s-](\d{2}|\d{4})$/i.test(s); }
export function periodKey(v: Cell): string | null { // canonical YYYY-MM / YYYY-Qn / YYYY / label
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 7);
  const s = String(v ?? "").trim(); let m;
  if ((m = s.match(/^((19|20)\d{2})-(0?[1-9]|1[0-2])(-\d{1,2})?([T\s].*)?$/))) return m[1] + "-" + m[3].padStart(2, "0");
  if ((m = s.match(/^(0?[1-9]|[12]\d|3[01])[\/.-](0?[1-9]|1[0-2])[\/.-]((19|20)\d{2})$/))) return m[3] + "-" + m[2].padStart(2, "0");
  if ((m = s.match(/^(0?[1-9]|[12]\d|3[01])[\s-]([a-z]{3})[a-z]*[\s-](\d{2}|\d{4})$/i))) { const mi = MONTHS.indexOf(m[2].toLowerCase()); if (mi >= 0) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + String(mi + 1).padStart(2, "0"); }
  if ((m = s.match(MON_RE))) { const mi = MONTHS.indexOf(s.slice(0, 3).toLowerCase()); const y = m.groups?.y; return y ? (y.length === 2 ? "20" + y : y) + "-" + String(mi + 1).padStart(2, "0") : MONTHS[mi][0].toUpperCase() + MONTHS[mi].slice(1); }
  if (/^(19|20)\d{2}$/.test(s)) return s; return s || null; }
const kindOf = (v: Cell) => (blank(v) ? "e" : typeof v === "number" ? "n" : typeof v === "boolean" ? "b" : num(v) !== null ? "n" : "t");

// ════════════ 1. LAYOUT ════════════
const ROW_IS_TOTAL = (r: Cell[]) => r.some((v) => typeof v === "string" && /^\s*(grand\s+)?(sub\s*-?\s*)?totals?\s*:?\s*$/i.test(v));
const NOTE_RE = /^\s*(note|notes|source|prepared|disclaimer|remarks?|\*|#|†|figures|all (amounts|figures)|generated|printed|confidential)\b/i;
export function detectLayout(values: Cell[][]): Layout {
  const R = values.length, W = Math.max(0, ...values.slice(0, 400).map((r) => (r || []).length)); const row = (r: number) => values[r] || [];
  const filled = (r: number) => row(r).filter((v) => !blank(v)).length; const findings: string[] = [];
  const empty: Layout = { headerRow: 0, headerRows: [0], dataStart: 1, dataEnd: R - 1, colStart: 0, colEnd: Math.max(0, W - 1), titles: [], notes: [], totalRows: [], blankRows: 0, otherTables: [], findings };
  if (!R || !W) return empty;
  // Typical width of data rows: used to tell a header from a title line
  const widths = values.slice(0, 200).map((_, i) => filled(i)).filter((x) => x > 0).sort((a, b) => a - b); const typical = widths[Math.floor(widths.length * 0.75)] || W;
  let best = -1, bestScore = -1;
  for (let r = 0; r < Math.min(R - 1, 40); r++) { const f = filled(r); if (f < Math.max(2, typical * 0.5)) continue; const cells = row(r).filter((v) => !blank(v));
    const textRatio = cells.filter((v) => kindOf(v) === "t" && !isDateValue(v, false)).length / f; const periodRatio = cells.filter(isPeriodLabel).length / f; const uniq = new Set(cells.map((v) => String(v).trim().toLowerCase())).size / f;
    // below: do the next rows look like data under these headings? (types differ from the header, consistently)
    let contrast = 0, cols = 0; for (let c = 0; c < W; c++) { if (blank(row(r)[c])) continue; cols++; const ks = [1, 2, 3, 4, 5].map((k) => kindOf(row(r + k)[c])).filter((k) => k !== "e"); if (!ks.length) continue; const n = ks.filter((k) => k === "n").length / ks.length; if (kindOf(row(r)[c]) === "t" && (n >= 0.6 || new Set(ks).size >= 1)) contrast += n >= 0.6 ? 1 : 0.5; }
    const score = (textRatio + periodRatio * 0.6) * 0.4 + uniq * 0.2 + Math.min(1, f / typical) * 0.2 + (cols ? contrast / cols : 0) * 0.2 - r * 0.002;
    if (score > bestScore + 0.02) { bestScore = score; best = r; } }
  if (best < 0) return empty;
  let colStart = row(best).findIndex((v) => !blank(v)); let colEnd = row(best).length - 1; while (colEnd > colStart && blank(row(best)[colEnd])) colEnd--;
  // Two-row header: a sparse group row directly above (e.g. "Q1" over Jan/Feb/Mar)
  const headerRows = [best]; if (best > 0) { const up = row(best - 1); const upF = up.slice(colStart, colEnd + 1).filter((v) => !blank(v)).length;
    if (upF >= 2 && upF < (colEnd - colStart + 1) && up.slice(colStart, colEnd + 1).every((v) => blank(v) || kindOf(v) === "t" || isPeriodLabel(v))) headerRows.unshift(best - 1); }
  const titles: string[] = []; for (let r = 0; r < headerRows[0]; r++) { const t = row(r).filter((v) => !blank(v)).map((v) => String(v).trim()).join(" · "); if (t) titles.push(t); }
  if (best > 0) findings.push("Header found on row " + (best + 1) + (titles.length ? "; " + titles.length + " title line" + (titles.length > 1 ? "s" : "") + " above it skipped" : "") + ".");
  if (headerRows.length > 1) findings.push("Two-row header combined (group labels from row " + (headerRows[0] + 1) + ").");
  // Data rows: until two blank rows in a row, a notes line, or another table's header
  let r = best + 1, lastData = best, blanks = 0, blankRun = 0; const totalRows: number[] = []; const notes: string[] = [];
  for (; r < R; r++) { const f = filled(r);
    if (!f) { blankRun++; if (blankRun >= 2 && lastData > best) break; continue; }
    const first = row(r).find((v) => !blank(v)); if (NOTE_RE.test(String(first ?? "")) && f <= 2) break;
    if (blankRun) { // a blank row then a new header-like row = another table
      const cells = row(r).filter((v) => !blank(v)); if (cells.length >= 2 && cells.every((v) => kindOf(v) === "t") && kindOf(row(r + 1)[colStart]) !== "e" && cells.some((v) => !values[best].some((h) => String(h).trim() === String(v).trim()))) break; }
    blanks += blankRun; blankRun = 0; if (ROW_IS_TOTAL(row(r).slice(colStart, colEnd + 1))) totalRows.push(r); lastData = r; }
  for (let k = lastData + 1; k < R; k++) { const t = row(k).filter((v) => !blank(v)).map((v) => String(v).trim()).join(" "); if (t && filled(k) <= 2 && NOTE_RE.test(t)) notes.push(t); }
  // Other tables below
  const otherTables: Layout["otherTables"] = []; for (let k = lastData + 2; k < R - 1; k++) { if (filled(k) >= 2 && filled(k - 1) === 0 && row(k).filter((v) => !blank(v)).every((v) => kindOf(v) === "t") && filled(k + 1) >= 2) { let e = k + 1; while (e < R && filled(e)) e++; otherTables.push({ headerRow: k, rows: e - k - 1, headers: row(k).filter((v) => !blank(v)).map(String) }); k = e; } }
  if (totalRows.length) findings.push(totalRows.length + " total row" + (totalRows.length > 1 ? "s" : "") + " excluded so nothing is counted twice.");
  if (blanks) findings.push(blanks + " blank separator row" + (blanks > 1 ? "s" : "") + " ignored.");
  if (notes.length) findings.push(notes.length + " note line" + (notes.length > 1 ? "s" : "") + " below the table kept out of the data.");
  if (otherTables.length) findings.push(otherTables.length + " more table" + (otherTables.length > 1 ? "s" : "") + " found further down (analysing the main one).");
  if (colStart > 0) findings.push("Table starts in column " + String.fromCharCode(65 + colStart) + ".");
  return { headerRow: best, headerRows, dataStart: best + 1, dataEnd: lastData, colStart, colEnd, titles, notes, totalRows, blankRows: blanks, otherTables, findings };
}
export function headerNames(values: Cell[][], L: Layout): string[] {
  const top = L.headerRows.length > 1 ? values[L.headerRows[0]] || [] : []; let group = ""; const out: string[] = []; const seen = new Map<string, number>();
  for (let c = L.colStart; c <= L.colEnd; c++) { if (top.length && !blank(top[c])) group = String(top[c]).trim(); const h = String((values[L.headerRow] || [])[c] ?? "").trim();
    let name = (top.length && group && h && !h.toLowerCase().includes(group.toLowerCase()) ? group + " " + h : h || (top.length && group) || "Column " + String.fromCharCode(65 + (c % 26)));
    const n = (seen.get(name.toLowerCase()) || 0) + 1; seen.set(name.toLowerCase(), n); if (n > 1) name = name + " (" + n + ")"; out.push(name); }
  return out;
}
export function dataRows(values: Cell[][], L: Layout): Cell[][] {
  const out: Cell[][] = []; for (let r = L.dataStart; r <= L.dataEnd; r++) { const src = values[r] || []; if (!src.some((v) => !blank(v))) continue; if (L.totalRows.includes(r)) continue; out.push(Array.from({ length: L.colEnd - L.colStart + 1 }, (_, i) => (src[L.colStart + i] === undefined ? null : src[L.colStart + i]))); } return out;
}

// ════════════ 2. COLUMN SEMANTICS ════════════
const N = (re: RegExp) => (h: string) => re.test(h.toLowerCase().replace(/[_\-.]/g, " "));
const IS = {
  id: N(/\b(id|no|nos|num|number|ref|reference|code|invoice|order|txn|transaction|voucher|sku|doc|document|bill|receipt|ticket|awb|lr|utr|cheque|emp ?id|employee ?id|customer ?id|account ?(no|number))\b/),
  date: N(/\b(date|dt|day|dated|on|created|posted|due|time|timestamp|when|period end)\b/), period: N(/\b(month|period|quarter|qtr|fy|week|mth)\b/), year: N(/\b(year|yr|fy|financial year)\b/),
  pct: N(/(%|\bpercent|\bpct\b|\bmargin\b|\bshare\b|\bgrowth\b|\bratio\b|\byield\b|\bcagr\b|\bconversion\b|\bachievement\b|\butili[sz]ation\b|\bdiscount %|\brate %)/),
  rate: N(/\b(price|rate|unit (cost|price)|cost per|per unit|mrp|tariff|avg|average|mean|asp|arpu|aov|ctc per|hourly|daily rate)\b/),
  score: N(/\b(rating|score|nps|grade|stars?|satisfaction|csat|rank)\b/),
  qty: N(/\b(qty|quantity|units?|volume|pcs|pieces|count|no of|number of|headcount|hc|seats|orders|visits|clicks|leads|calls|tickets|items|boxes|kg|tonnes?|litres?|hours|days)\b/),
  money: N(/\b(amount|amt|value|revenue|sales|turnover|cost|expense|spend|total|balance|profit|loss|income|salary|ctc|payment|paid|debit|credit|budget|actual|forecast|fee|fees|tax|gst|tds|net|gross|ebitda|pbt|pat|price value|outstanding|receivable|payable|invoice amount|billing|bill amount|opex|capex|cash|inr|usd|rs)\b/),
  loc: N(/\b(city|state|country|region|zone|district|branch|location|area|territory|circle|cluster|site|plant|warehouse|store|outlet|town|pincode area)\b/),
  entity: N(/\b(name|customer|client|vendor|supplier|party|employee|emp|agent|rep|salesperson|manager|owner|account|company|brand|product|item|sku name|model|service|project|department|dept|team|category|segment|channel|type|status|stage|class|group|division|function|cost cent(er|re)|ledger|gl|head)\b/),
  email: N(/\b(e ?mail|email id|mail)\b/), phone: N(/\b(phone|mobile|contact|cell|tel|whatsapp)\b/), postal: N(/\b(pin|pincode|zip|postal|postcode)\b/), tax: N(/\b(gst(in)?|pan|tan|vat|tin|cin|uan)\b/),
  bool: N(/\b(is|has|flag|active|paid\?|yes\/no|y\/n)\b/),
};
const UNIT_RE: [RegExp, string, number][] = [[/\(?\b(in\s+)?(rs\.?\s*)?(cr|crore|crores)\b\)?/i, "₹ crore", 1e7], [/\(?\b(in\s+)?(rs\.?\s*)?(lakh|lakhs|lac|lacs|lks)\b\)?/i, "₹ lakh", 1e5], [/\(?\s*'?000s?\s*\)?|\bin\s+thousands?\b/i, "thousands", 1e3], [/\(?\b(in\s+)?(mn|million|millions)\b\)?/i, "million", 1e6]];
export function columnSemantics(headers: string[], rows: Cell[][]): ColSem[] {
  const n = rows.length; const out: ColSem[] = headers.map((h, c) => {
    const vals = rows.map((r) => r[c]); const non = vals.filter((v) => !blank(v)); const filled = n ? non.length / n : 0; const distinctSet = new Set(non.map((v) => String(v).trim().toLowerCase())); const distinct = distinctSet.size;
    const sample = Array.from(new Set(non.slice(0, 50).map((v) => String(v).trim()))).slice(0, 4); const nums = non.map(num).filter((x): x is number => x !== null); const numRatio = non.length ? nums.length / non.length : 0;
    const strs = non.filter((v) => typeof v === "string") as string[]; const curStr = strs.filter((s) => CUR.test(s)).length; const pctStr = strs.filter((s) => /%\s*$/.test(s.trim())).length;
    let unit = "", scale = 1; for (const [re, u, sc] of UNIT_RE) if (re.test(h)) { unit = u; scale = sc; break; } if (!unit && (CUR.test(h) || curStr > non.length * 0.3)) unit = /\$|usd/i.test(h + strs[0]) ? "US$" : "₹";
    const base = { index: c, name: h, unit, scale, filled, distinct, sample };
    const mk = (kind: Kind, role: Role, agg: AggRule, confidence: ColSem["confidence"], reason: string, valid: number): ColSem => ({ ...base, kind, role, agg, confidence, reason, valid });
    if (!non.length) return mk("empty", "ignore", "none", "high", "Column is empty.", 0);
    const allInt = nums.length > 0 && nums.every((x) => Number.isInteger(x)); const uniqRatio = distinct / non.length;
    // Text-like identifiers and contact data first (patterns are decisive)
    const em = strs.filter((s) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s.trim())).length; if (em >= non.length * 0.8) return mk("email", "text", "count", "high", "Values are email addresses.", em / non.length);
    const gst = strs.filter((s) => /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/i.test(s.trim()) || /^[A-Z]{5}\d{4}[A-Z]$/i.test(s.trim())).length; if (gst >= non.length * 0.8 || (IS.tax(h) && uniqRatio > 0.5 && numRatio < 0.5)) return mk("taxid", "identifier", "count", gst ? "high" : "medium", gst ? "Values follow the GSTIN / PAN format." : "Header names a tax ID.", gst / non.length || 1);
    const digitsOf = (v: Cell) => String(v ?? "").replace(/[\s\-+()]/g, "");
    const ph = non.filter((v) => /^(91)?[6-9]\d{9}$/.test(digitsOf(v)) || (/^\+?\d[\d\s\-()]{8,}$/.test(String(v).trim()) && IS.phone(h))).length; if (ph >= non.length * 0.8 && (IS.phone(h) || uniqRatio > 0.8)) return mk("phone", "text", "count", "high", "Values are phone numbers. Never added up.", ph / non.length);
    const pin = non.filter((v) => /^[1-9]\d{5}$/.test(digitsOf(v))).length; if (IS.postal(h) && pin >= non.length * 0.8) return mk("postal", "dimension", "count", "high", "6-digit PIN codes. A location, never added up.", pin / non.length);
    // Time
    const dn = IS.date(h) || IS.period(h); const dates = non.filter((v) => isDateValue(v, dn)).length; if (dates >= non.length * 0.8) return mk("date", "time", "none", "high", "Values are dates" + (typeof non[0] === "number" ? " (spreadsheet date serials)" : "") + ".", dates / non.length);
    const pers = non.filter(isPeriodLabel).length; if (pers >= non.length * 0.8 && !(allInt && !IS.year(h) && !IS.period(h) && nums.some((x) => x < 1900))) { const yrs = allInt && nums.every((x) => x >= 1900 && x <= 2100); return mk(yrs ? "year" : "period", "time", "none", yrs && !IS.year(h) && !IS.period(h) ? "medium" : "high", yrs ? "Values are years. Used as time, never added up." : "Values are months / quarters / financial years.", pers / non.length); }
    if (allInt && nums.every((x) => x >= 1900 && x <= 2100) && (IS.year(h) || distinct <= 30) && numRatio > 0.9 && IS.year(h)) return mk("year", "time", "none", "high", "Header names a year; values are 1900–2100.", 1);
    // Identifiers: unique codes (numeric or text) named like IDs, or mostly unique alphanumeric codes
    const codeLike = strs.filter((s) => /^[A-Z]{0,6}[-/#]?\d{2,}[-/]?[A-Z0-9]*$/i.test(s.trim())).length;
    if ((IS.id(h) && uniqRatio >= 0.6 && !IS.money(h) && !IS.qty(h)) || (codeLike >= non.length * 0.8 && uniqRatio >= 0.8) || (allInt && uniqRatio > 0.98 && n >= 20 && isSequential(nums) && !IS.money(h) && !IS.qty(h)))
      return mk("id", "identifier", "count", IS.id(h) ? "high" : "medium", (IS.id(h) ? "Header names an ID" : "Values look like unique codes") + "; " + Math.round(uniqRatio * 100) + "% unique. Counted, never added up.", 1);
    // Booleans
    const yn = non.filter((v) => typeof v === "boolean" || /^(y|n|yes|no|true|false|t|f|0|1)$/i.test(String(v).trim())).length; if (distinct <= 2 && yn >= non.length * 0.95 && (IS.bool(h) || !allInt || distinct === 2 && !IS.qty(h) && !IS.money(h))) return mk("boolean", "dimension", "count", "medium", "Yes/No values.", 1);
    // Numbers
    if (numRatio >= 0.85) { const valid = numRatio; const mx = Math.max(...nums), mn = Math.min(...nums);
      if (IS.pct(h) || pctStr >= non.length * 0.5) return mk("percent", "measure-avg", "avg", "high", "A percentage" + (pctStr ? " (values end in %)" : "") + ": averaged, never added up.", valid);
      if (IS.score(h) && mx <= 100) return mk("score", "measure-avg", "avg", "high", "A rating / score: averaged.", valid);
      if (IS.rate(h) && !/total|amount|value/i.test(h)) return mk("rate", "measure-avg", "weighted-avg", "high", "A price / rate per unit: averaged (weighted by quantity when available), never added up.", valid);
      if (IS.qty(h)) return mk("quantity", "measure", "sum", "high", "A quantity: added up.", valid);
      if (IS.money(h) || curStr > non.length * 0.3 || unit) return mk("currency", "measure", "sum", IS.money(h) ? "high" : "medium", "An amount" + (unit ? " in " + unit : "") + ": added up.", valid);
      if (mn >= 0 && mx <= 1 && !allInt && nums.length > 5) return mk("percent", "measure-avg", "avg", "medium", "Values between 0 and 1 look like proportions: averaged.", valid);
      if (allInt && distinct <= 12 && n >= 30 && mx <= 20) return mk("category", "dimension", "count", "low", "Few small whole numbers (" + distinct + " values): treated as categories, e.g. levels or grades.", valid);
      return mk("number", "measure", "sum", "medium", "Numeric values with no name hint: treated as an amount to add up. Change it if that's wrong.", valid); }
    // Text
    const avgLen = strs.reduce((s, x) => s + x.length, 0) / Math.max(1, strs.length);
    if (avgLen > 40 && uniqRatio > 0.5) return mk("text", "text", "count", "high", "Free text (comments / descriptions): searched, not aggregated.", 1);
    if (IS.loc(h)) return mk("location", "dimension", "count", "high", "A place: used to break results down.", 1);
    if (distinct <= Math.max(50, n * 0.2)) return mk("category", "dimension", "count", IS.entity(h) ? "high" : "medium", distinct + " distinct values: used to break results down.", 1);
    if (IS.entity(h) || uniqRatio < 0.9) return mk("entity", "dimension", "count", "medium", "Many distinct names (" + distinct + "): shown as top lists.", 1);
    return mk("text", "text", "count", "low", "Mostly unique text: treated as labels, not aggregated.", 1);
  });
  // Show samples the way people recognise them: dates as dates, proportions as percentages.
  out.forEach((c) => { if (c.kind === "date") c.sample = c.sample.map((x) => { const n = Number(x); return isFinite(n) && n > 20000 && n < 80000 ? new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10) : x; });
    if (c.kind === "percent") c.sample = c.sample.map((x) => { const n = num(x); return n !== null && Math.abs(n) <= 1 && !/%/.test(x) ? +(n * 100).toFixed(2) + "%" : x; }); });
  // Weighted average for rates: weight by a quantity column when present
  const q = out.find((c) => c.kind === "quantity"); out.forEach((c) => { if (c.agg === "weighted-avg") { if (q) c.weightBy = q.index; else c.agg = "avg"; } });
  return out;
}
function isSequential(xs: number[]) { if (xs.length < 5) return false; const s = [...xs].sort((a, b) => a - b); let steps = 0; for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] === 1) steps++; return steps / (s.length - 1) > 0.8; }

// ════════════ 3. WIDE LAYOUTS (months across) ════════════
export function detectWide(headers: string[], rows: Cell[][]): Wide | null {
  const per = headers.map((h, i) => ({ i, ok: isPeriodLabel(h) && rows.filter((r) => num(r[i]) !== null).length >= Math.max(1, rows.filter((r) => !blank(r[i])).length * 0.8) }));
  const periodCols = per.filter((x) => x.ok).map((x) => x.i); if (periodCols.length < 3) return null;
  const idCols = headers.map((_, i) => i).filter((i) => !periodCols.includes(i) && !/^(total|grand total|ytd|annual|full year|sum)$/i.test(headers[i].trim()));
  return { idCols, periodCols, periodLabels: periodCols.map((i) => headers[i]) };
}
export function unpivot(headers: string[], rows: Cell[][], w: Wide, valueName = "Value"): { headers: string[]; rows: Cell[][] } {
  const out: Cell[][] = []; for (const r of rows) for (const pc of w.periodCols) { const v = num(r[pc]); if (v === null) continue; out.push([...w.idCols.map((i) => r[i]), periodKey(headers[pc]) || headers[pc], v]); }
  return { headers: [...w.idCols.map((i) => headers[i]), "Period", valueName], rows: out };
}

// ════════════ 4 + 5. QUALITY, DESCRIPTION, ENTRY POINT ════════════
const OVERRIDES = new Map<string, Record<string, Partial<Pick<ColSem, "role" | "agg" | "kind" | "meaning">>>>();
export const sigOf = (headers: string[]) => headers.map((h) => h.toLowerCase().trim()).join("|");
export function setOverrides(headers: string[], o: Record<string, Partial<Pick<ColSem, "role" | "agg" | "kind" | "meaning">>>) { OVERRIDES.set(sigOf(headers), o); try { localStorage.setItem("oiq-sheets-colsem:" + sigOf(headers), JSON.stringify(o)); } catch {} }
export function getOverrides(headers: string[]): Record<string, Partial<Pick<ColSem, "role" | "agg" | "kind" | "meaning">>> { const k = sigOf(headers); if (OVERRIDES.has(k)) return OVERRIDES.get(k)!; try { const v = JSON.parse(localStorage.getItem("oiq-sheets-colsem:" + k) || "null"); if (v) { OVERRIDES.set(k, v); return v; } } catch {} return {}; }
const KIND_WORD: Record<Kind, string> = { id: "ID", date: "date", period: "period", year: "year", currency: "amount", quantity: "quantity", percent: "percentage", rate: "price / rate", score: "score", number: "number", category: "category", location: "location", entity: "name", boolean: "yes / no", email: "email", phone: "phone", postal: "PIN code", taxid: "tax ID", text: "text", empty: "empty" };
export const kindWord = (k: Kind) => KIND_WORD[k];
export function understand(values: Cell[][]): Understanding {
  const layout = detectLayout(values); let headers = headerNames(values, layout); let rows = dataRows(values, layout);
  let cols = columnSemantics(headers, rows); const ov = getOverrides(headers);
  cols = cols.map((c) => { const o = ov[c.name]; return o ? { ...c, ...o, confidence: "high", reason: "Set by you. " + c.reason } : c; });
  const wide = detectWide(headers, rows); if (wide) layout.findings.push("Wide layout: " + wide.periodCols.length + " period columns across (" + wide.periodLabels.slice(0, 3).join(", ") + "…). Convert to long form to trend and compare periods.");
  // quality
  const issues: string[] = []; let score = 100; const used = cols.filter((c) => c.role !== "ignore");
  for (const c of used) { if (c.filled < 0.95 && c.role !== "text") { const miss = Math.round((1 - c.filled) * 100); issues.push(c.name + ": " + miss + "% blank."); score -= Math.min(12, miss / 3); }
    if (c.valid < 0.97 && (c.role === "measure" || c.role === "measure-avg" || c.role === "time")) { const bad = Math.round((1 - c.valid) * 100); issues.push(c.name + ": " + bad + "% of values are not valid " + KIND_WORD[c.kind] + "s."); score -= Math.min(15, bad / 2); }
    if (c.role === "identifier" && c.distinct < rows.length * c.filled * 0.999 && c.kind === "id") { const d = Math.round(rows.length * c.filled - c.distinct); if (d > 0) { issues.push(c.name + ": " + d + " repeated ID" + (d > 1 ? "s" : "") + " (one row per " + c.name + " expected)."); score -= Math.min(10, d); } }
    if (c.confidence === "low") { issues.push(c.name + ": meaning unclear (" + KIND_WORD[c.kind] + "?). Please confirm."); score -= 2; } }
  if (!cols.some((c) => c.role === "measure" || c.role === "measure-avg")) issues.push("No numeric measure found; analysis will count rows.");
  score = Math.max(0, Math.round(score)); const grade = score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 55 ? "Fair" : "Poor";
  // description
  const id = cols.find((c) => c.role === "identifier"), time = cols.find((c) => c.role === "time"), meas = cols.filter((c) => c.role === "measure"), avgm = cols.filter((c) => c.role === "measure-avg"), dims = cols.filter((c) => c.role === "dimension");
  const grain = id ? "one row per " + id.name : dims.length ? "one row per " + dims.slice(0, 3).map((d) => d.name).join(" × ") + (time ? " × " + time.name : "") : "one row per record";
  const subject = /sale|revenue|order|invoice/i.test(headers.join(" ")) ? "Sales" : /expense|spend|cost|vendor|supplier|payable|ap\b/i.test(headers.join(" ")) ? "Spend / payables" : /salary|employee|emp|payroll|ctc|headcount/i.test(headers.join(" ")) ? "People / payroll" : /stock|inventory|warehouse|sku/i.test(headers.join(" ")) ? "Inventory" : /lead|campaign|click|conversion|visit/i.test(headers.join(" ")) ? "Marketing" : /ticket|sla|resolution|incident/i.test(headers.join(" ")) ? "Service / operations" : wide ? "Period-by-period (MIS / P&L style)" : "Business";
  let span = ""; if (time) { const ks = rows.map((r) => periodKey(r[time.index])).filter(Boolean).sort() as string[]; if (ks.length) span = ks[0] === ks[ks.length - 1] ? " for " + ks[0] : ", " + ks[0] + " to " + ks[ks.length - 1]; }
  const description = subject + " data" + (wide ? " in wide layout" : "") + ": " + rows.length.toLocaleString("en-IN") + " rows, " + grain + span + "." + (meas.length ? " Measures: " + meas.map((m) => m.name + (m.unit && !m.name.toLowerCase().includes(m.unit.replace("₹ ", "").toLowerCase()) && !m.name.includes(m.unit) ? " (" + m.unit + ")" : "")).join(", ") + "." : "") + (avgm.length ? " Averaged: " + avgm.map((m) => m.name).join(", ") + "." : "") + (dims.length ? " Broken down by " + dims.slice(0, 4).map((d) => d.name).join(", ") + "." : "");
  return { layout, headers, rows, cols, wide, quality: { score, grade, issues }, description, grain };
}

// ════════════ AI enrichment (optional): names meanings, may only choose allowed roles ════════════
export const UNDERSTAND_SYSTEM = "You are a senior data analyst. You receive a spreadsheet's column profile (name, detected type, sample values). Explain what the dataset represents and what each column means in business terms. You may correct a column's role only to one of: measure (add up), measure-avg (average, e.g. %, price, rating), dimension (break down by), time, identifier (count, never add), text (ignore in maths). Never invent numbers. Reply ONLY with JSON: {\"dataset\":\"2 sentences: what this data is and what it can answer\",\"columns\":[{\"name\":\"exact column name\",\"meaning\":\"one short line\",\"role\":\"measure|measure-avg|dimension|time|identifier|text\"}],\"questions\":[\"3 business questions this data can answer\"]}";
export function understandPrompt(u: Understanding): string { return "Title lines: " + (u.layout.titles.join(" | ") || "none") + "\nRows: " + u.rows.length + "\nColumns:\n" + u.cols.map((c) => "- " + c.name + ": detected " + KIND_WORD[c.kind] + " (" + c.role + "), " + c.distinct + " distinct, e.g. " + c.sample.map((s) => JSON.stringify(s)).join(", ")).join("\n"); }
export function mergeAI(u: Understanding, text: string): { dataset: string; questions: string[]; changes: string[]; cols: ColSem[] } | null {
  try { const raw = String(text || "").replace(/```json|```/g, ""); const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); const roles: Role[] = ["measure", "measure-avg", "dimension", "time", "identifier", "text"]; const changes: string[] = [];
    const cols = u.cols.map((c) => { const a = (Array.isArray(j.columns) ? j.columns : []).find((x: any) => String(x?.name || "").trim().toLowerCase() === c.name.toLowerCase()); if (!a) return c; const out = { ...c, meaning: String(a.meaning || "").slice(0, 160) || c.meaning };
      if (roles.includes(a.role) && a.role !== c.role && c.confidence !== "high") { changes.push(c.name + ": " + c.role + " → " + a.role); out.role = a.role; out.agg = a.role === "measure" ? "sum" : a.role === "measure-avg" ? "avg" : a.role === "identifier" ? "count" : "none"; out.reason = "AI reading of the column name and values. " + c.reason; out.confidence = "medium"; } return out; });
    return { dataset: String(j.dataset || "").slice(0, 400), questions: (Array.isArray(j.questions) ? j.questions : []).slice(0, 4).map((q: any) => String(q).slice(0, 160)), changes, cols }; } catch { return null; }
}
