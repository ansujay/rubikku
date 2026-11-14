/**
 * Piece-level view of the cube: which piece is where, how it is turned, and the list of cubies
 * for rendering.
 *
 * Vocabulary:
 *  - A **slot** is a place ("UF" = top-front edge position). Slots are fixed in space.
 *  - A **piece** is a physical cubie, named by its colours via its home slot on a solved
 *    standard cube ("UF" = the white-green edge).
 *  - **Orientation** of a piece in a slot:
 *      corners 0..2 — how many clockwise twists away the piece's white/yellow sticker is from
 *                     the slot's U/D-facing sticker position (first letter of the slot name);
 *      edges 0..1   — 0 when the piece's primary sticker (first letter of the piece name) is on
 *                     the slot's primary facelet (first letter of the slot name), 1 when flipped.
 *    These are the standard Kociemba definitions. They are measured against fixed space, so
 *    they are most meaningful on an upright cube; for "is this piece home?" on a cube held any
 *    way round, use `isPieceSolved` / `PieceLocation.solved` / `PieceLocation.facing`.
 */
import {
  CENTERS,
  COLOR_FACE,
  CORNERS,
  EDGES,
  FACE_COLOR,
  FACELETS,
  FACES,
  kindOf,
  pieceWithColors,
  SLOT_FACELETS,
  SLOT_POSITION,
  slotFaces,
  SLOTS,
  slotWithFaces,
  type CenterId,
  type Color,
  type CornerId,
  type EdgeId,
  type Face,
  type PieceId,
  type PieceKind,
  type SlotId,
  type Vec3,
} from './geometry'
import type { CubeState } from './state'

interface Identity {
  piece: PieceId
  orientation: number
}

/** Maps the sticker letters read off a slot (in slot-letter order) to the piece and orientation. */
const IDENTITY_BY_STICKERS: ReadonlyMap<string, Identity> = (() => {
  const map = new Map<string, Identity>()
  for (const c of CORNERS) {
    map.set(c, { piece: c, orientation: 0 })
    map.set(c[2] + c[0] + c[1], { piece: c, orientation: 1 })
    map.set(c[1] + c[2] + c[0], { piece: c, orientation: 2 })
  }
  for (const e of EDGES) {
    map.set(e, { piece: e, orientation: 0 })
    map.set(e[1] + e[0], { piece: e, orientation: 1 })
  }
  for (const f of CENTERS) map.set(f, { piece: f, orientation: 0 })
  return map
})()

/**
 * Identify the piece whose stickers (as face letters, in slot-letter order) are `letters`.
 * Returns null if no real piece looks like that (wrong colours together, or a mirrored corner).
 */
export function identifyStickers(letters: string): { piece: PieceId; orientation: number } | null {
  return IDENTITY_BY_STICKERS.get(letters) ?? null
}

function lettersAt(state: ArrayLike<string>, slot: SlotId): string {
  let s = ''
  for (const f of SLOT_FACELETS[slot]) s += state[f]
  return s
}

export interface StickerInfo {
  /** The sticker's colour. */
  color: Color
  /** The face the sticker is on right now. */
  face: Face
  /** Facelet number (0..53) the sticker occupies right now. */
  facelet: number
}

export interface PieceLocation {
  /** The piece (named by its colours / home slot). */
  piece: PieceId
  kind: PieceKind
  /** Where it is right now. */
  slot: SlotId
  /** Cubie coordinates of that slot (each -1, 0 or 1; x = right, y = up, z = front). */
  position: Vec3
  /** See the orientation definition at the top of this file. */
  orientation: number
  /** Its stickers, in the order of the letters of the piece name. */
  stickers: StickerInfo[]
  /** For each of the piece's colours, the face that sticker is on: `facing.white === 'F'`. */
  facing: Partial<Record<Color, Face>>
  /** True when every sticker of the piece matches the centre of the face it is on. */
  solved: boolean
}

