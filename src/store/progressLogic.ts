/**
 * Pure progress rules: XP, levels, streaks, badges. No zustand, no Date.now() — everything
 * takes `now` so it is easy to test. The store in progress.ts is a thin wrapper around this.
 */
import { BADGES, getBadge, stageBadgeId, type BadgeDef } from './badges'
import { advanceDaily, dailyFor, getDailyChallenge, isDailyComplete, sanitizeDaily, type DailyChallenge, type DailyState } from './daily'
import { daysBetween, isDateKey, localDateKey } from './dates'
import { isRecord } from './persist'
import { STAGE_IDS } from './stages'

// ───────────────────────── Data ─────────────────────────

export interface LessonProgress {
  startedAt: string
  completedAt: string | null
}

export interface StreakData {
  /** Length of the run that ended on `lastActive`. Use `currentStreak()` for display. */
  current: number
  best: number
  /** Local date key (YYYY-MM-DD) of the last day with activity. */
  lastActive: string | null
}

export interface LogEntry {
  at: string
  type: string
  xp: number
  /** How many events in a row this row stands for (repeats collapse into one row). Absent = 1. */
  count?: number
  /** What it was, for `custom` events that say ("Meet your cube"). */
  label?: string
}

/** Per-day tallies behind the "diminishing XP" rules. Reset when the day changes. */
export interface DayTally {
  date: string
  /** Rule key → times it has happened today (`drill`, `solve`, `timed`, `alg:<id>`, …). */
  counts: Record<string, number>
}

export interface ProgressData {
  xp: number
  /** Badge id → ISO timestamp of when it was unlocked. */
  badges: Record<string, string>
  streak: StreakData
  /** Lesson completion keyed by stage id. */
  lessons: Record<string, LessonProgress>
  /** Running totals: solves, timedSolves, notationRounds, notationCorrect, drills, dailyChallenges. */
  counters: Record<string, number>
  /** Fastest timed solve, in milliseconds. */
  bestSolveMs: number | null
  patterns: string[]
  algorithms: string[]
  /** XP earned per local day (for the week strip and activity charts). Capped to ~400 days. */
  activity: Record<string, number>
  /** Local date key of the last day the daily challenge was completed. */
  dailyDoneOn: string | null
  /** Today's daily challenge and how far along it is (see daily.ts). Null until the first event of a day. */
  daily: DailyState | null
  /** Today's event counts, for the repeat-XP rules. */
  tally: DayTally
  /** Most recent events, newest first. Repeats of the same thing collapse into one row. */
  log: LogEntry[]
}

export const initialProgress = (): ProgressData => ({
  xp: 0,
  badges: {},
  streak: { current: 0, best: 0, lastActive: null },
  lessons: {},
  counters: {},
  bestSolveMs: null,
  patterns: [],
  algorithms: [],
  activity: {},
  dailyDoneOn: null,
  daily: null,
  tally: { date: '', counts: {} },
  log: [],
})

// ───────────────────────── Events ─────────────────────────

export interface ProgressEventMap {
  'lesson-started': { stageId: string }
  'lesson-completed': { stageId: string }
  /** The basics lesson ("Meet your cube") finished: the First Steps badge. */
  'primer-completed': Record<string, never>
  'drill-completed': { stageId: string }
  /** `ms` is only meaningful for timed solves; badges for speed need `context: 'timer'`. */
  'solve-completed': { context: 'timer' | 'play' | 'guided' | 'lesson'; ms?: number }
  'real-cube-solved': Record<string, never>
  'notation-round': { correct: number; total: number }
  'algorithm-practised': { algorithmId: string }
  'pattern-made': { patternId: string }
  'daily-challenge-completed': Record<string, never>
  /** Escape hatch for features with their own rewards. */
  custom: { xp: number; label?: string }
}

export type ProgressEventType = keyof ProgressEventMap

export interface EventResult {
  xpGained: number
  newBadges: BadgeDef[]
  leveledUp: boolean
  level: number
  /** Streak length after this event. */
  streak: number
  /** True when this event extended the streak to a new day. */
  streakExtended: boolean
  /** The daily challenge, when this very event finished it (its XP is already in `xpGained`). */
  dailyCompleted: DailyChallenge | null
}

