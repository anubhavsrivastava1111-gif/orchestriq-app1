// AI tutor providers.
// - 'org': the organisation's Claude key, kept server-side in a Supabase Edge Function (users never see it).
// - 'anthropic' | 'openai' | 'gemini' | 'deepseek': the USER's own key, stored only on this device (never synced to the cloud).
import Anthropic from '@anthropic-ai/sdk'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { backend } from './backend'

export type Provider = 'org' | 'anthropic' | 'openai' | 'gemini' | 'deepseek'
export type AiSettings = { provider: Provider; keys: Partial<Record<Provider, string>>; models: Partial<Record<Provider, string>> }
export type ChatMsg = { role: 'user' | 'assistant'; content: string }

export const PROVIDERS: { id: Provider; name: string; keyHint: string; keyUrl: string; defaultModel: string }[] = [
  { id: 'org', name: 'Organisation tutor (Claude)', keyHint: '', keyUrl: '', defaultModel: 'claude-opus-5-5' },
  { id: 'anthropic', name: 'Claude: my own Anthropic key', keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys', defaultModel: 'claude-opus-5-5' },
  { id: 'openai', name: 'OpenAI: my own key', keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys', defaultModel: '' },
  { id: 'gemini', name: 'Google Gemini: my own key', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey', defaultModel: '' },
  { id: 'deepseek', name: 'DeepSeek: my own key', keyHint: 'sk-…', keyUrl: 'https://platform.deepseek.com/api_keys', defaultModel: 'deepseek-chat' },
]

const KEY = 'exam-mastery.ai' // device-only; deliberately NOT part of synced state
export function loadAi(): AiSettings {
  try { return { provider: 'org', keys: {}, models: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { provider: 'org', keys: {}, models: {} } }
}
export function saveAi(s: AiSettings) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } }
export const modelFor = (s: AiSettings, p: Provider) => s.models[p] || PROVIDERS.find((x) => x.id === p)!.defaultModel

export const TUTOR_SYSTEM = `You are "Mentor", a patient exam coach inside the Exam Mastery app for CPA (US) and FRM candidates, many of them in India.
How to teach:
- Start with a one-line plain-language answer anyone could understand, then a short everyday example (Indian context welcome: chai stall, kirana shop, EMI, rupees).
- Then give the exam-level explanation: rule or formula, worked numbers step by step, and the common trap.
- Keep answers short and structured. Use numbered steps for calculations and show each arithmetic step.
- If the student is wrong, say so kindly and show exactly where the reasoning broke.
Accuracy rules:
- Cite the standard or source where relevant (e.g. ASC 842, IRC §1031, GARP FRM Part I – VRM, Basel BCBS 238).
- Tax amounts, thresholds, fees, exam dates and state-board rules change. Never state current-year figures as certain; tell the student to confirm with AICPA/NASBA/state board/IRS/GARP.
- If you are not sure, say so. Never invent rules, numbers or citations.
- Do not reproduce copyrighted exam questions or claim any question is a real past exam question.`

/** Send a chat turn. `onText` streams partial text where the provider supports it. Returns the full reply. */
export async function chat(s: AiSettings, history: ChatMsg[], context: string, onText: (t: string) => void): Promise<string> {
  const p = s.provider, model = modelFor(s, p), system = context ? `${TUTOR_SYSTEM}\n\nCurrent study context (from the app's knowledge base):\n${context}` : TUTOR_SYSTEM
  if (p === 'org') {
    const text = await backend.tutor(history, context, model)
    onText(text); return text
  }
  const key = s.keys[p]
  if (!key) throw new Error('Add your API key in Me → AI tutor settings first.')
  if (!model) throw new Error('Choose a model: tap "Load models" in Me → AI tutor settings.')
  if (p === 'anthropic') return claudeChat(key, model, system, history, onText)
  if (p === 'gemini') { const t = await geminiChat(key, model, system, history); onText(t); return t }
  const base = p === 'openai' ? 'https://api.openai.com/v1' : 'https://api.deepseek.com'
  const t = await openaiCompatChat(base, key, model, system, history); onText(t); return t
}

// Models that accept the server-side refusal fallback ("default" routing).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-fable-5-2'])

async function claudeChat(apiKey: string, model: string, system: string, history: ChatMsg[], onText: (t: string) => void) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) // user's own key, on their own device
  const useFallback = FALLBACK_MODELS.has(model)
  const stream = client.beta.messages.stream({
    model, max_tokens: 16000, system,
    output_config: { effort: 'low' }, // chat tutoring: fast, short answers
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  })
  stream.on('text', (_d: string, snapshot: string) => onText(snapshot))
  try {
    const msg = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') throw new Error('The model declined to answer this. Try rephrasing the question.')
    return msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Your Anthropic API key was rejected. Check it in Me → AI tutor settings.')
    if (e instanceof Anthropic.RateLimitError) throw new Error('Rate limited by Anthropic. Wait a minute and try again.')
    if (e instanceof Anthropic.NotFoundError) throw new Error(`Model "${model}" was not found for your key. Tap "Load models" and pick one.`)
    if (e instanceof Anthropic.APIError) throw new Error(`Anthropic error ${e.status}: ${e.message}`)
    throw e
  }
}

/** HTTP helper: native HTTP on Android (no CORS), fetch in the browser. */
async function http(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body?: unknown): Promise<any> {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ method, url, headers: { 'Content-Type': 'application/json', ...headers }, data: body })
    if (r.status >= 400) throw new Error(`HTTP ${r.status}: ${typeof r.data === 'string' ? r.data : JSON.stringify(r.data).slice(0, 300)}`)
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data
  }
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined })
  const txt = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`)
  return JSON.parse(txt)
}

async function openaiCompatChat(base: string, key: string, model: string, system: string, history: ChatMsg[]) {
  const j = await http('POST', `${base}/chat/completions`, { Authorization: `Bearer ${key}` }, { model, messages: [{ role: 'system', content: system }, ...history] })
  return j.choices?.[0]?.message?.content ?? ''
}
async function geminiChat(key: string, model: string, system: string, history: ChatMsg[]) {
  const j = await http('POST', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, {
    systemInstruction: { parts: [{ text: system }] },
    contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
  })
  return (j.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? '').join('')
}

/** List the models a key can use, straight from the provider, so the app never depends on hard-coded model names. */
export async function listModels(p: Provider, key: string): Promise<string[]> {
  if (p === 'anthropic') {
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
    const ids: string[] = []
    for await (const m of client.models.list()) ids.push(m.id)
    return ids
  }
  if (p === 'gemini') {
    const j = await http('GET', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': key })
    return (j.models ?? []).filter((m: any) => m.supportedGenerationMethods?.includes('generateContent')).map((m: any) => String(m.name).replace(/^models\//, ''))
  }
  const base = p === 'openai' ? 'https://api.openai.com/v1' : 'https://api.deepseek.com'
  const j = await http('GET', `${base}/models`, { Authorization: `Bearer ${key}` })
  return (j.data ?? []).map((m: any) => m.id).sort()
}
