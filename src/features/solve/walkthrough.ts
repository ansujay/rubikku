/**
 * The walkthrough position model: where he is in a solution, one move at a time. No React.
 *
 * A walk is a list of steps (each a short run of moves) grouped into chapters — the beginner
 * stages, or the single chapter of the "fastest way". A position is `{ step, move }`:
 *
 *   - `move` < the step's length: he is about to do move `move` of that step.
 *   - `move` = the step's length: only at the end of a chapter — the milestone ("White cross
 *     done!") — and, for the last chapter, the finish.
 *
 * `next` and `back` change the cube by at most one move, so the 3D cube can always animate
 * the change, and a step's moves are always walked to their end (the solver's hints are only
 * valid at step boundaries).
 */
import { applyMove, centerColors, isRotation, isSolved, STAGE_IDS, type BeginnerSolution, type Color, type CubeState, type Move, type PieceId, type SlotId, type StageId, type StepAlgorithm } from '../../cube'

export type WalkGroup = StageId | 'fastest'

export interface WalkStep {
  group: WalkGroup
  kind: 'hold' | 'turn'
  title: string
  explanation: string
  moves: readonly Move[]
  /** How many leading moves only line things up before the main moves. */
  setupCount: number
  algorithm?: StepAlgorithm
  pieces: readonly PieceId[]
  targets: readonly SlotId[]
}

export interface Walk {
  start: CubeState
  steps: readonly WalkStep[]
  /** Global move index at which each step starts; one extra entry holds the total. */
  offsets: readonly number[]
  /** The cube after 0, 1, … total moves. */
  states: readonly CubeState[]
  /** Every move, in order. */
  moves: readonly Move[]
  total: number
  /** Chapters in order. */
  groups: readonly WalkGroup[]
}

export interface WalkPos {
  step: number
  move: number
}

export const START: WalkPos = { step: 0, move: 0 }

export function buildWalk(start: CubeState, steps: readonly WalkStep[]): Walk {
  const usable = steps.filter((step) => step.moves.length > 0)
  const offsets: number[] = []
  const states: CubeState[] = [start]
  const moves: Move[] = []
  let state = start
  for (const step of usable) {
    offsets.push(moves.length)
    for (const move of step.moves) {
      state = applyMove(state, move)
      states.push(state)
      moves.push(move)
    }
  }
  offsets.push(moves.length)
  const groups: WalkGroup[] = []
  for (const step of usable) if (groups[groups.length - 1] !== step.group) groups.push(step.group)
  return { start, steps: usable, offsets, states, moves, total: moves.length, groups }
}

export function walkFromBeginner(solution: BeginnerSolution): Walk {
  return buildWalk(
    solution.start,
    solution.steps.map((step) => ({
      group: step.stage,
      kind: step.kind,
      title: step.caseName,
      explanation: step.explanation,
      moves: step.moves,
      setupCount: step.setup.length,
      algorithm: step.algorithm,
      pieces: step.highlight.pieces,
      targets: step.highlight.targets,
    })),
  )
}

/** How many moves the fastest way shows at a time: short enough to keep his place. */
export const FASTEST_CHUNK = 5

export function walkFromFastest(start: CubeState, moves: readonly Move[]): Walk {
  const steps: WalkStep[] = []
  const parts = Math.ceil(moves.length / FASTEST_CHUNK)
  for (let i = 0; i < parts; i++) {
    steps.push({
      group: 'fastest',
      kind: 'turn',
      title: parts === 1 ? 'The shortcut' : `Shortcut, part ${i + 1} of ${parts}`,
      explanation:
        i === 0
          ? 'These turns come from a computer search, not from a method. Hold the cube exactly as shown and keep it that way round — just follow along, one turn at a time.'
          : 'Keep holding the cube the same way round. Next few turns:',
      moves: moves.slice(i * FASTEST_CHUNK, (i + 1) * FASTEST_CHUNK),
      setupCount: 0,
      pieces: [],
      targets: [],
    })
  }
  return buildWalk(start, steps)
}

// ───────────────────────── Positions ─────────────────────────

const lengthOf = (walk: Walk, step: number) => walk.steps[step].moves.length
export const isLastOfGroup = (walk: Walk, step: number): boolean => step === walk.steps.length - 1 || walk.steps[step + 1].group !== walk.steps[step].group

/** Bring any saved position back into range (and off positions that are not stops). */
export function clampPos(walk: Walk, pos: WalkPos): WalkPos {
  if (walk.steps.length === 0) return START
  const step = Math.min(Math.max(0, Math.trunc(pos.step) || 0), walk.steps.length - 1)
  const length = lengthOf(walk, step)
  let move = Math.min(Math.max(0, Math.trunc(pos.move) || 0), length)
  if (move === length && !isLastOfGroup(walk, step)) return { step: step + 1, move: 0 }
  if (!Number.isFinite(pos.step) || !Number.isFinite(pos.move)) move = 0
  return { step, move }
}

/** How many moves of the whole walk are done at this position. */
export const globalIndex = (walk: Walk, pos: WalkPos): number => (walk.steps.length === 0 ? 0 : walk.offsets[pos.step] + pos.move)

export const stateAt = (walk: Walk, pos: WalkPos): CubeState => walk.states[globalIndex(walk, pos)]

/** At the end of a chapter (which, for the last chapter, is the end of the solve). */
export const isMilestone = (walk: Walk, pos: WalkPos): boolean => walk.steps.length > 0 && pos.move === lengthOf(walk, pos.step)

export const isFinished = (walk: Walk, pos: WalkPos): boolean => walk.steps.length === 0 || (pos.step === walk.steps.length - 1 && pos.move === lengthOf(walk, pos.step))

