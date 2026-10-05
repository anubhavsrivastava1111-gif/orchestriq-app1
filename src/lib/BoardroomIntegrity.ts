// BOARDROOM INTEGRITY - identity, completeness, presentation and export helpers.
// Pure functions only (no React, no provider calls) so every rule is testable.
//
//  - Every executive contribution carries an immutable identity (session, stage,
//    executive, call, provider, model). A contribution is only ever attached to
//    the executive whose identity it carries - never by array position or name.
//  - The canonical text (fullText) is never shortened. Previews are separate.
//  - Status is explicit: COMPLETE, CONTINUATION_COMPLETE, PARTIAL, TRUNCATED,
//    FAILED, IDENTITY_MISMATCH, DUPLICATE_CONTENT, PROVIDER_LIMIT, CONTEXT_LIMIT.
import { classifyClaim, parseResearchEvidence, type ClaimKind } from "./ContextIntelligence";
import { inputsFromRegistry, buildDecisionMap, compareScenarios } from "./DecisionCockpit";
import { linkClaims, parseQuantities, analyseContradictions, buildRegistry, updateVariable, mergeUserQuestions, decide, boardExecutionState,
  prioritiseGaps, supportSummary, tierLabel, sensitivity, modelDecision, buildSynthesisPacket, executionSummary,
  type LinkedClaim, type AnalysedContradiction, type ModelRegistry, type PendingUserQuestion, type DecisionOutput, type ProviderAttempt } from "./DecisionIntegrity";

export type ContributionStatus =
  | "COMPLETE" | "CONTINUATION_COMPLETE" | "PARTIAL" | "TRUNCATED" | "FAILED"
  | "IDENTITY_MISMATCH" | "DUPLICATE_CONTENT" | "PROVIDER_LIMIT" | "CONTEXT_LIMIT" | "LEGACY";

export interface ContributionIdentity {
  sessionId: string | number; stageId: string; executiveId: string; executiveKey: string;
  callId: string; provider: string; model: string;
}

export function makeCallId(sessionId: string | number, stageId: string, executiveId: string, attempt = 0): string {
  return String(sessionId) + ":" + stageId + ":" + executiveId + ":" + attempt + ":" + Math.random().toString(36).slice(2, 8);
}

// Attach an asynchronously-completed response to the contribution slot whose
// callId it carries. Arrival order is irrelevant.
export function attachResponse(slots: Record<string, any>, response: { callId: string; executiveId: string; stageId: string; text: string }): { ok: boolean; reason?: string } {
  const slot = slots[response.callId];
  if (!slot) return { ok: false, reason: "no pending call with id " + response.callId };
  if (slot.executiveId !== response.executiveId) return { ok: false, reason: "callId belongs to " + slot.executiveId + ", response claims " + response.executiveId };
  if (slot.stageId !== response.stageId) return { ok: false, reason: "stage mismatch" };
  slot.fullText = response.text; slot.done = true;
  return { ok: true };
}

// Validate a stored contribution before it is displayed or synthesised.
export function validateContribution(entry: any, expected: { executiveId: string; stageId: string }): { valid: boolean; reason: string } {
  if (!entry) return { valid: false, reason: "missing contribution" };
  const id = entry.identity || {};
  if (!id.callId) return { valid: false, reason: "no callId (legacy or unattributed contribution)" };
  if (id.executiveId !== expected.executiveId) return { valid: false, reason: "executiveId " + id.executiveId + " does not match expected " + expected.executiveId };
  if (entry.ag && entry.ag.id && entry.ag.id !== id.executiveId) return { valid: false, reason: "card executive " + entry.ag.id + " does not match identity " + id.executiveId };
  if (id.stageId !== expected.stageId) return { valid: false, reason: "stageId " + id.stageId + " does not match " + expected.stageId };
  return { valid: true, reason: "" };
}

