import { useState } from 'react'
import { CHALLENGES, EXAMS, LESSONS, QUESTIONS, WORKPLACE, WORKPLACE_DISCLAIMER, examById, type Lesson, type Question } from './data'
import Quiz from './Quiz'
import { dueQuestions, inScope, resetProgress, setExam, setLevel, shuffle, streak, useStore, weakQuestions } from './store'

type Tab = 'home' | 'practice' | 'learn' | 'guides' | 'progress'
type Session = { questions: Question[]; mode: 'practice' | 'mock'; title: string }

export default function App() {
  const s = useStore()
  const [tab, setTab] = useState<Tab>('home')
  const [session, setSession] = useState<Session | null>(null)
  const start = (questions: Question[], mode: Session['mode'], title: string) => setSession({ questions, mode, title })

  if (session) return <Quiz {...session} onExit={() => setSession(null)} />

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="logo">M</span> Exam Mastery</div>
        <div className="chips" role="radiogroup" aria-label="Exam">
          <button className={!s.exam ? 'on' : ''} onClick={() => setExam(null)}>All</button>
          {EXAMS.map((e) => <button key={e.id} className={s.exam === e.id ? 'on' : ''} onClick={() => setExam(e.id)}>{e.name}</button>)}
        </div>
      </header>
      <main>
        {tab === 'home' && <Home start={start} go={setTab} />}
        {tab === 'practice' && <Practice start={start} />}
        {tab === 'learn' && <Learn />}
        {tab === 'guides' && <Guides />}
        {tab === 'progress' && <Progress />}
      </main>
      <nav className="tabs">
        {([['home', '⌂', 'Home'], ['practice', '✎', 'Practice'], ['learn', '◎', 'Learn'], ['guides', '☰', 'Guides'], ['progress', '▤', 'Progress']] as const).map(([k, icon, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{icon}</span>{label}</button>
        ))}
      </nav>
    </div>
  )
}

function Home({ start, go }: { start: (q: Question[], m: 'practice' | 'mock', t: string) => void; go: (t: Tab) => void }) {
  const s = useStore()
  const exam = s.exam ? examById(s.exam) : null
  const pool = QUESTIONS.filter((q) => inScope(q, s.exam))
  const due = dueQuestions(s.exam), weak = weakQuestions(s.exam)
  const fresh = pool.filter((q) => !s.cards[q.id])
  return (
    <div className="screen">
      <section className="hero">
        <p className="eyebrow">{exam ? exam.body : 'CPA · FRM · CMA · CA · CMA India'}</p>
        <h1>{exam ? exam.name : 'Learn it once. Remember it on exam day.'}</h1>
        <p>{exam ? exam.plain : 'Every answer comes with a plain-language story, a worked solution and the trap examiners set.'}</p>
      </section>
      <div className="stats">
        <div><b>{streak()}</b><span>day streak</span></div>
        <div><b>{due.length}</b><span>due today</span></div>
        <div><b>{fresh.length}</b><span>not yet seen</span></div>
      </div>
      <button className="card action primary" onClick={() => due.length ? start(due, 'practice', 'Daily review') : start(shuffle(fresh.length ? fresh : pool).slice(0, 10), 'practice', 'Today’s 10')}>
        <b>{due.length ? `Daily review · ${due.length} questions` : 'Start today’s 10 questions'}</b>
        <span>{due.length ? 'Questions come back just before you would forget them.' : 'Answer, then read why. Your progress is saved on this phone.'}</span>
      </button>
      {weak.length > 0 && (
        <button className="card action" onClick={() => start(shuffle(weak), 'practice', 'Weak areas')}>
          <b>Fix weak areas · {weak.length}</b><span>Questions you got wrong recently.</span>
        </button>
      )}
      <button className="card action" onClick={() => go('learn')}>
        <b>New to accounting?</b><span>Start with the beginner lessons. Everyday stories, no jargon.</span>
      </button>
      <button className="card action" onClick={() => go('guides')}>
        <b>Stuck: at exams or at work?</b><span>Step-by-step playbooks for common problems.</span>
      </button>
    </div>
  )
}

