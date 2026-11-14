/** Pure logic for the pattern gallery. */
import { CUBE_ROTATIONS, SOLVED, applyAlg, invertAlg, type CubePattern, type CubeState, type Move } from '../../cube'

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

export const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = { 1: 'Easy', 2: 'Medium', 3: 'Tricky' }

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
