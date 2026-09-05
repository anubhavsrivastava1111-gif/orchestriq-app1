// ─────────────────────────────────────────────────────────────────────────────
// NVIDIA MODEL REGISTRY
//
// Replaces the hardcoded ALLOWED_MODELS set in functions/api/nvidia.ts, which
// went stale the moment NVIDIA shipped a new generation. That list still held
// nemotron-4-340b and llama-3.1-nemotron-70b while NVIDIA had moved on to the
// Nemotron 3 family — which is why a newer, better model could not be selected.
//
// Every model carries the metadata the Provider Manager actually needs, so
// token budgets, reasoning control and UI labelling are all driven from one
// place instead of being guessed at each call site.
//
// VERIFY BEFORE TRUSTING: NVIDIA's free catalogue moves fast. `verified` records
// when each entry was last checked against build.nvidia.com. Anything older than
// ~60 days should be re-checked before it is relied on.
// ─────────────────────────────────────────────────────────────────────────────

export type NvidiaModel = {
  modelId: string;
  displayName: string;
  vendor: string;
  contextWindow: number;
  maxOutputTokens: number;      // practical ceiling for one response
  reasoningSupported: boolean;
  reasoningDefault: boolean;    // whether to think by default for board-grade work
  reasoningOverhead: number;    // tokens typically spent thinking before answering
  toolCallingSupported: boolean;
  structuredOutputSupported: boolean;
  multimodalSupported: boolean;
  freeEndpoint: boolean;
  enabled: boolean;
  bestFor: string;
  caution: string;
  verified: string;             // YYYY-MM
};

export const NVIDIA_MODELS: NvidiaModel[] = [
  {
    modelId: "nvidia/nemotron-3-super-120b-a12b",
    displayName: "Nemotron 3 Super 120B — recommended",
    vendor: "NVIDIA",
    contextWindow: 1_000_000,
    maxOutputTokens: 16000,
    reasoningSupported: true, reasoningDefault: true, reasoningOverhead: 2500,
    toolCallingSupported: true, structuredOutputSupported: true, multimodalSupported: false,
    freeEndpoint: true, enabled: true,
    bestFor: "Multi-executive orchestration, long structured prompts, planning and tool calling. Mixture-of-experts, so throughput is high relative to its size — which matters under a request-per-minute cap.",
    caution: "Reasoning model: it spends output tokens thinking before it answers. Budget for both.",
    verified: "2026-08",
  },
  {
    modelId: "nvidia/nemotron-3-ultra-550b-a55b",
    displayName: "Nemotron 3 Ultra 550B — strongest, slower",
    vendor: "NVIDIA",
    contextWindow: 1_000_000,
    maxOutputTokens: 16000,
    reasoningSupported: true, reasoningDefault: true, reasoningOverhead: 3500,
    toolCallingSupported: true, structuredOutputSupported: true, multimodalSupported: false,
    freeEndpoint: true, enabled: true,
    bestFor: "The hardest single call in a session — the Chairman's synthesis. NVIDIA's strongest agent-focused open model.",
    caution: "Largest model on the free endpoint; slowest, and most likely to be throttled under load.",
    verified: "2026-08",
  },
  {
    modelId: "zhipuai/glm-5.2",
    displayName: "GLM 5.2 — best structured output",
    vendor: "Z.ai / Zhipu",
    contextWindow: 200_000,
    maxOutputTokens: 12000,
    reasoningSupported: true, reasoningDefault: true, reasoningOverhead: 2000,
    toolCallingSupported: true, structuredOutputSupported: true, multimodalSupported: false,
    freeEndpoint: true, enabled: true,
    bestFor: "Documents that must follow an exact section structure, and function calling. Widely rated the best free NIM default for long-context agent work.",
    caution: "Chinese-hosted weights (served by NVIDIA). Fine for your own use; check before selling to a regulated buyer.",
    verified: "2026-08",
  },
  {
    modelId: "deepseek-ai/deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro — deep reasoning",
    vendor: "DeepSeek",
    contextWindow: 128_000,
    maxOutputTokens: 12000,
    reasoningSupported: true, reasoningDefault: true, reasoningOverhead: 3000,
    toolCallingSupported: true, structuredOutputSupported: true, multimodalSupported: false,
    freeEndpoint: true, enabled: true,
    bestFor: "Chain-of-thought work: financial modelling, break-even, root-cause analysis.",
    caution: "Heaviest reasoning overhead here. Starving its budget produces an EMPTY answer, not a short one.",
    verified: "2026-08",
  },
  {
    modelId: "qwen/qwen3.5-397b-a17b",
    displayName: "Qwen 3.5 397B — broad knowledge",
    vendor: "Alibaba",
    contextWindow: 256_000,
    maxOutputTokens: 12000,
    reasoningSupported: true, reasoningDefault: false, reasoningOverhead: 1500,
    toolCallingSupported: true, structuredOutputSupported: true, multimodalSupported: true,
    freeEndpoint: true, enabled: true,
    bestFor: "Market and industry breadth, multilingual work, vision input.",
    caution: "Reasoning off by default; turn it on for analysis.",
    verified: "2026-08",
  },
  {
    modelId: "openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B — fast general",
    vendor: "OpenAI (open weights)",
    contextWindow: 128_000,
    maxOutputTokens: 8000,
    reasoningSupported: false, reasoningDefault: false, reasoningOverhead: 0,
    toolCallingSupported: true, structuredOutputSupported: true, multimodalSupported: false,
    freeEndpoint: true, enabled: true,
    bestFor: "Extraction, summarising, formatting — anything that does not need to think first.",
    caution: "Not a reasoning model. Use it for the cheap half of the pipeline.",
    verified: "2026-08",
  },
  {
    modelId: "moonshotai/kimi-k2.6",
    displayName: "Kimi K2.6 — very long context",
    vendor: "Moonshot",
    contextWindow: 1_000_000,
    maxOutputTokens: 12000,
    reasoningSupported: true, reasoningDefault: false, reasoningOverhead: 1500,
    toolCallingSupported: true, structuredOutputSupported: true, multimodalSupported: false,
    freeEndpoint: true, enabled: true,
    bestFor: "Nine-executive sessions where the accumulated debate is enormous.",
    caution: "Chinese-hosted weights, same note as GLM.",
    verified: "2026-08",
  },
  {
    // THE EXACT MODEL YOU HIT THE RETIREMENT ERROR ON. This entry claimed
    // "verified: 2026-08" and enabled:true right up until NVIDIA's own API
    // told you, in a live response, that they retired it on 2026-08-26. A
    // "verified" date on a hand-typed list is only ever as good as the last
    // time someone actually checked - it does not update itself, and nothing
    // here noticed when NVIDIA changed anything. That is the structural
    // problem this whole file has, addressed properly below.
    modelId: "meta/llama-3.3-70b-instruct",
    displayName: "Llama 3.3 70B — RETIRED by NVIDIA, do not use",
    vendor: "Meta",
    contextWindow: 128_000,
    maxOutputTokens: 8000,
    reasoningSupported: false, reasoningDefault: false, reasoningOverhead: 0,
    toolCallingSupported: true, structuredOutputSupported: false, multimodalSupported: false,
    freeEndpoint: true, enabled: false,
    bestFor: "Nothing - NVIDIA retired this model on 2026-08-26.",
    caution: "Disabled. Selecting it will fail with an end-of-life error from NVIDIA.",
    verified: "2026-09",
  },
];

