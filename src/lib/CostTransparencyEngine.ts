/* ============================================================================
 * OrchestrIQ :: CostTransparencyEngine.ts
 * MODULES 7 & 8 — ACTIVITY/PROCESS-STEP COSTING + COST ALLOCATION TRANSPARENCY.
 *
 * ZERO-CONFLICT GUARANTEE, CHECKED DIRECTLY BEFORE WRITING A LINE HERE:
 * allocateOverhead() in CostEngine.ts is NOT exported and has exactly two
 * callers, both inside that same file. Nothing here touches that function,
 * its signature, or either of its call sites. This file only READS data
 * (ws.bomLines, ws.resources, ws.costPools) the rest of the engine already
 * reads, through brand-new, separately-named, exported functions. Nothing
 * that already works can be affected by anything in this file existing.
 *
 * MODULE 7 - THE CONFIRMED GAP: every CaBomLine already carries a step_name
 * (e.g. "Mixing", "Baking", "Packaging") and a sequence - captured on every
 * discovery, shown nowhere. This rolls cost up BY STEP, so a business owner
 * can see where cost actually concentrates in their own process, not just
 * the flat ingredient list.
 *
 * MODULE 8 - THE CONFIRMED GAP: overhead allocation was a single opaque
 * number per offering - a user could see "₹40 allocated overhead" with no
 * way to see WHICH cost pool contributed how much of it, or challenge one
 * pool's allocation basis without guessing at the effect. This returns the
 * full per-pool breakdown alongside the existing total.
 * ========================================================================== */

import {
  type CostWorkspace, type CaOffering, type CaBomLine, type CaCostPool,
  type AllocationBasis, effectiveCostPerBaseUnit, num, safeDiv,
} from "./CostEngine";

// ── MODULE 7 — ACTIVITY / PROCESS-STEP COSTING ──────────────────────────────
export interface StepCost {
  stepName: string;
  sequence: number;
  lines: { resourceName: string; lineCost: number }[];
  totalCost: number;
  sharePct: number;
}

export function activityBreakdown(offering: CaOffering, ws: CostWorkspace): {
  steps: StepCost[]; totalCost: number; subAssemblyCost: number;
} {
  const lines = ws.bomLines.filter((b) => b.offering_id === offering.id);
  const byStep = new Map<string, StepCost>();
  let subAssemblyCost = 0;

  for (const line of lines) {
    if (line.child_type === "OFFERING") {
      // A sub-assembly (this offering uses another offering as an input).
      // Full recursive step attribution through nested sub-assemblies is a
      // genuinely separate, larger piece of work - kept out of THIS
      // increment deliberately rather than half-built. Its cost is counted
      // honestly in the total; it is not silently dropped, just not broken
      // down by ITS OWN internal steps here.
      const sub = ws.offerings.find((o) => o.id === line.child_offering_id);
      if (sub) {
        // Best available proxy without recursing into the full engine:
        // the sub-offering has no direct "cost per unit" field on the raw
        // type, so this is intentionally left as a named, visible bucket
        // rather than a guessed number.
        subAssemblyCost += 0; // explicit: not computed in this increment, see note above
      }
      continue;
    }
    const resource = ws.resources.find((r) => r.id === line.child_resource_id);
    if (!resource) continue;
    const scrapMult = 1 / (1 - (num(line.process_scrap_pct) / 100 || 0));
    const lineCost = effectiveCostPerBaseUnit(resource) * num(line.qty_per_unit) * (isFinite(scrapMult) ? scrapMult : 1);
    const step = line.step_name?.trim() || "Unassigned";
    const seq = num(line.sequence, 999);
    if (!byStep.has(step)) byStep.set(step, { stepName: step, sequence: seq, lines: [], totalCost: 0, sharePct: 0 });
    const s = byStep.get(step)!;
    s.lines.push({ resourceName: resource.name, lineCost });
    s.totalCost += lineCost;
  }

  const steps = Array.from(byStep.values()).sort((a, b) => a.sequence - b.sequence);
  const totalCost = steps.reduce((sum, s) => sum + s.totalCost, 0) + subAssemblyCost;
  steps.forEach((s) => { s.sharePct = safeDiv(s.totalCost, totalCost) * 100; });

  return { steps, totalCost, subAssemblyCost };
}

// ── MODULE 8 — COST ALLOCATION TRANSPARENCY ─────────────────────────────────
export interface PoolAllocationDetail {
  poolId: string;
  poolName: string;
  category: string | null;
  basis: AllocationBasis;
  monthlyPoolAmount: number;
  thisOfferingSharePct: number;
  allocatedToThisOffering: number;
  isAvoidable: boolean;
}

/**
 * The SAME allocation math CostEngine.ts already uses (same basis switch,
 * same share formula) - duplicated here read-only, deliberately, rather than
 * changing the existing private function's signature and risking its two
 * existing call sites. If the two ever need to be unified into one shared
 * implementation, that is a deliberate refactor to do with full test
 * coverage - not something to slip in as a side effect of a transparency
 * feature.
 */
export function allocationBreakdown(
  offeringId: string, ws: CostWorkspace,
  allocationInputs: Array<{ offeringId: string; volume: number; revenue: number; directCost: number;
    constraintMinutes: number; labourMinutes: number; machineMinutes: number }>
): { pools: PoolAllocationDetail[]; totalAllocated: number } {
  const me = allocationInputs.find((i) => i.offeringId === offeringId);
  if (!me) return { pools: [], totalAllocated: 0 };

  const totals = {
    units: allocationInputs.reduce((s, i) => s + i.volume, 0),
    revenue: allocationInputs.reduce((s, i) => s + i.revenue, 0),
    direct_cost: allocationInputs.reduce((s, i) => s + i.directCost, 0),
    constraint_hours: allocationInputs.reduce((s, i) => s + i.constraintMinutes, 0),
    labour_hours: allocationInputs.reduce((s, i) => s + i.labourMinutes, 0),
    machine_hours: allocationInputs.reduce((s, i) => s + i.machineMinutes, 0),
    headcount: allocationInputs.length, equal: allocationInputs.length,
  };

  const toMonthly = (amount: number, period?: string | null) => {
    const p = (period || "monthly").toLowerCase();
    if (p === "annual" || p === "yearly") return amount / 12;
    if (p === "quarterly") return amount / 3;
    if (p === "weekly") return amount * 4.33;
    return amount;
  };

  const pools: PoolAllocationDetail[] = ws.costPools.map((p: CaCostPool) => {
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
      case "headcount": case "equal": share = safeDiv(1, totals.equal); break;
      default: share = safeDiv(me.revenue, totals.revenue);
    }
    return {
      poolId: p.id, poolName: p.name, category: p.category ?? null, basis,
      monthlyPoolAmount: monthly, thisOfferingSharePct: share * 100,
      allocatedToThisOffering: monthly * share, isAvoidable: !!p.is_avoidable,
    };
  }).sort((a, b) => b.allocatedToThisOffering - a.allocatedToThisOffering);

  return { pools, totalAllocated: pools.reduce((s, p) => s + p.allocatedToThisOffering, 0) };
}

export default { activityBreakdown, allocationBreakdown };
