// ─────────────────────────────────────────────────────────────────────────────
// MODEL ROUTING — per-stage provider selection and cost preview
//
// Model choice matters very differently by stage. Turning search results into
// bullets is extraction; the cheapest capable model does it as well as the most
// expensive one. Weighing nine conflicting executive positions and RULING on them
// is judgement, and there a stronger model genuinely earns its price.
//
// So instead of one global provider, each stage is routed independently, and the
// user sees the cost consequence before the run rather than after.
//
// Pure data and pure functions. No API calls, no React, no side effects — this
// file cannot change behaviour until something imports it.
// ─────────────────────────────────────────────────────────────────────────────

import { PROVIDER_PRICING, resolvePricingKey } from "../TokenAnalytics";

export type StageId =
  | "research_extract"    // turn retrieved results into structured bullets
  | "research_synthesis"  // reconcile findings, rank, frame tensions
  | "executive"           // each executive's independent analysis
  | "chairman"            // final arbitration and recommendation
  | "documents";          // Excel / PPT / PDF / Word generation

export const STAGES: Array<{
  id: StageId;
  label: string;
  what: string;
  hardness: "extraction" | "reasoning" | "judgement";
  why: string;
}> = [
  { id: "research_extract",   label: "Research — extraction", hardness: "extraction",
    what: "Turns search results into sourced bullets",
    why: "Structured copying. A cheap model does this as well as an expensive one." },
  { id: "research_synthesis", label: "Research — synthesis",  hardness: "reasoning",
    what: "Reconciles conflicts, ranks what matters",
    why: "Needs to spot contradictions. Mid-tier is the sweet spot." },
  { id: "executive",          label: "Executive analysis",     hardness: "reasoning",
    what: "Each executive's own domain analysis",
    why: "The bulk of your tokens. Small quality gains cost a lot here." },
  { id: "chairman",           label: "Chairman synthesis",     hardness: "judgement",
    what: "Rules on disagreements, issues the recommendation",
    why: "The one output read end to end and acted on. Spend here." },
  { id: "documents",          label: "Document generation",    hardness: "reasoning",
    what: "Excel models, decks, reports",
    why: "Structure matters more than reasoning depth." },
];

export type StageProfile = Record<StageId, string>;

// Presets are guidance, not gates. Custom overrides every stage.
export const PRESETS: Record<string, { label: string; note: string; stages: StageProfile }> = {
  economy: {
    label: "Economy",
    note: "Cheapest capable model everywhere. Good for exploring and drafting.",
    stages: {
      research_extract: "deepseek", research_synthesis: "deepseek",
      executive: "deepseek", chairman: "deepseek", documents: "deepseek",
    },
  },
  balanced: {
    label: "Balanced  (recommended)",
    note: "Cheap models do the extraction and the debate; the final synthesis — the part you actually read — gets a stronger model.",
    stages: {
      research_extract: "deepseek", research_synthesis: "deepseek",
      executive: "deepseek", chairman: "claude", documents: "deepseek",
    },
  },
  premium: {
    label: "Premium",
    note: "Frontier model on everything that reasons. For client-facing or board-facing work.",
    stages: {
      research_extract: "deepseek", research_synthesis: "claude",
      executive: "claude", chairman: "claude", documents: "claude",
    },
  },
};

export const DEFAULT_PROFILE: StageProfile = PRESETS.balanced.stages;

/**
 * Picks the provider for a stage, falling back down a sensible chain when the
 * chosen one is unavailable or switched off. Never returns a disabled provider.
 */
export function resolveStageProvider(
  stage: StageId,
  profile: StageProfile | null | undefined,
  isEnabled: (id: string) => boolean,
): string {
  const wanted = (profile || DEFAULT_PROFILE)[stage];
  if (wanted && isEnabled(wanted)) return wanted;
  // Cheapest capable first, so an unavailable premium choice degrades in price,
  // not into an unexpectedly expensive provider.
  const chain = ["deepseek", "gemini", "groq", "kimi", "openai", "claude", "nvidia"];
  for (const p of chain) if (isEnabled(p)) return p;
  return "";
}

/** Model string upgrade for stages that benefit from it, within the same provider. */
export function stageModelOverride(stage: StageId, provider: string): string {
  if (provider === "claude" && (stage === "chairman" || stage === "executive")) {
    return "claude-sonnet-4-5-20250929";
  }
  if (provider === "deepseek" && stage === "chairman") return "deepseek-v4-pro";
  return "";
}

// ── COST PREVIEW ─────────────────────────────────────────────────────────────
// Token volumes measured from real sessions, not guessed. Executive input grows
// with the SQUARE of panel size because each executive reads every prior response.

export type CostLine = { stage: StageId; label: string; provider: string; inTok: number; outTok: number; usd: number };

export function estimateSessionCost(
  profile: StageProfile,
  opts: { executives: number; researchOn: boolean; angles?: number; searchPerQueryUsd?: number },
  isEnabled: (id: string) => boolean,
): { lines: CostLine[]; searchUsd: number; totalUsd: number } {
  const n = Math.max(1, opts.executives || 4);
  const angles = opts.angles ?? 7;
  const lines: CostLine[] = [];

  const add = (stage: StageId, inTok: number, outTok: number) => {
    const provider = resolveStageProvider(stage, profile, isEnabled);
    const key = resolvePricingKey(provider, stageModelOverride(stage, provider));
    const p = (PROVIDER_PRICING as any)[key] || (PROVIDER_PRICING as any)[provider];
    const usd = p ? (inTok / 1e6) * p.inputPer1M + (outTok / 1e6) * p.outputPer1M : 0;
    lines.push({
      stage,
      label: STAGES.find(s => s.id === stage)?.label || stage,
      provider: provider || "none",
      inTok, outTok, usd,
    });
  };

  if (opts.researchOn) {
    add("research_extract", angles * 3200, angles * 2400);
    add("research_synthesis", 9000, 3200);
  }
  // Fixed prefix per executive, plus the accumulating debate they must read.
  const execIn = n * 9000 + 1400 * (n * (n - 1)) / 2;
  add("executive", execIn, n * 1500);
  add("chairman", 6000 + n * 1800, 6500);

  const searchUsd = opts.researchOn ? angles * 2 * (opts.searchPerQueryUsd ?? 0.001) : 0;
  const totalUsd = lines.reduce((s, l) => s + l.usd, 0) + searchUsd;
  return { lines, searchUsd, totalUsd };
}

/** Indian numbering for INR, Western for everything else. */
export function fmtMoney(usd: number, currency: string, symbol: string, fxToLocal: number): string {
  if (currency !== "INR") return symbol + usd.toFixed(usd < 1 ? 3 : 2);
  const v = usd * (fxToLocal || 88);
  if (v >= 1e7) return symbol + (v / 1e7).toFixed(2) + " crore";
  if (v >= 1e5) return symbol + (v / 1e5).toFixed(2) + " lakh";
  if (v >= 1000) return symbol + Math.round(v).toLocaleString("en-IN");
  return symbol + v.toFixed(v < 10 ? 2 : 0);
}
