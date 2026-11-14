/**
 * Scrambles and random numbers.
 *
 * All randomness goes through an injectable `Rng` so tests are deterministic and the daily
 * challenge can be seeded from the date.
 */
import { CORNERS, EDGES } from './geometry'
import { FACE_MOVE_BASES, MOVE_BASE_DEFS, type FaceMove, type FaceMoveBase, type MoveSuffix } from './notation'
import { fromCubieArrays, permutationParity } from './pieces'
import type { CubeState } from './state'

/** A random number source: returns a number in [0, 1), like `Math.random`. */
export type Rng = () => number

function hashString(text: string): number {
  // FNV-1a, 32 bit.
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * A small, fast, repeatable random number generator (mulberry32).
 * The same seed (number or string) always gives the same sequence.
 */
export function seededRng(seed: number | string): Rng {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomInt(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng() * n))
}

export interface ScrambleOptions {
  /** Number of moves (default 20). */
  length?: number
  /** Random source (default `Math.random`). */
  rng?: Rng
}

const SUFFIXES: readonly MoveSuffix[] = ['', "'", '2']

/**
 * A random-move scramble of face turns (default 20 moves).
 * It never turns the same face twice in a row (no "R R'") and never returns to a face after
 * only its opposite face ("R L R"), so no move is wasted.
 */
export function randomScramble(options: ScrambleOptions = {}): FaceMove[] {
  const length = options.length ?? 20
  const rng = options.rng ?? Math.random
  const out: FaceMove[] = []
  let last = null as FaceMoveBase | null
  let beforeLast = null as FaceMoveBase | null
  while (out.length < length) {
    // Choose only among faces that would not waste a move, so any rng terminates.
    const allowed = FACE_MOVE_BASES.filter((face) => {
      if (face === last) return false
      return !(last && beforeLast === face && MOVE_BASE_DEFS[last].axis === MOVE_BASE_DEFS[face].axis)
    })
    const face = allowed[randomInt(rng, allowed.length)]
    out.push(`${face}${SUFFIXES[randomInt(rng, 3)]}` as FaceMove)
    beforeLast = last
    last = face
  }
  return out
}

/** Local calendar date as "YYYY-MM-DD" — the key for the daily challenge. */
export function dateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * The scramble of the day: everyone gets the same one on the same calendar date.
 * Pass a `Date` or a "YYYY-MM-DD" key.
 */
export function dailyScramble(date: Date | string = new Date(), length = 20): FaceMove[] {
  const key = typeof date === 'string' ? date : dateKey(date)
  return randomScramble({ length, rng: seededRng(`rubikku-daily-${key}`) })
}

function shuffled(n: number, rng: Rng): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * A uniformly random *solvable* cube in standard orientation (every reachable position is
 * equally likely). Good for solver tests and "random case" drills.
 */
export function randomState(rng: Rng = Math.random): CubeState {
  const cp = shuffled(CORNERS.length, rng)
  const ep = shuffled(EDGES.length, rng)
  if (permutationParity(cp) !== permutationParity(ep)) [ep[0], ep[1]] = [ep[1], ep[0]]
  const co = cp.map(() => randomInt(rng, 3))
  co[7] = (300 - co.slice(0, 7).reduce((a, b) => a + b, 0)) % 3
  const eo = ep.map(() => randomInt(rng, 2))
  eo[11] = eo.slice(0, 11).reduce((a, b) => a + b, 0) % 2
  return fromCubieArrays({ cp, co, ep, eo })
}
