/**
 * Stage detection for the beginner (layer-by-layer) method — the brain of the "Where am I?"
 * coach and of lesson goal checks. Works for a cube held in any of the 24 orientations: every
 * definition is phrased in terms of colours and centres, never fixed faces.
 *
 * ## Stage definitions
 *
 * "Solved" for a piece always means: in its home slot with every sticker matching the centre
 * of the face it is on. "The yellow face" is the face with the yellow centre.
 *
 * 1. `daisy` — every white edge is either a *petal* (on the yellow face, white sticker facing
 *    the same way as the yellow centre) or already solved in the white cross. Four petals is
 *    the classic daisy; four solved edges is the finished cross, at which point the daisy is
 *    simply "passed". The mix in between is what the cube looks like while petals are being
 *    dropped, so the stage stays complete all the way through the next one.
 * 2. `white-cross` — all four white edges solved (white on the white face AND the side sticker
 *    matching its side centre).
 * 3. `white-corners` — all four white corners solved (so, with the cross, the whole white layer).
 * 4. `middle-layer` — the four edges without white or yellow are solved.
 * 5. `yellow-cross` — all four yellow edges show yellow on the yellow face. Where they sit
 *    round the cross does not matter yet.
 * 6. `yellow-edges` — the four yellow edges are solved *after some turn of the yellow face*
 *    (0, 1, 2 or 3 quarter turns). Alignment is NOT required: a top layer that is one turn
 *    away from matching counts. `CubeAnalysis.topTurn` says which turn lines it up, and
 *    `isStageComplete(state, stage, { aligned: true })` is the strict version.
 * 7. `yellow-corners-position` — with the same turn of the yellow face that solves the yellow
 *    edges, every yellow corner is in its home slot. Twist does not matter.
 * 8. `yellow-corners-orient` — the whole cube is solved (aligned, every sticker).
 *
 * A stage is *complete* only if its own goal and the goals of all earlier stages are met.
 *
 * ## The corner-twist exception
 *
 * The last algorithm (R' D' R D) deliberately scrambles the lower layers until every corner has
 * been twisted. Taken literally, such a cube has "lost its white cross". `analyzeCube`
 * recognises these states (any number of twists into the algorithm, cube held any way round)
 * and reports them as what they are: stages 1–7 complete, working on `yellow-corners-orient`,
 * with `twistInProgress` set. `isStageComplete` stays literal.
 */
import {
  CORNERS,
  EDGES,
  FACELETS,
  FACES,
  OPPOSITE_FACE,
  SLOT_FACELETS,
  slotsOnFace,
  type CornerId,
  type EdgeId,
  type Face,
  type PieceId,
  type SlotId,
} from '../geometry'
import { applyAlg } from '../moves'
import { invertAlg, type Move, type RotationMove } from '../notation'
import { findPiece, homeSlot, identifyStickers, isSlotSolved } from '../pieces'
import { STAGE_IDS, type StageId } from '../stages'
import { SOLVED, faceOfColor, isSolved, type CubeState } from '../state'
import {
  MIDDLE_EDGES,
  TWIST,
  WHITE_CORNERS,
  WHITE_EDGES,
  YELLOW_CORNERS,
  YELLOW_EDGES,
  canonicalRotation,
  faceTurn,
  repeatAlg,
} from './shared'

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

/** Progress on one stage. Slots and facelets refer to the cube exactly as it was passed in. */
export interface StageProgress {
  stage: StageId
  /** This stage's goal is met AND every earlier stage is complete. */
  complete: boolean
  /** This stage's own goal is met, whatever the earlier stages look like. */
  goalMet: boolean
  /** How many of this stage's pieces are done. */
  done: number
  /** How many pieces the stage is about (always 4). */
  total: number
  /** One short sentence: "3 of 4 white edges are in place." */
  summary: string
  /** The stage's pieces that are done. */
  donePieces: PieceId[]
  /** The stage's pieces that still need work. */
  remainingPieces: PieceId[]
  /** Where the remaining pieces belong (their home slots, or the free petal spots for the daisy). */
  targetSlots: SlotId[]
  /** Facelets currently covered by the stickers of `donePieces` (piece by piece, in no particular order). */
  doneFacelets: number[]
  /** Facelets currently covered by the stickers of `remainingPieces` (piece by piece, in no particular order). */
  remainingFacelets: number[]
}

