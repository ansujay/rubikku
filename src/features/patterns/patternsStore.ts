import { FLAGS, PATTERNS } from '../../cube'
import { createPersistedStore, DESIGNED_FLAG_ID, isRecord } from '../../store'
import { BLANK_FACE } from './logic'

/** The face on the "Make your own" designer, and whether its moves may use the middle slices. */
export interface SavedDesign {
  /** Nine letters of W Y R O B G, row by row: "OOOWBWGGG". */
  face: string
  slices: boolean
}

export interface PatternsState {
  /** How far through "try it yourself" he is, per pattern id (moves done). */
  tryAt: Record<string, number>
  /** Which move "follow along" is showing, per pattern id. */
  followAt: Record<string, number>
  /** What is on the designer, so it is still there next time. */
  design: SavedDesign
  setTryAt: (id: string, index: number) => void
  setFollowAt: (id: string, index: number) => void
  setDesign: (design: Partial<SavedDesign>) => void
}

export const DEFAULT_DESIGN: SavedDesign = { face: BLANK_FACE, slices: false }

/** Everything with a saved place: the tricks and the curated flags. */
const MAKEABLE = [...PATTERNS, ...FLAGS]

/** A design's place key: `flag-own:<nine letters>`, plus `+s` when it uses the middle slices. */
const DESIGN_PLACE = new RegExp(`^${DESIGNED_FLAG_ID}:[WYROBG]{9}(\\+s)?$`)
/** No face needs more moves than this (the search finds at most 8 with face turns). */
const DESIGN_MAX_MOVES = 20
export const isDesignPlace = (id: string): boolean => DESIGN_PLACE.test(id)
const isFace = (value: unknown): value is string => typeof value === 'string' && /^[WYROBG]{9}$/.test(value)

function positions(saved: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(saved)) return out
  const fits = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max
  for (const pattern of MAKEABLE) {
    const value = saved[pattern.id]
    if (fits(value, pattern.moves.length)) out[pattern.id] = value
  }
  for (const [id, value] of Object.entries(saved)) if (isDesignPlace(id) && fits(value, DESIGN_MAX_MOVES)) out[id] = value
  return out
}

function sanitizeDesign(saved: unknown): SavedDesign {
  if (!isRecord(saved) || !isFace(saved.face)) return DEFAULT_DESIGN
  return { face: saved.face, slices: saved.slices === true }
}

/** Set one place. Only the newest design keeps a place, so old designs never pile up. */
function place(map: Record<string, number>, id: string, index: number): Record<string, number> {
  const next = { ...map }
  if (isDesignPlace(id)) for (const key of Object.keys(next)) if (isDesignPlace(key)) delete next[key]
  next[id] = index
  return next
}

export const usePatterns = createPersistedStore<PatternsState>(
  {
    name: 'patterns',
    // v2: flag ids (`flag-…`) are kept too. v3: the designer's face, and design places
    // (`flag-own:…`). The shape only grew, so old saves pass through.
    version: 3,
    migrate: (saved) => saved,
    sanitize: (saved) => (isRecord(saved) ? { tryAt: positions(saved.tryAt), followAt: positions(saved.followAt), design: sanitizeDesign(saved.design) } : {}),
  },
  (set, get) => ({
    tryAt: {},
    followAt: {},
    design: DEFAULT_DESIGN,
    setTryAt: (id, index) => set({ tryAt: place(get().tryAt, id, index) }),
    setFollowAt: (id, index) => set({ followAt: place(get().followAt, id, index) }),
    setDesign: (design) => {
      const next = { ...get().design, ...design }
      set({ design: isFace(next.face) ? next : { ...next, face: DEFAULT_DESIGN.face } })
    },
  }),
)
