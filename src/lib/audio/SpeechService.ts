// SpeechService — provider-agnostic TTS interface + the default browser
// (Web Speech API) implementation. Future providers (ElevenLabs, OpenAI,
// executive-specific voices) implement ISpeechProvider and drop in with no
// changes to any module.

export interface SpeechChunkHandle {
  cancel(): void;
}

export interface SpeechProviderCallbacks {
  onBoundary?: (charIndex: number, charLength: number) => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
  onStart?: () => void;
}

export interface SpeakOptions {
  rate?: number;      // 0.5 – 2.0
  voiceURI?: string;  // provider-specific voice id
  lang?: string;
}

export interface VoiceInfo {
  id: string;         // stable identifier (voiceURI)
  name: string;
  lang: string;
  isDefault?: boolean;
}

export interface ISpeechProvider {
  readonly id: string;
  readonly supportsBoundary: boolean;
  isAvailable(): boolean;
  getVoices(): Promise<VoiceInfo[]>;
  speak(text: string, opts: SpeakOptions, cb: SpeechProviderCallbacks): SpeechChunkHandle;
  stop(): void;
}

// ── Web Speech API provider (default, free, offline) ──
export class WebSpeechProvider implements ISpeechProvider {
  readonly id = "web-speech";
  readonly supportsBoundary = true;
  private synth: SpeechSynthesis | null =
    typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

  isAvailable(): boolean {
    return !!this.synth && typeof SpeechSynthesisUtterance !== "undefined";
  }

  getVoices(): Promise<VoiceInfo[]> {
    return new Promise((resolve) => {
      if (!this.synth) return resolve([]);
      const map = (vs: SpeechSynthesisVoice[]): VoiceInfo[] =>
        vs.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, isDefault: v.default }));
      const existing = this.synth.getVoices();
      if (existing.length) return resolve(map(existing));
      // Voices load async in some browsers
      const handler = () => {
        resolve(map(this.synth!.getVoices()));
        this.synth!.removeEventListener("voiceschanged", handler);
      };
      this.synth.addEventListener("voiceschanged", handler);
      // Fallback timeout so we never hang
      setTimeout(() => resolve(map(this.synth!.getVoices())), 1200);
    });
  }

  speak(text: string, opts: SpeakOptions, cb: SpeechProviderCallbacks): SpeechChunkHandle {
    if (!this.synth) {
      cb.onError?.("Speech engine not available in this browser.");
      return { cancel() {} };
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Math.min(2, Math.max(0.5, opts.rate ?? 1));
    if (opts.lang) u.lang = opts.lang;
    if (opts.voiceURI) {
      const v = this.synth.getVoices().find((x) => x.voiceURI === opts.voiceURI);
      if (v) u.voice = v;
    }
    u.onstart = () => cb.onStart?.();
    u.onboundary = (e) => cb.onBoundary?.(e.charIndex, (e as any).charLength ?? 0);
    u.onend = () => cb.onEnd?.();
    u.onerror = (e) => {
      // 'interrupted'/'canceled' are normal on stop — don't surface as errors
      const err = (e as any).error || "";
      if (err === "interrupted" || err === "canceled") { cb.onEnd?.(); return; }
      cb.onError?.("Speech error: " + (err || "unknown"));
    };
    this.synth.speak(u);
    return { cancel: () => { try { this.synth!.cancel(); } catch {} } };
  }

  stop(): void {
    try { this.synth?.cancel(); } catch {}
  }
}
