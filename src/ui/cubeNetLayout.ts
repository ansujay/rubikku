/**
 * Geometry of the unfolded cube net used by <CubeNet>. Pure, so it can be unit-tested.
 *
 * Facelets are numbered as in the engine's 54-character state string: faces in the order
 * U R F D L B, each read row by row. The net is the usual cross:
 *
 *            U
 *          L F R B
 *            D
 *
 * drawn on a 12 × 9 grid of sticker cells.
 */
import { FACE_COLOR, type CubeColor, type Face } from './colors'

export const NET_FACE_ORDER: readonly Face[] = ['U', 'R', 'F', 'D', 'L', 'B']
export const NET_COLS = 12
export const NET_ROWS = 9

/** Top-left cell of each face on the 12 × 9 grid. */
export const NET_FACE_ORIGIN: Readonly<Record<Face, { col: number; row: number }>> = {
  U: { col: 3, row: 0 },
  L: { col: 0, row: 3 },
  F: { col: 3, row: 3 },
  R: { col: 6, row: 3 },
  B: { col: 9, row: 3 },
  D: { col: 3, row: 6 },
}

/** Names a child understands for where each face sits when the cube is held normally. */
export const NET_FACE_LABEL: Readonly<Record<Face, string>> = {
  U: 'Top',
  D: 'Bottom',
  F: 'Front',
  B: 'Back',
  R: 'Right',
  L: 'Left',
}

export interface NetCell {
  /** Facelet number, 0…53. */
  index: number
  face: Face
  /** 0…2 within the face. */
  row: number
  col: number
  /** Cell on the 12 × 9 net grid. */
  netRow: number
  netCol: number
  isCenter: boolean
}

export const NET_CELLS: readonly NetCell[] = NET_FACE_ORDER.flatMap((face, f) =>
  Array.from({ length: 9 }, (_, i): NetCell => {
    const row = Math.floor(i / 3)
    const col = i % 3
    const origin = NET_FACE_ORIGIN[face]
    return { index: f * 9 + i, face, row, col, netRow: origin.row + row, netCol: origin.col + col, isCenter: i === 4 }
  }),
)

const CELL_AT = new Map<string, number>(NET_CELLS.map((cell) => [`${cell.netRow},${cell.netCol}`, cell.index]))

/** Facelet at a net grid cell, or -1 where the net is empty. */
export const netCellAt = (netRow: number, netCol: number): number => CELL_AT.get(`${netRow},${netCol}`) ?? -1

export type NetDirection = 'up' | 'down' | 'left' | 'right'

const STEP: Record<NetDirection, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }

/**
 * The sticker one step away on the flat net, for arrow-key movement. Moving off the top or
 * bottom arm sideways, or off any outer edge, stays put — except along the middle band, which
 * wraps around (Back's right edge meets Left's left edge on a real cube).
 */
export function netNeighbor(index: number, direction: NetDirection): number {
  const cell = NET_CELLS[index]
  if (!cell) return index
  const [dr, dc] = STEP[direction]
  const row = cell.netRow + dr
  let col = cell.netCol + dc
  const inBand = cell.netRow >= 3 && cell.netRow <= 5
  if (inBand && dr === 0) col = (col + NET_COLS) % NET_COLS
  const next = netCellAt(row, col)
  return next >= 0 ? next : index
}

const FACE_LETTERS = new Set<string>(NET_FACE_ORDER)

/**
 * Normalise what <CubeNet> accepts into 54 colours-or-null. A state string uses face letters
 * (U = white … as in the engine); anything unrecognised becomes null (an unpainted sticker).
 */
export function netColors(state: string | readonly (CubeColor | null | undefined)[]): (CubeColor | null)[] {
  const out: (CubeColor | null)[] = new Array(54).fill(null)
  for (let i = 0; i < 54; i++) {
    const value = state[i]
    if (typeof state === 'string') out[i] = value && FACE_LETTERS.has(value) ? FACE_COLOR[value as Face] : null
    else out[i] = (value as CubeColor | null | undefined) ?? null
  }
  return out
}

/** "Top face, row 1, column 2: white" */
export function netStickerLabel(index: number, color: CubeColor | null): string {
  const cell = NET_CELLS[index]
  return `${NET_FACE_LABEL[cell.face]} face, row ${cell.row + 1}, column ${cell.col + 1}: ${color ?? 'empty'}`
}
