/* ============================================================================
 * OrchestrIQ :: WorkforceEngine.ts
 * MODULE 5 — WORKFORCE / FTE ECONOMICS ENGINE.
 *
 * THE PRINCIPLE FROM THE SPEC, HELD TO EXACTLY: this must NOT become "an
 * employee calculator." It works on the SAME generic CaResource type every
 * other resource in this system already uses. A factory floor worker, a
 * consultant, and a machine operator go through the identical functions
 * below - only their input numbers differ. Nothing here checks
 * resource.category === "consultant" and branches; the capacity build-up
 * and rate math are universal, exactly as the spec's Section 60 demands.
 *
 * WHAT THIS ADDS ON TOP OF THE EXISTING ENGINE, PRECISELY:
 * effectiveCostPerBaseUnit() in CostEngine.ts already treats a labour
 * resource's effective_yield_pct as "productive share of paid hours" - but
 * that is one guessed number. This gives that number a real, auditable
 * build-up: Scheduled -> Net Available -> Productive -> Billable, each step
 * named and separately overridable, per spec Section 12. It does not
 * replace effective_cost_per_base_unit - it gives the USER a way to arrive
 * at a properly reasoned yield% instead of guessing one, and separately
 * exposes the distinct rate tiers Section 13 asks for that the single
 * cost-per-base-unit figure cannot express on its own.
 * ========================================================================== */

import { type CaResource, num, safeDiv } from "./CostEngine";

export interface CapacityBuildup {
  grossHoursPerYear: number;      // scheduled hours/day × working days/year
  netAvailableHours: number;      // gross - holidays - leave - sick leave - training
  productiveHours: number;        // net available - meetings/admin loss
  billableHours: number;          // productive × billability%
  utilizedHours: number;          // productive × utilization% - the hours actually demanded of this role
  lossBreakdown: { label: string; hours: number }[]; // where every hour actually went, for the user to see and challenge
}

/**
 * Section 12's exact waterfall. Every input defaults to a sane assumption
 * ONLY so the calculation never breaks on a partially-filled resource - the
 * UI must show which of these are real user inputs versus defaults standing
 * in for a missing answer, per Section 56 (Calculated / Missing / Estimated
 * / Assumed / User-defined must always be distinguishable).
 */
export function computeCapacity(r: CaResource): CapacityBuildup {
  const hoursPerDay = num(r.sched_hours_per_day, 8);
  const workingDays = num(r.working_days_per_year, 288); // ~6-day week, 52 weeks, before any leave
  const holidays = num(r.paid_holidays_per_year, 10);
  const annualLeave = num(r.annual_leave_days, 18);
  const sickLeave = num(r.sick_leave_days, 6);
  const training = num(r.training_days_per_year, 3);
  const meetingsAdminPct = num(r.meetings_admin_pct, 10);
  const utilizationPct = num(r.utilization_pct, 85);
  const billabilityPct = num(r.billability_pct, 70);

  const grossHoursPerYear = hoursPerDay * workingDays;
  const daysLost = holidays + annualLeave + sickLeave + training;
  const hoursLostToAbsence = daysLost * hoursPerDay;
  const netAvailableHours = Math.max(0, grossHoursPerYear - hoursLostToAbsence);
  const hoursLostToMeetingsAdmin = netAvailableHours * (meetingsAdminPct / 100);
  const productiveHours = Math.max(0, netAvailableHours - hoursLostToMeetingsAdmin);
  const billableHours = productiveHours * (billabilityPct / 100);
  const utilizedHours = productiveHours * (utilizationPct / 100);

  return {
    grossHoursPerYear, netAvailableHours, productiveHours, billableHours, utilizedHours,
    lossBreakdown: [
      { label: "Holidays", hours: holidays * hoursPerDay },
      { label: "Annual leave", hours: annualLeave * hoursPerDay },
      { label: "Sick leave", hours: sickLeave * hoursPerDay },
      { label: "Training", hours: training * hoursPerDay },
      { label: "Meetings & admin", hours: hoursLostToMeetingsAdmin },
    ],
  };
}

