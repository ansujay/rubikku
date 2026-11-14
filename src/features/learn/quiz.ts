/**
 * "Which is it?" — the recognition rounds. Each question is a real cube taken from the beginner
 * solver (a seeded scramble solved up to the moment that matters) and asks him to make one of
 * the decisions the method turns on: which daisy case, which side a middle edge goes to, which
 * yellow corner is at home even though it is twisted, keep twisting or turn the top.
 *
 * Pure and deterministic: question `n` of a kind is always the same cube. `quiz.test` checks
 * every answer against raw stickers (and against cubejs for what the moves then do).
 */
import {
  applyAlg,
  centerColors,
  COLOR_FACE,
  homeSlot,
  isStageComplete,
  nextBeginnerStep,
  pieceAt,
  pieceColors,
  type Color,
  type CubeState,
  type Face,
  type PieceId,
  type SlotId,
  type SolveStep,
  type StageId,
} from '../../cube'
import type { QuizKind } from './content/types'
import { heldScramble, solverSteps, solveToStage } from './engine'

export interface QuizOption {
  id: string
  label: string
  /** Colours to show as little stickers beside the label. */
  swatch?: readonly Color[]
}

export interface QuizLight {
  pieces?: readonly PieceId[]
  slots?: readonly SlotId[]
}

export interface QuizQuestion {
  kind: QuizKind
  /** Which sort of question this is (several kinds mix two). */
  type: string
  state: CubeState
  prompt: string
  options: readonly QuizOption[]
  answer: string
  /** Why the answer is right, said after he answers (right or wrong). */
  why: string
  /** What is lit while he decides (never the answer itself). */
  ask: QuizLight
  /** What is lit once he has answered. */
  reveal: QuizLight
  mirrors: boolean
  /** Show the flat top view beside the cube. */
  top: boolean
}

export const QUIZ_STAGE: Record<QuizKind, StageId> = {
  'daisy-case': 'daisy',
  'cross-petal': 'white-cross',
  'corner-home': 'white-corners',
  'middle-side': 'middle-layer',
  'yellow-shape': 'yellow-cross',
  'edges-match': 'yellow-edges',
  'corner-place': 'yellow-corners-position',
  'twist-next': 'yellow-corners-orient',
}

const SIDES = ['F', 'R', 'B', 'L'] as const
const TOP_EDGES = ['UF', 'UR', 'UB', 'UL'] as const
const TOP_CORNERS = ['URF', 'UFL', 'ULB', 'UBR'] as const
const CORNER_WORDS: Record<(typeof TOP_CORNERS)[number], string> = { URF: 'Front-right', UFL: 'Front-left', ULB: 'Back-left', UBR: 'Back-right' }
const SPINS = ['', 'y', 'y2', "y'"] as const

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The colour of the sticker of `slot`'s piece that faces `face`. */
function stickerOn(state: CubeState, slot: SlotId, face: Face): Color {
  return pieceAt(state, slot).stickers.find((s) => s.face === face)!.color
}

/** Every step of the method from a seeded scramble, up to and including `stage`. */
function* stepsOf(seed: string, stage: StageId, trigger = false): Generator<SolveStep> {
  for (const step of solverSteps(solveToStage(heldScramble(seed), stage), trigger)) {
    if (step.stage !== stage) return
    yield step
  }
}

/** Search seeds `kind:n:attempt` until `find` returns a question. */
function search(kind: QuizKind, n: number, find: (seed: string, attempt: number) => QuizQuestion | null): QuizQuestion {
  for (let attempt = 0; attempt < 400; attempt++) {
    const found = find(`quiz:${kind}:${n}:${attempt}`, attempt)
    if (found) return found
  }
  throw new Error(`No ${kind} question for #${n}`)
}

// ───────────────────────── Stage 1: which daisy case? ─────────────────────────

