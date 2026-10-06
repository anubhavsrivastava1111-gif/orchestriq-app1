// DECISION INTEGRITY - deterministic engine for the AI Boardroom's trust layer.
// Pure functions only: no React, no provider calls, no randomness.
//
//  1. Provider attempts       -> one clean execution state per executive and per board
//  2. Evidence linking        -> a model's "[Verified Fact]" label never makes a claim verified
//  3. Echo vs agreement       -> only true copies are excluded
//  4. Contradiction analysis  -> typed, with deterministic resolution before arbitration
//  5. Model registry          -> one canonical value per decision variable, audited changes
//  6. Sensitivity             -> which variables could reverse the decision, at what threshold
//  7. Decision engine         -> deterministic state, categorical confidence, what could change it
//  8. User-only unknowns      -> questions only the user can answer, with stable ids
//  9. Gap prioritisation      -> research only HIGH impact + HIGH uncertainty gaps
// 10. Synthesis packet        -> structured input for the Chairman instead of raw essays

// ── 1. PROVIDER ATTEMPTS ────────────────────────────────────────────────────
export type AttemptResult = "success" | "timeout" | "quota" | "auth" | "context_limit" | "server_error" | "rate_limited" | "skipped" | "other";
export interface ProviderAttempt {
  provider: string; model: string; reason: "primary" | "fallback"; startedAt: string; durationMs: number;
  estimatedInputTokens: number; requestedOutputTokens: number; result: AttemptResult; detail?: string;
}
export type ExecutionState = "SUCCESS" | "SUCCESS_AFTER_FALLBACK" | "PARTIAL_PROVIDER_AVAILABILITY" | "ALL_PROVIDERS_UNAVAILABLE";

// Maps an error message (or the existing classifier's label) to an attempt result.
export function attemptResultFor(message: string): AttemptResult {
  const m = String(message || "").toLowerCase();
  if (/pre-check|prompt too long|context|too large|413|maximum context/.test(m)) return "context_limit";
  if (/\b401\b|\b403\b|unauthori[sz]ed|authori[sz]ation|forbidden|invalid (or missing )?api key|invalid api key/.test(m)) return "auth";
  if (/\b402\b|billing|insufficient|credit|quota|daily|free-tier/.test(m)) return "quota";
  if (/timed out|timeout|did not finish/.test(m)) return "timeout";
  if (/\b429\b|rate limit|rate-limited|rate limited/.test(m)) return "rate_limited";
  if (/\b5\d\d\b|overload|unavailable|server error|temporar/.test(m)) return "server_error";
  return "other";
}
export function executionState(attempts: ProviderAttempt[]): ExecutionState {
  const ok = attempts.filter((a) => a.result === "success");
  if (!ok.length) return "ALL_PROVIDERS_UNAVAILABLE";
  const failedBefore = attempts.filter((a) => a.result !== "success" && a.result !== "skipped");
  return failedBefore.length || attempts.some((a) => a.result === "skipped") ? "SUCCESS_AFTER_FALLBACK" : "SUCCESS";
}
const PNAME: Record<string, string> = { deepseek: "DeepSeek", gemini: "Gemini", groq: "Groq", kimi: "Kimi", nvidia: "NVIDIA", openai: "OpenAI", claude: "Claude" };
const pn = (p: string) => PNAME[p] || p;
// One concise, user-facing line - never a cascade of provider errors.
export function executionSummary(attempts: ProviderAttempt[]): string {
  const st = executionState(attempts);
  const ok = attempts.find((a) => a.result === "success");
  const fails = attempts.filter((a) => a.result !== "success");
  if (st === "SUCCESS") return "Completed using " + pn(ok!.provider) + ".";
  if (st === "SUCCESS_AFTER_FALLBACK") return "Completed using " + pn(ok!.provider) + " after " + fails.length + " provider fallback" + (fails.length === 1 ? "" : "s") + ".";
  const reasons = Array.from(new Set(fails.map((a) => pn(a.provider) + ": " + a.result.replace(/_/g, " "))));
  return "No provider could complete this step. " + reasons.join(" \u00b7 ") + ".";
}
export function boardExecutionState(perExec: { executive: string; attempts: ProviderAttempt[] }[]): { state: ExecutionState; message: string } {
  if (!perExec.length) return { state: "SUCCESS", message: "" };
  const states = perExec.map((e) => ({ e, s: executionState(e.attempts) }));
  const failed = states.filter((x) => x.s === "ALL_PROVIDERS_UNAVAILABLE");
  const fallback = states.filter((x) => x.s === "SUCCESS_AFTER_FALLBACK");
  if (failed.length === states.length) return { state: "ALL_PROVIDERS_UNAVAILABLE", message: "No provider could complete the board. " + executionSummary(perExec.flatMap((p) => p.attempts)) };
  if (failed.length) return { state: "PARTIAL_PROVIDER_AVAILABILITY", message: failed.map((x) => x.e.executive).join(", ") + " could not be completed; the other " + (states.length - failed.length) + " executives completed." };
  const used = Array.from(new Set(states.map((x) => pn(x.e.attempts.find((a) => a.result === "success")!.provider))));
  if (fallback.length) return { state: "SUCCESS_AFTER_FALLBACK", message: "All executives completed (" + used.join(", ") + "); " + fallback.length + " used a fallback provider." };
  return { state: "SUCCESS", message: "All executives completed using " + used.join(", ") + "." };
}

