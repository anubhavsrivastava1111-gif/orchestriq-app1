// functions/api/admin.ts
// ─────────────────────────────────────────────────────────────────────────────
// OWNER-ONLY ADMIN ENDPOINT
//
// WHY THIS FILE HAS TO EXIST AT ALL.
//
// Creating an account for someone else, and changing someone else's password,
// cannot be done from the browser. They require Supabase's SERVICE ROLE key,
// which bypasses every row-level security policy in the database. If that key
// ever reached the front end it would be readable by anyone in DevTools, and
// every protection built over the last several sessions would be worthless in
// the same instant.
//
// So the key lives in Cloudflare as a secret and never leaves the server. This
// endpoint is the only thing that holds it.
//
// THE GUARD, in order, and every step matters:
//   1. Origin must be one of ours.
//   2. Caller must present a valid Supabase session token.
//   3. That token is verified against Supabase, not merely decoded. A JWT is
//      base64, not encryption - anyone can write one that SAYS super_admin.
//   4. The caller's role is read FROM THE DATABASE, never from the token.
//   5. Only then does the service role key get used.
//
// SETUP in Cloudflare Pages → Settings → Environment variables (Production):
//   SUPABASE_SERVICE_ROLE_KEY = eyJ...   (type: SECRET, never Plaintext)
//   ALLOWED_ORIGINS           = https://orchestriq.gorakhai.com
// ─────────────────────────────────────────────────────────────────────────────

interface Env {
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_URL?: string;
  ALLOWED_ORIGINS?: string;
}

const SUPA_DEFAULT = "https://wfpqesnttzarfdfsghzw.supabase.co";

function corsFor(env: Env, request: Request) {
  const allowed = (env.ALLOWED_ORIGINS || "https://orchestriq.gorakhai.com,https://gorakhai.com")
    .split(",").map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  const ok = !origin || allowed.includes(origin);
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": origin && ok ? origin : allowed[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json",
    } as Record<string, string>,
  };
}

const json = (b: unknown, s = 200, h: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...h } });

