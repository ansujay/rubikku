import { describe, expect, it } from 'vitest'
import {
  applyAlg,
  COLORS,
  CORNERS,
  CUBE_ROTATIONS,
  EDGES,
  faceColors,
  FACELETS,
  FACES,
  fromCubieArrays,
  isSolved,
  randomScramble,
  randomState,
  seededRng,
  SLOT_FACELETS,
  SOLVED,
  solveBeginner,
  toColors,
  toCubieArrays,
  validateCube,
  type Color,
  type CubeState,
  type Face,
} from '../../cube'
import { checkCube, cornerTwistFix, edgeFlipFix, findSlips, pieceSwapFix, progressLine, withChanges } from './checkModel'
import {
  applyForced,
  BLANK_CUBE,
  blankCount,
  blankCube,
  centreOf,
  clearAll,
  clearFace,
  countColors,
  decode,
  EMPTY_HISTORY,
  encode,
  faceFacelets,
  inferForced,
  isEncoded,
  paint,
  pushHistory,
  redoHistory,
  undoHistory,
  type Cell,
} from './entryModel'
import { centreNames, faceInstruction, GUIDED_FACES } from './faceGuide'
import { sanitizeSolve, isPretend, useSolve } from './solveStore'
import {
  back,
  clampPos,
  currentMove,
  faceTurns,
  globalIndex,
  groupStatus,
  isFinished,
  isLastOfGroup,
  isMilestone,
  next,
  START,
  stateAt,
  stepPlace,
  stepStart,
  walkFromBeginner,
  walkFromFastest,
  type WalkPos, isBoundary, locate, movesToBoundary, posAt, endsSolved } from './walkthrough'

const rng = seededRng(20261112)
const scrambled = (n = 0): CubeState => {
  let state = SOLVED
  for (let i = 0; i <= n; i++) state = randomState(rng)
  return state
}
const tamper = (base: CubeState, change: (a: ReturnType<typeof toCubieArrays>) => void): CubeState => {
  const arrays = toCubieArrays(base)
  change(arrays)
  return fromCubieArrays(arrays)
}

// ───────────────────────── Guided entry: the face mapping ─────────────────────────

describe('guided face views', () => {
  it('covers all six faces once', () => {
    expect(GUIDED_FACES.map((v) => v.face).sort()).toEqual([...FACES].sort())
  })

  it('after the described whole-cube turn, the face is the front face, sticker for sticker', () => {
    for (let n = 0; n < 20; n++) {
      const state = scrambled()
      for (const view of GUIDED_FACES) {
        const turned = applyAlg(state, view.rotation)
        expect(faceColors(turned, 'F'), `${view.face} via ${view.rotation.join(' ')}`).toEqual(faceColors(state, view.face))
      }
    }
  })

  it('the side turns keep the top on top; the tips keep left and right in place', () => {
    const state = scrambled()
    for (const view of GUIDED_FACES) {
      const turned = toColors(applyAlg(state, view.rotation))
      const centres = toColors(state)
      if ('FRBL'.includes(view.face)) expect(turned[centreOf('U')]).toBe(centres[centreOf('U')])
      else {
        expect(turned[centreOf('R')]).toBe(centres[centreOf('R')])
        expect(turned[centreOf('L')]).toBe(centres[centreOf('L')])
      }
    }
  })

  it('names the faces touching each side of the grid correctly', () => {
    for (const view of GUIDED_FACES) {
      const base = FACES.indexOf(view.face) * 9
      const touching = (i: number) => FACELETS[base + i].slot.replace(view.face, '') as Face
      expect(touching(1)).toBe(view.neighbours.top)
      expect(touching(5)).toBe(view.neighbours.right)
      expect(touching(7)).toBe(view.neighbours.bottom)
      expect(touching(3)).toBe(view.neighbours.left)
    }
  })

  it('entering a cube face by face in guided order gives back the identical state', () => {
    for (let n = 0; n < 25; n++) {
      const state = scrambled()
      let painted: readonly Cell[] = new Array<Cell>(54).fill(null)
      for (const view of GUIDED_FACES) {
        // What he sees: the cube turned as instructed, looking at the front face, row by row.
        const seen = faceColors(applyAlg(state, view.rotation), 'F')
        faceFacelets(view.face).forEach((facelet, i) => (painted = paint(painted, facelet, seen[i])))
      }
      const result = validateCube(painted)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.state).toBe(state)
    }
  })

  it('works for a cube held in any of the 24 orientations', () => {
    const base = scrambled()
    for (const rotation of CUBE_ROTATIONS) {
      const state = applyAlg(base, rotation)
      let painted: readonly Cell[] = new Array<Cell>(54).fill(null)
      for (const view of GUIDED_FACES) {
        const seen = faceColors(applyAlg(state, view.rotation), 'F')
        faceFacelets(view.face).forEach((facelet, i) => (painted = paint(painted, facelet, seen[i])))
      }
      const result = validateCube(painted)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.state).toBe(state)
        // …and the solution starts from exactly that hold and ends solved.
        const solution = solveBeginner(result.state)
        expect(isSolved(applyAlg(state, solution.moves))).toBe(true)
      }
    }
  })

  it('writes instructions with the centre colours, or places while centres are blank', () => {
    const colours = centreNames({ U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' })
    expect(faceInstruction('U', colours).how).toContain('white centre on top')
    expect(faceInstruction('B', colours).check).toMatch(/never flip/)
    const blank = centreNames({ U: null, D: null, F: null, B: null, R: null, L: null })
    for (const view of GUIDED_FACES) {
      const text = Object.values(faceInstruction(view.face, blank)).join(' ')
      expect(text).not.toMatch(/null|undefined/)
    }
  })
})

