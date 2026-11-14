import { useEffect, useState } from 'react'
import { backend, type ProfileRow } from './backend'
import { CHALLENGES, EXAMS, LESSONS, QUESTIONS, WORKPLACE, WORKPLACE_DISCLAIMER, examById, noteFor, paperById, type Lesson, type Question } from './data'
import ExamSim from './ExamSim'
import { generateMany, hasGenerator } from './generators'
import Login from './Login'
import Me, { APP_VERSION } from './Me'
import Planner, { tasksFor, type Task } from './Planner'
import Quiz from './Quiz'
import { dueQuestions, inScope, setExam, shuffle, streak, useStore, weakQuestions } from './store'
import Tutor, { type TutorContext } from './Tutor'

type Tab = 'home' | 'learn' | 'practice' | 'exam' | 'plan' | 'me' | 'tutor'
type Session = { questions: Question[]; mode: 'practice' | 'mock'; title: string }
type Focus = { exam: string; paper: string; topic: string } | null
const MAIN_EXAMS = EXAMS.filter((e) => e.id === 'CPA' || e.id === 'FRM')

/** Hand-written questions for a filter, topped up with freshly generated calculation variants. */
function questionsFor(f: { exam?: string | null; paper?: string; topic?: string }, n: number) {
  const hand = shuffle(QUESTIONS.filter((q) => (!f.exam || q.exam === f.exam) && (!f.paper || q.paper === f.paper) && (!f.topic || q.topic === f.topic))).slice(0, n)
  return shuffle([...hand, ...generateMany(f, n - hand.length)])
}

export default function App() {
  const [ready, setReady] = useState(!backend.enabled), [signedIn, setSignedIn] = useState(false), [me, setMe] = useState<ProfileRow | null>(null)
  const [cfg, setCfg] = useState<Record<string, any>>({})
  useEffect(() => {
    if (!backend.enabled) return
    let stop = () => {}
    const boot = async (has: boolean) => {
      setSignedIn(has)
      if (has) { const p = await backend.me(); setMe(p); if (p?.status === 'active') { await backend.syncNow(); stop(); stop = backend.startAutoSync(); setCfg(await backend.config()) } }
      setReady(true)
    }
    void backend.session().then((s) => boot(!!s))
    const sub = backend.onAuth((s) => { if (!s) { setSignedIn(false); setMe(null) } else void boot(true) })
    return () => { sub.unsubscribe(); stop() }
  }, [])

  if (!ready) return <div className="login"><p className="muted">Loading…</p></div>
  if (backend.enabled && !signedIn) return <Login />
  if (backend.enabled && me?.status !== 'active') return (
    <div className="login"><div className="card"><h2>Access paused</h2><p>{me ? 'Your access has been revoked by the app admin. Your records are kept safely; contact the admin to restore access.' : 'Your account could not be loaded. Check your connection.'}</p><button className="btn wide" onClick={() => backend.signOut()}>Sign out</button></div></div>
  )
  return <Shell me={me} cfg={cfg} />
}

