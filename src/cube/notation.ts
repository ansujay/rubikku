/**
 * Move notation: types, parsing, printing, inverting, simplifying, mirroring and describing.
 *
 * A move is a short string such as "R", "U'", "F2", "M", "r2", "x'".
 *  - Face turns  U D L R F B  — clockwise when you look straight at that face.
 *  - Slices      M (follows L), E (follows D), S (follows F).
 *  - Wide moves  u d l r f b  — the face plus the slice next to it ("Rw" is accepted and
 *                               normalised to "r").
 *  - Rotations   x (follows R), y (follows U), z (follows F) — the whole cube.
 * A suffix ' means the other way, 2 means a half turn.
 */
import { FACE_NAME, type Axis, type Face } from './geometry'

export const FACE_MOVE_BASES = ['U', 'D', 'L', 'R', 'F', 'B'] as const
export const SLICE_MOVE_BASES = ['M', 'E', 'S'] as const
export const WIDE_MOVE_BASES = ['u', 'd', 'l', 'r', 'f', 'b'] as const
export const ROTATION_BASES = ['x', 'y', 'z'] as const
export const MOVE_BASES = [...FACE_MOVE_BASES, ...SLICE_MOVE_BASES, ...WIDE_MOVE_BASES, ...ROTATION_BASES] as const

export type FaceMoveBase = (typeof FACE_MOVE_BASES)[number]
export type SliceMoveBase = (typeof SLICE_MOVE_BASES)[number]
export type WideMoveBase = (typeof WIDE_MOVE_BASES)[number]
export type RotationBase = (typeof ROTATION_BASES)[number]
export type MoveBase = (typeof MOVE_BASES)[number]
export type MoveSuffix = '' | "'" | '2'

/** One move in canonical spelling, e.g. "R", "U'", "F2", "M'", "r", "x2". */
export type Move = `${MoveBase}${MoveSuffix}`
/** A face turn only (what scrambles and the optimal solver produce). */
export type FaceMove = `${FaceMoveBase}${MoveSuffix}`
/** A whole-cube rotation. */
export type RotationMove = `${RotationBase}${MoveSuffix}`
/** A sequence of moves. */
export type Alg = readonly Move[]

export type MoveKind = 'face' | 'slice' | 'wide' | 'rotation'

/** Number of clockwise quarter turns: 1 = plain, 2 = half turn, 3 = prime. */
export type MoveAmount = 1 | 2 | 3

interface BaseDef {
  kind: MoveKind
  axis: Axis
  /** Layers along the axis (-1, 0, 1) that turn. */
  layers: readonly number[]
  /** +1 if a plain turn is a +90 degree right-hand rotation about the positive axis, else -1. */
  sign: 1 | -1
  /** The face whose direction this move follows. */
  follows: Face
}

const ALL = [-1, 0, 1] as const

/** Geometry of each move letter. Every move table in the engine is generated from this. */
export const MOVE_BASE_DEFS: Readonly<Record<MoveBase, BaseDef>> = {
  R: { kind: 'face', axis: 'x', layers: [1], sign: -1, follows: 'R' },
  L: { kind: 'face', axis: 'x', layers: [-1], sign: 1, follows: 'L' },
  U: { kind: 'face', axis: 'y', layers: [1], sign: -1, follows: 'U' },
  D: { kind: 'face', axis: 'y', layers: [-1], sign: 1, follows: 'D' },
  F: { kind: 'face', axis: 'z', layers: [1], sign: -1, follows: 'F' },
  B: { kind: 'face', axis: 'z', layers: [-1], sign: 1, follows: 'B' },
  M: { kind: 'slice', axis: 'x', layers: [0], sign: 1, follows: 'L' },
  E: { kind: 'slice', axis: 'y', layers: [0], sign: 1, follows: 'D' },
  S: { kind: 'slice', axis: 'z', layers: [0], sign: -1, follows: 'F' },
  r: { kind: 'wide', axis: 'x', layers: [0, 1], sign: -1, follows: 'R' },
  l: { kind: 'wide', axis: 'x', layers: [-1, 0], sign: 1, follows: 'L' },
  u: { kind: 'wide', axis: 'y', layers: [0, 1], sign: -1, follows: 'U' },
  d: { kind: 'wide', axis: 'y', layers: [-1, 0], sign: 1, follows: 'D' },
  f: { kind: 'wide', axis: 'z', layers: [0, 1], sign: -1, follows: 'F' },
  b: { kind: 'wide', axis: 'z', layers: [-1, 0], sign: 1, follows: 'B' },
  x: { kind: 'rotation', axis: 'x', layers: ALL, sign: -1, follows: 'R' },
  y: { kind: 'rotation', axis: 'y', layers: ALL, sign: -1, follows: 'U' },
  z: { kind: 'rotation', axis: 'z', layers: ALL, sign: -1, follows: 'F' },
}

