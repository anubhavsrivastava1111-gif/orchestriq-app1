import { useEffect, useState } from 'react'
import { QUESTIONS, type Question } from './data'

// Spaced repetition (Leitner). Correct → next box; wrong → box 0. Intervals in days.
const INTERVALS = [0, 1, 3, 7, 14, 30]
const DAY = 86_400_000

export type Card = { box: number; due: number; seen: number; correct: number; last?: boolean; paper?: string; topic?: string; exam?: string }
export type Level = 'simple' | 'standard'
/** One completed practice session / mock / simulated exam. Append-only: never edited, never deleted by sync. */
export type Attempt = {
  id: string; at: number; kind: 'practice' | 'mock' | 'exam'; exam: string; paper: string; title: string
  score: number; total: number; seconds: number; detail: { qid: string; topic: string; correct: boolean }[]; tbsScore?: number; tbsTotal?: number
}
export type Plan = { exam: string; papers: string[]; targetDate: string; startDate: string; weekdayMin: number; weekendMin: number; done: Record<string, boolean> }
export type LifeStatus = { status: 'todo' | 'doing' | 'done'; date?: string; note?: string }
export type Profile = { name: string; country: string; state: string; wantsLicence: boolean; hasSSN: boolean; credits: number; qualification: string }
export type State = {
  v: 2; cards: Record<string, Card>; level: Level; exam: string | null; streakDays: string[]
  attempts: Attempt[]; plan: Plan | null; life: Record<string, LifeStatus>; profile: Profile; firstPassDate: string; creditMonths: number
  updatedAt: number
}

const KEY = 'exam-mastery.v1'
const blankProfile: Profile = { name: '', country: 'India', state: '', wantsLicence: true, hasSSN: false, credits: 120, qualification: 'B.Com' }
export const blank = (): State => ({ v: 2, cards: {}, level: 'simple', exam: null, streakDays: [], attempts: [], plan: null, life: {}, profile: blankProfile, firstPassDate: '', creditMonths: 30, updatedAt: 0 })

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...blank(), ...JSON.parse(raw), v: 2 } : blank()
  } catch { return blank() }
}

let state = load()
const listeners = new Set<() => void>()
const changeHooks = new Set<(s: State) => void>()
export const onChange = (fn: (s: State) => void) => { changeHooks.add(fn); return () => { changeHooks.delete(fn) } }
export const getState = () => state

function persist(next: State, notifyHooks = true) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage full/blocked: cloud backup still has it */ }
  listeners.forEach((l) => l())
  if (notifyHooks) changeHooks.forEach((h) => h(next))
}
const save = (patch: Partial<State>) => persist({ ...state, ...patch, updatedAt: Date.now() })

export function useStore() {
  const [, force] = useState(0)
  useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return state
}

export const setLevel = (level: Level) => save({ level })
export const setExam = (exam: string | null) => save({ exam })
export const setPlan = (plan: Plan | null) => save({ plan })
export const setProfile = (p: Partial<Profile>) => save({ profile: { ...state.profile, ...p } })
export const setLife = (id: string, s: Partial<LifeStatus>) => save({ life: { ...state.life, [id]: { ...{ status: 'todo' as const }, ...state.life[id], ...s } } })
export const setCredit = (firstPassDate: string, creditMonths: number) => save({ firstPassDate, creditMonths })
export const resetProgress = () => save({ cards: {}, streakDays: [] })

export function record(q: Question, correct: boolean) {
  const prev = state.cards[q.id] ?? { box: 0, due: 0, seen: 0, correct: 0 }
  const box = correct ? Math.min(prev.box + 1, INTERVALS.length - 1) : 0
  const today = new Date().toISOString().slice(0, 10)
  save({
    streakDays: state.streakDays.includes(today) ? state.streakDays : [...state.streakDays, today].slice(-400),
    cards: { ...state.cards, [q.id]: { box, due: Date.now() + INTERVALS[box] * DAY, seen: prev.seen + 1, correct: prev.correct + (correct ? 1 : 0), last: correct, exam: q.exam, paper: q.paper, topic: q.topic } },
  })
}

export function addAttempt(a: Omit<Attempt, 'id' | 'at'>) {
  const full: Attempt = { ...a, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() }
  save({ attempts: [...state.attempts, full] })
  return full
}

/** Merge a cloud copy into local state without losing anything: union attempts by id, keep the more-practised card. */
export function mergeRemote(remote: Partial<State> | null) {
  if (!remote) return
  const cards = { ...state.cards }
  for (const [id, c] of Object.entries(remote.cards ?? {})) if (!cards[id] || c.seen > cards[id].seen) cards[id] = c
  const byId = new Map(state.attempts.map((a) => [a.id, a]))
  for (const a of remote.attempts ?? []) byId.set(a.id, a)
  const newer = (remote.updatedAt ?? 0) > state.updatedAt
  persist({
    ...state, ...(newer ? { plan: remote.plan ?? state.plan, life: { ...state.life, ...remote.life }, profile: { ...state.profile, ...remote.profile }, level: remote.level ?? state.level, firstPassDate: remote.firstPassDate ?? state.firstPassDate, creditMonths: remote.creditMonths ?? state.creditMonths } : {}),
    cards, attempts: [...byId.values()].sort((a, b) => a.at - b.at),
    streakDays: [...new Set([...state.streakDays, ...(remote.streakDays ?? [])])].sort().slice(-400),
    updatedAt: Math.max(state.updatedAt, remote.updatedAt ?? 0),
  }, false)
}
export function replaceAll(s: State) { persist({ ...blank(), ...s, v: 2, updatedAt: Date.now() }) }

export const inScope = (q: { exam: string }, exam: string | null) => !exam || q.exam === exam

export function dueQuestions(exam: string | null) {
  const now = Date.now()
  return QUESTIONS.filter((q) => inScope(q, exam) && state.cards[q.id] && state.cards[q.id].due <= now)
    .sort((a, b) => state.cards[a.id].box - state.cards[b.id].box)
}
export function weakQuestions(exam: string | null) {
  return QUESTIONS.filter((q) => { const c = state.cards[q.id]; return inScope(q, exam) && c && (c.last === false || c.correct / c.seen < 0.6) })
}
/** Accuracy by topic from every answer recorded (static + generated questions). */
export function topicStats(exam: string | null) {
  const m = new Map<string, { exam: string; paper: string; topic: string; seen: number; correct: number }>()
  for (const c of Object.values(state.cards)) {
    if (!c.topic || (exam && c.exam !== exam)) continue
    const k = `${c.exam}|${c.paper}|${c.topic}`, s = m.get(k) ?? { exam: c.exam!, paper: c.paper!, topic: c.topic, seen: 0, correct: 0 }
    s.seen += c.seen; s.correct += c.correct; m.set(k, s)
  }
  return [...m.values()]
}
export function streak() {
  const days = new Set(state.streakDays), d = new Date()
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  let n = 0; while (days.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1) }
  return n
}
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