/** What the yellow edges on the yellow face look like. */
export type YellowCrossShape = 'dot' | 'L' | 'line' | 'cross' | 'other'

export interface SuggestedHold {
  /** Whole-cube rotations that bring the cube to the hold; empty if it is already held right. */
  rotation: RotationMove[]
  /** True when `rotation` is empty. */
  alreadyHeld: boolean
  /** Kid-readable: "Hold the cube with the yellow centre on top and white underneath." */
  description: string
}

/** Set while the corner-twist algorithm is underway and the lower layers are scrambled on purpose. */
export interface TwistInProgress {
  /** How many corner twists (R' D' R D) the lower layers are away from solved, 1–5, counted forwards. */
  twistsDone: number
  /** How many more twists would restore the lower layers (6 - twistsDone). */
  twistsToRestore: number
}

export interface CubeAnalysis {
  state: CubeState
  /** True when every face is one colour. */
  solved: boolean
  /** Per-stage progress, by id. */
  stages: Record<StageId, StageProgress>
  /** The same progress records in teaching order. */
  stageList: StageProgress[]
  /** The stages that are complete, in order (always a prefix of `STAGE_IDS`). */
  completed: StageId[]
  /** The stage to work on now; null when the cube is solved. */
  current: StageId | null
  /** How to hold the cube for the current stage: yellow centre on top, white underneath. */
  hold: SuggestedHold
  /** The shape the yellow edges make on the yellow face. */
  yellowCrossShape: YellowCrossShape
  /**
   * When the yellow edges only need the yellow face turned to match their centres: that turn,
   * as a move for the cube as it is held now. Null if they already match or cannot match yet.
   */
  topTurn: Move | null
  /** Non-null while the corner twist is in progress (see the module comment). */
  twistInProgress: TwistInProgress | null
}

export interface StageCheckOptions {
  /**
   * Check only this stage's own goal and ignore earlier stages — for practice setups where the
   * rest of the cube is deliberately scrambled or irrelevant. Default false (cumulative).
   */
  only?: boolean
  /**
   * For `yellow-edges` and `yellow-corners-position`: also require the yellow face to be turned
   * so the edges really match their centres. Default false.
   */
  aligned?: boolean
}

// ---------------------------------------------------------------------------------------------
// Low-level facts
// ---------------------------------------------------------------------------------------------

function yellowFace(state: CubeState): Face {
  return faceOfColor(state, 'yellow')
}

/** True when this white edge is a daisy petal: on the yellow face with white facing the same way. */
export function isPetal(state: CubeState, edge: EdgeId): boolean {
  return findPiece(state, edge).facing.white === yellowFace(state)
}

function solvedPieces<T extends PieceId>(state: CubeState, pieces: readonly T[]): T[] {
  return pieces.filter((p) => findPiece(state, p).solved)
}

function homeCorners(state: CubeState): CornerId[] {
  return YELLOW_CORNERS.filter((c) => findPiece(state, c).slot === homeSlot(state, c))
}

// --- Fast, allocation-free versions of the same facts (the solver asks these on every step) ---

const FACE_START: Record<Face, number> = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 }
const WHITE = 'U'
const YELLOW = 'D'
const EDGE_OFFSETS = [1, 3, 5, 7] as const

const EDGE_SLOTS_ON = {} as Record<Face, SlotId[]>
const CORNER_SLOTS_ON = {} as Record<Face, SlotId[]>
/** The four edge slots that touch neither this face nor the opposite one. */
const BELT_SLOTS_FOR = {} as Record<Face, SlotId[]>
for (const face of FACES) {
  EDGE_SLOTS_ON[face] = slotsOnFace(face).filter((s) => s.length === 2)
  CORNER_SLOTS_ON[face] = slotsOnFace(face).filter((s) => s.length === 3)
  BELT_SLOTS_FOR[face] = EDGES.filter((s) => !s.includes(face) && !s.includes(OPPOSITE_FACE[face]))
}