const SUFFIX_OF: Record<MoveAmount, MoveSuffix> = { 1: '', 2: '2', 3: "'" }

/** Every legal move (18 letters x 3 suffixes = 54). */
export const ALL_MOVES: readonly Move[] = MOVE_BASES.flatMap((b) => [b, `${b}'`, `${b}2`] as Move[])
/** The 18 face turns. */
export const FACE_MOVES: readonly FaceMove[] = FACE_MOVE_BASES.flatMap((b) => [b, `${b}'`, `${b}2`] as FaceMove[])

const MOVE_SET: ReadonlySet<string> = new Set(ALL_MOVES)

/** True if `value` is a move in canonical spelling. */
export function isMove(value: unknown): value is Move {
  return typeof value === 'string' && MOVE_SET.has(value)
}

/** The letter of a move: "R'" -> "R". */
export function moveBase(move: Move): MoveBase {
  return move[0] as MoveBase
}

/** Clockwise quarter turns of a move: "R" -> 1, "R2" -> 2, "R'" -> 3. */
export function moveAmount(move: Move): MoveAmount {
  return move.length === 1 ? 1 : move[1] === '2' ? 2 : 3
}

/** Build a move from a letter and a number of clockwise quarter turns; null when it cancels out. */
export function makeMove(base: MoveBase, quarterTurns: number): Move | null {
  const a = ((quarterTurns % 4) + 4) % 4
  return a === 0 ? null : (`${base}${SUFFIX_OF[a as MoveAmount]}` as Move)
}

/** face / slice / wide / rotation. */
export function moveKind(move: Move): MoveKind {
  return MOVE_BASE_DEFS[moveBase(move)].kind
}

/** True for whole-cube rotations x, y, z (they change how the cube is held, not the puzzle). */
export function isRotation(move: Move): move is RotationMove {
  return moveKind(move) === 'rotation'
}

/** The opposite move: R -> R', R' -> R, R2 -> R2. */
export function invertMove(move: Move): Move {
  return makeMove(moveBase(move), 4 - moveAmount(move))!
}

/** Error thrown by `parseAlg` for text that is not valid notation. */
export class AlgParseError extends Error {
  /** Character offset of the problem in the input. */
  readonly position: number
  constructor(message: string, position: number) {
    super(message)
    this.name = 'AlgParseError'
    this.position = position
  }
}

const PRIME_CHARS = "'’‘′`´"

/**
 * Parse notation text into moves.
 *
 * Tolerant of: extra whitespace, commas, parentheses for grouping, the prime characters
 * ' ’ ‘ ′ ` ´, "Rw" for wide moves, "R3" (= R'), "R2'" (= R2), repeated groups such as
 * "(R U R' U')6" or "(R U R' U')*6" (not "x6" — x is a cube rotation), and inverted groups "(R U)'".
 * Throws `AlgParseError` on anything else. An empty string gives an empty algorithm.
 */
