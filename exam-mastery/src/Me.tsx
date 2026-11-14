import { useEffect, useState } from 'react'
import { listModels, loadAi, modelFor, PROVIDERS, saveAi, type AiSettings, type Provider } from './ai'
import { backend, syncStatus, type InviteRow, type ProfileRow, type Role, type UserSummary } from './backend'
import { EXAMS, paperById, QUESTIONS } from './data'
import { exportAdmin, exportBackup, exportExcel, exportPdf } from './exports'
import { getState, replaceAll, resetProgress, setLevel, setProfile, topicStats, useStore, type State } from './store'

export const APP_VERSION = '0.3.0'
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export default function Me({ me }: { me: ProfileRow | null }) {
  const [tab, setTab] = useState<'progress' | 'records' | 'ai' | 'settings' | 'admin'>('progress')
  const isAdmin = me && (me.role === 'owner' || me.role === 'admin') && me.status === 'active'
  return (
    <div className="screen">
      <div className="chips wrap">{(['progress', 'records', 'ai', 'settings', ...(isAdmin ? ['admin'] : [])] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t as any)}>{{ progress: 'Progress', records: 'Records & export', ai: 'AI tutor settings', settings: 'Account & settings', admin: '🛡 Admin' }[t]}</button>)}</div>
      {tab === 'progress' && <Progress />}
      {tab === 'records' && <Records />}
      {tab === 'ai' && <AiSettingsView />}
      {tab === 'settings' && <Settings me={me} />}
      {tab === 'admin' && isAdmin && <Admin me={me!} />}
    </div>
  )
}

function Progress() {
  const s = useStore()
  const cards = Object.values(s.cards), seen = cards.reduce((a, c) => a + c.seen, 0), right = cards.reduce((a, c) => a + c.correct, 0)
  const tps = topicStats(s.exam).sort((a, b) => a.correct / a.seen - b.correct / b.seen)
  const exams = s.exam ? EXAMS.filter((e) => e.id === s.exam) : EXAMS.filter((e) => e.id === 'CPA' || e.id === 'FRM')
  return (
    <>
      <div className="stats"><div><b>{pct(right, seen)}%</b><span>accuracy</span></div><div><b>{cards.filter((c) => c.box >= 4).length}</b><span>mastered</span></div><div><b>{seen}</b><span>answers</span></div></div>
      {tps.length > 0 && <><h3 className="section">Weakest topics first</h3><div className="card">{tps.slice(0, 8).map((t) => <div key={`${t.paper}${t.topic}`} className="bar"><span>{t.topic}</span><div className="track"><div style={{ width: `${pct(t.correct, t.seen)}%` }} className={t.correct / t.seen >= 0.75 ? 'good' : t.correct / t.seen >= 0.5 ? 'mid' : 'low'} /></div><small>{paperById(t.paper)?.name} · {pct(t.correct, t.seen)}% of {t.seen}</small></div>)}</div></>}
      {exams.map((e) => <section key={e.id}><h3 className="section">{e.name} coverage</h3><div className="card">{e.papers.map((p) => {
        const st = tps.filter((t) => t.paper === p.id), n = st.reduce((a, t) => a + t.seen, 0), c = st.reduce((a, t) => a + t.correct, 0)
        return <div key={p.id} className="bar"><span>{p.name}</span><div className="track"><div style={{ width: `${pct(c, n)}%` }} className={c / n >= 0.75 ? 'good' : c / n >= 0.5 ? 'mid' : 'low'} /></div><small>{n ? `${pct(c, n)}% · ${st.length}/${p.topics.length} topics practised` : `${p.topics.length} topics · not started`}</small></div>
      })}</div></section>)}
    </>
  )
}

