/* ============================================================================
 * OrchestrIQ :: CostEngine.ts
 * Universal, industry-agnostic unit economics + cost diagnostic engine.
 *
 * PURE FUNCTIONS ONLY. No React. No Supabase client. No side effects.
 * Nothing imports this yet - it cannot affect the running app.
 *
 * Mirrors Supabase tables: ca_business_context, ca_resources, ca_offerings,
 * ca_bom_lines, ca_cost_pools, ca_channels, ca_offering_channels,
 * ca_benchmarks, ca_price_history, ca_scenarios
 * ========================================================================== */

/* ----------------------------------------------------------------------------
 * 1. TYPES
 * -------------------------------------------------------------------------- */

export type ResourceClass =
  | "MATERIAL" | "LABOUR" | "EQUIPMENT" | "SUBCONTRACT" | "DIGITAL"
  | "FACILITY" | "ENERGY" | "LOGISTICS" | "PACKAGING" | "OTHER";

export type OfferingType =
  | "UNIT" | "BATCH" | "PROJECT" | "BILLABLE_HOUR"
  | "SUBSCRIPTION" | "TRANSACTION" | "SUB_ASSEMBLY";

export type AllocationBasis =
  | "units" | "revenue" | "labour_hours" | "machine_hours"
  | "constraint_hours" | "headcount" | "direct_cost" | "equal";

export type AppliesPer = "UNIT" | "BATCH" | "PROJECT";
export type Confidence = "low" | "medium" | "high";

export interface CaBusinessContext {
  id?: string;
  user_id?: string;
  business_name?: string | null;
  industry_code?: string | null;
  industry_label?: string | null;
  business_archetype?: string | null;
  geography?: string | null;
  currency?: string | null;
  uom_system?: string | null;
  fiscal_year_start_month?: number | null;
  reporting_period?: string | null;
  constraint_resource_label?: string | null;
  constraint_capacity_per_period?: number | null;
  constraint_uom?: string | null;
  maturity_stage?: string | null;
}

export interface CaResource {
  id: string;
  user_id?: string;
  name: string;
  code?: string | null;
  resource_class: ResourceClass;
  category?: string | null;
  purchase_uom?: string | null;
  purchase_qty?: number | null;
  purchase_price?: number | null;
  freight_cost?: number | null;
  duty_cost?: number | null;
  other_landed_cost?: number | null;
  input_tax_credit?: number | null;
  base_uom?: string | null;
  conversion_factor?: number | null;
  effective_yield_pct?: number | null;
  yield_basis_label?: string | null;
  is_variable?: boolean | null;
  is_bottleneck?: boolean | null;
  supplier_name?: string | null;
  supplier_spend_share_pct?: number | null;
  moq?: number | null;
  lead_time_days?: number | null;
  payment_terms_days?: number | null;
  price_date?: string | null;
  index_ref?: string | null;
  index_sensitivity_pct?: number | null;
  quality_grade?: string | null;
  is_substitutable?: boolean | null;
  substitute_notes?: string | null;
  scrap_recovery_value?: number | null;
  notes?: string | null;
  effective_cost_per_base_unit?: number | null;
}

export interface CaOffering {
  id: string;
  user_id?: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  offering_type: OfferingType;
  output_uom?: string | null;
  batch_size?: number | null;
  list_price?: number | null;
  monthly_volume?: number | null;
  constraint_minutes_per_unit?: number | null;
  churn_rate_monthly_pct?: number | null;
  expected_lifetime_months?: number | null;
  cac?: number | null;
  lifecycle_stage?: string | null;
  is_active?: boolean | null;
  target_margin_pct?: number | null;
  notes?: string | null;
}

export interface CaBomLine {
  id: string;
  user_id?: string;
  offering_id: string;
  child_type: "RESOURCE" | "OFFERING";
  child_resource_id?: string | null;
  child_offering_id?: string | null;
  qty_per_unit?: number | null;
  uom?: string | null;
  process_scrap_pct?: number | null;
  applies_per?: AppliesPer | null;
  step_name?: string | null;
  sequence?: number | null;
  is_optional?: boolean | null;
  notes?: string | null;
}

export interface CaCostPool {
  id: string;
  user_id?: string;
  name: string;
  category?: string | null;
  amount?: number | null;
  period?: string | null;
  allocation_basis?: AllocationBasis | null;
  is_avoidable?: boolean | null;
  step_fixed_threshold?: number | null;
  notes?: string | null;
}

export interface CaChannel {
  id: string;
  user_id?: string;
  name: string;
  channel_type?: string | null;
  discount_pct?: number | null;
  commission_pct?: number | null;
  payment_gateway_pct?: number | null;
  ad_spend_pct?: number | null;
  packaging_cost?: number | null;
  fulfilment_cost?: number | null;
  delivery_subsidy?: number | null;
  returns_pct?: number | null;
  gst_pct?: number | null;
  payment_terms_days?: number | null;
  notes?: string | null;
}

export interface CaOfferingChannel {
  id: string;
  user_id?: string;
  offering_id: string;
  channel_id: string;
  list_price_override?: number | null;
  volume_share_pct?: number | null;
}

export interface CaBenchmark {
  id: string;
  business_archetype?: string | null;
  industry_code?: string | null;
  industry_label?: string | null;
  geography?: string | null;
  metric_key: string;
  metric_label?: string | null;
  low_value?: number | null;
  mid_value?: number | null;
  high_value?: number | null;
  unit?: string | null;
  direction?: "lower_better" | "higher_better" | "range" | null;
  source_name?: string | null;
  source_url?: string | null;
  as_of_date?: string | null;
  confidence?: Confidence | null;
  notes?: string | null;
}

/** Everything the engine needs, loaded once. */
export interface CostWorkspace {
  context: CaBusinessContext | null;
  resources: CaResource[];
  offerings: CaOffering[];
  bomLines: CaBomLine[];
  costPools: CaCostPool[];
  channels: CaChannel[];
  offeringChannels: CaOfferingChannel[];
  benchmarks: CaBenchmark[];
}

/* ---- OUTPUT SHAPES ------------------------------------------------------- */

export interface CostLine {
  sourceId: string;
  sourceType: "RESOURCE" | "OFFERING";
  label: string;
  resourceClass: ResourceClass | "COMPOSITE";
  qtyPerUnit: number;
  uom: string;
  unitCost: number;
  lineCost: number;
  sharePct: number;
  supplier?: string | null;
  indexRef?: string | null;
  yieldPct?: number | null;
  substitutable?: boolean;
  depth: number;
}

export interface ClassBreakdown {
  resourceClass: ResourceClass | "COMPOSITE";
  cost: number;
  sharePct: number;
}

export interface ChannelEconomics {
  channelId: string;
  channelName: string;
  channelType: string;
  grossPrice: number;
  netRealisation: number;
  leakagePerUnit: number;
  leakagePct: number;
  contributionPerUnit: number;
  contributionMarginPct: number;
  fullyLoadedProfitPerUnit: number;
  volumeSharePct: number;
  isLossMaking: boolean;
}

export interface OfferingEconomics {
  offeringId: string;
  name: string;
  sku: string | null;
  offeringType: OfferingType;
  outputUom: string;
  monthlyVolume: number;

  costLines: CostLine[];
  classBreakdown: ClassBreakdown[];

  materialCostPerUnit: number;
  labourCostPerUnit: number;
  otherVariableCostPerUnit: number;
  marginalCostPerUnit: number;
  allocatedOverheadPerUnit: number;
  fullyLoadedCostPerUnit: number;

  listPrice: number;
  blendedNetRealisation: number;
  contributionPerUnit: number;
  contributionMarginPct: number;
  fullyLoadedMarginPct: number;

  monthlyRevenue: number;
  monthlyContribution: number;

  constraintMinutesPerUnit: number | null;
  contributionPerConstraintMinute: number | null;

  channelEconomics: ChannelEconomics[];
  paretoTop3SharePct: number;
  paretoTop3Labels: string[];

  ltv: number | null;
  ltvCacRatio: number | null;
  cacPaybackMonths: number | null;

  breakevenUnitsStandalone: number | null;
  isLossMaking: boolean;
  dataQuality: DataQualityFlag[];
}