function locationFor(state: CubeState, slot: SlotId, id: Identity): PieceLocation {
  const facelets = SLOT_FACELETS[slot]
  const n = facelets.length
  const stickers: StickerInfo[] = []
  const facing: Partial<Record<Color, Face>> = {}
  let solved = true
  for (let k = 0; k < n; k++) {
    // Sticker k of the piece sits `orientation` places further round the slot.
    const facelet = facelets[(k + id.orientation) % n]
    const face = FACELETS[facelet].face
    const color = FACE_COLOR[id.piece[k] as Face]
    stickers.push({ color, face, facelet })
    facing[color] = face
    if (state[facelet] !== state[FACES.indexOf(face) * 9 + 4]) solved = false
  }
  return {
    piece: id.piece,
    kind: kindOf(slot),
    slot,
    position: SLOT_POSITION[slot],
    orientation: id.orientation,
    stickers,
    facing,
    solved,
  }
}

/**
 * The piece currently sitting in a slot, with its orientation and where each sticker faces.
 * Throws if the stickers there do not form a real piece (only possible for unvalidated states).
 */
export function pieceAt(state: CubeState, slot: SlotId): PieceLocation {
  const id = identifyStickers(lettersAt(state, slot))
  if (!id) throw new Error(`The stickers at ${slot} do not make a real piece`)
  return locationFor(state, slot, id)
}

function resolvePiece(piece: PieceId | readonly Color[]): PieceId {
  if (typeof piece === 'string') {
    if (!SLOT_POSITION[piece]) throw new Error(`Unknown piece: ${piece}`)
    return piece
  }
  const id = pieceWithColors(piece)
  if (!id) throw new Error(`There is no piece with the colours ${piece.join(' + ')}`)
  return id
}

/**
 * Find a piece. Name it by id (`'UF'`) or by its colours in any order (`['green', 'white']`).
 * Throws if the piece is not on the cube (only possible for unvalidated states).
 */
export function findPiece(state: CubeState, piece: PieceId | readonly Color[]): PieceLocation {
  const id = resolvePiece(piece)
  const slots: readonly SlotId[] = id.length === 3 ? CORNERS : id.length === 2 ? EDGES : CENTERS
  for (const slot of slots) {
    const found = identifyStickers(lettersAt(state, slot))
    if (found && found.piece === id) return locationFor(state, slot, found)
  }
  throw new Error(`Piece ${id} is not on this cube`)
}

/** Locations of all 8 corners, 12 edges and 6 centres, ordered by slot. */
export function allPieces(state: CubeState): PieceLocation[] {
  return SLOTS.map((slot) => pieceAt(state, slot))
}

/**
 * The slot where a piece belongs *given how the cube is being held* (i.e. relative to the
 * current centres). On an upright cube this is the piece's own name.
 */
export function homeSlot(state: CubeState, piece: PieceId | readonly Color[]): SlotId {
  const id = resolvePiece(piece)
  const faces = slotFaces(id).map((letter) => {
    for (let i = 0; i < 6; i++) if (state[i * 9 + 4] === letter) return FACES[i]
    throw new Error('This cube is missing a centre colour')
  })
  return slotWithFaces(faces)!
}

/** True when the piece is in its home slot with every sticker matching its face's centre. */
export function isPieceSolved(state: CubeState, piece: PieceId | readonly Color[]): boolean {
  return findPiece(state, piece).solved
}

/** True when the piece in this slot is solved (all its stickers match their centres). */
export function isSlotSolved(state: CubeState, slot: SlotId): boolean {
  for (const f of SLOT_FACELETS[slot]) {
    if (state[f] !== state[FACES.indexOf(FACELETS[f].face) * 9 + 4]) return false
  }
  return true
}

/** The face a given sticker of a piece is on: `faceOfSticker(state, 'UF', 'white')`. */
export function faceOfSticker(state: CubeState, piece: PieceId | readonly Color[], color: Color): Face {
  const face = findPiece(state, piece).facing[color]
  if (!face) throw new Error(`That piece has no ${color} sticker`)
  return face
}

// ---------------------------------------------------------------------------------------------
// Cubies for rendering
// ---------------------------------------------------------------------------------------------

export interface CubieSticker {
  /** The face (direction) this sticker points towards. */
  face: Face
  /** Its colour, or null where a painted cube has not been coloured in yet. */
  color: Color | null
  /** Facelet number 0..53. */
  facelet: number
}

export interface Cubie {
  /**
   * The physical piece (stable while it moves around — a good React key), or null if the
   * stickers do not make a real piece (possible only for a painted, not-yet-valid cube).
   */
  piece: PieceId | null
  kind: PieceKind
  /** The slot the cubie occupies. */
  slot: SlotId
  /** Cubie coordinates, each -1, 0 or 1 (x = right, y = up, z = front). */
  position: Vec3
  /** The 1, 2 or 3 visible stickers. */
  stickers: CubieSticker[]
}

