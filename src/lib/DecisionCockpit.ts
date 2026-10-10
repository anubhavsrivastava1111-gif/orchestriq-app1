// DECISION COCKPIT - deterministic scenario engine on top of the canonical model.
// Pure functions only: no React, no provider calls. A scenario CHANGES canonical
// variables and the consequences are CALCULATED; nothing here asks an AI.
//
// Every value carries a label so a simulation can never pass for a fact:
//   [Retrieved Evidence]  backed by a retrieved research source
//   [User Input]          entered or answered by the user
//   [Assumption]          an executive estimate/assumption, or a scenario preset
//   [Calculation]         derived deterministically from the above
//   [Scenario]            a value changed by a scenario/challenge (a SIMULATION, not a fact)
import type { ModelRegistry, RegistryEntry } from "./DecisionIntegrity";

export type Label = "Retrieved Evidence" | "User Input" | "Assumption" | "Calculation" | "Scenario";
export interface Val { value: number; label: Label; source: string; }
export type Inputs = Partial<Record<InputKey, Val>>;
export type InputKey = "revenue" | "price" | "volume" | "dayRate" | "billableDays" | "headcount" | "utilisation" | "contributionMargin"
  | "variableCostPct" | "fixedCost" | "capex" | "funding" | "dso" | "cac" | "interestRate" | "debt" | "revenueFull" | "loanTenure" | "equity";
const REG_KEY: Record<string, InputKey> = { revenue: "revenue", price: "price", volume: "volume", dayRate: "dayRate", billableDays: "billableDays",
  headcount: "headcount", utilisation: "utilisation", contributionMargin: "contributionMargin", variableCostPct: "variableCostPct", fixedCost: "fixedCost",
  capex: "capex", funding: "funding", dso: "dso", cac: "cac", interestRate: "interestRate", debt: "debt", revenueFull: "revenueFull", loanTenure: "loanTenure", equity: "equity" };
export const INPUT_LABEL: Record<InputKey, { label: string; unit: "INR" | "PCT" | "DAYS" | "COUNT" }> = {
  revenue: { label: "Monthly revenue", unit: "INR" }, price: { label: "Price per unit", unit: "INR" }, volume: { label: "Volume per month", unit: "COUNT" },
  dayRate: { label: "Day rate", unit: "INR" }, billableDays: { label: "Billable days / month", unit: "DAYS" }, headcount: { label: "Billable headcount", unit: "COUNT" },
  utilisation: { label: "Utilisation", unit: "PCT" }, contributionMargin: { label: "Contribution margin", unit: "PCT" }, variableCostPct: { label: "Variable cost (% of revenue)", unit: "PCT" },
  fixedCost: { label: "Monthly fixed cost", unit: "INR" }, capex: { label: "Capital expenditure", unit: "INR" }, funding: { label: "Funding available", unit: "INR" },
  dso: { label: "Days sales outstanding", unit: "DAYS" }, cac: { label: "Customer acquisition cost", unit: "INR" }, interestRate: { label: "Interest rate", unit: "PCT" }, debt: { label: "Debt", unit: "INR" },
  revenueFull: { label: "Monthly revenue at full capacity", unit: "INR" }, loanTenure: { label: "Loan tenure (months)", unit: "COUNT" }, equity: { label: "Equity", unit: "INR" },
};
export function fmt(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined || !isFinite(v)) return "\u2014";
  if (unit === "PCT") return (Math.round(v * 10) / 10) + "%";
  if (unit === "DAYS") return Math.round(v) + " days";
  if (unit === "COUNT") return String(Math.round(v * 10) / 10);
  if (unit === "MONTHS") return v > 600 ? "no burn" : (Math.round(v * 10) / 10) + " months";
  const a = Math.abs(v), sign = v < 0 ? "-" : "";
  if (a >= 1e7) return sign + "\u20b9" + (Math.round(a / 1e5) / 100) + " Cr";
  if (a >= 1e5) return sign + "\u20b9" + (Math.round(a / 1e3) / 100) + " L";
  return sign + "\u20b9" + Math.round(a).toLocaleString("en-IN");
}
// Canonical model -> labelled inputs. User-set values win; nothing is invented.
export function inputsFromRegistry(reg: ModelRegistry): Inputs {
  const out: Inputs = {};
  for (const [k, e] of Object.entries(reg || {}) as [string, RegistryEntry][]) {
    const key = REG_KEY[k]; if (!key || e.value === null || !isFinite(e.value as number)) continue;
    const label: Label = e.classification === "user" || e.status === "SET_BY_USER" ? "User Input" : e.classification === "supported" ? "Retrieved Evidence" : "Assumption";
    out[key] = { value: e.value as number, label, source: e.id };
  }
  return out;
}

// ── FINANCIAL MODEL (monthly) ───────────────────────────────────────────────
export interface Outputs {
  ebitda: number | null; interestCoverage: number | null; debtService: number; dscr: number | null; cashFlow: number | null;
  revenue: number | null; contribution: number | null; contributionMarginPct: number | null; fixedCost: number | null; interestCost: number;
  profit: number | null; breakEven: number | null; marginOfSafety: number | null; workingCapital: number | null; cashStart: number | null;
  runwayMonths: number | null; paybackMonths: number | null; missing: string[]; basis: string[];
  breakEvenOccupancy?: number | null;   // % occupancy needed to cover all costs (facilities)
}
export function compute(inp: Inputs): Outputs {
  const v = (k: InputKey) => (inp[k] ? inp[k]!.value : null);
  const missing: string[] = []; const basis: string[] = [];
  let revenue: number | null = null;
  if (v("price") !== null && v("volume") !== null) { revenue = v("price")! * v("volume")!; basis.push("revenue = price \u00d7 volume [Calculation]"); }
  else if (v("dayRate") !== null && v("billableDays") !== null && v("headcount") !== null && v("utilisation") !== null) { revenue = v("dayRate")! * v("billableDays")! * v("headcount")! * v("utilisation")! / 100; basis.push("revenue = day rate \u00d7 billable days \u00d7 headcount \u00d7 utilisation [Calculation]"); }
  else if (v("revenueFull") !== null && v("utilisation") !== null) { revenue = v("revenueFull")! * v("utilisation")! / 100; basis.push("revenue = revenue at full capacity \u00d7 occupancy [Calculation]"); }
  else if (v("revenue") !== null) { revenue = v("revenue")!; basis.push("revenue from the canonical model"); }
  else if (v("revenueFull") !== null) missing.push("expected occupancy (%) \u2014 needed to turn full-capacity revenue into expected revenue");
  else missing.push("revenue (or price \u00d7 volume, or day rate \u00d7 days \u00d7 headcount \u00d7 utilisation)");
  let cm: number | null = v("contributionMargin") !== null ? v("contributionMargin")! / 100 : v("variableCostPct") !== null ? 1 - v("variableCostPct")! / 100 : null;
  if (cm === null) missing.push("contribution margin or variable cost %");
  const fixed = v("fixedCost"); if (fixed === null) missing.push("monthly fixed cost");
  const interestCost = v("debt") !== null && v("interestRate") !== null ? v("debt")! * v("interestRate")! / 100 / 12 : 0;
  if (interestCost) basis.push("interest = debt \u00d7 rate / 12 [Calculation]");
  const contribution = revenue !== null && cm !== null ? revenue * cm : null;
  const ebitda = contribution !== null && fixed !== null ? contribution - fixed : null;
  const profit = ebitda !== null ? ebitda - interestCost : null;
  // Debt service: interest always (when debt + rate known); principal ONLY when a loan
  // tenure is known - a repayment schedule is never invented.
  const principal = v("debt") !== null && v("loanTenure") !== null && v("loanTenure")! > 0 ? v("debt")! / v("loanTenure")! : 0;
  const debtService = interestCost + principal;
  const interestCoverage = ebitda !== null && interestCost > 0 ? ebitda / interestCost : null;
  const dscr = ebitda !== null && principal > 0 ? ebitda / debtService : null;
  if (principal) basis.push("principal = debt / tenure; DSCR = EBITDA / (interest + principal) [Calculation]");
  const cashFlow = ebitda !== null ? ebitda - debtService : null;
  const breakEven = fixed !== null && cm !== null && cm > 0 ? (fixed + interestCost) / cm : null;
  const marginOfSafety = revenue !== null && breakEven !== null && breakEven > 0 ? (revenue - breakEven) / breakEven : null;
  const workingCapital = revenue !== null && v("dso") !== null ? revenue * v("dso")! / 30 : null;   // receivables tied up
  const cashStart = v("funding") !== null ? v("funding")! - (v("capex") || 0) - (workingCapital || 0) : null;
  const runwayMonths = cashStart === null || cashFlow === null ? null : cashFlow >= 0 ? Infinity : cashStart <= 0 ? 0 : cashStart / -cashFlow;
  const paybackMonths = v("capex") !== null && profit !== null && profit > 0 ? v("capex")! / profit : null;
  return { ebitda, interestCoverage, debtService, dscr, cashFlow, revenue, contribution, contributionMarginPct: cm === null ? null : cm * 100, fixedCost: fixed, interestCost, profit, breakEven, marginOfSafety,
    workingCapital, cashStart, runwayMonths, paybackMonths, missing, basis,
    // The occupancy at which the facility covers all costs: needs no occupancy guess at all.
    breakEvenOccupancy: breakEven !== null && v("revenueFull") !== null && v("revenueFull")! > 0 ? breakEven / v("revenueFull")! * 100 : null };
}

