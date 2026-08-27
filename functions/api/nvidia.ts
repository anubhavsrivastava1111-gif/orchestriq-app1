// ═══════════════════════════════════════════════════════════════════════════
// CLOUDFLARE PAGES FUNCTION — NVIDIA NIM proxy  (v3, SECURED)
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY AUDIT FINDING C-2 — CRITICAL, fixed here.
//
// v2 had NO authentication of any kind and CORS "*". Anyone on the internet
// could POST to https://<your-site>/api/nvidia from any origin and spend your
// NVIDIA credits. The rate-limit code existed only as a commented-out note.
//
// Four controls added, in the order an attacker meets them:
//
//   1. ORIGIN LOCK      requests must come from your own site, not "*"
//   2. AUTHENTICATION   a valid Supabase JWT is required; the signature is
//                       verified against the project JWKS, so a forged or
//                       expired token is rejected
//   3. PER-USER QUOTA   N requests per user per day, counted in KV
//   4. PER-IP QUOTA     a second ceiling per IP, so one person cannot farm
//                       accounts to multiply their allowance
//
// DEGRADES SAFELY: if the KV namespace is not bound, quotas are skipped but
// authentication is still enforced. Auth is never optional.
//
// SETUP (Cloudflare dashboard → your Pages project → Settings):
//   Environment variables (Production):
//     NVIDIA_API_KEY        = nvapi-…                (type: Secret)
//     SUPABASE_URL          = https://<ref>.supabase.co   (Plaintext)
//     ALLOWED_ORIGIN        = https://orchestriq.gorakhai.com (Plaintext)
//     NVIDIA_DAILY_PER_USER = 25                     (Plaintext, optional)
//     NVIDIA_DAILY_PER_IP   = 60                     (Plaintext, optional)
//   Bindings → KV namespace: create "OIQ_QUOTA", bind as OIQ_QUOTA
//   Then REDEPLOY — variables only apply to builds created after they are saved.
// ═══════════════════════════════════════════════════════════════════════════

interface Env {
  NVIDIA_API_KEY: string;
  SUPABASE_URL?: string;
  ALLOWED_ORIGIN?: string;
  NVIDIA_DAILY_PER_USER?: string;
  NVIDIA_DAILY_PER_IP?: string;
  OIQ_QUOTA?: KVNamespace;
}

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

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
const HARD_CEILING = 16000;

function corsFor(env: Env, request: Request) {
  // ORIGIN LOCK. "*" allowed any site on the internet to call this endpoint
  // with a stolen token, or a script to hammer it from anywhere.
  // Same-origin fetches from the app send NO Origin header at all, and an unset
  // ALLOWED_ORIGIN must never mean "block everything". Both were treated as a
  // foreign origin, which is a second way this endpoint could go dark.
  const allowed = (env.ALLOWED_ORIGIN || "").trim();
  const origin = (request.headers.get("Origin") || "").trim();
  const ok = !allowed || !origin || origin === allowed;
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": allowed || origin || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    },
  };
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...headers },
  });

// ── JWT verification against the Supabase JWKS ───────────────────────────────
// The signature is checked, not just decoded. Decoding alone would accept a
// token an attacker wrote themselves.
let _jwks: { keys: any[] } | null = null;
let _jwksAt = 0;

async function getJwks(supabaseUrl: string) {
  if (_jwks && Date.now() - _jwksAt < 3600_000) return _jwks;
  const r = await fetch(supabaseUrl.replace(/\/$/, "") + "/auth/v1/.well-known/jwks.json",
    { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("jwks fetch failed: " + r.status);
  _jwks = await r.json(); _jwksAt = Date.now();
  return _jwks!;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifyJwt(token: string, supabaseUrl: string): Promise<{ sub: string; role?: string } | null> {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));

    if (!payload?.sub) return null;
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;   // expired
    if (payload.aud && payload.aud !== "authenticated") return null;   // anon rejected

    const jwks = await getJwks(supabaseUrl);
    const jwk = jwks.keys.find((k: any) => k.kid === header.kid) || jwks.keys[0];
    if (!jwk) return null;

    const alg = header.alg === "RS256"
      ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      : { name: "ECDSA", namedCurve: "P-256" };
    const key = await crypto.subtle.importKey("jwk", jwk, alg as any, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      header.alg === "RS256" ? "RSASSA-PKCS1-v1_5" : { name: "ECDSA", hash: "SHA-256" } as any,
      key, b64urlToBytes(s), new TextEncoder().encode(h + "." + p),
    );
    return valid ? { sub: payload.sub, role: payload.role } : null;
  } catch {
    return null;
  }
}

