/**
 * The pure side of the lessons: building the cube a beat starts from, the moves a demo or a
 * guided exercise follows, practice drills, outcome checks and move-by-move tracking.
 *
 * No React here. Everything is deterministic (seeded) so a lesson looks the same every time,
 * and everything is derived from the beginner solver so that lessons, hints and "solve my cube"
 * tell one story.
 */
import {
  analyzeCube,
  applyAlg,
  invertAlg,
  BEGINNER_HOLD,
  centerColors,
  getAlgorithm,
  isSolved,
  isStageComplete,
  nextBeginnerStep,
  parseAlg,
  pathStatus,
  pieceAt,
  randomState,
  seededRng,
  SOLVED,
  STAGE_IDS,
  trackPath,
  yellowCrossShape,
  type CubeState,
  type Move,
  type PieceId,
  type SlotId,
  type SolveStep,
  type StageId,
  type YellowCrossShape,
} from '../../cube'
import { HARD_CASES } from './drillCases'

/** The solved cube in the hold used for the whole method: yellow up, white down, green in front. */
export const HELD: CubeState = applyAlg(SOLVED, BEGINNER_HOLD)

const stageIndex = (stage: StageId) => STAGE_IDS.indexOf(stage)

// ───────────────────────── Scenes: the cube a beat starts from ─────────────────────────

interface SceneExtras {
  /** Moves applied after the scene is built. */
  then?: string
}

export type Scene =
  /** The solved cube in the hold, then `alg`. */
  | ({ kind: 'held'; alg?: string } & SceneExtras)
  /** A random cube. In the hold unless `upright` (white on top, as it comes out of a scramble). */
  | ({ kind: 'random'; seed: number | string; upright?: boolean } & SceneExtras)
  /** A random cube solved with the method up to the start of `stage`. */
  | ({ kind: 'stage'; stage: StageId; seed: number | string } & SceneExtras)
  /**
   * A random cube solved with the method until the solver's next step is the case `caseId`.
   * `setup` asks for a case that does (true) or does not (false) start with turns of the top;
   * `moves` asks for an exact step; `trigger` uses the trigger-only way of placing white corners.
   */
  | ({ kind: 'case'; caseId: string; seed: number | string; setup?: boolean; moves?: string; trigger?: boolean } & SceneExtras)
  /** A random cube solved with the method until `steps` solver steps before `stage` is finished. */
  | ({ kind: 'finish'; stage: StageId; seed: number | string; steps: number } & SceneExtras)

function randomHeld(seed: number | string): CubeState {
  return applyAlg(randomState(seededRng(seed)), BEGINNER_HOLD)
}

/** A random cube (seeded), held for the method: yellow up, white down. */
export const heldScramble = randomHeld

function solverOptions(trigger?: boolean) {
  return trigger ? ({ whiteCorners: 'trigger' } as const) : {}
}

/** The solver's steps from a state, one after another (never more than a real solve needs). */
export function* solverSteps(state: CubeState, trigger?: boolean): Generator<SolveStep> {
  let current = state
  for (let n = 0; n < 300; n++) {
    const step = nextBeginnerStep(current, solverOptions(trigger))
    if (!step) return
    yield step
    current = step.after
  }
}

/** True when `stage` needs no more work on this cube (the last stage is done when the cube is solved). */
export function stageDone(state: CubeState, stage: StageId): boolean {
  return stage === 'yellow-corners-orient' ? isSolved(state) : isStageComplete(state, stage)
}

/** The cube after the method has been followed up to the start of `stage` (unchanged if already there). */
export function solveToStage(state: CubeState, stage: StageId): CubeState {
  const target = stageIndex(stage)
  let current = state
  for (const step of solverSteps(state)) {
    if (stageIndex(step.stage) >= target) return step.before
    current = step.after
  }
  return current
}

function stageSteps(start: CubeState, stage: StageId, trigger?: boolean): SolveStep[] {
  const steps: SolveStep[] = []
  if (stageDone(start, stage)) return steps
  for (const step of solverSteps(start, trigger)) {
    steps.push(step)
    if (stageDone(step.after, stage)) break
  }
  return steps
}

