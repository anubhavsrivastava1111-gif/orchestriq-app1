// ─── Decision History Helpers ─────────────────────────────────────────────────
// Pure functions for Decision History — no React, no side effects.
// These were previously defined inside App.tsx; extracted for testability
// and reuse by the Intelligence Engine and Boardroom module.
//
// All three functions read from / write to WorkspaceMemory internally.

import { WorkspaceMemory } from "../lib/WorkspaceMemory";

interface DecisionRecord {
  id: number;
  ts: string;
  question: string;
  executives: string[];
  status: string;
  recommendation: string;
}

// ── SAVE ───────────────────────────────────────────────────────────────────────
export function saveDecisionRecord(rec: Omit<DecisionRecord, never>): void {
  try {
    const hist = WorkspaceMemory.get<DecisionRecord[]>("cos-decision-history") || [];
    hist.unshift(rec as DecisionRecord);
    WorkspaceMemory.set("cos-decision-history", hist.slice(0, 25));
  } catch { /* storage full — silent */ }
}

// ── SNIPPET ────────────────────────────────────────────────────────────────────
export function extractRecommendationSnippet(syn: string): string {
  try {
    const m = (syn || "").match(/##\s*Quantified Recommendation\s*
([\s\S]*?)(
##|$)/i);
    const raw = (m ? m[1] : (syn || ""))
      .replace(/[#*|>\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return raw.slice(0, 300);
  } catch { return ""; }
}

// ── CONTEXT INJECTION ──────────────────────────────────────────────────────────
// Retrieves the 2 most-similar past decisions and formats them for injection
// into the Boardroom synthesis prompt.
export function buildDecisionHistoryContext(question: string): string {
  try {
    const hist = WorkspaceMemory.get<DecisionRecord[]>("cos-decision-history") || [];
    if (!hist.length) return "";
    const words = ((question || "").toLowerCase().match(/[a-z]{4,}/g) || []);
    if (!words.length) return "";
    const scored = hist.map(h => {
      const txt = (String(h.question || "") + " " + String(h.recommendation || "")).toLowerCase();
      return { h, score: words.filter(w => txt.includes(w)).length };
    }).filter(x => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    if (!scored.length) return "";
    return "\n\nPAST BOARD DECISIONS ON SIMILAR TOPICS:\n" +
      scored.map(x =>
        "- [" + String(x.h.ts || "").slice(0, 10) + "] Q: \"" +
        String(x.h.question || "").slice(0, 120) +
        "\" \u2192 Status: " + String(x.h.status || "n/a") +
        ". Decision: " + String(x.h.recommendation || "").slice(0, 200)
      ).join("\n") + "\n";
  } catch { return ""; }
}
