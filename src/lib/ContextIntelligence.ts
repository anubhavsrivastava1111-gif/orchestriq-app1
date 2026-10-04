// CONTEXT INTELLIGENCE - decides WHAT context a provider receives.
// ModelRouting decides WHICH provider; this module never chooses providers and
// never calls one. Pure functions only, so every rule here is testable.
//
// Design rules (all enforced by tests):
//  - The Decision Ledger is VERBATIM extraction: sentences are copied, never
//    paraphrased, so tags like [Estimate] / [Assumption], numbers, dates and
//    uncertainty wording survive unchanged. Every line is attributed
//    ("CEO stated:"), so one executive's view is never presented as the board's.
//  - Evidence keeps provenance: every finding has an id (F#) and the ids of
//    the sources (S#) whose URLs it cites.
//  - Nothing is deleted from Research State. Selection only decides what goes
//    into ONE prompt; everything else stays retrievable.
//  - The budget check runs BEFORE a request. If even the most compact context
//    does not fit a provider, the caller skips that provider without a network
//    call - a context limit is not a failure to retry.
import { estimateTokens } from "./TokenCounter";

// ── 1. PROVIDER CONTEXT BUDGET ────────────────────────────────────────────────
// Conservative defaults, used only when no real metadata is passed in. Groq's
// free tier rejects any single request above its tokens-per-minute cap (input
// + output together), which is why its practical limit is far below the
// model's context window.
export const PROVIDER_CONTEXT_DEFAULTS: Record<string, { tokens: number; basis: string }> = {
  deepseek: { tokens: 1000000, basis: "official DeepSeek docs: V4 1M context, 384K max output (checked 2026-10-04)" },
  gemini: { tokens: 128000, basis: "conservative default (no metadata in app)" },
  groq: { tokens: 8000, basis: "free tier allows ~8,000 tokens/minute in total (per the app's own Groq wrapper)" },
  kimi: { tokens: 128000, basis: "conservative default (no metadata in app)" },
  nvidia: { tokens: 128000, basis: "conservative default; NVIDIA model metadata used when supplied" },
  openai: { tokens: 128000, basis: "conservative default (no metadata in app)" },
  claude: { tokens: 200000, basis: "conservative default (no metadata in app)" },
};
export const CONTEXT_SAFETY_MARGIN = 0.15;

export function contextLimitFor(provider: string, metadataTokens?: number): { tokens: number; basis: string } {
  if (metadataTokens && metadataTokens > 0) return { tokens: metadataTokens, basis: "model metadata" };
  return PROVIDER_CONTEXT_DEFAULTS[provider] || { tokens: 32000, basis: "unknown provider - conservative fallback" };
}

export interface BudgetCheck {
  provider: string; estInput: number; requestedOutput: number; estTotal: number;
  limit: number; usable: number; margin: number; fits: boolean; basis: string;
}
export function budgetCheck(provider: string, systemText: string, userText: string, maxOutputTokens: number, metadataTokens?: number): BudgetCheck {
  const lim = contextLimitFor(provider, metadataTokens);
  const estInput = estimateTokens(systemText) + estimateTokens(userText);
  const estTotal = estInput + maxOutputTokens;
  const usable = Math.floor(lim.tokens * (1 - CONTEXT_SAFETY_MARGIN));
  return { provider, estInput, requestedOutput: maxOutputTokens, estTotal, limit: lim.tokens, usable,
    margin: usable - estTotal, fits: estTotal <= usable, basis: lim.basis };
}

// ── 2. RESEARCH EVIDENCE WITH PROVENANCE ──────────────────────────────────────
export interface EvidenceItem { id: string; section: string; text: string; sourceIds: string[]; }
export interface EvidenceSet { items: EvidenceItem[]; sources: { id: string; url: string }[]; }

const URL_RE = /https?:\/\/[^\s)\]>"']+/g;

