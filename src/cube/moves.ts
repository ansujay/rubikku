/**
 * Applying moves.
 *
 * Every move is a permutation of the 54 facelets. The permutations are not typed in by hand:
 * they are generated from the geometry in `geometry.ts` and the axis/layer/direction table in
 * `notation.ts`, by rotating sticker positions in 3D. The tests cross-check them against cubejs.
 */
import { FACELETS, faceletAtPosition, SLOT_POSITION, SLOTS, type Axis, type SlotId, type Vec3 } from './geometry'
import {
  ALL_MOVES,
  invertAlg,
  isRotation,
  MOVE_BASE_DEFS,
  moveAmount,
  moveBase,
  toAlg,
  type Alg,
  type Move,
  type MoveKind,
  type RotationMove,
} from './notation'
import { SOLVED, type CubeState } from './state'

/**
 * A facelet permutation: after applying it, facelet `j` shows what facelet `perm[j]` showed
 * before.
 */
export type Permutation = readonly number[]

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

/** Rotate a vector by `sign` * 90 degrees about an axis (right-hand rule about the positive axis). */
function rotateQuarter(v: Vec3, axis: Axis, sign: 1 | -1): Vec3 {
  const [x, y, z] = v
  // "+ 0" turns -0 into 0 so that lookup keys stay clean.
  if (axis === 'x') return sign === 1 ? [x, -z + 0, y] : [x, z, -y + 0]
  if (axis === 'y') return sign === 1 ? [z, y, -x + 0] : [-z + 0, y, x]
  return sign === 1 ? [-y + 0, x, z] : [y, -x + 0, z]
}

export const IDENTITY_PERMUTATION: Permutation = Array.from({ length: 54 }, (_, i) => i)

/** The permutation for "do `first`, then `second`". */
export function composePermutations(first: Permutation, second: Permutation): number[] {
  const out = new Array<number>(54)
  for (let j = 0; j < 54; j++) out[j] = first[second[j]]
  return out
}

export function invertPermutation(perm: Permutation): number[] {
  const out = new Array<number>(54)
  for (let j = 0; j < 54; j++) out[perm[j]] = j
  return out
}

function quarterTurnPermutation(axis: Axis, layers: readonly number[], sign: 1 | -1): number[] {
  const perm = IDENTITY_PERMUTATION.slice()
  const a = AXIS_INDEX[axis]
  for (const f of FACELETS) {
    if (!layers.includes(f.position[a])) continue
    const dest = faceletAtPosition(rotateQuarter(f.position, axis, sign), rotateQuarter(f.normal, axis, sign))
    perm[dest] = f.index
  }
  return perm
}

const MOVE_PERMUTATIONS: Readonly<Record<Move, Permutation>> = (() => {
  const table = {} as Record<Move, Permutation>
  for (const move of ALL_MOVES) {
    const def = MOVE_BASE_DEFS[moveBase(move)]
    const quarter = quarterTurnPermutation(def.axis, def.layers, def.sign)
    let perm: number[] = quarter
    for (let k = 1; k < moveAmount(move); k++) perm = composePermutations(perm, quarter)
    table[move] = perm
  }
  return table
})()

/** The facelet permutation of a single move. */
export function movePermutation(move: Move): Permutation {
  const perm = MOVE_PERMUTATIONS[move]
  if (!perm) throw new Error(`Unknown move: ${String(move)}`)
  return perm
}

/** The facelet permutation of a whole algorithm. */
export function algPermutation(alg: Alg | string): Permutation {
  let perm: Permutation = IDENTITY_PERMUTATION
  for (const move of toAlg(alg)) perm = composePermutations(perm, movePermutation(move))
  return perm
}

/** Apply a permutation to any 54-long array of stickers (used for painted, not-yet-valid cubes). */
export function permuteFacelets<T>(facelets: ArrayLike<T>, perm: Permutation): T[] {
  const out = new Array<T>(54)
  for (let j = 0; j < 54; j++) out[j] = facelets[perm[j]]
  return out
}

function applyPermutation(state: CubeState, perm: Permutation): CubeState {
  let out = ''
  for (let j = 0; j < 54; j++) out += state[perm[j]]
  return out as CubeState
}

/** Apply one move and return the new state. The input state is never changed. */
export function applyMove(state: CubeState, move: Move): CubeState {
  return applyPermutation(state, movePermutation(move))
}

