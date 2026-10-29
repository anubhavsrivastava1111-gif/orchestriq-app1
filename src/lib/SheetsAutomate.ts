// SHEETS AUTOMATE - the analyst's monthly grind, automated. Pure, deterministic logic:
// 1. Reconcile two sheets (key + amount + date tolerance, one-to-one matching)
// 2. Variance bridge between two periods (drivers, waterfall, price / volume / mix)
// 3. Data health (spaces, spelling variants, text-numbers, duplicates, outliers, Benford)
// 4. Formula risk scan (hard-coded numbers in formulas, inconsistent formulas, errors)
// 5. Report recipes (save a report once, re-run it on next month's data)
import type { Cell } from "./SheetsEngine";
import { colToLetters } from "./SheetsEngine";
import { toTable, profile, toNum, toMonth, numericCols, categoryCols, dateCol, fmtNum, type Table, type Fact } from "./SheetsAnalytics";

const isBlank = (v: Cell) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const normKey = (v: Cell) => String(v ?? "").trim().toLowerCase().replace(/[\s\-_/.]+/g, "").replace(/^0+(?=\d)/, "");

// ════════════════════ 1. RECONCILE ════════════════════
export interface ReconOptions { keyA: number; keyB: number; amtA: number; amtB: number; dateA: number; dateB: number; amtTol: number; dateTolDays: number }
export interface ReconPair { a: number; b: number; how: "key" | "amount+date"; diff: number; dayGap: number }
export interface ReconResult { matched: ReconPair[]; differences: ReconPair[]; onlyA: number[]; onlyB: number[]; totalA: number; totalB: number; matchedValue: number; summary: string[] }
const dayNum = (v: Cell): number | null => { if (typeof v === "number" && v > 20000 && v < 80000) return Math.floor(v); const m = String(v ?? "").trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) + 25569; const d = String(v ?? "").trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); return d ? Math.floor(Date.UTC(+d[3], +d[2] - 1, +d[1]) / 864e5) + 25569 : null; };

