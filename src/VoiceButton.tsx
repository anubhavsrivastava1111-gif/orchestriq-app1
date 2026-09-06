// src/VoiceButton.tsx
// ─────────────────────────────────────────────────────────────────────────────
// v5 — SINGLE TOGGLE BUTTON. THE LAYOUT COMPLAINT WAS RIGHT, FIXED PROPERLY.
//
// v1-v4 expanded into a full pill while recording — an X, a waveform strip,
// a timer, and a separate stop button, all appearing where the Send button
// used to be. That pushed Send around and made the composer look broken,
// exactly as reported.
//
// This is one fixed-size circular button, always in the same place, that
// never changes the layout around it:
//   click once  -> starts listening (button turns red, pulses)
//   click again -> stops AND transcribes, on the SAME button
// No separate stop control, no expanding pill, no cancel button competing
// for space. The button's own appearance IS the on/off switch.
//
// The OpenAI-vs-free fallback logic underneath is unchanged from before —
// this redesign only touches how it looks, not which engine transcribes.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";
import { transcribeAudio } from "./lib/Voice";

type VoiceState = "idle" | "permission" | "recording" | "transcribing" | "error";

interface Props {
  onTranscript: (text: string) => void;
  getKeyFor: (providerId: string) => string | undefined;
  showToast?: (m: string, k?: string) => void;
  size?: number;
  lang?: string;
}

export default function VoiceButton({ onTranscript, getKeyFor, showToast, size = 40, lang = "en-IN" }: Props) {
  const [state, setState] = useState<VoiceState>("idle");
  const [usingOpenAI, setUsingOpenAI] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recRef = useRef<any>(null);
  const finalRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);

  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };
  useEffect(() => () => { cleanupStream(); try { recRef.current?.stop(); } catch {} }, []);

  // ── OPENAI PATH ────────────────────────────────────────────────────────────
  const startOpenAI = (stream: MediaStream, openaiKey: string) => {
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
        if (result.text) onTranscript(result.text);
        setState("idle");
      } catch (e: any) {
        setState("error");
        showToast?.(String(e?.message || e).slice(0, 200), "error");
        setTimeout(() => setState("idle"), 2000);
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setState("recording");
  };

  // ── FREE, NATIVE PATH ───────────────────────────────────────────────────────
  const startNative = (stream: MediaStream) => {
    if (!SR) {
      cleanupStream();
      showToast?.("Voice input needs Chrome or Edge, or an OpenAI key in Settings.", "error");
      setState("idle");
      return;
    }
    const rec = new SR();
    rec.lang = lang || "en-IN"; rec.continuous = true; rec.interimResults = true;
    recRef.current = rec; finalRef.current = "";
    rec.onstart = () => setState("recording");
    rec.onresult = (e: any) => {
      let f = ""; for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) f += e.results[i][0].transcript;
      finalRef.current = f;
    };
    rec.onerror = (e: any) => {
      cleanupStream(); setState("error");
      showToast?.(e?.error === "not-allowed" ? "Microphone access was denied." : "Voice input error: " + (e?.error||"unknown"), "error");
      setTimeout(() => setState("idle"), 2000);
    };
    rec.onend = () => {
      cleanupStream();
      if (finalRef.current.trim()) onTranscript(finalRef.current.trim());
      setState("idle");
    };
    try { rec.start(); } catch { cleanupStream(); setState("error"); showToast?.("Could not start voice input.", "error"); setTimeout(() => setState("idle"), 2000); }
  };

  // ── THE TOGGLE — ONE BUTTON, ONE CLICK EACH WAY ─────────────────────────────
  const toggle = useCallback(async () => {
    if (state === "recording") {
      // Second click: stop, on the SAME button. No separate stop control.
      if (usingOpenAI) { if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop(); }
      else { try { recRef.current?.stop(); } catch {} }
      return;
    }
    if (state !== "idle") return; // ignore clicks mid-permission/transcribing
    setState("permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const openaiKey = getKeyFor("openai");
      setUsingOpenAI(!!openaiKey);
      if (openaiKey) startOpenAI(stream, openaiKey);
      else startNative(stream);
    } catch (e: any) {
      cleanupStream(); setState("error");
      const msg = e?.name === "NotAllowedError" ? "Microphone access was denied. Allow it in your browser's site settings."
        : e?.name === "NotFoundError" ? "No microphone was found on this device."
        : "Could not start recording.";
      showToast?.(msg, "error");
      setTimeout(() => setState("idle"), 2000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, usingOpenAI, getKeyFor, onTranscript, showToast]);

  const isRecording = state === "recording";
  const isBusy = state === "permission" || state === "transcribing";

  return (
    <button onClick={toggle} disabled={isBusy}
      title={isRecording ? "Click to stop and use this text" : usingOpenAI ? "Voice input \u2014 enhanced with OpenAI" : "Voice input \u2014 free, no key needed"}
      style={{
        width:size, height:size, borderRadius:"50%", flexShrink:0, cursor: isBusy ? "wait" : "pointer",
        border:"1px solid " + (isRecording ? "#EF4444" : "rgba(255,255,255,0.12)"),
        background: isRecording ? "#EF4444" : "rgba(255,255,255,0.03)",
        color: isRecording ? "#fff" : state === "error" ? "#EF4444" : "#8A93A8",
        fontSize:15, display:"flex", alignItems:"center", justifyContent:"center",
        transition:"background 150ms ease, border-color 150ms ease",
        animation: isRecording ? "oiqMicPulse 1.3s ease-in-out infinite" : "none",
      }}>
      {isBusy ? "\u2026" : isRecording ? "\u25A0" : "\uD83C\uDF99\uFE0F"}
      <style>{"@keyframes oiqMicPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.45)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}"}</style>
    </button>
  );
}
