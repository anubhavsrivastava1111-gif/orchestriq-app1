import { useEffect, useRef, useState } from 'react'
import { chat, loadAi, PROVIDERS, type ChatMsg } from './ai'
import { backend } from './backend'

export type TutorContext = { label: string; text: string } | null
const HIST = 'exam-mastery.tutor-history'
const QUICK = ['Explain it even more simply', 'Give me an Indian everyday example', 'Show the calculation step by step', 'Quiz me with a similar question', 'What trap should I watch for?']

export default function Tutor({ context, onClearContext }: { context: TutorContext; onClearContext: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => { try { return JSON.parse(localStorage.getItem(HIST) || '[]') } catch { return [] } })
  const [input, setInput] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [partial, setPartial] = useState('')
  const ai = loadAi(), prov = PROVIDERS.find((p) => p.id === ai.provider)!
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { try { localStorage.setItem(HIST, JSON.stringify(msgs.slice(-40))) } catch { /* ignore */ } end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, partial])

  async function send(text: string) {
    if (!text.trim() || busy) return
    const history = [...msgs, { role: 'user' as const, content: text.trim() }]
    setMsgs(history); setInput(''); setBusy(true); setErr(''); setPartial('')
    try {
      const reply = await chat(ai, history.slice(-12), context?.text ?? '', setPartial)
      setMsgs([...history, { role: 'assistant', content: reply }])
    } catch (e: any) { setErr(e?.message ?? String(e)); setMsgs(history) } finally { setBusy(false); setPartial('') }
  }
  const unavailable = ai.provider === 'org' && !backend.enabled

  return (
    <div className="screen tutor">
      <div className="tutorhead"><div><b>Mentor</b> <span className="muted small">· {prov.name}</span></div>{msgs.length > 0 && <button className="link" onClick={() => setMsgs([])}>New chat</button>}</div>
      {context && <div className="notice ctx"><span>Asking about: <b>{context.label}</b></span><button className="link" onClick={onClearContext}>✕</button></div>}
      {unavailable && <p className="notice warn">The organisation tutor needs the cloud backend, which isn't connected in this build. Go to Me → AI tutor settings and add your own Claude, OpenAI, Gemini or DeepSeek key.</p>}
      <div className="chat">
        {!msgs.length && <div className="card empty"><h3>Ask any doubt</h3><p className="muted">Concepts, calculations, "why is my answer wrong?", study strategy. Mentor explains simply first, then at exam level.</p>
          <div className="chips wrap">{['What is a deferred tax liability?', 'Explain VaR like I am 12', 'How do I choose a CPA state from India?', 'Make me a 2-week FRM Part I revision plan'].map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}</div></div>}
        {msgs.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}
        {busy && <div className="bubble assistant">{partial || <span className="typing">Mentor is thinking…</span>}</div>}
        {err && <p className="notice warn">{err}</p>}
        <div ref={end} />
      </div>
      {msgs.length > 0 && !busy && <div className="chips wrap quick">{QUICK.map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}</div>}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(input) }}>
        <textarea rows={2} value={input} placeholder="Type your doubt…" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }} />
        <button className="btn" disabled={busy || !input.trim()}>Send</button>
      </form>
      <p className="muted small center">AI can make mistakes. For exam rules, fees and tax figures, confirm with the official body.</p>
    </div>
  )
}