const DAISY_CASES = ['middle', 'bottom', 'top-flipped', 'bottom-flipped'] as const
const DAISY_OPTIONS: QuizOption[] = [
  { id: 'middle', label: 'In the middle layer' },
  { id: 'bottom', label: 'On the bottom, white facing down' },
  { id: 'top-flipped', label: 'On top, white facing sideways' },
  { id: 'bottom-flipped', label: 'On the bottom, white facing sideways' },
]
const DAISY_WHY: Record<(typeof DAISY_CASES)[number], string> = {
  middle: 'Case 1: it is in the middle layer. Turn the face of its **other** sticker and it swings up, white facing up.',
  bottom: 'Case 2: it is on the bottom with white facing down. Check the spot above is free, then turn that side half-way round.',
  'top-flipped': 'Case 3: it is on top, but white faces sideways. Turn that side once to push it into the middle layer — then it is Case 1.',
  'bottom-flipped': 'Case 4: it is on the bottom with white on a side. Turn that side once to lift it into the middle layer — check the petal spot above first.',
}

function daisyCase(n: number): QuizQuestion {
  const wanted = DAISY_CASES[n % 4]
  return search('daisy-case', n, (seed) => {
    for (const step of stepsOf(seed, 'daisy')) {
      if (step.caseId !== `daisy/${wanted}`) continue
      const piece = step.highlight.pieces[0]
      return {
        kind: 'daisy-case',
        type: wanted,
        state: step.before,
        prompt: 'Where is the lit white edge?',
        options: DAISY_OPTIONS,
        answer: wanted,
        why: DAISY_WHY[wanted],
        ask: { pieces: [piece] },
        reveal: { pieces: [piece] },
        mirrors: true,
        top: false,
      }
    }
    return null
  })
}

// ───────────────────────── Stage 2: which centre? drop it now? ─────────────────────────

function sideOptions(state: CubeState): QuizOption[] {
  const centres = centerColors(state)
  return SIDES.map((face) => ({ id: centres[face], label: cap(centres[face]), swatch: [centres[face]] }))
}

function crossPetal(n: number): QuizQuestion {
  const type = n % 2 === 0 ? 'centre' : 'drop'
  return search('cross-petal', n, (seed, attempt) => {
    const daisy = solveToStage(heldScramble(seed), 'white-cross')
    // Some turn of the top: the petals sit wherever they happen to be.
    const state = applyAlg(daisy, ['', 'U', 'U2', "U'"][(n + attempt) % 4])
    if (stickerOn(state, 'UF', 'U') !== 'white') return null
    const petal = pieceAt(state, 'UF').piece
    const side = stickerOn(state, 'UF', 'F')
    const front = centerColors(state).F
    if (type === 'centre') {
      return {
        kind: 'cross-petal',
        type,
        state,
        prompt: 'The lit petal belongs above one of the side centres. Which one?',
        options: sideOptions(state),
        answer: side,
        why: `Read its side sticker, not the white one: **${side}**. So it drops next to the ${side} centre — turn the top until ${side} touches ${side}, then drop.`,
        ask: { pieces: [petal] },
        reveal: { pieces: [petal], slots: [SIDES.find((f) => centerColors(state)[f] === side)!] },
        mirrors: false,
        top: false,
      }
    }
    const matched = side === front
    // Half of these questions match, half do not.
    if (matched !== (Math.floor(n / 2) % 2 === 0)) return null
    return {
      kind: 'cross-petal',
      type,
      state,
      prompt: 'Look at the front petal and the front centre. Drop it now with `F2`?',
      options: [
        { id: 'yes', label: 'Yes — drop it now' },
        { id: 'no', label: 'No — turn the top first' },
      ],
      answer: matched ? 'yes' : 'no',
      why: matched
        ? `Its side sticker is ${side} and the centre below is ${front}: they match. \`F2\` drops it home.`
        : `Its side sticker is ${side} but the centre below is ${front}. Dropped now, it would land in the wrong place. Turn the top until ${side} sits above ${side}.`,
      ask: { pieces: [petal], slots: ['F'] },
      reveal: { pieces: [petal], slots: ['F'] },
      mirrors: false,
      top: false,
    }
  })
}

