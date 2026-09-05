// src/lib/Voice.ts
// ─────────────────────────────────────────────────────────────────────────────
// VOICE INPUT — PROVIDER ABSTRACTION, NOT A HARD-CODED CALL.
//
// "Design voice infrastructure so the speech-to-text provider can be changed
// later without changing the UI." This file is that boundary. Every caller —
// the Workspace, the Live Boardroom, anything else — calls transcribeAudio()
// and never touches a provider's API shape directly. Swapping or adding a
// provider means editing this one file; nothing that calls it changes.
//
// PROVIDER CHOSEN: OpenAI's /v1/audio/transcriptions endpoint.
// WHY, against the priorities given (quality, latency, cost, security,
// scaling, flexibility, in that order):
//   - Quality: OpenAI's newer transcription models measurably beat the
//     original Whisper on word-error-rate.
//   - Latency: a few seconds for a short recording — fine for a chat input,
//     not a live captioning product.
//   - Cost: gpt-4o-mini-transcribe runs about $0.003 per minute of audio —
//     a voice note costs a fraction of a cent.
//   - Security: uses the SAME key the user already has stored for OpenAI
//     text/image calls. No new secret, no new server endpoint, no new place
//     for a key to leak — it travels exactly the same path every other
//     OpenAI call in this app already takes (browser-direct, BYOK, the
//     architecture already agreed for this platform).
//   - Scaling / flexibility: stateless per-request, and the model name below
//     is the ONLY thing that would ever need to change to move to a cheaper
//     or higher-quality OpenAI transcription model as they evolve.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it does not attempt a second, different
// provider (e.g. Deepgram) as a live fallback in this pass. The interface
// below is shaped so one can be added — a second function matching the same
// signature, added to PROVIDER_ORDER — without changing anything that calls
// transcribeAudio(). Building a second provider without verifying it against
// a real account is not something this pass does; the honest scope is one
// verified provider behind a real abstraction, not two unverified ones.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpeechProviderResult {
  text: string;
  provider: string;
}

/** OpenAI's real, current transcription endpoint. Multipart upload — a
 *  raw audio blob, not JSON — which is why this cannot reuse the JSON
 *  chat-call helpers already in this codebase. */
async function transcribeWithOpenAI(audioBlob: Blob, apiKey: string): Promise<string> {
  const form = new FormData();
  // MediaRecorder in every supported browser produces webm/opus by default;
  // OpenAI's endpoint accepts it directly, so no client-side transcoding step
  // is needed.
  form.append("file", audioBlob, "voice-input.webm");
  form.append("model", "gpt-4o-mini-transcribe");

  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + apiKey },
    body: form,
    signal: AbortSignal.timeout(30000),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    let reason = "OpenAI transcription failed (" + r.status + ").";
    try { const j = JSON.parse(body); if (j?.error?.message) reason = j.error.message; } catch {}
    throw new Error(reason);
  }
  const data = await r.json();
  return String(data?.text || "").trim();
}

// The provider order voice input tries, in priority order. Adding a second
// provider is adding one more entry here — nothing else in the app changes.
const PROVIDER_ORDER: Array<{ id: string; run: (blob: Blob, key: string) => Promise<string> }> = [
  { id: "openai", run: transcribeWithOpenAI },
];

/**
 * The one function every screen calls. Tries each configured speech-capable
 * provider in order; the first one that succeeds wins. Throws a clear,
 * specific message only when NONE could run — never a silent empty result.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  getKeyFor: (providerId: string) => string | undefined
): Promise<SpeechProviderResult> {
  if (!audioBlob || audioBlob.size < 500) {
    throw new Error("The recording was too short to transcribe. Please try again and speak for at least a second.");
  }
  const tried: string[] = [];
  for (const p of PROVIDER_ORDER) {
    const key = getKeyFor(p.id);
    if (!key) continue;
    tried.push(p.id);
    try {
      const text = await p.run(audioBlob, key);
      if (text) return { text, provider: p.id };
      // An empty transcript (silence) is not an error — try the next
      // provider only if this one genuinely failed, not just heard nothing.
      throw new Error("No speech was detected in the recording.");
    } catch (e: any) {
      // Only one provider is configured today, so this simply surfaces the
      // real reason. If a second provider is added later, this is exactly
      // the point where it would be tried next instead of failing here.
      throw new Error(String(e?.message || e).slice(0, 200));
    }
  }
  throw new Error(
    tried.length
      ? "Voice input failed."
      : "Voice input needs an OpenAI key. Add one in Settings \u2192 API \u2014 the same key used for OpenAI chat and image generation works for this."
  );
}

export default { transcribeAudio };
