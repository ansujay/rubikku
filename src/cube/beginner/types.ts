/**
 * Types for the beginner (human-method) solver.
 */
import type { PieceId, SlotId } from '../geometry'
import type { FaceMove, Move, RotationMove } from '../notation'
import type { StageId } from '../stages'
import type { CubeState } from '../state'

/** What kind of thing a step asks the learner to do. */
export type StepKind =
  /** Turn the whole cube to a new hold (the moves are only x / y / z). */
  | 'hold'
  /** Turn faces: an intuitive move, or a named algorithm (possibly after lining up the top). */
  | 'turn'

export interface StepAlgorithm {
  /** Id of the entry in `ALGORITHMS` (look it up with `getAlgorithm`). */
  id: string
  /** Display name of the algorithm, e.g. "Right Trigger". */
  name: string
  /** How many times in a row it is performed in this step. */
  repetitions: number
  /** One round of the algorithm. */
  moves: Move[]
}

export interface StepHighlight {
  /** The pieces this step is about (ids are stable while the pieces move). */
  pieces: PieceId[]
  /** Where those pieces are heading: slots in the hold the step's moves are written for. */
  targets: SlotId[]
  /** Facelets covered by the stickers of `pieces` in the `before` state. */
  facelets: number[]
}

/** One teachable step of a beginner solution. */
export interface SolveStep {
  /** The stage this step belongs to. */
  stage: StageId
  kind: StepKind
  /** Stable machine id of the case, e.g. "middle-layer/insert-right". */
  caseId: string
  /** Short case name: "White edge stuck in the middle layer". */
  caseName: string
  /** What we see and why we do this, for a 10+ year-old. */
  explanation: string
  /** Everything to do in this step, in order: `setup` followed by `main`. Never empty. */
  moves: Move[]
  /** Leading turns of the top layer that line things up before the main moves (often empty). */
  setup: Move[]
  /** The moves after `setup`: the named algorithm (times its repetitions), or the intuitive turn(s). */
  main: Move[]
  /** Present when `main` is a named algorithm from `ALGORITHMS`. */
  algorithm?: StepAlgorithm
  /** What to light up on the 3D cube. */
  highlight: StepHighlight
  /** The cube before the step. */
  before: CubeState
  /** The cube after the step: always `applyAlg(before, moves)`. */
  after: CubeState
}

/** The steps of one stage of a solution. */
export interface StageSolution {
  stage: StageId
  steps: SolveStep[]
  /** All moves of the stage, rotations included. */
  moves: Move[]
  /** Number of face turns in the stage (whole-cube rotations do not count). */
  faceTurns: number
  before: CubeState
  after: CubeState
}

export interface BeginnerSolution {
  /** The cube that was passed in. */
  start: CubeState
  /** The cube after every step: solved. */
  end: CubeState
  /** Every step, in order. Empty if the cube was already solved. */
  steps: SolveStep[]
  /** The same steps grouped by stage, in order; stages that needed no work are left out. */
  stages: StageSolution[]
  /** Every move in order, whole-cube rotations included, exactly as a person would do them. */
  moves: Move[]
  /** Number of face turns (whole-cube rotations do not count). */
  faceTurns: number
}

export interface BeginnerSolverOptions {
  /**
   * How white corners are put in:
   *  - `'cases'` (default): the three one-look cases (`white-corner-right`, `-front`, `-top`).
   *  - `'trigger'`: only ever the right trigger, repeated until the corner drops in
   *    (`white-corner-insert`) — more turns, but nothing new to learn.
   */
  whiteCorners?: 'cases' | 'trigger'
}

export interface BeginnerHint {
  /** True when there is nothing left to do. */
  solved: boolean
  /** The stage the next step belongs to; null when solved. */
  stage: StageId | null
  /** The next step; null when solved. */
  step: SolveStep | null
  /** One line for the hint bubble: the case name, or a "you're solved" message. */
  message: string
}

export interface FlatSolution {
  /** The solution as face turns only — to be done without ever turning the whole cube. */
  moves: FaceMove[]
  /** The net whole-cube rotation the original solution made (so `moves` + `rotation` ≡ the original). */
  rotation: RotationMove[]
  /** `moves.length`. */
  faceTurns: number
}
