// ═══════════════════════════════════════════════════════════════════════════
// VoiceEngine.tsx — OrchestrIQ Voice UX
// ─────────────────────────────────────────────────────────────────────────
// Self-contained voice interaction component.
// No App.tsx logic changes. Passes output via onTranscript + onFinalAnswer.
//
// WIRING (two lines in App.tsx):
//   import VoiceEngine from "./VoiceEngine";
//   <VoiceEngine send={send} setInput={setInput} lang={vLang}
//                roleColor={curRole?.dc||"#14B8A6"} disabled={loading}/>
//
// STATES: idle → listening → transcribing → thinking → responding → interrupted
// STACK:  Web Speech API (STT) + Web Audio API (waveform) + SpeechSynthesis (TTS)
// TTS:    Falls back to ElevenLabs if VITE_ELEVENLABS_KEY is set in Cloudflare.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from "react";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type VoiceState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "responding"
  | "interrupted";

interface VoiceEngineProps {
  send: (text: string) => Promise<void>;   // App.tsx send() callback
  setInput: (v: string) => void;           // populates the visible textarea
  lang?: string;                           // voice language, default en-IN
  roleColor?: string;                      // accent colour from current executive
  disabled?: boolean;                      // true while chat is loading
  elevenlabsKey?: string;                  // optional — loaded from env
  voiceId?: string;                        // ElevenLabs voice ID (optional)
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SILENCE_THRESHOLD_MS = 1400;   // ms of silence before auto-submit
const VAD_RMS_THRESHOLD    = 0.012;  // RMS energy threshold for voice activity
const WAVEFORM_BARS        = 28;     // number of bars in animated waveform
const EL_MODEL             = "eleven_turbo_v2_5"; // lowest-latency ElevenLabs model
const EL_VOICE_DEFAULT     = "EXAVITQu4vr4xnSDxMaL"; // "Bella" — warm, professional

// ─── STATE LABELS & COLOURS ───────────────────────────────────────────────────
const STATE_META: Record<VoiceState, { label: string; hint: string }> = {
  idle:          { label: "Voice",       hint: "Click to speak" },
  listening:     { label: "Listening",   hint: "Speak now — click to cancel" },
  transcribing:  { label: "Processing",  hint: "Transcribing your message…" },
  thinking:      { label: "Thinking",    hint: "AI is reasoning…" },
  responding:    { label: "Speaking",    hint: "Tap to interrupt" },
  interrupted:   { label: "Interrupted", hint: "Restarting…" },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Read RMS energy from AnalyserNode — used for VAD */
function getRMS(analyser: AnalyserNode): number {
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/** Extract per-bar heights from frequency data for the waveform display */
function getFreqBars(analyser: AnalyserNode, count: number): number[] {
  const buf = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(buf);
  const step = Math.floor(buf.length / count);
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += buf[i * step + j];
    bars.push(sum / step / 255);
  }
  return bars;
}

// ─── WAVEFORM COMPONENT ───────────────────────────────────────────────────────
function Waveform({
  bars,
  color,
  active,
  mirror,
}: {
  bars: number[];
  color: string;
  active: boolean;
  mirror: boolean;
}) {
  // Mirror mode (responding) uses sine-based animation when no analyser
  const displayBars = active
    ? bars
    : bars.map((_, i) =>
        mirror
          ? 0.25 + 0.22 * Math.sin(Date.now() / 280 + i * 0.55)
          : 0.08 + 0.04 * Math.sin(Date.now() / 600 + i * 0.8)
      );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        height: 28,
        padding: "0 4px",
      }}
    >
      {displayBars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: Math.max(3, h * 26),
            background: color,
            borderRadius: 2,
            opacity: active ? 0.85 + h * 0.15 : 0.5,
            transition: active ? "height 60ms ease" : "height 200ms ease",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

// ─── THINKING DOTS ───────────────────────────────────────────────────────────
function ThinkingDots({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "0 6px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: color,
            animation: `veDot 1.1s ease-in-out ${i * 0.18}s infinite`,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

// ─── TRANSCRIPT BUBBLE ───────────────────────────────────────────────────────
function TranscriptBubble({
  text,
  state,
  color,
}: {
  text: string;
  state: VoiceState;
  color: string;
}) {
  if (!text || state === "idle") return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 10px)",
        left: 0,
        right: 0,
        background: "var(--panel,#131825)",
        border: `1px solid ${color}44`,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--text,#F1F5F9)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
        animation: "veFade 0.2s ease",
        zIndex: 50,
        maxHeight: 120,
        overflowY: "auto",
        wordBreak: "break-word",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: color,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: 5,
        }}
      >
        {state === "responding" ? "AI Response" : "You said"}
      </div>
      {text}
      {(state === "listening" || state === "transcribing") && (
        <span
          style={{
            display: "inline-block",
            width: 2,
            height: 13,
            background: color,
            marginLeft: 3,
            animation: "veCursor 0.8s step-end infinite",
            verticalAlign: "middle",
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function VoiceEngine({
  send,
  setInput,
  lang = "en-IN",
  roleColor = "#14B8A6",
  disabled = false,
  elevenlabsKey,
  voiceId = EL_VOICE_DEFAULT,
}: VoiceEngineProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript]   = useState("");
  const [aiText, setAiText]           = useState("");
  const [bars, setBars]               = useState<number[]>(Array(WAVEFORM_BARS).fill(0.08));
  const [error, setError]             = useState("");
  const [expanded, setExpanded]       = useState(false);

  // ElevenLabs key — prop takes priority, then Cloudflare env
  const elKey = elevenlabsKey || (import.meta as any).env?.VITE_ELEVENLABS_KEY || "";

  // ── Refs ───────────────────────────────────────────────────────────────────
  const recognitionRef   = useRef<any>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const silenceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef           = useRef<number>(0);
  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const cancelledRef     = useRef(false);
  const isMirrorRef      = useRef(false); // true during responding state

  // ── Web Audio setup ────────────────────────────────────────────────────────
  const startAudioAnalysis = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Waveform animation loop
      const tick = () => {
        if (!analyserRef.current) return;
        setBars(getFreqBars(analyserRef.current, WAVEFORM_BARS));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError("Microphone access denied. Allow mic in browser settings.");
    }
  }, []);

  const stopAudioAnalysis = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    analyserRef.current = null;
    audioCtxRef.current = null;
    streamRef.current   = null;
    setBars(Array(WAVEFORM_BARS).fill(0.08));
  }, []);

  // ── VAD silence timer ──────────────────────────────────────────────────────
  const resetSilenceTimer = useCallback(
    (onSilence: () => void) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(onSilence, SILENCE_THRESHOLD_MS);
    },
    []
  );

