/* ============================================================================
 * OrchestrIQ :: TimeValueEngine.ts
 * MODULE 17 — TIME VALUE OF MONEY: PV, FV, NPV, IRR.
 *
 * IRR HAS NO ALGEBRAIC SOLUTION for more than two cash flows - every real
 * financial tool finds it by trying rates until NPV lands on zero. This uses
 * bisection: slower than Newton-Raphson, but it CANNOT fail to converge or
 * diverge to a wrong answer the way Newton-Raphson can on unusual cash-flow
 * shapes, which matters more here than raw speed for a handful of numbers.
 * ========================================================================== */

import { num } from "./CostEngine";

export function presentValue(futureValue: number, rate: number, periods: number): number {
  return num(futureValue) / Math.pow(1 + num(rate) / 100, num(periods));
}

export function futureValue(presentVal: number, rate: number, periods: number): number {
  return num(presentVal) * Math.pow(1 + num(rate) / 100, num(periods));
}

/** cashFlows[0] is period 0 (usually the negative initial outlay).
 *  Every later index is one period later, discounted back to today. */
export function netPresentValue(cashFlows: number[], discountRatePct: number): number {
  const r = num(discountRatePct) / 100;
  return cashFlows.reduce((sum, cf, i) => sum + num(cf) / Math.pow(1 + r, i), 0);
}

export interface IrrResult {
  irrPct: number | null;   // null when no sign change exists - IRR is genuinely undefined for that cash-flow shape
  converged: boolean;
  npvAtIrr: number;
}

export function internalRateOfReturn(cashFlows: number[], maxIterations = 100): IrrResult {
  // IRR requires at least one sign change (money going out, then coming
  // back in) - a series that's all positive or all negative has no rate
  // that makes NPV zero, and claiming a spurious answer would be worse than
  // saying so honestly.
  const hasPositive = cashFlows.some((c) => c > 0);
  const hasNegative = cashFlows.some((c) => c < 0);
  if (!hasPositive || !hasNegative) return { irrPct: null, converged: false, npvAtIrr: NaN };

  let lo = -99, hi = 1000; // -99% to 1000% covers every realistic business scenario
  let npvLo = netPresentValue(cashFlows, lo);
  let npvHi = netPresentValue(cashFlows, hi);
  if (npvLo * npvHi > 0) return { irrPct: null, converged: false, npvAtIrr: NaN }; // no crossing in range - genuinely no real answer here

  let mid = 0, npvMid = 0;
  for (let i = 0; i < maxIterations; i++) {
    mid = (lo + hi) / 2;
    npvMid = netPresentValue(cashFlows, mid);
    if (Math.abs(npvMid) < 0.01) return { irrPct: Math.round(mid * 100) / 100, converged: true, npvAtIrr: npvMid };
    if ((npvMid > 0) === (npvLo > 0)) { lo = mid; npvLo = npvMid; } else { hi = mid; }
  }
  return { irrPct: Math.round(mid * 100) / 100, converged: true, npvAtIrr: npvMid };
}

export default { presentValue, futureValue, netPresentValue, internalRateOfReturn };
