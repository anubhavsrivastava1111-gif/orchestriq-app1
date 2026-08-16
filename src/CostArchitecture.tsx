/* ============================================================================
 * OrchestrIQ :: CostArchitecture.tsx
 * Cost Architecture & Unit Economics - the working Data Hub.
 *
 * Self-contained module. Imports only: react, ./lib/supabase, ./lib/CostEngine
 * Nothing in App.tsx imports this yet - safe to deploy standalone.
 * ========================================================================== */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "./lib/supabase";
import {
  diagnose, effectiveCostPerBaseUnit, naiveCostPerBaseUnit, yieldLabel, num,
  type CostWorkspace, type CaResource, type CaOffering, type CaBomLine,
  type CaCostPool, type CaChannel, type CaOfferingChannel, type CaBenchmark,
  type CaBusinessContext, type ResourceClass, type OfferingType,
  type PortfolioDiagnosis, type Opportunity,
} from "./lib/CostEngine";
import {
  researchBlueprint, blueprintToRows, blueprintStats,
  type Blueprint, type BlueprintResult, type Verify,
} from "./lib/BusinessBlueprint";

/* ---------------------------------------------------------------- constants */

const CLASSES: Array<{ v: ResourceClass; label: string; hint: string }> = [
  { v: "MATERIAL",    label: "Material",     hint: "Physical inputs consumed in the product" },
  { v: "LABOUR",      label: "Labour",       hint: "People time - staff, contractors" },
  { v: "EQUIPMENT",   label: "Equipment",    hint: "Machine or asset time" },
  { v: "SUBCONTRACT", label: "Subcontract",  hint: "Work bought in from outside" },
  { v: "DIGITAL",     label: "Software",     hint: "Licences, cloud, API calls" },
  { v: "FACILITY",    label: "Space",        hint: "Rent charged per unit of use" },
  { v: "ENERGY",      label: "Energy",       hint: "Power, fuel, gas" },
  { v: "LOGISTICS",   label: "Freight",      hint: "Transport and delivery" },
  { v: "PACKAGING",   label: "Packaging",    hint: "Boxes, labels, wrapping" },
  { v: "OTHER",       label: "Other",        hint: "Anything else you buy" },
];

const OFFERING_TYPES: Array<{ v: OfferingType; label: string }> = [
  { v: "UNIT",          label: "Product unit" },
  { v: "BATCH",         label: "Batch / run" },
  { v: "PROJECT",       label: "Project / engagement" },
  { v: "BILLABLE_HOUR", label: "Billable hour" },
  { v: "SUBSCRIPTION",  label: "Subscription" },
  { v: "TRANSACTION",   label: "Per transaction" },
  { v: "SUB_ASSEMBLY",  label: "Sub-recipe (not sold directly)" },
];

const ARCHETYPES = [
  { v: "manufacturing_discrete", label: "Manufacturing - discrete (parts, assemblies)" },
  { v: "manufacturing_process",  label: "Manufacturing - process (steel, chemicals, cement)" },
  { v: "food_beverage",          label: "Food & beverage (restaurant, bakery, food plant)" },
  { v: "retail_trading",         label: "Retail / trading" },
  { v: "professional_services",  label: "Professional services (consulting, agency, legal)" },
  { v: "saas_digital",           label: "SaaS / digital product" },
  { v: "logistics_transport",    label: "Logistics & transport" },
  { v: "healthcare",             label: "Healthcare delivery" },
  { v: "construction",           label: "Construction & contracting" },
  { v: "hospitality",            label: "Hotels & hospitality" },
  { v: "education",              label: "Education & training" },
  { v: "agriculture",            label: "Agriculture" },
  { v: "other",                  label: "Other" },
];

const CHANNEL_TYPES = [
  { v: "direct",       label: "Direct / own store" },
  { v: "marketplace",  label: "Marketplace" },
  { v: "aggregator",   label: "Aggregator (Swiggy, Zomato, etc.)" },
  { v: "distributor",  label: "Distributor" },
  { v: "reseller",     label: "Reseller / partner" },
  { v: "retail",       label: "Retail chain" },
  { v: "field_sales",  label: "Field sales" },
  { v: "inside_sales", label: "Inside sales" },
  { v: "export",       label: "Export" },
];

const ALLOCATION_BASES = [
  { v: "revenue",          label: "By revenue share" },
  { v: "units",            label: "By units made" },
  { v: "direct_cost",      label: "By direct cost" },
  { v: "constraint_hours", label: "By bottleneck hours" },
  { v: "equal",            label: "Split equally" },
];

type TabKey = "start" | "setup" | "inputs" | "products" | "channels" | "diagnostics";

/* ------------------------------------------------------------------ styling */

const V = (name: string, fallback: string) => `var(--oiq-${name}, ${fallback})`;