export function parseAlg(text: string): Move[] {
  let i = 0
  const n = text.length

  const skipSpace = () => {
    while (i < n && /[\s,;]/.test(text[i])) i++
  }

  const readNumber = (): number | null => {
    const start = i
    while (i < n && text[i] >= '0' && text[i] <= '9') i++
    return i > start ? Number(text.slice(start, i)) : null
  }

  const readPrime = (): boolean => {
    if (i < n && PRIME_CHARS.includes(text[i])) {
      i++
      return true
    }
    return false
  }

  const parseSequence = (depth: number): Move[] => {
    const out: Move[] = []
    for (;;) {
      skipSpace()
      if (i >= n) {
        if (depth > 0) throw new AlgParseError('Missing closing bracket ")"', i)
        return out
      }
      const ch = text[i]
      if (ch === ')') {
        if (depth === 0) throw new AlgParseError('Unexpected ")"', i)
        return out
      }
      if (ch === '(') {
        i++
        let group = parseSequence(depth + 1)
        i++ // the ')'
        if (text[i] === '*' || text[i] === '\u00D7') i++
        const count = readNumber()
        if (readPrime()) group = invertAlg(group)
        const times = count ?? 1
        if (times > 100) throw new AlgParseError('Repeat count is too large', i)
        for (let k = 0; k < times; k++) out.push(...group)
        continue
      }
      const start = i
      let base: string
      if ('UDLRFB'.includes(ch)) {
        i++
        if (text[i] === 'w') {
          i++
          base = ch.toLowerCase()
        } else {
          base = ch
        }
      } else if ('MESudlrfbxyz'.includes(ch)) {
        i++
        base = ch
      } else {
        throw new AlgParseError(`"${ch}" is not a move`, i)
      }
      const count = readNumber()
      const prime = readPrime()
      // Allow the rarely seen "R'2" spelling too.
      const trailing = prime && count === null ? readNumber() : null
      let turns = count ?? trailing ?? 1
      if (turns > 3) throw new AlgParseError(`"${text.slice(start, i)}" turns too many times`, start)
      if (prime) turns = -turns
      if (i < n && !/[\s,;()]/.test(text[i])) {
        throw new AlgParseError(`Cannot read "${text.slice(start, i + 1)}"`, start)
      }
      const move = makeMove(base as MoveBase, turns)
      if (move) out.push(move)
    }
  }

  return parseSequence(0)
}

/** Parse without throwing: returns null if the text is not valid notation. */
export function tryParseAlg(text: string): Move[] | null {
  try {
    return parseAlg(text)
  } catch {
    return null
  }
}

/** Accept either notation text or an already parsed list of moves. */
export function toAlg(alg: Alg | string): Alg {
  return typeof alg === 'string' ? parseAlg(alg) : alg
}

/** Print moves as standard notation separated by spaces. */
export function algToString(alg: Alg | string): string {
  return toAlg(alg).join(' ')
}

/** The algorithm that undoes `alg`: reversed order, every move inverted. */
export function invertAlg(alg: Alg | string): Move[] {
  const moves = toAlg(alg)
  const out: Move[] = new Array(moves.length)
  for (let k = 0; k < moves.length; k++) out[moves.length - 1 - k] = invertMove(moves[k])
  return out
}

/**
 * Cancel and merge moves: "R R" -> "R2", "R R'" -> nothing, "R2 R'" -> "R".
 * Moves on the same axis commute, so "R L R'" -> "L" and "U D U" -> "U2 D" too.
 * The result always does exactly the same thing to the cube.
 */
export function simplifyAlg(alg: Alg | string): Move[] {
  const out: Move[] = []
  for (const move of toAlg(alg)) {
    const base = moveBase(move)
    const axis = MOVE_BASE_DEFS[base].axis
    let merged = false
    for (let k = out.length - 1; k >= 0; k--) {
      const prev = out[k]
      const prevBase = moveBase(prev)
      if (prevBase === base) {
        const combined = makeMove(base, moveAmount(prev) + moveAmount(move))
        if (combined) out[k] = combined
        else out.splice(k, 1)
        merged = true
        break
      }
      if (MOVE_BASE_DEFS[prevBase].axis !== axis) break
    }
    if (!merged) out.push(move)
  }
  return out
}

