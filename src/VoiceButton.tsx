// src/VoiceButton.tsx
// ─────────────────────────────────────────────────────────────────────────────
// v2 — VISUAL REDESIGN TO MATCH THE REFERENCE SCREENSHOT.
//
// Recording is now one continuous pill, sized to sit inline with a composer:
// [X cancel] [live, audio-reactive waveform bars, filling the space] [stop].
// The waveform is REAL, not decorative — it reads the actual microphone level
// via the Web Audio API's AnalyserNode, the same technique already proven
// elsewhere in this codebase's own voice component, applied here to this
// component's own MediaRecorder stream.
//
// COLOR: accepts a `color` prop rather than a fixed hex, so it can be tinted
// with this platform's own theme accent (var(--oiq-accent)) wherever a
// composer already participates in the multi-theme system, or with the
// Workspace/Live Boardroom's own established teal where those two
// deliberately self-contained screens are concerned. Nothing here hard-codes
// one specific color.
//
// BEHAVIOUR IS UNCHANGED FROM v1: transcribed text lands in the composer,
// editable, never auto-sent. Only the recording state's appearance changed.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";
import { transcribeAudio } from "./lib/Voice";

type VoiceState = "idle" | "permission" | "recording" | "transcribing" | "error";
const BARS = 24;

interface Props {
  onTranscript: (text: string) => void;
  getKeyFor: (providerId: string) => string | undefined;
  showToast?: (m: string, k?: string) => void;
  size?: number;
  /** Theme accent color. Defaults to this component's own teal for screens
   *  that use a fixed palette; pass "var(--oiq-accent)" for any composer
   *  that already participates in the platform's multi-theme system. */
  color?: string;
}

export default function VoiceButton({ onTranscript, getKeyFor, showToast, size = 40, color = "#14B8A6" }: Props) {
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(BARS).fill(0.06));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopWaveformLoop = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopWaveformLoop();
  };

  useEffect(() => () => { cleanupStream(); }, []);

  // REAL, AUDIO-REACTIVE WAVEFORM — reads actual microphone amplitude per
  // frequency band, the same AnalyserNode technique already proven in this
  // codebase's own voice component, applied to this recording's own stream.
  const startWaveformLoop = (stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Same known cause as MicButton: created inside an async continuation
      // (getUserMedia().then()), not synchronously in the click handler, so
      // some browsers start it suspended and deliver silence to the analyser.
      if (ctx.state === "suspended") { ctx.resume().catch(() => {}); }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const step = Math.floor(buf.length / BARS) || 1;
        const next: number[] = [];
        for (let i = 0; i < BARS; i++) {
          const v = buf[i * step] / 255;
          next.push(Math.max(0.06, Math.min(1, v * 1.4)));
        }
        setLevels(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* waveform is cosmetic — never block recording if this fails */ }
  };

  const start = useCallback(async () => {
    if (state === "recording") return;
    setState("permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startWaveformLoop(stream);
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
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null; // suppress transcribe-on-stop
      if (mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop();
    }
    cleanupStream();
    setState("idle");
  }, []);

  const fmt = (s: number) => String(Math.floor(s/60)).padStart(1,"0") + ":" + String(s%60).padStart(2,"0");

  if (state === "recording") {
    return (
      <div style={{
        display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0,
        background:"rgba(255,255,255,0.03)", border:"1px solid "+color+"55",
        borderRadius:999, padding:"6px 8px 6px 6px", height:size,
      }}>
        <button onClick={cancel} title="Cancel — discard this recording"
          style={{ width:size-10, height:size-10, borderRadius:"50%", border:"none", background:"transparent",
            color:"#8A93A8", cursor:"pointer", fontSize:15, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {"\u2715"}
        </button>
        {/* THE REAL WAVEFORM — audio-reactive, matching the reference image's
            central bar cluster rather than a spinner or a static dot. */}
        <div style={{ display:"flex", alignItems:"center", gap:2, flex:1, height:size-14, minWidth:0, overflow:"hidden" }}>
          {levels.map((h,i) => (
            <div key={i} style={{ width:3, minWidth:3, height:Math.max(3,h*(size-18)),
              background:color, borderRadius:2, opacity:0.55+h*0.45, transition:"height 70ms ease", flexShrink:0 }} />
          ))}
        </div>
        <span style={{ fontSize:10, color:"#8A93A8", fontVariantNumeric:"tabular-nums", flexShrink:0 }}>{fmt(seconds)}</span>
        <button onClick={stop} title="Stop and transcribe"
          style={{ width:size-8, height:size-8, borderRadius:"50%", border:"none", background:"#EF4444",
            color:"#fff", cursor:"pointer", fontSize:11, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {"\u25A0"}
        </button>
      </div>
    );
  }

  if (state === "permission" || state === "transcribing") {
    return (
      <div style={{ width:size, height:size, borderRadius:"50%", border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.03)",
        color:"#8A93A8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0 }}
        title={state === "permission" ? "Requesting microphone access\u2026" : "Transcribing\u2026"}>
        {"\u2026"}
      </div>
    );
  }

  return (
    <button onClick={start} title="Voice input"
      style={{ width:size, height:size, borderRadius:"50%", border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.03)",
        color: state === "error" ? "#EF4444" : "#8A93A8", cursor:"pointer", fontSize:15, flexShrink:0,
        display:"flex", alignItems:"center", justifyContent:"center" }}>
      {"\uD83C\uDF99\uFE0F"}
    </button>
  );
}
