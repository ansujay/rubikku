/**
 * Following along while someone solves the cube by hand.
 *
 * The beginner solver and stage detection are only meaningful at *step boundaries*: one move
 * into any algorithm the lower layers are scrambled on purpose, and asking the solver about that
 * cube gets an answer for a cube that "has lost its daisy". So nothing in the app should analyse
 * the cube from scratch after every turn. This module is the one place that knows where the
 * learner is instead.
 *
 * Two layers, both pure and immutable (every function returns a new value):
 *
 * 1. **`PathTrack`** — follow a fixed list of moves from a known cube: `startPath`, `stepPath`.
 *    It works on states, not on notation, so it does not matter how a turn is made: a half turn
 *    may arrive as two quarter turns in either direction, and undoing a move by hand is the same
 *    as pressing Undo. Moves that leave the path are remembered (the "trail"), so the way back is
 *    always known. Use this for any scripted sequence (a lesson exercise, a Kociemba solution).
 *
 * 2. **`StepFollower`** — the same, with the plan coming from the beginner solver one step at a
 *    time: `startFollow`, `followMove`, `followState`, `askFollow`, `replanFollow`. After every
 *    move it knows whether the learner is on the step, half-way through a half turn, off it by N
 *    moves (and how to get back), has finished it (the next step is planned from the new
 *    boundary), or is genuinely somewhere else (a fresh plan from where the cube is now).
 *    `follower.view` is the cube to describe in a stage tracker or a "came undone" warning: the
 *    cube as it was at the last sound moment while he is correctly inside an algorithm, the cube
 *    as it is otherwise.
 *
 * See `followMove` for the rules, and `src/cube/__tests__/follow.test.ts` for what is promised.
 */
import { ALGORITHMS } from '../algorithms'
import { IDENTITY_PERMUTATION, algStates, applyMove, movePermutation, rotateAlg } from '../moves'
import { ALL_MOVES, invertAlg, invertMove, isRotation, mirrorAlg, moveAmount, moveBase, type Move } from '../notation'
import { isSolved, type CubeState } from '../state'
import { STAGE_IDS } from '../stages'
import { analyzeCube, detectTwistPhase, firstIncompleteStage } from './analyze'
import { nextBeginnerStep } from './solver'
import type { BeginnerSolverOptions, SolveStep } from './types'

// ---------------------------------------------------------------------------------------------
// Layer 1: following a fixed path
// ---------------------------------------------------------------------------------------------

/** Where the cube is on a fixed list of moves. Immutable; advance it with `stepPath`. */
export interface PathTrack {
  /** The path, as it reads in the current hold. */
  readonly moves: readonly Move[]
  /** `states[i]` is the cube after `i` moves of the path (`moves.length + 1` entries). */
  readonly states: readonly CubeState[]
  /** The cube now. */
  readonly state: CubeState
  /** Moves of the path that are done: 0 … moves.length. */
  readonly position: number
  /**
   * Set when the next move is a half turn and one quarter of it has been made: the quarter that
   * was made (make it once more to finish the half turn).
   */
  readonly half: Move | null
  /** Moves made since the cube left the path, oldest first. Empty while on the path. */
  readonly trail: readonly Move[]
  /** The cube after each move of `trail`. */
  readonly trailStates: readonly CubeState[]
}

export type PathStatus =
  /** On the path, with moves still to make. */
  | 'on'
  /** One quarter into a half turn. */
  | 'half'
  /** Off the path by `trail.length` moves. */
  | 'off'
  /** Every move of the path is done. */
  | 'done'

/** Start following `moves` from the cube `origin`. */
export function startPath(origin: CubeState, moves: readonly Move[]): PathTrack {
  return { moves: [...moves], states: algStates(origin, moves), state: origin, position: 0, half: null, trail: [], trailStates: [] }
}

export function pathStatus(track: PathTrack): PathStatus {
  if (track.trail.length > 0) return 'off'
  if (track.half) return 'half'
  return track.position >= track.moves.length ? 'done' : 'on'
}

/**
 * The single move to make now: the next move of the path; the same quarter again when half-way
 * through a half turn; the move that undoes the latest slip when off the path. Null when done.
 */
export function pathNext(track: PathTrack): Move | null {
  if (track.trail.length > 0) return invertMove(track.trail[track.trail.length - 1])
  if (track.half) return track.half
  return track.moves[track.position] ?? null
}

