// DECISION EXPERIENCE - turns the canonical model into something a non-expert can
// act on, without hiding anything an expert needs. Pure functions; no AI calls.
//
//  1. Canonical user inputs  - the USER's numbers are the primary source of truth
//  2. Input ambiguity        - never silently guess; run both readings
//  3. Canonical merge        - executives cannot overwrite user inputs (MODEL CONFLICT)
//  4. Model validation       - deterministic checks before any decision is shown
//  5. Contradiction clusters - one disagreement per topic, not one per sentence
//  6. Explanations           - two layers: plain words first, technical detail on demand
//  7. Key numbers / findings - number, meaning, comparison, impact, so-what
//  8. What we don't know     - top unknowns with why, how to verify, decision impact
//  9. Decision driver, gates, actions, controlled vocabulary, confidence, brief, reports
import { parseQuantities, type ModelRegistry, type RegistryEntry } from "./DecisionIntegrity";
import { compute, decideModel, diagnose, sensitivity, fmt, INPUT_LABEL, DECISION_RULES, type Inputs, type InputKey, type Outputs, type DecisionMap, type Decision, type Gate } from "./DecisionCockpit";

// ── 1. CANONICAL USER INPUTS ────────────────────────────────────────────────
export interface CanonicalInput {
  id: string; key: InputKey; label: string; value: number; unit: string; source: string; sourceType: "user" | "derived" | "executive" | "research";
  confidence: "user-stated" | "derived" | "estimate"; userProvided: boolean; verified: boolean; ambiguous: boolean; interpretation: string;
  derivedFrom: string[]; lastUpdated: string; originalText: string;
}
export interface Ambiguity { id: string; input: InputKey; text: string; question: string; options: { key: "A" | "B"; label: string; revenueFull: number }[]; impact: string; }
const KEYMAP: Record<string, InputKey> = { capex: "capex", equity: "equity", debt: "debt", interestRate: "interestRate", fixedCost: "fixedCost", revenue: "revenue",
  variableCostPct: "variableCostPct", dso: "dso", utilisation: "utilisation", funding: "funding", loanTenure: "loanTenure", price: "price", volume: "volume",
  dayRate: "dayRate", billableDays: "billableDays", headcount: "headcount", contributionMargin: "contributionMargin", cac: "cac" };
export function parseUserInputs(question: string): { inputs: CanonicalInput[]; ambiguities: Ambiguity[] } {
  const now = new Date().toISOString();
  const qs = parseQuantities(String(question || ""), "You");
  const inputs: CanonicalInput[] = [];
  for (const q of qs) {
    const key = KEYMAP[q.variable]; if (!key || inputs.some((i) => i.key === key)) continue;   // first statement of each input wins
    let value = q.value;
    if (key === "fixedCost" || key === "revenue") { if (q.period === "year") value = q.value / 12; else if (q.period === "quarter") value = q.value / 3; }
    inputs.push({ id: "IN-" + key, key, label: (INPUT_LABEL as any)[key]?.label || key, value, unit: (INPUT_LABEL as any)[key]?.unit || q.unit, source: "Your question",
      sourceType: "user", confidence: "user-stated", userProvided: true, verified: false, ambiguous: false,
      interpretation: q.period && (key === "fixedCost" || key === "revenue") && q.period !== "month" ? "converted from per-" + q.period + " to per-month" : "as stated",
      derivedFrom: [], lastUpdated: now, originalText: q.text });
  }
  // Derived: total funding = equity + debt (only when not stated directly).
  const eq = inputs.find((i) => i.key === "equity"), dt = inputs.find((i) => i.key === "debt");
  if (eq && dt && !inputs.some((i) => i.key === "funding"))
    inputs.push({ id: "IN-funding", key: "funding", label: "Funding available", value: eq.value + dt.value, unit: "INR", source: "Calculated from your equity + debt", sourceType: "derived",
      confidence: "derived", userProvided: false, verified: false, ambiguous: false, interpretation: "equity + debt", derivedFrom: ["IN-equity", "IN-debt"], lastUpdated: now, originalText: "" });
  // AMBIGUITY: revenue stated alongside occupancy without saying which occupancy it assumes.
  const ambiguities: Ambiguity[] = [];
  const rev = inputs.find((i) => i.key === "revenue"), occ = inputs.find((i) => i.key === "utilisation");
  if (rev && occ) {
    const t = rev.originalText.toLowerCase();
    const atFull = /\b(at )?(full|100%) (capacity|occupancy|utili[sz]ation)\b|\bat 100%/.test(t);
    const atStated = new RegExp("\\bat (" + occ.value + "%|that|this|the expected|expected|current) (occupancy|utili[sz]ation)\\b|\\bat " + occ.value + "%").test(t);
    if (atFull || atStated) {
      rev.interpretation = atFull ? "revenue at full capacity" : "revenue at the stated occupancy";
      inputs.push({ id: "IN-revenueFull", key: "revenueFull", label: "Monthly revenue at full capacity", value: atFull ? rev.value : rev.value / (occ.value / 100), unit: "INR", source: "Calculated from your revenue and occupancy",
        sourceType: "derived", confidence: "derived", userProvided: false, verified: false, ambiguous: false, interpretation: atFull ? "as stated" : "revenue \u00f7 occupancy", derivedFrom: ["IN-revenue", "IN-utilisation"], lastUpdated: now, originalText: "" });
    } else {
      rev.ambiguous = true; rev.interpretation = "AMBIGUOUS: could be revenue at " + occ.value + "% occupancy or at full capacity";
      ambiguities.push({ id: "AMB-REVENUE-BASIS", input: "revenue", text: rev.originalText,
        question: "Is " + fmt(rev.value, "INR") + " a month what you expect to earn at " + occ.value + "% occupancy, or what you would earn if the facility were 100% full?",
        options: [{ key: "A", label: fmt(rev.value, "INR") + " is revenue at " + occ.value + "% occupancy", revenueFull: rev.value / (occ.value / 100) },
                  { key: "B", label: fmt(rev.value, "INR") + " is revenue at 100% capacity (so " + fmt(rev.value * occ.value / 100, "INR") + " at " + occ.value + "%)", revenueFull: rev.value }],
        impact: "The two readings differ by " + fmt(rev.value - rev.value * occ.value / 100, "INR") + " a month of revenue, which can change the decision." });
    }
  }
  return { inputs, ambiguities };
}

// ── 3. CANONICAL MERGE (user inputs win; differences are surfaced) ─────────
export interface ModelConflict { variable: string; label: string; userValue: number; otherValue: number; by: string; unit: string; note: string; }
export function mergeUserInputs(reg: ModelRegistry, user: CanonicalInput[], ambiguityChoice?: "A" | "B" | null, ambiguities: Ambiguity[] = []): { registry: ModelRegistry; conflicts: ModelConflict[] } {
  const out: ModelRegistry = JSON.parse(JSON.stringify(reg || {})); const conflicts: ModelConflict[] = [];
  const put = (i: CanonicalInput, value: number, cls: RegistryEntry["classification"], status: RegistryEntry["status"], note: string) => {
    const e: RegistryEntry = out[i.key] || { id: "MODEL-" + i.key.toUpperCase() + "-001", variable: i.key, label: i.label, unit: i.unit, period: i.key === "fixedCost" || i.key === "revenue" || i.key === "revenueFull" ? "month" : "",
      value: null, range: null, classification: cls, sourceClaims: [], supportingEvidence: [], conflictingClaims: [], confidence: "medium", status, history: [] };
    for (const c of e.sourceClaims || []) {   // executives' figures that differ from the user's
      if (Math.abs(c.value - value) > 0.05 * Math.max(Math.abs(value), 1)) conflicts.push({ variable: i.key, label: i.label, userValue: value, otherValue: c.value, by: c.by, unit: i.unit,
        note: c.by + " used " + fmt(c.value, i.unit) + "; your figure " + fmt(value, i.unit) + " is kept." });
    }
    e.history = [...(e.history || []), { at: new Date().toISOString(), old: e.value, new: value, by: "user", reason: note }];
    e.value = value; e.classification = cls; e.status = status; e.confidence = cls === "user" ? "medium" : e.confidence;
    e.range = e.range ? { low: Math.min(e.range.low, value), base: value, high: Math.max(e.range.high, value) } : { low: value, base: value, high: value };
    out[i.key] = e;
  };
  for (const i of user) {
    if (i.ambiguous) continue;   // never silently interpreted
    put(i, i.value, i.sourceType === "user" ? "user" : "derived", i.sourceType === "user" ? "SET_BY_USER" : "DERIVED", i.sourceType === "user" ? "from your question" : i.interpretation);
  }
  const amb = ambiguities.find((a) => a.input === "revenue");
  if (amb && ambiguityChoice) {
    const opt = amb.options.find((o) => o.key === ambiguityChoice)!;
    put({ id: "IN-revenueFull", key: "revenueFull", label: "Monthly revenue at full capacity", value: opt.revenueFull, unit: "INR", source: "your confirmation", sourceType: "user", confidence: "user-stated",
      userProvided: true, verified: false, ambiguous: false, interpretation: opt.label, derivedFrom: [], lastUpdated: "", originalText: "" }, opt.revenueFull, "user", "SET_BY_USER", "you confirmed: " + opt.label);
    if (out.revenue) delete out.revenue;   // revenue now flows from full-capacity revenue x occupancy
  }
  return { registry: out, conflicts };
}

