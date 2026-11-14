/**
 * The beginner (human-method) solver.
 *
 * It solves any valid cube with exactly the layer-by-layer method the lessons teach, and it
 * returns the solution as *teachable steps*: what we see, why we do something about it, the
 * moves, the named algorithm, and the pieces to light up.
 *
 * ## How it is built
 *
 * The whole solver is one pure function, `nextBeginnerStep(state)`: look at the cube, decide the
 * single next thing a person would do. `solveBeginner` just repeats it until the cube is solved,
 * and `nextHint` calls it once. Consequences:
 *  - Deterministic: the same state always gives the same step.
 *  - Resumable: a cube that already has its white cross never gets daisy or cross steps, and
 *    solving from any step boundary of a solution reproduces the rest of that solution.
 *  - No searching and no open-ended loops: every stage is a short list of explicit cases
 *    ("where is the piece?" -> "what do we do?"). `solveBeginner` caps the number of steps and
 *    throws `BeginnerSolverError` (with the offending state) rather than ever hanging.
 *
 * ## The hold
 *
 * Yellow centre on top, white centre underneath, for the entire solve (the daisy is built round
 * the yellow centre and petals drop *down* onto the white face, so there is never a flip). The
 * solver turns the whole cube only with `y` moves after that, to bring the piece being worked on
 * to the front or front-right — each as its own `'hold'` step — because that is what a person
 * does and it is the hold every entry in `ALGORITHMS` is written for.
 */
import { getAlgorithm } from '../algorithms'
import {
  OPPOSITE_FACE,
  SLOT_FACELETS,
  pieceColors,
  slotFaces,
  slotWithFaces,
  type Color,
  type CornerId,
  type EdgeId,
  type Face,
  type PieceId,
  type SlotId,
} from '../geometry'
import { applyAlg, withoutRotations } from '../moves'
import {
  algToString,
  countMoves,
  describeHold,
  simplifyAlg,
  type FaceMove,
  type Move,
  type RotationMove,
} from '../notation'
import { findPiece, homeSlot, pieceAt, type PieceLocation } from '../pieces'
import { STAGE_IDS, type StageId } from '../stages'
import { isSolved, type CubeState } from '../state'
import { detectTwistPhase, firstIncompleteStage, topTurn, yellowUpRotation } from './analyze'
import {
  BeginnerSolverError,
  MIDDLE_EDGES,
  TWIST,
  WHITE_CORNERS,
  WHITE_EDGES,
  YELLOW_CORNERS,
  centerColor,
  faceTurn,
  faceWord,
  faceletsOfPieces,
  pieceName,
  repeatAlg,
} from './shared'
import type {
  BeginnerHint,
  BeginnerSolution,
  BeginnerSolverOptions,
  FlatSolution,
  SolveStep,
  StageSolution,
} from './types'

// ---------------------------------------------------------------------------------------------
// Step construction
// ---------------------------------------------------------------------------------------------

interface Draft {
  caseId: string
  caseName: string
  explanation: string
  /** Top-layer turns that line things up first. */
  setup?: readonly Move[]
  /** The intuitive moves, or one round of the named algorithm. */
  main: readonly Move[]
  /** Named algorithm and how many rounds of it `main` should be repeated. */
  algorithm?: { id: string; repetitions: number }
  pieces: readonly PieceId[]
  targets?: readonly SlotId[]
  hold?: boolean
}

function buildStep(state: CubeState, stage: StageId, draft: Draft): SolveStep {
  const setup = [...(draft.setup ?? [])]
  let main = [...draft.main]
  let algorithm: SolveStep['algorithm']
  if (draft.algorithm) {
    const entry = getAlgorithm(draft.algorithm.id)
    if (!entry) throw new Error(`Unknown algorithm id: ${draft.algorithm.id}`)
    algorithm = {
      id: entry.id,
      name: entry.name,
      repetitions: draft.algorithm.repetitions,
      moves: [...entry.moves],
    }
    main = repeatAlg(entry.moves, draft.algorithm.repetitions)
  }
  const moves = [...setup, ...main]
  const step: SolveStep = {
    stage,
    kind: draft.hold ? 'hold' : 'turn',
    caseId: `${stage}/${draft.caseId}`,
    caseName: draft.caseName,
    explanation: draft.explanation,
    moves,
    setup,
    main,
    highlight: {
      pieces: [...draft.pieces],
      targets: [...(draft.targets ?? [])],
      facelets: faceletsOfPieces(state, draft.pieces),
    },
    before: state,
    after: applyAlg(state, moves),
  }
  if (algorithm) step.algorithm = algorithm
  return step
}

const U_TURNS: readonly (readonly Move[])[] = [[], ['U'], ["U'"], ['U2']]
const Y_SPINS: readonly (readonly RotationMove[])[] = [['y'], ["y'"], ['y2']]

/** The first turn of the top (none, U, U', U2) after which `ok` holds; null if none does. */
function topSetup(state: CubeState, ok: (s: CubeState) => boolean, allowNone = true): { setup: readonly Move[]; state: CubeState } | null {
  for (const setup of U_TURNS) {
    if (!allowNone && setup.length === 0) continue
    const s = applyAlg(state, setup)
    if (ok(s)) return { setup, state: s }
  }
  return null
}

/** The first spin of the whole cube (y, y', y2) after which `ok` holds; null if none does. */
function spinTo(state: CubeState, ok: (s: CubeState) => boolean): readonly RotationMove[] | null {
  for (const spin of Y_SPINS) if (ok(applyAlg(state, spin))) return spin
  return null
}

function spinSentence(spin: readonly Move[]): string {
  if (spin.length !== 1) return ''
  const words = describeHold(spin[0])
  return ` ${words.text}. ${words.detail}`
}

function topTurnWords(setup: readonly Move[]): string {
  return `turn the top (${algToString(setup)})`
}

function sideColors(piece: PieceId, not: Color): Color[] {
  return pieceColors(piece).filter((c) => c !== not)
}

