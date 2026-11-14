/**
 * Saved timer state: the solve history, the scramble on screen (with a short back-stack so
 * "previous scramble" works after a reload) and the inspection setting.
 *
 * A running attempt is deliberately *not* saved: reloading mid-solve discards it.
 */
import { algToString, randomScramble } from '../../cube'
import { createPersistedStore, isRecord } from '../../store'
import { isPenalty, sanitizeSolves, type Penalty, type Solve } from './logic/solves'

/** Oldest solves beyond this are dropped. */
export const MAX_SOLVES = 2000
const MAX_SCRAMBLES = 30

export interface TimerState {
  /** Chronological: oldest first, newest last. */
  solves: Solve[]
  /** Recent scrambles; `scrambleIndex` points at the one on screen. */
  scrambles: string[]
  scrambleIndex: number
  /** Use the 15-second WCA inspection countdown. */
  inspection: boolean

  addSolve: (solve: { ms: number; penalty: Penalty }) => Solve
  setPenalty: (id: string, penalty: Penalty) => void
  deleteSolve: (id: string) => void
  clearSolves: () => void
  nextScramble: () => void
  previousScramble: () => void
  setInspection: (on: boolean) => void
}

export const newScramble = (): string => algToString(randomScramble())

let counter = 0
const newId = (): string => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const advance = (scrambles: string[], index: number): { scrambles: string[]; scrambleIndex: number } => {
  if (index < scrambles.length - 1) return { scrambles, scrambleIndex: index + 1 }
  const grown = [...scrambles, newScramble()].slice(-MAX_SCRAMBLES)
  return { scrambles: grown, scrambleIndex: grown.length - 1 }
}

export const useTimer = createPersistedStore<TimerState>(
  {
    name: 'timer',
    version: 1,
    migrate: (saved) => saved,
    sanitize: (saved) => {
      if (!isRecord(saved)) return {}
      const out: Partial<TimerState> = { solves: sanitizeSolves(saved.solves, MAX_SOLVES) }
      const scrambles = Array.isArray(saved.scrambles)
        ? saved.scrambles.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length < 400).slice(-MAX_SCRAMBLES)
        : []
      if (scrambles.length > 0) {
        const index = typeof saved.scrambleIndex === 'number' && Number.isInteger(saved.scrambleIndex) ? saved.scrambleIndex : scrambles.length - 1
        out.scrambles = scrambles
        out.scrambleIndex = Math.min(scrambles.length - 1, Math.max(0, index))
      }
      if (typeof saved.inspection === 'boolean') out.inspection = saved.inspection
      return out
    },
  },
  (set, get) => ({
    solves: [],
    scrambles: [newScramble()],
    scrambleIndex: 0,
    inspection: false,

    addSolve: ({ ms, penalty }) => {
      const { scrambles, scrambleIndex, solves } = get()
      const solve: Solve = {
        id: newId(),
        ms: Math.max(0, Math.round(ms)),
        penalty: isPenalty(penalty) ? penalty : 'ok',
        scramble: scrambles[scrambleIndex] ?? '',
        at: new Date().toISOString(),
      }
      // A used scramble is done: drop the "future" ones and deal a fresh one.
      const used = scrambles.slice(0, scrambleIndex + 1)
      set({ solves: [...solves, solve].slice(-MAX_SOLVES), ...advance(used, used.length - 1) })
      return solve
    },
    // A solve with no time at all (inspection ran out before the start) can only ever be a DNF.
    setPenalty: (id, penalty) => set((s) => ({ solves: s.solves.map((solve) => (solve.id === id && isPenalty(penalty) && !(solve.ms === 0 && solve.penalty === 'dnf') ? { ...solve, penalty } : solve)) })),
    deleteSolve: (id) => set((s) => ({ solves: s.solves.filter((solve) => solve.id !== id) })),
    clearSolves: () => set({ solves: [] }),
    nextScramble: () => set((s) => advance(s.scrambles, s.scrambleIndex)),
    previousScramble: () => set((s) => ({ scrambleIndex: Math.max(0, s.scrambleIndex - 1) })),
    setInspection: (on) => set({ inspection: on }),
  }),
)

export const currentScramble = (state: Pick<TimerState, 'scrambles' | 'scrambleIndex'>): string => state.scrambles[state.scrambleIndex] ?? ''