// ── DECISION RULES (explicit policy - shown to the user, not hidden) ────────
export type Decision = "PROCEED" | "PROCEED WITH CONDITIONS" | "WAIT" | "DO NOT PROCEED" | "INSUFFICIENT EVIDENCE";
export const DECISION_RULES = {
  doNotProceedBelowBreakEvenRatio: 0.6,   // revenue below 60% of break-even
  minimumRunwayMonths: 6,                 // loss-making with under 6 months of cash
  proceedMarginOfSafety: 0.2,             // 20% headroom above break-even for an unconditional PROCEED
  minDSCR: 1.25,                          // common lender minimum: cash from operations / debt service
  minInterestCoverage: 1.5,               // used when tenure is unknown: operating cash / interest
};
export const DECISION_RANK: Record<Decision, number> = { "DO NOT PROCEED": 0, "WAIT": 1, "PROCEED WITH CONDITIONS": 2, "PROCEED": 3, "INSUFFICIENT EVIDENCE": -1 };
// EVERY failing condition, in plain language (the decision itself still comes from
// decideModel's ordered rules). Used for "Why" so a funding gap never hides a loss.
export function diagnose(o: Outputs): { issue: string; severity: "blocking" | "serious" | "watch" }[] {
  const r = DECISION_RULES; const out: { issue: string; severity: "blocking" | "serious" | "watch" }[] = [];
  if (o.revenue === null || o.breakEven === null) return [{ issue: "The economics cannot be calculated yet (missing: " + o.missing.join("; ") + ").", severity: "blocking" }];
  if (o.cashStart !== null && o.cashStart < 0) out.push({ issue: "The money available does not cover the project plus the cash tied up in unpaid customer bills (short by " + fmt(-o.cashStart, "INR") + ").", severity: "blocking" });
  if (o.revenue < o.breakEven) out.push({ issue: "Expected revenue (" + fmt(o.revenue, "INR") + "/month) is below the level needed to cover all costs (" + fmt(o.breakEven, "INR") + "/month), so the business would lose money each month.", severity: o.revenue < r.doNotProceedBelowBreakEvenRatio * o.breakEven ? "blocking" : "serious" });
  if (o.dscr !== null && o.dscr < r.minDSCR) out.push({ issue: "Operating cash covers the loan payments only " + o.dscr.toFixed(2) + "\u00d7; lenders usually want at least " + r.minDSCR + "\u00d7.", severity: o.dscr < 1 ? "blocking" : "serious" });
  else if (o.dscr === null && o.interestCoverage !== null && o.interestCoverage < r.minInterestCoverage) out.push({ issue: "Operating cash covers the loan interest only " + o.interestCoverage.toFixed(2) + "\u00d7" + (o.interestCoverage < 1 ? " \u2014 not enough to pay the interest at all" : "") + ".", severity: o.interestCoverage < 1 ? "blocking" : "serious" });
  if (o.runwayMonths !== null && isFinite(o.runwayMonths) && o.runwayMonths > 0 && o.runwayMonths < r.minimumRunwayMonths && (o.cashFlow ?? o.profit ?? 0) < 0) out.push({ issue: "At this rate the cash lasts about " + fmt(o.runwayMonths, "MONTHS") + ".", severity: "serious" });
  if (o.revenue >= o.breakEven && (o.marginOfSafety || 0) < r.proceedMarginOfSafety) out.push({ issue: "Revenue is only " + Math.round((o.marginOfSafety || 0) * 100) + "% above break-even, so a small shortfall would turn it into a loss.", severity: "watch" });
  return out;
}
export function decideModel(o: Outputs, openCriticalGates = 0): { decision: Decision; reasons: string[] } {
  const r = DECISION_RULES; const reasons: string[] = [];
  if (o.revenue === null || o.breakEven === null) return { decision: "INSUFFICIENT EVIDENCE", reasons: ["The model is missing: " + o.missing.join("; ") + "."]
    .concat(o.breakEvenOccupancy != null ? [o.breakEvenOccupancy > 100 ? "Even 100% full, the facility would not cover its costs [Calculation]." : "The facility covers all its costs once it is at least " + Math.ceil(o.breakEvenOccupancy) + "% full [Calculation]. Compare that with the occupancy you can realistically achieve."] : []) };
  if (o.cashStart !== null && o.cashStart < 0) return { decision: "DO NOT PROCEED", reasons: ["Funding does not cover capital expenditure plus working capital (short by " + fmt(-o.cashStart, "INR") + ") [Calculation]."] };
  if (o.revenue < r.doNotProceedBelowBreakEvenRatio * o.breakEven) return { decision: "DO NOT PROCEED", reasons: ["Revenue " + fmt(o.revenue, "INR") + " is below " + r.doNotProceedBelowBreakEvenRatio * 100 + "% of break-even " + fmt(o.breakEven, "INR") + " [Calculation]."] };
  if (o.revenue < o.breakEven) return { decision: "WAIT", reasons: ["Revenue " + fmt(o.revenue, "INR") + " is below break-even " + fmt(o.breakEven, "INR") + " [Calculation]."] };
  if (o.runwayMonths !== null && o.runwayMonths < r.minimumRunwayMonths && (o.cashFlow ?? o.profit ?? 0) < 0) return { decision: "WAIT", reasons: ["Cash runway is " + fmt(o.runwayMonths, "MONTHS") + " (< " + r.minimumRunwayMonths + ") [Calculation]."] };
  // DEBT SAFETY: operating cash must cover debt payments with a margin.
  if (o.dscr !== null && o.dscr < r.minDSCR) return { decision: "WAIT", reasons: ["Operating cash covers loan payments only " + o.dscr.toFixed(2) + "\u00d7 (lenders usually need \u2265 " + r.minDSCR + "\u00d7) [Calculation]."] };
  if (o.dscr === null && o.interestCoverage !== null && o.interestCoverage < r.minInterestCoverage) return { decision: "WAIT", reasons: ["Operating cash covers the loan interest only " + o.interestCoverage.toFixed(2) + "\u00d7 (\u2265 " + r.minInterestCoverage + "\u00d7 needed for comfort) [Calculation]."] };
  if ((o.marginOfSafety || 0) < r.proceedMarginOfSafety) reasons.push("Only " + Math.round((o.marginOfSafety || 0) * 100) + "% headroom above break-even (< " + r.proceedMarginOfSafety * 100 + "%) [Calculation].");
  if (openCriticalGates > 0) reasons.push(openCriticalGates === 1 ? "1 condition still needs to be met before you commit money." : openCriticalGates + " conditions still need to be met before you commit money.");
  if (reasons.length) return { decision: "PROCEED WITH CONDITIONS", reasons };
  return { decision: "PROCEED", reasons: ["Revenue clears break-even with " + Math.round((o.marginOfSafety || 0) * 100) + "% headroom and funding covers the plan [Calculation]."] };
}

// ── SENSITIVITY: does changing a variable change the decision? ──────────────
export interface Sensitivity { variable: InputKey; label: string; unit: string; base: number; table: { value: number; decision: Decision }[]; thresholds: { value: number; from: Decision; to: Decision; statement: string }[]; note: string; }
const SWEEPABLE: InputKey[] = ["utilisation", "volume", "price", "dayRate", "revenueFull", "contributionMargin", "variableCostPct", "fixedCost", "capex", "funding", "debt", "interestRate", "dso", "headcount", "billableDays", "revenue"];
function gridFor(k: InputKey, base: number): number[] {
  if (INPUT_LABEL[k].unit === "PCT" && k !== "interestRate") return [20, 30, 40, 50, 60, 70, 80, 90].filter((x, i, a) => a.indexOf(x) === i);
  return [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5].map((f) => base * f);
}
export function sensitivity(inp: Inputs, openCriticalGates = 0): Sensitivity[] {
  const out: Sensitivity[] = [];
  const d = (i: Inputs) => decideModel(compute(i), openCriticalGates).decision;
  if (d(inp) === "INSUFFICIENT EVIDENCE") return [];
  for (const k of SWEEPABLE) {
    const b = inp[k]; if (!b) continue;
    const used = compute(inp); const before = d(inp);
    // only variables that actually feed the model
    const probe = { ...inp, [k]: { ...b, value: b.value * 1.37 + 1 } } as Inputs; const pc = compute(probe);
    if (pc.revenue === used.revenue && pc.breakEven === used.breakEven && pc.cashStart === used.cashStart && pc.profit === used.profit) continue;
    const table = gridFor(k, b.value).map((value) => ({ value, decision: d({ ...inp, [k]: { ...b, value, label: "Scenario" } } as Inputs) }));
    const thresholds: Sensitivity["thresholds"] = [];
    const lo = Math.min(...table.map((t) => t.value)), hi = Math.max(...table.map((t) => t.value));
    const fine = 400; let prev = d({ ...inp, [k]: { ...b, value: lo } } as Inputs);
    for (let i = 1; i <= fine; i++) {
      const x = lo + (hi - lo) * i / fine; const cur = d({ ...inp, [k]: { ...b, value: x } } as Inputs);
      if (cur !== prev) {
        let a = lo + (hi - lo) * (i - 1) / fine, c = x;                     // bisect the boundary
        for (let j = 0; j < 40; j++) { const m = (a + c) / 2; if (d({ ...inp, [k]: { ...b, value: m } } as Inputs) === prev) a = m; else c = m; }
        thresholds.push({ value: c, from: prev, to: cur, statement: INPUT_LABEL[k].label + " at " + fmt(c, INPUT_LABEL[k].unit) + ": " + prev + " \u2192 " + cur + " [Calculation]" });
        prev = cur;
      }
    }
    out.push({ variable: k, label: INPUT_LABEL[k].label, unit: INPUT_LABEL[k].unit, base: b.value, table, thresholds,
      note: thresholds.length ? "" : "Decision stays " + before + " across the tested range." });
  }
  // most decision-sensitive first: nearest threshold relative to the current value
  const dist = (s: Sensitivity) => s.thresholds.length ? Math.min(...s.thresholds.map((t) => Math.abs(t.value - s.base) / Math.max(Math.abs(s.base), 1e-9))) : 9;
  return out.sort((a, b) => dist(a) - dist(b));
}

