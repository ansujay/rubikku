/**
 * Pure view-model helpers for the Progress page: the activity heat-map, how far along each
 * badge is, and how to word the event log. No React, no Date.now() — callers pass "today".
 */
import { addDays, daysBetween, countPatterns, getBadge, NOTATION_MASTER_ROUNDS, weekOf, type BadgeDef, type LogEntry, type ProgressData } from '../../store'

// ───────────────────────── Heat-map ─────────────────────────

export interface HeatDay {
  date: string
  xp: number
  /** 0 = nothing, 1…4 = more and more practice. */
  level: 0 | 1 | 2 | 3 | 4
  isToday: boolean
  isFuture: boolean
}

export interface HeatMap {
  /** Oldest week first; each week is Monday → Sunday. */
  weeks: HeatDay[][]
  /** Short month name for the weeks where a new month begins (index-aligned with `weeks`), else ''. */
  monthLabels: string[]
  activeDays: number
  totalXp: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** XP in a day → heat level. A short lesson is ~100 XP, so 200+ is a big day. */
export function heatLevel(xp: number): HeatDay['level'] {
  if (!(xp > 0)) return 0
  if (xp < 40) return 1
  if (xp < 100) return 2
  if (xp < 200) return 3
  return 4
}

export function buildHeatMap(activity: Readonly<Record<string, number>>, today: string, weekCount = 12): HeatMap {
  const thisMonday = weekOf(today)[0]
  const weeks: HeatDay[][] = []
  const monthLabels: string[] = []
  let activeDays = 0
  let totalXp = 0
  let lastMonth = -1
  for (let w = weekCount - 1; w >= 0; w--) {
    const monday = addDays(thisMonday, -7 * w)
    const days = Array.from({ length: 7 }, (_, i): HeatDay => {
      const date = addDays(monday, i)
      const isFuture = date > today
      const xp = isFuture ? 0 : Math.max(0, activity[date] ?? 0)
      if (xp > 0) {
        activeDays++
        totalXp += xp
      }
      return { date, xp, level: heatLevel(xp), isToday: date === today, isFuture }
    })
    weeks.push(days)
    // Label a column with the month of its first day, when that month has not been named yet.
    const month = Number(monday.slice(5, 7)) - 1
    monthLabels.push(month !== lastMonth ? MONTHS[month] : '')
    lastMonth = month
  }
  return { weeks, monthLabels, activeDays, totalXp }
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "Thu 12 Nov" for a date key. */
export function formatDay(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  const monday = weekOf(date)[0]
  return `${WEEKDAYS[daysBetween(monday, date)]} ${d} ${MONTHS[m - 1]}`
}

export function describeHeatDay(day: HeatDay): string {
  const when = day.isToday ? 'Today' : formatDay(day.date)
  if (day.isFuture) return `${when} · not yet`
  return day.xp > 0 ? `${when} · ${day.xp} XP` : `${when} · no practice`
}

// ───────────────────────── Badges ─────────────────────────

export interface BadgeProgress {
  value: number
  max: number
  /** What is being counted: "solves", "days in a row". */
  unit: string
}

const COUNT_GOALS: Record<string, { max: number; unit: string; value: (data: ProgressData, streakDays: number, level: number) => number }> = {
  'solves-10': { max: 10, unit: 'solves', value: (d) => d.counters.solves ?? 0 },
  'solves-50': { max: 50, unit: 'solves', value: (d) => d.counters.solves ?? 0 },
  'solves-100': { max: 100, unit: 'solves', value: (d) => d.counters.solves ?? 0 },
  'streak-3': { max: 3, unit: 'days in a row', value: (_, streak) => streak },
  'streak-7': { max: 7, unit: 'days in a row', value: (_, streak) => streak },
  'streak-30': { max: 30, unit: 'days in a row', value: (_, streak) => streak },
  'daily-5': { max: 5, unit: 'daily challenges', value: (d) => d.counters.dailyChallenges ?? 0 },
  'notation-master': { max: NOTATION_MASTER_ROUNDS, unit: 'perfect rounds', value: (d) => d.counters.notationPerfect ?? 0 },
  'algorithm-ace': { max: 10, unit: 'algorithms', value: (d) => d.algorithms.length },
  'pattern-collector': { max: 5, unit: 'patterns', value: (d) => countPatterns(d.patterns).tricks },
  'pattern-curator': { max: 12, unit: 'patterns', value: (d) => countPatterns(d.patterns).tricks },
  'flag-bearer': { max: 3, unit: 'flags', value: (d) => countPatterns(d.patterns).flags },
  'world-tour': { max: 12, unit: 'flags', value: (d) => countPatterns(d.patterns).flags },
  'level-5': { max: 5, unit: 'levels', value: (_, __, level) => level },
  'level-10': { max: 10, unit: 'levels', value: (_, __, level) => level },
  'full-method': { max: 8, unit: 'stages', value: (d) => Object.values(d.lessons).filter((lesson) => lesson.completedAt).length },
}

/** How far along a countable badge is; null for badges that are simply done or not done. */
export function badgeProgress(badgeId: string, data: ProgressData, streakDays: number, level: number): BadgeProgress | null {
  const goal = COUNT_GOALS[badgeId]
  if (!goal) return null
  const value = Math.min(goal.max, Math.max(0, goal.value(data, streakDays, level)))
  return { value, max: goal.max, unit: goal.unit }
}

/** Where to go to earn a badge. */
export function badgeLink(badge: BadgeDef): { to: string; label: string } {
  if (badge.category === 'learning') return { to: '/learn', label: 'Go to lessons' }
  if (badge.category === 'speed') return { to: '/timer', label: 'Open the timer' }
  if (badge.category === 'streak') return badge.id === 'daily-5' ? { to: '/', label: 'See today’s challenge' } : { to: '/learn', label: 'Practise today' }
  if (badge.id === 'real-deal') return { to: '/solve', label: 'Solve my cube' }
  if (badge.category === 'solving') return { to: '/play', label: 'Pick up the cube' }
  if (badge.id.startsWith('notation')) return { to: '/notation', label: 'Open notation' }
  if (badge.id.startsWith('algorithm')) return { to: '/algorithms', label: 'Open algorithms' }
  if (badge.id.startsWith('flag') || badge.id === 'world-tour') return { to: '/patterns?tab=flags', label: 'Open flags' }
  if (badge.id.startsWith('pattern')) return { to: '/patterns', label: 'Open patterns' }
  return { to: '/learn', label: 'Keep learning' }
}

export const CATEGORY_TITLE: Record<BadgeDef['category'], string> = {
  learning: 'Learning',
  solving: 'Solving',
  speed: 'Speed',
  streak: 'Streaks',
  skills: 'Skills',
}

// ───────────────────────── Activity feed ─────────────────────────

export interface EventView {
  label: string
  icon: string
  tone: 'white' | 'yellow' | 'green' | 'blue' | 'red' | 'orange'
}

const EVENT_VIEWS: Record<string, EventView> = {
  'lesson-started': { label: 'Started a lesson', icon: 'route', tone: 'blue' },
  'primer-completed': { label: 'Learned the basics', icon: 'cube', tone: 'green' },
  'lesson-completed': { label: 'Finished a lesson', icon: 'layers', tone: 'green' },
  'drill-completed': { label: 'Finished a practice cube', icon: 'target', tone: 'blue' },
  'solve-completed': { label: 'Solved the cube', icon: 'cube', tone: 'green' },
  'real-cube-solved': { label: 'Solved a real cube', icon: 'wand', tone: 'orange' },
  'notation-round': { label: 'Played a notation round', icon: 'notation', tone: 'blue' },
  'algorithm-practised': { label: 'Practised an algorithm', icon: 'cards', tone: 'red' },
  'pattern-made': { label: 'Made a pattern', icon: 'grid', tone: 'yellow' },
  'daily-challenge-completed': { label: 'Finished the daily challenge', icon: 'calendar', tone: 'orange' },
  custom: { label: 'Bonus', icon: 'sparkle', tone: 'yellow' },
}

export const describeEvent = (type: string): EventView => EVENT_VIEWS[type] ?? { label: 'Practised', icon: 'sparkle', tone: 'white' }

/** How a run of the same event reads: "Finished 4 practice cubes". */
const MANY: Record<string, (count: number) => string> = {
  'lesson-started': (n) => `Started ${n} lessons`,
  'drill-completed': (n) => `Finished ${n} practice cubes`,
  'solve-completed': (n) => `Solved the cube ${n} times`,
  'notation-round': (n) => `Played ${n} notation rounds`,
  'algorithm-practised': (n) => `Practised ${n} algorithms`,
  'pattern-made': (n) => `Made ${n} patterns`,
}

/** One row of the activity feed: the event's look, worded for how many times it happened. */
export function describeEntry(entry: Pick<LogEntry, 'type' | 'count' | 'label'>): EventView {
  const view = describeEvent(entry.type)
  const count = entry.count ?? 1
  if (count > 1 && MANY[entry.type]) return { ...view, label: MANY[entry.type](count) }
  // A `custom` event that says what it was (the primer: "Meet your cube") is not a mystery "Bonus".
  if (entry.type === 'custom' && entry.label) return { ...view, label: `Finished: ${entry.label}`, icon: 'route', tone: 'green' }
  return view
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", "12 Oct". */
export function timeAgo(iso: string, now: Date): string {
  const then = new Date(iso)
  const ms = now.getTime() - then.getTime()
  if (Number.isNaN(ms)) return ''
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return `${then.getDate()} ${MONTHS[then.getMonth()]}`
}

/** "12 November 2026" */
export function formatLongDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "12 Nov" */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/** Badges unlocked, newest first. */
export function unlockedBadges(badges: Readonly<Record<string, string>>): { badge: BadgeDef; at: string }[] {
  return Object.entries(badges)
    .map(([id, at]) => ({ badge: getBadge(id), at }))
    .filter((entry): entry is { badge: BadgeDef; at: string } => entry.badge !== undefined)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
}

/** The badge after this one in its family that he has not got yet (for "Next up" in the badge dialog). */
export function nextInFamily(badge: BadgeDef, all: readonly BadgeDef[], unlocked: Readonly<Record<string, string>>): BadgeDef | null {
  const family = all.filter((b) => b.category === badge.category)
  const after = family.slice(family.findIndex((b) => b.id === badge.id) + 1)
  return after.find((b) => !unlocked[b.id]) ?? family.find((b) => b.id !== badge.id && !unlocked[b.id]) ?? null
}

/**
 * The locked badge he is closest to, by the fraction of its goal already reached (countable
 * badges only). Null when nothing countable is under way.
 */
export function closestBadge(
  all: readonly BadgeDef[],
  unlocked: Readonly<Record<string, string>>,
  progressOf: (id: string) => BadgeProgress | null,
): { badge: BadgeDef; progress: BadgeProgress } | null {
  let best: { badge: BadgeDef; progress: BadgeProgress } | null = null
  for (const badge of all) {
    if (unlocked[badge.id]) continue
    const progress = progressOf(badge.id)
    if (!progress || progress.value <= 0 || progress.value >= progress.max) continue
    if (!best || progress.value / progress.max > best.progress.value / best.progress.max) best = { badge, progress }
  }
  return best
}
