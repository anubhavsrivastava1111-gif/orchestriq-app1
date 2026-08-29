// src/lib/WorkspaceMemory.ts
// Single place that handles ALL data storage for OrchestrIQ.
// App.tsx never calls localStorage directly — it calls this instead.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE WAS REWRITTEN — A CONFIDENTIALITY FAILURE
//
// Every value was stored under a FIXED key: "cos-keys", "cos-br", and so on.
// Nothing was scoped to the signed-in user, and the ordinary sign-out path
// never cleared any of it — only the "full reset" button did.
//
// The consequence, reproduced exactly as reported: sign in as user A, enter API
// keys, sign out, sign in as user B ON THE SAME BROWSER, and user B's app reads
// localStorage["cos-keys"] and finds user A's keys. The same for boardroom
// sessions, the ledger, company data and everything else.
//
// To be precise about what this was and was not:
//   IT WAS NOT a server-side leak. The Supabase `profiles` table has correct
//   row-level security (auth.uid() = id) and I verified against live data that
//   the two non-admin accounts hold NO keys at all. Nothing was ever exposed
//   through the database or to any remote user.
//   IT WAS a same-device leak, and that is still serious: any shared computer,
//   demo laptop, or account switch exposed one user's credentials to the next.
//
// THE FIX: every key is namespaced with the signed-in user's id, so two users
// on the same browser write to different key names and CANNOT read each other's
// data — even if sign-out never runs, the tab crashes, or the browser is
// closed mid-session. Clearing on sign-out is now defence in depth rather than
// the only line of defence.
//
// The user id is read synchronously from the Supabase session that already
// lives in localStorage, so scoping is correct from the very first read on page
// load. Waiting for an async auth callback would have left a window where the
// old, unscoped keys were still being read.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_REF = "wfpqesnttzarfdfsghzw";
const LEGACY_MIGRATED_FLAG = "oiq-scoped-v2";

// MY BUG, AND IT MADE THINGS WORSE RATHER THAN BETTER.
// v1 of this migration handed the unscoped workspace to "the first user who
// signs in after this ships". I wrote that assuming the owner would be first.
// On the actual device the hotmail test account signed in first, so IT
// inherited the company profile, the location and the boardroom session. The
// leak was not closed; it was relocated, and I told you it was fixed.
//
// The rule now: legacy data belongs to the OWNER and to nobody else. The owner
// is identified by the email in the Supabase session, which is available
// synchronously. Every other account gets the legacy data PURGED, never
// inherited.
const OWNER_EMAIL = "anubhavsrivastava1111@gmail.com";

const ALL_KEYS = [
  "cos-keys","cos-co","cos-ch","cos-dp","cos-cd",
  "cos-br","cos-br-live","cos-dn","cos-wf","cos-tq",
  "cos-ledger","cos-accounts","cos-dispatch-templates",
  "cos-actions","cos-admin-config","cos-tm","cos-tm-live",
  "cos-ap","cos-ap-live","cos-vl","cos-theme",
  "cos-lastvisit","oiq-sb-col","cos-decision-history",
  "cos-pulse-concur","cos-pulse-email","cos-pulse-sn","cos-pulse-cfg",
  "cos-fin-ap","cos-fin-ar","oiq-agent-history","oiq-agent-prefs",
  "cos-unfulfilled-log","oiq-learn-index","oiq-learning-enabled",
  // These three were storing real usage and cost data and were NOT in this
  // list, which meant even the full-reset button left them behind.
  "oiq-token-records","oiq-usage-queue","oiq-browser-docs",
];

/** Keys that must NEVER survive an account switch, in any circumstance. */
const SENSITIVE_KEYS = ["cos-keys", "oiq-token-records", "oiq-usage-queue"];

/**
 * The signed-in user's id, read straight from the Supabase session in
 * localStorage. Synchronous by design: storage reads happen during the first
 * render, long before any auth callback would fire.
 * Returns "" when nobody is signed in — anonymous data stays unscoped and is
 * wiped the moment a real user signs in.
 */
function sessionUser(): { id: string; email: string } {
  try {
    const raw = localStorage.getItem("sb-" + SUPABASE_REF + "-auth-token");
    if (!raw) return { id: "", email: "" };
    const s = JSON.parse(raw);
    const u = s?.user || s?.currentSession?.user;
    return { id: String(u?.id || ""), email: String(u?.email || "").trim().toLowerCase() };
  } catch { return { id: "", email: "" }; }
}

function currentUid(): string { return sessionUser().id; }

/** Namespaced storage key. Two users produce two different names. */
function scoped(key: string): string {
  const uid = currentUid();
  return uid ? "u:" + uid + ":" + key : key;
}

/**
 * One-time migration so the existing owner does not lose their workspace.
 * The unscoped values are handed to the FIRST user who signs in after this
 * ships — which on your device is you — and then deleted, so nobody who signs
 * in afterwards can ever reach them.
 *
 * SENSITIVE_KEYS are deliberately NOT migrated silently: API keys are re-entered
 * rather than inherited. Losing a saved key is a minor inconvenience; handing
 * one to the wrong account is the failure this rewrite exists to prevent.
 */
