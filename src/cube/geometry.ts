/**
 * Geometry of the 3x3 cube: faces, colours, the 54 facelets and the 26 slots.
 *
 * Coordinate system (right-handed, the same one three.js uses):
 *   +x points to the Right face, +y to the Up face, +z to the Front face.
 * Every cubie sits at a position whose coordinates are -1, 0 or 1.
 *
 * Facelets are numbered 0..53 in Kociemba order: faces U R F D L B, each face
 * row by row. Rows/columns are read the way the face appears on an unfolded net
 * (U seen with B at the top, D seen with F at the top, side faces with U at the top).
 */

/** The six faces, in Kociemba order. */
export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const
/** A face of the cube as a place in space: Up, Right, Front, Down, Left, Back. */
export type Face = (typeof FACES)[number]

export type Vec3 = readonly [number, number, number]
export type Axis = 'x' | 'y' | 'z'

/** Sticker colours. */
export const COLORS = ['white', 'red', 'green', 'yellow', 'orange', 'blue'] as const
export type Color = (typeof COLORS)[number]

/** Colour of each face on a solved cube held the standard way (white up, green front). */
export const FACE_COLOR: Readonly<Record<Face, Color>> = {
  U: 'white',
  R: 'red',
  F: 'green',
  D: 'yellow',
  L: 'orange',
  B: 'blue',
}

/** The face each colour belongs to on a solved, standard-orientation cube. */
export const COLOR_FACE: Readonly<Record<Color, Face>> = {
  white: 'U',
  red: 'R',
  green: 'F',
  yellow: 'D',
  orange: 'L',
  blue: 'B',
}

export const OPPOSITE_FACE: Readonly<Record<Face, Face>> = {
  U: 'D',
  D: 'U',
  R: 'L',
  L: 'R',
  F: 'B',
  B: 'F',
}

/** The colour on the opposite side of the cube (white <-> yellow, red <-> orange, green <-> blue). */
export function oppositeColor(color: Color): Color {
  return FACE_COLOR[OPPOSITE_FACE[COLOR_FACE[color]]]
}

/** Friendly face names for copy: U -> "Top", F -> "Front" ... */
export const FACE_NAME: Readonly<Record<Face, string>> = {
  U: 'Top',
  R: 'Right',
  F: 'Front',
  D: 'Bottom',
  L: 'Left',
  B: 'Back',
}

/** Outward unit normal of each face. */
export const FACE_NORMAL: Readonly<Record<Face, Vec3>> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
}

/** Direction in which the column index grows on each face (as drawn on the net). */
const FACE_RIGHT: Record<Face, Vec3> = {
  U: [1, 0, 0],
  R: [0, 0, -1],
  F: [1, 0, 0],
  D: [1, 0, 0],
  L: [0, 0, 1],
  B: [-1, 0, 0],
}

/** Direction in which the row index grows on each face (as drawn on the net). */
const FACE_DOWN: Record<Face, Vec3> = {
  U: [0, 0, 1],
  R: [0, -1, 0],
  F: [0, -1, 0],
  D: [0, 0, -1],
  L: [0, -1, 0],
  B: [0, -1, 0],
}

/** Corner slots/pieces in Kociemba order. Letters go clockwise around the corner, U/D first. */
export const CORNERS = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'] as const
export type CornerId = (typeof CORNERS)[number]

/** Edge slots/pieces in Kociemba order. The first letter is the "primary" sticker (U/D, else F/B). */
export const EDGES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'] as const
export type EdgeId = (typeof EDGES)[number]

/** Centre slots/pieces: one per face. */
export const CENTERS = FACES
export type CenterId = Face

/**
 * A slot is a *place* on the cube named by the faces it touches ("UF" = the top-front edge
 * position). Slots never move.
 */
export type SlotId = CornerId | EdgeId | CenterId
/**
 * A piece is a physical cubie named after its home slot on a solved standard cube, i.e. by its
 * colours: "UF" is the white-green edge wherever it currently is.
 */
export type PieceId = SlotId
export type PieceKind = 'corner' | 'edge' | 'center'

/** All 26 slots: 8 corners, 12 edges, 6 centres. */
export const SLOTS: readonly SlotId[] = [...CORNERS, ...EDGES, ...CENTERS]

export function kindOf(id: SlotId): PieceKind {
  return id.length === 3 ? 'corner' : id.length === 2 ? 'edge' : 'center'
}

/** The faces a slot touches, in the order of the letters of its name. */
export function slotFaces(slot: SlotId): Face[] {
  return slot.split('') as Face[]
}

/** The colours of a piece, in the order of the letters of its name ("UF" -> white, green). */
export function pieceColors(piece: PieceId): Color[] {
  return slotFaces(piece).map((f) => FACE_COLOR[f])
}