const sceneCache = new Map<string, CubeState>()

function buildScene(scene: Scene): CubeState {
  switch (scene.kind) {
    case 'held':
      return applyAlg(HELD, scene.alg ?? '')
    case 'random':
      return scene.upright ? randomState(seededRng(scene.seed)) : randomHeld(scene.seed)
    case 'stage':
      return solveToStage(randomHeld(scene.seed), scene.stage)
    case 'case': {
      const wanted = scene.moves ? parseAlg(scene.moves).join(' ') : null
      for (const step of solverSteps(randomHeld(scene.seed), scene.trigger)) {
        if (step.caseId !== scene.caseId) continue
        if (scene.setup !== undefined && step.setup.length > 0 !== scene.setup) continue
        if (wanted !== null && step.moves.join(' ') !== wanted) continue
        return step.before
      }
      throw new Error(`Lesson scene: seed ${scene.seed} never reaches the case ${scene.caseId}`)
    }
    case 'finish': {
      const steps = stageSteps(solveToStage(randomHeld(scene.seed), scene.stage), scene.stage)
      if (steps.length < scene.steps) throw new Error(`Lesson scene: seed ${scene.seed} finishes ${scene.stage} in fewer than ${scene.steps} steps`)
      return steps[steps.length - scene.steps].before
    }
  }
}

/** The cube a scene describes. Deterministic; cached. */
export function resolveScene(scene: Scene): CubeState {
  const key = JSON.stringify(scene)
  let state = sceneCache.get(key)
  if (!state) {
    state = applyAlg(buildScene(scene), scene.then ?? '')
    sceneCache.set(key, state)
  }
  return state
}

// ───────────────────────── Plays: the moves a demo or exercise follows ─────────────────────────

export interface Play {
  scene: Scene
  /** Explicit moves. Without it the moves come from the solver (see `steps` / `toStageEnd`). */
  alg?: string
  /** For explicit moves: the algorithm in `ALGORITHMS` they are (for the name and the card). */
  algorithm?: string
  /** For explicit moves: what to call them when they are not a named algorithm. */
  label?: string
  /** Follow this many solver steps (default 1). */
  steps?: number
  /** Follow the solver until this stage is finished. */
  toStageEnd?: StageId
  /** Use the trigger-only way of placing white corners. */
  trigger?: boolean
}

export type SegmentKind = 'hold' | 'setup' | 'algorithm' | 'turn'

/** A run of moves that belong together: "turn the top", "Right Trigger × 2", "turn the cube". */
export interface PlaySegment {
  kind: SegmentKind
  /** What to call it when the moves themselves are hidden. */
  label: string
  moves: Move[]
  /** Index of its first move in the play. */
  start: number
  algorithmId?: string
  repetitions?: number
  /** The solver step it came from. */
  step?: SolveStep
}

export interface ResolvedPlay {
  start: CubeState
  end: CubeState
  moves: Move[]
  segments: PlaySegment[]
  /** The solver steps followed (empty for explicit moves). */
  steps: SolveStep[]
  /** Pieces the play is about, and where they are heading. */
  pieces: PieceId[]
  targets: SlotId[]
}

const timesLabel = (name: string, n: number) => (n > 1 ? `${name} × ${n}` : name)

/** Step names that say what to do, not just what the algorithm is called. */
const LABELS: Record<string, { setup?: string; main?: string; name?: string }> = {
  'daisy/middle': { setup: 'Turn the top: empty spot above' },
  'daisy/bottom': { setup: 'Turn the top: empty spot above' },
  'daisy/bottom-flipped': { setup: 'Turn the top: empty spot above' },
  'daisy/top-flipped': { setup: 'Turn the top: empty spot above' },
  'white-cross/drop': { setup: 'Match: turn the top', main: 'Then drop it' },
  'white-corners/insert-trigger': { setup: 'Park it: turn the top', name: 'Right Trigger' },
  'white-corners/twisted-trigger': { name: 'Right Trigger' },
  'white-corners/insert-right': { setup: 'Park it: turn the top' },
  'white-corners/insert-front': { setup: 'Park it: turn the top' },
  'white-corners/insert-top': { setup: 'Park it: turn the top' },
  'middle-layer/insert-right': { setup: 'Make the T' },
  'middle-layer/insert-left': { setup: 'Make the T' },
  'yellow-cross/L': { setup: 'Hold the shape right' },
  'yellow-cross/line': { setup: 'Hold the shape right' },
  'yellow-corners-orient/next-corner': { setup: 'Top only: next corner to the workbench' },
}

