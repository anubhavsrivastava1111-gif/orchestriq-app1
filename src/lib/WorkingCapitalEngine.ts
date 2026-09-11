/* ============================================================================
 * OrchestrIQ :: WorkingCapitalEngine.ts
 * MODULE 10 — WORKING CAPITAL.
 *
 * DELIBERATELY DAYS-BASED, NOT RUPEE-BASED: asking "how many days of stock
 * do you hold" is something almost any business owner can answer from
 * memory. Asking for their exact average inventory VALUE in rupees is not -
 * most don't track that precisely. This takes the number people can
 * actually give confidently, and converts it to a rupee figure using cost
 * data this platform already has, rather than asking for a second number
 * that would just be a guess anyway.
 * ========================================================================== */

import { num, safeDiv } from "./CostEngine";

export interface WorkingCapitalInputs {
  inventoryDays: number;
  receivablesDays: number;
  payablesDays: number;
  monthlyRevenue: number;
  monthlyCogs: number;   // cost of goods sold - the variable cost of what you actually sold
}

export interface WorkingCapitalResult {
  cashConversionCycleDays: number; // inventory + receivables - payables
  dailyCogs: number;
  dailyRevenue: number;
  cashTiedUpInInventory: number;
  cashTiedUpInReceivables: number;
  cashFreedByPayables: number;
  workingCapitalRequired: number;  // the actual rupee amount you need sitting in the bank
  interpretation: "healthy" | "tight" | "concerning";
}

export function calculateWorkingCapital(inputs: WorkingCapitalInputs): WorkingCapitalResult {
  const invDays = num(inputs.inventoryDays);
  const recDays = num(inputs.receivablesDays);
  const payDays = num(inputs.payablesDays);
  const dailyCogs = safeDiv(num(inputs.monthlyCogs), 30);
  const dailyRevenue = safeDiv(num(inputs.monthlyRevenue), 30);

  const cashTiedUpInInventory = dailyCogs * invDays;
  const cashTiedUpInReceivables = dailyRevenue * recDays;
  const cashFreedByPayables = dailyCogs * payDays;

  const cashConversionCycleDays = invDays + recDays - payDays;
  const workingCapitalRequired = cashTiedUpInInventory + cashTiedUpInReceivables - cashFreedByPayables;

  // A genuinely simple, explainable rule of thumb: negative or very short
  // cycles are healthy (suppliers effectively fund your operations);
  // beyond about six weeks tied up is worth a second look.
  const interpretation: "healthy" | "tight" | "concerning" =
    cashConversionCycleDays <= 15 ? "healthy" : cashConversionCycleDays <= 45 ? "tight" : "concerning";

  return {
    cashConversionCycleDays, dailyCogs, dailyRevenue,
    cashTiedUpInInventory, cashTiedUpInReceivables, cashFreedByPayables,
    workingCapitalRequired, interpretation,
  };
}

export default { calculateWorkingCapital };
