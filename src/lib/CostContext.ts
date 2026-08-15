/* ============================================================================
 * OrchestrIQ :: CostContext.ts
 * The bridge between the Cost Architecture model and every AI module.
 *
 * Loads the user's cost workspace once, computes it with CostEngine, and
 * exposes the result SYNCHRONOUSLY so existing context builders can inject
 * it without becoming async.
 *
 * Boardroom, Autopilot, Time Machine, Workflow, Task Queue, Pulse and
 * Executive Chat all read from here via buildCtx(). One source, one refresh.
 *
 * Fail-safe by design: every function returns an empty string or null on
 * error. Nothing here can break an AI call or crash a render.
 * ========================================================================== */

import { supabase } from "./supabase";
import {
  diagnose, buildCostContext, buildCostContextCompact, emptyWorkspace,
  type CostWorkspace, type PortfolioDiagnosis,
  type CaResource, type CaOffering, type CaBomLine, type CaCostPool,
  type CaChannel, type CaOfferingChannel, type CaBenchmark, type CaBusinessContext,
} from "./CostEngine";

/* ------------------------------------------------------------------- state */

let _diagnosis: PortfolioDiagnosis | null = null;
let _brief = "";
let _compact = "";
let _loadedAt = 0;
let _inFlight: Promise<PortfolioDiagnosis | null> | null = null;
let _lastError: string | null = null;

const TTL_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------------- load */

/**
 * Load the cost workspace from Supabase and compute the diagnosis.
 * Safe to call repeatedly - de-duplicates concurrent calls and respects TTL.
 */
export async function loadCostContext(force = false): Promise<PortfolioDiagnosis | null> {
  if (!force && _diagnosis && Date.now() - _loadedAt < TTL_MS) return _diagnosis;
  if (_inFlight) return _inFlight;

  _inFlight = (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { clearCostContext(); return null; }

      const [bc, rs, of, bl, cp, ch, oc, bm] = await Promise.all([
        supabase.from("ca_business_context").select("*").eq("user_id", uid).maybeSingle(),
        supabase.from("ca_resources").select("*").eq("user_id", uid),
        supabase.from("ca_offerings").select("*").eq("user_id", uid),
        supabase.from("ca_bom_lines").select("*").eq("user_id", uid),
        supabase.from("ca_cost_pools").select("*").eq("user_id", uid),
        supabase.from("ca_channels").select("*").eq("user_id", uid),
        supabase.from("ca_offering_channels").select("*").eq("user_id", uid),
        supabase.from("ca_benchmarks").select("*"),
      ]);

      const ws: CostWorkspace = {
        ...emptyWorkspace(),
        context: (bc?.data as CaBusinessContext) ?? null,
        resources: (rs?.data as CaResource[]) ?? [],
        offerings: (of?.data as CaOffering[]) ?? [],
        bomLines: (bl?.data as CaBomLine[]) ?? [],
        costPools: (cp?.data as CaCostPool[]) ?? [],
        channels: (ch?.data as CaChannel[]) ?? [],
        offeringChannels: (oc?.data as CaOfferingChannel[]) ?? [],
        benchmarks: (bm?.data as CaBenchmark[]) ?? [],
      };

      publishCostDiagnosis(diagnose(ws));
      _lastError = null;
      return _diagnosis;
    } catch (e: any) {
      _lastError = e?.message || "Cost context load failed";
      if (typeof console !== "undefined") console.warn("[OIQ] CostContext:", _lastError);
      return _diagnosis;
    } finally {
      _inFlight = null;
    }
  })();

  return _inFlight;
}

/** Push a freshly computed diagnosis (called by CostArchitecture as the user edits). */
export function publishCostDiagnosis(d: PortfolioDiagnosis | null): void {
  try {
    _diagnosis = d;
    _loadedAt = Date.now();
    if (!d || !d.offerings.length) { _brief = ""; _compact = ""; return; }
    _brief = buildCostContext(d, { maxOfferings: 8, maxResources: 8, maxOpportunities: 6, includeBenchmarks: true });
    _compact = buildCostContextCompact(d);
  } catch {
    _brief = ""; _compact = "";
  }
}

export function clearCostContext(): void {
  _diagnosis = null; _brief = ""; _compact = ""; _loadedAt = 0; _lastError = null;
}

/* ------------------------------------------------------------------ getters */

/** True when the user has enough entered for the figures to mean anything. */
export function hasCostData(): boolean {
  return !!_diagnosis && _diagnosis.offerings.length > 0 && _diagnosis.monthlyRevenue > 0;
}