/** What a setup is called when a case has no name for it (every case that has one is in `LABELS`). */
export const DEFAULT_SETUP_LABEL = 'Turn the top'

/**
 * The same names with the answer taken out, for exercises where he makes the decision himself
 * ("Middle edge goes to the left" would make it for him).
 */
const NEUTRAL: Record<string, { setup?: string; main?: string }> = {
  'middle-layer/insert-right': { setup: 'Make the T', main: 'Send the edge to its side' },
  'middle-layer/insert-left': { setup: 'Make the T', main: 'Send the edge to its side' },
  'yellow-corners-position/face-home-corner': { main: 'Bring the home corner to the front-right' },
  'yellow-corners-position/cycle': { main: 'Corner Cycle' },
  'yellow-corners-position/cycle-twice': { main: 'Corner Cycle (as often as it takes)' },
  'yellow-edges/face-swap': { main: 'Hold the matching pair where it belongs' },
  'yellow-cross/L': { setup: 'Hold the shape the right way' },
  'yellow-cross/line': { setup: 'Hold the shape the right way' },
  // "White Corner Insert × 2" would give the count away (and the lesson calls it the Right Trigger).
  'white-corners/insert-trigger': { setup: 'Park it: turn the top', main: 'Right Trigger until white faces down' },
  'white-corners/twisted-trigger': { main: 'Right Trigger until white faces down' },
  // The same for the final twist: "2 or 4" is his to count.
  'yellow-corners-orient/twist': { main: 'Corner Twist until yellow faces up' },
  'yellow-corners-orient/twist-continue': { main: 'Corner Twist until yellow faces up' },
  'yellow-corners-orient/next-corner': { setup: 'Top only: next corner to the workbench', main: 'Corner Twist until yellow faces up' },
}

/** A play's segments with the neutral names (see `NEUTRAL`). */
export function neutralSegments(segments: readonly PlaySegment[]): PlaySegment[] {
  return segments.map((segment) => {
    const names = segment.step ? NEUTRAL[segment.step.caseId] : undefined
    const label = segment.kind === 'setup' ? names?.setup : names?.main
    return label ? { ...segment, label } : segment
  })
}

function segmentsOfStep(step: SolveStep, offset: number): PlaySegment[] {
  const out: PlaySegment[] = []
  const names = LABELS[step.caseId]
  if (step.setup.length > 0) {
    out.push({ kind: 'setup', label: names?.setup ?? DEFAULT_SETUP_LABEL, moves: [...step.setup], start: offset, step })
  }
  const start = offset + step.setup.length
  if (step.kind === 'hold') out.push({ kind: 'hold', label: step.caseName, moves: [...step.main], start, step })
  else if (step.algorithm) {
    out.push({
      kind: 'algorithm',
      label: names?.main ?? timesLabel(names?.name ?? step.algorithm.name, step.algorithm.repetitions),
      moves: [...step.main],
      start,
      algorithmId: step.algorithm.id,
      repetitions: step.algorithm.repetitions,
      step,
    })
  } else if (step.main.length > 0) {
    out.push({ kind: 'turn', label: step.caseName, moves: [...step.main], start, step })
  }
  return out
}

/** How many times `moves` is `unit` repeated; 0 when it is not a whole number of rounds. */
function repetitionsOf(unit: readonly Move[], moves: readonly Move[]): number {
  if (unit.length === 0 || moves.length % unit.length !== 0) return 0
  return moves.every((m, i) => m === unit[i % unit.length]) ? moves.length / unit.length : 0
}