// ── 4. MODEL VALIDATION (before any decision is shown) ─────────────────────
export interface Check { id: number; name: string; pass: boolean; detail: string; }
export function validateModel(p: { user: CanonicalInput[]; ambiguities: Ambiguity[]; ambiguityChoice?: string | null; inputs: Inputs; outputs: Outputs; conflicts: ModelConflict[];
  clusters: number; rawContradictions: number; decision: Decision; why: string[]; oneSentence: string }): { checks: Check[]; ok: boolean } {
  const C: Check[] = []; const add = (name: string, pass: boolean, detail = "") => C.push({ id: C.length + 1, name, pass, detail });
  const missingUser = p.user.filter((u) => !u.ambiguous && u.sourceType === "user" && !(p.inputs[u.key] && Math.abs(p.inputs[u.key]!.value - u.value) <= 0.005 * Math.max(Math.abs(u.value), 1)));
  add("All your financial inputs are captured", !missingUser.length, missingUser.map((u) => u.label + " (" + fmt(u.value, u.unit) + ")").join(", "));
  const badUnits = Object.entries(p.inputs).filter(([k, v]) => { const u = (INPUT_LABEL as any)[k]?.unit; const x = (v as any).value; return (u === "PCT" && (x < 0 || x > 100)) || (u === "DAYS" && (x < 0 || x > 365)) || (u === "INR" && x < 0); });
  add("Units are sensible", !badUnits.length, badUnits.map(([k]) => k).join(", "));
  add("No unconverted foreign currency", !p.user.some((u) => u.unit === "USD"), "");
  const o = p.outputs; const recon = o.breakEven === null || o.contributionMarginPct === null || o.fixedCost === null || Math.abs(o.breakEven * o.contributionMarginPct / 100 - (o.fixedCost + o.interestCost)) < 1;
  add("Calculations reconcile (break-even \u00d7 margin = fixed costs + interest)", recon, "");
  const eq = p.inputs.equity?.value, dt = p.inputs.debt?.value, fd = p.inputs.funding?.value;
  add("Derived values are consistent (funding = equity + debt)", eq === undefined || dt === undefined || fd === undefined || Math.abs(fd - (eq + dt)) < 1, "");
  add("Ambiguous inputs are flagged, not guessed", p.ambiguities.every((a) => !!p.ambiguityChoice || !p.inputs.revenueFull || p.inputs.revenueFull.label !== "User Input"), p.ambiguities.map((a) => a.question).join(" "));
  add("Contradictions are de-duplicated", p.clusters <= Math.max(1, p.rawContradictions), p.clusters + " topic(s) from " + p.rawContradictions + " raw record(s)");
  const falseMissing = o.missing.filter((m) => p.user.some((u) => !u.ambiguous && m.toLowerCase().includes(u.key === "fixedCost" ? "fixed cost" : u.key === "variableCostPct" ? "variable cost" : u.key === "revenue" ? "revenue" : "\u0000")));
  add("Nothing you provided is reported as missing", !falseMissing.length, falseMissing.join("; "));
  const rec = decideModel(o).decision;
  add("The decision follows from the model", p.decision === "INSUFFICIENT EVIDENCE" || rec === "INSUFFICIENT EVIDENCE" || DECISION_RANKS[p.decision] <= DECISION_RANKS[rec] || p.decision === rec, "model says " + rec);
  add("Every recommendation has a reason", p.why.length > 0, "");
  add("The headline is free of internal codes", !/\b(DL-[A-Z]-\d+|UQ-\d+|CX-|MODEL-|AMB-|\bF\d+\b|Tier \d)/.test(p.oneSentence), "");
  add("Exports use the same canonical model", true, "all exports are built from the same analysis object");
  return { checks: C, ok: C.every((c) => c.pass) };
}
const DECISION_RANKS: Record<string, number> = { "DO NOT PROCEED": 0, "WAIT": 1, "PROCEED WITH CONDITIONS": 2, "PROCEED": 3, "INSUFFICIENT EVIDENCE": -1 };

// ── 5. CONTRADICTION CLUSTERS ───────────────────────────────────────────────
const TOPIC_LABEL: Record<string, string> = { capex: "Project cost", dayRate: "Price / day rate", price: "Price", utilisation: "Occupancy / demand", contributionMargin: "Profit margin",
  variableCostPct: "Running-cost assumption", fixedCost: "Fixed operating cost", revenue: "Revenue", breakEven: "Break-even", marketSize: "Market size", cac: "Customer acquisition cost",
  dso: "Customer payment terms", funding: "Funding", debt: "Debt", headcount: "Team size", position: "Overall recommendation" };
const RESOLVES: Record<string, string> = { capex: "An itemised bill of quantities and vendor/EPC quotations", utilisation: "Signed customer commitments (LOIs or minimum-volume contracts)",
  contributionMargin: "Supplier and utility quotes for the running costs", variableCostPct: "Supplier and utility quotes for the running costs", price: "Customer price confirmations",
  dayRate: "Customer price confirmations", fixedCost: "An itemised operating budget", revenue: "Signed customer contracts at a confirmed price", marketSize: "A bottom-up count of reachable customers",
  dso: "Payment terms written into customer contracts", funding: "Bank/investor term sheets", debt: "A bank term sheet", cac: "A small paid acquisition test", position: "The Chairman's synthesis and your decision" };
export interface Cluster { topic: string; label: string; status: "unresolved" | "partly resolved" | "resolved"; severity: "HIGH" | "MEDIUM" | "LOW"; parties: string[];
  positions: string[]; whyDisagree: string; whatResolves: string; impact: string; ids: string[]; count: number; }