// ───────────────────────── Stage 3: where is home? done, twisted or wrong? ─────────────────────────

const PAIRS = [
  ['F', 'R'],
  ['R', 'B'],
  ['B', 'L'],
  ['L', 'F'],
] as const
const PAIR_SLOT: Record<string, SlotId> = { FR: 'DFR', RB: 'DRB', BL: 'DBL', LF: 'DLF' }
const sameColours = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join()

function cornerHome(n: number): QuizQuestion {
  const type = ['home', 'state', 'home', 'state'][n % 4]
  if (type === 'home') {
    return search('corner-home', n, (seed, attempt) => {
      const start = solveToStage(heldScramble(seed), 'white-corners')
      // A white corner parked at the front-right of the top, by a turn of the top.
      for (const turn of ['', 'U', 'U2', "U'"]) {
        const state = applyAlg(start, turn)
        const loc = pieceAt(state, 'URF')
        if (!loc.stickers.some((s) => s.color === 'white')) continue
        const centres = centerColors(state)
        const colours = pieceColors(loc.piece).filter((c) => c !== 'white')
        const pair = PAIRS.find(([a, b]) => sameColours([centres[a], centres[b]], colours))!
        if ((n + attempt) % 2 === 1 && pair[0] === 'F' && pair[1] === 'R') continue // not always right underneath
        return {
          kind: 'corner-home',
          type,
          state,
          prompt: 'Where is the lit corner’s home? It goes between the centres of its two side colours.',
          options: PAIRS.map(([a, b]) => ({ id: a + b, label: `Between ${centres[a]} and ${centres[b]}`, swatch: [centres[a], centres[b]] })),
          answer: pair.join(''),
          why: `Its colours are white, ${colours[0]} and ${colours[1]}. Its home is the bottom corner between the ${colours[0]} and ${colours[1]} centres.`,
          ask: { pieces: [loc.piece], slots: ['F', 'R', 'B', 'L'] },
          reveal: { pieces: [loc.piece], slots: [pair[0], pair[1], PAIR_SLOT[pair.join('')]] },
          mirrors: true,
          top: false,
        }
      }
      return null
    })
  }
  const wanted = ['twisted', 'wrong', 'done', 'twisted'][Math.floor(n / 2) % 4]
  return search('corner-home', n, (seed) => {
    for (const step of stepsOf(seed, 'white-corners', true)) {
      for (const spin of SPINS) {
        const state = applyAlg(step.before, spin)
        const loc = pieceAt(state, 'DFR')
        if (!loc.stickers.some((s) => s.color === 'white')) continue
        const kind = loc.solved ? 'done' : homeSlot(state, loc.piece) === 'DFR' ? 'twisted' : 'wrong'
        if (kind !== wanted) continue
        const centres = centerColors(state)
        return {
          kind: 'corner-home',
          type: 'state',
          state,
          prompt: 'Look at the white corner at the bottom front-right. What is it?',
          options: [
            { id: 'done', label: 'Home, white facing down' },
            { id: 'twisted', label: 'Home, but twisted' },
            { id: 'wrong', label: 'In another corner’s home' },
          ],
          answer: kind,
          why:
            kind === 'done'
              ? `Its colours match the ${centres.F} and ${centres.R} centres and white faces down. Done.`
              : kind === 'twisted'
                ? `Its colours belong between ${centres.F} and ${centres.R} — but white is not facing down. Keep doing the Right Trigger here until it is (2 or 4 times).`
                : `Its colours do not belong between ${centres.F} and ${centres.R}. One Right Trigger pops it up to the top; then take it to its real home.`,
          ask: { pieces: [loc.piece], slots: ['F', 'R'] },
          reveal: { pieces: [loc.piece], slots: ['F', 'R'] },
          mirrors: true,
          top: false,
        }
      }
    }
    return null
  })
}