function Shell({ me, cfg }: { me: ProfileRow | null; cfg: Record<string, any> }) {
  const s = useStore()
  const [tab, setTab] = useState<Tab>('home'), [session, setSession] = useState<Session | null>(null), [examMode, setExamMode] = useState(false)
  const [ctx, setCtx] = useState<TutorContext>(null), [focus, setFocus] = useState<Focus>(null)
  const start = (questions: Question[], mode: Session['mode'], title: string) => setSession({ questions, mode, title })
  const ask = (q: Question) => { setCtx({ label: q.stem.slice(0, 70) + (q.stem.length > 70 ? '…' : ''), text: `Question: ${q.stem}\nOptions: ${q.options.map((o, i) => `${'ABCD'[i]}. ${o}`).join(' | ')}\nCorrect answer: ${'ABCD'[q.answer]}\nApp explanation: ${q.explain.steps.join(' ')}\nTrap: ${q.explain.trap}\nTopic: ${q.exam} ${q.paper} ${q.topic}` }); setSession(null); setTab('tutor') }
  const doTask = (t: Task) => {
    const a = t.action; if (!a) return
    if (a.kind === 'topic' && a.topic) { if (t.label.startsWith('Read')) { setFocus({ exam: a.exam, paper: a.paper!, topic: a.topic }); setTab('learn') } else start(questionsFor({ exam: a.exam, paper: a.paper, topic: a.topic }, 15), 'practice', a.topic) }
    if (a.kind === 'paper') start(questionsFor({ exam: a.exam, paper: a.paper }, 30), 'practice', paperById(a.paper!)?.name ?? '')
    if (a.kind === 'review') { const d = dueQuestions(a.exam), w = weakQuestions(a.exam); start(d.length ? d : w.length ? shuffle(w) : questionsFor({ exam: a.exam }, 15), 'practice', 'Review') }
    if (a.kind === 'mock') { setTab('exam'); setExamMode(true) }
  }
  const newer = cfg.latest_version && cfg.latest_version !== APP_VERSION && cfg.latest_version.localeCompare(APP_VERSION, undefined, { numeric: true }) > 0

  if (session) return <Quiz {...session} onExit={() => setSession(null)} onAsk={ask} />
  if (examMode) return <ExamSim onExit={() => setExamMode(false)} />

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="logo">M</span> Exam Mastery {me && <span className="muted small hello">Hi {s.profile.name || me.email.split('@')[0]}</span>}</div>
        <div className="chips" role="radiogroup" aria-label="Exam">
          <button className={!s.exam ? 'on' : ''} onClick={() => setExam(null)}>All</button>
          {EXAMS.map((e) => <button key={e.id} className={s.exam === e.id ? 'on' : ''} onClick={() => setExam(e.id)}>{e.name}</button>)}
        </div>
      </header>
      {newer && <a className="banner" href={cfg.apk_url || '#'} target="_blank" rel="noreferrer">⬆ Version {cfg.latest_version} is available. Tap to download the update. Your data stays safe.</a>}
      {cfg.announcement && <p className="banner info">📣 {cfg.announcement}</p>}
      <main>
        {tab === 'home' && <Home start={start} go={setTab} doTask={doTask} openExam={() => { setTab('exam'); setExamMode(true) }} />}
        {tab === 'learn' && <Learn focus={focus} setFocus={setFocus} start={start} ask={(l, t) => { setCtx({ label: l, text: t }); setTab('tutor') }} />}
        {tab === 'practice' && <Practice start={start} />}
        {tab === 'exam' && <ExamHub open={() => setExamMode(true)} />}
        {tab === 'plan' && <Planner onTask={doTask} />}
        {tab === 'me' && <Me me={me} />}
        {tab === 'tutor' && <Tutor context={ctx} onClearContext={() => setCtx(null)} />}
      </main>
      {tab !== 'tutor' && <button className="fab" onClick={() => setTab('tutor')} aria-label="Ask Mentor">💬</button>}
      <nav className="tabs">
        {([['home', '⌂', 'Home'], ['learn', '◎', 'Learn'], ['practice', '✎', 'Practice'], ['exam', '⏱', 'Exam'], ['plan', '🗓', 'Plan'], ['me', '☺', 'Me']] as const).map(([k, icon, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{icon}</span>{label}</button>
        ))}
      </nav>
    </div>
  )
}