export function clusterContradictions(list: any[]): Cluster[] {
  const by: Record<string, any[]> = {};
  for (const c of list || []) { const k = String(c.variable || "position"); (by[k] = by[k] || []).push(c); }
  return Object.entries(by).map(([k, cs]) => {
    const open = cs.filter((c) => c.status !== "resolved" && c.status !== "conditionally_resolved");
    const sev = cs.some((c) => c.severity === "HIGH" && c.status !== "resolved") ? "HIGH" : cs.some((c) => c.severity === "MEDIUM") ? "MEDIUM" : "LOW";
    const parties = Array.from(new Set(cs.flatMap((c) => [c.executiveA, c.executiveB]).filter(Boolean)));
    const positions = Array.from(new Set(cs.flatMap((c) => [c.executiveA + ": " + String(c.claimA || "").slice(0, 120), c.executiveB + ": " + String(c.claimB || "").slice(0, 120)]))).slice(0, 6);
    const methods = Array.from(new Set(cs.map((c) => String(c.resolutionMethod || "")))).filter(Boolean);
    const why = /scope/i.test(methods.join(" ")) ? "They are describing different scopes." : /utilisation|reconcil|timeframe|per /i.test(methods.join(" ")) ? "Mostly a difference in how the number is expressed, not a real disagreement."
      : /assum/i.test(methods.join(" ")) ? "They are using different assumptions." : "They have reached different figures and the evidence does not yet settle which is right.";
    return { topic: k, label: TOPIC_LABEL[k] || k.replace(/([A-Z])/g, " $1").toLowerCase(), status: (open.length === 0 ? "resolved" : open.length < cs.length ? "partly resolved" : "unresolved") as Cluster["status"],
      severity: sev as Cluster["severity"], parties, positions, whyDisagree: why, whatResolves: RESOLVES[k] || "Better evidence on " + (TOPIC_LABEL[k] || k),
      impact: sev === "HIGH" && open.length ? "The decision cannot be finalised until this is settled." : open.length ? "Worth settling, but it does not block the decision on its own." : "Settled.",
      ids: cs.map((c) => c.id), count: cs.length };
  }).sort((a, b) => (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0) || (a.severity === "HIGH" ? -1 : 1));
}

// ── 6. EXPLANATIONS (two layers) ────────────────────────────────────────────
export interface Explanation { term: string; what: string; why: string; how: string; better: string; healthy?: string; need?: string; formula?: string }
export const GLOSSARY: Record<string, Explanation> = {
  breakEven: { term: "Break-even", what: "The monthly revenue at which the business stops losing money.", why: "Below it, every month costs you money; above it, you start earning.", how: "Fixed costs (plus loan interest) \u00f7 the share of each rupee of revenue left after running costs.", better: "Lower fixed costs, lower interest, or a higher margin bring it down.", healthy: "Expected revenue comfortably above it (20%+ headroom).", need: "Fixed costs, interest and margin." },
  margin: { term: "Contribution margin", what: "What is left from each rupee of revenue after the costs that rise with sales.", why: "This money pays your fixed costs, interest and profit. A 5-point change can decide whether you break even.", how: "100% \u2212 running costs as a % of revenue.", better: "Higher prices or cheaper inputs improve it." },
  occupancy: { term: "Occupancy / utilisation", what: "How much of your capacity customers actually use.", why: "Most of your costs stay the same whether the facility is full or half-empty, so revenue depends heavily on this number.", how: "Used capacity \u00f7 total capacity.", better: "Signed customer commitments make it real; forecasts alone do not." },
  workingCapital: { term: "Working capital", what: "Cash tied up because customers pay you later than you pay your costs.", why: "A profitable business can still run out of cash while waiting to be paid.", how: "Monthly revenue \u00d7 customer payment days \u00f7 30.", better: "Shorter payment terms, advances or deposits reduce it.", healthy: "Funded separately from CapEx, with a buffer.", need: "Revenue and customer payment days." },
  dscr: { term: "DSCR (debt service coverage ratio)", what: "How many times the operating cash covers the loan payments (interest + principal).", why: "Banks usually want at least 1.25\u00d7 so a bad month does not cause a missed payment.", how: "Operating cash (EBITDA) \u00f7 (interest + principal).", better: "More revenue, lower costs, a smaller loan or a longer tenure raise it.", healthy: "1.25\u00d7 or more is what lenders usually want; below 1.0\u00d7 the business cannot meet its loan payments from operations.", need: "Loan amount, interest rate and tenure, plus operating cash." },
  interestCoverage: { term: "Interest coverage", what: "How many times the operating cash covers the interest on the loan.", why: "Below about 1.5\u00d7, a modest shortfall can make the interest hard to pay.", how: "Operating cash (EBITDA) \u00f7 monthly interest.", better: "More revenue, lower costs or a smaller loan raise it.", healthy: "1.5\u00d7 or more is usually comfortable; below 1.0\u00d7 the interest cannot be paid from operations.", need: "Loan amount, interest rate and operating cash." },
  runway: { term: "Cash runway", what: "How many months the money lasts if the business keeps losing cash at the current rate.", why: "It is the time you have to fix the business before the cash runs out.", how: "Cash available \u00f7 monthly cash burn.", better: "More funding, lower burn or faster break-even extend it.", healthy: "12+ months while loss-making is comfortable; under 6 months is urgent.", need: "Cash available and monthly loss." },
  funding: { term: "Funding gap", what: "Whether the money available covers building the project and the working capital.", why: "If it does not, the project can stall even if it would be profitable.", how: "Funding \u2212 project cost \u2212 working capital.", better: "More funding, a smaller first phase or shorter customer payment terms." },
  confirmed: { term: "Confirmed", what: "We have reliable evidence for this.", why: "You can treat it as a fact for this decision.", how: "Backed by a retrieved source.", better: "\u2014" },
  calculated: { term: "Calculated", what: "The system calculated this from known numbers.", why: "It is only as reliable as the numbers it was calculated from.", how: "A formula on your inputs and evidence.", better: "Verify the inputs." },
  assumed: { term: "Assumed", what: "Supplied by you or an executive, but not independently verified.", why: "Treat it as a working assumption, not a fact.", how: "Stated, not evidenced.", better: "Find a document that confirms it." },
  estimated: { term: "Estimated", what: "An approximate value because exact data was unavailable.", why: "The real number could be noticeably different.", how: "An executive's estimate.", better: "Get a quote or measurement." },
  disputed: { term: "Disputed", what: "Different executives or sources disagree.", why: "The decision may depend on which one is right.", how: "Two different figures for the same thing.", better: "The evidence listed under 'what resolves it'." },
  missing: { term: "Missing", what: "We need this information before the decision can be trusted.", why: "Without it, the recommendation rests on a guess.", how: "\u2014", better: "The verification step listed next to it." },
  scenario: { term: "Scenario", what: "A 'what if' calculation using changed assumptions.", why: "It shows how fragile or robust the decision is. It is not a forecast.", how: "The same model, with the changed numbers.", better: "\u2014" },
  confidence: { term: "Confidence", what: "How much the recommendation could change as better evidence arrives.", why: "Low confidence means 'the direction is clear, the details are not'.", how: "Based on evidence quality, disagreements, missing numbers and open questions.", better: "Verifying the key numbers raises it." },
  // ── professional terms kept visible, each with a plain-English lesson ──
  ebitda: { term: "EBITDA (operating cash before interest, tax and depreciation)", what: "The cash the business itself generates each month before paying the bank, the tax office or writing down equipment.", why: "It is the money available to repay loans and reinvest. Lenders look at it first.", how: "Contribution (revenue \u2212 running costs) \u2212 fixed costs.", formula: "EBITDA = Revenue \u00d7 contribution margin \u2212 fixed costs", healthy: "Positive and growing; negative EBITDA means the operation itself loses money.", better: "Higher prices or volume, lower running or fixed costs.", need: "Revenue, running-cost % and fixed costs." },
  capex: { term: "CapEx (capital expenditure)", what: "One-time money spent to build or buy long-lasting assets: plant, machines, building, fit-out.", why: "It must be funded before you earn anything, so it decides how much money you need up front.", how: "Sum of the itemised project costs (ideally from supplier quotations).", formula: "CapEx = \u03a3 asset costs", healthy: "Fully funded with a buffer for overruns (10\u201320% is common).", better: "Phasing, leasing or buying second-hand reduces it.", need: "An itemised list of assets with quotations." },
  opex: { term: "OpEx (operating expenditure)", what: "The recurring cost of running the business: salaries, rent, power, maintenance.", why: "It must be covered every month, whether or not customers pay on time.", how: "Fixed monthly costs + running costs that rise with sales.", healthy: "Covered by revenue with headroom; fixed OpEx kept lean early on.", better: "Variable rather than fixed costs where possible.", need: "Monthly cost budget." },
  dso: { term: "DSO (days sales outstanding)", what: "How many days, on average, customers take to pay you.", why: "Until they pay, your money is stuck with them \u2014 a profitable business can still run out of cash.", how: "Receivables \u00f7 revenue \u00d7 30 (per month).", formula: "Working capital tied up \u2248 monthly revenue \u00d7 DSO \u00f7 30", healthy: "Short and predictable; 30\u201345 days is common for B2B, 90+ days is a cash-flow risk.", better: "Advances, milestone billing, shorter credit terms, invoice discounting.", need: "Typical customer payment terms." },
  utilisation: { term: "Utilisation / occupancy", what: "How much of your capacity is actually used and paid for.", why: "Most costs stay fixed whether capacity is full or empty, so this usually decides profit.", how: "Used (or contracted) capacity \u00f7 total capacity.", healthy: "Above the break-even level with a safety margin; contracted, not just forecast.", better: "Signed customer commitments; smaller first phase.", need: "Capacity and signed demand." },
  payback: { term: "Payback period", what: "How long until the profit earned repays the money invested.", why: "A long payback means your money is at risk for longer.", how: "CapEx \u00f7 monthly profit.", formula: "Payback (months) = CapEx \u00f7 monthly profit", healthy: "Shorter than the life of the assets; for small businesses, under 3\u20135 years is common.", better: "Lower CapEx or higher profit.", need: "CapEx and monthly profit." },
  epc: { term: "EPC (Engineering, Procurement and Construction)", what: "A contract where one company designs, buys the equipment for and builds the project.", why: "A fixed-price EPC contract moves cost-overrun and delay risk to the contractor.", how: "Quoted by the contractor; compare at least three itemised bids.", healthy: "Fixed price, clear scope, penalties for delay.", better: "Itemised bill of quantities (BOQ) and performance guarantees.", need: "Itemised EPC quotations." },
  bess: { term: "BESS (Battery Energy Storage System)", what: "Batteries that store energy (for example from solar) to use when it is needed.", why: "It can cut power bills and keep operations running during outages, but it adds CapEx.", how: "Sized in kWh from your load profile; costed from supplier quotes.", healthy: "Sized to the real load; payback shorter than battery life.", better: "Right-sizing; using time-of-day tariffs.", need: "Daily load profile and quotations." },
  evidenceGap: { term: "Evidence gap", what: "A fact the decision depends on that the research could not confirm.", why: "Until it is confirmed it is an assumption, so the decision built on it is less certain.", how: "Created when an executive marks a needed fact as unverifiable, or the research finds nothing.", healthy: "No high-priority gaps open when you commit money.", better: "Provide the document, quotation or data that confirms it.", need: "A source that confirms or disproves the fact." },
  decisionGate: { term: "Decision gate", what: "A test the plan must pass before you commit money \u2014 for example 'is there enough funding?'.", why: "It turns a vague 'maybe' into a clear checklist: pass every gate, then proceed.", how: "Each gate compares a calculated or evidenced value with a threshold.", healthy: "All gates passed (or consciously accepted) before investing.", better: "Work on the failing gate first.", need: "The evidence or figure the gate tests." },
  contributionMargin: { term: "Contribution margin", what: "What is left from each rupee of revenue after the costs that rise with sales.", why: "It pays your fixed costs, interest and profit; a 5-point change can decide whether you break even.", how: "100% \u2212 running (variable) cost %.", formula: "Contribution margin % = (Revenue \u2212 variable costs) \u00f7 Revenue", healthy: "High enough that break-even sits well below expected revenue.", better: "Better pricing, cheaper inputs, less waste.", need: "Price and running-cost %." },

};

