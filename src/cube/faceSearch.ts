/**
 * One-face search: the shortest way to make a 3x3 picture (a flag, a smiley ...) on the front
 * face of a solved cube.
 *
 * The full-cube solvers need a whole 54-sticker goal; here only nine stickers matter. A picture
 * is "hold the solved cube like this, then do these moves": the search tries all 24 holds and
 * returns every shortest answer (up to a limit). The picture always ends upright on F.
 *
 * How it works. Instead of moving stickers forwards, it follows the nine front stickers
 * *backwards*: "which facelet must this sticker come from?". A sequence works when each of the
 * nine starts on a facelet of the colour it should show. Turning the hold into a conjugation
 * (`rotateAlg`) means the goal never changes with the hold — only where the nine start — so two
 * distance tables per picture (four edge stickers + centre, four corner stickers + centre) serve
 * all 24 holds as an IDA* heuristic.
 *
 * Pure and synchronous. Face turns only: well under 0.1 s per picture; with middle slices
 * ~0.7 s, mostly building the two tables. Each table is cached on its own four colours, so a
 * one-sticker change rebuilds only one of them (or neither, for a centre with face turns).
 */
import { COLORS, FACE_COLOR, FACELETS, FACES, type Color } from './geometry'
import { algPermutation, applyAlg, CUBE_ROTATIONS, movePermutation, rotateAlg } from './moves'
import {
  FACE_MOVES,
  invertAlg,
  MOVE_BASE_DEFS,
  moveAmount,
  moveBase,
  SLICE_MOVE_BASES,
  type Move,
  type RotationMove,
} from './notation'
import { faceColors, SOLVED, type CubeState } from './state'

/** Nine sticker colours of a face, row by row (top row left to right first). */
export type FaceGrid = readonly [Color, Color, Color, Color, Color, Color, Color, Color, Color]

export interface FaceSolution {
  /** How to hold the solved cube first: one entry of `CUBE_ROTATIONS`. Start = `flagStart(hold)`. */
  hold: readonly RotationMove[]
  /** The moves, done as held. The picture ends on F, upright. */
  moves: Move[]
}

export interface FaceSearchOptions {
  /** Also use the middle slices M, E, S (default false: face turns only). */
  slices?: boolean
  /** Give up beyond this many moves (default 14; every picture needs far fewer). */
  maxDepth?: number
  /** Stop after this many shortest answers (default 32). */
  limit?: number
}

const SLICE_MOVES: readonly Move[] = SLICE_MOVE_BASES.flatMap((b) => [b, `${b}'`, `${b}2`] as Move[])

/** Front-face facelets 18..26 split by piece kind, in grid order. */
const F_EDGE_CELLS = [1, 3, 5, 7] as const
const F_CORNER_CELLS = [0, 2, 6, 8] as const
const F_CENTER_CELL = 4
const F_START = FACES.indexOf('F') * 9

/** Facelet numbers of each kind, and each facelet's position in its kind's list. */
const EDGE_FACELETS = FACELETS.filter((f) => f.kind === 'edge').map((f) => f.index)
const CORNER_FACELETS = FACELETS.filter((f) => f.kind === 'corner').map((f) => f.index)
const CENTER_FACELETS = FACELETS.filter((f) => f.kind === 'center').map((f) => f.index)
const LOCAL = new Array<number>(54)
for (const list of [EDGE_FACELETS, CORNER_FACELETS, CENTER_FACELETS]) list.forEach((f, i) => (LOCAL[f] = i))

/** Colour a facelet has on a solved cube held the standard way. */
const SOLVED_COLOR = FACELETS.map((f) => FACE_COLOR[f.face])
const SLOT_ID = new Map<string, number>()
/** A number per cubie, so that stickers on the same cubie can be told apart. */
const CUBIE_OF = FACELETS.map((f) => {
  if (!SLOT_ID.has(f.slot)) SLOT_ID.set(f.slot, SLOT_ID.size)
  return SLOT_ID.get(f.slot)!
})