function Home({ start, go, doTask, openExam }: { start: (q: Question[], m: 'practice' | 'mock', t: string) => void; go: (t: Tab) => void; doTask: (t: Task) => void; openExam: () => void }) {
  const s = useStore(), exam = s.exam ? examById(s.exam) : null
  const due = dueQuestions(s.exam), weak = weakQuestions(s.exam)
  const today = s.plan ? tasksFor(s.plan, new Date().toISOString().slice(0, 10)) : []
  const daysLeft = s.plan ? Math.round((Date.parse(s.plan.targetDate) - Date.now()) / 86_400_000) : null
  return (
    <div className="screen">
      <section className="hero">
        <p className="eyebrow">{exam ? exam.body : 'CPA · FRM · CMA · CA · CMA India'}</p>
        <h1>{exam ? exam.name : 'Learn it once. Remember it on exam day.'}</h1>
        <p>{exam ? exam.plain : 'Plain-language stories, worked solutions, exam traps, real-format simulations and a personal AI mentor.'}</p>
      </section>
      <div className="stats"><div><b>{streak()}</b><span>day streak</span></div><div><b>{due.length}</b><span>due today</span></div><div><b>{daysLeft ?? '–'}</b><span>days to exam</span></div></div>
      {!s.plan && <button className="card action primary" onClick={() => go('plan')}><b>🎯 Set your target exam date</b><span>Get a day-by-day plan, journey checklist and location advice.</span></button>}
      {today.length > 0 && <div className="card"><h3>Today's plan</h3>{today.map((t) => <div key={t.key} className="task"><span className={s.plan!.done[t.key] ? 'strike' : ''}>{t.label}</span>{t.action && <button className="btn small" onClick={() => doTask(t)}>Go</button>}</div>)}</div>}
      <button className="card action" onClick={() => due.length ? start(due, 'practice', 'Daily review') : start(questionsFor({ exam: s.exam }, 10), 'practice', 'Today’s 10')}>
        <b>{due.length ? `Daily review · ${due.length} questions` : 'Quick practice: 10 questions'}</b><span>{due.length ? 'Questions come back just before you would forget them.' : 'Answer, then read why.'}</span>
      </button>
      {weak.length > 0 && <button className="card action" onClick={() => start(shuffle(weak), 'practice', 'Weak areas')}><b>Fix weak areas · {weak.length}</b><span>Questions you got wrong recently.</span></button>}
      <button className="card action" onClick={openExam}><b>⏱ Real exam simulation</b><span>CPA testlets + simulations, or FRM 100/80-question format, with timer and calculator.</span></button>
      <button className="card action" onClick={() => go('tutor')}><b>💬 Ask Mentor any doubt</b><span>Your AI coach explains in simple words, then at exam level.</span></button>
    </div>
  )
}

function ExamHub({ open }: { open: () => void }) {
  const s = useStore(), exams = s.attempts.filter((a) => a.kind === 'exam').reverse()
  return (
    <div className="screen">
      <button className="card action primary" onClick={open}><b>Start or resume a simulation</b><span>Mini (≈1 hour) or full-length, in the official format.</span></button>
      <h3 className="section">Your simulation history</h3>
      {exams.map((a) => <div key={a.id} className="card row static"><span><b>{a.title}</b><small>{new Date(a.at).toLocaleDateString('en-IN')} · {Math.round(a.seconds / 60)} min{a.tbsTotal ? ` · TBS ${a.tbsScore}/${a.tbsTotal}` : ''}</small></span><span className={`pill ${a.score / a.total >= 0.75 ? 'good' : a.score / a.total >= 0.6 ? 'mid' : 'low'}`}>{Math.round((a.score / a.total) * 100)}%</span></div>)}
      {!exams.length && <p className="muted">No simulations yet. Readiness rule of thumb: 75%+ on three full simulations in a row.</p>}
    </div>
  )
}

function Practice({ start }: { start: (q: Question[], m: 'practice' | 'mock', t: string) => void }) {
  const s = useStore(), [paper, setPaper] = useState<string | null>(null)
  const exams = s.exam ? EXAMS.filter((e) => e.id === s.exam) : MAIN_EXAMS.concat(EXAMS.filter((e) => !MAIN_EXAMS.includes(e)))
  if (paper) {
    const p = paperById(paper)!, e = EXAMS.find((x) => x.papers.includes(p))!
    return (
      <div className="screen">
        <button className="link" onClick={() => setPaper(null)}>‹ {e.name}</button>
        <h2 className="section">{p.name}</h2>
        <button className="card action primary" onClick={() => start(questionsFor({ exam: e.id, paper }, 30), 'practice', p.name)}><b>Practise the whole paper</b><span>30 mixed questions, instant explanations</span></button>
        {p.topics.map((t) => {
          const hand = QUESTIONS.filter((q) => q.paper === paper && q.topic === t).length, gen = hasGenerator(e.id, paper, t)
          return (
            <div key={t} className="card row static">
              <span><b>{t}</b><small>{hand} hand-written{gen ? ' · ∞ auto-generated calculations' : ''}</small></span>
              <span className="btncol"><button className="btn small" disabled={!hand && !gen} onClick={() => start(questionsFor({ exam: e.id, paper, topic: t }, 15), 'practice', t)}>Practise</button>
                {gen && <button className="btn ghost small" onClick={() => start(generateMany({ exam: e.id, paper, topic: t }, 20), 'practice', `${t}: new set`)}>+20 new</button>}</span>
            </div>
          )
        })}
      </div>
    )
  }
  const pool = QUESTIONS.filter((q) => inScope(q, s.exam))
  return (
    <div className="screen">
      <div className="grid2">
        <button className="card action" onClick={() => start(questionsFor({ exam: s.exam }, 25), 'practice', 'Mixed practice')}><b>Mixed practice</b><span>Instant explanation after each answer</span></button>
        <button className="card action" onClick={() => start(questionsFor({ exam: s.exam }, 20), 'mock', 'Quick mock')}><b>Quick mock</b><span>Timed, 90 s/question, answers at the end</span></button>
      </div>
      <p className="muted small">{pool.length} hand-written questions{!s.exam || s.exam === 'CPA' || s.exam === 'FRM' ? ', plus unlimited auto-generated calculation questions for CPA and FRM' : ''}.</p>
      {exams.map((e) => (
        <section key={e.id}>
          <h3 className="section">{e.name} <a className="src" href={e.officialSource} target="_blank" rel="noreferrer">official syllabus ↗</a></h3>
          {e.papers.map((p) => {
            const n = QUESTIONS.filter((q) => q.paper === p.id).length, gen = hasGenerator(e.id, p.id)
            return <button key={p.id} className="card row" disabled={!n && !gen} onClick={() => setPaper(p.id)}><span><b>{p.name}</b><small>{p.kind} · {p.topics.length} topics · {n} questions{gen ? ' + ∞ generated' : ''}</small></span><span className="chev">›</span></button>
          })}
        </section>
      ))}
    </div>
  )
}

function Learn({ focus, setFocus, start, ask }: { focus: Focus; setFocus: (f: Focus) => void; start: (q: Question[], m: 'practice' | 'mock', t: string) => void; ask: (label: string, text: string) => void }) {
  const s = useStore(), [seg, setSeg] = useState<'topics' | 'basics' | 'stuck'>('topics'), [lesson, setLesson] = useState<Lesson | null>(null), [showAns, setShowAns] = useState(false), [work, setWork] = useState(false)
  if (focus) {
    const n = noteFor(focus.exam, focus.paper, focus.topic)
    return (
      <div className="screen">
        <button className="link" onClick={() => setFocus(null)}>‹ All topics</button>
        <article className="card lesson">
          <p className="eyebrow">{focus.exam} · {paperById(focus.paper)?.name}</p><h2>{focus.topic}</h2>
          {n ? <><h4>The big idea</h4><p className="story">{n.idea}</p><h4>Must know</h4><ul>{n.key.map((k, i) => <li key={i}>{k}</li>)}</ul>
            {n.formula && <><h4>Formulas</h4>{n.formula.map((f, i) => <p key={i} className="example">{f}</p>)}</>}<h4>Exam tip</h4><p className="trap">{n.tip}</p></> : <p className="muted">Coaching note coming soon. Ask Mentor for an explanation meanwhile.</p>}
          <div className="grid2"><button className="btn" onClick={() => start(questionsFor(focus, 15), 'practice', focus.topic)}>Practise this topic</button><button className="btn ghost" onClick={() => ask(focus.topic, `Topic: ${focus.exam} ${focus.paper} ${focus.topic}\n${n ? `${n.idea}\n${n.key.join('\n')}\nTip: ${n.tip}` : ''}`)}>💬 Ask Mentor</button></div>
        </article>
      </div>
    )
  }
  if (lesson) return (
    <div className="screen"><button className="link" onClick={() => { setLesson(null); setShowAns(false) }}>‹ Basics</button>
      <article className="card lesson"><h2>{lesson.title}</h2><h4>The story</h4><p className="story">{lesson.story}</p><h4>The rule</h4><p>{lesson.rule}</p><h4>Example</h4><p className="example">{lesson.example}</p><h4>Check yourself</h4><p><b>{lesson.check.q}</b></p>
        {showAns ? <p className="answer">{lesson.check.a}</p> : <button className="btn ghost" onClick={() => setShowAns(true)}>Show answer</button>}</article></div>
  )
  const exams = s.exam ? EXAMS.filter((e) => e.id === s.exam) : MAIN_EXAMS
  return (
    <div className="screen">
      <div className="seg big"><button className={seg === 'topics' ? 'on' : ''} onClick={() => setSeg('topics')}>Topic coaching</button><button className={seg === 'basics' ? 'on' : ''} onClick={() => setSeg('basics')}>Absolute basics</button><button className={seg === 'stuck' ? 'on' : ''} onClick={() => setSeg('stuck')}>I'm stuck</button></div>
      {seg === 'topics' && exams.map((e) => <section key={e.id}><h3 className="section">{e.name}</h3>{e.papers.map((p) => (
        <details key={p.id} className="card guide"><summary>{p.name}</summary>{p.topics.map((t) => <button key={t} className="row linkrow" onClick={() => setFocus({ exam: e.id, paper: p.id, topic: t })}><span>{t}</span><span className="chev">›</span></button>)}</details>
      ))}</section>)}
      {seg === 'basics' && <>{<p className="muted">No accounting background needed. About 3 minutes each.</p>}{LESSONS.filter((l) => !s.exam || l.exams.includes(s.exam)).map((l) => <button key={l.id} className="card row" onClick={() => setLesson(l)}><span><b>{l.title}</b><small>{l.exams.map((x) => examById(x)?.name).join(' · ')}</small></span><span className="chev">›</span></button>)}</>}
      {seg === 'stuck' && <>
        <div className="seg"><button className={!work ? 'on' : ''} onClick={() => setWork(false)}>Exam problems</button><button className={work ? 'on' : ''} onClick={() => setWork(true)}>At work</button></div>
        {!work ? CHALLENGES.map((c) => <details key={c.id} className="card guide"><summary>{c.title}</summary><p className="muted">Sounds like you if: {c.symptoms.join('; ')}</p><ol>{c.actions.map((a, i) => <li key={i}>{a}</li>)}</ol><p className="metric">Target: {c.metric}</p></details>)
          : <><p className="notice">{WORKPLACE_DISCLAIMER}</p>{WORKPLACE.map((w) => <details key={w.id} className="card guide"><summary>{w.title}</summary><p className="muted">Framework: {w.framework}</p><ol>{w.steps.map((a, i) => <li key={i}>{a}</li>)}</ol><p className="metric">Red flags: {w.redFlags.join(' · ')}</p></details>)}</>}
      </>}
    </div>
  )
}