/** The moves that lead back to the path, in the order to make them (empty while on it). */
export function pathUndo(track: PathTrack): Move[] {
  return invertAlg(track.trail)
}

/** The moves still to make to finish the path from here (only meaningful while on it). */
export function pathRemaining(track: PathTrack): Move[] {
  const rest = track.moves.slice(track.position)
  if (track.half && rest.length > 0) rest[0] = track.half
  return rest
}

/** The point of the path the trail hangs from: a state of the path, or the half-way state. */
function baseState(track: PathTrack): CubeState {
  const at = track.states[track.position]
  return track.half ? applyMove(at, track.half) : at
}

/**
 * Index of `state` on the path, or -1. A path can pass through the same cube twice (an algorithm
 * repeated until it comes round), so the index nearest the current position wins, forwards first.
 */
function indexOnPath(track: PathTrack, state: CubeState): number {
  const { states, position } = track
  for (let d = 1; d <= states.length; d++) {
    if (position + d < states.length && states[position + d] === state) return position + d
    if (position - d >= 0 && states[position - d] === state) return position - d
  }
  return states[position] === state ? position : -1
}

/** The first quarter of the half turn at `position`, if `state` is exactly that; else null. */
function halfQuarter(track: PathTrack, state: CubeState): Move | null {
  const next = track.moves[track.position]
  if (!next || moveAmount(next) !== 2) return null
  const from = track.states[track.position]
  const base = moveBase(next)
  for (const quarter of [base, `${base}'`] as Move[]) if (applyMove(from, quarter) === state) return quarter
  return null
}

function landOnPath(track: PathTrack, state: CubeState, move: Move): PathTrack | null {
  // Finishing a half turn, or taking its first quarter back.
  if (track.trail.length === 0 && track.half) {
    if (state === track.states[track.position + 1]) return { ...track, state, position: track.position + 1, half: null }
    if (state === track.states[track.position]) return { ...track, state, half: null }
    return null
  }
  // On the trail, the half-way point it hangs from counts as "back".
  if (track.trail.length > 0 && state === baseState(track)) return { ...track, state, trail: [], trailStates: [] }
  // The ordinary case first: the very next move of the path, made as written.
  if (track.trail.length === 0 && track.moves[track.position] === move) return { ...track, state, position: track.position + 1 }
  const at = indexOnPath(track, state)
  if (at >= 0) return { ...track, state, position: at, half: null, trail: [], trailStates: [] }
  if (track.trail.length === 0) {
    const quarter = halfQuarter(track, state)
    if (quarter) return { ...track, state, half: quarter }
  }
  return null
}

function alongTrail(track: PathTrack, state: CubeState, move: Move): PathTrack {
  // Stepping back along the trail (by hand or with Undo) shortens it; anything else lengthens it.
  const seen = track.trailStates.indexOf(state)
  if (seen >= 0) return { ...track, state, trail: track.trail.slice(0, seen + 1), trailStates: track.trailStates.slice(0, seen + 1) }
  return { ...track, state, trail: [...track.trail, move], trailStates: [...track.trailStates, state] }
}

/**
 * The track after `move` is made on the cube. Never throws and never loses the way back:
 *  - the next move of the path (or any move that lands on a state of the path) → on the path;
 *  - one quarter of a half turn, either way → `half`; the same quarter again finishes it, the
 *    opposite quarter takes it back;
 *  - anything else → the trail grows; undoing the latest slip (by hand or with Undo) shrinks it.
 */
export function stepPath(track: PathTrack, move: Move): PathTrack {
  const state = applyMove(track.state, move)
  return landOnPath(track, state, move) ?? alongTrail(track, state, move)
}

/** `stepPath` for every move in `done`, from the start of the path. */
export function trackPath(origin: CubeState, moves: readonly Move[], done: readonly Move[]): PathTrack {
  let track = startPath(origin, moves)
  for (const move of done) track = stepPath(track, move)
  return track
}

/**
 * The same path after the whole cube has been turned by `rotation` part-way through: every move
 * is rewritten for the new hold, so the learner can simply carry on. Returns null when that is
 * not possible (off the path, half-way through a turn, or `rotation` is not a whole-cube turn).
 */
export function rotatePath(track: PathTrack, rotation: Move): PathTrack | null {
  if (!isRotation(rotation) || track.trail.length > 0 || track.half) return null
  const moves = rotateAlg(track.moves, [invertMove(rotation)])
  const states = algStates(applyMove(track.states[0], rotation), moves)
  const state = applyMove(track.state, rotation)
  if (states[track.position] !== state) return null
  return { ...track, moves, states, state }
}