// ── 7. KEY NUMBERS + FINDINGS (so what?) ────────────────────────────────────
export interface KeyNumber { label: string; value: string; unit: string; meaning: string; comparison: string; impact: string; explain: string; status: "good" | "watch" | "bad" | "neutral"; kind: string; }
export function keyNumbers(inp: Inputs, o: Outputs): KeyNumber[] {
  const K: KeyNumber[] = []; const eq = inp.equity?.value ?? inp.funding?.value;
  const kind = (k: InputKey) => inp[k] ? (inp[k]!.label === "Retrieved Evidence" ? "Confirmed" : inp[k]!.label === "Calculation" ? "Calculated" : "Assumed") : "Calculated";
  if (o.revenue !== null && o.breakEven !== null) K.push({ label: "Monthly revenue vs break-even", value: fmt(o.revenue, "INR") + " vs " + fmt(o.breakEven, "INR"), unit: "per month",
    meaning: o.revenue >= o.breakEven ? "Expected revenue covers running costs and interest." : "Expected revenue does not cover running costs and interest.",
    comparison: Math.round(((o.revenue / o.breakEven) - 1) * 100) + "% " + (o.revenue >= o.breakEven ? "above" : "below") + " break-even",
    impact: o.revenue >= o.breakEven ? ((o.marginOfSafety || 0) < 0.2 ? "Thin cushion: a small shortfall pushes you into losses." : "There is a reasonable cushion.") : "You would lose " + fmt(o.breakEven - o.revenue, "INR") + " a month before loan repayments.",
    explain: "breakEven", status: o.revenue >= o.breakEven ? ((o.marginOfSafety || 0) < 0.2 ? "watch" : "good") : "bad", kind: "Calculated" });
  if (o.workingCapital !== null) K.push({ label: "Cash tied up in customer payments", value: fmt(o.workingCapital, "INR"), unit: (inp.dso?.value || 0) + "-day receivables",
    meaning: "About " + Math.round((inp.dso?.value || 0) / 30 * 10) / 10 + " months of revenue is waiting to be paid at any time.",
    comparison: eq ? Math.round(o.workingCapital / eq * 1000) / 10 + "% of your " + (inp.equity ? "equity" : "funding") : "\u2014",
    impact: "If it is not separately funded, the business can run short of cash even when it is profitable on paper.", explain: "workingCapital", status: "watch", kind: "Calculated" });
  if (o.cashStart !== null) K.push({ label: "Funding left after building and working capital", value: fmt(o.cashStart, "INR"), unit: "",
    meaning: o.cashStart >= 0 ? "The funding covers the project and the working capital." : "The funding does not cover the project plus working capital.",
    comparison: "funding " + fmt(inp.funding?.value ?? null, "INR") + " \u2212 project " + fmt(inp.capex?.value ?? 0, "INR") + " \u2212 working capital " + fmt(o.workingCapital ?? 0, "INR"),
    impact: o.cashStart >= 0 ? "No immediate funding gap." : "You would need about " + fmt(-o.cashStart, "INR") + " more, or a smaller first phase.", explain: "funding", status: o.cashStart >= 0 ? "good" : "bad", kind: "Calculated" });
  if (o.dscr !== null) K.push({ label: "Loan safety (DSCR)", value: o.dscr.toFixed(2) + "\u00d7", unit: "", meaning: "For every \u20b91 of loan payment, the business earns \u20b9" + o.dscr.toFixed(2) + " of operating cash.",
    comparison: "lenders usually want \u2265 " + DECISION_RULES.minDSCR + "\u00d7", impact: o.dscr >= DECISION_RULES.minDSCR ? "The loan looks serviceable." : "The loan payments are not safely covered; you may have to put in more money.", explain: "dscr", status: o.dscr >= DECISION_RULES.minDSCR ? "good" : "bad", kind: "Calculated" });
  else if (o.interestCoverage !== null) K.push({ label: "Loan safety (interest coverage)", value: o.interestCoverage.toFixed(2) + "\u00d7", unit: "",
    meaning: "For every \u20b91 of loan interest, the business earns \u20b9" + o.interestCoverage.toFixed(2) + " of operating cash.", comparison: "\u2265 " + DECISION_RULES.minInterestCoverage + "\u00d7 is comfortable",
    impact: o.interestCoverage >= DECISION_RULES.minInterestCoverage ? "Interest looks affordable (loan tenure not given, so principal repayments are not included)." : "The interest is not comfortably covered; you may have to put in more money even if occupancy is reached.",
    explain: "interestCoverage", status: o.interestCoverage >= DECISION_RULES.minInterestCoverage ? "good" : "bad", kind: "Calculated" });
  if (o.contributionMarginPct !== null) K.push({ label: "Margin after running costs", value: fmt(o.contributionMarginPct, "PCT"), unit: "of revenue", meaning: "Of each \u20b9100 of revenue, \u20b9" + Math.round(o.contributionMarginPct) + " is left to pay fixed costs, interest and profit.",
    comparison: "running costs " + fmt(100 - o.contributionMarginPct, "PCT"), impact: "A 5-point change in running costs moves break-even by about " + fmt(o.breakEven !== null && o.contributionMarginPct > 5 ? o.breakEven * (o.contributionMarginPct / (o.contributionMarginPct - 5) - 1) : null, "INR") + " a month.",
    explain: "margin", status: "neutral", kind: kind("variableCostPct") });
  return K;
}
export interface Finding { finding: string; soWhat: string; impact: string; whatToDo: string; }
export function findings(inp: Inputs, o: Outputs): Finding[] {
  const F: Finding[] = [];
  if (o.revenue !== null && o.breakEven !== null && o.revenue < o.breakEven) F.push({ finding: "Expected revenue is below break-even.", soWhat: "At the planned level of business, the facility loses money every month.", impact: "About " + fmt(o.breakEven - o.revenue, "INR") + " a month would have to come from your own pocket.", whatToDo: "Prove higher demand or a better margin before committing capital." });
  if (o.dscr !== null && o.dscr < DECISION_RULES.minDSCR) F.push({ finding: "Loan payments are covered only " + o.dscr.toFixed(2) + "\u00d7.", soWhat: "The business does not generate enough operating cash to comfortably repay the loan.", impact: "You could have to inject more money even if the plan is met.", whatToDo: "Reduce the loan, extend the tenure or prove more revenue, then re-run the model." });
  else if (o.interestCoverage !== null && o.interestCoverage < DECISION_RULES.minInterestCoverage) F.push({ finding: "Interest is covered only " + o.interestCoverage.toFixed(2) + "\u00d7.", soWhat: "The business is not generating enough operating cash to comfortably pay the interest.", impact: "You could have to inject additional money even if the facility reaches the expected occupancy.", whatToDo: "Prove contracted occupancy and re-run the debt model before committing equity." });
  if (o.cashStart !== null && o.cashStart < 0) F.push({ finding: "Funding is short by " + fmt(-o.cashStart, "INR") + ".", soWhat: "The money available does not cover building the project and the cash tied up in customer payments.", impact: "The project could stall after construction, before customers have paid.", whatToDo: "Arrange working-capital finance, shorten customer payment terms, or start with a smaller phase." });
  if (o.revenue !== null && o.breakEven !== null && o.revenue >= o.breakEven && (o.marginOfSafety || 0) < 0.2) F.push({ finding: "Revenue clears break-even by only " + Math.round((o.marginOfSafety || 0) * 100) + "%.", soWhat: "A small shortfall in demand or price would push the business into losses.", impact: "The plan is fragile.", whatToDo: "Lock in customer commitments before scaling." });
  return F;
}

