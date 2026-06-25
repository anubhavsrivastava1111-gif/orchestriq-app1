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
  "cos-lastvisit","oiq-sb-col",
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
};