// ── CHALLENGES & SCENARIOS ──────────────────────────────────────────────────
export type ChallengeVar = "demand" | "price" | "variableCost" | "fixedCost" | "capex" | "funding" | "dso" | "utilisation" | "interestRate" | "cac" | "delay";
export interface Challenge {
  id: string; name: string; category: string; variable: ChallengeVar; change: number | null; changeType: "pct" | "pp" | "abs" | "days" | "months";
  unit: string; direction: "up" | "down" | "unknown"; source: "user" | "preset" | "research"; userEntered: boolean; confidence: "user-stated" | "assumption" | "unknown-magnitude";
  affectedComponents: string[]; baselineValue: number | null; changedValue: number | null; note: string;
  // A change to ONE part of a cost line (e.g. electricity within running costs) needs
  // that part's share; without it the impact is not calculated (never assumed).
  component?: string; share?: number | null;
}
export const SCENARIO_PRESETS: Record<string, { label: string; challenges: Omit<Challenge, "id" | "baselineValue" | "changedValue" | "note" | "affectedComponents">[] }> = {
  base: { label: "Base case", challenges: [] },
  upside: { label: "Upside", challenges: [
    { name: "Demand +15%", category: "economic", variable: "demand", change: 15, changeType: "pct", unit: "%", direction: "up", source: "preset", userEntered: false, confidence: "assumption" },
    { name: "Price +5%", category: "economic", variable: "price", change: 5, changeType: "pct", unit: "%", direction: "up", source: "preset", userEntered: false, confidence: "assumption" }] },
  downside: { label: "Downside", challenges: [
    { name: "Demand \u221220%", category: "economic", variable: "demand", change: -20, changeType: "pct", unit: "%", direction: "down", source: "preset", userEntered: false, confidence: "assumption" },
    { name: "Variable cost +10%", category: "supply chain", variable: "variableCost", change: 10, changeType: "pct", unit: "%", direction: "up", source: "preset", userEntered: false, confidence: "assumption" }] },
  stress: { label: "Stress", challenges: [
    { name: "Demand \u221230%", category: "economic", variable: "demand", change: -30, changeType: "pct", unit: "%", direction: "down", source: "preset", userEntered: false, confidence: "assumption" },
    { name: "Variable cost +20%", category: "supply chain", variable: "variableCost", change: 20, changeType: "pct", unit: "%", direction: "up", source: "preset", userEntered: false, confidence: "assumption" },
    { name: "DSO +30 days", category: "economic", variable: "dso", change: 30, changeType: "days", unit: "days", direction: "up", source: "preset", userEntered: false, confidence: "assumption" }] },
  blackSwan: { label: "Black swan", challenges: [
    { name: "Demand \u221250%", category: "economic", variable: "demand", change: -50, changeType: "pct", unit: "%", direction: "down", source: "preset", userEntered: false, confidence: "assumption" },
    { name: "Funding \u221250%", category: "economic", variable: "funding", change: -50, changeType: "pct", unit: "%", direction: "down", source: "preset", userEntered: false, confidence: "assumption" },
    { name: "Capex +25%", category: "economic", variable: "capex", change: 25, changeType: "pct", unit: "%", direction: "up", source: "preset", userEntered: false, confidence: "assumption" }] },
};
const COMPONENTS: Record<ChallengeVar, string[]> = {
  demand: ["revenue", "contribution", "profit", "break-even headroom", "cash runway", "working capital"], price: ["revenue", "contribution", "profit", "break-even headroom", "cash runway"],
  variableCost: ["contribution margin", "break-even", "profit", "cash runway"], fixedCost: ["break-even", "profit", "cash runway"],
  capex: ["capital requirement", "cash at start", "cash runway", "payback"], funding: ["cash at start", "cash runway", "financing requirement"],
  dso: ["receivables", "working capital", "cash at start", "cash runway"], utilisation: ["revenue", "profit", "break-even headroom", "cash runway"],
  interestRate: ["interest cost", "break-even", "profit"], cac: ["acquisition cost", "payback"], delay: ["revenue start", "cash runway"],
};
// Apply challenges to the canonical inputs. Returns the changed inputs, what was
// affected, and what could NOT be applied (variable missing from the model).
export function applyChallenges(inp: Inputs, challenges: Challenge[]): { inputs: Inputs; applied: Challenge[]; notApplied: Challenge[] } {
  const out: Inputs = JSON.parse(JSON.stringify(inp)); const applied: Challenge[] = []; const notApplied: Challenge[] = [];
  const set = (k: InputKey, nv: number, c: Challenge) => { const before = out[k]!.value; out[k] = { value: nv, label: "Scenario", source: c.name }; applied.push({ ...c, baselineValue: before, changedValue: nv, affectedComponents: COMPONENTS[c.variable] }); };
  for (const c of challenges) {
    if (c.change === null) { notApplied.push({ ...c, note: "Impact direction known; magnitude uncertain. Enter a value to calculate it.", affectedComponents: COMPONENTS[c.variable] || [] }); continue; }
    const pct = (k: InputKey) => out[k]!.value * (1 + c.change! / 100);
    const has = (k: InputKey) => !!out[k];
    switch (c.variable) {
      case "demand":
        if (has("volume")) set("volume", pct("volume"), c); else if (has("utilisation") && (has("revenueFull") || has("dayRate"))) set("utilisation", Math.max(0, Math.min(100, pct("utilisation"))), c);
        else if (has("revenue")) set("revenue", pct("revenue"), c); else notApplied.push({ ...c, note: "No volume, utilisation or revenue in the model to apply demand to.", affectedComponents: COMPONENTS.demand }); break;
      case "price":
        if (has("price")) set("price", pct("price"), c); else if (has("dayRate")) set("dayRate", pct("dayRate"), c); else if (has("revenueFull")) set("revenueFull", pct("revenueFull"), c);
        else if (has("revenue")) set("revenue", pct("revenue"), c); else notApplied.push({ ...c, note: "No price, day rate or revenue in the model.", affectedComponents: COMPONENTS.price }); break;
      case "variableCost": {
        const vc = has("variableCostPct") ? out.variableCostPct!.value : has("contributionMargin") ? 100 - out.contributionMargin!.value : null;
        if (vc === null) { notApplied.push({ ...c, note: "No variable cost or contribution margin in the model.", affectedComponents: COMPONENTS.variableCost }); break; }
        if (c.component && (c.share === null || c.share === undefined)) { notApplied.push({ ...c, note: "Impact direction known; magnitude uncertain \u2014 enter what share of your running costs is " + c.component + " to calculate it.", affectedComponents: COMPONENTS.variableCost }); break; }
        const eff = c.component ? c.change * (c.share as number) / 100 : c.change;
        const nvc = Math.min(100, vc * (1 + eff / 100));
        if (has("variableCostPct")) set("variableCostPct", nvc, c); else set("contributionMargin", 100 - nvc, c); break; }
      case "utilisation":
        if (!has("utilisation")) { notApplied.push({ ...c, note: "No utilisation in the model.", affectedComponents: COMPONENTS.utilisation }); break; }
        set("utilisation", Math.max(0, Math.min(100, c.changeType === "pp" ? out.utilisation!.value + c.change : pct("utilisation"))), c); break;
      case "dso":
        if (!has("dso") && c.changeType === "abs") { out.dso = { value: c.change, label: "Scenario", source: c.name }; applied.push({ ...c, baselineValue: null, changedValue: c.change, affectedComponents: COMPONENTS.dso }); break; }
        if (!has("dso")) { notApplied.push({ ...c, note: "No DSO / payment cycle in the model.", affectedComponents: COMPONENTS.dso }); break; }
        set("dso", Math.max(0, c.changeType === "abs" ? c.change : c.changeType === "days" ? out.dso!.value + c.change : pct("dso")), c); break;
      case "funding":
        if (c.changeType === "abs") { if (has("funding")) set("funding", c.change, c); else { out.funding = { value: c.change, label: "Scenario", source: c.name }; applied.push({ ...c, baselineValue: null, changedValue: c.change, affectedComponents: COMPONENTS.funding }); } break; }
        if (!has("funding")) { notApplied.push({ ...c, note: "No funding figure in the model.", affectedComponents: COMPONENTS.funding }); break; }
        set("funding", pct("funding"), c); break;
      case "interestRate":
        if (!has("interestRate") || !has("debt")) { notApplied.push({ ...c, note: "No debt and interest rate in the model, so interest impact cannot be calculated.", affectedComponents: COMPONENTS.interestRate }); break; }
        set("interestRate", c.changeType === "pp" ? out.interestRate!.value + c.change : pct("interestRate"), c); break;
      default: {
        const k = ({ fixedCost: "fixedCost", capex: "capex", cac: "cac" } as Record<string, InputKey>)[c.variable];
        if (!k || !has(k)) { notApplied.push({ ...c, note: "No " + c.variable + " in the model.", affectedComponents: COMPONENTS[c.variable] || [] }); break; }
        set(k, c.changeType === "abs" ? c.change : pct(k), c);
      }
    }
  }
  return { inputs: out, applied, notApplied };
}
let _cid = 0;
// Natural-language challenge -> structured challenges. Deterministic; magnitudes
// are taken ONLY from numbers the user wrote. Qualitative events get a direction
// and up to 3 questions, never an invented magnitude.
const QUALITATIVE: { re: RegExp; category: string; name: string; effects: { variable: ChallengeVar; direction: "up" | "down" }[] }[] = [
  { re: /water (shortage|scarcity|crisis)|drought/i, category: "environmental", name: "Water shortage", effects: [{ variable: "utilisation", direction: "down" }, { variable: "variableCost", direction: "up" }] },
  { re: /power (cut|interruption|outage|shortage)|electricity (shortage|outage)|load.?shedding/i, category: "infrastructure", name: "Power interruption", effects: [{ variable: "utilisation", direction: "down" }, { variable: "variableCost", direction: "up" }] },
  { re: /labou?r shortage|staff shortage|attrition|strike/i, category: "labour", name: "Labour shortage", effects: [{ variable: "fixedCost", direction: "up" }, { variable: "utilisation", direction: "down" }] },
  { re: /supplier (disruption|failure|delay)|supply (shock|disruption)|shortage of (raw )?materials?/i, category: "supply chain", name: "Supplier disruption", effects: [{ variable: "variableCost", direction: "up" }, { variable: "demand", direction: "down" }] },
  { re: /logistics|shipping|freight|transport (disruption|strike)/i, category: "supply chain", name: "Logistics disruption", effects: [{ variable: "variableCost", direction: "up" }] },
  { re: /regulat\w* (delay|approval)|licen[cs]e delay|permit delay|approval delay/i, category: "political/regulatory", name: "Regulatory delay", effects: [{ variable: "delay", direction: "up" }] },
  { re: /inflation/i, category: "inflation", name: "Inflation", effects: [{ variable: "variableCost", direction: "up" }, { variable: "fixedCost", direction: "up" }] },
  { re: /competitor|price war/i, category: "competitor", name: "Competitor price pressure", effects: [{ variable: "price", direction: "down" }] },
  { re: /recession|slowdown|downturn/i, category: "economic", name: "Economic slowdown", effects: [{ variable: "demand", direction: "down" }] },
  { re: /(largest|biggest|major|key|anchor) (customer|client|buyer)s? (may |could |might |will )?(leave|exit|stop|churn|switch)/i, category: "competitor", name: "Loss of a major customer", effects: [{ variable: "demand", direction: "down" }] },
  { re: /subsid(y|ies) (may |could |might |will )?(disappear|be withdrawn|end|stop|be removed)|(withdraw|end|remove)\w* (the )?subsid/i, category: "government policy", name: "Subsidy withdrawn", effects: [{ variable: "capex", direction: "up" }] },
  { re: /(rupee|currency|inr) (depreciat|weaken|fall)|exchange rate/i, category: "currency", name: "Currency weakens", effects: [{ variable: "variableCost", direction: "up" }] },
  { re: /flood|heatwave|heat wave|cyclone|extreme weather|climate/i, category: "climate", name: "Extreme weather", effects: [{ variable: "utilisation", direction: "down" }] },
  { re: /political|unrest|election|policy uncertainty/i, category: "political/regulatory", name: "Political uncertainty", effects: [{ variable: "demand", direction: "down" }] },
  { re: /funding (is |may be |could be )?(limited|constrained|tight|short)|limited (funding|capital)/i, category: "economic", name: "Limited funding", effects: [{ variable: "funding", direction: "down" }] },
];
const VAR_WORDS: { re: RegExp; variable: ChallengeVar; category: string }[] = [
  { re: /\bdemand|sales volume|orders|customers\b/i, variable: "demand", category: "economic" },
  { re: /\b(variable|raw material|material|input|unit) costs?\b/i, variable: "variableCost", category: "supply chain" },
  { re: /\bfixed costs?|overheads?|rent|salar(y|ies)\b/i, variable: "fixedCost", category: "economic" },
  { re: /\bcapex|capital expenditure|project cost|setup cost\b/i, variable: "capex", category: "economic" },
  { re: /\bfunding|capital available|investment available|funds?\b|\b(?:i|we) (?:only )?have\b|\bonly\s+(?=(?:\u20b9|rs\.?\s?)\s?\d)|\bbudget\b/i, variable: "funding", category: "economic" },
  { re: /\bdso|payment (cycle|terms|delay)|receivables?|debtor days\b/i, variable: "dso", category: "economic" },
  { re: /\butili[sz]ation\b/i, variable: "utilisation", category: "operations" },
  { re: /\binterest rates?\b/i, variable: "interestRate", category: "interest rates" },
  { re: /\bcac|acquisition cost\b/i, variable: "cac", category: "economic" },
  { re: /\bprices?|fees?|rates?\b/i, variable: "price", category: "economic" },
];
export function parseChallenge(text: string): { challenges: Challenge[]; questions: string[]; summary: string } {
  const t = String(text || "").trim(); const challenges: Challenge[] = []; const questions: string[] = [];
  const down = /\b(fall|falls|fell|drop|drops|decline|declines|cut|cuts|reduce|reduced|lower|less|down|only|shrink|halved?|delay)\b|-\s?\d/i.test(t);
  const up = /\b(rise|rises|increase|increases|up|more|higher|grow|grows|jump|spike|doubles?)\b|\+\s?\d/i.test(t);
  const pct = t.match(/([+-]?\d+(?:\.\d+)?)\s?%/); const pp = t.match(/([+-]?\d+(?:\.\d+)?)\s?(pp|percentage points?)/i);
  const days = t.match(/([+-]?\d+)\s?days?/i); const money = t.match(/(\u20b9|rs\.?\s?)\s?(\d[\d,]*(?:\.\d+)?)\s*(crore|cr\b|lakh|lac\b|l\b)?/i);
  const half = /\b(halved|cut in half|by half|half)\b/i.test(t);
  const sign = down && !up ? -1 : 1;
  const mk = (variable: ChallengeVar, category: string, change: number | null, changeType: Challenge["changeType"], unit: string, name: string, dir: Challenge["direction"]): Challenge =>
    ({ id: "CH-" + String(++_cid).padStart(3, "0"), name, category, variable, change, changeType, unit, direction: dir, source: "user", userEntered: true,
       confidence: change === null ? "unknown-magnitude" : "user-stated", affectedComponents: COMPONENTS[variable] || [], baselineValue: null, changedValue: null, note: "" });
  const qual = QUALITATIVE.filter((q) => q.re.test(t));
  const vw = VAR_WORDS.find((w) => w.re.test(t));
  if (vw && (pct || pp || days || money || half)) {
    const v = vw.variable;
    if (v === "funding" && money) { const n = parseFloat(money[2].replace(/,/g, "")) * (/crore|cr/i.test(money[3] || "") ? 1e7 : /lakh|lac|^l$/i.test(money[3] || "") ? 1e5 : 1); challenges.push(mk("funding", "economic", n, "abs", "INR", "Funding = " + fmt(n, "INR"), "down")); }
    else if (half) challenges.push(mk(v, vw.category, -50, "pct", "%", vw.variable + " \u221250%", "down"));
    else if (pp) challenges.push(mk(v, vw.category, Math.abs(parseFloat(pp[1])) * (pp[1].startsWith("-") ? -1 : sign), "pp", "pp", v + " " + (sign < 0 ? "\u2212" : "+") + Math.abs(parseFloat(pp[1])) + " pp", sign < 0 ? "down" : "up"));
    else if (days && v === "dso") challenges.push(mk("dso", "economic", Math.abs(parseFloat(days[1])) * (days[1].startsWith("-") ? -1 : sign), "days", "days", "DSO " + (sign < 0 ? "\u2212" : "+") + Math.abs(parseFloat(days[1])) + " days", sign < 0 ? "down" : "up"));
    else if (pct) { const n = parseFloat(pct[1]); const val = pct[1].startsWith("-") || pct[1].startsWith("+") ? n : n * sign; challenges.push(mk(v, vw.category, val, "pct", "%", v + " " + (val < 0 ? "\u2212" : "+") + Math.abs(val) + "%", val < 0 ? "down" : "up")); }
  }
  for (const q of qual) for (const e of q.effects) {
    if (challenges.some((c) => c.variable === e.variable)) continue;
    challenges.push(mk(e.variable, q.category, null, e.variable === "delay" ? "months" : e.variable === "utilisation" ? "pp" : "pct", e.variable === "delay" ? "months" : "%", q.name + " \u2192 " + e.variable + " " + (e.direction === "up" ? "\u2191" : "\u2193"), e.direction));
  }
  if (!challenges.length && vw) challenges.push(mk(vw.variable, vw.category, null, "pct", "%", vw.variable + " " + (sign < 0 ? "\u2193" : up ? "\u2191" : "?"), sign < 0 ? "down" : up ? "up" : "unknown"));
  for (const c of challenges.filter((x) => x.change === null).slice(0, 3))
    questions.push(c.variable === "delay" ? "Roughly how many months could this delay revenue?" : "Roughly how much could this change " + c.variable + " (e.g. " + (c.direction === "down" ? "\u221215%" : "+15%") + ")?");
  const summary = challenges.length ? challenges.map((c) => c.name + (c.change === null ? " (magnitude uncertain)" : "")).join("; ") : "Not recognised as a quantifiable business challenge.";
  return { challenges, questions: questions.slice(0, 3), summary };
}