interface MoveSet {
  moves: readonly Move[]
  /** next[m * 24 + p]: where a tracked sticker at local position p must come from before move m. */
  edgeNext: Uint8Array
  cornerNext: Uint8Array
  /** Same for the 6 centres (identity for face turns). */
  centerNext: Uint8Array
  axis: Uint8Array
  /** Order of the move's letter within its axis, for the canonical order of commuting moves. */
  axisOrder: Uint8Array
  base: Uint8Array
}

function buildMoveSet(moves: readonly Move[]): MoveSet {
  const n = moves.length
  const edgeNext = new Uint8Array(n * 24)
  const cornerNext = new Uint8Array(n * 24)
  const centerNext = new Uint8Array(n * 6)
  const axis = new Uint8Array(n)
  const axisOrder = new Uint8Array(n)
  const base = new Uint8Array(n)
  const bases: string[] = []
  moves.forEach((move, m) => {
    // Prepending move m to a sequence: the sticker that ends at x started at perm[x].
    const perm = movePermutation(move)
    for (let p = 0; p < 24; p++) {
      edgeNext[m * 24 + p] = LOCAL[perm[EDGE_FACELETS[p]]]
      cornerNext[m * 24 + p] = LOCAL[perm[CORNER_FACELETS[p]]]
    }
    for (let p = 0; p < 6; p++) centerNext[m * 6 + p] = LOCAL[perm[CENTER_FACELETS[p]]]
    const b = moveBase(move)
    if (!bases.includes(b)) bases.push(b)
    base[m] = bases.indexOf(b)
    const def = MOVE_BASE_DEFS[b]
    axis[m] = 'xyz'.indexOf(def.axis)
    // Within an axis: the face on the + side, the slice, the face on the - side.
    axisOrder[m] = def.kind === 'slice' ? 1 : def.layers[0] === 1 ? 0 : 2
  })
  return { moves, edgeNext, cornerNext, centerNext, axis, axisOrder, base }
}

const FACE_SET = buildMoveSet(FACE_MOVES)
const SLICE_SET = buildMoveSet([...FACE_MOVES, ...SLICE_MOVES])

interface Tables {
  /** Distance to the goal for the four edge stickers (+ centre when slices move it); -1 = never. */
  edge: Int8Array
  corner: Int8Array
  /** 6 when the centre is part of the index, 1 when it never moves. */
  centers: number
}

function indexOf(a: number, b: number, c: number, d: number, centers: number, ctr: number): number {
  return (((a * 24 + b) * 24 + c) * 24 + d) * centers + ctr
}

/**
 * Breadth-first distances from every goal arrangement of four stickers of one kind (each on a
 * facelet of its colour, on four different cubies) and the centre.
 */
function buildTable(
  next: Uint8Array,
  centerNext: Uint8Array,
  moveCount: number,
  kindFacelets: readonly number[],
  want: readonly Color[],
  centerWant: Color,
  centers: number,
): Int8Array {
  const size = 24 * 24 * 24 * 24 * centers
  const table = new Int8Array(size).fill(-1)
  const queue = new Int32Array(size)
  let tail = 0
  const options = want.map((color) => {
    const out: number[] = []
    for (let p = 0; p < 24; p++) if (SOLVED_COLOR[kindFacelets[p]] === color) out.push(p)
    return out
  })
  const centerGoal = centers === 1 ? 0 : CENTER_FACELETS.findIndex((f) => SOLVED_COLOR[f] === centerWant)
  const cubie = (p: number) => CUBIE_OF[kindFacelets[p]]
  for (const a of options[0]) {
    for (const b of options[1]) {
      if (cubie(b) === cubie(a)) continue
      for (const c of options[2]) {
        if (cubie(c) === cubie(a) || cubie(c) === cubie(b)) continue
        for (const d of options[3]) {
          if (cubie(d) === cubie(a) || cubie(d) === cubie(b) || cubie(d) === cubie(c)) continue
          const i = indexOf(a, b, c, d, centers, centerGoal)
          table[i] = 0
          queue[tail++] = i
        }
      }
    }
  }
  for (let head = 0; head < tail; head++) {
    const i = queue[head]
    const dist = table[i] + 1
    let r = i
    const ctr = r % centers
    r = (r - ctr) / centers
    const d = r % 24
    r = (r - d) / 24
    const c = r % 24
    r = (r - c) / 24
    const b = r % 24
    const a = (r - b) / 24
    for (let m = 0; m < moveCount; m++) {
      const o = m * 24
      const j = indexOf(next[o + a], next[o + b], next[o + c], next[o + d], centers, centers === 1 ? 0 : centerNext[m * 6 + ctr])
      if (table[j] < 0) {
        table[j] = dist
        queue[tail++] = j
      }
    }
  }
  return table
}

