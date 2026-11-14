import { useEffect, useMemo, useState } from 'react'
import { EXAMS, LOGISTICS, QUESTIONS, TBS, paperById, type Question, type Tbs } from './data'
import { fromId, generateMany, hasGenerator } from './generators'
import { Explanation } from './Quiz'
import { addAttempt, record, shuffle } from './store'

type Testlet = { kind: 'mcq'; qids: string[] } | { kind: 'tbs'; tids: string[] }
type Run = {
  exam: 'CPA' | 'FRM'; paper: string; title: string; full: boolean; testlets: Testlet[]; t: number; i: number
  answers: Record<string, number | null>; tbsAns: Record<string, (string | number | null)[]>; flags: Record<string, boolean>
  left: number; total: number; startedAt: number; breakTaken: boolean; onBreak: boolean; done: boolean; mcqWeight: number
}
const SAVE = 'exam-mastery.exam-in-progress'
const LETTERS = 'ABCDEF'
const qById = (id: string): Question | null => QUESTIONS.find((q) => q.id === id) ?? fromId(id)
const saveRun = (r: Run | null) => { try { r ? localStorage.setItem(SAVE, JSON.stringify(r)) : localStorage.removeItem(SAVE) } catch { /* ignore */ } }
const loadRun = (): Run | null => { try { return JSON.parse(localStorage.getItem(SAVE) || 'null') } catch { return null } }

/** Pick n questions for the given papers: hand-written first (shuffled), then generated variants to fill. */
function pool(exam: string, papers: string[], n: number): string[] {
  const hand = shuffle(QUESTIONS.filter((q) => q.exam === exam && papers.includes(q.paper))).map((q) => q.id)
  if (hand.length >= n) return hand.slice(0, n)
  const genPapers = papers.filter((p) => hasGenerator(exam, p))
  const need = n - hand.length, gen: string[] = []
  genPapers.forEach((p, k) => gen.push(...generateMany({ exam, paper: p }, Math.ceil(need / genPapers.length), Date.now() % 100000 + k * 50000).map((q) => q.id)))
  return [...hand, ...shuffle(gen).slice(0, need)]
}

function buildCpa(paper: string, full: boolean): Run {
  const spec = LOGISTICS.CPA.format.sections.find((s: any) => s.id === paper)
  const mcqN = full ? spec.mcq : 20, split: number[] = full ? spec.tbsSplit.split('/').map(Number) : [1, 1]
  const qids = pool('CPA', [paper], mcqN), half = Math.ceil(qids.length / 2)
  const tasks = shuffle(TBS.filter((t) => t.paper === paper)).map((t) => t.id)
  const testlets: Testlet[] = [{ kind: 'mcq', qids: qids.slice(0, half) }, { kind: 'mcq', qids: qids.slice(half) }]
  let k = 0; for (const n of split) { const tids = tasks.slice(k, k + n); k += n; if (tids.length) testlets.push({ kind: 'tbs', tids }) }
  const total = full ? 4 * 3600 : 60 * 60
  return { exam: 'CPA', paper, title: `CPA ${paper} ${full ? 'full simulation' : 'mini simulation'}`, full, testlets, t: 0, i: 0, answers: {}, tbsAns: {}, flags: {}, left: total, total, startedAt: Date.now(), breakTaken: false, onBreak: false, done: false, mcqWeight: spec.mcqWeight / 100 }
}
function buildFrm(part: 1 | 2, full: boolean): Run {
  const fmt = part === 1 ? LOGISTICS.FRM.format.part1 : LOGISTICS.FRM.format.part2
  const n = full ? fmt.questions : 20
  const papers = EXAMS.find((e) => e.id === 'FRM')!.papers.filter((p) => p.kind === (part === 1 ? 'Part I' : 'Part II'))
  const weights = Object.values(fmt.weights as Record<string, number>)
  const qids: string[] = []
  papers.forEach((p, k) => qids.push(...pool('FRM', [p.id], Math.round((n * (weights[k] ?? 100 / papers.length)) / 100))))
  const ids = shuffle(qids).slice(0, n), total = Math.round((full ? 4 * 3600 : (4 * 3600 * n) / fmt.questions))
  return { exam: 'FRM', paper: `Part ${part === 1 ? 'I' : 'II'}`, title: `FRM Part ${part === 1 ? 'I' : 'II'} ${full ? 'full simulation' : 'mini simulation'}`, full, testlets: [{ kind: 'mcq', qids: ids }], t: 0, i: 0, answers: {}, tbsAns: {}, flags: {}, left: total, total, startedAt: Date.now(), breakTaken: true, onBreak: false, done: false, mcqWeight: 1 }
}