export interface DataQualityFlag {
  severity: "info" | "warning" | "critical";
  field: string;
  message: string;
}

export interface BenchmarkCheck {
  metricKey: string;
  metricLabel: string;
  actual: number;
  unit: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  direction: string;
  status: "better" | "in_range" | "worse" | "no_benchmark";
  variancePct: number | null;
  source: string | null;
  asOf: string | null;
  confidence: Confidence;
  benchmarkScope: "archetype" | "cross_industry" | "none";
}

export type Lever =
  | "YIELD_RECOVERY" | "SUBSTITUTION" | "DE_SPECIFICATION" | "BATCH_ECONOMICS"
  | "SUPPLIER_LEVERAGE" | "MAKE_VS_BUY" | "CHANNEL_MIX" | "PRICE_ARCHITECTURE"
  | "OVERHEAD_REDUCTION" | "CONSTRAINT_REALLOCATION" | "PORTFOLIO_PRUNING";

export interface Opportunity {
  lever: Lever;
  title: string;
  rationale: string;
  affectedItems: string[];
  currentValue: number;
  targetValue: number;
  annualImpact: number;
  difficulty: "low" | "medium" | "high";
  timeToImpactWeeks: number;
  confidence: Confidence;
  evidence: string[];
}

export interface PortfolioDiagnosis {
  currency: string;
  archetype: string | null;
  offerings: OfferingEconomics[];

  monthlyRevenue: number;
  monthlyVariableCost: number;
  monthlyContribution: number;
  monthlyFixedCost: number;
  monthlyOperatingProfit: number;

  contributionMarginPct: number;
  operatingMarginPct: number;
  breakevenRevenue: number;
  breakevenUnitsBlended: number;
  marginOfSafetyPct: number;

  spendByClass: ClassBreakdown[];
  topResourcesBySpend: Array<{
    resourceId: string; name: string; resourceClass: ResourceClass;
    annualSpend: number; sharePct: number; supplier: string | null;
    yieldPct: number; indexRef: string | null;
  }>;
  supplierConcentration: Array<{ supplier: string; annualSpend: number; sharePct: number }>;

  benchmarkChecks: BenchmarkCheck[];
  opportunities: Opportunity[];
  totalAnnualOpportunity: number;

  dataQuality: DataQualityFlag[];
  completenessScore: number;
  confidenceScore: number;
}

/* ----------------------------------------------------------------------------
 * 2. SAFE MATH HELPERS
 * -------------------------------------------------------------------------- */

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export function safeDiv(a: number, b: number, fallback = 0): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return fallback;
  const r = a / b;
  return Number.isFinite(r) ? r : fallback;
}