// ───────────────────────── Stage 4: right, left, or neither? ─────────────────────────

function middleSide(n: number): QuizQuestion {
  const wanted = ['right', 'left', 'neither', 'left', 'right', 'neither'][n % 6]
  const options: QuizOption[] = [
    { id: 'left', label: 'Left' },
    { id: 'right', label: 'Right' },
    { id: 'neither', label: 'Neither — it has yellow' },
  ]
  return search('middle-side', n, (seed, attempt) => {
    if (wanted === 'neither') {
      const start = solveToStage(heldScramble(seed), 'middle-layer')
      const state = applyAlg(start, ['', 'U', 'U2', "U'"][attempt % 4])
      const loc = pieceAt(state, 'UF')
      if (!loc.stickers.some((s) => s.color === 'yellow')) return null
      const centres = centerColors(state)
      return {
        kind: 'middle-side',
        type: wanted,
        state,
        prompt: 'Which way does the front top edge go?',
        options,
        answer: 'neither',
        why: `It has a **yellow** sticker, so it belongs in the top layer, not the middle. Leave it and look for an edge with no yellow. (Compare: ${centres.L} centre on the left, ${centres.R} on the right.)`,
        ask: { pieces: [loc.piece], slots: ['F', 'R', 'L'] },
        reveal: { pieces: [loc.piece] },
        mirrors: true,
        top: false,
      }
    }
    for (const step of stepsOf(seed, 'middle-layer')) {
      if (step.caseId !== `middle-layer/insert-${wanted}`) continue
      const state = applyAlg(step.before, step.setup)
      const loc = pieceAt(state, 'UF')
      const top = stickerOn(state, 'UF', 'U')
      const front = stickerOn(state, 'UF', 'F')
      const centres = centerColors(state)
      const alg = wanted === 'right' ? "`U R U' R' U' F' U F`" : "`U' L' U L U F U' F'`"
      return {
        kind: 'middle-side',
        type: wanted,
        state,
        prompt: 'The T is made. Which way does the front top edge go?',
        options,
        answer: wanted,
        why: `Its top sticker is **${top}** — the colour of the centre on the ${wanted} (${wanted === 'right' ? centres.R : centres.L}). So it goes ${wanted}: ${alg}. (Its front sticker, ${front}, already sits on the ${front} centre.)`,
        ask: { pieces: [loc.piece], slots: ['F', 'R', 'L'] },
        // The centre it matches, not the slot: lighting the slot would light whatever sits in it.
        reveal: { pieces: [loc.piece], slots: ['F', wanted === 'right' ? 'R' : 'L'] },
        mirrors: true,
        top: false,
      }
    }
    return null
  })
}

// ───────────────────────── Stage 5: dot, L, line or cross — and is it held right? ─────────────────────────

const SHAPE_OPTIONS: QuizOption[] = [
  { id: 'dot', label: 'Dot' },
  { id: 'L', label: 'L' },
  { id: 'line', label: 'Line' },
  { id: 'cross', label: 'Cross' },
]
const SHAPE_WHY: Record<string, string> = {
  dot: 'No yellow edges up: a **dot**. Do `F R U R\' U\' F\'` from any side and an L appears.',
  L: 'Two yellow edges side by side: an **L**. Tuck it into the back-left, then the algorithm.',
  line: 'Two yellow edges opposite each other: a **line**. Lay it left to right, then the algorithm.',
  cross: 'All four yellow edges up: the **cross**. This stage is done — whatever the corners look like.',
}