/**
 * A play made of solver steps that are already known (for the moves still ahead of him in an
 * exercise judged by result). `first` replaces the first step's moves when he has turned the
 * whole cube part-way through it (the step then reads differently in the new hold).
 */
export function playOfSteps(steps: readonly SolveStep[], first?: readonly Move[]): Pick<ResolvedPlay, 'moves' | 'segments' | 'steps'> {
  const moves: Move[] = []
  const segments: PlaySegment[] = []
  steps.forEach((step, i) => {
    if (i === 0 && first && first.join(' ') !== step.moves.join(' ')) {
      segments.push({ kind: 'turn', label: step.caseName, moves: [...first], start: 0, step })
      moves.push(...first)
      return
    }
    segments.push(...segmentsOfStep(step, moves.length))
    moves.push(...step.moves)
  })
  return { moves, segments, steps: [...steps] }
}

/**
 * The solver's steps from `from` until the exercise's outcome (measured from its `start`) is
 * met: what is still ahead of him, re-planned from wherever he is.
 */
export function stepsUntil(start: CubeState, from: CubeState, outcome: Outcome | readonly Outcome[], trigger?: boolean, limit = 12): SolveStep[] {
  const out: SolveStep[] = []
  if (checkOutcomes(outcome, start, from)) return out
  for (const step of solverSteps(from, trigger)) {
    out.push(step)
    if (checkOutcomes(outcome, start, step.after) || out.length >= limit) break
  }
  return out
}

const playCache = new Map<string, ResolvedPlay>()

function buildPlay(play: Play): ResolvedPlay {
  const start = resolveScene(play.scene)
  if (play.alg !== undefined) {
    const moves = parseAlg(play.alg)
    const entry = play.algorithm ? getAlgorithm(play.algorithm) : undefined
    const repetitions = entry ? repetitionsOf(entry.moves, moves) : 0
    return {
      start,
      end: applyAlg(start, moves),
      moves,
      segments: [
        {
          kind: entry ? 'algorithm' : 'turn',
          label: play.label ?? (entry ? timesLabel(entry.name, Math.max(1, repetitions)) : 'Your moves'),
          moves,
          start: 0,
          algorithmId: entry?.id,
          repetitions: repetitions > 0 ? repetitions : undefined,
        },
      ],
      steps: [],
      pieces: [],
      targets: [],
    }
  }
  const steps: SolveStep[] = []
  if (play.toStageEnd) steps.push(...stageSteps(start, play.toStageEnd, play.trigger))
  else {
    const count = play.steps ?? 1
    for (const step of solverSteps(start, play.trigger)) {
      steps.push(step)
      if (steps.length >= count) break
    }
  }
  const moves: Move[] = []
  const segments: PlaySegment[] = []
  for (const step of steps) {
    segments.push(...segmentsOfStep(step, moves.length))
    moves.push(...step.moves)
  }
  const focus = steps.find((s) => s.kind === 'turn') ?? steps[0]
  return {
    start,
    end: steps.length ? steps[steps.length - 1].after : start,
    moves,
    segments,
    steps,
    pieces: focus ? [...focus.highlight.pieces] : [],
    targets: focus ? [...focus.highlight.targets] : [],
  }
}

/** The start, moves and segments of a play. Deterministic; cached. */
export function resolvePlay(play: Play): ResolvedPlay {
  const key = JSON.stringify(play)
  let resolved = playCache.get(key)
  if (!resolved) {
    resolved = buildPlay(play)
    playCache.set(key, resolved)
  }
  return resolved
}

/** The segment a move index falls in. */
export function segmentAt(play: ResolvedPlay, index: number): PlaySegment | null {
  for (const segment of play.segments) {
    if (index >= segment.start && index < segment.start + segment.moves.length) return segment
  }
  return null
}

// ───────────────────────── Outcomes: what a beat claims happens ─────────────────────────