// Pick the likely key / amount / date columns of each sheet, and which key columns overlap.
export function guessRecon(a: Table, b: Table): ReconOptions {
  const amt = (t: Table) => { const nums = t.headers.map((h, i) => ({ h, i })).filter((x) => t.types[x.i] === "number"); return (nums.find((x) => /amount|amt|value|total|debit|credit|balance|net|sum/i.test(x.h)) || nums[0])?.i ?? -1; };
  const dt = (t: Table) => t.types.findIndex((x) => x === "date");
  let best = { ka: -1, kb: -1, score: 0 };
  a.headers.forEach((_, i) => { if (a.types[i] === "date") return; const va = new Set(a.rows.map((r) => normKey(r[i])).filter(Boolean)); if (va.size < Math.max(2, a.rows.length * 0.5)) return;
    b.headers.forEach((_, j) => { if (b.types[j] === "date") return; const vb = b.rows.map((r) => normKey(r[j])).filter(Boolean); if (!vb.length) return; let hit = 0; for (const v of vb) if (va.has(v)) hit++;
      const nameBonus = a.headers[i].toLowerCase() === b.headers[j].toLowerCase() ? 0.1 : /ref|id|no|number|invoice|doc|txn|cheque|utr/i.test(a.headers[i] + b.headers[j]) ? 0.05 : 0;
      const score = hit / vb.length + nameBonus; if (hit >= 1 && score > best.score) best = { ka: i, kb: j, score }; }); });
  return { keyA: best.ka, keyB: best.kb, amtA: amt(a), amtB: amt(b), dateA: dt(a), dateB: dt(b), amtTol: 1, dateTolDays: 3 };
}
export function reconcile(a: Table, b: Table, o: ReconOptions): ReconResult {
  const usedB = new Set<number>(), matched: ReconPair[] = [], differences: ReconPair[] = [], matchedA = new Set<number>();
  const amtOf = (t: Table, i: number, c: number) => (c >= 0 ? toNum(t.rows[i][c]) ?? 0 : 0); const dayOf = (t: Table, i: number, c: number) => (c >= 0 ? dayNum(t.rows[i][c]) : null);
  // Pass 1: by key (exact after normalising spaces, dashes and leading zeros)
  if (o.keyA >= 0 && o.keyB >= 0) { const idx = new Map<string, number[]>(); b.rows.forEach((r, j) => { const k = normKey(r[o.keyB]); if (k) idx.set(k, [...(idx.get(k) || []), j]); });
    a.rows.forEach((r, i) => { const k = normKey(r[o.keyA]); const cands = (idx.get(k) || []).filter((j) => !usedB.has(j)); if (!k || !cands.length) return;
      const aa = amtOf(a, i, o.amtA); const j = cands.sort((x, y) => Math.abs(amtOf(b, x, o.amtB) - aa) - Math.abs(amtOf(b, y, o.amtB) - aa))[0]; usedB.add(j); matchedA.add(i);
      const diff = +(amtOf(b, j, o.amtB) - aa).toFixed(2); const da = dayOf(a, i, o.dateA), db = dayOf(b, j, o.dateB); const p: ReconPair = { a: i, b: j, how: "key", diff, dayGap: da !== null && db !== null ? db - da : 0 };
      (Math.abs(diff) <= o.amtTol ? matched : differences).push(p); }); }
  // Pass 2: unmatched rows by amount (within tolerance) and date (within N days), closest first: bank-reconciliation style
  if (o.amtA >= 0 && o.amtB >= 0) { const restB = b.rows.map((_, j) => j).filter((j) => !usedB.has(j));
    a.rows.forEach((_, i) => { if (matchedA.has(i)) return; const aa = amtOf(a, i, o.amtA), da = dayOf(a, i, o.dateA); let bestJ = -1, bestScore = Infinity;
      for (const j of restB) { if (usedB.has(j)) continue; const d = Math.abs(amtOf(b, j, o.amtB) - aa); if (d > o.amtTol) continue; const db = dayOf(b, j, o.dateB); const g = da !== null && db !== null ? Math.abs(db - da) : 0; if (g > o.dateTolDays) continue; const sc = d * 1000 + g; if (sc < bestScore) { bestScore = sc; bestJ = j; } }
      if (bestJ >= 0) { usedB.add(bestJ); matchedA.add(i); const db = dayOf(b, bestJ, o.dateB); matched.push({ a: i, b: bestJ, how: "amount+date", diff: +(amtOf(b, bestJ, o.amtB) - aa).toFixed(2), dayGap: da !== null && db !== null ? db - da : 0 }); } }); }
  const onlyA = a.rows.map((_, i) => i).filter((i) => !matchedA.has(i)), onlyB = b.rows.map((_, j) => j).filter((j) => !usedB.has(j));
  const sumA = (ix: number[]) => ix.reduce((s, i) => s + amtOf(a, i, o.amtA), 0), sumB = (ix: number[]) => ix.reduce((s, j) => s + amtOf(b, j, o.amtB), 0);
  const totalA = sumA(a.rows.map((_, i) => i)), totalB = sumB(b.rows.map((_, j) => j)); const matchedValue = matched.reduce((s, p) => s + amtOf(a, p.a, o.amtA), 0);
  const summary = [matched.length + " of " + a.rows.length + " rows matched" + (matched.filter((p) => p.how === "amount+date").length ? " (" + matched.filter((p) => p.how === "amount+date").length + " by amount and date, without a common reference)" : "") + ".",
    differences.length ? differences.length + " matched on reference but the amounts differ by " + fmtNum(differences.reduce((s, p) => s + Math.abs(p.diff), 0)) + " in total." : "No amount differences on matched references.",
    onlyA.length + " rows (" + fmtNum(sumA(onlyA)) + ") are only in the first sheet; " + onlyB.length + " rows (" + fmtNum(sumB(onlyB)) + ") are only in the second.",
    "Totals: " + fmtNum(totalA) + " vs " + fmtNum(totalB) + ", a gap of " + fmtNum(totalB - totalA) + "."];
  return { matched, differences, onlyA, onlyB, totalA, totalB, matchedValue, summary };
}
export function reconSheets(a: Table, b: Table, o: ReconOptions, r: ReconResult, nameA: string, nameB: string): { name: string; rows: Cell[][] }[] {
  const hA = a.headers.map((h) => nameA + ": " + h), hB = b.headers.map((h) => nameB + ": " + h);
  const sum: Cell[][] = [["Reconciliation: " + nameA + " vs " + nameB], [], ["Result", "Rows", "Value"],
    ["Matched", r.matched.length, r.matched.reduce((s, p) => s + (toNum(a.rows[p.a][o.amtA]) ?? 0), 0)], ["Amount differences", r.differences.length, r.differences.reduce((s, p) => s + p.diff, 0)],
    ["Only in " + nameA, r.onlyA.length, r.onlyA.reduce((s, i) => s + (toNum(a.rows[i][o.amtA]) ?? 0), 0)], ["Only in " + nameB, r.onlyB.length, r.onlyB.reduce((s, j) => s + (toNum(b.rows[j][o.amtB]) ?? 0), 0)],
    [], ["Total " + nameA, "", r.totalA], ["Total " + nameB, "", r.totalB], ["Gap", "", r.totalB - r.totalA], [], ...r.summary.map((s) => [s] as Cell[]),
    [], ["Settings: key " + (o.keyA >= 0 ? a.headers[o.keyA] + " ↔ " + b.headers[o.keyB] : "none") + ", amount tolerance " + o.amtTol + ", date tolerance " + o.dateTolDays + " days"]];
  return [{ name: "Recon summary", rows: sum },
    { name: "Recon differences", rows: [["Difference", "Day gap", ...hA, ...hB], ...r.differences.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).map((p) => [p.diff, p.dayGap, ...a.rows[p.a], ...b.rows[p.b]] as Cell[])] },
    { name: "Recon only in A", rows: [a.headers, ...r.onlyA.map((i) => a.rows[i])] }, { name: "Recon only in B", rows: [b.headers, ...r.onlyB.map((j) => b.rows[j])] },
    { name: "Recon matched", rows: [["Matched by", "Day gap", ...hA, ...hB], ...r.matched.map((p) => [p.how, p.dayGap, ...a.rows[p.a], ...b.rows[p.b]] as Cell[])] }];
}