/**
 * Built tables, most recently used last. The edge and the corner table are cached apart, each
 * keyed by its own four colours (plus the centre, which only matters when slices move it), so
 * painting a corner sticker reuses the edge table and the other way round.
 */
const TABLE_CACHE = new Map<string, Int8Array>()
/** Eight tables: ~16 MB with slices (2 MB each), the same as four pictures' worth before. */
const TABLE_CACHE_SIZE = 8

/** The cache key of one table: kind, move set, its four colours and (with slices) the centre. */
export function tableKey(kind: 'edge' | 'corner', grid: FaceGrid, slices: boolean): string {
  const cells = kind === 'edge' ? F_EDGE_CELLS : F_CORNER_CELLS
  const colors = cells.map((k) => grid[k]).join(',')
  return `${kind}:${slices ? `s:${colors}:${grid[F_CENTER_CELL]}` : `f:${colors}`}`
}

let tablesBuilt = 0
/** How many distance tables have been built so far (tests use it to prove one was reused). */
export const faceSearchTablesBuilt = (): number => tablesBuilt

function cachedTable(key: string, build: () => Int8Array): Int8Array {
  const hit = TABLE_CACHE.get(key)
  if (hit) {
    // Refresh: most recently used last.
    TABLE_CACHE.delete(key)
    TABLE_CACHE.set(key, hit)
    return hit
  }
  const table = build()
  tablesBuilt++
  TABLE_CACHE.set(key, table)
  if (TABLE_CACHE.size > TABLE_CACHE_SIZE) TABLE_CACHE.delete(TABLE_CACHE.keys().next().value!)
  return table
}

function tablesFor(grid: FaceGrid, slices: boolean): Tables {
  const set = slices ? SLICE_SET : FACE_SET
  const centers = slices ? 6 : 1
  const n = set.moves.length
  const center = grid[F_CENTER_CELL]
  return {
    edge: cachedTable(tableKey('edge', grid, slices), () => buildTable(set.edgeNext, set.centerNext, n, EDGE_FACELETS, F_EDGE_CELLS.map((k) => grid[k]), center, centers)),
    corner: cachedTable(tableKey('corner', grid, slices), () => buildTable(set.cornerNext, set.centerNext, n, CORNER_FACELETS, F_CORNER_CELLS.map((k) => grid[k]), center, centers)),
    centers,
  }
}

function checkGrid(grid: FaceGrid): void {
  if (grid.length !== 9 || grid.some((c) => !COLORS.includes(c))) {
    throw new Error('A face grid must be nine colours')
  }
}

/** Lower numbers sort first: fewest slice moves, fewest half turns, simplest hold. */
function score(s: FaceSolution): number {
  let slices = 0
  let halves = 0
  for (const m of s.moves) {
    if (MOVE_BASE_DEFS[moveBase(m)].kind === 'slice') slices++
    if (moveAmount(m) === 2) halves++
  }
  return slices * 1000 + halves * 10 + s.hold.length
}

/**
 * Every shortest "hold, then moves" that shows `grid` on the front face of a solved cube, up to
 * `limit` of them, best first (fewest slice moves, then fewest half turns, then simplest hold).
 * Empty only if nothing is found within `maxDepth`.
 */
