// ─────────────────────────────────────────────────────────────────────────────
// INTAKE REGISTER — Phase 0 of the board pipeline
//
// Purpose: before any analysis begins, establish what is actually KNOWN, what is
// UNKNOWN, and what is being ASSUMED. Executives may then reason from an honest
// evidence base instead of quietly inventing inputs and presenting a confident
// conclusion built on them.
//
// Two layers, deliberately:
//   1. scanSuppliedInputs() — deterministic. Code, not a model. It reports what
//      the user literally typed: figures, currencies, percentages, volumes,
//      timeframes. A model cannot hallucinate this away, so the register always
//      has a factual floor.
//   2. buildIntakePrompt() — one cheap LLM pass that turns that floor plus the
//      question into a structured Known / Unknown / Assumed register.
//
// Industry-agnostic by construction: it asks what a competent analyst would need
// for THIS business, rather than checking against a fixed field list. A field
// manifest cannot be written in advance for "a steel mill" and "a mango orchard"
// and "a SaaS product" at the same time.
//
// This file exports pure functions and prompt text only. No API calls, no
// arithmetic on business data, no imports. It cannot break an existing path.
// ─────────────────────────────────────────────────────────────────────────────

export interface SuppliedScan {
  figures: string[];        // numbers with a unit, currency or magnitude attached
  percentages: string[];
  timeframes: string[];
  currencies: string[];
  hasAnyNumber: boolean;
  wordCount: number;
  density: "none" | "sparse" | "moderate" | "rich";
}

/**
 * Deterministic scan of what the user actually supplied. No model involved.
 * Conservative by design: it under-reports rather than over-claims, because the
 * cost of wrongly telling the board "you have this figure" is far higher than
 * the cost of missing one.
 */
export function scanSuppliedInputs(text: string): SuppliedScan {
  const t = (text || "").trim();

  const currencyRe = /(?:₹|\brs\.?|\binr\b|\busd\b|\$|\beur\b|€|\bgbp\b|£)\s?\d[\d,]*(?:\.\d+)?\s?(?:k\b|lakhs?\b|crores?\b|cr\b|mn\b|million\b|bn\b|billion\b)?/gi;
  const unitRe = /\b[\d,]+(?:\.\d+)?\s?(?:tonnes?|tons?|tpd|kg|quintals?|litres?|liters?|units?|acres?|hectares?|sq\.?\s?ft|sqft|km|beds?|seats?|rooms?|users?|customers?|orders?|employees?|staff|headcount|mw|kw|kwh)\b/gi;
  const pctRe = /\b\d+(?:\.\d+)?\s?(?:%|per\s?cent\b|percent\b)/gi;
  const timeRe = /\b(?:\d+\s?(?:day|days|week|weeks|month|months|quarter|quarters|year|years|yr|yrs)|q[1-4]\s?(?:fy)?\s?\d{2,4}|fy\s?\d{2,4}|20\d{2})\b/gi;

  const uniq = (a: string[]) => Array.from(new Set(a.map((s) => s.trim())));

  const currencies = uniq(t.match(currencyRe) || []);
  const units = uniq(t.match(unitRe) || []);
  const percentages = uniq(t.match(pctRe) || []);
  const timeframes = uniq(t.match(timeRe) || []);
  const figures = uniq([...currencies, ...units]);

  const wordCount = t ? t.split(/\s+/).length : 0;
  const signals = figures.length + percentages.length + timeframes.length;

  let density: SuppliedScan["density"] = "none";
  if (signals >= 8) density = "rich";
  else if (signals >= 4) density = "moderate";
  else if (signals >= 1) density = "sparse";

  return {
    figures,
    percentages,
    timeframes,
    currencies,
    hasAnyNumber: signals > 0,
    wordCount,
    density,
  };
}