const S: Record<string, React.CSSProperties> = {
  wrap:      { padding: "14px 16px 40px", color: V("ink", "#e6edf3"), fontSize: 13 },
  h1:        { fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: -0.2 },
  sub:       { fontSize: 11, color: V("muted", "#8b98a5"), marginTop: 3 },
  tabs:      { display: "flex", gap: 4, margin: "14px 0 16px", flexWrap: "wrap", borderBottom: `1px solid ${V("border", "#1e2a38")}`, paddingBottom: 0 },
  tab:       { padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "transparent", border: "none", borderBottom: "2px solid transparent", color: V("muted", "#8b98a5"), borderRadius: 0 },
  tabOn:     { color: V("accent", "#4ADE80"), borderBottom: `2px solid ${V("accent", "#4ADE80")}` },
  card:      { background: V("surface", "#0d1520"), border: `1px solid ${V("border", "#1e2a38")}`, borderRadius: V("radius", "8px") as string, padding: 14, marginBottom: 14 },
  cardH:     { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: V("muted", "#8b98a5"), marginBottom: 10 },
  table:     { width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed", minWidth: 720 },
  th:        { textAlign: "left", padding: "7px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: V("muted", "#8b98a5"), borderBottom: `1px solid ${V("border", "#1e2a38")}`, whiteSpace: "nowrap" },
  td:        { padding: "5px 8px", borderBottom: `1px solid ${V("faint", "#16202c")}`, verticalAlign: "middle", overflow: "hidden", textOverflow: "ellipsis" },
  inp:       { width: "100%", background: V("bg", "#070c18"), border: `1px solid ${V("border", "#1e2a38")}`, borderRadius: 5, color: V("ink", "#e6edf3"), padding: "5px 7px", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  btn:       { background: V("accent", "#4ADE80"), color: V("accentText", "#06210f"), border: "none", borderRadius: 6, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  btnGhost:  { background: "transparent", color: V("muted", "#8b98a5"), border: `1px solid ${V("border", "#1e2a38")}`, borderRadius: 6, padding: "6px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  btnDel:    { background: "transparent", color: V("muted", "#8b98a5"), border: "none", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "2px 6px" },
  tile:      { flex: "1 1 150px", minWidth: 140, background: V("surface", "#0d1520"), border: `1px solid ${V("border", "#1e2a38")}`, borderRadius: V("radius", "8px") as string, padding: "11px 13px" },
  tileL:     { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: V("muted", "#8b98a5"), fontWeight: 600 },
  tileV:     { fontSize: 19, fontWeight: 700, marginTop: 5, letterSpacing: -0.4 },
  tileS:     { fontSize: 10, color: V("muted", "#8b98a5"), marginTop: 3 },
  empty:     { textAlign: "center", padding: "38px 20px", color: V("muted", "#8b98a5") },
  chip:      { display: "inline-block", padding: "2px 7px", borderRadius: 20, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" },
  note:      { fontSize: 11, color: V("muted", "#8b98a5"), lineHeight: 1.55 },
  grid2:     { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 11 },
  lbl:       { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: V("muted", "#8b98a5"), marginBottom: 4, display: "block" },
  tableWide: { width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed", minWidth: 1080 },
  scroll:    { overflowX: "auto", WebkitOverflowScrolling: "touch" },
};

const OK   = { bg: "rgba(74,222,128,.12)", fg: "#4ADE80" };
const WARN = { bg: "rgba(251,191,36,.12)", fg: "#FBBF24" };
const BAD  = { bg: "rgba(248,113,113,.12)", fg: "#F87171" };
const NEU  = { bg: "rgba(139,152,165,.12)", fg: "#8b98a5" };

/* ---------------------------------------------------------------- utilities */

function uid(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function fmtMoney(v: number, cur = "INR"): string {
  const sym = cur === "INR" ? "\u20B9" : cur === "USD" ? "$" : cur === "EUR" ? "\u20AC" : cur + " ";
  const n = Math.abs(v);
  const s = n >= 1e7 ? (n / 1e7).toFixed(2) + " Cr"
          : n >= 1e5 ? (n / 1e5).toFixed(2) + " L"
          : Math.round(n).toLocaleString("en-IN");
  return (v < 0 ? "-" : "") + sym + s;
}

/* ------------------------------------------------------------ input widgets */

interface CellProps { value: any; onChange: (v: any) => void; placeholder?: string; width?: number | string; align?: "left" | "right"; }

const TextCell: React.FC<CellProps> = ({ value, onChange, placeholder, width }) => (
  <input style={{ ...S.inp, width: width ?? "100%" }} value={value ?? ""} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)} />
);

const NumCell: React.FC<CellProps & { suffix?: string }> = ({ value, onChange, placeholder, width, suffix }) => {
  const [raw, setRaw] = useState<string>(value == null ? "" : String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setRaw(value == null ? "" : String(value)); }, [value]);
  return (
    <div style={{ position: "relative" }}>
      <input inputMode="decimal" style={{ ...S.inp, width: width ?? "100%", textAlign: "right", paddingRight: suffix ? 22 : 7 }}
        value={raw} placeholder={placeholder}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; const n = parseFloat(raw); onChange(Number.isFinite(n) ? n : null); setRaw(Number.isFinite(n) ? String(n) : ""); }}
        onChange={(e) => { const t = e.target.value; setRaw(t); const n = parseFloat(t); if (Number.isFinite(n)) onChange(n); else if (t === "") onChange(null); }} />
      {suffix && <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: V("muted", "#8b98a5"), pointerEvents: "none" }}>{suffix}</span>}
    </div>
  );
};

const SelectCell: React.FC<{ value: any; onChange: (v: string) => void; options: Array<{ v: string; label: string }>; width?: number | string }> =
  ({ value, onChange, options, width }) => (
  <select style={{ ...S.inp, width: width ?? "100%", cursor: "pointer" }} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
  </select>
);

const Chip: React.FC<{ tone: { bg: string; fg: string }; children: React.ReactNode }> = ({ tone, children }) => (
  <span style={{ ...S.chip, background: tone.bg, color: tone.fg }}>{children}</span>
);

const Tile: React.FC<{ label: string; value: string; sub?: string; tone?: string }> = ({ label, value, sub, tone }) => (
  <div style={S.tile}>
    <div style={S.tileL}>{label}</div>
    <div style={{ ...S.tileV, color: tone || V("ink", "#e6edf3") }}>{value}</div>
    {sub && <div style={S.tileS}>{sub}</div>}
  </div>
);

const Empty: React.FC<{ title: string; body: string; action?: React.ReactNode }> = ({ title, body, action }) => (
  <div style={S.empty}>
    <div style={{ fontSize: 13, fontWeight: 700, color: V("ink", "#e6edf3"), marginBottom: 6 }}>{title}</div>
    <div style={{ ...S.note, maxWidth: 440, margin: "0 auto 14px" }}>{body}</div>
    {action}
  </div>
);

/* ============================================================================
 * MAIN COMPONENT
 * ========================================================================== */

export interface CostArchitectureProps {
  showToast?: (msg: string, kind?: string) => void;
  companyName?: string;
  onDiagnosis?: (d: PortfolioDiagnosis) => void;
  /** (prompt, useWebSearch) => text. The research ladder toggles search itself. */
  callAI?: (prompt: string, useWebSearch: boolean) => Promise<string>;
}

export default function CostArchitecture({ showToast, companyName, onDiagnosis, callAI }: CostArchitectureProps) {
  const [tab, setTab] = useState<TabKey>("start");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [ctx, setCtx] = useState<CaBusinessContext | null>(null);
  const [resources, setResources] = useState<CaResource[]>([]);
  const [offerings, setOfferings] = useState<CaOffering[]>([]);
  const [bomLines, setBomLines] = useState<CaBomLine[]>([]);
  const [costPools, setCostPools] = useState<CaCostPool[]>([]);
  const [channels, setChannels] = useState<CaChannel[]>([]);
  const [offeringChannels, setOfferingChannels] = useState<CaOfferingChannel[]>([]);
  const [benchmarks, setBenchmarks] = useState<CaBenchmark[]>([]);
  const [openOffering, setOpenOffering] = useState<string | null>(null);

  const toast = useCallback((m: string, k?: string) => { if (showToast) showToast(m, k); }, [showToast]);

  /* ---------------------------------------------------------------- loading */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uidNow = auth?.user?.id ?? null;
        if (cancelled) return;
        setUserId(uidNow);
        if (!uidNow) { setErr("Sign in to use Cost Architecture."); setLoading(false); return; }

        const [bc, rs, of, bl, cp, ch, oc, bm] = await Promise.all([
          supabase.from("ca_business_context").select("*").eq("user_id", uidNow).maybeSingle(),
          supabase.from("ca_resources").select("*").eq("user_id", uidNow).order("created_at", { ascending: true }),
          supabase.from("ca_offerings").select("*").eq("user_id", uidNow).order("created_at", { ascending: true }),
          supabase.from("ca_bom_lines").select("*").eq("user_id", uidNow).order("sequence", { ascending: true }),
          supabase.from("ca_cost_pools").select("*").eq("user_id", uidNow),
          supabase.from("ca_channels").select("*").eq("user_id", uidNow),
          supabase.from("ca_offering_channels").select("*").eq("user_id", uidNow),
          supabase.from("ca_benchmarks").select("*"),
        ]);
        if (cancelled) return;

        setCtx((bc.data as CaBusinessContext) ?? null);
        setResources((rs.data as CaResource[]) ?? []);
        setOfferings((of.data as CaOffering[]) ?? []);
        setBomLines((bl.data as CaBomLine[]) ?? []);
        setCostPools((cp.data as CaCostPool[]) ?? []);
        setChannels((ch.data as CaChannel[]) ?? []);
        setOfferingChannels((oc.data as CaOfferingChannel[]) ?? []);
        setBenchmarks((bm.data as CaBenchmark[]) ?? []);
        setTab((of.data ?? []).length ? "diagnostics" : "start");
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Could not load your cost data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ------------------------------------------------------------ persistence */

  const queue = useRef<Map<string, { table: string; row: any }>>(new Map());
  const timer = useRef<any>(null);

  const flush = useCallback(async () => {
    if (!queue.current.size) return;
    const batch = Array.from(queue.current.values());
    queue.current.clear();
    setSaving(true);
    try {
      const byTable = new Map<string, any[]>();
      for (const b of batch) {
        const arr = byTable.get(b.table) || [];
        arr.push(b.row);
        byTable.set(b.table, arr);
      }
      for (const [table, rows] of Array.from(byTable.entries())) {
        const clean = rows.map((r) => { const { effective_cost_per_base_unit, created_at, updated_at, ...rest } = r; return rest; });
        const { error } = await supabase.from(table).upsert(clean, { onConflict: "id" });
        if (error) throw error;
      }
    } catch (e: any) {
      toast("Could not save: " + (e?.message || "unknown error"), "error");
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [toast]);

  const persist = useCallback((table: string, row: any) => {
    queue.current.set(table + ":" + row.id, { table, row });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 900);
  }, [flush]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const removeRow = useCallback(async (table: string, id: string) => {
    try {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    } catch (e: any) { toast("Could not delete: " + (e?.message || ""), "error"); }
  }, [toast]);

  /* ------------------------------------------------------------- mutations */

  const patchCtx = (p: Partial<CaBusinessContext>) => {
    if (!userId) return;
    const next = { ...(ctx || { id: uid(), user_id: userId }), ...p } as CaBusinessContext;
    setCtx(next);
    persist("ca_business_context", next);
  };

  const patchRes = (id: string, p: Partial<CaResource>) => {
    setResources((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...p } : r));
      const row = next.find((r) => r.id === id);
      if (row) persist("ca_resources", row);
      return next;
    });
  };
  const patchOff = (id: string, p: Partial<CaOffering>) => {
    setOfferings((prev) => {
      const next = prev.map((o) => (o.id === id ? { ...o, ...p } : o));
      const row = next.find((o) => o.id === id);
      if (row) persist("ca_offerings", row);
      return next;
    });
  };
  const patchBom = (id: string, p: Partial<CaBomLine>) => {
    setBomLines((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, ...p } : b));
      const row = next.find((b) => b.id === id);
      if (row) persist("ca_bom_lines", row);
      return next;
    });
  };
  const patchPool = (id: string, p: Partial<CaCostPool>) => {
    setCostPools((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...p } : c));
      const row = next.find((c) => c.id === id);
      if (row) persist("ca_cost_pools", row);
      return next;
    });
  };
  const patchCh = (id: string, p: Partial<CaChannel>) => {
    setChannels((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...p } : c));
      const row = next.find((c) => c.id === id);
      if (row) persist("ca_channels", row);
      return next;
    });
  };
  const patchOC = (id: string, p: Partial<CaOfferingChannel>) => {
    setOfferingChannels((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...p } : c));
      const row = next.find((c) => c.id === id);
      if (row) persist("ca_offering_channels", row);
      return next;
    });
  };

  const addResource = () => {
    if (!userId) return;
    const r: CaResource = { id: uid(), user_id: userId, name: "", resource_class: "MATERIAL",
      purchase_uom: "kg", purchase_qty: 1, purchase_price: 0, base_uom: "kg",
      conversion_factor: 1, effective_yield_pct: 100, is_variable: true };
    setResources((p) => [...p, r]); persist("ca_resources", r);
  };
  const addOffering = () => {
    if (!userId) return;
    const o: CaOffering = { id: uid(), user_id: userId, name: "", offering_type: "UNIT",
      output_uom: "unit", batch_size: 1, list_price: 0, monthly_volume: 0, is_active: true };
    setOfferings((p) => [...p, o]); persist("ca_offerings", o); setOpenOffering(o.id);
  };
  const addBomLine = (offeringId: string) => {
    if (!userId || !resources.length) { toast("Add at least one input first.", "warn"); return; }
    const b: CaBomLine = { id: uid(), user_id: userId, offering_id: offeringId, child_type: "RESOURCE",
      child_resource_id: resources[0].id, qty_per_unit: 0, uom: resources[0].base_uom || "unit",
      process_scrap_pct: 0, applies_per: "UNIT", sequence: bomLines.filter((x) => x.offering_id === offeringId).length };
    setBomLines((p) => [...p, b]); persist("ca_bom_lines", b);
  };
  const addPool = () => {
    if (!userId) return;
    const c: CaCostPool = { id: uid(), user_id: userId, name: "", category: "facility",
      amount: 0, period: "monthly", allocation_basis: "revenue", is_avoidable: false };
    setCostPools((p) => [...p, c]); persist("ca_cost_pools", c);
  };
  const addChannel = () => {
    if (!userId) return;
    const c: CaChannel = { id: uid(), user_id: userId, name: "", channel_type: "direct",
      discount_pct: 0, commission_pct: 0, packaging_cost: 0, gst_pct: 0, returns_pct: 0 };
    setChannels((p) => [...p, c]); persist("ca_channels", c);
  };
  const linkChannel = (offeringId: string, channelId: string) => {
    if (!userId) return;
    if (offeringChannels.some((x) => x.offering_id === offeringId && x.channel_id === channelId)) return;
    const l: CaOfferingChannel = { id: uid(), user_id: userId, offering_id: offeringId, channel_id: channelId, volume_share_pct: 0 };
    setOfferingChannels((p) => [...p, l]); persist("ca_offering_channels", l);
  };

  const delRes = (id: string) => { setResources((p) => p.filter((r) => r.id !== id));
    setBomLines((p) => p.filter((b) => b.child_resource_id !== id)); void removeRow("ca_resources", id); };
  const delOff = (id: string) => { setOfferings((p) => p.filter((o) => o.id !== id));
    setBomLines((p) => p.filter((b) => b.offering_id !== id));
    setOfferingChannels((p) => p.filter((c) => c.offering_id !== id)); void removeRow("ca_offerings", id); };
  const delBom = (id: string) => { setBomLines((p) => p.filter((b) => b.id !== id)); void removeRow("ca_bom_lines", id); };
  const delPool = (id: string) => { setCostPools((p) => p.filter((c) => c.id !== id)); void removeRow("ca_cost_pools", id); };
  const delCh = (id: string) => { setChannels((p) => p.filter((c) => c.id !== id));
    setOfferingChannels((p) => p.filter((c) => c.channel_id !== id)); void removeRow("ca_channels", id); };
  const delOC = (id: string) => { setOfferingChannels((p) => p.filter((c) => c.id !== id)); void removeRow("ca_offering_channels", id); };

  /* --------------------------------------------------- blueprint application */

  const applyBlueprint = useCallback(async (
    bp: Blueprint,
    skip: { resources: Set<string>; offerings: Set<string>; channels: Set<string>; costPools: Set<string> }
  ) => {
    if (!userId) { toast("Sign in first.", "error"); return false; }
    setSaving(true);
    try {
      const rows = blueprintToRows(bp, userId, uid, skip);

      const nextCtx = { ...(ctx || { id: uid(), user_id: userId }), ...rows.context } as CaBusinessContext;
      const w = async (table: string, data: any[]) => {
        if (!data.length) return;
        const clean = data.map((r) => { const { effective_cost_per_base_unit, created_at, updated_at, ...rest } = r; return rest; });
        const { error } = await supabase.from(table).upsert(clean, { onConflict: "id" });
        if (error) throw error;
      };

      // order matters: parents before the rows that reference them
      await w("ca_business_context", [nextCtx]);
      await w("ca_resources", rows.resources);
      await w("ca_offerings", rows.offerings);
      await w("ca_channels", rows.channels);
      await w("ca_bom_lines", rows.bomLines);
      await w("ca_offering_channels", rows.offeringChannels);
      await w("ca_cost_pools", rows.costPools);

      setCtx(nextCtx);
      setResources((p) => [...p, ...rows.resources]);
      setOfferings((p) => [...p, ...rows.offerings]);
      setChannels((p) => [...p, ...rows.channels]);
      setBomLines((p) => [...p, ...rows.bomLines]);
      setOfferingChannels((p) => [...p, ...rows.offeringChannels]);
      setCostPools((p) => [...p, ...rows.costPools]);

      toast(`Draft model created: ${rows.resources.length} inputs, ${rows.offerings.length} products, ${rows.bomLines.length} recipe lines.`, "success");
      setTab("products");
      return true;
    } catch (e: any) {
      const m = e?.message || "Could not save the draft.";
      setErr(m); toast("Could not apply: " + m, "error");
      return false;
    } finally { setSaving(false); }
  }, [userId, ctx, toast]);

  /* ----------------------------------------------------------- computation */

  const ws: CostWorkspace = useMemo(() => ({
    context: ctx, resources, offerings, bomLines, costPools, channels, offeringChannels, benchmarks,
  }), [ctx, resources, offerings, bomLines, costPools, channels, offeringChannels, benchmarks]);

  const dx: PortfolioDiagnosis = useMemo(() => diagnose(ws), [ws]);
  useEffect(() => { if (onDiagnosis) onDiagnosis(dx); }, [dx, onDiagnosis]);

  const cur = ctx?.currency || "INR";
  const M = (v: number) => fmtMoney(v, cur);

  /* --------------------------------------------------------------- render */

  if (loading) return <div style={{ ...S.wrap, ...S.empty }}>Loading your cost model...</div>;
  if (err && !userId) return <div style={{ ...S.wrap, ...S.empty }}>{err}</div>;

  const TABS: Array<{ k: TabKey; label: string; count?: number }> = [
    { k: "start",       label: "Start here" },
    { k: "setup",       label: "Setup" },
    { k: "inputs",      label: "What you buy",  count: resources.length },
    { k: "products",    label: "What you sell", count: offerings.length },
    { k: "channels",    label: "Where you sell", count: channels.length },
    { k: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <div style={S.wrap}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={S.h1}>Cost Architecture &amp; Unit Economics</h1>
          <div style={S.sub}>
            {companyName ? companyName + " \u00B7 " : ""}What each thing you sell actually costs, and where the money leaks.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <span style={{ fontSize: 10, color: V("muted", "#8b98a5") }}>Saving...</span>}
          <Chip tone={dx.confidenceScore >= 70 ? OK : dx.confidenceScore >= 40 ? WARN : BAD}>
            {dx.confidenceScore}% confidence
          </Chip>
        </div>
      </div>

      <div style={S.tabs}>
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ ...S.tab, ...(tab === t.k ? S.tabOn : {}) }}>
            {t.label}{t.count != null && t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {err && userId && (
        <div style={{ ...S.card, borderColor: BAD.fg, background: BAD.bg, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: BAD.fg }}>{err}</div>
          <button style={{ ...S.btnGhost, marginTop: 8 }} onClick={() => setErr(null)}>Dismiss</button>
        </div>
      )}

      {tab === "start" && (
        <StartTab callAI={callAI} ctx={ctx} applyBlueprint={applyBlueprint}
          hasData={offerings.length > 0} goTo={setTab} companyName={companyName} />
      )}

      {tab === "setup" && (
        <SetupTab ctx={ctx} patchCtx={patchCtx} costPools={costPools} patchPool={patchPool}
          addPool={addPool} delPool={delPool} M={M} />
      )}

      {tab === "inputs" && (
        <InputsTab resources={resources} patchRes={patchRes} addResource={addResource} delRes={delRes} cur={cur} />
      )}

      {tab === "products" && (
        <ProductsTab offerings={offerings} resources={resources} bomLines={bomLines} channels={channels}
          offeringChannels={offeringChannels} dx={dx} openOffering={openOffering} setOpenOffering={setOpenOffering}
          patchOff={patchOff} patchBom={patchBom} patchOC={patchOC} addOffering={addOffering}
          addBomLine={addBomLine} linkChannel={linkChannel} delOff={delOff} delBom={delBom} delOC={delOC} M={M} />
      )}

      {tab === "channels" && (
        <ChannelsTab channels={channels} patchCh={patchCh} addChannel={addChannel} delCh={delCh} cur={cur} />
      )}

      {tab === "diagnostics" && <DiagnosticsTab dx={dx} M={M} goTo={setTab} />}
    </div>
  );
}

