// ═══════════════════════════════════════════════════════════════════════════
// LEARNING ENGINE — Teachable Macros for Agentic AI
// ─────────────────────────────────────────────────────────────────────────────
// Records the corrections/clarifications a user provides during an Agentic
// workflow run, promotes them into a reusable "playbook" after enough repeat
// evidence, then optionally applies them autonomously on future runs.
//
// PRINCIPLES
//   1. Zero AI calls — deterministic pattern matching. No token cost, no drift.
//   2. Zero UI — this file provides pure functions only. Wire into any component.
//   3. Fully pausable — one localStorage flag disables everything instantly.
//   4. Fully backward-compatible — never throws upward, degrades to no-op silently.
//   5. Never applies a playbook the user hasn't explicitly promoted.
//
// LIFECYCLE
//   observe   → agent asks all questions, records answers  (first ≥1 run)
//   assist    → agent pre-fills suggestions, user confirms (after ≥3 runs)
//   autonomous→ agent applies playbook directly            (user promotes)
//
// USAGE (2 hooks in AgenticWorkflows.tsx)
//   const eng = new LearningEngine(workflowId);
//   const hint = eng.suggest(inputId, currentContext);   // shows a suggestion
//   eng.record(inputId, userAnswer, currentContext);     // captures the answer
//
// GOVERNANCE
//   eng.status()       → { stage, runs, confidence, lastUsed, playbookSize }
//   eng.promote()      → observe → assist → autonomous (user-initiated)
//   eng.demote()       → autonomous → assist → observe (user-initiated)
//   eng.reset()        → wipes the workflow's playbook, back to observe
//   eng.export()       → JSON dump for review/backup
//   eng.pauseAll()     → global kill switch across all workflows
// ═══════════════════════════════════════════════════════════════════════════

import { WorkspaceMemory } from "./WorkspaceMemory";

const KEY_PREFIX = "oiq-learn:";
const INDEX_KEY = "oiq-learn-index";   // registry of all learned workflow IDs
const KILL_SWITCH_KEY = "oiq-learning-enabled";
const PROMOTE_TO_ASSIST_AFTER = 3;   // runs
const PROMOTE_TO_AUTO_MIN_RUNS = 5;  // + user must explicitly promote
const MAX_ANSWERS_PER_INPUT = 10;    // memory cap per input field
const SIMILARITY_THRESHOLD = 0.55;   // context match threshold for autonomous

export type LearningStage = "observe" | "assist" | "autonomous" | "paused";

export interface AnswerRecord {
  value: string;
  ts: string;
  ctxSignature: string;    // hash of context at time of answer
  confirmed: boolean;      // true if user explicitly kept a suggested value
}

export interface InputPlaybook {
  inputId: string;
  answers: AnswerRecord[];
  lastValue?: string;
  dominantValue?: string;  // majority-vote across recent answers
}

export interface WorkflowPlaybook {
  workflowId: string;
  stage: LearningStage;
  runs: number;
  createdAt: string;
  lastUsedAt?: string;
  inputs: Record<string, InputPlaybook>;
}