// ---------------------------------------------------------------------------------------------
// Layer 2: following the beginner solver, step by step
// ---------------------------------------------------------------------------------------------

export type FollowStatus =
  | PathStatus
  /** Nothing left to do: the cube is solved. */
  | 'solved'
  /** The solver cannot make sense of this cube (it is not a real cube state). */
  | 'stuck'

export interface FollowOptions extends BeginnerSolverOptions {
  /**
   * True while a hint is on screen. A slip is then answered with "undo that" (the hinted step
   * stays put); without a hint, a learner who leaves the planned step but keeps the cube in good
   * shape is simply doing it his own way, and the plan quietly follows him.
   */
  guiding?: boolean
}

/** Why the current plan was made from the middle of nowhere rather than from a finished step. */
export type FreshPlan =
  /** He wandered a long way off the step. */
  | 'lost'
  /** He asked for a new plan from here. */
  | 'asked'

/** Where the learner is in the beginner method. Immutable; advance it with `followMove`. */
export interface StepFollower extends PathTrack {
  /** The step being followed; null when the cube is solved (or cannot be solved). */
  readonly step: SolveStep | null
  readonly status: FollowStatus
  /** The single move to make now (see `pathNext`); null when solved. */
  readonly next: Move | null
  /** The moves that lead back to the step, in order (empty while on it). */
  readonly undo: readonly Move[]
  /** The step that the latest move finished, for one beat of "done!"; null otherwise. */
  readonly completed: SolveStep | null
  /** How many steps have been finished since `startFollow`. */
  readonly serial: number
  /** Set when this plan was made from wherever the cube happened to be; cleared by progress. */
  readonly fresh: FreshPlan | null
  /**
   * True while he is correctly in the middle of something: on the planned step, or on any
   * algorithm of the method started from a sound cube. No "came undone" warnings while true.
   */
  readonly inside: boolean
  /**
   * The cube to describe (stage tracker, progress, warnings): the last sound cube while `inside`
   * an algorithm, the cube as it is otherwise. Analyse this, never `state`.
   */
  readonly view: CubeState
  /** The latest cube that had every stage it should have: where an "inside" excursion started. */
  readonly anchor: CubeState
  /** Stages complete (0–8) when the current plan was made. */
  readonly baseline: number
  /** @internal */
  readonly previousAnchor: CubeState | null
  /** @internal */
  readonly solver: BeginnerSolverOptions
}

/** Off-path moves tolerated before a fresh plan is made: with a hint showing, and without. */
export const FOLLOW_LOST_AFTER = 4
export const FOLLOW_LOST_AFTER_SILENT = 24

/** How many stages are complete (the corner twist counts as seven, however the bottom looks). */
function level(state: CubeState): number {
  try {
    const stage = firstIncompleteStage(state)
    const done = stage === null ? STAGE_IDS.length : STAGE_IDS.indexOf(stage)
    return done < 7 && detectTwistPhase(state) ? 7 : done
  } catch {
    return 0
  }
}

/** How many of the four pieces of the stage being worked on are done. */
function piecesDone(state: CubeState, done: number): number {
  if (done >= STAGE_IDS.length) return 4
  try {
    return analyzeCube(state).stages[STAGE_IDS[done]].done
  } catch {
    return 0
  }
}

/**
 * Off the planned step, is the cube still in good shape? Yes when no finished stage has been
 * disturbed and the stage being worked on has not lost a piece either.
 */
function soundness(follower: Pick<StepFollower, 'baseline' | 'states'>, state: CubeState): { clean: boolean; better: boolean } {
  const now = level(state)
  if (now !== follower.baseline) return { clean: now > follower.baseline, better: now > follower.baseline }
  return { clean: piecesDone(state, now) >= piecesDone(follower.states[0], now), better: false }
}

// --- Known algorithms: "is he in the middle of one?" -----------------------------------------

let knownPrefixes: (readonly number[])[] | null = null

/**
 * Every point along every algorithm of the method — also mirrored, backwards, and from each side
 * of the cube — as the facelet permutation that leads there from where the algorithm started.
 * Half turns add their quarter-way points (either direction). Built once, on first use.
 */
