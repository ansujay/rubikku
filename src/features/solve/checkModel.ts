/**
 * Step 2, "Check": turn `validateCube`'s findings into what the page shows — a status, and for
 * every problem a kid-readable card with the stickers to light up and, where one exists, a fix
 * that can be applied with one tap.
 *
 * Tone rules: most problems are slips of the finger, so say so; never blame; always say what
 * to look at next. Physical problems (a twisted corner, a flipped edge, two swapped pieces) are
 * only reported by the engine once every sticker is plausible, and each gets a calm how-to.
 */
import {
  COLORS,
  describeSlot,
  FACES,
  SLOT_FACELETS,
  validateCube,
  type Color,
  type CubeProblem,
  type Face,
  type CubeState,
  type SlotId,
  type ValidationResult,
} from '../../cube'
import { blankCount, countColors, faceFacelets, isCentre, PER_COLOR, STICKERS, type Cell, type Painted } from './entryModel'

/** One sticker to repaint. */
export interface StickerChange {
  facelet: number
  color: Color
}

export interface Issue {
  /** Stable within one check, for keys and for "which issue is open". */
  id: string
  code: CubeProblem['code']
  /** `slip`: almost certainly a typing mistake. `cube`: the real cube may need fixing by hand. */
  kind: 'slip' | 'cube'
  title: string
  body: string
  /** Numbered how-to for fixing the real cube (physical problems only). */
  steps?: string[]
  /** Stickers to light up on the net and on the 3D cube. */
  facelets: number[]
  /** A change that makes this problem go away, and the label for its button. */
  fix?: { label: string; changes: StickerChange[] }
}

export interface CubeCheck {
  status: 'incomplete' | 'problems' | 'ok'
  /** Stickers still blank. */
  blanks: number
  /** One gentle line about progress: "12 stickers to go". */
  progress: string
  issues: Issue[]
  /** The solvable cube, exactly as painted (present when status is 'ok'). */
  state: CubeState | null
  result: ValidationResult
}

