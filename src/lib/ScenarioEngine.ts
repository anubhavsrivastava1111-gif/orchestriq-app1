/* ============================================================================
 * OrchestrIQ :: ScenarioEngine.ts
 * MODULE 18 — SCENARIOS & WHAT-IF.
 *
 * REVENUE AND VARIABLE COST BOTH SCALE WITH VOLUME - a genuinely common
 * mistake in simple what-if tools is treating price and volume changes as
 * if they just add together. If you raise price 10% AND expect 5% more
 * volume, revenue moves by BOTH multiplicatively, not by 15% flatly. This
 * gets that right.
 * ========================================================================== */

import { num } from "./CostEngine";

export interface ScenarioAssumptions {
  priceChangePct: number;
  volumeChangePct: number;
  variableCostChangePct: number; // e.g. ingredient price inflation
  fixedCostChangePct: number;    // e.g. a rent increase
}

export interface ScenarioBase {
  monthlyRevenue: number;
  monthlyVariableCost: number;
  monthlyFixedCost: number;
}

export interface ScenarioResult {
  base: { revenue: number; variableCost: number; fixedCost: number; contribution: number; operatingProfit: number };
  projected: { revenue: number; variableCost: number; fixedCost: number; contribution: number; operatingProfit: number };
  profitChangeAbsolute: number;
  profitChangePct: number | null;
}

export function runScenario(base: ScenarioBase, a: ScenarioAssumptions): ScenarioResult {
  const priceMult = 1 + num(a.priceChangePct) / 100;
  const volMult = 1 + num(a.volumeChangePct) / 100;
  const varCostMult = 1 + num(a.variableCostChangePct) / 100;
  const fixedMult = 1 + num(a.fixedCostChangePct) / 100;

  const baseRevenue = num(base.monthlyRevenue);
  const baseVarCost = num(base.monthlyVariableCost);
  const baseFixed = num(base.monthlyFixedCost);

  // Revenue moves with BOTH price and volume, multiplicatively - selling the
  // same units at a higher price, or more units at the same price, or both.
  const projRevenue = baseRevenue * priceMult * volMult;
  // Variable cost scales with volume (more units = more input cost) AND with
  // any cost inflation on top of that - two genuinely separate effects.
  const projVarCost = baseVarCost * volMult * varCostMult;
  const projFixed = baseFixed * fixedMult;

  const baseContribution = baseRevenue - baseVarCost;
  const baseProfit = baseContribution - baseFixed;
  const projContribution = projRevenue - projVarCost;
  const projProfit = projContribution - projFixed;

  return {
    base: { revenue: baseRevenue, variableCost: baseVarCost, fixedCost: baseFixed, contribution: baseContribution, operatingProfit: baseProfit },
    projected: { revenue: projRevenue, variableCost: projVarCost, fixedCost: projFixed, contribution: projContribution, operatingProfit: projProfit },
    profitChangeAbsolute: projProfit - baseProfit,
    profitChangePct: baseProfit !== 0 ? ((projProfit - baseProfit) / Math.abs(baseProfit)) * 100 : null,
  };
}

export default { runScenario };