function prefixes(): (readonly number[])[] {
  if (knownPrefixes) return knownPrefixes
  const seen = new Set<string>()
  const out: (readonly number[])[] = []
  const add = (perm: readonly number[]) => {
    const key = perm.join(',')
    if (seen.has(key)) return
    seen.add(key)
    out.push(perm)
  }
  const then = (perm: readonly number[], move: Move) => {
    const next = movePermutation(move)
    const combined = new Array<number>(54)
    for (let j = 0; j < 54; j++) combined[j] = perm[next[j]]
    return combined
  }
  for (const algorithm of ALGORITHMS) {
    const mirrored = mirrorAlg(algorithm.moves)
    for (const variant of [algorithm.moves, mirrored, invertAlg(algorithm.moves), invertAlg(mirrored)]) {
      for (const spin of [[], ['y'], ['y2'], ["y'"]] as Move[][]) {
        let perm: readonly number[] = IDENTITY_PERMUTATION
        for (const move of spin.length ? rotateAlg(variant, spin) : variant) {
          if (moveAmount(move) === 2) {
            const base = moveBase(move)
            add(then(perm, base as Move))
            add(then(perm, `${base}'` as Move))
          }
          perm = then(perm, move)
          add(perm)
        }
      }
    }
  }
  knownPrefixes = out
  return out
}

/** Is `state` a cube passed through while doing some known algorithm from `anchor`? */
function onKnownAlgorithm(anchor: CubeState, state: CubeState): boolean {
  search: for (const perm of prefixes()) {
    for (let j = 0; j < 54; j++) if (state[j] !== anchor[perm[j]]) continue search
    return true
  }
  return false
}

// --- Building followers -------------------------------------------------------------------------

type Core = Omit<StepFollower, 'status' | 'next' | 'undo' | 'inside' | 'view'>

function finish(core: Core, clean: boolean): StepFollower {
  const onPath = core.trail.length === 0
  let inside = onPath
  if (!onPath && !clean) {
    inside = onKnownAlgorithm(core.anchor, core.state) || (core.previousAnchor !== null && onKnownAlgorithm(core.previousAnchor, core.state))
  }
  const status: FollowStatus = core.step ? pathStatus(core) : isSolved(core.state) ? 'solved' : 'stuck'
  return {
    ...core,
    status,
    next: core.step ? pathNext(core) : null,
    undo: pathUndo(core),
    inside,
    view: clean || !inside ? core.state : core.anchor,
  }
}

function plan(state: CubeState, solver: BeginnerSolverOptions, carry: { completed?: SolveStep | null; serial?: number; fresh?: FreshPlan | null } = {}): StepFollower {
  let step: SolveStep | null = null
  try {
    step = nextBeginnerStep(state, solver)
  } catch {
    step = null
  }
  return finish(
    {
      ...startPath(state, step ? step.moves : []),
      step,
      completed: carry.completed ?? null,
      serial: carry.serial ?? 0,
      fresh: carry.fresh ?? null,
      anchor: state,
      previousAnchor: null,
      baseline: level(state),
      solver,
    },
    true,
  )
}

const solverOptions = ({ whiteCorners }: FollowOptions): BeginnerSolverOptions => (whiteCorners ? { whiteCorners } : {})

/** Start following from a cube at rest (a scramble, a restored save, a cube that was just reset). */
export function startFollow(state: CubeState, options: FollowOptions = {}): StepFollower {
  return plan(state, solverOptions(options))
}

/** A fresh plan from the cube as it is now, because he asked for one. */
export function replanFollow(follower: StepFollower, reason: FreshPlan = 'asked'): StepFollower {
  return plan(follower.state, follower.solver, { serial: follower.serial, fresh: reason })
}

/**
 * Call when a hint is about to be shown. If he has wandered far from the step without a hint
 * (and is not in the middle of a known algorithm) the old step is no use any more: this makes a
 * fresh plan from here. Otherwise the follower is returned as it is — on the step, or a few
 * moves off it with the way back known.
 */
export function askFollow(follower: StepFollower): StepFollower {
  return follower.trail.length > FOLLOW_LOST_AFTER && !follower.inside ? replanFollow(follower, 'lost') : follower
}

