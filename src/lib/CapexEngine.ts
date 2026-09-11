/* ============================================================================
 * OrchestrIQ :: CapexEngine.ts
 * MODULE 09 — CAPEX & DEPRECIATION.
 *
 * Straight-line depreciation only, deliberately: it is the method almost
 * every small business actually uses and the only one a non-accountant can
 * verify by eye ("cost minus salvage, spread evenly"). Accelerated methods
 * are a real, separate addition for later if ever needed - not something to
 * half-build here and confuse the one method that has to work perfectly.
 * ========================================================================== */

import { num, safeDiv } from "./CostEngine";

export interface CapexItem {
  id: string;
  name: string;
  purchase_cost: number;
  salvage_value: number;
  useful_life_months: number;
  purchase_date?: string | null;
}

export interface DepreciationResult {
  depreciableAmount: number;   // what actually gets spread out (cost minus salvage)
  monthlyDepreciation: number;
  monthsElapsed: number;       // since purchase_date, if known
  monthsRemaining: number;
  currentBookValue: number;    // what it's "worth" on paper right now
  isFullyDepreciated: boolean;
}

export function calculateDepreciation(item: CapexItem, asOf: Date = new Date()): DepreciationResult {
  const cost = num(item.purchase_cost);
  const salvage = num(item.salvage_value);
  const lifeMonths = Math.max(1, num(item.useful_life_months, 60));
  const depreciableAmount = Math.max(0, cost - salvage);
  const monthlyDepreciation = safeDiv(depreciableAmount, lifeMonths);

  let monthsElapsed = 0;
  if (item.purchase_date) {
    const purchased = new Date(item.purchase_date);
    monthsElapsed = Math.max(0, (asOf.getFullYear() - purchased.getFullYear()) * 12 + (asOf.getMonth() - purchased.getMonth()));
  }
  const monthsRemaining = Math.max(0, lifeMonths - monthsElapsed);
  const accumulatedDepreciation = Math.min(depreciableAmount, monthlyDepreciation * monthsElapsed);
  const currentBookValue = cost - accumulatedDepreciation;
  const isFullyDepreciated = monthsElapsed >= lifeMonths;

  return { depreciableAmount, monthlyDepreciation, monthsElapsed, monthsRemaining, currentBookValue, isFullyDepreciated };
}

/** Total monthly depreciation across every CAPEX item — the single number
 *  that should be kept in sync with the linked cost pool's amount. */
export function totalMonthlyDepreciation(items: CapexItem[], asOf: Date = new Date()): number {
  return items.reduce((sum, item) => sum + calculateDepreciation(item, asOf).monthlyDepreciation, 0);
}

export default { calculateDepreciation, totalMonthlyDepreciation };
