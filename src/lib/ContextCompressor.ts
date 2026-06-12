// ─── CONTEXT COMPRESSOR ─────────────────────────────────────────────────────
// Phase 1 — Resilient Execution Framework
// VITE_COMPRESSION_ENABLED=false → zero behavior change (default)
// VITE_COMPRESSION_ENABLED=true  → compression active
// VITE_BENCHMARK_MODE=true       → console logging for both modes
// ────────────────────────────────────────────────────────────────────────────

export const COMPRESSION_ENABLED =
  import.meta.env.VITE_COMPRESSION_ENABLED === "true";

export const BENCHMARK_MODE =
  import.meta.env.VITE_BENCHMARK_MODE === "true";

// ─── SCHEMA ──────────────────────────────────────────────────────────────────

export interface CompressedContext {
  agent_role: string;
  agent_full_title: string;
  agent_department: string;
  level: number;
  executive_summary: string;
  decisions_made: string[];
  risks_identified: string[];
  key_assumptions: string[];
  action_items: string[];
  key_numbers: Record<string, string>;
  role_perspective: string;
  escalation_note: string;
  memory_category: "financial"|"operational"|"strategic"|"legal"|"people"|"technology"|"marketing"|"sales"|"customer"|"audit"|"executive"|"general";
  confidence_level: "high"|"medium"|"low";
  compressed_at: string;
  source_length_chars: number;
  compressed_length_chars: number;
  compression_ratio: number;
  provider_used: string;
  compression_tokens_used: number;
}

// ─── DEPT → MEMORY CATEGORY ──────────────────────────────────────────────────

const DEPT_TO_CATEGORY: Record<string, CompressedContext["memory_category"]> = {
  "Finance": "financial",
  "Technology": "technology",
  "Operations": "operational",
  "Marketing": "marketing",
  "Sales & Revenue": "sales",
  "People & Culture": "people",
  "Legal & Compliance": "legal",
  "Strategy & Corp Dev": "strategic",
  "Customer Success": "customer",
  "Audit & Risk": "audit",
  "Executive": "executive",
  "Presentation Studio": "general",
};

// ─── COMPRESSION PROMPT ───────────────────────────────────────────────────────
// Small and fast. Target: 300-500 tokens input, 300-400 tokens output.

function buildCompressionPrompt(
  fullOutput: string,
  agentRole: string,
  agentFullTitle: string,
  agentDepartment: string,
  level: number,
  currency: string
): string {
  return `Extract structured data from this executive output.
Return ONLY valid JSON. No markdown. No explanation. Start with { end with }.

EXECUTIVE: ${agentRole} | ${agentFullTitle} | ${agentDepartment}
LEVEL: ${level}
CURRENCY: ${currency}

OUTPUT:
"""
${fullOutput.slice(0, 5000)}
"""

JSON structure to return:
{
  "executive_summary": "2-3 sentences. Most important insight. Include specific numbers.",
  "decisions_made": ["Decision with numbers", "Decision 2", "Decision 3"],
  "risks_identified": ["Risk 1: impact", "Risk 2: impact"],
  "key_assumptions": ["Assumption 1", "Assumption 2"],
  "action_items": ["Action 1", "Action 2", "Action 3"],
  "key_numbers": {"Metric": "Value with unit"},
  "role_perspective": "One sentence: unique lens ${agentRole} applied.",
  "escalation_note": "One sentence: what ${agentRole} flags for the next executive.",
  "confidence_level": "high or medium or low"
}`;
}

// ─── FORMAT FOR PROMPT INJECTION ─────────────────────────────────────────────
// What the next executive actually reads as their inherited context.