// One sentence may hold several challenges ("demand falls 20%, electricity costs rise
// 15%, and customers pay 30 days later"): each clause is parsed with ITS OWN direction.
const ENERGY_RE = /\b(electricity|power|energy|fuel|diesel|gas) (price|cost|tariff|bill)s?\b|\b(price|cost|tariff)s? of (electricity|power|energy|fuel)\b/i;
const mkCh = (p: Partial<Challenge> & { name: string; variable: ChallengeVar }): Challenge => ({ id: "CH-" + String(++_cid).padStart(3, "0"), category: "economic", change: null, changeType: "pct", unit: "%",
  direction: "up", source: "user", userEntered: true, confidence: "user-stated", affectedComponents: COMPONENTS[p.variable] || [], baselineValue: null, changedValue: null, note: "", ...p } as Challenge);
export function parseChallenges(text: string): { challenges: Challenge[]; questions: string[]; summary: string } {
  const clauses = String(text || "").split(/;|\.\s|\n|,\s*(?:and\s+)?|\s+and\s+(?=[a-z]+\s+(?:may|might|could|will|is|are|falls?|rises?|drops?|increases?|decreases?|take|pay|becomes?|leaves?|disappears?|costs?|prices?)\b)/i)
    .map((x) => x.trim()).filter((x) => x.length > 2);
  const all: Challenge[] = [];
  for (const cl of clauses) {
    if (ENERGY_RE.test(cl)) {   // affects only PART of running costs -> needs that share
      const pct = cl.match(/([+-]?\d+(?:\.\d+)?)\s?%/); const down = /\b(fall|drop|decline|lower|cheaper|reduce)/i.test(cl);
      all.push(mkCh({ name: "Electricity / energy cost " + (pct ? (down ? "\u2212" : "+") + Math.abs(parseFloat(pct[1])) + "%" : (down ? "\u2193" : "\u2191")), category: "energy", variable: "variableCost",
        change: pct ? Math.abs(parseFloat(pct[1])) * (down ? -1 : 1) : null, direction: down ? "down" : "up", confidence: pct ? "user-stated" : "unknown-magnitude", component: "electricity / energy", share: null }));
      continue;
    }
    const abs = cl.match(/(?:take|takes|taking|pay (?:us )?in|paid in|credit of)\s+(\d+)\s?-?\s?days?/i) || cl.match(/(\d+)\s?-?\s?days?\s+(?:to pay|credit|payment terms)/i);
    if (abs && !/later|longer|more|extra|additional|\+/.test(cl)) { all.push(mkCh({ name: "Customers pay in " + abs[1] + " days", variable: "dso", change: parseFloat(abs[1]), changeType: "abs", unit: "days" })); continue; }
    const later = cl.match(/(\d+)\s?-?\s?days?\s+(?:later|longer|more|extra)/i);
    if (later) { all.push(mkCh({ name: "Customers pay " + later[1] + " days later", variable: "dso", change: parseFloat(later[1]), changeType: "days", unit: "days" })); continue; }
    const r = parseChallenge(cl);
    for (const c of r.challenges) if (c.variable === "interestRate" && c.changeType === "pct" && c.change !== null) { c.changeType = "pp"; c.unit = "pp"; c.name = "Interest rate " + (c.change < 0 ? "\u2212" : "+") + Math.abs(c.change) + " pp"; }
    // A clause with neither a direction nor a number ("demand looks attractive") is not a challenge.
    all.push(...r.challenges.filter((c) => !(c.change === null && c.direction === "unknown")));
  }
  const merged: Challenge[] = [];   // one per variable+component; a stated magnitude wins
  for (const c of all) {
    const k = c.variable + "|" + (c.component || ""); const i = merged.findIndex((m) => m.variable + "|" + (m.component || "") === k);
    if (i < 0) merged.push(c); else if (merged[i].change === null && c.change !== null) merged[i] = c;
  }
  const questions: string[] = [];
  for (const c of merged) {
    if (questions.length >= 3) break;
    if (c.component && c.share == null) questions.push("What share of your running costs is " + c.component + " (e.g. 20%)?");
    else if (c.change === null) questions.push(c.variable === "delay" ? "Roughly how many months could this delay revenue?" : c.variable === "funding" ? "How much funding do you actually have (e.g. \u20b980 lakh)?" : "Roughly how much could this change " + c.variable + " (e.g. " + (c.direction === "down" ? "\u221215%" : "+15%") + ")?");
  }
  return { challenges: merged, questions, summary: merged.length ? merged.map((c) => c.name + (c.change === null || (c.component && c.share == null) ? " (magnitude uncertain)" : "")).join("; ") : "Not recognised as a quantifiable business challenge." };
}