const LETTER_OF_COLOR = COLOR_FACE

/**
 * The 26 visible cubies with their positions and sticker colours, ready for a 3D renderer.
 * Accepts a state, or 54 painted colours (null = blank) for a cube that is still being entered.
 */
export function getCubies(source: CubeState | readonly (Color | null | undefined)[]): Cubie[] {
  const letters: (string | null)[] = new Array(54)
  for (let i = 0; i < 54; i++) {
    const v = source[i]
    letters[i] = typeof source === 'string' ? (v as string) : v ? (LETTER_OF_COLOR[v as Color] ?? null) : null
  }
  return SLOTS.map((slot) => {
    const facelets = SLOT_FACELETS[slot]
    let key = ''
    const stickers: CubieSticker[] = facelets.map((facelet) => {
      const letter = letters[facelet]
      key += letter ?? '?'
      return { face: FACELETS[facelet].face, color: letter ? FACE_COLOR[letter as Face] : null, facelet }
    })
    return {
      piece: identifyStickers(key)?.piece ?? null,
      kind: kindOf(slot),
      slot,
      position: SLOT_POSITION[slot],
      stickers,
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Cubie-level (permutation + orientation) view
// ---------------------------------------------------------------------------------------------

/**
 * The classic permutation/orientation arrays (same layout as cubejs' `toJSON()`).
 * `cp[i]` is the index (into `CORNERS`) of the piece in corner slot `i`, `co[i]` its
 * orientation; likewise `ep`/`eo` with `EDGES`; `center[i]` is the index (into `FACES`) of the
 * centre piece on face `i`.
 */
export interface CubieArrays {
  center: number[]
  cp: number[]
  co: number[]
  ep: number[]
  eo: number[]
}

/** Convert a state to permutation/orientation arrays. Throws on a state with impossible pieces. */
export function toCubieArrays(state: CubeState): CubieArrays {
  const out: CubieArrays = { center: [], cp: [], co: [], ep: [], eo: [] }
  for (const f of CENTERS) out.center.push(FACES.indexOf(state[SLOT_FACELETS[f][0]] as Face))
  for (const slot of CORNERS) {
    const id = identifyStickers(lettersAt(state, slot))
    if (!id) throw new Error(`The stickers at ${slot} do not make a real piece`)
    out.cp.push(CORNERS.indexOf(id.piece as CornerId))
    out.co.push(id.orientation)
  }
  for (const slot of EDGES) {
    const id = identifyStickers(lettersAt(state, slot))
    if (!id) throw new Error(`The stickers at ${slot} do not make a real piece`)
    out.ep.push(EDGES.indexOf(id.piece as EdgeId))
    out.eo.push(id.orientation)
  }
  return out
}

/** Build a state from permutation/orientation arrays (`center` defaults to the upright cube). */
export function fromCubieArrays(arrays: Omit<CubieArrays, 'center'> & { center?: readonly number[] }): CubeState {
  const out: string[] = new Array(54)
  const place = (slot: SlotId, piece: PieceId, orientation: number) => {
    const facelets = SLOT_FACELETS[slot]
    for (let k = 0; k < facelets.length; k++) out[facelets[(k + orientation) % facelets.length]] = piece[k]
  }
  CENTERS.forEach((slot, i) => place(slot, FACES[arrays.center?.[i] ?? i] as CenterId, 0))
  CORNERS.forEach((slot, i) => place(slot, CORNERS[arrays.cp[i]], arrays.co[i]))
  EDGES.forEach((slot, i) => place(slot, EDGES[arrays.ep[i]], arrays.eo[i]))
  const s = out.join('')
  if (!/^[URFDLB]{54}$/.test(s)) throw new Error('Invalid cubie arrays')
  return s as CubeState
}

/** Parity of a permutation: 0 = even, 1 = odd. */
export function permutationParity(perm: readonly number[]): 0 | 1 {
  const seen = new Array<boolean>(perm.length).fill(false)
  let parity = 0
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue
    let len = 0
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true
      len++
    }
    parity ^= (len - 1) & 1
  }
  return parity as 0 | 1
}