function scoreTbs(task: Tbs, ans: (string | number | null)[] = []) {
  return task.rows.map((r, i) => {
    const a = ans[i]; if (a === null || a === undefined || a === '') return false
    return r.kind === 'number' ? Math.abs(Number(String(a).replace(/,/g, '')) - Number(r.answer)) <= (r.tolerance ?? 0.5) : a === r.answer
  })
}

export default function ExamSim({ onExit }: { onExit: () => void }) {
  const [run, setRun] = useState<Run | null>(() => loadRun())
  const [calc, setCalc] = useState(false), [nav, setNav] = useState(false)
  const update = (r: Run) => { setRun(r); saveRun(r.done ? null : r) }

  useEffect(() => {
    if (!run || run.done || run.onBreak) return
    if (run.left <= 0) { finish(run); return }
    const t = setTimeout(() => update({ ...run, left: run.left - 1 }), 1000)
    return () => clearTimeout(t)
  })

  function finish(r: Run) {
    const mcqIds = r.testlets.flatMap((t) => (t.kind === 'mcq' ? t.qids : []))
    const detail = mcqIds.map((id) => { const q = qById(id)!; const ok = r.answers[id] === q.answer; if (r.answers[id] !== undefined && r.answers[id] !== null) record(q, ok); return { qid: id, topic: q.topic, correct: ok } })
    const tids = r.testlets.flatMap((t) => (t.kind === 'tbs' ? t.tids : []))
    let tbsScore = 0, tbsTotal = 0
    for (const id of tids) { const res = scoreTbs(TBS.find((x) => x.id === id)!, r.tbsAns[id]); tbsScore += res.filter(Boolean).length; tbsTotal += res.length }
    addAttempt({ kind: 'exam', exam: r.exam, paper: r.paper, title: r.title, score: detail.filter((d) => d.correct).length, total: detail.length, seconds: r.total - r.left, detail, tbsScore, tbsTotal })
    update({ ...r, done: true })
  }

  if (!run) return <Setup onStart={(r) => update(r)} onExit={onExit} />
  if (run.done) return <Results run={run} onExit={() => { saveRun(null); setRun(null); onExit() }} />
  if (run.onBreak) return (
    <div className="screen"><div className="card result"><h2>Optional break</h2><p className="muted">Your exam clock is paused, as in the real CPA standard break. Stretch and drink water.</p><button className="btn" onClick={() => update({ ...run, onBreak: false })}>Resume exam</button></div></div>
  )

  const tl = run.testlets[run.t], lastTestlet = run.t === run.testlets.length - 1
  const hh = Math.floor(run.left / 3600), mm = String(Math.floor((run.left % 3600) / 60)).padStart(2, '0'), ss = String(run.left % 60).padStart(2, '0')
  const items = tl.kind === 'mcq' ? tl.qids : tl.tids, id = items[run.i]
  const submitTestlet = () => {
    if (!confirm(lastTestlet ? 'Submit the exam? You cannot change answers afterwards.' : 'Submit this testlet? You cannot return to it, just like the real exam.')) return
    if (lastTestlet) return finish(run)
    const next = { ...run, t: run.t + 1, i: 0 }
    if (run.exam === 'CPA' && run.t === 2 && !run.breakTaken && confirm('Take the optional break now? The exam clock pauses.')) return update({ ...next, breakTaken: true, onBreak: true })
    update(next)
  }

  return (
    <div className="screen exam">
      <div className="exambar">
        <span><b>{run.exam === 'CPA' ? `Testlet ${run.t + 1}/${run.testlets.length}` : run.paper}</b> · {tl.kind === 'mcq' ? 'MCQ' : 'Simulation'} {run.i + 1}/{items.length}</span>
        <span className={`timer ${run.left < 600 ? 'warn' : ''}`}>⏱ {hh}:{mm}:{ss}</span>
      </div>
      <div className="examtools">
        <button className="chipbtn" onClick={() => setNav(true)}>☰ Navigator</button>
        <button className={`chipbtn ${run.flags[id] ? 'on' : ''}`} onClick={() => update({ ...run, flags: { ...run.flags, [id]: !run.flags[id] } })}>⚑ {run.flags[id] ? 'Flagged' : 'Flag'}</button>
        <button className="chipbtn" onClick={() => setCalc(true)}>⌗ Calculator</button>
        <button className="chipbtn" onClick={() => { saveRun(run); onExit() }}>Pause &amp; exit</button>
      </div>
      {tl.kind === 'mcq' ? <McqItem q={qById(id)!} picked={run.answers[id] ?? null} onPick={(n) => update({ ...run, answers: { ...run.answers, [id]: n } })} />
        : <TbsItem task={TBS.find((x) => x.id === id)!} ans={run.tbsAns[id] ?? []} onChange={(a) => update({ ...run, tbsAns: { ...run.tbsAns, [id]: a } })} />}
      <div className="navrow">
        <button className="btn ghost" disabled={run.i === 0} onClick={() => update({ ...run, i: run.i - 1 })}>← Previous</button>
        {run.i < items.length - 1 ? <button className="btn" onClick={() => update({ ...run, i: run.i + 1 })}>Next →</button>
          : <button className="btn" onClick={submitTestlet}>{lastTestlet ? 'Submit exam' : 'Submit testlet'}</button>}
      </div>
      {nav && (
        <div className="modal" onClick={() => setNav(false)}><div className="sheet" onClick={(e) => e.stopPropagation()}>
          <h3>Questions in this {run.exam === 'CPA' ? 'testlet' : 'exam'}</h3>
          <div className="navgrid">{items.map((x, k) => {
            const answered = tl.kind === 'mcq' ? run.answers[x] !== undefined && run.answers[x] !== null : (run.tbsAns[x] ?? []).some((v) => v !== null && v !== '')
            return <button key={x} className={`${answered ? 'ans' : ''} ${run.flags[x] ? 'flag' : ''} ${k === run.i ? 'cur' : ''}`} onClick={() => { update({ ...run, i: k }); setNav(false) }}>{k + 1}</button>
          })}</div>
          <p className="muted small">Filled = answered · Gold border = flagged</p>
          <button className="btn" onClick={() => { setNav(false); submitTestlet() }}>{lastTestlet ? 'Submit exam' : 'Submit testlet'}</button>
        </div></div>
      )}
      {calc && <Calculator onClose={() => setCalc(false)} />}
    </div>
  )
}

