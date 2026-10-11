// DETECTION TESTS ON REAL DATA - deterministic. Runs on 100% of the uploaded rows in the
// browser; nothing is sent anywhere. Each exception is a lead to investigate, not proof.
import type { ReviewProcess } from "./ReviewGuide";

export const TEMPLATES: Partial<Record<ReviewProcess, { columns: string[]; example: string[][]; note: string; required: string[] }>> = {
  te: { columns: ["claim_id", "employee", "approver", "date", "amount", "category", "merchant", "receipt"], note: "date as YYYY-MM-DD; receipt Y or N",
    example: [["C001", "Ravi Kumar", "Priya Sharma", "2026-08-04", "4500", "Hotel", "Taj Pune", "Y"], ["C002", "Ravi Kumar", "Ravi Kumar", "2026-08-09", "2000", "Meals", "Cafe Delhi", "N"]], required: ["employee", "approver", "date", "amount"] },
  p2p: { columns: ["invoice_id", "vendor_id", "vendor_name", "invoice_no", "invoice_date", "amount", "po_number", "vendor_bank", "posted_by", "approved_by"], note: "invoice_date as YYYY-MM-DD; po_number blank if none",
    example: [["I001", "V10", "Acme Supplies", "INV-778", "2026-08-02", "125000", "PO4501", "HDFC0001234", "Asha", "Neha"], ["I002", "V22", "Acme Supply Co", "INV778", "2026-08-02", "125000", "", "HDFC0001234", "Asha", "Asha"]], required: ["vendor_id", "invoice_no", "invoice_date", "amount"] },
  r2r: { columns: ["je_id", "posted_by", "approved_by", "post_date", "amount", "account", "description", "manual"], note: "post_date as YYYY-MM-DD; manual Y or N",
    example: [["J001", "Ravi", "Priya", "2026-08-31", "250000", "Provision for expenses", "Monthly accrual - utilities", "Y"], ["J002", "CFO Office", "", "2026-08-30", "1000000", "Revenue", "adj", "Y"]], required: ["posted_by", "post_date", "amount"] },
  o2c: { columns: ["invoice_id", "customer_id", "customer_name", "date", "amount", "type", "created_by", "approved_by", "credit_limit"], note: "type INV for invoices, CN for credit notes; date as YYYY-MM-DD; credit_limit optional", required: ["customer_id", "date", "amount"],
    example: [["S001", "C10", "Metro Traders", "2026-08-29", "450000", "INV", "Ravi", "", "500000"], ["S002", "C10", "Metro Traders", "2026-09-03", "120000", "CN", "Ravi", "Ravi", "500000"]] },
  payroll: { columns: ["emp_id", "name", "bank_account", "pan", "exit_date", "pay_date", "net_pay"], note: "one row per payment; dates as YYYY-MM-DD; exit_date blank if still employed", required: ["emp_id", "pay_date", "net_pay"],
    example: [["E101", "Asha Rao", "SBIN0001111", "ABCDE1234F", "", "2026-08-31", "65000"], ["E177", "R Kumar", "SBIN0001111", "", "2026-07-15", "2026-08-31", "42000"]] },
  inv: { columns: ["item", "location", "date", "quantity", "value", "type", "created_by", "approved_by"], note: "type RECEIPT / ISSUE / ADJ / OPENING; quantity positive for receipts, negative for issues", required: ["item", "date", "quantity", "type"],
    example: [["WAX-10", "Pune", "2026-08-01", "500", "60000", "OPENING", "System", ""], ["WAX-10", "Pune", "2026-08-15", "-80", "-9600", "ADJ", "Store1", "Store1"]] },
  itgc: { columns: ["user_id", "name", "status", "roles", "last_login", "exit_date", "privileged"], note: "one row per user; roles separated by ; ; dates as YYYY-MM-DD; privileged Y/N", required: ["user_id", "status"],
    example: [["asha.r", "Asha Rao", "Active", "VENDOR_MAINT;PAYMENT_RELEASE", "2026-09-30", "", "N"], ["admin", "Shared admin", "Active", "SUPERUSER", "2026-05-01", "", "Y"]] },
  treasury: { columns: ["account", "item_date", "amount", "description"], note: "unreconciled items from the bank reconciliation; item_date as YYYY-MM-DD", required: ["account", "item_date", "amount"],
    example: [["HDFC-001", "2026-06-12", "250000", "Cheque issued not presented"], ["HDFC-001", "2026-09-28", "18000", "Bank charges not booked"]] },
  fa: { columns: ["asset_id", "description", "cost", "acquisition_date", "location", "last_verified", "status", "nbv"], note: "status in use / disposed / sold / scrapped; dates as YYYY-MM-DD", required: ["asset_id", "cost"],
    example: [["FA-001", "CNC machine", "1800000", "2022-04-10", "Pune plant", "2026-03-31", "in use", "1350000"], ["FA-087", "Laptop", "3500", "2025-01-05", "", "", "disposed", "1200"]] },
  tax: { columns: ["supplier_gstin", "invoice_no", "itc_books", "itc_2b"], note: "one row per supplier invoice; itc_2b 0 if not in GSTR-2B", required: ["invoice_no", "itc_books", "itc_2b"],
    example: [["27ABCDE1234F1Z5", "INV-88", "18000", "18000"], ["27ABCDE1234F1Z", "INV-91", "9000", "0"]] },
};
export const hasDataTests = (p: ReviewProcess) => !!TEMPLATES[p];
export function templateCsv(p: ReviewProcess): string { const t = TEMPLATES[p]; if (!t) return ""; return [t.columns.join(","), ...t.example.map((r) => r.map((c) => (/[",]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(","))].join("\n"); }

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false; const s = String(text || "").replace(/^\ufeff/, "");
  // One separator per file, detected from the header row, so values like "ROLE_A;ROLE_B" stay intact in comma files.
  const head = s.split(/\r?\n/)[0] || ""; const cnt = (c: string) => head.split(c).length - 1;
  const sep = cnt(",") >= cnt(";") && cnt(",") >= cnt("\t") ? "," : cnt(";") >= cnt("\t") ? ";" : "\t";
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((c) => c.trim() !== "")) rows.push(row); row = []; } else cell += ch; }
  row.push(cell); if (row.some((c) => c.trim() !== "")) rows.push(row); return rows;
}
// Flexible header matching: "Employee Name" -> employee, "Amount (INR)" -> amount, etc.
const ALIASES: Record<string, string[]> = { employee: ["employee", "claimant", "emp", "employee name", "submitted by"], approver: ["approver", "approved by", "manager"], approved_by: ["approved by", "approver", "approved_by"],
  posted_by: ["posted by", "entered by", "created by", "preparer", "user"], amount: ["amount", "value", "total", "amount inr", "amount (inr)", "debit"], date: ["date", "transaction date", "expense date"],
  invoice_date: ["invoice date", "date"], post_date: ["post date", "posting date", "entry date", "date"], receipt: ["receipt", "receipt attached", "has receipt"], merchant: ["merchant", "vendor", "supplier"],
  vendor_id: ["vendor id", "vendor code", "supplier id"], vendor_name: ["vendor name", "supplier name", "vendor"], invoice_no: ["invoice no", "invoice number", "inv no", "reference"], po_number: ["po number", "po", "purchase order"],
  vendor_bank: ["vendor bank", "bank account", "iban", "account number"], description: ["description", "narration", "text", "remarks"], manual: ["manual", "is manual", "entry type"], category: ["category", "expense type"],
  claim_id: ["claim id", "report id", "id"], invoice_id: ["invoice id", "document id", "id"], je_id: ["je id", "journal id", "document number", "id"], account: ["account", "gl account", "account name", "bank account"],
  customer_id: ["customer id", "customer code", "client id"], customer_name: ["customer name", "customer", "client"], type: ["type", "document type", "doc type", "transaction type"], created_by: ["created by", "entered by", "prepared by", "user"], credit_limit: ["credit limit", "limit"],
  emp_id: ["emp id", "employee id", "employee code", "emp code"], name: ["name", "employee name", "user name", "full name"], bank_account: ["bank account", "account number", "bank a c", "bank ac"], pan: ["pan", "pan number"], exit_date: ["exit date", "leaving date", "date of leaving", "termination date", "relieving date"],
  pay_date: ["pay date", "payment date", "pay period", "date"], net_pay: ["net pay", "net salary", "amount", "net amount"], item: ["item", "item code", "material", "sku"], location: ["location", "warehouse", "plant", "site", "custodian"], quantity: ["quantity", "qty"], value: ["value", "amount"],
  user_id: ["user id", "userid", "login", "username", "user"], status: ["status", "account status", "user status"], roles: ["roles", "role", "profiles"], last_login: ["last login", "last logon", "last login date"], privileged: ["privileged", "is privileged", "admin"],
  item_date: ["item date", "date", "transaction date"], asset_id: ["asset id", "asset code", "asset number", "tag"], cost: ["cost", "gross cost", "original cost", "gross block"], acquisition_date: ["acquisition date", "purchase date", "capitalisation date"], last_verified: ["last verified", "verification date", "last physical verification"], nbv: ["nbv", "net book value", "wdv"],
  supplier_gstin: ["supplier gstin", "gstin", "gstin of supplier"], itc_books: ["itc books", "itc as per books", "books itc", "itc in books"], itc_2b: ["itc 2b", "itc as per 2b", "gstr 2b itc", "2b itc"] };
const norm = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
export function mapColumns(p: ReviewProcess, header: string[]): { map: Record<string, number>; missing: string[] } {
  const H = header.map(norm); const map: Record<string, number> = {}; const T = TEMPLATES[p]; if (!T) return { map, missing: [] };
  for (const col of T.columns) { const cands = [norm(col), ...(ALIASES[col] || []).map(norm)]; let idx = H.findIndex((h) => h === norm(col)); if (idx < 0) idx = H.findIndex((h) => cands.includes(h)); if (idx >= 0) map[col] = idx; }
  return { map, missing: T.required.filter((c) => map[c] === undefined) };
}
const num = (v: any) => { const n = parseFloat(String(v ?? "").replace(/[,\u20b9$\s]/g, "")); return isFinite(n) ? n : 0; };
const day = (v: any) => { const s = String(v || "").trim(); let d: Date | null = null; let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) d = new Date(+m[1], +m[2] - 1, +m[3]); else if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) d = new Date(+m[3], +m[2] - 1, +m[1]); return d && !isNaN(d.getTime()) ? d : null; };
const yes = (v: any) => /^(y|yes|true|1)$/i.test(String(v || "").trim());
const same = (a: any, b: any) => String(a || "").trim().toLowerCase() !== "" && String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const cleanNo = (v: any) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface Settings { receiptThreshold: number; approvalLimit: number; poThreshold: number; jeThreshold: number; seniorUsers: string; invAdjThreshold?: number; faCapThreshold?: number; dormantDays?: number; refDate?: string; sodPairs?: string }
export const DEFAULT_SETTINGS: Settings = { receiptThreshold: 500, approvalLimit: 25000, poThreshold: 50000, jeThreshold: 100000, seniorUsers: "", invAdjThreshold: 50000, faCapThreshold: 5000, dormantDays: 90, refDate: "", sodPairs: "VENDOR+PAYMENT; JE_POST+JE_APPROVE; PO_CREATE+PO_APPROVE; PAYROLL+BANK" };
export interface TestResult { id: string; population: number; exceptions: number; examples: string[]; note?: string }