// ════════════════════ 2. VARIANCE BRIDGE ════════════════════
export interface BridgeSpec { measure: string; periodCol: string; from: string; to: string; dims: string[]; units?: string; priceDim?: string }
export interface BridgeResult { from: number; to: number; change: number; pct: number; drivers: { dim: string; items: { key: string; a: number; b: number; d: number }[] }[];
  pvm?: { price: number; volume: number; mix: number; dim: string }; waterfall: { label: string; value: number; kind: "total" | "up" | "down" }[]; commentary: string[]; facts: Fact[] }
export function periodsOf(t: Table, periodCol: string): string[] { const c = t.headers.indexOf(periodCol); if (c < 0) return []; const set = new Set<string>(); for (const r of t.rows) { const k = t.types[c] === "date" ? toMonth(r[c]) : String(r[c] ?? "").trim(); if (k) set.add(k); } return [...set].sort(); }
export function bridge(t: Table, s: BridgeSpec): BridgeResult | { error: string } {
  const pc = t.headers.indexOf(s.periodCol), mc = t.headers.indexOf(s.measure), uc = s.units ? t.headers.indexOf(s.units) : -1;
  if (pc < 0 || mc < 0) return { error: "Choose a period column and a measure." }; if (s.from === s.to) return { error: "Choose two different periods." };
  const per = (r: Cell[]) => (t.types[pc] === "date" ? toMonth(r[pc]) : String(r[pc] ?? "").trim());
  const A = t.rows.filter((r) => per(r) === s.from), B = t.rows.filter((r) => per(r) === s.to); if (!A.length || !B.length) return { error: "One of the periods has no rows." };
  const tot = (rows: Cell[][], c: number) => rows.reduce((x, r) => x + (toNum(r[c]) ?? 0), 0); const a = tot(A, mc), b = tot(B, mc), change = b - a;
  const drivers = s.dims.map((dim) => { const dc = t.headers.indexOf(dim); const m = new Map<string, { a: number; b: number }>();
    for (const r of A) { const k = isBlank(r[dc]) ? "(blank)" : String(r[dc]).trim(); const e = m.get(k) || { a: 0, b: 0 }; e.a += toNum(r[mc]) ?? 0; m.set(k, e); }
    for (const r of B) { const k = isBlank(r[dc]) ? "(blank)" : String(r[dc]).trim(); const e = m.get(k) || { a: 0, b: 0 }; e.b += toNum(r[mc]) ?? 0; m.set(k, e); }
    return { dim, items: [...m.entries()].map(([key, e]) => ({ key, a: e.a, b: e.b, d: e.b - e.a })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)) }; });
  // Price / volume / mix at the level of priceDim (e.g. Product), when a units column exists.
  let pvm: BridgeResult["pvm"]; const pdim = s.priceDim || s.dims[0];
  if (uc >= 0 && pdim) { const dc = t.headers.indexOf(pdim); const agg = (rows: Cell[][]) => { const m = new Map<string, { r: number; q: number }>(); for (const r of rows) { const k = String(r[dc] ?? "").trim(); const e = m.get(k) || { r: 0, q: 0 }; e.r += toNum(r[mc]) ?? 0; e.q += toNum(r[uc]) ?? 0; m.set(k, e); } return m; };
    const m0 = agg(A), m1 = agg(B); const Q0 = [...m0.values()].reduce((x, e) => x + e.q, 0), Q1 = [...m1.values()].reduce((x, e) => x + e.q, 0);
    if (Q0 > 0 && Q1 > 0) { const avgP0 = a / Q0; let price = 0, mixBase = 0;
      for (const [k, e1] of m1) { const e0 = m0.get(k); const p1 = e1.q ? e1.r / e1.q : 0; const p0 = e0 && e0.q ? e0.r / e0.q : p1; price += (p1 - p0) * e1.q; mixBase += e1.q * p0; }
      const volume = (Q1 - Q0) * avgP0, mix = mixBase - Q1 * avgP0; pvm = { price, volume, mix, dim: pdim }; } }   /* price + volume + mix = change, exactly (tested) */
  // Waterfall: start, top movers of the first dimension, everything else, end
  const d0 = drivers[0]; const wf: BridgeResult["waterfall"] = [{ label: s.from, value: a, kind: "total" }];
  if (pvm) { wf.push({ label: "Volume", value: pvm.volume, kind: pvm.volume >= 0 ? "up" : "down" }, { label: "Price", value: pvm.price, kind: pvm.price >= 0 ? "up" : "down" }, { label: "Mix", value: pvm.mix, kind: pvm.mix >= 0 ? "up" : "down" }); }
  else if (d0) { const top = d0.items.slice(0, 6); top.forEach((x) => wf.push({ label: x.key, value: x.d, kind: x.d >= 0 ? "up" : "down" })); const rest = d0.items.slice(6).reduce((x, y) => x + y.d, 0); if (Math.abs(rest) > 0.005) wf.push({ label: "Others", value: rest, kind: rest >= 0 ? "up" : "down" }); }
  wf.push({ label: s.to, value: b, kind: "total" });
  const pct = a ? (change / Math.abs(a)) * 100 : 0; const facts: Fact[] = [{ id: "b-tot", text: "", nums: [a, b, change, Math.abs(change), +pct.toFixed(1), +Math.abs(pct).toFixed(1)] }];
  const com: string[] = [s.measure + " " + (change >= 0 ? "rose" : "fell") + " by " + fmtNum(Math.abs(change)) + " (" + Math.abs(pct).toFixed(1) + "%) from " + fmtNum(a) + " in " + s.from + " to " + fmtNum(b) + " in " + s.to + "."];
  for (const dv of drivers) { const up = dv.items.filter((x) => x.d > 0)[0], dn = dv.items.filter((x) => x.d < 0)[0];
    const parts: string[] = []; if (up) parts.push(up.key + " added " + fmtNum(up.d)); if (dn) parts.push(dn.key + " took away " + fmtNum(Math.abs(dn.d)));
    if (parts.length) { com.push("By " + dv.dim + ": " + parts.join("; ") + "."); facts.push({ id: "b-" + dv.dim, text: "", nums: [up?.d ?? 0, Math.abs(dn?.d ?? 0)] }); } }
  if (pvm) { const share = (x: number) => (change ? Math.abs(x / change) * 100 : 0); const big = [["volume", pvm.volume], ["price", pvm.price], ["mix", pvm.mix]].sort((x: any, y: any) => Math.abs(y[1]) - Math.abs(x[1]))[0];
    com.push("Split of the change: volume " + (pvm.volume >= 0 ? "+" : "−") + fmtNum(Math.abs(pvm.volume)) + ", price " + (pvm.price >= 0 ? "+" : "−") + fmtNum(Math.abs(pvm.price)) + ", mix " + (pvm.mix >= 0 ? "+" : "−") + fmtNum(Math.round(Math.abs(pvm.mix))) + " (prices compared by " + pvm.dim + "). The main driver is " + big[0] + ".");
    facts.push({ id: "b-pvm", text: "", nums: [Math.abs(pvm.volume), Math.abs(pvm.price), Math.abs(pvm.mix), share(pvm.volume), share(pvm.price), share(pvm.mix)] }); }
  return { from: a, to: b, change, pct, drivers, pvm, waterfall: wf, commentary: com, facts };
}
export function bridgeSheetRows(s: BridgeSpec, r: BridgeResult): Cell[][] {
  const rows: Cell[][] = [["Variance bridge: " + s.measure + ", " + s.from + " → " + s.to], [], ["Step", "Amount", "Running total"]]; let run = 0;
  r.waterfall.forEach((w, i) => { if (w.kind === "total") { run = w.value; rows.push([w.label + (i === 0 ? " (start)" : " (end)"), w.value, w.value]); } else { run += w.value; rows.push([w.label, w.value, run]); } });
  rows.push([], ["Commentary"], ...r.commentary.map((c) => [c] as Cell[]));
  for (const dv of r.drivers) { rows.push([], ["By " + dv.dim, s.from, s.to, "Change", "Change %"], ...dv.items.map((x) => [x.key, x.a, x.b, x.d, x.a ? x.d / Math.abs(x.a) : ""] as Cell[])); }
  return rows;
}

