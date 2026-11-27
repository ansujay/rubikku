/** Pure logic for the pattern gallery. */
import {
  CUBE_ROTATIONS,
  FLAGS,
  PATTERNS,
  SOLVED,
  applyAlg,
  centerColors,
  faceShows,
  flagStart,
  getFlag,
  getPattern,
  invertAlg,
  type Color,
  type CubeFlag,
  type CubePattern,
  type CubeState,
  type FaceGrid,
  type FaceSolution,
  type Move,
} from '../../cube'
import { countPatterns, DESIGNED_FLAG_ID } from '../../store'

/** The 24 ways of holding a cube that is in `state`. */
export const orientationsOf = (state: CubeState): CubeState[] => CUBE_ROTATIONS.map((rotation) => applyAlg(state, rotation))

/** True when `state` is `target`, however the whole cube is being held. */
export function matchesInAnyOrientation(state: CubeState, target: CubeState): boolean {
  if (state === target) return true
  return CUBE_ROTATIONS.some((rotation) => rotation.length > 0 && applyAlg(state, rotation) === target)
}

export const patternState = (pattern: Pick<CubePattern, 'moves'>): CubeState => applyAlg(SOLVED, pattern.moves)

/** True when the cube shows this pattern (in any orientation). */
export const showsPattern = (state: CubeState, pattern: Pick<CubePattern, 'moves'>): boolean => matchesInAnyOrientation(state, patternState(pattern))

/** The moves that undo a pattern: the same moves backwards, each one flipped. */
export const undoMoves = (pattern: Pick<CubePattern, 'moves'>): Move[] => invertAlg(pattern.moves)

export const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Tricky',
}

/** How many of the given ids are real patterns he has made. */
export function collectedCount(made: readonly string[], patterns: readonly Pick<CubePattern, 'id'>[]): number {
  const ids = new Set(made)
  return patterns.filter((pattern) => ids.has(pattern.id)).length
}

export type GalleryFilter = 'all' | 'todo' | 'made'

export function filterPatterns<T extends Pick<CubePattern, 'id'>>(patterns: readonly T[], made: readonly string[], filter: GalleryFilter): T[] {
  if (filter === 'all') return [...patterns]
  const ids = new Set(made)
  return patterns.filter((pattern) => ids.has(pattern.id) === (filter === 'made'))
}

// ───────────────────────── Things you can make ─────────────────────────

export type MakeableKind = 'trick' | 'flag' | 'design'

/**
 * Anything the detail page can teach: a trick from `PATTERNS`, a curated flag, or (later) a face
 * he designed himself. The page only ever reads these fields, so a new kind plugs in by building
 * one of these.
 */
export interface Makeable {
  /** Progress id: the pattern id, `flag-<name>`, or `flag-own` for a design. */
  id: string
  /** Key for the saved "try it" / "real cube" place. Defaults to `id`; each design has its own. */
  placeId?: string
  name: string
  description: string
  moves: readonly Move[]
  difficulty: 1 | 2 | 3
  kind: MakeableKind
  /** The cube before the first move: solved, held the way `holdLine` says. */
  start: CubeState
  /** True when the cube shows this thing. Only ever asked about the item on screen. */
  shows: (state: CubeState) => boolean
  /** "white on top and green facing you" — how to hold the solved cube first. */
  holdLine: string
  /** The front face it ends with (flags and designs). */
  grid?: FaceGrid
  /** The curated flag, for its real-flag art and notes. */
  flag?: CubeFlag
  /** Where the back arrow goes, and its accessible name. */
  back: { to: string; label: string }
}

/** How to hold a cube in `start`, in words: "white on top and blue facing you". */
export function holdWords(start: CubeState): string {
  const centres = centerColors(start)
  return `${centres.U} on top and ${centres.F} facing you`
}

/** The colours on top and in front, for drawing the hold. */
export function holdColors(start: CubeState): { top: Color; front: Color } {
  const centres = centerColors(start)
  return { top: centres.U, front: centres.F }
}

/** The cube once every move is done. */
export const makeableEnd = (item: Pick<Makeable, 'start' | 'moves'>): CubeState => applyAlg(item.start, item.moves)

export function fromPattern(pattern: CubePattern): Makeable {
  const target = patternState(pattern)
  return {
    id: pattern.id,
    name: pattern.name,
    description: pattern.description,
    moves: pattern.moves,
    difficulty: pattern.difficulty,
    kind: 'trick',
    start: SOLVED,
    shows: (state) => matchesInAnyOrientation(state, target),
    holdLine: holdWords(SOLVED),
    back: { to: '/patterns', label: 'All patterns' },
  }
}