function migrateLegacyOnce(): void {
  try {
    const { id: uid, email } = sessionUser();
    if (!uid) return;
    if (localStorage.getItem(LEGACY_MIGRATED_FLAG + ":" + uid) === "1") return;
    const isOwner = email === OWNER_EMAIL;

    // ONE-TIME REPAIR of the damage v1 caused. Any workspace that v1 handed to
    // a non-owner account is removed here. Without this, the hotmail account
    // keeps the owner's boardroom and company profile forever, because it now
    // sits under that account's own namespace and looks legitimate.
    if (!isOwner && localStorage.getItem("oiq-scoped-v1:" + uid) === "1") {
      for (const key of ALL_KEYS) {
        try { localStorage.removeItem("u:" + uid + ":" + key); } catch { /* ignore */ }
      }
      try { localStorage.removeItem("oiq-scoped-v1:" + uid); } catch { /* ignore */ }
    }

    for (const key of ALL_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy === null) continue;
      // Only the owner inherits. Everyone else gets it deleted, not handed over.
      // API keys are never inherited by anyone, including the owner - they are
      // re-entered. Losing a saved key is an inconvenience; giving one to the
      // wrong account is the failure this file exists to prevent.
      if (isOwner && !SENSITIVE_KEYS.includes(key)) {
        const target = "u:" + uid + ":" + key;
        if (localStorage.getItem(target) === null) {
          try { localStorage.setItem(target, legacy); } catch { /* full */ }
        }
      }
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
    localStorage.setItem(LEGACY_MIGRATED_FLAG + ":" + uid, "1");
  } catch { /* never block the app on migration */ }
}

let migrationDone = false;
function ensureMigrated(): void {
  if (migrationDone) return;
  migrationDone = true;
  migrateLegacyOnce();
}

export const WorkspaceMemory = {

  set(key: string, value: unknown): void {
    try {
      ensureMigrated();
      localStorage.setItem(scoped(key), typeof value === "string" ? value : JSON.stringify(value));
    } catch { /* storage full — silent */ }
  },

  get<T>(key: string): T | null {
    try {
      ensureMigrated();
      const raw = localStorage.getItem(scoped(key));
      if (raw === null) return null;
      try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
    } catch { return null; }
  },

  /** Wipe this user's data only. Another signed-in user's data is untouched. */
  clearAll(): void {
    ensureMigrated();
    for (const key of ALL_KEYS) {
      try { localStorage.removeItem(scoped(key)); } catch { /* ignore */ }
      try { localStorage.removeItem(key); } catch { /* ignore legacy */ }
    }
  },

  /**
   * Called on SIGN OUT. Removes every OrchestrIQ value for every user on this
   * device, plus any stray legacy value.
   *
   * Why every user and not just the one signing out: a shared or demo machine
   * should not retain one person's credentials for the next person to find. The
   * cost is that a returning user re-enters their keys; the benefit is that
   * walking away from a browser cannot expose them. For a product handling
   * financial data that is the right way round.
   */
  clearDevice(): void {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const bare = k.startsWith("u:") ? k.slice(k.indexOf(":", 2) + 1) : k;
        if (ALL_KEYS.includes(bare) || k.startsWith(LEGACY_MIGRATED_FLAG)) doomed.push(k);
      }
      for (const k of doomed) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
      migrationDone = false;
    } catch { /* ignore */ }
  },

  /** True when a signed-in user owns the current namespace. Diagnostics only. */
  isScoped(): boolean { return !!currentUid(); },

  getAllKeys(): string[] {
    return [...ALL_KEYS];
  },

  buildBusinessState(data: {
    company: Record<string, string>;
    companyData: Record<string, string>;
    ledgerEntries: unknown[];
    boardroomSessions: unknown[];
    workflows: unknown[];
    taskQueue: unknown[];
    timeMachineResult: string;
    autopilotResult: string;
  }): Record<string, unknown> {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      company: data.company,
      companyData: data.companyData,
      financials: {
        ledgerEntryCount: data.ledgerEntries.length,
        hasLedgerData: data.ledgerEntries.length > 0,
      },
      decisions: {
        boardroomSessionCount: data.boardroomSessions.length,
        recentBoardroomTopics: (data.boardroomSessions as Array<{q?: string}>)
          .slice(-3)
          .map(s => s.q || "")
          .filter(Boolean),
      },
      execution: {
        workflowCount: data.workflows.length,
        taskQueueCount: data.taskQueue.length,
        approvedWorkflows: (data.workflows as Array<{status?: string}>)
          .filter(w => w.status === "approved").length,
      },
      intelligence: {
        hasTimeMachineResult: !!data.timeMachineResult,
        hasAutopilotResult: !!data.autopilotResult,
      },
    };
  },
};