function yellowShape(n: number): QuizQuestion {
  const type = n % 3 === 2 ? 'hold' : 'shape'
  if (type === 'shape') {
    const wanted = ['L', 'dot', 'line', 'cross'][(n - Math.floor((n + 1) / 3)) % 4]
    return search('yellow-shape', n, (seed) => {
      const start = solveToStage(heldScramble(seed), 'yellow-cross')
      let state: CubeState | null = null
      if (wanted === 'cross') state = solveToStage(start, 'yellow-edges')
      else {
        for (const step of stepsOf(seed, 'yellow-cross')) if (step.caseId === `yellow-cross/${wanted}`) state = step.before
      }
      if (!state) return null
      return {
        kind: 'yellow-shape',
        type,
        state,
        prompt: 'Look only at the edges round the yellow centre. Which shape is it?',
        options: SHAPE_OPTIONS,
        answer: wanted,
        why: `${SHAPE_WHY[wanted]} Yellow on the corners does not count.`,
        ask: {},
        reveal: { slots: ['U', ...TOP_EDGES] },
        mirrors: false,
        top: true,
      }
    })
  }
  const ready = Math.floor(n / 3) % 2 === 0
  return search('yellow-shape', n, (seed, attempt) => {
    for (const step of stepsOf(seed, 'yellow-cross')) {
      const shape = step.caseId === 'yellow-cross/L' ? 'L' : step.caseId === 'yellow-cross/line' ? 'line' : null
      if (!shape || (shape === 'line') !== (attempt % 2 === 0)) continue
      const held = applyAlg(step.before, step.setup)
      const state = ready ? held : applyAlg(held, shape === 'line' ? 'U' : ['U', "U'", 'U2'][attempt % 3])
      return {
        kind: 'yellow-shape',
        type: 'hold',
        state,
        prompt: `It is ${shape === 'L' ? 'an L' : 'a line'}. Is it held right for \`F R U R' U' F'\`?`,
        options: [
          { id: 'yes', label: 'Yes — go' },
          { id: 'no', label: 'No — turn the top first' },
        ],
        answer: ready ? 'yes' : 'no',
        why:
          shape === 'L'
            ? ready
              ? 'The L points to the back and to the left: tucked into the back-left. Go.'
              : 'An L must point to the back and to the left. Held any other way it only makes another L. Turn the top first.'
            : ready
              ? 'The line runs left to right, like the horizon. Go.'
              : 'A line must run left to right. Pointing at you, it goes all the way back to a dot. Turn the top once.',
        ask: {},
        reveal: { slots: ['U', ...TOP_EDGES] },
        mirrors: false,
        top: true,
      }
    }
    return null
  })
}

// ───────────────────────── Stage 6: how many match? ready to swap? ─────────────────────────

const matchingEdges = (state: CubeState) => TOP_EDGES.filter((slot) => pieceAt(state, slot).solved)

function edgesMatch(n: number): QuizQuestion {
  const type = n % 2 === 0 ? 'count' : 'next'
  if (type === 'count') {
    // The useful answer, 2, comes round every other time: 2, 1, 2, 0.
    const want = [2, 1, 2, 0][Math.floor(n / 2) % 4]
    return search('edges-match', n, (seed, attempt) => {
      const start = solveToStage(heldScramble(seed), 'yellow-edges')
      const state = applyAlg(start, ['', 'U', 'U2', "U'"][(n + attempt) % 4])
      const count = matchingEdges(state).length
      if (count !== want) return null
      return {
        kind: 'edges-match',
        type,
        state,
        prompt: 'How many yellow edges match the centre below them right now?',
        options: ['0', '1', '2', '4'].map((id) => ({ id, label: id })),
        answer: String(count),
        why: count === 2 ? 'Two match. Stop turning the top: now hold those two at the back and right and swap.' : count === 1 ? 'Only one matches. Turn the top again — some turn always gives two (or four).' : 'None match. Turn the top and count again.',
        ask: { pieces: TOP_EDGES.map((slot) => pieceAt(state, slot).piece), slots: ['F', 'R', 'B', 'L'] },
        reveal: { pieces: matchingEdges(state).map((slot) => pieceAt(state, slot).piece), slots: ['F', 'R', 'B', 'L'] },
        mirrors: true,
        top: true,
      }
    })
  }
  const wanted = ['swap', 'top', 'cube'][Math.floor(n / 2) % 3]
  const CASE: Record<string, string> = { swap: 'yellow-edges/swap', top: 'yellow-edges/match-two', cube: 'yellow-edges/face-swap' }
  return search('edges-match', n, (seed) => {
    for (const step of stepsOf(seed, 'yellow-edges')) {
      if (step.caseId !== CASE[wanted]) continue
      const state = wanted === 'swap' ? applyAlg(step.before, step.setup) : step.before
      return {
        kind: 'edges-match',
        type,
        state,
        prompt: 'What comes next: match, hold, or swap?',
        options: [
          { id: 'top', label: 'Turn the top to get two matching' },
          { id: 'cube', label: 'Turn the whole cube to hold them' },
          { id: 'swap', label: 'Do the Edge Swap now' },
        ],
        answer: wanted,
        why:
          wanted === 'swap'
            ? 'Two neighbours match and they are at the back and on the right. Swap: `R U R\' U R U2 R\' U`.'
            : wanted === 'cube'
              ? 'Two neighbours match, but not at the back and right. Turn the whole cube (yellow stays on top) until they are.'
              : 'Fewer than two match. Turn the top and count until two do.',
        ask: { pieces: TOP_EDGES.map((slot) => pieceAt(state, slot).piece), slots: ['F', 'R', 'B', 'L'] },
        reveal: { pieces: matchingEdges(state).map((slot) => pieceAt(state, slot).piece), slots: ['F', 'R', 'B', 'L'] },
        mirrors: true,
        top: true,
      }
    }
    return null
  })
}