export const NVIDIA_DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";

export function getNvidiaModel(id: string): NvidiaModel | null {
  return NVIDIA_MODELS.find(m => m.modelId === id && m.enabled) || null;
}
export function nvidiaModelIds(): string[] {
  return NVIDIA_MODELS.filter(m => m.enabled).map(m => m.modelId);
}

/**
 * Model-aware output budget.
 *
 * The old proxy applied a flat MAX_TOKENS_CAP of 4000 to every model. For a
 * reasoning model that cap is consumed by THINKING, and the API returns an empty
 * answer while billing every token — the exact failure that produced blank
 * executive cards. The budget must cover reasoning overhead AND the answer, and
 * must never exceed what the model can actually emit.
 */
export function nvidiaTokenBudget(modelId: string, wantedOutputTokens: number, reasoningOn: boolean): number {
  const m = getNvidiaModel(modelId);
  // WAS a flat, conservative 4000-token cap for anything not in this table -
  // which is exactly what a model chosen from NVIDIA's LIVE catalog will be,
  // now that this platform can offer any model NVIDIA currently has rather
  // than only the ones hand-typed here. A model we have no curated data for
  // still deserves a real budget, not an arbitrary small one; 9000 matches
  // the same safe generic default used by the Cloudflare proxy for the same
  // situation, so the two sides of this system agree.
  if (!m) return Math.min(Math.max(wantedOutputTokens || 1500, 512) + (reasoningOn ? 2000 : 0), 9000);
  const overhead = reasoningOn && m.reasoningSupported ? m.reasoningOverhead : 0;
  const needed = Math.max(wantedOutputTokens || 1500, 512) + overhead;
  return Math.min(needed, m.maxOutputTokens);
}

/**
 * Whether to let the model think. Thinking costs tokens and latency, so it is
 * reserved for work where it changes the answer. Decided once, here, rather
 * than by each module inventing its own rule.
 */
const THINKING_TASKS = new Set([
  "boardroom", "chairman", "executive", "strategy", "financial", "research_synthesis",
  "scenario", "risk", "decision", "audit", "document",
]);
export function nvidiaShouldReason(modelId: string, task: string): boolean {
  const m = getNvidiaModel(modelId);
  // A model outside this table (from the live catalog) has an unknown
  // reasoning capability. Assume it MIGHT reason for a task that genuinely
  // needs it, and not otherwise - the safer default than assuming none of
  // NVIDIA's newer models can think, which would quietly downgrade quality
  // for every model this table has not been told about yet.
  if (!m) return THINKING_TASKS.has(String(task || "").toLowerCase());
  if (!m.reasoningSupported) return false;
  if (THINKING_TASKS.has(String(task || "").toLowerCase())) return true;
  return m.reasoningDefault && !String(task || "").toLowerCase().startsWith("format");
}

/** Rendered for the Settings dropdown, so the UI never drifts from the registry. */
export function nvidiaModelOptions(): Array<{ id: string; label: string; note: string }> {
  return NVIDIA_MODELS.filter(m => m.enabled).map(m => ({
    id: m.modelId,
    label: m.displayName,
    note: (m.contextWindow >= 1e6 ? "1M context" : Math.round(m.contextWindow / 1000) + "K context")
      + (m.reasoningSupported ? " · reasoning" : "")
      + (m.toolCallingSupported ? " · tools" : ""),
  }));
}