function Records() {
  const s = useStore(), [busy, setBusy] = useState(''), [msg, setMsg] = useState('')
  const go = async (k: string, fn: () => Promise<void>) => { setBusy(k); setMsg(''); try { await fn(); setMsg('Done.') } catch (e: any) { setMsg(`Failed: ${e?.message ?? e}`) } finally { setBusy('') } }
  const restore = (f: File) => f.text().then((t) => { const st = JSON.parse(t) as State; if (!st.cards || !Array.isArray(st.attempts)) throw new Error('Not a backup file'); if (confirm(`Restore backup with ${st.attempts.length} sessions? Current data on this device will be replaced.`)) { replaceAll(st); setMsg('Backup restored.') } }).catch((e) => setMsg(`Restore failed: ${e.message}`))
  return (
    <>
      <div className="card">
        <h3>Download your records</h3>
        <p className="muted small">Everything you've done: summary, every session, accuracy by topic, every question's history and your exam-journey notes.</p>
        <div className="grid2"><button className="btn" disabled={!!busy} onClick={() => go('pdf', () => exportPdf(getState()))}>{busy === 'pdf' ? 'Preparing…' : '📄 PDF report'}</button><button className="btn" disabled={!!busy} onClick={() => go('xlsx', () => exportExcel(getState()))}>{busy === 'xlsx' ? 'Preparing…' : '📊 Excel workbook'}</button></div>
        <div className="grid2"><button className="btn ghost" disabled={!!busy} onClick={() => go('json', () => exportBackup(getState()))}>💾 Backup file</button><label className="btn ghost filebtn">♻ Restore backup<input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} /></label></div>
        {msg && <p className="small">{msg}</p>}
      </div>
      <h3 className="section">Session history ({s.attempts.length})</h3>
      {[...s.attempts].reverse().slice(0, 100).map((a) => (
        <div key={a.id} className="card row static"><span><b>{a.title}</b><small>{new Date(a.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {a.kind} · {Math.round(a.seconds / 60)} min{a.tbsTotal ? ` · TBS ${a.tbsScore}/${a.tbsTotal}` : ''}</small></span><span className={`pill ${a.score / a.total >= 0.75 ? 'good' : a.score / a.total >= 0.5 ? 'mid' : 'low'}`}>{pct(a.score, a.total)}%</span></div>
      ))}
      {!s.attempts.length && <p className="muted">No sessions yet. Every practice, mock and exam simulation will appear here.</p>}
    </>
  )
}

function AiSettingsView() {
  const [ai, setAi] = useState<AiSettings>(loadAi), [models, setModels] = useState<string[]>([]), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const upd = (n: AiSettings) => { setAi(n); saveAi(n) }
  const p = ai.provider, info = PROVIDERS.find((x) => x.id === p)!
  const load = async () => { setBusy(true); setMsg(''); try { const m = await listModels(p, ai.keys[p] ?? ''); setModels(m); setMsg(`${m.length} models available for your key.`) } catch (e: any) { setMsg(`Could not load models: ${e?.message ?? e}`) } finally { setBusy(false) } }
  return (
    <div className="card">
      <h3>Which AI should Mentor use?</h3>
      {PROVIDERS.map((x) => <label key={x.id} className="radio"><input type="radio" checked={p === x.id} onChange={() => { upd({ ...ai, provider: x.id }); setModels([]); setMsg('') }} /> {x.name}</label>)}
      {p === 'org' ? <p className="notice">Uses the organisation's Claude subscription. There's nothing to set up and a daily question limit set by your admin. {!backend.enabled && 'Not available in this offline build.'}</p> : (
        <>
          <label className="field">Your {info.name.split(':')[0]} API key<input type="password" autoComplete="off" placeholder={info.keyHint} value={ai.keys[p] ?? ''} onChange={(e) => upd({ ...ai, keys: { ...ai.keys, [p]: e.target.value.trim() } })} /></label>
          <p className="muted small">Stored only on this phone, never uploaded to our servers. Charges go to your own {info.name.split(':')[0]} account. <a href={info.keyUrl} target="_blank" rel="noreferrer">Get a key ↗</a></p>
          <label className="field">Model{models.length ? <select value={modelFor(ai, p)} onChange={(e) => upd({ ...ai, models: { ...ai.models, [p]: e.target.value } })}><option value="">Choose…</option>{models.map((m) => <option key={m}>{m}</option>)}</select>
            : <input value={ai.models[p] ?? info.defaultModel} placeholder="Tap Load models" onChange={(e) => upd({ ...ai, models: { ...ai.models, [p]: e.target.value.trim() } })} />}</label>
          <button className="btn ghost" disabled={busy || !ai.keys[p]} onClick={load}>{busy ? 'Checking key…' : 'Load models (also tests your key)'}</button>
          {p === 'anthropic' && <p className="muted small">Recommended: claude-opus-5-5. If Claude declines a request, it automatically retries with a fallback model.</p>}
        </>
      )}
      {msg && <p className="small">{msg}</p>}
    </div>
  )
}

function Settings({ me }: { me: ProfileRow | null }) {
  const s = useStore(), [, force] = useState(0)
  useEffect(() => { const l = () => force((n) => n + 1); syncStatus.listeners.add(l); return () => { syncStatus.listeners.delete(l) } }, [])
  return (
    <>
      <div className="card">
        <h3>Account</h3>
        {me ? <p>{me.email} · <span className="tag">{me.role}</span></p> : <p className="muted">Offline mode: data is stored on this device only. Use Records → Backup file regularly.</p>}
        <label className="field">Display name<input value={s.profile.name} onChange={(e) => { setProfile({ name: e.target.value }); void backend.setDisplayName(e.target.value) }} /></label>
        {backend.enabled && me && <>
          <p className="small">Cloud backup: {syncStatus.error ? <span className="bad">⚠ {syncStatus.error} (will retry automatically)</span> : syncStatus.last ? `✓ saved ${new Date(syncStatus.last).toLocaleTimeString()}` : 'waiting…'}</p>
          <div className="grid2"><button className="btn ghost" onClick={() => backend.syncNow()}>Sync now</button><button className="btn ghost" onClick={async () => { await backend.syncNow(); await backend.signOut() }}>Sign out</button></div>
        </>}
      </div>
      <div className="card">
        <h3>Learning</h3>
        <p className="small"><b>Show first after answering</b></p>
        <div className="seg"><button className={s.level === 'simple' ? 'on' : ''} onClick={() => setLevel('simple')}>Plain-words story</button><button className={s.level === 'standard' ? 'on' : ''} onClick={() => setLevel('standard')}>Worked solution</button></div>
        <button className="link danger" onClick={() => confirm('Reset spaced-repetition memory on this device? Session records are kept.') && resetProgress()}>Reset question memory</button>
      </div>
      <p className="muted small">Exam Mastery v{APP_VERSION} · {QUESTIONS.length} hand-written questions + unlimited auto-generated calculation questions. Practice content is original. It is not real exam content.</p>
    </>
  )
}

function Admin({ me }: { me: ProfileRow }) {
  const [users, setUsers] = useState<UserSummary[]>([]), [invites, setInvites] = useState<InviteRow[]>([]), [cfg, setCfg] = useState<Record<string, any>>({}), [log, setLog] = useState<any[]>([])
  const [email, setEmail] = useState(''), [role, setRole] = useState<Role>('member'), [note, setNote] = useState(''), [msg, setMsg] = useState(''), [view, setView] = useState<{ u: UserSummary; st: State | null } | null>(null)
  const owner = me.role === 'owner'
  const refresh = async () => { try { const [u, i, c, l] = await Promise.all([backend.admin.users(), backend.admin.invites(), backend.config(), backend.admin.auditLog()]); setUsers(u); setInvites(i); setCfg(c); setLog(l) } catch (e: any) { setMsg(e.message) } }
  useEffect(() => { void refresh() }, [])
  const act = async (fn: () => Promise<void>, ok: string) => { setMsg(''); try { await fn(); setMsg(ok); await refresh() } catch (e: any) { setMsg(`⚠ ${e.message}`) } }
  return (
    <>
      {msg && <p className="notice">{msg}</p>}
      <div className="card">
        <h3>Invite someone</h3>
        <p className="muted small">Only invited emails can sign in. They install the app, enter this email, and receive a login code.</p>
        <label className="field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <div className="grid2"><label className="field">Role<select value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="member">Member (student)</option>{owner && <option value="admin">Admin (can invite/revoke)</option>}</select></label><label className="field">Note<input value={note} placeholder="e.g. batch Jan-27" onChange={(e) => setNote(e.target.value)} /></label></div>
        <button className="btn wide" disabled={!email.includes('@')} onClick={() => act(async () => { await backend.admin.invite(email, role, note); setEmail(''); setNote('') }, `Invited ${email}.`)}>Send invite</button>
      </div>
      <h3 className="section">Members ({users.length})</h3>
      {users.map((u) => (
        <div key={u.id} className={`card member ${u.status}`}>
          <div className="steprow"><div><b>{u.display_name || u.email}</b><p className="muted small">{u.email} · {u.role} · {u.answers} answers · {pct(u.correct, u.answers)}% · {u.attempts} sessions · last seen {u.last_seen ? new Date(u.last_seen).toLocaleDateString('en-IN') : 'never'}</p></div></div>
          <div className="chips wrap">
            <button onClick={async () => setView({ u, st: await backend.admin.userState(u.id) })}>View progress</button>
            {u.role !== 'owner' && (u.status === 'active' ? <button className="dangerchip" onClick={() => confirm(`Revoke access for ${u.email}? Their data is kept.`) && act(() => backend.admin.setStatus(u.id, 'revoked'), 'Access revoked.')}>Revoke access</button>
              : <button onClick={() => act(() => backend.admin.setStatus(u.id, 'active'), 'Access restored.')}>Restore access</button>)}
            {owner && u.role === 'member' && <button onClick={() => act(() => backend.admin.setRole(u.id, 'admin'), 'Promoted to admin.')}>Make admin</button>}
            {owner && u.role === 'admin' && <button onClick={() => act(() => backend.admin.setRole(u.id, 'member'), 'Changed to member.')}>Remove admin</button>}
          </div>
        </div>
      ))}
      {view && <div className="modal" onClick={() => setView(null)}><div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{view.u.email}</h3>
        {view.st ? <><p>Plan: {view.st.plan ? `${view.st.plan.exam} on ${view.st.plan.targetDate}` : 'none'} · Sessions: {view.st.attempts.length}</p>
          {[...view.st.attempts].reverse().slice(0, 15).map((a) => <p key={a.id} className="small">{new Date(a.at).toLocaleDateString('en-IN')} · {a.title} · {pct(a.score, a.total)}%</p>)}</> : <p className="muted">No synced data yet.</p>}
        <button className="btn wide" onClick={() => setView(null)}>Close</button></div></div>}
      <h3 className="section">Pending invites ({invites.filter((i) => !users.some((u) => u.email === i.email)).length})</h3>
      <div className="card">{invites.filter((i) => !users.some((u) => u.email === i.email)).map((i) => <div key={i.email} className="weekrow"><span>{i.email} · {i.role}{i.note ? ` · ${i.note}` : ''}</span><button className="link danger" onClick={() => act(() => backend.admin.uninvite(i.email), 'Invite cancelled.')}>Cancel</button></div>)}</div>
      <h3 className="section">All records</h3>
      <div className="grid2"><button className="btn" onClick={() => act(async () => exportAdmin(users, await backend.admin.allAttempts(), 'xlsx'), 'Exported.')}>📊 Excel (all users)</button><button className="btn" onClick={() => act(async () => exportAdmin(users, await backend.admin.allAttempts(), 'pdf'), 'Exported.')}>📄 PDF (all users)</button></div>
      <h3 className="section">App settings</h3>
      <div className="card">
        <label className="radio"><input type="checkbox" checked={cfg.tutor_enabled !== false} onChange={(e) => act(() => backend.admin.setConfig('tutor_enabled', e.target.checked), 'Saved.')} /> Organisation AI tutor enabled</label>
        <div className="grid2"><label className="field">Tutor questions / user / day<input type="number" defaultValue={cfg.tutor_daily_limit ?? 40} onBlur={(e) => act(() => backend.admin.setConfig('tutor_daily_limit', +e.target.value), 'Saved.')} /></label>
          <label className="field">Tutor model<input defaultValue={cfg.tutor_model ?? 'claude-opus-5-5'} onBlur={(e) => act(() => backend.admin.setConfig('tutor_model', e.target.value.trim()), 'Saved.')} /></label></div>
        <label className="field">Announcement shown to everyone<input defaultValue={cfg.announcement ?? ''} onBlur={(e) => act(() => backend.admin.setConfig('announcement', e.target.value), 'Saved.')} /></label>
        <div className="grid2"><label className="field">Latest app version<input defaultValue={cfg.latest_version ?? APP_VERSION} onBlur={(e) => act(() => backend.admin.setConfig('latest_version', e.target.value.trim()), 'Saved.')} /></label>
          <label className="field">APK download link<input defaultValue={cfg.apk_url ?? ''} onBlur={(e) => act(() => backend.admin.setConfig('apk_url', e.target.value.trim()), 'Saved.')} /></label></div>
        <p className="muted small">When "latest version" is newer than a user's app, they see an update banner linking to the APK.</p>
      </div>
      <h3 className="section">Audit log</h3>
      <div className="card">{log.slice(0, 50).map((l) => <p key={l.id} className="small">{new Date(l.created_at).toLocaleString('en-IN')} · {users.find((u) => u.id === l.actor)?.email ?? 'admin'} · {l.action} · {users.find((u) => u.id === l.target)?.email ?? l.target}</p>)}{!log.length && <p className="muted small">No admin actions yet.</p>}</div>
    </>
  )
}
