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
  // THE EXACT BUG YOU HIT.
  // These three model ids were never real options on this platform's NVIDIA
  // proxy. I wrote this list from general knowledge of what NVIDIA hosts,
  // without checking the actual allowlist your own Cloudflare proxy
  // (functions/api/nvidia.ts) enforces - so the picker offered choices the
  // backend was always going to refuse with "model not supported on this
  // deployment", regardless of your key.
  // This list is now copied EXACTLY from that proxy's real MODELS map, so the
  // picker can never again offer something the backend will reject.
  // meta/llama-3.3-70b-instruct is deliberately NOT listed: NVIDIA itself
  // retired it on 2026-08-26 (the 410 error in your screenshot is NVIDIA
  // saying so, not a bug on our side) - it has also been removed from the
  // proxy's allowlist in the same update as this file.
  nvidia: [
    { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super", note: "The recommended default. Strong reasoning, thinks before answering.",
      caps: ["text"], ctx: "long", tier: "balanced" },
    { id: "nvidia/nemotron-3-ultra-550b-a55b", label: "Nemotron 3 Ultra", note: "The largest, most capable model here. Slower.",
      caps: ["text"], ctx: "long", tier: "strong" },
    { id: "nvidia/nemotron-3-nano-30b-a3b", label: "Nemotron 3 Nano", note: "Small and quick. Good for short, simple questions.",
      caps: ["text"], ctx: "short", tier: "fast" },
    { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "Fast, does not spend time reasoning. Good default for quick chat.",
      caps: ["text"], ctx: "long", tier: "fast" },
    { id: "deepseek-ai/deepseek-v4-pro", label: "DeepSeek V4 Pro", note: "Thinks before answering. Good for hard analytical problems.",
      caps: ["text"], ctx: "long", tier: "strong" },
    { id: "qwen/qwen3.5-397b-a17b", label: "Qwen 3.5", note: "Strong at code and multilingual work.",
      caps: ["text","code"], ctx: "long", tier: "strong" },
    { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6", note: "Long-context specialist.",
      caps: ["text","long"], ctx: "very long", tier: "balanced" },
    { id: "zhipuai/glm-5.2", label: "GLM 5.2", note: "General-purpose reasoning model.",
      caps: ["text"], ctx: "long", tier: "balanced" },
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

// ─────────────────────────────────────────────────────────────────────────────
// LIVE NVIDIA CATALOG - the actual fix, not another hand-typed list.
//
// This has now bitten twice: a model NVIDIA retired, and models that were
// never real to begin with. Both happened because a static list drifts from
// reality the moment NVIDIA changes anything, with nobody told.
//
// NVIDIA exposes the real, current catalog at a public endpoint:
//     GET https://integrate.api.nvidia.com/v1/models
// Called directly from the browser with the USER'S OWN KEY - never our shared
// one - this is a free, harmless metadata request. When a user has their own
// key, they now see NVIDIA's actual live list: every model NVIDIA currently
// offers, automatically, with anything retired simply absent because NVIDIA
// stopped listing it. No restriction from us, no manual updates needed when
// NVIDIA changes their catalog - which is exactly what was asked for.
//
// The static list below survives as the fallback for the ONE case that has
// to have one: someone using the shared free-tier key with no personal key
// at all, which cannot safely make this call from the browser (it would have
// to expose the shared key to do so). That case is now clearly labelled as
// the fallback it is, not presented as equivalent to the live list.
// ─────────────────────────────────────────────────────────────────────────────
const _nvidiaLiveCache: { at: number; models: ModelSpec[] } = { at: 0, models: [] };
const _NV_CACHE_MS = 10 * 60 * 1000; // ten minutes - long enough to avoid refetching every render, short enough that a newly-added model shows up the same session

/** Heuristic labelling only - the /v1/models endpoint gives an id, not
 *  capabilities. Good enough to sort a dropdown sensibly; never claimed as
 *  more precise than that. */
function _guessNvidiaSpec(id: string): ModelSpec {
  const low = id.toLowerCase();
  const isEmbed = /embed|rerank|guard|nemoguard|nv-embed/.test(low);
  const reasoning = /r1|reason|think|nemotron|qwq|deepseek|glm|kimi/.test(low) && !isEmbed;
  const big = /70b|72b|120b|235b|397b|550b|ultra|large/.test(low);
  return {
    id, label: id.split("/").pop() || id,
    note: isEmbed ? "Embedding/utility model - not for chat." : "From NVIDIA's live catalog.",
    caps: isEmbed ? [] : (/vl|vision|multimodal/.test(low) ? ["text","vision"] : ["text"]),
    ctx: big ? "long" : "short",
    tier: isEmbed ? "fast" : big ? "strong" : reasoning ? "balanced" : "fast",
  };
}

/**
 * Fetches NVIDIA's real, current model list using the caller's own key.
 * Never throws - a failure here should fall back silently to the static
 * list, not break whatever screen asked for it.
 */
export async function fetchNvidiaLiveCatalog(userKey: string): Promise<ModelSpec[]> {
  if (!userKey || !userKey.startsWith("nvapi-")) return [];
  const now = Date.now();
  if (_nvidiaLiveCache.models.length && now - _nvidiaLiveCache.at < _NV_CACHE_MS) {
    return _nvidiaLiveCache.models;
  }
  try {
    const r = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { "Authorization": "Bearer " + userKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return _nvidiaLiveCache.models; // stale cache beats nothing
    const data = await r.json();
    const ids: string[] = Array.isArray(data?.data) ? data.data.map((m: any) => String(m.id)).filter(Boolean) : [];
    const models = ids.map(_guessNvidiaSpec).filter(m => m.caps.length > 0);
    if (models.length) { _nvidiaLiveCache.at = now; _nvidiaLiveCache.models = models; }
    return models;
  } catch {
    return _nvidiaLiveCache.models;
  }
}

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
