import { useState } from 'react'
import { EXAMS, LOGISTICS, paperById, type LifeStep } from './data'
import { setCredit, setLife, setPlan, setProfile, useStore, type Plan } from './store'

export type Task = { key: string; label: string; action?: { kind: 'topic' | 'paper' | 'review' | 'mock'; exam: string; paper?: string; topic?: string } }
const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

/** Pure function: which tasks belong to a given date in a plan. */
export function tasksFor(plan: Plan, date: string): Task[] {
  const total = Math.max(days(plan.startDate, plan.targetDate), 1), d = days(plan.startDate, date)
  if (d < 0 || d > total) return []
  const topics = plan.papers.flatMap((p) => (paperById(p)?.topics ?? []).map((t) => ({ paper: p, topic: t })))
  const learnEnd = Math.floor(total * 0.65), practiceEnd = Math.floor(total * 0.85)
  const weekend = [0, 6].includes(new Date(date).getDay()), out: Task[] = []
  if (d === total) return [{ key: `${date}|exam`, label: '🎯 Exam day. Sleep well, arrive 30 minutes early, and bring your ID and NTS/admission ticket.' }]
  if (d < learnEnd) {
    const t = topics[Math.min(Math.floor((d / Math.max(learnEnd, 1)) * topics.length), topics.length - 1)]
    out.push({ key: `${date}|read`, label: `Read the coaching note: ${t.topic}`, action: { kind: 'topic', exam: plan.exam, paper: t.paper, topic: t.topic } })
    out.push({ key: `${date}|practice`, label: `Practise 15 questions: ${t.topic}`, action: { kind: 'topic', exam: plan.exam, paper: t.paper, topic: t.topic } })
  } else if (d < practiceEnd) {
    const p = plan.papers[d % plan.papers.length]
    out.push({ key: `${date}|mixed`, label: `Mixed practice (30 Qs): ${paperById(p)?.name}`, action: { kind: 'paper', exam: plan.exam, paper: p } })
    out.push({ key: `${date}|weak`, label: 'Fix weak areas (questions you got wrong)', action: { kind: 'review', exam: plan.exam } })
  } else {
    out.push({ key: `${date}|mock`, label: d % 3 === 0 ? 'Full exam simulation (timed)' : 'Mini simulation + review every wrong answer', action: { kind: 'mock', exam: plan.exam } })
  }
  out.push({ key: `${date}|review`, label: 'Daily review (spaced repetition)', action: { kind: 'review', exam: plan.exam } })
  if (weekend && d < practiceEnd) out.push({ key: `${date}|wk`, label: 'Weekend: mini simulation to test the week', action: { kind: 'mock', exam: plan.exam } })
  return out
}

export default function Planner({ onTask }: { onTask: (t: Task) => void }) {
  const [tab, setTab] = useState<'plan' | 'journey' | 'where'>('plan')
  return (
    <div className="screen">
      <div className="seg big"><button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>Study plan</button><button className={tab === 'journey' ? 'on' : ''} onClick={() => setTab('journey')}>Exam journey</button><button className={tab === 'where' ? 'on' : ''} onClick={() => setTab('where')}>Where &amp; when</button></div>
      {tab === 'plan' && <PlanTab onTask={onTask} />}
      {tab === 'journey' && <Journey />}
      {tab === 'where' && <WhereWhen />}
    </div>
  )
}