// ── WHY DID THE DECISION CHANGE? ────────────────────────────────────────────
export function explainDecisionChange(base: Inputs, scen: Inputs, baseDecision: Decision, newDecision: Decision): { changed: boolean; headline: string; variables: string[]; because: string[] } {
  const variables: string[] = [];
  for (const k of Object.keys({ ...base, ...scen }) as InputKey[]) {
    const a = base[k]?.value, b = scen[k]?.value; if (!INPUT_LABEL[k]) continue;
    if (a === undefined && b !== undefined) variables.push(INPUT_LABEL[k].label + ": added " + fmt(b, INPUT_LABEL[k].unit));
    else if (a !== undefined && b !== undefined && Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a))) variables.push(INPUT_LABEL[k].label + ": " + fmt(a, INPUT_LABEL[k].unit) + " \u2192 " + fmt(b, INPUT_LABEL[k].unit));
  }
  const key = (x: string) => x.replace(/[\d.,\u20b9%\u00d7]+|\bL\b|\bCr\b/g, "").replace(/\s+/g, " ").slice(0, 50);
  const before = diagnose(compute(base)), after = diagnose(compute(scen));
  const appeared = after.filter((x) => !before.some((y) => key(y.issue) === key(x.issue))).map((x) => "New problem: " + x.issue);
  const solved = before.filter((x) => !after.some((y) => key(y.issue) === key(x.issue))).map((x) => "Resolved: " + x.issue);
  const changed = baseDecision !== newDecision;
  return { changed, variables, because: [...appeared, ...solved],
    headline: changed ? "Your decision changed from " + baseDecision + " to " + newDecision + " because " + (variables.length ? variables.slice(0, 3).join("; ") : "the inputs changed") + "."
      : "The decision stays " + newDecision + (variables.length ? " even with: " + variables.slice(0, 3).join("; ") : "") + "." };
}

// ── ACTUAL RESULTS FROM THE GENERAL LEDGER (read-only) ──────────────────────
export interface Actuals { periodDays: number; from: string; to: string; revenue: number; expenses: number; profit: number; cash: number; receivables: number; payables: number; entries: number; label: "ACTUAL RESULT"; }
export function actualsFromLedger(entries: { date: string; lines: { accountCode: string; debit: number; credit: number }[] }[], accounts: { code: string; name: string; type: string }[], periodDays = 30, now = new Date()): Actuals | null {
  if (!Array.isArray(entries) || !entries.length) return null;
  const acc = new Map(accounts.map((a) => [a.code, a])); const to = now.getTime(), from = to - periodDays * 864e5;
  let revenue = 0, expenses = 0, cash = 0, receivables = 0, payables = 0, n = 0;
  for (const e of entries) {
    const t = new Date(e.date).getTime(); const inPeriod = isFinite(t) && t >= from && t <= to; if (inPeriod) n++;
    for (const l of e.lines || []) {
      const a = acc.get(l.accountCode); if (!a) continue; const d = +l.debit || 0, c = +l.credit || 0;
      if (inPeriod && a.type === "Income") revenue += c - d;
      if (inPeriod && a.type === "Expense") expenses += d - c;
      if (a.type === "Asset" && /cash|bank/i.test(a.name)) cash += d - c;
      if (a.type === "Asset" && /receivable/i.test(a.name)) receivables += d - c;
      if (a.type === "Liability" && /payable/i.test(a.name)) payables += c - d;
    }
  }
  if (!n) return null;
  return { periodDays, from: new Date(from).toISOString().slice(0, 10), to: new Date(to).toISOString().slice(0, 10), revenue, expenses, profit: revenue - expenses, cash, receivables, payables, entries: n, label: "ACTUAL RESULT" };
}
// EXPECTED (plan) vs SIMULATED (scenario) vs ACTUAL (ledger) - always separate columns.
export function planVsActual(plan: Outputs, sim: Outputs | null, act: Actuals | null): { metric: string; expected: string; simulated: string; actual: string }[] {
  const m = (v: number | null | undefined) => fmt(v ?? null, "INR"); const per = act ? 30 / act.periodDays : 1;
  return [
    { metric: "Revenue / month", expected: m(plan.revenue), simulated: sim ? m(sim.revenue) : "\u2014", actual: act ? m(act.revenue * per) : "no ledger data" },
    { metric: "Profit / month", expected: m(plan.profit), simulated: sim ? m(sim.profit) : "\u2014", actual: act ? m(act.profit * per) : "no ledger data" },
    { metric: "Receivables", expected: m(plan.workingCapital), simulated: sim ? m(sim.workingCapital) : "\u2014", actual: act ? m(act.receivables) : "no ledger data" },
    { metric: "Cash", expected: m(plan.cashStart), simulated: sim ? m(sim.cashStart) : "\u2014", actual: act ? m(act.cash) : "no ledger data" },
  ];
}

// ── TIME HORIZONS ───────────────────────────────────────────────────────────
export const HORIZONS = [3, 6, 12, 36, 60];
export interface Projection { months: number; points: { month: number; cash: number | null; cumulativeProfit: number | null }[]; failureMonth: number | null; recovery: string; caveat: string; }
// Constant monthly run-rate (no growth assumed); revenue starts after any delay.
export function project(inp: Inputs, months: number, delayMonths = 0): Projection {
  const o = compute(inp); const pts: Projection["points"] = []; let failure: number | null = null;
  const burnDuringDelay = -((o.fixedCost || 0) + o.interestCost);
  for (let m = 0; m <= months; m++) {
    const profitToDate = o.profit === null ? null : (Math.min(m, delayMonths) * burnDuringDelay + Math.max(0, m - delayMonths) * o.profit);
    const cash = o.cashStart === null || profitToDate === null ? null : o.cashStart + profitToDate;
    if (failure === null && cash !== null && cash < 0) failure = m;
    pts.push({ month: m, cash, cumulativeProfit: profitToDate });
  }
  const recovery = failure !== null && o.breakEven !== null ? "To stop the burn, monthly revenue must reach " + fmt(o.breakEven, "INR") + " (break-even) before month " + failure + " [Calculation]." : "";
  return { months, points: pts, failureMonth: failure, recovery,
    caveat: "[Calculation] Constant monthly run-rate with no growth assumed" + (delayMonths ? "; revenue starts after " + delayMonths + " month(s)" : "") + ". This is a simulation, not a forecast." };
}