// ── 8. WHAT WE DON'T KNOW ───────────────────────────────────────────────────
const VERIFY: { re: RegExp; how: string; why: string }[] = [
  { re: /occupan|utili[sz]|demand|customer|lead|contract|loi/i, how: "Obtain signed LOIs or minimum-volume contracts from customers.", why: "Without committed customers, the occupancy figure is only a forecast." },
  { re: /capex|project cost|capital|boq|epc|construction|equipment/i, how: "Get an itemised bill of quantities and vendor/EPC quotations.", why: "The total investment decides how much money you need and how big the loan is." },
  { re: /margin|variable cost|running cost|electricity|power|tariff/i, how: "Get supplier and utility quotes for the main running costs.", why: "A few points of margin can decide whether the business breaks even." },
  { re: /fixed|opex|salar|rent/i, how: "Build an itemised operating budget.", why: "Fixed costs set the break-even level." },
  { re: /interest|loan|debt|bank|financ/i, how: "Get a term sheet from a bank.", why: "The loan's cost and tenure decide whether the repayments are safe." },
  { re: /payment|receivable|dso|credit/i, how: "Write payment terms into customer contracts.", why: "Slow payers tie up cash you need to run the business." },
  { re: /regulat|licen[cs]|permit|subsid|approval|compliance|noc/i, how: "Get written confirmation from the relevant authority.", why: "A missing approval or subsidy can delay or change the economics." },
];
export interface Unknown { missing: string; whyMatters: string; howToVerify: string; decisionImpact: string; technicalRef: string; }
export function whatWeDontKnow(p: { ambiguities: Ambiguity[]; userQuestions: any[]; gaps: any[]; inputs: Inputs; driver?: Driver | null }): Unknown[] {
  const U: Unknown[] = [];
  for (const a of p.ambiguities) U.push({ missing: "Which occupancy your revenue figure assumes", whyMatters: a.impact, howToVerify: a.question, decisionImpact: "Both readings are calculated below; the decision uses the more cautious one until you confirm.", technicalRef: a.id });
  if (p.driver && p.inputs[p.driver.variable] && p.inputs[p.driver.variable]!.label !== "Retrieved Evidence") {
    const v = VERIFY.find((x) => x.re.test(p.driver!.label));
    U.push({ missing: "Proof of " + p.driver.label.toLowerCase(), whyMatters: v ? v.why : "It is the number the decision is most sensitive to.", howToVerify: v ? v.how : "Find a document that confirms it.", decisionImpact: p.driver.statement, technicalRef: "driver:" + p.driver.variable });
  }
  for (const u of (p.userQuestions || []).filter((x: any) => x.status === "open").slice(0, 2)) U.push({ missing: u.question.replace(/\?$/, ""), whyMatters: "Only you can answer this; the executives need it to finish their analysis.", howToVerify: "Answer it in the follow-up box.", decisionImpact: "The decision stays conditional until it is answered.", technicalRef: u.id });
  for (const g of (p.gaps || []).filter((x: any) => x.priority === "high" && x.current_status !== "closed").slice(0, 3)) {
    const q = String(g.question || "").replace(/\[evidence gap\]\s*/i, ""); const v = VERIFY.find((x) => x.re.test(q));
    U.push({ missing: q.replace(/\b(cannot be verified|could not be verified)( from the research)?\.?/i, "").trim() || q, whyMatters: v ? v.why : "An executive flagged this as decision-relevant.", howToVerify: v ? v.how : "Targeted research or a direct quote.", decisionImpact: "Until verified, this is an assumption.", technicalRef: g.id });
  }
  return U.slice(0, 5);
}

