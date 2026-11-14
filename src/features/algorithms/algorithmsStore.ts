import { ALGORITHMS } from '../../cube'
import { createPersistedStore, isRecord } from '../../store'
import { recordRep, type AlgStat, type Guidance } from './logic'

export interface AlgorithmsState {
  /** Practice numbers per algorithm id. */
  stats: Record<string, AlgStat>
  /** Most flash cards right in one go, and out of how many. */
  quizBest: number
  addRep: (id: string, rep: { clean: boolean; guidance: Guidance }) => void
  setQuizBest: (score: number) => void
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(1e6, Math.floor(value)) : 0)

export const useAlgorithms = createPersistedStore<AlgorithmsState>(
  {
    name: 'algorithms',
    version: 1,
    migrate: (saved) => saved,
    sanitize: (saved) => {
      if (!isRecord(saved)) return {}
      const stats: Record<string, AlgStat> = {}
      if (isRecord(saved.stats)) {
        for (const { id } of ALGORITHMS) {
          const stat = saved.stats[id]
          if (!isRecord(stat)) continue
          const reps = count(stat.reps)
          const clean = Math.min(reps, count(stat.clean))
          stats[id] = { reps, clean, blind: Math.min(clean, count(stat.blind)) }
        }
      }
      return { stats, quizBest: count(saved.quizBest) }
    },
  },
  (set, get) => ({
    stats: {},
    quizBest: 0,
    addRep: (id, rep) => set({ stats: { ...get().stats, [id]: recordRep(get().stats[id], rep) } }),
    setQuizBest: (score) => set({ quizBest: Math.max(get().quizBest, score) }),
  }),
)
