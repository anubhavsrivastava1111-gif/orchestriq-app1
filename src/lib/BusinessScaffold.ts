// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS SCAFFOLD — universal cost and viability structure
//
// Purpose: give every executive the same first-principles skeleton for costing
// and evaluating ANY business, without a per-industry template. A steel rolling
// mill, a mango orchard, a BOT highway, a diagnostics chain and a SaaS product
// all have the same nine cost buckets in different proportions. The executive
// populates the buckets from the facts of the case; the structure never changes.
//
// This file exports prompt fragments only. It performs no arithmetic and makes
// no API calls, so it cannot break any existing path. Consumers opt in.
//
// Extension points:
//   COST_BUCKETS          — add or reword a bucket once, reaches every consumer
//   VIABILITY_REQUIREMENTS — what must be established before a recommendation
//   ARCHETYPE_HINTS       — optional nudges by business shape, never templates
// ─────────────────────────────────────────────────────────────────────────────

export type CostBucket = {
  id: string;
  name: string;
  test: string;      // the question that decides what belongs in this bucket
  examples: string;  // deliberately cross-industry, to prevent template thinking
};

export const COST_BUCKETS: CostBucket[] = [
  {
    id: "inputs",
    name: "Direct inputs and materials",
    test: "What is physically or digitally consumed to produce one unit of output?",
    examples: "raw material or ore; seed, feed and fertiliser; components; AI tokens and API calls; drug or reagent cost; fuel",
  },
  {
    id: "conversion",
    name: "Direct conversion labour",
    test: "Whose paid time is consumed in producing the output itself, not in running the company?",
    examples: "furnace and mill crew; field and harvest labour; assembly line; billable consultant hours; nursing and technician time",
  },
  {
    id: "capacity",
    name: "Capacity and asset cost",
    test: "What must exist and be paid for before a single unit can be produced, and what is its running cost?",
    examples: "plant, furnace, kiln; land, orchard, cold store; vehicles and machinery; servers, database, storage; clinic premises and equipment",
  },
  {
    id: "delivery",
    name: "Delivery and logistics",
    test: "What does it cost to get the output from where it is made to where it is consumed?",
    examples: "freight, handling, demurrage; mandi and transport charges; last-mile delivery; bandwidth and CDN; distribution commissions",
  },
  {
    id: "acquisition",
    name: "Customer acquisition",
    test: "What is spent to win one customer or one order, including unpaid founder or sales time valued honestly?",
    examples: "tender and bid preparation; dealer and channel margin; advertising and campaigns; sales headcount; aggregator or platform commission",
  },
  {
    id: "service",
    name: "Service, support and warranty",
    test: "What is spent after the sale to keep the customer served and the promise honoured?",
    examples: "after-sales service and warranty provision; helpdesk and support staff; field extension support; returns, rework and claims",
  },
  {
    id: "overhead",
    name: "Overhead and administration",
    test: "What is spent to keep the organisation running regardless of how much is produced?",
    examples: "management and admin salaries; office and utilities; accounting, audit and software subscriptions; insurance",
  },
  {
    id: "compliance",
    name: "Compliance, regulatory and statutory",
    test: "What is legally required to operate, including licences, filings, and the cost of getting them?",
    examples: "pollution control and factory licence; food safety and drug licence; data protection and audit; statutory employment cost; permits and lead time",
  },
  {
    id: "capital",
    name: "Capital charge",
    test: "What does the money itself cost — depreciation of assets plus the return the capital must earn?",
    examples: "depreciation and amortisation; interest on debt; opportunity cost of founder capital; working capital carrying cost",
  },
];

export const VIABILITY_REQUIREMENTS = [
  "Revenue model: exactly what is sold, to whom, at what price, and how often",
  "Volume: how many units, orders or customers are needed, and where that demand comes from",
  "Contribution margin: price per unit less variable cost per unit",
  "Break-even: the volume and the revenue at which losses stop, and the time to reach it",
  "Capital requirement: upfront capital plus working capital, and the payback period",
  "Capacity: the maximum output the proposed setup can sustain, and the cost of the next increment",
  "Operating requirements: people, skills, licences, premises, equipment and lead times",
  "Risk and constraint: what could break the model, and the earliest signal that it is breaking",
  "Targets: the specific numbers that must be hit for this to become profitable",
];

