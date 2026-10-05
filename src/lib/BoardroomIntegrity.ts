// BOARDROOM INTEGRITY - identity, completeness, presentation and export helpers.
// Pure functions only (no React, no provider calls) so every rule is testable.
//
//  - Every executive contribution carries an immutable identity (session, stage,
//    executive, call, provider, model). A contribution is only ever attached to
//    the executive whose identity it carries - never by array position or name.
//  - The canonical text (fullText) is never shortened. Previews are separate.
//  - Status is explicit: COMPLETE, CONTINUATION_COMPLETE, PARTIAL, TRUNCATED,
//    FAILED, IDENTITY_MISMATCH, DUPLICATE_CONTENT, PROVIDER_LIMIT, CONTEXT_LIMIT.
import { classifyClaim, type ClaimKind } from "./ContextIntelligence";

export type ContributionStatus =
  | "COMPLETE" | "CONTINUATION_COMPLETE" | "PARTIAL" | "TRUNCATED" | "FAILED"
  | "IDENTITY_MISMATCH" | "DUPLICATE_CONTENT" | "PROVIDER_LIMIT" | "CONTEXT_LIMIT";

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
