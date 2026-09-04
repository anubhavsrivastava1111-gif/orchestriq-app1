// src/lib/AIModels.ts
// ─────────────────────────────────────────────────────────────────────────────
// WHICH MODELS EXIST, AND WHAT EACH ONE CAN DO.
//
// Providers.ts already says which PROVIDERS exist and what they can do.
// This adds the layer below it: the actual MODELS, because a user choosing
// "OpenAI" still has to choose between a fast cheap model and a slow strong one,
// and those two have different capabilities.
//
// Kept separate from Providers.ts deliberately. Model lists change every few
// months — providers retire and rename them, which is exactly what caused your
// NVIDIA 404. When that happens the fix belongs in ONE small file, not spread
// through a 9,800-line component.
//
// Adding a provider or a model is an entry here. Nothing else changes.
// ─────────────────────────────────────────────────────────────────────────────

export type Cap = "text" | "vision" | "image" | "websearch" | "code" | "long";

export interface ModelSpec {
  id: string;            // the exact string sent to the provider
  label: string;         // what the user sees
  note: string;          // one line: when to pick this one
  caps: Cap[];
  ctx: string;           // context window, in plain words
  tier: "fast" | "balanced" | "strong";
}

export const MODELS_BY_PROVIDER: Record<string, ModelSpec[]> = {
  claude: [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", note: "Best all-round choice. Strong reasoning, fast enough for conversation.",
      caps: ["text","vision","websearch","code","long"], ctx: "very long", tier: "balanced" },
    { id: "claude-opus-4-1", label: "Claude Opus 4.1", note: "Deepest reasoning. Slower and dearer — use for hard analysis.",
      caps: ["text","vision","websearch","code","long"], ctx: "very long", tier: "strong" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Quick and cheap. Good for drafting and short questions.",
      caps: ["text","vision","long"], ctx: "long", tier: "fast" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o", note: "Fast, multimodal, reliable. A sensible default.",
      caps: ["text","vision","websearch"], ctx: "long", tier: "balanced" },
    { id: "gpt-4o-mini", label: "GPT-4o mini", note: "Cheapest here. Fine for simple questions.",
      caps: ["text","vision"], ctx: "long", tier: "fast" },
  ],
  gemini: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", note: "Very fast, generous free tier, reads images.",
      caps: ["text","vision","websearch","long"], ctx: "very long", tier: "fast" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", note: "Handles very large documents in one go.",
      caps: ["text","vision","websearch","long"], ctx: "very long", tier: "strong" },
  ],
  nvidia: [
    { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B", note: "Stable and dependable. The safest NVIDIA choice.",
      caps: ["text"], ctx: "long", tier: "balanced" },
    { id: "deepseek-ai/deepseek-r1", label: "DeepSeek R1", note: "Thinks before answering. Slower — good for hard problems.",
      caps: ["text"], ctx: "long", tier: "strong" },
    { id: "qwen/qwen2.5-72b-instruct", label: "Qwen 2.5 72B", note: "Strong at code and multilingual work.",
      caps: ["text","code"], ctx: "long", tier: "balanced" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek Chat", note: "Very low cost. Solid general reasoning.",
      caps: ["text","code"], ctx: "long", tier: "balanced" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", note: "Extremely fast. Free tier caps you at ~8,000 tokens a minute, so avoid long documents.",
      caps: ["text"], ctx: "short", tier: "fast" },
  ],
  kimi: [
    { id: "moonshot-v1-32k", label: "Kimi 32K", note: "Low cost, long context.",
      caps: ["text","long"], ctx: "long", tier: "balanced" },
  ],
  // Image providers. No conversation — one prompt, one picture.
  fal: [
    { id: "fal-ai/flux-pro", label: "FLUX Pro", note: "Best general image quality.", caps: ["image"], ctx: "-", tier: "strong" },
    { id: "fal-ai/flux/schnell", label: "FLUX Schnell", note: "Fast and cheap. Good for drafts.", caps: ["image"], ctx: "-", tier: "fast" },
    { id: "fal-ai/ideogram/v3", label: "Ideogram v3", note: "Best when the picture must contain readable text.", caps: ["image"], ctx: "-", tier: "balanced" },
  ],
  stability: [
    { id: "sd3-large", label: "Stable Diffusion 3", note: "Reliable, low cost per image.", caps: ["image"], ctx: "-", tier: "balanced" },
  ],
};

export const modelsFor = (provider: string): ModelSpec[] =>
  MODELS_BY_PROVIDER[provider] || [];

export const findModel = (provider: string, id: string): ModelSpec | undefined =>
  modelsFor(provider).find(m => m.id === id);

export const defaultModel = (provider: string): string =>
  (modelsFor(provider).find(m => m.tier === "balanced") || modelsFor(provider)[0])?.id || "";

export const modelCan = (provider: string, id: string, cap: Cap): boolean =>
  !!findModel(provider, id)?.caps.includes(cap);

/**
 * WHAT CARRIES OVER WHEN THE USER SWITCHES MODEL MID-CONVERSATION.
 *
 * Your document was right to insist this be explicit. Silently handing a
 * 40-message history to a model with a short context window produces either a
 * refusal or — worse — a confident answer based on a truncated conversation the
 * user believes was read in full.
 */
export function switchNotice(fromP: string, fromM: string, toP: string, toM: string, msgCount: number): string {
  const to = findModel(toP, toM);
  if (!to) return "";
  const long = to.caps.includes("long") || to.ctx === "very long";
  if (to.ctx === "short" && msgCount > 8) {
    return `${to.label} has a short working memory. It will receive only the last 8 messages, not all ${msgCount}.`;
  }
  if (!long && msgCount > 20) {
    return `${to.label} will receive the last 20 messages of this conversation, not all ${msgCount}.`;
  }
  return `${to.label} receives the full conversation so far (${msgCount} messages).`;
}

/** How many past messages to actually send, given the target model. */
export function historyLimit(provider: string, id: string): number {
  const m = findModel(provider, id);
  if (!m) return 20;
  if (m.ctx === "short") return 8;
  if (m.ctx === "very long") return 100;
  return 30;
}

export default { MODELS_BY_PROVIDER, modelsFor, findModel, defaultModel,
                 modelCan, switchNotice, historyLimit };
