// ═══════════════════════════════════════════════════════════════════════════
// CLOUDFLARE PAGES FUNCTION — NVIDIA NIM proxy  (v2, registry-driven)
// ─────────────────────────────────────────────────────────────────────────────
// Auto-routes to https://<your-site>/api/nvidia because this file lives at
// functions/api/nvidia.ts in the repo root (NOT inside src/).
//
// WHY THIS FILE EXISTS
// NVIDIA's API key must never reach the browser. A VITE_-prefixed variable would
// be baked into the public bundle and extractable from dev tools. This function
// keeps the key server-side: a Cloudflare Pages Secret, readable only inside this
// function's execution context. The frontend calls this endpoint with no key.
//
// SETUP (one-time, Cloudflare dashboard):
//   Workers & Pages → orchestriq → Settings → Environment variables → Production
//   Add: NVIDIA_API_KEY = nvapi-xxxxxxxx   (type: SECRET, not Plaintext)
//   Then REDEPLOY — variables only apply to builds created after they are saved.
//   Free key: https://build.nvidia.com
//
// ── WHAT CHANGED IN v2, AND WHY ─────────────────────────────────────────────
//
// 1. NO SILENT MODEL SUBSTITUTION.
//    v1 did:  const chosenModel = ALLOWED_MODELS.has(model) ? model : DEFAULT;
//    You could select Nemotron, receive Llama, and never be told. An executive
//    recommendation whose author is unknown is not auditable. Unknown models now
//    return HTTP 400 naming the model and listing what is available.
//
// 2. MODEL-AWARE TOKEN BUDGET.
//    v1 capped every model at 4000 output tokens. Reasoning models spend output
//    tokens THINKING before they write; when the cap ran out mid-thought the API
//    returned 200 with an empty body and billed every token. That is what filled
//    the Boardroom with blank cards. The budget now covers reasoning AND answer,
//    per model, and never exceeds what the model can actually emit.
//
// 3. EMPTY RESPONSES ARE ERRORS.
//    If content comes back empty, this returns 502 with the finish_reason instead
//    of passing silence upstream to be rendered as a blank executive.
//
// 4. OBSERVABILITY.
//    Every response carries x-oiq-model, x-oiq-reasoning and x-oiq-budget, so the
//    app can record which model actually produced each recommendation.
//
// NOTE ON PRODUCTION USE: NVIDIA's free trial terms exclude production use and
// permit prompts to be used for model improvement. Correct for development and
// evaluation. Do NOT route paying users' business data through it.
// ═══════════════════════════════════════════════════════════════════════════

interface Env {
  NVIDIA_API_KEY: string;
}

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