/**
 * The full computed cost block, ready to paste into a system prompt.
 * Returns "" when there is no usable data - callers need no guard.
 */
export function getCostBrief(): string {
  return hasCostData() ? _brief : "";
}

/** One-line variant for token-tight calls. */
export function getCostBriefCompact(): string {
  return hasCostData() ? _compact : "";
}

/**
 * Role-aware slice. A CFO wants the full financial picture; a CMO needs
 * pricing and channel economics; ops needs cost drivers and the bottleneck.
 * Everyone else gets the compact line so token cost stays proportionate.
 */
export function getCostBriefForRole(roleId?: string): string {
  if (!hasCostData()) return "";
  const r = (roleId || "").toLowerCase();
  const deep = /cfo|ceo|coo|chair|finance|controller|treasur|strateg|analyst|procure|supply|ops|operations|manufact|product|pricing/.test(r);
  return deep ? _brief : _compact;
}

export function getCostDiagnosis(): PortfolioDiagnosis | null { return _diagnosis; }
export function getCostContextError(): string | null { return _lastError; }
export function getCostContextAge(): number { return _loadedAt ? Date.now() - _loadedAt : -1; }

/* ------------------------------------------------------------- module hooks */

/**
 * Alert-style lines for Autopilot and the Action Tracker: only the things
 * that genuinely warrant a human decision. Empty array when all is well.
 */
export function getCostAlerts(): string[] {
  const d = _diagnosis;
  if (!d || !d.offerings.length) return [];
  const out: string[] = [];
  const c = d.currency;
  const m = (v: number) => c + " " + Math.round(v).toLocaleString("en-IN");

  for (const e of d.offerings) {
    if (e.isLossMaking) out.push(`${e.name} loses ${m(Math.abs(e.contributionPerUnit))} per unit sold (${m(Math.abs(e.monthlyContribution))}/month).`);
    for (const ch of e.channelEconomics) {
      if (ch.isLossMaking) out.push(`${e.name} on ${ch.channelName} is loss-making after ${ch.leakagePct}% channel leakage.`);
    }
  }
  if (d.monthlyOperatingProfit < 0) out.push(`Operating loss of ${m(Math.abs(d.monthlyOperatingProfit))}/month. Breakeven needs ${m(d.breakevenRevenue)} revenue against ${m(d.monthlyRevenue)} today.`);
  if (d.marginOfSafetyPct > 0 && d.marginOfSafetyPct < 15) out.push(`Margin of safety is only ${d.marginOfSafetyPct}% - a small volume drop turns the month loss-making.`);

  for (const b of d.benchmarkChecks) {
    if (b.status === "worse" && b.confidence !== "low") {
      out.push(`${b.metricLabel} at ${b.actual}${b.unit} sits outside the ${b.low}-${b.high}${b.unit} industry range (${b.source || "benchmark"}).`);
    }
  }
  for (const s of d.supplierConcentration) {
    if (s.sharePct > 50) out.push(`${s.supplier} holds ${s.sharePct}% of input spend - single-source pricing and continuity risk.`);
  }
  return out.slice(0, 10);
}

/** Top money-on-the-table items, formatted for a task queue or action list. */
export function getCostOpportunities(limit = 5): Array<{ title: string; impact: number; difficulty: string; confidence: string; weeks: number }> {
  const d = _diagnosis;
  if (!d) return [];
  return d.opportunities.slice(0, limit).map((o) => ({
    title: o.title, impact: o.annualImpact, difficulty: o.difficulty,
    confidence: o.confidence, weeks: o.timeToImpactWeeks,
  }));
}

/** Baseline snapshot for Time Machine scenarios. */
export function getCostBaseline(): Record<string, number> | null {
  const d = _diagnosis;
  if (!d) return null;
  return {
    monthlyRevenue: d.monthlyRevenue,
    monthlyVariableCost: d.monthlyVariableCost,
    monthlyContribution: d.monthlyContribution,
    monthlyFixedCost: d.monthlyFixedCost,
    monthlyOperatingProfit: d.monthlyOperatingProfit,
    contributionMarginPct: d.contributionMarginPct,
    operatingMarginPct: d.operatingMarginPct,
    breakevenRevenue: d.breakevenRevenue,
    marginOfSafetyPct: d.marginOfSafetyPct,
  };
}

export const COST_CONTEXT_VERSION = "1.0.0";
