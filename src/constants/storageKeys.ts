// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// Single source of truth for every key used in WorkspaceMemory or localStorage.
// Usage: import { STORAGE_KEYS } from "../constants/storageKeys";
//        WorkspaceMemory.get(STORAGE_KEYS.COMPANY)
//
// WHY THIS EXISTS: Before this file, the string "cos-theme" appeared 108 times
// across the codebase. One typo = silent data loss with no error message.
// Now a typo is a TypeScript error caught before deployment.

export const STORAGE_KEYS = {
  // ── Company & settings ──────────────────────────────────────────────────────
  COMPANY:               "cos-co",
  COMPANY_DATA:          "cos-cd",
  API_KEYS:              "cos-keys",
  THEME:                 "cos-theme",
  ADMIN_CONFIG:          "cos-admin-config",
  VOICE_LANGUAGE:        "cos-vl",
  SIDEBAR_COL:           "oiq-sb-col",
  DONATION:              "cos-dn",
  LAST_VISIT:            "cos-lastvisit",

  // ── Boardroom / Nerve Center ────────────────────────────────────────────────
  BOARDROOM_LIVE:        "cos-br-live",
  BOARDROOM_SESSIONS:    "cos-br",
  DECISION_HISTORY:      "cos-decision-history",

  // ── Workflow & autonomous task engines ─────────────────────────────────────
  WORKFLOW:              "cos-wf",
  TASK_QUEUE:            "cos-tq",

  // ── Autopilot & Time Machine ────────────────────────────────────────────────
  AUTOPILOT:             "cos-ap",
  AUTOPILOT_LIVE:        "cos-ap-live",
  TIME_MACHINE:          "cos-tm",
  TIME_MACHINE_LIVE:     "cos-tm-live",

  // ── Finance ─────────────────────────────────────────────────────────────────
  LEDGER:                "cos-ledger",
  ACCOUNTS:              "cos-accounts",
  FINANCE_AP:            "cos-fin-ap",
  FINANCE_AR:            "cos-fin-ar",

  // ── Pulse governance ────────────────────────────────────────────────────────
  PULSE_CONCUR:          "cos-pulse-concur",
  PULSE_EMAIL:           "cos-pulse-email",
  PULSE_SN:              "cos-pulse-sn",
  PULSE_CONFIG:          "cos-pulse-cfg",

  // ── Actions & dispatch ──────────────────────────────────────────────────────
  ACTIONS:               "cos-actions",
  DISPATCH_TEMPLATES:    "cos-dispatch-templates",

  // ── Navigation data ─────────────────────────────────────────────────────────
  CHAPTER:               "cos-ch",
  DATA_PROFILES:         "cos-dp",

  // ── AI Agents & Learning Engine ─────────────────────────────────────────────
  AGENT_HISTORY:         "oiq-agent-history",
  AGENT_PREFS:           "oiq-agent-prefs",
  LEARNING_INDEX:        "oiq-learn-index",
  LEARNING_ENABLED:      "oiq-learning-enabled",

  // ── Continuous improvement ──────────────────────────────────────────────────
  UNFULFILLED_LOG:       "cos-unfulfilled-log",
} as const;

// TypeScript derives the type automatically — no manual maintenance needed
export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