export function findFaceAlgs(grid: FaceGrid, opts: FaceSearchOptions = {}): FaceSolution[] {
  checkGrid(grid)
  const slices = opts.slices ?? false
  const maxDepth = opts.maxDepth ?? 14
  const limit = opts.limit ?? 32
  const set = slices ? SLICE_SET : FACE_SET
  const { edge, corner, centers } = tablesFor(grid, slices)
  const { edgeNext, cornerNext, centerNext, axis, axisOrder, base } = set
  const moveCount = set.moves.length

  // Where the nine front stickers start for each hold (in the hold's frame, see the header).
  const starts = CUBE_ROTATIONS.map((hold) => {
    const perm = algPermutation(hold)
    const at = (cell: number) => LOCAL[perm[F_START + cell]]
    return {
      hold,
      edges: F_EDGE_CELLS.map(at),
      corners: F_CORNER_CELLS.map(at),
      center: at(F_CENTER_CELL),
    }
  }).filter((s) => slices || SOLVED_COLOR[CENTER_FACELETS[s.center]] === grid[F_CENTER_CELL])

  const found: FaceSolution[] = []
  const path: number[] = []
  let hold: readonly RotationMove[] = []

  const dfs = (
    e0: number, e1: number, e2: number, e3: number,
    c0: number, c1: number, c2: number, c3: number,
    ctr: number, left: number, prev: number,
  ): void => {
    const ce = centers === 1 ? 0 : ctr
    const he = edge[indexOf(e0, e1, e2, e3, centers, ce)]
    const hc = corner[indexOf(c0, c1, c2, c3, centers, ce)]
    if (he < 0 || hc < 0 || he > left || hc > left) return
    if (left === 0) {
      // path[0] is the last move done: reverse it, then undo the conjugation by the hold.
      const frameMoves = path.map((m) => set.moves[m]).reverse()
      found.push({ hold, moves: rotateAlg(frameMoves, invertAlg(hold)) })
      return
    }
    for (let m = 0; m < moveCount; m++) {
      if (prev >= 0) {
        if (base[m] === base[prev]) continue
        // Moves on one axis commute: allow them in one order only.
        if (axis[m] === axis[prev] && axisOrder[m] < axisOrder[prev]) continue
      }
      const o = m * 24
      path.push(m)
      dfs(
        edgeNext[o + e0], edgeNext[o + e1], edgeNext[o + e2], edgeNext[o + e3],
        cornerNext[o + c0], cornerNext[o + c1], cornerNext[o + c2], cornerNext[o + c3],
        centerNext[m * 6 + ctr], left - 1, m,
      )
      path.pop()
      if (found.length >= limit) return
    }
  }

  for (let depth = 0; depth <= maxDepth; depth++) {
    for (const s of starts) {
      hold = s.hold
      const [e0, e1, e2, e3] = s.edges
      const [c0, c1, c2, c3] = s.corners
      dfs(e0, e1, e2, e3, c0, c1, c2, c3, s.center, depth, -1)
      if (found.length >= limit) break
    }
    if (found.length) break
  }
  return found.map((s, i) => ({ s, i })).sort((a, b) => score(a.s) - score(b.s) || a.i - b.i).map(({ s }) => s)
}

function rotateGrid(cells: readonly Color[]): Color[] {
  // Quarter turn clockwise: new (r, c) = old (2 - c, r).
  const out: Color[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(cells[(2 - c) * 3 + r])
  return out
}

/** True when some face of the cube shows `grid`, in any of its four quarter-turn rotations. */
export function faceShows(state: CubeState, grid: FaceGrid): boolean {
  let variants: Color[][] = [[...grid]]
  for (let k = 1; k < 4; k++) variants.push(rotateGrid(variants[k - 1]))
  variants = variants.filter((v, i) => variants.findIndex((w) => w.join() === v.join()) === i)
  for (const face of FACES) {
    const cells = faceColors(state, face)
    for (const v of variants) if (v.every((c, i) => c === cells[i])) return true
  }
  return false
}

/** The solved cube held as `hold` says: where a flag's moves start. */
export function flagStart(hold: readonly RotationMove[]): CubeState {
  return applyAlg(SOLVED, hold)
}