// ── 2. EVIDENCE LINKING ─────────────────────────────────────────────────────
export type SupportStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "CONTRADICTED" | "UNSUPPORTED" | "UNVERIFIED" | "INFERRED" | "ASSUMED" | "ESTIMATED";
export interface EvidenceItemLite { id: string; section: string; text: string; sourceIds: string[]; }
export interface EvidenceSetLite { items: EvidenceItemLite[]; sources: { id: string; url: string }[]; }
export interface LinkedClaim {
  id: string; text: string; executive: string; modelLabel: string; support: SupportStatus;
  evidenceRefs: string[]; sourceIds: string[]; sourceUrl: string; sourceTier: number; sourceDate: string;
  confidence: "high" | "medium" | "low" | "none"; modelAsserted: boolean; note: string;
}
// Source tiers: 1 official/statutory, 2 institutional/peer-reviewed, 3 recognised
// research/consultancy, 4 secondary reporting (or unclassified web source),
// 5 executive inference, 6 assumption/estimate, 7 unverified/model-generated.
export function sourceTier(url: string): number {
  const u = String(url || "").toLowerCase();
  if (!u) return 7;
  if (/\.gov(\.|\/|$)|\.gov\.in|\.nic\.in|rbi\.org\.in|sebi\.gov|mca\.gov|pib\.gov|indiacode|egazette|cbic|incometax|gst\.gov|\.europa\.eu|legislation\.gov|federalregister/.test(u)) return 1;
  if (/\.edu|\.ac\.in|\.ac\.uk|worldbank|imf\.org|oecd|icai\.org|ieee|nature\.com|sciencedirect|springer|ssrn|nber|who\.int|un\.org/.test(u)) return 2;
  if (/mckinsey|bcg\.com|bain\.com|deloitte|pwc\.|ey\.com|kpmg|gartner|statista|ibef\.org|crisil|icra|frost|mordorintelligence|grandviewresearch|imarcgroup|technavio|knightfrank|jll|cbre|anarock/.test(u)) return 3;
  return 4;
}
const TIER_LABEL: Record<number, string> = { 1: "Tier 1 official", 2: "Tier 2 institutional", 3: "Tier 3 research", 4: "Tier 4 secondary", 5: "Tier 5 inference", 6: "Tier 6 assumption", 7: "Tier 7 unverified" };
export const tierLabel = (t: number) => TIER_LABEL[t] || "Tier 7 unverified";
const STOPW = new Set("about above after their there these those which while with would could should from into over than that this were what when where have been being also only such very more most other some many much does each both just like make made need using used will shall must able across within under upon between".split(" "));
function kw(text: string): Set<string> { return new Set(String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOPW.has(w)).map((w) => w.slice(0, 6))); }
function kwOverlap(a: string, b: string): number { const A = kw(a); let n = 0; for (const w of kw(b)) if (A.has(w)) n++; return n; }
// Numbers normalised to a comparable base (crore/lakh/k/m expanded).
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(crore|cr\b|lakh|lac\b|l\b|k\b|m\b|mn\b|million|bn\b|billion)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || "")))) {
    let v = parseFloat(m[1].replace(/,/g, "")); if (!isFinite(v)) continue;
    const u = (m[2] || "").toLowerCase();
    if (u === "crore" || u === "cr") v *= 1e7; else if (u === "lakh" || u === "lac" || u === "l") v *= 1e5;
    else if (u === "k") v *= 1e3; else if (u === "m" || u === "mn" || u === "million") v *= 1e6; else if (u === "bn" || u === "billion") v *= 1e9;
    out.push(v);
  }
  return out;
}
const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-9);
function yearOf(t: string): string { const m = String(t || "").match(/\b(20\d\d|19\d\d)\b/g); return m ? m[m.length - 1] : ""; }
const URL_RX = /https?:\/\/[^\s)\]>"']+/g;

export function linkClaims(executive: string, fullText: string, ev: EvidenceSetLite): LinkedClaim[] {
  const claims: LinkedClaim[] = []; let n = 0;
  for (const raw of String(fullText || "").split("\n")) {
    const line = raw.replace(/^\s*(?:[-*\u2022>]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim();
    if (line.length < 12 || /^\|?[-:| ]+\|?$/.test(line)) continue;
    const tag = (line.match(/\[(verified fact|expert inference|assumption|estimate|recalled[^\]]*)\]/i) || [])[1] || "";
    const nums = numbersIn(line.replace(URL_RX, ""));
    const hasFigure = /(\u20b9|\$|rs\.?\s?\d|\d+(\.\d+)?\s?(%|crore|cr\b|lakh|million|billion|bn\b))/i.test(line);
    if (!tag && !hasFigure) continue;
    n++;
    const base = { id: executive.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) + "-CL-" + String(n).padStart(3, "0"), text: line, executive, modelLabel: tag || "untagged",
      evidenceRefs: [] as string[], sourceIds: [] as string[], sourceUrl: "", sourceTier: 7, sourceDate: "", confidence: "none" as LinkedClaim["confidence"], modelAsserted: false, note: "" };
    // Model-declared non-facts keep their nature regardless of evidence.
    if (/assumption/i.test(tag)) { claims.push({ ...base, support: "ASSUMED", sourceTier: 6, note: "declared an assumption" }); continue; }
    if (/estimate/i.test(tag)) { claims.push({ ...base, support: "ESTIMATED", sourceTier: 6, note: "declared an estimate" }); continue; }
    if (/inference/i.test(tag)) { claims.push({ ...base, support: "INFERRED", sourceTier: 5, note: "executive inference" }); continue; }
    // A URL cited by the model counts only if it is one of the RETRIEVED sources.
    const cited = (line.match(URL_RX) || []).map((u) => u.replace(/[.,;:]+$/, ""));
    const retrieved = cited.map((u) => ev.sources.find((s) => s.url === u)).filter(Boolean) as { id: string; url: string }[];
    // Search the research evidence for a finding about the same thing.
    const cands = ev.items.map((i) => ({ i, o: kwOverlap(line, i.text) })).filter((x) => x.o >= 2).sort((a, b) => b.o - a.o).slice(0, 5);
    let support: SupportStatus = "UNVERIFIED"; let refs: string[] = []; let srcIds: string[] = []; let note = "";
    const numMatch = nums.length ? cands.find((c) => numbersIn(c.i.text.replace(URL_RX, "")).some((x) => nums.some((y) => near(x, y)))) : undefined;
    if (retrieved.length) {
      const item = ev.items.find((i) => i.sourceIds.includes(retrieved[0].id));
      support = item && (!nums.length || numbersIn(item.text).some((x) => nums.some((y) => near(x, y)))) ? "SUPPORTED" : "PARTIALLY_SUPPORTED";
      refs = item ? [item.id] : []; srcIds = retrieved.map((r) => r.id); note = "cites a retrieved source";
    } else if (numMatch && numMatch.o >= 2) {
      support = "SUPPORTED"; refs = [numMatch.i.id]; srcIds = numMatch.i.sourceIds; note = "figure matches research finding " + numMatch.i.id;
    } else if (cands.length && cands[0].o >= 4) {
      const conflict = nums.length && numbersIn(cands[0].i.text.replace(URL_RX, "")).length > 0 && cands[0].o >= 5 && sameUnitFamily(line, cands[0].i.text);
      support = conflict ? "CONTRADICTED" : "PARTIALLY_SUPPORTED"; refs = [cands[0].i.id]; srcIds = cands[0].i.sourceIds;
      note = conflict ? "research finding " + cands[0].i.id + " gives a different figure for the same subject" : "related research finding " + cands[0].i.id + " (figure not confirmed)";
    } else if (cited.length) { note = "cites a URL that was not among the retrieved sources"; }
    else note = /verified fact/i.test(tag) ? "labelled Verified Fact by the model, but no retrieved evidence supports it" : "no supporting evidence found";
    const url = srcIds.length ? (ev.sources.find((s) => s.id === srcIds[0])?.url || "") : "";
    const tier = url ? sourceTier(url) : 7;
    const ref0 = refs.length ? ev.items.find((i) => i.id === refs[0]) : undefined;
    claims.push({ ...base, support, evidenceRefs: refs, sourceIds: srcIds, sourceUrl: url, sourceTier: support === "UNVERIFIED" ? 7 : tier,
      sourceDate: ref0 ? yearOf(ref0.text) : "", modelAsserted: /verified fact/i.test(tag) && support === "UNVERIFIED",
      confidence: support === "SUPPORTED" ? (tier <= 2 ? "high" : "medium") : support === "PARTIALLY_SUPPORTED" ? "low" : "none", note });
  }
  return claims;
}
function sameUnitFamily(a: string, b: string): boolean {
  const fam = (t: string) => /%/.test(t) ? "pct" : /\u20b9|rs\.?|inr|crore|lakh/i.test(t) ? "inr" : /\$|usd|million|billion/i.test(t) ? "usd" : /day|month|year/i.test(t) ? "time" : "num";
  return fam(a) === fam(b);
}
export function supportSummary(claims: LinkedClaim[]) {
  const c = { total: claims.length, SUPPORTED: 0, PARTIALLY_SUPPORTED: 0, CONTRADICTED: 0, UNSUPPORTED: 0, UNVERIFIED: 0, INFERRED: 0, ASSUMED: 0, ESTIMATED: 0, modelAsserted: 0 };
  for (const x of claims) { (c as any)[x.support]++; if (x.modelAsserted) c.modelAsserted++; }
  return c;
}

