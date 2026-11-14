/**
 * The colour-entry model: 54 stickers being painted, with no React in it.
 *
 * Facelets are numbered exactly as in the engine (faces U R F D L B, each row by row), so a
 * finished entry goes straight into `validateCube`. A sticker is a colour or null (blank).
 * For saving, the whole cube is one 54-character string: the engine's face letters, with "-"
 * for a blank sticker.
 */
import { COLOR_FACE, COLORS, CORNERS, EDGES, FACE_COLOR, FACES, identifyStickers, SLOT_FACELETS, type Color, type Face } from '../../cube'

export type Cell = Color | null
export type Painted = readonly Cell[]

export const BLANK = '-'
export const STICKERS = 54
export const PER_COLOR = 9

/** Palette order, and the order of the number keys 1–6. */
export const PALETTE: readonly Color[] = ['white', 'yellow', 'green', 'blue', 'red', 'orange']

export const centreOf = (face: Face): number => FACES.indexOf(face) * 9 + 4
export const isCentre = (facelet: number): boolean => facelet % 9 === 4
export const faceOfFacelet = (facelet: number): Face => FACES[Math.floor(facelet / 9)]
/** The nine facelets of a face, row by row. */
export const faceFacelets = (face: Face): number[] => Array.from({ length: 9 }, (_, i) => FACES.indexOf(face) * 9 + i)

// ───────────────────────── Encoding ─────────────────────────

export function encode(painted: Painted): string {
  let out = ''
  for (let i = 0; i < STICKERS; i++) {
    const color = painted[i]
    out += color ? COLOR_FACE[color] : BLANK
  }
  return out
}

export function decode(text: string): Cell[] {
  const out: Cell[] = new Array(STICKERS).fill(null)
  for (let i = 0; i < STICKERS; i++) {
    const letter = text[i]
    out[i] = letter && letter in FACE_COLOR ? FACE_COLOR[letter as Face] : null
  }
  return out
}

/** True for a string `decode` can read back without loss. */
export const isEncoded = (value: unknown): value is string => typeof value === 'string' && /^[URFDLB-]{54}$/.test(value)

/** A blank cube with the six centres filled in the standard scheme (white up, green in front). */
export function blankCube(): Cell[] {
  const out: Cell[] = new Array(STICKERS).fill(null)
  for (const face of FACES) out[centreOf(face)] = FACE_COLOR[face]
  return out
}

export const BLANK_CUBE: string = encode(blankCube())

// ───────────────────────── Counting ─────────────────────────

export function countColors(painted: Painted): Record<Color, number> {
  const counts = { white: 0, red: 0, green: 0, yellow: 0, orange: 0, blue: 0 } as Record<Color, number>
  for (let i = 0; i < STICKERS; i++) {
    const color = painted[i]
    if (color) counts[color]++
  }
  return counts
}

export function blankCount(painted: Painted): number {
  let n = 0
  for (let i = 0; i < STICKERS; i++) if (!painted[i]) n++
  return n
}

export function blanksOnFace(painted: Painted, face: Face): number {
  return faceFacelets(face).filter((i) => !painted[i]).length
}

// ───────────────────────── Editing ─────────────────────────

/** Paint one sticker. Returns the same array when nothing changes. */
export function paint(painted: Painted, facelet: number, color: Cell): Painted {
  if (facelet < 0 || facelet >= STICKERS || painted[facelet] === color) return painted
  const next = painted.slice()
  next[facelet] = color
  return next
}

/** Blank a face. The centre stays when `keepCentre` is set. */
export function clearFace(painted: Painted, face: Face, keepCentre: boolean): Painted {
  const next = painted.slice()
  for (const i of faceFacelets(face)) if (!(keepCentre && isCentre(i))) next[i] = null
  return next
}

/** Blank everything; the centres stay as they are when `keepCentres` is set. */
export function clearAll(painted: Painted, keepCentres: boolean): Painted {
  return painted.map((color, i) => (keepCentres && isCentre(i) ? color : null))
}

// ───────────────────────── Stickers that can only be one colour ─────────────────────────

export interface ForcedSticker {
  facelet: number
  color: Color
  /**
   * `last-color`: every blank left must be this colour, because the other five are used up.
   * `piece`: the other stickers of this piece leave only one possibility.
   */
  reason: 'last-color' | 'piece'
}