function countSolved(state: CubeState, slots: readonly SlotId[]): number {
  let n = 0
  for (const slot of slots) if (isSlotSolved(state, slot)) n++
  return n
}

/** How many edge stickers on `face` show the colour `letter`. */
function countEdgeStickers(state: CubeState, face: Face, letter: string): number {
  const start = FACE_START[face]
  let n = 0
  for (const offset of EDGE_OFFSETS) if (state[start + offset] === letter) n++
  return n
}

/** True when the piece in this corner slot has the colours of the three centres around it. */
function isCornerHome(state: CubeState, slot: SlotId): boolean {
  const a = state[FACE_START[slot[0] as Face] + 4]
  const b = state[FACE_START[slot[1] as Face] + 4]
  const c = state[FACE_START[slot[2] as Face] + 4]
  for (const f of SLOT_FACELETS[slot]) {
    const letter = state[f]
    if (letter !== a && letter !== b && letter !== c) return false
  }
  return true
}

function countHomeCorners(state: CubeState, y: Face): number {
  let n = 0
  for (const slot of CORNER_SLOTS_ON[y]) if (isCornerHome(state, slot)) n++
  return n
}

export interface TopTurn {
  /** Clockwise quarter turns (0–3) of the yellow face that make the most yellow edges match. */
  turn: number
  /** The same turn as a move ([] when no turn is needed). */
  turnMoves: Move[]
  /** How many yellow edges are solved after that turn. */
  edges: number
  /** How many yellow corners are in their home slots after that turn. */
  corners: number
}

/** How far the yellow-face layer is turned away from matching the side centres. */
export function topTurn(state: CubeState): TopTurn {
  const y = yellowFace(state)
  let best: TopTurn | null = null
  for (const turn of TURN_ORDER) {
    const turnMoves = faceTurn(y, turn)
    const s = turn ? applyAlg(state, turnMoves) : state
    const edges = countSolved(s, EDGE_SLOTS_ON[y])
    if (!best || edges > best.edges) best = { turn, turnMoves, edges, corners: countHomeCorners(s, y) }
    if (edges === 4) break
  }
  return best!
}

function bestCornerCount(state: CubeState): number {
  const y = yellowFace(state)
  let best = 0
  for (const turn of TURN_ORDER) {
    best = Math.max(best, countHomeCorners(turn ? applyAlg(state, faceTurn(y, turn)) : state, y))
  }
  return best
}

function firstTwoLayersSolved(state: CubeState): boolean {
  const y = yellowFace(state)
  const w = OPPOSITE_FACE[y]
  return (
    countSolved(state, EDGE_SLOTS_ON[w]) === 4 &&
    countSolved(state, CORNER_SLOTS_ON[w]) === 4 &&
    countSolved(state, BELT_SLOTS_FOR[y]) === 4
  )
}

/** Quarter turns of the yellow face, in the order a person would try them: none, one way, the other, half. */
const TURN_ORDER = [0, 1, 3, 2] as const

export interface TopLayerInfo {
  /** Clockwise quarter turns (0–3) of the yellow face that make the most yellow edges match. */
  turn: number
  /** The same turn as a move ([] when no turn is needed). */
  turnMoves: Move[]
  /** Yellow edges that are solved after that turn. */
  edges: EdgeId[]
  /** Yellow corners that are in their home slots after that turn. */
  corners: CornerId[]
}

/** How the yellow-face layer lines up with the side centres (see `TopLayerInfo`). */
export function topLayerInfo(state: CubeState): TopLayerInfo {
  const { turn, turnMoves } = topTurn(state)
  const s = applyAlg(state, turnMoves)
  return { turn, turnMoves, edges: solvedPieces(s, YELLOW_EDGES), corners: homeCorners(s) }
}