function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`
}

function impossible(state: CubeState, where: string): never {
  throw new BeginnerSolverError(`The beginner solver cannot continue (${where}): this is not a solvable cube`, state)
}

// ---------------------------------------------------------------------------------------------
// Stage 1 — the daisy
// ---------------------------------------------------------------------------------------------

function isWhiteEdge(piece: PieceId): piece is EdgeId {
  return (WHITE_EDGES as readonly string[]).includes(piece)
}

function topSlotOver(face: Face): SlotId {
  return slotWithFaces(['U', face])!
}

/** True if the top edge slot above `face` holds a finished petal. */
function petalOver(state: CubeState, face: Face): boolean {
  const loc = pieceAt(state, topSlotOver(face))
  return isWhiteEdge(loc.piece) && loc.facing.white === 'U'
}

type DaisyCase = 'middle' | 'bottom-down' | 'top-side' | 'bottom-side'
const DAISY_PRIORITY: readonly DaisyCase[] = ['middle', 'bottom-down', 'top-side', 'bottom-side']

function daisyCase(loc: PieceLocation): DaisyCase | null {
  const white = loc.facing.white!
  if (loc.solved || white === 'U') return null
  if (!loc.slot.includes('U') && !loc.slot.includes('D')) return 'middle'
  if (white === 'D') return 'bottom-down'
  return loc.slot.includes('U') ? 'top-side' : 'bottom-side'
}

/** The quarter turn of `face` that leaves the edge needing the least follow-up work. */
function turnIntoMiddle(state: CubeState, piece: EdgeId, face: Face): Move {
  const options = [...faceTurn(face, 1), ...faceTurn(face, 3)]
  for (const move of options) {
    const loc = findPiece(applyAlg(state, [move]), piece)
    const other = slotFaces(loc.slot).find((f) => f !== loc.facing.white)!
    if (!petalOver(applyAlg(state, [move]), other)) return move
  }
  return options[0]
}

function daisyStep(state: CubeState): Draft {
  const locs = WHITE_EDGES.map((e) => findPiece(state, e))
  let chosen: PieceLocation | undefined
  let kind: DaisyCase | undefined
  for (const want of DAISY_PRIORITY) {
    chosen = locs.find((l) => daisyCase(l) === want)
    if (chosen) {
      kind = want
      break
    }
  }
  if (!chosen || !kind) impossible(state, 'daisy')
  const piece = chosen.piece as EdgeId
  const name = pieceName(piece)
  const white = chosen.facing.white!

  if (kind === 'middle') {
    // White faces one side; the edge's other sticker is on the face we turn to swing it up.
    const turnFace = slotFaces(chosen.slot).find((f) => f !== white)!
    const ready = topSetup(state, (s) => !petalOver(s, turnFace))
    if (!ready) impossible(state, 'daisy: no free petal spot')
    const move = [...faceTurn(turnFace, 1), ...faceTurn(turnFace, 3)].find(
      (m) => findPiece(applyAlg(ready.state, [m]), piece).facing.white === 'U',
    )
    if (!move) impossible(state, 'daisy: middle edge')
    const room = ready.setup.length
      ? `A petal is already sitting above the ${faceWord(turnFace)} face and this turn would knock it off, so first ${topTurnWords(ready.setup)} to bring an empty spot there. Then turn`
      : 'Turn'
    return {
      caseId: 'middle',
      caseName: 'White edge in the middle layer',
      explanation: `The ${name} is in the middle layer, with its white sticker on the ${faceWord(white)} face. ${room} the ${faceWord(turnFace)} face (${move}) and the edge swings up to the top with white facing up — a new petal next to the yellow centre.`,
      setup: ready.setup,
      main: [move],
      pieces: [piece],
      targets: [topSlotOver(turnFace)],
    }
  }

  // In the remaining cases the edge sits in the top or bottom layer on one side face.
  const sideFace = slotFaces(chosen.slot).find((f) => f !== 'U' && f !== 'D')!

  if (kind === 'bottom-down') {
    const ready = topSetup(state, (s) => !petalOver(s, sideFace))
    if (!ready) impossible(state, 'daisy: no free petal spot')
    const room = ready.setup.length
      ? `There is already a petal straight above it, so first ${topTurnWords(ready.setup)} to bring an empty spot there. Then turn`
      : 'Turn'
    return {
      caseId: 'bottom',
      caseName: 'White edge on the bottom',
      explanation: `The ${name} is on the bottom with its white sticker facing down. ${room} the ${faceWord(sideFace)} face halfway round (${faceTurn(sideFace, 2)[0]}) and the edge flips up to the top with white facing up.`,
      setup: ready.setup,
      main: faceTurn(sideFace, 2),
      pieces: [piece],
      targets: [topSlotOver(sideFace)],
    }
  }

  if (kind === 'top-side') {
    const move = turnIntoMiddle(state, piece, sideFace)
    return {
      caseId: 'top-flipped',
      caseName: 'White edge on top, but flipped',
      explanation: `The ${name} is in the top layer, but its white sticker faces sideways (on the ${faceWord(sideFace)} face) instead of up. Turn the ${faceWord(sideFace)} face (${move}) to move the edge into the middle layer. From there it can swing up the right way round.`,
      main: [move],
      pieces: [piece],
    }
  }

  // bottom-side
  const ready = topSetup(state, (s) => !petalOver(s, sideFace))
  if (!ready) impossible(state, 'daisy: no free petal spot')
  const move = turnIntoMiddle(ready.state, piece, sideFace)
  const room = ready.setup.length
    ? `Turning that face would knock off the petal above it, so first ${topTurnWords(ready.setup)} to bring an empty spot there. Then turn`
    : 'Turn'
  return {
    caseId: 'bottom-flipped',
    caseName: 'Bottom edge, white on the side',
    explanation: `The ${name} is in the bottom layer with its white sticker on the ${faceWord(sideFace)} face. ${room} the ${faceWord(sideFace)} face (${move}) to lift the edge into the middle layer. From there it can swing up to the top.`,
    setup: ready.setup,
    main: [move],
    pieces: [piece],
  }
}

// ---------------------------------------------------------------------------------------------
// Stage 2 — the white cross (drop the petals)
// ---------------------------------------------------------------------------------------------

/** "white-red petal" */
function petalName(piece: PieceId): string {
  return `${pieceColors(piece).join('-')} petal`
}

function whiteEdgeFor(state: CubeState, face: Face): EdgeId {
  return findPieceId(['white', centerColor(state, face)]) as EdgeId
}

function findPieceId(colors: readonly Color[]): PieceId {
  // All colours here come from centres, so the piece always exists.
  const want = [...colors].sort().join()
  for (const group of [WHITE_EDGES, WHITE_CORNERS, MIDDLE_EDGES]) {
    for (const p of group) if ([...pieceColors(p)].sort().join() === want) return p
  }
  throw new Error(`No piece with colours ${colors.join(' + ')}`)
}

/** The front centre's white edge is a petal sitting straight above that centre. */
function frontPetalAligned(state: CubeState): boolean {
  const loc = pieceAt(state, 'UF')
  return loc.piece === whiteEdgeFor(state, 'F') && loc.facing.white === 'U'
}

function frontPetalExists(state: CubeState): boolean {
  return findPiece(state, whiteEdgeFor(state, 'F')).facing.white === 'U'
}

function crossStep(state: CubeState): Draft {
  const drop = (setup: readonly Move[]): Draft => {
    const piece = whiteEdgeFor(state, 'F')
    const color = centerColor(state, 'F')
    const lineUp = setup.length
      ? `Find the ${petalName(piece)}. ${capital(topTurnWords(setup))} until it sits right above the ${color} centre, so ${color} touches ${color}.`
      : `The ${petalName(piece)} is right above the ${color} centre: ${color} touches ${color}.`
    return {
      caseId: 'drop',
      caseName: setup.length ? 'Match a petal, then drop it' : 'Drop the matching petal',
      explanation: `${lineUp} Now turn the front face halfway round (F2). The petal drops to the bottom and lands on the white face, exactly where it belongs.`,
      setup,
      main: [],
      algorithm: { id: 'white-cross-drop', repetitions: 1 },
      pieces: [piece, centerPieceAt(state, 'F')],
      targets: ['DF'],
    }
  }
  const turnTo = (spin: readonly RotationMove[], aligned: boolean): Draft => {
    const after = applyAlg(state, spin)
    const piece = whiteEdgeFor(after, 'F')
    const color = centerColor(after, 'F')
    return {
      caseId: 'face-next-petal',
      caseName: `Turn the cube to the ${color} side`,
      explanation: aligned
        ? `The ${petalName(piece)} is already sitting above the ${color} centre. Turn the whole cube so the ${color} centre faces you — keep yellow on top.${spinSentence(spin)}`
        : `Next petal: the ${petalName(piece)}. Turn the whole cube so the ${color} centre faces you — keep yellow on top.${spinSentence(spin)}`,
      main: spin,
      pieces: [piece, centerPieceAt(after, 'F')],
      hold: true,
    }
  }

  if (frontPetalAligned(state)) return drop([])
  const alignedSpin = spinTo(state, frontPetalAligned)
  if (alignedSpin) return turnTo(alignedSpin, true)
  if (frontPetalExists(state)) {
    const ready = topSetup(state, frontPetalAligned)
    if (!ready) impossible(state, 'white cross: petal cannot be lined up')
    return drop(ready.setup)
  }
  const spin = spinTo(state, frontPetalExists)
  if (!spin) impossible(state, 'white cross: no petal left')
  return turnTo(spin, false)
}

function centerPieceAt(state: CubeState, face: Face): PieceId {
  return pieceAt(state, face).piece
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ---------------------------------------------------------------------------------------------
// Stage 3 — white corners
// ---------------------------------------------------------------------------------------------

function isWhiteCorner(piece: PieceId): piece is CornerId {
  return (WHITE_CORNERS as readonly string[]).includes(piece)
}

const CORNER_CASE: Partial<Record<Face, { id: string; words: string }>> = {
  R: { id: 'white-corner-right', words: 'faces right' },
  F: { id: 'white-corner-front', words: 'faces you' },
  U: { id: 'white-corner-top', words: 'faces up' },
}

/** How many right triggers (1–5) drop the corner above/in the front-right slot home; 0 if none does. */
function triggersToSolve(state: CubeState, piece: CornerId): number {
  const trigger = getAlgorithm('right-trigger')!.moves
  let s = state
  for (let n = 1; n <= 5; n++) {
    s = applyAlg(s, trigger)
    if (findPiece(s, piece).solved) return n
  }
  return 0
}

function whiteCornerStep(state: CubeState, options: BeginnerSolverOptions): Draft {
  const unsolved = WHITE_CORNERS.map((c) => findPiece(state, c)).filter((l) => !l.solved)
  const inTop = unsolved.filter((l) => l.slot.includes('U'))
  const homeIsFrontRight = (s: CubeState, piece: PieceId) => homeSlot(s, piece) === 'DFR'

  if (inTop.length) {
    const mine = inTop.find((l) => homeIsFrontRight(state, l.piece))
    if (!mine) {
      const spin = spinTo(state, (s) => inTop.some((l) => homeIsFrontRight(s, l.piece)))
      if (!spin) impossible(state, 'white corners: no home for a top corner')
      const after = applyAlg(state, spin)
      const piece = inTop.find((l) => homeIsFrontRight(after, l.piece))!.piece
      const [a, b] = sideColors(piece, 'white')
      return {
        caseId: 'face-home',
        caseName: 'Turn the cube to the corner’s home',
        explanation: `The ${pieceName(piece)} is in the top layer. Its home is the bottom corner between the ${a} and ${b} centres. Turn the whole cube so that spot is at the front-right.${spinSentence(spin)}`,
        main: spin,
        pieces: [piece],
        targets: [homeSlot(state, piece)],
        hold: true,
      }
    }
    const piece = mine.piece as CornerId
    const ready = topSetup(state, (s) => findPiece(s, piece).slot === 'URF')
    if (!ready) impossible(state, 'white corners: cannot park the corner')
    const park = ready.setup.length
      ? `${capital(topTurnWords(ready.setup))} to park the ${pieceName(piece)} at the front-right of the top, right above its home.`
      : `The ${pieceName(piece)} is at the front-right of the top, right above its home.`
    if (options.whiteCorners === 'trigger') {
      const n = triggersToSolve(ready.state, piece)
      if (!n) impossible(state, 'white corners: trigger insert')
      return {
        caseId: 'insert-trigger',
        caseName: 'White corner above its home',
        explanation: `${park} Do the right trigger (R U R' U') ${times(n)} — stop when the corner has dropped into its home with white facing down.`,
        setup: ready.setup,
        main: [],
        algorithm: { id: 'white-corner-insert', repetitions: n },
        pieces: [piece],
        targets: ['DFR'],
      }
    }
    const white = findPiece(ready.state, piece).facing.white!
    const which = CORNER_CASE[white]
    if (!which) impossible(state, 'white corners: corner case')
    const entry = getAlgorithm(which.id)!
    const how =
      white === 'U'
        ? `Its white sticker ${which.words}, which takes two trips: ${entry.alg} tips it over and then drops it in.`
        : `Its white sticker ${which.words}, so ${entry.alg} drops it straight into its home with white facing down.`
    return {
      caseId: `insert-${white === 'R' ? 'right' : white === 'F' ? 'front' : 'top'}`,
      caseName: `White corner above its home, white ${white === 'R' ? 'facing right' : white === 'F' ? 'facing front' : 'facing up'}`,
      explanation: `${park} ${how}`,
      setup: ready.setup,
      main: [],
      algorithm: { id: which.id, repetitions: 1 },
      pieces: [piece],
      targets: ['DFR'],
    }
  }

  // Every unsolved white corner is stuck in the bottom layer: wrong slot, or home but twisted.
  const stuckAtFrontRight = (s: CubeState) => {
    const loc = pieceAt(s, 'DFR')
    return isWhiteCorner(loc.piece) && !loc.solved
  }
  if (!stuckAtFrontRight(state)) {
    const spin = spinTo(state, stuckAtFrontRight)
    if (!spin) impossible(state, 'white corners: no stuck corner')
    const piece = pieceAt(applyAlg(state, spin), 'DFR').piece
    return {
      caseId: 'face-stuck',
      caseName: 'Turn the cube to the stuck corner',
      explanation: `The ${pieceName(piece)} is in the bottom layer, but not the way it should be. Turn the whole cube so it is at the front-right.${spinSentence(spin)}`,
      main: spin,
      pieces: [piece],
      hold: true,
    }
  }
  const loc = pieceAt(state, 'DFR')
  const piece = loc.piece as CornerId
  const twistedAtHome = homeIsFrontRight(state, piece)
  if (twistedAtHome && options.whiteCorners === 'trigger') {
    const n = triggersToSolve(state, piece)
    if (!n) impossible(state, 'white corners: twisted corner')
    return {
      caseId: 'twisted-trigger',
      caseName: 'White corner at home, but twisted',
      explanation: `The ${pieceName(piece)} is in its home at the front-right, but twisted: white is not facing down. Do the right trigger (R U R' U') ${times(n)} — stop when white faces down.`,
      main: [],
      algorithm: { id: 'white-corner-insert', repetitions: n },
      pieces: [piece],
      targets: ['DFR'],
    }
  }
  return {
    caseId: twistedAtHome ? 'pop-twisted' : 'pop-wrong-slot',
    caseName: twistedAtHome ? 'White corner at home, but twisted' : 'White corner stuck in the wrong place',
    explanation: twistedAtHome
      ? `The ${pieceName(piece)} is in its home at the front-right, but twisted: white is not facing down. One right trigger (R U R' U') lifts it out to the top, ready to go back in the right way.`
      : `The ${pieceName(piece)} is in the bottom layer, but in the wrong corner. One right trigger (R U R' U') lifts it out to the top so it can go to its real home.`,
    main: [],
    algorithm: { id: 'right-trigger', repetitions: 1 },
    pieces: [piece],
  }
}

// ---------------------------------------------------------------------------------------------
// Stage 4 — the middle layer
// ---------------------------------------------------------------------------------------------

function isMiddleEdge(piece: PieceId): piece is EdgeId {
  return (MIDDLE_EDGES as readonly string[]).includes(piece)
}

/** Colour of the sticker of a top-layer edge that faces sideways. */
function sideStickerColor(loc: PieceLocation): Color {
  return loc.stickers.find((s) => s.face !== 'U')!.color
}

function middleStep(state: CubeState): Draft {
  const unsolved = MIDDLE_EDGES.map((e) => findPiece(state, e)).filter((l) => !l.solved)
  const inTop = unsolved.filter((l) => l.slot.includes('U'))

  if (inTop.length) {
    /** A middle edge sits at the top-front and already matches the front centre (an upside-down T). */
    const matchedAtFront = (s: CubeState) => {
      const loc = pieceAt(s, 'UF')
      return isMiddleEdge(loc.piece) && sideStickerColor(loc) === centerColor(s, 'F')
    }
    const belongsToFront = (s: CubeState) => inTop.some((l) => sideStickerColor(l) === centerColor(s, 'F'))

    let setup: readonly Move[] | null = null
    if (matchedAtFront(state)) setup = []
    else {
      const matchedSpin = spinTo(state, matchedAtFront)
      const spin = matchedSpin ?? (belongsToFront(state) ? null : spinTo(state, belongsToFront))
      if (spin) {
        const color = centerColor(applyAlg(state, spin), 'F')
        const piece = matchedSpin
          ? pieceAt(applyAlg(state, spin), 'UF').piece
          : inTop.find((l) => sideStickerColor(l) === color)!.piece
        return {
          caseId: 'face-centre',
          caseName: `Turn the cube to the ${color} side`,
          explanation: matchedSpin
            ? `The ${pieceName(piece)} is in the top layer and has no yellow, so it belongs in the middle layer. Its ${color} sticker is already sitting above the ${color} centre. Turn the whole cube so the ${color} centre faces you.${spinSentence(spin)}`
            : `The ${pieceName(piece)} is in the top layer and has no yellow, so it belongs in the middle layer. Its side sticker is ${color}. Turn the whole cube so the ${color} centre faces you.${spinSentence(spin)}`,
          main: spin,
          pieces: [piece],
          targets: [homeSlot(state, piece)],
          hold: true,
        }
      }
      if (!belongsToFront(state)) impossible(state, 'middle layer: no centre for a top edge')
      const ready = topSetup(state, matchedAtFront)
      if (!ready) impossible(state, 'middle layer: cannot bring the edge to the front')
      setup = ready.setup
    }
    const lined = applyAlg(state, setup)
    const frontColor = centerColor(state, 'F')
    const piece = pieceAt(lined, 'UF').piece
    const topColor = pieceAt(lined, 'UF').stickers.find((st) => st.face === 'U')!.color
    const goesRight = topColor === centerColor(state, 'R')
    if (!goesRight && topColor !== centerColor(state, 'L')) impossible(state, 'middle layer: edge colours')
    const entry = getAlgorithm(goesRight ? 'middle-right' : 'middle-left')!
    const side = goesRight ? 'right' : 'left'
    const match = setup.length
      ? `${capital(topTurnWords(setup))} until the ${pieceName(piece)} is at the front and its ${frontColor} sticker joins the ${frontColor} centre in an upside-down T.`
      : `The ${pieceName(piece)} is at the front of the top layer, and its ${frontColor} sticker joins the ${frontColor} centre in an upside-down T.`
    return {
      caseId: goesRight ? 'insert-right' : 'insert-left',
      caseName: `Middle edge goes to the ${side}`,
      explanation: `${match} Its top sticker is ${topColor}, the colour of the ${side} centre, so the edge belongs in the slot on the ${side}. ${entry.name}: ${entry.alg}.`,
      setup,
      main: [],
      algorithm: { id: entry.id, repetitions: 1 },
      pieces: [piece],
      targets: [goesRight ? 'FR' : 'FL'],
    }
  }

  // No middle edge is left in the top layer: the unsolved ones are stuck in the middle layer.
  const stuckAt = (s: CubeState, slot: SlotId) => {
    const loc = pieceAt(s, slot)
    return isMiddleEdge(loc.piece) && !loc.solved
  }
  for (const [slot, id, side] of [
    ['FR', 'middle-right', 'right'],
    ['FL', 'middle-left', 'left'],
  ] as const) {
    if (!stuckAt(state, slot)) continue
    const piece = pieceAt(state, slot).piece
    const entry = getAlgorithm(id)!
    const flipped = homeSlot(state, piece) === slot
    return {
      caseId: flipped ? 'kick-out-flipped' : 'kick-out-wrong-slot',
      caseName: flipped ? 'Middle edge in its place, but flipped' : 'Edge stuck in the wrong middle slot',
      explanation: `The ${pieceName(piece)} is in the middle layer at the front-${side}, but ${
        flipped ? 'flipped the wrong way round' : 'that is not its home'
      }. To get it out, put a yellow edge in its place: ${entry.name} (${entry.alg}). That kicks it up to the top layer, ready to go in properly.`,
      main: [],
      algorithm: { id, repetitions: 1 },
      pieces: [piece],
    }
  }
  const spin = spinTo(state, (s) => stuckAt(s, 'FR'))
  if (!spin) impossible(state, 'middle layer: no stuck edge')
  const piece = pieceAt(applyAlg(state, spin), 'FR').piece
  return {
    caseId: 'face-stuck',
    caseName: 'Turn the cube to the stuck edge',
    explanation: `No middle-layer edges are left in the top layer, but the ${pieceName(piece)} is sitting in the middle layer the wrong way. Turn the whole cube so it is at the front-right.${spinSentence(spin)}`,
    main: spin,
    pieces: [piece],
    hold: true,
  }
}

// ---------------------------------------------------------------------------------------------
// Stage 5 — the yellow cross
// ---------------------------------------------------------------------------------------------

const TOP_EDGE_SLOTS: readonly SlotId[] = ['UF', 'UR', 'UB', 'UL']
const TOP_CORNER_SLOTS: readonly SlotId[] = ['URF', 'UFL', 'ULB', 'UBR']

function yellowUpSlots(state: CubeState): SlotId[] {
  const yellow = state[4]
  return TOP_EDGE_SLOTS.filter((slot) => state[SLOT_FACELETS[slot][0]] === yellow)
}

function topEdgePieces(state: CubeState): PieceId[] {
  return TOP_EDGE_SLOTS.map((s) => pieceAt(state, s).piece)
}

function sameSlots(a: readonly SlotId[], b: readonly SlotId[]): boolean {
  return a.length === b.length && b.every((s) => a.includes(s))
}

function yellowCrossStep(state: CubeState): Draft {
  const up = yellowUpSlots(state)
  const entry = getAlgorithm('yellow-cross')!
  const base = { main: [], algorithm: { id: 'yellow-cross', repetitions: 1 }, pieces: topEdgePieces(state) }
  if (up.length === 0) {
    return {
      ...base,
      caseId: 'dot',
      caseName: 'Yellow dot',
      explanation: `Only the yellow centre shows on top — no yellow edges yet. Do the yellow cross algorithm (${entry.alg}) once from any side. It turns the dot into a little L.`,
    }
  }
  if (up.length !== 2) impossible(state, 'yellow cross: odd number of flipped edges')
  const isLine = OPPOSITE_FACE[up[0][1] as Face] === up[1][1]
  if (isLine) {
    const ready = topSetup(state, (s) => sameSlots(yellowUpSlots(s), ['UL', 'UR']))
    if (!ready) impossible(state, 'yellow cross: line')
    return {
      ...base,
      caseId: 'line',
      caseName: 'Yellow line',
      explanation: `Two yellow edges and the centre make a line across the top. ${
        ready.setup.length
          ? `${capital(topTurnWords(ready.setup))} so the line goes from left to right, not towards you.`
          : 'It already goes from left to right.'
      } Then do the yellow cross algorithm (${entry.alg}) once and the cross appears.`,
      setup: ready.setup,
    }
  }
  const ready = topSetup(state, (s) => sameSlots(yellowUpSlots(s), ['UB', 'UL']))
  if (!ready) impossible(state, 'yellow cross: L')
  return {
    ...base,
    caseId: 'L',
    caseName: 'Yellow L',
    explanation: `Two yellow edges make an L with the centre. ${
      ready.setup.length
        ? `${capital(topTurnWords(ready.setup))} so the L sits in the back-left corner, with its arms pointing to the back and to the left.`
        : 'It is already in the back-left corner, with its arms pointing to the back and to the left.'
    } Then do the yellow cross algorithm (${entry.alg}) once. The L turns into a line.`,
    setup: ready.setup,
  }
}

// ---------------------------------------------------------------------------------------------
// Stage 6 — yellow edges
// ---------------------------------------------------------------------------------------------

function matchingTopEdges(state: CubeState): SlotId[] {
  return TOP_EDGE_SLOTS.filter((slot) => pieceAt(state, slot).solved)
}

function yellowEdgesStep(state: CubeState): Draft {
  const entry = getAlgorithm('yellow-edge-swap')!
  // Find the turn of the top that makes two edges match (four is impossible here: the stage would be complete).
  const two = topSetup(state, (s) => matchingTopEdges(s).length === 2)
  if (!two) impossible(state, 'yellow edges: no turn of the top matches two edges')
  const matched = matchingTopEdges(two.state)
  const opposite = OPPOSITE_FACE[matched[0][1] as Face] === matched[1][1]
  const edges = topEdgePieces(state)

  if (opposite) {
    return {
      caseId: 'swap-opposite',
      caseName: 'Matching edges are opposite each other',
      explanation: `Turn the top as much as you like — the only two edges that ever match their centres together sit opposite each other. That takes two swaps. Do the edge swap (${entry.alg}) once from here; afterwards two edges that are next to each other will match.`,
      main: [],
      algorithm: { id: entry.id, repetitions: 1 },
      pieces: edges,
    }
  }
  if (two.setup.length) {
    return {
      caseId: 'match-two',
      caseName: 'Turn the top until two edges match',
      explanation: `Look at the side colours of the yellow cross. ${capital(topTurnWords(two.setup))} and two edges that are next to each other match their centres. The other two need to swap.`,
      main: two.setup,
      pieces: matched.map((slot) => pieceAt(two.state, slot).piece),
    }
  }
  if (!sameSlots(matched, ['UB', 'UR'])) {
    const spin = spinTo(state, (s) => sameSlots(matchingTopEdges(s), ['UB', 'UR']))
    if (!spin) impossible(state, 'yellow edges: hold')
    return {
      caseId: 'face-swap',
      caseName: 'Put the matching edges at the back and right',
      explanation: `Two edges next to each other match their centres. Turn the whole cube so those two are at the back and on the right. The two that need to swap are then at the front and on the left.${spinSentence(spin)}`,
      main: spin,
      pieces: matched.map((slot) => pieceAt(state, slot).piece),
      hold: true,
    }
  }
  return {
    caseId: 'swap',
    caseName: 'Swap the front and left edges',
    explanation: `The back and right edges match their centres; the front and left edges are in each other's places. Do the edge swap (${entry.alg}) and they trade places.`,
    main: [],
    algorithm: { id: entry.id, repetitions: 1 },
    pieces: [pieceAt(state, 'UF').piece, pieceAt(state, 'UL').piece],
    targets: ['UF', 'UL'],
  }
}

