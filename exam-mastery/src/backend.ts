// Supabase backend: invite-only login, cloud backup of progress, records ledger, admin, org AI tutor.
// If VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set at build time, the app runs in offline-only mode.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { getState, mergeRemote, onChange, type State } from './store'
import type { ChatMsg } from './ai'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const sb: SupabaseClient | null = URL_ && ANON ? createClient(URL_, ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null

export type Role = 'owner' | 'admin' | 'member'
export type ProfileRow = { id: string; email: string; display_name: string | null; role: Role; status: 'active' | 'revoked'; created_at: string; last_seen: string | null }
export type InviteRow = { email: string; role: Role; note: string | null; created_at: string; invited_by: string | null }
export type UserSummary = ProfileRow & { answers: number; correct: number; attempts: number; last_sync: string | null }

let syncTimer: ReturnType<typeof setTimeout> | undefined
let pendingPush = false
export const syncStatus = { last: 0, error: '' as string, listeners: new Set<() => void>() }
const notifySync = () => syncStatus.listeners.forEach((l) => l())

function need(): SupabaseClient { if (!sb) throw new Error('Cloud is not configured for this build.'); return sb }

export const backend = {
  enabled: !!sb,
  async session(): Promise<Session | null> { return sb ? (await sb.auth.getSession()).data.session : null },
  onAuth(cb: (s: Session | null) => void) { return sb ? sb.auth.onAuthStateChange((_e, s) => cb(s)).data.subscription : { unsubscribe() {} } },
  async sendCode(email: string) {
    const { error } = await need().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } })
    if (error) throw new Error(/database error|not invited/i.test(error.message) ? 'This email has not been invited. Ask the app admin for an invite.' : error.message)
  },
  async verifyCode(email: string, token: string) {
    const { error } = await need().auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' })
    if (error) throw new Error(error.message)
  },
  async signOut() { await sb?.auth.signOut() },
  async me(): Promise<ProfileRow | null> {
    const s = await this.session(); if (!s) return null
    const { data } = await need().from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    if (data) void need().from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', s.user.id)
    return data as ProfileRow | null
  },
  async setDisplayName(name: string) { const s = await this.session(); if (s) await need().from('profiles').update({ display_name: name }).eq('id', s.user.id) },

  // ── Sync: whole-state snapshot + append-only attempts ledger ──
  async pull() {
    const s = await this.session(); if (!s) return
    const { data, error } = await need().from('user_state').select('data').eq('user_id', s.user.id).maybeSingle()
    if (error) throw error
    const { data: att } = await need().from('attempts').select('payload').eq('user_id', s.user.id).order('created_at')
    mergeRemote({ ...(data?.data ?? {}), attempts: [...((data?.data as State | undefined)?.attempts ?? []), ...(att ?? []).map((r: any) => r.payload)] })
  },
  async push() {
    const s = await this.session(); if (!s) return
    const st = getState()
    const { error } = await need().from('user_state').upsert({ user_id: s.user.id, data: st, updated_at: new Date().toISOString() })
    if (error) throw error
    if (st.attempts.length) {
      const rows = st.attempts.map((a) => ({ id: a.id, user_id: s.user.id, kind: a.kind, exam: a.exam, paper: a.paper, score: a.score, total: a.total, seconds: a.seconds, payload: a, created_at: new Date(a.at).toISOString() }))
      const { error: e2 } = await need().from('attempts').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      if (e2) throw e2
    }
  },
  async syncNow() {
    if (!sb) return
    try { await this.pull(); await this.push(); syncStatus.last = Date.now(); syncStatus.error = ''; pendingPush = false }
    catch (e: any) { syncStatus.error = e?.message ?? String(e); pendingPush = true }
    notifySync()
  },
  startAutoSync() {
    if (!sb) return () => {}
    const off = onChange(() => {
      clearTimeout(syncTimer)
      syncTimer = setTimeout(async () => {
        try { await this.push(); syncStatus.last = Date.now(); syncStatus.error = ''; pendingPush = false } catch (e: any) { syncStatus.error = e?.message ?? String(e); pendingPush = true }
        notifySync()
      }, 2500)
    })
    const retry = () => { if (pendingPush) void this.syncNow() }
    window.addEventListener('online', retry)
    const iv = setInterval(retry, 60_000)
    return () => { off(); window.removeEventListener('online', retry); clearInterval(iv) }
  },

  // ── App config (feature flags, latest version) ──
  async config(): Promise<Record<string, any>> {
    if (!sb) return {}
    const { data } = await sb.from('app_config').select('key,value')
    return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]))
  },

  // ── Organisation AI tutor (Edge Function holds the key) ──
  async tutor(history: ChatMsg[], context: string, model: string): Promise<string> {
    const { data, error } = await need().functions.invoke('tutor', { body: { messages: history, context, model } })
    if (error) {
      let msg = error.message
      try { const body = await (error as any).context?.json?.(); if (body?.error) msg = body.error } catch { /* keep generic */ }
      throw new Error(msg)
    }
    return (data as any).text as string
  },

  // ── Admin ──
  admin: {
    async users(): Promise<UserSummary[]> { const { data, error } = await need().from('admin_user_summary').select('*').order('created_at'); if (error) throw error; return data as UserSummary[] },
    async invites(): Promise<InviteRow[]> { const { data, error } = await need().from('invites').select('*').order('created_at', { ascending: false }); if (error) throw error; return data as InviteRow[] },
    async invite(email: string, role: Role, note: string) {
      const { error } = await need().from('invites').upsert({ email: email.trim().toLowerCase(), role, note })
      if (error) throw error; await audit('invite', email)
    },
    async uninvite(email: string) { const { error } = await need().from('invites').delete().eq('email', email); if (error) throw error; await audit('uninvite', email) },
    async setStatus(id: string, status: 'active' | 'revoked') { const { error } = await need().from('profiles').update({ status }).eq('id', id); if (error) throw error; await audit(`status:${status}`, id) },
    async setRole(id: string, role: Role) { const { error } = await need().from('profiles').update({ role }).eq('id', id); if (error) throw error; await audit(`role:${role}`, id) },
    async userState(id: string): Promise<State | null> { const { data } = await need().from('user_state').select('data').eq('user_id', id).maybeSingle(); return (data?.data as State) ?? null },
    async allAttempts(): Promise<any[]> { const { data, error } = await need().from('attempts').select('user_id,kind,exam,paper,score,total,seconds,created_at').order('created_at'); if (error) throw error; return data ?? [] },
    async setConfig(key: string, value: unknown) { const { error } = await need().from('app_config').upsert({ key, value }); if (error) throw error; await audit(`config:${key}`, JSON.stringify(value)) },
    async auditLog(): Promise<any[]> { const { data } = await need().from('audit_log').select('*').order('created_at', { ascending: false }).limit(200); return data ?? [] },
  },
}

async function audit(action: string, target: string) {
  const s = await backend.session(); if (!s) return
  await need().from('audit_log').insert({ actor: s.user.id, action, target })
}
