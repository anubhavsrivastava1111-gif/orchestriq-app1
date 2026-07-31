// useReadAloud — the single hook every module calls. Subscribes to the shared
// engine, exposes controls + live status, and cleans up on unmount.

import { useEffect, useState, useCallback, useRef } from "react";
import { ReadAloud, EngineStatus } from "./ReadAloudEngine";

let _initPromise: Promise<void> | null = null;
function ensureInit() {
  if (!_initPromise) _initPromise = ReadAloud.init().catch(() => {});
  return _initPromise;
}

export function useReadAloud() {
  const [status, setStatus] = useState<EngineStatus>({
    state: "idle", sessionId: null, charTotal: 0, charSpoken: 0,
    currentSentence: null, etaSeconds: 0, error: null,
  });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    ensureInit();
    const unsub = ReadAloud.subscribe((s) => { if (mounted.current) setStatus(s); });
    return () => { mounted.current = false; unsub(); };
  }, []);

  const play = useCallback((text: string, sessionId: string) => {
    ensureInit().then(() => ReadAloud.start(text, sessionId));
  }, []);

  return {
    status,
    isAvailable: ReadAloud.isAvailable(),
    play,
    pause: useCallback(() => ReadAloud.pause(), []),
    resume: useCallback(() => ReadAloud.resume(), []),
    stop: useCallback(() => ReadAloud.stop(), []),
    restart: useCallback(() => ReadAloud.restart(), []),
    skipForward: useCallback(() => ReadAloud.skip(12), []),
    skipBack: useCallback(() => ReadAloud.skip(-12), []),
    setRate: useCallback((r: number) => ReadAloud.setRate(r), []),
    setVoice: useCallback((uri: string) => ReadAloud.setVoice(uri), []),
    voices: () => ReadAloud.voices.getVoices(),
    prefs: ReadAloud.voices,
  };
}
