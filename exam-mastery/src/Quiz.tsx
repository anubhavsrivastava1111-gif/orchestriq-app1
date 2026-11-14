import { useEffect, useMemo, useState } from 'react'
import { paperById, type Question } from './data'
import { addAttempt, record, useStore, type Level } from './store'

type Props = { questions: Question[]; mode: 'practice' | 'mock'; title: string; onExit: () => void; onAsk?: (q: Question) => void }
const SECONDS_PER_Q = 90
const LETTERS = 'ABCDEF'

export function Explanation({ q, level, onAsk }: { q: Question; level: Level; onAsk?: (q: Question) => void }) {
  const [tab, setTab] = useState<'simple' | 'steps' | 'trap'>(level === 'simple' ? 'simple' : 'steps')
  useEffect(() => setTab(level === 'simple' ? 'simple' : 'steps'), [q.id, level])
  return (
    <div className="explain">
      <div className="seg" role="tablist">
        {([['simple', 'In plain words'], ['steps', 'Worked solution'], ['trap', 'Exam trap']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'simple' && <p className="story">{q.explain.simple}</p>}
      {tab === 'steps' && <ol className="steps">{q.explain.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {tab === 'trap' && <p className="trap">{q.explain.trap}</p>}
      <p className="ref">Source: {q.ref} · {q.status === 'sme-verified' ? 'Expert-verified' : q.status === 'generated' ? 'Auto-generated · maths computed by the app' : 'Draft, awaiting expert review'}</p>
      {onAsk && <button className="btn ghost small" onClick={() => onAsk(q)}>💬 Still confused? Ask Mentor</button>}
    </div>
  )
}

export default function Quiz({ questions, mode, title, onExit, onAsk }: Props) {
  const [started] = useState(() => Date.now())
  const { level } = useStore()
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null))
  const [done, setDone] = useState(false)
  const [left, setLeft] = useState(questions.length * SECONDS_PER_Q)
  const q = questions[i]
  const choice = picked[i]
  const revealed = mode === 'practice' && choice !== null

  useEffect(() => {
    if (mode !== 'mock' || done) return
    if (left <= 0) { finish(); return }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  })

  function pick(n: number) {
    if (revealed || done) return
    const next = [...picked]; next[i] = n; setPicked(next)
    if (mode === 'practice') record(q, n === q.answer)
  }
  function finish() {
    if (mode === 'mock') questions.forEach((qq, k) => picked[k] !== null && record(qq, picked[k] === qq.answer))
    const detail = questions.map((qq, k) => ({ qid: qq.id, topic: qq.topic, correct: picked[k] === qq.answer })).filter((_, k) => picked[k] !== null)
    if (detail.length) addAttempt({ kind: mode, exam: questions[0].exam, paper: questions[0].paper, title, score: detail.filter((x) => x.correct).length, total: detail.length, seconds: Math.round((Date.now() - started) / 1000), detail })
    setDone(true)
  }

  const score = useMemo(() => questions.filter((qq, k) => picked[k] === qq.answer).length, [picked, questions])

  if (!questions.length) return (
    <div className="screen"><div className="card empty"><h2>Nothing here yet</h2><p>No questions match this selection. Try a different exam or mode.</p><button className="btn" onClick={onExit}>Back</button></div></div>
  )

  if (done) {
    const pct = Math.round((score / questions.length) * 100)
    return (
      <div className="screen">
        <div className="card result">
          <p className="eyebrow">{title}</p>
          <h2>{score} / {questions.length} correct</h2>
          <div className={`ring ${pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'low'}`}>{pct}%</div>
          <p className="muted">{pct >= 75 ? 'Strong. Keep reviewing so it sticks.' : pct >= 50 ? 'Getting there. Your wrong answers are queued for review.' : 'Good diagnostic. Start with the Learn tab for these topics, then retry.'}</p>
          <button className="btn" onClick={onExit}>Done</button>
        </div>
        <h3 className="section">Review answers</h3>
        {questions.map((qq, k) => (
          <details key={qq.id} className={`card review ${picked[k] === qq.answer ? 'ok' : 'bad'}`}>
            <summary><span className="dot" />{qq.stem}</summary>
            <p><b>Correct:</b> {LETTERS[qq.answer]}. {qq.options[qq.answer]}</p>
            {picked[k] !== qq.answer && <p className="muted"><b>You chose:</b> {picked[k] === null ? 'No answer' : `${LETTERS[picked[k]!]}. ${qq.options[picked[k]!]}`}</p>}
            <Explanation q={qq} level={level} onAsk={onAsk} />
          </details>
        ))}
      </div>
    )
  }

  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0')
  return (
    <div className="screen">
      <div className="quizbar">
        <button className="link" onClick={() => { if (mode === 'practice' && picked.some((x) => x !== null)) finish(); onExit() }} aria-label="Exit">✕ Exit</button>
        <span>{i + 1} / {questions.length}</span>
        {mode === 'mock' ? <span className={`timer ${left < 60 ? 'warn' : ''}`}>⏱ {mm}:{ss}</span> : <span className="muted">{title}</span>}
      </div>
      <div className="progress"><div style={{ width: `${((i + 1) / questions.length) * 100}%` }} /></div>
      <div className="card">
        <p className="eyebrow">{q.exam} · {paperById(q.paper)?.name ?? q.paper} · {q.topic}</p>
        <h2 className="stem">{q.stem}</h2>
        <div className="options">
          {q.options.map((o, n) => {
            const cls = revealed ? (n === q.answer ? 'correct' : n === choice ? 'wrong' : 'dim') : n === choice ? 'chosen' : ''
            return (
              <button key={n} className={`opt ${cls}`} onClick={() => pick(n)} disabled={revealed}>
                <span className="letter">{LETTERS[n]}</span><span>{o}</span>
              </button>
            )
          })}
        </div>
        {revealed && (
          <>
            <p className={`verdict ${choice === q.answer ? 'ok' : 'bad'}`}>{choice === q.answer ? '✓ Correct' : `✗ Not quite. The answer is ${LETTERS[q.answer]}.`}</p>
            <Explanation q={q} level={level} onAsk={onAsk} />
          </>
        )}
      </div>
      <div className="navrow">
        <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
        {i < questions.length - 1
          ? <button className="btn" disabled={mode === 'practice' && !revealed} onClick={() => setI(i + 1)}>Next →</button>
          : <button className="btn" disabled={mode === 'practice' && !revealed} onClick={finish}>{mode === 'mock' ? 'Submit test' : 'Finish'}</button>}
      </div>
    </div>
  )
}