// ── SCENARIO RUN + COMPARISON ───────────────────────────────────────────────
export interface ScenarioState {
  scenarioId: string; parentDecisionId: string; baseModelVersion: string; scenarioType: "base" | "upside" | "downside" | "stress" | "blackSwan" | "custom";
  name: string; userChallenges: Challenge[]; variableOverrides: { variable: string; from: number | null; to: number }[]; affectedVariables: string[];
  assumptions: string[]; evidence: string[]; simulationOutputs: Outputs; horizonMonths: number; projection: Projection; decisionResult: Decision;
  decisionReasons: string[]; baseDecision: Decision; decisionChanged: boolean; decisionThresholds: string[]; recommendedActions: string[]; triggers: string[];
  stopConditions: string[]; notApplied: string[]; createdAt: string; updatedAt: string; label: "SIMULATION RESULT";
}
export function modelVersion(inp: Inputs): string {
  const s = JSON.stringify(Object.entries(inp).sort().map(([k, v]) => [k, Math.round((v as Val).value * 100) / 100]));
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return "M" + (h >>> 0).toString(36);
}
export function runScenario(base: Inputs, type: ScenarioState["scenarioType"], challenges: Challenge[], opts: { parentDecisionId: string; horizonMonths?: number; openCriticalGates?: number; name?: string; overrides?: { variable: InputKey; to: number }[] }): ScenarioState {
  const preset = SCENARIO_PRESETS[type];
  const all: Challenge[] = [...(preset ? preset.challenges.map((c) => ({ ...c, id: "P-" + c.name, baselineValue: null, changedValue: null, note: "", affectedComponents: [] } as Challenge)) : []), ...challenges];
  const ap = applyChallenges(base, all);
  const overrides: ScenarioState["variableOverrides"] = [];
  for (const ov of opts.overrides || []) { overrides.push({ variable: ov.variable, from: ap.inputs[ov.variable]?.value ?? null, to: ov.to }); ap.inputs[ov.variable] = { value: ov.to, label: "User Input", source: "scenario override" }; }
  const delay = all.filter((c) => c.variable === "delay" && c.change !== null).reduce((s, c) => s + (c.change || 0), 0);
  const gates = opts.openCriticalGates || 0;
  const outB = compute(base), out = compute(ap.inputs);
  const dB = decideModel(outB, gates).decision; const dS = decideModel(out, gates);
  const sens = sensitivity(ap.inputs, gates);
  const proj = project(ap.inputs, opts.horizonMonths || 12, delay);
  const now = new Date().toISOString();
  const thresholds = sens.flatMap((s) => s.thresholds.map((t) => t.statement)).slice(0, 5);
  return { scenarioId: "SC-" + type + "-" + modelVersion(ap.inputs) + "-" + Math.round(Math.random() * 1e6).toString(36), parentDecisionId: opts.parentDecisionId, baseModelVersion: modelVersion(base),
    scenarioType: type, name: opts.name || (preset ? preset.label : "Custom scenario"), userChallenges: challenges, variableOverrides: overrides,
    affectedVariables: Array.from(new Set(ap.applied.flatMap((c) => c.affectedComponents))),
    assumptions: [...(preset && preset.challenges.length ? ["Scenario preset \u201c" + preset.label + "\u201d: " + preset.challenges.map((c) => c.name).join(", ") + " [Assumption]"] : []),
      ...ap.applied.filter((c) => c.source === "user").map((c) => c.name + " [User Input]"), ...out.basis],
    evidence: Object.entries(ap.inputs).filter(([, v]) => (v as Val).label === "Retrieved Evidence").map(([k, v]) => INPUT_LABEL[k as InputKey].label + " " + fmt((v as Val).value, INPUT_LABEL[k as InputKey].unit) + " [Retrieved Evidence: " + (v as Val).source + "]"),
    simulationOutputs: out, horizonMonths: opts.horizonMonths || 12, projection: proj, decisionResult: dS.decision, decisionReasons: dS.reasons, baseDecision: dB,
    decisionChanged: dB !== dS.decision, decisionThresholds: thresholds,
    recommendedActions: actionsFor(dS.decision, out, sens), triggers: triggersFor(out, sens), stopConditions: stopFor(out),
    notApplied: ap.notApplied.map((c) => c.name + ": " + c.note), createdAt: now, updatedAt: now, label: "SIMULATION RESULT" };
}
function actionsFor(d: Decision, o: Outputs, sens: Sensitivity[]): string[] {
  const top = sens[0];
  if (d === "INSUFFICIENT EVIDENCE") return ["Provide the missing model inputs: " + o.missing.join("; ") + "."];
  if (d === "DO NOT PROCEED") return o.cashStart !== null && o.cashStart < 0
    ? ["Do not commit capital under these conditions.", "Re-test an asset-light or phased plan (lower capex).", "Secure additional funding of at least " + fmt(-o.cashStart, "INR") + " before re-deciding."]
    : ["Do not commit capital under these conditions.", "Find a route to break-even revenue " + fmt(o.breakEven, "INR") + "/month (price, volume or cost).", top ? "Watch " + top.label.toLowerCase() + " \u2014 it is the most decision-sensitive variable." : "Re-run once demand evidence improves."];
  if (d === "WAIT") return ["Do not commit capex yet.", "Close the gap to break-even (" + fmt(o.breakEven, "INR") + "/month).", top && top.thresholds[0] ? "Proceed when " + top.thresholds[0].statement.replace(" [Calculation]", "") + "." : "Re-test after the next evidence update."];
  if (d === "PROCEED WITH CONDITIONS") return ["Proceed only as a limited pilot.", "Monitor " + (top ? top.label.toLowerCase() : "break-even headroom") + " monthly.", "Close the open decision gates before scaling."];
  return ["Proceed with the plan.", "Track revenue against break-even monthly.", "Set the stop and escalation triggers below."];
}
function triggersFor(o: Outputs, sens: Sensitivity[]): string[] {
  const t = sens.slice(0, 3).flatMap((s) => s.thresholds.slice(0, 1).map((x) => "IF " + s.label.toLowerCase() + " crosses " + fmt(x.value, s.unit) + " \u2192 decision becomes " + x.to));
  if (o.runwayMonths !== null && isFinite(o.runwayMonths)) t.push("IF cash runway < " + DECISION_RULES.minimumRunwayMonths + " months \u2192 trigger the cost-control plan");
  return t;
}
function stopFor(o: Outputs): string[] {
  const s: string[] = [];
  if (o.contribution !== null) s.push("STOP if monthly contribution turns negative (revenue below variable costs).");
  if (o.breakEven !== null) s.push("STOP scaling if revenue stays below " + fmt(DECISION_RULES.doNotProceedBelowBreakEvenRatio * o.breakEven, "INR") + "/month (60% of break-even) for 3 months.");
  return s;
}
export function evaluateTriggers(o: Outputs): { stop: boolean; escalate: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const stop = (o.contribution !== null && o.contribution < 0) || (o.revenue !== null && o.breakEven !== null && o.revenue < DECISION_RULES.doNotProceedBelowBreakEvenRatio * o.breakEven);
  if (stop) reasons.push(o.contribution !== null && o.contribution < 0 ? "Contribution is negative." : "Revenue is below 60% of break-even.");
  const escalate = o.runwayMonths !== null && o.runwayMonths < DECISION_RULES.minimumRunwayMonths && (o.profit || 0) < 0;
  if (escalate) reasons.push("Cash runway " + fmt(o.runwayMonths, "MONTHS") + " is under " + DECISION_RULES.minimumRunwayMonths + " months.");
  return { stop, escalate, reasons };
}
export function compareScenarios(runs: ScenarioState[]): { metric: string; values: string[] }[] {
  const pick = (f: (r: ScenarioState) => string) => runs.map(f);
  return [
    { metric: "Revenue / month", values: pick((r) => fmt(r.simulationOutputs.revenue, "INR")) },
    { metric: "Contribution margin", values: pick((r) => fmt(r.simulationOutputs.contributionMarginPct, "PCT")) },
    { metric: "Profit / month", values: pick((r) => fmt(r.simulationOutputs.profit, "INR")) },
    { metric: "Break-even / month", values: pick((r) => fmt(r.simulationOutputs.breakEven, "INR")) },
    { metric: "Cash at start", values: pick((r) => fmt(r.simulationOutputs.cashStart, "INR")) },
    { metric: "Runway", values: pick((r) => fmt(r.simulationOutputs.runwayMonths, "MONTHS")) },
    { metric: "Cash failure point", values: pick((r) => r.projection.failureMonth === null ? "none in " + r.horizonMonths + " mo" : "month " + r.projection.failureMonth) },
    { metric: "Decision", values: pick((r) => r.decisionResult) },
  ];
}

