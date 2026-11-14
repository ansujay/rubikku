/**
 * The daily challenge: one small goal per local day, the same one all day.
 *
 * Nothing in a feature has to know about it. Every challenge is measured from the events that
 * features already send through `recordEvent` / `reward()` (a notation round, a finished drill,
 * a timed solve…), and `applyEvent` in progressLogic.ts advances and completes it centrally,
 * paying the reward exactly once per day.
 *
 * Which challenges are on offer depends on how far he has got: a beginner is never asked for a
 * full solve, and someone who has finished the path is not asked to finish a lesson.
 */
import { STAGE_IDS, type CubeColor } from './stages'

/** The slice of saved progress the catalogue looks at (so this file needs no ProgressData). */
export interface DailyPlayer {
  lessons: Readonly<Record<string, { completedAt: string | null } | undefined>>
  counters: Readonly<Record<string, number>>
}

export interface DailyChallenge {
  id: string
  title: string
  /** One sentence: exactly what to do. */
  detail: string
  /** Hash route that starts it. */
  to: string
  color: CubeColor
  icon: string
  /** How many it takes: "2 of 3 practice cubes". */
  target: number
  /** What is being counted, singular and plural. */
  unit: readonly [string, string]
}

/** Today's challenge as saved: which one, and how far along. */
export interface DailyState {
  /** Local date key the challenge belongs to. */
  date: string
  id: string
  count: number
  /** Distinct things counted so far (for "three different algorithms"). */
  items: string[]
}

interface DailyDef extends Omit<DailyChallenge, 'to'> {
  to: string | ((player: DailyPlayer) => string)
  /** Who it is offered to. */
  offered: (level: PlayerLevel) => boolean
  /**
   * Progress after an event: return the new count (and the item to remember, for challenges that
   * count different things), or null when the event does not count.
   */
  advance: (type: string, payload: Record<string, unknown>, state: DailyState) => { count: number; item?: string } | null
}