export const XP = {
  /** A stage lesson finished for the first time. Practice inside it (rounds, drills) pays separately. */
  lessonFirst: 60,
  /** The basics lesson, once. */
  primer: 40,
  lessonRepeat: 20,
  drill: 15,
  solve: 30,
  timedSolve: 40,
  /** A timer solve that does not count as a solve yet (see PLAUSIBLE_SOLVE_MS): modest. */
  timerPractice: 10,
  firstSolveBonus: 100,
  personalBestBonus: 20,
  realCube: 80,
  notationPerCorrect: 2,
  notationPerfectBonus: 10,
  algorithmFirst: 6,
  /** The first rep of an algorithm each day; further reps that day earn nothing. */
  algorithmRepeat: 2,
  patternFirst: 10,
  daily: 50,
} as const

/**
 * Repeatable events pay full XP for a sensible day's practice, then taper, so that grinding one
 * button is never the best way to level up (and so two key presses cannot keep a streak alive
 * all day). Each rule: full XP for the first `full` times in a day, `reduced` XP up to `cap`
 * times, `floor` after that. See `repeatXp`.
 */
export const REPEAT_RULES = {
  drill: { full: 10, cap: 30, reduced: 5, floor: 1 },
  solve: { full: 5, cap: 20, reduced: 10, floor: 2 },
  timed: { full: 12, cap: 40, reduced: 10, floor: 2 },
  notation: { full: 6, cap: 20, reduced: 0.5, floor: 0 },
  realCube: { full: 1, cap: 3, reduced: 20, floor: 0 },
  lessonRepeat: { full: 1, cap: 1, reduced: 0, floor: 0 },
  algorithm: { full: 1, cap: 1, reduced: 0, floor: 0 },
} as const

export type RepeatRule = keyof typeof REPEAT_RULES

/**
 * XP for the `nth` time (1-based) something has happened today. `reduced` below 1 is a
 * fraction of the full amount; otherwise it is a flat number of XP.
 */
export function repeatXp(rule: RepeatRule, fullXp: number, nth: number): number {
  const { full, cap, reduced, floor } = REPEAT_RULES[rule]
  if (nth <= full) return fullXp
  const less = (value: number) => Math.min(fullXp, value > 0 && value < 1 ? Math.round(fullXp * value) : value)
  return nth <= cap ? less(reduced) : less(floor)
}

// ───────────────────────── Levels ─────────────────────────

/** Total XP needed to reach `level` (level 1 = 0, 2 = 100, 3 = 300, 4 = 600 …). */
export const xpForLevel = (level: number): number => 50 * level * (level - 1)

export const LEVEL_TITLES = [
  'Rookie',
  'Twister',
  'Cross Builder',
  'Layer Maker',
  'Apprentice',
  'Cuber',
  'Algorithm Ace',
  'Speed Seeker',
  'Speedcuber',
  'Cube Master',
] as const

export interface LevelInfo {
  level: number
  title: string
  /** XP earned inside the current level. */
  xpIntoLevel: number
  /** XP span of the current level. */
  xpForNext: number
  /** XP still needed to level up. */
  xpToNext: number
  /** 0…1 through the current level. */
  progress: number
}

export function levelFromXp(xp: number): LevelInfo {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0
  // Invert 50·L·(L−1) ≤ xp, then correct for floating point at the boundaries.
  let level = Math.floor((1 + Math.sqrt(1 + safeXp / 12.5)) / 2)
  while (xpForLevel(level + 1) <= safeXp) level++
  while (level > 1 && xpForLevel(level) > safeXp) level--
  const floor = xpForLevel(level)
  const span = xpForLevel(level + 1) - floor
  const into = safeXp - floor
  return {
    level,
    title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1],
    xpIntoLevel: into,
    xpForNext: span,
    xpToNext: span - into,
    progress: into / span,
  }
}