const MIRROR_BASE: Record<MoveBase, MoveBase> = {
  R: 'L', L: 'R', r: 'l', l: 'r',
  U: 'U', D: 'D', F: 'F', B: 'B', M: 'M', E: 'E', S: 'S',
  u: 'u', d: 'd', f: 'f', b: 'b', x: 'x', y: 'y', z: 'z',
}

/**
 * The left-right mirror image of an algorithm (what you would see in a mirror held beside the
 * cube): R U R' U' -> L' U' L U. Useful for turning a right-handed algorithm into its
 * left-handed twin.
 */
export function mirrorAlg(alg: Alg | string): Move[] {
  return toAlg(alg).map((move) => {
    const base = moveBase(move)
    // M and x turn about the mirror's own axis, so their direction is unchanged.
    const keep = base === 'M' || base === 'x'
    const amount = moveAmount(move)
    return makeMove(MIRROR_BASE[base], keep ? amount : 4 - amount)!
  })
}

/** Number of moves, counting any turn of one layer as one move and ignoring cube rotations. */
export function countMoves(alg: Alg | string): number {
  return toAlg(alg).filter((m) => !isRotation(m)).length
}

export type TurnDirection = 'clockwise' | 'counter-clockwise' | 'half-turn'

export interface MoveDescription {
  move: Move
  kind: MoveKind
  /** What turns: "Right face", "Middle slice", "Right two layers", "Whole cube". */
  layer: string
  direction: TurnDirection
  /** One short phrase: "Right face, clockwise". */
  text: string
  /** How it looks from the front, for a learner: "The right side goes up." */
  detail: string
}

const DIRECTION_TEXT: Record<TurnDirection, string> = {
  clockwise: 'clockwise',
  'counter-clockwise': 'counter-clockwise',
  'half-turn': 'half turn',
}

/** [plain, prime, half] — what a learner sees happen when looking at the front of the cube. */
const DETAIL: Record<MoveBase, [string, string, string]> = {
  R: ['The right side goes up.', 'The right side comes down.', 'The right side goes halfway round.'],
  L: ['The left side comes down.', 'The left side goes up.', 'The left side goes halfway round.'],
  U: ['The top slides to the left.', 'The top slides to the right.', 'The top goes halfway round.'],
  D: ['The bottom slides to the right.', 'The bottom slides to the left.', 'The bottom goes halfway round.'],
  F: ['The front turns like a clock.', 'The front turns backwards, against the clock.', 'The front goes halfway round.'],
  B: [
    'The back turns like a clock when you look at it from behind.',
    'The back turns against the clock when you look at it from behind.',
    'The back goes halfway round.',
  ],
  M: [
    'The middle strip comes down, the same way as L.',
    "The middle strip goes up, the same way as L'.",
    'The middle strip goes halfway round.',
  ],
  E: [
    'The middle belt slides to the right, the same way as D.',
    "The middle belt slides to the left, the same way as D'.",
    'The middle belt goes halfway round.',
  ],
  S: [
    'The slice behind the front turns like a clock, the same way as F.',
    "The slice behind the front turns against the clock, the same way as F'.",
    'The slice behind the front goes halfway round.',
  ],
  r: ['The right side and the middle strip go up together.', 'The right side and the middle strip come down together.', 'The right two layers go halfway round.'],
  l: ['The left side and the middle strip come down together.', 'The left side and the middle strip go up together.', 'The left two layers go halfway round.'],
  u: ['The top two layers slide to the left.', 'The top two layers slide to the right.', 'The top two layers go halfway round.'],
  d: ['The bottom two layers slide to the right.', 'The bottom two layers slide to the left.', 'The bottom two layers go halfway round.'],
  f: ['The front two layers turn like a clock.', 'The front two layers turn against the clock.', 'The front two layers go halfway round.'],
  b: [
    'The back two layers turn like a clock when seen from behind.',
    'The back two layers turn against the clock when seen from behind.',
    'The back two layers go halfway round.',
  ],
  x: ['Tip the whole cube away from you, so the front becomes the top.', 'Tip the whole cube towards you, so the top becomes the front.', 'Flip the whole cube over, front to back.'],
  y: ['Spin the whole cube so the right side comes to the front.', 'Spin the whole cube so the left side comes to the front.', 'Spin the whole cube halfway round, so the back comes to the front.'],
  z: ['Roll the whole cube like a clock, so the top becomes the right side.', 'Roll the whole cube against the clock, so the top becomes the left side.', 'Roll the whole cube upside down.'],
}