export function fromFlag(flag: CubeFlag): Makeable {
  const start = flagStart(flag.hold)
  return {
    id: flag.id,
    name: flag.name,
    description: flag.description,
    moves: flag.moves,
    difficulty: flag.difficulty,
    kind: 'flag',
    start,
    shows: (state) => faceShows(state, flag.grid),
    holdLine: holdWords(start),
    grid: flag.grid,
    flag,
    back: { to: '/patterns?tab=flags', label: 'All flags' },
  }
}

const made = new Map<string, Makeable | null>()

/** The trick or flag with this id (the same object every time), or undefined. */
export function getMakeable(id: string): Makeable | undefined {
  if (!made.has(id)) {
    const pattern = getPattern(id)
    const flag = pattern ? undefined : getFlag(id)
    made.set(id, pattern ? fromPattern(pattern) : flag ? fromFlag(flag) : null)
  }
  return made.get(id) ?? undefined
}

/** The line under the "made it" card's title: where this one leaves his collection. */
export function collectionLine(item: Pick<Makeable, 'id' | 'kind'>, patterns: readonly string[]): string {
  const all = patterns.includes(item.id) ? patterns : [...patterns, item.id]
  const { tricks, flags } = countPatterns(all)
  if (item.kind === 'trick') return `${tricks} of ${PATTERNS.length} in your collection`
  if (item.kind === 'flag') return `${flags} of ${FLAGS.length} flags`
  return 'Your own flag, on your own cube'
}

// ───────────────────────── Your own design ─────────────────────────

const LETTER_COLOR: Record<string, Color> = { W: 'white', Y: 'yellow', R: 'red', O: 'orange', B: 'blue', G: 'green' }

/** A blank canvas: nine white stickers. */
export const BLANK_FACE = 'WWWWWWWWW'

/** A face as nine letters, row by row: "OOOWBWGGG". */
export const faceCode = (grid: readonly Color[]): string => grid.map((c) => c[0].toUpperCase()).join('')

/** The face for nine letters (any case), or null if it is not exactly nine of W Y R O B G. */
export function parseFaceCode(text: string | null | undefined): FaceGrid | null {
  if (typeof text !== 'string') return null
  const letters = text.trim().toUpperCase()
  if (!/^[WYROBG]{9}$/.test(letters)) return null
  return [...letters].map((l) => LETTER_COLOR[l]) as unknown as FaceGrid
}

/** True when all nine stickers are one colour: that is just a face of a solved cube. */
export const isPlainFace = (grid: readonly Color[]): boolean => grid.every((c) => c === grid[0])

/** Where a design's "try it" place is saved: one per face and move set. */
export const designPlaceId = (code: string, slices: boolean): string => `${DESIGNED_FLAG_ID}:${code}${slices ? '+s' : ''}`

/** The player for a design: shareable and reloadable. */
export const designLink = (code: string, slices: boolean): string => `/patterns/${DESIGNED_FLAG_ID}?face=${code}${slices ? '&slices=1' : ''}`

/** The designer, opened on a face. */
export const designerLink = (code: string, slices: boolean): string => `/patterns/design?face=${code}${slices ? '&slices=1' : ''}`

/** Rough difficulty from the length: up to 3 moves easy, up to 6 medium, else tricky. */
export const designDifficulty = (moves: number): 1 | 2 | 3 => (moves <= 3 ? 1 : moves <= 6 ? 2 : 3)

/** "7 moves. Hold it with white on top and red facing you." */
export function designResultLine(solution: FaceSolution): string {
  const n = solution.moves.length
  return `${n} ${n === 1 ? 'move' : 'moves'}. Hold it with ${holdWords(flagStart(solution.hold))}.`
}

/** The detail player's item for a face he painted, from the search's answer. */
export function designMakeable(grid: FaceGrid, solution: FaceSolution, slices: boolean): Makeable {
  const code = faceCode(grid)
  const start = flagStart(solution.hold)
  const moves = solution.moves
  return {
    id: DESIGNED_FLAG_ID,
    placeId: designPlaceId(code, slices),
    name: 'Your design',
    description: 'Your own picture, worked out just for you. Hold a solved cube the way it says, then do the moves.',
    moves,
    difficulty: designDifficulty(moves.length),
    kind: 'design',
    start,
    shows: (state) => faceShows(state, grid),
    holdLine: holdWords(start),
    grid,
    back: { to: designerLink(code, slices), label: 'Back to the designer' },
  }
}
