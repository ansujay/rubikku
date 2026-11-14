/**
 * Validation of a cube that a person painted sticker by sticker.
 *
 * The cube may be entered in any orientation (the centres tell us how it is held) and may be
 * wrong in many ways. `validateCube` returns either a valid state or a list of specific
 * problems, each with the facelets involved so that the UI can highlight them and each with a
 * short, friendly default message.
 */
import {
  COLOR_FACE,
  COLORS,
  CORNERS,
  EDGES,
  FACE_COLOR,
  FACE_NAME,
  FACELETS,
  FACES,
  OPPOSITE_FACE,
  SLOT_FACELETS,
  type Color,
  type CornerId,
  type EdgeId,
  type Face,
  type PieceId,
  type SlotId,
} from './geometry'
import { algPermutation, IDENTITY_PERMUTATION, uprightRotation, type Permutation } from './moves'
import type { RotationMove } from './notation'
import { identifyStickers, permutationParity } from './pieces'
import { isStateString, type CubeState } from './state'

/**
 * 54 stickers in facelet order (faces U R F D L B as held by the person, row by row).
 * Use null (or undefined) for a sticker that has not been painted yet.
 * A 54-character string of face letters (U R F D L B = white red green yellow orange blue)
 * is accepted as well; any other character counts as unpainted.
 */
export type PaintedCube = readonly (Color | null | undefined)[] | string

export type CubeProblem =
  | {
      /** Some stickers have not been coloured in yet. */
      code: 'unpainted'
      facelets: number[]
      message: string
    }
  | {
      /** A colour is used more or fewer than 9 times. */
      code: 'wrong-count'
      color: Color
      count: number
      expected: 9
      /** Every facelet currently painted with that colour. */
      facelets: number[]
      message: string
    }
  | {
      /** Two or more centres have the same colour. */
      code: 'duplicate-centers'
      color: Color
      faces: Face[]
      facelets: number[]
      message: string
    }
  | {
      /** The six centres are all different but arranged in a way no real cube can be. */
      code: 'impossible-centers'
      /** The centre facelets that disagree with the standard colour scheme. */
      facelets: number[]
      message: string
    }
  | {
      /** A corner or edge whose colours cannot belong to one piece. */
      code: 'impossible-piece'
      kind: 'corner' | 'edge'
      slot: SlotId
      facelets: number[]
      colors: Color[]
      /**
       * same-color: one colour twice · opposite-colors: e.g. white with yellow ·
       * mirrored: the right three colours but in mirror-image order.
       */
      reason: 'same-color' | 'opposite-colors' | 'mirrored'
      message: string
    }
  | {
      /** The same piece appears in more than one place. */
      code: 'duplicate-piece'
      kind: 'corner' | 'edge'
      piece: PieceId
      colors: Color[]
      slots: SlotId[]
      facelets: number[]
      message: string
    }
  | {
      /** All pieces are real, but one corner is twisted in place (unsolvable until fixed). */
      code: 'twisted-corner'
      /** Which way the corner has been twisted. Twist it back the other way to fix it. */
      twist: 'clockwise' | 'counter-clockwise'
      /** The corner, when exactly one corner is not white/yellow up/down; otherwise empty. */
      slots: SlotId[]
      facelets: number[]
      message: string
    }
  | {
      /** All pieces are real, but one edge is flipped in place (unsolvable until fixed). */
      code: 'flipped-edge'
      /** The edge, when exactly one edge is flipped; otherwise empty. */
      slots: SlotId[]
      facelets: number[]
      message: string
    }
  | {
      /** All pieces are real, but two of them have been swapped (unsolvable until fixed). */
      code: 'swapped-pieces'
      /** The two pieces, when exactly two pieces are out of place; otherwise empty. */
      slots: SlotId[]
      facelets: number[]
      message: string
    }

export type CubeProblemCode = CubeProblem['code']

