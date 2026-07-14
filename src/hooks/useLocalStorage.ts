// ─── useLocalStorage ─────────────────────────────────────────────────────────
// Drop-in replacement for the useState + localStorage pattern used 37 times
// in App.tsx. The hook writes back automatically on every state change,
// eliminating duplicate setItem calls.
//
// MIGRATION PLAN: Replace localStorage pairs ONE AT A TIME (not all at once).
// Start with non-critical keys (theme, sidebar) and validate before moving to
// data keys (ledger, AP/AR) where a bug means data loss.
//
// USAGE:
//   const [theme, setTheme] = useLocalStorage(STORAGE_KEYS.THEME, "dark");

import { useState, useEffect, Dispatch, SetStateAction } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) {
        return typeof initialValue === "function"
          ? (initialValue as () => T)()
          : initialValue;
      }
      return JSON.parse(item) as T;
    } catch (e) {
      console.warn("[useLocalStorage] Error reading key " + key, e);
      return typeof initialValue === "function"
        ? (initialValue as () => T)()
        : initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn("[useLocalStorage] Error writing key " + key, e);
    }
  }, [key, state]);

  return [state, setState];
}