// ───────────────────────── Stage 7: which corner is at home? ─────────────────────────

/** The top corners whose three colours are the three centres round them (twist ignored). */
export function homeCorners(state: CubeState): SlotId[] {
  const centres = centerColors(state)
  return TOP_CORNERS.filter((slot) => {
    const want = (slot.split('') as Face[]).map((face) => centres[face])
    return sameColours(pieceColors(pieceAt(state, slot).piece), want)
  })
}

function cornerPlace(n: number): QuizQuestion {
  const wanted = ['twisted', 'none', 'twisted', 'solved', 'twisted', 'none'][n % 6]
  return search('corner-place', n, (seed, attempt) => {
    const start = solveToStage(heldScramble(seed), 'yellow-corners-position')
    // The top lined up first, as the lesson says.
    const lined = isStageComplete(start, 'yellow-edges', { aligned: true }) ? start : (() => {
      const step = nextBeginnerStep(start)
      return step?.caseId === 'yellow-corners-position/line-up' ? step.after : start
    })()
    const state = applyAlg(lined, SPINS[(n + attempt) % 4])
    if (!isStageComplete(state, 'yellow-edges', { aligned: true })) return null
    const home = homeCorners(state)
    if (home.length === 4) return null
    if (wanted === 'none' ? home.length !== 0 : home.length !== 1) return null
    if (wanted !== 'none') {
      const solved = pieceAt(state, home[0]).solved
      if (solved !== (wanted === 'solved')) return null
      // Not always the front-right.
      if (home[0] === 'URF' && attempt % 3 !== 0) return null
    }
    const answer: string = home[0] ?? 'none'
    const centres = centerColors(state)
    const describe = (slot: SlotId) => (slot.split('') as Face[]).map((f) => centres[f]).join(', ')
    const twisted = answer !== 'none' && !pieceAt(state, answer as SlotId).solved
    return {
      kind: 'corner-place',
      type: wanted,
      state,
      prompt: 'Which top corner is at home? Twisted counts — only its three colours matter.',
      options: [...TOP_CORNERS.map((slot) => ({ id: slot, label: CORNER_WORDS[slot] })), { id: 'none', label: 'None of them' }],
      answer,
      why:
        answer === 'none'
          ? 'None of the four has the colours of its three centres. Do the Corner Cycle once from anywhere, then look again: one will be home.'
          : `The ${CORNER_WORDS[answer as (typeof TOP_CORNERS)[number]].toLowerCase()} corner has ${describe(answer as SlotId)} — the three centres round it.${twisted ? ' Its yellow is not on top, but that does not matter yet.' : ''} Hold it at the front-right and cycle.`,
      ask: { slots: ['U', 'F', 'R', 'B', 'L'] },
      reveal: answer === 'none' ? { slots: ['U', 'F', 'R', 'B', 'L'] } : { pieces: [pieceAt(state, answer as SlotId).piece], slots: answer.split('') as SlotId[] },
      mirrors: true,
      top: true,
    }
  })
}

