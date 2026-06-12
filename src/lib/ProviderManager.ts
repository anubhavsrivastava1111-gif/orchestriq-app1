// ProviderManager.ts
// Handles auto-failover between Groq and Gemini, pause-and-retry on exhaustion,
// and workflow resume from last completed level.

export interface ProviderState {
  groqExhausted: boolean;
  geminiExhausted: boolean;
  exhaustedAt: number | null;
}

const RETRY_AFTER_MS = 60000; // 1 minute cooldown before retrying exhausted provider
const RESUME_KEY = "oiq-wf-resume";

const state: ProviderState = {
  groqExhausted: false,
  geminiExhausted: false,
  exhaustedAt: null,
};

// ─── PROVIDER FAILOVER ───────────────────────────────────────────────────────

export function markProviderExhausted(provider: string): void {
  if (provider === "groq") state.groqExhausted = true;
  if (provider === "gemini") state.geminiExhausted = true;
  state.exhaustedAt = Date.now();
  console.warn(`[ProviderManager] ${provider} exhausted. Failover active.`);
}

export function resetProviderIfCooled(): void {
  if (!state.exhaustedAt) return;
  if (Date.now() - state.exhaustedAt > RETRY_AFTER_MS) {
    state.groqExhausted = false;
    state.geminiExhausted = false;
    state.exhaustedAt = null;
    console.info("[ProviderManager] Cooldown complete. Both providers reset.");
  }
}

export function areBothExhausted(): boolean {
  resetProviderIfCooled();
  return state.groqExhausted && state.geminiExhausted;
}

export function getActiveProvider(
  preferredProvider: string,
  keys: Record<string, string>,
  effGroq: string,
  effGemini: string
): string {
  resetProviderIfCooled();

  const hasGroq = !!(keys.groq?.trim() || effGroq);
  const hasGemini = !!(keys.gemini?.trim() || effGemini);

  // If preferred is not exhausted and available, use it
  if (preferredProvider === "groq" && hasGroq && !state.groqExhausted) return "groq";
  if (preferredProvider === "gemini" && hasGemini && !state.geminiExhausted) return "gemini";

  // Failover logic
  if (preferredProvider === "groq" && state.groqExhausted && hasGemini && !state.geminiExhausted) {
    console.info("[ProviderManager] Groq exhausted → switching to Gemini silently.");
    return "gemini";
  }
  if (preferredProvider === "gemini" && state.geminiExhausted && hasGroq && !state.groqExhausted) {
    console.info("[ProviderManager] Gemini exhausted → switching to Groq silently.");
    return "groq";
  }

  // Non-groq/gemini providers — return as-is
  return preferredProvider;
}

export function isRateLimit(errorMessage: string): boolean {
  const msg = (errorMessage || "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("quota exceeded") ||
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("free quota exceeded") ||
    msg.includes("wait a moment")
  );
}

// ─── PAUSE AND RETRY ─────────────────────────────────────────────────────────

export async function waitWithCountdown(
  seconds: number,
  onTick: (remaining: number) => void
): Promise<void> {
  for (let i = seconds; i > 0; i--) {
    onTick(i);
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ─── WORKFLOW RESUME ─────────────────────────────────────────────────────────

export interface ResumeState {
  workflowId: string | number;
  task: string;
  category: string;
  chainLabel: string;
  completedLevels: number;
  steps: any[];
  savedAt: string;
}

export function saveResumeState(data: ResumeState): void {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify(data));
  } catch {}
}

export function loadResumeState(): ResumeState | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResumeState;
  } catch {
    return null;
  }
}

export function clearResumeState(): void {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {}
}