// ── 3. ECHO vs INDEPENDENT AGREEMENT vs SHARED EVIDENCE ─────────────────────
function shingles(t: string, k = 5): Set<string> {
  const w = String(t || "").toLowerCase().replace(/[^a-z0-9\u20b9% ]+/g, " ").split(/\s+/).filter(Boolean);
  const s = new Set<string>(); for (let i = 0; i + k <= w.length; i++) s.add(w.slice(i, i + k).join(" ")); return s;
}
export type OverlapKind = "ECHO" | "INDEPENDENT_AGREEMENT" | "SHARED_EVIDENCE" | "DISTINCT";
// Text quoted from the shared research brief is removed before comparison, so two
// executives citing the same findings are not mistaken for one copying the other.
export function classifyOverlap(a: string, b: string, sharedEvidenceText = ""): { kind: OverlapKind; similarity: number } {
  const common = shingles(sharedEvidenceText);
  const A = new Set([...shingles(a)].filter((x) => !common.has(x))), B = new Set([...shingles(b)].filter((x) => !common.has(x)));
  if (!A.size || !B.size) return { kind: "DISTINCT", similarity: 0 };
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  const sim = inter / (A.size + B.size - inter);
  if (sim >= 0.55) return { kind: "ECHO", similarity: sim };
  const refsA = new Set(String(a).match(/\bF\d+\b/g) || []), refsB = new Set(String(b).match(/\bF\d+\b/g) || []);
  let sharedRefs = 0; for (const r of refsA) if (refsB.has(r)) sharedRefs++;
  const stance = (t: string) => /\b(do not|don't|avoid|no[- ]go|reject)\b/i.test(t) ? "no" : /\b(proceed|pursue|go ahead|recommend (entering|pursuing))\b/i.test(t) ? "go" : "";
  if (sharedRefs >= 2) return { kind: "SHARED_EVIDENCE", similarity: sim };
  if (stance(a) && stance(a) === stance(b)) return { kind: "INDEPENDENT_AGREEMENT", similarity: sim };
  return { kind: "DISTINCT", similarity: sim };
}

// ── 4. QUANTITIES + CONTRADICTION ANALYSIS ──────────────────────────────────
export interface Quantity { variable: string; value: number; unit: "INR" | "USD" | "PCT" | "DAYS" | "MONTHS" | "COUNT" | "RATIO"; period: "day" | "month" | "quarter" | "year" | ""; scope: string[]; text: string; by: string; }
// Decision variables recognised by deterministic patterns. Order matters (most specific first).
const VARIABLES: { id: string; label: string; re: RegExp; unit: Quantity["unit"] }[] = [
  { id: "dayRate", label: "billable day rate", re: /\b(day rate|per (engineer )?day|\/day|daily rate)\b/i, unit: "INR" },
  { id: "utilisation", label: "utilisation / occupancy", re: /\butili[sz]ation\b|\boccupancy\b/i, unit: "PCT" },
  { id: "billableDays", label: "billable days per month", re: /\bbillable days\b/i, unit: "DAYS" },
  { id: "headcount", label: "billable headcount", re: /\b(headcount|engineers|consultants|billable staff)\b/i, unit: "COUNT" },
  { id: "breakEven", label: "monthly break-even revenue", re: /\bbreak[- ]?even\b/i, unit: "INR" },
  { id: "contributionMargin", label: "contribution margin", re: /\bcontribution margin\b/i, unit: "PCT" },
  { id: "fixedCost", label: "monthly fixed cost", re: /\bfixed (operating |overhead )?costs?|\bopex\b|\boperating costs?\b/i, unit: "INR" },
  { id: "capex", label: "initial capital required", re: /\b(capex|initial capital|capital required|upfront investment|project cost|total project|project size|total investment)\b|\b(?:crore|cr)\b\s+(?:[\w-]+\s+){0,3}(?:facility|plant|project|factory|warehouse|centre|center)\b/i, unit: "INR" },
  // Generic business variables (scenario engine). Listed after the specific ones so
  // existing classifications are unchanged.
  { id: "equity", label: "equity", re: /\bequity\b|\bown (money|funds|capital)\b|\bpromoter contribution\b/i, unit: "INR" },
  { id: "funding", label: "funding available", re: /\b(funding|funds available|available capital|capital available|can invest|raised?)\b|\b(?:start|starting|begin|beginning|launch|launching|set up|setting up|open|opening)\b[^.;]*?\bwith\s+(?=(?:\u20b9|rs\.?\s?|inr\s?)\s?\d)|\b(?:i|we) (?:only )?(?:have|can invest|can put in)\b|\bonly\s+(?=(?:\u20b9|rs\.?\s?|inr\s?)\s?\d)|\bbudget\b/i, unit: "INR" },
  { id: "loanTenure", label: "loan tenure", re: /\b(tenure|repaid over|repayment (period|over)|loan term)\b/i, unit: "MONTHS" },
  { id: "variableCostPct", label: "variable cost (% of revenue)", re: /\bvariable costs?\b.*%|%.*\bvariable costs?\b/i, unit: "PCT" },
  { id: "interestRate", label: "interest rate", re: /\binterest\b|@\s?\d+(?:\.\d+)?\s?%|\b(?:debt|loans?|borrowings?)\b[^.;]*?\bat\s+(?:about\s+|around\s+|~)?\d+(?:\.\d+)?\s?%/i, unit: "PCT" },
  { id: "debt", label: "debt", re: /\b(debt|term loan|borrowings?)\b/i, unit: "INR" },
  { id: "price", label: "price per unit", re: /\b(price|selling price|fee|ticket size) per (unit|order|project|client|customer|job)\b|\bper (unit|order|project|job) (price|fee)\b/i, unit: "INR" },
  { id: "volume", label: "volume per month", re: /\b\d+\s?(units|orders|projects|clients|customers|jobs) (per|a|each) month\b/i, unit: "COUNT" },
  { id: "funding", label: "funding available", re: /\b(funding (available|of)|capital available|available (capital|funds|funding)|we have (\u20b9|rs)|budget of|total funding)\b|\b(?:start|starting|begin|beginning|launch|launching|set up|setting up|open|opening)\b[^.;]*?\bwith\s+(?=(?:\u20b9|rs\.?\s?|inr\s?)\s?\d)|\b(?:i|we) (?:only )?(?:have|can invest|can put in)\b|\bonly\s+(?=(?:\u20b9|rs\.?\s?|inr\s?)\s?\d)|\bbudget\b/i, unit: "INR" },
  { id: "cac", label: "customer acquisition cost", re: /\b(cac|customer acquisition cost|acquisition cost)\b/i, unit: "INR" },
  { id: "dso", label: "days sales outstanding", re: /\b(dso|payment cycle|days sales outstanding|receivable days|receivables?|credit (period|terms)|(pay|paid|payment) (in|within|after))\b|\b(?:take|takes|taking)\s+\d+\s?-?\s?days?\b|\bdays? to pay\b/i, unit: "DAYS" },
  { id: "marketSize", label: "market size", re: /\b(tam|sam|som|market size|addressable market|(total|overall|national|domestic) market|market (is )?(worth|valued))\b/i, unit: "INR" },
  { id: "revenue", label: "monthly revenue", re: /\b(monthly revenue|revenue)\b/i, unit: "INR" },
];
const SCOPE_WORDS = ["india", "national", "gurgaon", "gurugram", "delhi", "ncr", "total", "addressable", "serviceable", "obtainable", "residential", "commercial", "government", "private"];
// Clause-based, proximity-bound extraction. Each line is split into clauses
// (", " ; " and " " with " " funded by " " plus " sentence breaks). Within a clause,
// every variable keyword is bound to the NEAREST number of its kind, and a number is
// never used twice - so "Total project cost is Rs 12 crore, funded by Rs 8 crore equity
// and Rs 4 crore debt at 11% interest" yields capex, equity, debt and interest - not
// one mis-bound figure.
const MONEY_RE = /(\u20b9|rs\.?\s?|inr\s?|\$)\s?(\d[\d,]*(?:\.\d+)?)\s*(crore|cr\b|lakhs?|lacs?\b|l\b|k\b|m\b|mn\b|million|bn\b|billion)?/gi;
// Amounts written without a currency symbol but with a scale word ("8 crore", "4 Cr").
const BARE_MONEY_RE = /(^|[^\d.,\u20b9$])(\d[\d,]*(?:\.\d+)?)\s*(crores?|cr\b|lakhs?|lacs?\b)/gi;
function clausesOf(line: string): string[] {
  return line.split(/;|,\s+(?!\d{2,3}\b)|\s+and\s+|\s+with\s+(?!(?:\u20b9|rs\.?\s?|inr\s?)\s?\d)|\s+plus\s+|\s+funded by\s+|\.\s+(?=[A-Z\u20b9])/).map((c) => c.trim()).filter((c) => c && /\d/.test(c));
}
export function parseQuantities(text: string, by: string): Quantity[] {
  const out: Quantity[] = [];
  for (const raw of String(text || "").split("\n")) {
    const fullLine = raw.replace(/\*\*/g, "").replace(URL_RX, "").trim(); if (!/\d/.test(fullLine)) continue;
    for (const line of clausesOf(fullLine)) {
      const used = new Set<number>();
      // candidate number tokens of each kind, with positions
      const money: { pos: number; v: number; usd: boolean }[] = []; let m: RegExpExecArray | null; MONEY_RE.lastIndex = 0;
      while ((m = MONEY_RE.exec(line))) { const n = numbersIn(m[2] + " " + (m[3] || "").replace(/s$/i, ""))[0]; if (n !== undefined && isFinite(n)) money.push({ pos: m.index, v: n, usd: m[1] === "$" }); }
      BARE_MONEY_RE.lastIndex = 0;
      while ((m = BARE_MONEY_RE.exec(line))) {
        const pos = m.index + m[1].length; if (money.some((x) => Math.abs(x.pos - pos) <= 4)) continue;   // already captured with a symbol
        const n = numbersIn(m[2] + " " + m[3].replace(/s$/i, ""))[0]; if (n !== undefined && isFinite(n)) money.push({ pos, v: n, usd: false });
      }
      const pcts = Array.from(line.matchAll(/(\d+(?:\.\d+)?)\s?(?:%|percent\b|per cent\b)/gi)).map((x) => ({ pos: x.index || 0, v: parseFloat(x[1]) }));
      const days = Array.from(line.matchAll(/(\d+(?:\.\d+)?)\s?-?\s?(?:billable\s)?days?\b/gi)).map((x) => ({ pos: x.index || 0, v: parseFloat(x[1]) }));
      const counts = Array.from(line.matchAll(/(\d+)\s?(?:billable\s)?(?:engineers|consultants|staff|people|headcount|units|orders|projects|clients|customers|jobs)\b/gi)).map((x) => ({ pos: x.index || 0, v: parseFloat(x[1]) }));
      const years = Array.from(line.matchAll(/(\d+(?:\.\d+)?)\s?(years?|yrs?|months?)\b/gi)).map((x) => ({ pos: x.index || 0, v: parseFloat(x[1]) * (/^m/i.test(x[2]) ? 1 : 12) }));
      const nearest = <T extends { pos: number }>(arr: T[], at: number): T | undefined =>
        arr.filter((t) => !used.has(t.pos)).sort((a, b) => Math.abs(a.pos - at) - Math.abs(b.pos - at))[0];
      const seenVar = new Set<string>();
      for (const v of VARIABLES) {
        const km = line.match(v.re); if (!km || seenVar.has(v.id)) continue;
        const at = km.index || 0; let value: number | undefined; let unit = v.unit; let tok: { pos: number } | undefined;
        if (unit === "PCT") { const t = nearest(pcts, at); if (t) { value = t.v; tok = t; } }
        else if (unit === "DAYS") { const t = nearest(days, at); if (t) { value = t.v; tok = t; } }
        else if (unit === "MONTHS") { const t = nearest(years, at); if (t) { value = t.v; tok = t; } }
        else if (unit === "COUNT") { const t = nearest(counts, at) || (/headcount (?:of )?(\d+)/i.test(line) ? { pos: line.search(/headcount/i), v: parseFloat((line.match(/headcount (?:of )?(\d+)/i) as RegExpMatchArray)[1]) } : undefined); if (t) { value = (t as any).v; tok = t; } }
        else { const t = nearest(money, at); if (t) { value = t.v; tok = t; if (t.usd) unit = "USD"; } }
        if (value === undefined || !isFinite(value) || !tok) continue;
        used.add(tok.pos); seenVar.add(v.id);
        const period: Quantity["period"] = /\b(per day|\/day|a day|daily|day rate)\b/i.test(line) ? "day" : /\b(per month|\/month|monthly|a month|\/mo)\b/i.test(line) ? "month"
          : /\b(per quarter|quarterly)\b/i.test(line) ? "quarter" : /\b(per year|\/year|annual|annually|a year|p\.a\.|yearly)\b/i.test(line) ? "year" : "";
        const scope = SCOPE_WORDS.filter((w) => new RegExp("\\b" + w + "\\b", "i").test(line));
        out.push({ variable: v.id, value, unit, period: unit === "INR" || unit === "USD" ? period : "", scope, text: fullLine, by });
      }
    }
  }
  return out;
}
const PER_YEAR: Record<string, number> = { day: 250, month: 12, quarter: 4, year: 1 };
export type ContradictionType = "NUMERIC" | "FACTUAL" | "ASSUMPTION" | "SCOPE" | "TIMEFRAME" | "UNIT" | "INTERPRETATION" | "STRATEGIC";
export interface AnalysedContradiction {
  id: string; variable: string; claimA: string; claimB: string; executiveA: string; executiveB: string; evidenceA: string[]; evidenceB: string[];
  severity: "HIGH" | "MEDIUM" | "LOW"; type: ContradictionType; status: "resolved" | "conditionally_resolved" | "unresolved" | "requires_chairman" | "requires_user";
  resolutionMethod: string; resolutionEvidence: string; finalValue: number | null; confidence: "high" | "medium" | "low";
}
const CRITICAL_VARS = new Set(["dayRate", "utilisation", "breakEven", "contributionMargin", "fixedCost", "capex", "cac", "dso", "revenue", "headcount", "billableDays", "funding", "variableCostPct", "price", "volume"]);
// Pairwise analysis of quantities about the same variable from DIFFERENT executives,
// resolving deterministically in the specified order before escalating.
export function analyseContradictions(qs: Quantity[], claims: LinkedClaim[] = [], extraPercents: number[] = []): AnalysedContradiction[] {
  const out: AnalysedContradiction[] = []; let n = 0;
  const byVar: Record<string, Quantity[]> = {};
  for (const q of qs) (byVar[q.variable] = byVar[q.variable] || []).push(q);
  for (const [variable, list] of Object.entries(byVar)) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]; if (a.by === b.by) continue;
      if (near(a.value, b.value, 0.005) && a.period === b.period) continue; // same value: duplicate claim, no contradiction
      const base: Omit<AnalysedContradiction, "type" | "status" | "resolutionMethod" | "resolutionEvidence" | "finalValue" | "confidence" | "severity"> = {
        id: "CX-" + String(++n).padStart(3, "0"), variable, claimA: a.text, claimB: b.text, executiveA: a.by, executiveB: b.by,
        evidenceA: claims.find((c) => c.text === a.text)?.evidenceRefs || [], evidenceB: claims.find((c) => c.text === b.text)?.evidenceRefs || [] };
      const diff = Math.abs(a.value - b.value) / Math.max(Math.abs(a.value), Math.abs(b.value), 1e-9);
      const severity: AnalysedContradiction["severity"] = CRITICAL_VARS.has(variable) && diff > 0.1 ? "HIGH" : diff > 0.25 ? "MEDIUM" : "LOW";
      // 1. UNIT mismatch (e.g. INR vs USD) - flag; cannot convert without a rate.
      if (a.unit !== b.unit) { out.push({ ...base, severity, type: "UNIT", status: "requires_chairman", resolutionMethod: "different units (" + a.unit + " vs " + b.unit + ")", resolutionEvidence: "", finalValue: null, confidence: "low" }); continue; }
      // 2. TIMEFRAME: same value once both are put on an annual basis.
      if (a.period && b.period && a.period !== b.period && a.unit !== "PCT") {
        const ay = a.value * PER_YEAR[a.period], by = b.value * PER_YEAR[b.period];
        if (near(ay, by, 0.03)) { out.push({ ...base, severity: "LOW", type: "TIMEFRAME", status: "resolved", resolutionMethod: "same figure expressed per " + a.period + " and per " + b.period, resolutionEvidence: "annualised both \u2248 " + Math.round(ay).toLocaleString("en-IN"), finalValue: ay, confidence: "high" }); continue; }
      }
      // 3. SCOPE: different geography/market scope -> not the same claim.
      const sa = a.scope.join(","), sb = b.scope.join(",");
      if (sa && sb && sa !== sb) { out.push({ ...base, severity: "LOW", type: "SCOPE", status: "conditionally_resolved", resolutionMethod: "different scope (" + sa + " vs " + sb + ")", resolutionEvidence: "both may be true for their own scope", finalValue: null, confidence: "medium" }); continue; }
      // 5. ARITHMETIC: the ratio equals a stated UTILISATION figure. Only a full
      // resolution when the text signals a realised/effective/blended rate - a bare
      // numeric coincidence is marked "probably explained - confirm", never silently resolved.
      const ratio = Math.min(a.value, b.value) / Math.max(a.value, b.value);
      const utilPcts = qs.filter((q) => q.variable === "utilisation").map((q) => q.value).concat(extraPercents);
      const driver = utilPcts.find((p) => p > 0 && p < 100 && Math.abs(p / 100 - ratio) < 0.01);
      if (driver !== undefined && a.unit === "INR") {
        const signalled = /\b(effective|realised|realized|blended|net of utili[sz]ation|after utili[sz]ation|utili[sz]ed)\b/i.test(a.text + " " + b.text);
        const hi = Math.max(a.value, b.value);
        out.push({ ...base, severity: signalled ? "LOW" : severity, type: "INTERPRETATION", status: signalled ? "resolved" : "conditionally_resolved",
          resolutionMethod: signalled ? "arithmetically reconciled: the realised figure is the list figure \u00d7 " + driver + "% utilisation"
            : "probably explained by " + driver + "% utilisation (the lower figure equals the higher \u00d7 " + driver + "%) - confirm which figure is the list rate",
          resolutionEvidence: hi.toLocaleString("en-IN") + " \u00d7 " + driver + "% = " + Math.round(hi * driver / 100).toLocaleString("en-IN"), finalValue: signalled ? hi : null, confidence: signalled ? "high" : "medium" });
        continue;
      }
      // 6/7. EVIDENCE QUALITY: prefer the side backed by better (lower-tier) retrieved evidence.
      const ca = claims.find((c) => c.text === a.text), cb = claims.find((c) => c.text === b.text);
      const ta = ca && ca.support === "SUPPORTED" ? ca.sourceTier : 9, tb = cb && cb.support === "SUPPORTED" ? cb.sourceTier : 9;
      if (ta !== tb && Math.min(ta, tb) <= 4) {
        const win = ta < tb ? a : b, wc = ta < tb ? ca! : cb!;
        out.push({ ...base, severity, type: "NUMERIC", status: "resolved", resolutionMethod: "evidence quality: " + win.by + "'s figure is backed by " + tierLabel(wc.sourceTier), resolutionEvidence: wc.evidenceRefs.join(","), finalValue: win.value, confidence: wc.sourceTier <= 2 ? "high" : "medium" });
        continue;
      }
      // 9/10. No deterministic resolution: material ones escalate.
      out.push({ ...base, severity, type: a.text.match(/\[assumption|\bassum/i) || b.text.match(/\[assumption|\bassum/i) ? "ASSUMPTION" : "NUMERIC",
        status: severity === "HIGH" ? "requires_chairman" : "unresolved", resolutionMethod: "no deterministic resolution (not a unit, timeframe, scope or arithmetic difference; neither side has stronger evidence)",
        resolutionEvidence: "", finalValue: null, confidence: "low" });
    }
  }
  return out;
}