// ───────────────────────── Streak ─────────────────────────

/** Apply "there was activity today" to a streak. */
export function touchStreak(streak: StreakData, today: string): StreakData {
  if (streak.lastActive === today) return streak
  const gap = streak.lastActive && isDateKey(streak.lastActive) ? daysBetween(streak.lastActive, today) : null
  // gap < 0 means the clock went backwards (travel, clock change): keep the run, move the day.
  const current = gap === 1 ? streak.current + 1 : gap !== null && gap <= 0 ? Math.max(1, streak.current) : 1
  return { current, best: Math.max(streak.best, current), lastActive: today }
}

/** The streak to show today: it survives until the end of the day after the last activity. */
export function currentStreak(streak: StreakData, today: string): number {
  if (!streak.lastActive || !isDateKey(streak.lastActive)) return 0
  const gap = daysBetween(streak.lastActive, today)
  return gap <= 1 ? streak.current : 0
}

/** True when today already counts toward the streak. */
export const practisedToday = (streak: StreakData, today: string): boolean => streak.lastActive === today

// ───────────────────────── Reducer ─────────────────────────

const ACTIVITY_DAYS_KEPT = 400
const LOG_KEPT = 60
const TALLY_KEYS_KEPT = 200
/** Event types whose repeats collapse into one feed row ("Practised an algorithm ×4"). */
const COLLAPSIBLE = new Set(['drill-completed', 'solve-completed', 'notation-round', 'algorithm-practised', 'pattern-made', 'lesson-started'])
/**
 * A timer can't see the cube. A beginner who has never solved one can't do a sub-minute solve,
 * so a timed solve only counts as a solve — toward speed badges, the solve counts and the
 * personal-best bonus — once he has solved the whole cube in Rubikku (Free play, the last lesson,
 * the solve walk-through or his real cube), and never below this time (QA 2, M10). Before that,
 * timer practice earns a little XP and keeps his times, nothing more.
 */
export const PLAUSIBLE_SOLVE_MS = 20_000
/** True once he has really solved the cube somewhere other than the timer. */
export function hasProvenSolve(counters: Record<string, number>): boolean {
  return (counters.fullSolves ?? 0) > 0 || (counters.realCubeSolves ?? 0) > 0 || (counters.solves ?? 0) - (counters.timedSolves ?? 0) > 0
}
const SPEED_BADGES: readonly [string, number][] = [
  ['sub-5', 5 * 60_000],
  ['sub-3', 3 * 60_000],
  ['sub-2', 2 * 60_000],
  ['sub-1', 60_000],
]

/** Fewest questions for a round to count as "perfect" (every level round has 8–12). */
export const NOTATION_PERFECT_MIN = 8
/** Perfect rounds needed for the Notation Master badge. */
export const NOTATION_MASTER_ROUNDS = 3

const bump = (counters: Record<string, number>, key: string, by = 1) => ({
  ...counters,
  [key]: (counters[key] ?? 0) + by,
})

const clampInt = (value: unknown, min: number, max: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0
  return Math.min(max, Math.max(min, n))
}

/**
 * Apply one event. Returns the new data and what changed (for toasts and sounds).
 * Unknown event types are ignored (no XP, no streak) rather than throwing.
 */
