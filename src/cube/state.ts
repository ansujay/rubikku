/**
 * The cube state.
 *
 * A state is simply the 54-character Kociemba facelet string (faces in the order U R F D L B,
 * each read row by row). Each character says which *colour* that sticker has, using the letter
 * of the face that colour belongs to on a solved cube: U = white, R = red, F = green,
 * D = yellow, L = orange, B = blue.
 *
 * Because a state is an immutable string it is free to copy, compares with `===`, can be used
 * as a Map key and serialises as itself (JSON, localStorage, URLs).
 */
import { COLOR_FACE, FACE_COLOR, FACES, type Color, type Face } from './geometry'

declare const cubeStateBrand: unique symbol
/** A 54-character Kociemba facelet string. Create one with `SOLVED`, `parseState` or `validateCube`. */
export type CubeState = string & { readonly [cubeStateBrand]: true }

/** The solved cube in standard orientation (white up, green front). */
export const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' as CubeState

const STATE_RE = /^[URFDLB]{54}$/

/** True if `value` is shaped like a state (54 face letters). It does not check solvability. */
export function isStateString(value: unknown): value is CubeState {
  return typeof value === 'string' && STATE_RE.test(value)
}

/**
 * Turn a Kociemba facelet string into a state. Throws if it is not 54 face letters.
 * This only checks the shape — use `validateCube` for anything a person typed or painted.
 */
export function fromKociemba(facelets: string): CubeState {
  if (!isStateString(facelets)) {
    throw new Error('A cube state must be 54 characters, each one of U R F D L B')
  }
  return facelets
}

/** Like `fromKociemba` but returns null instead of throwing — handy for loading saved data. */
export function parseState(value: unknown): CubeState | null {
  return isStateString(value) ? value : null
}

/** The Kociemba facelet string of a state (the state itself — provided for readability). */
export function toKociemba(state: CubeState): string {
  return state
}

/** The 54 sticker colours in facelet order. */
export function toColors(state: CubeState): Color[] {
  const out: Color[] = new Array(54)
  for (let i = 0; i < 54; i++) out[i] = FACE_COLOR[state[i] as Face]
  return out
}

/** Build a state from 54 sticker colours in facelet order (shape check only). */
export function fromColors(colors: readonly Color[]): CubeState {
  if (colors.length !== 54) throw new Error('Expected 54 colours')
  let s = ''
  for (const c of colors) {
    const f = COLOR_FACE[c]
    if (!f) throw new Error(`Unknown colour: ${String(c)}`)
    s += f
  }
  return s as CubeState
}

/** Colour of the sticker at a facelet number (0..53). */
export function colorAt(state: CubeState, facelet: number): Color {
  return FACE_COLOR[state[facelet] as Face]
}

/** Colour of the sticker at (row, col) of a face; rows/cols as drawn on a net. */
export function stickerAt(state: CubeState, face: Face, row: number, col: number): Color {
  return colorAt(state, FACES.indexOf(face) * 9 + row * 3 + col)
}

/** The nine sticker colours of a face, row by row. */
export function faceColors(state: CubeState, face: Face): Color[] {
  const start = FACES.indexOf(face) * 9
  const out: Color[] = []
  for (let i = 0; i < 9; i++) out.push(FACE_COLOR[state[start + i] as Face])
  return out
}

/** The colour of the centre of each face — this tells you how the cube is being held. */
export function centerColors(state: CubeState): Record<Face, Color> {
  const out = {} as Record<Face, Color>
  FACES.forEach((f, i) => {
    out[f] = FACE_COLOR[state[i * 9 + 4] as Face]
  })
  return out
}

/** The face whose centre currently has this colour. */
export function faceOfColor(state: CubeState, color: Color): Face {
  const letter = COLOR_FACE[color]
  for (let i = 0; i < 6; i++) if (state[i * 9 + 4] === letter) return FACES[i]
  throw new Error(`No ${color} centre on this cube`)
}

/** True when the cube is held the standard way (white up, green front ...). */
export function isUpright(state: CubeState): boolean {
  for (let i = 0; i < 6; i++) if (state[i * 9 + 4] !== FACES[i]) return false
  return true
}

/** True when every face is a single colour, however the cube is being held. */
export function isSolved(state: CubeState): boolean {
  for (let f = 0; f < 6; f++) {
    const c = state[f * 9 + 4]
    for (let i = 0; i < 9; i++) if (state[f * 9 + i] !== c) return false
  }
  return true
}

/** True when every sticker of the face matches that face's centre. */
export function isFaceSolved(state: CubeState, face: Face): boolean {
  const start = FACES.indexOf(face) * 9
  const c = state[start + 4]
  for (let i = 0; i < 9; i++) if (state[start + i] !== c) return false
  return true
}

/** A plain-text unfolded net of the cube, for debugging and test failure messages. */
export function toNet(state: CubeState): string {
  const letter: Record<Face, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }
  const row = (face: Face, r: number) => {
    const start = FACES.indexOf(face) * 9 + r * 3
    return [0, 1, 2].map((c) => letter[state[start + c] as Face]).join('')
  }
  const lines: string[] = []
  for (let r = 0; r < 3; r++) lines.push('    ' + row('U', r))
  for (let r = 0; r < 3; r++) lines.push(`${row('L', r)} ${row('F', r)} ${row('R', r)} ${row('B', r)}`)
  for (let r = 0; r < 3; r++) lines.push('    ' + row('D', r))
  return lines.join('\n')
}