// ── 5. MODEL REGISTRY (single source of truth) ──────────────────────────────
export interface RegistryEntry {
  id: string; variable: string; label: string; unit: string; period: string; value: number | null;
  range: { low: number; base: number; high: number } | null; classification: "supported" | "estimate" | "assumption" | "derived" | "user" | "unverified";
  sourceClaims: { by: string; value: number; text: string }[]; supportingEvidence: string[]; conflictingClaims: string[];
  confidence: "high" | "medium" | "low"; status: "OPEN" | "RECONCILED" | "SET_BY_USER" | "DERIVED";
  history: { at: string; old: number | null; new: number | null; by: string; reason: string }[];
}
export type ModelRegistry = Record<string, RegistryEntry>;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function buildRegistry(qs: Quantity[], claims: LinkedClaim[], resolved: AnalysedContradiction[] = []): ModelRegistry {
  const reg: ModelRegistry = {};
  for (const q of qs) {
    const def = VARIABLES.find((v) => v.id === q.variable)!;
    // Normalise money to the variable's canonical period when known (day rate per day, others per month).
    const canonPeriod = q.variable === "dayRate" ? "day" : ["fixedCost", "breakEven", "revenue"].includes(q.variable) ? "month" : "";
    let value = q.value;
    if (canonPeriod && q.period && q.period !== canonPeriod && q.unit !== "PCT") value = q.value * PER_YEAR[q.period] / PER_YEAR[canonPeriod];
    const e = reg[q.variable] || (reg[q.variable] = { id: "MODEL-" + q.variable.toUpperCase() + "-001", variable: q.variable, label: def.label, unit: q.unit, period: canonPeriod,
      value: null, range: null, classification: "unverified", sourceClaims: [], supportingEvidence: [], conflictingClaims: [], confidence: "low", status: "OPEN", history: [] });
    if (!e.sourceClaims.some((s) => s.by === q.by && near(s.value, value, 0.001))) e.sourceClaims.push({ by: q.by, value, text: q.text });
  }
  for (const e of Object.values(reg)) {
    const vals = e.sourceClaims.map((s) => s.value);
    const linked = e.sourceClaims.map((s) => claims.find((c) => c.text === s.text)).filter(Boolean) as LinkedClaim[];
    const supported = linked.filter((c) => c.support === "SUPPORTED").sort((a, b) => a.sourceTier - b.sourceTier);
    const fix = resolved.find((r) => r.variable === e.variable && r.status === "resolved" && r.finalValue !== null);
    const base = fix ? fix.finalValue! : supported.length ? (numbersIn(supported[0].text).find((x) => vals.some((v) => near(v, x))) ?? median(vals)) : median(vals);
    e.value = base; e.range = { low: Math.min(...vals), base, high: Math.max(...vals) };
    e.supportingEvidence = Array.from(new Set(supported.flatMap((c) => c.evidenceRefs)));
    e.classification = supported.length ? "supported" : linked.some((c) => c.support === "ESTIMATED") ? "estimate" : linked.some((c) => c.support === "ASSUMED") ? "assumption" : "unverified";
    e.confidence = supported.length && supported[0].sourceTier <= 2 ? "high" : supported.length ? "medium" : "low";
    const distinct = vals.filter((v, i) => vals.findIndex((w) => near(v, w, 0.01)) === i);
    e.conflictingClaims = distinct.length > 1 ? e.sourceClaims.filter((s) => !near(s.value, base, 0.01)).map((s) => s.by + ": " + s.text) : [];
    e.status = fix || distinct.length <= 1 ? "RECONCILED" : "OPEN";
    e.history.push({ at: "", old: null, new: base, by: "registry", reason: fix ? "contradiction resolved: " + fix.resolutionMethod : supported.length ? "best-evidenced claim" : "median of executive figures" });
  }
  recalcDerived(reg, "registry");
  return reg;
}
// Derived metrics recalculated deterministically whenever an input changes.
const DERIVED: { id: string; label: string; unit: string; inputs: string[]; fn: (v: Record<string, number>) => number }[] = [
  { id: "breakEvenCalc", label: "break-even revenue (calculated)", unit: "INR", inputs: ["fixedCost", "contributionMargin"], fn: (v) => v.fixedCost / (v.contributionMargin / 100) },
  { id: "revenueCalc", label: "monthly revenue (calculated)", unit: "INR", inputs: ["dayRate", "billableDays", "headcount", "utilisation"], fn: (v) => v.dayRate * v.billableDays * v.headcount * (v.utilisation / 100) },
];
function recalcDerived(reg: ModelRegistry, by: string): string[] {
  const changed: string[] = [];
  for (const d of DERIVED) {
    if (!d.inputs.every((k) => reg[k] && reg[k].value !== null && isFinite(reg[k].value as number))) continue;
    const vals: Record<string, number> = {}; d.inputs.forEach((k) => (vals[k] = reg[k].value as number));
    const nv = d.fn(vals); if (!isFinite(nv)) continue;
    const e = reg[d.id] || (reg[d.id] = { id: "MODEL-" + d.id.toUpperCase() + "-001", variable: d.id, label: d.label, unit: d.unit, period: "month", value: null, range: null,
      classification: "derived", sourceClaims: [], supportingEvidence: [], conflictingClaims: [], confidence: "low", status: "DERIVED", history: [] });
    if (e.value === null || !near(e.value, nv, 0.0005)) { e.history.push({ at: new Date().toISOString(), old: e.value, new: nv, by, reason: "recalculated from " + d.inputs.join(", ") }); e.value = nv; changed.push(d.id); }
    const inConf = d.inputs.map((k) => reg[k].confidence);
    e.confidence = inConf.includes("low") ? "low" : inConf.includes("medium") ? "medium" : "high";
  }
  return changed;
}
// An executive (or the user) proposes a new value: recorded, dependents recalculated,
// old value kept in history.
export function updateVariable(reg: ModelRegistry, variable: string, value: number, by: string, reason: string): { changed: string[] } {
  const e = reg[variable]; if (!e) return { changed: [] };
  e.history.push({ at: new Date().toISOString(), old: e.value, new: value, by, reason }); e.value = value;
  if (e.range) e.range = { low: Math.min(e.range.low, value), base: value, high: Math.max(e.range.high, value) };
  e.status = by === "user" ? "SET_BY_USER" : e.status; if (by === "user") e.classification = "user";
  return { changed: [variable, ...recalcDerived(reg, by)] };
}