export function applyEvent<K extends ProgressEventType>(
  data: ProgressData,
  type: K,
  payload: ProgressEventMap[K],
  now: Date = new Date(),
): { data: ProgressData; result: EventResult } {
  const today = localDateKey(now)
  const stamp = now.toISOString()
  const before = levelFromXp(data.xp).level
  let next: ProgressData = data
  let xp = 0
  const earned: string[] = []
  const award = (id: string) => {
    if (!next.badges[id] && !earned.includes(id) && getBadge(id)) earned.push(id)
  }
  /** Set when the event itself (not just the day's bookkeeping) is worth a row in the feed. */
  let noteworthy = false
  let logLabel: string | undefined

  // Today's tallies for the repeat rules, and today's daily challenge. The challenge is picked
  // from his progress *before* this event, so the card on Home never changes under him.
  let tally: DayTally = data.tally?.date === today ? data.tally : { date: today, counts: {} }
  const daily = dailyFor(data.daily, today, data)
  /** Count one more of `key` today and return which time this is (1-based). */
  let tallied = false
  const nth = (key: string): number => {
    tallied = true
    const n = (tally.counts[key] ?? 0) + 1
    if (key in tally.counts || Object.keys(tally.counts).length < TALLY_KEYS_KEPT) tally = { date: today, counts: { ...tally.counts, [key]: n } }
    return n
  }

  switch (type) {
    case 'lesson-started': {
      const { stageId } = payload as ProgressEventMap['lesson-started']
      if (!next.lessons[stageId]) {
        next = { ...next, lessons: { ...next.lessons, [stageId]: { startedAt: stamp, completedAt: null } } }
        noteworthy = true
      }
      break
    }
    case 'primer-completed': {
      // Once: going through the basics again is revision, not news.
      if (!next.counters.primer) {
        xp += XP.primer
        next = { ...next, counters: bump(next.counters, 'primer') }
      }
      award('first-steps')
      break
    }
    case 'lesson-completed': {
      const { stageId } = payload as ProgressEventMap['lesson-completed']
      const existing = next.lessons[stageId]
      const first = !existing?.completedAt
      // Going through a finished lesson again is worth a little, once per lesson per day.
      xp += first ? XP.lessonFirst : repeatXp('lessonRepeat', XP.lessonRepeat, nth(`lesson:${stageId}`))
      if (first) {
        next = {
          ...next,
          lessons: {
            ...next.lessons,
            [stageId]: { startedAt: existing?.startedAt ?? stamp, completedAt: stamp },
          },
        }
      }
      award(stageBadgeId(stageId))
      if (STAGE_IDS.every((id) => next.lessons[id]?.completedAt)) award('full-method')
      break
    }
    case 'drill-completed': {
      xp += repeatXp('drill', XP.drill, nth('drill'))
      next = { ...next, counters: bump(next.counters, 'drills') }
      break
    }
    case 'solve-completed': {
      const { context, ms } = payload as ProgressEventMap['solve-completed']
      const time = context === 'timer' && typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : null
      if (time !== null) {
        // Timer practice: his times are kept, but it only counts as a solve once he has shown he
        // can solve the cube, and only at a believable time (see PLAUSIBLE_SOLVE_MS).
        const counts = hasProvenSolve(next.counters) && time >= PLAUSIBLE_SOLVE_MS
        xp += counts ? repeatXp('timed', XP.timedSolve, nth('timed')) : repeatXp('timed', XP.timerPractice, nth('timed'))
        let counters = bump(next.counters, 'timedSolves')
        let bestSolveMs = next.bestSolveMs
        if (counts && bestSolveMs !== null && time < bestSolveMs) xp += XP.personalBestBonus
        if (bestSolveMs === null || time < bestSolveMs) bestSolveMs = Math.round(time)
        if (counts) {
          counters = bump(counters, 'solves')
          for (const [id, limit] of SPEED_BADGES) if (time < limit) award(id)
        }
        next = { ...next, counters, bestSolveMs }
        if (counts) {
          if (counters.solves >= 10) award('solves-10')
          if (counters.solves >= 50) award('solves-50')
          if (counters.solves >= 100) award('solves-100')
        }
        break
      }
      const firstEver = (next.counters.solves ?? 0) === 0
      xp += repeatXp('solve', XP.solve, nth('solve'))
      if (firstEver) xp += XP.firstSolveBonus
      const counters = bump(bump(next.counters, 'solves'), 'fullSolves')
      next = { ...next, counters }
      award('first-solve')
      if (counters.solves >= 10) award('solves-10')
      if (counters.solves >= 50) award('solves-50')
      if (counters.solves >= 100) award('solves-100')
      break
    }
    case 'real-cube-solved': {
      xp += repeatXp('realCube', XP.realCube, nth('real'))
      next = { ...next, counters: bump(next.counters, 'realCubeSolves') }
      award('real-deal')
      break
    }
    case 'notation-round': {
      const raw = payload as ProgressEventMap['notation-round']
      const total = clampInt(raw.total, 0, 500)
      const correct = clampInt(raw.correct, 0, total)
      const perfect = total > 0 && correct === total
      // A perfect round has to be a real round: every level round has 8–12 questions.
      const flawless = perfect && total >= NOTATION_PERFECT_MIN
      if (total > 0) xp += repeatXp('notation', correct * XP.notationPerCorrect + (flawless ? XP.notationPerfectBonus : 0), nth('notation'))
      let counters = bump(bump(next.counters, 'notationRounds'), 'notationCorrect', correct)
      if (flawless) counters = bump(counters, 'notationPerfect')
      next = { ...next, counters }
      if (total > 0) award('notation-rookie')
      if ((counters.notationPerfect ?? 0) >= NOTATION_MASTER_ROUNDS) award('notation-master')
      break
    }
    case 'algorithm-practised': {
      const { algorithmId } = payload as ProgressEventMap['algorithm-practised']
      const first = !next.algorithms.includes(algorithmId)
      const rep = nth(`alg:${algorithmId}`)
      xp += first ? XP.algorithmFirst : repeatXp('algorithm', XP.algorithmRepeat, rep)
      if (first) next = { ...next, algorithms: [...next.algorithms, algorithmId] }
      if (next.algorithms.length >= 10) award('algorithm-ace')
      break
    }
    case 'pattern-made': {
      const { patternId } = payload as ProgressEventMap['pattern-made']
      const first = !next.patterns.includes(patternId)
      if (first) {
        xp += XP.patternFirst
        next = { ...next, patterns: [...next.patterns, patternId] }
      }
      if (next.patterns.length >= 5) award('pattern-collector')
      if (next.patterns.length >= 12) award('pattern-curator')
      break
    }
    case 'daily-challenge-completed':
      // Completion is detected below from the real events; this type only exists as a feed row.
      break
    case 'custom': {
      const custom = payload as ProgressEventMap['custom']
      xp += clampInt(custom.xp, 0, 1000)
      if (typeof custom.label === 'string' && custom.label.trim()) logLabel = custom.label.trim().slice(0, 60)
      break
    }
    default:
      break
  }

  // The daily challenge: advance it with this event; the moment it is met, pay out — once a day.
  const dailyNext = advanceDaily(daily, type, payload)
  let dailyCompleted: DailyChallenge | null = null
  let dailyXp = 0
  if (dailyNext !== daily && isDailyComplete(dailyNext) && next.dailyDoneOn !== today) {
    dailyXp = XP.daily
    dailyCompleted = getDailyChallenge(dailyNext.id, data) ?? null
    next = { ...next, dailyDoneOn: today, counters: bump(next.counters, 'dailyChallenges') }
    if ((next.counters.dailyChallenges ?? 0) >= 5) award('daily-5')
  }
  // Save today's pick as soon as anything real happens (an unknown event changes nothing).
  const happened = next !== data || xp > 0 || tallied || dailyNext !== daily
  if (happened && dailyNext !== data.daily) next = { ...next, daily: dailyNext }
  if (tallied) next = { ...next, tally }
  const eventXp = xp
  xp += dailyXp

  // Anything that earned XP (or finished/started a lesson) counts as practising today.
  const active = xp > 0 || type === 'lesson-started'
  let streakExtended = false
  if (active) {
    const streak = touchStreak(next.streak, today)
    streakExtended = streak !== next.streak
    next = { ...next, streak }
    if (streak.current >= 3) award('streak-3')
    if (streak.current >= 7) award('streak-7')
    if (streak.current >= 30) award('streak-30')
  }

  const totalXp = next.xp + xp
  const after = levelFromXp(totalXp).level
  if (after >= 5) award('level-5')
  if (after >= 10) award('level-10')

  if (xp > 0 || earned.length > 0) {
    const badges = { ...next.badges }
    for (const id of earned) badges[id] = stamp
    const activity = xp > 0 ? { ...next.activity, [today]: (next.activity[today] ?? 0) + xp } : next.activity
    next = { ...next, xp: totalXp, badges, activity: pruneActivity(activity) }
  }

  // The feed: only things that earned something (a repeat worth 0 XP is noise), and a run of
  // the same thing on the same day is one row with a count.
  let log = next.log
  if (eventXp > 0 || noteworthy || (earned.length > 0 && !dailyCompleted)) {
    const last = log[0]
    if (last && last.type === type && COLLAPSIBLE.has(type) && localDateKey(new Date(last.at)) === today) {
      log = [{ at: stamp, type, xp: last.xp + eventXp, count: (last.count ?? 1) + 1 }, ...log.slice(1)]
    } else {
      log = [logLabel ? { at: stamp, type, xp: eventXp, label: logLabel } : { at: stamp, type, xp: eventXp }, ...log]
    }
  }
  if (dailyCompleted) log = [{ at: stamp, type: 'daily-challenge-completed', xp: dailyXp }, ...log]
  if (log !== next.log) next = { ...next, log: log.slice(0, LOG_KEPT) }

  return {
    data: next,
    result: {
      xpGained: xp,
      newBadges: earned.map((id) => getBadge(id)!),
      leveledUp: after > before,
      level: after,
      streak: next.streak.current,
      streakExtended,
      dailyCompleted,
    },
  }
}