export interface Suggestion {
  value: string;
  confidence: number;        // 0..1
  source: "dominant" | "last" | "similar_context" | "none";
  supportingRuns: number;
  autoApplied: boolean;      // true only if stage === autonomous and confidence high
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────
function isEnabled(): boolean {
  try {
    const v = localStorage.getItem(KILL_SWITCH_KEY);
    return v === null ? true : v === "true";
  } catch { return false; }
}

// Cheap deterministic signature — no crypto, no AI. Enough for grouping
// "same context" repeat runs of the same workflow.
function ctxSignature(ctx: Record<string, unknown> | undefined): string {
  if (!ctx) return "";
  try {
    const keys = Object.keys(ctx).filter(k => k !== "ts" && k !== "sessionId" && k !== "runId").sort();
    return keys.map(k => {
      const v = ctx[k];
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return k + ":" + (s || "").slice(0, 40);
    }).join("|").slice(0, 200);
  } catch { return ""; }
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const at = new Set(a.toLowerCase().split(/[|:\s]+/).filter(Boolean));
  const bt = new Set(b.toLowerCase().split(/[|:\s]+/).filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let hits = 0;
  at.forEach(t => { if (bt.has(t)) hits++; });
  return hits / Math.max(at.size, bt.size);
}

function computeDominant(answers: AnswerRecord[]): string | undefined {
  if (!answers.length) return undefined;
  const counts: Record<string, number> = {};
  answers.slice(-MAX_ANSWERS_PER_INPUT).forEach(a => {
    const v = String(a.value || "").trim();
    if (!v) return;
    counts[v] = (counts[v] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0];
}

// ─── ENGINE ──────────────────────────────────────────────────────────────────
export class LearningEngine {
  private workflowId: string;
  private storageKey: string;
  private book: WorkflowPlaybook;

  constructor(workflowId: string) {
    this.workflowId = workflowId;
    this.storageKey = KEY_PREFIX + workflowId;
    this.book = this.load();
  }

  private load(): WorkflowPlaybook {
    try {
      const raw = WorkspaceMemory.get<WorkflowPlaybook>(this.storageKey);
      if (raw?.workflowId === this.workflowId) return raw;
    } catch { /* empty */ }
    return {
      workflowId: this.workflowId,
      stage: "observe",
      runs: 0,
      createdAt: new Date().toISOString(),
      inputs: {},
    };
  }

  private save(): void {
    try {
      WorkspaceMemory.set(this.storageKey, this.book);
      // Maintain lightweight index for listAllPlaybooks / global governance UI
      const idx = WorkspaceMemory.get<string[]>(INDEX_KEY) || [];
      if (!idx.includes(this.workflowId)) {
        idx.push(this.workflowId);
        WorkspaceMemory.set(INDEX_KEY, idx);
      }
    } catch { /* silent */ }
  }

  // ── PUBLIC: STATUS ─────────────────────────────────────────────────────────
  status() {
    const inputCount = Object.keys(this.book.inputs).length;
    const totalAnswers = Object.values(this.book.inputs).reduce((s, i) => s + i.answers.length, 0);
    const confidence = this.book.runs === 0 ? 0 : Math.min(1, totalAnswers / (this.book.runs * Math.max(1, inputCount)));
    return {
      stage: isEnabled() ? this.book.stage : "paused" as LearningStage,
      runs: this.book.runs,
      confidence,
      lastUsed: this.book.lastUsedAt,
      playbookSize: inputCount,
      totalAnswers,
      canPromoteToAssist: this.book.stage === "observe" && this.book.runs >= PROMOTE_TO_ASSIST_AFTER,
      canPromoteToAuto: this.book.stage === "assist" && this.book.runs >= PROMOTE_TO_AUTO_MIN_RUNS,
    };
  }

  // ── PUBLIC: SUGGEST ────────────────────────────────────────────────────────
  // Called by the UI when rendering an input field. Returns a suggestion for the
  // user to accept/edit/reject. If stage === autonomous AND confidence is high,
  // autoApplied=true tells the caller to skip the question entirely.
  suggest(inputId: string, ctx?: Record<string, unknown>): Suggestion {
    const none: Suggestion = { value: "", confidence: 0, source: "none", supportingRuns: 0, autoApplied: false };
    if (!isEnabled()) return none;
    if (this.book.stage === "observe") return none;

    const p = this.book.inputs[inputId];
    if (!p || !p.answers.length) return none;

    const currentSig = ctxSignature(ctx);

    // 1. Best match: identical context signature (same file type, same source)
    if (currentSig) {
      const contextMatches = p.answers.filter(a => a.ctxSignature === currentSig);
      if (contextMatches.length >= 2) {
        const mostRecent = contextMatches[contextMatches.length - 1];
        return {
          value: mostRecent.value,
          confidence: Math.min(0.95, 0.7 + contextMatches.length * 0.05),
          source: "similar_context",
          supportingRuns: contextMatches.length,
          autoApplied: this.book.stage === "autonomous" && contextMatches.length >= 3,
        };
      }
    }

    // 2. Fallback: dominant answer across recent runs
    const dominant = p.dominantValue || computeDominant(p.answers);
    if (dominant) {
      const supporting = p.answers.filter(a => a.value === dominant).length;
      const conf = supporting / p.answers.length;
      return {
        value: dominant,
        confidence: conf,
        source: "dominant",
        supportingRuns: supporting,
        autoApplied: this.book.stage === "autonomous" && conf >= 0.75 && supporting >= 3,
      };
    }

    // 3. Last-resort: most recent answer
    const last = p.answers[p.answers.length - 1];
    return {
      value: last.value,
      confidence: 0.35,
      source: "last",
      supportingRuns: 1,
      autoApplied: false,  // never autonomous on a single sample
    };
  }

  // ── PUBLIC: RECORD ─────────────────────────────────────────────────────────
  // Called after the user answers a question. Stores the answer for future
  // suggestion generation. `confirmed=true` when the user kept a suggestion
  // as-is (stronger signal than a fresh answer).
  record(inputId: string, value: string, ctx?: Record<string, unknown>, confirmed = false): void {
    if (!isEnabled()) return;
    const cleanValue = String(value || "").trim();
    if (!cleanValue) return;

    if (!this.book.inputs[inputId]) {
      this.book.inputs[inputId] = { inputId, answers: [] };
    }
    const p = this.book.inputs[inputId];
    p.answers.push({
      value: cleanValue,
      ts: new Date().toISOString(),
      ctxSignature: ctxSignature(ctx),
      confirmed,
    });
    // Cap memory
    if (p.answers.length > MAX_ANSWERS_PER_INPUT) {
      p.answers = p.answers.slice(-MAX_ANSWERS_PER_INPUT);
    }
    p.lastValue = cleanValue;
    p.dominantValue = computeDominant(p.answers);
    this.save();
  }

  // ── PUBLIC: RUN LIFECYCLE ──────────────────────────────────────────────────
  markRunStarted(): void {
    if (!isEnabled()) return;
    this.book.lastUsedAt = new Date().toISOString();
    this.save();
  }

  markRunCompleted(): void {
    if (!isEnabled()) return;
    this.book.runs += 1;
    // Auto-promote observe → assist after threshold
    if (this.book.stage === "observe" && this.book.runs >= PROMOTE_TO_ASSIST_AFTER) {
      this.book.stage = "assist";
    }
    this.save();
  }

  // ── PUBLIC: GOVERNANCE ─────────────────────────────────────────────────────
  promote(): LearningStage {
    if (!isEnabled()) return "paused";
    if (this.book.stage === "observe" && this.book.runs >= PROMOTE_TO_ASSIST_AFTER) {
      this.book.stage = "assist";
    } else if (this.book.stage === "assist" && this.book.runs >= PROMOTE_TO_AUTO_MIN_RUNS) {
      this.book.stage = "autonomous";
    }
    this.save();
    return this.book.stage;
  }

  demote(): LearningStage {
    if (this.book.stage === "autonomous") this.book.stage = "assist";
    else if (this.book.stage === "assist") this.book.stage = "observe";
    this.save();
    return this.book.stage;
  }

  reset(): void {
    this.book = {
      workflowId: this.workflowId,
      stage: "observe",
      runs: 0,
      createdAt: new Date().toISOString(),
      inputs: {},
    };
    this.save();
  }

  export(): WorkflowPlaybook { return JSON.parse(JSON.stringify(this.book)); }

  // ── STATIC: GLOBAL CONTROLS ────────────────────────────────────────────────
  static isGloballyEnabled(): boolean { return isEnabled(); }
  static pauseAll(): void { try { localStorage.setItem(KILL_SWITCH_KEY, "false"); } catch { /* silent */ } }
  static resumeAll(): void { try { localStorage.setItem(KILL_SWITCH_KEY, "true"); } catch { /* silent */ } }

  static listAllPlaybooks(): { workflowId: string; stage: LearningStage; runs: number }[] {
    try {
      const idx = WorkspaceMemory.get<string[]>(INDEX_KEY) || [];
      return idx.map(wfId => {
        const b = WorkspaceMemory.get<WorkflowPlaybook>(KEY_PREFIX + wfId);
        return b ? { workflowId: b.workflowId, stage: b.stage, runs: b.runs } : null;
      }).filter(Boolean) as any;
    } catch { return []; }
  }

  // Global reset — wipes every workflow's playbook. Use with care.
  static resetAll(): void {
    try {
      const idx = WorkspaceMemory.get<string[]>(INDEX_KEY) || [];
      idx.forEach(wfId => WorkspaceMemory.set(KEY_PREFIX + wfId, null));
      WorkspaceMemory.set(INDEX_KEY, []);
    } catch { /* silent */ }
  }
}