// ---------------------------------------------------------------------------------------------
// Stage 7 — put the yellow corners in their places
// ---------------------------------------------------------------------------------------------

function isYellowCorner(piece: PieceId): piece is CornerId {
  return (YELLOW_CORNERS as readonly string[]).includes(piece)
}

function cornersAtHome(state: CubeState): SlotId[] {
  return TOP_CORNER_SLOTS.filter((slot) => homeSlot(state, pieceAt(state, slot).piece) === slot)
}

function topCornerPieces(state: CubeState): PieceId[] {
  return TOP_CORNER_SLOTS.map((s) => pieceAt(state, s).piece)
}

function cornerPositionStep(state: CubeState): Draft {
  const top = topTurn(state)
  if (top.turn !== 0) {
    return {
      caseId: 'line-up',
      caseName: 'Line up the top',
      explanation: `The yellow edges are in the right order. ${capital(topTurnWords(top.turnMoves))} so each one matches its centre — then you can see which corners are in the right place.`,
      main: top.turnMoves,
      pieces: topEdgePieces(state),
    }
  }
  const entry = getAlgorithm('corner-cycle')!
  const home = cornersAtHome(state)
  const others = (s: CubeState) => TOP_CORNER_SLOTS.filter((slot) => slot !== 'URF').map((slot) => pieceAt(s, slot).piece)
  if (home.length === 0) {
    return {
      caseId: 'cycle-none-home',
      caseName: 'No corner is in the right place',
      explanation: `Check each top corner: do its three colours match the three centres around it? (It may be twisted — that is fine.) None of them do. Do the corner cycle (${entry.alg}) once from any side; after that, one corner will be in the right place.`,
      main: [],
      algorithm: { id: entry.id, repetitions: 1 },
      pieces: topCornerPieces(state),
    }
  }
  if (home.length !== 1) impossible(state, 'yellow corners: two or three corners home')
  if (home[0] !== 'URF') {
    const spin = spinTo(state, (s) => cornersAtHome(s).includes('URF'))
    if (!spin) impossible(state, 'yellow corners: hold')
    const piece = pieceAt(state, home[0]).piece
    return {
      caseId: 'face-home-corner',
      caseName: 'Hold the good corner at the front-right',
      explanation: `The ${pieceName(piece)} is the only top corner in the right place: its colours match the three centres around it (never mind if it is twisted). Turn the whole cube so it is at the front-right of the top.${spinSentence(spin)}`,
      main: spin,
      pieces: [piece],
      hold: true,
    }
  }
  const piece = pieceAt(state, 'URF').piece
  // The cycle only goes one way round, so sometimes the corners need two rounds to get home.
  const once = applyAlg(state, entry.moves)
  const rounds = cornersAtHome(once).length === 4 ? 1 : 2
  if (rounds === 2 && cornersAtHome(applyAlg(once, entry.moves)).length !== 4) impossible(state, 'yellow corners: cycle')
  return {
    caseId: rounds === 1 ? 'cycle' : 'cycle-twice',
    caseName: rounds === 1 ? 'Cycle the other three corners' : 'Cycle the other three corners, twice',
    explanation:
      rounds === 1
        ? `The ${pieceName(piece)} at the front-right is in the right place and stays there. Do the corner cycle (${entry.alg}): the other three corners move round one place, and that puts all of them home.`
        : `The ${pieceName(piece)} at the front-right is in the right place and stays there. Do the corner cycle (${entry.alg}): the other three corners move round one place. This time they need to go round two places, so when they are still not home after the first round, do it once more.`,
    main: [],
    algorithm: { id: entry.id, repetitions: rounds },
    pieces: others(state),
    targets: ['UFL', 'ULB', 'UBR'],
  }
}

