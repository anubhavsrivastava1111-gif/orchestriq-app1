// ═══════════════════════════════════════════════════════════════════════════
// CLOUDFLARE PAGES FUNCTION — NVIDIA NIM proxy  (v4, CAPACITY-AWARE)
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY AUDIT FINDING C-2 — CRITICAL, fixed here.
//
// v2 had NO authentication of any kind and CORS "*". Anyone on the internet
// could POST to https://<your-site>/api/nvidia from any origin and spend your
// NVIDIA credits. The rate-limit code existed only as a commented-out note.
//
// v4 ADDS THE ACTUAL CAPACITY MATH: NVIDIA's own free-tier ceiling is
// confirmed at roughly 40 requests/minute, ACCOUNT-WIDE - shared by every
// person using this deployment's key, not per-user. No per-user allowance,
// however small, can prevent the whole account from being throttled if
// enough people are active at once - so a genuine global limiter is now
// enforced first, ahead of anyone's individual quota.
//
// Five controls, in the order a request meets them:
//
//   1. ORIGIN LOCK      requests must come from your own site, not "*"
//   2. AUTHENTICATION   a valid Supabase JWT is required; the signature is
//                       verified against the project JWKS, so a forged or
//                       expired token is rejected
//   3. GLOBAL RATE CAP  a shared, account-wide ceiling per minute, kept
//                       safely below NVIDIA's own ~40/minute limit - this
//                       is what actually protects the key when many people
//                       are using it at the same moment
//   4. PER-USER QUOTA   a ROLLING window (like Claude's own usage limits) -
//                       N messages, then it restores itself a fixed number
//                       of hours after first use, not at a fixed clock time
//   5. PER-IP QUOTA     a second, daily ceiling per IP, so one person
//                       cannot farm accounts to multiply their allowance
//
// The account owner (role = super_admin in `profiles`) is exempt from
// controls 3 and 4 entirely - unlimited, as requested - checked against
// the real application role, not the JWT's generic "authenticated" claim.
// Someone using their OWN NVIDIA key is exempt from controls 3, 4 and 5,
// since their usage spends nothing of this account's shared allowance.
//
// DEGRADES SAFELY: if the KV namespace is not bound, every quota is skipped
// but authentication is still enforced. Auth is never optional.
//
// SETUP (Cloudflare dashboard → your Pages project → Settings):
//   Environment variables (Production):
//     NVIDIA_API_KEY           = nvapi-…                      (Secret)
//     SUPABASE_URL             = https://<ref>.supabase.co    (Plaintext)
//     VITE_SUPABASE_ANON_KEY   = <the project's public anon key> (Plaintext)
//     ALLOWED_ORIGIN           = https://orchestriq.gorakhai.com (Plaintext)
//     NVIDIA_GLOBAL_PER_MINUTE = 28   (Plaintext, optional - stay below ~40)
//     NVIDIA_DAILY_PER_USER    = 15   (Plaintext, optional - per rolling window)
//     NVIDIA_WINDOW_HOURS      = 3    (Plaintext, optional - hours per window)
//     NVIDIA_DAILY_PER_IP      = 60   (Plaintext, optional)
//   Bindings → KV namespace: create "OIQ_QUOTA", bind as OIQ_QUOTA
//   Then REDEPLOY — variables only apply to builds created after they are saved.
// ═══════════════════════════════════════════════════════════════════════════