function Practice({ start }: { start: (q: Question[], m: 'practice' | 'mock', t: string) => void }) {
  const s = useStore()
  const exams = s.exam ? EXAMS.filter((e) => e.id === s.exam) : EXAMS
  const pool = QUESTIONS.filter((q) => inScope(q, s.exam))
  return (
    <div className="screen">
      <h2 className="section">Choose how to practise</h2>
      <div className="grid2">
        <button className="card action" onClick={() => start(shuffle(pool), 'practice', 'Mixed practice')}><b>Practice</b><span>Instant explanation after each answer · {pool.length} Qs</span></button>
        <button className="card action" onClick={() => start(shuffle(pool).slice(0, 20), 'mock', 'Mock test')}><b>Mock test</b><span>Timed, 90 s per question, answers at the end</span></button>
      </div>
      {exams.map((e) => (
        <section key={e.id}>
          <h3 className="section">{e.name} <a className="src" href={e.officialSource} target="_blank" rel="noreferrer">official syllabus ↗</a></h3>
          {e.papers.map((p) => {
            const qs = QUESTIONS.filter((q) => q.paper === p.id)
            const seen = qs.filter((q) => s.cards[q.id]).length
            return (
              <button key={p.id} className="card row" disabled={!qs.length} onClick={() => start(shuffle(qs), 'practice', p.name)}>
                <span><b>{p.name}</b><small>{p.kind} · {qs.length ? `${qs.length} questions · ${seen} seen` : 'Questions coming soon'}</small></span>
                <span className="chev">›</span>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function Learn() {
  const s = useStore()
  const [open, setOpen] = useState<Lesson | null>(null)
  const [showAns, setShowAns] = useState(false)
  const list = LESSONS.filter((l) => !s.exam || l.exams.includes(s.exam))
  if (open) return (
    <div className="screen">
      <button className="link" onClick={() => { setOpen(null); setShowAns(false) }}>‹ All lessons</button>
      <article className="card lesson">
        <h2>{open.title}</h2>
        <h4>The story</h4><p className="story">{open.story}</p>
        <h4>The rule</h4><p>{open.rule}</p>
        <h4>Example</h4><p className="example">{open.example}</p>
        <h4>Check yourself</h4><p><b>{open.check.q}</b></p>
        {showAns ? <p className="answer">{open.check.a}</p> : <button className="btn ghost" onClick={() => setShowAns(true)}>Show answer</button>}
      </article>
    </div>
  )
  return (
    <div className="screen">
      <h2 className="section">Beginner lessons</h2>
      <p className="muted">No accounting background needed. Each lesson takes about 3 minutes.</p>
      {list.map((l) => (
        <button key={l.id} className="card row" onClick={() => setOpen(l)}>
          <span><b>{l.title}</b><small>{l.exams.map((x) => examById(x)?.name).join(' · ')}</small></span><span className="chev">›</span>
        </button>
      ))}
    </div>
  )
}

function Guides() {
  const [seg, setSeg] = useState<'exam' | 'work'>('exam')
  return (
    <div className="screen">
      <div className="seg big">
        <button className={seg === 'exam' ? 'on' : ''} onClick={() => setSeg('exam')}>Exam challenges</button>
        <button className={seg === 'work' ? 'on' : ''} onClick={() => setSeg('work')}>At work</button>
      </div>
      {seg === 'exam' ? CHALLENGES.map((c) => (
        <details key={c.id} className="card guide">
          <summary>{c.title}</summary>
          <p className="muted">Sounds like you if: {c.symptoms.join('; ')}</p>
          <ol>{c.actions.map((a, i) => <li key={i}>{a}</li>)}</ol>
          <p className="metric">Target: {c.metric}</p>
        </details>
      )) : (
        <>
          <p className="notice">{WORKPLACE_DISCLAIMER}</p>
          {WORKPLACE.map((w) => (
            <details key={w.id} className="card guide">
              <summary>{w.title}</summary>
              <p className="muted">Framework: {w.framework}</p>
              <ol>{w.steps.map((a, i) => <li key={i}>{a}</li>)}</ol>
              <p className="metric">Red flags: {w.redFlags.join(' · ')}</p>
            </details>
          ))}
        </>
      )}
    </div>
  )
}

function Progress() {
  const s = useStore()
  const exams = s.exam ? EXAMS.filter((e) => e.id === s.exam) : EXAMS
  const cards = Object.entries(s.cards).filter(([id]) => { const q = QUESTIONS.find((x) => x.id === id); return q && inScope(q, s.exam) }).map(([, c]) => c)
  const seen = cards.reduce((a, c) => a + c.seen, 0), right = cards.reduce((a, c) => a + c.correct, 0)
  const mastered = cards.filter((c) => c.box >= 4).length
  return (
    <div className="screen">
      <div className="stats">
        <div><b>{seen ? Math.round((right / seen) * 100) : 0}%</b><span>accuracy</span></div>
        <div><b>{mastered}</b><span>mastered</span></div>
        <div><b>{seen}</b><span>answers</span></div>
      </div>
      {exams.map((e) => (
        <section key={e.id}>
          <h3 className="section">{e.name}</h3>
          <div className="card">
            {e.papers.map((p) => {
              const qs = QUESTIONS.filter((q) => q.paper === p.id)
              const cs = qs.map((q) => s.cards[q.id]).filter(Boolean)
              const acc = cs.length ? cs.reduce((a, c) => a + c.correct, 0) / cs.reduce((a, c) => a + c.seen, 0) : 0
              return (
                <div key={p.id} className="bar">
                  <span>{p.name}</span>
                  <div className="track"><div style={{ width: `${acc * 100}%` }} className={acc >= 0.75 ? 'good' : acc >= 0.5 ? 'mid' : 'low'} /></div>
                  <small>{cs.length ? `${Math.round(acc * 100)}% · ${cs.length}/${qs.length} seen` : `${qs.length} Qs · not started`}</small>
                </div>
              )
            })}
          </div>
        </section>
      ))}
      <h3 className="section">Settings</h3>
      <div className="card">
        <p><b>Show first after answering</b></p>
        <div className="seg">
          <button className={s.level === 'simple' ? 'on' : ''} onClick={() => setLevel('simple')}>Plain-words story</button>
          <button className={s.level === 'standard' ? 'on' : ''} onClick={() => setLevel('standard')}>Worked solution</button>
        </div>
        <button className="link danger" onClick={() => confirm('Erase all progress on this device?') && resetProgress()}>Reset progress</button>
      </div>
      <p className="muted small">Content: {QUESTIONS.length} original practice questions. These are not real exam questions. Items marked “Draft” have not yet been checked by a qualified expert. Syllabi change every year, so always confirm against the official syllabus.</p>
    </div>
  )
}