/**
 * The follower after `move` is made on the cube.
 *
 * - **On the step** (as `stepPath`: the written move, a half turn as two quarters either way, a
 *   move taken back by hand): the position moves; `view` stays on the last sound cube.
 * - **Step finished**: the next step is planned from the new boundary; `completed` holds the
 *   finished step until the next move.
 * - **The whole cube turned**: before a step is begun the plan is simply made again for the new
 *   hold; in the middle of a step the rest of it is rewritten for the new hold.
 * - **A different move that leaves the cube just as good** (a top turn the other way, one turn
 *   too many while lining up): if the solver's step from there ends in the same place, that step
 *   is adopted; without a hint showing, the plan follows him wherever he goes.
 * - **A slip**: the trail grows and `undo` is the way back. Taking the moves back (by hand or
 *   with Undo) returns to the step exactly as it was. No fresh analysis, no hint for the daisy.
 * - **Genuinely elsewhere** (more than `FOLLOW_LOST_AFTER` moves off with a hint showing,
 *   `FOLLOW_LOST_AFTER_SILENT` without, and not in the middle of a known algorithm): a fresh plan
 *   from here, marked `fresh: 'lost'` so the UI can say so kindly.
 */
export function followMove(follower: StepFollower, move: Move, options: FollowOptions = {}): StepFollower {
  const state = applyMove(follower.state, move)
  const carry = { serial: follower.serial, fresh: follower.fresh }
  // Solved (or unsolvable): any move starts over from wherever it leads.
  if (!follower.step) return plan(state, follower.solver, { serial: follower.serial })

  const onPath = landOnPath(follower, state, move)
  if (onPath) {
    if (onPath.position >= onPath.moves.length) return plan(state, follower.solver, { completed: follower.step, serial: follower.serial + 1 })
    const clean = level(state) >= follower.baseline
    return finish(
      {
        ...follower,
        ...onPath,
        completed: null,
        fresh: onPath.position > 0 ? null : follower.fresh,
        ...(clean && state !== follower.anchor ? { anchor: state, previousAnchor: follower.anchor } : {}),
      },
      clean,
    )
  }

  // Turning the whole cube changes how it is held, not the puzzle.
  if (isRotation(move) && follower.trail.length === 0 && !follower.half) {
    if (follower.position === 0 || follower.step.kind === 'hold') return plan(state, follower.solver, carry)
    const rotated = rotatePath(follower, move)
    if (rotated) {
      const turn = (s: CubeState | null) => (s === null ? null : applyMove(s, move))
      const clean = level(state) >= follower.baseline
      return finish({ ...follower, ...rotated, completed: null, anchor: turn(follower.anchor)!, previousAnchor: turn(follower.previousAnchor) }, clean)
    }
  }

  // Off the step. Is the cube still (or again) in good shape?
  const { clean, better } = soundness(follower, state)
  if (clean) {
    if (!options.guiding || better) return plan(state, follower.solver, carry)
    // With a hint showing, only swap the step for one that is plainly the same thing done
    // another way: the same case, or a step that ends on the very same cube.
    const other = plan(state, follower.solver, carry)
    const end = follower.states[follower.states.length - 1]
    if (other.step && (other.step.caseId === follower.step.caseId || other.states[other.states.length - 1] === end)) return other
  }
  const next = finish(
    {
      ...follower,
      ...alongTrail(follower, state, move),
      completed: null,
      ...(clean ? { anchor: state, previousAnchor: follower.anchor } : {}),
    },
    clean,
  )
  const limit = options.guiding ? FOLLOW_LOST_AFTER : FOLLOW_LOST_AFTER_SILENT
  if (next.trail.length > limit && !next.inside) return plan(state, follower.solver, { serial: follower.serial, fresh: 'lost' })
  return next
}

/** `followMove` for each move in turn. */
export function followMoves(follower: StepFollower, moves: readonly Move[], options: FollowOptions = {}): StepFollower {
  let current = follower
  for (const move of moves) current = followMove(current, move, options)
  return current
}

/**
 * Bring the follower up to date with a cube that changed by some unknown means. One move away
 * (a turn, an undo, a redo) is followed as that move; a cube that is somewhere on the current
 * step is picked up there; anything else (a reset, a new scramble) starts a new plan.
 */
export function followState(follower: StepFollower, state: CubeState, options: FollowOptions = {}): StepFollower {
  if (state === follower.state) return follower
  for (const move of ALL_MOVES) if (applyMove(follower.state, move) === state) return followMove(follower, move, options)
  if (follower.step) {
    const at = indexOnPath(follower, state)
    if (at >= 0 && at < follower.moves.length) {
      const clean = level(state) >= follower.baseline
      return finish({ ...follower, state, position: at, half: null, trail: [], trailStates: [], completed: null }, clean)
    }
  }
  return plan(state, follower.solver)
}
