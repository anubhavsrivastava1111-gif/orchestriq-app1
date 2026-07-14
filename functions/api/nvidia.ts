// ═══════════════════════════════════════════════════════════════════════════
// CLOUDFLARE PAGES FUNCTION — Secure NVIDIA NIM proxy
// ─────────────────────────────────────────────────────────────────────────────
// Auto-routes to https://<your-site>/api/nvidia because this file lives at
// functions/api/nvidia.ts in the repo root (NOT inside src/).
//
// WHY THIS FILE EXISTS:
// NVIDIA's API key must never reach the browser. If it were placed in a
// VITE_-prefixed environment variable (the pattern this codebase already uses
// for Gemini/Groq/Claude "system keys"), Vite would bake the literal key
// string into the public JavaScript bundle — extractable by anyone who opens
// dev tools. This function keeps the key entirely server-side: it lives as a
// Cloudflare Pages "Secret" environment variable, readable only inside this
// function's execution context on Cloudflare's edge, never shipped to the
// client. The frontend calls this same-origin endpoint with no key at all.
//
// SETUP (one-time, in Cloudflare dashboard):
//   Pages → orchestriq → Settings → Environment variables → Production
//   Add variable: NVIDIA_API_KEY = nvapi-xxxxxxxxxxxx  (type: Secret, not Plaintext)
//   Get the key at: https://build.nvidia.com (free developer account)
//
// COST SAFEGUARD (interim, no KV required):
// max_tokens is hard-capped server-side regardless of what the client
// requests, bounding worst-case cost per call. A per-visitor daily quota via
// Cloudflare KV is the recommended fast-follow once real traffic exists —
// see the comment at the bottom of this file for the exact addition.
// ═══════════════════════════════════════════════════════════════════════════

interface Env {
  NVIDIA_API_KEY: string;
}

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const MAX_TOKENS_CAP = 4000; // hard ceiling regardless of client request
const ALLOWED_MODELS = new Set([
  "meta/llama-3.3-70b-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "nvidia/nemotron-4-340b-instruct",
  "mistralai/mixtral-8x22b-instruct-v0.1",
  "deepseek-ai/deepseek-r1",
  "meta/llama-3.1-405b-instruct",
  "microsoft/phi-3-medium-128k-instruct",
  "google/gemma-2-27b-it",
]);
const DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!env.NVIDIA_API_KEY) {
    return new Response(
      JSON.stringify({ error: "NVIDIA free tier not configured on this deployment yet." }),
      { status: 503, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const { sys, messages, model, max_tokens } = body || {};
  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages array required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const chosenModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
  const cappedTokens = Math.min(Number(max_tokens) || 1500, MAX_TOKENS_CAP);

  try {
    const upstream = await fetch(NVIDIA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + env.NVIDIA_API_KEY,
      },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: cappedTokens,
        temperature: 0.6,
        messages: [{ role: "system", content: sys || "" }, ...messages],
      }),
      signal: AbortSignal.timeout(90000),
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      let reason = text.slice(0, 300);
      try {
        reason = JSON.parse(text)?.error?.message || reason;
      } catch { /* keep raw */ }
      const status =
        upstream.status === 401 ? 401 :
        upstream.status === 429 ? 429 :
        upstream.status;
      return new Response(
        JSON.stringify({ error: "NVIDIA " + upstream.status + ": " + reason }),
        { status, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: "NVIDIA proxy network error: " + (e?.message || String(e)) }),
      { status: 502, headers: { "Content-Type": "application/json", ...cors } }
    );
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// ─── FAST-FOLLOW: per-visitor daily quota via Cloudflare KV ──────────────────
// Once real traffic exists, add a KV namespace binding (NVIDIA_QUOTA) and:
//   const ip = request.headers.get("cf-connecting-ip") || "unknown";
//   const key = "nvq:" + ip + ":" + new Date().toISOString().slice(0,10);
//   const used = parseInt((await env.NVIDIA_QUOTA.get(key)) || "0");
//   if (used >= 20) return new Response(JSON.stringify({error:"Daily free limit reached — add your own key in Settings for unlimited use."}),{status:429,headers:{...cors}});
//   await env.NVIDIA_QUOTA.put(key, String(used+1), {expirationTtl: 86400});
// This prevents one visitor from draining the shared free-tier allowance.