export type ValidationResult =
  | {
      ok: true
      /** The cube exactly as painted (possibly not in the standard orientation). */
      state: CubeState
      /** The same cube turned to the standard orientation (white up, green front). */
      upright: CubeState
      /** Whole-cube rotations that turn `state` into `upright`. */
      rotation: readonly RotationMove[]
      problems: []
    }
  | { ok: false; problems: CubeProblem[] }

const LETTERS = 'URFDLB'

function toLetters(input: PaintedCube): (Face | null)[] {
  const out: (Face | null)[] = new Array(54).fill(null)
  for (let i = 0; i < 54; i++) {
    const v = input[i]
    if (typeof input === 'string') out[i] = v && LETTERS.includes(v) ? (v as Face) : null
    else out[i] = v && COLOR_FACE[v as Color] ? COLOR_FACE[v as Color] : null
  }
  return out
}

function colorList(colors: readonly Color[]): string {
  if (colors.length <= 1) return colors.join('')
  return `${colors.slice(0, -1).join(', ')} and ${colors[colors.length - 1]}`
}

const SLOT_WORDS: Record<Face, string> = { U: 'top', D: 'bottom', F: 'front', B: 'back', L: 'left', R: 'right' }

/** "top-front edge", "bottom-front-right corner" — a slot in words. */
export function describeSlot(slot: SlotId): string {
  const words = slot
    .split('')
    .map((f) => SLOT_WORDS[f as Face])
    .join('-')
  return slot.length === 3 ? `${words} corner` : slot.length === 2 ? `${words} edge` : `${words} centre`
}

/**
 * Check a painted cube.
 *
 * Problems are reported in the order a person should fix them, and later checks are skipped
 * when earlier ones make them meaningless:
 *  1. unpainted stickers, colours used the wrong number of times;
 *  2. centres (duplicates, impossible arrangement) — stops here if the centres are wrong;
 *  3. impossible pieces and duplicated pieces — stops here if there are any;
 *  4. twisted corner, flipped edge, swapped pair (a cube that was taken apart or had a corner
 *     twisted — every sticker is plausible but it cannot be solved by turning).
 * Slots and facelets in the problems always refer to the cube as it was painted.
 */
