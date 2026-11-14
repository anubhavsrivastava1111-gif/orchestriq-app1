// PDF / Excel / JSON exports. Heavy libraries are loaded only when an export is requested.
import { Capacitor } from '@capacitor/core'
import { EXAMS, paperById } from './data'
import { topicStats, type State } from './store'
import type { UserSummary } from './backend'

const d = (t: number | string) => new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

async function deliver(name: string, mime: string, data: Blob) {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(data) })
    const w = await Filesystem.writeFile({ path: name, data: b64, directory: Directory.Cache })
    await Share.share({ title: name, url: w.uri, dialogTitle: 'Save or share your report' })
    return
  }
  const url = URL.createObjectURL(data), a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function summaryRows(s: State) {
  const answers = Object.values(s.cards).reduce((a, c) => a + c.seen, 0), right = Object.values(s.cards).reduce((a, c) => a + c.correct, 0)
  return [
    ['Name', s.profile.name || '—'], ['Report generated', d(Date.now())], ['Target exam', s.plan ? `${s.plan.exam} · ${s.plan.papers.map((p) => paperById(p)?.name ?? p).join(', ')}` : '—'],
    ['Target date', s.plan?.targetDate || '—'], ['Questions answered', answers], ['Overall accuracy', `${pct(right, answers)}%`],
    ['Mastered questions', Object.values(s.cards).filter((c) => c.box >= 4).length], ['Practice/mock/exam sessions', s.attempts.length], ['Study days (last 400)', s.streakDays.length],
  ] as [string, string | number][]
}

export async function exportExcel(s: State) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook(); wb.creator = 'Exam Mastery'; wb.created = new Date()
  const head = (ws: any) => { ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3D3E' } }; ws.views = [{ state: 'frozen', ySplit: 1 }] }
  const sum = wb.addWorksheet('Summary'); sum.columns = [{ header: 'Item', key: 'k', width: 32 }, { header: 'Value', key: 'v', width: 48 }]; summaryRows(s).forEach(([k, v]) => sum.addRow({ k, v })); head(sum)
  const at = wb.addWorksheet('Sessions'); at.columns = [{ header: 'Date', key: 'date', width: 20 }, { header: 'Type', key: 'kind', width: 10 }, { header: 'Exam', key: 'exam', width: 8 }, { header: 'Paper / title', key: 'title', width: 40 }, { header: 'Score', key: 'score', width: 8 }, { header: 'Total', key: 'total', width: 8 }, { header: 'Accuracy %', key: 'acc', width: 11 }, { header: 'Minutes', key: 'min', width: 9 }, { header: 'TBS score', key: 'tbs', width: 10 }]
  s.attempts.forEach((a) => at.addRow({ date: d(a.at), kind: a.kind, exam: a.exam, title: a.title, score: a.score, total: a.total, acc: pct(a.score, a.total), min: Math.round(a.seconds / 60), tbs: a.tbsTotal ? `${a.tbsScore}/${a.tbsTotal}` : '' })); head(at)
  const tp = wb.addWorksheet('By topic'); tp.columns = [{ header: 'Exam', key: 'exam', width: 8 }, { header: 'Paper', key: 'paper', width: 40 }, { header: 'Topic', key: 'topic', width: 36 }, { header: 'Answered', key: 'seen', width: 10 }, { header: 'Correct', key: 'correct', width: 10 }, { header: 'Accuracy %', key: 'acc', width: 11 }]
  topicStats(null).sort((a, b) => a.correct / a.seen - b.correct / b.seen).forEach((t) => tp.addRow({ ...t, paper: paperById(t.paper)?.name ?? t.paper, acc: pct(t.correct, t.seen) })); head(tp)
  const q = wb.addWorksheet('Question history'); q.columns = [{ header: 'Question ID', key: 'id', width: 22 }, { header: 'Topic', key: 'topic', width: 32 }, { header: 'Times seen', key: 'seen', width: 11 }, { header: 'Correct', key: 'correct', width: 9 }, { header: 'Last result', key: 'last', width: 11 }, { header: 'Memory box (0–5)', key: 'box', width: 15 }, { header: 'Next review', key: 'due', width: 20 }]
  Object.entries(s.cards).forEach(([id, c]) => q.addRow({ id, topic: c.topic ?? '', seen: c.seen, correct: c.correct, last: c.last ? 'Correct' : 'Wrong', box: c.box, due: d(c.due) })); head(q)
  const pl = wb.addWorksheet('Exam journey'); pl.columns = [{ header: 'Step', key: 'step', width: 44 }, { header: 'Status', key: 'status', width: 10 }, { header: 'Date', key: 'date', width: 14 }, { header: 'Note', key: 'note', width: 50 }]
  Object.entries(s.life).forEach(([k, v]) => pl.addRow({ step: k, status: v.status, date: v.date ?? '', note: v.note ?? '' })); head(pl)
  const buf = await wb.xlsx.writeBuffer()
  await deliver(`exam-mastery-records-${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Blob([buf]))
}

export async function exportPdf(s: State) {
  const { jsPDF } = await import('jspdf'); const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }), W = doc.internal.pageSize.getWidth()
  doc.setFillColor(15, 61, 62); doc.rect(0, 0, W, 70, 'F'); doc.setTextColor(242, 193, 78); doc.setFontSize(20); doc.text('Exam Mastery: Progress Report', 40, 44)
  doc.setTextColor(30, 30, 30); doc.setFontSize(10)
  const theme = { headStyles: { fillColor: [15, 61, 62] as [number, number, number] }, styles: { fontSize: 9 }, margin: { left: 40, right: 40 } }
  autoTable(doc, { ...theme, startY: 90, head: [['Item', 'Value']], body: summaryRows(s).map(([k, v]) => [k, String(v)]) })
  const tps = topicStats(null).sort((a, b) => a.correct / a.seen - b.correct / b.seen)
  if (tps.length) autoTable(doc, { ...theme, startY: (doc as any).lastAutoTable.finalY + 20, head: [['Exam', 'Topic', 'Answered', 'Accuracy']], body: tps.map((t) => [t.exam, `${paperById(t.paper)?.name ?? t.paper} · ${t.topic}`, String(t.seen), `${pct(t.correct, t.seen)}%`]) })
  if (s.attempts.length) autoTable(doc, { ...theme, startY: (doc as any).lastAutoTable.finalY + 20, head: [['Date', 'Type', 'Session', 'Score', 'Min']], body: [...s.attempts].reverse().slice(0, 200).map((a) => [d(a.at), a.kind, a.title, `${a.score}/${a.total} (${pct(a.score, a.total)}%)`, String(Math.round(a.seconds / 60))]) })
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Generated ${d(Date.now())} · Page ${i}/${pages} · Practice data only; not an official score.`, 40, doc.internal.pageSize.getHeight() - 20) }
  await deliver(`exam-mastery-report-${new Date().toISOString().slice(0, 10)}.pdf`, 'application/pdf', doc.output('blob'))
}

