// src/lib/WorkspaceMemory.ts
// Single place that handles ALL data storage for OrchestrIQ.
// App.tsx never calls localStorage directly — it calls this instead.
// When cloud storage is ready, only this file changes. App.tsx stays the same.

const ALL_KEYS = [
  "cos-keys","cos-co","cos-ch","cos-dp","cos-cd",
  "cos-br","cos-br-live","cos-dn","cos-wf","cos-tq",
  "cos-ledger","cos-accounts","cos-dispatch-templates",
  "cos-actions","cos-admin-config","cos-tm","cos-tm-live",
  "cos-ap","cos-ap-live","cos-vl","cos-theme",
  "cos-lastvisit","oiq-sb-col","cos-decision-history",
  "cos-pulse-concur","cos-pulse-email","cos-pulse-sn","cos-pulse-cfg",
  "cos-fin-ap","cos-fin-ar",   "oiq-agent-history","oiq-agent-prefs",
];

export const WorkspaceMemory = {

  // Save a value
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    } catch { /* storage full — silent */ }
  },

  // Load a value
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
    } catch { return null; }
  },

  // Wipe EVERYTHING for this user — used by full reset
  clearAll(): void {
    for (const key of ALL_KEYS) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  },

  // Add a new key here whenever a new feature saves something new.
  // This is the ONLY place you need to update.
  getAllKeys(): string[] {
    return [...ALL_KEYS];
  },

  // Business State — single source of truth for org context.
  // Read by Intelligence Engine (Session 2) as its starting point.
  // Updated incrementally — never overwrites, always merges.
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
