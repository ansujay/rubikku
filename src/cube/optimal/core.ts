/**
 * Synchronous heart of the short-solution solver. This file imports cubejs and builds its big
 * lookup tables, so it must only ever be loaded inside the worker (or lazily in Node/tests) —
 * never import it from UI code. Use `solveOptimal` from `optimalSolver.ts` instead.
 */
import Cube from 'cubejs/lib/cube.js'
import solveSource from 'cubejs/lib/solve.js?raw'
import { applyMove, rotateAlg, toUpright } from '../moves'
import { FACE_MOVES, invertMove, moveBase, parseAlg, type FaceMove } from '../notation'
import { isSolved, SOLVED, type CubeState } from '../state'
import { validateCube } from '../validate'

// cubejs' solver file reads `this.Cube` at its top level. That works under Node's CommonJS
// loader, but once a bundler wraps the file as a strict-mode ES module `this` is undefined and
// it throws. So the solver source is loaded as text and run with an explicit `this`; it then
// attaches `initSolver` / `solve` to the Cube class exactly as it would have on its own.
new Function(solveSource).call({ Cube })

let tablesReady = false

/** Build the Kociemba tables (takes a few seconds the first time; instant afterwards). */
export function initSolverSync(): void {
  if (tablesReady) return
  Cube.initSolver()
  tablesReady = true
}

export function isSolverReady(): boolean {
  return tablesReady
}

/** How far from solved the exact search looks backwards / forwards. */
const NEAR_DEPTH = 3
const FORWARD_DEPTH = 4

/** Every upright state within NEAR_DEPTH face turns of solved, with the moves that solve it. */
let nearSolved: Map<CubeState, FaceMove[]> | null = null

function buildNearSolved(): Map<CubeState, FaceMove[]> {
  const table = new Map<CubeState, FaceMove[]>([[SOLVED, []]])
  let frontier: CubeState[] = [SOLVED]
  for (let depth = 0; depth < NEAR_DEPTH; depth++) {
    const next: CubeState[] = []
    for (const s of frontier) {
      const path = table.get(s)!
      for (const m of FACE_MOVES) {
        const t = applyMove(s, m)
        if (table.has(t)) continue
        // We reached t from s by m, so t is solved by undoing m and then solving s.
        table.set(t, [invertMove(m) as FaceMove, ...path])
        next.push(t)
      }
    }
    frontier = next
  }
  return table
}

/**
 * Exact shortest solution for cubes at most NEAR_DEPTH + FORWARD_DEPTH (7) face turns from
 * solved; null if the cube is further away than that.
 */
export function solveShallow(upright: CubeState): FaceMove[] | null {
  nearSolved ??= buildNearSolved()
  const table = nearSolved
  let best: FaceMove[] | null = null
  const path: FaceMove[] = []
  const visit = (state: CubeState, depth: number) => {
    const rest = table.get(state)
    if (rest && (!best || path.length + rest.length < best.length)) best = [...path, ...rest]
    if (depth === FORWARD_DEPTH) return
    // No point going deeper if even a perfect continuation cannot beat the best so far.
    if (best && path.length + 1 >= best.length) return
    const last = path.length ? moveBase(path[path.length - 1]) : null
    for (const m of FACE_MOVES) {
      if (moveBase(m) === last) continue
      path.push(m)
      visit(applyMove(state, m), depth + 1)
      path.pop()
    }
  }
  visit(upright, 0)
  return best
}

/**
 * A short solution (face turns only) for any solvable cube, in whatever orientation it is held.
 * The moves are written for the cube *as held* — no whole-cube rotations are needed — and leave
 * it solved in that same orientation.
 *
 * Cubes up to 7 moves from solved get a truly shortest solution; anything else gets a Kociemba
 * two-phase solution of at most 22 moves (usually 18–21).
 */
export function solveSync(state: CubeState): FaceMove[] {
  const check = validateCube(state)
  if (!check.ok) {
    throw new Error(`This cube cannot be solved: ${check.problems.map((p) => p.message).join(' ')}`)
  }
  if (isSolved(state)) return []
  const { state: upright, rotation } = toUpright(state)
  let solution = solveShallow(upright)
  if (!solution) {
    initSolverSync()
    solution = parseAlg(Cube.fromString(upright).solve()) as FaceMove[]
  }
  return (rotation.length ? rotateAlg(solution, rotation) : solution) as FaceMove[]
}
