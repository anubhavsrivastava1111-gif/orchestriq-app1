// src/VoiceButton.tsx
// ─────────────────────────────────────────────────────────────────────────────
// A single, self-contained microphone control. Drop it next to any composer;
// it never touches that screen's own state directly — it only calls
// onTranscript(text) when it has one, exactly like a piece of typed text
// arriving. This is what lets the SAME component sit in the Workspace and the
// Live Boardroom without either screen knowing anything about how voice
// works internally.
//
// STATES, EXPLICITLY, PER THE SPEC: idle -> requesting permission -> recording
// -> transcribing -> done (or error). Every one of them is a distinct visual
// state, not inferred from a boolean.
//
// WHAT THIS DOES NOT DO: it does not auto-send the transcribed text. It calls
// onTranscript(text), and the composer that receives it behaves exactly as if
// the person had typed it — editable, not yet sent, per the explicit
// instruction not to auto-send unless a screen already does that for typed
// text (none of this platform's composers do).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from "react";
import { transcribeAudio } from "./lib/Voice";

type VoiceState = "idle" | "permission" | "recording" | "transcribing" | "error";

interface Props {
  onTranscript: (text: string) => void;
  getKeyFor: (providerId: string) => string | undefined;
  showToast?: (m: string, k?: string) => void;
  size?: number;
}

export default function VoiceButton({ onTranscript, getKeyFor, showToast, size = 40 }: Props) {
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const start = useCallback(async () => {
    if (state === "recording") return;
    setState("permission");
    try {
      // PERMISSION HANDLING: the browser's own prompt does the actual asking;
      // this state exists so the button shows something other than "idle"
      // while that prompt is up, rather than looking unresponsive.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        cleanupStream();
        const blob = new Blob(chunksRef.current, { type: mime });
        setState("transcribing");
        try {
          const result = await transcribeAudio(blob, getKeyFor);
          onTranscript(result.text);
          setState("idle");
        } catch (e: any) {
          setState("error");
          showToast?.(String(e?.message || e).slice(0, 200), "error");
          setTimeout(() => setState("idle"), 2500);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch (e: any) {
      cleanupStream();
      setState("error");
      // GRACEFUL FAILURE: name the actual reason rather than a generic
      // failure — permission denied and no-microphone-found need different
      // guidance from the person reading this.
      const msg = e?.name === "NotAllowedError"
        ? "Microphone access was denied. Allow microphone access in your browser's site settings to use voice input."
        : e?.name === "NotFoundError"
        ? "No microphone was found on this device."
        : "Could not start recording: " + String(e?.message || e).slice(0, 150);
      showToast?.(msg, "error");
      setTimeout(() => setState("idle"), 2500);
    }
  }, [state, getKeyFor, onTranscript, showToast]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop(); // triggers onstop -> transcription
    }
  }, []);

  const cancel = useCallback(() => {
    // STOP/CANCEL, DISTINCT: stop transcribes what was said so far; cancel
    // discards it entirely. Both are explicitly required by the spec.
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null; // suppress the normal transcribe-on-stop path
      if (mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop();
    }
    cleanupStream();
    setState("idle");
  }, []);

  const fmt = (s: number) => String(Math.floor(s/60)).padStart(1,"0") + ":" + String(s%60).padStart(2,"0");

  if (state === "recording") {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <div style={{ width:8, height:8, borderRadius:99, background:"#EF4444",
          animation:"oiqVoicePulse 1.1s ease-in-out infinite" }} />
        <span style={{ fontSize:10.5, color:"#EF4444", fontWeight:700, fontVariantNumeric:"tabular-nums" }}>{fmt(seconds)}</span>
        <button onClick={stop} title="Stop and transcribe"
          style={{ width:size, height:size, borderRadius:"50%", border:"1px solid #EF4444", background:"rgba(239,68,68,0.12)",
            color:"#EF4444", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>
          \u25A0
        </button>
        <button onClick={cancel} title="Cancel"
          style={{ background:"none", border:"none", color:"#5A6480", cursor:"pointer", fontSize:11, padding:"0 4px" }}>
          Cancel
        </button>
        <style>{"@keyframes oiqVoicePulse{0%,100%{opacity:1}50%{opacity:0.3}}"}</style>
      </div>
    );
  }

  if (state === "permission" || state === "transcribing") {
    return (
      <div style={{ width:size, height:size, borderRadius:"50%", border:"1px solid #1A2030", background:"#0A0E1A",
        color:"#A0AAC0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}
        title={state === "permission" ? "Requesting microphone access\u2026" : "Transcribing\u2026"}>
        \u2026
      </div>
    );
  }

  return (
    <button onClick={start} title="Voice input"
      style={{ width:size, height:size, borderRadius:"50%", border:"1px solid #1A2030", background:"#0A0E1A",
        color: state === "error" ? "#EF4444" : "#A0AAC0", cursor:"pointer", fontSize:15,
        display:"flex", alignItems:"center", justifyContent:"center" }}>
      {"\uD83C\uDF99\uFE0F"}
    </button>
  );
}
