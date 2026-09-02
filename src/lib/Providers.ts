// src/lib/Providers.ts
// ─────────────────────────────────────────────────────────────────────────────
// ONE PLACE THAT KNOWS ABOUT AI PROVIDERS.
//
// WHY THIS EXISTS — and it is the honest answer to "are you looking at the
// whole website or just bits and pieces?"
//
// I audited App.tsx. There is already a function called providerKey() that is
// meant to be the single source of truth: it respects the on/off switch, uses
// the user's own key when present, and returns the free-tier marker for NVIDIA.
//
// FIFTEEN places ignore it and read the key object directly:
//
//     keys.fal          6 places
//     keys.openai       5 places
//     keys.nvidia       3 places
//     keys.stability    1 place
//
// So a fix applied to one path leaves fourteen others untouched. That is
// exactly why the same problem kept coming back, and why adding the NVIDIA key
// field in Settings broke NVIDIA for the owner: one path learned about the new
// field and the rest did not.
//
// This module makes that structurally impossible. Everything about a provider -
// what it is called, what it can do, what its key looks like, where to get one -
// lives here and nowhere else. Adding a seventh or a tenth provider becomes one
// entry in a list, not a hunt through 9,500 lines.
// ─────────────────────────────────────────────────────────────────────────────

export type Capability =
  | "text"        // chat, analysis, reasoning
  | "vision"      // reads images
  | "image"       // creates images
  | "video"       // creates video
  | "websearch"   // fetches live web results ITSELF
  | "documents"   // can drive PDF / PPT / Excel generation
  | "code";       // writes and runs code

export interface ProviderSpec {
  id: string;
  label: string;
  company: string;
  /** What this provider can actually do. Used to route work honestly. */
  can: Capability[];
  /** Empty when no key is needed (NVIDIA's free tier). */
  keyPrefix: string;
  keyPlaceholder: string;
  getKeyUrl: string;
  /** Plain-English cost note shown to the user. */
  cost: string;
  /** The trade-off a user should know before choosing it. */
  privacyNote: string;
  /** Works with no key at all. */
  freeTier: boolean;
  /** Shown in Settings. A provider can exist here before it is switchable. */
  active: boolean;
}

// ─── THE REGISTRY ────────────────────────────────────────────────────────────
// Adding a provider means adding an entry here. Nothing else changes.
export const PROVIDERS: ProviderSpec[] = [
  {
    id: "nvidia", label: "NVIDIA", company: "NVIDIA",
    can: ["text", "documents"],
    keyPrefix: "nvapi-", keyPlaceholder: "nvapi-… (optional — free tier works without one)",
    getKeyUrl: "https://build.nvidia.com",
    cost: "Free tier, or your own free key for unlimited use",
    privacyNote: "Free tier prompts may be used by NVIDIA to improve its models. Fine for routine analysis; use a paid provider for commercially sensitive work.",
    freeTier: true, active: true,
  },
  {
    id: "claude", label: "Claude", company: "Anthropic",
    // Claude is the only provider that both searches the web itself AND can
    // write and run code — which is what builds a real Excel workbook.
    can: ["text", "vision", "websearch", "documents", "code"],
    keyPrefix: "sk-ant-", keyPlaceholder: "sk-ant-…",
    getKeyUrl: "https://console.anthropic.com/settings/keys",
    cost: "Paid, per token",
    privacyNote: "Anthropic does not train on API traffic by default.",
    freeTier: false, active: true,
  },
  {
    id: "openai", label: "OpenAI", company: "OpenAI",
    can: ["text", "vision", "image", "documents"],
    keyPrefix: "sk-", keyPlaceholder: "sk-…",
    getKeyUrl: "https://platform.openai.com/api-keys",
    cost: "Paid, per token. Images about ₹8 each.",
    privacyNote: "OpenAI does not train on API traffic by default.",
    freeTier: false, active: true,
  },
  {
    id: "gemini", label: "Google Gemini", company: "Google",
    can: ["text", "vision", "websearch", "documents"],
    keyPrefix: "AIza", keyPlaceholder: "AIza…",
    getKeyUrl: "https://aistudio.google.com/apikey",
    cost: "Generous free tier, then paid",
    privacyNote: "Free-tier prompts may be reviewed by Google. Paid tier is not used for training.",
    freeTier: false, active: true,
  },
  {
    id: "deepseek", label: "DeepSeek", company: "DeepSeek AI",
    can: ["text", "documents"],
    keyPrefix: "sk-", keyPlaceholder: "sk-…",
    getKeyUrl: "https://platform.deepseek.com/api_keys",
    cost: "Very low cost per token",
    privacyNote: "DeepSeek is based in China. Consider where your data may be processed before sending commercially sensitive material.",
    freeTier: false, active: true,
  },
  {
    id: "groq", label: "Groq", company: "Groq",
    can: ["text"],
    keyPrefix: "gsk_", keyPlaceholder: "gsk_…",
    getKeyUrl: "https://console.groq.com/keys",
    cost: "Free tier, limited to about 8,000 tokens a minute",
    privacyNote: "Very fast. The free tier's per-minute limit makes it unsuitable for long documents.",
    freeTier: false, active: true,
  },
  {
    id: "kimi", label: "Kimi", company: "Moonshot AI",
    can: ["text"],
    keyPrefix: "sk-", keyPlaceholder: "sk-…",
    getKeyUrl: "https://platform.moonshot.cn/console/api-keys",
    cost: "Low cost per token",
    privacyNote: "Moonshot AI is based in China. Same consideration as DeepSeek.",
    freeTier: false, active: true,
  },
  {
    id: "fal", label: "fal.ai", company: "fal.ai",
    can: ["image", "video"],
    keyPrefix: "", keyPlaceholder: "key-…",
    getKeyUrl: "https://fal.ai/dashboard/keys",
    cost: "Pay as you go, roughly ₹3 an image",
    privacyNote: "Images and prompts are processed by fal.ai.",
    freeTier: false, active: true,
  },
  {
    id: "stability", label: "Stability AI", company: "Stability AI",
    can: ["image"],
    keyPrefix: "sk-", keyPlaceholder: "sk-…",
    getKeyUrl: "https://platform.stability.ai/account/keys",
    cost: "Roughly ₹3 an image",
    privacyNote: "Images and prompts are processed by Stability AI.",
    freeTier: false, active: true,
  },
];

