/** Which badges the player has already seen in the trophy room, so new ones can be revealed once. */
import { createPersistedStore, isRecord } from '../../store'

interface SeenState {
  seenBadges: string[]
  markSeen: (ids: readonly string[]) => void
}

export const useSeenBadges = createPersistedStore<SeenState>(
  {
    name: 'trophy-room',
    version: 1,
    migrate: (saved) => saved,
    sanitize: (saved) =>
      isRecord(saved) && Array.isArray(saved.seenBadges)
        ? { seenBadges: [...new Set(saved.seenBadges.filter((id): id is string => typeof id === 'string' && id.length < 80))].slice(0, 200) }
        : {},
  },
  (set) => ({
    seenBadges: [],
    markSeen: (ids) =>
      set((s) => {
        const next = new Set(s.seenBadges)
        for (const id of ids) next.add(id)
        return next.size === s.seenBadges.length ? s : { seenBadges: [...next] }
      }),
  }),
)