// ── CONTINUATION: append only the new part ─────────────────────────────────
// Removes any overlap where the continuation repeats the end of the previous
// text (or restarts from an earlier sentence) before appending.
export function appendContinuation(prev: string, cont: string): { text: string; repeatedChars: number } {
  const p = String(prev || ""), c = String(cont || "");
  if (!c.trim()) return { text: p, repeatedChars: 0 };
  const maxK = Math.min(600, p.length, c.length);
  for (let k = maxK; k >= 20; k--) {
    if (p.endsWith(c.slice(0, k))) return { text: p + c.slice(k), repeatedChars: k };
  }
  // Continuation restarted with a sentence already present near the end.
  const head = c.slice(0, 160).trim();
  if (head.length >= 40) {
    const at = p.lastIndexOf(head.slice(0, 80));
    if (at >= 0 && at > p.length - 3000) {
      const already = p.slice(at);
      if (c.startsWith(already.slice(0, Math.min(already.length, c.length)))) return { text: p + c.slice(Math.min(already.length, c.length)), repeatedChars: Math.min(already.length, c.length) };
    }
  }
  const sep = /\s$/.test(p) || /^\s/.test(c) ? "" : " ";
  return { text: p + sep + c, repeatedChars: 0 };
}

// ── DUPLICATE CONTENT GUARD ─────────────────────────────────────────────────
// Word 5-gram Jaccard similarity. Two different executives' answers that are
// near-identical indicate an echo, not two independent analyses.
function shingles(t: string, n = 5): Set<string> {
  const w = String(t || "").toLowerCase().replace(/[^a-z0-9\u20b9% ]+/g, " ").split(/\s+/).filter(Boolean);
  const s = new Set<string>(); for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(" ")); return s;
}
export function contentSimilarity(a: string, b: string): number {
  const A = shingles(a), B = shingles(b); if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
export const DUPLICATE_THRESHOLD = 0.55;
export function findDuplicate(text: string, priors: { executiveId: string; executiveKey: string; text: string }[]): { executiveKey: string; similarity: number } | null {
  let best: { executiveKey: string; similarity: number } | null = null;
  for (const p of priors) { const s = contentSimilarity(text, p.text); if (s >= DUPLICATE_THRESHOLD && (!best || s > best.similarity)) best = { executiveKey: p.executiveKey, similarity: s }; }
  return best;
}

// ── STATUS ──────────────────────────────────────────────────────────────────
export function deriveStatus(p: { text: string; failed?: boolean; noProvider?: boolean; contextLimit?: boolean; truncated: boolean; continuationAttempts: number; duplicateOf?: string | null; identityValid?: boolean }): ContributionStatus {
  if (p.identityValid === false) return "IDENTITY_MISMATCH";
  if (p.noProvider) return "PROVIDER_LIMIT";
  if (p.contextLimit) return "CONTEXT_LIMIT";
  if (p.failed || !String(p.text || "").trim()) return "FAILED";
  if (p.duplicateOf) return "DUPLICATE_CONTENT";
  if (p.truncated) return p.continuationAttempts > 0 ? "PARTIAL" : "TRUNCATED";
  return p.continuationAttempts > 0 ? "CONTINUATION_COMPLETE" : "COMPLETE";
}
export const isComplete = (s: ContributionStatus) => s === "COMPLETE" || s === "CONTINUATION_COMPLETE";
export const isExcludedFromSynthesis = (s: ContributionStatus) => s === "IDENTITY_MISMATCH" || s === "DUPLICATE_CONTENT" || s === "FAILED" || s === "PROVIDER_LIMIT" || s === "CONTEXT_LIMIT";

// ── CLAIM-LEVEL EVIDENCE SUMMARY ────────────────────────────────────────────
// Counts each material claim (a tagged line or a line with a figure) by kind,
// instead of labelling a whole answer "Verified" because one fact had a URL.
export function claimSummary(text: string): { total: number; FACT: number; INFERENCE: number; ASSUMPTION: number; ESTIMATE: number; UNVERIFIED: number } {
  const out = { total: 0, FACT: 0, INFERENCE: 0, ASSUMPTION: 0, ESTIMATE: 0, UNVERIFIED: 0 };
  for (const raw of String(text || "").split("\n")) {
    const l = raw.replace(/^\s*(?:[-*\u2022>]|\d+[.)])\s*/, "").trim();
    if (l.length < 12 || /^\|?[-:| ]+\|?$/.test(l)) continue;
    const tagged = /\[(verified fact|assumption|expert inference|estimate|recalled)/i.test(l);
    const figure = /(\u20b9|\$|rs\.?\s?\d|\d+(\.\d+)?\s?(%|crore|cr\b|lakh|million|billion|bn\b))/i.test(l);
    if (!tagged && !figure) continue;
    const k: ClaimKind = classifyClaim(l); out[k]++; out.total++;
  }
  return out;
}

// ── EXECUTIVE POSITION AND QUESTIONS (display only) ─────────────────────────
function sectionText(text: string, heading: RegExp): string {
  const lines = String(text || "").split("\n"); const out: string[] = []; let on = false;
  for (const l of lines) {
    if (/^\s*#{1,4}\s|^\s*\*\*[^*]+\*\*\s*:?\s*$|^\s*\d+[.)]\s*\*\*/.test(l)) { if (on) break; if (heading.test(l)) { on = true; continue; } }
    else if (on) out.push(l);
  }
  return out.join("\n").trim();
}
// A 2-4 sentence position. Prefers the executive's POSITION/RECOMMENDATION
// section; never uses a question as the headline.
export function executivePosition(text: string): string {
  const sec = sectionText(text, /position|recommendation|verdict|bottom line|summary/i);
  const src = (sec || String(text || "")).replace(/\*\*/g, "").replace(/^#+\s.*$/gm, "");
  const sentences = src.split(/(?<=[.!])\s+/).map((s) => s.replace(/^\s*(?:[-*\u2022>]|\d+[.)])\s*/, "").trim())
    .filter((s) => s.length > 30 && !/\?\s*$/.test(s) && !s.startsWith("|"));
  return sentences.slice(0, 3).join(" ");
}
export function userQuestions(text: string): string[] {
  const sec = sectionText(text, /what i need|from (the )?user|questions? for (the )?(user|founder|you)|decisions? required/i);
  const pool = (sec || String(text || "")).split("\n").map((l) => l.replace(/^\s*(?:[-*\u2022>]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim());
  return Array.from(new Set(pool.filter((l) => /\?\s*$/.test(l) && l.length > 15))).slice(0, 5);
}

// ── COMPLETENESS REPORT (before synthesis) ──────────────────────────────────
export interface CompletenessRow { executive: string; executiveId: string; status: ContributionStatus; complete: boolean; identityValid: boolean; evidence: string; included: "included" | "partially included" | "excluded"; note: string; }
export function completenessReport(entries: any[], expected: { executiveId: string; executiveKey: string }[], stageId: string): CompletenessRow[] {
  return expected.map((ex) => {
    // Find the contribution in THIS executive's slot (the card it is shown under);
    // validation then catches a slot holding another executive's identity.
    const e = entries.find((x) => x?.ag?.id === ex.executiveId) || entries.find((x) => x?.identity?.executiveId === ex.executiveId && !x?.ag);
    if (!e) return { executive: ex.executiveKey, executiveId: ex.executiveId, status: "FAILED", complete: false, identityValid: false, evidence: "-", included: "excluded", note: "no contribution recorded" };
    // LEGACY: saved before contributions carried an identity. Shown and included,
    // but labelled unattributed and never counted as complete/verified.
    if (!e.identity) return { executive: ex.executiveKey, executiveId: ex.executiveId, status: "LEGACY", complete: false, identityValid: true, evidence: "-", included: "partially included", note: "legacy contribution - saved before attribution existed" };
    const v = validateContribution(e, { executiveId: ex.executiveId, stageId });
    const status: ContributionStatus = !v.valid ? "IDENTITY_MISMATCH" : (e.status || (e.truncated ? "TRUNCATED" : "COMPLETE"));
    const cs = claimSummary(e.fullText || e.text || "");
    return { executive: ex.executiveKey, executiveId: ex.executiveId, status, complete: isComplete(status), identityValid: v.valid,
      evidence: cs.total ? cs.FACT + " verified / " + cs.total + " claims" : "no material claims",
      included: isExcludedFromSynthesis(status) ? "excluded" : isComplete(status) ? "included" : "partially included",
      note: !v.valid ? v.reason : status === "DUPLICATE_CONTENT" ? (e.duplicateOf ? "near-duplicate of " + e.duplicateOf : "near-duplicate") : status === "PARTIAL" || status === "TRUNCATED" ? "response incomplete - text received is preserved" : "" };
  });
}
export function renderCompletenessReport(rows: CompletenessRow[]): string {
  return "EXECUTIVE COMPLETENESS REPORT (deterministic):\n| Executive | Status | Complete? | Identity valid? | Evidence | In synthesis? |\n|---|---|---|---|---|---|\n"
    + rows.map((r) => `| ${r.executive} | ${r.status} | ${r.complete ? "yes" : "no"} | ${r.identityValid ? "yes" : "no"} | ${r.evidence} | ${r.included}${r.note ? " - " + r.note : ""} |`).join("\n");
}

// ── STRUCTURED BOARD DECISION STATE ─────────────────────────────────────────
export type BoardDecisionState = "READY FOR DECISION" | "NEEDS USER INPUT" | "NEEDS EVIDENCE" | "CONFLICTING EXECUTIVE VIEWS" | "PARTIAL EXECUTIVE INPUT" | "REQUIRES FOLLOW-UP RESEARCH";
export function boardDecisionState(p: { rows: CompletenessRow[]; userQuestions: string[]; contradictions: { status: string; reason: string; made_by_a: string; made_by_b: string }[]; gaps: { priority: string; question: string; current_status: string }[] }): { state: BoardDecisionState; why: string[]; required: string[] } {
  const why: string[] = [];
  const bad = p.rows.filter((r) => !r.complete);
  const openX = p.contradictions.filter((c) => c.status === "unresolved");
  const hiGaps = p.gaps.filter((g) => g.priority === "high" && g.current_status !== "closed");
  if (bad.length) why.push(...bad.map((r) => r.executive + ": " + r.status + (r.note ? " (" + r.note + ")" : "")));
  if (openX.length) why.push(...openX.slice(0, 3).map((c) => c.made_by_a + " vs " + c.made_by_b + ": " + c.reason));
  if (p.userQuestions.length) why.push(...p.userQuestions.slice(0, 3).map((q) => "Unresolved for you: " + q));
  if (hiGaps.length) why.push(...hiGaps.slice(0, 3).map((g) => "Missing evidence: " + g.question));
  const state: BoardDecisionState = bad.length ? "PARTIAL EXECUTIVE INPUT" : openX.length ? "CONFLICTING EXECUTIVE VIEWS"
    : p.userQuestions.length ? "NEEDS USER INPUT" : hiGaps.some((g) => g.current_status === "targeted_research_candidate") ? "REQUIRES FOLLOW-UP RESEARCH"
    : hiGaps.length ? "NEEDS EVIDENCE" : "READY FOR DECISION";
  return { state, why, required: p.userQuestions.slice(0, 5) };
}

// ── KPI BASIS ───────────────────────────────────────────────────────────────
// For a figure shown as a KPI, return the sentence it came from and that
// sentence's classification - so an estimate never looks like a verified fact.
export function kpiBasis(fullText: string, figure: string): { basis: string; kind: ClaimKind | "unknown" } {
  const f = String(figure || "").trim(); if (!f) return { basis: "", kind: "unknown" };
  for (const raw of String(fullText || "").split("\n")) {
    if (raw.includes(f)) { const l = raw.replace(/^\s*(?:[-*\u2022>]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim(); return { basis: l.length > 260 ? l.slice(0, 257) + "\u2026" : l, kind: classifyClaim(l) }; }
  }
  return { basis: "", kind: "unknown" };
}

// ── FULL THREAD (verbatim) ─────────────────────────────────────────────────
// Built from the canonical full texts - never from previews or card headlines.
export function buildFullThreadMarkdown(cur: any): string {
  const q = cur?.q || ""; const rs = cur?.researchState || {}; const intel = rs.intelligence || null;
  const out: string[] = ["# Boardroom Decision Thread", "", "**Strategic question:** " + q, ""];
  if (cur?.researchBrief) out.push("## Research Brief (" + (cur.grounded ? "grounded in sources" : "UNGROUNDED - no verifiable sources") + ")", "", String(cur.researchBrief), "");
  (cur?.stages || []).forEach((st: any, i: number) => {
    out.push("---", "", "## Stage " + (i + 1) + ": " + (st.question || ""), "");
    const expected = (st.debate || []).map((d: any) => ({ executiveId: d?.ag?.id || d?.identity?.executiveId, executiveKey: d?.ag?.t || d?.identity?.executiveKey }));
    out.push(renderCompletenessReport(completenessReport(st.debate || [], expected, "stage-" + (i + 1))), "");
    for (const d of st.debate || []) {
      const cs = claimSummary(d.fullText || d.text || "");
      out.push("### " + (d?.ag?.t || d?.identity?.executiveKey || "Executive") + " \u2014 " + (d.status || (d.truncated ? "TRUNCATED" : "COMPLETE")),
        "_Provider: " + (d?.identity?.provider || "unknown") + (d?.identity?.model ? " (" + d.identity.model + ")" : "") + " \u00b7 Claims: " + cs.total + " (" + cs.FACT + " verified, " + cs.INFERENCE + " inference, " + cs.ASSUMPTION + " assumptions, " + cs.ESTIMATE + " estimates, " + cs.UNVERIFIED + " unverified)_", "",
        String(d.fullText || d.text || ""), "");
    }
    if (st.synthesis) out.push("### Chairman Synthesis", "", String(st.synthesis), "");
    try {
      const an = analyseStage(cur, i); out.push(renderDecisionMarkdown(an));
      // Decision Map + scenarios (labelled SIMULATION RESULT - never facts).
      const scen = (cur?.researchState?.scenarios || []) as any[];
      const map = buildDecisionMap({ analysis: an, inputs: inputsFromRegistry(an.registry), intel: cur?.researchState?.intelligence || {}, scenarios: scen });
      out.push("### Decision Map", "", "**Decision:** " + map.decision + " \u2014 " + map.oneSentence, "",
        "**Next 3 actions:**", ...map.nextActions.map((a, k) => (k + 1) + ". " + a), "",
        "| Gate | Status | Threshold | Current | Owner |", "|---|---|---|---|---|", ...map.gates.map((g) => "| " + g.name.replace(/\|/g, "/") + " | " + g.status + " | " + g.threshold + " | " + g.current + " | " + g.owner + " |"), "",
        "**What would change the decision:**", ...map.wouldChange.map((w) => "- " + w), "");
      if (scen.length) {
        const cmp = compareScenarios(scen.slice(-4));
        out.push("### Scenarios tested (SIMULATION RESULTS \u2014 not forecasts or facts)", "", "| Metric | " + scen.slice(-4).map((x) => x.name).join(" | ") + " |", "|---|" + scen.slice(-4).map(() => "---|").join(""),
          ...cmp.map((r) => "| " + r.metric + " | " + r.values.join(" | ") + " |"), "");
      }
    } catch { /* analysis must never block an export */ }
  });
  if (intel) {
    const list = (title: string, arr: any[], fmt: (x: any) => string) => { if (arr && arr.length) out.push("## " + title, "", ...arr.map((x) => "- " + fmt(x)), ""); };
    list("Opportunities (discovered - not recommendations)", intel.opportunities, (o) => o.id + " [" + o.status + "; by " + o.discovered_by + (o.evidence_refs?.length ? "; " + o.evidence_refs.join(",") : "") + "] " + o.description);
    list("Contradictions", intel.contradictions, (c) => c.id + " [" + c.status + "] " + c.made_by_a + ": \u201c" + c.statement_a + "\u201d vs " + c.made_by_b + ": \u201c" + c.statement_b + "\u201d (" + c.reason + ")");
    list("Assumptions", intel.assumptions, (a) => a.id + " [" + a.kind + "; " + a.made_by + "; " + a.status + "] " + a.statement);
    list("Evidence gaps", intel.gaps, (g) => g.id + " [" + g.priority + "; " + g.required_evidence_type + "; " + g.current_status + "] " + g.question);
    list("Unresolved questions", intel.unresolved, (u) => u.id + " " + u.text + " (" + u.by + ")");
    list("User decisions / constraints", intel.userDecisions, (u) => u.id + " [" + u.type + "] " + u.text);
  }
  return out.join("\n");
}

// ── EMAIL BRIEF ─────────────────────────────────────────────────────────────
// Structured summary first, then the COMPLETE thread. Never character-capped;
// intended for the clipboard (mailto: URLs are length-limited, so they are not used).
export function buildEmailBrief(cur: any, decision?: { state: string; why: string[]; required: string[] }): { subject: string; body: string } {
  const last = (cur?.stages || []).slice(-1)[0] || {};
  const subject = "Boardroom Decision Brief \u2014 " + String(cur?.q || "").replace(/\s+/g, " ").slice(0, 110);
  const parts: string[] = [subject, ""];
  if (last.synthesis) parts.push("EXECUTIVE SUMMARY", executivePosition(last.synthesis) || "(see synthesis below)", "");
  if (decision) {
    parts.push("BOARD STATUS: " + decision.state);
    if (decision.why.length) parts.push(...decision.why.map((w) => "- " + w));
    parts.push("");
    if (decision.required.length) parts.push("KEY DECISIONS REQUIRED FROM YOU", ...decision.required.map((r, i) => (i + 1) + ". " + r), "");
  }
  parts.push("FULL BOARD ANALYSIS (complete, unabridged)", "", buildFullThreadMarkdown(cur));
  return { subject, body: parts.join("\n") };
}

// ── STAGE ANALYSIS - the ONE deterministic trust-layer computation ──────────
// Used by the UI, exports, email and the Chairman's synthesis packet, so they
// can never disagree. Pure: same stored data in, same result out.
export interface StageAnalysis {
  rows: CompletenessRow[]; claims: LinkedClaim[]; contradictions: AnalysedContradiction[]; registry: ModelRegistry;
  userQuestions: PendingUserQuestion[]; decision: DecisionOutput; execution: { state: string; message: string };
  priorityGaps: { id: string; question: string; researchQuestion: string }[]; support: ReturnType<typeof supportSummary>;
}
export function analyseStage(cur: any, si: number, opts: { location?: string; overrideContradictions?: boolean } = {}): StageAnalysis {
  const st = (cur?.stages || [])[si] || { debate: [] };
  const stageId = "stage-" + (si + 1);
  const debate: any[] = st.debate || [];
  const ev = parseResearchEvidence(String(cur?.researchBrief || ""));
  const rs = cur?.researchState || {}; const intel = rs.intelligence || {};
  const expected = debate.map((d: any) => ({ executiveId: d?.ag?.id || d?.identity?.executiveId, executiveKey: d?.ag?.t || d?.identity?.executiveKey }));
  const rows = completenessReport(debate, expected, stageId);
  // Only contributions that pass identity validation (or are legacy) feed the analysis.
  const usable = debate.filter((d: any) => { const r = rows.find((x) => x.executiveId === (d?.ag?.id || d?.identity?.executiveId)); return r && r.included !== "excluded"; });
  const claims = usable.flatMap((d: any) => linkClaims(d?.ag?.t || "Executive", d.fullText || d.text || "", ev));
  const qs = usable.flatMap((d: any) => parseQuantities(d.fullText || d.text || "", d?.ag?.t || "Executive"));
  const contradictions = analyseContradictions(qs, claims);
  // Explicit disagreements recorded by the Decision Ledger V2 (e.g. "I disagree with the
  // CEO on ...") are often non-numeric; they must still reach the decision. Merged as
  // typed contradictions, skipping any pair the numeric analysis already covers.
  for (const x of ((intel.contradictions || []) as any[])) {
    if (!x || x.status === "resolved") continue;
    if (!usable.some((d: any) => d?.ag?.t === x.made_by_a) || !usable.some((d: any) => d?.ag?.t === x.made_by_b)) continue;
    const dup = contradictions.some((c) => [c.executiveA, c.executiveB].sort().join() === [x.made_by_a, x.made_by_b].sort().join()
      && (String(x.reason || "").toLowerCase().includes(c.variable.toLowerCase()) || String(x.reason || "").toLowerCase().includes(c.variable.replace(/([A-Z])/g, " $1").toLowerCase().trim())));
    if (dup) continue;
    const critical = /\b(margin|price|rate|revenue|cost|capital|capex|break-?even|utili[sz]ation|cash|payment|cac|market size|tam)\b/i.test(String(x.reason || "") + " " + x.statement_a + " " + x.statement_b);
    contradictions.push({ id: x.id || ("CX-V2-" + contradictions.length), variable: (String(x.reason || "").match(/different figures for (.+)$/i) || [])[1] || "position", claimA: x.statement_a, claimB: x.statement_b,
      executiveA: x.made_by_a, executiveB: x.made_by_b, evidenceA: x.evidence_a || [], evidenceB: x.evidence_b || [],
      severity: critical ? "HIGH" : "MEDIUM", type: /different figures/i.test(String(x.reason || "")) ? "NUMERIC" : "STRATEGIC",
      status: x.status === "conditionally_resolved" ? "conditionally_resolved" : critical ? "requires_chairman" : "unresolved",
      resolutionMethod: "recorded by the Decision Ledger: " + (x.reason || "explicit disagreement"), resolutionEvidence: "", finalValue: null, confidence: "low" });
  }
  const registry = buildRegistry(qs, claims, contradictions);
  // Values the USER set previously win over executive estimates (and are audited).
  for (const [k, e] of Object.entries((rs.modelRegistry || {}) as ModelRegistry)) {
    const userSet = (e.history || []).filter((h) => h.by === "user").slice(-1)[0];
    if (userSet && registry[k] && userSet.new !== null) updateVariable(registry, k, userSet.new, "user", userSet.reason || "set by user");
  }
  const uqList = mergeUserQuestions(rs.pendingUserQuestions || [], usable.flatMap((d: any) => userQuestions(d.fullText || d.text || "").map((q) => ({ q, by: d?.ag?.t || "Executive" }))));
  const positions = (intel.positions && intel.positions.length ? intel.positions : usable.map((d: any) => {
    const r = executivePosition(d.fullText || d.text || "");
    return { executive: d?.ag?.t, stance: /\b(do not|don't|avoid|no[- ]go)\b/i.test(r) ? (/\b(pilot|if|unless|only)\b/i.test(r) ? "conditional" : "no_go") : /\b(proceed|pursue)\b/i.test(r) ? "go" : "conditional" };
  })).filter((x: any) => usable.some((d: any) => d?.ag?.t === x.executive));
  const decision = decide({ rows, positions, claims, contradictions, gaps: intel.gaps || [], userQuestions: uqList, registry, overrideContradictions: opts.overrideContradictions });
  const execution = boardExecutionState(debate.filter((d: any) => Array.isArray(d.attempts) && d.attempts.length).map((d: any) => ({ executive: d?.ag?.t, attempts: d.attempts as ProviderAttempt[] })));
  const priorityGaps = prioritiseGaps(intel.gaps || [], registry, contradictions, opts.location || "");
  return { rows, claims, contradictions, registry, userQuestions: uqList, decision, execution, priorityGaps, support: supportSummary(claims) };
}
export function synthesisPacketFor(cur: any, si: number, opts: { location?: string } = {}): string {
  const a = analyseStage(cur, si, opts); const st = (cur?.stages || [])[si] || {}; const intel = cur?.researchState?.intelligence || {};
  return buildSynthesisPacket({ question: st.question || cur?.q || "", researchSummary: String(cur?.researchBrief || "").split("\n").slice(0, 40).join("\n"),
    positions: (st.debate || []).map((d: any) => { const r = a.rows.find((x) => x.executiveId === d?.ag?.id); return { executive: d?.ag?.t, stance: (intel.positions || []).find((p: any) => p.executive === d?.ag?.t)?.stance || "-", recommendation: executivePosition(d.fullText || d.text || ""), status: r ? r.status : "-" }; }),
    claims: a.claims, contradictions: a.contradictions, gaps: intel.gaps || [], assumptions: a.claims.filter((c) => c.support === "ASSUMED" || c.support === "ESTIMATED").map((c) => c.executive + ": " + c.text),
    userQuestions: a.userQuestions, providerStatus: a.execution.message, constraints: (intel.userDecisions || []).map((u: any) => u.id + " " + u.text), registry: a.registry });
}
export function renderDecisionMarkdown(a: StageAnalysis): string {
  const d = a.decision; const L: string[] = ["### Board Decision", "", "**Decision:** " + d.decision + "  ", "**State:** " + d.state + "  ", "**Confidence:** " + d.confidence + " \u2014 " + d.confidenceReason, ""];
  const sec = (t: string, xs: string[]) => { if (xs.length) L.push("**" + t + "**", ...xs.map((x) => "- " + x), ""); };
  sec("Why", d.why); sec("Supporting evidence", d.supportingEvidence); sec("Missing evidence", d.missingEvidence); sec("Contradictions remaining", d.contradictionsRemaining);
  sec("Key assumptions", d.keyAssumptions); sec("What could change the decision", d.invalidators); sec("Decisions required from you", d.requiredUserDecisions);
  if (a.execution.message) L.push("_Execution: " + a.execution.message + "_", "");
  const reg = Object.values(a.registry);
  if (reg.length) L.push("### Canonical model", "", "| ID | Variable | Value | Range | Basis | Status |", "|---|---|---|---|---|---|",
    ...reg.map((e) => "| " + e.id + " | " + e.label + " | " + (e.value === null ? "unknown" : Math.round(e.value * 100) / 100) + " " + e.unit + " | " + (e.range ? Math.round(e.range.low) + "\u2013" + Math.round(e.range.high) : "-") + " | " + e.classification + " | " + e.status + " |"), "");
  if (a.contradictions.length) L.push("### Contradiction analysis", "", ...a.contradictions.map((c) => "- " + c.id + " **" + c.variable + "** [" + c.type + "; " + c.severity + "; " + c.status + "] " + c.executiveA + " vs " + c.executiveB + " \u2014 " + c.resolutionMethod + (c.resolutionEvidence ? " (" + c.resolutionEvidence + ")" : "")), "");
  if (a.claims.length) L.push("### Claim support (evidence-linked, not model-labelled)", "", "| Executive | Claim | Support | Evidence | Source tier |", "|---|---|---|---|---|",
    ...a.claims.map((c) => "| " + c.executive + " | " + c.text.replace(/\|/g, "/").slice(0, 160) + " | " + c.support + (c.modelAsserted ? " (model-asserted)" : "") + " | " + (c.evidenceRefs.join(",") || "-") + " | " + tierLabel(c.sourceTier) + " |"), "");
  return L.join("\n");
}