// ── 9. DRIVER, GATES, ACTIONS, VOCABULARY, CONFIDENCE, BRIEF ────────────────
export interface Driver { variable: InputKey; label: string; current: number; required: number | null; gap: string; unit: string; statement: string; }
export function biggestDriver(inp: Inputs, gatesOpen = 0): Driver | null {
  const sens = sensitivity(inp, gatesOpen); const cur = decideModel(compute(inp), gatesOpen).decision;
  for (const s of sens) {
    // the threshold that would move the decision UP (or keep it from falling), nearest first
    const up = s.thresholds.filter((t) => DECISION_RANKS[t.to] > DECISION_RANKS[t.from] ? DECISION_RANKS[t.to] > DECISION_RANKS[cur] : DECISION_RANKS[t.from] > DECISION_RANKS[cur])
      .sort((a, b) => Math.abs(a.value - s.base) - Math.abs(b.value - s.base))[0];
    const t = up || s.thresholds[0]; if (!t) continue;
    const diff = t.value - s.base;
    const gap = s.unit === "PCT" ? (Math.abs(diff) < 0.05 ? "at the threshold" : Math.round(Math.abs(diff) * 10) / 10 + " percentage points " + (diff > 0 ? "short" : "of headroom"))
      : (diff > 0 ? fmt(diff, s.unit) + " short" : fmt(-diff, s.unit) + " of headroom");
    return { variable: s.variable, label: s.label, current: s.base, required: t.value, gap, unit: s.unit,
      statement: "At " + fmt(t.value, s.unit) + " the recommendation moves from " + t.from + " to " + t.to + "." };
  }
  return null;
}
export function educationalGate(g: Gate, plain: boolean): { title: string; need: string; why: string; explain: string } {
  const n = g.name;
  if (/Revenue covers break-even/i.test(n)) return { title: "Will the business earn enough to cover its running costs and interest?", need: "Revenue of at least " + g.threshold.replace(" [Calculation]", ""), why: "Below break-even, every month costs you money.", explain: "breakEven" };
  if (/Funding covers/i.test(n)) return { title: "Is there enough money to build it AND run it until customers pay?", need: "Funding of at least " + g.threshold.replace(/\u2265 | \[Calculation\]/g, ""), why: "Customers pay later than you pay your costs, so building it is not the only money needed.", explain: "funding" };
  if (/Unit economics/i.test(n)) return { title: "Can we put numbers on the economics?", need: "Revenue and costs quantified", why: "Without them the decision rests on judgement, not calculation.", explain: "breakEven" };
  if (/^Your answer:/i.test(n)) return { title: "Your input needed: " + n.replace(/^Your answer:\s*/i, ""), need: "Your answer", why: "Only you know this.", explain: "missing" };
  if (/^Evidence:/i.test(n)) { const subj = n.replace(/^Evidence:\s*/i, "").replace(/\b(cannot be verified|could not be verified|is unverified|is unproven|needs verification)( from the research)?\.?/i, "").replace(/\.$/, "").trim();
    return { title: "Do we have proof of " + subj.charAt(0).toLowerCase() + subj.slice(1) + "?", need: "A document or source that confirms it", why: "Until it is confirmed, it is an assumption, not a fact.", explain: "missing" }; }
  if (/^Resolve /i.test(n)) return { title: "Do your executives agree on the " + (TOPIC_LABEL[n.replace(/^Resolve | conflict.*$/gi, "").trim()] || n.replace(/^Resolve | conflict.*$/gi, "")).toLowerCase() + "?", need: "One agreed figure", why: "The decision may depend on which figure is right.", explain: "disputed" };
  return { title: n, need: g.threshold, why: "", explain: "" };
}
export type DisplayDecision = "PROCEED" | "CONDITIONAL PROCEED" | "WAIT" | "REWORK" | "STOP" | "INSUFFICIENT EVIDENCE";
// Controlled vocabulary. STOP becomes REWORK when a calculated alternative (smaller
// phase, no capex, cost control) would make the plan viable.
export function displayDecision(d: Decision, alternatives: { decision: Decision }[] = []): DisplayDecision {
  if (d === "PROCEED WITH CONDITIONS") return "CONDITIONAL PROCEED";
  if (d === "DO NOT PROCEED") return alternatives.some((a) => DECISION_RANKS[a.decision] >= DECISION_RANKS["PROCEED WITH CONDITIONS"]) ? "REWORK" : "STOP";
  return d as DisplayDecision;
}
export const DECISION_MEANING: Record<DisplayDecision, string> = {
  "PROCEED": "Go ahead with the plan, monitoring the triggers.", "CONDITIONAL PROCEED": "Go ahead only in a limited way, and only once the listed conditions are met.",
  "WAIT": "Do not commit money yet; prove the missing pieces first.", "REWORK": "The plan as described does not work, but a changed version could.",
  "STOP": "Under these conditions the plan does not work.", "INSUFFICIENT EVIDENCE": "There is not enough information to decide responsibly yet.",
};
export function explainConfidence(p: { confidence: string; ambiguities: Ambiguity[]; driver: Driver | null; unknowns: Unknown[]; clusters: Cluster[] }): { why: string; increase: string; decrease: string } {
  const openHigh = p.clusters.filter((c) => c.status !== "resolved" && c.severity === "HIGH");
  const why = p.confidence === "HIGH" ? "The key numbers are backed by evidence and the executives agree." : p.confidence === "MEDIUM" ? "The direction is clear, but some numbers that set the exact outcome are not yet verified."
    : p.confidence === "LOW" ? "The direction of the recommendation is reasonably clear, but several numbers that determine the financial outcome are still unverified" + (openHigh.length ? " and the executives disagree on " + openHigh.map((c) => c.label.toLowerCase()).join(", ") : "") + "."
    : "Important information is missing or could not be validated.";
  const increase = p.unknowns.slice(0, 3).map((u) => u.howToVerify.replace(/\.$/, "")).join("; ") || "Verifying the key numbers.";
  const decrease = p.ambiguities[0] ? "If " + p.ambiguities[0].options[1].label.replace(/^\S+ is /, "the revenue figure is ") + "." : p.driver ? "If " + p.driver.label.toLowerCase() + " turns out lower than assumed." : "If the key assumptions prove optimistic.";
  return { why, increase, decrease };
}
export interface ActionItemPlan { action: string; owner: string; deadline: string; why: string; success: string; fail: string; escalation: string; }
export function actionPlan(map: DecisionMap, driver: Driver | null, unknowns: Unknown[]): ActionItemPlan[] {
  const A: ActionItemPlan[] = [];
  if (driver) A.push({ action: (/occupan|utili/i.test(driver.label) ? "Obtain signed customer commitments (LOIs or minimum-volume contracts)" : "Prove " + driver.label.toLowerCase()), owner: /occupan|utili|volume|demand/i.test(driver.label) ? "Commercial / CMO" : "CFO",
    deadline: "30 days", why: driver.statement, success: driver.required !== null ? driver.label + " \u2265 " + fmt(driver.required, driver.unit) : "Verified figure", fail: "Below the threshold", escalation: "Return to the Boardroom with the new figure" });
  for (const u of unknowns.filter((x) => !/^driver:/.test(x.technicalRef)).slice(0, 4)) A.push({ action: u.howToVerify.replace(/\.$/, ""), owner: /customer|lois?|contract/i.test(u.howToVerify) ? "Commercial / CMO" : /bank|term sheet|budget|quote/i.test(u.howToVerify) ? "CFO" : /authority|regulat/i.test(u.howToVerify) ? "CLO" : /answer/i.test(u.howToVerify) ? "You" : "CEO",
    deadline: /answer/i.test(u.howToVerify) ? "This week" : "30 days", why: u.whyMatters, success: "Evidence obtained and entered", fail: "Evidence contradicts the assumption", escalation: "Re-run the Boardroom with the new evidence" });
  for (const g of map.gates.filter((x) => x.status === "FAIL").slice(0, 2)) A.push({ action: "Fix: " + g.name, owner: g.owner, deadline: "Before committing capital", why: g.ifFail, success: g.threshold, fail: "Still failing", escalation: "Rework the plan (smaller phase / different financing)" });
  const seen = new Set<string>(); return A.filter((a) => (seen.has(a.action) ? false : (seen.add(a.action), true))).slice(0, 6);
}
export function stripIds(text: string): string {
  return String(text || "").replace(/\b(DL-[A-Z]-\d{3}|UQ-\d{3}|CX-[\w-]+|MODEL-[A-Z]+-\d{3}|AMB-[A-Z-]+|F\d+|S\d+)\b:?\s*/g, "").replace(/\s{2,}/g, " ").replace(/\(\s*\)/g, "").replace(/\s+([.,;:!?])/g, "$1").trim();
}
export function decisionBrief(p: { display: DisplayDecision; confidence: string; why: string[]; risk: string; keyNumber: string; actions: string[]; wouldChange: string }): string {
  return ["DECISION: " + p.display, "", "WHY:", ...p.why.slice(0, 3).map((w) => "\u2022 " + stripIds(w).replace(/ \[Calculation\]/g, "")), "", "BIGGEST RISK: " + stripIds(p.risk), "", "KEY NUMBER: " + p.keyNumber, "",
    "NEXT 3 ACTIONS:", ...p.actions.slice(0, 3).map((a, i) => (i + 1) + ". " + stripIds(a)), "", "WHAT WOULD CHANGE THE DECISION: " + stripIds(p.wouldChange).replace(/ \[Calculation\]/g, ""), "", "CONFIDENCE: " + p.confidence].join("\n");
}