/* ============================================================================
 * TAB :: SETUP
 * ========================================================================== */

const SetupTab: React.FC<{
  ctx: CaBusinessContext | null; patchCtx: (p: Partial<CaBusinessContext>) => void;
  costPools: CaCostPool[]; patchPool: (id: string, p: Partial<CaCostPool>) => void;
  addPool: () => void; delPool: (id: string) => void; M: (v: number) => string;
}> = ({ ctx, patchCtx, costPools, patchPool, addPool, delPool, M }) => {
  const monthlyFixed = costPools.reduce((s, p) => {
    const a = num(p.amount);
    return s + (p.period === "annual" ? a / 12 : p.period === "quarterly" ? a / 3 : a);
  }, 0);

  return (
    <>
      <div style={S.card}>
        <div style={S.cardH}>Your business</div>
        <div style={S.note}>
          The industry you pick decides which benchmarks you get compared against. Everything else on this
          screen works the same way whatever you make or sell.
        </div>
        <div style={{ ...S.grid2, marginTop: 12 }}>
          <div>
            <label style={S.lbl}>Industry</label>
            <SelectCell value={ctx?.business_archetype ?? ""} onChange={(v) => patchCtx({ business_archetype: v })}
              options={[{ v: "", label: "Select your industry..." }, ...ARCHETYPES]} />
          </div>
          <div>
            <label style={S.lbl}>Currency</label>
            <SelectCell value={ctx?.currency ?? "INR"} onChange={(v) => patchCtx({ currency: v })}
              options={[{ v: "INR", label: "INR \u20B9" }, { v: "USD", label: "USD $" }, { v: "EUR", label: "EUR \u20AC" }, { v: "GBP", label: "GBP \u00A3" }, { v: "AED", label: "AED" }]} />
          </div>
          <div>
            <label style={S.lbl}>Your bottleneck</label>
            <TextCell value={ctx?.constraint_resource_label ?? ""} onChange={(v) => patchCtx({ constraint_resource_label: v })}
              placeholder="Oven hours, machine hours, senior staff time..." />
          </div>
          <div>
            <label style={S.lbl}>Bottleneck capacity per month</label>
            <NumCell value={ctx?.constraint_capacity_per_period ?? null}
              onChange={(v) => patchCtx({ constraint_capacity_per_period: v })} suffix="hrs" />
          </div>
        </div>
        <div style={{ ...S.note, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${V("faint", "#16202c")}` }}>
          <strong style={{ color: V("ink", "#e6edf3") }}>Why the bottleneck matters:</strong> when one resource limits
          how much you can produce, the product with the best margin percentage is often the wrong one to push.
          What counts is profit per hour of that bottleneck. Naming it here lets the diagnostics work that out.
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ ...S.cardH, marginBottom: 0 }}>Fixed monthly costs</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{M(monthlyFixed)}/mo</div>
        </div>
        <div style={{ ...S.note, marginBottom: 10 }}>
          Bills you pay whether you sell one unit or a thousand - rent, salaries, software, insurance.
          These do not belong in a recipe. They get spread across products here instead.
        </div>
        {costPools.length === 0 ? (
          <Empty title="No fixed costs yet"
            body="Add rent, salaries and subscriptions so breakeven and true profit can be calculated."
            action={<button style={S.btn} onClick={addPool}>Add a fixed cost</button>} />
        ) : (
          <div style={S.scroll}>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>What it is</th><th style={{ ...S.th, width: 120 }}>Amount</th>
                <th style={{ ...S.th, width: 110 }}>Per</th><th style={{ ...S.th, width: 170 }}>Spread across products</th>
                <th style={{ ...S.th, width: 90 }}>Can be cut?</th><th style={{ ...S.th, width: 36 }}></th>
              </tr></thead>
              <tbody>
                {costPools.map((p) => (
                  <tr key={p.id}>
                    <td style={S.td}><TextCell value={p.name} onChange={(v) => patchPool(p.id, { name: v })} placeholder="Shop rent" /></td>
                    <td style={S.td}><NumCell value={p.amount} onChange={(v) => patchPool(p.id, { amount: v })} /></td>
                    <td style={S.td}><SelectCell value={p.period ?? "monthly"} onChange={(v) => patchPool(p.id, { period: v })}
                      options={[{ v: "monthly", label: "Month" }, { v: "quarterly", label: "Quarter" }, { v: "annual", label: "Year" }]} /></td>
                    <td style={S.td}><SelectCell value={p.allocation_basis ?? "revenue"} onChange={(v) => patchPool(p.id, { allocation_basis: v as any })}
                      options={ALLOCATION_BASES} /></td>
                    <td style={{ ...S.td, textAlign: "center" }}>
                      <input type="checkbox" checked={!!p.is_avoidable} onChange={(e) => patchPool(p.id, { is_avoidable: e.target.checked })} />
                    </td>
                    <td style={S.td}><button style={S.btnDel} onClick={() => delPool(p.id)} title="Remove">&times;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button style={{ ...S.btnGhost, marginTop: 10 }} onClick={addPool}>+ Add fixed cost</button>
          </div>
        )}
      </div>
    </>
  );
};

/* ============================================================================
 * TAB :: INPUTS
 * ========================================================================== */

const InputsTab: React.FC<{
  resources: CaResource[]; patchRes: (id: string, p: Partial<CaResource>) => void;
  addResource: () => void; delRes: (id: string) => void; cur: string;
}> = ({ resources, patchRes, addResource, delRes, cur }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!resources.length) {
    return (
      <div style={S.card}>
        <Empty title="Nothing here yet"
          body="Add the things you buy - raw materials, staff time, machine time, software, energy. Anything that gets consumed to deliver what you sell."
          action={<button style={S.btn} onClick={addResource}>Add your first input</button>} />
      </div>
    );
  }

  return (
    <div style={S.card}>
      <div style={S.cardH}>What you buy</div>
      <div style={{ ...S.note, marginBottom: 12 }}>
        The <strong style={{ color: V("ink", "#e6edf3") }}>usable %</strong> column is the one most businesses get
        wrong. You pay for everything you buy, but only part of it reaches the finished product - trim waste on
        material, non-productive hours on staff, idle capacity on machines and software. The true cost column
        accounts for that automatically.
      </div>
      <div style={S.scroll}>
        <table style={S.table}>
          <thead><tr>
            <th style={{ ...S.th, width: "18%", minWidth: 130 }}>Name</th>
            <th style={{ ...S.th, width: 118 }}>Type</th>
            <th style={{ ...S.th, width: 92 }}>You pay</th>
            <th style={{ ...S.th, width: 74 }}>For qty</th>
            <th style={{ ...S.th, width: 86 }}>Bought as</th>
            <th style={{ ...S.th, width: 84 }}>Usable %</th>
            <th style={{ ...S.th, width: 134, textAlign: "right" }}>True cost</th>
            <th style={{ ...S.th, width: 62 }}></th>
          </tr></thead>
          <tbody>
            {resources.map((r) => {
              const eff = effectiveCostPerBaseUnit(r);
              const naive = naiveCostPerBaseUnit(r);
              const uplift = naive > 0 ? ((eff / naive) - 1) * 100 : 0;
              const isOpen = expanded === r.id;
              return (
                <React.Fragment key={r.id}>
                  <tr>
                    <td style={S.td}><TextCell value={r.name} onChange={(v) => patchRes(r.id, { name: v })} placeholder="Butter, welder time, AWS..." /></td>
                    <td style={S.td}><SelectCell value={r.resource_class} onChange={(v) => patchRes(r.id, { resource_class: v as ResourceClass })}
                      options={CLASSES.map((c) => ({ v: c.v, label: c.label }))} /></td>
                    <td style={S.td}><NumCell value={r.purchase_price} onChange={(v) => patchRes(r.id, { purchase_price: v })} /></td>
                    <td style={S.td}><NumCell value={r.purchase_qty} onChange={(v) => patchRes(r.id, { purchase_qty: v })} /></td>
                    <td style={S.td}><TextCell value={r.purchase_uom} onChange={(v) => patchRes(r.id, { purchase_uom: v, base_uom: r.base_uom || v })} placeholder="kg" /></td>
                    <td style={S.td}><NumCell value={r.effective_yield_pct} onChange={(v) => patchRes(r.id, { effective_yield_pct: v })} suffix="%" /></td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {fmtMoney(eff, cur)}
                      <span style={{ fontSize: 9.5, fontWeight: 500, color: V("muted", "#8b98a5") }}> / {r.base_uom || r.purchase_uom || "unit"}</span>
                      {uplift > 0.5 && <div style={{ fontSize: 9.5, fontWeight: 600, color: WARN.fg }}>+{uplift.toFixed(1)}% hidden</div>}
                    </td>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                      <button style={S.btnDel} onClick={() => setExpanded(isOpen ? null : r.id)} title="More detail">{isOpen ? "\u2212" : "+"}</button>
                      <button style={S.btnDel} onClick={() => delRes(r.id)} title="Remove">&times;</button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={8} style={{ ...S.td, background: V("bg", "#070c18"), padding: 12 }}>
                      <div style={{ fontSize: 10.5, color: V("muted", "#8b98a5"), marginBottom: 9 }}>
                        Usable % for this type means: <strong style={{ color: V("ink", "#e6edf3") }}>{yieldLabel(r.resource_class, r.yield_basis_label)}</strong>
                      </div>
                      <div style={S.grid2}>
                        <div><label style={S.lbl}>Base unit used in recipes</label>
                          <TextCell value={r.base_uom} onChange={(v) => patchRes(r.id, { base_uom: v })} placeholder="kg, hour, unit" /></div>
                        <div><label style={S.lbl}>How many base units per purchase</label>
                          <NumCell value={r.conversion_factor} onChange={(v) => patchRes(r.id, { conversion_factor: v })} /></div>
                        <div><label style={S.lbl}>Freight / delivery</label>
                          <NumCell value={r.freight_cost} onChange={(v) => patchRes(r.id, { freight_cost: v })} /></div>
                        <div><label style={S.lbl}>Duty / other charges</label>
                          <NumCell value={r.duty_cost} onChange={(v) => patchRes(r.id, { duty_cost: v })} /></div>
                        <div><label style={S.lbl}>GST you can claim back</label>
                          <NumCell value={r.input_tax_credit} onChange={(v) => patchRes(r.id, { input_tax_credit: v })} /></div>
                        <div><label style={S.lbl}>Scrap you can resell</label>
                          <NumCell value={r.scrap_recovery_value} onChange={(v) => patchRes(r.id, { scrap_recovery_value: v })} /></div>
                        <div><label style={S.lbl}>Supplier</label>
                          <TextCell value={r.supplier_name} onChange={(v) => patchRes(r.id, { supplier_name: v })} placeholder="Who you buy from" /></div>
                        <div><label style={S.lbl}>Lead time (days)</label>
                          <NumCell value={r.lead_time_days} onChange={(v) => patchRes(r.id, { lead_time_days: v })} /></div>
                        <div><label style={S.lbl}>Commodity index to track</label>
                          <TextCell value={r.index_ref} onChange={(v) => patchRes(r.id, { index_ref: v })} placeholder="WPI-Wheat, LME-Copper" /></div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, paddingBottom: 5 }}>
                          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                            <input type="checkbox" checked={!!r.is_substitutable} onChange={(e) => patchRes(r.id, { is_substitutable: e.target.checked })} />
                            Alternative exists
                          </label>
                          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                            <input type="checkbox" checked={!!r.is_bottleneck} onChange={(e) => patchRes(r.id, { is_bottleneck: e.target.checked })} />
                            This is the bottleneck
                          </label>
                        </div>
                      </div>
                      <div style={{ ...S.note, marginTop: 10 }}>
                        Landed cost {fmtMoney(naive, cur)} per {r.base_uom || "unit"} before waste.
                        After {num(r.effective_yield_pct, 100)}% usable, true cost is <strong style={{ color: V("ink", "#e6edf3") }}>{fmtMoney(eff, cur)}</strong>.
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <button style={{ ...S.btnGhost, marginTop: 11 }} onClick={addResource}>+ Add input</button>
    </div>
  );
};

/* ============================================================================
 * TAB :: PRODUCTS
 * ========================================================================== */

const ProductsTab: React.FC<{
  offerings: CaOffering[]; resources: CaResource[]; bomLines: CaBomLine[]; channels: CaChannel[];
  offeringChannels: CaOfferingChannel[]; dx: PortfolioDiagnosis;
  openOffering: string | null; setOpenOffering: (v: string | null) => void;
  patchOff: (id: string, p: Partial<CaOffering>) => void;
  patchBom: (id: string, p: Partial<CaBomLine>) => void;
  patchOC: (id: string, p: Partial<CaOfferingChannel>) => void;
  addOffering: () => void; addBomLine: (id: string) => void; linkChannel: (o: string, c: string) => void;
  delOff: (id: string) => void; delBom: (id: string) => void; delOC: (id: string) => void;
  M: (v: number) => string;
}> = (p) => {
  if (!p.offerings.length) {
    return (
      <div style={S.card}>
        <Empty title="Nothing to sell yet"
          body="Add a product, service or plan. Then build its recipe from the inputs you entered, and the true cost per unit appears straight away."
          action={<button style={S.btn} onClick={p.addOffering}>Add your first product</button>} />
      </div>
    );
  }

  return (
    <>
      {p.offerings.map((o) => {
        const econ = p.dx.offerings.find((e) => e.offeringId === o.id);
        const lines = p.bomLines.filter((b) => b.offering_id === o.id);
        const links = p.offeringChannels.filter((c) => c.offering_id === o.id);
        const isOpen = p.openOffering === o.id;
        const cm = econ?.contributionMarginPct ?? 0;
        const tone = econ?.isLossMaking ? BAD : cm >= 40 ? OK : cm > 0 ? WARN : NEU;

        return (
          <div key={o.id} style={S.card}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "2 1 190px", minWidth: 160 }}>
                <label style={S.lbl}>Name</label>
                <TextCell value={o.name} onChange={(v) => p.patchOff(o.id, { name: v })} placeholder="Birthday cake 1kg" />
              </div>
              <div style={{ flex: "1 1 130px" }}>
                <label style={S.lbl}>Type</label>
                <SelectCell value={o.offering_type} onChange={(v) => p.patchOff(o.id, { offering_type: v as OfferingType })}
                  options={OFFERING_TYPES.map((t) => ({ v: t.v, label: t.label }))} />
              </div>
              <div style={{ flex: "0 1 95px" }}>
                <label style={S.lbl}>Price</label>
                <NumCell value={o.list_price} onChange={(v) => p.patchOff(o.id, { list_price: v })} />
              </div>
              <div style={{ flex: "0 1 90px" }}>
                <label style={S.lbl}>Vol / month</label>
                <NumCell value={o.monthly_volume} onChange={(v) => p.patchOff(o.id, { monthly_volume: v })} />
              </div>
              <div style={{ flex: "0 1 95px" }}>
                <label style={S.lbl}>Bottleneck min</label>
                <NumCell value={o.constraint_minutes_per_unit} onChange={(v) => p.patchOff(o.id, { constraint_minutes_per_unit: v })} />
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "flex-end", paddingBottom: 3 }}>
                <button style={S.btnGhost} onClick={() => p.setOpenOffering(isOpen ? null : o.id)}>
                  {isOpen ? "Close recipe" : `Recipe (${lines.length})`}
                </button>
                <button style={S.btnDel} onClick={() => p.delOff(o.id)} title="Remove">&times;</button>
              </div>
            </div>

            {econ && (
              <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 11, borderTop: `1px solid ${V("faint", "#16202c")}`, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11 }}><span style={{ color: V("muted", "#8b98a5") }}>Cost to make </span><strong>{p.M(econ.marginalCostPerUnit)}</strong></span>
                <span style={{ fontSize: 11 }}><span style={{ color: V("muted", "#8b98a5") }}>Reaches bank </span><strong>{p.M(econ.blendedNetRealisation)}</strong></span>
                <span style={{ fontSize: 11 }}><span style={{ color: V("muted", "#8b98a5") }}>Profit / unit </span><strong style={{ color: tone.fg }}>{p.M(econ.contributionPerUnit)}</strong></span>
                <Chip tone={tone}>{econ.isLossMaking ? "Loses money" : cm.toFixed(1) + "% margin"}</Chip>
                {econ.contributionPerConstraintMinute != null && (
                  <span style={{ fontSize: 11, color: V("muted", "#8b98a5") }}>
                    {p.M(econ.contributionPerConstraintMinute)}/bottleneck-min
                  </span>
                )}
                {econ.paretoTop3Labels.length > 0 && (
                  <span style={{ fontSize: 10.5, color: V("muted", "#8b98a5") }}>
                    Driven by {econ.paretoTop3Labels.slice(0, 3).join(", ")} ({econ.paretoTop3SharePct}%)
                  </span>
                )}
              </div>
            )}

            {isOpen && (
              <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${V("border", "#1e2a38")}` }}>
                <div style={S.cardH}>Recipe - what goes into one {o.output_uom || "unit"}</div>
                {lines.length === 0 ? (
                  <div style={{ ...S.note, marginBottom: 9 }}>
                    Nothing added yet. Each line is one input and how much of it a single unit consumes.
                  </div>
                ) : (
                  <div style={S.scroll}>
                    <table style={S.table}>
                      <thead><tr>
                        <th style={S.th}>Input</th>
                        <th style={{ ...S.th, width: 95 }}>Qty per unit</th>
                        <th style={{ ...S.th, width: 78 }}>Waste %</th>
                        <th style={{ ...S.th, width: 105 }}>Charged per</th>
                        <th style={{ ...S.th, width: 105, textAlign: "right" }}>Cost</th>
                        <th style={{ ...S.th, width: 62, textAlign: "right" }}>Share</th>
                        <th style={{ ...S.th, width: 32 }}></th>
                      </tr></thead>
                      <tbody>
                        {lines.map((b) => {
                          const cl = econ?.costLines.find((x) => x.sourceId === (b.child_resource_id || b.child_offering_id) && x.depth === 0);
                          return (
                            <tr key={b.id}>
                              <td style={S.td}>
                                <SelectCell value={b.child_type === "RESOURCE" ? "R:" + b.child_resource_id : "O:" + b.child_offering_id}
                                  onChange={(v) => {
                                    if (v.startsWith("R:")) p.patchBom(b.id, { child_type: "RESOURCE", child_resource_id: v.slice(2), child_offering_id: null });
                                    else p.patchBom(b.id, { child_type: "OFFERING", child_offering_id: v.slice(2), child_resource_id: null });
                                  }}
                                  options={[
                                    ...p.resources.map((r) => ({ v: "R:" + r.id, label: r.name || "(unnamed input)" })),
                                    ...p.offerings.filter((x) => x.id !== o.id).map((x) => ({ v: "O:" + x.id, label: "\u21B3 " + (x.name || "(unnamed)") })),
                                  ]} />
                              </td>
                              <td style={S.td}><NumCell value={b.qty_per_unit} onChange={(v) => p.patchBom(b.id, { qty_per_unit: v })} /></td>
                              <td style={S.td}><NumCell value={b.process_scrap_pct} onChange={(v) => p.patchBom(b.id, { process_scrap_pct: v })} suffix="%" /></td>
                              <td style={S.td}><SelectCell value={b.applies_per ?? "UNIT"} onChange={(v) => p.patchBom(b.id, { applies_per: v as any })}
                                options={[{ v: "UNIT", label: "Each unit" }, { v: "BATCH", label: "Whole batch" }, { v: "PROJECT", label: "Whole project" }]} /></td>
                              <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{cl ? p.M(cl.lineCost) : "-"}</td>
                              <td style={{ ...S.td, textAlign: "right", color: V("muted", "#8b98a5") }}>{cl ? cl.sharePct + "%" : "-"}</td>
                              <td style={S.td}><button style={S.btnDel} onClick={() => p.delBom(b.id)}>&times;</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <button style={{ ...S.btnGhost, marginTop: 9 }} onClick={() => p.addBomLine(o.id)}>+ Add recipe line</button>

                {num(o.batch_size, 1) > 1 && (
                  <div style={{ ...S.note, marginTop: 9 }}>
                    Batch size {o.batch_size}. Lines charged per batch are divided across that many units.
                  </div>
                )}

                <div style={{ ...S.cardH, marginTop: 18 }}>Where this one sells</div>
                {p.channels.length === 0 ? (
                  <div style={S.note}>No channels set up yet. Add them on the "Where you sell" tab to see commission and discount leakage.</div>
                ) : (
                  <>
                    {links.length > 0 && (
                      <div style={S.scroll}>
                        <table style={S.table}>
                          <thead><tr>
                            <th style={S.th}>Channel</th>
                            <th style={{ ...S.th, width: 100 }}>Price here</th>
                            <th style={{ ...S.th, width: 90 }}>% of volume</th>
                            <th style={{ ...S.th, width: 110, textAlign: "right" }}>Reaches bank</th>
                            <th style={{ ...S.th, width: 90, textAlign: "right" }}>Margin</th>
                            <th style={{ ...S.th, width: 32 }}></th>
                          </tr></thead>
                          <tbody>
                            {links.map((lk) => {
                              const ch = p.channels.find((c) => c.id === lk.channel_id);
                              const ce = econ?.channelEconomics.find((c) => c.channelId === lk.channel_id);
                              return (
                                <tr key={lk.id}>
                                  <td style={S.td}>{ch?.name || "(unnamed)"}</td>
                                  <td style={S.td}><NumCell value={lk.list_price_override} onChange={(v) => p.patchOC(lk.id, { list_price_override: v })} placeholder={String(o.list_price ?? "")} /></td>
                                  <td style={S.td}><NumCell value={lk.volume_share_pct} onChange={(v) => p.patchOC(lk.id, { volume_share_pct: v })} suffix="%" /></td>
                                  <td style={{ ...S.td, textAlign: "right" }}>
                                    {ce ? p.M(ce.netRealisation) : "-"}
                                    {ce && ce.leakagePct > 0 && <div style={{ fontSize: 9.5, color: ce.leakagePct > 25 ? BAD.fg : WARN.fg }}>-{ce.leakagePct}% lost</div>}
                                  </td>
                                  <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: ce?.isLossMaking ? BAD.fg : V("ink", "#e6edf3") }}>
                                    {ce ? ce.contributionMarginPct + "%" : "-"}
                                  </td>
                                  <td style={S.td}><button style={S.btnDel} onClick={() => p.delOC(lk.id)}>&times;</button></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                      {p.channels.filter((c) => !links.some((l) => l.channel_id === c.id)).map((c) => (
                        <button key={c.id} style={S.btnGhost} onClick={() => p.linkChannel(o.id, c.id)}>+ {c.name || "(unnamed)"}</button>
                      ))}
                    </div>
                  </>
                )}

                <div style={{ ...S.grid2, marginTop: 16 }}>
                  <div><label style={S.lbl}>Unit name</label>
                    <TextCell value={o.output_uom} onChange={(v) => p.patchOff(o.id, { output_uom: v })} placeholder="cake, tonne, engagement" /></div>
                  <div><label style={S.lbl}>Batch size</label>
                    <NumCell value={o.batch_size} onChange={(v) => p.patchOff(o.id, { batch_size: v })} /></div>
                  <div><label style={S.lbl}>Target margin %</label>
                    <NumCell value={o.target_margin_pct} onChange={(v) => p.patchOff(o.id, { target_margin_pct: v })} suffix="%" /></div>
                  {o.offering_type === "SUBSCRIPTION" && (<>
                    <div><label style={S.lbl}>Monthly churn %</label>
                      <NumCell value={o.churn_rate_monthly_pct} onChange={(v) => p.patchOff(o.id, { churn_rate_monthly_pct: v })} suffix="%" /></div>
                    <div><label style={S.lbl}>Cost to win a customer</label>
                      <NumCell value={o.cac} onChange={(v) => p.patchOff(o.id, { cac: v })} /></div>
                  </>)}
                </div>

                {econ && o.offering_type === "SUBSCRIPTION" && econ.ltvCacRatio != null && (
                  <div style={{ ...S.note, marginTop: 10 }}>
                    Lifetime value <strong style={{ color: V("ink", "#e6edf3") }}>{p.M(econ.ltv || 0)}</strong> against
                    acquisition cost - ratio <strong style={{ color: econ.ltvCacRatio >= 3 ? OK.fg : BAD.fg }}>{econ.ltvCacRatio}x</strong>,
                    payback in {econ.cacPaybackMonths} months. Below 3x is generally unsustainable.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button style={S.btn} onClick={p.addOffering}>+ Add product</button>
    </>
  );
};

/* ============================================================================
 * TAB :: CHANNELS
 * ========================================================================== */

const ChannelsTab: React.FC<{
  channels: CaChannel[]; patchCh: (id: string, p: Partial<CaChannel>) => void;
  addChannel: () => void; delCh: (id: string) => void; cur: string;
}> = ({ channels, patchCh, addChannel, delCh }) => {
  if (!channels.length) {
    return (
      <div style={S.card}>
        <Empty title="No sales channels yet"
          body="Add each place you sell - your own store, a marketplace, an aggregator, a distributor. Commission, discounts and delivery costs are usually where margin quietly disappears."
          action={<button style={S.btn} onClick={addChannel}>Add a channel</button>} />
      </div>
    );
  }
  return (
    <div style={S.card}>
      <div style={S.cardH}>Where you sell</div>
      <div style={{ ...S.note, marginBottom: 12 }}>
        List price is not what you receive. Every percentage below is subtracted before the money reaches you.
        Same product, two channels, and the difference is often larger than your entire profit margin.
      </div>
      <div style={S.scroll}>
        <table style={S.tableWide}>
          <thead><tr>
            <th style={{ ...S.th, width: 130 }}>Channel</th>
            <th style={{ ...S.th, width: 145 }}>Type</th>
            <th style={{ ...S.th, width: 84 }}>Commission</th>
            <th style={{ ...S.th, width: 84 }}>Discount</th>
            <th style={{ ...S.th, width: 84 }}>Ads</th>
            <th style={{ ...S.th, width: 84 }}>Gateway</th>
            <th style={{ ...S.th, width: 84 }}>Packaging</th>
            <th style={{ ...S.th, width: 84 }}>Delivery</th>
            <th style={{ ...S.th, width: 78 }}>Returns</th>
            <th style={{ ...S.th, width: 70 }}>GST</th>
            <th style={{ ...S.th, width: 90, textAlign: "right" }}>Total drag</th>
            <th style={{ ...S.th, width: 32 }}></th>
          </tr></thead>
          <tbody>
            {channels.map((c) => {
              const drag = num(c.commission_pct) + num(c.discount_pct) + num(c.ad_spend_pct) + num(c.payment_gateway_pct) + num(c.returns_pct);
              return (
                <tr key={c.id}>
                  <td style={S.td}><TextCell value={c.name} onChange={(v) => patchCh(c.id, { name: v })} placeholder="Swiggy" /></td>
                  <td style={S.td}><SelectCell value={c.channel_type ?? "direct"} onChange={(v) => patchCh(c.id, { channel_type: v })} options={CHANNEL_TYPES} /></td>
                  <td style={S.td}><NumCell value={c.commission_pct} onChange={(v) => patchCh(c.id, { commission_pct: v })} suffix="%" /></td>
                  <td style={S.td}><NumCell value={c.discount_pct} onChange={(v) => patchCh(c.id, { discount_pct: v })} suffix="%" /></td>
                  <td style={S.td}><NumCell value={c.ad_spend_pct} onChange={(v) => patchCh(c.id, { ad_spend_pct: v })} suffix="%" /></td>
                  <td style={S.td}><NumCell value={c.payment_gateway_pct} onChange={(v) => patchCh(c.id, { payment_gateway_pct: v })} suffix="%" /></td>
                  <td style={S.td}><NumCell value={c.packaging_cost} onChange={(v) => patchCh(c.id, { packaging_cost: v })} /></td>
                  <td style={S.td}><NumCell value={c.delivery_subsidy} onChange={(v) => patchCh(c.id, { delivery_subsidy: v })} /></td>
                  <td style={S.td}><NumCell value={c.returns_pct} onChange={(v) => patchCh(c.id, { returns_pct: v })} suffix="%" /></td>
                  <td style={S.td}><NumCell value={c.gst_pct} onChange={(v) => patchCh(c.id, { gst_pct: v })} suffix="%" /></td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: drag > 25 ? BAD.fg : drag > 12 ? WARN.fg : V("ink", "#e6edf3") }}>
                    {drag.toFixed(1)}%
                  </td>
                  <td style={S.td}><button style={S.btnDel} onClick={() => delCh(c.id)}>&times;</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button style={{ ...S.btnGhost, marginTop: 11 }} onClick={addChannel}>+ Add channel</button>
    </div>
  );
};

/* ============================================================================
 * TAB :: DIAGNOSTICS
 * ========================================================================== */

const LEVER_LABEL: Record<string, string> = {
  YIELD_RECOVERY: "Cut waste", SUBSTITUTION: "Find alternative", DE_SPECIFICATION: "Reduce over-spec",
  BATCH_ECONOMICS: "Batch size", SUPPLIER_LEVERAGE: "Supplier terms", MAKE_VS_BUY: "Make vs buy",
  CHANNEL_MIX: "Channel mix", PRICE_ARCHITECTURE: "Pricing", OVERHEAD_REDUCTION: "Overheads",
  CONSTRAINT_REALLOCATION: "Capacity mix", PORTFOLIO_PRUNING: "Fix or drop",
};

const DiagnosticsTab: React.FC<{ dx: PortfolioDiagnosis; M: (v: number) => string; goTo: (t: TabKey) => void }> = ({ dx, M, goTo }) => {
  if (!dx.offerings.length) {
    return (
      <div style={S.card}>
        <Empty title="Nothing to analyse yet"
          body="Add what you buy, then what you sell and its recipe. Diagnostics fill in automatically as soon as one product has a recipe and a price."
          action={<button style={S.btn} onClick={() => goTo("inputs")}>Start with what you buy</button>} />
      </div>
    );
  }

  const crit = dx.dataQuality.filter((d) => d.severity === "critical");

  return (
    <>
      <div style={{ display: "flex", gap: 11, flexWrap: "wrap", marginBottom: 14 }}>
        <Tile label="Revenue / month" value={M(dx.monthlyRevenue)} />
        <Tile label="Contribution" value={dx.contributionMarginPct + "%"} sub={M(dx.monthlyContribution) + "/mo"}
          tone={dx.contributionMarginPct >= 35 ? OK.fg : dx.contributionMarginPct > 0 ? WARN.fg : BAD.fg} />
        <Tile label="Operating profit" value={M(dx.monthlyOperatingProfit)} sub={dx.operatingMarginPct + "% margin"}
          tone={dx.monthlyOperatingProfit >= 0 ? OK.fg : BAD.fg} />
        <Tile label="Breakeven" value={M(dx.breakevenRevenue)} sub={"Safety margin " + dx.marginOfSafetyPct + "%"} />
        <Tile label="Savings identified" value={M(dx.totalAnnualOpportunity)} sub="per year" tone={OK.fg} />
      </div>

      {crit.length > 0 && (
        <div style={{ ...S.card, borderColor: BAD.fg }}>
          <div style={{ ...S.cardH, color: BAD.fg }}>Fix these before trusting the numbers</div>
          {crit.slice(0, 6).map((f, i) => (
            <div key={i} style={{ fontSize: 11.5, marginBottom: 5, lineHeight: 1.5 }}>
              <strong style={{ color: BAD.fg }}>{f.field}</strong> &mdash; {f.message}
            </div>
          ))}
        </div>
      )}

      {dx.opportunities.length > 0 && (
        <div style={S.card}>
          <div style={S.cardH}>Where the money is &mdash; ranked by annual value</div>
          {dx.opportunities.slice(0, 8).map((o: Opportunity, i: number) => (
            <div key={i} style={{ padding: "11px 0", borderBottom: i < Math.min(7, dx.opportunities.length - 1) ? `1px solid ${V("faint", "#16202c")}` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 300px" }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                    <Chip tone={NEU}>{LEVER_LABEL[o.lever] || o.lever}</Chip>
                    <Chip tone={o.confidence === "high" ? OK : o.confidence === "medium" ? WARN : BAD}>{o.confidence} confidence</Chip>
                    <span style={{ fontSize: 10, color: V("muted", "#8b98a5") }}>{o.difficulty} effort &middot; ~{o.timeToImpactWeeks} weeks</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{o.title}</div>
                  <div style={{ ...S.note, marginBottom: 6 }}>{o.rationale}</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10.5, color: V("muted", "#8b98a5"), lineHeight: 1.65 }}>
                    {o.evidence.map((ev, j) => <li key={j}>{ev}</li>)}
                  </ul>
                </div>
                <div style={{ textAlign: "right", minWidth: 100 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: OK.fg, letterSpacing: -0.3 }}>{M(o.annualImpact)}</div>
                  <div style={{ fontSize: 9.5, color: V("muted", "#8b98a5") }}>per year</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dx.benchmarkChecks.some((b) => b.status !== "no_benchmark") && (
        <div style={S.card}>
          <div style={S.cardH}>How you compare to your industry</div>
          <div style={S.scroll}>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Measure</th>
                <th style={{ ...S.th, width: 80, textAlign: "right" }}>You</th>
                <th style={{ ...S.th, width: 120, textAlign: "right" }}>Industry range</th>
                <th style={{ ...S.th, width: 90 }}>Verdict</th>
                <th style={S.th}>Source</th>
              </tr></thead>
              <tbody>
                {dx.benchmarkChecks.filter((b) => b.status !== "no_benchmark").map((b) => (
                  <tr key={b.metricKey}>
                    <td style={S.td}>{b.metricLabel}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{b.actual}{b.unit}</td>
                    <td style={{ ...S.td, textAlign: "right", color: V("muted", "#8b98a5") }}>
                      {[b.low, b.mid, b.high].filter((x) => x != null).join(" / ")}{b.unit}
                    </td>
                    <td style={S.td}>
                      <Chip tone={b.status === "better" ? OK : b.status === "worse" ? BAD : NEU}>
                        {b.status === "better" ? "Ahead" : b.status === "worse" ? "Behind" : "Normal"}
                      </Chip>
                    </td>
                    <td style={{ ...S.td, fontSize: 10.5, color: V("muted", "#8b98a5") }}>
                      {b.source || "\u2014"}{b.asOf ? " (" + String(b.asOf).slice(0, 4) + ")" : ""}
                      {b.confidence === "low" && <span style={{ color: WARN.fg }}> &middot; indicative only</span>}
                      {b.benchmarkScope === "cross_industry" && <span> &middot; cross-industry</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardH}>Every product, side by side</div>
        <div style={S.scroll}>
          <table style={S.table}>
            <thead><tr>
              <th style={{ ...S.th, width: "20%", minWidth: 150 }}>Product</th>
              <th style={{ ...S.th, width: 92,  textAlign: "right" }}>Price</th>
              <th style={{ ...S.th, width: 112, textAlign: "right" }}>Reaches bank</th>
              <th style={{ ...S.th, width: 108, textAlign: "right" }}>Cost to make</th>
              <th style={{ ...S.th, width: 100, textAlign: "right" }}>Profit/unit</th>
              <th style={{ ...S.th, width: 84,  textAlign: "right" }}>Margin</th>
              <th style={{ ...S.th, width: 118, textAlign: "right" }}>Per bottleneck-min</th>
              <th style={{ ...S.th, width: 110, textAlign: "right" }}>Monthly profit</th>
            </tr></thead>
            <tbody>
              {dx.offerings.map((e) => (
                <tr key={e.offeringId}>
                  <td style={S.td}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name || "(unnamed)"}</div>
                    {e.paretoTop3Labels.length > 0 && (
                      <div style={{ fontSize: 9.5, color: V("muted", "#8b98a5") }}>
                        {e.paretoTop3Labels.slice(0, 2).join(", ")} = {e.paretoTop3SharePct}%
                      </div>
                    )}
                  </td>
                  <td style={{ ...S.td, textAlign: "right" }}>{M(e.listPrice)}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{M(e.blendedNetRealisation)}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{M(e.marginalCostPerUnit)}</td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: e.isLossMaking ? BAD.fg : V("ink", "#e6edf3") }}>{M(e.contributionPerUnit)}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>
                    <Chip tone={e.isLossMaking ? BAD : e.contributionMarginPct >= 40 ? OK : WARN}>{e.contributionMarginPct}%</Chip>
                  </td>
                  <td style={{ ...S.td, textAlign: "right", color: V("muted", "#8b98a5") }}>
                    {e.contributionPerConstraintMinute != null ? M(e.contributionPerConstraintMinute) : "\u2014"}
                  </td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{M(e.monthlyContribution)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dx.topResourcesBySpend.length > 0 && (
        <div style={S.card}>
          <div style={S.cardH}>Biggest spends &mdash; annual</div>
          {dx.topResourcesBySpend.slice(0, 10).map((t) => (
            <div key={t.resourceId} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
                <span>
                  <strong>{t.name}</strong>
                  <span style={{ color: V("muted", "#8b98a5") }}> &middot; {t.resourceClass.toLowerCase()}</span>
                  {t.yieldPct < 95 && <span style={{ color: WARN.fg }}> &middot; only {t.yieldPct}% usable</span>}
                  {t.supplier && <span style={{ color: V("muted", "#8b98a5") }}> &middot; {t.supplier}</span>}
                </span>
                <span style={{ fontWeight: 700 }}>{M(t.annualSpend)} <span style={{ color: V("muted", "#8b98a5"), fontWeight: 400 }}>{t.sharePct}%</span></span>
              </div>
              <div style={{ height: 4, background: V("faint", "#16202c"), borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.min(100, t.sharePct) + "%", background: V("accent", "#4ADE80"), opacity: 0.75 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...S.note, textAlign: "center", padding: "6px 0 0" }}>
        Data completeness {dx.completenessScore}% &middot; confidence {dx.confidenceScore}%.
        Every figure is calculated from what you entered &mdash; nothing is estimated or guessed.
      </div>
    </>
  );
};

/* ============================================================================
 * TAB :: START HERE
 * Describe the business in plain words. The system researches it, drafts the
 * whole cost model, and hands back a checklist to verify - instead of a blank
 * form that assumes the user is already an expert in this industry.
 * ========================================================================== */

const VERIFY_STYLE: Record<Verify, { tone: { bg: string; fg: string }; label: string }> = {
  confirmed:    { tone: OK,   label: "Researched" },
  needs_check:  { tone: WARN, label: "Check this" },
  must_supply:  { tone: BAD,  label: "You must enter" },
};

const EXAMPLES = [
  "A bakery in Lucknow making birthday cakes, cookies and multigrain bread. Sells walk-in and on Swiggy and Zomato.",
  "A 40-seat casual dining restaurant in Pune serving North Indian food, about half the orders come from delivery apps.",
  "A steel re-rolling mill in Ghaziabad buying HRC coil and making angles and channels for local fabricators.",
  "A 6-person management consulting firm in Bengaluru doing market entry projects and monthly advisory retainers.",
  "A D2C skincare brand selling on our own website and Amazon, we get the products made by a third-party manufacturer.",
];

const StartTab: React.FC<{
  callAI?: (prompt: string, useWebSearch: boolean) => Promise<string>;
  ctx: CaBusinessContext | null;
  applyBlueprint: (bp: Blueprint, skip: { resources: Set<string>; offerings: Set<string>; channels: Set<string>; costPools: Set<string> }) => Promise<boolean>;
  hasData: boolean;
  goTo: (t: TabKey) => void;
  companyName?: string;
}> = ({ callAI, ctx, applyBlueprint, hasData, goTo, companyName }) => {
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [res, setRes] = useState<BlueprintResult | null>(null);
  const [skipR, setSkipR] = useState<Set<string>>(new Set());
  const [skipO, setSkipO] = useState<Set<string>>(new Set());
  const [skipC, setSkipC] = useState<Set<string>>(new Set());
  const [skipP, setSkipP] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);

  const bp = res?.ok ? res.blueprint : null;
  const cur = bp?.currency || ctx?.currency || "INR";
  const M = (v: number) => fmtMoney(v, cur);

  const toggle = (set: Set<string>, k: string, fn: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(k)) next.delete(k); else next.add(k);
    fn(next);
  };

  const run = async () => {
    if (!callAI) return;
    setBusy(true); setRes(null); setApplied(false);
    setSkipR(new Set()); setSkipO(new Set()); setSkipC(new Set()); setSkipP(new Set());
    const steps = [
      "Working out what kind of business this is...",
      "Searching for current input prices in your market...",
      "Looking up normal wastage and utilisation for this trade...",
      "Checking real commission and fee structures...",
      "Finding where businesses like this usually lose margin...",
      "Building your draft cost model...",
      "Web search is slow - falling back to model knowledge...",
      "Trying a simplified request...",
      "Building a structural starter model for you...",
    ];
    let i = 0;
    setPhase(steps[0]);
    const timer = setInterval(() => { i = Math.min(i + 1, steps.length - 1); setPhase(steps[i]); }, 6000);
    try {
      const r = await researchBlueprint(callAI, desc, {
        geography: ctx?.geography || "India", currency: cur, depth: "deep",
      });
      setRes(r);
    } catch (e: any) {
      setRes({ ok: false, blueprint: null, rawLength: 0, stage: "failed", attempts: [], error: e?.message || "Research failed. Please try again." });
    } finally {
      clearInterval(timer); setBusy(false); setPhase("");
    }
  };

  const stats = bp ? blueprintStats(bp) : null;

  /* ---- no AI wired ---- */
  if (!callAI) {
    return (
      <div style={S.card}>
        <Empty title="Guided setup is not switched on"
          body="This screen can research your industry and draft the whole cost model for you, but it needs an AI provider key. Add one in Settings, or build the model by hand from the tabs above."
          action={<button style={S.btnGhost} onClick={() => goTo("inputs")}>Build it by hand instead</button>} />
      </div>
    );
  }

  return (
    <>
      {/* ---------------- input ---------------- */}
      <div style={S.card}>
        <div style={S.cardH}>Describe the business in your own words</div>
        <div style={{ ...S.note, marginBottom: 11 }}>
          You do not need to know this industry. Write what the business makes or does, roughly where it operates,
          and how it sells. The system researches current prices, normal wastage, real channel commissions and the
          usual margin leaks, then drafts the model for you to check and correct.
        </div>

        <textarea
          value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} disabled={busy}
          placeholder={companyName ? `e.g. ${companyName} is a ...` : "e.g. A bakery in Lucknow making birthday cakes and bread, selling walk-in and on Swiggy"}
          style={{ ...S.inp, resize: "vertical", lineHeight: 1.55, minHeight: 84, fontSize: 12.5 }} />

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "9px 0 12px" }}>
          {EXAMPLES.slice(0, 3).map((ex, i) => (
            <button key={i} disabled={busy} onClick={() => setDesc(ex)}
              style={{ ...S.btnGhost, fontSize: 10, opacity: busy ? 0.5 : 1, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ex.slice(0, 44)}...
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={run} disabled={busy || desc.trim().length < 12}
            style={{ ...S.btn, opacity: busy || desc.trim().length < 12 ? 0.45 : 1, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Researching..." : "Research and build my cost model"}
          </button>
          {busy && <span style={{ fontSize: 11, color: V("accent", "#4ADE80") }}>{phase}</span>}
          {!busy && hasData && (
            <span style={{ ...S.note, fontSize: 10.5 }}>
              You already have data. Anything generated here is <strong style={{ color: V("ink", "#e6edf3") }}>added alongside</strong> it, never replacing it.
            </span>
          )}
        </div>
        {busy && <div style={{ ...S.note, marginTop: 9, fontSize: 10.5 }}>This takes 30-60 seconds because it is doing live research, not guessing.</div>}
      </div>

      {/* ---------------- error ---------------- */}
      {res && !res.ok && (
        <div style={{ ...S.card, borderColor: BAD.fg }}>
          <div style={{ ...S.cardH, color: BAD.fg, marginBottom: 6 }}>That did not work</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{res.error}</div>
          {res.attempts.length > 0 && (
            <div style={{ ...S.note, marginTop: 9, fontSize: 10.5 }}>
              What was tried: {res.attempts.join(" \u2192 ")}
            </div>
          )}
          <button style={{ ...S.btnGhost, marginTop: 10 }} onClick={run}>Try again</button>
        </div>
      )}

      {/* ---------------- review ---------------- */}
      {bp && stats && (
        <>
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 320px" }}>
                <div style={S.cardH}>What we understood</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 8 }}>{bp.business_summary || "—"}</div>
                {bp.constraint_resource_label && (
                  <div style={S.note}>
                    Bottleneck identified: <strong style={{ color: V("ink", "#e6edf3") }}>{bp.constraint_resource_label}</strong>
                    {bp.constraint_reason ? " — " + bp.constraint_reason : ""}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                <Chip tone={bp.confidence === "high" ? OK : bp.confidence === "medium" ? WARN : BAD}>
                  {bp.confidence} confidence
                </Chip>
                <Chip tone={res!.stage === "web_research" ? OK : res!.stage === "template" ? BAD : WARN}>
                  {res!.stage === "web_research" ? "Web researched"
                    : res!.stage === "model_knowledge" ? "From model knowledge"
                    : res!.stage === "compact" ? "Simplified draft"
                    : "Structural starter"}
                </Chip>
              </div>
            </div>

            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 13 }}>
              <Tile label="Researched" value={String(stats.confirmed)} sub="figures we found" tone={OK.fg} />
              <Tile label="Check these" value={String(stats.needsCheck)} sub="typical, confirm them" tone={WARN.fg} />
              <Tile label="You must enter" value={String(stats.mustSupply)} sub="specific to this business" tone={BAD.fg} />
              <Tile label="Recipe lines" value={String(stats.recipeLines)} sub="drafted for you" />
            </div>
          </div>

          {/* ---- leaks: the consulting value ---- */}
          {bp.leaks.length > 0 && (
            <div style={S.card}>
              <div style={S.cardH}>Where this kind of business usually loses money</div>
              <div style={{ ...S.note, marginBottom: 11 }}>
                These are not calculated from your data — they are known failure patterns for this industry.
                Check each one against the business.
              </div>
              {bp.leaks.map((l, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: i < bp.leaks.length - 1 ? `1px solid ${V("faint", "#16202c")}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{l.title}</div>
                    {l.typical_size && <Chip tone={WARN}>{l.typical_size}</Chip>}
                  </div>
                  <div style={{ ...S.note, marginTop: 4 }}>{l.what_happens}</div>
                  {l.how_to_spot_it && (
                    <div style={{ ...S.note, marginTop: 4, color: V("accent", "#4ADE80") }}>
                      How to check: {l.how_to_spot_it}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ---- checklist ---- */}
          {bp.checklist.length > 0 && (
            <div style={S.card}>
              <div style={S.cardH}>What you need to find out</div>
              <div style={{ ...S.note, marginBottom: 11 }}>
                Everything else is drafted. These are the answers only the business can give you — take this list to them.
              </div>
              {bp.checklist.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < bp.checklist.length - 1 ? `1px solid ${V("faint", "#16202c")}` : "none" }}>
                  <div style={{ paddingTop: 2 }}>
                    <Chip tone={c.priority === "critical" ? BAD : c.priority === "important" ? WARN : NEU}>
                      {c.priority === "nice_to_have" ? "optional" : c.priority}
                    </Chip>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.question}</div>
                    <div style={{ ...S.note, marginTop: 3 }}>{c.why_it_matters}{c.field_hint ? ` · Goes in: ${c.field_hint}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ---- inputs ---- */}
          {bp.resources.length > 0 && (
            <div style={S.card}>
              <div style={S.cardH}>Inputs we drafted ({bp.resources.length - skipR.size} of {bp.resources.length} selected)</div>
              <div style={S.scroll}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={{ ...S.th, width: 34 }}>Use</th>
                    <th style={S.th}>Input</th>
                    <th style={{ ...S.th, width: 90 }}>Type</th>
                    <th style={{ ...S.th, width: 130, textAlign: "right" }}>Price</th>
                    <th style={{ ...S.th, width: 78, textAlign: "right" }}>Usable</th>
                    <th style={{ ...S.th, width: 105 }}>Status</th>
                  </tr></thead>
                  <tbody>
                    {bp.resources.map((r) => {
                      const off = skipR.has(r.name);
                      return (
                        <tr key={r.name} style={{ opacity: off ? 0.35 : 1 }}>
                          <td style={S.td}><input type="checkbox" checked={!off} onChange={() => toggle(skipR, r.name, setSkipR)} /></td>
                          <td style={S.td}>
                            <div style={{ fontWeight: 600 }}>{r.name}</div>
                            {r.price_basis && <div style={{ fontSize: 9.5, color: V("muted", "#8b98a5") }}>{r.price_basis}</div>}
                          </td>
                          <td style={{ ...S.td, fontSize: 10.5, color: V("muted", "#8b98a5") }}>{r.resource_class.toLowerCase()}</td>
                          <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>
                            {M(r.purchase_price)} <span style={{ color: V("muted", "#8b98a5"), fontSize: 10 }}>/ {r.purchase_qty} {r.purchase_uom}</span>
                          </td>
                          <td style={{ ...S.td, textAlign: "right" }}>
                            <div style={{ fontWeight: 600 }}>{r.effective_yield_pct}%</div>
                            {r.yield_reason && <div style={{ fontSize: 9, color: V("muted", "#8b98a5"), maxWidth: 150 }}>{r.yield_reason}</div>}
                          </td>
                          <td style={S.td}><Chip tone={VERIFY_STYLE[r.verify].tone}>{VERIFY_STYLE[r.verify].label}</Chip></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- products + recipes ---- */}
          {bp.offerings.length > 0 && (
            <div style={S.card}>
              <div style={S.cardH}>Products and recipes we drafted</div>
              {bp.offerings.map((o) => {
                const off = skipO.has(o.name);
                return (
                  <div key={o.name} style={{ opacity: off ? 0.35 : 1, padding: "10px 0", borderBottom: `1px solid ${V("faint", "#16202c")}` }}>
                    <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="checkbox" checked={!off} onChange={() => toggle(skipO, o.name, setSkipO)} />
                      <strong style={{ fontSize: 12.5 }}>{o.name}</strong>
                      <span style={{ fontSize: 10.5, color: V("muted", "#8b98a5") }}>per {o.output_uom}</span>
                      <Chip tone={VERIFY_STYLE[o.verify].tone}>
                        {o.list_price > 0 ? `${M(o.list_price)} · ${VERIFY_STYLE[o.verify].label}` : "Price needed"}
                      </Chip>
                      {o.constraint_minutes_per_unit ? (
                        <span style={{ fontSize: 10, color: V("muted", "#8b98a5") }}>{o.constraint_minutes_per_unit} bottleneck-min</span>
                      ) : null}
                    </div>
                    {o.recipe.length > 0 ? (
                      <div style={{ marginTop: 6, paddingLeft: 24 }}>
                        {o.recipe.map((l, j) => (
                          <div key={j} style={{ fontSize: 11, color: V("muted", "#8b98a5"), padding: "2px 0" }}>
                            <span style={{ color: V("ink", "#e6edf3") }}>{l.qty_per_unit} {l.uom}</span> {l.resource_name}
                            {l.process_scrap_pct > 0 ? ` · ${l.process_scrap_pct}% waste` : ""}
                            {l.basis ? ` — ${l.basis}` : ""}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ ...S.note, marginTop: 5, paddingLeft: 24, color: WARN.fg }}>No recipe drafted — you will need to add its inputs.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- channels + fixed costs ---- */}
          {(bp.channels.length > 0 || bp.cost_pools.length > 0) && (
            <div style={S.card}>
              <div style={S.cardH}>Sales channels and fixed costs</div>
              <div style={S.scroll}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={{ ...S.th, width: 34 }}>Use</th>
                    <th style={S.th}>Item</th>
                    <th style={{ ...S.th, width: 200 }}>Detail</th>
                    <th style={{ ...S.th, width: 105 }}>Status</th>
                  </tr></thead>
                  <tbody>
                    {bp.channels.map((c) => {
                      const off = skipC.has(c.name);
                      const drag = c.commission_pct + c.discount_pct + c.ad_spend_pct + c.payment_gateway_pct + c.returns_pct;
                      return (
                        <tr key={"ch" + c.name} style={{ opacity: off ? 0.35 : 1 }}>
                          <td style={S.td}><input type="checkbox" checked={!off} onChange={() => toggle(skipC, c.name, setSkipC)} /></td>
                          <td style={S.td}>
                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                            {c.basis && <div style={{ fontSize: 9.5, color: V("muted", "#8b98a5") }}>{c.basis}</div>}
                          </td>
                          <td style={{ ...S.td, fontSize: 10.5 }}>
                            <span style={{ color: drag > 25 ? BAD.fg : drag > 12 ? WARN.fg : V("muted", "#8b98a5"), fontWeight: 700 }}>{drag.toFixed(1)}% drag</span>
                            <span style={{ color: V("muted", "#8b98a5") }}>
                              {c.commission_pct ? ` · ${c.commission_pct}% commission` : ""}
                              {c.discount_pct ? ` · ${c.discount_pct}% discount` : ""}
                            </span>
                          </td>
                          <td style={S.td}><Chip tone={VERIFY_STYLE[c.verify].tone}>{VERIFY_STYLE[c.verify].label}</Chip></td>
                        </tr>
                      );
                    })}
                    {bp.cost_pools.map((p) => {
                      const off = skipP.has(p.name);
                      return (
                        <tr key={"cp" + p.name} style={{ opacity: off ? 0.35 : 1 }}>
                          <td style={S.td}><input type="checkbox" checked={!off} onChange={() => toggle(skipP, p.name, setSkipP)} /></td>
                          <td style={S.td}>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            {p.basis && <div style={{ fontSize: 9.5, color: V("muted", "#8b98a5") }}>{p.basis}</div>}
                          </td>
                          <td style={{ ...S.td, fontSize: 10.5 }}>{M(p.amount)} / {p.period}</td>
                          <td style={S.td}><Chip tone={VERIFY_STYLE[p.verify].tone}>{VERIFY_STYLE[p.verify].label}</Chip></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- diagnostic: always visible when the AI did not fully succeed ---- */}
          {res!.stage !== "web_research" && res!.attempts.length > 0 && (
            <div style={{ ...S.card, borderColor: res!.stage === "template" ? BAD.fg : WARN.fg }}>
              <div style={{ ...S.cardH, color: res!.stage === "template" ? BAD.fg : WARN.fg, marginBottom: 6 }}>
                {res!.stage === "template" ? "The AI did not respond - here is exactly what happened" : "The AI partly succeeded - what was tried"}
              </div>
              <div style={{ ...S.note, marginBottom: 9 }}>
                {res!.stage === "template"
                  ? "Every attempt failed, so the model above was built without AI. The reason is below - send it to support and it can be fixed at source."
                  : "An earlier attempt failed and a later one succeeded. Figures are usable but less current."}
              </div>
              <div style={{ background: V("bg", "#070c18"), border: `1px solid ${V("border", "#1e2a38")}`,
                            borderRadius: 5, padding: 10, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
                            fontSize: 10.5, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word",
                            maxHeight: 220, overflowY: "auto" }}>
                {res!.attempts.map((a, i) => `${i + 1}. ${a}`).join("\n")}
              </div>
              <button style={{ ...S.btnGhost, marginTop: 9 }}
                onClick={() => {
                  const txt = "OrchestrIQ Cost Architecture diagnostic\nStage: " + res!.stage +
                    "\nLast reply length: " + res!.rawLength + " chars\n\n" +
                    res!.attempts.map((a, i) => `${i + 1}. ${a}`).join("\n");
                  try {
                    const nav: any = navigator;
                    if (nav?.clipboard?.writeText) { nav.clipboard.writeText(txt); }
                    else {
                      const ta = document.createElement("textarea");
                      ta.value = txt; document.body.appendChild(ta); ta.select();
                      document.execCommand("copy"); document.body.removeChild(ta);
                    }
                  } catch { /* clipboard blocked - the text is on screen anyway */ }
                }}>
                Copy diagnostic
              </button>
            </div>
          )}

          {/* ---- honesty ---- */}
          {(bp.warnings.length > 0 || bp.research_notes || bp.sources.length > 0) && (
            <div style={S.card}>
              <div style={S.cardH}>What to be careful about</div>
              {bp.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 11.5, marginBottom: 5, color: WARN.fg, lineHeight: 1.55 }}>• {w}</div>
              ))}
              {bp.research_notes && <div style={{ ...S.note, marginTop: 8 }}>{bp.research_notes}</div>}
              {bp.sources.length > 0 && (
                <div style={{ ...S.note, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${V("faint", "#16202c")}` }}>
                  <strong style={{ color: V("ink", "#e6edf3") }}>Sources used:</strong> {bp.sources.join(" · ")}
                </div>
              )}
            </div>
          )}

          {/* ---- apply ---- */}
          <div style={{ ...S.card, borderColor: V("accent", "#4ADE80") }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 300px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  {applied ? "Draft applied" : "Add this draft to your model"}
                </div>
                <div style={S.note}>
                  {applied
                    ? "Now go to What you sell and correct anything marked \u201CYou must enter\u201D. Diagnostics update as you type."
                    : "Nothing is saved until you press this. Uncheck anything above that does not apply. You can edit every figure afterwards."}
                </div>
              </div>
              <button
                style={{ ...S.btn, opacity: applied ? 0.5 : 1 }}
                disabled={applied}
                onClick={async () => {
                  const ok = await applyBlueprint(bp, { resources: skipR, offerings: skipO, channels: skipC, costPools: skipP });
                  if (ok) setApplied(true);
                }}>
                {applied ? "Applied" : "Apply draft"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};