// ── DECISION MAP ────────────────────────────────────────────────────────────
export interface Gate { name: string; status: "PASS" | "FAIL" | "OPEN" | "UNKNOWN"; threshold: string; current: string; evidence: string; owner: string; ifPass: string; ifFail: string; }
export interface DecisionMap {
  decision: Decision; oneSentence: string; confidence: string; why: string[]; mattersMost: string[]; gates: Gate[]; nextActions: string[];
  wouldChange: string[]; userMustDecide: string[]; tree: { step: string; text: string }[]; modelDecision: Decision; boardDecision: string; simulationNotes: string[];
}
export function buildDecisionMap(p: { analysis: any; inputs: Inputs; intel?: any; scenarios?: ScenarioState[] }): DecisionMap {
  const a = p.analysis || {}; const d = a.decision || {}; const intel = p.intel || {};
  const openUQ = (a.userQuestions || []).filter((u: any) => u.status === "open");
  const hiGaps = (intel.gaps || []).filter((g: any) => g.priority === "high" && g.current_status !== "closed");
  const material = (a.contradictions || []).filter((c: any) => c.severity === "HIGH" && c.status !== "resolved" && c.status !== "conditionally_resolved");
  const incomplete = (a.rows || []).filter((r: any) => !r.complete);
  const gatesOpen = openUQ.length + hiGaps.length + material.length;
  const o = compute(p.inputs); const md = decideModel(o, gatesOpen); const sens = sensitivity(p.inputs, gatesOpen);
  // Evidence state can only make the decision MORE cautious than the model, never less.
  const boardText = String(d.decision || "");
  const fromBoard: Decision = /do not proceed/i.test(boardText) ? "DO NOT PROCEED" : /^wait/i.test(boardText) ? "WAIT" : /conditions/i.test(boardText) ? "PROCEED WITH CONDITIONS" : /proceed/i.test(boardText) ? "PROCEED" : "INSUFFICIENT EVIDENCE";
  let decision: Decision = md.decision !== "INSUFFICIENT EVIDENCE" ? md.decision : fromBoard;
  if (d.confidence === "INSUFFICIENT" && decision !== "DO NOT PROCEED") decision = "INSUFFICIENT EVIDENCE";
  if (decision === "PROCEED" && (gatesOpen || incomplete.length)) decision = "PROCEED WITH CONDITIONS";
  // Unquantified economics never get an unconditional PROCEED: the board's verdict is
  // capped until the "unit economics" gate can actually be evaluated.
  if (decision === "PROCEED" && md.decision === "INSUFFICIENT EVIDENCE") decision = "PROCEED WITH CONDITIONS";
  // Fix 2.1: a verdict resting on an ESTIMATED revenue driver (e.g. occupancy the user did
  // not know) is never unconditional - verifying that estimate becomes a stated condition.
  const assumedDrivers = (["utilisation", "volume", "price", "revenue", "revenueFull", "dayRate"] as InputKey[]).filter((k) => p.inputs[k] && p.inputs[k]!.label === "Assumption");
  if (decision === "PROCEED" && assumedDrivers.length) decision = "PROCEED WITH CONDITIONS";
  const gates: Gate[] = [];
  for (const k of assumedDrivers.slice(0, 2)) gates.push({ name: "Verify the estimated " + (INPUT_LABEL as any)[k].label.toLowerCase(), status: "OPEN", threshold: "confirmed by quotes, contracts or comparable businesses",
    current: fmt(p.inputs[k]!.value, (INPUT_LABEL as any)[k].unit) + " [Assumption]", evidence: "estimated by the executives, not given by you", owner: "You / CFO",
    ifPass: "The decision stands on a verified number", ifFail: "Re-run with the real figure before committing money" });
  if (o.revenue !== null && o.breakEven !== null) gates.push({ name: "Revenue covers break-even", status: o.revenue >= o.breakEven ? "PASS" : "FAIL", threshold: fmt(o.breakEven, "INR") + "/month [Calculation]",
    current: fmt(o.revenue, "INR") + "/month", evidence: labelsOf(p.inputs, ["revenue", "price", "volume", "dayRate", "utilisation", "billableDays", "headcount"]), owner: "CFO", ifPass: "Economics support proceeding", ifFail: "WAIT until revenue or costs change" });
  else gates.push({ name: "Unit economics quantified", status: "UNKNOWN", threshold: "revenue and break-even both calculable", current: "missing: " + o.missing.join("; "), evidence: "\u2014", owner: "CFO", ifPass: "The model can test the decision", ifFail: "Decision rests on judgement, not calculation" });
  if (o.cashStart !== null) gates.push({ name: "Funding covers capex + working capital", status: o.cashStart >= 0 ? "PASS" : "FAIL", threshold: "\u2265 " + fmt((p.inputs.capex?.value || 0) + (o.workingCapital || 0), "INR") + " [Calculation]",
    current: fmt(p.inputs.funding?.value ?? null, "INR"), evidence: labelsOf(p.inputs, ["funding", "capex", "dso"]), owner: "CFO / You", ifPass: "Plan is fundable", ifFail: "DO NOT PROCEED unless funding rises or capex falls" });
  for (const u of openUQ.slice(0, 3)) gates.push({ name: "Your answer: " + u.question, status: "OPEN", threshold: "answered by you", current: "unanswered", evidence: "[User Input] required", owner: "You", ifPass: "Executives reason from your answer", ifFail: "Decision stays conditional" });
  for (const g of hiGaps.slice(0, 3)) gates.push({ name: "Evidence: " + g.question.replace(/\[evidence gap\]\s*/i, ""), status: "OPEN", threshold: "sourced evidence found", current: g.current_status.replace(/_/g, " "), evidence: "missing", owner: "Research Desk", ifPass: "Assumption replaced by evidence", ifFail: "Risk remains unquantified" });
  for (const c of material.filter((x: any, i: number, arr: any[]) => arr.findIndex((y: any) => y.variable === x.variable) === i).slice(0, 2)) gates.push({ name: "Resolve " + c.variable + " conflict (" + c.executiveA + " vs " + c.executiveB + ")", status: "OPEN", threshold: "one agreed value", current: "conflicting", evidence: c.type, owner: "Chairman", ifPass: "One canonical figure", ifFail: "Decision uses a range, not a value" });
  const nextActions = [
    ...openUQ.slice(0, 2).map((u: any) => "Answer " + u.id + ": " + u.question),
    ...hiGaps.slice(0, 2).map((g: any) => "Close evidence gap " + g.id + ": " + g.question.replace(/\[evidence gap\]\s*/i, "")),
    ...material.slice(0, 1).map((c: any) => "Settle the " + c.variable + " figure between " + c.executiveA + " and " + c.executiveB),
    ...actionsFor(decision, o, sens),
  ].slice(0, 3);
  const wouldChange = sens.flatMap((s) => s.thresholds.slice(0, 1).map((t) => t.statement)).slice(0, 5);
  if (!wouldChange.length) wouldChange.push(o.missing.length ? "Threshold cannot be calculated from current evidence (missing: " + o.missing.join("; ") + ")." : "No tested variable changes the decision within \u00b150%.");
  const why = [...(assumedDrivers.length ? ["This rests on an ESTIMATED " + assumedDrivers.map((k) => (INPUT_LABEL as any)[k].label.toLowerCase()).join(" and ") + " (" + assumedDrivers.map((k) => fmt(p.inputs[k]!.value, (INPUT_LABEL as any)[k].unit)).join(", ") + ") [Assumption] \u2014 verify it before committing money."] : []),
    ...md.reasons, ...(d.why || []).filter((w: string) => !/^Model:/.test(w))].slice(0, 5);
  const alt = (intel.alternatives || [])[0];
  const tree = [
    { step: "NOW", text: nextActions[0] || "Review the decision gates" },
    { step: "THEN", text: nextActions[1] || "Run a downside scenario" },
    { step: "IF GATES PASS", text: decision === "PROCEED" ? "Scale with monthly monitoring" : "Proceed to a limited pilot" },
    { step: "IF GATES FAIL", text: alt ? "Switch to the alternative: " + String(alt.text).slice(0, 140) : "Re-test an asset-light / phased plan in Time Machine" },
    ...triggersFor(o, sens).slice(0, 2).map((t) => ({ step: "TRIGGER", text: t })),
  ];
  const simNotes = (p.scenarios || []).filter((s) => s.decisionChanged).slice(-3).map((s) => "SIMULATION RESULT: \u201c" + s.name + "\u201d changed the decision from " + s.baseDecision + " to " + s.decisionResult + ".");
  const oneSentence = decision === "INSUFFICIENT EVIDENCE" ? "The board cannot responsibly decide yet: " + (o.missing.length ? "the economics are not quantified." : "key evidence is missing or contested.")
    : decision + ": " + (md.reasons[0] || why[0] || "").replace(/ \[Calculation\]/g, "");
  return { decision, oneSentence, confidence: d.confidence || "INSUFFICIENT", why, mattersMost: sens.slice(0, 5).map((s) => s.label + " (now " + fmt(s.base, s.unit) + ")"),
    gates, nextActions, wouldChange, userMustDecide: openUQ.map((u: any) => u.id + " " + u.question), tree, modelDecision: md.decision, boardDecision: boardText, simulationNotes: simNotes };
}
function labelsOf(inp: Inputs, keys: InputKey[]): string {
  const ls = Array.from(new Set(keys.map((k) => inp[k]?.label).filter(Boolean))); return ls.length ? ls.map((l) => "[" + l + "]").join(" ") : "\u2014";
}