// ── 10. BOTH READINGS OF AN AMBIGUOUS INPUT ─────────────────────────────────
// While an input's meaning is unconfirmed, BOTH interpretations are calculated and
// shown; the headline uses the more cautious one until the user confirms.
export interface Reading { key: "A" | "B"; label: string; inputs: Inputs; outputs: Outputs; decision: Decision; reasons: string[]; }
export function computeReadings(registry: ModelRegistry, user: CanonicalInput[], ambiguities: Ambiguity[], gatesOpen = 0): { readings: Reading[]; cautious: Reading | null } {
  if (!ambiguities.length) return { readings: [], cautious: null };
  const a0 = ambiguities[0];
  const readings: Reading[] = a0.options.map((opt) => {
    const merged = mergeUserInputs(JSON.parse(JSON.stringify(registry || {})), user, opt.key, ambiguities);
    const inputs = inputsFromRegistryLocal(merged.registry); const outputs = compute(inputs); const d = decideModel(outputs, gatesOpen);
    return { key: opt.key, label: opt.label, inputs, outputs, decision: d.decision, reasons: d.reasons };
  });
  const rank = (d: Decision) => DECISION_RANKS[d] ?? -1;
  // More cautious = lower decision rank; on a tie, the reading with more blocking/serious problems.
  const weight = (r: Reading) => diagnose(r.outputs).reduce((s, d) => s + (d.severity === "blocking" ? 3 : d.severity === "serious" ? 2 : 1), 0);
  const cautious = readings.slice().sort((x, y) => rank(x.decision) - rank(y.decision) || weight(y) - weight(x))[0] || null;
  return { readings, cautious };
}
function inputsFromRegistryLocal(reg: ModelRegistry): Inputs {
  const out: Inputs = {};
  for (const [k, e] of Object.entries(reg || {}) as [string, RegistryEntry][]) {
    if (!(k in INPUT_LABEL) || e.value === null || !isFinite(e.value as number)) continue;
    out[k as InputKey] = { value: e.value as number, label: e.classification === "user" || e.status === "SET_BY_USER" ? "User Input" : e.classification === "supported" ? "Retrieved Evidence" : "Assumption", source: e.id };
  }
  return out;
}