const PIECE_SLOTS = [...CORNERS, ...EDGES]

/** Ids of the pieces that are already fully painted somewhere (and are real pieces). */
function piecesPresent(painted: Painted, skipSlot?: string): Set<string> {
  const present = new Set<string>()
  for (const slot of PIECE_SLOTS) {
    if (slot === skipSlot) continue
    const stickers = SLOT_FACELETS[slot].map((i) => painted[i])
    if (stickers.some((color) => !color)) continue
    const id = identifyStickers(stickers.map((color) => COLOR_FACE[color!]).join(''))
    if (id) present.add(id.piece)
  }
  return present
}

/**
 * Blank stickers whose colour is certain, given that what is already painted is right:
 *
 *  - when only one colour still has stickers to hand out, every blank is that colour;
 *  - when a piece has one blank sticker and only one colour would make it a real piece that
 *    is not already somewhere else on the cube (and that colour has not run out).
 *
 * Applied repeatedly until nothing more follows. Nothing is inferred while any colour is used
 * more than nine times or the centres are not six different colours — the entry has a slip in
 * it, and guessing from a slip would only spread it.
 */
export function inferForced(painted: Painted): ForcedSticker[] {
  const centres = FACES.map((face) => painted[centreOf(face)])
  if (centres.some((color) => !color) || new Set(centres).size !== 6) return []
  const work = painted.slice()
  const forced: ForcedSticker[] = []
  for (let guard = 0; guard < STICKERS; guard++) {
    const counts = countColors(work)
    if (COLORS.some((color) => counts[color] > PER_COLOR)) return []
    const blanks = blankCount(work)
    if (blanks === 0) break
    const open = COLORS.filter((color) => counts[color] < PER_COLOR)
    let found: ForcedSticker | null = null
    if (open.length === 1 && PER_COLOR - counts[open[0]] === blanks) {
      found = { facelet: work.findIndex((color) => !color), color: open[0], reason: 'last-color' }
    } else {
      for (const slot of PIECE_SLOTS) {
        const facelets = SLOT_FACELETS[slot]
        const missing = facelets.filter((i) => !work[i])
        if (missing.length !== 1) continue
        const present = piecesPresent(work, slot)
        const candidates = open.filter((color) => {
          const letters = facelets.map((i) => (i === missing[0] ? COLOR_FACE[color] : COLOR_FACE[work[i]!])).join('')
          const id = identifyStickers(letters)
          return id !== null && !present.has(id.piece)
        })
        if (candidates.length === 1) {
          found = { facelet: missing[0], color: candidates[0], reason: 'piece' }
          break
        }
      }
    }
    if (!found) break
    work[found.facelet] = found.color
    forced.push(found)
  }
  return forced
}

/** Paint every forced sticker. */
export function applyForced(painted: Painted, forced: readonly ForcedSticker[]): Painted {
  if (forced.length === 0) return painted
  const next = painted.slice()
  for (const { facelet, color } of forced) next[facelet] = color
  return next
}

// ───────────────────────── Undo / redo ─────────────────────────

export interface EntryHistory {
  /** Encoded cubes before each change, oldest first. */
  past: string[]
  /** Encoded cubes that were undone, most recently undone last. */
  future: string[]
}

export const HISTORY_LIMIT = 120
export const EMPTY_HISTORY: EntryHistory = { past: [], future: [] }

/** Record a change from `before`. A new change clears what could be redone. */
export function pushHistory(history: EntryHistory, before: string): EntryHistory {
  return { past: [...history.past, before].slice(-HISTORY_LIMIT), future: [] }
}

export function undoHistory(history: EntryHistory, current: string): { history: EntryHistory; cells: string } | null {
  if (history.past.length === 0) return null
  const cells = history.past[history.past.length - 1]
  return { cells, history: { past: history.past.slice(0, -1), future: [...history.future, current] } }
}

export function redoHistory(history: EntryHistory, current: string): { history: EntryHistory; cells: string } | null {
  if (history.future.length === 0) return null
  const cells = history.future[history.future.length - 1]
  return { cells, history: { past: [...history.past, current].slice(-HISTORY_LIMIT), future: history.future.slice(0, -1) } }
}