function McqItem({ q, picked, onPick }: { q: Question; picked: number | null; onPick: (n: number) => void }) {
  return (
    <div className="card">
      <h2 className="stem">{q.stem}</h2>
      <div className="options">{q.options.map((o, n) => (
        <button key={n} className={`opt ${picked === n ? 'chosen' : ''}`} onClick={() => onPick(n)}><span className="letter">{LETTERS[n]}</span><span>{o}</span></button>
      ))}</div>
    </div>
  )
}

function TbsItem({ task, ans, onChange }: { task: Tbs; ans: (string | number | null)[]; onChange: (a: (string | number | null)[]) => void }) {
  const set = (i: number, v: string) => { const a = [...ans]; a[i] = v; onChange(a) }
  return (
    <div className="card tbs">
      <p className="eyebrow">Task-based simulation · {task.topic}</p>
      <h2 className="stem">{task.title}</h2>
      <p className="exhibit">{task.scenario}</p>
      <table className="tbsgrid"><tbody>{task.rows.map((r, i) => (
        <tr key={i}><td>{r.label}</td><td>{r.kind === 'number'
          ? <input inputMode="decimal" value={(ans[i] as string) ?? ''} onChange={(e) => set(i, e.target.value)} placeholder="0" />
          : <select value={(ans[i] as string) ?? ''} onChange={(e) => set(i, e.target.value)}><option value="">Select…</option>{r.options!.map((o) => <option key={o}>{o}</option>)}</select>}</td></tr>
      ))}</tbody></table>
    </div>
  )
}