export function parseResearchEvidence(brief: string): EvidenceSet {
  const sources: { id: string; url: string }[] = [];
  const sourceIdFor = (url: string) => {
    const clean = url.replace(/[.,;:]+$/, "");
    let s = sources.find((x) => x.url === clean);
    if (!s) { s = { id: "S" + (sources.length + 1), url: clean }; sources.push(s); }
    return s.id;
  };
  const items: EvidenceItem[] = [];
  let section = "Overview";
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim(); buf = [];
    if (text.replace(/[-*#\s]/g, "").length < 12) return;
    const urls = text.match(URL_RE) || [];
    items.push({ id: "F" + (items.length + 1), section, text, sourceIds: Array.from(new Set(urls.map(sourceIdFor))) });
  };
  for (const raw of String(brief || "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const h = line.match(/^#{2,4}\s+(.*)$/);
    if (h) { flush(); section = h[1].trim().slice(0, 120); continue; }
    if (!line.trim()) { flush(); continue; }
    if (/^\s*([-*\u2022]|\d+[.)])\s+/.test(line) && buf.length) flush(); // a new bullet starts a new finding
    buf.push(line);
  }
  flush();
  return { items, sources };
}

export function renderEvidence(items: EvidenceItem[], sources: { id: string; url: string }[]): string {
  const used = new Set(items.flatMap((i) => i.sourceIds));
  let out = "";
  let lastSection = "";
  for (const it of items) {
    if (it.section !== lastSection) { out += "\n### " + it.section + "\n"; lastSection = it.section; }
    out += "[" + it.id + (it.sourceIds.length ? " \u2190 " + it.sourceIds.join(",") : "") + "] " + it.text + "\n";
  }
  const srcList = sources.filter((s) => used.has(s.id));
  if (srcList.length) out += "\nSOURCES: " + srcList.map((s) => s.id + " " + s.url).join(" | ") + "\n";
  return out.trim();
}

// ── 3. EXECUTIVE-SPECIFIC RELEVANCE ───────────────────────────────────────────
const STOP = new Set("about above after again against their there these those which while with would could should from into over than that this were what when where your yours have been being also only such very more most other some many much does each both just like make made need using used will shall must able across within under upon between".split(" "));
const stem = (w: string) => w.slice(0, 6);
function keywordSet(text: string): Set<string> {
  return new Set(String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)).map(stem));
}
export type RelevanceTier = "A" | "B" | "C" | "D";
// A = must see, B = should see, C = optional (retrievable), D = irrelevant to this
// mandate. Scored against the executive's EXISTING mandate text from the app.
export function classifyEvidence(items: EvidenceItem[], mandateText: string): { item: EvidenceItem; tier: RelevanceTier; score: number }[] {
  const mk = keywordSet(mandateText);
  const scored = items.map((item) => {
    let score = 0;
    for (const w of keywordSet(item.text + " " + item.section)) if (mk.has(w)) score++;
    for (const w of keywordSet(item.section)) if (mk.has(w)) score += 2; // a matching section title counts extra
    return { item, score };
  });
  const top = Math.max(0, ...scored.map((s) => s.score));
  return scored.map((s) => {
    let tier: RelevanceTier = s.score >= Math.max(3, top * 0.6) ? "A" : s.score >= 2 ? "B" : s.score === 1 ? "C" : "D";
    if (/^(overview|summary|executive summary|key findings)/i.test(s.item.section) && (tier === "C" || tier === "D")) tier = "B";
    // CROSS-FUNCTIONAL: a finding that changes costs, legal exposure or viability
    // matters to every executive even without their keywords (a regulatory fee
    // matters to the CFO; a payment-delay finding matters to the CEO).
    if ((tier === "C" || tier === "D") && isCrossFunctional(s.item.text)) tier = "B";
    return { item: s.item, tier, score: s.score };
  });
}

export function isCrossFunctional(text: string): boolean {
  const t = String(text || "").toLowerCase();
  const hasFigure = /\d/.test(t);
  if (hasFigure && /(mandatory|required|compliance|penalt|\bcess\b|\bgst\b|\btax|licen|regulat|\blaw\b|\bban\b)/.test(t)) return true;
  if (/(payment delay|delayed (client )?payments?|working capital|cash ?flow|insolven|shortage)/.test(t)) return true;
  return false;
}