export const byId = (id: string) => PROVIDERS.find(p => p.id === id);

/** Human-readable name for a capability, for messages shown to users. */
export const CAPABILITY_LABEL: Record<Capability, string> = {
  text: "writing and analysis",
  vision: "reading images",
  image: "creating images",
  video: "creating video",
  websearch: "searching the web",
  documents: "building documents",
  code: "writing and running code",
};

/**
 * Can this provider do this job? Used to route work honestly rather than
 * letting a request fail somewhere deep in a module.
 */
export const providerCan = (id: string, cap: Capability): boolean =>
  !!byId(id)?.can.includes(cap);

/**
 * Every provider the user has actually configured that can do this job, in
 * preference order. `resolve` is passed in so this module never has to know
 * how keys are stored - it stays a description of capability, nothing else.
 */
export function availableFor(
  cap: Capability,
  resolve: (id: string) => string,
  preferred?: string,
): Array<{ id: string; key: string; spec: ProviderSpec }> {
  const out: Array<{ id: string; key: string; spec: ProviderSpec }> = [];
  const order = PROVIDERS
    .filter(p => p.active && p.can.includes(cap))
    .sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0));
  for (const spec of order) {
    const key = (resolve(spec.id) || "").trim();
    if (key) out.push({ id: spec.id, key, spec });
  }
  return out;
}

/**
 * The message a user should see when the provider they chose cannot do the
 * thing they asked for. This is the difference between "it failed" and
 * knowing what to do next.
 */
export function cannotDoMessage(
  chosen: string,
  cap: Capability,
  alternatives: Array<{ id: string; spec: ProviderSpec }>,
): string {
  const name = byId(chosen)?.label || chosen;
  const job = CAPABILITY_LABEL[cap];
  if (alternatives.length) {
    return `${name} cannot do ${job}. Using ${alternatives[0].spec.label} instead, which can.`;
  }
  const couldDo = PROVIDERS.filter(p => p.active && p.can.includes(cap)).map(p => p.label);
  return `${name} cannot do ${job}, and no provider you have configured can either. ` +
         `Add a key for one of these in Settings: ${couldDo.join(", ")}.`;
}

/** Does this look like a key for this provider? Never over-strict: a key that
 *  is merely unfamiliar is still passed through, because rejecting a valid key
 *  and blaming the configuration is worse than trying it and being told no. */
export function looksLikeKey(id: string, key: string): boolean {
  const k = (key || "").trim();
  if (!k) return false;
  const prefix = byId(id)?.keyPrefix || "";
  if (!prefix) return k.length >= 8;
  return k.startsWith(prefix) ? k.length >= 12 : k.length >= 20;
}

export default { PROVIDERS, byId, providerCan, availableFor, cannotDoMessage,
                 looksLikeKey, CAPABILITY_LABEL };