function Results({ run, onExit }: { run: Run; onExit: () => void }) {
  const mcq = run.testlets.flatMap((t) => (t.kind === 'mcq' ? t.qids : [])).map((id) => ({ q: qById(id)!, a: run.answers[id] }))
  const right = mcq.filter((x) => x.a === x.q.answer).length
  const tbs = run.testlets.flatMap((t) => (t.kind === 'tbs' ? t.tids : [])).map((id) => { const task = TBS.find((x) => x.id === id)!; return { task, res: scoreTbs(task, run.tbsAns[id]) } })
  const tRight = tbs.reduce((s, x) => s + x.res.filter(Boolean).length, 0), tTot = tbs.reduce((s, x) => s + x.res.length, 0)
  const mcqPct = mcq.length ? right / mcq.length : 0, tbsPct = tTot ? tRight / tTot : null
  const overall = tbsPct === null ? mcqPct : mcqPct * run.mcqWeight + tbsPct * (1 - run.mcqWeight)
  const byTopic = useMemo(() => { const m = new Map<string, [number, number]>(); for (const x of mcq) { const v = m.get(x.q.topic) ?? [0, 0]; v[1]++; if (x.a === x.q.answer) v[0]++; m.set(x.q.topic, v) } return [...m.entries()].sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]) }, [run])
  const band = (p: number) => (p >= 0.75 ? 'Strong' : p >= 0.6 ? 'Borderline' : 'Needs work')
  return (
    <div className="screen">
      <div className="card result">
        <p className="eyebrow">{run.title}</p>
        <div className={`ring ${overall >= 0.75 ? 'good' : overall >= 0.6 ? 'mid' : 'low'}`}>{Math.round(overall * 100)}%</div>
        <p>MCQ {right}/{mcq.length}{tbsPct !== null ? ` · Simulations ${tRight}/${tTot} cells` : ''} · {Math.round((run.total - run.left) / 60)} min used</p>
        <p className="muted small">{run.exam === 'CPA' ? 'The real CPA reports a scaled score (75 to pass), not a percentage. Use this as a readiness signal: aim for 75%+ on several full simulations.' : 'GARP does not publish a pass mark. Candidates commonly target 70%+ on full mocks.'}</p>
        <button className="btn" onClick={onExit}>Done</button>
      </div>
      <h3 className="section">Performance by topic</h3>
      <div className="card">{byTopic.map(([t, [a, n]]) => (
        <div key={t} className="bar"><span>{t}</span><div className="track"><div style={{ width: `${(a / n) * 100}%` }} className={a / n >= 0.75 ? 'good' : a / n >= 0.6 ? 'mid' : 'low'} /></div><small>{a}/{n} · {band(a / n)}</small></div>
      ))}</div>
      {tbs.map(({ task, res }) => (
        <details key={task.id} className={`card review ${res.every(Boolean) ? 'ok' : 'bad'}`}><summary><span className="dot" />Simulation: {task.title} ({res.filter(Boolean).length}/{res.length})</summary>
          <table className="tbsgrid"><tbody>{task.rows.map((r, i) => <tr key={i}><td>{r.label}</td><td>{res[i] ? '✓' : '✗'} {String(run.tbsAns[task.id]?.[i] ?? '—')}</td><td><b>{typeof r.answer === 'number' ? r.answer.toLocaleString() : r.answer}</b></td></tr>)}</tbody></table>
          <p className="story">{task.explain}</p>
        </details>
      ))}
      <h3 className="section">Review every question</h3>
      {mcq.map(({ q, a }) => (
        <details key={q.id} className={`card review ${a === q.answer ? 'ok' : 'bad'}`}><summary><span className="dot" />{q.stem}</summary>
          <p><b>Correct:</b> {LETTERS[q.answer]}. {q.options[q.answer]}</p>
          {a !== q.answer && <p className="muted"><b>You chose:</b> {a === null || a === undefined ? 'No answer' : `${LETTERS[a]}. ${q.options[a]}`}</p>}
          <Explanation q={q} level="simple" />
        </details>
      ))}
    </div>
  )
}