/** The shape made by the yellow stickers of the edge slots on the yellow face. */
export function yellowCrossShape(state: CubeState): YellowCrossShape {
  const y = yellowFace(state)
  const letter = state[SLOT_FACELETS[y][0]]
  const up = slotsOnFace(y)
    .filter((s) => s.length === 2)
    .filter((s) => state[SLOT_FACELETS[s][s.indexOf(y)]] === letter)
  if (up.length === 0) return 'dot'
  if (up.length === 4) return 'cross'
  if (up.length !== 2) return 'other'
  const side = (s: SlotId) => s.replace(y, '') as Face
  return OPPOSITE_FACE[side(up[0])] === side(up[1]) ? 'line' : 'L'
}

// ---------------------------------------------------------------------------------------------
// Holding the cube
// ---------------------------------------------------------------------------------------------

const YELLOW_UP_OPTIONS: readonly (readonly RotationMove[])[] = [[], ['z2'], ['x'], ["x'"], ['z'], ["z'"]]

/**
 * The whole-cube rotation that puts the yellow centre on top (white underneath) with the least
 * fuss: empty if yellow is already up; `z2` (front stays in front) if yellow is underneath.
 */
export function yellowUpRotation(state: CubeState): RotationMove[] {
  for (const rot of YELLOW_UP_OPTIONS) {
    if (yellowFace(applyAlg(state, rot)) === 'U') return [...rot]
  }
  throw new Error('This cube has no yellow centre')
}

// ---------------------------------------------------------------------------------------------
// The corner-twist exception
// ---------------------------------------------------------------------------------------------

export interface TwistPhase {
  /** Rotation from the given state to the hold the twist is being done in (yellow up, working column front-right). */
  hold: RotationMove[]
  /** The cube in that hold. */
  held: CubeState
  /** Corner twists done so far, modulo 6 (1–5). */
  twistsDone: number
  /** `held` with the outstanding twists undone at the front-right: lower two layers solved. */
  base: CubeState
}

/** The fewest solved white edges / white corners / middle edges a mid-twist cube can have. */
const TWIST_FLOOR = (() => {
  const held = applyAlg(SOLVED, ['z2'])
  const floor = { whiteEdges: 4, whiteCorners: 4, middleEdges: 4 }
  for (let k = 1; k <= 5; k++) {
    const s = applyAlg(held, repeatAlg(TWIST, k))
    floor.whiteEdges = Math.min(floor.whiteEdges, solvedPieces(s, WHITE_EDGES).length)
    floor.whiteCorners = Math.min(floor.whiteCorners, solvedPieces(s, WHITE_CORNERS).length)
    floor.middleEdges = Math.min(floor.middleEdges, solvedPieces(s, MIDDLE_EDGES).length)
  }
  return floor
})()

const Y_ROTATIONS: readonly (readonly RotationMove[])[] = [[], ['y'], ["y'"], ['y2']]

/**
 * Recognise a cube that is part-way through the corner-twist stage: the lower two layers are
 * exactly 1–5 corner twists (R' D' R D at one column) away from solved, the yellow edges match
 * their centres after some turn of the top, and the yellow corners are in their places for that
 * same turn. Returns null for every other cube (including one whose lower layers are solved).
 */