export function formatCompressedContextForPrompt(
  contexts: CompressedContext[]
): string {
  if (!contexts.length) return "";

  const lines: string[] = ["PRIOR EXECUTIVE ANALYSIS:", ""];

  for (const ctx of contexts) {
    lines.push(`[Level ${ctx.level} — ${ctx.agent_role} | ${ctx.agent_full_title}]`);
    lines.push(`Perspective: ${ctx.role_perspective}`);
    lines.push(`Summary: ${ctx.executive_summary}`);

    if (ctx.decisions_made.length) {
      lines.push(`Decisions: ${ctx.decisions_made.join(" | ")}`);
    }
    if (Object.keys(ctx.key_numbers).length) {
      const nums = Object.entries(ctx.key_numbers)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      lines.push(`Key Numbers: ${nums}`);
    }
    if (ctx.risks_identified.length) {
      lines.push(`Risks: ${ctx.risks_identified.join(" | ")}`);
    }
    if (ctx.action_items.length) {
      lines.push(`Actions: ${ctx.action_items.join(" | ")}`);
    }
    if (ctx.escalation_note) {
      lines.push(`Handoff: ${ctx.escalation_note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── MAIN COMPRESS FUNCTION ───────────────────────────────────────────────────
// Returns CompressedContext or null.
// null = compression failed → caller uses full output (safe fallback).
// Compression failure NEVER stops the workflow.

export async function compressLevelOutput(params: {
  fullOutput: string;
  agentRole: string;
  agentFullTitle: string;
  agentDepartment: string;
  level: number;
  currency: string;
  callAI: (provider: string, key: string, sys: string, msgs: Array<{role:string;content:string}>, maxTokens: number) => Promise<string>;
  keys: Record<string, string>;
  defaultProvider: string;
  effectiveGroqKey: string;
  effectiveGeminiKey: string;
}): Promise<CompressedContext | null> {

  const {
    fullOutput, agentRole, agentFullTitle, agentDepartment,
    level, currency, callAI, keys, defaultProvider,
    effectiveGroqKey, effectiveGeminiKey,
  } = params;

  // Resolve provider and key
  const effectiveKeys: Record<string, string> = { ...keys };
  if (effectiveGroqKey && !effectiveKeys.groq?.trim()) effectiveKeys.groq = effectiveGroqKey;
  if (effectiveGeminiKey && !effectiveKeys.gemini?.trim()) effectiveKeys.gemini = effectiveGeminiKey;

  const available = Object.keys(effectiveKeys).filter(p => effectiveKeys[p]?.trim());
  if (!available.length) return null;

  const provider = available.includes(defaultProvider) ? defaultProvider : available[0];
  const key = effectiveKeys[provider];

  const prompt = buildCompressionPrompt(
    fullOutput, agentRole, agentFullTitle, agentDepartment, level, currency
  );

  try {
    const raw = await callAI(
      provider,
      key,
      "You are a precise JSON extractor. Return only valid JSON.",
      [{ role: "user", content: prompt }],
      600
    );

    // Parse JSON — strip any accidental markdown fences
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    const compressedLength = JSON.stringify(parsed).length;
    const sourceLength = fullOutput.length;

    const result: CompressedContext = {
      agent_role: agentRole,
      agent_full_title: agentFullTitle,
      agent_department: agentDepartment,
      level,
      executive_summary: parsed.executive_summary || "",
      decisions_made: Array.isArray(parsed.decisions_made) ? parsed.decisions_made : [],
      risks_identified: Array.isArray(parsed.risks_identified) ? parsed.risks_identified : [],
      key_assumptions: Array.isArray(parsed.key_assumptions) ? parsed.key_assumptions : [],
      action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
      key_numbers: (parsed.key_numbers && typeof parsed.key_numbers === "object") ? parsed.key_numbers : {},
      role_perspective: parsed.role_perspective || "",
      escalation_note: parsed.escalation_note || "",
      memory_category: DEPT_TO_CATEGORY[agentDepartment] || "general",
      confidence_level: parsed.confidence_level || "medium",
      compressed_at: new Date().toISOString(),
      source_length_chars: sourceLength,
      compressed_length_chars: compressedLength,
      compression_ratio: Math.round((sourceLength / compressedLength) * 10) / 10,
      provider_used: provider,
      compression_tokens_used: Math.ceil(prompt.length / 4) + Math.ceil(raw.length / 4),
    };

    return result;

  } catch {
    // Silent fail — compression failure never breaks the workflow
    return null;
  }
}
