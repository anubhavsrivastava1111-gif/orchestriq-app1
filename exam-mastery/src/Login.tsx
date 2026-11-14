import { useState } from 'react'
import { backend } from './backend'

export default function Login() {
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn() } catch (e: any) { setErr(e?.message ?? String(e)) } finally { setBusy(false) } }
  return (
    <div className="login">
      <div className="card">
        <div className="brand big"><span className="logo">M</span> Exam Mastery</div>
        <p className="muted">Private app: invited members only.</p>
        {!sent ? (
          <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await backend.sendCode(email); setSent(true) }) }}>
            <label className="field">Your invited email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <button className="btn wide" disabled={busy}>{busy ? 'Sending…' : 'Send me a login code'}</button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void run(() => backend.verifyCode(email, code)) }}>
            <p>We emailed a code to <b>{email}</b>. Check spam if you don't see it.</p>
            <label className="field">Code<input inputMode="numeric" autoComplete="one-time-code" maxLength={10} required value={code} onChange={(e) => setCode(e.target.value)} /></label>
            <button className="btn wide" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
            <button type="button" className="link" onClick={() => { setSent(false); setCode('') }}>Use a different email</button>
          </form>
        )}
        {err && <p className="notice warn">{err}</p>}
      </div>
    </div>
  )
}