function sortKey(letters: string): string {
  return letters.split('').sort().join('')
}

const ID_BY_KEY = new Map<string, SlotId>(SLOTS.map((s) => [sortKey(s), s]))

/**
 * The piece with exactly these colours, in any order — `pieceWithColors(['green', 'white'])` is
 * "UF". Returns null when no such piece exists (e.g. white + yellow).
 */
export function pieceWithColors(colors: readonly Color[]): PieceId | null {
  return ID_BY_KEY.get(sortKey(colors.map((c) => COLOR_FACE[c]).join(''))) ?? null
}

/** The slot touching exactly these faces, in any order; null if they do not meet. */
export function slotWithFaces(faces: readonly Face[]): SlotId | null {
  return ID_BY_KEY.get(sortKey(faces.join(''))) ?? null
}

export interface FaceletInfo {
  /** 0..53, Kociemba order. */
  readonly index: number
  readonly face: Face
  /** 0..2, top to bottom as the face is drawn on a net. */
  readonly row: number
  /** 0..2, left to right as the face is drawn on a net. */
  readonly col: number
  /** Position of the cubie carrying this sticker; each coordinate is -1, 0 or 1. */
  readonly position: Vec3
  /** Outward direction the sticker faces. */
  readonly normal: Vec3
  readonly kind: PieceKind
  /** The slot this facelet belongs to. */
  readonly slot: SlotId
}

function vecKey(p: Vec3, n: Vec3): string {
  return `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`
}

function facesAtPosition(p: Vec3): Face[] {
  const faces: Face[] = []
  if (p[1] === 1) faces.push('U')
  if (p[1] === -1) faces.push('D')
  if (p[0] === 1) faces.push('R')
  if (p[0] === -1) faces.push('L')
  if (p[2] === 1) faces.push('F')
  if (p[2] === -1) faces.push('B')
  return faces
}

/** The slot at a cubie position; null for the hidden core (0,0,0). */
export function slotAtPosition(position: Vec3): SlotId | null {
  return slotWithFaces(facesAtPosition(position))
}

/** Static information about each of the 54 facelets, indexed by facelet number. */
export const FACELETS: readonly FaceletInfo[] = (() => {
  const list: FaceletInfo[] = []
  for (const face of FACES) {
    const n = FACE_NORMAL[face]
    const r = FACE_RIGHT[face]
    const d = FACE_DOWN[face]
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const position: Vec3 = [
          n[0] + (col - 1) * r[0] + (row - 1) * d[0],
          n[1] + (col - 1) * r[1] + (row - 1) * d[1],
          n[2] + (col - 1) * r[2] + (row - 1) * d[2],
        ]
        const slot = slotAtPosition(position)!
        list.push({ index: list.length, face, row, col, position, normal: n, kind: kindOf(slot), slot })
      }
    }
  }
  return list
})()

const FACELET_BY_KEY = new Map<string, number>(FACELETS.map((f) => [vecKey(f.position, f.normal), f.index]))

/** Facelet number of the sticker at (row, col) of a face. */
export function faceletIndex(face: Face, row: number, col: number): number {
  if (row < 0 || row > 2 || col < 0 || col > 2 || !Number.isInteger(row) || !Number.isInteger(col)) {
    throw new RangeError(`row/col out of range: ${row}, ${col}`)
  }
  return FACES.indexOf(face) * 9 + row * 3 + col
}

/** Facelet number of the sticker on the cubie at `position` that faces along `normal`; -1 if none. */
export function faceletAtPosition(position: Vec3, normal: Vec3): number {
  return FACELET_BY_KEY.get(vecKey(position, normal)) ?? -1
}

/** Cubie position of each slot. */
export const SLOT_POSITION: Readonly<Record<SlotId, Vec3>> = (() => {
  const out = {} as Record<SlotId, Vec3>
  for (const slot of SLOTS) {
    const p = [0, 0, 0]
    for (const f of slotFaces(slot)) {
      const n = FACE_NORMAL[f]
      p[0] += n[0]
      p[1] += n[1]
      p[2] += n[2]
    }
    out[slot] = p as unknown as Vec3
  }
  return out
})()

/** Facelet numbers of each slot, in the order of the letters of the slot name. */
export const SLOT_FACELETS: Readonly<Record<SlotId, readonly number[]>> = (() => {
  const out = {} as Record<SlotId, readonly number[]>
  for (const slot of SLOTS) {
    out[slot] = slotFaces(slot).map((f) => faceletAtPosition(SLOT_POSITION[slot], FACE_NORMAL[f]))
  }
  return out
})()

/** The four edge slots and four corner slots around a face, plus its centre. */
export function slotsOnFace(face: Face): SlotId[] {
  return SLOTS.filter((s) => s.includes(face))
}