function Setup({ onStart, onExit }: { onStart: (r: Run) => void; onExit: () => void }) {
  const [exam, setExam] = useState<'CPA' | 'FRM'>('CPA'), [paper, setPaper] = useState('FAR'), [part, setPart] = useState<1 | 2>(1), [full, setFull] = useState(false)
  const L = LOGISTICS
  const spec = L.CPA.format.sections.find((s: any) => s.id === paper)
  return (
    <div className="screen">
      <button className="link" onClick={onExit}>‹ Back</button>
      <h2 className="section">Real exam simulation</h2>
      <div className="seg big"><button className={exam === 'CPA' ? 'on' : ''} onClick={() => setExam('CPA')}>CPA</button><button className={exam === 'FRM' ? 'on' : ''} onClick={() => setExam('FRM')}>FRM</button></div>
      {exam === 'CPA' ? (
        <div className="card">
          <label className="field">Section<select value={paper} onChange={(e) => setPaper(e.target.value)}>{L.CPA.format.sections.map((s: any) => <option key={s.id} value={s.id}>{s.id} · {paperById(s.id)?.name}</option>)}</select></label>
          <p className="muted small">Real format: {spec.mcq} MCQs in 2 testlets, then {spec.tbs} simulations ({spec.tbsSplit}) · 4 hours · MCQ {spec.mcqWeight}% / TBS {100 - spec.mcqWeight}% of score. Once you submit a testlet you can't go back. Optional clock-paused break after testlet 3.</p>
          <p className="muted small">Simulations available for {paper}: {TBS.filter((t) => t.paper === paper).length}. More are being added; until then, missing simulation testlets are skipped.</p>
        </div>
      ) : (
        <div className="card">
          <div className="seg"><button className={part === 1 ? 'on' : ''} onClick={() => setPart(1)}>Part I</button><button className={part === 2 ? 'on' : ''} onClick={() => setPart(2)}>Part II</button></div>
          <p className="muted small">Real format: {part === 1 ? '100' : '80'} equally weighted MCQs · 4 hours · questions drawn by official topic weights. Free navigation and flagging, as on the Prometric screen.</p>
        </div>
      )}
      <div className="grid2">
        <button className={`card action ${!full ? 'primary' : ''}`} onClick={() => setFull(false)}><b>Mini simulation</b><span>{exam === 'CPA' ? '20 MCQ + 2 simulations · 60 min' : `20 MCQ · ${part === 1 ? 48 : 60} min`}</span></button>
        <button className={`card action ${full ? 'primary' : ''}`} onClick={() => setFull(true)}><b>Full exam</b><span>Exact real length · 4 hours</span></button>
      </div>
      <button className="btn wide" onClick={() => onStart(exam === 'CPA' ? buildCpa(paper, full) : buildFrm(part, full))}>Start {full ? 'full exam' : 'mini simulation'}</button>
      <p className="muted small">Your progress saves every second. If the app closes, you'll resume exactly where you left off.</p>
    </div>
  )
}

function Calculator({ onClose }: { onClose: () => void }) {
  const [disp, setDisp] = useState('0'), [acc, setAcc] = useState<number | null>(null), [op, setOp] = useState<string | null>(null), [fresh, setFresh] = useState(true)
  const val = () => parseFloat(disp)
  const apply = (a: number, b: number, o: string) => (o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : o === '÷' ? a / b : b)
  const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1e10) / 1e10) : 'Error')
  const press = (k: string) => {
    if (/^[0-9]$/.test(k)) { setDisp(fresh || disp === '0' ? k : disp + k); setFresh(false); return }
    if (k === '.') { if (fresh) { setDisp('0.'); setFresh(false) } else if (!disp.includes('.')) setDisp(disp + '.'); return }
    if (k === 'C') { setDisp('0'); setAcc(null); setOp(null); setFresh(true); return }
    if (k === '⌫') { setDisp(disp.length > 1 ? disp.slice(0, -1) : '0'); return }
    if (k === '±') { setDisp(fmt(-val())); return }
    if (k === '√') { setDisp(fmt(Math.sqrt(val()))); setFresh(true); return }
    if (k === '%') { setDisp(fmt(val() / 100)); setFresh(true); return }
    if (k === '=') { if (op !== null && acc !== null) { setDisp(fmt(apply(acc, val(), op))); setAcc(null); setOp(null); setFresh(true) } return }
    const cur = op !== null && acc !== null && !fresh ? apply(acc, val(), op) : acc ?? val()
    setAcc(cur); setDisp(fmt(cur)); setOp(k); setFresh(true)
  }
  const keys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '±', '0', '.', '=', '√']
  return (
    <div className="modal" onClick={onClose}><div className="sheet calc" onClick={(e) => e.stopPropagation()}>
      <div className="calcdisp">{op && acc !== null ? <small>{fmt(acc)} {op}</small> : null}{disp}</div>
      <div className="calckeys">{keys.map((k) => <button key={k} className={/[÷×−+=]/.test(k) ? 'opk' : ''} onClick={() => press(k)}>{k}</button>)}</div>
      <button className="btn ghost wide" onClick={onClose}>Close</button>
    </div></div>
  )
}