function pruneActivity(activity: Record<string, number>): Record<string, number> {
  const keys = Object.keys(activity)
  if (keys.length <= ACTIVITY_DAYS_KEPT) return activity
  const keep = keys.sort().slice(-ACTIVITY_DAYS_KEPT)
  return Object.fromEntries(keep.map((key) => [key, activity[key]]))
}

// ───────────────────────── Validation of saved data ─────────────────────────

const isIso = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const nonNegInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length < 80))] : []

/** Rebuild valid progress data from anything. Bad fields fall back to defaults one by one. */
export function sanitizeProgress(input: unknown): ProgressData {
  const base = initialProgress()
  if (!isRecord(input)) return base

  const xp = nonNegInt(input.xp)
  if (xp !== null) base.xp = xp

  if (isRecord(input.badges)) {
    for (const badge of BADGES) {
      const at = input.badges[badge.id]
      if (isIso(at)) base.badges[badge.id] = at
    }
  }

  if (isRecord(input.streak)) {
    const current = nonNegInt(input.streak.current)
    const best = nonNegInt(input.streak.best)
    const lastActive = isDateKey(input.streak.lastActive) ? input.streak.lastActive : null
    if (lastActive && current !== null && current > 0) {
      base.streak = { current, best: Math.max(best ?? 0, current), lastActive }
    } else if (best !== null) {
      base.streak.best = best
    }
  }

  if (isRecord(input.lessons)) {
    for (const [id, value] of Object.entries(input.lessons)) {
      if (id.length > 80 || !isRecord(value) || !isIso(value.startedAt)) continue
      base.lessons[id] = {
        startedAt: value.startedAt,
        completedAt: isIso(value.completedAt) ? value.completedAt : null,
      }
    }
  }

  if (isRecord(input.counters)) {
    for (const [key, value] of Object.entries(input.counters)) {
      const n = nonNegInt(value)
      if (n !== null && key.length < 60) base.counters[key] = n
    }
  }

  const best = nonNegInt(input.bestSolveMs)
  if (best !== null && best > 0) base.bestSolveMs = best

  base.patterns = stringList(input.patterns)
  base.algorithms = stringList(input.algorithms)

  if (isRecord(input.activity)) {
    for (const [key, value] of Object.entries(input.activity)) {
      const n = nonNegInt(value)
      if (isDateKey(key) && n !== null) base.activity[key] = n
    }
    base.activity = pruneActivity(base.activity)
  }

  if (isDateKey(input.dailyDoneOn)) base.dailyDoneOn = input.dailyDoneOn
  const daily = sanitizeDaily(input.daily)
  if (daily && isDateKey(daily.date)) base.daily = daily

  if (isRecord(input.tally) && isDateKey(input.tally.date) && isRecord(input.tally.counts)) {
    const counts: Record<string, number> = {}
    for (const [key, value] of Object.entries(input.tally.counts).slice(0, TALLY_KEYS_KEPT)) {
      const n = nonNegInt(value)
      if (n !== null && key.length < 80) counts[key] = Math.min(n, 100_000)
    }
    base.tally = { date: input.tally.date, counts }
  }

  if (Array.isArray(input.log)) {
    base.log = input.log
      .filter(
        (entry): entry is LogEntry =>
          isRecord(entry) && isIso(entry.at) && typeof entry.type === 'string' && nonNegInt(entry.xp) !== null,
      )
      .slice(0, LOG_KEPT)
      .map((entry) => {
        const out: LogEntry = { at: entry.at, type: entry.type, xp: entry.xp }
        const count = nonNegInt(entry.count)
        if (count !== null && count > 1) out.count = count
        if (typeof entry.label === 'string' && entry.label.length > 0) out.label = entry.label.slice(0, 60)
        return out
      })
  }

  return base
}

