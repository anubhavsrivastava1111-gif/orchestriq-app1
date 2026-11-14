import examsKb from '../knowledge-base/exams.json'
import q0 from '../knowledge-base/questions.json'
import qCpa from '../knowledge-base/questions-cpa.json'
import qFrm from '../knowledge-base/questions-frm.json'
import lessonsKb from '../knowledge-base/lessons.json'
import guidesKb from '../knowledge-base/guides.json'
import notesKb from '../knowledge-base/notes.json'
import logisticsKb from '../knowledge-base/logistics.json'
import tbsKb from '../knowledge-base/tbs.json'

export type Paper = { id: string; name: string; kind: string; topics: string[] }
export type Exam = { id: string; name: string; body: string; officialSource: string; syllabusVersion: string; plain: string; papers: Paper[] }
export type Question = {
  id: string; exam: string; paper: string; topic: string; difficulty: number
  stem: string; options: string[]; answer: number
  explain: { simple: string; steps: string[]; trap: string }
  ref: string; status: 'author-draft' | 'sme-verified' | 'retired' | 'generated' | 'ai-draft'
}
export type Lesson = { id: string; title: string; exams: string[]; story: string; rule: string; example: string; check: { q: string; a: string } }
export type Challenge = { id: string; title: string; symptoms: string[]; actions: string[]; metric: string }
export type Workplace = { id: string; title: string; framework: string; steps: string[]; redFlags: string[] }
export type Note = { idea: string; key: string[]; formula?: string[]; tip: string }
export type TbsRow = { label: string; kind: 'number' | 'select'; answer: number | string; options?: string[]; tolerance?: number }
export type Tbs = { id: string; exam: string; paper: string; topic: string; title: string; scenario: string; rows: TbsRow[]; explain: string }
export type LifeStep = { id: string; title: string; detail: string }

export const EXAMS = examsKb.exams as Exam[]
export const QUESTIONS = ([...q0.questions, ...qCpa.questions, ...qFrm.questions] as Question[]).filter((q) => q.status !== 'retired')
export const LESSONS = lessonsKb.lessons as Lesson[]
export const CHALLENGES = guidesKb.challenges as Challenge[]
export const WORKPLACE = guidesKb.workplace as Workplace[]
export const WORKPLACE_DISCLAIMER = guidesKb._meta.disclaimer
export const NOTES = notesKb.notes as Record<string, Note>
export const TBS = tbsKb.tasks as Tbs[]
export const LOGISTICS = logisticsKb as any

export const examById = (id: string) => EXAMS.find((e) => e.id === id)
export const paperById = (id: string) => EXAMS.flatMap((e) => e.papers).find((p) => p.id === id)
export const examOfPaper = (pid: string) => EXAMS.find((e) => e.papers.some((p) => p.id === pid))
export const noteFor = (exam: string, paper: string, topic: string) => NOTES[`${exam}|${paper}|${topic}`]
