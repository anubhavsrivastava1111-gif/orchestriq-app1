// ProviderManager.ts
// Handles auto-failover between Groq and Gemini, pause-and-retry on exhaustion,
// and workflow resume from last completed level.

export interface ProviderState {
  groqExhausted: boolean;
  geminiExhausted: boolean;
  exhaustedAt: number | null;
}

const RETRY_AFTER_MS = 60000;
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

  // 1. User's own configured key for their chosen provider — highest priority
  const userHasPreferred = !!keys?.[preferredProvider]?.trim();
  const preferredExhausted = preferredProvider === "groq" ? state.groqExhausted
    : preferredProvider === "gemini" ? state.geminiExhausted : false;
  if (userHasPreferred && !preferredExhausted) return preferredProvider;

  // 2. Platform-managed Groq/Gemini as universal fallback
  const hasGroq = !!(keys?.groq?.trim() || effGroq?.trim());
  const hasGemini = !!(keys?.gemini?.trim() || effGemini?.trim());

  if (hasGroq && !state.groqExhausted) return "groq";
  if (hasGemini && !state.geminiExhausted) return "gemini";

  // 3. Any other user key (claude/openai) not yet tried
  const otherKeys = Object.keys(keys || {}).filter(
    p => p !== "groq" && p !== "gemini" && keys[p]?.trim()
  );
  if (otherKeys.length) return otherKeys[0];

  // 4. Exhausted platform keys as last resort
  if (hasGroq) return "groq";
  if (hasGemini) return "gemini";

  return preferredProvider || "groq";
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