// ════════════════════ 3. DATA HEALTH ════════════════════
export interface HealthIssue { id: string; kind: "spaces" | "variants" | "textNumbers" | "duplicates" | "blanks" | "outliers" | "benford"; column?: number; title: string; detail: string; count: number; fixable: boolean; optIn?: boolean; severity: "high" | "medium" | "low"; examples: string[]; groups?: { canonical: string; variants: string[] }[] }
const lev = (a: string, b: string) => { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? d[i - 2][j - 2] + 1 : 99); return d[a.length][b.length]; };
// Spelling variants of the same value in a text column: same letters ignoring case/spaces, or one typo apart.
export function variantGroups(values: Cell[]): { canonical: string; variants: string[] }[] {
  const count = new Map<string, number>(); for (const v of values) { if (isBlank(v) || typeof v !== "string") continue; count.set(v, (count.get(v) || 0) + 1); }
  const vals = [...count.keys()]; if (vals.length > 400 || vals.length < 2) return [];
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ""); const parent = new Map<string, string>(); const find = (x: string): string => { while (parent.get(x) && parent.get(x) !== x) x = parent.get(x)!; return x; };
  vals.forEach((v) => parent.set(v, v));
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) { const a = key(vals[i]), b = key(vals[j]); if (!a || !b) continue;
    const same = a === b || (a.length >= 5 && b.length >= 5 && !/\d/.test(a + b) && lev(a, b) === 1); if (same) parent.set(find(vals[j]), find(vals[i])); }
  const groups = new Map<string, string[]>(); for (const v of vals) { const r = find(v); groups.set(r, [...(groups.get(r) || []), v]); }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => { const canonical = g.slice().sort((x, y) => (count.get(y)! - count.get(x)!) || (x.trim() === x ? -1 : 1))[0].trim(); return { canonical, variants: g.filter((x) => x !== canonical) }; });
}
// Benford's law: first digits of genuine transaction amounts follow log10(1+1/d). Large deviations are a red flag.
export function benford(values: number[]): { n: number; observed: number[]; expected: number[]; mad: number; verdict: "close" | "acceptable" | "marginal" | "nonconforming" } | null {
  const xs = values.filter((v) => isFinite(v) && Math.abs(v) >= 10).map((v) => +String(Math.abs(v)).replace(/[^1-9]/, "").replace(/^0+/, "")[0] || 0).filter((d) => d >= 1 && d <= 9);
  if (xs.length < 300) return null; const obs = Array(9).fill(0); xs.forEach((d) => obs[d - 1]++); const observed = obs.map((c) => c / xs.length); const expected = observed.map((_, i) => Math.log10(1 + 1 / (i + 1)));
  const mad = observed.reduce((s, o, i) => s + Math.abs(o - expected[i]), 0) / 9; // Nigrini first-digit thresholds
  return { n: xs.length, observed, expected, mad, verdict: mad < 0.006 ? "close" : mad < 0.012 ? "acceptable" : mad < 0.015 ? "marginal" : "nonconforming" };
}
export function healthScan(t: Table): HealthIssue[] {
  const out: HealthIssue[] = []; const p = profile(t);
  t.headers.forEach((h, c) => { const vals = t.rows.map((r) => r[c]);
    const sp = vals.filter((v) => typeof v === "string" && (v !== v.trim() || /\s{2,}/.test(v))); if (sp.length) out.push({ id: "sp-" + c, kind: "spaces", column: c, title: "Extra spaces in " + h, detail: "Leading, trailing or double spaces make identical values look different to pivots and lookups.", count: sp.length, fixable: true, severity: "medium", examples: sp.slice(0, 3).map((v) => "“" + v + "”") });
    if (t.types[c] === "text") { const g = variantGroups(vals); const n = g.reduce((s, x) => s + vals.filter((v) => x.variants.includes(v as string)).length, 0);
      if (g.length) out.push({ id: "var-" + c, kind: "variants", column: c, title: "Spelling variants in " + h, detail: "The same item is written different ways, so totals split across them.", count: n, fixable: true, severity: "high", examples: g.slice(0, 3).map((x) => x.variants.map((v) => "“" + v + "”").join(", ") + " → " + x.canonical), groups: g }); }
    if (t.types[c] === "number") { const tn = vals.filter((v) => typeof v === "string" && toNum(v) !== null); if (tn.length) out.push({ id: "tn-" + c, kind: "textNumbers", column: c, title: "Numbers stored as text in " + h, detail: "These are ignored by SUM and pivots.", count: tn.length, fixable: true, severity: "high", examples: tn.slice(0, 3).map((v) => "“" + v + "”") }); }
    const blanks = vals.filter(isBlank).length; if (blanks && blanks / Math.max(1, t.rows.length) > 0.02 && t.types[c] !== "empty") out.push({ id: "bl-" + c, kind: "blanks", column: c, title: "Blanks in " + h, detail: "Rows with no value here drop out of breakdowns by " + h + ".", count: blanks, fixable: false, severity: blanks / t.rows.length > 0.1 ? "high" : "low", examples: [] }); });
  // Identical rows are only certainly duplicates when the data has an ID column (order no., invoice no.).
  // Without one, two identical sales can be genuine, so removal is offered but never pre-selected or automated.
  if (p.duplicateRows) { const uniq = p.rows - p.duplicateRows; const idCol = p.columns.find((c) => c.type !== "empty" && c.distinct >= uniq * 0.98 && (/\b(id|no|num|number|ref|reference|invoice|order|txn|transaction|code|voucher|doc)\b/i.test(c.name.replace(/[_#.-]/g, " ")) || uniq >= 50));
    out.push(idCol ? { id: "dup", kind: "duplicates", title: "Exact duplicate rows", detail: "Rows repeated in full, including the " + idCol.name + " ID. Each is counted twice in every total.", count: p.duplicateRows, fixable: true, severity: "high", examples: [] }
      : { id: "dup", kind: "duplicates", title: "Identical rows (check before removing)", detail: "These rows match in every column, but there is no ID column, so they may be genuine repeat transactions. Remove them only if every row should be unique.", count: p.duplicateRows, fixable: true, optIn: true, severity: "medium", examples: [] }); }
  numericCols(p).forEach((c) => { if (c.outliers) out.push({ id: "out-" + c.index, kind: "outliers", column: c.index, title: "Extreme values in " + c.name, detail: "Far outside the usual range (3× the interquartile range). Check before reporting.", count: c.outliers, fixable: false, severity: "medium", examples: [] }); });
  const amt = numericCols(p).find((c) => /amount|value|revenue|sales|total|invoice|payment|debit|credit|expense/i.test(c.name)) || numericCols(p)[0];
  if (amt) { const bf = benford(t.rows.map((r) => toNum(r[amt.index]) ?? NaN)); if (bf && (bf.verdict === "marginal" || bf.verdict === "nonconforming")) out.push({ id: "benford", kind: "benford", column: amt.index, title: "Unusual first-digit pattern in " + amt.name, detail: "Benford's law test (" + bf.n + " values, deviation " + bf.mad.toFixed(4) + ", " + bf.verdict + "). Genuine transactions usually follow it; invented or split amounts often don't. Worth an audit look, not proof of fraud.", count: bf.n, fixable: false, severity: bf.verdict === "nonconforming" ? "high" : "medium", examples: [] }); }
  const rank = { high: 0, medium: 1, low: 2 }; return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
// Apply the chosen fixes to the raw sheet values (header row first). Formulas are never touched.
export function applyFixes(values: Cell[][], issues: HealthIssue[]): { values: Cell[][]; log: string[] } {
  const v = values.map((r) => r.slice()); const log: string[] = []; const isF = (x: Cell): boolean => typeof x === "string" && x.startsWith("=");
  for (const is of issues) { if (!is.fixable) continue; let n = 0;
    if (is.kind === "spaces" && is.column !== undefined) for (let r = 1; r < v.length; r++) { const x = v[r][is.column]; if (typeof x === "string" && !isF(x)) { const y = x.trim().replace(/\s{2,}/g, " "); if (y !== x) { v[r][is.column] = y; n++; } } }
    if (is.kind === "textNumbers" && is.column !== undefined) for (let r = 1; r < v.length; r++) { const x = v[r][is.column]; if (typeof x === "string" && !isF(x)) { const y = toNum(x); if (y !== null) { v[r][is.column] = y; n++; } } }
    if (is.kind === "variants" && is.column !== undefined && is.groups) { const map = new Map<string, string>(); is.groups.forEach((g) => g.variants.forEach((x) => map.set(x, g.canonical))); for (let r = 1; r < v.length; r++) { const x = v[r][is.column]; if (typeof x === "string" && map.has(x)) { v[r][is.column] = map.get(x)!; n++; } } }
    if (is.kind === "duplicates") { const seen = new Set<string>(); const keep: Cell[][] = [v[0]]; for (let r = 1; r < v.length; r++) { const k = JSON.stringify(v[r]); if (v[r].some((x) => !isBlank(x)) && seen.has(k)) { n++; continue; } seen.add(k); keep.push(v[r]); } v.length = 0; v.push(...keep); }
    if (n) log.push(is.title + ": " + n + " change" + (n > 1 ? "s" : "") + "."); }
  return { values: v, log };
}

// ════════════════════ 4. FORMULA RISK ════════════════════
export interface FormulaRisk { kind: "hardcoded" | "inconsistent" | "error"; cell: string; formula: string; why: string }
const REF = /(\$?)([A-Z]{1,3})(\$?)(\d{1,7})(?![\d(])/g;
// Relative form of a formula (like Excel's R1C1) so copied formulas compare equal.
export function relForm(f: string, r: number, c: number): string { return f.replace(/"[^"]*"/g, '""').replace(REF, (_m, cd, col, rd, row) => { let cc = 0; for (const ch of col) cc = cc * 26 + ch.charCodeAt(0) - 64; cc -= 1; const rr = +row - 1; return (cd ? "C" + cc : "C[" + (cc - c) + "]") + (rd ? "R" + rr : "R[" + (rr - r) + "]"); }); }
export function formulaRisks(formulas: Cell[][], values: Cell[][]): FormulaRisk[] {
  const out: FormulaRisk[] = []; const cols = Math.max(0, ...formulas.map((r) => (r || []).length));
  for (let r = 0; r < formulas.length; r++) for (let c = 0; c < (formulas[r] || []).length; c++) { const f = formulas[r][c]; if (typeof f !== "string" || !f.startsWith("=")) continue; const cell = colToLetters(c) + (r + 1);
    const v = values[r]?.[c]; if (typeof v === "string" && /^#(REF!|NAME\?|DIV\/0!|VALUE!|N\/A|NUM!|NULL!)/.test(v)) out.push({ kind: "error", cell, formula: f, why: "Shows " + v + "." });
    const body = f.slice(1).replace(/"[^"]*"/g, "").replace(REF, "").replace(/[A-Z_]+\(/gi, "(");
    const consts = (body.match(/(?<![A-Za-z_.])\d+(\.\d+)?%?/g) || ([] as string[])).filter((n) => !["0", "1", "100", "2", "12"].includes(n.replace(/%$/, "")));
    if (consts.length) out.push({ kind: "hardcoded", cell, formula: f, why: "Hard-coded " + consts.slice(0, 3).join(", ") + " inside the formula. If it's a rate or assumption, put it in its own labelled cell so it can be seen and changed." }); }
  // Inconsistent formulas: in a column of copied formulas, the odd one out
  for (let c = 0; c < cols; c++) { const items: { r: number; rf: string; f: string }[] = []; for (let r = 0; r < formulas.length; r++) { const f = formulas[r]?.[c]; if (typeof f === "string" && f.startsWith("=")) items.push({ r, rf: relForm(f, r, c), f }); }
    const isTotal = (f: string) => /^=\s*(SUM|SUBTOTAL|AVERAGE|COUNT|MIN|MAX)\(/i.test(f); const core = items.filter((x) => !isTotal(x.f)); items.length = 0; items.push(...core);   /* totals are not copies */
    if (items.length < 4) continue; const cnt = new Map<string, number>(); items.forEach((x) => cnt.set(x.rf, (cnt.get(x.rf) || 0) + 1)); const [major, mc] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    if (mc / items.length < 0.7) continue; items.filter((x) => x.rf !== major).forEach((x) => out.push({ kind: "inconsistent", cell: colToLetters(c) + (x.r + 1), formula: x.f, why: "Differs from the " + mc + " other formulas in column " + colToLetters(c) + " (" + items.find((y) => y.rf === major)!.f + " pattern). Often a pasted value or a broken copy." })); }
  return out;
}

// ════════════════════ 5. REPORT RECIPES (Autopilot) ════════════════════
export interface Recipe { id: string; name: string; headers: string[]; created: string; steps: { clean: boolean; analysis: boolean; pivots: { rows: string; cols?: string; value?: string; agg: "sum" | "count" | "avg" | "min" | "max"; byMonth?: boolean }[]; bridge: boolean; report: boolean }; lastRun?: { at: string; rows: number; totals: Record<string, number>; byDim: Record<string, Record<string, number>> } }
export const RECIPE_KEY = "oiq-sheets-recipes";
export function headerMatch(recipe: Recipe, headers: string[]): number { const a = new Set(recipe.headers.map((h) => h.toLowerCase().trim())); const b = headers.map((h) => h.toLowerCase().trim()); if (!a.size) return 0; return b.filter((h) => a.has(h)).length / a.size; }
// Pass the previous run's dimension keys ("Product|Revenue") so a re-run compares like with like.
export function snapshotFor(t: Table, sameAs?: string[]): NonNullable<Recipe["lastRun"]> { const p = profile(t); const totals: Record<string, number> = {}; numericCols(p).slice(0, 4).forEach((c) => (totals[c.name] = c.sum || 0));
  const byDim: Record<string, Record<string, number>> = {}; const cat = categoryCols(p)[0], n0 = numericCols(p)[0];
  const pairs = sameAs && sameAs.length ? sameAs.map((k) => k.split("|")).filter(([d, m]) => t.headers.includes(d) && t.headers.includes(m)) : cat && n0 ? [[cat.name, n0.name]] : [];
  for (const [dim, meas] of pairs) { const di = t.headers.indexOf(dim), mi = t.headers.indexOf(meas); const m: Record<string, number> = {}; for (const r of t.rows) { const k = isBlank(r[di]) ? "(blank)" : String(r[di]).trim(); m[k] = (m[k] || 0) + (toNum(r[mi]) ?? 0); } byDim[dim + "|" + meas] = m; }
  return { at: new Date().toISOString(), rows: t.rows.length, totals, byDim }; }
// "What changed since the last run": computed differences, ready for commentary.
export function compareRuns(prev: NonNullable<Recipe["lastRun"]>, now: NonNullable<Recipe["lastRun"]>): string[] {
  const out: string[] = ["Rows: " + fmtNum(prev.rows) + " last time, " + fmtNum(now.rows) + " now."];
  for (const [k, v] of Object.entries(now.totals)) { const p = prev.totals[k]; if (p === undefined) continue; const d = v - p; out.push(k + ": " + fmtNum(p) + " → " + fmtNum(v) + " (" + (d >= 0 ? "+" : "−") + fmtNum(Math.abs(d)) + (p ? ", " + (d >= 0 ? "+" : "−") + Math.abs((d / p) * 100).toFixed(1) + "%" : "") + ")."); }
  for (const [dk, m] of Object.entries(now.byDim)) { const pm = prev.byDim[dk]; if (!pm) continue; const [dim, meas] = dk.split("|");
    const ch = Object.keys({ ...m, ...pm }).map((k) => ({ k, d: (m[k] || 0) - (pm[k] || 0) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
    if (ch.length) out.push("Biggest moves in " + meas + " by " + dim + ": " + ch.map((x) => x.k + " " + (x.d >= 0 ? "+" : "−") + fmtNum(Math.abs(x.d))).join(", ") + ".");
    const added = Object.keys(m).filter((k) => !(k in pm)), gone = Object.keys(pm).filter((k) => !(k in m)); if (added.length) out.push("New " + dim + ": " + added.join(", ") + "."); if (gone.length) out.push("No longer present: " + gone.join(", ") + "."); }
  return out;
}
export { toTable, dateCol };