/** Human-readable summary of the deterministic scan, for injection into prompts. */
export function describeScan(scan: SuppliedScan): string {
  const parts: string[] = [];
  parts.push("DETERMINISTIC INPUT SCAN (what the user literally typed — this is fact, not inference):");
  parts.push("  Quantified figures supplied: " + (scan.figures.length ? scan.figures.join(" | ") : "NONE"));
  parts.push("  Percentages supplied: " + (scan.percentages.length ? scan.percentages.join(" | ") : "NONE"));
  parts.push("  Timeframes supplied: " + (scan.timeframes.length ? scan.timeframes.join(" | ") : "NONE"));
  parts.push("  Input richness: " + scan.density.toUpperCase() + " (" + scan.wordCount + " words)");
  if (!scan.hasAnyNumber) {
    parts.push("  WARNING: the user supplied NO quantified data at all. Every number in this analysis will be researched or assumed. Say so plainly.");
  }
  return parts.join("\n");
}

/**
 * Phase 0 prompt. One cheap pass, no web search — it reasons only about what is
 * present and what is missing, so it cannot introduce unsourced figures.
 */
export function buildIntakePrompt(question: string, contextBlock: string, scan: SuppliedScan): string {
  return [
    "You are the Head of Analysis. Before the board debates anything, you establish the evidence base. You do NOT solve the problem, recommend anything, or estimate any figure. You establish what is known, what is not, and what will have to be assumed.",
    "",
    contextBlock,
    "",
    describeScan(scan),
    "",
    'QUESTION UNDER ANALYSIS: "' + question + '"',
    "",
    "Produce exactly these five sections in markdown. Be concise and specific. No preamble, no closing summary.",
    "",
    "## WHAT THIS BUSINESS ACTUALLY IS",
    "In 3-5 lines: what is sold, to whom, how it is produced or delivered, and what makes money. If the question does not make this clear, say precisely which part is unclear. Do not fill the gap with a guess.",
    "",
    "## KNOWN",
    "Only what the user actually supplied or what is established in the context above. For each item give: the item, the value, and a reliability judgement — Reliable, Unverified, or Internally Inconsistent — with one clause of reasoning. If the user supplied a figure that looks wrong or implausible, flag it here rather than quietly using it.",
    "",
    "## UNKNOWN",
    "The variables a competent analyst would need before answering this question, that have NOT been supplied. For each: name the variable, state why it is load-bearing for the conclusion, and mark it Researchable (external data exists) or User-Only (only the user can supply it). Rank them: most decision-critical first.",
    "",
    "## MUST BE ASSUMED",
    "Assumptions the board will be forced to make. For each: the assumption, the plausible range it sits in, the basis for that range, and what changes in the conclusion at each end of the range. If an assumption cannot be bounded to a plausible range, say so — that is a stronger signal than a fabricated range.",
    "",
    "## VERDICT ON EVIDENCE SUFFICIENCY",
    "One of exactly three: SUFFICIENT / PARTIAL / INSUFFICIENT.",
    "  SUFFICIENT — a firm recommendation can be made now.",
    "  PARTIAL — a directional recommendation is possible, but named variables must be confirmed before commitment.",
    "  INSUFFICIENT — any recommendation would be guesswork; the honest output is a data-collection plan.",
    "Then in one line: the single piece of information that would most improve the quality of this analysis.",
    "",
    "Rules: never invent a figure to fill a gap. Never treat a researched benchmark as if the user supplied it. If the user supplied nothing quantitative, KNOWN will be nearly empty and that is the correct, honest answer.",
  ].join("\n");
}

/**
 * Wraps a completed register for injection into every executive's prompt.
 */
export function buildRegisterInjection(register: string): string {
  if (!register || !register.trim()) return "";
  return [
    "",
    "",
    "═══ EVIDENCE BASE ESTABLISHED BEFORE THIS DEBATE (Phase 0) ═══",
    register.trim(),
    "═══ END EVIDENCE BASE ═══",
    "",
    "HOW TO USE THIS: items under KNOWN may be used directly. Items under UNKNOWN must be researched within your remit, or carried as open variables — never silently filled in. Items under MUST BE ASSUMED must be reasoned across their stated range, not collapsed to a single convenient value. If your analysis depends on an UNKNOWN that you could not resolve, say so explicitly in your response rather than proceeding as though it were settled.",
  ].join("\n");
}

/** Fallback register used when the Phase 0 pass fails, so the board is never silently ungrounded. */
export const INTAKE_FAILED_NOTICE =
  "⚠ Phase 0 evidence assessment could not be completed. Treat every figure in this session as unverified, and state your assumptions explicitly.";