export type Outcome =
  /** The cube is solved. */
  | { is: 'solved' }
  /** The stage is complete (with every earlier stage, unless `only`). */
  | { is: 'stage'; stage: StageId; only?: boolean }
  /** `by` more of the stage's four pieces are done than before. */
  | { is: 'gain'; stage: StageId; by: number }
  /** The yellow edges on top make this shape. */
  | { is: 'shape'; shape: YellowCrossShape }
  /** The solver's next step is this case. */
  | { is: 'next'; caseId: string }
  /** The piece in this slot is solved. */
  | { is: 'slot-solved'; slot: SlotId }
  /** The piece in this slot is not solved. */
  | { is: 'slot-unsolved'; slot: SlotId }
  /** The cube is exactly as it started. */
  | { is: 'same' }
  /** Something moved, but every centre is where it was. */
  | { is: 'centres-stay' }
  /** The lower two layers are scrambled on purpose: the corner twist is under way. */
  | { is: 'mid-twist' }
  /** The yellow centre is on top. */
  | { is: 'yellow-up' }
  /** The yellow edges match their centres without any more turning of the top. */
  | { is: 'aligned' }

/** Does `after` (reached from `before`) match the claim? */
export function checkOutcome(outcome: Outcome, before: CubeState, after: CubeState): boolean {
  switch (outcome.is) {
    case 'solved':
      return isSolved(after)
    case 'stage':
      return outcome.only ? isStageComplete(after, outcome.stage, { only: true }) : stageDone(after, outcome.stage)
    case 'gain':
      return analyzeCube(after).stages[outcome.stage].done - analyzeCube(before).stages[outcome.stage].done === outcome.by
    case 'shape':
      return yellowCrossShape(after) === outcome.shape
    case 'next':
      return nextBeginnerStep(after)?.caseId === outcome.caseId
    case 'slot-solved':
      return pieceAt(after, outcome.slot).solved
    case 'slot-unsolved':
      return !pieceAt(after, outcome.slot).solved
    case 'same':
      return after === before
    case 'centres-stay':
      return after !== before && JSON.stringify(centerColors(after)) === JSON.stringify(centerColors(before))
    case 'mid-twist':
      return analyzeCube(after).twistInProgress !== null
    case 'yellow-up':
      return centerColors(after).U === 'yellow'
    case 'aligned':
      return isStageComplete(after, 'yellow-edges', { aligned: true })
  }
}

/**
 * Has an exercise got there? As `checkOutcomes`, except that "gain N pieces" is met by N *or
 * more* (judged by result, he may well have done the next piece too).
 */
export function outcomeReached(outcomes: Outcome | readonly Outcome[], before: CubeState, after: CubeState): boolean {
  const list = Array.isArray(outcomes) ? (outcomes as readonly Outcome[]) : [outcomes as Outcome]
  return list.every((o) =>
    o.is === 'gain' ? analyzeCube(after).stages[o.stage].done - analyzeCube(before).stages[o.stage].done >= o.by : checkOutcome(o, before, after),
  )
}

export function checkOutcomes(outcomes: Outcome | readonly Outcome[] | undefined, before: CubeState, after: CubeState): boolean {
  if (!outcomes) return true
  const list = Array.isArray(outcomes) ? (outcomes as readonly Outcome[]) : [outcomes as Outcome]
  return list.every((o) => checkOutcome(o, before, after))
}

// ───────────────────────── Following a path by hand ─────────────────────────

export interface PathProgress {
  /** Moves of the path that are done: 0 … path.length. */
  position: number
  /** True when the next move is a half turn and one quarter of it has been made. */
  half: boolean
  /** Moves made since the cube left the path (0 = on the path). Undo that many to get back. */
  off: number
  /** The first move that left the path. */
  wrong: Move | null
  /** `position === path.length` and on the path. */
  complete: boolean
}

/**
 * Where the learner is on a path of expected moves, given every move made since its start.
 * This is the shared path follower (`trackPath` in src/cube) in the shape the guided panel
 * wants: it works on states, not on notation, so two quarter turns count as a half turn and
 * undoing a move by hand is the same as pressing Undo.
 */
export function followPath(start: CubeState, path: readonly Move[], done: readonly Move[]): PathProgress {
  const track = trackPath(start, path, done)
  const off = track.trail.length
  return {
    position: track.position,
    half: off === 0 && track.half !== null,
    off,
    wrong: off > 0 ? track.trail[0] : null,
    complete: pathStatus(track) === 'done',
  }
}

