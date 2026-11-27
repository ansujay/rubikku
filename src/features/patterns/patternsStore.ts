import { FLAGS, PATTERNS } from '../../cube'
import { createPersistedStore, isRecord } from '../../store'

export interface PatternsState {
  /** How far through "try it yourself" he is, per pattern id (moves done). */
  tryAt: Record<string, number>
  /** Which move "follow along" is showing, per pattern id. */
  followAt: Record<string, number>
  setTryAt: (id: string, index: number) => void
  setFollowAt: (id: string, index: number) => void
}

/** Everything with a saved place: the tricks and the curated flags. */
const MAKEABLE = [...PATTERNS, ...FLAGS]

function positions(saved: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(saved)) return out
  for (const pattern of MAKEABLE) {
    const value = saved[pattern.id]
    if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= pattern.moves.length) out[pattern.id] = value
  }
  return out
}

export const usePatterns = createPersistedStore<PatternsState>(
  {
    name: 'patterns',
    // v2: flag ids (`flag-…`) are kept too. The shape did not change, so old saves pass through.
    version: 2,
    migrate: (saved) => saved,
    sanitize: (saved) => (isRecord(saved) ? { tryAt: positions(saved.tryAt), followAt: positions(saved.followAt) } : {}),
  },
  (set, get) => ({
    tryAt: {},
    followAt: {},
    setTryAt: (id, index) => set({ tryAt: { ...get().tryAt, [id]: index } }),
    setFollowAt: (id, index) => set({ followAt: { ...get().followAt, [id]: index } }),
  }),
)