// Optional shape hints. These do NOT change the structure — they tell the
// executive which buckets usually dominate so that no material cost is ignored.
export const ARCHETYPE_HINTS: Record<string, string> = {
  asset_heavy: "Capacity, capital charge and compliance usually dominate. Utilisation rate is the single most important driver.",
  labour_intensive: "Conversion labour and overhead usually dominate. Productivity per head and attrition drive the outcome.",
  input_intensive: "Direct inputs dominate. Input price volatility and yield or wastage rate drive the outcome.",
  distribution_led: "Acquisition and delivery usually dominate. Channel margin and repeat rate drive the outcome.",
  digital_service: "Capacity and acquisition usually dominate; direct inputs scale with usage. Cost per transaction and retention drive the outcome.",
  regulated_service: "Compliance and service usually dominate. Licence lead time can delay revenue far more than cost.",
};

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The core scaffold. Injected into executive prompts so that costing is
 * structured identically across every industry and every question type.
 */
export function buildScaffoldPrompt(opts?: { archetype?: string; compact?: boolean }): string {
  const hint = opts?.archetype ? ARCHETYPE_HINTS[opts.archetype] : "";
  const lines: string[] = [];

  lines.push("BUSINESS FUNDAMENTALS SCAFFOLD (apply from first principles — never from an industry template):");
  lines.push("");
  lines.push("Every business, in every industry, has the nine cost buckets below in different proportions. Where a cost is material to THIS business, populate the bucket. Where a bucket genuinely does not apply here, write 'not applicable' and say why in a few words — do not silently omit it, because an omitted bucket is how a cost model becomes wrong.");
  lines.push("");

  COST_BUCKETS.forEach((b, i) => {
    if (opts?.compact) {
      lines.push((i + 1) + ". " + b.name + " — " + b.test);
    } else {
      lines.push((i + 1) + ". " + b.name);
      lines.push("   Test: " + b.test);
      lines.push("   Across industries: " + b.examples);
    }
  });

  lines.push("");
  lines.push("FOR EVERY BUCKET YOU POPULATE, STATE ALL FIVE:");
  lines.push("  (a) Low / Expected / High figure — three numbers, not one");
  lines.push("  (b) The driver that moves it from Low to High, and by how much");
  lines.push("  (c) Fixed, Variable, or Step-fixed — and if step-fixed, at what volume it steps");
  lines.push("  (d) Reducible, Optimisable, or Irreducible");
  lines.push("  (e) If Reducible or Optimisable: the specific lever, the realistic saving, and what is given up to get it");
  lines.push("");
  lines.push("If you do not have the data to populate a bucket, DO NOT invent a number. Name the missing variable, state the range it plausibly falls in with your basis for that range, and state how the conclusion changes at each end of the range.");

  if (hint) {
    lines.push("");
    lines.push("SHAPE NOTE for this business: " + hint);
  }

  return lines.join("\n");
}

/**
 * The viability checklist. Used where a recommendation is being formed, so the
 * board cannot conclude before the fundamentals are established.
 */
export function buildViabilityPrompt(): string {
  const lines: string[] = [];
  lines.push("VIABILITY REQUIREMENTS — no recommendation to proceed, price, or invest is valid until these are established or explicitly flagged as unknown:");
  VIABILITY_REQUIREMENTS.forEach((r, i) => lines.push("  " + (i + 1) + ". " + r));
  lines.push("");
  lines.push("Anything you cannot establish must be listed as an open variable with the impact of getting it wrong. A confident recommendation resting on unestablished fundamentals is a failure of the role, not a display of decisiveness.");
  return lines.join("\n");
}

/**
 * Infers the business shape from free text. Deliberately conservative: returns
 * an empty string when unsure, so no misleading hint is injected.
 */
export function inferArchetype(text: string): string {
  const q = (text || "").toLowerCase();
  if (/\b(plant|factory|mill|furnace|refinery|smelter|highway|toll|bot |infrastructure|warehouse|fleet|hangar|rig|mine|mining)\b/.test(q)) return "asset_heavy";
  if (/\b(farm|agri|orchard|crop|harvest|dairy|poultry|fishery|textile|garment|assembly|fabrication)\b/.test(q)) return "input_intensive";
  if (/\b(saas|software|app|platform|api|ai |website|web app|subscription)\b/.test(q)) return "digital_service";
  if (/\b(hospital|clinic|diagnostic|pharma|bank|nbfc|insurance|school|college|licen[cs]e)\b/.test(q)) return "regulated_service";
  if (/\b(retail|d2c|ecommerce|distribut|dealer|franchise|marketplace|fmcg)\b/.test(q)) return "distribution_led";
  if (/\b(consult|agency|staffing|bpo|services firm|salon|restaurant|logistics|security services)\b/.test(q)) return "labour_intensive";
  return "";
}
