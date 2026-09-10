/* ============================================================================
 * OrchestrIQ :: PricingEngine.ts
 * MODULE 6 — PRICING & BREAK-EVEN ENGINE.
 *
 * REUSE, NOT REINVENTION: every function here takes numbers CostEngine.ts
 * already computes per offering (allocatedOverheadPerUnit, contributionPerUnit,
 * fullyLoadedCostPerUnit, blendedNetRealisation) rather than re-deriving fixed
 * cost allocation itself. The only genuinely new capability - a portfolio-level
 * breakevenRevenue existed already; a PER-OFFERING one, and the actual
 * pricing questions a business owner asks ("what should I charge?", "what
 * happens if I discount 10%?") - did not exist anywhere before this.
 * ========================================================================== */

import { type OfferingEconomics, num, safeDiv } from "./CostEngine";

export interface OfferingBreakEven {
  fixedCostAllocatedPerMonth: number;
  breakEvenUnits: number;
  breakEvenRevenue: number;
  currentVolume: number;
  marginOfSafetyUnits: number;   // how far current volume sits above break-even
  marginOfSafetyPct: number;
  isBelowBreakEven: boolean;
}

/**
 * Break-even for ONE offering, not the whole portfolio. The distinction
 * matters: a business can be profitable overall while individual products
 * are quietly running below their own break-even, subsidised by others -
 * exactly the kind of thing a blended, portfolio-only number hides.
 */
export function offeringBreakEven(o: OfferingEconomics): OfferingBreakEven {
  const fixedCostAllocatedPerMonth = o.allocatedOverheadPerUnit * o.monthlyVolume;
  const breakEvenUnits = safeDiv(fixedCostAllocatedPerMonth, o.contributionPerUnit);
  const breakEvenRevenue = breakEvenUnits * o.blendedNetRealisation;
  const marginOfSafetyUnits = o.monthlyVolume - breakEvenUnits;
  const marginOfSafetyPct = safeDiv(marginOfSafetyUnits, o.monthlyVolume) * 100;
  return {
    fixedCostAllocatedPerMonth, breakEvenUnits, breakEvenRevenue,
    currentVolume: o.monthlyVolume, marginOfSafetyUnits, marginOfSafetyPct,
    isBelowBreakEven: o.monthlyVolume < breakEvenUnits,
  };
}

/**
 * "What should I charge?" — the single most common question this module
 * exists to answer, and one the platform could not answer at all before now.
 * Solves price such that (price - cost) / price = targetMargin.
 */
export function priceForTargetMargin(fullyLoadedCostPerUnit: number, targetMarginPct: number): number {
  const m = num(targetMarginPct) / 100;
  if (m >= 1) return NaN; // a 100%+ margin target is not solvable — cost can never be zero
  return safeDiv(num(fullyLoadedCostPerUnit), 1 - m);
}

/** The reverse question: "at this price, what margin am I actually making?" */
export function marginAtPrice(price: number, fullyLoadedCostPerUnit: number): number {
  return safeDiv(num(price) - num(fullyLoadedCostPerUnit), num(price)) * 100;
}

export interface PriceChangeImpact {
  newPrice: number;
  newContributionPerUnit: number;
  volumeNeededForSameContribution: number;
  volumeChangeNeededPct: number;
  isPriceIncreaseViable: boolean; // true if fewer units are now needed - a price rise that still needs MORE volume to break even on contribution is a red flag worth naming
}

/**
 * "If I discount 10%, how many more do I need to sell?" — the specific,
 * concrete version of a pricing decision an owner can actually act on,
 * rather than an abstract elasticity coefficient nobody can supply reliably.
 */
export function priceChangeImpact(
  currentPrice: number, currentVolume: number, currentContributionPerUnit: number,
  variableCostPerUnit: number, newPrice: number
): PriceChangeImpact {
  const newContributionPerUnit = num(newPrice) - num(variableCostPerUnit);
  const currentTotalContribution = num(currentContributionPerUnit) * num(currentVolume);
  const volumeNeededForSameContribution = safeDiv(currentTotalContribution, newContributionPerUnit);
  const volumeChangeNeededPct = safeDiv(volumeNeededForSameContribution - currentVolume, currentVolume) * 100;
  return {
    newPrice: num(newPrice), newContributionPerUnit, volumeNeededForSameContribution, volumeChangeNeededPct,
    isPriceIncreaseViable: num(newPrice) > num(currentPrice) ? volumeChangeNeededPct <= 0 : true,
  };
}

export default { offeringBreakEven, priceForTargetMargin, marginAtPrice, priceChangeImpact };