export function round(v: number, dp = 2): number {
  if (!Number.isFinite(v)) return 0;
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

function pct(part: number, whole: number): number {
  return round(safeDiv(part, whole) * 100, 2);
}

/** Normalise any cost-pool period to a monthly figure. */
export function toMonthly(amount: number, period?: string | null): number {
  const p = (period || "monthly").toLowerCase();
  if (p === "annual" || p === "yearly") return amount / 12;
  if (p === "quarterly") return amount / 3;
  if (p === "weekly") return (amount * 52) / 12;
  if (p === "daily") return (amount * 365) / 12;
  return amount;
}

/* ----------------------------------------------------------------------------
 * 3. RESOURCE COSTING
 * The single universal formula. Works for material, labour, equipment,
 * software, facility, energy - every class, every industry.
 * -------------------------------------------------------------------------- */

export function effectiveCostPerBaseUnit(r: CaResource): number {
  if (r.effective_cost_per_base_unit != null && Number.isFinite(Number(r.effective_cost_per_base_unit))) {
    return num(r.effective_cost_per_base_unit);
  }
  const landed =
    num(r.purchase_price) + num(r.freight_cost) + num(r.duty_cost) +
    num(r.other_landed_cost) - num(r.input_tax_credit) - num(r.scrap_recovery_value);
  const yieldPct = num(r.effective_yield_pct, 100);
  const denom = num(r.purchase_qty, 1) * num(r.conversion_factor, 1) * (yieldPct / 100);
  return safeDiv(landed, denom);
}

/** Naive cost ignoring yield - used to quantify the hidden loss. */
export function naiveCostPerBaseUnit(r: CaResource): number {
  const landed =
    num(r.purchase_price) + num(r.freight_cost) + num(r.duty_cost) +
    num(r.other_landed_cost) - num(r.input_tax_credit) - num(r.scrap_recovery_value);
  return safeDiv(landed, num(r.purchase_qty, 1) * num(r.conversion_factor, 1));
}

/** Human label for the yield field, by resource class. */
export function yieldLabel(cls: ResourceClass, override?: string | null): string {
  if (override) return override;
  switch (cls) {
    case "MATERIAL":  return "Usable yield after waste";
    case "PACKAGING": return "Usable yield after waste";
    case "LABOUR":    return "Billable / productive utilisation";
    case "EQUIPMENT": return "Availability x performance (OEE)";
    case "DIGITAL":   return "Seat / licence utilisation";
    case "FACILITY":  return "Occupancy";
    case "ENERGY":    return "Conversion efficiency";
    case "LOGISTICS": return "Load factor";
    default:          return "Effective utilisation";
  }
}

/* ----------------------------------------------------------------------------
 * 4. BOM ROLL-UP  (recursive, cycle-safe)
 * -------------------------------------------------------------------------- */

interface RollUpResult {
  lines: CostLine[];
  total: number;
  cycleDetected: boolean;
  cyclePath: string[];
}

function rollUp(
  offeringId: string,
  ws: CostWorkspace,
  resIdx: Map<string, CaResource>,
  offIdx: Map<string, CaOffering>,
  bomIdx: Map<string, CaBomLine[]>,
  visiting: Set<string>,
  memo: Map<string, RollUpResult>,
  depth: number
): RollUpResult {
  const cached = memo.get(offeringId);
  if (cached && depth === 0) return cached;

  if (visiting.has(offeringId)) {
    const off = offIdx.get(offeringId);
    return {
      lines: [], total: 0, cycleDetected: true,
      cyclePath: [...Array.from(visiting), off?.name || offeringId],
    };
  }
  if (depth > 12) {
    return { lines: [], total: 0, cycleDetected: true, cyclePath: ["depth limit exceeded"] };
  }

  visiting.add(offeringId);
  const offering = offIdx.get(offeringId);
  const batchSize = Math.max(1, num(offering?.batch_size, 1));
  const lines: CostLine[] = [];
  let total = 0;
  let cycleDetected = false;
  let cyclePath: string[] = [];

  const children = bomIdx.get(offeringId) || [];
  for (const bl of children) {
    if (bl.is_optional) continue;

    let qty = num(bl.qty_per_unit);
    const scrap = Math.min(99.9, Math.max(0, num(bl.process_scrap_pct)));
    if (scrap > 0) qty = safeDiv(qty, 1 - scrap / 100, qty);

    const appliesPer = (bl.applies_per || "UNIT") as AppliesPer;
    if (appliesPer === "BATCH" || appliesPer === "PROJECT") qty = safeDiv(qty, batchSize, qty);

    if (bl.child_type === "RESOURCE" && bl.child_resource_id) {
      const r = resIdx.get(bl.child_resource_id);
      if (!r) continue;
      const unitCost = effectiveCostPerBaseUnit(r);
      const lineCost = qty * unitCost;
      total += lineCost;
      lines.push({
        sourceId: r.id, sourceType: "RESOURCE", label: r.name,
        resourceClass: r.resource_class, qtyPerUnit: round(qty, 6),
        uom: bl.uom || r.base_uom || "unit", unitCost: round(unitCost, 4),
        lineCost: round(lineCost, 4), sharePct: 0,
        supplier: r.supplier_name ?? null, indexRef: r.index_ref ?? null,
        yieldPct: num(r.effective_yield_pct, 100),
        substitutable: !!r.is_substitutable, depth,
      });
    } else if (bl.child_type === "OFFERING" && bl.child_offering_id) {
      const child = offIdx.get(bl.child_offering_id);
      if (!child) continue;
      const sub = rollUp(bl.child_offering_id, ws, resIdx, offIdx, bomIdx, visiting, memo, depth + 1);
      if (sub.cycleDetected) { cycleDetected = true; cyclePath = sub.cyclePath; }
      const unitCost = sub.total;
      const lineCost = qty * unitCost;
      total += lineCost;
      lines.push({
        sourceId: child.id, sourceType: "OFFERING", label: child.name,
        resourceClass: "COMPOSITE", qtyPerUnit: round(qty, 6),
        uom: bl.uom || child.output_uom || "unit", unitCost: round(unitCost, 4),
        lineCost: round(lineCost, 4), sharePct: 0, depth,
      });
      for (const sl of sub.lines) {
        lines.push({ ...sl, qtyPerUnit: round(sl.qtyPerUnit * qty, 6),
          lineCost: round(sl.lineCost * qty, 4), depth: sl.depth + 1 });
      }
    }
  }

  visiting.delete(offeringId);
  for (const l of lines) l.sharePct = pct(l.lineCost, total);
  const result: RollUpResult = { lines, total: round(total, 4), cycleDetected, cyclePath };
  if (depth === 0) memo.set(offeringId, result);
  return result;
}

/** Leaf-level lines only (composites removed) - for Pareto and spend analysis. */
function leafLines(lines: CostLine[]): CostLine[] {
  return lines.filter((l) => l.sourceType === "RESOURCE");
}

/* ----------------------------------------------------------------------------
 * 5. OVERHEAD ABSORPTION
 * -------------------------------------------------------------------------- */

interface AllocationInputs {
  offeringId: string;
  volume: number;
  revenue: number;
  directCost: number;
  constraintMinutes: number;
  labourMinutes: number;
  machineMinutes: number;
}

function allocateOverhead(
  pools: CaCostPool[],
  inputs: AllocationInputs[],
  target: string
): number {
  const me = inputs.find((i) => i.offeringId === target);
  if (!me) return 0;

  const totals = {
    units: inputs.reduce((s, i) => s + i.volume, 0),
    revenue: inputs.reduce((s, i) => s + i.revenue, 0),
    direct_cost: inputs.reduce((s, i) => s + i.directCost, 0),
    constraint_hours: inputs.reduce((s, i) => s + i.constraintMinutes, 0),
    labour_hours: inputs.reduce((s, i) => s + i.labourMinutes, 0),
    machine_hours: inputs.reduce((s, i) => s + i.machineMinutes, 0),
    headcount: inputs.length,
    equal: inputs.length,
  };

  let allocated = 0;
  for (const p of pools) {
    const monthly = toMonthly(num(p.amount), p.period);
    const basis = (p.allocation_basis || "revenue") as AllocationBasis;
    let share = 0;
    switch (basis) {
      case "units":            share = safeDiv(me.volume, totals.units); break;
      case "revenue":          share = safeDiv(me.revenue, totals.revenue); break;
      case "direct_cost":      share = safeDiv(me.directCost, totals.direct_cost); break;
      case "constraint_hours": share = safeDiv(me.constraintMinutes, totals.constraint_hours); break;
      case "labour_hours":     share = safeDiv(me.labourMinutes, totals.labour_hours); break;
      case "machine_hours":    share = safeDiv(me.machineMinutes, totals.machine_hours); break;
      case "headcount":
      case "equal":            share = safeDiv(1, totals.equal); break;
      default:                 share = safeDiv(me.revenue, totals.revenue);
    }
    allocated += monthly * share;
  }
  return allocated;
}

/* ----------------------------------------------------------------------------
 * 6. NET REALISATION
 * List price is fiction. This is what actually reaches the bank.
 * -------------------------------------------------------------------------- */

export function netRealisation(grossPrice: number, ch: CaChannel): number {
  const gst = num(ch.gst_pct);
  const exGst = gst > 0 ? safeDiv(grossPrice, 1 + gst / 100, grossPrice) : grossPrice;

  const deductionPct =
    num(ch.discount_pct) + num(ch.commission_pct) +
    num(ch.payment_gateway_pct) + num(ch.ad_spend_pct);

  let net = exGst * (1 - Math.min(99.9, deductionPct) / 100);
  net -= num(ch.packaging_cost) + num(ch.fulfilment_cost) + num(ch.delivery_subsidy);

  const returns = Math.min(99.9, Math.max(0, num(ch.returns_pct)));
  if (returns > 0) net = net * (1 - returns / 100);

  return round(net, 4);
}

/* ----------------------------------------------------------------------------
 * 7. BENCHMARK MATCHING
 * -------------------------------------------------------------------------- */

export function findBenchmark(
  benchmarks: CaBenchmark[],
  metricKey: string,
  archetype: string | null,
  geography = "IN"
): { bm: CaBenchmark | null; scope: "archetype" | "cross_industry" | "none" } {
  const byKey = benchmarks.filter((b) => b.metric_key === metricKey);
  if (!byKey.length) return { bm: null, scope: "none" };

  if (archetype) {
    const exact = byKey.find((b) => b.business_archetype === archetype && (b.geography === geography || !b.geography));
    if (exact) return { bm: exact, scope: "archetype" };
    const anyGeo = byKey.find((b) => b.business_archetype === archetype);
    if (anyGeo) return { bm: anyGeo, scope: "archetype" };
  }
  const generic = byKey.find((b) => !b.business_archetype);
  if (generic) return { bm: generic, scope: "cross_industry" };
  return { bm: null, scope: "none" };
}

export function checkBenchmark(
  benchmarks: CaBenchmark[],
  metricKey: string,
  metricLabel: string,
  actual: number,
  archetype: string | null,
  geography = "IN"
): BenchmarkCheck {
  const { bm, scope } = findBenchmark(benchmarks, metricKey, archetype, geography);
  if (!bm) {
    return {
      metricKey, metricLabel, actual: round(actual, 2), unit: "%",
      low: null, mid: null, high: null, direction: "range",
      status: "no_benchmark", variancePct: null, source: null, asOf: null,
      confidence: "low", benchmarkScope: "none",
    };
  }

  const low = bm.low_value != null ? num(bm.low_value) : null;
  const mid = bm.mid_value != null ? num(bm.mid_value) : null;
  const high = bm.high_value != null ? num(bm.high_value) : null;
  const dir = bm.direction || "range";

  let status: BenchmarkCheck["status"] = "in_range";
  if (dir === "lower_better") {
    if (low != null && actual < low) status = "better";
    else if (high != null && actual > high) status = "worse";
  } else if (dir === "higher_better") {
    if (high != null && actual > high) status = "better";
    else if (low != null && actual < low) status = "worse";
  } else {
    if (low != null && high != null && (actual < low || actual > high)) status = "worse";
  }

  const variancePct = mid != null && mid !== 0 ? round(((actual - mid) / mid) * 100, 1) : null;

  return {
    metricKey, metricLabel: bm.metric_label || metricLabel,
    actual: round(actual, 2), unit: bm.unit || "%",
    low, mid, high, direction: dir, status, variancePct,
    source: bm.source_name ?? null, asOf: bm.as_of_date ?? null,
    confidence: (bm.confidence || "medium") as Confidence,
    benchmarkScope: scope,
  };
}

/* ----------------------------------------------------------------------------
 * 8. PER-OFFERING ECONOMICS
 * -------------------------------------------------------------------------- */

function buildIndexes(ws: CostWorkspace) {
  const resIdx = new Map<string, CaResource>();
  ws.resources.forEach((r) => resIdx.set(r.id, r));
  const offIdx = new Map<string, CaOffering>();
  ws.offerings.forEach((o) => offIdx.set(o.id, o));
  const bomIdx = new Map<string, CaBomLine[]>();
  ws.bomLines.forEach((b) => {
    const arr = bomIdx.get(b.offering_id) || [];
    arr.push(b);
    bomIdx.set(b.offering_id, arr);
  });
  bomIdx.forEach((arr) => arr.sort((a, b) => num(a.sequence) - num(b.sequence)));
  const chIdx = new Map<string, CaChannel>();
  ws.channels.forEach((c) => chIdx.set(c.id, c));
  return { resIdx, offIdx, bomIdx, chIdx };
}

export function computeOffering(
  offeringId: string,
  ws: CostWorkspace,
  overheadPerUnitOverride?: number
): OfferingEconomics | null {
  const { resIdx, offIdx, bomIdx, chIdx } = buildIndexes(ws);
  const off = offIdx.get(offeringId);
  if (!off) return null;

  const roll = rollUp(offeringId, ws, resIdx, offIdx, bomIdx, new Set(), new Map(), 0);
  const leaves = leafLines(roll.lines);
  const flags: DataQualityFlag[] = [];

  if (roll.cycleDetected) {
    flags.push({ severity: "critical", field: "bom",
      message: `Circular recipe detected (${roll.cyclePath.join(" -> ")}). Costs for this item are incomplete.` });
  }
  if (!roll.lines.length) {
    flags.push({ severity: "critical", field: "bom",
      message: "No recipe lines defined - unit cost cannot be calculated." });
  }

  const classTotals = new Map<string, number>();
  for (const l of leaves) classTotals.set(l.resourceClass, (classTotals.get(l.resourceClass) || 0) + l.lineCost);

  const marginalCost = round(leaves.reduce((s, l) => s + l.lineCost, 0), 4);
  const materialCost = round((classTotals.get("MATERIAL") || 0) + (classTotals.get("PACKAGING") || 0), 4);
  const labourCost = round(classTotals.get("LABOUR") || 0, 4);
  const otherVariable = round(marginalCost - materialCost - labourCost, 4);

  const listPrice = num(off.list_price);
  const volume = num(off.monthly_volume);

  // Channels
  const links = ws.offeringChannels.filter((oc) => oc.offering_id === offeringId);
  const channelEcon: ChannelEconomics[] = [];
  for (const link of links) {
    const ch = chIdx.get(link.channel_id);
    if (!ch) continue;
    const gross = link.list_price_override != null ? num(link.list_price_override) : listPrice;
    const net = netRealisation(gross, ch);
    const contrib = net - marginalCost;
    channelEcon.push({
      channelId: ch.id, channelName: ch.name, channelType: ch.channel_type || "direct",
      grossPrice: round(gross, 2), netRealisation: round(net, 2),
      leakagePerUnit: round(gross - net, 2), leakagePct: pct(gross - net, gross),
      contributionPerUnit: round(contrib, 2), contributionMarginPct: pct(contrib, net),
      fullyLoadedProfitPerUnit: 0,
      volumeSharePct: num(link.volume_share_pct), isLossMaking: contrib < 0,
    });
  }

  const shareSum = channelEcon.reduce((s, c) => s + c.volumeSharePct, 0);
  let blendedNet = listPrice;
  if (channelEcon.length && shareSum > 0) {
    blendedNet = round(channelEcon.reduce((s, c) => s + c.netRealisation * (c.volumeSharePct / shareSum), 0), 4);
  } else if (channelEcon.length) {
    blendedNet = round(channelEcon.reduce((s, c) => s + c.netRealisation, 0) / channelEcon.length, 4);
    flags.push({ severity: "warning", field: "volume_share_pct",
      message: "Channel volume split not set - using a simple average across channels." });
  } else if (listPrice > 0) {
    flags.push({ severity: "info", field: "channels",
      message: "No sales channel attached - list price treated as net realisation." });
  }

  // Overhead
  const overheadPerUnit = overheadPerUnitOverride != null
    ? overheadPerUnitOverride
    : round(safeDiv(allocateOverhead(ws.costPools, [{
        offeringId, volume, revenue: blendedNet * volume,
        directCost: marginalCost * volume,
        constraintMinutes: num(off.constraint_minutes_per_unit) * volume,
        labourMinutes: 0, machineMinutes: 0,
      }], offeringId), volume), 4);

  const fullyLoaded = round(marginalCost + overheadPerUnit, 4);
  const contribution = round(blendedNet - marginalCost, 4);

  // Pareto
  const sorted = [...leaves].sort((a, b) => b.lineCost - a.lineCost);
  const top3 = sorted.slice(0, 3);
  const top3Share = pct(top3.reduce((s, l) => s + l.lineCost, 0), marginalCost);

  // Subscription economics
  let ltv: number | null = null, ltvCac: number | null = null, payback: number | null = null;
  if (off.offering_type === "SUBSCRIPTION") {
    const churn = num(off.churn_rate_monthly_pct);
    const lifetime = off.expected_lifetime_months != null
      ? num(off.expected_lifetime_months)
      : churn > 0 ? safeDiv(100, churn) : 0;
    if (lifetime > 0) ltv = round(contribution * lifetime, 2);
    const cac = num(off.cac);
    if (cac > 0 && ltv != null) ltvCac = round(safeDiv(ltv, cac), 2);
    if (cac > 0 && contribution > 0) payback = round(safeDiv(cac, contribution), 1);
  }

  const constraintMin = off.constraint_minutes_per_unit != null ? num(off.constraint_minutes_per_unit) : null;
  const perConstraintMin = constraintMin && constraintMin > 0 ? round(safeDiv(contribution, constraintMin), 2) : null;

  // Data quality
  if (listPrice <= 0) flags.push({ severity: "critical", field: "list_price", message: "Selling price is not set." });
  if (volume <= 0) flags.push({ severity: "warning", field: "monthly_volume", message: "Monthly volume not set - portfolio totals will understate this item." });
  if (marginalCost > 0 && listPrice > 0 && marginalCost > listPrice) {
    flags.push({ severity: "critical", field: "economics", message: "Unit cost exceeds selling price - this item loses money on every sale." });
  }
  for (const l of leaves) {
    if (l.yieldPct != null && (l.yieldPct < 40 || l.yieldPct > 100)) {
      flags.push({ severity: "warning", field: "effective_yield_pct", message: `"${l.label}" has an unusual yield of ${l.yieldPct}% - please confirm.` });
    }
  }

  return {
    offeringId, name: off.name, sku: off.sku ?? null,
    offeringType: off.offering_type, outputUom: off.output_uom || "unit",
    monthlyVolume: volume,
    costLines: roll.lines,
    classBreakdown: Array.from(classTotals.entries())
      .map(([k, v]) => ({ resourceClass: k as ResourceClass, cost: round(v, 2), sharePct: pct(v, marginalCost) }))
      .sort((a, b) => b.cost - a.cost),
    materialCostPerUnit: materialCost,
    labourCostPerUnit: labourCost,
    otherVariableCostPerUnit: otherVariable,
    marginalCostPerUnit: marginalCost,
    allocatedOverheadPerUnit: overheadPerUnit,
    fullyLoadedCostPerUnit: fullyLoaded,
    listPrice: round(listPrice, 2),
    blendedNetRealisation: round(blendedNet, 2),
    contributionPerUnit: contribution,
    contributionMarginPct: pct(contribution, blendedNet),
    fullyLoadedMarginPct: pct(blendedNet - fullyLoaded, blendedNet),
    monthlyRevenue: round(blendedNet * volume, 2),
    monthlyContribution: round(contribution * volume, 2),
    constraintMinutesPerUnit: constraintMin,
    contributionPerConstraintMinute: perConstraintMin,
    channelEconomics: channelEcon,
    paretoTop3SharePct: top3Share,
    paretoTop3Labels: top3.map((l) => l.label),
    ltv, ltvCacRatio: ltvCac, cacPaybackMonths: payback,
    breakevenUnitsStandalone: contribution > 0
      ? Math.ceil(safeDiv(ws.costPools.reduce((s, p) => s + toMonthly(num(p.amount), p.period), 0), contribution))
      : null,
    isLossMaking: contribution < 0,
    dataQuality: flags,
  };
}

/* ----------------------------------------------------------------------------
 * 9. SENSITIVITY
 * -------------------------------------------------------------------------- */

export interface SensitivityResult {
  offeringId: string;
  offeringName: string;
  driverLabel: string;
  deltaPct: number;
  baseContributionPct: number;
  newContributionPct: number;
  contributionShiftBps: number;
  baseMonthlyContribution: number;
  newMonthlyContribution: number;
  annualImpact: number;
  goesLossMaking: boolean;
}

export function sensitivity(
  ws: CostWorkspace,
  resourceId: string,
  deltaPct: number
): SensitivityResult[] {
  const shifted: CostWorkspace = {
    ...ws,
    resources: ws.resources.map((r) =>
      r.id === resourceId
        ? { ...r,
            purchase_price: num(r.purchase_price) * (1 + deltaPct / 100),
            effective_cost_per_base_unit: null }
        : r
    ),
  };
  const label = ws.resources.find((r) => r.id === resourceId)?.name || "input";
  const out: SensitivityResult[] = [];

  for (const off of ws.offerings) {
    if (off.is_active === false) continue;
    const base = computeOffering(off.id, ws);
    const next = computeOffering(off.id, shifted);
    if (!base || !next) continue;
    if (base.marginalCostPerUnit === next.marginalCostPerUnit) continue;
    out.push({
      offeringId: off.id, offeringName: off.name, driverLabel: label, deltaPct,
      baseContributionPct: base.contributionMarginPct,
      newContributionPct: next.contributionMarginPct,
      contributionShiftBps: round((next.contributionMarginPct - base.contributionMarginPct) * 100, 0),
      baseMonthlyContribution: base.monthlyContribution,
      newMonthlyContribution: next.monthlyContribution,
      annualImpact: round((next.monthlyContribution - base.monthlyContribution) * 12, 0),
      goesLossMaking: base.contributionPerUnit >= 0 && next.contributionPerUnit < 0,
    });
  }
  return out.sort((a, b) => a.annualImpact - b.annualImpact);
}

/** How much can this input rise before contribution hits zero? */
export function priceRunway(ws: CostWorkspace, offeringId: string, resourceId: string): number | null {
  const base = computeOffering(offeringId, ws);
  if (!base || base.contributionPerUnit <= 0) return null;
  const line = base.costLines.find((l) => l.sourceId === resourceId && l.sourceType === "RESOURCE");
  if (!line || line.lineCost <= 0) return null;
  return round(safeDiv(base.contributionPerUnit, line.lineCost) * 100, 1);
}

/* ----------------------------------------------------------------------------
 * 10. PORTFOLIO DIAGNOSIS + OPPORTUNITY ENGINE
 * -------------------------------------------------------------------------- */

export function diagnose(ws: CostWorkspace): PortfolioDiagnosis {
  const archetype = ws.context?.business_archetype ?? null;
  const currency = ws.context?.currency || "INR";
  const geography = ws.context?.geography || "IN";

  const active = ws.offerings.filter((o) => o.is_active !== false && o.offering_type !== "SUB_ASSEMBLY");

  // Pass 1: marginal economics (no overhead yet)
  const pass1 = active.map((o) => computeOffering(o.id, ws, 0)).filter((x): x is OfferingEconomics => !!x);

  // Pass 2: allocate overhead across the real portfolio
  const allocInputs: AllocationInputs[] = pass1.map((e) => ({
    offeringId: e.offeringId, volume: e.monthlyVolume, revenue: e.monthlyRevenue,
    directCost: e.marginalCostPerUnit * e.monthlyVolume,
    constraintMinutes: num(e.constraintMinutesPerUnit) * e.monthlyVolume,
    labourMinutes: 0, machineMinutes: 0,
  }));

  const offerings = active
    .map((o) => {
      const oh = safeDiv(allocateOverhead(ws.costPools, allocInputs, o.id), num(o.monthly_volume));
      return computeOffering(o.id, ws, round(oh, 4));
    })
    .filter((x): x is OfferingEconomics => !!x);

  for (const e of offerings) {
    for (const c of e.channelEconomics) {
      c.fullyLoadedProfitPerUnit = round(c.netRealisation - e.fullyLoadedCostPerUnit, 2);
    }
  }

  const monthlyRevenue = round(offerings.reduce((s, e) => s + e.monthlyRevenue, 0), 2);
  const monthlyVariableCost = round(offerings.reduce((s, e) => s + e.marginalCostPerUnit * e.monthlyVolume, 0), 2);
  const monthlyContribution = round(monthlyRevenue - monthlyVariableCost, 2);
  const monthlyFixedCost = round(ws.costPools.reduce((s, p) => s + toMonthly(num(p.amount), p.period), 0), 2);
  const monthlyOperatingProfit = round(monthlyContribution - monthlyFixedCost, 2);

  const cmPct = pct(monthlyContribution, monthlyRevenue);
  const breakevenRevenue = cmPct > 0 ? round(safeDiv(monthlyFixedCost, cmPct / 100), 2) : 0;
  const totalUnits = offerings.reduce((s, e) => s + e.monthlyVolume, 0);
  const blendedContribPerUnit = safeDiv(monthlyContribution, totalUnits);
  const breakevenUnits = blendedContribPerUnit > 0 ? Math.ceil(safeDiv(monthlyFixedCost, blendedContribPerUnit)) : 0;
  const marginOfSafety = monthlyRevenue > 0 && breakevenRevenue > 0
    ? pct(monthlyRevenue - breakevenRevenue, monthlyRevenue) : 0;

  // ---- Annual spend per resource
  const spendByResource = new Map<string, number>();
  for (const e of offerings) {
    for (const l of leafLines(e.costLines)) {
      spendByResource.set(l.sourceId, (spendByResource.get(l.sourceId) || 0) + l.lineCost * e.monthlyVolume * 12);
    }
  }
  const totalAnnualSpend = Array.from(spendByResource.values()).reduce((s, v) => s + v, 0);

  const topResources = Array.from(spendByResource.entries())
    .map(([id, spend]) => {
      const r = ws.resources.find((x) => x.id === id);
      return {
        resourceId: id, name: r?.name || "Unknown",
        resourceClass: (r?.resource_class || "OTHER") as ResourceClass,
        annualSpend: round(spend, 0), sharePct: pct(spend, totalAnnualSpend),
        supplier: r?.supplier_name ?? null, yieldPct: num(r?.effective_yield_pct, 100),
        indexRef: r?.index_ref ?? null,
      };
    })
    .sort((a, b) => b.annualSpend - a.annualSpend);

  const classSpend = new Map<string, number>();
  for (const t of topResources) classSpend.set(t.resourceClass, (classSpend.get(t.resourceClass) || 0) + t.annualSpend);
  const spendByClass: ClassBreakdown[] = Array.from(classSpend.entries())
    .map(([k, v]) => ({ resourceClass: k as ResourceClass, cost: round(v, 0), sharePct: pct(v, totalAnnualSpend) }))
    .sort((a, b) => b.cost - a.cost);

  const supplierMap = new Map<string, number>();
  for (const t of topResources) {
    if (!t.supplier) continue;
    supplierMap.set(t.supplier, (supplierMap.get(t.supplier) || 0) + t.annualSpend);
  }
  const supplierConcentration = Array.from(supplierMap.entries())
    .map(([supplier, spend]) => ({ supplier, annualSpend: round(spend, 0), sharePct: pct(spend, totalAnnualSpend) }))
    .sort((a, b) => b.annualSpend - a.annualSpend);

  // ---- Benchmarks
  const annualRevenue = monthlyRevenue * 12;
  const materialSpend = offerings.reduce((s, e) => s + e.materialCostPerUnit * e.monthlyVolume, 0) * 12;
  const labourSpend = offerings.reduce((s, e) => s + e.labourCostPerUnit * e.monthlyVolume, 0) * 12;

  const benchmarkChecks: BenchmarkCheck[] = [];
  const bmk = (key: string, label: string, val: number) =>
    benchmarkChecks.push(checkBenchmark(ws.benchmarks, key, label, val, archetype, geography));

  if (annualRevenue > 0) {
    bmk("material_cost_pct_revenue", "Material cost as % of revenue", pct(materialSpend, annualRevenue));
    bmk("labour_cost_pct_revenue", "Labour cost as % of revenue", pct(labourSpend, annualRevenue));
    bmk("prime_cost_pct_revenue", "Prime cost as % of revenue", pct(materialSpend + labourSpend, annualRevenue));
    bmk("gross_margin_pct", "Gross margin", pct(monthlyRevenue - monthlyVariableCost, monthlyRevenue));
    bmk("contribution_margin_pct", "Contribution margin", cmPct);
    bmk("overhead_pct_revenue", "Overhead as % of revenue", pct(monthlyFixedCost, monthlyRevenue));
    bmk("ebitda_margin_pct", "Operating margin", pct(monthlyOperatingProfit, monthlyRevenue));
  }
  if (topResources.length >= 3) {
    bmk("top3_input_concentration_pct", "Top 3 inputs as % of spend",
      topResources.slice(0, 3).reduce((s, t) => s + t.sharePct, 0));
  }
  if (supplierConcentration.length) {
    bmk("supplier_concentration_pct", "Largest supplier share of spend", supplierConcentration[0].sharePct);
  }

  const opportunities = buildOpportunities(ws, offerings, topResources, supplierConcentration,
    benchmarkChecks, monthlyRevenue, monthlyFixedCost, archetype);

  // ---- Data quality + confidence
  const dataQuality: DataQualityFlag[] = [];
  for (const e of offerings) {
    for (const f of e.dataQuality) dataQuality.push({ ...f, field: `${e.name}: ${f.field}` });
  }
  if (!ws.context) dataQuality.push({ severity: "warning", field: "business_context", message: "Industry not set - benchmarks fall back to cross-industry ranges." });
  if (!ws.costPools.length) dataQuality.push({ severity: "warning", field: "cost_pools", message: "No fixed costs entered - operating profit and breakeven are unreliable." });
  if (!ws.channels.length) dataQuality.push({ severity: "info", field: "channels", message: "No sales channels defined - commission and discount leakage is not being measured." });

  const checks = [
    !!ws.context?.business_archetype, ws.resources.length > 0, ws.offerings.length > 0,
    ws.bomLines.length > 0, ws.costPools.length > 0, ws.channels.length > 0,
    offerings.some((e) => e.monthlyVolume > 0), offerings.some((e) => e.listPrice > 0),
    ws.resources.some((r) => num(r.effective_yield_pct, 100) < 100),
    ws.resources.some((r) => !!r.supplier_name),
  ];
  const completenessScore = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const criticalCount = dataQuality.filter((d) => d.severity === "critical").length;
  const confidenceScore = Math.max(0, Math.min(100, completenessScore - criticalCount * 12));

  return {
    currency, archetype, offerings,
    monthlyRevenue, monthlyVariableCost, monthlyContribution,
    monthlyFixedCost, monthlyOperatingProfit,
    contributionMarginPct: cmPct,
    operatingMarginPct: pct(monthlyOperatingProfit, monthlyRevenue),
    breakevenRevenue, breakevenUnitsBlended: breakevenUnits,
    marginOfSafetyPct: marginOfSafety,
    spendByClass, topResourcesBySpend: topResources.slice(0, 20), supplierConcentration,
    benchmarkChecks, opportunities,
    totalAnnualOpportunity: round(opportunities.reduce((s, o) => s + o.annualImpact, 0), 0),
    dataQuality, completenessScore, confidenceScore,
  };
}

/* ---- The 8-lever opportunity engine -------------------------------------- */

function buildOpportunities(
  ws: CostWorkspace,
  offerings: OfferingEconomics[],
  topResources: PortfolioDiagnosis["topResourcesBySpend"],
  suppliers: PortfolioDiagnosis["supplierConcentration"],
  checks: BenchmarkCheck[],
  monthlyRevenue: number,
  monthlyFixedCost: number,
  archetype: string | null
): Opportunity[] {
  const ops: Opportunity[] = [];

  // L1 :: YIELD RECOVERY
  const yieldBm = findBenchmark(ws.benchmarks, "effective_yield_pct", archetype).bm;
  const targetYield = yieldBm?.mid_value != null ? num(yieldBm.mid_value) : 95;
  for (const t of topResources.slice(0, 10)) {
    if (t.yieldPct >= targetYield || t.yieldPct <= 0 || t.annualSpend <= 0) continue;
    const saving = t.annualSpend * (1 - t.yieldPct / targetYield);
    if (saving < 1000) continue;
    ops.push({
      lever: "YIELD_RECOVERY",
      title: `Raise usable yield on ${t.name} from ${t.yieldPct}% to ${targetYield}%`,
      rationale: `You pay for 100% of this input but only ${t.yieldPct}% reaches the finished product. Closing the gap to the ${targetYield}% benchmark cuts spend without any price negotiation.`,
      affectedItems: [t.name], currentValue: t.yieldPct, targetValue: targetYield,
      annualImpact: round(saving, 0), difficulty: "medium", timeToImpactWeeks: 8,
      confidence: yieldBm ? "medium" : "low",
      evidence: [
        `Annual spend on this input: ${round(t.annualSpend, 0)}`,
        `Current yield ${t.yieldPct}% vs target ${targetYield}%`,
        yieldBm?.source_name ? `Benchmark source: ${yieldBm.source_name}` : "Target is a general operating heuristic - verify",
      ],
    });
  }

  // L2 :: SUBSTITUTION
  for (const t of topResources.slice(0, 10)) {
    const r = ws.resources.find((x) => x.id === t.resourceId);
    if (!r?.is_substitutable || t.annualSpend < 5000) continue;
    ops.push({
      lever: "SUBSTITUTION",
      title: `Qualify an alternative for ${t.name}`,
      rationale: `Flagged as substitutable and carries ${t.sharePct}% of input spend. Alternate grade or supplier at equal function typically recovers 5-12%.`,
      affectedItems: [t.name], currentValue: t.annualSpend, targetValue: round(t.annualSpend * 0.92, 0),
      annualImpact: round(t.annualSpend * 0.08, 0), difficulty: "medium", timeToImpactWeeks: 12,
      confidence: "low",
      evidence: [
        `Annual spend: ${round(t.annualSpend, 0)} (${t.sharePct}% of total inputs)`,
        r.substitute_notes ? `Note: ${r.substitute_notes}` : "No substitute identified yet - requires sourcing work",
        "8% assumed recovery is indicative until a quote is obtained",
      ],
    });
  }

  // L3 :: SUPPLIER LEVERAGE
  const concCheck = checks.find((c) => c.metricKey === "supplier_concentration_pct");
  if (suppliers.length && suppliers[0].sharePct > 35) {
    const s = suppliers[0];
    ops.push({
      lever: "SUPPLIER_LEVERAGE",
      title: `Re-tender or renegotiate ${s.supplier} (${s.sharePct}% of input spend)`,
      rationale: `Single-supplier concentration at ${s.sharePct}% is both a pricing and a continuity risk. Introducing a credible second source typically recovers 2-5% on re-tender.`,
      affectedItems: [s.supplier], currentValue: s.sharePct, targetValue: 35,
      annualImpact: round(s.annualSpend * 0.03, 0), difficulty: "medium", timeToImpactWeeks: 10,
      confidence: concCheck?.confidence || "medium",
      evidence: [
        `Annual spend with this supplier: ${round(s.annualSpend, 0)}`,
        concCheck?.mid != null ? `Benchmark share: ${concCheck.mid}%` : "No benchmark matched",
        "3% recovery assumed on re-tender - conservative",
      ],
    });
  }

  // L4 :: CHANNEL MIX
  for (const e of offerings) {
    if (e.channelEconomics.length < 2) continue;
    const sorted = [...e.channelEconomics].sort((a, b) => b.contributionPerUnit - a.contributionPerUnit);
    const best = sorted[0], worst = sorted[sorted.length - 1];
    const gap = best.contributionPerUnit - worst.contributionPerUnit;
    if (gap <= 0 || worst.volumeSharePct <= 0) continue;
    const shiftableUnits = e.monthlyVolume * (Math.min(worst.volumeSharePct, 20) / 100);
    ops.push({
      lever: "CHANNEL_MIX",
      title: `Shift ${e.name} volume from ${worst.channelName} toward ${best.channelName}`,
      rationale: `${best.channelName} returns ${best.contributionPerUnit} per unit versus ${worst.contributionPerUnit} on ${worst.channelName} - a gap of ${round(gap, 2)}. ${worst.channelName} loses ${worst.leakagePct}% of gross price to commission, discount and fulfilment.`,
      affectedItems: [e.name, worst.channelName, best.channelName],
      currentValue: worst.contributionPerUnit, targetValue: best.contributionPerUnit,
      annualImpact: round(shiftableUnits * gap * 12, 0),
      difficulty: worst.channelType === "aggregator" ? "high" : "medium",
      timeToImpactWeeks: 12, confidence: "medium",
      evidence: [
        `${worst.channelName} leakage: ${worst.leakagePct}% of gross price`,
        `Assumes shifting up to 20% of ${worst.channelName} volume - not full migration`,
        worst.isLossMaking ? `WARNING: ${worst.channelName} is currently loss-making on this item` : `${worst.channelName} margin: ${worst.contributionMarginPct}%`,
      ],
    });
  }

  // L5 :: PORTFOLIO PRUNING
  for (const e of offerings) {
    if (!e.isLossMaking || e.monthlyVolume <= 0) continue;
    ops.push({
      lever: "PORTFOLIO_PRUNING",
      title: `${e.name} loses money on every unit - reprice, re-engineer or retire`,
      rationale: `Net realisation is ${e.blendedNetRealisation} against a marginal cost of ${e.marginalCostPerUnit}. Every unit sold destroys ${round(Math.abs(e.contributionPerUnit), 2)}. Volume growth makes this worse, not better.`,
      affectedItems: [e.name],
      currentValue: e.contributionPerUnit, targetValue: 0,
      annualImpact: round(Math.abs(e.monthlyContribution) * 12, 0),
      difficulty: "low", timeToImpactWeeks: 4, confidence: "high",
      evidence: [
        `Top cost drivers: ${e.paretoTop3Labels.join(", ")} = ${e.paretoTop3SharePct}% of unit cost`,
        `Monthly bleed: ${round(Math.abs(e.monthlyContribution), 0)}`,
        `Price would need to rise to at least ${round(e.marginalCostPerUnit, 2)} to break even on variable cost alone`,
      ],
    });
  }

  // L6 :: PRICE ARCHITECTURE
  const cmCheck = checks.find((c) => c.metricKey === "contribution_margin_pct");
  for (const e of offerings) {
    if (e.isLossMaking) continue;
    const target = e.contributionMarginPct;
    let floor: number | null = null;
    if (num(offerings.find((o) => o.offeringId === e.offeringId)?.contributionMarginPct) > 0) {
      const tgt = ws.offerings.find((o) => o.id === e.offeringId)?.target_margin_pct;
      floor = tgt != null ? num(tgt) : cmCheck?.low ?? null;
    }
    if (floor == null || target >= floor) continue;
    const requiredNet = safeDiv(e.marginalCostPerUnit, 1 - floor / 100);
    const uplift = requiredNet - e.blendedNetRealisation;
    if (uplift <= 0) continue;
    ops.push({
      lever: "PRICE_ARCHITECTURE",
      title: `${e.name} sits ${round(floor - target, 1)}pts below its margin floor`,
      rationale: `Contribution margin is ${target}% against a floor of ${floor}%. Reaching it needs net realisation of ${round(requiredNet, 2)} versus ${e.blendedNetRealisation} today - roughly ${round(safeDiv(uplift, e.blendedNetRealisation) * 100, 1)}% on price, or the same value taken out of cost.`,
      affectedItems: [e.name], currentValue: target, targetValue: floor,
      annualImpact: round(uplift * e.monthlyVolume * 12, 0),
      difficulty: "high", timeToImpactWeeks: 8, confidence: cmCheck?.confidence || "low",
      evidence: [
        `Marginal cost: ${e.marginalCostPerUnit} | Net realisation: ${e.blendedNetRealisation}`,
        cmCheck?.source ? `Floor source: ${cmCheck.source}` : "Floor from your own target margin setting",
        "Assumes zero volume loss - stress test elasticity before acting",
      ],
    });
  }

  // L7 :: OVERHEAD REDUCTION
  const ohCheck = checks.find((c) => c.metricKey === "overhead_pct_revenue");
  if (ohCheck && ohCheck.status === "worse" && ohCheck.high != null && monthlyRevenue > 0) {
    const targetOh = (ohCheck.high / 100) * monthlyRevenue;
    const excess = monthlyFixedCost - targetOh;
    if (excess > 0) {
      const avoidable = ws.costPools.filter((p) => p.is_avoidable);
      ops.push({
        lever: "OVERHEAD_REDUCTION",
        title: `Overhead runs ${ohCheck.actual}% of revenue against a ${ohCheck.high}% ceiling`,
        rationale: `Fixed cost is ${round(excess, 0)} per month above the benchmark ceiling. This directly raises breakeven and shortens cash runway.`,
        affectedItems: avoidable.length ? avoidable.map((p) => p.name) : ws.costPools.map((p) => p.name).slice(0, 5),
        currentValue: ohCheck.actual, targetValue: ohCheck.high,
        annualImpact: round(excess * 12, 0), difficulty: "high", timeToImpactWeeks: 16,
        confidence: ohCheck.confidence,
        evidence: [
          `Monthly fixed cost: ${round(monthlyFixedCost, 0)} | Benchmark ceiling: ${round(targetOh, 0)}`,
          ohCheck.source ? `Source: ${ohCheck.source} (${ohCheck.asOf || "undated"})` : "No source recorded",
          avoidable.length ? `${avoidable.length} pool(s) marked avoidable` : "No pools marked avoidable - review classification first",
        ],
      });
    }
  }

  // L8 :: CONSTRAINT REALLOCATION
  const withConstraint = offerings.filter((e) => e.contributionPerConstraintMinute != null && e.monthlyVolume > 0);
  if (withConstraint.length >= 2) {
    const s = [...withConstraint].sort((a, b) => num(b.contributionPerConstraintMinute) - num(a.contributionPerConstraintMinute));
    const best = s[0], worst = s[s.length - 1];
    const gap = num(best.contributionPerConstraintMinute) - num(worst.contributionPerConstraintMinute);
    if (gap > 0) {
      const freedMinutes = worst.monthlyVolume * num(worst.constraintMinutesPerUnit) * 0.2;
      ops.push({
        lever: "CONSTRAINT_REALLOCATION",
        title: `Reallocate ${ws.context?.constraint_resource_label || "bottleneck"} capacity from ${worst.name} to ${best.name}`,
        rationale: `${best.name} earns ${best.contributionPerConstraintMinute} per constraint-minute versus ${worst.contributionPerConstraintMinute} for ${worst.name}. When capacity is the binding limit, margin per constraint-minute - not margin percentage - is the correct ranking metric.`,
        affectedItems: [best.name, worst.name],
        currentValue: num(worst.contributionPerConstraintMinute),
        targetValue: num(best.contributionPerConstraintMinute),
        annualImpact: round(freedMinutes * gap * 12, 0),
        difficulty: "medium", timeToImpactWeeks: 6, confidence: "medium",
        evidence: [
          `Assumes reallocating 20% of ${worst.name}'s constraint time`,
          `Requires demand to exist for additional ${best.name} volume - verify before acting`,
          `Only valid while ${ws.context?.constraint_resource_label || "the bottleneck"} is genuinely the binding constraint`,
        ],
      });
    }
  }

  // L9 :: BATCH ECONOMICS
  for (const off of ws.offerings) {
    const batch = num(off.batch_size, 1);
    if (batch <= 1) continue;
    const batchLines = ws.bomLines.filter((b) => b.offering_id === off.id && (b.applies_per === "BATCH" || b.applies_per === "PROJECT"));
    if (!batchLines.length) continue;
    const e = offerings.find((x) => x.offeringId === off.id);
    if (!e || e.monthlyVolume <= 0) continue;
    const setupPerUnit = batchLines.reduce((s, bl) => {
      const r = bl.child_resource_id ? ws.resources.find((x) => x.id === bl.child_resource_id) : null;
      return s + (r ? num(bl.qty_per_unit) * effectiveCostPerBaseUnit(r) / batch : 0);
    }, 0);
    if (safeDiv(setupPerUnit, e.marginalCostPerUnit) < 0.08) continue;
    const newBatch = batch * 2;
    const saving = setupPerUnit - setupPerUnit * (batch / newBatch);
    ops.push({
      lever: "BATCH_ECONOMICS",
      title: `Setup cost on ${off.name} is ${pct(setupPerUnit, e.marginalCostPerUnit)}% of unit cost`,
      rationale: `Batch size of ${batch} spreads fixed setup thinly. Doubling to ${newBatch} halves setup per unit - but raises inventory holding and spoilage risk.`,
      affectedItems: [off.name], currentValue: round(setupPerUnit, 2),
      targetValue: round(setupPerUnit / 2, 2),
      annualImpact: round(saving * e.monthlyVolume * 12, 0),
      difficulty: "low", timeToImpactWeeks: 4, confidence: "medium",
      evidence: [
        `Current batch size: ${batch} | Proposed: ${newBatch}`,
        "Net benefit only if holding cost and spoilage stay below the setup saving",
        "Do not apply to perishable or fashion-cycle items without shelf-life check",
      ],
    });
  }

  return ops.sort((a, b) => b.annualImpact - a.annualImpact);
}

/* ----------------------------------------------------------------------------
 * 11. AI CONTEXT BUILDER
 * The bridge to Boardroom, Autopilot, Time Machine, Workflow, Pulse, Chat.
 * Compact, token-aware, facts-only. No adjectives, no advice.
 * -------------------------------------------------------------------------- */

export interface CostContextOptions {
  maxOfferings?: number;
  maxResources?: number;
  maxOpportunities?: number;
  includeBenchmarks?: boolean;
}

export function buildCostContext(d: PortfolioDiagnosis, opts: CostContextOptions = {}): string {
  const { maxOfferings = 8, maxResources = 8, maxOpportunities = 6, includeBenchmarks = true } = opts;
  const c = d.currency;
  const L: string[] = [];
  const money = (v: number) => `${c} ${Math.round(v).toLocaleString("en-IN")}`;

  L.push("=== VERIFIED COST ARCHITECTURE (computed, not estimated) ===");
  L.push(`Industry archetype: ${d.archetype || "not set"} | Data completeness: ${d.completenessScore}% | Confidence: ${d.confidenceScore}%`);
  L.push("");
  L.push("P&L SHAPE (monthly):");
  L.push(`  Revenue ${money(d.monthlyRevenue)} | Variable cost ${money(d.monthlyVariableCost)} | Contribution ${money(d.monthlyContribution)} (${d.contributionMarginPct}%)`);
  L.push(`  Fixed cost ${money(d.monthlyFixedCost)} | Operating profit ${money(d.monthlyOperatingProfit)} (${d.operatingMarginPct}%)`);
  L.push(`  Breakeven revenue ${money(d.breakevenRevenue)} | Margin of safety ${d.marginOfSafetyPct}%`);

  if (d.offerings.length) {
    L.push("");
    L.push("UNIT ECONOMICS BY OFFERING:");
    for (const e of d.offerings.slice(0, maxOfferings)) {
      L.push(`  ${e.name}${e.sku ? ` [${e.sku}]` : ""} (${e.offeringType}, ${e.monthlyVolume}/mo)`);
      L.push(`    Price ${e.listPrice} -> net ${e.blendedNetRealisation} | marginal cost ${e.marginalCostPerUnit} | fully loaded ${e.fullyLoadedCostPerUnit}`);
      L.push(`    Contribution ${e.contributionPerUnit}/unit (${e.contributionMarginPct}%) | fully-loaded margin ${e.fullyLoadedMarginPct}%${e.isLossMaking ? "  ** LOSS MAKING **" : ""}`);
      if (e.paretoTop3Labels.length) L.push(`    Cost drivers: ${e.paretoTop3Labels.join(", ")} = ${e.paretoTop3SharePct}% of unit cost`);
      if (e.contributionPerConstraintMinute != null) L.push(`    Contribution per constraint-minute: ${e.contributionPerConstraintMinute}`);
      if (e.ltvCacRatio != null) L.push(`    LTV ${e.ltv} | LTV:CAC ${e.ltvCacRatio}x | CAC payback ${e.cacPaybackMonths} months`);
      for (const ch of e.channelEconomics) {
        L.push(`    - ${ch.channelName}: gross ${ch.grossPrice} -> net ${ch.netRealisation} (leakage ${ch.leakagePct}%), CM ${ch.contributionMarginPct}%${ch.isLossMaking ? " ** LOSS **" : ""}`);
      }
    }
  }

  if (d.topResourcesBySpend.length) {
    L.push("");
    L.push("INPUT SPEND (annual):");
    for (const t of d.topResourcesBySpend.slice(0, maxResources)) {
      L.push(`  ${t.name} [${t.resourceClass}] ${money(t.annualSpend)} (${t.sharePct}%) | yield ${t.yieldPct}%${t.supplier ? ` | ${t.supplier}` : ""}${t.indexRef ? ` | index ${t.indexRef}` : ""}`);
    }
  }

  if (includeBenchmarks && d.benchmarkChecks.length) {
    L.push("");
    L.push("VS INDUSTRY BENCHMARK:");
    for (const b of d.benchmarkChecks) {
      if (b.status === "no_benchmark") continue;
      const range = [b.low, b.mid, b.high].filter((x) => x != null).join("/");
      L.push(`  ${b.metricLabel}: ${b.actual}${b.unit} vs ${range}${b.unit} -> ${b.status.toUpperCase()} | src ${b.source || "n/a"} (${b.confidence} confidence, ${b.benchmarkScope})`);
    }
  }

  if (d.opportunities.length) {
    L.push("");
    L.push(`RANKED OPPORTUNITIES (total ${money(d.totalAnnualOpportunity)}/yr):`);
    for (const o of d.opportunities.slice(0, maxOpportunities)) {
      L.push(`  [${o.lever}] ${o.title}`);
      L.push(`    Impact ${money(o.annualImpact)}/yr | difficulty ${o.difficulty} | ~${o.timeToImpactWeeks}wk | confidence ${o.confidence}`);
    }
  }

  const crit = d.dataQuality.filter((x) => x.severity === "critical");
  if (crit.length) {
    L.push("");
    L.push("DATA GAPS (treat affected figures as unreliable):");
    for (const f of crit.slice(0, 6)) L.push(`  - ${f.field}: ${f.message}`);
  }

  L.push("");
  L.push("RULES FOR USING THIS BLOCK: These figures are computed from the user's own entered data.");
  L.push("Cite them exactly. Do not re-estimate, round differently, or invent figures not listed here.");
  L.push("If a required number is absent, say it is not available rather than assuming one.");
  L.push("Benchmarks marked 'low confidence' must be presented as indicative, never as established fact.");
  L.push("=== END COST ARCHITECTURE ===");

  return L.join("\n");
}

/** Ultra-compact variant for token-tight calls (sidebars, quick chat). */
export function buildCostContextCompact(d: PortfolioDiagnosis): string {
  const c = d.currency;
  const loss = d.offerings.filter((e) => e.isLossMaking).map((e) => e.name);
  const parts = [
    `COST FACTS: Rev ${c}${Math.round(d.monthlyRevenue)}/mo, CM ${d.contributionMarginPct}%, OP margin ${d.operatingMarginPct}%, breakeven ${c}${Math.round(d.breakevenRevenue)}/mo.`,
    d.topResourcesBySpend.length ? `Top inputs: ${d.topResourcesBySpend.slice(0, 3).map((t) => `${t.name} ${t.sharePct}%`).join(", ")}.` : "",
    loss.length ? `LOSS-MAKING: ${loss.join(", ")}.` : "",
    d.opportunities.length ? `Top lever: ${d.opportunities[0].title} (${c}${Math.round(d.opportunities[0].annualImpact)}/yr).` : "",
    `Confidence ${d.confidenceScore}%.`,
  ];
  return parts.filter(Boolean).join(" ");
}

/* ----------------------------------------------------------------------------
 * 12. EMPTY WORKSPACE HELPER
 * -------------------------------------------------------------------------- */

export function emptyWorkspace(): CostWorkspace {
  return {
    context: null, resources: [], offerings: [], bomLines: [],
    costPools: [], channels: [], offeringChannels: [], benchmarks: [],
  };
}

export function hasUsableData(ws: CostWorkspace): boolean {
  return ws.offerings.length > 0 && ws.bomLines.length > 0;
}

export const COST_ENGINE_VERSION = "1.0.0";