export function runTests(p: ReviewProcess, rows: string[][], settings: Settings = DEFAULT_SETTINGS): { results: TestResult[]; rows: number; missing: string[]; mapped: Record<string, number> } {
  const header = rows[0] || []; const { map, missing } = mapColumns(p, header); const data = rows.slice(1);
  const g = (r: string[], c: string) => (map[c] === undefined ? "" : r[map[c]] ?? "");
  const idCol: Partial<Record<ReviewProcess, string>> = { te: "claim_id", p2p: "invoice_id", r2r: "je_id", o2c: "invoice_id", payroll: "emp_id", inv: "item", itgc: "user_id", treasury: "account", fa: "asset_id", tax: "invoice_no" };
  const id = (r: string[], i: number) => g(r, idCol[p] || "") || "row " + (i + 2);
  const R = (tid: string, hits: number[], fmt: (r: string[], i: number) => string, note?: string): TestResult => ({ id: tid, population: data.length, exceptions: hits.length, examples: hits.slice(0, 5).map((i) => fmt(data[i], i)), note });
  if (!TEMPLATES[p] || missing.length) return { results: [], rows: data.length, missing, mapped: map };
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
  } else if (p === "o2c") {
    const typ = (r: string[]) => (/^(cn|credit|credit note|crn)/i.test(String(g(r, "type")).trim()) ? "CN" : "INV");
    out.push(R("o2c-dup", groupHits((r) => [g(r, "customer_id").trim().toLowerCase(), num(g(r, "amount")), g(r, "date")].join("|"), 2, (r) => typ(r) === "INV").flat(), (r, i) => id(r, i) + ": " + (g(r, "customer_name") || g(r, "customer_id")) + " \u20b9" + num(g(r, "amount")) + " on " + g(r, "date")));
    out.push(map.approved_by === undefined ? { id: "o2c-cnself", population: data.length, exceptions: 0, examples: [], note: "No approved_by column \u2014 test not run." } :
      R("o2c-cnself", idx.filter((i) => typ(data[i]) === "CN" && (!String(g(data[i], "approved_by")).trim() || same(g(data[i], "created_by"), g(data[i], "approved_by")))), (r, i) => id(r, i) + ": credit note \u20b9" + num(g(r, "amount")) + " by " + (g(r, "created_by") || "?") + ", approved by " + (g(r, "approved_by") || "nobody")));
    const by: Record<string, { inv: number; cn: number; limit: number; name: string }> = {};
    idx.forEach((i) => { const r = data[i]; const k = g(r, "customer_id").trim().toLowerCase(); const x = by[k] || (by[k] = { inv: 0, cn: 0, limit: 0, name: g(r, "customer_name") || g(r, "customer_id") }); const a = Math.abs(num(g(r, "amount"))); if (typ(r) === "CN") x.cn += a; else x.inv += a; x.limit = Math.max(x.limit, num(g(r, "credit_limit"))); });
    const heavy = Object.values(by).filter((x) => x.inv > 0 && x.cn / x.inv > 0.2);
    out.push({ id: "o2c-cnshare", population: Object.keys(by).length, exceptions: heavy.length, examples: heavy.slice(0, 5).map((x) => x.name + ": credit notes " + Math.round(x.cn / x.inv * 100) + "% of invoicing"), note: "Counted per customer." });
    const over = Object.values(by).filter((x) => x.limit > 0 && x.inv > x.limit);
    out.push(map.credit_limit === undefined ? { id: "o2c-overlimit", population: data.length, exceptions: 0, examples: [], note: "No credit_limit column \u2014 test not run." } : { id: "o2c-overlimit", population: Object.keys(by).length, exceptions: over.length, examples: over.slice(0, 5).map((x) => x.name + ": invoiced \u20b9" + x.inv + " vs limit \u20b9" + x.limit), note: "Counted per customer, on the invoices in this file." });
    const months: Record<string, { all: number; end: number }> = {};
    idx.forEach((i) => { const r = data[i]; if (typ(r) !== "INV") return; const d = day(g(r, "date")); if (!d) return; const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); const m = months[k] || (months[k] = { all: 0, end: 0 }); const a = num(g(r, "amount")); m.all += a; if (d.getDate() > last - 3) m.end += a; });
    const spikes = Object.entries(months).filter(([, m]) => m.all > 0 && m.end / m.all > 0.4);
    out.push({ id: "o2c-monthend", population: Object.keys(months).length, exceptions: spikes.length, examples: spikes.slice(0, 5).map(([k, m]) => k + ": " + Math.round(m.end / m.all * 100) + "% of the month's invoicing in the last 3 days"), note: "Counted per month." });
  } else if (p === "payroll") {
    const banks: Record<string, Set<string>> = {}; idx.forEach((i) => { const b = cleanNo(g(data[i], "bank_account")); if (b) (banks[b] = banks[b] || new Set()).add(g(data[i], "emp_id").trim().toLowerCase()); });
    const shared = Object.keys(banks).filter((b) => banks[b].size > 1);
    out.push(map.bank_account === undefined ? { id: "pay-sharedbank", population: data.length, exceptions: 0, examples: [], note: "No bank_account column \u2014 test not run." } : { id: "pay-sharedbank", population: data.length, exceptions: shared.length, examples: shared.slice(0, 5).map((b) => "Account \u2026" + b.slice(-4) + " used by " + Array.from(banks[b]).join(", ")), note: "Counted per shared bank account." });
    out.push(map.exit_date === undefined ? { id: "pay-afterexit", population: data.length, exceptions: 0, examples: [], note: "No exit_date column \u2014 test not run." } :
      R("pay-afterexit", idx.filter((i) => { const e = day(g(data[i], "exit_date")), d = day(g(data[i], "pay_date")); return !!e && !!d && d > e; }), (r, i) => id(r, i) + " " + g(r, "name") + ": paid " + g(r, "pay_date") + " after leaving " + g(r, "exit_date")));
    const empPan: Record<string, string> = {}; idx.forEach((i) => { empPan[g(data[i], "emp_id").trim().toLowerCase()] = String(g(data[i], "pan")).trim().toUpperCase(); });
    const badPan = Object.entries(empPan).filter(([, v]) => !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v));
    out.push(map.pan === undefined ? { id: "pay-pan", population: data.length, exceptions: 0, examples: [], note: "No pan column \u2014 test not run." } : { id: "pay-pan", population: Object.keys(empPan).length, exceptions: badPan.length, examples: badPan.slice(0, 5).map(([k, v]) => k + ": \u201c" + v + "\u201d"), note: "Counted per employee." });
    const pans: Record<string, Set<string>> = {}; Object.entries(empPan).forEach(([e, v]) => { if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)) (pans[v] = pans[v] || new Set()).add(e); });
    const dupPan = Object.keys(pans).filter((v) => pans[v].size > 1);
    out.push(map.pan === undefined ? { id: "pay-duppan", population: data.length, exceptions: 0, examples: [], note: "No pan column \u2014 test not run." } : { id: "pay-duppan", population: Object.keys(empPan).length, exceptions: dupPan.length, examples: dupPan.slice(0, 5).map((v) => v + " used by " + Array.from(pans[v]).join(", ")), note: "Counted per PAN." });
    const per: Record<string, number[]> = {}; idx.forEach((i) => { (per[g(data[i], "emp_id").trim().toLowerCase()] = per[g(data[i], "emp_id").trim().toLowerCase()] || []).push(i); });
    const spikes: number[] = []; Object.values(per).forEach((rows) => { if (rows.length < 3) return; const v = rows.map((i) => num(g(data[i], "net_pay"))).sort((a, b) => a - b); const med = v[Math.floor(v.length / 2)]; rows.forEach((i) => { if (med > 0 && num(g(data[i], "net_pay")) > 2 * med) spikes.push(i); }); });
    out.push(R("pay-spike", spikes, (r, i) => id(r, i) + " " + g(r, "name") + ": \u20b9" + num(g(r, "net_pay")) + " on " + g(r, "pay_date"), "Needs at least three payments per employee."));
  } else if (p === "inv") {
    const isAdj = (r: string[]) => /^adj/i.test(String(g(r, "type")).trim());
    const order = [...idx].sort((a, b) => (day(g(data[a], "date"))?.getTime() || 0) - (day(g(data[b], "date"))?.getTime() || 0));
    const bal: Record<string, number> = {}; const neg = new Set<string>(); const negRows: number[] = [];
    order.forEach((i) => { const k = g(data[i], "item").trim().toLowerCase() + "|" + g(data[i], "location").trim().toLowerCase(); bal[k] = (bal[k] || 0) + num(g(data[i], "quantity")); if (bal[k] < -1e-9 && !neg.has(k)) { neg.add(k); negRows.push(i); } });
    out.push(R("inv-negative", negRows, (r, i) => g(r, "item") + " at " + (g(r, "location") || "?") + " went negative on " + g(r, "date"), "Counted per item and location; assumes the file includes opening balances."));
    out.push(map.approved_by === undefined ? { id: "inv-adjself", population: data.length, exceptions: 0, examples: [], note: "No approved_by column \u2014 test not run." } :
      R("inv-adjself", idx.filter((i) => isAdj(data[i]) && (!String(g(data[i], "approved_by")).trim() || same(g(data[i], "created_by"), g(data[i], "approved_by")))), (r, i) => g(r, "item") + " adjustment " + num(g(r, "quantity")) + " on " + g(r, "date") + " by " + (g(r, "created_by") || "?")));
    const t = settings.invAdjThreshold ?? 50000;
    out.push(map.value === undefined ? { id: "inv-adjlarge", population: data.length, exceptions: 0, examples: [], note: "No value column \u2014 test not run." } :
      R("inv-adjlarge", idx.filter((i) => isAdj(data[i]) && Math.abs(num(g(data[i], "value"))) >= t), (r, i) => g(r, "item") + ": \u20b9" + num(g(r, "value")) + " on " + g(r, "date")));
    out.push(R("inv-adjweekend", idx.filter((i) => { const d = day(g(data[i], "date")); return isAdj(data[i]) && !!d && (d.getDay() === 0 || d.getDay() === 6); }), (r, i) => g(r, "item") + " adjustment on " + g(r, "date")));
  } else if (p === "itgc") {
    const active = (r: string[]) => /^(active|enabled|a|y|yes|1)$/i.test(String(g(r, "status")).trim());
    out.push(map.exit_date === undefined ? { id: "it-leaver", population: data.length, exceptions: 0, examples: [], note: "No exit_date column \u2014 test not run." } :
      R("it-leaver", idx.filter((i) => active(data[i]) && !!String(g(data[i], "exit_date")).trim()), (r, i) => g(r, "user_id") + " (" + g(r, "name") + ") left " + g(r, "exit_date")));
    out.push(R("it-generic", idx.filter((i) => /^(admin|administrator|root|test|tester|temp|guest|user\d*|finance|accounts|shared|common|training|demo|support|sap\*?|ddic)\d*$/i.test(String(g(data[i], "user_id")).trim())), (r, i) => g(r, "user_id") + " \u2014 " + (g(r, "name") || "no owner")));
    const lastDates = idx.map((i) => day(g(data[i], "last_login"))).filter(Boolean) as Date[];
    const ref = day(settings.refDate) || (lastDates.length ? new Date(Math.max(...lastDates.map((d) => d.getTime()))) : new Date()); const dd = settings.dormantDays ?? 90;
    out.push(map.last_login === undefined ? { id: "it-dormant", population: data.length, exceptions: 0, examples: [], note: "No last_login column \u2014 test not run." } :
      R("it-dormant", idx.filter((i) => { const d = day(g(data[i], "last_login")); return active(data[i]) && (!d || (ref.getTime() - d.getTime()) / 864e5 > dd); }), (r, i) => g(r, "user_id") + ": last login " + (g(r, "last_login") || "never"), "Reference date " + ref.toISOString().slice(0, 10) + "; dormant after " + dd + " days."));
    out.push(map.privileged === undefined ? { id: "it-priv", population: data.length, exceptions: 0, examples: [], note: "No privileged column \u2014 test not run." } :
      R("it-priv", idx.filter((i) => active(data[i]) && yes(g(data[i], "privileged"))), (r, i) => g(r, "user_id") + " (" + g(r, "name") + ")", "Confirm each privileged account is approved and its use reviewed."));
    const pairs = String(settings.sodPairs || "").split(";").map((x) => x.split("+").map((y) => y.trim().toLowerCase()).filter(Boolean)).filter((x) => x.length === 2);
    const roles: Record<string, Set<string>> = {}; idx.forEach((i) => { const u = g(data[i], "user_id").trim().toLowerCase(); String(g(data[i], "roles")).split(/[;,|]/).forEach((r) => { const t = r.trim().toLowerCase(); if (t) (roles[u] = roles[u] || new Set()).add(t); }); });
    const has = (u: string, kw: string) => Array.from(roles[u] || []).some((r) => r.includes(kw));
    const clashes = Object.keys(roles).flatMap((u) => pairs.filter(([a, b]) => has(u, a) && has(u, b)).map(([a, b]) => u + ": " + a.toUpperCase() + " + " + b.toUpperCase()));
    out.push(map.roles === undefined ? { id: "it-sod", population: data.length, exceptions: 0, examples: [], note: "No roles column \u2014 test not run." } : { id: "it-sod", population: Object.keys(roles).length, exceptions: clashes.length, examples: clashes.slice(0, 5), note: "Role keywords matched: " + pairs.map((p2) => p2.join("+")).join("; ") + "." });
  } else if (p === "treasury") {
    const dates = idx.map((i) => day(g(data[i], "item_date"))).filter(Boolean) as Date[];
    const ref = day(settings.refDate) || (dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date());
    const age = (r: string[]) => { const d = day(g(r, "item_date")); return d ? (ref.getTime() - d.getTime()) / 864e5 : 0; };
    out.push(R("trs-old", idx.filter((i) => age(data[i]) > 30), (r, i) => g(r, "account") + ": \u20b9" + num(g(r, "amount")) + " from " + g(r, "item_date") + " \u2014 " + g(r, "description"), "Reference date " + ref.toISOString().slice(0, 10) + "."));
    out.push(R("trs-stale", idx.filter((i) => age(data[i]) > 90), (r, i) => g(r, "account") + ": \u20b9" + num(g(r, "amount")) + " from " + g(r, "item_date")));
    out.push(R("trs-large", idx.filter((i) => Math.abs(num(g(data[i], "amount"))) >= settings.jeThreshold), (r, i) => g(r, "account") + ": \u20b9" + num(g(r, "amount")) + " \u2014 " + g(r, "description")));
  } else if (p === "fa") {
    const ref = day(settings.refDate) || new Date();
    out.push(map.last_verified === undefined ? { id: "fa-notverified", population: data.length, exceptions: 0, examples: [], note: "No last_verified column \u2014 test not run." } :
      R("fa-notverified", idx.filter((i) => { const d = day(g(data[i], "last_verified")); return !/dispos|sold|scrap/i.test(g(data[i], "status")) && (!d || (ref.getTime() - d.getTime()) / 864e5 > 365); }), (r, i) => id(r, i) + " " + g(r, "description") + ": last verified " + (g(r, "last_verified") || "never")));
    out.push(map.location === undefined ? { id: "fa-noloc", population: data.length, exceptions: 0, examples: [], note: "No location column \u2014 test not run." } :
      R("fa-noloc", idx.filter((i) => !String(g(data[i], "location")).trim() && !/dispos|sold|scrap/i.test(g(data[i], "status"))), (r, i) => id(r, i) + " " + g(r, "description")));
    const cap = settings.faCapThreshold ?? 5000;
    out.push(R("fa-small", idx.filter((i) => num(g(data[i], "cost")) > 0 && num(g(data[i], "cost")) < cap), (r, i) => id(r, i) + " " + g(r, "description") + ": \u20b9" + num(g(r, "cost"))));
    out.push(map.status === undefined || map.nbv === undefined ? { id: "fa-disposed", population: data.length, exceptions: 0, examples: [], note: "status / nbv columns missing \u2014 test not run." } :
      R("fa-disposed", idx.filter((i) => /dispos|sold|scrap/i.test(g(data[i], "status")) && num(g(data[i], "nbv")) > 0), (r, i) => id(r, i) + " " + g(r, "description") + ": NBV \u20b9" + num(g(r, "nbv"))));
  } else if (p === "tax") {
    out.push(R("tax-mismatch", idx.filter((i) => { const b = num(g(data[i], "itc_books")), t = num(g(data[i], "itc_2b")); return b > 0 && t > 0 && Math.abs(b - t) > Math.max(1, b * 0.01); }), (r, i) => g(r, "invoice_no") + ": books \u20b9" + num(g(r, "itc_books")) + " vs 2B \u20b9" + num(g(r, "itc_2b"))));
    out.push(R("tax-not2b", idx.filter((i) => num(g(data[i], "itc_books")) > 0 && num(g(data[i], "itc_2b")) === 0), (r, i) => g(r, "invoice_no") + " (" + (g(r, "supplier_gstin") || "no GSTIN") + "): \u20b9" + num(g(r, "itc_books")) + " not in GSTR-2B"));
    out.push(map.supplier_gstin === undefined ? { id: "tax-gstin", population: data.length, exceptions: 0, examples: [], note: "No supplier_gstin column \u2014 test not run." } :
      R("tax-gstin", idx.filter((i) => !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(g(data[i], "supplier_gstin")).trim().toUpperCase())), (r, i) => g(r, "invoice_no") + ": \u201c" + g(r, "supplier_gstin") + "\u201d"));
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