// ---------------------------------------------------------------------------------------------
// Stage 8 — twist the yellow corners
// ---------------------------------------------------------------------------------------------

/** How many corner twists (from `from` up to 5) leave a yellow corner at the front-right with yellow up; -1 if none. */
function twistsToOrient(state: CubeState, from: number): number {
  let s = applyAlg(state, repeatAlg(TWIST, from))
  for (let n = from; n <= 5; n++) {
    const loc = pieceAt(s, 'URF')
    if (isYellowCorner(loc.piece) && loc.facing.yellow === 'U') return n
    s = applyAlg(s, TWIST)
  }
  return -1
}

function twistedAtFrontRight(state: CubeState): boolean {
  const loc = pieceAt(state, 'URF')
  return isYellowCorner(loc.piece) && loc.facing.yellow !== 'U'
}

/**
 * The last stage. `twistsDone` is how far (mod 6) the lower layers are into the corner twist:
 * 0 means they are solved right now.
 */
function cornerTwistStep(state: CubeState, twistsDone: number): Draft {
  const entry = getAlgorithm('corner-twist')!
  const calm =
    'The bottom layers will look scrambled in between. That is supposed to happen: they come back by themselves when the last corner is done. From now on never turn the whole cube — only the top.'
  const now = twistsToOrient(state, 0)
  if (now < 0) impossible(state, 'corner twist: front-right corner')
  if (now > 0) {
    const piece = pieceAt(applyAlg(state, repeatAlg(TWIST, now)), 'URF').piece
    const midway = twistsDone % 2 === 1
    return {
      caseId: midway ? 'twist-continue' : 'twist',
      caseName: midway ? 'Keep twisting this corner' : 'Twist the front-right corner',
      explanation: midway
        ? `You are in the middle of twisting the ${pieceName(piece)}. Keep going: do the corner twist (${entry.alg}) ${times(now)} more, until that corner is back at the front-right of the top with yellow facing up.`
        : `The ${pieceName(piece)} at the front-right of the top is twisted: its yellow sticker is not on top. Do the corner twist (${entry.alg}) ${times(now)} — stop when yellow faces up. ${calm}`,
      main: [],
      algorithm: { id: entry.id, repetitions: now },
      pieces: [piece],
      targets: ['URF'],
    }
  }

  const top = topTurn(state)
  const anyTwisted = TOP_CORNER_SLOTS.some((slot) => {
    const loc = pieceAt(state, slot)
    return isYellowCorner(loc.piece) && loc.facing.yellow !== 'U'
  })
  if (!anyTwisted) {
    if (twistsDone !== 0 || top.turn === 0) impossible(state, 'corner twist: nothing left to twist')
    return {
      caseId: 'final-turn',
      caseName: 'Line up the top to finish',
      explanation: `Every piece is done — the top layer just needs to line up. ${capital(topTurnWords(top.turnMoves))} and the cube is solved!`,
      main: top.turnMoves,
      pieces: [...topEdgePieces(state), ...topCornerPieces(state)],
    }
  }

  if (twistsDone === 0 && top.turn === 0) {
    // Nothing is scrambled, so it is safe (and saves turns) to bring the first corner round with the whole cube.
    const spin = spinTo(state, twistedAtFrontRight)
    if (!spin) impossible(state, 'corner twist: hold')
    const piece = pieceAt(applyAlg(state, spin), 'URF').piece
    return {
      caseId: 'face-twisted',
      caseName: 'Hold a twisted corner at the front-right',
      explanation: `Every piece is in its place now, but some yellow corners are twisted. The ${pieceName(piece)} is one of them. Turn the whole cube so it is at the front-right of the top.${spinSentence(spin)}`,
      main: spin,
      pieces: [piece],
      hold: true,
    }
  }

  const ready = topSetup(state, twistedAtFrontRight, false)
  if (!ready) impossible(state, 'corner twist: next corner')
  const n = twistsToOrient(ready.state, 1)
  if (n < 0) impossible(state, 'corner twist: next corner twists')
  const piece = pieceAt(ready.state, 'URF').piece
  return {
    caseId: 'next-corner',
    caseName: 'Bring the next twisted corner round',
    explanation: `The front-right corner is done. Don't turn the whole cube! ${capital(topTurnWords(ready.setup))} to bring the ${pieceName(piece)} to the front-right, then do the corner twist (${entry.alg}) ${times(n)} — stop when its yellow sticker faces up.`,
    setup: ready.setup,
    main: [],
    algorithm: { id: entry.id, repetitions: n },
    pieces: [piece],
    targets: ['URF'],
  }
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * The single next step of the beginner method for this cube, or null if it is solved.
 * Pure and loop-free: this is the whole solver.
 */
export function nextBeginnerStep(state: CubeState, options: BeginnerSolverOptions = {}): SolveStep | null {
  if (isSolved(state)) return null
  const twist = detectTwistPhase(state)

  if (twist) {
    if (twist.hold.length) {
      return buildStep(state, 'yellow-corners-orient', {
        caseId: 'face-working-column',
        caseName: 'Hold the cube the way it was',
        explanation:
          'You are in the middle of twisting the yellow corners, so the cube has to stay in the same hold until the end. Turn the whole cube back: yellow centre on top, and the scrambled column at the front-right.',
        main: twist.hold,
        pieces: [],
        hold: true,
      })
    }
    return buildStep(state, 'yellow-corners-orient', cornerTwistStep(state, twist.twistsDone))
  }

  const stage = firstIncompleteStage(state)
  if (!stage) impossible(state, 'no stage left but the cube is not solved')

  if (centerColor(state, 'U') !== 'yellow') {
    const rotation = yellowUpRotation(state)
    return buildStep(state, stage, {
      caseId: 'hold-yellow-up',
      caseName: 'Hold the cube with yellow on top',
      explanation: `Find the yellow centre and turn the whole cube so it is on top. The white centre is then underneath. We keep the cube this way up for the whole solve.${spinSentence(rotation)}`,
      main: rotation,
      pieces: ['D', 'U'],
      hold: true,
    })
  }

  switch (stage) {
    case 'daisy':
      return buildStep(state, stage, daisyStep(state))
    case 'white-cross':
      return buildStep(state, stage, crossStep(state))
    case 'white-corners':
      return buildStep(state, stage, whiteCornerStep(state, options))
    case 'middle-layer':
      return buildStep(state, stage, middleStep(state))
    case 'yellow-cross':
      return buildStep(state, stage, yellowCrossStep(state))
    case 'yellow-edges':
      return buildStep(state, stage, yellowEdgesStep(state))
    case 'yellow-corners-position':
      return buildStep(state, stage, cornerPositionStep(state))
    case 'yellow-corners-orient':
      return buildStep(state, stage, cornerTwistStep(state, 0))
  }
}

/** Far more steps than any real solve needs (the longest seen in testing is under 80). */
const MAX_STEPS = 250

function groupByStage(steps: readonly SolveStep[]): StageSolution[] {
  const out: StageSolution[] = []
  for (const step of steps) {
    let group = out[out.length - 1]
    if (!group || group.stage !== step.stage) {
      group = { stage: step.stage, steps: [], moves: [], faceTurns: 0, before: step.before, after: step.after }
      out.push(group)
    }
    group.steps.push(step)
    group.moves.push(...step.moves)
    group.faceTurns += countMoves(step.moves)
    group.after = step.after
  }
  return out
}

/**
 * Solve a cube the way a beginner is taught to, as a list of explained steps grouped by stage.
 *
 * Works from any valid state in any orientation, and picks up wherever the cube already is:
 * finished stages produce no steps. Throws `BeginnerSolverError` for a cube that cannot be
 * solved (run painted cubes through `validateCube` first).
 */
export function solveBeginner(state: CubeState, options: BeginnerSolverOptions = {}): BeginnerSolution {
  const steps: SolveStep[] = []
  let current = state
  for (;;) {
    const step = nextBeginnerStep(current, options)
    if (!step) break
    if (step.moves.length === 0 || step.after === current) {
      throw new BeginnerSolverError(`The beginner solver produced a step that changes nothing (${step.caseId})`, current)
    }
    steps.push(step)
    current = step.after
    if (steps.length > MAX_STEPS) {
      throw new BeginnerSolverError(`The beginner solver did not finish within ${MAX_STEPS} steps`, state)
    }
  }
  const moves = steps.flatMap((s) => s.moves)
  return { start: state, end: current, steps, stages: groupByStage(steps), moves, faceTurns: countMoves(moves) }
}

/**
 * The hint button: the next thing to do on this cube. Cheap enough to call after every move
 * (it computes one step, not a whole solution).
 */
export function nextHint(state: CubeState, options: BeginnerSolverOptions = {}): BeginnerHint {
  const step = nextBeginnerStep(state, options)
  if (!step) return { solved: true, stage: null, step: null, message: 'You solved it! Nothing left to do.' }
  return { solved: false, stage: step.stage, step, message: step.caseName }
}

/**
 * The face-turns-only version of a solution (or of any move list): the same turns, rewritten so
 * the cube never has to be picked up and turned round. Pass `{ simplify: true }` to also merge
 * neighbouring turns of the same face ("U U'" disappears) — shorter, but no longer step by step.
 */
export function flattenSolution(
  solution: BeginnerSolution | readonly Move[],
  options: { simplify?: boolean } = {},
): FlatSolution {
  const all: readonly Move[] = 'steps' in solution ? solution.moves : solution
  const { moves, rotation } = withoutRotations(all)
  const flat = (options.simplify ? simplifyAlg(moves) : moves) as FaceMove[]
  return { moves: flat, rotation: [...rotation], faceTurns: flat.length }
}

/** The stages of the method that this solution had to work on, in order. */
export function solutionStages(solution: BeginnerSolution): StageId[] {
  return STAGE_IDS.filter((id) => solution.stages.some((s) => s.stage === id))
}