// ───────────────────────── Drills ─────────────────────────

/**
 * The hard cases of each stage: the ones a random cube rarely brings, and the ones children get
 * stuck on. Drills are built so that they come round (every few cubes one of them is asked for),
 * and a stage is only mastered once each has been solved cleanly at least once.
 */
const HAS_HARD: Record<string, (steps: readonly SolveStep[]) => boolean> = {
  'daisy/top-flipped': (steps) => steps.some((s) => s.caseId === 'daisy/top-flipped'),
  'daisy/bottom-flipped': (steps) => steps.some((s) => s.caseId === 'daisy/bottom-flipped'),
  'white-corners/twisted': (steps) => steps.some((s) => s.caseId === 'white-corners/twisted-trigger'),
  'white-corners/wrong-slot': (steps) => steps.some((s) => s.caseId === 'white-corners/pop-wrong-slot'),
  'middle-layer/left': (steps) => steps.some((s) => s.caseId === 'middle-layer/insert-left'),
  'middle-layer/stuck': (steps) => steps.some((s) => s.caseId === 'middle-layer/kick-out-wrong-slot' || s.caseId === 'middle-layer/kick-out-flipped'),
  'yellow-cross/dot': (steps) => steps.some((s) => s.caseId === 'yellow-cross/dot'),
  'yellow-edges/opposite': (steps) => steps.some((s) => s.caseId === 'yellow-edges/swap-opposite'),
  'yellow-corners-position/none-home': (steps) => steps.some((s) => s.caseId === 'yellow-corners-position/cycle-none-home'),
  'yellow-corners-orient/four-twists': (steps) =>
    steps.some((s) => s.algorithm?.id === 'corner-twist' && s.caseId !== 'yellow-corners-orient/twist-continue' && s.algorithm.repetitions === 4),
}

export const DRILL_HARD: Record<StageId, readonly { id: string; label: string; has: (steps: readonly SolveStep[]) => boolean }[]> = Object.fromEntries(
  STAGE_IDS.map((stage) => [stage, HARD_CASES[stage].map((hard) => ({ ...hard, has: HAS_HARD[`${stage}/${hard.id}`] }))]),
) as unknown as Record<StageId, readonly { id: string; label: string; has: (steps: readonly SolveStep[]) => boolean }[]>

/** The hard cases (ids in `DRILL_HARD`) this practice cube asks for, solved the way the lesson teaches. */
export function drillTags(stage: StageId, state: CubeState): string[] {
  const steps = stageSteps(state, stage, stage === 'white-corners')
  return DRILL_HARD[stage].filter((hard) => hard.has(steps)).map((hard) => hard.id)
}

/** The hard case practice cube `n` is built to contain, if any: every few cubes, each in turn. */
export function drillWants(stage: StageId, n: number): string | null {
  const hard = DRILL_HARD[stage]
  if (hard.length === 0) return null
  const turn = n % (hard.length + 1)
  return turn === 0 ? null : hard[turn - 1].id
}

/**
 * Practice cube number `n` for a stage: a real random cube, solved with the method up to the
 * start of the stage. The stage itself is never already done, and (for the last stage) there is
 * always at least one corner to twist. Every few cubes is chosen to contain one of the stage's
 * hard cases (see `DRILL_HARD`), so a run of easy cubes cannot make up a whole practice.
 */
const drillCache = new Map<string, CubeState>()

export function drillState(stage: StageId, n: number): CubeState {
  const key = `${stage}:${n}`
  let state = drillCache.get(key)
  if (!state) {
    state = buildDrill(stage, n)
    drillCache.set(key, state)
  }
  return state
}

function buildDrill(stage: StageId, n: number): CubeState {
  const wants = drillWants(stage, n)
  for (let attempt = 0; attempt < 600; attempt++) {
    const state = solveToStage(randomHeld(`drill:${stage}:${n}:${attempt}`), stage)
    if (stageDone(state, stage)) continue
    const first = nextBeginnerStep(state)
    if (!first || first.stage !== stage) continue
    if (first.caseId === 'yellow-corners-orient/final-turn') continue
    if (wants && !drillTags(stage, state).includes(wants)) continue
    return state
  }
  throw new Error(`No drill found for ${stage} #${n}`)
}

