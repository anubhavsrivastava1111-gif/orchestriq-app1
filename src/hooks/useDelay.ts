// ─── useDelay ─────────────────────────────────────────────────────────────────
// Returns a delay() function that resolves after N milliseconds AND
// automatically clears itself when the component unmounts.
//
// WHY THIS MATTERS: The boardroom retry loop waits 65 seconds between provider
// exhaustion retries. Without this hook, that timer can fire after the user
// navigates away — causing ghost AI calls and wasted API spend.
//
// USAGE:
//   const delay = useDelay();
//   await delay(TIMEOUTS.PROVIDER_RETRY_WAIT_MS);

import { useEffect, useRef, useCallback } from "react";

export function useDelay() {
  const timerRef = useRef<number | null>(null);

  // Clear on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const delay = useCallback((ms: number): Promise<void> => {
    return new Promise((resolve) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        resolve();
      }, ms);
    });
  }, []);

  return delay;
}