// ───────────────────────── Stage 8: keep twisting, or turn the top? ─────────────────────────

function twistNext(n: number): QuizQuestion {
  // ("Turn the whole cube" is never right once the first twist has started — it is always offered.)
  const wanted = ['twist', 'top', 'continue', 'top', 'continue', 'final'][n % 6]
  const CASE: Record<string, string> = {
    twist: 'yellow-corners-orient/twist',
    continue: 'yellow-corners-orient/twist',
    top: 'yellow-corners-orient/next-corner',
    final: 'yellow-corners-orient/final-turn',
  }
  return search('twist-next', n, (seed) => {
    for (const step of stepsOf(seed, 'yellow-corners-orient')) {
      if (step.caseId !== CASE[wanted]) continue
      let state = applyAlg(step.before, step.setup)
      if (wanted === 'continue') {
        // One Corner Twist in, the yellow sticker is underneath: the hard moment.
        if ((step.algorithm?.repetitions ?? 0) < 2) continue
        state = applyAlg(state, "R' D' R D")
      }
      if (wanted === 'top' || wanted === 'final') state = step.before
      const answer = wanted === 'continue' ? 'twist' : wanted === 'final' ? 'top' : wanted
      return {
        kind: 'twist-next',
        type: wanted,
        state,
        prompt: 'Look at the workbench — the front-right corner of the top. What now?',
        options: [
          { id: 'twist', label: "Keep twisting: R′ D′ R D" },
          { id: 'top', label: 'Turn only the top' },
          { id: 'cube', label: 'Turn the whole cube' },
        ],
        answer,
        why:
          wanted === 'final'
            ? 'Every corner shows yellow on top and the bottom is back. Turn the top until the sides match: solved.'
            : answer === 'top'
              ? 'The workbench corner shows yellow on top: it is done. Leave the bottom as it is and turn **only the top** to bring the next twisted corner round. Never the whole cube.'
              : wanted === 'continue'
                ? 'There is **white** on the workbench: you are half-way through a twist and your yellow corner is underneath. Keep doing `R\' D\' R D` until yellow faces up there.'
                : 'The workbench corner does not show yellow on top. Do `R\' D\' R D` until it does — 2 or 4 times. The bottom will look scrambled; that is fine.',
        ask: { slots: ['URF'] },
        reveal: { slots: ['URF'] },
        mirrors: false,
        top: false,
      }
    }
    return null
  })
}

const GENERATORS: Record<QuizKind, (n: number) => QuizQuestion> = {
  'daisy-case': daisyCase,
  'cross-petal': crossPetal,
  'corner-home': cornerHome,
  'middle-side': middleSide,
  'yellow-shape': yellowShape,
  'edges-match': edgesMatch,
  'corner-place': cornerPlace,
  'twist-next': twistNext,
}

const cache = new Map<string, QuizQuestion>()

/** Question number `n` of a recognition round. Deterministic; cached. */
export function quizQuestion(kind: QuizKind, n: number): QuizQuestion {
  const key = `${kind}:${n}`
  let question = cache.get(key)
  if (!question) {
    question = GENERATORS[kind](n)
    cache.set(key, question)
  }
  return question
}

/** For tests: the face a colour's centre is on, in this cube. */
export function centreFace(state: CubeState, color: Color): Face {
  const centres = centerColors(state)
  return (Object.keys(centres) as Face[]).find((f) => centres[f] === color) ?? COLOR_FACE[color]
}