// Mirrors src/lib/NvidiaModels.ts. Cloudflare Pages Functions are bundled
// separately from src/, so this cannot import from there — it is duplicated on
// purpose and must be kept in step with the registry.
type Spec = { max: number; reason: boolean; overhead: number };
const MODELS: Record<string, Spec> = {
  "nvidia/nemotron-3-super-120b-a12b": { max: 16000, reason: true,  overhead: 2500 },
  "nvidia/nemotron-3-ultra-550b-a55b": { max: 16000, reason: true,  overhead: 3500 },
  "nvidia/nemotron-3-nano-30b-a3b":    { max: 8000,  reason: true,  overhead: 1500 },
  "zhipuai/glm-5.2":                   { max: 12000, reason: true,  overhead: 2000 },
  "deepseek-ai/deepseek-v4-pro":       { max: 12000, reason: true,  overhead: 3000 },
  "qwen/qwen3.5-397b-a17b":            { max: 12000, reason: true,  overhead: 1500 },
  "moonshotai/kimi-k2.6":              { max: 12000, reason: true,  overhead: 1500 },
  "openai/gpt-oss-120b":               { max: 8000,  reason: false, overhead: 0 },
  "meta/llama-3.3-70b-instruct":       { max: 8000,  reason: false, overhead: 0 },
};
const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const HARD_CEILING = 16000; // absolute cost guard, whatever a model claims

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors, ...extra },
  });

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  if (!env.NVIDIA_API_KEY) {
    return json({
      error: "NVIDIA is not configured on this deployment. Add NVIDIA_API_KEY as a Secret in Cloudflare (Settings → Environment variables → Production), then redeploy. Free key at build.nvidia.com.",
    }, 503);
  }

  let body: any;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid request body" }, 400); }

  const { sys, messages, model, max_tokens, reasoning, task } = body || {};
  if (!Array.isArray(messages)) return json({ error: "messages array required" }, 400);

  // ── 1. NO SILENT SUBSTITUTION ──
  const requested = String(model || "").trim() || DEFAULT_MODEL;
  const spec = MODELS[requested];
  if (!spec) {
    return json({
      error: "NVIDIA model not supported on this deployment: \"" + requested + "\". Nothing was sent and nothing was billed. Choose one of the available models.",
      requestedModel: requested,
      availableModels: Object.keys(MODELS),
    }, 400);
  }

  // ── 2. MODEL-AWARE BUDGET ──
  const wantThink = reasoning === undefined
    ? spec.reason
    : (reasoning === true || reasoning === "on");
  const reasoningOn = wantThink && spec.reason;
  const wanted = Math.max(Number(max_tokens) || 1500, 512);
  const budget = Math.min(wanted + (reasoningOn ? spec.overhead : 0), spec.max, HARD_CEILING);

  const payload: any = {
    model: requested,
    max_tokens: budget,
    temperature: reasoningOn ? 0.6 : 0.4,
    messages: [{ role: "system", content: sys || "" }, ...messages],
  };
  // Nemotron and several NIM reasoning models read this switch. Models that do
  // not recognise it ignore it, so sending it is safe.
  if (spec.reason) payload.chat_template_kwargs = { thinking: reasoningOn };

  const obs = {
    "x-oiq-model": requested,
    "x-oiq-reasoning": reasoningOn ? "on" : "off",
    "x-oiq-budget": String(budget),
    "x-oiq-task": String(task || "general").slice(0, 40),
  };

  try {
    const upstream = await fetch(NVIDIA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.NVIDIA_API_KEY },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      let reason = text.slice(0, 300);
      try { reason = JSON.parse(text)?.error?.message || reason; } catch { /* keep raw */ }
      // 402 = free credits exhausted. Say so plainly rather than as a generic failure.
      if (upstream.status === 402) {
        return json({ error: "NVIDIA free credits are exhausted for this key. Switch provider in Settings, or request more credits at forums.developer.nvidia.com." }, 402, obs);
      }
      if (upstream.status === 429) {
        return json({ error: "NVIDIA rate limit reached (about 40 requests per minute on the free tier). Retrying shortly, or switch provider in Settings." }, 429, obs);
      }
      return json({ error: "NVIDIA " + upstream.status + ": " + reason }, upstream.status, obs);
    }

    // ── 3. EMPTY IS AN ERROR, NOT A BLANK CARD ──
    try {
      const d = JSON.parse(text);
      const ch = d?.choices?.[0];
      const content = ch?.message?.content || "";
      if (!String(content).trim()) {
        const reasoned = String(ch?.message?.reasoning_content || "").trim();
        const fin = ch?.finish_reason || "unknown";
        if (reasoned && fin === "length") {
          return json({
            error: "NVIDIA (" + requested + ") used its whole output budget of " + budget + " tokens on reasoning and produced no answer. Reduce the prompt, or turn reasoning off for this task.",
          }, 502, obs);
        }
        return json({
          error: "NVIDIA (" + requested + ") returned an empty answer (finish_reason: " + fin + ").",
        }, 502, obs);
      }
    } catch { /* if it will not parse, pass it through and let the caller decide */ }

    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors, ...obs },
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("timeout") || msg.includes("aborted")) {
      return json({ error: "NVIDIA did not respond within 120 seconds. Large reasoning models can be slow on the free endpoint under load." }, 504, obs);
    }
    return json({ error: "NVIDIA proxy network error: " + msg }, 502, obs);
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { headers: cors });
}

// ─── FAST-FOLLOW: per-visitor daily quota via Cloudflare KV ──────────────────
// Once real traffic exists, add a KV namespace binding (NVIDIA_QUOTA) and:
//   const ip = request.headers.get("cf-connecting-ip") || "unknown";
//   const key = "nvq:" + ip + ":" + new Date().toISOString().slice(0,10);
//   const used = parseInt((await env.NVIDIA_QUOTA.get(key)) || "0");
//   if (used >= 20) return json({error:"Daily free limit reached — add your own key in Settings."}, 429);
//   await env.NVIDIA_QUOTA.put(key, String(used+1), { expirationTtl: 86400 });
// This stops one visitor draining the shared free-tier allowance.
