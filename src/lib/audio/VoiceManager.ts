// VoiceManager — discovers available voices and persists user preferences
// (voice, speed, auto-read) across sessions via WorkspaceMemory.

import { ISpeechProvider, VoiceInfo } from "./SpeechService";
import { WorkspaceMemory } from "../WorkspaceMemory";

const K_VOICE = "oiq-tts-voice";
const K_RATE = "oiq-tts-rate";
const K_AUTO = "oiq-tts-auto";

export const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export class VoiceManager {
  private voices: VoiceInfo[] = [];
  constructor(private provider: ISpeechProvider) {}

  async loadVoices(): Promise<VoiceInfo[]> {
    try { this.voices = await this.provider.getVoices(); } catch { this.voices = []; }
    return this.voices;
  }
  getVoices(): VoiceInfo[] { return this.voices; }

  getPreferredVoiceURI(): string {
    try {
      const saved = WorkspaceMemory.get<string>(K_VOICE);
      if (saved && this.voices.some((v) => v.id === saved)) return saved;
    } catch {}
    // Prefer an English default, else first available
    const en = this.voices.find((v) => v.isDefault && /^en/i.test(v.lang))
      || this.voices.find((v) => /^en/i.test(v.lang))
      || this.voices[0];
    return en?.id || "";
  }
  setPreferredVoiceURI(id: string) { try { WorkspaceMemory.set(K_VOICE, id); } catch {} }

  getRate(): number {
    try { const r = WorkspaceMemory.get<number>(K_RATE); if (typeof r === "number") return r; } catch {}
    return 1.0;
  }
  setRate(r: number) { try { WorkspaceMemory.set(K_RATE, r); } catch {} }

  getAutoRead(): boolean {
    try { return WorkspaceMemory.get<string>(K_AUTO) === "1"; } catch { return false; }
  }
  setAutoRead(on: boolean) { try { WorkspaceMemory.set(K_AUTO, on ? "1" : "0"); } catch {} }
}