// ── AUTOPILOT: DECISION RESPONSE ────────────────────────────────────────────
export interface DecisionResponse {
  currentState: string; recommendedAction: string; why: string; expectedImpact: string; risk: string; trigger: string; owner: string; deadline: string;
  stopCondition: string; escalationCondition: string; settled: boolean; settledNote: string; changedFromPrior: { from: Decision; to: Decision; reason: string } | null;
  alternatives: { name: string; decision: Decision; note: string }[]; triggerStatus: { stop: boolean; escalate: boolean; reasons: string[] };
}
// "If I were operating this business under these conditions, what would I do next?"
// Uses the persisted Boardroom decision; does NOT re-decide settled questions unless
// a challenge, scenario or new evidence changes the result.
export function decisionResponse(p: { map: DecisionMap; base: Inputs; scenario?: ScenarioState | null; priorDecision?: { decision: Decision; at: string } | null; newEvidence?: boolean }): DecisionResponse {
  const active = p.scenario || null; const inputs = active ? applyChallengesFromScenario(p.base, active) : p.base;
  const o = compute(inputs); const gatesOpen = p.map.gates.filter((g) => g.status === "OPEN").length;
  const now = active ? active.decisionResult : p.map.decision;
  const prior = p.priorDecision || null;
  const settled = !!prior && !active && !p.newEvidence && prior.decision === p.map.decision;
  const changed = prior && prior.decision !== now ? { from: prior.decision, to: now, reason: active ? "Scenario \u201c" + active.name + "\u201d: " + (active.decisionReasons[0] || "") : "New evidence or answers changed the model." } : null;
  const alts: DecisionResponse["alternatives"] = [];
  if (inputs.capex) {
    const al: Inputs = { ...inputs, capex: { value: 0, label: "Scenario", source: "asset-light alternative" } };
    alts.push({ name: "Asset-light pilot (no capex)", decision: decideModel(compute(al), gatesOpen).decision, note: "capex removed [Calculation]" });
    const ph: Inputs = { ...inputs, capex: { value: inputs.capex.value * 0.5, label: "Scenario", source: "phased alternative" } };
    alts.push({ name: "Phased plan (half the capex)", decision: decideModel(compute(ph), gatesOpen).decision, note: "capex \u221250% [Calculation]" });
  }
  if (inputs.fixedCost) { const lc: Inputs = { ...inputs, fixedCost: { value: inputs.fixedCost.value * 0.8, label: "Scenario", source: "cost-control alternative" } };
    alts.push({ name: "Cost-control plan (fixed cost \u221220%)", decision: decideModel(compute(lc), gatesOpen).decision, note: "fixed cost \u221220% [Calculation]" }); }
  const sens = sensitivity(inputs, gatesOpen); const ts = evaluateTriggers(o);
  const failing = p.map.gates.find((g) => g.status === "FAIL") || p.map.gates.find((g) => g.status === "OPEN");
  const action = settled ? "Continue executing the Boardroom decision (" + prior!.decision + "); no new information requires re-deciding."
    : now === "DO NOT PROCEED" ? (alts.find((x) => DECISION_RANK[x.decision] >= DECISION_RANK["PROCEED WITH CONDITIONS"]) ? "Do not proceed with the original plan; switch to: " + alts.find((x) => DECISION_RANK[x.decision] >= 2)!.name + "." : "Do not proceed; protect cash and re-test when conditions change.")
    : now === "WAIT" ? "Do not expand or commit capex; " + (failing ? "resolve \u201c" + failing.name + "\u201d first." : "close the gap to break-even first.")
    : now === "PROCEED WITH CONDITIONS" ? "Proceed only as a limited pilot; " + (failing ? "gate scaling on \u201c" + failing.name + "\u201d." : "monitor break-even headroom monthly.")
    : now === "PROCEED" ? "Proceed; monitor the triggers monthly." : "Provide the missing model inputs before deciding.";
  return {
    currentState: (active ? "SIMULATION RESULT under \u201c" + active.name + "\u201d: " : "") + now + (o.revenue !== null && o.breakEven !== null ? " \u2014 revenue " + fmt(o.revenue, "INR") + " vs break-even " + fmt(o.breakEven, "INR") + " [Calculation]" : ""),
    recommendedAction: action, why: (active ? active.decisionReasons : p.map.why).slice(0, 2).join(" ") || p.map.oneSentence,
    expectedImpact: o.profit !== null ? "Monthly profit " + fmt(o.profit, "INR") + (o.runwayMonths !== null ? "; runway " + fmt(o.runwayMonths, "MONTHS") : "") + " [Calculation]" : "Not quantifiable from current inputs.",
    risk: sens[0] && sens[0].thresholds[0] ? "Most sensitive: " + sens[0].thresholds[0].statement : p.map.wouldChange[0] || "\u2014",
    trigger: sens[0] && sens[0].thresholds[0] ? "Re-decide if " + sens[0].label.toLowerCase() + " crosses " + fmt(sens[0].thresholds[0].value, sens[0].unit) : "Re-decide when a decision gate changes status",
    owner: failing ? failing.owner : "CEO", deadline: now === "DO NOT PROCEED" || ts.escalate ? "Immediately" : now === "WAIT" ? "Within 30 days" : "Within 14 days",
    stopCondition: stopFor(o)[0] || "\u2014", escalationCondition: "Escalate to the board if cash runway falls below " + DECISION_RULES.minimumRunwayMonths + " months" + (o.runwayMonths !== null && isFinite(o.runwayMonths) ? " (now " + fmt(o.runwayMonths, "MONTHS") + ")" : "") + ".",
    settled, settledNote: settled ? "Settled by the Boardroom on " + new Date(prior!.at).toLocaleDateString("en-IN") + "; not re-decided." : "",
    changedFromPrior: changed, alternatives: alts, triggerStatus: ts };
}
export function applyChallengesFromScenario(base: Inputs, s: ScenarioState): Inputs {
  const preset = SCENARIO_PRESETS[s.scenarioType];
  const all = [...(preset ? preset.challenges.map((c) => ({ ...c, id: "P-" + c.name, baselineValue: null, changedValue: null, note: "", affectedComponents: [] } as Challenge)) : []), ...s.userChallenges];
  const r = applyChallenges(base, all).inputs;
  for (const ov of s.variableOverrides) r[ov.variable as InputKey] = { value: ov.to, label: "User Input", source: "scenario override" };
  return r;
}

// ── QUICK "WHAT IF?" from the actual model + risk register ──────────────────
export function quickWhatIfs(inp: Inputs, risks: string[] = []): { label: string; text: string }[] {
  const q: { label: string; text: string }[] = [];
  if (inp.volume || inp.utilisation || inp.revenue) q.push({ label: "Demand falls 20%", text: "demand falls 20%" });
  if (inp.price || inp.dayRate) q.push({ label: "Prices fall 10%", text: "competitor cuts price 10%" });
  if (inp.variableCostPct || inp.contributionMargin) q.push({ label: "Costs rise 15%", text: "variable costs rise 15%" });
  if (inp.funding) q.push({ label: "Funding cut in half", text: "funding is cut in half" });
  if (inp.dso) q.push({ label: "Customers pay 30 days later", text: "DSO +30 days" });
  if (inp.capex) q.push({ label: "Capex overruns 25%", text: "capex rises 25%" });
  for (const r of risks.slice(0, 6)) { const pc = parseChallenge(r); if (pc.challenges.length && q.length < 8 && !q.some((x) => x.label === pc.summary)) q.push({ label: pc.summary.slice(0, 40), text: r }); }
  return q.slice(0, 8);
}

// ── EXTERNAL FACTORS (only researched ones are evidence) ────────────────────
export interface ExternalFactor { category: string; text: string; source: string; date: string; affectedVariable: ChallengeVar | ""; direction: "up" | "down" | "unknown"; confidence: "retrieved" | "assumption"; impactRange: string; scenarioRelevance: string; verified: boolean; }
const EXT_CATS: { cat: string; re: RegExp; variable: ChallengeVar | "" }[] = [
  { cat: "inflation", re: /inflation|cpi|wpi/i, variable: "variableCost" }, { cat: "interest rates", re: /repo rate|interest rate|rbi policy/i, variable: "interestRate" },
  { cat: "regulation", re: /regulat|rera|licen[cs]|compliance|act\b|rules?\b/i, variable: "fixedCost" }, { cat: "taxation", re: /\bgst\b|tax|cess|duty/i, variable: "variableCost" },
  { cat: "supply chain", re: /supply|supplier|material|cement|steel|sand/i, variable: "variableCost" }, { cat: "labour", re: /labou?r|wage|workforce|skill/i, variable: "fixedCost" },
  { cat: "weather / environmental", re: /monsoon|rain|heat|water|drought|flood|pollution|grap/i, variable: "utilisation" }, { cat: "infrastructure", re: /power|electricity|road|metro|infrastructure/i, variable: "utilisation" },
  { cat: "competitor", re: /competit|market share|fragmented/i, variable: "price" }, { cat: "economic", re: /gdp|demand|growth|slowdown/i, variable: "demand" },
];
export function externalFactorsFromEvidence(ev: { items: { id: string; text: string; sourceIds: string[] }[]; sources: { id: string; url: string }[] }, tierOf: (url: string) => number): ExternalFactor[] {
  const out: ExternalFactor[] = [];
  for (const it of ev.items) {
    const c = EXT_CATS.find((x) => x.re.test(it.text)); if (!c) continue;
    const url = it.sourceIds.length ? ev.sources.find((s) => s.id === it.sourceIds[0])?.url || "" : "";
    const verified = !!url && tierOf(url) <= 4;   // only a retrieved, tier 1-4 source makes it evidence
    out.push({ category: c.cat, text: it.text.replace(/\(\[source\]\([^)]*\)\)/g, "").replace(/^[-*\u2022]\s*/, "").trim(), source: url ? it.id + " " + url : it.id, date: (it.text.match(/\b20\d\d\b/) || [""])[0],
      affectedVariable: c.variable, direction: /rise|increase|up|higher|grew|growth|mandatory/i.test(it.text) ? "up" : /fall|decline|down|lower|drop|delay/i.test(it.text) ? "down" : "unknown",
      confidence: verified ? "retrieved" : "assumption", impactRange: "not quantified", scenarioRelevance: c.variable ? "can be tested as a " + c.variable + " scenario" : "context only", verified });
  }
  return out.slice(0, 12);
}

// ── CROSS-MODULE HANDOFF (Boardroom -> Time Machine -> Autopilot -> Boardroom) ─
export interface DecisionHandoff { sessionId: string | number; question: string; decision: Decision; confidence: string; at: string; inputs?: Inputs;
  gates: { name: string; status: string }[]; scenarios: { name: string; decision: Decision; base: Decision; changed: boolean; at: string }[];
  response: { action: string; trigger: string; stop: string; escalation: string } | null; }
export function buildHandoff(p: { sessionId: string | number; question: string; map: DecisionMap; scenarios: ScenarioState[]; response?: DecisionResponse | null; inputs?: Inputs }): DecisionHandoff {
  return { sessionId: p.sessionId, question: p.question, decision: p.map.decision, confidence: p.map.confidence, at: new Date().toISOString(), inputs: p.inputs,
    gates: p.map.gates.map((g) => ({ name: g.name, status: g.status })),
    scenarios: p.scenarios.slice(-5).map((s) => ({ name: s.name, decision: s.decisionResult, base: s.baseDecision, changed: s.decisionChanged, at: s.createdAt })),
    response: p.response ? { action: p.response.recommendedAction, trigger: p.response.trigger, stop: p.response.stopCondition, escalation: p.response.escalationCondition } : null };
}
// Prompt text for other modules. Simulations are labelled - never presented as facts.
export function handoffContext(h: DecisionHandoff | null | undefined): string {
  if (!h || !h.question) return "";
  const L = ["\n\nPRIOR BOARDROOM DECISION (persisted, " + new Date(h.at).toLocaleDateString("en-IN") + ") for \u201c" + h.question + "\u201d: " + h.decision + " (confidence " + h.confidence + ")."];
  if (h.gates.length) L.push("Decision gates: " + h.gates.map((g) => g.name + " = " + g.status).join("; ") + ".");
  for (const s of h.scenarios) L.push("SIMULATION RESULT (not a fact): scenario \u201c" + s.name + "\u201d " + (s.changed ? "changed the recommendation from " + s.base + " to " + s.decision : "left the recommendation at " + s.decision) + ".");
  if (h.response) L.push("Autopilot response: " + h.response.action + " Trigger: " + h.response.trigger + ". " + h.response.stop + " " + h.response.escalation);
  L.push("Do not re-decide this unless new evidence, a user challenge or a changed trigger justifies it; if you disagree, say why.");
  return L.join("\n");
}
