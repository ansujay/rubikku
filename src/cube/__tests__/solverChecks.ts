/**
 * Shared checks for the beginner-solver tests: everything that must be true of any solution.
 */
import {
  BEGINNER_HOLD,
  SOLVED,
  STAGE_IDS,
  analyzeCube,
  applyAlg,
  countMoves,
  getAlgorithm,
  isRotation,
  isSolved,
  isStageComplete,
  randomState,
  solveBeginner,
  type BeginnerSolution,
  type BeginnerSolverOptions,
  type CubeState,
  type Move,
  type StageId,
} from '../index'
import { seededRng } from './helpers'

/** Solved cube in the beginner hold: yellow up, white down, green front. */
export const HOLD = applyAlg(SOLVED, BEGINNER_HOLD)
export const stageIndex = (id: StageId) => STAGE_IDS.indexOf(id)

/** How much `analyzeCube` cross-checking to do: after every stage, or also before every stage, or none. */
export type Depth = 'full' | 'after' | 'none'

/**
 * Everything that must be true of any solution. Returns the number of face turns.
 * (Plain `throw`s rather than `expect` in the hot loops: this runs on hundreds of thousands of steps.)
 */
export function checkSolution(start: CubeState, sol: BeginnerSolution, depth: Depth = 'full'): number {
  if (sol.start !== start) throw new Error('solution.start is not the given state')
  if (!isSolved(sol.end)) throw new Error(`Not solved: ${start}`)

  let state = start
  let lastStage = -1
  for (const step of sol.steps) {
    // The chain of states is unbroken and every step does exactly what it says.
    if (step.before !== state) throw new Error(`Broken chain at ${step.caseId}: ${start}`)
    if (step.after !== applyAlg(step.before, step.moves)) throw new Error(`after != before + moves at ${step.caseId}: ${start}`)
    state = step.after

    // Steps are never empty and never no-ops.
    if (step.moves.length === 0) throw new Error(`Empty step ${step.caseId}: ${start}`)
    if (step.after === step.before) throw new Error(`No-op step ${step.caseId}: ${start}`)
    if (step.moves.join(' ') !== [...step.setup, ...step.main].join(' ')) throw new Error(`moves != setup + main: ${start}`)

    // Rotations live in 'hold' steps and nowhere else.
    if (step.kind === 'hold') {
      if (!step.moves.every(isRotation) || step.setup.length) throw new Error(`Bad hold step ${step.caseId}: ${start}`)
    } else if (step.moves.some(isRotation)) throw new Error(`Rotation inside a turn step ${step.caseId}: ${start}`)

    // Setup is at most one turn of the top; nothing silly like "U U U".
    if (step.setup.length > 1 || (step.setup.length === 1 && step.setup[0][0] !== 'U')) {
      throw new Error(`Bad setup ${step.setup.join(' ')} at ${step.caseId}: ${start}`)
    }

    // Named algorithms really are the library's algorithms.
    if (step.algorithm) {
      const entry = getAlgorithm(step.algorithm.id)
      if (!entry) throw new Error(`Unknown algorithm ${step.algorithm.id}`)
      const expected: Move[] = []
      for (let k = 0; k < step.algorithm.repetitions; k++) expected.push(...entry.moves)
      if (step.main.join(' ') !== expected.join(' ') || step.algorithm.repetitions < 1) {
        throw new Error(`Algorithm mismatch at ${step.caseId}: ${start}`)
      }
      if (step.algorithm.name !== entry.name) throw new Error(`Algorithm name mismatch at ${step.caseId}`)
    }

    // Teachable: names, explanations, stable ids.
    if (step.caseName.trim().length < 5 || step.explanation.trim().length < 30) throw new Error(`Thin text at ${step.caseId}`)
    if (/undefined|NaN|\[object/.test(step.caseName + step.explanation)) throw new Error(`Broken text at ${step.caseId}: ${step.explanation}`)
    if (!step.caseId.startsWith(`${step.stage}/`)) throw new Error(`Bad case id ${step.caseId}`)

    // Stages only ever move forwards.
    const index = stageIndex(step.stage)
    if (index < lastStage) throw new Error(`Stage went backwards at ${step.caseId}: ${start}`)
    lastStage = index
  }
  if (state !== sol.end) throw new Error(`solution.end is not the last state: ${start}`)

  // Grouping by stage is a faithful regrouping of the steps (the very same objects, in order).
  const regrouped = sol.stages.flatMap((g) => g.steps)
  if (regrouped.length !== sol.steps.length || regrouped.some((step, i) => step !== sol.steps[i])) {
    throw new Error(`Stage groups do not match the steps: ${start}`)
  }
  sol.stages.forEach((g, i) => {
    if (i > 0 && stageIndex(g.stage) <= stageIndex(sol.stages[i - 1].stage)) throw new Error(`Stage groups out of order: ${start}`)
    if (g.steps.some((step) => step.stage !== g.stage)) throw new Error(`Step in the wrong stage group: ${start}`)
  })
  for (const group of sol.stages) {
    if (group.before !== group.steps[0].before || group.after !== group.steps[group.steps.length - 1].after) {
      throw new Error(`Stage group states are wrong: ${start}`)
    }
    if (group.faceTurns !== countMoves(group.moves)) throw new Error(`Stage face turns are wrong: ${start}`)
    // The stage had work to do, and its steps finish it (and everything before it).
    if (isStageComplete(group.before, group.stage) && !analyzeCube(group.before).twistInProgress) {
      throw new Error(`Steps for a finished stage ${group.stage}: ${start}`)
    }
    if (!isStageComplete(group.after, group.stage)) throw new Error(`Stage ${group.stage} not complete after its steps: ${start}`)
    if (depth !== 'none') {
      const after = analyzeCube(group.after)
      if (!after.stages[group.stage].complete) throw new Error(`analyzeCube disagrees after ${group.stage}: ${start}`)
      for (const earlier of after.stageList) {
        if (earlier.stage === group.stage) break
        if (!earlier.complete) throw new Error(`analyzeCube: ${earlier.stage} lost after ${group.stage}: ${start}`)
      }
    }
    if (depth === 'full') {
      const beforeIt = analyzeCube(group.before)
      if (beforeIt.current !== group.stage) throw new Error(`analyzeCube: current is ${beforeIt.current}, solver says ${group.stage}: ${start}`)
    }
  }

  if (sol.moves.join(' ') !== sol.steps.flatMap((s) => s.moves).join(' ')) throw new Error(`solution.moves is wrong: ${start}`)
  if (sol.faceTurns !== countMoves(sol.moves)) throw new Error(`solution.faceTurns is wrong: ${start}`)
  return sol.faceTurns
}

export interface Stats {
  count: number
  mean: number
  max: number
  min: number
  meanSteps: number
  maxSteps: number
}

export function solveAll(states: Iterable<CubeState>, options: BeginnerSolverOptions = {}): Stats {
  let count = 0
  let total = 0
  let max = 0
  let min = Infinity
  let steps = 0
  let maxSteps = 0
  for (const s of states) {
    const sol = solveBeginner(s, options)
    // analyzeCube is checked after every stage of every solve, and also before every stage of every fourth.
    const turns = checkSolution(s, sol, count % 4 === 0 ? 'full' : 'after')
    count++
    total += turns
    max = Math.max(max, turns)
    min = Math.min(min, turns)
    steps += sol.steps.length
    maxSteps = Math.max(maxSteps, sol.steps.length)
  }
  return { count, mean: total / count, max, min, meanSteps: steps / count, maxSteps }
}

export function* randomStates(seed: number, n: number): Generator<CubeState> {
  const rng = seededRng(seed)
  for (let i = 0; i < n; i++) yield randomState(rng)
}
