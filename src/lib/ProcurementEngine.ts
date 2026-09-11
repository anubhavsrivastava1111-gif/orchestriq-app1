/* ============================================================================
 * OrchestrIQ :: ProcurementEngine.ts
 * MODULE 08 — PROCUREMENT, SUPPLIER COMPARISON & MAKE-VS-BUY.
 *
 * ZERO DUPLICATION: the landed-cost math here is the EXACT SAME formula as
 * effectiveCostPerBaseUnit() in CostEngine.ts - purchase price + freight +
 * duty + other landed cost, minus tax credit, divided by usable quantity
 * after yield. Rather than re-derive it, this treats each supplier option
 * as if it were a resource for one calculation, so a future change to the
 * real formula can't silently drift out of sync with this comparison.
 * ========================================================================== */

import { type CaResource, effectiveCostPerBaseUnit, num, safeDiv } from "./CostEngine";

export interface SupplierOption {
  id: string;
  supplier_name: string;
  purchase_price: number;
  freight_cost: number;
  duty_cost: number;
  other_landed_cost: number;
  moq?: number | null;
  lead_time_days?: number | null;
  payment_terms_days?: number | null;
  notes?: string | null;
}

export interface SupplierComparisonRow {
  id: string;
  supplierName: string;
  landedCostPerUnit: number;
  isCurrent: boolean;
  isCheapest: boolean;
  savingsVsCurrentPct: number | null; // negative = more expensive than current
}

/**
 * Compares the resource's OWN current terms (already in use, already
 * driving every calculation elsewhere) against every alternative supplier
 * option, using identical math for all of them - so "cheapest" is a fair,
 * apples-to-apples comparison, not different formulas for different rows.
 */
export function compareSuppliers(resource: CaResource, alternatives: SupplierOption[]): SupplierComparisonRow[] {
  const currentLanded = effectiveCostPerBaseUnit(resource);
  const denom = num(resource.purchase_qty, 1) * num(resource.conversion_factor, 1) * (num(resource.effective_yield_pct, 100) / 100);

  const rows: SupplierComparisonRow[] = [
    {
      id: "__current__",
      supplierName: resource.supplier_name || "Current supplier",
      landedCostPerUnit: currentLanded,
      isCurrent: true, isCheapest: false, savingsVsCurrentPct: 0,
    },
    ...alternatives.map((a) => {
      const landed = num(a.purchase_price) + num(a.freight_cost) + num(a.duty_cost) + num(a.other_landed_cost);
      const perUnit = safeDiv(landed, denom);
      return {
        id: a.id, supplierName: a.supplier_name, landedCostPerUnit: perUnit,
        isCurrent: false, isCheapest: false,
        savingsVsCurrentPct: currentLanded > 0 ? ((currentLanded - perUnit) / currentLanded) * 100 : null,
      };
    }),
  ];

  const cheapestCost = Math.min(...rows.map((r) => r.landedCostPerUnit));
  rows.forEach((r) => { if (r.landedCostPerUnit === cheapestCost) r.isCheapest = true; });
  return rows.sort((a, b) => a.landedCostPerUnit - b.landedCostPerUnit);
}

// ── MAKE VS BUY ──────────────────────────────────────────────────────────────
export interface MakeVsBuyResult {
  makeCostPerUnit: number;
  buyCostPerUnit: number;
  cheaperOption: "make" | "buy" | "equal";
  differencePerUnit: number;
  differencePct: number;
}

/**
 * The genuinely simple version of a real decision: what does it cost per
 * unit to make this yourself (labour + materials you'd need), versus buying
 * it landed from a supplier. Deliberately takes plain numbers rather than a
 * full BOM recursion - a real make-vs-buy call is usually made BEFORE a
 * full recipe exists for the "make" option, not after.
 */
export function makeVsBuy(makeCostPerUnit: number, buyCostPerUnit: number): MakeVsBuyResult {
  const make = num(makeCostPerUnit), buy = num(buyCostPerUnit);
  const diff = buy - make; // positive = buying costs more, making is cheaper
  const cheaper: "make" | "buy" | "equal" = diff > 0.01 ? "make" : diff < -0.01 ? "buy" : "equal";
  const base = Math.min(make, buy) || 1;
  return { makeCostPerUnit: make, buyCostPerUnit: buy, cheaperOption: cheaper, differencePerUnit: Math.abs(diff), differencePct: (Math.abs(diff) / base) * 100 };
}

export default { compareSuppliers, makeVsBuy };