export async function onRequestOptions(context: { request: Request; env: Env }) {
  const cors = corsFor(context.env, context.request);
  return new Response(null, { status: 204, headers: cors.headers });
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const cors = corsFor(env, request);
  if (!cors.ok) return json({ error: "Origin not allowed." }, 403, cors.headers);

  const supaUrl = (env.SUPABASE_URL || SUPA_DEFAULT).replace(/\/$/, "");
  const svc = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!svc) {
    return json({ error: "Admin endpoint is not configured: SUPABASE_SERVICE_ROLE_KEY is missing in Cloudflare Pages environment variables." }, 503, cors.headers);
  }

  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "Sign in required." }, 401, cors.headers);

  // Verify the token WITH Supabase rather than decoding it here. A JWT is
  // base64-encoded, not encrypted: anyone can craft one claiming to be the
  // owner. Only Supabase can say whether it is real.
  const who = await fetch(supaUrl + "/auth/v1/user", {
    headers: { Authorization: "Bearer " + token, apikey: svc },
  });
  if (!who.ok) return json({ error: "Session invalid or expired. Sign in again." }, 401, cors.headers);
  const caller = await who.json().catch(() => null) as any;
  const callerId = caller?.id;
  if (!callerId) return json({ error: "Session invalid." }, 401, cors.headers);

  // Read the role from the DATABASE. Never from the token, and never from the
  // request body. A role claim that travels with the request is a role claim
  // the caller can edit.
  const prof = await fetch(supaUrl + "/rest/v1/profiles?id=eq." + callerId + "&select=role,email", {
    headers: { apikey: svc, Authorization: "Bearer " + svc },
  });
  const rows = await prof.json().catch(() => []) as any[];
  if (!Array.isArray(rows) || !rows.length || rows[0].role !== "super_admin") {
    return json({ error: "Not permitted: super admin only." }, 403, cors.headers);
  }

  let body: any;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid request body" }, 400, cors.headers); }
  const action = String(body?.action || "");

  const admin = (path: string, init: RequestInit) =>
    fetch(supaUrl + "/auth/v1/admin" + path, {
      ...init,
      headers: { apikey: svc, Authorization: "Bearer " + svc, "Content-Type": "application/json" },
    });

  try {
    // ── CREATE AN ACCOUNT FOR SOMEONE ────────────────────────────────────────
    if (action === "create_user") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: "Enter a valid email address." }, 400, cors.headers);
      }
      if (password.length < 8) {
        return json({ error: "Password must be at least 8 characters." }, 400, cors.headers);
      }

      // The 57-seat cap is enforced by a database trigger, but check it here
      // too so the owner gets a clear message instead of a raw trigger error.
      const cnt = await fetch(supaUrl + "/rest/v1/rpc/admin_signup_status", {
        method: "POST", headers: { apikey: svc, Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: "{}",
      });
      const status = await cnt.json().catch(() => null) as any;
      if (status && typeof status.remaining === "number" && status.remaining <= 0) {
        return json({ error: "All " + status.max_users + " seats are taken. Raise the cap before adding another account." }, 409, cors.headers);
      }

      const r = await admin("/users", {
        method: "POST",
        body: JSON.stringify({
          email, password,
          email_confirm: true,                 // owner-created, so no email round trip
          user_metadata: { full_name: fullName || email },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: (d as any)?.msg || (d as any)?.message || "Could not create the account." }, r.status, cors.headers);
      return json({ ok: true, user_id: (d as any)?.id, email }, 200, cors.headers);
    }

    // ── SET SOMEONE'S PASSWORD ───────────────────────────────────────────────
    if (action === "set_password") {
      const userId = String(body.user_id || "");
      const password = String(body.password || "");
      if (!userId) return json({ error: "user_id is required." }, 400, cors.headers);
      if (password.length < 8) {
        return json({ error: "Password must be at least 8 characters." }, 400, cors.headers);
      }
      const r = await admin("/users/" + userId, {
        method: "PUT", body: JSON.stringify({ password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: (d as any)?.msg || "Could not change the password." }, r.status, cors.headers);
      // Deliberately NOT returning the password. It is not echoed anywhere, and
      // it is never written to a log.
      return json({ ok: true, user_id: userId }, 200, cors.headers);
    }

    // ── SEND A PASSWORD RESET LINK INSTEAD ───────────────────────────────────
    // Preferable to setting a password by hand: the owner never learns the
    // customer's password, so there is nothing to leak or to be accused of.
    if (action === "send_reset") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return json({ error: "email is required." }, 400, cors.headers);
      const r = await fetch(supaUrl + "/auth/v1/recover", {
        method: "POST",
        headers: { apikey: svc, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) return json({ error: "Could not send the reset email." }, r.status, cors.headers);
      return json({ ok: true, email }, 200, cors.headers);
    }

    // ── DELETE AN ACCOUNT ────────────────────────────────────────────────────
    if (action === "delete_user") {
      const userId = String(body.user_id || "");
      if (!userId) return json({ error: "user_id is required." }, 400, cors.headers);
      // Deleting yourself would leave the product with no administrator and no
      // way to appoint one.
      if (userId === callerId) {
        return json({ error: "You cannot delete your own account." }, 400, cors.headers);
      }
      const r = await admin("/users/" + userId, { method: "DELETE" });
      if (!r.ok) return json({ error: "Could not delete the account." }, r.status, cors.headers);
      return json({ ok: true }, 200, cors.headers);
    }

    return json({ error: "Unknown action: " + action }, 400, cors.headers);
  } catch (e: any) {
    // Type and message only. Never the request body - it contains passwords.
    console.log("[admin] " + (e?.name || "Error") + ": " + String(e?.message || "").slice(0, 160));
    return json({ error: "Admin action failed." }, 500, cors.headers);
  }
}