// ── 4. DECISION LEDGER (verbatim extraction) ──────────────────────────────────
export interface LedgerEntry {
  executive: string; role: string; recommendation: string[]; conclusions: string[]; evidence: string[];
  numbers: string[]; assumptions: string[]; risks: string[]; opportunities: string[]; disagreements: string[];
  unanswered: string[]; confidence: string; sourceRefs: string[]; rawChars: number;
}
function sentencesOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of String(text || "").split("\n")) {
    const line = raw.replace(/^\s*(?:[-*\u2022>]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim();
    if (line.length < 15 || /^\|?[-:| ]+\|?$/.test(line)) continue;      // skip table separators / fragments
    if (line.length <= 420) { out.push(line); continue; }
    // long paragraphs are split into WHOLE sentences - a sentence is never cut in half
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z[\u20b9$])/)) if (s.trim().length >= 15) out.push(s.trim());
  }
  return out;
}
export function extractLedgerEntry(executive: string, role: string, text: string, sources: { id: string; url: string }[]): LedgerEntry {
  const S = sentencesOf(text);
  const pick = (re: RegExp, cap: number, exclude: Set<string> = new Set()) => {
    const out: string[] = [];
    for (const s of S) { if (out.length >= cap) break; if (!exclude.has(s) && re.test(s)) out.push(s); }
    return out;
  };
  // Recommendation section -> whole SENTENCES (same length rules as every other
  // field), so a long paragraph under the heading can never be copied wholesale
  // into later prompts.
  const rec: string[] = [];
  const lines = String(text || "").split("\n");
  for (let i = 0; i < lines.length && !rec.length; i++) {
    if (/^\s*#{0,4}\s*\**\s*(recommendation|verdict|decision|bottom line|final position|my position)\b/i.test(lines[i])) {
      const body: string[] = [];
      for (let j = i + 1; j < lines.length; j++) { if (/^\s*#{1,4}\s/.test(lines[j])) break; body.push(lines[j]); }
      rec.push(...sentencesOf(body.join("\n")).filter((x) => !/^confidence\b/i.test(x)).slice(0, 3));
    }
  }
  if (!rec.length) rec.push(...pick(/\b(i recommend|we recommend|recommendation|my position|should (proceed|not proceed|enter|avoid))\b/i, 2));
  const evidence = pick(/\[verified fact\]|https?:\/\//i, 6);
  const assumptions = pick(/\[assumption\]|\bassum(e|es|ing|ption)\b/i, 5);
  const numbers = pick(/(\u20b9|\$|rs\.?\s?\d|\d+(\.\d+)?\s?(%|crore|cr\b|lakh|million|billion|bn\b|k\b)|\[estimate)/i, 8, new Set([...evidence, ...assumptions]));
  const risks = pick(/\b(risk|threat|exposure|downside|failure|vulnerab|liabilit)/i, 5);
  const opportunities = pick(/\b(opportunit|upside|untapped|underserved|adjacen|white space|gap in the market|unmet)/i, 4);
  const disagreements = pick(/\b(disagree|contradict|differ(s)? from|i challenge|overstat|understat|flawed|does not hold|is wrong|my figure differs)/i, 4);
  const unanswered = pick(/\?\s*$|\b(missing|unknown|cannot be verified|unverified|not available|need (more )?(data|evidence)|insufficient evidence)\b/i, 5);
  const conclusions = pick(/\b(conclu|therefore|overall|in summary|net effect|key takeaway|this means)\b/i, 3);
  if (!conclusions.length) conclusions.push(...S.slice(0, 2));
  const conf = String(text || "").match(/confidence[^a-z]{0,12}(high|medium|moderate|low)/i);
  const cited = String(text || "").match(URL_RE) || [];
  const refs = Array.from(new Set(cited.map((u) => { const c = u.replace(/[.,;:]+$/, ""); return sources.find((s) => s.url === c)?.id || c; })));
  return { executive, role, recommendation: rec, conclusions, evidence, numbers, assumptions, risks, opportunities,
    disagreements, unanswered, confidence: conf ? conf[1].toLowerCase() : "not stated", sourceRefs: refs, rawChars: String(text || "").length };
}

export type LedgerDetail = "full" | "core" | "minimal";
// coveredByV2: when the V2 intelligence state is also sent, the V1 ledger omits
// what V2 already carries (assumptions, open questions, risks, opportunities,
// evidence) so the same content is never sent twice.
export function renderLedger(entries: LedgerEntry[], detail: LedgerDetail = "full", coveredByV2 = false): string {
  if (!entries.length) return "";
  const sec = (label: string, arr: string[], who: string) => arr.length ? label + ":\n" + arr.map((x) => "  - " + who + " stated: " + x).join("\n") + "\n" : "";
  let out = "DECISION LEDGER - verbatim extracts from earlier executives, attributed to each speaker. These are THEIR positions, not board conclusions. Full answers remain in the transcript.\n";
  for (const e of entries) {
    out += "\n\u2014 " + e.executive + " (confidence: " + e.confidence + ") \u2014\n";
    out += sec("Recommendation", e.recommendation, e.executive);
    out += sec("Key numbers", e.numbers, e.executive);
    out += sec("Disagreements", e.disagreements, e.executive);
    if (detail !== "minimal") {
      out += sec("Conclusions", e.conclusions, e.executive);
      if (!coveredByV2) {
        out += sec("Assumptions", e.assumptions, e.executive);
        out += sec("Open questions", e.unanswered, e.executive);
      }
    }
    if (detail === "full" && !coveredByV2) {
      out += sec("Evidence cited", e.evidence, e.executive);
      out += sec("Risks", e.risks, e.executive);
      out += sec("Opportunities", e.opportunities, e.executive);
    }
    if (e.sourceRefs.length) out += "Sources cited: " + e.sourceRefs.join(", ") + "\n";
  }
  return out.trim();
}

// ── 5. STAGED ASSEMBLY ────────────────────────────────────────────────────────
// Tries progressively more compact context, in the order the spec requires, and
// returns the first version that fits. Irrelevant (D) evidence and raw prior
// executive outputs are never included at any stage.
export interface AssembleResult {
  system: string; fits: boolean; strategy: string; check: BudgetCheck; evidenceIncluded: number; evidenceTotal: number;
  omittedIds: string[]; ledgerEntries: number; ledgerTokens: number; rawPriorOutputsIncluded: number;
}
export function assembleExecutiveContext(p: {
  provider: string; metadataTokens?: number; evidence: EvidenceSet; mandateText: string; ledger: LedgerEntry[];
  userText: string; maxOutputTokens: number; build: (evidenceBlock: string, ledgerBlock: string) => string;
  intel?: IntelligenceState;
}): AssembleResult {
  const tiers = classifyEvidence(p.evidence.items, p.mandateText);
  const A = tiers.filter((t) => t.tier === "A").map((t) => t.item);
  const AB = tiers.filter((t) => t.tier === "A" || t.tier === "B").map((t) => t.item);
  const stages: { name: string; items: EvidenceItem[]; detail: LedgerDetail }[] = [
    { name: "relevant evidence (must+should) + full ledger", items: AB, detail: "full" },
    { name: "relevant evidence (must+should) + core ledger", items: AB, detail: "core" },
    { name: "must-see evidence only + core ledger", items: A, detail: "core" },
    { name: "must-see evidence only + minimal ledger", items: A, detail: "minimal" },
    { name: "top half of must-see evidence + minimal ledger", items: A.slice(0, Math.max(1, Math.ceil(A.length / 2))), detail: "minimal" },
  ];
  let last: AssembleResult | null = null;
  for (const st of stages) {
    const shown = new Set(st.items.map((i) => i.id));
    const omitted = p.evidence.items.filter((i) => !shown.has(i.id));
    const evBlock = renderEvidence(st.items, p.evidence.sources)
      + (omitted.length ? "\n\nNOT SHOWN HERE (judged less relevant to your mandate; still held in Research State and citable by id): " + omitted.map((i) => i.id).join(", ") : "");
    // V1 attributed extracts + V2 compact intelligence state, both at the stage's detail level.
    const intelBlock = p.intel ? renderIntelligence(p.intel, p.mandateText, st.detail) : "";
    const ledgerBlock = [renderLedger(p.ledger, st.detail, !!intelBlock), intelBlock ? "SHARED DECISION INTELLIGENCE STATE:\n" + intelBlock : ""].filter(Boolean).join("\n\n");
    const system = p.build(evBlock, ledgerBlock);
    const check = budgetCheck(p.provider, system, p.userText, p.maxOutputTokens, p.metadataTokens);
    last = { system, fits: check.fits, strategy: st.name, check, evidenceIncluded: st.items.length, evidenceTotal: p.evidence.items.length,
      omittedIds: omitted.map((i) => i.id), ledgerEntries: p.ledger.length, ledgerTokens: estimateTokens(ledgerBlock), rawPriorOutputsIncluded: 0 };
    if (check.fits) return last;
  }
  return { ...(last as AssembleResult), fits: false, strategy: "does not fit this provider even fully compacted" };
}

// ══════════════════════════════════════════════════════════════════════════════
// DECISION LEDGER V2 - the SHARED DECISION INTELLIGENCE STATE.
// Built incrementally (append-only) from the V1 verbatim ledger entries and the
// research evidence. Deterministic: no AI call per finding or per object.
// IDs are stable: an object keeps its id as later executives speak, because the
// state is merged, never rebuilt. Unknown values stay "unknown" - never 0, never
// invented.
// ══════════════════════════════════════════════════════════════════════════════
export type ClaimKind = "FACT" | "INFERENCE" | "ASSUMPTION" | "ESTIMATE" | "UNVERIFIED";
export type Unknownable<T> = T | "unknown";
export interface Score { score: Unknownable<number>; reason: string; evidence_refs: string[]; }
export interface Opportunity {
  id: string; title: string; description: string; problem_or_gap: string; affected_stakeholder: string;
  value_chain_position: string; why_it_matters: string; evidence_refs: string[]; source_refs: string[];
  discovered_by: string; supporting_executives: string[]; challenging_executives: string[];
  assumptions: string[]; dependencies: string[]; estimated_value: string; value_type: string;
  market_or_customer_signal: string; competitive_intensity: string; feasibility: string; strategic_fit: string;
  risk: string; confidence: string; status: "discovered" | "supported" | "challenged" | "conditionally_supported" | "needs_validation" | "rejected" | "converted_to_decision";
  next_validation_question: string;
  validators: { executive: string; why: string; question: string }[];
  scores: Record<string, Score>;
  basis: "evidence" | "executive_reasoning" | "inference";
}
export interface Contradiction { id: string; statement_a: string; made_by_a: string; statement_b: string; made_by_b: string; affected_object: string; reason: string; evidence_a: string[]; evidence_b: string[]; status: "unresolved" | "resolved" | "conditionally_resolved" | "requires_research"; }
export interface Assumption { id: string; statement: string; kind: ClaimKind; source: string; made_by: string; confidence: string; impact_if_wrong: string; validation_method: string; status: "unvalidated" | "validated" | "invalidated"; }
export interface EvidenceGap { id: string; question: string; why_it_matters: string; decision_affected: string; identified_by: string; priority: "high" | "medium" | "low"; current_status: "open" | "targeted_research_candidate" | "closed"; required_evidence_type: string; }
export interface SimpleObj { id: string; text: string; by: string; kind?: ClaimKind; refs?: string[]; }
export interface ExecutivePosition { id: string; executive: string; stance: "go" | "no_go" | "conditional" | "unclear"; recommendation: string; confidence: string; }
export interface UserDecision { id: string; text: string; type: "decision" | "constraint"; at: string; }
export interface IntelligenceState {
  seq: Record<string, number>;
  conclusions: SimpleObj[]; evidence: SimpleObj[]; assumptions: Assumption[]; risks: SimpleObj[];
  opportunities: Opportunity[]; contradictions: Contradiction[]; gaps: EvidenceGap[]; alternatives: SimpleObj[];
  decisions: SimpleObj[]; unresolved: SimpleObj[]; positions: ExecutivePosition[]; userDecisions: UserDecision[];
}
export function emptyIntelligence(): IntelligenceState {
  return { seq: {}, conclusions: [], evidence: [], assumptions: [], risks: [], opportunities: [], contradictions: [], gaps: [],
    alternatives: [], decisions: [], unresolved: [], positions: [], userDecisions: [] };
}
const PREFIX: Record<string, string> = { conclusions: "C", evidence: "E", assumptions: "A", risks: "R", opportunities: "O", contradictions: "X",
  gaps: "G", alternatives: "L", decisions: "D", unresolved: "Q", positions: "P", userDecisions: "U" };
function nextId(st: IntelligenceState, reg: string): string {
  st.seq[reg] = (st.seq[reg] || 0) + 1;
  return "DL-" + PREFIX[reg] + "-" + String(st.seq[reg]).padStart(3, "0");
}
const norm = (t: string) => String(t || "").toLowerCase().replace(/\[[^\]]*\]/g, "").replace(/[^a-z0-9\u20b9% ]+/g, " ").replace(/\s+/g, " ").trim();
function overlap(a: string, b: string): number { const A = keywordSet(a); let n = 0; for (const w of keywordSet(b)) if (A.has(w)) n++; return n; }
const hasText = (arr: { text?: string; statement?: string; question?: string; description?: string }[], t: string) =>
  arr.some((x) => norm(x.text || x.statement || x.question || x.description || "") === norm(t));

export function classifyClaim(sentence: string): ClaimKind {
  const s = String(sentence || "");
  if (/\[verified fact\]/i.test(s) && /https?:\/\//.test(s)) return "FACT";   // a "fact" without a URL is NOT a fact
  if (/\[expert inference\]|\binfer|\bimplies\b|\blikely\b/i.test(s)) return "INFERENCE";
  if (/\[assumption\]|\bassum(e|es|ing|ption)\b/i.test(s)) return "ASSUMPTION";
  if (/\[estimate|\bestimat|\bapprox|\baround\b|~\s?\d/i.test(s)) return "ESTIMATE";
  return "UNVERIFIED";
}
function evidenceRefsFor(text: string, ev: EvidenceSet, min = 3): { refs: string[]; sources: string[] } {
  const hits = ev.items.map((i) => ({ i, n: overlap(text, i.text) })).filter((x) => x.n >= min).sort((a, b) => b.n - a.n).slice(0, 4);
  return { refs: hits.map((h) => h.i.id), sources: Array.from(new Set(hits.flatMap((h) => h.i.sourceIds))) };
}
// Which executives should validate an opportunity, and the question each must answer.
// Recorded only - actual handoff is Phase 20.
function validatorsFor(text: string): { executive: string; why: string; question: string }[] {
  const t = text.toLowerCase(); const v: { executive: string; why: string; question: string }[] = [];
  v.push({ executive: "CFO", why: "every opportunity needs an economic case", question: "What are the unit economics, capital required and payback?" });
  if (/regulat|licen|complian|legal|law|permit|rera|approval/.test(t)) v.push({ executive: "CLO", why: "regulatory or legal dimension", question: "What legal or regulatory exposure does this create, and what is required to comply?" });
  if (/data|platform|software|technolog|digital|automat|app\b|ai\b/.test(t)) v.push({ executive: "CTO", why: "technology dimension", question: "Is it technically feasible, at what build cost and timeline?" });
  if (/operat|supply|procure|logistic|process|capacity|contractor|labou?r/.test(t)) v.push({ executive: "COO", why: "operating model dimension", question: "Can it be delivered operationally at scale, and what are the bottlenecks?" });
  if (/customer|demand|market|segment|client|buyer/.test(t)) v.push({ executive: "CMO", why: "customer/market dimension", question: "Is there verified customer demand and willingness to pay?" });
  if (/strateg|position|adjacen|moat|compet|differentiat/.test(t)) v.push({ executive: "Chief Strategy Officer", why: "strategic positioning", question: "Does it fit strategy, and is it defensible against competitors?" });
  v.push({ executive: "Chief Risk Officer", why: "every opportunity carries risk", question: "What could make this fail, and what is the mitigation?" });
  return v;
}
function scoreOpportunity(text: string, refs: string[]): Record<string, Score> {
  const t = text.toLowerCase(); const u = (reason: string): Score => ({ score: "unknown", reason, evidence_refs: [] });
  const s: Record<string, Score> = {
    customer_pain: u("no evidence of customer pain extracted"), economic_value: u("no quantified value"), market_attractiveness: u("not assessed"),
    strategic_fit: u("not assessed"), competitive_whitespace: u("not assessed"), feasibility: u("not assessed"), defensibility: u("not assessed"),
    time_to_value: u("not assessed"), risk: u("not assessed"), evidence_strength: u("no supporting research finding linked"),
  };
  if (refs.length) s.evidence_strength = { score: Math.min(5, refs.length + 1), reason: refs.length + " research finding(s) linked", evidence_refs: refs };
  if (refs.length && /underserved|unmet|pain|delay|leak|ineffici|unorgani[sz]ed|fragment|shortage/.test(t))
    s.customer_pain = { score: 3, reason: "linked finding describes an unmet need, inefficiency or shortage", evidence_refs: refs };
  if (refs.length && /unorgani[sz]ed|fragment|no (major|established) player|white ?space|underserved/.test(t))
    s.competitive_whitespace = { score: 3, reason: "linked finding describes a fragmented/unorganised or underserved space", evidence_refs: refs };
  return s;
}
function titleOf(s: string): string {
  const clean = s.replace(/\[[^\]]*\]\s*/g, "").replace(/https?:\/\/\S+/g, "").trim();
  const cut = clean.split(/[:\u2014;.]/)[0]; return (cut.length >= 12 ? cut : clean).split(" ").slice(0, 10).join(" ");
}
function valueChainPosition(text: string, dimensions: string[]): string {
  let best = "unknown", n = 0; for (const d of dimensions || []) { const o = overlap(text, d); if (o > n) { n = o; best = d; } }
  return n ? best : "unknown";
}
const RISK_TO_OPP = /\b(risk|exposure|liabilit)\w*\b.*\b(opportunit|can be turned|creates? (a )?need)/i;

// Merge ONE executive's verbatim ledger entry (plus that executive's raw text,
// for tagged lines) into the shared state.
export function mergeIntoIntelligence(st: IntelligenceState, entry: LedgerEntry, rawText: string, ev: EvidenceSet, ctx: { question: string; dimensions: string[] }): IntelligenceState {
  const by = entry.executive; const q = ctx.question;
  const lines = sentencesOfPublic(rawText);
  const tagged = (re: RegExp) => lines.filter((l) => re.test(l));
  // Opportunities: explicit [Opportunity] tags first, then the V1 opportunity extracts.
  const oppTexts = Array.from(new Set([...tagged(/\[opportunity\]/i), ...entry.opportunities]));
  for (const o of oppTexts) {
    // Same opportunity if it shares the description's substance OR most of its
    // distinctive title words (a later executive often refers to it by name only).
    const existing = st.opportunities.find((x) => overlap(x.description, o) >= 4
      || (keywordSet(x.title).size >= 2 && overlap(x.title, o) >= Math.max(2, Math.ceil(keywordSet(x.title).size / 2))));
    if (existing) { if (existing.discovered_by !== by && !existing.supporting_executives.includes(by)) existing.supporting_executives.push(by); if (existing.status === "discovered") existing.status = "supported"; continue; }
    const { refs, sources } = evidenceRefsFor(o, ev);
    const money = o.match(/(\u20b9|rs\.?|\$)\s?[\d,.]+\s?(crore|cr|lakh|million|bn|billion|k)?/i);
    st.opportunities.push({
      id: nextId(st, "opportunities"), title: titleOf(o), description: o,
      problem_or_gap: /gap|underserved|unmet|missing|ineffici|unorgani[sz]ed|pain/i.test(o) ? o : "unknown",
      affected_stakeholder: (o.match(/\b(contractors?|developers?|homeowners?|customers?|clients?|suppliers?|smes?|buyers?|owners?)\b/i) || ["unknown"])[0],
      value_chain_position: valueChainPosition(o, ctx.dimensions), why_it_matters: "unknown", evidence_refs: refs, source_refs: sources,
      discovered_by: by, supporting_executives: [], challenging_executives: [], assumptions: [], dependencies: [],
      estimated_value: money ? money[0] : "unknown", value_type: /cost|saving|efficien/i.test(o) ? "cost" : /revenue|recurring|subscription|fee|sale/i.test(o) ? "revenue" : /risk|complian/i.test(o) ? "risk_reduction" : "unknown",
      market_or_customer_signal: refs.length ? "see " + refs.join(", ") : "unknown", competitive_intensity: "unknown", feasibility: "unknown",
      strategic_fit: "unknown", risk: "unknown", confidence: entry.confidence,
      status: refs.length ? "discovered" : "needs_validation",
      next_validation_question: refs.length ? "Validate demand and economics: " + validatorsFor(o)[0].question : "Find evidence that this need exists and someone pays to solve it.",
      validators: validatorsFor(o), scores: scoreOpportunity(o, refs),
      basis: refs.length ? "evidence" : /\[expert inference\]|infer/i.test(o) ? "inference" : "executive_reasoning",
    });
  }
  // Challenges to existing opportunities.
  for (const l of lines) if (/\b(disagree|challenge|not viable|unlikely to work|overstat|does not hold|reject)/i.test(l))
    for (const o of st.opportunities) if (o.discovered_by !== by && overlap(o.description, l) >= 3 && !o.challenging_executives.includes(by)) { o.challenging_executives.push(by); o.status = o.supporting_executives.length ? "conditionally_supported" : "challenged"; }
  // Rejection that keeps the opportunity (opportunity != recommendation).
  for (const r of entry.recommendation) if (/\b(do not|don't|avoid|not (build|pursue))\b/i.test(r))
    for (const o of st.opportunities) if (overlap(o.description, r) >= 3 && o.status !== "rejected") o.status = /initially|for now|first|later|internal/i.test(r) ? "conditionally_supported" : "rejected";
  // Assumptions - classified, never collapsed into facts.
  for (const a of Array.from(new Set([...tagged(/\[assumption\]/i), ...entry.assumptions, ...entry.numbers.filter((n) => /\[estimate|assum/i.test(n))]))) {
    if (hasText(st.assumptions, a)) continue;
    st.assumptions.push({ id: nextId(st, "assumptions"), statement: a, kind: classifyClaim(a), source: by + " (Boardroom stage)", made_by: by,
      confidence: entry.confidence, impact_if_wrong: /\u20b9|%|crore|lakh|margin|cost|price|cac|revenue/i.test(a) ? "changes the economics" : "unknown",
      validation_method: /licen|regulat|fee|law/i.test(a) ? "check the regulator's published rules" : /\u20b9|%|cost|price|cac|margin/i.test(a) ? "verify against quotes / market data" : "unknown",
      status: "unvalidated" });
  }
  // Evidence: only statements that carry a URL become FACT evidence.
  for (const e of entry.evidence) if (!hasText(st.evidence, e)) { const { refs } = evidenceRefsFor(e, ev, 2); st.evidence.push({ id: nextId(st, "evidence"), text: e, by, kind: classifyClaim(e), refs }); }
  // Evidence gaps -> structured, flagged as targeted-research candidates.
  for (const g of Array.from(new Set([...tagged(/\[evidence gap\]/i), ...entry.unanswered]))) {
    if (hasText(st.gaps, g) || st.gaps.some((x) => overlap(x.question, g) >= 5)) continue;
    const t = g.toLowerCase();
    st.gaps.push({ id: nextId(st, "gaps"), question: g, why_it_matters: "unknown", decision_affected: q, identified_by: by,
      priority: /cost|fee|price|licen|regulat|margin|cac|capital|eligib|law/.test(t) ? "high" : "medium",
      current_status: "targeted_research_candidate",
      required_evidence_type: /licen|regulat|law|permit|eligib|rera/.test(t) ? "regulatory" : /cost|fee|price|margin|cac|capital|revenue/.test(t) ? "financial" : /customer|demand|market/.test(t) ? "market" : /supply|operat|capacity/.test(t) ? "operational" : "unknown" });
  }
  for (const r of entry.risks) if (!hasText(st.risks, r)) st.risks.push({ id: nextId(st, "risks"), text: r, by, kind: classifyClaim(r) });
  for (const c of entry.conclusions) if (!hasText(st.conclusions, c)) st.conclusions.push({ id: nextId(st, "conclusions"), text: c, by, kind: classifyClaim(c) });
  for (const a of lines.filter((l) => /\b(alternative|instead of|rather than|option [a-z0-9]\b|plan b)\b/i.test(l)).slice(0, 4)) if (!hasText(st.alternatives, a)) st.alternatives.push({ id: nextId(st, "alternatives"), text: a, by });
  for (const u of entry.unanswered) if (!hasText(st.unresolved, u)) st.unresolved.push({ id: nextId(st, "unresolved"), text: u, by });
  // Executive position.
  const rec = entry.recommendation[0] || "";
  const isConditional = /\b(only if|if\b|unless|until|provided|subject to|conditional|pilot|otherwise)\b/i.test(rec);
  const stance = /\b(do not|don't|no[- ]go|avoid|reject)\b/i.test(rec) && !/\b(proceed|pursue)\b/i.test(rec) ? (isConditional ? "conditional" : "no_go")
    : isConditional ? "conditional"
    : /\b(proceed|go ahead|recommend (entering|pursuing)|pursue)\b/i.test(rec) ? "go" : rec ? "conditional" : "unclear";
  st.positions = st.positions.filter((p) => p.executive !== by);
  st.positions.push({ id: nextId(st, "positions"), executive: by, stance, recommendation: rec, confidence: entry.confidence });
  if (rec) st.decisions.push({ id: nextId(st, "decisions"), text: rec, by });
  // Contradictions - represented, never silently resolved.
  detectContradictions(st, entry, lines, ev);
  return st;
}
const METRIC = /\b(tam|sam|som|market size|margin|cac|payback|break-?even|capex|working capital|payment cycle|revenue|ebitda|cost)\b/i;
function detectContradictions(st: IntelligenceState, entry: LedgerEntry, lines: string[], ev: EvidenceSet) {
  const by = entry.executive;
  const others = st.positions.filter((p) => p.executive !== by).map((p) => p.executive);
  // (a) explicit disagreement naming another executive
  for (const l of lines.filter((x) => /\b(disagree|contradict|differ(s)? from|challenge|overstat|understat|flawed|does not hold|is wrong)/i.test(x))) {
    const target = others.find((o) => new RegExp("\\b" + o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(l));
    if (!target) continue;
    const prior = [...st.conclusions, ...st.assumptions.map((a) => ({ id: a.id, text: a.statement, by: a.made_by })), ...st.decisions]
      .filter((x: any) => x.by === target).sort((a: any, b: any) => overlap(b.text, l) - overlap(a.text, l))[0] as any;
    addContradiction(st, prior ? prior.text : "(" + target + "'s position)", target, l, by, prior ? prior.id : "unknown", "explicit disagreement by " + by, ev);
  }
  // (b) the same metric stated with different figures by different executives
  for (const n of entry.numbers) {
    const m = n.match(METRIC); if (!m) continue; const myNums = (n.match(/\d[\d,.]*/g) || []).join("|");
    for (const a of st.assumptions) {
      if (a.made_by === by) continue; const am = a.statement.match(METRIC);
      if (!am || am[0].toLowerCase() !== m[0].toLowerCase()) continue;
      const theirNums = (a.statement.match(/\d[\d,.]*/g) || []).join("|");
      if (myNums && theirNums && myNums !== theirNums) addContradiction(st, a.statement, a.made_by, n, by, a.id, "different figures for " + m[0], ev);
    }
  }
}
function addContradiction(st: IntelligenceState, a: string, byA: string, b: string, byB: string, affected: string, reason: string, ev: EvidenceSet) {
  if (st.contradictions.some((x) => norm(x.statement_b) === norm(b) && x.made_by_a === byA)) return;
  st.contradictions.push({ id: nextId(st, "contradictions"), statement_a: a, made_by_a: byA, statement_b: b, made_by_b: byB, affected_object: affected, reason,
    evidence_a: evidenceRefsFor(a, ev, 2).refs, evidence_b: evidenceRefsFor(b, ev, 2).refs, status: "unresolved" });
}
// Opportunities the research itself surfaces (unrequested), with provenance.
export function discoverResearchOpportunities(st: IntelligenceState, ev: EvidenceSet, dimensions: string[]): IntelligenceState {
  for (const it of ev.items) {
    if (!/\b(underserved|unmet need|unorgani[sz]ed|untapped|emerging|growing demand|gap|shortage|creates? (compliance )?demand|recurring revenue|opportunit)/i.test(it.text)) continue;
    if (st.opportunities.some((o) => o.evidence_refs.includes(it.id) || overlap(o.description, it.text) >= 4)) continue;
    const txt = it.text.replace(/\(\[source\]\([^)]*\)\)/g, "").replace(/^[-*\u2022]\s*/, "").trim();
    st.opportunities.push({ id: nextId(st, "opportunities"), title: titleOf(txt), description: txt, problem_or_gap: txt, affected_stakeholder: "unknown",
      value_chain_position: valueChainPosition(txt + " " + it.section, dimensions) !== "unknown" ? valueChainPosition(txt + " " + it.section, dimensions) : it.section,
      why_it_matters: "unknown", evidence_refs: [it.id], source_refs: it.sourceIds, discovered_by: "Research Desk", supporting_executives: [], challenging_executives: [],
      assumptions: [], dependencies: [], estimated_value: "unknown", value_type: "unknown", market_or_customer_signal: "see " + it.id, competitive_intensity: "unknown",
      feasibility: "unknown", strategic_fit: "unknown", risk: "unknown", confidence: "not stated", status: "needs_validation",
      next_validation_question: "Is this a commercially valuable opportunity? " + validatorsFor(txt)[0].question,
      validators: validatorsFor(txt), scores: scoreOpportunity(txt, [it.id]), basis: "evidence" });
  }
  return st;
}
// User decisions/constraints - recorded separately from executive conclusions.
export function recordUserDecision(st: IntelligenceState, text: string): UserDecision | null {
  const t = String(text || "").trim();
  if (!/\b(i insist|we will|we won'?t|we will not|we must|must be|only|do not|don'?t|we have decided|i('| ha)ve decided|i want|our constraint|budget is|cannot exceed|no more than|asset[- ]light)\b/i.test(t)) return null;
  if (st.userDecisions.some((u) => norm(u.text) === norm(t))) return null;
  const u: UserDecision = { id: nextId(st, "userDecisions"), text: t, type: /\b(only|must|cannot|no more than|budget|do not|don'?t|won'?t|will not|insist|asset[- ]light|never)\b/i.test(t) ? "constraint" : "decision", at: new Date().toISOString() };
  st.userDecisions.push(u); return u;
}
// Follow-up need: A existing evidence / B a known evidence gap / C new research scope.
export function classifyFollowUp(st: IntelligenceState, ev: EvidenceSet, question: string): { need: "A" | "B" | "C"; gap?: EvidenceGap; reason: string } {
  const gap = st.gaps.slice().sort((a, b) => overlap(b.question, question) - overlap(a.question, question))[0];
  if (gap && overlap(gap.question, question) >= 3) return { need: "B", gap, reason: "matches open evidence gap " + gap.id };
  const best = Math.max(0, ...ev.items.map((i) => overlap(i.text, question)), ...st.conclusions.map((c) => overlap(c.text, question)));
  if (best >= 2) return { need: "A", reason: "answerable from existing Research State" };
  return { need: "C", reason: "not covered by existing evidence or known gaps" };
}
// Compact, mandate-aware rendering. Cross-functional objects (multi-validator
// opportunities, high-priority gaps, all contradictions, user decisions) always
// pass the relevance filter; the rest are ranked by mandate overlap and capped.
export function renderIntelligence(st: IntelligenceState, mandateText: string, detail: LedgerDetail = "full"): string {
  if (!st) return "";
  const cap = detail === "full" ? 8 : detail === "core" ? 5 : 3;
  const rel = <T,>(arr: T[], text: (x: T) => string, cross: (x: T) => boolean) =>
    arr.map((x) => ({ x, s: overlap(text(x), mandateText), c: cross(x) })).filter((r) => r.c || r.s > 0)
      .sort((a, b) => Number(b.c) - Number(a.c) || b.s - a.s).slice(0, cap).map((r) => r.x);
  let out = "";
  if (st.userDecisions.length) out += "USER DECISIONS / CONSTRAINTS (set by the user - reason within them; you may state their consequences):\n" + st.userDecisions.map((u) => "  " + u.id + " [" + u.type + "] " + u.text).join("\n") + "\n";
  const opp = rel(st.opportunities, (o) => o.description + " " + o.value_chain_position, (o) => o.validators.length >= 4);
  if (opp.length) out += "OPPORTUNITIES (discovered, NOT recommendations):\n" + opp.map((o) => "  " + o.id + " [" + o.status + "; by " + o.discovered_by + (o.evidence_refs.length ? "; evidence " + o.evidence_refs.join(",") : "; no linked evidence") + "] " + o.title + " \u2014 next: " + o.next_validation_question).join("\n") + "\n";
  if (st.contradictions.length) out += "CONTRADICTIONS (unresolved unless stated - do not silently pick a side):\n" + st.contradictions.slice(-cap).map((c) => "  " + c.id + " [" + c.status + "] " + c.made_by_a + ": \u201c" + c.statement_a.slice(0, 160) + "\u201d vs " + c.made_by_b + ": \u201c" + c.statement_b.slice(0, 160) + "\u201d (" + c.reason + ")").join("\n") + "\n";
  const asm = rel(st.assumptions, (a) => a.statement, (a) => a.impact_if_wrong !== "unknown");
  if (asm.length && detail !== "minimal") out += "ASSUMPTIONS (kind shown - an assumption is not a fact):\n" + asm.map((a) => "  " + a.id + " [" + a.kind + "; " + a.made_by + "; " + a.status + "] " + a.statement.slice(0, 220)).join("\n") + "\n";
  const gaps = rel(st.gaps, (g) => g.question, (g) => g.priority === "high");
  if (gaps.length) out += "EVIDENCE GAPS (open):\n" + gaps.map((g) => "  " + g.id + " [" + g.priority + "; " + g.required_evidence_type + "; raised by " + g.identified_by + "] " + g.question.slice(0, 200)).join("\n") + "\n";
  if (st.positions.length && detail !== "minimal") out += "EXECUTIVE POSITIONS: " + st.positions.map((p) => p.executive + "=" + p.stance).join(", ") + "\n";
  return out.trim();
}
// Exposed for the merge step (same sentence rules as the V1 ledger).
export function sentencesOfPublic(text: string): string[] { return sentencesOf(text); }

// ── ADAPTIVE OUTPUT BUDGET ────────────────────────────────────────────────────
// The role's existing word budget is the baseline. Simple validation tasks get
// less, complex opening strategic analysis a little more. Never the provider max.
export type TaskKind = "validation" | "normal" | "complex";
export function adaptiveOutputBudget(baseTokens: number, kind: TaskKind): number {
  const f = kind === "validation" ? 0.45 : kind === "complex" ? 1.3 : 1;
  return Math.max(600, Math.round(baseTokens * f));
}
export function taskKindFor(p: { isFirstSpeaker: boolean; dimensionCount: number; isFollowUp?: boolean; followUpWords?: number }): TaskKind {
  if (p.isFollowUp && (p.followUpWords || 0) <= 14) return "validation";
  if (p.isFirstSpeaker && p.dimensionCount >= 6) return "complex";
  return "normal";
}