// ── 6. SENSITIVITY: what could reverse the decision ─────────────────────────
// PROCEED while modelled revenue covers break-even. For each revenue driver, the
// threshold at which revenue == break-even (other inputs held at base).
export function modelDecision(reg: ModelRegistry): { decision: "PROCEED" | "WAIT" | "UNKNOWN"; margin: number | null; basis: string } {
  const rev = reg.revenueCalc?.value ?? reg.revenue?.value ?? null; const be = reg.breakEvenCalc?.value ?? reg.breakEven?.value ?? null;
  if (rev === null || be === null || !isFinite(rev) || !isFinite(be) || be <= 0) return { decision: "UNKNOWN", margin: null, basis: "revenue and break-even are not both quantified" };
  return { decision: rev >= be ? "PROCEED" : "WAIT", margin: (rev - be) / be, basis: "modelled monthly revenue \u20b9" + Math.round(rev).toLocaleString("en-IN") + " vs break-even \u20b9" + Math.round(be).toLocaleString("en-IN") };
}
export function sensitivity(reg: ModelRegistry): { variable: string; label: string; base: number; threshold: number; headroomPct: number; statement: string }[] {
  const md = modelDecision(reg); if (md.decision === "UNKNOWN") return [];
  const be = (reg.breakEvenCalc?.value ?? reg.breakEven?.value) as number;
  const out: { variable: string; label: string; base: number; threshold: number; headroomPct: number; statement: string }[] = [];
  const revDrivers = ["dayRate", "billableDays", "headcount", "utilisation"];
  const rev = reg.revenueCalc?.value as number | undefined;
  if (rev && revDrivers.every((k) => reg[k]?.value)) for (const k of revDrivers) {
    const base = reg[k].value as number; const threshold = base * be / rev; // revenue is linear in each driver
    const headroomPct = (base - threshold) / base * 100;
    out.push({ variable: k, label: reg[k].label, base, threshold, headroomPct,
      statement: "If " + reg[k].label + " falls below " + fmtVal(threshold, reg[k].unit) + " (base " + fmtVal(base, reg[k].unit) + "), the recommendation changes from " + md.decision + " to " + (md.decision === "PROCEED" ? "WAIT" : "PROCEED") + "." });
  }
  if (reg.contributionMargin?.value && reg.fixedCost?.value && rev) {
    const base = reg.contributionMargin.value; const threshold = (reg.fixedCost.value as number) / rev * 100; const headroomPct = (base - threshold) / base * 100;
    out.push({ variable: "contributionMargin", label: reg.contributionMargin.label, base, threshold, headroomPct,
      statement: "If contribution margin falls below " + threshold.toFixed(1) + "% (base " + base + "%), the recommendation changes from " + md.decision + " to " + (md.decision === "PROCEED" ? "WAIT" : "PROCEED") + "." });
  }
  return out.sort((a, b) => Math.abs(a.headroomPct) - Math.abs(b.headroomPct)).slice(0, 3);
}
function fmtVal(v: number, unit: string): string {
  if (unit === "PCT") return v.toFixed(1) + "%"; if (unit === "DAYS") return v.toFixed(1) + " days"; if (unit === "COUNT") return v.toFixed(1);
  return "\u20b9" + Math.round(v).toLocaleString("en-IN");
}

