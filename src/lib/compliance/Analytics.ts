// DETECTION TESTS ON REAL DATA - deterministic. Runs on 100% of the uploaded rows in the
// browser; nothing is sent anywhere. Each exception is a lead to investigate, not proof.
import type { ReviewProcess } from "./ReviewGuide";

export const TEMPLATES: Record<ReviewProcess, { columns: string[]; example: string[][]; note: string }> = {
  te: { columns: ["claim_id", "employee", "approver", "date", "amount", "category", "merchant", "receipt"], note: "date as YYYY-MM-DD; receipt Y or N",
    example: [["C001", "Ravi Kumar", "Priya Sharma", "2026-08-04", "4500", "Hotel", "Taj Pune", "Y"], ["C002", "Ravi Kumar", "Ravi Kumar", "2026-08-09", "2000", "Meals", "Cafe Delhi", "N"]] },
  p2p: { columns: ["invoice_id", "vendor_id", "vendor_name", "invoice_no", "invoice_date", "amount", "po_number", "vendor_bank", "posted_by", "approved_by"], note: "invoice_date as YYYY-MM-DD; po_number blank if none",
    example: [["I001", "V10", "Acme Supplies", "INV-778", "2026-08-02", "125000", "PO4501", "HDFC0001234", "Asha", "Neha"], ["I002", "V22", "Acme Supply Co", "INV778", "2026-08-02", "125000", "", "HDFC0001234", "Asha", "Asha"]] },
  r2r: { columns: ["je_id", "posted_by", "approved_by", "post_date", "amount", "account", "description", "manual"], note: "post_date as YYYY-MM-DD; manual Y or N",
    example: [["J001", "Ravi", "Priya", "2026-08-31", "250000", "Provision for expenses", "Monthly accrual - utilities", "Y"], ["J002", "CFO Office", "", "2026-08-30", "1000000", "Revenue", "adj", "Y"]] },
};
export function templateCsv(p: ReviewProcess): string { const t = TEMPLATES[p]; return [t.columns.join(","), ...t.example.map((r) => r.map((c) => (/[",]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(","))].join("\n"); }

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false; const s = String(text || "").replace(/^\ufeff/, "");
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === "," || ch === ";" || ch === "\t") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((c) => c.trim() !== "")) rows.push(row); row = []; } else cell += ch; }
  row.push(cell); if (row.some((c) => c.trim() !== "")) rows.push(row); return rows;
}
// Flexible header matching: "Employee Name" -> employee, "Amount (INR)" -> amount, etc.
const ALIASES: Record<string, string[]> = { employee: ["employee", "claimant", "emp", "employee name", "submitted by"], approver: ["approver", "approved by", "manager"], approved_by: ["approved by", "approver", "approved_by"],
  posted_by: ["posted by", "entered by", "created by", "preparer", "user"], amount: ["amount", "value", "total", "amount inr", "amount (inr)", "debit"], date: ["date", "transaction date", "expense date"],
  invoice_date: ["invoice date", "date"], post_date: ["post date", "posting date", "entry date", "date"], receipt: ["receipt", "receipt attached", "has receipt"], merchant: ["merchant", "vendor", "supplier"],
  vendor_id: ["vendor id", "vendor code", "supplier id"], vendor_name: ["vendor name", "supplier name", "vendor"], invoice_no: ["invoice no", "invoice number", "inv no", "reference"], po_number: ["po number", "po", "purchase order"],
  vendor_bank: ["vendor bank", "bank account", "iban", "account number"], description: ["description", "narration", "text", "remarks"], manual: ["manual", "is manual", "entry type"], category: ["category", "expense type"],
  claim_id: ["claim id", "report id", "id"], invoice_id: ["invoice id", "document id", "id"], je_id: ["je id", "journal id", "document number", "id"], account: ["account", "gl account", "account name"] };
const norm = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
export function mapColumns(p: ReviewProcess, header: string[]): { map: Record<string, number>; missing: string[] } {
  const H = header.map(norm); const map: Record<string, number> = {};
  for (const col of TEMPLATES[p].columns) { const cands = [norm(col), ...(ALIASES[col] || []).map(norm)]; let idx = H.findIndex((h) => h === norm(col)); if (idx < 0) idx = H.findIndex((h) => cands.includes(h)); if (idx >= 0) map[col] = idx; }
  const required: Record<ReviewProcess, string[]> = { te: ["employee", "approver", "date", "amount"], p2p: ["vendor_id", "invoice_no", "invoice_date", "amount"], r2r: ["posted_by", "post_date", "amount"] };
  return { map, missing: required[p].filter((c) => map[c] === undefined) };
}
const num = (v: any) => { const n = parseFloat(String(v ?? "").replace(/[,\u20b9$\s]/g, "")); return isFinite(n) ? n : 0; };
const day = (v: any) => { const s = String(v || "").trim(); let d: Date | null = null; let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) d = new Date(+m[1], +m[2] - 1, +m[3]); else if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) d = new Date(+m[3], +m[2] - 1, +m[1]); return d && !isNaN(d.getTime()) ? d : null; };
const yes = (v: any) => /^(y|yes|true|1)$/i.test(String(v || "").trim());
const same = (a: any, b: any) => String(a || "").trim().toLowerCase() !== "" && String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const cleanNo = (v: any) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface Settings { receiptThreshold: number; approvalLimit: number; poThreshold: number; jeThreshold: number; seniorUsers: string }
export const DEFAULT_SETTINGS: Settings = { receiptThreshold: 500, approvalLimit: 25000, poThreshold: 50000, jeThreshold: 100000, seniorUsers: "" };
export interface TestResult { id: string; population: number; exceptions: number; examples: string[]; note?: string }