// ───────────────────────── Entry model ─────────────────────────

describe('entry model', () => {
  it('encodes and decodes without loss', () => {
    const state = scrambled()
    const painted: Cell[] = toColors(state)
    painted[3] = null
    painted[40] = null
    const text = encode(painted)
    expect(isEncoded(text)).toBe(true)
    expect(decode(text)).toEqual(painted)
    expect(encode(toColors(state))).toBe(state)
    expect(isEncoded('nope')).toBe(false)
  })

  it('starts with the standard centres', () => {
    const cube = blankCube()
    expect(blankCount(cube)).toBe(48)
    expect(cube[centreOf('U')]).toBe('white')
    expect(cube[centreOf('F')]).toBe('green')
    expect(cube[centreOf('R')]).toBe('red')
  })

  it('counts, paints and clears', () => {
    let cube: readonly Cell[] = blankCube()
    cube = paint(cube, 0, 'red')
    expect(paint(cube, 0, 'red')).toBe(cube)
    expect(countColors(cube).red).toBe(2)
    cube = clearFace(cube, 'U', true)
    expect(cube[0]).toBeNull()
    expect(cube[4]).toBe('white')
    expect(clearFace(cube, 'U', false)[4]).toBeNull()
    expect(blankCount(clearAll(toColors(SOLVED), true))).toBe(48)
    expect(blankCount(clearAll(toColors(SOLVED), false))).toBe(54)
  })

  it('undo and redo walk the history', () => {
    let history = EMPTY_HISTORY
    history = pushHistory(history, 'a')
    history = pushHistory(history, 'b')
    const undone = undoHistory(history, 'c')!
    expect(undone.cells).toBe('b')
    const redone = redoHistory(undone.history, undone.cells)!
    expect(redone.cells).toBe('c')
    expect(redone.history.past).toEqual(['a', 'b'])
    expect(undoHistory(EMPTY_HISTORY, 'x')).toBeNull()
    expect(redoHistory(EMPTY_HISTORY, 'x')).toBeNull()
    expect(pushHistory(undone.history, 'z').future).toEqual([])
  })
})

describe('forced stickers', () => {
  it('fills the last stickers when only one colour is left', () => {
    const state = scrambled()
    const full = toColors(state)
    const painted: Cell[] = [...full]
    const blues = painted.flatMap((c, i) => (c === 'blue' && i % 9 !== 4 ? [i] : [])).slice(0, 3)
    for (const i of blues) painted[i] = null
    const forced = inferForced(painted)
    expect(forced).toHaveLength(3)
    expect(applyForced(painted, forced)).toEqual(full)
  })

  it('only ever infers the true colour on real cubes', () => {
    for (let n = 0; n < 60; n++) {
      const state = scrambled()
      const full = toColors(state)
      const painted: Cell[] = [...full]
      const holes = 1 + Math.floor(rng() * 14)
      for (let k = 0; k < holes; k++) {
        const i = Math.floor(rng() * 54)
        if (i % 9 !== 4) painted[i] = null
      }
      for (const { facelet, color } of inferForced(painted)) expect(color, `facelet ${facelet}`).toBe(full[facelet])
    }
  })

  it('knows the third sticker of a corner from the other two', () => {
    const painted: Cell[] = blankCube()
    const [a, b, c] = SLOT_FACELETS.URF
    painted[a] = 'white'
    painted[b] = 'red'
    expect(inferForced(painted)).toContainEqual({ facelet: c, color: 'green', reason: 'piece' })
  })

  it('infers nothing from an entry that already has a slip in it', () => {
    const painted: Cell[] = toColors(SOLVED)
    painted[0] = null
    painted[1] = 'red' // ten reds
    expect(inferForced(painted)).toEqual([])
    const noCentres: Cell[] = new Array<Cell>(54).fill(null)
    expect(inferForced(noCentres)).toEqual([])
  })
})

