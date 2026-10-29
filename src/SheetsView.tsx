import React, { useEffect, useRef, useState } from "react";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";
import { cockpitContext } from "./lib/DecisionExports";
import { latestDecisionStage } from "./lib/DecisionExportActions";
import { INPUT_LABEL } from "./lib/DecisionCockpit";
import { SmartPanel, AnalyzePanel, AskPanel, PivotPanel, ChartPanel, DataApp, type InsightCtx, type SheetStyle, type BasketItem } from "./SheetsInsights";
import { isoToSerial, DATE_PATTERN } from "./lib/SheetsEngine";
import { TEMPLATES, gridToSnapshot, snapshotToGrid, snapshotValues, parseCsv, gridToCsv, xlsxToGrid, gridToXlsx, ledgerToGrid, pairsToGrid, tableToGrid, buildContext, AI_SYSTEM, parsePlan, describeOp, expandWrites, highlightRows, sortRows, findErrors, parseRange, type Plan, type WorkbookGrid, type Cell } from "./lib/SheetsEngine";

// OrchestrIQ SHEETS - an Excel-compatible spreadsheet (Univer, Apache-2.0 core) with AI
// automation that proposes a plan you approve before anything changes. This whole file is
// loaded only when the Sheets module is opened, so the rest of the site stays as fast as before.
const V = { text: "var(--oiq-ink)", text2: "var(--oiq-body)", text3: "var(--oiq-muted)", border: "var(--oiq-border)", surface: "var(--oiq-surface)", surface2: "var(--oiq-surface2)", accent: "var(--oiq-accent)", ok: "var(--oiq-success)", warn: "var(--oiq-warning)", bad: "var(--oiq-danger)" };
const inp: React.CSSProperties = { minHeight: 36, padding: "0 10px", borderRadius: 8, border: "1px solid " + V.border, background: V.surface, color: V.text, fontSize: 13, boxSizing: "border-box" };
const btn = (on = false): React.CSSProperties => ({ minHeight: 36, padding: "0 12px", borderRadius: 8, border: "1px solid " + (on ? V.accent : V.border), background: on ? V.accent : V.surface, color: on ? "#fff" : V.text, fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" });
const KEY = "oiq-sheets-v1";
interface Book { id: string; name: string; updatedAt: string }
interface Store { books: Book[]; snaps: Record<string, any>; activeId: string }   // snaps: in-memory cache; persisted in IndexedDB
// Large workbooks (14,000 x 200 is ~57 MB) do not fit browser localStorage (~5 MB), so workbook
// contents live in IndexedDB; only the small list of workbook names stays in localStorage.
const DB = "oiq-sheets", STORE = "snaps";
const idb = (): Promise<IDBDatabase> => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbGet(id: string): Promise<any> { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(id); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbPut(id: string, v: any): Promise<void> { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(v, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbDel(id: string): Promise<void> { const db = await idb(); return new Promise((res) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }
type Ask = (sys: string, msgs: { role: string; content: string }[], maxT?: number) => Promise<string>;
export interface SheetsProps { ask?: Ask; showToast?: (m: string, k?: string) => void; ledgerEntries?: any[]; accountName?: (code: string) => string; boardroomCurrent?: any; location?: string }

const uid = () => "wb-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function initialStore(): Store {
  try { const v = localStorage.getItem(KEY); if (v) { const s = JSON.parse(v); if (s?.books?.length) {
    // One-time move of workbooks saved by the earlier version (inside localStorage) into IndexedDB.
    const old = s.snaps || {}; if (Object.keys(old).length) { Promise.all(Object.entries(old).map(([id, snap]) => idbPut(id, snap))).then(() => { try { localStorage.setItem(KEY, JSON.stringify({ books: s.books, activeId: s.activeId, snaps: {} })); } catch {} }).catch(() => {}); }
    return { books: s.books, activeId: s.activeId, snaps: old }; } } } catch {}
  const t = TEMPLATES[0].build(); const id = uid();
  return { books: [{ id, name: t.name, updatedAt: new Date().toISOString() }], snaps: { [id]: gridToSnapshot(t, id) }, activeId: id };
}
function isDarkTheme(): boolean { try { const bg = getComputedStyle(document.documentElement).getPropertyValue("--oiq-bg").trim() || getComputedStyle(document.body).backgroundColor; const m = bg.match(/#([0-9a-f]{6})/i); let r = 0, g = 0, b = 0;
  if (m) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16); } else { const n = bg.match(/\d+/g); if (n) [r, g, b] = n.map(Number); }
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128; } catch { return false; } }
function download(name: string, blob: Blob) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); }
const safeName = (s: string) => (s || "workbook").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "workbook";

// Numbers from the latest finished Boardroom decision, with where each came from.
export function boardroomRows(cur: any, location = ""): { label: string; value: Cell; source?: string }[] {
  try { if (!cur || !Array.isArray(cur.stages)) return []; const si = latestDecisionStage(cur); if (si < 0) return []; const ctx: any = cockpitContext(cur, si, { location });
    const rows: { label: string; value: Cell; source?: string }[] = [];
    for (const [k, v] of Object.entries<any>(ctx?.inputs || {})) { if (v && typeof v.value === "number") rows.push({ label: ((INPUT_LABEL as any)[k]?.label || k), value: v.value, source: v.label === "User Input" ? "Your input" : v.label || "" }); }
    for (const [k, v] of Object.entries<any>(ctx?.outputs || {})) { if (typeof v === "number" && isFinite(v)) rows.push({ label: "Result: " + k.replace(/([A-Z])/g, " $1").toLowerCase(), value: v, source: "Calculated by the Decision Cockpit" }); }
    return rows; } catch { return []; }
}

export default function SheetsView({ ask, showToast, ledgerEntries = [], accountName = (c) => c, boardroomCurrent, location = "" }: SheetsProps) {
  const [S, setS] = useState<Store>(initialStore);
  const [mountKey, setMountKey] = useState(0);
  const [status, setStatus] = useState("Saved");
  const [prompt, setPrompt] = useState(""); const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null); const [note, setNote] = useState<{ kind: "ok" | "warn" | "bad"; text: string } | null>(null);
  const [backup, setBackup] = useState<any>(null);
  const [loaded, setLoaded] = useState(false); const [sheetTick, setSheetTick] = useState(0);
  // Report basket (charts / pivots chosen for PDF, PowerPoint and email), saved per workbook.
  const [basket, setBasketState] = useState<BasketItem[]>([]);
  useEffect(() => { try { setBasketState(JSON.parse(localStorage.getItem("oiq-sheets-basket-" + (S.activeId || "")) || "[]")); } catch { setBasketState([]); } }, [S.activeId]);
  const setBasket = (b: BasketItem[]) => { setBasketState(b); try { localStorage.setItem("oiq-sheets-basket-" + S.activeId, JSON.stringify(b)); } catch {} };
  const [tab, setTab] = useState<"smart" | "ai" | "analyze" | "ask" | "pivot" | "chart">("smart"); const [appOpen, setAppOpen] = useState(false); const [appKey, setAppKey] = useState(0);   /* dashboard locks onto the data it was opened with */
  const apiRef = useRef<any>(null); const hostId = useRef("oiq-sheets-host-" + Math.random().toString(36).slice(2, 8));
  const fileRef = useRef<HTMLInputElement>(null);
  const storeRef = useRef(S); storeRef.current = S;   // always the latest store (used in clean-up)
  const toast = (m: string, k = "info") => { try { showToast && showToast(m, k); } catch {} };
  const active = S.books.find((b) => b.id === S.activeId) || S.books[0];

  // The workbook list goes to localStorage (tiny); each workbook's contents go to IndexedDB (large).
  const persist = (next: Store, snapId?: string) => { try { localStorage.setItem(KEY, JSON.stringify({ books: next.books, activeId: next.activeId, snaps: {} })); } catch {}
    if (snapId && next.snaps[snapId]) idbPut(snapId, next.snaps[snapId]).then(() => setStatus("Saved")).catch(() => setStatus("Not saved: the browser refused to store this workbook. Download Excel to keep your work.")); else setStatus("Saved"); return true; };
  const saveNow = () => { const wb = apiRef.current?.getActiveWorkbook?.(); if (!wb || !active) return; const snap = wb.save();
    setS((s) => { const next = { ...s, snaps: { ...s.snaps, [active.id]: snap }, books: s.books.map((b) => (b.id === active.id ? { ...b, updatedAt: new Date().toISOString() } : b)) }; persist(next, active.id); return next; }); };

  // Create the spreadsheet for the active workbook; re-created when switching workbooks.
  useEffect(() => {
    if (!active) return; let disposed = false; let timer: any; let univerAPI: any = null; let sub: any = null;
    (async () => {
      let snap = S.snaps[active.id]; if (!snap) { try { snap = await idbGet(active.id); } catch {} }
      if (disposed) return; setLoaded(true);
      const created = createUniver({ locale: LocaleType.EN_US, locales: { [LocaleType.EN_US]: mergeLocales(sheetsEnUS) }, presets: [UniverSheetsCorePreset({ container: hostId.current })] });
      univerAPI = created.univerAPI;
      try { univerAPI.toggleDarkMode(isDarkTheme()); } catch {}
      univerAPI.createWorkbook(snap || gridToSnapshot({ name: active.name, sheets: [{ name: "Sheet1", rows: [] }] }, active.id));
      apiRef.current = univerAPI; setSheetTick((x) => x + 1);
    try { if ((window as any).__OIQ_TEST__) (window as any).__oiqSheets = univerAPI; } catch {}   // test hook only when a test harness opts in
      // Save only after real edits (data-changing "mutations"), 3 s after the last one. The earlier
      // version compared the whole workbook every 4 s, which freezes the page on large data.
      try { sub = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (ev: any) => { if (ev?.type !== 2) return; setStatus("Unsaved changes…"); clearTimeout(timer); timer = setTimeout(() => { if (!disposed) { setStatus("Saving…"); saveNow(); } }, 3000); }); } catch {}
    })();
    return () => { disposed = true; clearTimeout(timer); try { sub?.dispose?.(); } catch {}
      try { const snap = univerAPI?.getActiveWorkbook()?.save(); const cur = storeRef.current; if (snap && cur.books.some((b) => b.id === active.id)) persist({ ...cur, snaps: { ...cur.snaps, [active.id]: snap } }, active.id); } catch {}
      try { univerAPI?.dispose(); } catch {} apiRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, mountKey]);

  const openBook = (id: string) => { saveNow(); setPlan(null); setNote(null); setBackup(null); setS((s) => { const n = { ...s, activeId: id }; persist(n); return n; }); };
  const addBook = (grid: WorkbookGrid) => { saveNow(); const id = uid(); const snap = gridToSnapshot(grid, id);
    setS((s) => { const n = { books: [...s.books, { id, name: grid.name, updatedAt: new Date().toISOString() }], snaps: { ...s.snaps, [id]: snap }, activeId: id }; persist(n, id); return n; });
    setPlan(null); setNote(null); setBackup(null); toast("Opened \u201c" + grid.name + "\u201d.", "success"); };
  const rename = () => { const n = window.prompt("Workbook name", active?.name || ""); if (!n || !active) return; setS((s) => { const x = { ...s, books: s.books.map((b) => (b.id === active.id ? { ...b, name: n.slice(0, 80) } : b)) }; persist(x); return x; }); };
  const remove = () => { if (!active || !window.confirm("Delete \u201c" + active.name + "\u201d? Export it first if you need a copy.")) return;
    idbDel(active.id);
    setS((s) => { const books = s.books.filter((b) => b.id !== active.id); const snaps = { ...s.snaps }; delete snaps[active.id];
      if (!books.length) { const t = { name: "Untitled", sheets: [{ name: "Sheet1", rows: [] }] }; const id = uid(); books.push({ id, name: t.name, updatedAt: new Date().toISOString() }); snaps[id] = gridToSnapshot(t, id); }
      const n = { books, snaps, activeId: books[0].id }; persist(n, books[0].id); return n; }); };

  const onImport = async (f?: File) => { if (!f) return; try {
      if (/\.csv$/i.test(f.name)) addBook({ name: f.name.replace(/\.csv$/i, ""), sheets: [{ name: "Sheet1", rows: parseCsv(await f.text()) }] });
      else { const ExcelJS: any = (await import("exceljs")).default; addBook(await xlsxToGrid(ExcelJS, await f.arrayBuffer(), f.name.replace(/\.xlsx?$/i, ""))); }
    } catch (e: any) { toast("Could not open this file: " + (e?.message || e) + ". Excel (.xlsx) and CSV are supported.", "warning"); } finally { if (fileRef.current) fileRef.current.value = ""; } };
  const onExport = async () => { const wb = apiRef.current?.getActiveWorkbook?.(); if (!wb) return; const snap = wb.save(); const grid = snapshotToGrid(snap);
    const values = (snap.sheetOrder || []).map((_: any, i: number) => snapshotValues(snap, i)); const ExcelJS: any = (await import("exceljs")).default;
    download(safeName(active?.name) + ".xlsx", new Blob([await gridToXlsx(ExcelJS, grid, values)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); toast("Excel file downloaded.", "success"); };
  const onCsv = () => { const ws = apiRef.current?.getActiveWorkbook?.()?.getActiveSheet?.(); if (!ws) return; const vals = ws.getDataRange().getRawValues(); download(safeName(active?.name) + ".csv", new Blob([gridToCsv(vals)], { type: "text/csv" })); };

  const importModule = (k: string) => { try {
    if (k === "ledger") { if (!ledgerEntries.length) { toast("The Ledger has no entries yet.", "warning"); return; } addBook(ledgerToGrid(ledgerEntries, accountName)); }
    if (k === "boardroom") { const items = boardroomRows(boardroomCurrent, location); if (!items.length) { toast("No finished AI Boardroom decision with numbers yet.", "warning"); return; } addBook(pairsToGrid("Boardroom decision numbers", items)); }
    if (k === "spendgov") { const st = JSON.parse(localStorage.getItem("oiq-spendgov-v1") || "null"); const log = st?.log || [];
      if (!log.length && !Object.keys(st?.status || {}).length) { toast("Spend Governance has no decisions or control statuses yet.", "warning"); return; }
      addBook(tableToGrid("Spend Governance log", "Decisions", ["When", "Decision", "Amount", "Verdict", "Required approver", "Note"], log.map((l: any) => [String(l.at || "").slice(0, 10), l.type, Number(l.amount) || 0, l.verdict, l.tier, l.note || ""]))); }
    if (k === "compliance") { const st = JSON.parse(localStorage.getItem("oiq-compliance-v1") || "null"); const ent = st?.entities?.[0]; const states = st?.states || {};
      const rows = Object.entries<any>(states).filter(([key]) => !ent || key.startsWith(ent.id + ":")).map(([key, v]) => [key.split(":")[1], v.owner || "", v.performer || "", v.reviewer || "", v.sample ?? "", v.exceptions ?? "", v.deficiency?.magnitude || "", v.remediation?.status || "", v.remediation?.due || ""]);
      if (!rows.length) { toast("Compliance has no tested controls yet.", "warning"); return; }
      addBook(tableToGrid("Compliance control testing", "Controls", ["Control", "Owner", "Performer", "Reviewer", "Items tested", "Exceptions", "Deficiency size", "Remediation status", "Due"], rows as Cell[][])); }
  } catch (e: any) { toast("Import failed: " + (e?.message || e), "warning"); } };

  // ── AI automation: ask → plan → approve → apply → verify ──
  const sheetState = () => { const ws = apiRef.current?.getActiveWorkbook?.()?.getActiveSheet?.(); if (!ws) return null; const lr = Math.max(0, ws.getLastRow()), lc = Math.max(0, ws.getLastColumn());
    const rg = ws.getRange(0, 0, lr + 1, lc + 1); const values = rg.getRawValues() as Cell[][]; /* raw numbers, never display-formatted text */ const f = rg.getFormulas() as string[][];
    const formulas: Cell[][] = values.map((row, r) => row.map((v, c) => (f?.[r]?.[c] ? f[r][c] : v))); return { ws, values, formulas, name: ws.getSheetName() }; };
  const runAI = async () => { if (!ask || !prompt.trim()) return; const st = sheetState(); if (!st) return; setBusy(true); setPlan(null); setNote(null);
    try { const reply = await ask(AI_SYSTEM, [{ role: "user", content: buildContext(st.values, st.formulas, st.name) + "\n\nRequest: " + prompt.trim() }], 1800);
      const p = parsePlan(String(reply || "")); setPlan(p); if (!p.ops.length && !p.errors.length) setNote({ kind: "warn", text: "The AI returned nothing to do. Try rephrasing." });
    } catch (e: any) { setNote({ kind: "bad", text: "AI request failed: " + (e?.message || e) }); } finally { setBusy(false); } };
  const applyPlan = async () => { const st = sheetState(); if (!st || !plan) return; const wb = apiRef.current.getActiveWorkbook(); setBackup(wb.save());
    const touched: { r: number; c: number }[] = []; const notes: string[] = [];
    for (const o of plan.ops) {
      if (o.op === "fillFormula" || o.op === "setFormula" || o.op === "setValues") { for (const w of expandWrites(o)) { st.ws.getRange(w.r, w.c).setValue(w.value as any); touched.push({ r: w.r, c: w.c }); } }
      else if (o.op === "highlight") { const now = sheetState()!; const rows = highlightRows(o, now.values); const rg = parseRange(o.range)!;
        rows.forEach((r) => st.ws.getRange(r, rg.c1, 1, rg.c2 - rg.c1 + 1).setBackgroundColor(o.color || "#FDE68A")); notes.push(rows.length + " row(s) highlighted (static colour; re-run after the data changes)."); }
      else if (o.op === "sort") { const now = sheetState()!; const res = sortRows(o, now.formulas); const rg = parseRange(o.range)!;
        if (!res.ok) notes.push("Sort skipped: " + res.why); else { st.ws.getRange(rg.r1, rg.c1, rg.r2 - rg.r1 + 1, rg.c2 - rg.c1 + 1).setValues(res.rows as any); notes.push("Sorted " + o.range + " by column " + o.column + "."); } }
    }
    await new Promise((r) => setTimeout(r, 700));
    const after = sheetState(); const errs = after ? findErrors(after.values, touched) : [];
    setNote(errs.length ? { kind: "warn", text: "Applied, but " + errs.length + " cell(s) show errors: " + errs.slice(0, 8).map((e) => e.cell + " " + e.error).join(", ") + ". Review them, or click Revert." + (notes.length ? " " + notes.join(" ") : "") }
      : { kind: "ok", text: "Applied: " + (plan.summary || "changes made") + ". " + (touched.length ? touched.length + " cell(s) written; formulas checked, no errors. " : "") + notes.join(" ") });
    setPlan(null); saveNow(); };
  const revert = () => { if (!backup || !active) return; setS((s) => { const n = { ...s, snaps: { ...s.snaps, [active.id]: backup } }; persist(n, active.id); return n; }); setBackup(null); setNote({ kind: "ok", text: "Reverted to the version before the last AI change." }); setMountKey((k) => k + 1); };
  const changeOps = plan ? plan.ops.filter((o) => o.op !== "answer") : [];
  const activeSheetName = (() => { try { return apiRef.current?.getActiveWorkbook?.()?.getActiveSheet?.()?.getSheetName?.() || "Sheet1"; } catch { return "Sheet1"; } })();
  const ctx: InsightCtx = { sheetName: activeSheetName, version: sheetTick, workbookName: active?.name || "Workbook", ask, toast, basket, setBasket,
    getValues: () => { const ws = apiRef.current?.getActiveWorkbook?.()?.getActiveSheet?.(); if (!ws) return []; const lr = ws.getLastRow(), lc = ws.getLastColumn(); return lr < 0 || lc < 0 ? [] : (ws.getRange(0, 0, lr + 1, lc + 1).getRawValues() as Cell[][]); },
    addSheet: (name: string, rows: Cell[][], style?: SheetStyle) => { const wb = apiRef.current?.getActiveWorkbook?.(); if (!wb) return; const names = new Set(wb.getSheets().map((x: any) => x.getSheetName())); let nm = (name || "Sheet").replace(/[\\/?*\[\]:']/g, "").slice(0, 28) || "Sheet", i = 2; const base = nm; while (names.has(nm)) nm = base + " " + i++;
      // ISO dates ("2026-05-15") become real dates; their columns get a date format after insertion.
      const dateCols = new Set<number>(); const cellData: any = {}; rows.forEach((row, r) => row.forEach((v, c) => { if (v === null || v === undefined || v === "") return; const ser = typeof v === "string" ? isoToSerial(v.trim()) : null; if (ser !== null) dateCols.add(c);
        (cellData[r] = cellData[r] || {})[c] = typeof v === "string" && v.startsWith("=") ? { f: v } : ser !== null ? { v: ser, t: 2 } : typeof v === "number" ? { v, t: 2 } : { v: String(v), t: 1 }; }));
      const maxC = Math.max(1, ...rows.map((r) => r.length)); const sh = wb.insertSheet(nm, { sheet: { name: nm, rowCount: Math.max(1000, rows.length + 500), columnCount: Math.max(26, maxC + 10), cellData } });
      try { wb.setActiveSheet(sh); } catch {}
      dateCols.forEach((c) => { try { (sh.getRange(0, c, rows.length, 1) as any).setNumberFormat(DATE_PATTERN); } catch {} });
      // Professional formatting: title, navy header rows, bold totals, number formats, widths, frozen header.
      if (style) { const nc = maxC; const each = (fn: () => void) => { try { fn(); } catch {} };
        if (style.titleRow !== undefined) each(() => sh.getRange(style.titleRow!, 0).setFontWeight("bold").setFontSize(13));
        (style.headerRows || []).forEach((r) => each(() => sh.getRange(r, 0, 1, nc).setFontWeight("bold").setBackgroundColor("#11264A").setFontColor("#FFFFFF")));
        (style.totalRows || []).forEach((r) => each(() => sh.getRange(r, 0, 1, nc).setFontWeight("bold").setBackgroundColor("#E8EEF7")));
        (style.numFmt || []).forEach((f) => each(() => (sh.getRange(f.r1, f.c1, f.r2 - f.r1 + 1, f.c2 - f.c1 + 1) as any).setNumberFormat(f.pattern)));
        (style.widths || []).forEach((w, c) => each(() => sh.setColumnWidth(c, w)));
        if (style.freezeRows) each(() => sh.setFrozenRows(style.freezeRows!)); }
      setSheetTick((x) => x + 1); setTimeout(saveNow, 300); } };
  // The insight panels read the sheet that is active right now; re-read when the user switches tabs.
  const switchTab = (k: typeof tab) => { setSheetTick((x) => x + 1); setTab(k); };

  return <div data-testid="sheets" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, color: V.text }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid " + V.border }}>
      <b style={{ fontSize: 16, marginRight: 4 }}>Sheets</b>
      <select aria-label="Workbook" data-testid="sh-book" value={active?.id} onChange={(e) => openBook(e.target.value)} style={{ ...inp, maxWidth: 220 }}>{S.books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <select aria-label="New workbook" data-testid="sh-new" value="" onChange={(e) => { const v = e.target.value; if (!v) return; if (v === "blank") addBook({ name: "Untitled", sheets: [{ name: "Sheet1", rows: [] }] }); else { const t = TEMPLATES.find((x) => x.id === v); if (t) addBook(t.build()); } }} style={{ ...inp, maxWidth: 200 }}>
        <option value="">+ New…</option><option value="blank">Blank workbook</option>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>Template: {t.name}</option>)}</select>
      <select aria-label="Import from OrchestrIQ" data-testid="sh-module" value="" onChange={(e) => { if (e.target.value) importModule(e.target.value); }} style={{ ...inp, maxWidth: 220 }}>
        <option value="">Import from OrchestrIQ…</option><option value="ledger">Ledger journal entries</option><option value="boardroom">Latest Boardroom decision numbers</option><option value="spendgov">Spend Governance decision log</option><option value="compliance">Compliance control testing</option></select>
      <button onClick={() => fileRef.current?.click()} style={btn()}>Open Excel / CSV</button>
      <input ref={fileRef} data-testid="sh-file" type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={(e) => onImport(e.target.files?.[0])} />
      <button data-testid="sh-export" onClick={onExport} style={btn()}>Download Excel</button>
      <button onClick={onCsv} style={btn()}>CSV</button>
      <button onClick={rename} style={btn()}>Rename</button>
      <button onClick={remove} style={{ ...btn(), color: V.bad }}>Delete</button>
      <span data-testid="sh-status" style={{ fontSize: 12, color: status.startsWith("Not") ? V.bad : V.text3, marginLeft: "auto" }}>{status}</span>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", flex: 1, minHeight: 0 }}>
      <div key={mountKey + ":" + (active?.id || "")} id={hostId.current} data-testid="sh-grid" style={{ flex: "1 1 520px", minWidth: 0, minHeight: 460, height: "calc(100vh - 210px)" }} />
      <aside data-testid="sh-ai" style={{ flex: "0 1 420px", minWidth: 300, borderLeft: "1px solid " + V.border, padding: "12px 14px", overflowY: "auto", maxHeight: "calc(100vh - 210px)", background: V.surface }}>
        <div role="tablist" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          {([["smart", "✨ Smart"], ["ai", "AI"], ["analyze", "Analyze"], ["ask", "Ask"], ["pivot", "Pivot"], ["chart", "Chart"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} data-testid={"sh-tab-" + k} onClick={() => switchTab(k)} style={{ ...btn(tab === k), minHeight: 30, fontSize: 12 }}>{l}</button>)}
          <button data-testid="sh-tab-app" onClick={() => { setSheetTick((x) => x + 1); setAppKey((k) => k + 1); setAppOpen(true); }} style={{ ...btn(), minHeight: 30, fontSize: 12 }}>App ↗</button>
        </div>
        {!loaded && <div style={{ fontSize: 12.5, color: V.text3 }}>Opening workbook…</div>}
        {loaded && tab === "smart" && <SmartPanel key={ctx.sheetName + ":" + ctx.version} ctx={ctx} />}
        {loaded && tab === "analyze" && <AnalyzePanel key={ctx.sheetName + ":" + ctx.version} ctx={ctx} onOpenApp={() => { setAppKey((k) => k + 1); setAppOpen(true); }} />}
        {loaded && tab === "ask" && <AskPanel ctx={ctx} />}
        {loaded && tab === "pivot" && <PivotPanel key={ctx.sheetName + ":" + ctx.version} ctx={ctx} />}
        {loaded && tab === "chart" && <ChartPanel key={ctx.sheetName + ":" + ctx.version} ctx={ctx} />}
        {tab === "ai" && <>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>AI automation</div>
        <div style={{ fontSize: 12.5, color: V.text3, marginBottom: 8 }}>Describe what you want. The AI proposes a plan of formulas and actions; nothing changes until you click Apply. The sheet's headers and first rows are sent to the AI to understand the request.</div>
        <textarea data-testid="sh-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="e.g. Add a GST column at 18% of Amount" style={{ ...inp, width: "100%", minHeight: 72, padding: 8, resize: "vertical" }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0" }}>{["Add a total row", "Highlight rows where variance is above 0", "Flag duplicate vendors", "Explain the formulas in this sheet"].map((x) => <button key={x} onClick={() => setPrompt(x)} style={{ ...btn(), fontSize: 11.5, minHeight: 30, fontWeight: 600 }}>{x}</button>)}</div>
        <button data-testid="sh-ask" disabled={!ask || busy || !prompt.trim()} onClick={runAI} style={{ ...btn(true), width: "100%", opacity: !ask || busy || !prompt.trim() ? 0.6 : 1 }}>{busy ? "Thinking\u2026" : ask ? "Propose a plan" : "AI not available"}</button>
        {plan && <div data-testid="sh-plan" style={{ marginTop: 10, border: "1px solid " + V.border, borderRadius: 10, padding: "10px 12px" }}>
          {plan.summary && <div style={{ fontWeight: 700, fontSize: 13.5 }}>{plan.summary}</div>}
          {plan.ops.length > 0 && <ol style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: V.text2 }}>{plan.ops.map((o, i) => <li key={i} style={{ marginBottom: 4 }}>{describeOp(o)}</li>)}</ol>}
          {plan.answer && <div style={{ marginTop: 6, fontSize: 13, color: V.text2, whiteSpace: "pre-wrap" }}>{plan.answer}</div>}
          {plan.errors.length > 0 && <div data-testid="sh-plan-errors" style={{ marginTop: 6, fontSize: 12.5, color: V.bad }}><b>Blocked:</b><ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{plan.errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {changeOps.length > 0 && !plan.errors.length && <button data-testid="sh-apply" onClick={applyPlan} style={btn(true)}>Apply</button>}
            <button onClick={() => setPlan(null)} style={btn()}>Discard</button></div>
        </div>}
        {note && <div data-testid="sh-note" role="status" style={{ marginTop: 10, fontSize: 12.5, color: note.kind === "ok" ? V.ok : note.kind === "warn" ? V.warn : V.bad }}>{note.text}</div>}
        {backup && <button data-testid="sh-revert" onClick={revert} style={{ ...btn(), marginTop: 8, width: "100%" }}>Revert the last AI change</button>}
        <div style={{ fontSize: 11.5, color: V.text3, marginTop: 12 }}>Workbooks are saved in this browser. Download Excel to keep a copy or share it. Highlights are fixed colours based on today's values; sorting is allowed only on ranges without formulas.</div>
        </>}
      </aside>
    </div>
    {appOpen && <DataApp key={"app" + appKey} ctx={ctx} onClose={() => setAppOpen(false)} />}
  </div>;
}