/** Apply a sequence of moves (a list, or notation text such as "R U R' U'"). */
export function applyAlg(state: CubeState, alg: Alg | string): CubeState {
  const moves = toAlg(alg)
  if (moves.length === 0) return state
  if (moves.length === 1) return applyPermutation(state, movePermutation(moves[0]))
  // Compose the moves into one permutation first: numbers are much cheaper to shuffle than strings.
  let perm = movePermutation(moves[0])
  for (let k = 1; k < moves.length; k++) {
    const next = movePermutation(moves[k])
    const combined = new Array<number>(54)
    for (let j = 0; j < 54; j++) combined[j] = perm[next[j]]
    perm = combined
  }
  return applyPermutation(state, perm)
}

/** The state you get by doing `alg` on a solved cube. */
export function stateFromAlg(alg: Alg | string): CubeState {
  return applyAlg(SOLVED, alg)
}

/**
 * Every state passed through while performing `alg`, starting with `state` itself
 * (so the result has `alg.length + 1` entries). Handy for step-by-step playback.
 */
export function algStates(state: CubeState, alg: Alg | string): CubeState[] {
  const out = [state]
  let s = state
  for (const move of toAlg(alg)) {
    s = applyMove(s, move)
    out.push(s)
  }
  return out
}

/** How many times `alg` must be repeated before the cube returns to where it started. */
export function algOrder(alg: Alg | string): number {
  const perm = algPermutation(alg)
  const seen = new Array<boolean>(54).fill(false)
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  let order = 1
  for (let i = 0; i < 54; i++) {
    if (seen[i]) continue
    let len = 0
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true
      len++
    }
    order = (order * len) / gcd(order, len)
  }
  return order
}

export interface MoveLayer {
  move: Move
  kind: MoveKind
  /** Axis the layer turns about: x = through R/L, y = through U/D, z = through F/B. */
  axis: Axis
  /** Which layers along that axis turn: any of -1, 0, 1 (1 is the R / U / F side). */
  layers: readonly number[]
  /**
   * Signed rotation in radians about the *positive* axis, right-hand rule — pass it straight to
   * three.js (`rotateOnWorldAxis`). R is -PI/2, R' is +PI/2, R2 is -PI (it turns the way R does).
   */
  angle: number
  /** The same rotation in quarter turns: -1, +1, -2 or +2. */
  quarterTurns: number
  /** The slots (cubie positions) that move, including centres. */
  slots: readonly SlotId[]
}

const MOVE_LAYERS: Readonly<Record<Move, MoveLayer>> = (() => {
  const table = {} as Record<Move, MoveLayer>
  for (const move of ALL_MOVES) {
    const def = MOVE_BASE_DEFS[moveBase(move)]
    const amount = moveAmount(move)
    const quarterTurns = amount === 1 ? def.sign : amount === 3 ? -def.sign : 2 * def.sign
    const a = AXIS_INDEX[def.axis]
    table[move] = {
      move,
      kind: def.kind,
      axis: def.axis,
      layers: def.layers,
      angle: (quarterTurns * Math.PI) / 2,
      quarterTurns,
      slots: SLOTS.filter((s) => def.layers.includes(SLOT_POSITION[s][a])),
    }
  }
  return table
})()

/**
 * What physically turns for a move: the axis, the layers, the signed angle and the slots in the
 * turning layer. This is everything the 3D view needs to animate the move.
 */
export function moveLayer(move: Move): MoveLayer {
  const layer = MOVE_LAYERS[move]
  if (!layer) throw new Error(`Unknown move: ${String(move)}`)
  return layer
}

/** True if the cubie at `position` (coordinates -1/0/1) is carried along by `move`. */
export function isPositionInMove(position: Vec3, move: Move): boolean {
  const layer = moveLayer(move)
  return layer.layers.includes(position[AXIS_INDEX[layer.axis]])
}

// ---------------------------------------------------------------------------------------------
// Whole-cube orientation
// ---------------------------------------------------------------------------------------------

/**
 * The 24 ways of holding the cube, each as the shortest rotation sequence that gets there from
 * the standard orientation. The first entry is the empty sequence.
 */