function PlanTab({ onTask }: { onTask: (t: Task) => void }) {
  const s = useStore(), plan = s.plan
  const [edit, setEdit] = useState(!plan)
  const [f, setF] = useState<Plan>(plan ?? { exam: s.exam === 'FRM' ? 'FRM' : 'CPA', papers: [], targetDate: iso(Date.now() + 90 * DAY), startDate: iso(Date.now()), weekdayMin: 90, weekendMin: 180, done: {} })
  const exam = EXAMS.find((e) => e.id === f.exam)!
  if (edit || !plan) return (
    <div className="card">
      <h3>Set your target</h3>
      <label className="field">Exam<select value={f.exam} onChange={(e) => setF({ ...f, exam: e.target.value, papers: [] })}><option value="CPA">CPA (US)</option><option value="FRM">FRM</option></select></label>
      <p className="small muted">Papers to prepare for this exam date:</p>
      <div className="chips wrap">{exam.papers.map((p) => <button key={p.id} className={f.papers.includes(p.id) ? 'on' : ''} onClick={() => setF({ ...f, papers: f.papers.includes(p.id) ? f.papers.filter((x) => x !== p.id) : [...f.papers, p.id] })}>{p.name.replace(/^Part (I|II): /, '')}</button>)}</div>
      <div className="grid2"><label className="field">Start<input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label><label className="field">Exam date<input type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} /></label></div>
      <div className="grid2"><label className="field">Weekday minutes<input type="number" min={15} step={15} value={f.weekdayMin} onChange={(e) => setF({ ...f, weekdayMin: +e.target.value })} /></label><label className="field">Weekend minutes<input type="number" min={0} step={15} value={f.weekendMin} onChange={(e) => setF({ ...f, weekendMin: +e.target.value })} /></label></div>
      <Feasibility f={f} />
      <button className="btn wide" disabled={!f.papers.length || days(f.startDate, f.targetDate) < 7} onClick={() => { setPlan({ ...f, done: plan?.done ?? {} }); setEdit(false) }}>Create my plan</button>
      {plan && <button className="link" onClick={() => setEdit(false)}>Cancel</button>}
    </div>
  )
  const today = iso(Date.now()), left = days(today, plan.targetDate), tasks = tasksFor(plan, today)
  const week = Array.from({ length: 7 }, (_, k) => iso(Date.now() + (k + 1) * DAY))
  const toggle = (k: string) => setPlan({ ...plan, done: { ...plan.done, [k]: !plan.done[k] } })
  const totalTasks = Array.from({ length: Math.max(days(plan.startDate, today) + 1, 0) }, (_, k) => tasksFor(plan, iso(Date.parse(plan.startDate) + k * DAY))).flat()
  const doneCount = totalTasks.filter((t) => plan.done[t.key]).length
  return (
    <>
      <div className="hero small"><p className="eyebrow">{plan.exam} · {plan.papers.map((p) => paperById(p)?.name.replace(/^Part (I|II): /, '')).join(', ')}</p><h1>{left > 0 ? `${left} days to go` : left === 0 ? 'Exam day!' : 'Exam date passed'}</h1><p>Plan adherence: {totalTasks.length ? Math.round((doneCount / totalTasks.length) * 100) : 0}% of tasks so far completed</p></div>
      <h3 className="section">Today</h3>
      {tasks.length ? tasks.map((t) => (
        <div key={t.key} className="card task"><label><input type="checkbox" checked={!!plan.done[t.key]} onChange={() => toggle(t.key)} /> <span className={plan.done[t.key] ? 'strike' : ''}>{t.label}</span></label>{t.action && <button className="btn small" onClick={() => onTask(t)}>Go</button>}</div>
      )) : <p className="muted">No tasks today.</p>}
      <h3 className="section">Next 7 days</h3>
      <div className="card">{week.map((dte) => <div key={dte} className="weekrow"><b>{new Date(dte).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b><span>{tasksFor(plan, dte).map((t) => t.label.split(':')[0]).join(' · ') || '—'}</span></div>)}</div>
      <button className="btn ghost wide" onClick={() => setEdit(true)}>Change plan</button>
    </>
  )
}