interface PlayerLevel {
  /** Stages finished, 0…8. */
  stagesDone: number
  /** He is inside the path: a stage lesson has been started or finished. */
  learning: boolean
  /** He has solved a whole cube at least once, or knows the whole method. */
  solver: boolean
  /** All eight stages are finished. */
  graduate: boolean
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

export function playerLevel(player: DailyPlayer): PlayerLevel {
  const stagesDone = STAGE_IDS.filter((id) => player.lessons[id]?.completedAt).length
  const learning = STAGE_IDS.some((id) => player.lessons[id])
  const solver = stagesDone === STAGE_IDS.length || num(player.counters.solves) > 0
  return { stagesDone, learning, solver, graduate: stagesDone === STAGE_IDS.length }
}

/** The lesson whose practice cubes he should be doing: the stage he is on, else the last one finished. */
function drillLesson(player: DailyPlayer): string {
  const open = STAGE_IDS.find((id) => !player.lessons[id]?.completedAt)
  if (open && player.lessons[open]) return `/learn/${open}`
  const done = [...STAGE_IDS].reverse().find((id) => player.lessons[id]?.completedAt)
  return `/learn/${done ?? open ?? STAGE_IDS[0]}`
}

const plusOne = (state: DailyState) => ({ count: state.count + 1 })

/** A notation round only counts when it was a real one (not two taps and quit). */
const NOTATION_MIN_QUESTIONS = 5
const NOTATION_SHARP = 0.8

const DEFS: readonly DailyDef[] = [
  {
    id: 'notation-sharp',
    title: 'Sharp reader',
    detail: 'Finish a notation round with at least 8 out of 10 right.',
    to: '/notation',
    color: 'blue',
    icon: 'notation',
    target: 1,
    unit: ['round', 'rounds'],
    offered: () => true,
    advance: (type, payload) => {
      if (type !== 'notation-round') return null
      const total = num(payload.total)
      return total >= NOTATION_MIN_QUESTIONS && num(payload.correct) / total >= NOTATION_SHARP ? { count: 1 } : null
    },
  },
  {
    id: 'notation-two',
    title: 'Double round',
    detail: 'Play two rounds of the notation trainer.',
    to: '/notation',
    color: 'blue',
    icon: 'notation',
    target: 2,
    unit: ['round', 'rounds'],
    offered: () => true,
    advance: (type, payload, state) => (type === 'notation-round' && num(payload.total) >= NOTATION_MIN_QUESTIONS ? plusOne(state) : null),
  },
  {
    id: 'pattern-1',
    title: 'Make a pattern',
    detail: 'Pick any pattern and build it on the cube, move by move.',
    to: '/patterns',
    color: 'green',
    icon: 'grid',
    target: 1,
    unit: ['pattern', 'patterns'],
    offered: () => true,
    advance: (type) => (type === 'pattern-made' ? { count: 1 } : null),
  },
  {
    id: 'drills-3',
    title: 'Three practice cubes',
    detail: 'Solve three practice cubes in your lesson.',
    to: drillLesson,
    color: 'orange',
    icon: 'target',
    target: 3,
    unit: ['practice cube', 'practice cubes'],
    offered: (level) => level.learning,
    advance: (type, _payload, state) => (type === 'drill-completed' ? plusOne(state) : null),
  },
  {
    id: 'lesson-1',
    title: 'One more step',
    detail: 'Finish a lesson on the path: the next one, or one you already know.',
    to: '/learn',
    color: 'green',
    icon: 'route',
    target: 1,
    unit: ['lesson', 'lessons'],
    offered: (level) => level.learning && level.stagesDone < STAGE_IDS.length,
    advance: (type) => (type === 'lesson-completed' ? { count: 1 } : null),
  },
  {
    id: 'algs-3',
    title: 'Three by heart',
    detail: 'Practise three different algorithms, one clean go each.',
    to: '/algorithms',
    color: 'red',
    icon: 'cards',
    target: 3,
    unit: ['algorithm', 'algorithms'],
    offered: (level) => level.stagesDone >= 2,
    advance: (type, payload, state) => {
      const id = typeof payload.algorithmId === 'string' ? payload.algorithmId : ''
      if (type !== 'algorithm-practised' || !id || state.items.includes(id)) return null
      return { count: state.items.length + 1, item: id }
    },
  },
  {
    id: 'solve-1',
    title: 'One full solve',
    detail: 'Scramble a cube and solve it all the way, in Free play or on the timer.',
    to: '/play',
    color: 'green',
    icon: 'cube',
    target: 1,
    unit: ['solve', 'solves'],
    offered: (level) => level.solver,
    advance: (type) => (type === 'solve-completed' ? { count: 1 } : null),
  },
  {
    id: 'timed-3',
    title: 'Three on the clock',
    detail: 'Do three timed solves, however long they take.',
    to: '/timer',
    color: 'red',
    icon: 'timer',
    target: 3,
    unit: ['timed solve', 'timed solves'],
    // Three whole solves in a sitting is for someone who knows the whole method.
    offered: (level) => level.graduate,
    advance: (type, payload, state) => (type === 'solve-completed' && payload.context === 'timer' && num(payload.ms) > 0 ? plusOne(state) : null),
  },
  {
    id: 'real-cube',
    title: 'Bring your own cube',
    detail: 'Enter your real cube and follow the guided solve to the end.',
    to: '/solve',
    color: 'yellow',
    icon: 'wand',
    target: 1,
    unit: ['real cube', 'real cubes'],
    offered: (level) => level.graduate,
    advance: (type) => (type === 'real-cube-solved' ? { count: 1 } : null),
  },
]

const defById = new Map(DEFS.map((def) => [def.id, def]))

const NOBODY: DailyPlayer = { lessons: {}, counters: {} }

const resolve = (def: DailyDef, player: DailyPlayer): DailyChallenge => ({
  id: def.id,
  title: def.title,
  detail: def.detail,
  to: typeof def.to === 'function' ? def.to(player) : def.to,
  color: def.color,
  icon: def.icon,
  target: def.target,
  unit: def.unit,
})

/** Every challenge in the rotation (links resolved for a brand-new player). */
export const DAILY_CHALLENGES: readonly DailyChallenge[] = DEFS.map((def) => resolve(def, NOBODY))

/** The challenges on offer to this player today. Never empty. */
export function eligibleChallenges(player: DailyPlayer = NOBODY): DailyChallenge[] {
  const level = playerLevel(player)
  return DEFS.filter((def) => def.offered(level)).map((def) => resolve(def, player))
}

export const getDailyChallenge = (id: string, player: DailyPlayer = NOBODY): DailyChallenge | undefined => {
  const def = defById.get(id)
  return def ? resolve(def, player) : undefined
}

/** Small stable hash, so the order looks random but never changes. */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Days since 1970 for a date key, as a pure calendar day (no time zones involved). */
function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  const n = Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
  return Number.isFinite(n) ? n : 0
}