// ───────────────────────── Check ─────────────────────────

describe('checkCube', () => {
  it('reports progress gently while incomplete', () => {
    const check = checkCube(blankCube())
    expect(check.status).toBe('incomplete')
    expect(check.blanks).toBe(48)
    expect(check.issues).toEqual([])
    expect(progressLine(12)).toBe('12 stickers to go.')
    expect(progressLine(1)).toMatch(/1 sticker/)
  })

  it('passes a real cube in any orientation', () => {
    const state = applyAlg(scrambled(), 'x y')
    const check = checkCube(toColors(state))
    expect(check.status).toBe('ok')
    expect(check.state).toBe(state)
  })

  it('a single wrong sticker: says which colours, and finds the exact slip', () => {
    for (let n = 0; n < 30; n++) {
      const state = scrambled()
      const painted: Cell[] = toColors(state)
      let i = Math.floor(rng() * 54)
      while (i % 9 === 4) i = Math.floor(rng() * 54)
      const truth = painted[i]!
      const wrong = COLORS.find((c) => c !== truth)!
      painted[i] = wrong
      const check = checkCube(painted)
      expect(check.status).toBe('problems')
      const count = check.issues.find((issue) => issue.id === 'count')!
      expect(count.body).toContain(`10 ${wrong}`)
      expect(count.body).toContain(`8 ${truth}`)
      expect(count.body).toContain(`one ${wrong} sticker is probably meant to be ${truth}`)
      expect(count.facelets).toContain(i)
      const guess = check.issues[0]
      expect(guess.id).toBe('guess')
      expect(guess.fix!.changes).toEqual([{ facelet: i, color: truth }])
      expect(checkCube(withChanges(painted, guess.fix!.changes)).status).toBe('ok')
    }
  })

  it('two swapped stickers on neighbouring pieces: finds the swap', () => {
    const state = scrambled()
    const painted: Cell[] = toColors(state)
    // Two stickers side by side on the front face that differ.
    const pairs = [
      [18, 19],
      [19, 20],
      [21, 18],
      [24, 25],
      [25, 26],
    ]
    const [a, b] = pairs.find(([x, y]) => painted[x] !== painted[y])!
    ;[painted[a], painted[b]] = [painted[b], painted[a]]
    const check = checkCube(painted)
    expect(check.status).toBe('problems')
    expect(check.issues.every((issue) => issue.kind === 'slip')).toBe(true)
    const slips = findSlips(painted, 10)
    expect(slips.some((changes) => checkCube(withChanges(painted, changes)).state === state)).toBe(true)
  })

  it('impossible pieces are explained by what is wrong with them', () => {
    const opposite: Cell[] = toColors(SOLVED)
    opposite[SLOT_FACELETS.UF[1]] = 'yellow'
    const a = checkCube(opposite).issues.find((issue) => issue.code === 'impossible-piece')!
    expect(a.body).toMatch(/white and yellow/)
    expect(a.body).toMatch(/opposite sides/)
    expect(a.facelets.sort()).toEqual([...SLOT_FACELETS.UF].sort())

    const twice: Cell[] = toColors(SOLVED)
    twice[SLOT_FACELETS.URF[1]] = 'white'
    const b = checkCube(twice).issues.find((issue) => issue.code === 'impossible-piece')!
    expect(b.body).toMatch(/white on it twice/)
    expect(b.body).toMatch(/three stickers/)

    const mirrored: Cell[] = toColors(SOLVED)
    const [, r, f] = SLOT_FACELETS.URF
    ;[mirrored[r], mirrored[f]] = [mirrored[f], mirrored[r]]
    const c = checkCube(mirrored).issues.find((issue) => issue.code === 'impossible-piece')!
    expect(c.body).toMatch(/wrong way/)
  })

  it('a duplicated piece names the piece', () => {
    const painted: Cell[] = toColors(SOLVED)
    // Make the UR edge a second white-green edge (and so one green too many).
    painted[SLOT_FACELETS.UR[1]] = 'green'
    const check = checkCube(painted)
    const dup = check.issues.find((issue) => issue.code === 'duplicate-piece')!
    expect(dup.title).toMatch(/white-green edge is here twice/)
    expect(dup.facelets).toHaveLength(4)
    // The count issue narrows down to the greens on suspicious pieces.
    const count = check.issues.find((issue) => issue.id === 'count')!
    expect(count.facelets.length).toBeLessThan(9)
    expect(count.facelets).toContain(SLOT_FACELETS.UR[1])
  })

  it('wrong centres are caught before anything else', () => {
    const painted: Cell[] = toColors(SOLVED)
    painted[centreOf('F')] = 'red'
    const check = checkCube(painted)
    expect(check.issues.some((issue) => issue.code === 'duplicate-centers' && /front and right|right and front/.test(issue.body))).toBe(true)

    const swapped: Cell[] = toColors(SOLVED)
    swapped[centreOf('R')] = 'orange'
    swapped[centreOf('L')] = 'red'
    expect(checkCube(swapped).issues.some((issue) => issue.code === 'impossible-centers')).toBe(true)
  })

  it('never writes "undefined" or blames', () => {
    for (let n = 0; n < 40; n++) {
      const painted: Cell[] = toColors(scrambled())
      for (let k = 0; k < 1 + (n % 4); k++) {
        const i = Math.floor(rng() * 54)
        painted[i] = COLORS[Math.floor(rng() * 6)]
      }
      for (const issue of checkCube(painted).issues) {
        const text = [issue.title, issue.body, ...(issue.steps ?? [])].join(' ')
        expect(text).not.toMatch(/undefined|null|\[object|you made|your mistake|wrong(ly)? entered/i)
        for (const f of issue.facelets) expect(f >= 0 && f < 54).toBe(true)
      }
    }
  })
})

describe('physical problems', () => {
  it('twisted corner: calm how-to, the corner lit, and the fix makes the cube solvable', () => {
    for (let n = 0; n < 12; n++) {
      const base = n === 0 ? SOLVED : applyAlg(scrambled(), n % 2 ? 'x' : '')
      const corner = n % 8
      const state = tamper(base, (a) => (a.co[corner] = (a.co[corner] + 1 + (n % 2)) % 3))
      const check = checkCube(toColors(state))
      expect(check.status).toBe('problems')
      expect(check.issues).toHaveLength(1)
      const issue = check.issues[0]
      expect(issue.code).toBe('twisted-corner')
      expect(issue.kind).toBe('cube')
      expect(issue.steps!.length).toBeGreaterThanOrEqual(3)
      expect(issue.facelets).toHaveLength(3)
      expect(CORNERS.some((slot) => [...SLOT_FACELETS[slot]].sort().join() === [...issue.facelets].sort().join())).toBe(true)
      expect(checkCube(withChanges(toColors(state), issue.fix!.changes)).status).toBe('ok')
    }
    // On an otherwise solved cube the engine names the corner: the fix restores it exactly.
    const twisted = tamper(SOLVED, (a) => (a.co[2] = 1))
    const issue = checkCube(toColors(twisted)).issues[0]
    expect(encode(withChanges(toColors(twisted), issue.fix!.changes))).toBe(SOLVED)
    expect(cornerTwistFix(toColors(twisted), CORNERS[2])).not.toBeNull()
  })

  it('flipped edge: the fix makes the cube solvable', () => {
    for (let n = 0; n < 12; n++) {
      const base = n === 0 ? SOLVED : scrambled()
      const state = tamper(base, (a) => (a.eo[n % 12] ^= 1))
      const check = checkCube(toColors(state))
      const issue = check.issues[0]
      expect(check.issues).toHaveLength(1)
      expect(issue.code).toBe('flipped-edge')
      expect(issue.body).toMatch(/slip/)
      expect(issue.facelets).toHaveLength(2)
      expect(checkCube(withChanges(toColors(state), issue.fix!.changes)).status).toBe('ok')
    }
    expect(edgeFlipFix(toColors(SOLVED), EDGES[0])).toBeNull()
  })

  it('swapped pieces: the fix makes the cube solvable', () => {
    for (let n = 0; n < 12; n++) {
      const base = n === 0 ? SOLVED : scrambled()
      const state = tamper(base, (a) => {
        const list = n % 2 ? a.cp : a.ep
        const i = n % 8
        const j = (i + 3) % 8
        ;[list[i], list[j]] = [list[j], list[i]]
      })
      const check = checkCube(toColors(state))
      expect(check.issues).toHaveLength(1)
      const issue = check.issues[0]
      expect(issue.code).toBe('swapped-pieces')
      expect(issue.steps!.join(' ')).toMatch(/other’s place/)
      expect(checkCube(withChanges(toColors(state), issue.fix!.changes)).status).toBe('ok')
    }
    expect(pieceSwapFix(toColors(SOLVED), 'UF', 'URF')).toBeNull()
  })

  it('several physical problems at once are fixed one button at a time', () => {
    const state = tamper(scrambled(), (a) => {
      a.co[1] = (a.co[1] + 1) % 3
      a.eo[5] ^= 1
      ;[a.ep[0], a.ep[1]] = [a.ep[1], a.ep[0]]
    })
    let painted: readonly Cell[] = toColors(state)
    for (let round = 0; round < 3; round++) {
      const check = checkCube(painted)
      expect(check.status).toBe('problems')
      expect(check.issues).toHaveLength(3 - round)
      painted = withChanges(painted, check.issues[0].fix!.changes)
    }
    expect(checkCube(painted).status).toBe('ok')
  })
})

// ───────────────────────── Walkthrough ─────────────────────────

describe('walkthrough', () => {
  const state = applyAlg(SOLVED, randomScramble({ rng }))
  const walk = walkFromBeginner(solveBeginner(state))

  it('mirrors the solution exactly', () => {
    const solution = solveBeginner(state)
    expect(walk.moves).toEqual(solution.moves)
    expect(walk.states[0]).toBe(state)
    expect(isSolved(walk.states[walk.total])).toBe(true)
    expect(walk.groups).toEqual(solution.stages.map((s) => s.stage))
    walk.steps.forEach((step, i) => {
      expect(walk.states[walk.offsets[i]]).toBe(solution.steps[i].before)
      expect(walk.states[walk.offsets[i + 1]]).toBe(solution.steps[i].after)
      expect(step.moves.length).toBeGreaterThan(0)
    })
  })

  it('next walks every move once, stops at each chapter end, and finishes solved', () => {
    let pos: WalkPos = START
    let moves = 0
    let milestones = 0
    for (let guard = 0; guard < 2000 && !isFinished(walk, pos); guard++) {
      const before = globalIndex(walk, pos)
      const move = currentMove(walk, pos)
      const after = next(walk, pos)
      const delta = globalIndex(walk, after) - before
      expect(delta === 0 || delta === 1).toBe(true)
      if (delta === 1) {
        expect(move).toBe(walk.moves[before])
        moves++
      } else {
        expect(isMilestone(walk, pos)).toBe(true)
      }
      if (isMilestone(walk, after)) {
        milestones++
        expect(isLastOfGroup(walk, after.step)).toBe(true)
      }
      pos = after
    }
    expect(isFinished(walk, pos)).toBe(true)
    expect(moves).toBe(walk.total)
    expect(milestones).toBe(walk.groups.length)
    expect(isSolved(stateAt(walk, pos))).toBe(true)
    expect(next(walk, pos)).toEqual(pos)
  })

  it('back is the exact reverse of next', () => {
    const trail: WalkPos[] = [START]
    while (!isFinished(walk, trail[trail.length - 1])) trail.push(next(walk, trail[trail.length - 1]))
    for (let i = trail.length - 1; i > 0; i--) expect(back(walk, trail[i])).toEqual(trail[i - 1])
    expect(back(walk, START)).toEqual(START)
  })

  it('step start, clamping and summaries', () => {
    const multi = walk.steps.findIndex((step) => step.moves.length >= 3)
    expect(stepStart(walk, { step: multi, move: 2 })).toEqual({ step: multi, move: 0 })
    expect(stepStart(walk, { step: multi, move: 0 })).toEqual({ step: Math.max(0, multi - 1), move: 0 })
    expect(clampPos(walk, { step: 9999, move: 9999 })).toEqual({ step: walk.steps.length - 1, move: walk.steps[walk.steps.length - 1].moves.length })
    expect(clampPos(walk, { step: -3, move: -2.5 })).toEqual(START)
    expect(clampPos(walk, { step: NaN, move: NaN })).toEqual(START)
    // An "end of step" that is not a chapter end is the start of the next step.
    const inner = walk.steps.findIndex((_, i) => !isLastOfGroup(walk, i))
    expect(clampPos(walk, { step: inner, move: walk.steps[inner].moves.length })).toEqual({ step: inner + 1, move: 0 })

    const place = stepPlace(walk, 0)
    expect(place.number).toBe(1)
    expect(place.of).toBe(solveBeginner(state).stages[0].steps.length)
    expect(faceTurns(walk)).toBe(solveBeginner(state).faceTurns)
    expect(faceTurns(walk, 0)).toBe(0)

    const first = walk.groups[0]
    expect(groupStatus(walk, START, first)).toBe('current')
    const end = { step: walk.steps.length - 1, move: walk.steps[walk.steps.length - 1].moves.length }
    for (const group of walk.groups) expect(groupStatus(walk, end, group)).toBe('done')
    expect(groupStatus(walk, START, walk.groups[walk.groups.length - 1])).toBe(walk.groups.length > 1 ? 'todo' : 'current')
  })

  it('an already solved cube makes an empty, finished walk', () => {
    const empty = walkFromBeginner(solveBeginner(SOLVED))
    expect(empty.total).toBe(0)
    expect(isFinished(empty, START)).toBe(true)
    expect(next(empty, START)).toEqual(START)
    expect(currentMove(empty, START)).toBeNull()
    expect(clampPos(empty, { step: 4, move: 2 })).toEqual(START)
  })

  it('the fastest way is chunked into short parts that end solved', () => {
    const moves = ['R', 'U', "R'", "U'", 'F2', 'D', "L'", 'B', 'U2', 'R', 'F'] as const
    const start = applyAlg(SOLVED, [...moves].reverse().map((m) => (m.endsWith('2') ? m : m.endsWith("'") ? m[0] : `${m}'`)).join(' '))
    const fast = walkFromFastest(start, moves)
    expect(fast.steps.map((s) => s.moves.length)).toEqual([5, 5, 1])
    expect(fast.groups).toEqual(['fastest'])
    expect(isSolved(fast.states[fast.total])).toBe(true)
    expect(walkFromFastest(SOLVED, []).total).toBe(0)
  })

  it('a re-solve from any point mid-solution still ends solved', () => {
    for (const index of [1, 7, 23, Math.floor(walk.total / 2), walk.total - 2]) {
      const from = walk.states[index]
      const again = walkFromBeginner(solveBeginner(from))
      expect(isSolved(again.states[again.total])).toBe(true)
    }
  })
})

// ───────────────────────── Step boundaries (M5) ─────────────────────────

describe('step boundaries: the only places a solution may be planned again', () => {
  const state = applyAlg(SOLVED, randomScramble({ rng }))
  const walk = walkFromBeginner(solveBeginner(state))

  it('knows a boundary from the middle of a step', () => {
    const multi = walk.steps.findIndex((step) => step.moves.length >= 3)
    expect(isBoundary(walk, { step: multi, move: 0 })).toBe(true)
    expect(isBoundary(walk, { step: multi, move: 1 })).toBe(false)
    expect(movesToBoundary(walk, { step: multi, move: 1 })).toBe(walk.steps[multi].moves.length - 1)
    expect(movesToBoundary(walk, { step: multi, move: 0 })).toBe(0)
    const end = { step: walk.steps.length - 1, move: walk.steps[walk.steps.length - 1].moves.length }
    expect(isBoundary(walk, end)).toBe(true)
  })

  it('planning again from any step boundary gives exactly the rest of the same plan — no finished stage is redone', () => {
    for (let i = 0; i < 12; i++) {
      const start = applyAlg(SOLVED, randomScramble({ rng }))
      const plan = walkFromBeginner(solveBeginner(start))
      plan.steps.forEach((_, k) => {
        const again = walkFromBeginner(solveBeginner(plan.states[plan.offsets[k]]))
        expect(again.moves).toEqual(plan.moves.slice(plan.offsets[k]))
      })
    }
  })

  it('finds the cube again in the plan he was following, nearest to where he was', () => {
    for (let index = 0; index <= walk.total; index++) {
      const pos = posAt(walk, index)
      expect(globalIndex(walk, pos)).toBe(index)
      expect(globalIndex(walk, locate(walk, walk.states[index], index)!)).toBe(index)
    }
    // One turn behind or ahead of where the page thought he was: still found, nothing re-planned.
    const mid = walk.offsets[walk.steps.findIndex((step) => step.moves.length >= 4)] + 2
    expect(globalIndex(walk, locate(walk, walk.states[mid - 1], mid)!)).toBe(mid - 1)
    // A cube the plan never passes through is not found.
    expect(locate(walk, applyAlg(walk.states[mid], 'R'), mid)).toBeNull()
    expect(endsSolved(walk)).toBe(true)
  })
})

// ───────────────────────── The store: pretend cubes, rewards, pausing (M6, M7) ─────────────────────────

describe('solve store', () => {
  const fresh = () => {
    useSolve.getState().startOver()
    return useSolve.getState
  }
  const real = scrambled()

  it('a pretend cube stays pretend through taps, edits and fixes; undoing the fill or clearing makes it his own', () => {
    const get = fresh()
    get().setCells(toColors(real), { demo: true })
    expect(get().demo).toBe(true)
    // A tap that changes nothing (the same colour again) must not make it "real".
    get().paintSticker(0, toColors(real)[0])
    expect(get().demo).toBe(true)
    // Nor does changing a sticker and changing it back.
    get().paintSticker(0, toColors(real)[0] === 'white' ? 'yellow' : 'white')
    get().paintSticker(0, toColors(real)[0])
    expect(get().cells).toBe(real)
    expect(get().demo).toBe(true)
    // Undo back past the fill: the cube on screen is whatever he painted himself.
    get().undo()
    get().undo()
    get().undo()
    expect(get().demo).toBe(false)
    get().redo()
    expect(get().demo).toBe(true)
    // "Fix the colours" keeps a pretend cube pretend.
    get().reenter(toColors(real))
    expect(get().demo).toBe(true)
    get().paintSticker(0, 'white')
    expect(get().demo).toBe(true)
    // Clear all: now it is an empty cube of his own.
    get().clearAll()
    expect(get().demo).toBe(false)
    get().paintSticker(0, 'red')
    expect(get().demo).toBe(false)
  })

  it('isPretend follows the fill through the undo history', () => {
    expect(isPretend(real, [], null)).toBe(false)
    expect(isPretend(real, [], real)).toBe(true)
    expect(isPretend(SOLVED, [real], real)).toBe(true)
    expect(isPretend(SOLVED, [BLANK_CUBE], real)).toBe(false)
    expect(isPretend(SOLVED, [real, BLANK_CUBE], real)).toBe(false)
    expect(sanitizeSolve({ cells: real, demo: true }).demo).toBe(true)
    expect(sanitizeSolve({ cells: real, demo: false }).demo).toBe(false)
  })

  it('the reward flag belongs to the entered cube: re-solving, switching mode or fixing colours never clears it', () => {
    const get = fresh()
    get().setCells(toColors(real))
    get().showWhere(real)
    get().startWalk(real, 'beginner')
    expect(get().rewarded).toBe(false)
    get().setCelebrated()
    get().setRewarded()
    get().startWalk(real, 'fastest')
    expect(get().celebrated).toBe(false)
    expect(get().rewarded).toBe(true)
    get().reenter(toColors(real))
    get().startWalk(applyAlg(real, 'R'), 'beginner')
    expect(get().rewarded).toBe(true)
    // Clearing a cube that has had its reward starts a new one (and cannot be undone back).
    get().setPhase('entry')
    get().clearAll()
    expect(get().rewarded).toBe(false)
    expect(get().history.past).toEqual([])
    expect(get().phase).toBe('entry')
    // Only starting over gives a new cube its own reward.
    get().setRewarded()
    get().startOver()
    expect(get().rewarded).toBe(false)
  })

  it('"where am I?" from inside a solution pauses it; carrying on changes nothing; fixing colours keeps the plan', () => {
    const get = fresh()
    get().startWalk(real, 'beginner', { priorTurns: 7 })
    get().setPos({ step: 3, move: 1 })
    get().pauseWalk()
    expect(get()).toMatchObject({ phase: 'where', paused: true, start: real, pos: { step: 3, move: 1 } })
    get().resumeWalk()
    expect(get()).toMatchObject({ phase: 'walk', paused: false, start: real, pos: { step: 3, move: 1 }, priorTurns: 7 })
    get().reenter(toColors(real))
    expect(get()).toMatchObject({ phase: 'entry', reentry: true, start: real, pos: { step: 3, move: 1 }, priorTurns: 7, walkMode: 'beginner' })
    get().resumeWalk({ step: 2, move: 0 })
    expect(get()).toMatchObject({ phase: 'walk', reentry: false, pos: { step: 2, move: 0 } })
    // A fresh "where am I?" from entry is not a paused walk.
    get().showWhere(real)
    expect(get().paused).toBe(false)
    expect(sanitizeSolve({ phase: 'walk', start: real, paused: true }).paused).toBe(false)
  })
})

// ───────────────────────── Saved data ─────────────────────────

describe('sanitizeSolve', () => {
  it('keeps good data', () => {
    const state = scrambled()
    const saved = { phase: 'walk', intent: 'where', cells: state, start: state, walkMode: 'fastest', fastest: ['R', "U'"], pos: { step: 3, move: 1 }, speed: 0.5, guidedIndex: 4, brush: 'red' }
    expect(sanitizeSolve(saved)).toMatchObject(saved)
  })

  it('drops rubbish and never leaves a phase without its cube', () => {
    expect(sanitizeSolve(null)).toEqual({})
    expect(sanitizeSolve({ phase: 'walk', cells: 'xyz', pos: { step: -1, move: 'a' }, fastest: ['Q'], speed: 99, brush: 'pink', guidedIndex: 9 })).toEqual({ phase: 'entry', demo: false, paused: false })
    expect(sanitizeSolve({ history: { past: ['bad', SOLVED], future: 7 } }).history).toEqual({ past: [SOLVED], future: [] })
  })
})

// A reminder of the colour type used across the page.
const _colour: Color = 'white'
void _colour

describe('a whole face entered turned, mirrored or on the wrong side (S1)', () => {
  const rng = seededRng(77)
  const cubes = Array.from({ length: 4 }, () => toColors(randomState(rng)))
  /** The same nine-sticker rearrangements the checker knows, written out independently. */
  const grid = (face: Face) => faceFacelets(face)
  const transforms: Record<string, (r: number, c: number) => [number, number]> = {
    'quarter-cw': (r, c) => [2 - c, r],
    'quarter-ccw': (r, c) => [c, 2 - r],
    half: (r, c) => [2 - r, 2 - c],
    'mirror-lr': (r, c) => [r, 2 - c],
    'mirror-ud': (r, c) => [2 - r, c],
    transpose: (r, c) => [c, r],
    anti: (r, c) => [2 - c, 2 - r],
  }
  const apply = (painted: Cell[], face: Face, move: (r: number, c: number) => [number, number]) => {
    const out = painted.slice()
    const own = grid(face)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (r * 3 + c !== 4) out[own[r * 3 + c]] = painted[own[move(r, c)[0] * 3 + move(r, c)[1]]]
    return out
  }

  it('every face x every transform becomes ONE message whose fix gives the real cube back and lights the face', () => {
    let tried = 0
    for (const real of cubes) {
      for (const face of FACES) {
        for (const [name, move] of Object.entries(transforms)) {
          const entered = apply(real, face, move)
          if (encode(entered) === encode(real) || validateCube(entered).ok) continue // face looked the same either way
          tried++
          const check = checkCube(entered)
          expect(check.status, `${face} ${name}`).toBe('problems')
          expect(check.issues, `${face} ${name}`).toHaveLength(1)
          const [issue] = check.issues
          expect(issue.id).toBe('face')
          expect(new Set(issue.facelets)).toEqual(new Set(faceFacelets(face)))
          expect(issue.fix).toBeDefined()
          expect(validateCube(withChanges(entered, issue.fix!.changes)).ok).toBe(true)
          // The only valid reading of a quarter turn is the one that puts the original back.
          expect(encode(withChanges(entered, issue.fix!.changes))).toBe(encode(real))
        }
      }
    }
    expect(tried).toBeGreaterThan(100)
  })

  it('two faces entered on each other’s sides are one message too', () => {
    for (const real of cubes) {
      for (const [a, b] of [['R', 'L'], ['U', 'D'], ['F', 'B']] as const) {
        const entered = real.slice()
        grid(a).forEach((facelet, i) => {
          if (i === 4) return
          entered[facelet] = real[grid(b)[i]]
          entered[grid(b)[i]] = real[facelet]
        })
        if (validateCube(entered).ok) continue
        const check = checkCube(entered)
        expect(check.issues, `${a}${b}`).toHaveLength(1)
        expect(check.issues[0].id).toBe('face')
        expect(encode(withChanges(entered, check.issues[0].fix!.changes))).toBe(encode(real))
      }
    }
  })

  it('does not interfere with a real cube, or with a single wrong sticker', () => {
    expect(checkCube(cubes[0]).status).toBe('ok')
    const slip = cubes[0].slice()
    slip[1] = slip[1] === 'red' ? 'green' : 'red'
    expect(checkCube(slip).issues.some((issue) => issue.id === 'face')).toBe(false)
  })
})

describe('a middle sticker painted the wrong colour (QA S3)', () => {
  const rng = seededRng(91)
  const cubes = Array.from({ length: 4 }, () => toColors(randomState(rng)))
  it('is one card that names the middle and puts it right — on a full cube and part-way through', () => {
    let tried = 0
    for (const real of cubes) {
      for (const face of FACES) {
        const centre = faceFacelets(face)[4]
        for (const other of FACES) {
          if (other === face) continue
          const entered = real.slice()
          entered[centre] = real[faceFacelets(other)[4]]
          const check = checkCube(entered)
          expect(check.issues, `${face}=${other}`).toHaveLength(1)
          const [issue] = check.issues
          expect(issue.id).toBe('centre')
          expect(issue.facelets).toEqual([centre])
          expect(encode(withChanges(entered, issue.fix!.changes))).toBe(encode(real))
          tried++
          // Part-way through (a few stickers still blank): the same one card.
          const partial: Cell[] = entered.slice()
          for (const i of [0, 20, 47]) if (i !== centre) partial[i] = null
          const early = checkCube(partial)
          expect(early.issues.map((i) => i.id), `${face}=${other} partial`).toEqual(['centre'])
        }
      }
    }
    expect(tried).toBe(4 * 30)
  })
})