export function detectTwistPhase(state: CubeState): TwistPhase | null {
  // Cheap rejection first: this runs on every hint request.
  const y = yellowFace(state)
  const w = OPPOSITE_FACE[y]
  if (countEdgeStickers(state, y, YELLOW) < 4) return null
  if (countSolved(state, EDGE_SLOTS_ON[w]) < TWIST_FLOOR.whiteEdges) return null
  if (countSolved(state, BELT_SLOTS_FOR[y]) < TWIST_FLOOR.middleEdges) return null
  if (countSolved(state, CORNER_SLOTS_ON[w]) < TWIST_FLOOR.whiteCorners) return null
  if (firstTwoLayersSolved(state)) return null

  const up = yellowUpRotation(state)
  const upright = applyAlg(state, up)
  for (const spin of Y_ROTATIONS) {
    const held = applyAlg(upright, spin)
    for (let k = 1; k <= 5; k++) {
      const base = applyAlg(held, repeatAlg(TWIST, 6 - k))
      if (!firstTwoLayersSolved(base)) continue
      const top = topTurn(base)
      if (top.edges === 4 && top.corners === 4) {
        return { hold: canonicalRotation([...up, ...spin]), held, twistsDone: k, base }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Stage goals
// ---------------------------------------------------------------------------------------------

type Goal = (state: CubeState, options: StageCheckOptions) => boolean

const GOALS: Record<StageId, Goal> = {
  daisy: (s) => {
    const y = yellowFace(s)
    return countEdgeStickers(s, y, WHITE) + countSolved(s, EDGE_SLOTS_ON[OPPOSITE_FACE[y]]) === 4
  },
  'white-cross': (s) => countSolved(s, EDGE_SLOTS_ON[OPPOSITE_FACE[yellowFace(s)]]) === 4,
  'white-corners': (s) => countSolved(s, CORNER_SLOTS_ON[OPPOSITE_FACE[yellowFace(s)]]) === 4,
  'middle-layer': (s) => countSolved(s, BELT_SLOTS_FOR[yellowFace(s)]) === 4,
  'yellow-cross': (s) => countEdgeStickers(s, yellowFace(s), YELLOW) === 4,
  'yellow-edges': (s, o) => {
    if (o.aligned) return countSolved(s, EDGE_SLOTS_ON[yellowFace(s)]) === 4
    return topTurn(s).edges === 4
  },
  'yellow-corners-position': (s, o) => {
    const y = yellowFace(s)
    if (o.only) return (o.aligned ? countHomeCorners(s, y) : bestCornerCount(s)) === 4
    if (o.aligned) return countSolved(s, EDGE_SLOTS_ON[y]) === 4 && countHomeCorners(s, y) === 4
    const top = topTurn(s)
    return top.edges === 4 && top.corners === 4
  },
  'yellow-corners-orient': (s, o) => (o.only ? countSolved(s, CORNER_SLOTS_ON[yellowFace(s)]) === 4 : isSolved(s)),
}

/**
 * Is this stage complete? By default that means the stage's goal and every earlier stage's goal
 * (see the definitions at the top of this file), so it can be used directly as a lesson goal
 * check on a real, whole cube.
 *
 * `{ only: true }` checks just this stage's own pieces — for drills where the rest of the cube
 * does not matter (e.g. `daisy` on a scrambled cube, `yellow-cross` on a cube set up from a
 * demo). `{ aligned: true }` makes `yellow-edges` / `yellow-corners-position` insist that the
 * top layer is also turned to match the centres.
 */
export function isStageComplete(state: CubeState, stage: StageId, options: StageCheckOptions = {}): boolean {
  const index = STAGE_IDS.indexOf(stage)
  if (index < 0) throw new Error(`Unknown stage: ${String(stage)}`)
  if (!GOALS[stage](state, options)) return false
  if (options.only) return true
  for (let k = 0; k < index; k++) if (!GOALS[STAGE_IDS[k]](state, {})) return false
  return true
}

/** True for the classic daisy: all four white edges are petals round the yellow centre. */
export function isDaisy(state: CubeState): boolean {
  return WHITE_EDGES.every((e) => isPetal(state, e))
}

/** The first stage that is not complete, or null for a solved cube. Literal (no twist exception). */
export function firstIncompleteStage(state: CubeState): StageId | null {
  for (const stage of STAGE_IDS) if (!GOALS[stage](state, {})) return stage
  return null
}

// ---------------------------------------------------------------------------------------------
// analyzeCube
// ---------------------------------------------------------------------------------------------

/** The little that stage detection needs to know about a piece (much cheaper than a full `PieceLocation`). */
interface PieceFacts {
  slot: SlotId
  solved: boolean
  /** The face its first-named sticker is on: the white sticker of a white piece, the yellow one of a yellow piece. */
  mainFace: Face
}
type PieceIndex = Map<PieceId, PieceFacts>

/** Every corner and edge, looked up once. */
function indexPieces(state: CubeState): PieceIndex {
  const index: PieceIndex = new Map()
  for (const slot of CORNERS_AND_EDGES) {
    const facelets = SLOT_FACELETS[slot]
    let letters = ''
    for (const f of facelets) letters += state[f]
    const id = identifyStickers(letters)
    if (!id) throw new Error(`The stickers at ${slot} do not make a real piece`)
    index.set(id.piece, {
      slot,
      solved: isSlotSolved(state, slot),
      mainFace: FACELETS[facelets[id.orientation % facelets.length]].face,
    })
  }
  return index
}

const CORNERS_AND_EDGES: readonly SlotId[] = [...CORNERS, ...EDGES]

/** The piece sitting in a slot. */
function pieceIn(state: CubeState, slot: SlotId): PieceId {
  let letters = ''
  for (const f of SLOT_FACELETS[slot]) letters += state[f]
  const id = identifyStickers(letters)
  if (!id) throw new Error(`The stickers at ${slot} do not make a real piece`)
  return id.piece
}

const HOME_SLOTS = new Map<string, Map<PieceId, SlotId>>()

/** `homeSlot`, remembered per way of holding the cube. */
function homeSlotOf(state: CubeState, piece: PieceId): SlotId {
  const key = state[4] + state[13] + state[22] + state[31] + state[40] + state[49]
  let homes = HOME_SLOTS.get(key)
  if (!homes) HOME_SLOTS.set(key, (homes = new Map()))
  let slot = homes.get(piece)
  if (!slot) homes.set(piece, (slot = homeSlot(state, piece)))
  return slot
}

/** [the pieces, "... is ...", "... are ..."] — "3 of 4 white edges are in place." */
const WORDS: Record<StageId, [pieces: string, one: string, many: string]> = {
  daisy: ['white edges', 'is a petal next to the yellow centre', 'are petals next to the yellow centre'],
  'white-cross': ['white edges', 'is in place', 'are in place'],
  'white-corners': ['white corners', 'is in place', 'are in place'],
  'middle-layer': ['middle-layer edges', 'is in place', 'are in place'],
  'yellow-cross': ['yellow edges', 'has yellow facing up', 'have yellow facing up'],
  'yellow-edges': ['yellow edges', 'matches its side centre', 'match their side centres'],
  'yellow-corners-position': ['yellow corners', 'is in its own place', 'are in their own places'],
  'yellow-corners-orient': ['yellow corners', 'has yellow facing up', 'have yellow facing up'],
}

function summaryFor(stage: StageId, done: number): string {
  const [pieces, one, many] = WORDS[stage]
  return `${done} of 4 ${pieces} ${done === 1 ? one : many}.`
}

/**
 * Everything the "Where am I?" coach needs to know about a cube, held any way round:
 * which stages are complete, which one to work on, what is done and what is left in each
 * (as pieces, slots and facelets to highlight), and how to hold the cube.
 */
export function analyzeCube(state: CubeState): CubeAnalysis {
  const twist = detectTwistPhase(state)
  // While the corner twist is underway, judge stages 1–7 on the cube with the twists undone.
  const ref = twist ? applyAlg(twist.base, invertAlg(twist.hold)) : state
  const y = yellowFace(state)
  const live = indexPieces(state)
  const at = twist ? indexPieces(ref) : live
  const pick = <T extends PieceId>(index: PieceIndex, pieces: readonly T[], test: (loc: PieceFacts) => boolean) =>
    pieces.filter((p) => test(index.get(p)!))

  // The top layer, turned to where its edges match best (and, failing that, its corners).
  const top = topTurn(ref)
  const turned = top.turn ? applyAlg(ref, top.turnMoves) : ref
  const edgesMatching = EDGE_SLOTS_ON[y].filter((slot) => isSlotSolved(turned, slot)).map((slot) => pieceIn(turned, slot))
  const homeIn = (s: CubeState) => CORNER_SLOTS_ON[y].filter((slot) => isCornerHome(s, slot)).map((slot) => pieceIn(s, slot))
  let cornersHome = homeIn(turned)
  if (top.edges < 4 && cornersHome.length < 4) {
    for (const turn of TURN_ORDER) {
      const s = turn ? applyAlg(ref, faceTurn(y, turn)) : ref
      if (countHomeCorners(s, y) > cornersHome.length) cornersHome = homeIn(s)
    }
  }
  const inOrder = <T extends PieceId>(pieces: readonly T[], found: readonly PieceId[]) => pieces.filter((p) => found.includes(p))

  const donePieces: Record<StageId, PieceId[]> = {
    daisy: pick(at, WHITE_EDGES, (loc) => loc.solved || loc.mainFace === y),
    'white-cross': pick(at, WHITE_EDGES, (loc) => loc.solved),
    'white-corners': pick(at, WHITE_CORNERS, (loc) => loc.solved),
    'middle-layer': pick(at, MIDDLE_EDGES, (loc) => loc.solved),
    'yellow-cross': pick(at, YELLOW_EDGES, (loc) => loc.mainFace === y),
    'yellow-edges': inOrder(YELLOW_EDGES, edgesMatching),
    'yellow-corners-position': inOrder(YELLOW_CORNERS, cornersHome),
    'yellow-corners-orient': pick(live, YELLOW_CORNERS, (loc) => loc.mainFace === y),
  }
  const allPieces: Record<StageId, readonly PieceId[]> = {
    daisy: WHITE_EDGES,
    'white-cross': WHITE_EDGES,
    'white-corners': WHITE_CORNERS,
    'middle-layer': MIDDLE_EDGES,
    'yellow-cross': YELLOW_EDGES,
    'yellow-edges': YELLOW_EDGES,
    'yellow-corners-position': YELLOW_CORNERS,
    'yellow-corners-orient': YELLOW_CORNERS,
  }
  const faceletsOf = (pieces: readonly PieceId[]) => {
    const out: number[] = []
    for (const p of pieces) out.push(...SLOT_FACELETS[live.get(p)!.slot])
    return out
  }

  const solved = isSolved(state)
  const stageList: StageProgress[] = []
  let earlierComplete = true
  for (const stage of STAGE_IDS) {
    const done = donePieces[stage]
    const remaining = allPieces[stage].filter((p) => !done.includes(p))
    const goalMet = stage === 'yellow-corners-orient' ? solved : done.length === 4
    const complete: boolean = earlierComplete && goalMet
    earlierComplete = complete
    let targetSlots: SlotId[]
    if (stage === 'daisy') {
      // The free petal spots: edge slots round the yellow centre that do not hold a petal yet.
      targetSlots = remaining.length
        ? EDGE_SLOTS_ON[y].filter((s) => state[SLOT_FACELETS[s][s.indexOf(y)]] !== WHITE)
        : []
    } else {
      targetSlots = remaining.map((p) => homeSlotOf(state, p))
    }
    stageList.push({
      stage,
      complete,
      goalMet,
      done: done.length,
      total: 4,
      summary: summaryFor(stage, done.length),
      donePieces: [...done],
      remainingPieces: remaining,
      targetSlots,
      doneFacelets: faceletsOf(done),
      remainingFacelets: faceletsOf(remaining),
    })
  }

  const stages = {} as Record<StageId, StageProgress>
  for (const p of stageList) stages[p.stage] = p
  const completed = stageList.filter((p) => p.complete).map((p) => p.stage)
  const current = solved ? null : (stageList.find((p) => !p.complete)?.stage ?? null)

  const rotation = twist ? twist.hold : yellowUpRotation(state)
  const hold: SuggestedHold = {
    rotation,
    alreadyHeld: rotation.length === 0,
    description: twist
      ? rotation.length === 0
        ? 'Keep holding the cube exactly like this — yellow on top — until the last corner is twisted.'
        : 'Hold the cube with the yellow centre on top and the scrambled column at the front-right, the way it was when you started twisting corners.'
      : rotation.length === 0
        ? 'You are holding it right: yellow centre on top, white centre underneath.'
        : 'Hold the cube with the yellow centre on top and the white centre underneath.',
  }

  const lineUp = !twist && top.edges === 4 && top.turn !== 0 ? top.turnMoves[0] : null

  return {
    state,
    solved,
    stages,
    stageList,
    completed,
    current,
    hold,
    yellowCrossShape: yellowCrossShape(state),
    topTurn: lineUp,
    twistInProgress: twist ? { twistsDone: twist.twistsDone, twistsToRestore: 6 - twist.twistsDone } : null,
  }
}