const list = (items: readonly string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const word = (n: number) => NUMBER_WORDS[n] ?? String(n)
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function progressLine(blanks: number): string {
  if (blanks === 0) return 'Every sticker is filled in.'
  if (blanks === STICKERS - 6) return 'Tap a colour, then tap the stickers.'
  if (blanks === 1) return 'Just 1 sticker to go!'
  if (blanks <= 5) return `Only ${blanks} stickers to go!`
  return `${blanks} stickers to go.`
}

/** Apply sticker changes to a copy. */
export function withChanges(painted: Painted, changes: readonly StickerChange[]): Cell[] {
  const next = painted.slice()
  for (const { facelet, color } of changes) next[facelet] = color
  return next
}

const isOk = (painted: Painted) => validateCube(painted).ok

// ───────────────────────── Finding the slip ─────────────────────────

/**
 * For a fully painted cube that does not check out: the smallest changes that would make it a
 * real, solvable cube. First every single sticker repainted; if none works, every pair of
 * stickers swapped. Centres are never touched. Returns at most `limit` candidates (so the
 * caller can tell "exactly one" from "several").
 */
export function findSlips(painted: Painted, limit = 4): StickerChange[][] {
  if (blankCount(painted) > 0) return []
  const found: StickerChange[][] = []
  const counts = countColors(painted)
  const over = COLORS.filter((color) => counts[color] > PER_COLOR)
  const under = COLORS.filter((color) => counts[color] < PER_COLOR)
  const work = painted.slice()

  if (over.length === 1 && under.length === 1 && counts[over[0]] === PER_COLOR + 1) {
    // One sticker too many of one colour, one too few of another: try each of the extras.
    for (let i = 0; i < STICKERS && found.length < limit; i++) {
      if (isCentre(i) || work[i] !== over[0]) continue
      work[i] = under[0]
      if (isOk(work)) found.push([{ facelet: i, color: under[0] }])
      work[i] = over[0]
    }
    return found
  }
  if (over.length > 0 || under.length > 0) return []

  // Counts are right: look for two stickers that were swapped.
  for (let a = 0; a < STICKERS && found.length < limit; a++) {
    if (isCentre(a)) continue
    for (let b = a + 1; b < STICKERS && found.length < limit; b++) {
      const ca = work[a]!
      const cb = work[b]!
      if (isCentre(b) || ca === cb) continue
      work[a] = cb
      work[b] = ca
      if (isOk(work)) {
        found.push([
          { facelet: a, color: cb },
          { facelet: b, color: ca },
        ])
      }
      work[a] = ca
      work[b] = cb
    }
  }
  return found
}

// ───────────────────────── A whole face entered turned, mirrored or on the wrong side ─────────────────────────

/** The ways nine stickers can be rearranged by turning or flipping their face: new cell i takes old cell `from[i]`. */
const FACE_TRANSFORMS = [
  { name: 'quarter', from: [6, 3, 0, 7, 4, 1, 8, 5, 2] }, // quarter turn clockwise
  { name: 'quarter', from: [2, 5, 8, 1, 4, 7, 0, 3, 6] }, // quarter turn the other way
  { name: 'half', from: [8, 7, 6, 5, 4, 3, 2, 1, 0] },
  { name: 'mirror', from: [2, 1, 0, 5, 4, 3, 8, 7, 6] }, // left and right swapped
  { name: 'mirror', from: [6, 7, 8, 3, 4, 5, 0, 1, 2] }, // top and bottom swapped
  { name: 'flip', from: [0, 3, 6, 1, 4, 7, 2, 5, 8] }, // across the diagonal
  { name: 'flip', from: [8, 5, 2, 7, 4, 1, 6, 3, 0] },
] as const

const FACE_NAME: Record<Face, string> = { U: 'top', D: 'bottom', F: 'front', B: 'back', R: 'right', L: 'left' }

/**
 * Is a whole face the one mistake? Tries every single-face turn or flip, and every pair of faces
 * exchanged, against `validateCube`. When exactly one face (or pair) explains everything, returns
 * the one issue to show, with the repainted cube as its one-tap fix. Complete cubes only.
 */
export function findFaceMistake(painted: Painted): Issue | null {
  if (blankCount(painted) > 0) return null
  const found: { faces: Face[]; changes: StickerChange[]; kind: string }[] = []

  for (const face of FACES) {
    const own = faceFacelets(face)
    for (const transform of FACE_TRANSFORMS) {
      const changes = own.flatMap((facelet, i) => (isCentre(facelet) || painted[own[transform.from[i]]] === painted[facelet] ? [] : [{ facelet, color: painted[own[transform.from[i]]]! }]))
      if (changes.length > 0 && isOk(withChanges(painted, changes))) found.push({ faces: [face], changes, kind: transform.name })
    }
  }
  for (let a = 0; a < FACES.length; a++) {
    for (let b = a + 1; b < FACES.length; b++) {
      const fa = faceFacelets(FACES[a])
      const fb = faceFacelets(FACES[b])
      const changes = fa.flatMap((facelet, i) => (isCentre(facelet) || painted[fb[i]] === painted[facelet] ? [] : [{ facelet, color: painted[fb[i]]! }, { facelet: fb[i], color: painted[facelet]! }]))
      if (changes.length > 0 && isOk(withChanges(painted, changes))) found.push({ faces: [FACES[a], FACES[b]], changes, kind: 'swap' })
    }
  }
  if (found.length === 0) return null
  // Several answers on one face (a quarter turn one way or the other) are the same story; answers on different faces are a guess.
  const first = found[0]
  if (found.some((item) => item.faces.join() !== first.faces.join())) return null

  const [one, two] = first.faces
  const name = FACE_NAME[one]
  const facelets = first.faces.flatMap(faceFacelets)
  const what: Record<string, { title: string; body: string; label: string }> = {
    quarter: { title: `It looks like you entered the ${name} face turned a quarter turn`, body: `Every sticker on the ${name} face is the right colour, but they sit a quarter turn round from where they are on your cube. Easy slip when you turn the cube to look at it.`, label: `Turn the ${name} face back` },
    half: { title: `It looks like you entered the ${name} face upside down`, body: `Every sticker on the ${name} face is the right colour, but the face is turned half way round compared with your cube. It happens when you look at a face from the far side.`, label: `Turn the ${name} face round` },
    mirror: { title: `It looks like you entered the ${name} face the wrong way round, like in a mirror`, body: `The ${name} face has the right colours, but left and right (or top and bottom) are swapped compared with your cube.`, label: `Flip the ${name} face back` },
    flip: { title: `It looks like you entered the ${name} face turned over`, body: `The ${name} face has the right colours, but it is flipped over compared with your cube.`, label: `Flip the ${name} face back` },
    swap: { title: `It looks like the ${name} and ${two ? FACE_NAME[two] : ''} faces are swapped`, body: `Each of those two faces is painted with the other one's colours. Check which face you were looking at.`, label: `Swap the ${name} and ${two ? FACE_NAME[two] : ''} faces` },
  }
  const text = what[first.kind]
  return { id: 'face', code: 'impossible-piece', kind: 'slip', title: text.title, body: `${text.body} Look at the lit face on your real cube — if I’m right, tap the button and we’re done.`, facelets, fix: { label: `${text.label}`, changes: first.changes } }
}

/**
 * Two middles the same colour and one colour missing from the middles: if repainting one of the
 * two with the missing colour makes the colours add up (and, on a full cube, makes it a real cube),
 * that is the slip. Only offered when exactly one of the two works.
 */
export function findCentreSlip(painted: Painted, problems: readonly CubeProblem[]): Issue | null {
  const duplicate = problems.find((problem) => problem.code === 'duplicate-centers')
  if (!duplicate || duplicate.code !== 'duplicate-centers') return null
  const centres = FACES.map((face) => painted[faceFacelets(face)[4]])
  const missing = (Object.keys(OPPOSITE) as Color[]).filter((color) => !centres.includes(color))
  if (missing.length !== 1) return null
  const complete = blankCount(painted) === 0
  const works = duplicate.faces.filter((face) => {
    const changed = withChanges(painted, [{ facelet: faceFacelets(face)[4], color: missing[0] }])
    if (complete) return isOk(changed)
    const counts = new Map<Color, number>()
    for (const color of changed) if (color) counts.set(color, (counts.get(color) ?? 0) + 1)
    return [...counts.values()].every((n) => n <= 9) && !validateCube(changed).problems.some((p) => p.code === 'duplicate-centers' || p.code === 'impossible-centers')
  })
  if (works.length !== 1) return null
  const face = works[0]
  const facelet = faceFacelets(face)[4]
  return {
    id: 'centre',
    code: 'duplicate-centers',
    kind: 'slip',
    title: `The ${FACE_WORD[face]} middle should be ${missing[0]}`,
    body: `The ${list(duplicate.faces.map((f) => FACE_WORD[f]))} middles are both ${duplicate.color}, and no middle is ${missing[0]}. Every face has its own middle colour, so the lit one is the slip. Check it on your real cube — if I’m right, tap the button.`,
    facelets: [facelet],
    fix: { label: `Make it ${missing[0]}`, changes: [{ facelet, color: missing[0] }] },
  }
}

// ───────────────────────── Fixes for a real cube that was put together wrongly ─────────────────────────

const cycle = (painted: Painted, facelets: readonly number[], shift: number): StickerChange[] =>
  facelets.map((facelet, i) => ({ facelet, color: painted[facelets[(i + shift) % facelets.length]]! }))

/** Would this change clear the given kind of problem? (Other problems may remain.) */
function clears(painted: Painted, changes: StickerChange[], code: CubeProblem['code']): boolean {
  const result = validateCube(withChanges(painted, changes))
  return result.ok || !result.problems.some((problem) => problem.code === code)
}

/** Repaint a corner as it will look after twisting it back. Null if neither way helps. */
export function cornerTwistFix(painted: Painted, slot: SlotId): StickerChange[] | null {
  for (const shift of [1, 2]) {
    const changes = cycle(painted, SLOT_FACELETS[slot], shift)
    if (clears(painted, changes, 'twisted-corner')) return changes
  }
  return null
}

/** Repaint an edge as it will look after flipping it over. */
export function edgeFlipFix(painted: Painted, slot: SlotId): StickerChange[] | null {
  const changes = cycle(painted, SLOT_FACELETS[slot], 1)
  return clears(painted, changes, 'flipped-edge') ? changes : null
}

/** Repaint two pieces of the same kind as they will look after swapping them. */
export function pieceSwapFix(painted: Painted, a: SlotId, b: SlotId): StickerChange[] | null {
  const fa = SLOT_FACELETS[a]
  const fb = SLOT_FACELETS[b]
  if (fa.length !== fb.length) return null
  // The piece keeps its twist as it moves across; try each way of seating it.
  for (let shift = 0; shift < fa.length; shift++) {
    const changes: StickerChange[] = [
      ...fa.map((facelet, i) => ({ facelet, color: painted[fb[(i + shift) % fb.length]]! })),
      ...fb.map((facelet, i) => ({ facelet, color: painted[fa[(i + fa.length - shift) % fa.length]]! })),
    ]
    const result = validateCube(withChanges(painted, changes))
    if (result.ok || result.problems.every((problem) => problem.code !== 'swapped-pieces' && problem.code !== 'twisted-corner' && problem.code !== 'flipped-edge')) return changes
  }
  return null
}

// ───────────────────────── Messages ─────────────────────────

const pieceWord = (kind: 'corner' | 'edge') => (kind === 'corner' ? 'corner' : 'edge')
const stickerCount = (kind: 'corner' | 'edge') => (kind === 'corner' ? 'three' : 'two')

function countIssue(problems: readonly CubeProblem[], complete: boolean): Issue | null {
  const wrong = problems.filter((p) => p.code === 'wrong-count')
  if (wrong.length === 0) return null
  const over = wrong.filter((p) => p.count > PER_COLOR)
  const under = wrong.filter((p) => p.count < PER_COLOR)
  const extra = over.reduce((sum, p) => sum + p.count - PER_COLOR, 0)
  const have = list(wrong.map((p) => `${p.count} ${p.color}`))

  // Narrow the search: extras that sit on a piece that cannot be real are the likely slips.
  const suspects = new Set(problems.filter((p) => p.code === 'impossible-piece' || p.code === 'duplicate-piece').flatMap((p) => p.facelets))
  const overFacelets = over.flatMap((p) => p.facelets).filter((i) => !isCentre(i))
  const narrowed = overFacelets.filter((i) => suspects.has(i))
  const facelets = narrowed.length > 0 ? narrowed : overFacelets

  let body: string
  if (!complete) {
    body = `You have ${have}, but every colour goes on exactly 9 stickers. ${capital(word(extra))} of the ${list(over.map((p) => p.color))} stickers must be a different colour. Easy slip — look at the lit ones again.`
  } else if (over.length === 1 && under.length === 1 && extra === 1) {
    body = `You have ${have}. Every colour goes on exactly 9 stickers, so one ${over[0].color} sticker is probably meant to be ${under[0].color}. Compare the lit stickers with your cube.`
  } else {
    body = `You have ${have}. Every colour goes on exactly 9 stickers, so ${extra === 1 ? 'one sticker has' : `${word(extra)} stickers have`} the wrong colour: too much ${list(over.map((p) => p.color))}, not enough ${list(under.map((p) => p.color))}. Compare the lit stickers with your cube.`
  }
  return { id: 'count', code: 'wrong-count', kind: 'slip', title: 'The colours don’t add up yet', body, facelets }
}

function problemIssue(painted: Painted, problem: CubeProblem, index: number): Issue | null {
  const id = `${problem.code}-${index}`
  switch (problem.code) {
    case 'unpainted':
    case 'wrong-count':
      return null
    case 'duplicate-centers':
      return {
        id,
        code: problem.code,
        kind: 'slip',
        title: `Two middles are ${problem.color}`,
        body: `The middle sticker of every face is a different colour, and the middles never move. Check the middle of the ${list(problem.faces.map((f) => FACE_WORD[f]))} faces.`,
        facelets: problem.facelets,
      }
    case 'impossible-centers':
      return {
        id,
        code: problem.code,
        kind: 'slip',
        title: 'The middles are in a mixed-up order',
        body: 'On every cube white is opposite yellow, red is opposite orange and green is opposite blue — and with white on top and green facing you, red is on your right. Check the six middle stickers.',
        facelets: problem.facelets,
      }
    case 'impossible-piece': {
      const where = describeSlot(problem.slot)
      const n = stickerCount(problem.kind)
      let why: string
      if (problem.reason === 'same-color') {
        const twice = problem.colors.find((c, i) => problem.colors.indexOf(c) !== i)!
        why = `This ${pieceWord(problem.kind)} has ${twice} on it twice. No piece has the same colour on two sides.`
      } else if (problem.reason === 'opposite-colors') {
        const a = problem.colors.find((c) => problem.colors.includes(OPPOSITE[c]))!
        why = `This ${pieceWord(problem.kind)} has ${a} and ${OPPOSITE[a]} on it. Those two colours are on opposite sides of a cube, so no real piece has both.`
      } else {
        why = `${capital(list(problem.colors))} do belong on one corner — but here they go round the wrong way, like a mirror image. Two of them are probably swapped.`
      }
      return {
        id,
        code: problem.code,
        kind: 'slip',
        title: `Look at the ${where}`,
        body: `${why} One of these ${n} stickers is a slip.`,
        facelets: problem.facelets,
      }
    }
    case 'duplicate-piece':
      return {
        id,
        code: problem.code,
        kind: 'slip',
        title: `The ${problem.colors.join('-')} ${pieceWord(problem.kind)} is here ${problem.slots.length === 2 ? 'twice' : `${problem.slots.length} times`}`,
        body: `A cube has only one ${problem.colors.join('-')} ${pieceWord(problem.kind)}, so one of these is really a different piece. Check the ${list(problem.slots.map(describeSlot))} against your cube.`,
        facelets: problem.facelets,
      }
    case 'twisted-corner': {
      const slot = problem.slots[0] ?? 'URF'
      const changes = cornerTwistFix(painted, slot)
      const back = problem.twist === 'clockwise' ? 'counter-clockwise (against the clock)' : 'clockwise (like a clock)'
      return {
        id,
        code: problem.code,
        kind: 'cube',
        title: 'One corner is twisted',
        body:
          'Every sticker makes sense, but one corner is twisted in its own place, and turning the faces can never undo that. First compare the corners with your cube — a corner entered one step round looks just like this. If they all match, your real cube has a twisted corner (it happens when a cube is dropped). Easy to fix:',
        steps: [
          `Find the ${describeSlot(slot)} on your cube — the lit one.`,
          `Hold the rest of the cube still and gently twist just that corner piece one step ${back}, looking straight at its tip, until it clicks.`,
          'Then tap the button so the picture here matches.',
        ],
        facelets: [...SLOT_FACELETS[slot]],
        fix: changes ? { label: 'I twisted it — update the picture', changes } : undefined,
      }
    }
    case 'flipped-edge': {
      const slot = problem.slots[0] ?? 'UF'
      const changes = edgeFlipFix(painted, slot)
      return {
        id,
        code: problem.code,
        kind: 'cube',
        title: 'One edge is flipped',
        body:
          'Every sticker makes sense, but one edge is the wrong way round in its place. Most likely it is a slip — an edge with its two stickers entered the wrong way round — so compare the edges with your cube first. If they all match, your real cube has a flipped edge, and turning will never fix it. Here is how:',
        steps: [
          `Find the ${describeSlot(slot)} on your cube — the lit one.`,
          'Turn the top layer an eighth of a turn, so it sits like a diamond. Gently lever that edge piece up and out with your thumb. (Ask a grown-up if it is stiff.)',
          'Flip the piece over, push it back in until it clicks, and straighten the top.',
          'Then tap the button so the picture here matches.',
        ],
        facelets: [...SLOT_FACELETS[slot]],
        fix: changes ? { label: 'I flipped it — update the picture', changes } : undefined,
      }
    }
    case 'swapped-pieces': {
      const pair: [SlotId, SlotId] = problem.slots.length === 2 ? [problem.slots[0], problem.slots[1]] : ['UF', 'UR']
      const changes = pieceSwapFix(painted, pair[0], pair[1])
      return {
        id,
        code: problem.code,
        kind: 'cube',
        title: 'Two pieces have swapped places',
        body:
          'Every sticker makes sense, but two pieces sit in each other’s places. First compare the pieces with your cube. If they all match, your real cube was taken apart once and put back with two pieces swapped. No amount of turning fixes that — but you can:',
        steps: [
          `Find the ${describeSlot(pair[0])} and the ${describeSlot(pair[1])} on your cube — the lit ones.`,
          'Turn the top layer an eighth of a turn and gently lever both pieces out. (Ask a grown-up if it is stiff.)',
          'Put each one into the other’s place, push until they click, and straighten the top.',
          'Then tap the button so the picture here matches.',
        ],
        facelets: [...SLOT_FACELETS[pair[0]], ...SLOT_FACELETS[pair[1]]],
        fix: changes ? { label: 'I swapped them — update the picture', changes } : undefined,
      }
    }
  }
}

const OPPOSITE: Record<Color, Color> = { white: 'yellow', yellow: 'white', red: 'orange', orange: 'red', green: 'blue', blue: 'green' }
const FACE_WORD = { U: 'top', D: 'bottom', F: 'front', B: 'back', R: 'right', L: 'left' } as const

/** "Change this sticker to orange" / "Swap these two stickers". */
function slipLabel(changes: readonly StickerChange[]): string {
  return changes.length === 1 ? `Make it ${changes[0].color}` : 'Swap these two'
}

/**
 * Check a painted cube and explain what, if anything, is wrong with it.
 * Pure and cheap enough to run on every change (the slip search only runs on a full cube).
 */
export function checkCube(painted: Painted): CubeCheck {
  const result = validateCube(painted)
  const blanks = blankCount(painted)
  const progress = progressLine(blanks)
  if (result.ok) return { status: 'ok', blanks, progress, issues: [], state: result.state, result }

  const complete = blanks === 0
  // One whole face turned, mirrored or on the wrong side explains a pile of "impossible pieces" at once: say so, once.
  // A middle sticker painted the wrong colour (QA S3): one card, with the fix, instead of "10 red and
  // 8 green" plus "two middles are red".
  const centreSlip = findCentreSlip(painted, result.problems)
  if (centreSlip) return { status: 'problems', blanks, progress, issues: [centreSlip], state: null, result }
  const faceMistake = complete ? findFaceMistake(painted) : null
  if (faceMistake) return { status: 'problems', blanks, progress, issues: [faceMistake], state: null, result }
  const issues: Issue[] = []
  const count = countIssue(result.problems, complete)
  if (count) issues.push(count)
  result.problems.forEach((problem, i) => {
    const issue = problemIssue(painted, problem, i)
    if (issue) issues.push(issue)
  })

  // A full cube with slips in it: if exactly one small change makes everything right, offer it.
  if (complete && issues.length > 0 && issues.every((issue) => issue.kind === 'slip')) {
    const slips = findSlips(painted, 2)
    if (slips.length === 1) {
      const changes = slips[0]
      const facelets = changes.map((change) => change.facelet)
      const where = changes.length === 1 ? `the lit sticker should be ${changes[0].color}` : 'the two lit stickers are the wrong way round'
      issues.unshift({
        id: 'guess',
        code: issues[0].code,
        kind: 'slip',
        title: 'I think I found the slip',
        body: `Everything fits if ${where}. Look at that spot on your real cube — if I’m right, tap the button and we’re done.`,
        facelets,
        fix: { label: slipLabel(changes), changes },
      })
    }
  }

  return { status: issues.length > 0 ? 'problems' : 'incomplete', blanks, progress, issues, state: null, result }
}

/** Every sticker flagged by any issue (for marking faces that need another look). */
export function flaggedFacelets(issues: readonly Issue[]): Set<number> {
  return new Set(issues.flatMap((issue) => issue.facelets))
}