export function runTests(p: ReviewProcess, rows: string[][], settings: Settings = DEFAULT_SETTINGS): { results: TestResult[]; rows: number; missing: string[]; mapped: Record<string, number> } {
  const header = rows[0] || []; const { map, missing } = mapColumns(p, header); const data = rows.slice(1);
  const g = (r: string[], c: string) => (map[c] === undefined ? "" : r[map[c]] ?? "");
  const id = (r: string[], i: number) => g(r, p === "te" ? "claim_id" : p === "p2p" ? "invoice_id" : "je_id") || "row " + (i + 2);
  const R = (tid: string, hits: number[], fmt: (r: string[], i: number) => string, note?: string): TestResult => ({ id: tid, population: data.length, exceptions: hits.length, examples: hits.slice(0, 5).map((i) => fmt(data[i], i)), note });
  if (missing.length) return { results: [], rows: data.length, missing, mapped: map };
  const idx = data.map((_, i) => i); const out: TestResult[] = [];
  const groupHits = (key: (r: string[]) => string, minCount = 2, filter: (r: string[]) => boolean = () => true) => { const m: Record<string, number[]> = {}; idx.forEach((i) => { if (!filter(data[i])) return; const k = key(data[i]); if (!k) return; (m[k] = m[k] || []).push(i); }); return Object.values(m).filter((v) => v.length >= minCount); };
  if (p === "te") {
    const lim = settings.approvalLimit;
    out.push(R("te-dup", groupHits((r) => [g(r, "employee").toLowerCase().trim(), num(g(r, "amount")), g(r, "date")].join("|")).flat(), (r, i) => id(r, i) + ": " + g(r, "employee") + " \u20b9" + num(g(r, "amount")) + " on " + g(r, "date")));
    out.push(R("te-self", idx.filter((i) => same(g(data[i], "employee"), g(data[i], "approver"))), (r, i) => id(r, i) + ": " + g(r, "employee") + " approved own claim of \u20b9" + num(g(r, "amount"))));
    out.push(map.receipt === undefined ? { id: "te-receipt", population: data.length, exceptions: 0, examples: [], note: "No receipt column \u2014 test not run." } :
      R("te-receipt", idx.filter((i) => num(g(data[i], "amount")) >= settings.receiptThreshold && !yes(g(data[i], "receipt"))), (r, i) => id(r, i) + ": \u20b9" + num(g(r, "amount")) + " without receipt (" + g(r, "employee") + ")"));
    const under = groupHits((r) => g(r, "employee").toLowerCase().trim(), 3, (r) => { const a = num(g(r, "amount")); return a >= lim * 0.9 && a < lim; });
    out.push(R("te-under", under.flat(), (r, i) => id(r, i) + ": " + g(r, "employee") + " \u20b9" + num(g(r, "amount")) + " (limit \u20b9" + lim + ")"));
    const split = groupHits((r) => [g(r, "employee").toLowerCase().trim(), String(g(r, "merchant")).toLowerCase().trim(), g(r, "date")].join("|")).filter((v) => v.every((i) => num(g(data[i], "amount")) < lim) && v.reduce((a, i) => a + num(g(data[i], "amount")), 0) > lim);
    out.push(R("te-split", split.flat(), (r, i) => id(r, i) + ": " + g(r, "employee") + " at " + g(r, "merchant") + " on " + g(r, "date") + " \u20b9" + num(g(r, "amount"))));
    out.push(R("te-weekend", idx.filter((i) => { const d = day(g(data[i], "date")); return !!d && (d.getDay() === 0 || d.getDay() === 6); }), (r, i) => id(r, i) + ": " + g(r, "date") + " " + g(r, "employee") + " \u20b9" + num(g(r, "amount"))));
    out.push(R("te-round", idx.filter((i) => { const a = num(g(data[i], "amount")); return a >= 1000 && a % 1000 === 0 && (map.receipt === undefined || !yes(g(data[i], "receipt"))); }), (r, i) => id(r, i) + ": \u20b9" + num(g(r, "amount")) + " (" + g(r, "employee") + ")"));
  } else if (p === "p2p") {
    const t = settings.poThreshold;
    const dupA = groupHits((r) => g(r, "vendor_id").trim().toLowerCase() + "|" + cleanNo(g(r, "invoice_no"))); const dupB = groupHits((r) => [g(r, "vendor_id").trim().toLowerCase(), num(g(r, "amount")), g(r, "invoice_date")].join("|"));
    out.push(R("ap-dup", Array.from(new Set([...dupA.flat(), ...dupB.flat()])), (r, i) => id(r, i) + ": " + g(r, "vendor_name") + " " + g(r, "invoice_no") + " \u20b9" + num(g(r, "amount"))));
    if (map.vendor_bank === undefined) out.push({ id: "ap-sharedbank", population: data.length, exceptions: 0, examples: [], note: "No bank column \u2014 test not run." });
    else { const m: Record<string, Set<string>> = {}; const rowsOf: Record<string, number[]> = {}; idx.forEach((i) => { const b = cleanNo(g(data[i], "vendor_bank")); if (!b) return; (m[b] = m[b] || new Set()).add(g(data[i], "vendor_id").trim().toLowerCase()); (rowsOf[b] = rowsOf[b] || []).push(i); });
      const shared = Object.keys(m).filter((b) => m[b].size > 1); out.push({ id: "ap-sharedbank", population: data.length, exceptions: shared.length, examples: shared.slice(0, 5).map((b) => "Account \u2026" + b.slice(-4) + " used by vendors " + Array.from(m[b]).join(", ")), note: "Counted per shared bank account." }); }
    out.push(map.approved_by === undefined || map.posted_by === undefined ? { id: "ap-self", population: data.length, exceptions: 0, examples: [], note: "posted_by / approved_by columns missing \u2014 test not run." } :
      R("ap-self", idx.filter((i) => same(g(data[i], "posted_by"), g(data[i], "approved_by"))), (r, i) => id(r, i) + ": " + g(r, "posted_by") + " posted and approved \u20b9" + num(g(r, "amount"))));
    out.push(map.po_number === undefined ? { id: "ap-nopo", population: data.length, exceptions: 0, examples: [], note: "No PO column \u2014 test not run." } :
      R("ap-nopo", idx.filter((i) => !String(g(data[i], "po_number")).trim() && num(g(data[i], "amount")) >= t), (r, i) => id(r, i) + ": " + g(r, "vendor_name") + " \u20b9" + num(g(r, "amount")) + " with no PO"));
    out.push(R("ap-under", groupHits((r) => g(r, "vendor_id").trim().toLowerCase(), 3, (r) => { const a = num(g(r, "amount")); return a >= t * 0.9 && a < t; }).flat(), (r, i) => id(r, i) + ": " + g(r, "vendor_name") + " \u20b9" + num(g(r, "amount"))));
    out.push(R("ap-round", idx.filter((i) => { const a = num(g(data[i], "amount")); return a >= 10000 && a % 10000 === 0; }), (r, i) => id(r, i) + ": " + g(r, "vendor_name") + " \u20b9" + num(g(r, "amount"))));
  } else {
    const manual = (r: string[]) => map.manual === undefined || yes(g(r, "manual")) || /manual/i.test(g(r, "manual"));
    out.push(R("gl-self", idx.filter((i) => manual(data[i]) && (map.approved_by === undefined ? false : !String(g(data[i], "approved_by")).trim() || same(g(data[i], "posted_by"), g(data[i], "approved_by")))), (r, i) => id(r, i) + ": posted by " + g(r, "posted_by") + ", approved by " + (g(r, "approved_by") || "nobody") + " \u20b9" + num(g(r, "amount")), map.approved_by === undefined ? "No approved_by column \u2014 approval cannot be tested." : undefined));
    out.push(R("gl-weekend", idx.filter((i) => { const d = day(g(data[i], "post_date")); return manual(data[i]) && !!d && (d.getDay() === 0 || d.getDay() === 6); }), (r, i) => id(r, i) + ": " + g(r, "post_date") + " by " + g(r, "posted_by")));
    out.push(R("gl-round", idx.filter((i) => { const a = Math.abs(num(g(data[i], "amount"))); return manual(data[i]) && a >= settings.jeThreshold && a % 100000 === 0; }), (r, i) => id(r, i) + ": \u20b9" + num(g(r, "amount")) + " by " + g(r, "posted_by")));
    const seniors = settings.seniorUsers.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    out.push(seniors.length ? R("gl-senior", idx.filter((i) => seniors.includes(String(g(data[i], "posted_by")).trim().toLowerCase())), (r, i) => id(r, i) + ": " + g(r, "posted_by") + " \u20b9" + num(g(r, "amount"))) : { id: "gl-senior", population: data.length, exceptions: 0, examples: [], note: "List the senior users' names in Settings to run this test." });
    out.push(map.description === undefined ? { id: "gl-desc", population: data.length, exceptions: 0, examples: [], note: "No description column \u2014 test not run." } :
      R("gl-desc", idx.filter((i) => manual(data[i]) && String(g(data[i], "description")).trim().length < 10), (r, i) => id(r, i) + ": \u201c" + g(r, "description") + "\u201d"));
  }
  return { results: out, rows: data.length, missing, mapped: map };
}