// ───────────────────────── Two tabs ─────────────────────────

const earlier = (a: string | undefined, b: string | undefined): string | undefined => (!a ? b : !b ? a : a < b ? a : b)

/**
 * Combine this tab's progress with what another tab just saved. The other tab's save is the
 * newer one, so it wins for most things — but nothing earned is ever lost: XP, badges, finished
 * lessons, counters, collections and the best streak only ever go up.
 */
export function mergeProgress(local: ProgressData, remote: ProgressData): ProgressData {
  const badges: Record<string, string> = { ...remote.badges }
  for (const [id, at] of Object.entries(local.badges)) badges[id] = earlier(badges[id], at)!

  const lessons: Record<string, LessonProgress> = { ...remote.lessons }
  for (const [id, mine] of Object.entries(local.lessons)) {
    const theirs = lessons[id]
    lessons[id] = theirs
      ? { startedAt: earlier(theirs.startedAt, mine.startedAt)!, completedAt: earlier(theirs.completedAt ?? undefined, mine.completedAt ?? undefined) ?? null }
      : mine
  }

  const counters: Record<string, number> = { ...remote.counters }
  for (const [key, value] of Object.entries(local.counters)) counters[key] = Math.max(counters[key] ?? 0, value)

  const activity: Record<string, number> = { ...remote.activity }
  for (const [day, value] of Object.entries(local.activity)) activity[day] = Math.max(activity[day] ?? 0, value)

  const newerStreak =
    !remote.streak.lastActive || (local.streak.lastActive && local.streak.lastActive > remote.streak.lastActive) ? local.streak : remote.streak
  const best = Math.max(local.streak.best, remote.streak.best, newerStreak.current)

  const dailyDoneOn = !remote.dailyDoneOn || (local.dailyDoneOn && local.dailyDoneOn > remote.dailyDoneOn) ? local.dailyDoneOn : remote.dailyDoneOn
  let daily = remote.daily
  if (local.daily && (!daily || local.daily.date > daily.date || (local.daily.date === daily.date && local.daily.id === daily.id && local.daily.count > daily.count))) {
    daily = local.daily
  }

  let tally = remote.tally
  if (local.tally.date > remote.tally.date) tally = local.tally
  else if (local.tally.date === remote.tally.date) {
    const counts = { ...remote.tally.counts }
    for (const [key, value] of Object.entries(local.tally.counts)) counts[key] = Math.max(counts[key] ?? 0, value)
    tally = { date: remote.tally.date, counts }
  }

  return {
    xp: Math.max(local.xp, remote.xp),
    badges,
    streak: { ...newerStreak, best },
    lessons,
    counters,
    bestSolveMs: remote.bestSolveMs,
    patterns: [...new Set([...remote.patterns, ...local.patterns])],
    algorithms: [...new Set([...remote.algorithms, ...local.algorithms])],
    activity: pruneActivity(activity),
    dailyDoneOn,
    daily,
    tally,
    log: remote.log,
  }
}