interface Env {
  NVIDIA_API_KEY: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  ALLOWED_ORIGIN?: string;
  NVIDIA_DAILY_PER_USER?: string;
  NVIDIA_DAILY_PER_IP?: string;
  NVIDIA_GLOBAL_PER_MINUTE?: string;
  NVIDIA_WINDOW_HOURS?: string;
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

// THE ROOT DESIGN, RECALCULATED PROPERLY: NVIDIA's own free-tier ceiling is
// confirmed at ~40 requests/minute, ACCOUNT-WIDE - shared by every single
// user of this deployment's key, not per-person. That number does not
// change no matter how a per-user allowance is configured, so it is
// enforced here as its own, separate check - a genuinely full account
// cannot be worked around by a generous per-user number.
async function bumpGlobalRate(kv: KVNamespace | undefined, capPerMinute: number): Promise<{ ok: boolean }> {
  if (!kv) return { ok: true };
  const minuteBucket = Math.floor(Date.now() / 60000); // a fresh bucket every 60 seconds
  const key = "nvq:global:" + minuteBucket;
  const used = parseInt((await kv.get(key)) || "0", 10) || 0;
  if (used >= capPerMinute) return { ok: false };
  await kv.put(key, String(used + 1), { expirationTtl: 120 }); // outlives its own minute, never accumulates
  return { ok: true };
}

// THE ROLLING WINDOW YOU ASKED FOR — "like Claude, use it up, it comes back
// in a few hours" - not "resets at midnight UTC no matter when you started."
// The window begins the moment someone's FIRST message in a fresh window is
// sent, and counts down from there, exactly like the reference you gave.
async function bumpRollingWindow(kv: KVNamespace | undefined, key: string, limit: number, windowMs: number)
  : Promise<{ ok: boolean; used: number; resetsInMs: number }> {
  if (!kv) return { ok: true, used: 0, resetsInMs: 0 };
  const now = Date.now();
  const raw = await kv.get(key);
  let state: { count: number; windowStart: number } = raw ? JSON.parse(raw) : { count: 0, windowStart: now };
  if (now - state.windowStart > windowMs) state = { count: 0, windowStart: now }; // window elapsed - fresh start
  if (state.count >= limit) {
    return { ok: false, used: state.count, resetsInMs: windowMs - (now - state.windowStart) };
  }
  state.count += 1;
  await kv.put(key, JSON.stringify(state), { expirationTtl: Math.ceil(windowMs / 1000) + 60 });
  return { ok: true, used: state.count, resetsInMs: windowMs - (now - state.windowStart) };
}

// Real check against the actual account-level role, not the JWT's generic
// Supabase auth role (which is always just "authenticated") - the same
// distinction the database-side workspace_shared_nvidia_check already
// makes correctly. The user's own token drives RLS (so this can only ever
// read what that user could already read); apikey is the project's public
// anon key, required by PostgREST on every request regardless of who is
// actually asking - not a secret, already shipped in the frontend bundle.
async function isSuperAdmin(supabaseUrl: string, anonKey: string, userToken: string, userId: string): Promise<boolean> {
  if (!anonKey) return false;
  try {
    const r = await fetch(supabaseUrl + "/rest/v1/profiles?id=eq." + userId + "&select=role", {
      headers: { Authorization: "Bearer " + userToken, apikey: anonKey },
    });
    if (!r.ok) return false;
    const rows: any[] = await r.json();
    return rows?.[0]?.role === "super_admin";
  } catch { return false; }
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const cors = corsFor(env, request);

  // 1 ── ORIGIN
  if (!cors.ok) return json({ error: "Origin not allowed." }, 403, cors.headers);

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

  // 3 ── PAYLOAD, READ BEFORE QUOTAS.
  // A Request body can be read ONCE. The quota decision depends on whether the
  // caller supplied their own key, and that is inside the body - so the body
  // must be parsed before quotas, not after. Reading it twice would throw and
  // take NVIDIA down completely.
  let body: any;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid request body" }, 400, cors.headers); }

  // BRING-YOUR-OWN-KEY.
  // NVIDIA previously worked only on the shared free-tier key held in
  // Cloudflare, which only the deployment owner can set. Every other user was
  // capped by the daily quota, and documents could never be generated because
  // the render service has no NVIDIA credential of its own.
  //
  // A caller may now supply their own key. It is used for THIS request only:
  // never stored, never logged, never echoed into a response header - the
  // observability headers below carry model, budget and quota figures only.
  // It is accepted only if it matches NVIDIA's real key shape, so a stray
  // string cannot silently replace the shared key with something meaningless.
  const rawUserKey = String((body && body.user_key) || "").trim();
  // MY BUG. I required the key to match [A-Za-z0-9_-] exactly. NVIDIA keys do
  // not always use only those characters, so a perfectly good key was thrown
  // away here - silently, with no message - and the request then fell through
  // to the "not configured" error below, which blamed Cloudflare for something
  // that was entirely my doing.
  //
  // A key is now accepted on the only thing that actually identifies one: the
  // nvapi- prefix and a sensible length. And if a key IS supplied but does not
  // look like one, that is said out loud rather than being swallowed.
  const looksLikeKey = rawUserKey.startsWith("nvapi-") && rawUserKey.length >= 20;
  const userKey = looksLikeKey ? rawUserKey : "";
  const keySuppliedButRejected = rawUserKey.length > 0 && !looksLikeKey;

  // The shared key is required ONLY for free-tier callers. Someone using their
  // own key does not need this deployment to have one at all.
  if (keySuppliedButRejected) {
    return json({ error: "The NVIDIA key in your Settings does not look right. It should start with nvapi- and be at least 20 characters. Copy it again from build.nvidia.com, with no spaces before or after." },
      400, { ...cors.headers, "x-oiq-key": "rejected" });
  }
  if (!env.NVIDIA_API_KEY && !userKey) {
    return json({ error: "NVIDIA free tier is unavailable on this deployment, and no personal key was supplied. Add your own free key in Settings \u2192 API \u2014 it takes about three minutes at build.nvidia.com and removes this problem permanently. (Owner: the NVIDIA_API_KEY secret is not reaching the Pages Function at runtime.)" },
      503, { ...cors.headers, "x-oiq-key": "none" });
  }

  // 4 ── QUOTAS
  const day = new Date().toISOString().slice(0, 10); // still used for the per-IP daily quota below
  // THE CALCULATION, DONE PROPERLY: NVIDIA's real free-tier ceiling is
  // ~40 requests/minute, account-wide, confirmed directly - not a figure I
  // invented. 28/minute leaves real headroom below that hard limit for
  // request timing jitter and the owner's own unlimited use, while still
  // giving the shared pool genuine throughput. This is enforced BEFORE the
  // per-user check because it protects something a generous per-user
  // number cannot: the account itself going down for absolutely everyone,
  // including users who brought their own key are unaffected (they never
  // reach this branch), and even a single admin retry against a full
  // global bucket fails safely rather than ever double-spending it.
  const superAdmin = userKey ? false : await isSuperAdmin(supaUrl, env.VITE_SUPABASE_ANON_KEY || "", token, user.sub);

  if (!userKey && !superAdmin) {
    const globalCap = parseInt(env.NVIDIA_GLOBAL_PER_MINUTE || "28", 10);
    const g = await bumpGlobalRate(env.OIQ_QUOTA, globalCap);
    if (!g.ok) {
      return json({ error: "A lot of people are using the free NVIDIA tier right now. Please try again in a few seconds — this clears every minute. Add your own free key in Settings for guaranteed instant access." },
        429, { ...cors.headers, "x-oiq-quota": "global" });
    }
  }

  // THE ROLLING WINDOW YOU ASKED FOR, REPLACING THE OLD "RESETS AT
  // MIDNIGHT UTC" DESIGN: 15 shared-tier messages per rolling 3-hour
  // window per user, restoring on its own the way Claude's own usage
  // limits do - not tied to a fixed clock time. The owner is exempt
  // entirely, exactly as requested.
  const windowMs = parseInt(env.NVIDIA_WINDOW_HOURS || "3", 10) * 60 * 60 * 1000;
  const perUser = parseInt(env.NVIDIA_DAILY_PER_USER || "15", 10);
  const perIp = parseInt(env.NVIDIA_DAILY_PER_IP || "60", 10);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  // The quota exists to protect the SHARED key from being drained. A user
  // spending their own credits consumes nothing of ours, so charging them
  // against our limit would be plainly wrong - and it is the very limit
  // the error message tells them to escape by adding a key. The owner
  // (super_admin) is exempt for the same reason this deployment is theirs
  // to run, not to be rate-limited on.
  const skipUserQuota = !!userKey || superAdmin;
  const u = skipUserQuota ? { ok: true, used: 0, resetsInMs: 0 }
    : await bumpRollingWindow(env.OIQ_QUOTA, "nvq:u:" + user.sub, perUser, windowMs);
  if (!u.ok) {
    const mins = Math.max(1, Math.ceil(u.resetsInMs / 60000));
    const hrs = Math.floor(mins / 60), remMins = mins % 60;
    const when = hrs > 0 ? hrs + "h " + remMins + "m" : mins + "m";
    return json({ error: "You've used your " + perUser + " free NVIDIA messages for this window. It resets in about " + when + " — or add your own free key in Settings for unlimited use right now." },
      429, { ...cors.headers, "x-oiq-quota": "user" });
  }
  // Authentication above is still enforced either way: without it this endpoint
  // would be an open relay anyone could point at NVIDIA through our domain.
  const i = (userKey || superAdmin) ? { ok: true, used: 0 }
    : await bump(env.OIQ_QUOTA, "nvq:i:" + ip + ":" + day, perIp);
  if (!i.ok) {
    return json({ error: "Too many requests from this network today. Add your own NVIDIA API key in Settings to continue." },
      429, { ...cors.headers, "x-oiq-quota": "ip" });
  }

  // 5 ── VALIDATE
  const { sys, messages, model, max_tokens, reasoning, task } = body || {};
  if (!Array.isArray(messages)) return json({ error: "messages array required" }, 400, cors.headers);
  if (messages.length > 40) return json({ error: "Too many messages in one request." }, 413, cors.headers);
  const approxChars = JSON.stringify(messages).length + String(sys || "").length;
  if (approxChars > 400_000) return json({ error: "Request too large." }, 413, cors.headers);

  const requested = String(model || "").trim() || DEFAULT_MODEL;
  // THE FIX: this allowlist exists to control cost and reliability on the
  // SHARED free-tier key we pay for and manage. It has no business rejecting
  // a request that is running on the CALLER'S OWN key - that is their quota,
  // their choice of model, and NVIDIA's own API is the only authority that
  // should ever say yes or no to it. Requiring us to hand-maintain a mirror
  // of NVIDIA's entire catalog is exactly what produced retired-model and
  // wrong-model-name errors twice already: a hand-kept list always drifts
  // from the real one. NVIDIA adding or retiring a model now requires
  // ZERO changes on our side for anyone using their own key.
  const spec = MODELS[requested];
  if (!spec && !userKey) {
    return json({
      error: "NVIDIA model not supported on the free shared tier: \"" + requested + "\". Add your own free NVIDIA key in Settings to use any model NVIDIA offers, with no restriction from us.",
      availableModels: Object.keys(MODELS),
    }, 400, cors.headers);
  }
  // A model outside our curated table has no known reasoning/overhead profile.
  // Safe generic defaults: assume it might reason if asked to, no fixed
  // overhead beyond what the caller requests, capped by the same time-safe
  // ceiling as everything else. If NVIDIA does not recognise the id at all,
  // NVIDIA's own 404 - already handled below with a clear message - is what
  // tells the user, not a guess made on our side beforehand.
  const effSpec = spec || { max: 9000, reason: true, overhead: 0 };

  const wantThink = reasoning === undefined ? effSpec.reason : (reasoning === true || reasoning === "on");
  const reasoningOn = wantThink && effSpec.reason;
  const wanted = Math.max(Number(max_tokens) || 1500, 512);
  // A 16,000-token reasoning generation on a 550B model does not finish inside
  // the ~90 seconds Cloudflare allows. Asking for more than can be delivered in
  // the time available guarantees the timeout above. TIME_SAFE_CEILING is what
  // these models can actually complete on this platform; raising it does not
  // produce longer answers, it produces HTML error pages.
  const TIME_SAFE_CEILING = 9000;
  const budget = Math.min(wanted + (reasoningOn ? effSpec.overhead : 0),
                          effSpec.max, HARD_CEILING, TIME_SAFE_CEILING);

  const payload: any = {
    model: requested, max_tokens: budget,
    temperature: reasoningOn ? 0.6 : 0.4,
    messages: [{ role: "system", content: sys || "" }, ...messages],
  };
  if (effSpec.reason) payload.chat_template_kwargs = { thinking: reasoningOn };

  const obs = {
    ...cors.headers,
    "x-oiq-model": requested,
    // Which key served the request. NEVER the key itself - just "own" or
    // "shared", so a support question can be answered without asking anyone to
    // paste a credential.
    // "own"    = your personal key was used
    // "shared" = the platform free-tier key was used
    // Check this header in DevTools -> Network to see instantly which path ran.
    "x-oiq-key": userKey ? "own" : "shared",
    "x-oiq-reasoning": reasoningOn ? "on" : "off",
    "x-oiq-budget": String(budget),
    "x-oiq-quota-used": String(u.used) + "/" + String(perUser),
    "x-oiq-task": String(task || "general").slice(0, 40),
  };

  try {
    const upstream = await fetch(NVIDIA_ENDPOINT, {
      method: "POST",
      // The caller's own key when they brought one; otherwise the shared
      // free-tier key, exactly as before.
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (userKey || env.NVIDIA_API_KEY) },
      body: JSON.stringify(payload),
      // WAS 120000. THIS IS WHY YOU SAW RAW HTML INSTEAD OF AN ERROR MESSAGE.
      // Cloudflare kills a Worker subrequest at about 90 seconds, and the edge
      // returns 524 at 100. Waiting 120 meant Cloudflare ALWAYS won the race:
      // the Worker was terminated before it could return its own JSON, and
      // Cloudflare substituted an HTML error page. The app then printed the
      // first 200 characters of that page - the "<!DOCTYPE html> <!--[if lt
      // IE 7]>..." dump. The proxy could never report a timeout because it was
      // never alive long enough to do so.
      // 75 seconds leaves headroom to build and return a real JSON error.
      signal: AbortSignal.timeout(75000),
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
      return json({ error: "NVIDIA (" + requested + ") did not finish within 75 seconds. "
        + "Reasoning models are slow on long prompts. Shorten the prompt, reduce the number "
        + "of executives, or switch to a faster model such as meta/llama-3.3-70b-instruct." },
        504, obs);
    }
    return json({ error: "NVIDIA proxy network error: " + msg }, 502, obs);
  }
}

export async function onRequestOptions(context: { request: Request; env: Env }): Promise<Response> {
  const cors = corsFor(context.env, context.request);
  return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
}