  // ── Speech Recognition (Web Speech API) ───────────────────────────────────
  const startListening = useCallback(async () => {
    if (disabled) return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Voice input requires Chrome or Edge.");
      return;
    }

    setError("");
    cancelledRef.current = false;
    setTranscript("");
    setAiText("");
    setVoiceState("listening");
    await startAudioAnalysis();

    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;

    let finalText = "";

    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalText += t + " ";
        } else {
          interim = t;
        }
      }
      const display = (finalText + interim).trim();
      setTranscript(display);
      setInput(display);

      // VAD: reset silence timer on speech activity
      if (display) {
        setVoiceState("listening");
        resetSilenceTimer(() => {
          if (!cancelledRef.current) submitTranscript(finalText.trim() || display);
        });
      }
    };

    rec.onerror = (e: any) => {
      if (e.error === "not-allowed") {
        setError("Microphone access denied.");
      } else if (e.error !== "aborted" && e.error !== "no-speech") {
        setError("Voice error: " + e.error);
      }
      stopAll();
    };

    rec.onend = () => {
      if (!cancelledRef.current && finalText.trim()) {
        submitTranscript(finalText.trim());
      } else if (!cancelledRef.current) {
        stopAll();
      }
    };

    try {
      rec.start();
    } catch {
      setError("Could not start voice input.");
      stopAll();
    }
  }, [disabled, lang, startAudioAnalysis, resetSilenceTimer]);

  // ── Submit transcript to AI ────────────────────────────────────────────────
  const submitTranscript = useCallback(
    async (text: string) => {
      if (!text || cancelledRef.current) return;
      recognitionRef.current?.stop();
      stopAudioAnalysis();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      setVoiceState("transcribing");
      setTranscript(text);
      setInput(text);

      // Brief pause so user sees "transcribing" state
      await new Promise((r) => setTimeout(r, 300));
      if (cancelledRef.current) return;

      setVoiceState("thinking");

      try {
        // We hook into the existing send() function
        // To capture the AI reply for TTS, we patch through a Promise race
        await send(text);

        // After send() resolves, the chat state has the new message.
        // We read the AI reply from the DOM as a simple text scrape.
        // This avoids needing to modify App.tsx to return the response.
        // For TTS, we use a brief delay to let React render, then read.
        if (!cancelledRef.current) {
          await new Promise((r) => setTimeout(r, 200));
          const aiReply = readLastAIMessage();
          if (aiReply) {
            await speakText(aiReply);
          }
        }
      } catch (err: any) {
        setError("Error: " + err.message);
      } finally {
        if (!cancelledRef.current) {
          setVoiceState("idle");
          setTranscript("");
          setAiText("");
        }
      }
    },
    [stopAudioAnalysis, send]
  );

  // ── Read last AI message from DOM ─────────────────────────────────────────
  // Reads the last assistant message rendered in the chat area.
  // This is the zero-App.tsx-change approach — no prop threading needed.
  const readLastAIMessage = (): string => {
    // Chat messages have mLbl div with role name followed by content
    const msgDivs = document.querySelectorAll<HTMLDivElement>(
      '[style*="aMsg"], [style*="background:#131825"][style*="border-radius"][style*="padding"]'
    );
    if (!msgDivs.length) return "";
    const last = msgDivs[msgDivs.length - 1];
    return (last.textContent || "").replace(/^Copy\s*/i, "").trim().slice(0, 2000);
  };

  // ── TTS: ElevenLabs or Web Speech API fallback ─────────────────────────────
  const speakText = useCallback(
    async (text: string) => {
      if (cancelledRef.current) return;
      setVoiceState("responding");
      setAiText(text);
      isMirrorRef.current = true;

      // Animate waveform during speech (mirror mode)
      const mirrorTick = () => {
        if (isMirrorRef.current) {
          const t = Date.now();
          setBars(
            Array(WAVEFORM_BARS)
              .fill(0)
              .map((_, i) =>
                0.2 + 0.3 * Math.abs(Math.sin(t / 300 + i * 0.45)) +
                0.15 * Math.abs(Math.sin(t / 180 + i * 0.9))
              )
          );
          rafRef.current = requestAnimationFrame(mirrorTick);
        }
      };
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(mirrorTick);

      // Sanitise text for speech — strip markdown symbols
      const clean = text
        .replace(/#{1,6}\s+/g, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .replace(/\|/g, " ")
        .replace(/---+/g, "")
        .replace(/\n{2,}/g, ". ")
        .replace(/\n/g, " ")
        .trim()
        .slice(0, 1500); // Cap at 1500 chars for TTS

      if (elKey) {
        await speakElevenLabs(clean);
      } else {
        await speakNative(clean);
      }

      isMirrorRef.current = false;
      cancelAnimationFrame(rafRef.current);
      setBars(Array(WAVEFORM_BARS).fill(0.08));

      if (!cancelledRef.current) {
        setVoiceState("idle");
        setAiText("");
      }
    },
    [elKey]
  );

  // ── ElevenLabs TTS ───────────────────────────────────────────────────────
  const speakElevenLabs = useCallback(
    async (text: string) => {
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "xi-api-key": elKey,
            },
            body: JSON.stringify({
              text,
              model_id: EL_MODEL,
              voice_settings: {
                stability: 0.45,
                similarity_boost: 0.82,
                style: 0.3,
                use_speaker_boost: true,
              },
            }),
          }
        );

        if (!res.ok) throw new Error("ElevenLabs error " + res.status);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("Audio playback error"));
          audio.play().catch(reject);
        });

        URL.revokeObjectURL(url);
      } catch (err: any) {
        // Fall back to native TTS if ElevenLabs fails
        console.warn("[VoiceEngine] ElevenLabs failed, using native TTS:", err.message);
        await speakNative(text);
      }
    },
    [elKey, voiceId]
  );

  // ── Native Web Speech TTS ─────────────────────────────────────────────────
  const speakNative = useCallback(async (text: string) => {
    return new Promise<void>((resolve) => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = 1.05;
      utter.pitch = 1.0;

      // Pick a natural-sounding voice if available
      const voices = speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith(lang.split("-")[0]) &&
          (v.name.includes("Neural") ||
            v.name.includes("Natural") ||
            v.name.includes("Enhanced") ||
            v.name.includes("Google"))
      );
      if (preferred) utter.voice = preferred;

      utter.onend  = () => resolve();
      utter.onerror = () => resolve();
      speechSynthesis.speak(utter);
    });
  }, [lang]);

  // ── Interrupt ─────────────────────────────────────────────────────────────
  const interrupt = useCallback(() => {
    cancelledRef.current = true;
    isMirrorRef.current = false;

    // Stop ElevenLabs audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    // Stop native TTS
    speechSynthesis.cancel();

    setVoiceState("interrupted");
    setTimeout(() => {
      cancelledRef.current = false;
      setVoiceState("idle");
      setTranscript("");
      setAiText("");
      setBars(Array(WAVEFORM_BARS).fill(0.08));
    }, 400);
  }, []);

  // ── Stop everything ───────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    recognitionRef.current?.stop();
    stopAudioAnalysis();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    isMirrorRef.current = false;
    cancelledRef.current = true;
    cancelAnimationFrame(rafRef.current);
    setBars(Array(WAVEFORM_BARS).fill(0.08));
    setVoiceState("idle");
    setTranscript("");
    setAiText("");
    setExpanded(false);
  }, [stopAudioAnalysis]);

  // ── Main button click ──────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (disabled) return;

    switch (voiceState) {
      case "idle":
        setExpanded(true);
        startListening();
        break;
      case "listening":
        stopAll();
        break;
      case "responding":
        interrupt();
        break;
      case "thinking":
      case "transcribing":
        // Cancel pending operation
        cancelledRef.current = true;
        stopAll();
        break;
      default:
        stopAll();
    }
  }, [voiceState, disabled, startListening, stopAll, interrupt]);

  // ── Keyboard shortcut: hold Space to speak ────────────────────────────────
  useEffect(() => {
    let held = false;
    const onKey = (e: KeyboardEvent) => {
      // Only when not typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space" && !held && voiceState === "idle" && !disabled) {
        held = true;
        setExpanded(true);
        startListening();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && held) {
        held = false;
        if (voiceState === "listening") {
          // Let VAD or manual stop handle it
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [voiceState, disabled, startListening]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => stopAll(), [stopAll]);

  // ── Derived values ────────────────────────────────────────────────────────
  const meta     = STATE_META[voiceState];
  const isActive = voiceState !== "idle";
  const displayText = voiceState === "responding" ? aiText : transcript;

  // Button ring colour per state
  const ringColor: Record<VoiceState, string> = {
    idle:         "#3A4060",
    listening:    roleColor,
    transcribing: roleColor,
    thinking:     "#F59E0B",
    responding:   "#8B5CF6",
    interrupted:  "#EF4444",
  };
  const color = ringColor[voiceState];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── CSS animations ── */}
      <style>{`
        @keyframes veDot {
          0%,60%,100%{transform:translateY(0);opacity:.4}
          30%{transform:translateY(-5px);opacity:1}
        }
        @keyframes veFade {
          from{opacity:0;transform:translateY(4px)}
          to{opacity:1;transform:translateY(0)}
        }
        @keyframes veCursor {
          0%,100%{opacity:1} 50%{opacity:0}
        }
        @keyframes vePulse {
          0%,100%{transform:scale(1);opacity:1}
          50%{transform:scale(1.08);opacity:0.7}
        }
        @keyframes veRing {
          0%{box-shadow:0 0 0 0 ${roleColor}66}
          70%{box-shadow:0 0 0 10px ${roleColor}00}
          100%{box-shadow:0 0 0 0 ${roleColor}00}
        }
        .ve-btn { transition: all 0.18s ease !important; }
        .ve-btn:hover { filter: brightness(1.1); }
      `}</style>

      {/* ── Wrapper ── */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>

        {/* ── Transcript / AI text bubble ── */}
        {expanded && (
          <TranscriptBubble text={displayText} state={voiceState} color={color} />
        )}

        {/* ── Expanded voice panel (waveform + state label) ── */}
        {expanded && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--panel,#131825)",
              border: `1px solid ${color}44`,
              borderRadius: 10,
              padding: "4px 12px 4px 8px",
              animation: "veFade 0.2s ease",
              minWidth: 160,
            }}
          >
            {/* Waveform or dots */}
            {voiceState === "thinking" ? (
              <ThinkingDots color={color} />
            ) : (
              <Waveform
                bars={bars}
                color={color}
                active={voiceState === "listening"}
                mirror={voiceState === "responding"}
              />
            )}

            {/* State label */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: color,
                  whiteSpace: "nowrap",
                  animation: isActive ? "none" : undefined,
                }}
              >
                {meta.label}
              </div>
              <div style={{ fontSize: 9, color: "var(--muted,#5A6480)", whiteSpace: "nowrap" }}>
                {meta.hint}
              </div>
            </div>

            {/* Cancel / close button when active */}
            {isActive && (
              <button
                onClick={voiceState === "responding" ? interrupt : stopAll}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted,#5A6480)",
                  fontSize: 14,
                  cursor: "pointer",
                  padding: "2px 0",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
                title="Cancel"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* ── Main mic button ── */}
        <button
          className="ve-btn"
          onClick={handleClick}
          disabled={disabled}
          title={meta.hint}
          aria-label={meta.label + ": " + meta.hint}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: `2px solid ${isActive ? color : "#1a2030"}`,
            background: isActive ? color + "15" : "none",
            cursor: disabled ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
            opacity: disabled ? 0.35 : 1,
            animation: voiceState === "listening"
              ? "veRing 1.5s ease-out infinite"
              : voiceState === "responding"
              ? "vePulse 2s ease-in-out infinite"
              : "none",
          }}
        >
          {voiceState === "idle"       && "🎤"}
          {voiceState === "listening"  && "🔴"}
          {voiceState === "transcribing" && "⏳"}
          {voiceState === "thinking"   && "🧠"}
          {voiceState === "responding" && "🔊"}
          {voiceState === "interrupted" && "⏹"}
        </button>
      </div>

      {/* ── Error toast ── */}
      {error && (
        <div
          style={{
            position: "fixed",
            bottom: 80,
            right: 20,
            background: "var(--panel,#131825)",
            border: "1px solid rgba(239,68,68,0.4)",
            borderLeft: "3px solid #EF4444",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            color: "#EF9999",
            zIndex: 200,
            maxWidth: 280,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            animation: "veFade 0.2s ease",
          }}
        >
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError("")}
            style={{ background: "none", border: "none", color: "#5A6480", fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