export interface WorkforceRates {
  annualSalaryCost: number;
  fullyLoadedAnnualCost: number;   // salary + employer add-ons (PF, insurance, benefits, etc)
  salaryCostRate: number;          // annual salary ÷ gross hours - the naive, wrong-on-purpose baseline to contrast against
  effectiveHourlyCost: number;     // fully loaded ÷ PRODUCTIVE hours - Section 13's core number
  billableCostRate: number;        // fully loaded ÷ BILLABLE hours - what an hour actually billed must recover
  clientBillingRate: number | null; // the actual rate charged, if set - lets margin-on-labour be seen directly
}

/**
 * Section 13's rate tiers, kept genuinely distinct rather than conflated -
 * the spec is explicit that confusing these is the single most common
 * costing mistake, and it is right.
 */
export function computeRates(r: CaResource, capacity: CapacityBuildup): WorkforceRates {
  // purchase_price is read the same way every other resource reads it: the
  // amount paid per purchase_uom. For a labour resource that is normally a
  // monthly salary, so annualise it the same way the rest of the engine
  // already treats "per period" figures.
  const monthly = num(r.purchase_price);
  const annualSalaryCost = monthly * 12;
  const addonPct = num(r.fully_loaded_addon_pct, 25); // PF/ESI/insurance/benefits/etc — 25% is a common India default, always overridable
  const fullyLoadedAnnualCost = annualSalaryCost * (1 + addonPct / 100);

  const salaryCostRate = safeDiv(annualSalaryCost, capacity.grossHoursPerYear);
  const effectiveHourlyCost = safeDiv(fullyLoadedAnnualCost, capacity.productiveHours);
  const billableCostRate = safeDiv(fullyLoadedAnnualCost, capacity.billableHours);
  const clientBillingRate = r.client_billing_rate != null ? num(r.client_billing_rate) : null;

  return { annualSalaryCost, fullyLoadedAnnualCost, salaryCostRate, effectiveHourlyCost, billableCostRate, clientBillingRate };
}

// ── ACTIVITY-BASED LABOUR COSTING ───────────────────────────────────────────
// Section 79's own worked example, built generically: ANY activity, against
// ANY resource. "100 participants × 6 minutes" and "20,000 units × 45
// seconds on a machine" are the exact same function call with different
// numbers - there is no participant-specific or manufacturing-specific path.
export interface ActivityCostResult {
  totalMinutes: number;
  totalHours: number;
  resourceName: string;
  hourlyCostUsed: number;   // whichever rate tier was selected - shown so the user knows what they multiplied by
  rateTierUsed: "effective" | "billable" | "salary";
  totalCost: number;
}

export function costActivity(
  volume: number, minutesPerUnit: number, resource: CaResource,
  rates: WorkforceRates, tier: "effective" | "billable" | "salary" = "effective"
): ActivityCostResult {
  const totalMinutes = num(volume) * num(minutesPerUnit);
  const totalHours = totalMinutes / 60;
  const hourlyCostUsed = tier === "billable" ? rates.billableCostRate
    : tier === "salary" ? rates.salaryCostRate
    : rates.effectiveHourlyCost;
  return {
    totalMinutes, totalHours, resourceName: resource.name,
    hourlyCostUsed, rateTierUsed: tier, totalCost: totalHours * hourlyCostUsed,
  };
}

// ── FTE CALCULATION ──────────────────────────────────────────────────────────
// Section 14. Deliberately two functions, not one: a single required-FTE
// number invites false precision when demand actually varies month to month,
// which is exactly the mistake the spec calls out by asking for time-phased
// FTE separately.
export function requiredFTE(effortHours: number, productiveHoursPerFTE: number): number {
  return safeDiv(num(effortHours), num(productiveHoursPerFTE, 1));
}

export interface PeriodFTE { period: string; effortHours: number; fte: number; }
export function phasedFTE(periods: Array<{ period: string; effortHours: number }>, productiveHoursPerFTEPerPeriod: number): {
  periods: PeriodFTE[]; average: number; peak: number; minimum: number;
} {
  const rows = periods.map(p => ({ period: p.period, effortHours: p.effortHours,
    fte: requiredFTE(p.effortHours, productiveHoursPerFTEPerPeriod) }));
  const values = rows.map(r => r.fte);
  const average = values.length ? values.reduce((a,b)=>a+b,0) / values.length : 0;
  return { periods: rows, average, peak: values.length ? Math.max(...values) : 0, minimum: values.length ? Math.min(...values) : 0 };
}

export default { computeCapacity, computeRates, costActivity, requiredFTE, phasedFTE };
