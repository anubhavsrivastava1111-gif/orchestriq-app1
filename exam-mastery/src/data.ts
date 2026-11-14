import examsKb from '../knowledge-base/exams.json'
import questionsKb from '../knowledge-base/questions.json'
import lessonsKb from '../knowledge-base/lessons.json'
import guidesKb from '../knowledge-base/guides.json'

export type Paper = { id: string; name: string; kind: string; topics: string[] }
export type Exam = { id: string; name: string; body: string; officialSource: string; syllabusVersion: string; plain: string; papers: Paper[] }
export type Question = {
  id: string; exam: string; paper: string; topic: string; difficulty: number
  stem: string; options: string[]; answer: number
  explain: { simple: string; steps: string[]; trap: string }
  ref: string; status: 'author-draft' | 'sme-verified' | 'retired'
}
export type Lesson = { id: string; title: string; exams: string[]; story: string; rule: string; example: string; check: { q: string; a: string } }
export type Challenge = { id: string; title: string; symptoms: string[]; actions: string[]; metric: string }
export type Workplace = { id: string; title: string; framework: string; steps: string[]; redFlags: string[] }

export const EXAMS = examsKb.exams as Exam[]
export const QUESTIONS = (questionsKb.questions as Question[]).filter((q) => q.status !== 'retired')
export const LESSONS = lessonsKb.lessons as Lesson[]
export const CHALLENGES = guidesKb.challenges as Challenge[]
export const WORKPLACE = guidesKb.workplace as Workplace[]
export const WORKPLACE_DISCLAIMER = guidesKb._meta.disclaimer

export const examById = (id: string) => EXAMS.find((e) => e.id === id)
export const paperById = (id: string) => EXAMS.flatMap((e) => e.papers).find((p) => p.id === id)