function Feasibility({ f }: { f: Plan }) {
  const n = Math.max(days(f.startDate, f.targetDate), 0), weeks = n / 7, hours = Math.round((weeks * (5 * f.weekdayMin + 2 * f.weekendMin)) / 60)
  const per = f.exam === 'CPA' ? [80, 150] : [200, 300], need = per.map((h) => h * Math.max(f.papers.length, 1))
  const ok = hours >= need[0]
  return <p className={`notice ${ok ? '' : 'warn'}`}>You'll have about <b>{hours} hours</b> before the exam. Candidates typically spend {need[0]}–{need[1]} hours for {f.papers.length || 1} {f.exam === 'CPA' ? 'section(s)' : 'part(s)'}. {ok ? 'That is realistic.' : 'That is tight: add minutes per day or move the date.'}</p>
}

function Journey() {
  const s = useStore(), [exam, setExam] = useState(s.exam === 'FRM' ? 'FRM' : 'CPA')
  const steps: LifeStep[] = LOGISTICS[exam].lifecycle
  const next = (st?: string) => (st === 'todo' || !st ? 'doing' : st === 'doing' ? 'done' : 'todo')
  const done = steps.filter((x) => s.life[x.id]?.status === 'done').length
  return (
    <>
      <div className="seg"><button className={exam === 'CPA' ? 'on' : ''} onClick={() => setExam('CPA')}>CPA: eligibility to licence</button><button className={exam === 'FRM' ? 'on' : ''} onClick={() => setExam('FRM')}>FRM: enrolment to charter</button></div>
      <p className="muted small">{done}/{steps.length} steps done. Tap a step's status to change it. Add dates and notes (e.g. NTS number, booking ID) so everything stays in one place and in your exported records.</p>
      {steps.map((st, k) => { const v = s.life[st.id]; return (
        <div key={st.id} className={`card step ${v?.status ?? 'todo'}`}>
          <div className="steprow"><span className="stepno">{k + 1}</span><div><b>{st.title}</b><p className="muted small">{st.detail}</p></div>
            <button className={`status ${v?.status ?? 'todo'}`} onClick={() => setLife(st.id, { status: next(v?.status) as any })}>{v?.status === 'done' ? '✓ Done' : v?.status === 'doing' ? 'In progress' : 'To do'}</button></div>
          <div className="grid2"><input type="date" value={v?.date ?? ''} onChange={(e) => setLife(st.id, { date: e.target.value })} /><input placeholder="Note (ID, deadline…)" value={v?.note ?? ''} onChange={(e) => setLife(st.id, { note: e.target.value })} /></div>
        </div>) })}
    </>
  )
}

