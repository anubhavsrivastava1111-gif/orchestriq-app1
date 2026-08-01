// ReadAloudEngine — the single platform-wide narration controller.
// Only ONE narration plays at a time; starting a new one stops the previous.
// Modules never touch this directly — they use the useReadAloud() hook.

import { ISpeechProvider, WebSpeechProvider, SpeakOptions } from "./SpeechService";
import { chunkText, estimateSeconds, TextChunk } from "./AudioQueue";
import { VoiceManager } from "./VoiceManager";

export type PlaybackState = "idle" | "playing" | "paused";

export interface EngineStatus {
  state: PlaybackState;
  sessionId: string | null;
  charTotal: number;
  charSpoken: number;       // approx chars spoken so far (for progress)
  currentSentence: [number, number] | null; // [start,end] in full text
  etaSeconds: number;
  error: string | null;
}

type Listener = (s: EngineStatus) => void;

const SKIP_CHARS = 220; // ~ one chunk ≈ 10–15s of speech

class Engine {
  private provider: ISpeechProvider = new WebSpeechProvider();
  voices: VoiceManager = new VoiceManager(this.provider);
  private listeners = new Set<Listener>();

  private sessionId: string | null = null;
  private chunks: TextChunk[] = [];
  private idx = 0;
  private state: PlaybackState = "idle";
  private handle: { cancel(): void } | null = null;
  private rate = 1;
  private voiceURI = "";
  private charTotal = 0;
  private error: string | null = null;
  private curSentence: [number, number] | null = null;

  isAvailable() { return this.provider.isAvailable(); }
  async init() { await this.voices.loadVoices(); }

  subscribe(l: Listener) { this.listeners.add(l); l(this.snapshot()); return () => this.listeners.delete(l); }
  private emit() { const s = this.snapshot(); this.listeners.forEach((l) => l(s)); }

  private snapshot(): EngineStatus {
    const spoken = this.chunks.slice(0, this.idx).reduce((a, c) => a + c.text.length, 0);
    const remainingChars = Math.max(0, this.charTotal - spoken);
    return {
      state: this.state,
      sessionId: this.sessionId,
      charTotal: this.charTotal,
      charSpoken: spoken,
      currentSentence: this.curSentence,
      etaSeconds: estimateSeconds(remainingChars, this.rate),
      error: this.error,
    };
  }

  start(text: string, sessionId: string, opts?: { rate?: number; voiceURI?: string }) {
    this.stop(); // one session at a time
    if (!this.provider.isAvailable()) {
      this.error = "Read Aloud isn't supported in this browser.";
      this.emit();
      return;
    }
    this.error = null;
    this.sessionId = sessionId;
    this.chunks = chunkText(text);
    this.charTotal = text.length;
    this.idx = 0;
    this.rate = opts?.rate ?? this.voices.getRate();
    this.voiceURI = opts?.voiceURI ?? this.voices.getPreferredVoiceURI();
    if (!this.chunks.length) { this.error = "Nothing to read."; this.emit(); return; }
    this.state = "playing";
    this.speakCurrent();
    this.emit();
  }

  private speakCurrent() {
    if (this.idx >= this.chunks.length) { this.finish(); return; }
    const chunk = this.chunks[this.idx];
    this.curSentence = [chunk.start, chunk.end];
    const so: SpeakOptions = { rate: this.rate, voiceURI: this.voiceURI };
    this.handle = this.provider.speak(chunk.text, so, {
      onEnd: () => {
        if (this.state !== "playing") return; // paused/stopped mid-chunk
        this.idx += 1;
        if (this.idx >= this.chunks.length) this.finish();
        else { this.speakCurrent(); this.emit(); }
      },
      onError: (err) => { this.error = err; this.finish(); },
    });
    this.emit();
  }

  private finish() {
    this.state = "idle";
    this.curSentence = null;
    this.handle = null;
    this.emit();
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    try { (window as any).speechSynthesis?.pause?.(); } catch {}
    this.emit();
  }
  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    try { (window as any).speechSynthesis?.resume?.(); } catch {}
    this.emit();
  }
  stop() {
    this.state = "idle";
    this.curSentence = null;
    try { this.provider.stop(); } catch {}
    this.handle = null;
    this.sessionId = null;
    this.chunks = [];
    this.idx = 0;
    this.charTotal = 0;
    this.emit();
  }
  restart() {
    if (!this.chunks.length) return;
    this.provider.stop();
    this.idx = 0;
    this.state = "playing";
    this.speakCurrent();
    this.emit();
  }
  skip(seconds: number) {
    if (!this.chunks.length) return;
    // approximate: move whole chunks based on ~SKIP_CHARS per 12s
    const chunksToMove = Math.max(1, Math.round((Math.abs(seconds) / 12)));
    this.provider.stop();
    this.idx = Math.min(this.chunks.length, Math.max(0, this.idx + Math.sign(seconds) * chunksToMove));
    if (this.idx >= this.chunks.length) { this.finish(); return; }
    this.state = "playing";
    this.speakCurrent();
    this.emit();
  }
  setRate(r: number) {
    this.rate = Math.min(2, Math.max(0.5, r));
    this.voices.setRate(this.rate);
    // apply mid-playback by restarting current chunk
    if (this.state === "playing") { this.provider.stop(); this.speakCurrent(); }
    this.emit();
  }
  setVoice(uri: string) {
    this.voiceURI = uri; this.voices.setPreferredVoiceURI(uri);
    if (this.state === "playing") { this.provider.stop(); this.speakCurrent(); }
    this.emit();
  }
}

// Singleton — shared across the whole app.
export const ReadAloud = new Engine();