export function validateCube(input: PaintedCube): ValidationResult {
  const problems: CubeProblem[] = []
  if (input.length !== 54) {
    throw new Error('validateCube expects exactly 54 stickers')
  }
  const letters = toLetters(input)

  // 1. Unpainted stickers and colour counts.
  const blanks: number[] = []
  const byColor = new Map<Face, number[]>(FACES.map((f) => [f, []]))
  letters.forEach((l, i) => {
    if (l) byColor.get(l)!.push(i)
    else blanks.push(i)
  })
  if (blanks.length) {
    problems.push({
      code: 'unpainted',
      facelets: blanks,
      message:
        blanks.length === 1
          ? 'One sticker still needs a colour.'
          : `${blanks.length} stickers still need a colour.`,
    })
  }
  for (const color of COLORS) {
    const facelets = byColor.get(COLOR_FACE[color])!
    const count = facelets.length
    // While stickers are still blank, "too few" is expected — only "too many" is a mistake.
    if (count === 9 || (blanks.length > 0 && count < 9)) continue
    const diff = Math.abs(count - 9)
    problems.push({
      code: 'wrong-count',
      color,
      count,
      expected: 9,
      facelets,
      message:
        count > 9
          ? `There are ${count} ${color} stickers, but a cube has exactly 9. ${diff} of them should be another colour.`
          : `There are only ${count} ${color} stickers, but a cube has exactly 9. ${diff} more should be ${color}.`,
    })
  }

  // 2. Centres.
  const centerFacelet = (f: Face) => FACES.indexOf(f) * 9 + 4
  const centersPainted = FACES.every((f) => letters[centerFacelet(f)] !== null)
  let perm: Permutation | null = null
  let rotation: readonly RotationMove[] = []
  if (centersPainted) {
    let duplicate = false
    for (const color of COLORS) {
      const faces = FACES.filter((f) => letters[centerFacelet(f)] === COLOR_FACE[color])
      if (faces.length > 1) {
        duplicate = true
        problems.push({
          code: 'duplicate-centers',
          color,
          faces,
          facelets: faces.map(centerFacelet),
          message: `${faces.length} centres are ${color}. Every centre has its own colour — check the middle sticker of the ${faces
            .map((f) => FACE_NAME[f].toLowerCase())
            .join(' and ')} faces.`,
        })
      }
    }
    if (!duplicate) {
      const rot = uprightRotation(letters as Face[])
      if (rot) {
        rotation = rot
        perm = rot.length ? algPermutation(rot) : IDENTITY_PERMUTATION
      } else {
        const wrong = FACES.filter((f) => letters[centerFacelet(OPPOSITE_FACE[f])] !== OPPOSITE_FACE[letters[centerFacelet(f)]!])
        const opposite = wrong.length > 0
        problems.push({
          code: 'impossible-centers',
          facelets: (opposite ? wrong : FACES).map(centerFacelet),
          message: opposite
            ? 'The centres are in places they can never be. White is always opposite yellow, red opposite orange, and green opposite blue.'
            : 'The centres are arranged like a mirror image of a real cube. With white on top and green in front, red must be on the right.',
        })
      }
    }
  }
  if (!perm) return { ok: false, problems }

  // 3. Pieces. Work on the cube turned upright; `perm[j]` maps back to the painted facelet.
  const up: (Face | null)[] = new Array(54)
  for (let j = 0; j < 54; j++) up[j] = letters[perm[j]]
  const original = (slot: SlotId) => {
    const facelets = SLOT_FACELETS[slot].map((j) => perm[j])
    return { facelets, slot: FACELETS[facelets[0]].slot }
  }

  const found = new Map<PieceId, SlotId[]>()
  const ids = new Map<SlotId, { piece: PieceId; orientation: number }>()
  for (const slot of [...CORNERS, ...EDGES] as (CornerId | EdgeId)[]) {
    const stickers = SLOT_FACELETS[slot].map((j) => up[j])
    if (stickers.some((s) => s === null)) continue
    const key = stickers.join('')
    const id = identifyStickers(key)
    const kind = slot.length === 3 ? 'corner' : 'edge'
    const where = original(slot)
    if (id) {
      ids.set(slot, id)
      found.set(id.piece, [...(found.get(id.piece) ?? []), slot])
      continue
    }
    const colors = (stickers as Face[]).map((s) => FACE_COLOR[s])
    const unique = new Set(stickers)
    let reason: 'same-color' | 'opposite-colors' | 'mirrored'
    let why: string
    if (unique.size < stickers.length) {
      reason = 'same-color'
      const twice = colors.find((c, i) => colors.indexOf(c) !== i)!
      why = `it has ${twice} on it twice`
    } else {
      const pair = (stickers as Face[]).find((s) => unique.has(OPPOSITE_FACE[s]))
      if (pair) {
        reason = 'opposite-colors'
        const a = FACE_COLOR[pair]
        const b = FACE_COLOR[OPPOSITE_FACE[pair]]
        why = `${a} and ${b} are on opposite sides of the cube, so they can never be on the same piece`
      } else {
        reason = 'mirrored'
        why = 'its three colours go round the wrong way — two of its stickers are probably swapped'
      }
    }
    problems.push({
      code: 'impossible-piece',
      kind,
      slot: where.slot,
      facelets: where.facelets,
      colors,
      reason,
      message: `The ${describeSlot(where.slot)} (${colorList(colors)}) cannot be a real piece: ${why}.`,
    })
  }
  for (const [piece, slots] of found) {
    if (slots.length < 2) continue
    const wheres = slots.map(original)
    const colors = piece.split('').map((f) => FACE_COLOR[f as Face])
    problems.push({
      code: 'duplicate-piece',
      kind: piece.length === 3 ? 'corner' : 'edge',
      piece,
      colors,
      slots: wheres.map((w) => w.slot),
      facelets: wheres.flatMap((w) => w.facelets),
      message: `The ${colorList(colors)} ${piece.length === 3 ? 'corner' : 'edge'} appears ${
        slots.length === 2 ? 'twice' : `${slots.length} times`
      }, but a cube has only one. Check the ${wheres.map((w) => describeSlot(w.slot)).join(' and the ')}.`,
    })
  }
  if (problems.length) return { ok: false, problems }

  // 4. Every piece is real and present exactly once: check that it can actually be solved.
  const cp = CORNERS.map((s) => CORNERS.indexOf(ids.get(s)!.piece as CornerId))
  const co = CORNERS.map((s) => ids.get(s)!.orientation)
  const ep = EDGES.map((s) => EDGES.indexOf(ids.get(s)!.piece as EdgeId))
  const eo = EDGES.map((s) => ids.get(s)!.orientation)

  const twistSum = co.reduce((a, b) => a + b, 0) % 3
  if (twistSum !== 0) {
    const twisted = CORNERS.filter((_, i) => co[i] !== 0)
    const where = twisted.length === 1 ? [original(twisted[0])] : []
    const twist = twistSum === 1 ? 'clockwise' : 'counter-clockwise'
    problems.push({
      code: 'twisted-corner',
      twist,
      slots: where.map((w) => w.slot),
      facelets: where.flatMap((w) => w.facelets),
      message:
        'One corner is twisted in its place, so this cube can never be solved by turning. ' +
        (where.length
          ? `Check the ${describeSlot(where[0].slot)}. `
          : 'Check the corners for a sticker entered on the wrong side. ') +
        `If your real cube looks exactly like this, gently twist one corner ${
          twist === 'clockwise' ? 'counter-clockwise' : 'clockwise'
        } to fix it.`,
    })
  }

  if (eo.reduce((a, b) => a + b, 0) % 2 !== 0) {
    const flipped = EDGES.filter((_, i) => eo[i] !== 0)
    const where = flipped.length === 1 ? [original(flipped[0])] : []
    problems.push({
      code: 'flipped-edge',
      slots: where.map((w) => w.slot),
      facelets: where.flatMap((w) => w.facelets),
      message:
        'One edge is flipped in its place, so this cube can never be solved by turning. ' +
        (where.length
          ? `Check the ${describeSlot(where[0].slot)} — its two stickers may be the wrong way round.`
          : 'Check the edges for two stickers entered the wrong way round. If your real cube looks exactly like this, pop one edge out and put it back flipped.'),
    })
  }

  if (permutationParity(cp) !== permutationParity(ep)) {
    const wrongCorners = CORNERS.filter((_, i) => cp[i] !== i)
    const wrongEdges = EDGES.filter((_, i) => ep[i] !== i)
    const pair: SlotId[] =
      wrongCorners.length === 2 && wrongEdges.length === 0
        ? wrongCorners
        : wrongEdges.length === 2 && wrongCorners.length === 0
          ? wrongEdges
          : []
    const where = pair.map(original)
    problems.push({
      code: 'swapped-pieces',
      slots: where.map((w) => w.slot),
      facelets: where.flatMap((w) => w.facelets),
      message:
        'Two pieces have swapped places, so this cube can never be solved by turning. ' +
        (where.length
          ? `Check the ${describeSlot(where[0].slot)} and the ${describeSlot(where[1].slot)}.`
          : 'Check that every piece was entered in the right place. If your real cube looks exactly like this, two pieces were put back in the wrong spots.'),
    })
  }

  if (problems.length) return { ok: false, problems }

  const state = letters.join('') as CubeState
  return { ok: true, state, upright: up.join('') as CubeState, rotation, problems: [] }
}

/**
 * True if the state is a real, solvable cube (in any orientation). Cheap — use it to guard
 * solvers against corrupt saved data.
 */
export function isSolvable(state: CubeState): boolean {
  return isStateString(state) && validateCube(state).ok
}
