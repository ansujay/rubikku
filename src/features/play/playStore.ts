import { createPersistedStore, isRecord } from '../../store'
import { sanitizeSession, type CubeSession } from '../../three'

export interface PlayState {
  /** The free-play cube: state, undo/redo history and any half-played algorithm. */
  session: CubeSession | null
  /**
   * The cube has been properly mixed up since it was last solved — by the Scramble button or by
   * hand — so solving it is worth celebrating (once). Cleared whenever the cube is solved.
   */
  scrambled: boolean
  /** Turns he has made himself since then (a solve is his when at least half of the turns were). */
  ownMoves: number
  /** Keep the mirror view of the hidden faces on. */
  mirrors: boolean
  /** What is typed in the "type some moves" box. */
  algText: string

  setSession: (session: CubeSession) => void
  /** Set or clear `scrambled`; the count of his own turns starts over (or from `ownMoves`). */
  setScrambled: (scrambled: boolean, ownMoves?: number) => void
  countOwnMove: () => void
  setMirrors: (mirrors: boolean) => void
  setAlgText: (text: string) => void
}

export const usePlay = createPersistedStore<PlayState>(
  {
    name: 'play',
    version: 1,
    migrate: (saved) => saved,
    sanitize: (saved) => {
      if (!isRecord(saved)) return {}
      const out: Partial<PlayState> = {}
      const session = sanitizeSession(saved.session)
      if (session) out.session = session
      if (typeof saved.scrambled === 'boolean') out.scrambled = saved.scrambled
      if (typeof saved.ownMoves === 'number' && Number.isFinite(saved.ownMoves) && saved.ownMoves >= 0) out.ownMoves = Math.min(1_000_000, Math.floor(saved.ownMoves))
      if (typeof saved.mirrors === 'boolean') out.mirrors = saved.mirrors
      if (typeof saved.algText === 'string') out.algText = saved.algText.slice(0, 400)
      return out
    },
  },
  (set) => ({
    session: null,
    scrambled: false,
    ownMoves: 0,
    mirrors: false,
    algText: '',

    setSession: (session) => set({ session }),
    setScrambled: (scrambled, ownMoves = 0) => set({ scrambled, ownMoves }),
    countOwnMove: () => set((s) => ({ ownMoves: s.ownMoves + 1 })),
    setMirrors: (mirrors) => set({ mirrors }),
    setAlgText: (algText) => set({ algText }),
  }),
)
