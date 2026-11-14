import { PATTERNS } from '../../cube'
import { createPersistedStore, isRecord } from '../../store'

export interface PatternsState {
  /** How far through "try it yourself" he is, per pattern id (moves done). */
  tryAt: Record<string, number>
  /** Which move "follow along" is showing, per pattern id. */
  followAt: Record<string, number>
  setTryAt: (id: string, index: number) => void
  setFollowAt: (id: string, index: number) => void
}

function positions(saved: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(saved)) return out
  for (const pattern of PATTERNS) {
    const value = saved[pattern.id]
    if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= pattern.moves.length) out[pattern.id] = value
  }
  return out
}

export const usePatterns = createPersistedStore<PatternsState>(
  {
    name: 'patterns',
    version: 1,
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