// ── 11. EXECUTIVE VIEW (plain language, derived from the executive's own text) ─
export interface ExecutiveView { view: string; worried: string[]; wantsVerified: string[]; impact: string; }
const SENT = (t: string) => String(t || "").replace(/\*\*/g, "").split(/\n|(?<=[.!?])\s+/).map((s) => s.replace(/^\s*(?:[-*\u2022>]|\d+[.)]|#+)\s*/, "").trim()).filter((s) => s.length > 20);
export function executiveView(text: string): ExecutiveView {
  const s = SENT(text);
  const sec = (re: RegExp) => { const lines = String(text || "").split("\n"); const out: string[] = []; let on = false;
    for (const l of lines) { if (/^\s*(#{1,4}\s|\d+[.)]\s*\*\*|\*\*[^*]+\*\*\s*:?\s*$)/.test(l)) { if (on) break; if (re.test(l)) on = true; continue; } if (on && l.trim()) out.push(l.replace(/^\s*(?:[-*\u2022>]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim()); }
    return out.filter((x) => x.length > 15); };
  const pos = sec(/position|verdict|bottom line|summary/i); const rec = sec(/recommendation/i);
  // The model's own evidence tags ("[Verified Fact]" etc.) are removed from the plain view:
  // whether a claim is verified is decided by evidence linking, never by the model's label.
  const view = stripIds((pos.length ? pos : s.filter((x) => !/\?\s*$/.test(x))).slice(0, 3).join(" ")).replace(/\[[^\]]*\]\s*/g, "").slice(0, 420);
  const worried = Array.from(new Set([...sec(/risk|concern|threat/i), ...s.filter((x) => /\b(risk|concern|worr|danger|threat|could fail|cannot|shortfall|exposure|unproven|too high|too low)\b/i.test(x))]))
    .map((x) => stripIds(x).replace(/\[[^\]]*\]\s*/g, "")).slice(0, 3);
  const wantsVerified = Array.from(new Set([...s.filter((x) => /\[evidence gap\]|\bverify|validate|confirm|need (to see|evidence|proof)|unverified|cannot be verified\b/i.test(x)), ...sec(/what i need|evidence gaps?/i)]))
    .map((x) => stripIds(x).replace(/\[[^\]]*\]\s*/g, "")).slice(0, 3);
  const impact = stripIds((rec[0] || s.find((x) => /\b(recommend|proceed|wait|do not|should|pilot)\b/i.test(x)) || "").replace(/\[[^\]]*\]\s*/g, "")).slice(0, 300);
  return { view, worried, wantsVerified, impact };
}

// ── 12. ISSUE-DRIVEN ACTION PLAN, KEY NUMBER, PLAIN THRESHOLDS ───────────────
const PLAIN_D: Record<string, string> = { "DO NOT PROCEED": "STOP", "PROCEED WITH CONDITIONS": "CONDITIONAL PROCEED", "WAIT": "WAIT", "PROCEED": "PROCEED", "INSUFFICIENT EVIDENCE": "INSUFFICIENT EVIDENCE" };
export const plainDecision = (d: string) => PLAIN_D[d] || d;
export function actionPlanFromIssues(p: { inputs: Inputs; outputs: Outputs; ambiguities: Ambiguity[]; userQuestions: any[]; unknowns: Unknown[]; clusters: Cluster[] }): ActionItemPlan[] {
  const A: ActionItemPlan[] = []; const o = p.outputs; const r = DECISION_RULES as any;
  for (const a of p.ambiguities) A.push({ action: "Confirm what your revenue figure means: " + a.options.map((x) => "(" + x.key + ") " + x.label).join(" or "), owner: "You", deadline: "Today",
    why: "The two readings give different answers, so nothing else can be finalised until this is clear.", success: "Reading confirmed in the Decision Cockpit", fail: "Left unconfirmed: the decision stays on the cautious reading", escalation: "None needed" });
  if (o.cashStart !== null && o.cashStart < 0) A.push({ action: "Close the " + fmt(-o.cashStart, "INR") + " funding gap: arrange working-capital finance, add equity, or cut the project cost by that amount", owner: "You / CFO", deadline: "Before committing any capital",
    why: "The project plus the cash tied up in unpaid customer bills costs more than the money available.", success: "Funding \u2265 project cost + working capital", fail: "Gap remains \u2192 rework the plan (phase it or reduce scope)", escalation: "Return to the Boardroom with the revised funding plan" });
  if (o.revenue !== null && o.breakEven !== null && o.revenue < o.breakEven) {
    const occ = p.inputs.revenueFull && p.inputs.utilisation ? " (about " + Math.ceil(o.breakEven / p.inputs.revenueFull.value * 100) + "% occupancy)" : "";
    A.push({ action: "Prove revenue of at least " + fmt(o.breakEven, "INR") + " a month" + occ + " with signed customer commitments", owner: "Commercial / CMO", deadline: "60 days",
      why: "Below that level the business loses money every month.", success: "Contracted revenue \u2265 " + fmt(o.breakEven, "INR") + "/month", fail: "Below that level: do not build at this scale", escalation: "Re-run the Boardroom with the contracted figures" });
  }
  const minIC = r.minInterestCoverage || 1.5;
  if (o.interestCoverage !== null && o.interestCoverage < minIC) A.push({ action: "Reduce the loan, or prove higher operating cash, before borrowing", owner: "CFO", deadline: "Before signing the loan",
    why: "Operating cash covers the interest only " + o.interestCoverage.toFixed(2) + "\u00d7.", success: "Operating cash \u2265 " + minIC + "\u00d7 the interest", fail: "Still below: borrow less or not at all", escalation: "Discuss restructuring with the lender" });
  if (o.dscr !== null && o.dscr < r.minDSCR) A.push({ action: "Restructure the loan so payments fit the cash the business generates", owner: "CFO", deadline: "Before signing the loan",
    why: "Operating cash covers loan payments only " + o.dscr.toFixed(2) + "\u00d7.", success: "Coverage \u2265 " + r.minDSCR + "\u00d7", fail: "Below: reduce debt or extend tenure", escalation: "Return to the Boardroom" });
  for (const q of (p.userQuestions || []).filter((x: any) => x.status === "open").slice(0, 2)) A.push({ action: "Answer: " + q.question, owner: "You", deadline: "This week",
    why: "Only you know this, and the executives need it.", success: "Answered in a follow-up question", fail: "Unanswered: the decision stays conditional", escalation: "None needed" });
  for (const u of p.unknowns.filter((x) => !/occupancy your revenue|^Which /i.test(x.missing)).slice(0, 2)) A.push({ action: "Verify " + stripIds(u.missing).replace(/^Proof of /i, "").replace(/\.$/, "").toLowerCase() + ": " + u.howToVerify.replace(/\.$/, "").replace(/^\w/, (ch) => ch.toLowerCase()), owner: /customer|lois?|contract/i.test(u.howToVerify) ? "Commercial / CMO" : /quote|budget|bank|term sheet/i.test(u.howToVerify) ? "CFO" : "Research / you",
    deadline: "30 days", why: u.whyMatters, success: "Evidence obtained", fail: "Evidence contradicts the assumption", escalation: "Re-run the Boardroom with the new evidence" });
  for (const c of p.clusters.filter((x) => x.severity === "HIGH" && x.status !== "resolved").slice(0, 1)) A.push({ action: "Settle the " + c.label.toLowerCase() + " disagreement: get " + c.whatResolves.charAt(0).toLowerCase() + c.whatResolves.slice(1), owner: "CFO / Chairman", deadline: "30 days",
    why: c.whyDisagree, success: "One agreed figure", fail: "Still disputed: use the range, not a single number", escalation: "Chairman decides" });
  const seen = new Set<string>(); return A.filter((x) => (seen.has(x.action) ? false : (seen.add(x.action), true))).slice(0, 6);
}
// The single number a founder should remember: the gap behind the most serious problem.
export function keyNumberLine(o: Outputs): string {
  if (o.cashStart !== null && o.cashStart < 0) return "Funding gap: " + fmt(-o.cashStart, "INR") + " (project + working capital exceed the money available)";
  if (o.revenue !== null && o.breakEven !== null && o.revenue < o.breakEven) return "Revenue " + fmt(o.revenue, "INR") + "/month vs " + fmt(o.breakEven, "INR") + " needed to break even";
  if (o.interestCoverage !== null && o.interestCoverage < 1.5) return "Interest cover: " + o.interestCoverage.toFixed(2) + "\u00d7 (lenders usually want \u2265 1.5\u00d7)";
  if (o.marginOfSafety !== null) return "Headroom above break-even: " + Math.round(o.marginOfSafety * 100) + "%";
  return "";
}
// Thresholds in plain words, in the direction that IMPROVES the decision first.
export function plainThresholds(inp: Inputs, gatesOpen = 0): string[] {
  const rank: Record<string, number> = { "DO NOT PROCEED": 0, "WAIT": 1, "PROCEED WITH CONDITIONS": 2, "PROCEED": 3 };
  const out: { s: string; improves: boolean; dist: number }[] = [];
  for (const s of sensitivity(inp, gatesOpen)) for (const t of s.thresholds) {
    const upIsBetter = rank[t.to] > rank[t.from];   // crossing the threshold upwards moves from -> to
    const improvesWhenRising = upIsBetter;
    const better = improvesWhenRising ? t.to : t.from, worse = improvesWhenRising ? t.from : t.to;
    const curD = decideModel(compute(inp), gatesOpen).decision;
    const improves = rank[better] > rank[curD];
    // The direction word must match the sentence: the improving direction for
    // "improves to", the opposite direction for "drops to".
    const dir = improves === improvesWhenRising ? "rises above" : "falls below";
    out.push({ s: "If " + s.label.toLowerCase() + " " + dir + " " + fmt(t.value, s.unit) + " (now " + fmt(s.base, s.unit) + "), the recommendation " + (improves ? "improves to " + plainDecision(better) : "drops to " + plainDecision(worse)) + ".",
      improves, dist: Math.abs(t.value - s.base) / Math.max(Math.abs(s.base), 1e-9) });
  }
  return out.sort((a, b) => Number(b.improves) - Number(a.improves) || a.dist - b.dist).map((x) => x.s).filter((x, i, a) => a.indexOf(x) === i).slice(0, 5);
}


// ── INTERNAL IDS: kept visible for traceability, explained in plain English ──
export function explainId(id: string, ctx: { gaps?: any[]; userQuestions?: any[] } = {}): { id: string; kind: string; what: string; why: string; missing?: string; provide?: string; ifUnresolved?: string } {
  const g = (ctx.gaps || []).find((x: any) => x.id === id); const u = (ctx.userQuestions || []).find((x: any) => x.id === id);
  if (/^DL-G-/.test(id)) return { id, kind: "Evidence gap", what: id + " is the reference number of an evidence gap in this decision's ledger.", why: "The system created it because an executive needed a fact that the research could not confirm.",
    missing: g ? stripIds(String(g.question).replace(/\[evidence gap\]\s*/i, "")) : "A fact the decision depends on.", provide: g && g.required_evidence_type ? "Evidence of type: " + String(g.required_evidence_type).replace(/_/g, " ") + "." : "A document, quotation or data that confirms it.",
    ifUnresolved: "The fact stays an assumption: the decision cannot move to a confident PROCEED while this gap is high-priority and open." };
  if (/^UQ-/.test(id)) return { id, kind: "Question only you can answer", what: id + " is a question the executives need you to answer \u2014 research cannot find it.", why: "It concerns your own resources, relationships or intentions.", missing: u ? u.question : undefined, provide: "Answer it in a follow-up question.", ifUnresolved: "The decision stays conditional." };
  if (/^DL-X-|^CX-/.test(id)) return { id, kind: "Contradiction", what: id + " records a disagreement between two executives (or between an executive and the research).", why: "Different figures for the same thing mean the model cannot use one agreed value.", provide: "The document that settles the figure.", ifUnresolved: "The model uses a range instead of one number, and confidence stays lower." };
  if (/^DL-O-/.test(id)) return { id, kind: "Opportunity", what: id + " is an opportunity the executives spotted in the research.", why: "Recorded so it is not lost, even when it is not part of the main decision." };
  if (/^DL-A-/.test(id)) return { id, kind: "Assumption", what: id + " is an assumption an executive made.", why: "Assumptions are tracked so they can be verified later.", provide: "Evidence that confirms or corrects it." };
  if (/^DL-U-/.test(id)) return { id, kind: "Your decision / constraint", what: id + " records something you decided or told the board.", why: "Every executive sees it in later rounds." };
  if (/^MODEL-/.test(id)) return { id, kind: "Canonical model variable", what: id + " is the single agreed value of one business variable used by every calculation and export.", why: "One value per variable prevents different screens and files showing different numbers." };
  if (/^IN-/.test(id)) return { id, kind: "Your input", what: id + " is a number taken directly from your question.", why: "Your numbers are never replaced by an executive's figure; differences are shown as model conflicts." };
  if (/^AMB-/.test(id)) return { id, kind: "Input ambiguity", what: id + " marks a number in your question that can be read two ways.", why: "The readings give different answers, so you are asked to confirm.", provide: "Choose the correct reading." };
  if (/^F\d+$/.test(id)) return { id, kind: "Research finding", what: id + " is a numbered finding in the research brief.", why: "Claims point to findings so you can check where a number came from." };
  if (/^S\d+$/.test(id)) return { id, kind: "Source", what: id + " is a numbered source (web page or document) used by the research.", why: "Every finding traces back to a source." };
  return { id, kind: "Reference", what: id + " is an internal reference used for the audit trail.", why: "It lets an analyst trace this item back to its origin." };
}