/** A full scramble for the capstone, in the hold. */
export function capstoneState(n: number): CubeState {
  for (let attempt = 0; attempt < 50; attempt++) {
    const state = randomHeld(`capstone:${n}:${attempt}`)
    if (analyzeCube(state).completed.length === 0) return state
  }
  return randomHeld(`capstone:${n}`)
}

/** What a cube looks like once `stage` is finished (the same example cube for every stage). */
export function afterStageState(stage: StageId): CubeState {
  const next = STAGE_IDS[stageIndex(stage) + 1]
  return next ? resolveScene({ kind: 'stage', stage: next, seed: SHOWCASE_SEED }) : HELD
}

/** The example cube of the path before anything is solved. */
export function scrambledShowcase(): CubeState {
  return resolveScene({ kind: 'random', seed: SHOWCASE_SEED })
}

const SHOWCASE_SEED = 11


// ───────────────────────── A wrong choice, not a broken cube ─────────────────────────

/** The algorithms of a stage whose first moves he might start from the wrong side or hold. */
const CHOICE_ALGORITHMS: Partial<Record<StageId, readonly string[]>> = {
  'middle-layer': ['middle-right', 'middle-left'],
  'yellow-cross': ['yellow-cross'],
  'yellow-edges': ['yellow-edge-swap'],
  'yellow-corners-position': ['corner-cycle'],
  'yellow-corners-orient': ['corner-twist'],
}

/** "He has started an algorithm of the stage" — from where, how far, and whether it would help. */
export interface Excursion {
  algorithm: string
  /** The cube he started it from. */
  from: CubeState
  /** Moves of it made (a half turn counts once when finished). */
  made: number
  /**
   * True when finishing it from there would bring the stage closer (his own way, or his own
   * order); false when it is the right algorithm from the wrong side or hold.
   */
  good: boolean
}

/** Algorithm rounds (not turns) the method needs to finish `stage` from `state`. */
function roundsToFinish(state: CubeState, stage: StageId): number {
  if (stageDone(state, stage)) return 0
  let rounds = 0
  let steps = 0
  for (const step of solverSteps(state)) {
    if (STAGE_IDS.indexOf(step.stage) < STAGE_IDS.indexOf(stage)) rounds += 10 // he broke something
    rounds += step.algorithm?.repetitions ?? 0
    if (stageDone(step.after, stage) || ++steps > 30) break
  }
  return rounds
}

/** Would going from `from` to `to` (one whole algorithm) bring the stage closer? */
function helps(stage: StageId, from: CubeState, to: CubeState): boolean {
  if (stage !== 'middle-layer') return roundsToFinish(to, stage) < roundsToFinish(from, stage)
  // The middle layer: an edge more in place, or a yellow edge sent in to kick out a stuck one.
  const earlier = (state: CubeState) => STAGE_IDS.slice(0, STAGE_IDS.indexOf(stage)).every((s) => isStageComplete(state, s))
  if (!earlier(to)) return false
  const done = (state: CubeState) => analyzeCube(state).stages['middle-layer'].done
  if (done(to) > done(from)) return true
  const top = pieceAt(from, 'UF').stickers.some((s) => s.color === 'yellow')
  const kicked = (['FR', 'FL'] as const).some((slot) => {
    const loc = pieceAt(from, slot)
    return !loc.solved && !loc.stickers.some((s) => s.color === 'yellow') && pieceAt(to, slot).piece !== loc.piece
  })
  return top && kicked && done(to) >= done(from)
}

/**
 * Is he part-way through one of the stage's algorithms? Looks back over the latest `history`
 * (at least the `off` moves that left the plan, plus up to four before them), and if those moves
 * are the start of one of the stage's algorithms, says which and whether it would help.
 */