export const isAtStart = (pos: WalkPos): boolean => pos.step === 0 && pos.move === 0

/** The move he is about to do; null at a milestone. */
export const currentMove = (walk: Walk, pos: WalkPos): Move | null => (walk.steps.length === 0 ? null : (walk.steps[pos.step].moves[pos.move] ?? null))

/** One stop forward: the next move, a milestone, or the first move of the next chapter. */
export function next(walk: Walk, pos: WalkPos): WalkPos {
  if (walk.steps.length === 0) return pos
  const length = lengthOf(walk, pos.step)
  if (pos.move < length - 1) return { step: pos.step, move: pos.move + 1 }
  if (pos.move === length - 1) return isLastOfGroup(walk, pos.step) ? { step: pos.step, move: length } : { step: pos.step + 1, move: 0 }
  return pos.step < walk.steps.length - 1 ? { step: pos.step + 1, move: 0 } : pos
}

/** One stop back: exactly the reverse of `next`. */
export function back(walk: Walk, pos: WalkPos): WalkPos {
  if (walk.steps.length === 0) return pos
  if (pos.move > 0) return { step: pos.step, move: pos.move - 1 }
  if (pos.step === 0) return pos
  const previous = pos.step - 1
  const length = lengthOf(walk, previous)
  return isLastOfGroup(walk, previous) ? { step: previous, move: length } : { step: previous, move: length - 1 }
}

/** Back to the first move of the current step (or of the previous one, when already there). */
export function stepStart(walk: Walk, pos: WalkPos): WalkPos {
  if (walk.steps.length === 0) return pos
  if (pos.move > 0) return { step: pos.step, move: 0 }
  return pos.step > 0 ? { step: pos.step - 1, move: 0 } : pos
}

// ───────────────────────── Step boundaries ─────────────────────────

/**
 * At a step boundary: before the first move of a step, or at a milestone. Only here may the
 * rest of the solve be planned again — the beginner solver reads a half-done step as a broken
 * cube and would undo finished layers (on his real cube).
 */
export const isBoundary = (walk: Walk, pos: WalkPos): boolean => walk.steps.length === 0 || pos.move === 0 || isMilestone(walk, pos)

/** Moves still to do before the next step boundary (0 at a boundary). */
export const movesToBoundary = (walk: Walk, pos: WalkPos): number => (isBoundary(walk, pos) ? 0 : lengthOf(walk, pos.step) - pos.move)

/** The position after `index` moves of the whole walk. */
export function posAt(walk: Walk, index: number): WalkPos {
  if (walk.steps.length === 0) return START
  const at = Math.min(Math.max(0, Math.trunc(index) || 0), walk.total)
  let step = walk.steps.length - 1
  while (step > 0 && walk.offsets[step] > at) step--
  return clampPos(walk, { step, move: at - walk.offsets[step] })
}

/**
 * Where in the walk the cube looks exactly like `state` — the place nearest to `near` (a count
 * of moves done) when there are several — or null when the walk never passes through it.
 */
export function locate(walk: Walk, state: CubeState, near = 0): WalkPos | null {
  let best = -1
  walk.states.forEach((candidate, index) => {
    if (candidate === state && (best < 0 || Math.abs(index - near) < Math.abs(best - near))) best = index
  })
  return best < 0 ? null : posAt(walk, best)
}

// ───────────────────────── Summaries ─────────────────────────

export type GroupStatus = 'done' | 'current' | 'todo'

/** done / current / todo for a chapter at a position. A chapter is done once its milestone is reached. */
export function groupStatus(walk: Walk, pos: WalkPos, group: WalkGroup): GroupStatus {
  if (walk.steps.length === 0) return 'done'
  const now = walk.groups.indexOf(walk.steps[pos.step].group)
  let at = walk.groups.indexOf(group)
  if (at < 0) {
    // A stage that needs no work of its own (e.g. the yellow edges already line up) follows
    // the stage before it: it only counts as done once everything before it is.
    const order = STAGE_IDS.indexOf(group as StageId)
    let before = -1
    walk.groups.forEach((g, i) => {
      if (STAGE_IDS.indexOf(g as StageId) < order) before = i
    })
    if (before < 0) return 'done'
    at = before
    if (at === now) return isMilestone(walk, pos) ? 'done' : 'todo'
  }
  if (at < now) return 'done'
  if (at > now) return 'todo'
  return isMilestone(walk, pos) ? 'done' : 'current'
}

export interface StepPlace {
  /** 1-based number of this step within its chapter, and how many the chapter has. */
  number: number
  of: number
}

export function stepPlace(walk: Walk, step: number): StepPlace {
  const group = walk.steps[step].group
  let first = step
  while (first > 0 && walk.steps[first - 1].group === group) first--
  let last = step
  while (last < walk.steps.length - 1 && walk.steps[last + 1].group === group) last++
  return { number: step - first + 1, of: last - first + 1 }
}

/** Face turns among the first `count` moves (whole-cube turns are not counted). */
export function faceTurns(walk: Walk, count = walk.total): number {
  let n = 0
  for (let i = 0; i < count && i < walk.moves.length; i++) if (!isRotation(walk.moves[i])) n++
  return n
}

/** Which centre colours are on top and in front — how the cube is held in a state. */
export function holdOf(state: CubeState): { top: Color; front: Color } {
  const centres = centerColors(state)
  return { top: centres.U, front: centres.F }
}

export const endsSolved = (walk: Walk): boolean => isSolved(walk.states[walk.states.length - 1])
