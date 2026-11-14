/**
 * Read-side hooks over the progress store. Pages use these instead of reaching into the raw
 * state, so derived values (level, visible streak, next stage) are computed in one place.
 */
import { useEffect, useMemo, useState } from 'react'
import { dailyFor, getDailyChallenge, type DailyChallenge } from './daily'
import { localDateKey, weekOf } from './dates'
import { useProgress } from './progress'
import { currentStreak, levelFromXp, practisedToday, type LevelInfo } from './progressLogic'
import { STAGES, type StageInfo } from './stages'

/** Today's local date key; updates itself when the day rolls over or the tab wakes up. */
export function useToday(): string {
  const [today, setToday] = useState(() => localDateKey())
  useEffect(() => {
    const check = () => setToday((prev) => (prev === localDateKey() ? prev : localDateKey()))
    const interval = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return today
}

export function useLevel(): LevelInfo & { xp: number } {
  const xp = useProgress((s) => s.xp)
  return useMemo(() => ({ ...levelFromXp(xp), xp }), [xp])
}

export interface StreakView {
  /** Days in a row, as it should be shown right now (0 once a day has been missed). */
  days: number
  best: number
  /** Has today already been counted? If not, the streak is "at risk". */
  doneToday: boolean
}

export function useStreak(): StreakView {
  const streak = useProgress((s) => s.streak)
  const today = useToday()
  return useMemo(
    () => ({
      days: currentStreak(streak, today),
      best: streak.best,
      doneToday: practisedToday(streak, today),
    }),
    [streak, today],
  )
}

export type StageStatus = 'complete' | 'current' | 'locked'

export interface StageView extends StageInfo {
  status: StageStatus
  started: boolean
}

export interface PathView {
  stages: StageView[]
  /** The stage to continue with, or null once every stage is complete. */
  next: StageView | null
  completed: number
  total: number
}

/** The learning path with each stage's status: complete, current (unlocked, next up) or locked. */
export function useLearningPath(): PathView {
  const lessons = useProgress((s) => s.lessons)
  return useMemo(() => {
    const firstOpen = STAGES.findIndex((stage) => !lessons[stage.id]?.completedAt)
    const stages = STAGES.map((stage, i): StageView => {
      const lesson = lessons[stage.id]
      const status: StageStatus = lesson?.completedAt ? 'complete' : i === firstOpen ? 'current' : 'locked'
      return { ...stage, status, started: Boolean(lesson) }
    })
    return {
      stages,
      next: stages.find((stage) => stage.status === 'current') ?? null,
      completed: stages.filter((stage) => stage.status === 'complete').length,
      total: stages.length,
    }
  }, [lessons])
}

export interface DayActivity {
  date: string
  /** Mon, Tue … */
  label: string
  xp: number
  isToday: boolean
  isFuture: boolean
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** XP per day for the current week, Monday to Sunday. */
export function useWeekActivity(): DayActivity[] {
  const activity = useProgress((s) => s.activity)
  const today = useToday()
  return useMemo(
    () =>
      weekOf(today).map((date, i) => ({
        date,
        label: WEEKDAYS[i],
        xp: activity[date] ?? 0,
        isToday: date === today,
        isFuture: date > today,
      })),
    [activity, today],
  )
}

export interface DailyView {
  challenge: DailyChallenge
  /** Finished today (the reward has been paid). */
  done: boolean
  /** How far along: `count` of `target`. */
  count: number
  target: number
  /** "2 of 3 practice cubes" */
  progressLabel: string
  date: string
}

/**
 * Today's daily challenge with live progress. It is the saved one once anything has happened
 * today; before that it is the pick for today, which is the same one the store will save.
 */
export function useDailyChallenge(): DailyView {
  const doneOn = useProgress((s) => s.dailyDoneOn)
  const saved = useProgress((s) => s.daily)
  const lessons = useProgress((s) => s.lessons)
  const counters = useProgress((s) => s.counters)
  const today = useToday()
  return useMemo(() => {
    const player = { lessons, counters }
    const state = dailyFor(saved, today, player)
    const challenge = getDailyChallenge(state.id, player)!
    const done = doneOn === today
    const count = done ? challenge.target : Math.min(state.count, challenge.target)
    return {
      challenge,
      done,
      count,
      target: challenge.target,
      progressLabel: `${count} of ${challenge.target} ${challenge.unit[challenge.target === 1 ? 0 : 1]}`,
      date: today,
    }
  }, [doneOn, saved, lessons, counters, today])
}