function WhereWhen() {
  const s = useStore(), p = s.profile, L = LOGISTICS
  const expiry = s.firstPassDate ? new Date(new Date(s.firstPassDate).setMonth(new Date(s.firstPassDate).getMonth() + s.creditMonths)) : null
  const india = /india/i.test(p.country)
  return (
    <>
      <div className="card">
        <h3>Your situation</h3>
        <div className="grid2"><label className="field">Country you live in<input value={p.country} onChange={(e) => setProfile({ country: e.target.value })} /></label><label className="field">Qualification<select value={p.qualification} onChange={(e) => setProfile({ qualification: e.target.value })}>{['B.Com', 'M.Com', 'CA (ICAI)', 'CMA (ICMAI)', 'MBA', 'B.Tech/other', 'US degree'].map((x) => <option key={x}>{x}</option>)}</select></label></div>
        <div className="grid2"><label className="field">Credit hours (approx.)<input type="number" value={p.credits} onChange={(e) => setProfile({ credits: +e.target.value })} /></label><label className="field">Need the CPA licence?<select value={p.wantsLicence ? 'y' : 'n'} onChange={(e) => setProfile({ wantsLicence: e.target.value === 'y' })}><option value="y">Yes, licence</option><option value="n">Exam pass only</option></select></label></div>
        <label className="field">US Social Security Number?<select value={p.hasSSN ? 'y' : 'n'} onChange={(e) => setProfile({ hasSSN: e.target.value === 'y' })}><option value="n">No</option><option value="y">Yes</option></select></label>
      </div>
      <h3 className="section">CPA: where you can take it</h3>
      <div className="card">
        <p className="notice">{L.CPA.jurisdictionAdvice.headline}</p>
        <p><b>Test centres {india ? 'in India' : 'outside the US'}:</b> {india ? L.CPA.international.indiaCities.join(', ') : `India, ${L.CPA.international.otherCountries.join(', ')}`}. Continuous testing year-round; book about 45 days ahead.</p>
        <p className="small"><b>Boards that don't allow international testing:</b> {L.CPA.international.notParticipating.join(', ')}. {L.CPA.international.notParticipatingNote}</p>
        <p className="small">{L.CPA.international.intlFeeNote}</p>
        <h4>Boards commonly used by {india ? 'India-based' : 'international'} candidates</h4>
        <ul>{L.CPA.jurisdictionAdvice.commonlyUsed.map((x: any) => <li key={x.state}><b>{x.state}:</b> {x.note} <span className="tag">verify</span></li>)}</ul>
        <h4>Your next steps</h4>
        <ol>{L.CPA.jurisdictionAdvice.choose.map((x: string, i: number) => <li key={i}>{x}</li>)}</ol>
        {p.credits < 120 && <p className="notice warn">Most boards need about 120 credits just to SIT the exam. With ~{p.credits}, get a NIES evaluation first. A CA/CMA or extra coursework may add credits.</p>}
        {p.credits >= 120 && p.credits < 150 && p.wantsLicence && <p className="notice">With 120–149 credits, look at boards offering the new 120-credit + 2-years-experience licence pathway, or plan the extra credits for the 150-hour route.</p>}
        {p.wantsLicence && !p.hasSSN && <p className="notice warn">No SSN: shortlist boards that issue a licence without an SSN or US residency, and confirm in writing with the board before you apply.</p>}
        <p className="muted small">Sources: <a href={L.CPA.international.source} target="_blank" rel="noreferrer">NASBA international</a> · <a href={L.CPA.licensure.source} target="_blank" rel="noreferrer">licensure pathways</a>. Last checked {L._meta.lastChecked}. Always confirm with your board.</p>
      </div>
      <h3 className="section">CPA credit-window tracker</h3>
      <div className="card"><div className="grid2"><label className="field">First section passed (score release)<input type="date" value={s.firstPassDate} onChange={(e) => setCredit(e.target.value, s.creditMonths)} /></label><label className="field">Your board's window (months)<select value={s.creditMonths} onChange={(e) => setCredit(s.firstPassDate, +e.target.value)}>{[18, 30, 36].map((m) => <option key={m} value={m}>{m}</option>)}</select></label></div>
        {expiry && <p className={`notice ${expiry.getTime() - Date.now() < 180 * DAY ? 'warn' : ''}`}>Pass all remaining sections by <b>{expiry.toLocaleDateString('en-IN', { dateStyle: 'long' })}</b> ({Math.max(Math.round((expiry.getTime() - Date.now()) / DAY), 0)} days left).</p>}
      </div>
      <h3 className="section">FRM: 2027 exam windows</h3>
      <div className="card"><table className="tbsgrid"><thead><tr><th>Window</th><th>Part I</th><th>Part II</th><th>Early reg.</th><th>Standard reg.</th></tr></thead>
        <tbody>{L.FRM.windows2027.map((w: any) => <tr key={w.window}><td><b>{w.window}</b></td><td>{w.part1}</td><td>{w.part2}</td><td>{w.early}</td><td>{w.standard}</td></tr>)}</tbody></table>
        <p className="small">{L.FRM.fees.text} {L.FRM.india.text}</p>
        <p className="small">{L.FRM.certification.text}</p>
        <p className="muted small">Source: <a href={L.FRM.windowsSource} target="_blank" rel="noreferrer">GARP exam logistics</a> · checked {L._meta.lastChecked}.</p>
      </div>
    </>
  )
}