/** Full backup file. Can be restored on any device via Me → Restore. */
export async function exportBackup(s: State) {
  await deliver(`exam-mastery-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' }))
}

/** Admin: every user's summary + every session, as one workbook or PDF. */
export async function exportAdmin(users: UserSummary[], attempts: any[], format: 'xlsx' | 'pdf') {
  const email = new Map(users.map((u) => [u.id, u.email]))
  const urows = users.map((u) => [u.email, u.display_name ?? '', u.role, u.status, u.answers, `${pct(u.correct, u.answers)}%`, u.attempts, u.last_seen ? d(u.last_seen) : '—', u.last_sync ? d(u.last_sync) : '—'])
  const uhead = ['Email', 'Name', 'Role', 'Access', 'Answers', 'Accuracy', 'Sessions', 'Last seen', 'Last sync']
  const arows = attempts.map((a) => [email.get(a.user_id) ?? a.user_id, d(a.created_at), a.kind, a.exam, a.paper, a.score, a.total, `${pct(a.score, a.total)}%`, Math.round((a.seconds ?? 0) / 60)])
  const ahead = ['User', 'Date', 'Type', 'Exam', 'Paper', 'Score', 'Total', 'Accuracy', 'Minutes']
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default, wb = new ExcelJS.Workbook()
    for (const [name, head, rows] of [['Users', uhead, urows], ['Sessions', ahead, arows]] as const) {
      const ws = wb.addWorksheet(name); ws.addRow([...head]); rows.forEach((r) => ws.addRow([...r])); ws.getRow(1).font = { bold: true }; ws.columns.forEach((c) => { c.width = 18 }); ws.views = [{ state: 'frozen', ySplit: 1 }]
    }
    await deliver(`exam-mastery-all-users-${stamp}.xlsx`, '', new Blob([await wb.xlsx.writeBuffer()]))
  } else {
    const { jsPDF } = await import('jspdf'); const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }); doc.setFontSize(16); doc.text('Exam Mastery: All users', 40, 40)
    autoTable(doc, { startY: 60, head: [uhead], body: urows.map((r) => r.map(String)), styles: { fontSize: 8 }, headStyles: { fillColor: [15, 61, 62] } })
    autoTable(doc, { startY: (doc as any).lastAutoTable.finalY + 20, head: [ahead], body: arows.map((r) => r.map(String)), styles: { fontSize: 7 }, headStyles: { fillColor: [15, 61, 62] } })
    await deliver(`exam-mastery-all-users-${stamp}.pdf`, 'application/pdf', doc.output('blob'))
  }
}
export const examNames = EXAMS.map((e) => e.name)
