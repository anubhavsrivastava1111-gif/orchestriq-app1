// ─── PROVIDER & MODEL CONSTANTS ──────────────────────────────────────────────
//
// IMPORTANT — NEVER USE "claude-sonnet-4-6":
//   That model identifier does not exist. It was the root cause of every
//   "Failed to fetch" bug in DataIngestion.tsx and AgenticWorkflows.tsx.
//   Anthropic rejects unknown model IDs at the CORS/edge layer, which the
//   browser reports as a network error with no useful message.
//   Always use the exact strings from MODEL_IDS below.

export const PROVIDER_IDS = {
  CLAUDE:     "claude",
  OPENAI:     "openai",
  DEEPSEEK:   "deepseek",
  GEMINI:     "gemini",
  GROQ:       "groq",
  FAL:        "fal",
  STABILITY:  "stability",
  KIMI:       "kimi",
} as const;

export const MODEL_IDS = {
  // ── Anthropic ─────────────────────────────────────────────────────────────
  CLAUDE_SONNET:  "claude-sonnet-4-5-20250929",  // vision + text, specialist tasks
  CLAUDE_HAIKU:   "claude-haiku-4-5-20251001",   // fast, cheap, high-volume tasks

  // ── OpenAI ───────────────────────────────────────────────────────────────
  OPENAI_GPT4O:   "gpt-4o",
  OPENAI_DALLE3:  "dall-e-3",                    // PRIMARY image provider (fal fallback)

  // ── fal.ai ───────────────────────────────────────────────────────────────
  FAL_IMAGE_FAST: "fal-ai/flux/schnell",
  FAL_IMAGE_PRO:  "fal-ai/flux-pro",
  FAL_VIDEO_WAN:  "fal-ai/wan-i2v",
  FAL_VIDEO_KLING:"fal-ai/kling-video/v1/standard/text-to-video",

  // ── Google ───────────────────────────────────────────────────────────────
  GEMINI_FLASH:   "gemini-1.5-flash",
  GEMINI_PRO:     "gemini-1.5-pro",

  // ── Groq ─────────────────────────────────────────────────────────────────
  GROQ_LLAMA:     "llama-3.3-70b-versatile",

  // ── DeepSeek ─────────────────────────────────────────────────────────────
  DEEPSEEK_CHAT:  "deepseek-chat",
} as const;

export type ProviderId = typeof PROVIDER_IDS[keyof typeof PROVIDER_IDS];
export type ModelId    = typeof MODEL_IDS[keyof typeof MODEL_IDS];