// ── 7. USER-ONLY UNKNOWNS ───────────────────────────────────────────────────
// Questions the AI cannot research: the user's own resources, relationships,
// credentials, risk appetite or internal data.
export function isUserOnly(question: string): boolean {
  const q = String(question || "").toLowerCase();
  return /\b(you|your|yourself|founder'?s?|personally|do you have|can you|are you|will you|would you)\b/.test(q)
    && /\b(capital|fund|savings|invest|afford|carry|experience|credential|qualif|relationship|contacts?|network|clients?|customers?|risk appetite|comfortable|willing|time|commit|existing|internal|contract|licen[cs]e|team|partner)\b/.test(q);
}
export interface PendingUserQuestion { id: string; question: string; askedBy: string[]; status: "open" | "answered"; answer: string; answeredAt: string; }
export function mergeUserQuestions(existing: PendingUserQuestion[], questions: { q: string; by: string }[]): PendingUserQuestion[] {
  const out = existing.map((x) => ({ ...x, askedBy: [...x.askedBy] }));
  for (const { q, by } of questions) {
    if (!isUserOnly(q)) continue;
    // Same question if most of the shorter question's key words recur (60%).
    const same = out.find((x) => kwOverlap(x.question, q) >= Math.max(2, Math.ceil(Math.min(kw(x.question).size, kw(q).size) * 0.6)));
    if (same) { if (!same.askedBy.includes(by)) same.askedBy.push(by); continue; }   // never ask the same thing twice
    out.push({ id: "UQ-" + String(out.length + 1).padStart(3, "0"), question: q, askedBy: [by], status: "open", answer: "", answeredAt: "" });
  }
  return out;
}
// A follow-up answer closes the matching open question (and is propagated by the caller).
export function answerUserQuestion(pending: PendingUserQuestion[], text: string): PendingUserQuestion | null {
  const open = pending.filter((p) => p.status === "open").map((p) => ({ p, o: kwOverlap(p.question, text) })).sort((a, b) => b.o - a.o)[0];
  if (!open || open.o < 2) return null;
  open.p.status = "answered"; open.p.answer = String(text).trim(); open.p.answeredAt = new Date().toISOString(); return open.p;
}

// ── 8. GAP PRIORITISATION (cost control) ────────────────────────────────────
export function prioritiseGaps(gaps: { id: string; question: string; priority: string; current_status: string }[], reg: ModelRegistry, contradictions: AnalysedContradiction[], location = ""): { id: string; question: string; researchQuestion: string; impact: "HIGH" | "LOW"; uncertainty: "HIGH" | "LOW" }[] {
  const out: { id: string; question: string; researchQuestion: string; impact: "HIGH" | "LOW"; uncertainty: "HIGH" | "LOW" }[] = [];
  for (const g of gaps) {
    if (g.current_status === "closed" || isUserOnly(g.question)) continue;   // user-only gaps are not researchable
    const relatesCritical = Object.values(reg).some((e) => CRITICAL_VARS.has(e.variable) && kwOverlap(e.label, g.question) >= 1)
      || contradictions.some((c) => c.severity === "HIGH" && c.status !== "resolved" && kwOverlap(c.claimA + " " + c.claimB, g.question) >= 2);
    const impact = g.priority === "high" || relatesCritical ? "HIGH" : "LOW";
    const uncertainty = !Object.values(reg).some((e) => e.classification === "supported" && kwOverlap(e.label, g.question) >= 2) ? "HIGH" : "LOW";
    if (impact === "HIGH" && uncertainty === "HIGH") {
      const core = g.question.replace(/\[evidence gap\]\s*/i, "").replace(/\b(cannot be verified|could not be verified|from the research|we need to verify|unverified)\b/gi, "").replace(/[?.]+$/, "").trim();
      out.push({ id: g.id, question: g.question, researchQuestion: (core + (location && !new RegExp(location, "i").test(core) ? " " + location : "") + " " + new Date().getFullYear()).replace(/\s+/g, " ").trim(), impact, uncertainty });
    }
  }
  return out.slice(0, 2);   // never research every gap
}

// ── 9. DECISION ENGINE ──────────────────────────────────────────────────────
export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export interface DecisionInput {
  rows: { executive: string; status: string; complete: boolean; identityValid: boolean; included: string }[];
  positions: { executive: string; stance: string }[];
  claims: LinkedClaim[]; contradictions: AnalysedContradiction[];
  gaps: { id: string; question: string; priority: string; current_status: string }[];
  userQuestions: PendingUserQuestion[]; registry: ModelRegistry; overrideContradictions?: boolean;
}
export interface DecisionOutput {
  decision: string; state: "READY FOR DECISION" | "NEEDS USER INPUT" | "NEEDS EVIDENCE" | "CONFLICTING EXECUTIVE VIEWS" | "PARTIAL EXECUTIVE INPUT" | "REQUIRES FOLLOW-UP RESEARCH";
  confidence: Confidence; confidenceReason: string; why: string[]; supportingEvidence: string[]; missingEvidence: string[];
  contradictionsRemaining: string[]; keyAssumptions: string[]; invalidators: string[]; requiredUserDecisions: string[];
}
export function decide(p: DecisionInput): DecisionOutput {
  const incomplete = p.rows.filter((r) => !r.complete);
  const identity = p.rows.filter((r) => !r.identityValid);
  const material = p.contradictions.filter((c) => c.severity === "HIGH" && c.status !== "resolved" && c.status !== "conditionally_resolved");
  const critGaps = p.gaps.filter((g) => g.priority === "high" && g.current_status !== "closed" && !isUserOnly(g.question));
  const openUser = p.userQuestions.filter((u) => u.status === "open");
  const s = supportSummary(p.claims);
  const supportedRatio = s.total ? s.SUPPORTED / s.total : 0;
  const md = modelDecision(p.registry);
  const go = p.positions.filter((x) => x.stance === "go").length, no = p.positions.filter((x) => x.stance === "no_go").length, cond = p.positions.filter((x) => x.stance === "conditional").length;
  const decision = md.decision !== "UNKNOWN" && (go || cond || no) ? (md.decision === "PROCEED" ? (no > go + cond ? "Board divided (model says proceed)" : cond ? "Proceed with conditions" : "Proceed") : "Wait")
    : no > go + cond ? "Do not proceed" : cond >= go && cond ? "Proceed with conditions" : go ? "Proceed" : "No clear decision";
  const why: string[] = [];
  incomplete.forEach((r) => why.push(r.executive + ": " + r.status.replace(/_/g, " ").toLowerCase()));
  material.slice(0, 3).forEach((c) => why.push("Unresolved " + c.variable + " conflict: " + c.executiveA + " vs " + c.executiveB));
  critGaps.slice(0, 3).forEach((g) => why.push("Missing evidence: " + g.question));
  openUser.slice(0, 3).forEach((u) => why.push(u.id + " needs your answer: " + u.question));
  if (md.decision !== "UNKNOWN") why.push("Model: " + md.basis);
  // READY only when nothing material is outstanding.
  const state: DecisionOutput["state"] = incomplete.length || identity.length ? "PARTIAL EXECUTIVE INPUT"
    : material.length && !p.overrideContradictions ? "CONFLICTING EXECUTIVE VIEWS"
    : openUser.length ? "NEEDS USER INPUT"
    : critGaps.some((g) => g.current_status === "targeted_research_candidate") ? "REQUIRES FOLLOW-UP RESEARCH"
    : critGaps.length ? "NEEDS EVIDENCE" : "READY FOR DECISION";
  // Categorical confidence - never a fake percentage.
  const assumptions = p.claims.filter((c) => c.support === "ASSUMED" || c.support === "ESTIMATED");
  let confidence: Confidence; let reason: string;
  if (identity.length || p.rows.every((r) => r.included === "excluded") || s.total === 0) { confidence = "INSUFFICIENT"; reason = identity.length ? "an executive contribution failed identity validation" : "no material claims could be assessed"; }
  else if (material.length || critGaps.length || incomplete.length) { confidence = "LOW"; reason = [material.length ? material.length + " material contradiction(s) unresolved" : "", critGaps.length ? critGaps.length + " critical evidence gap(s)" : "", incomplete.length ? incomplete.length + " executive(s) incomplete" : ""].filter(Boolean).join("; "); }
  else if (supportedRatio >= 0.6 && !openUser.length) { confidence = "HIGH"; reason = Math.round(supportedRatio * 100) + "% of material claims are backed by retrieved evidence; no material conflicts or gaps"; }
  else if (supportedRatio >= 0.25) { confidence = "MEDIUM"; reason = "executives converge, but " + (s.UNVERIFIED + s.ASSUMED + s.ESTIMATED) + " of " + s.total + " material claims are unverified, assumed or estimated" + (openUser.length ? "; " + openUser.length + " question(s) only you can answer" : ""); }
  else { confidence = "LOW"; reason = "only " + s.SUPPORTED + " of " + s.total + " material claims are backed by retrieved evidence"; }
  return { decision, state, confidence, confidenceReason: reason, why,
    supportingEvidence: p.claims.filter((c) => c.support === "SUPPORTED").slice(0, 5).map((c) => c.text + " [" + c.evidenceRefs.join(",") + "; " + tierLabel(c.sourceTier) + "]"),
    missingEvidence: critGaps.map((g) => g.id + " " + g.question),
    contradictionsRemaining: material.map((c) => c.id + " " + c.variable + ": " + c.executiveA + " vs " + c.executiveB),
    keyAssumptions: assumptions.slice(0, 5).map((c) => c.executive + ": " + c.text),
    invalidators: sensitivity(p.registry).map((x) => x.statement),
    requiredUserDecisions: openUser.map((u) => u.id + " " + u.question) };
}

// ── 10. SYNTHESIS PACKET ────────────────────────────────────────────────────
export function buildSynthesisPacket(p: {
  question: string; researchSummary: string; positions: { executive: string; stance: string; recommendation: string; status: string }[];
  claims: LinkedClaim[]; contradictions: AnalysedContradiction[]; gaps: { id: string; question: string; priority: string }[];
  assumptions: string[]; userQuestions: PendingUserQuestion[]; providerStatus: string; constraints: string[]; registry: ModelRegistry;
}): string {
  const L: string[] = ["SYNTHESIS PACKET (structured; full executive texts are kept for audit and export)", "", "STRATEGIC QUESTION: " + p.question];
  if (p.researchSummary) L.push("", "RESEARCH SUMMARY:", p.researchSummary.slice(0, 4000));
  L.push("", "EXECUTIVE POSITIONS:", ...p.positions.map((x) => "- " + x.executive + " [" + x.status + "; " + x.stance + "]: " + x.recommendation));
  const mat = p.claims.filter((c) => /\d/.test(c.text)).slice(0, 40);
  if (mat.length) L.push("", "MATERIAL CLAIMS (support status from evidence linking - not the model's own label):", ...mat.map((c) => "- " + c.executive + ": " + c.text.slice(0, 240) + " => " + c.support + (c.evidenceRefs.length ? " [" + c.evidenceRefs.join(",") + "; " + tierLabel(c.sourceTier) + "]" : "")));
  const regRows = Object.values(p.registry);
  if (regRows.length) L.push("", "CANONICAL MODEL (use these values; do not invent different ones):", ...regRows.map((e) => "- " + e.id + " " + e.label + ": " + (e.value === null ? "unknown" : fmtVal(e.value, e.unit)) + (e.range && e.range.low !== e.range.high ? " (range " + fmtVal(e.range.low, e.unit) + "\u2013" + fmtVal(e.range.high, e.unit) + ")" : "") + " [" + e.classification + "; " + e.status + "]"));
  if (p.contradictions.length) L.push("", "CONTRADICTIONS:", ...p.contradictions.map((c) => "- " + c.id + " " + c.variable + " [" + c.type + "; " + c.severity + "; " + c.status + "] " + c.executiveA + " vs " + c.executiveB + " \u2014 " + c.resolutionMethod));
  if (p.gaps.length) L.push("", "EVIDENCE GAPS:", ...p.gaps.map((g) => "- " + g.id + " [" + g.priority + "] " + g.question));
  if (p.assumptions.length) L.push("", "KEY ASSUMPTIONS:", ...p.assumptions.slice(0, 10).map((a) => "- " + a));
  const uq = p.userQuestions.filter((u) => u.status === "open");
  if (uq.length) L.push("", "QUESTIONS ONLY THE USER CAN ANSWER:", ...uq.map((u) => "- " + u.id + " " + u.question));
  if (p.constraints.length) L.push("", "USER DECISIONS / CONSTRAINTS:", ...p.constraints.map((c) => "- " + c));
  if (p.providerStatus) L.push("", "EXECUTION STATUS (diagnostic only - not part of the business reasoning): " + p.providerStatus);
  return L.join("\n");
}
