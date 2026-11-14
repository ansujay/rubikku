/**
 * Small helpers shared by stage detection and the beginner solver.
 *
 * Pieces are named by their colours through their home slot on a standard cube (white = U,
 * yellow = D), so the piece groups below are the same however the cube is held.
 */
import {
  FACE_COLOR,
  FACES,
  SLOT_FACELETS,
  pieceColors,
  type Color,
  type CornerId,
  type EdgeId,
  type Face,
  type PieceId,
  type SlotId,
} from '../geometry'
import { applyAlg } from '../moves'
import { makeMove, parseAlg, type Move, type RotationMove } from '../notation'
import { findPiece } from '../pieces'
import { SOLVED, type CubeState } from '../state'
import { CUBE_ROTATIONS } from '../moves'

/** The four white edges (the daisy petals / the white cross). */
export const WHITE_EDGES: readonly EdgeId[] = ['UF', 'UR', 'UB', 'UL']
/** The four white corners. */
export const WHITE_CORNERS: readonly CornerId[] = ['URF', 'UFL', 'ULB', 'UBR']
/** The four middle-layer edges (no white, no yellow). */
export const MIDDLE_EDGES: readonly EdgeId[] = ['FR', 'FL', 'BL', 'BR']
/** The four yellow edges (the yellow cross). */
export const YELLOW_EDGES: readonly EdgeId[] = ['DF', 'DR', 'DB', 'DL']
/** The four yellow corners. */
export const YELLOW_CORNERS: readonly CornerId[] = ['DFR', 'DLF', 'DBL', 'DRB']

/** The corner twist, "R' D' R D" — the only algorithm that leaves the lower layers scrambled between steps. */
export const TWIST: readonly Move[] = parseAlg("R' D' R D")

/** Colour of the centre of a face. */
export function centerColor(state: CubeState, face: Face): Color {
  return FACE_COLOR[state[FACES.indexOf(face) * 9 + 4] as Face]
}

/** A turn of `face` by `quarters` clockwise quarter turns (0 gives no move). */
export function faceTurn(face: Face, quarters: number): Move[] {
  const move = makeMove(face, quarters)
  return move ? [move] : []
}

/** `alg` repeated `times` times. */
export function repeatAlg(alg: readonly Move[], times: number): Move[] {
  const out: Move[] = []
  for (let k = 0; k < times; k++) out.push(...alg)
  return out
}

/** Facelet numbers of the stickers of these pieces, wherever the pieces are right now. */
export function faceletsOfPieces(state: CubeState, pieces: readonly PieceId[]): number[] {
  const out: number[] = []
  for (const p of pieces) for (const s of findPiece(state, p).stickers) out.push(s.facelet)
  return out.sort((a, b) => a - b)
}

/** Facelet numbers of these slots. */
export function faceletsOfSlots(slots: readonly SlotId[]): number[] {
  const out: number[] = []
  for (const s of slots) out.push(...SLOT_FACELETS[s])
  return out.sort((a, b) => a - b)
}

/** "white-red edge", "white-red-green corner", "red centre". */
export function pieceName(piece: PieceId): string {
  const colors = pieceColors(piece).join('-')
  return piece.length === 3 ? `${colors} corner` : piece.length === 2 ? `${colors} edge` : `${colors} centre`
}

const FACE_WORD: Record<Face, string> = { U: 'top', D: 'bottom', F: 'front', B: 'back', R: 'right', L: 'left' }

/** "front", "right", "top" ... — a face as a place, in lower case for use inside a sentence. */
export function faceWord(face: Face): string {
  return FACE_WORD[face]
}

function centersKey(state: string): string {
  let key = ''
  for (let f = 0; f < 6; f++) key += state[f * 9 + 4]
  return key
}

const ROTATION_BY_RESULT: ReadonlyMap<string, readonly RotationMove[]> = new Map(
  CUBE_ROTATIONS.map((rot) => [centersKey(applyAlg(SOLVED, rot)), rot]),
)

/** The shortest rotation sequence equal to `rotation` (e.g. "z2 y2" -> "x2"). */
export function canonicalRotation(rotation: readonly Move[]): RotationMove[] {
  return [...ROTATION_BY_RESULT.get(centersKey(applyAlg(SOLVED, rotation)))!]
}

/** Thrown when the solver or analyser meets a cube that cannot be a real, solvable cube. */
export class BeginnerSolverError extends Error {
  /** The state the solver was looking at when it gave up. */
  readonly state: CubeState
  constructor(message: string, state: CubeState) {
    super(`${message} (state: ${state})`)
    this.name = 'BeginnerSolverError'
    this.state = state
  }
}
