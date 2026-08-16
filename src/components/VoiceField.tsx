/* ============================================================================
 * OrchestrIQ :: VoiceField.tsx
 *
 * Drops a microphone and a speaker onto ANY text box.
 *
 * COST: zero. Both use APIs already built into the browser -
 *   SpeechRecognition  (dictation)
 *   speechSynthesis    (read aloud)
 * No server, no API key, no per-use charge, nothing to run out of.
 *
 * The quality comes from VoiceText.ts, which repairs what the free recogniser
 * gets wrong - business vocabulary, Indian number words, spoken punctuation.
 *
 * SAFE BY DESIGN: if the browser has no speech support the buttons simply do
 * not render. Typing is never blocked or altered.
 * ========================================================================== */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  cleanDictation, diffCorrections, speechInputSupported, speechOutputSupported,
  type Correction,
} from "../lib/VoiceText";

const V = (n: string, f: string) => `var(--oiq-${n}, ${f})`;

export interface VoiceFieldProps {
  /** Current text in the field. */
  value: string;
  /** Called with the new text after dictation is appended and cleaned. */
  onChange: (next: string) => void;
  /** Show the read-aloud button. Default true when there is text. */
  allowReadAloud?: boolean;
  /** Append to existing text (default) or replace it. */
  mode?: "append" | "replace";
  /** Compact rendering for tight table cells. */
  compact?: boolean;
  /** Language for the recogniser. Indian English by default. */
  lang?: string;
  disabled?: boolean;
}

export default function VoiceField({
  value, onChange, allowReadAloud = true, mode = "append",
  compact = false, lang = "en-IN", disabled = false,
}: VoiceFieldProps) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [fixes, setFixes] = useState<Correction[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const recRef = useRef<any>(null);
  const baseRef = useRef<string>("");

  const canListen = speechInputSupported();
  const canSpeak = speechOutputSupported();

  /* stop everything when the component goes away */
  useEffect(() => () => {
    try { recRef.current?.stop?.(); } catch { /* already stopped */ }
    try { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); } catch { /* none */ }
  }, []);

  const stopListening = useCallback(() => {
    try { recRef.current?.stop?.(); } catch { /* already stopped */ }
    setListening(false); setInterim("");
  }, []);

  const startListening = useCallback(() => {
    if (!canListen || disabled) return;
    setErr(null); setFixes([]);

    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recRef.current = rec;
    baseRef.current = mode === "append" ? (value || "") : "";

    let finalText = "";

    rec.onresult = (e: any) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " ";
        else live += t;
      }
      setInterim(live);
      if (finalText) {
        const cleaned = cleanDictation(finalText);
        const base = baseRef.current;
        const joined = base ? base.replace(/\s*$/, "") + " " + cleaned : cleaned;
        onChange(joined);
        setFixes(diffCorrections(finalText, cleaned));
      }
    };

    rec.onerror = (e: any) => {
      const code = e?.error || "unknown";
      setErr(
        code === "not-allowed" || code === "service-not-allowed"
          ? "Microphone permission was refused. Allow it in your browser's address bar, then try again."
          : code === "no-speech" ? "Nothing was heard. Try again and speak a little closer to the microphone."
          : code === "network" ? "Speech recognition needs an internet connection."
          : "Dictation stopped unexpectedly. Try again."
      );
      setListening(false); setInterim("");
    };

    rec.onend = () => { setListening(false); setInterim(""); };

    try { rec.start(); setListening(true); }
    catch { setErr("Could not start the microphone. It may already be in use by another tab."); }
  }, [canListen, disabled, lang, mode, onChange, value]);

  const readAloud = useCallback(() => {
    if (!canSpeak || !value.trim()) return;
    const synth = window.speechSynthesis;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    try {
      synth.cancel();
      const u = new (window as any).SpeechSynthesisUtterance(value.slice(0, 4000));
      u.lang = lang; u.rate = 1.0; u.pitch = 1.0;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(u);
    } catch { setSpeaking(false); }
  }, [canSpeak, value, speaking, lang]);

  if (!canListen && !canSpeak) return null;

  const size = compact ? 22 : 26;
  const btn = (active: boolean, tone: string): React.CSSProperties => ({
    width: size, height: size, borderRadius: 6, flexShrink: 0,
    border: `1px solid ${active ? tone : V("border", "#1e2a38")}`,
    background: active ? tone : "transparent",
    color: active ? "#0b1220" : V("muted", "#8b98a5"),
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: compact ? 11 : 12, lineHeight: 1, padding: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    opacity: disabled ? 0.4 : 1,
  });

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        {canListen && (
          <button type="button" disabled={disabled}
            onClick={() => (listening ? stopListening() : startListening())}
            title={listening ? "Stop dictating" : "Dictate with your voice (free, uses your browser)"}
            style={btn(listening, "#F87171")}>
            {listening ? "\u25A0" : "\u{1F3A4}"}
          </button>
        )}
        {canSpeak && allowReadAloud && !!value.trim() && (
          <button type="button" disabled={disabled} onClick={readAloud}
            title={speaking ? "Stop reading" : "Read this out loud"}
            style={btn(speaking, "#4ADE80")}>
            {speaking ? "\u25A0" : "\u{1F50A}"}
          </button>
        )}
      </span>

      {listening && (
        <span style={{ fontSize: 10, color: "#F87171", maxWidth: 320, lineHeight: 1.4 }}>
          Listening&hellip; {interim ? <em style={{ color: V("muted", "#8b98a5") }}>{interim}</em> : "speak now"}
        </span>
      )}

      {!listening && fixes.length > 0 && (
        <span style={{ fontSize: 9.5, color: V("muted", "#8b98a5"), maxWidth: 320, lineHeight: 1.5 }}>
          Corrected: {fixes.map((f, i) => (
            <span key={i}>
              {i > 0 && " \u00B7 "}
              <span style={{ textDecoration: "line-through", opacity: 0.7 }}>{f.from}</span>
              {" \u2192 "}
              <strong style={{ color: V("ink", "#e6edf3") }}>{f.to}</strong>
            </span>
          ))}
        </span>
      )}

      {err && (
        <span style={{ fontSize: 10, color: "#FBBF24", maxWidth: 320, lineHeight: 1.4 }}>{err}</span>
      )}
    </span>
  );
}