export const CUBE_ROTATIONS: readonly (readonly RotationMove[])[] = (() => {
  const rotationMoves = ALL_MOVES.filter(isRotation)
  const seen = new Map<CubeState, RotationMove[]>([[SOLVED, []]])
  let frontier: CubeState[] = [SOLVED]
  while (frontier.length) {
    const next: CubeState[] = []
    for (const s of frontier) {
      for (const m of rotationMoves) {
        const t = applyMove(s, m)
        if (!seen.has(t)) {
          seen.set(t, [...seen.get(s)!, m])
          next.push(t)
        }
      }
    }
    frontier = next
  }
  return [...seen.values()]
})()

const ROTATION_BY_CENTERS: ReadonlyMap<string, readonly RotationMove[]> = new Map(
  CUBE_ROTATIONS.map((rot) => [centersKey(applyAlg(SOLVED, rot)), invertAlg(rot) as RotationMove[]]),
)

function centersKey(facelets: ArrayLike<unknown>): string {
  let key = ''
  for (let f = 0; f < 6; f++) key += String(facelets[f * 9 + 4])
  return key
}

/**
 * The rotation sequence that brings the cube back to the standard orientation (white centre up,
 * green centre front): `applyAlg(state, uprightRotation(state))` is upright.
 * Returns null if the centres are not a possible arrangement (only for unvalidated input).
 */
export function uprightRotation(state: CubeState | ArrayLike<string>): readonly RotationMove[] | null {
  return ROTATION_BY_CENTERS.get(centersKey(state)) ?? null
}

export interface UprightCube {
  /** The same cube, turned to the standard orientation. */
  state: CubeState
  /** The whole-cube rotations that were applied to get there (empty if already upright). */
  rotation: readonly RotationMove[]
}

/** Turn the whole cube so that white is up and green is in front. */
export function toUpright(state: CubeState): UprightCube {
  const rotation = uprightRotation(state)
  if (!rotation) throw new Error('The centres of this cube are not a possible arrangement')
  return { state: applyAlg(state, rotation), rotation }
}

function samePermutation(a: Permutation, b: Permutation): boolean {
  for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false
  return true
}

const CONJUGATE_CACHE = new Map<string, Map<Move, Move>>()

/**
 * Rewrite an algorithm so that it can be done *without* first rotating the cube.
 *
 * `rotateAlg(alg, rotation)` does the same thing as "rotation, then alg, then undo the
 * rotation". Example: `rotateAlg("R U R' U'", "y")` is "B U B' U'" — the same trigger performed
 * on the face that `y` would have brought to the right.
 */
export function rotateAlg(alg: Alg | string, rotation: Alg | string): Move[] {
  const rot = toAlg(rotation)
  if (rot.some((m) => !isRotation(m))) throw new Error('rotateAlg: the second argument must contain only x, y, z moves')
  const key = rot.join(' ')
  let map = CONJUGATE_CACHE.get(key)
  if (!map) {
    map = new Map()
    const r = algPermutation(rot)
    const rInv = invertPermutation(r)
    for (const move of ALL_MOVES) {
      const target = composePermutations(composePermutations(r, movePermutation(move)), rInv)
      const match = ALL_MOVES.find((m) => moveBaseKind(m) === moveBaseKind(move) && samePermutation(movePermutation(m), target))
      map.set(move, match!)
    }
    CONJUGATE_CACHE.set(key, map)
  }
  return toAlg(alg).map((m) => map.get(m)!)
}

function moveBaseKind(move: Move): MoveKind {
  return MOVE_BASE_DEFS[moveBase(move)].kind
}

/**
 * Remove whole-cube rotations from an algorithm by re-expressing the moves after each rotation.
 * Returns the rotation-free moves plus the net rotation, so that
 * `alg` ≡ `moves` followed by `rotation`.
 */
export function withoutRotations(alg: Alg | string): { moves: Move[]; rotation: readonly RotationMove[] } {
  const moves: Move[] = []
  let pending: RotationMove[] = []
  for (const move of toAlg(alg)) {
    if (isRotation(move)) pending.push(move)
    else moves.push(...rotateAlg([move], pending))
  }
  // Collapse the accumulated rotations to their canonical short form.
  const net = invertAlg(uprightRotation(applyAlg(SOLVED, pending))!) as RotationMove[]
  pending = net
  return { moves, rotation: pending }
}
