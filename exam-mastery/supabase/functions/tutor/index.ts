// Organisation AI tutor. Holds the org's Anthropic key (secret ANTHROPIC_API_KEY) server-side.
// Only ACTIVE, invited users can call it; per-user daily limit and model come from public.app_config (admin-controlled).
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SYSTEM = `You are "Mentor", a patient exam coach inside the Exam Mastery app for CPA (US) and FRM candidates, many of them in India.
How to teach:
- Start with a one-line plain-language answer anyone could understand, then a short everyday example (Indian context welcome).
- Then give the exam-level explanation: rule or formula, worked numbers step by step, and the common trap.
- Keep answers short and structured. Use numbered steps for calculations.
Accuracy rules:
- Cite the standard or source where relevant (e.g. ASC 842, IRC §1031, GARP FRM Part I – VRM, BCBS 238).
- Tax amounts, thresholds, fees, exam dates and state-board rules change: never state current-year figures as certain; tell the student to confirm with AICPA/NASBA/state board/IRS/GARP.
- If unsure, say so. Never invent rules, numbers or citations. Do not reproduce copyrighted exam questions.`
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-fable-5-2'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json(401, { error: 'Please sign in again.' })
    const admin = createClient(url, service)
    const { data: prof } = await admin.from('profiles').select('status').eq('id', user.id).maybeSingle()
    if (prof?.status !== 'active') return json(403, { error: 'Your access has been revoked. Contact the app admin.' })

    const { data: cfgRows } = await admin.from('app_config').select('key,value').in('key', ['tutor_enabled', 'tutor_daily_limit', 'tutor_model'])
    const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]))
    if (cfg.tutor_enabled === false) return json(503, { error: 'The organisation tutor is switched off. You can add your own AI key in Me → AI tutor settings.' })
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json(503, { error: 'The organisation tutor is not set up yet (no API key). Ask the admin, or add your own AI key in Me → AI tutor settings.' })

    const since = new Date(); since.setUTCHours(0, 0, 0, 0)
    const { count } = await admin.from('tutor_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since.toISOString())
    const limit = Number(cfg.tutor_daily_limit ?? 40)
    if ((count ?? 0) >= limit) return json(429, { error: `Daily tutor limit reached (${limit}). It resets at midnight UTC, or use your own AI key.` })

    const body = await req.json()
    const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-20)
      .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 8000) }))
    if (!messages.length || messages[0].role !== 'user') return json(400, { error: 'Empty question.' })
    const context = typeof body.context === 'string' ? body.context.slice(0, 6000) : ''
    const model = typeof cfg.tutor_model === 'string' && cfg.tutor_model ? cfg.tutor_model : 'claude-opus-5-5'

    const client = new Anthropic({ apiKey: key })
    const msg = await client.beta.messages.create({
      model, max_tokens: 16000,
      system: context ? `${SYSTEM}\n\nCurrent study context (from the app's knowledge base):\n${context}` : SYSTEM,
      output_config: { effort: 'low' },
      messages,
      ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    })
    await admin.from('tutor_usage').insert({ user_id: user.id, model: msg.model, input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens })
    if (msg.stop_reason === 'refusal') return json(200, { text: 'I can\'t help with that request. Try rephrasing it as a study question.' })
    return json(200, { text: msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('') })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(502, { error: 'The organisation API key was rejected. Ask the admin to check it.' })
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'The tutor is busy (rate limited). Try again in a minute.' })
    if (e instanceof Anthropic.APIError) return json(502, { error: `AI provider error ${e.status}.` })
    return json(500, { error: 'Tutor error. Please try again.' })
  }
})