// ── Quota counters ───────────────────────────────────────────────────────────
async function bump(kv: KVNamespace | undefined, key: string, limit: number): Promise<{ ok: boolean; used: number }> {
  if (!kv) return { ok: true, used: 0 };                 // no KV bound → skip quota, keep auth
  const used = parseInt((await kv.get(key)) || "0", 10) || 0;
  if (used >= limit) return { ok: false, used };
  await kv.put(key, String(used + 1), { expirationTtl: 86400 });
  return { ok: true, used: used + 1 };
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const cors = corsFor(env, request);

  // 1 ── ORIGIN
  if (!cors.ok) return json({ error: "Origin not allowed." }, 403, cors.headers);

  if (!env.NVIDIA_API_KEY) {
    return json({ error: "NVIDIA is not configured on this deployment: the NVIDIA_API_KEY secret is missing in Cloudflare Pages (Settings -> Environment variables -> Production), or the project has not been redeployed since it was added." }, 503, cors.headers);
  }

  // 2 ── AUTHENTICATION. Never optional.
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "Sign in required." }, 401, cors.headers);
  // The Supabase project URL is NOT a secret - it is already hardcoded in
  // src/lib/supabase.ts and visible to every visitor. Requiring it as an
  // environment variable added a setup step that, when missed, took NVIDIA down
  // completely. It now falls back to the known project URL, so the only variable
  // this endpoint truly needs is NVIDIA_API_KEY, exactly as before.
  const supaUrl = (env.SUPABASE_URL || "https://wfpqesnttzarfdfsghzw.supabase.co").trim();
  const user = await verifyJwt(token, supaUrl);
  if (!user) return json({ error: "Session invalid or expired. Sign in again." }, 401, cors.headers);

  // 3 ── QUOTAS
  const day = new Date().toISOString().slice(0, 10);
  const perUser = parseInt(env.NVIDIA_DAILY_PER_USER || "25", 10);
  const perIp = parseInt(env.NVIDIA_DAILY_PER_IP || "60", 10);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  const u = await bump(env.OIQ_QUOTA, "nvq:u:" + user.sub + ":" + day, perUser);
  if (!u.ok) {
    return json({ error: "Daily free-tier limit reached (" + perUser + " requests). Add your own API key in Settings to continue, or try again tomorrow." },
      429, { ...cors.headers, "x-oiq-quota": "user" });
  }
  const i = await bump(env.OIQ_QUOTA, "nvq:i:" + ip + ":" + day, perIp);
  if (!i.ok) {
    return json({ error: "Too many requests from this network today. Add your own API key in Settings to continue." },
      429, { ...cors.headers, "x-oiq-quota": "ip" });
  }

  // 4 ── PAYLOAD
  let body: any;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid request body" }, 400, cors.headers); }

  const { sys, messages, model, max_tokens, reasoning, task } = body || {};
  if (!Array.isArray(messages)) return json({ error: "messages array required" }, 400, cors.headers);
  if (messages.length > 40) return json({ error: "Too many messages in one request." }, 413, cors.headers);
  const approxChars = JSON.stringify(messages).length + String(sys || "").length;
  if (approxChars > 400_000) return json({ error: "Request too large." }, 413, cors.headers);

  const requested = String(model || "").trim() || DEFAULT_MODEL;
  const spec = MODELS[requested];
  if (!spec) {
    return json({
      error: "NVIDIA model not supported on this deployment: \"" + requested + "\". Nothing was sent and nothing was billed.",
      availableModels: Object.keys(MODELS),
    }, 400, cors.headers);
  }

  const wantThink = reasoning === undefined ? spec.reason : (reasoning === true || reasoning === "on");
  const reasoningOn = wantThink && spec.reason;
  const wanted = Math.max(Number(max_tokens) || 1500, 512);
  const budget = Math.min(wanted + (reasoningOn ? spec.overhead : 0), spec.max, HARD_CEILING);

  const payload: any = {
    model: requested, max_tokens: budget,
    temperature: reasoningOn ? 0.6 : 0.4,
    messages: [{ role: "system", content: sys || "" }, ...messages],
  };
  if (spec.reason) payload.chat_template_kwargs = { thinking: reasoningOn };

  const obs = {
    ...cors.headers,
    "x-oiq-model": requested,
    "x-oiq-reasoning": reasoningOn ? "on" : "off",
    "x-oiq-budget": String(budget),
    "x-oiq-quota-used": String(u.used) + "/" + String(perUser),
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
      if (upstream.status === 402) return json({ error: "NVIDIA free credits are exhausted for this key." }, 402, obs);
      if (upstream.status === 429) return json({ error: "NVIDIA rate limit reached (about 40 requests per minute on the free tier)." }, 429, obs);
      return json({ error: "NVIDIA " + upstream.status + ": " + reason }, upstream.status, obs);
    }

    try {
      const d = JSON.parse(text);
      const ch = d?.choices?.[0];
      const content = ch?.message?.content || "";
      if (!String(content).trim()) {
        const reasoned = String(ch?.message?.reasoning_content || "").trim();
        const fin = ch?.finish_reason || "unknown";
        if (reasoned && fin === "length") {
          return json({ error: "NVIDIA (" + requested + ") used its whole output budget of " + budget + " tokens on reasoning and produced no answer." }, 502, obs);
        }
        return json({ error: "NVIDIA (" + requested + ") returned an empty answer (finish_reason: " + fin + ")." }, 502, obs);
      }
    } catch { /* unparseable — pass through */ }

    return new Response(text, { status: 200, headers: { "Content-Type": "application/json", ...obs } });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("timeout") || msg.includes("aborted")) {
      return json({ error: "NVIDIA did not respond within 120 seconds." }, 504, obs);
    }
    return json({ error: "NVIDIA proxy network error: " + msg }, 502, obs);
  }
}

export async function onRequestOptions(context: { request: Request; env: Env }): Promise<Response> {
  const cors = corsFor(context.env, context.request);
  return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
}
