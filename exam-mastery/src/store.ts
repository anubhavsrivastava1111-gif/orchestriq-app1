import { useEffect, useState } from 'react'
import { QUESTIONS, type Question } from './data'

// Leitner spaced repetition: a correct answer moves a card up a box, a wrong one sends it back to box 0.
// The intervals (days) for when a card is next shown in Daily Review:
const INTERVALS = [0, 1, 3, 7, 14, 30]
const DAY = 86_400_000

export type Card = { box: number; due: number; seen: number; correct: number; last?: boolean }
export type Level = 'simple' | 'standard'
export type State = { cards: Record<string, Card>; level: Level; exam: string | null; streakDays: string[] }

const KEY = 'exam-mastery.v1'
const blank: State = { cards: {}, level: 'simple', exam: null, streakDays: [] }

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...blank, ...JSON.parse(raw) } : blank
  } catch {
    return blank
  }
}

let state = load()
const listeners = new Set<() => void>()
function save(next: State) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage unavailable: keep in memory */ }
  listeners.forEach((l) => l())
}

export function useStore() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return state
}

export const setLevel = (level: Level) => save({ ...state, level })
export const setExam = (exam: string | null) => save({ ...state, exam })
export const resetProgress = () => save({ ...state, cards: {}, streakDays: [] })

export function record(q: Question, correct: boolean) {
  const prev = state.cards[q.id] ?? { box: 0, due: 0, seen: 0, correct: 0 }
  const box = correct ? Math.min(prev.box + 1, INTERVALS.length - 1) : 0
  const today = new Date().toISOString().slice(0, 10)
  save({
    ...state,
    streakDays: state.streakDays.includes(today) ? state.streakDays : [...state.streakDays, today].slice(-60),
    cards: { ...state.cards, [q.id]: { box, due: Date.now() + INTERVALS[box] * DAY, seen: prev.seen + 1, correct: prev.correct + (correct ? 1 : 0), last: correct } },
  })
}

export const inScope = (q: Question, exam: string | null) => !exam || q.exam === exam

/** Due today: cards already seen whose due date has passed, weakest box first. */
export function dueQuestions(exam: string | null) {
  const now = Date.now()
  return QUESTIONS.filter((q) => inScope(q, exam) && state.cards[q.id] && state.cards[q.id].due <= now)
    .sort((a, b) => state.cards[a.id].box - state.cards[b.id].box)
}

/** Weak: answered wrong last time, or accuracy below 60%. */
export function weakQuestions(exam: string | null) {
  return QUESTIONS.filter((q) => {
    const c = state.cards[q.id]
    return inScope(q, exam) && c && (c.last === false || c.correct / c.seen < 0.6)
  })
}

export function streak() {
  const days = new Set(state.streakDays)
  let n = 0
  const d = new Date()
  // today counts if studied; otherwise start from yesterday so the streak isn't broken mid-day
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  while (days.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1) }
  return n
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