/** The pool in a shuffled order for one cycle (a cycle is `size` days long). */
function cycleOrder(size: number, cycle: number): number[] {
  const order = Array.from({ length: size }, (_, i) => i)
  let seed = hash(`rubikku-daily:${size}:${cycle}`)
  for (let i = size - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/**
 * The challenge for a day. Stable for the whole day. The pool is dealt like a deck: every
 * challenge on offer comes up once before any repeats, and never the same one two days running.
 */
export function challengeForDate(dateKey: string, player: DailyPlayer = NOBODY): DailyChallenge {
  const pool = eligibleChallenges(player)
  const size = pool.length
  if (size === 1) return pool[0]
  const day = dayNumber(dateKey)
  const cycle = Math.floor(day / size)
  const order = cycleOrder(size, cycle)
  // If this deal starts with the card the last deal ended on, swap its first two.
  const previous = cycleOrder(size, cycle - 1)
  if (order[0] === previous[size - 1]) [order[0], order[1]] = [order[1], order[0]]
  return pool[order[((day % size) + size) % size]]
}

/** A fresh, untouched challenge for the day. */
export const startDaily = (dateKey: string, player: DailyPlayer = NOBODY): DailyState => ({
  date: dateKey,
  id: challengeForDate(dateKey, player).id,
  count: 0,
  items: [],
})

/**
 * Today's challenge state: the saved one when it belongs to today, else a fresh pick (the
 * roll-over at midnight). Pure — the caller decides whether to save it.
 */
export function dailyFor(saved: DailyState | null | undefined, dateKey: string, player: DailyPlayer = NOBODY): DailyState {
  if (saved && saved.date === dateKey && defById.has(saved.id)) return saved
  return startDaily(dateKey, player)
}

/** Feed one event to the challenge. Returns the same object when nothing changed. */
export function advanceDaily(state: DailyState, type: string, payload: unknown): DailyState {
  const def = defById.get(state.id)
  if (!def || state.count >= def.target) return state
  const step = def.advance(type, (payload ?? {}) as Record<string, unknown>, state)
  if (!step) return state
  const count = Math.min(def.target, Math.max(state.count, step.count))
  const items = step.item ? [...state.items, step.item] : state.items
  return count === state.count && items === state.items ? state : { ...state, count, items }
}

export const dailyTarget = (id: string): number => defById.get(id)?.target ?? 1
export const isDailyComplete = (state: DailyState): boolean => state.count >= dailyTarget(state.id)

/** Rebuild a saved challenge state from anything; null when it is not usable. */
export function sanitizeDaily(input: unknown): DailyState | null {
  if (typeof input !== 'object' || input === null) return null
  const raw = input as Record<string, unknown>
  if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null
  if (typeof raw.id !== 'string' || !defById.has(raw.id)) return null
  const target = dailyTarget(raw.id)
  const items = Array.isArray(raw.items) ? [...new Set(raw.items.filter((v): v is string => typeof v === 'string' && v.length < 80))].slice(0, 20) : []
  const count = Math.min(target, Math.max(0, Math.floor(num(raw.count))))
  return { date: raw.date, id: raw.id, count, items }
}