const SLICE_NAME: Record<SliceMoveBase, string> = {
  M: 'Middle slice',
  E: 'Equator slice',
  S: 'Standing slice',
}

/**
 * Whole-cube turns as the method says them to a learner — never as `y` or `z2`, which only the
 * notation trainer teaches. Yellow stays on top for every one except the roll that puts it there.
 * The lessons, the coach's hint card, Free play and "Solve my cube" all use these words.
 */
export const HOLD_WORDS: Readonly<Partial<Record<string, { text: string; short: string; detail: string }>>> = {
  y: { text: 'Turn the whole cube to the left', short: 'Turn left', detail: 'Like a carousel: the right side comes round to the front. Yellow stays on top.' },
  "y'": { text: 'Turn the whole cube to the right', short: 'Turn right', detail: 'Like a carousel: the left side comes round to the front. Yellow stays on top.' },
  y2: { text: 'Turn the whole cube half-way round', short: 'Turn ½', detail: 'Like a carousel: the back comes round to the front. Yellow stays on top.' },
  z2: { text: 'Roll the whole cube upside down', short: 'Roll over', detail: 'Keep the same side facing you. Yellow comes to the top, white goes underneath.' },
  x: { text: 'Tip the whole cube away from you', short: 'Tip away', detail: 'The front goes up to the top.' },
  "x'": { text: 'Tip the whole cube towards you', short: 'Tip towards you', detail: 'The top comes down to the front.' },
  x2: { text: 'Tip the whole cube over', short: 'Tip over', detail: 'The top goes underneath, the front goes to the back.' },
  z: { text: 'Roll the whole cube to the right', short: 'Roll right', detail: 'The top goes to the right side.' },
  "z'": { text: 'Roll the whole cube to the left', short: 'Roll left', detail: 'The top goes to the left side.' },
}

/** A whole-cube turn in the method's words (`HOLD_WORDS`); any other move as `describeMove` says it. */
export function describeHold(move: Move): { text: string; short: string; detail: string } {
  const words = HOLD_WORDS[move]
  if (words) return words
  const d = describeMove(move)
  return { text: d.text, short: move, detail: d.detail }
}

/**
 * Describe a move in words a beginner can follow.
 * `describeMove("R").text` is "Right face, clockwise"; `.detail` is "The right side goes up."
 */
export function describeMove(move: Move): MoveDescription {
  const base = moveBase(move)
  const def = MOVE_BASE_DEFS[base]
  const amount = moveAmount(move)
  const direction: TurnDirection = amount === 1 ? 'clockwise' : amount === 3 ? 'counter-clockwise' : 'half-turn'
  let layer: string
  if (def.kind === 'face') layer = `${FACE_NAME[def.follows]} face`
  else if (def.kind === 'slice') layer = SLICE_NAME[base as SliceMoveBase]
  else if (def.kind === 'wide') layer = `${FACE_NAME[def.follows]} two layers`
  else layer = 'Whole cube'
  const detail = DETAIL[base][amount === 1 ? 0 : amount === 3 ? 1 : 2]
  let text: string
  if (def.kind === 'rotation') {
    const like = `${def.follows}${amount === 3 ? "'" : amount === 2 ? '2' : ''}`
    text = `Whole cube, ${DIRECTION_TEXT[direction]} (like ${like})`
  } else {
    text = `${layer}, ${DIRECTION_TEXT[direction]}`
  }
  return { move, kind: def.kind, layer, direction, text, detail }
}