export function excursion(stage: StageId, state: CubeState, history: readonly Move[], off: number): Excursion | null {
  const ids = CHOICE_ALGORITHMS[stage]
  if (!ids || off === 0 || history.length < off) return null
  for (let k = off; k <= Math.min(history.length, off + 4); k++) {
    const tail = history.slice(history.length - k)
    const from = applyAlg(state, invertAlg(tail))
    for (const id of ids) {
      const entry = getAlgorithm(id)
      if (!entry) continue
      const track = followPath(from, entry.moves, tail)
      if (track.off > 0 || (track.position === 0 && !track.half)) continue
      const good = helps(stage, from, applyAlg(from, entry.moves))
      return { algorithm: id, from, made: track.position, good }
    }
  }
  return null
}

const SIDE_WORD = { R: 'right', L: 'left' } as const

/**
 * What to say about an excursion: kind words that name the decision ("that is the right-hand
 * version, but…") instead of "you broke it". `undo` is how to get back ("Undo `R`").
 */
export function excursionWords(stage: StageId, ex: Excursion, undo: string): { title: string; sub: string } {
  const entry = getAlgorithm(ex.algorithm)!
  if (ex.good) return { title: `Your own way: the ${entry.name}. That works.`, sub: 'Carry on to the end of it.' }
  const centres = centerColors(ex.from)
  switch (stage) {
    case 'middle-layer': {
      const loc = pieceAt(ex.from, 'UF')
      const front = loc.stickers.find((s) => s.face === 'F')!.color
      const top = loc.stickers.find((s) => s.face === 'U')!.color
      const went = ex.algorithm === 'middle-right' ? 'R' : 'L'
      const other = went === 'R' ? 'L' : 'R'
      if (front === 'yellow' || top === 'yellow') return { title: 'That edge has yellow on it — it stays on top.', sub: `${undo}, then find a top edge with no yellow and make its T.` }
      if (front !== centres.F) return { title: `Make the T first: this edge's front sticker is **${front}**, not ${centres.F}.`, sub: `${undo}, then turn the top until it sits above the ${front} centre.` }
      if (top === centres[other]) {
        const alg = getAlgorithm(other === 'R' ? 'middle-right' : 'middle-left')!
        return {
          title: `That is the ${SIDE_WORD[went]}-hand version, but this edge's top sticker is **${top}** — the ${SIDE_WORD[other]} centre's colour.`,
          sub: `${undo}, then go ${SIDE_WORD[other]}: \`${alg.alg}\`.`,
        }
      }
      break
    }
    case 'yellow-cross': {
      const shape = yellowCrossShape(ex.from)
      if (shape === 'L') return { title: 'Right algorithm, wrong hold.', sub: `${undo}, then turn the top so the L points to the back and the left first.` }
      if (shape === 'line') return { title: 'Right algorithm, wrong hold.', sub: `${undo}, then turn the top so the line runs left to right first.` }
      break
    }
    case 'yellow-edges': {
      const matching = (['UF', 'UR', 'UB', 'UL'] as const).filter((slot) => pieceAt(ex.from, slot).solved).length
      if (matching < 2) return { title: 'Not yet — fewer than two edges match.', sub: `${undo}, then turn the top until two match.` }
      return { title: 'Not yet — the matching pair is not at the back and right.', sub: `${undo}, then turn the whole cube until it is.` }
    }
    case 'yellow-corners-position': {
      if (!isStageComplete(ex.from, 'yellow-edges', { aligned: true })) return { title: 'Line up the top first.', sub: `${undo}, then turn the top until every yellow edge matches its centre.` }
      return { title: 'The home corner is not at the front-right yet.', sub: `${undo}, then turn the whole cube until the corner that is home is at the front-right.` }
    }
    case 'yellow-corners-orient': {
      if (pieceAt(ex.from, 'URF').stickers.find((s) => s.face === 'U')?.color === 'yellow') return { title: 'That corner already has yellow on top.', sub: `${undo}, then turn only the top to bring a twisted corner to the workbench.` }
      break
    }
  }
  return { title: `Right algorithm, but not from here.`, sub: `${undo} and look again.` }
}
