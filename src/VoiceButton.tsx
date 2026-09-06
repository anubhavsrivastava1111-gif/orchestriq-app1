// src/VoiceButton.tsx
// ─────────────────────────────────────────────────────────────────────────────
// v3 — THE ACTUAL ROOT CAUSE OF "THE MIC DOES NOT WORK", FIXED.
//
// v1/v2 transcribed by uploading a recording to OpenAI's paid transcription
// API. That REQUIRES an OpenAI key. Every other voice mechanism already built
// on this platform (MicButton, used in ten places; VoiceEngine, used in
// Executive Chat) uses the browser's own FREE, built-in speech recognition —
// no key, no cost, works for anyone regardless of which AI provider they
// have configured. This screen's own users - anyone on the NVIDIA free tier
// with no OpenAI key at all - could press this button, speak, and it would
// silently fail every single time, because the one thing it depended on
// simply was not there. That is not a rare edge case on this platform; NVIDIA
// is presented as the default free option everywhere else.
//
// FIXED: this now uses the exact same native SpeechRecognition mechanism as
// MicButton, with the same live audio-reactive waveform layered on top via
// the Web Audio API, matching the visual already delivered. No API key of
// any kind is required. It will now work for every user on this platform,
// not only users who happen to also hold an OpenAI key.
//
// getKeyFor is kept as a prop for interface stability with existing callers,
// but is no longer used to gate whether voice works at all — voice input on
// this platform should never depend on a specific paid provider.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";

type VoiceState = "idle" | "permission" | "listening" | "error";
const BARS = 24;

interface Props {
  onTranscript: (text: string) => void;
  getKeyFor?: (providerId: string) => string | undefined; // kept for interface stability; unused
  showToast?: (m: string, k?: string) => void;
  size?: number;
  color?: string;
  lang?: string;
}

export default function VoiceButton({ onTranscript, showToast, size = 40, color = "#14B8A6", lang = "en-IN" }: Props) {
  const [state, setState] = useState<VoiceState>("idle");
  const [levels, setLevels] = useState<number[]>(Array(BARS).fill(0.06));
  const recRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const finalRef = useRef("");

  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

  const stopWaveform = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => { stopWaveform(); try { recRef.current?.stop(); } catch {} }, []);

  const startWaveform = (stream: MediaStream) => {
    try {
      const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      // Known cause of a waveform that never moves: an AudioContext created
      // inside an async continuation can start suspended in some browsers.
      if (ctx.state === "suspended") { ctx.resume().catch(() => {}); }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      audioCtxRef.current = ctx; analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const step = Math.max(1, Math.floor(buf.length / BARS));
        const next: number[] = [];
        for (let i = 0; i < BARS; i++) next.push(Math.max(0.06, Math.min(1, (buf[i*step]/255)*1.4)));
        setLevels(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* waveform is cosmetic — never block transcription if this fails */ }
  };

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
  }, []);

  const cancel = useCallback(() => {
    if (recRef.current) { recRef.current.onend = null; try { recRef.current.stop(); } catch {} }
    stopWaveform();
    setState("idle");
  }, []);

  const start = useCallback(() => {
    if (state === "listening") { stop(); return; }
    if (!SR) {
      showToast?.("Voice input needs a browser with speech recognition support — Chrome or Edge.", "error");
      return;
    }
    setState("permission");
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;
      startWaveform(stream);
      const rec = new SR();
      rec.lang = lang || "en-IN";
      rec.continuous = true;
      rec.interimResults = true;
      recRef.current = rec;
      finalRef.current = "";
      rec.onstart = () => setState("listening");
      rec.onresult = (e: any) => {
        let final = "";
        for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) final += e.results[i][0].transcript;
        finalRef.current = final;
      };
      rec.onerror = (e: any) => {
        stopWaveform();
        setState("error");
        const msg = e?.error === "not-allowed"
          ? "Microphone access was denied. Allow microphone access in your browser's site settings."
          : "Voice input error: " + (e?.error || "unknown") + ".";
        showToast?.(msg, "error");
        setTimeout(() => setState("idle"), 2000);
      };
      rec.onend = () => {
        stopWaveform();
        if (finalRef.current.trim()) onTranscript(finalRef.current.trim());
        setState("idle");
      };
      try { rec.start(); } catch {
        stopWaveform(); setState("error");
        showToast?.("Could not start voice input.", "error");
        setTimeout(() => setState("idle"), 2000);
      }
    }).catch(() => {
      setState("error");
      showToast?.("Microphone access was denied. Allow microphone access in your browser's site settings.", "error");
      setTimeout(() => setState("idle"), 2000);
    });
  }, [state, SR, lang, onTranscript, showToast, stop]);

  if (state === "listening") {
    return (
      <div style={{
        display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0,
        background:"rgba(255,255,255,0.03)", border:"1px solid "+color+"55",
        borderRadius:999, padding:"6px 8px 6px 6px", height:size,
      }}>
        <button onClick={cancel} title="Cancel — discard"
          style={{ width:size-10, height:size-10, borderRadius:"50%", border:"none", background:"transparent",
            color:"#8A93A8", cursor:"pointer", fontSize:15, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {"\u2715"}
        </button>
        <div style={{ display:"flex", alignItems:"center", gap:2, flex:1, height:size-14, minWidth:0, overflow:"hidden" }}>
          {levels.map((h,i) => (
            <div key={i} style={{ width:3, minWidth:3, height:Math.max(3,h*(size-18)),
              background:color, borderRadius:2, opacity:0.55+h*0.45, transition:"height 70ms ease", flexShrink:0 }} />
          ))}
        </div>
        <button onClick={stop} title="Stop and use this text"
          style={{ width:size-8, height:size-8, borderRadius:"50%", border:"none", background:"#EF4444",
            color:"#fff", cursor:"pointer", fontSize:11, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {"\u25A0"}
        </button>
      </div>
    );
  }

  if (state === "permission") {
    return (
      <div style={{ width:size, height:size, borderRadius:"50%", border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.03)",
        color:"#8A93A8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0 }}
        title="Requesting microphone access…">
        {"\u2026"}
      </div>
    );
  }

  return (
    <button onClick={start} title={SR ? "Voice input — free, no API key needed" : "Voice not supported in this browser"}
      style={{ width:size, height:size, borderRadius:"50%", border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.03)",
        color: state === "error" ? "#EF4444" : "#8A93A8", cursor: SR ? "pointer" : "not-allowed", fontSize:15, flexShrink:0,
        display:"flex", alignItems:"center", justifyContent:"center", opacity: SR ? 1 : 0.4 }}>
      {"\uD83C\uDF99\uFE0F"}
    </button>
  );
}
