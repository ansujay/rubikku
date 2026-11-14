import { describe, expect, it } from 'vitest'
import { ALGORITHMS, algorithmsForStage, getAlgorithm } from '../algorithms'
import { EDGES, SLOTS, type SlotId } from '../geometry'
import { algOrder, applyAlg, stateFromAlg } from '../moves'
import { algToString, invertAlg, mirrorAlg, parseAlg } from '../notation'
import { getPattern, PATTERNS } from '../patterns'
import { allPieces, findPiece, homeSlot, isSlotSolved, pieceAt } from '../pieces'
import { BEGINNER_HOLD, STAGE_IDS } from '../stages'
import { centerColors, faceColors, isSolved, SOLVED, type CubeState } from '../state'
import { isSolvable } from '../validate'

describe('pattern library', () => {
  it('has 8 to 12 patterns with unique ids, names and algorithms', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(8)
    expect(PATTERNS.length).toBeLessThanOrEqual(12)
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length)
    expect(new Set(PATTERNS.map((p) => p.name)).size).toBe(PATTERNS.length)
    expect(new Set(PATTERNS.map((p) => stateFromAlg(p.alg))).size).toBe(PATTERNS.length)
    for (const id of ['checkerboard', 'cube-in-a-cube', 'six-spots', 'superflip', 'crosses']) {
      expect(getPattern(id), id).toBeDefined()
    }
    expect(getPattern('nope')).toBeUndefined()
  })

  it.each(PATTERNS.map((p) => [p.id, p] as const))('%s is valid, not solved, and its inverse restores the cube', (_id, p) => {
    expect(p.id).toMatch(/^[a-z-]+$/)
    expect(p.description.length).toBeGreaterThan(20)
    expect(p.description.length).toBeLessThan(200)
    expect(p.moves).toEqual(parseAlg(p.alg))
    expect(algToString(p.moves)).toBe(p.alg) // stored in canonical spelling
    const state = stateFromAlg(p.alg)
    expect(isSolvable(state)).toBe(true)
    expect(isSolved(state)).toBe(false)
    expect(applyAlg(state, invertAlg(p.moves))).toBe(SOLVED)
    expect([1, 2, 3]).toContain(p.difficulty)
  })

  const colourCount = (state: CubeState, face: 'U' | 'R' | 'F' | 'D' | 'L' | 'B') => new Set(faceColors(state, face)).size
  const faces = ['U', 'R', 'F', 'D', 'L', 'B'] as const

  it('the patterns look the way their names say', () => {
    const at = (id: string) => stateFromAlg(getPattern(id)!.alg)

    // Checkerboard: every face alternates between two opposite colours.
    const checker = at('checkerboard')
    for (const f of faces) {
      const c = faceColors(checker, f)
      expect(new Set(c).size).toBe(2)
      for (let i = 0; i < 9; i++) expect(c[i] === c[4]).toBe(i % 2 === 0)
    }

    // Spots: only centres differ from the rest of their face.
    for (const [id, spotted] of [['six-spots', 6], ['four-spots', 4]] as const) {
      const s = at(id)
      let spots = 0
      for (const f of faces) {
        const c = faceColors(s, f)
        const ring = c.filter((_, i) => i !== 4)
        expect(new Set(ring).size).toBe(1)
        if (c[4] !== ring[0]) spots++
      }
      expect(spots).toBe(spotted)
    }

    // Crosses: on every face the centre and four edges share a colour and the corners another.
    for (const id of ['crosses', 'plummers-cross']) {
      const s = at(id)
      for (const f of faces) {
        const c = faceColors(s, f)
        expect([c[1], c[3], c[5], c[7]].every((x) => x === c[4])).toBe(true)
        expect([c[0], c[2], c[6], c[8]].every((x) => x === c[0] && x !== c[4])).toBe(true)
      }
    }

    // Cube in a cube: every face shows a 2x2 block of one colour inside an L of another.
    const cic = at('cube-in-a-cube')
    for (const f of faces) expect(colourCount(cic, f)).toBe(2)
    // ...and one more layer for the triple version.
    const ccc = at('cube-in-a-cube-in-a-cube')
    for (const f of faces) expect(colourCount(ccc, f)).toBe(3)

    // Superflip: every piece home, every edge flipped.
    for (const p of allPieces(at('superflip'))) {
      expect(p.piece).toBe(p.slot)
      expect(p.orientation).toBe(p.kind === 'edge' ? 1 : 0)
    }

    // Stripes: top and bottom solved, the side faces are three vertical stripes.
    const stripes = at('stripes')
    expect(colourCount(stripes, 'U')).toBe(1)
    expect(colourCount(stripes, 'D')).toBe(1)
    for (const f of ['R', 'F', 'L', 'B'] as const) {
      const c = faceColors(stripes, f)
      expect(new Set(c).size).toBe(3)
      for (let col = 0; col < 3; col++) expect(c[col] === c[col + 3] && c[col] === c[col + 6]).toBe(true)
    }

    // Zig-zag: top and bottom solved, each side face has two colours.
    const zz = at('zig-zag')
    expect(colourCount(zz, 'U')).toBe(1)
    expect(colourCount(zz, 'D')).toBe(1)
    for (const f of ['R', 'F', 'L', 'B'] as const) expect(colourCount(zz, f)).toBe(2)

    // Colourful checkerboard: checkerboard layout on each face.
    const cc = at('colourful-checkerboard')
    for (const f of faces) {
      const c = faceColors(cc, f)
      expect(new Set(c).size).toBe(2)
      for (let i = 0; i < 9; i++) expect(c[i] === c[4]).toBe(i % 2 === 0)
    }

    // Anaconda: all six centres stay, each face has exactly two colours.
    const snake = at('anaconda')
    expect(centerColors(snake)).toEqual(centerColors(SOLVED))
    for (const f of faces) expect(colourCount(snake, f)).toBe(2)
  })
})

describe('beginner algorithm library', () => {
  /** A solved cube in the beginner hold: yellow up, white down, green front. */
  const HELD = applyAlg(SOLVED, BEGINNER_HOLD)
  const alg = (id: string) => getAlgorithm(id)!

  /** Slots whose piece is not solved (relative to the centres). */
  const unsolved = (state: CubeState): SlotId[] => SLOTS.filter((s) => !isSlotSolved(state, s))
  const bottomLayer = SLOTS.filter((s) => s.includes('D'))
  const middleLayer: SlotId[] = ['FR', 'FL', 'BL', 'BR']
  const firstTwoLayers = [...bottomLayer, ...middleLayer]
  const keeps = (state: CubeState, slots: readonly SlotId[]) => slots.every((s) => isSlotSolved(state, s))

  it('the beginner hold has yellow on top, white underneath and green in front', () => {
    expect(centerColors(HELD)).toMatchObject({ U: 'yellow', D: 'white', F: 'green' })
  })

  it('every entry is complete and well-formed', () => {
    expect(new Set(ALGORITHMS.map((a) => a.id)).size).toBe(ALGORITHMS.length)
    for (const a of ALGORITHMS) {
      expect(a.id).toMatch(/^[a-z-]+$/)
      expect(STAGE_IDS).toContain(a.stage)
      expect(a.moves).toEqual(parseAlg(a.alg))
      expect(algToString(a.moves)).toBe(a.alg)
      expect(a.name.length).toBeGreaterThan(2)
      for (const text of [a.when, a.does, a.mnemonic, a.fingerHint]) expect(text.length).toBeGreaterThan(8)
      // "one sentence": short enough for a card.
      expect(a.does.length).toBeLessThan(260)
      // The demo starts from a legal position and ends solved.
      const start = applyAlg(HELD, a.demo.setup)
      expect(isSolvable(start)).toBe(true)
      expect(isSolved(start)).toBe(false)
      expect(applyAlg(start, a.demo.alg)).toBe(HELD)
    }
  })

  it('contains every algorithm the lessons need', () => {
    const required: Record<string, string> = {
      'right-trigger': "R U R' U'",
      'left-trigger': "L' U' L U",
      'white-corner-insert': "R U R' U'",
      'middle-right': "U R U' R' U' F' U F",
      'middle-left': "U' L' U L U F U' F'",
      'yellow-cross': "F R U R' U' F'",
      sune: "R U R' U R U2 R'",
      'corner-cycle': "U R U' L' U R' U' L",
      'corner-twist': "R' D' R D",
    }
    for (const [id, moves] of Object.entries(required)) expect(alg(id)?.alg, id).toBe(moves)
    expect(getAlgorithm('nope')).toBeUndefined()
  })

  it('covers the stages from white cross to the last corner', () => {
    for (const stage of STAGE_IDS.filter((s) => s !== 'daisy')) {
      expect(algorithmsForStage(stage).length, stage).toBeGreaterThan(0)
    }
    expect(algorithmsForStage('middle-layer').map((a) => a.id)).toEqual(['middle-right', 'middle-left'])
  })

  it('petal drop: sends the top-front edge to the bottom-front, sticker that faced up now faces down', () => {
    const s = applyAlg(HELD, alg('white-cross-drop').alg)
    const start = pieceAt(HELD, 'UF')
    const moved = findPiece(s, start.piece)
    expect(moved.slot).toBe('DF')
    expect(moved.facing.yellow).toBe('D')
    expect(moved.facing.green).toBe('F')
  })

  it('triggers: order 6, mirror images of each other, and touch only one bottom corner', () => {
    const right = alg('right-trigger')
    const left = alg('left-trigger')
    expect(algOrder(right.alg)).toBe(6)
    expect(algOrder(left.alg)).toBe(6)
    expect(mirrorAlg(right.moves)).toEqual(left.moves)
    const r = applyAlg(HELD, right.alg)
    expect(bottomLayer.filter((s) => !isSlotSolved(r, s))).toEqual(['DFR'])
    expect(pieceAt(r, 'URF').piece).toBe(pieceAt(HELD, 'DFR').piece)
    expect(pieceAt(r, 'DFR').piece).toBe(pieceAt(HELD, 'URF').piece)
    const l = applyAlg(HELD, left.alg)
    expect(bottomLayer.filter((s) => !isSlotSolved(l, s))).toEqual(['DLF'])
    expect(pieceAt(l, 'UFL').piece).toBe(pieceAt(HELD, 'DLF').piece)
  })

  it('white corner insert: from every twist above or in the slot, repeating 1–5 times solves it', () => {
    const insert = alg('white-corner-insert')
    const corner = pieceAt(HELD, 'DFR').piece
    const seenCases = new Set<string>()
    for (let k = 1; k <= 5; k++) {
      // Undo the trigger k times from solved: the corner is above its slot or twisted in it.
      let state = applyAlg(HELD, invertAlg(parseAlg(`(${insert.alg})${k}`)))
      const where = findPiece(state, corner)
      seenCases.add(`${where.slot}:${where.facing.white}`)
      expect(['URF', 'DFR']).toContain(where.slot)
      let rounds = 0
      while (!isSlotSolved(state, 'DFR')) {
        state = applyAlg(state, insert.moves)
        rounds++
        expect(rounds).toBeLessThanOrEqual(5)
      }
      expect(rounds).toBe(k)
      // The white cross and the other three white corners were never lost.
      expect(keeps(state, bottomLayer)).toBe(true)
    }
    // All three twists above the slot and both wrong twists inside it are covered.
    expect([...seenCases].sort()).toEqual(['DFR:F', 'DFR:R', 'URF:F', 'URF:R', 'URF:U'])
  })

  it.each([
    ['white-corner-right', 'R'],
    ['white-corner-front', 'F'],
    ['white-corner-top', 'U'],
  ] as const)('%s: inserts the corner above the slot whose white sticker faces %s', (id, face) => {
    const a = alg(id)
    const corner = pieceAt(HELD, 'DFR').piece
    const start = applyAlg(HELD, invertAlg(a.moves))
    const where = findPiece(start, corner)
    expect(where.slot).toBe('URF')
    expect(where.facing.white).toBe(face)
    // Before: the rest of the bottom layer is intact. After: the whole bottom layer is.
    expect(bottomLayer.filter((s) => !isSlotSolved(start, s))).toEqual(['DFR'])
    expect(keeps(applyAlg(start, a.moves), bottomLayer)).toBe(true)
  })

  it.each([
    ['middle-right', 'FR'],
    ['middle-left', 'FL'],
  ] as const)('%s: takes the top-front edge into %s and keeps the white layer', (id, slot) => {
    const a = alg(id)
    const edge = pieceAt(HELD, slot).piece
    const start = applyAlg(HELD, invertAlg(a.moves))
    const where = findPiece(start, edge)
    // The edge waits at the top-front with its front sticker matching the front centre.
    expect(where.slot).toBe('UF')
    expect(where.facing.green).toBe('F')
    expect(keeps(start, bottomLayer)).toBe(true)
    expect(middleLayer.filter((s) => !isSlotSolved(start, s))).toEqual([slot])
    const end = applyAlg(start, a.moves)
    expect(keeps(end, firstTwoLayers)).toBe(true)
    // And on any cube it leaves the white layer and the other three middle edges alone.
    const after = applyAlg(HELD, a.moves)
    expect(keeps(after, bottomLayer)).toBe(true)
    expect(middleLayer.filter((s) => !isSlotSolved(after, s))).toEqual([slot])
  })

  it('the two middle-layer algorithms are mirror images', () => {
    expect(mirrorAlg(alg('middle-right').moves)).toEqual(alg('middle-left').moves)
  })

  const topEdges = ['UR', 'UF', 'UL', 'UB'] as const
  const topCorners = ['URF', 'UFL', 'ULB', 'UBR'] as const
  const yellowUpEdges = (state: CubeState) => topEdges.filter((s) => pieceAt(state, s).facing.yellow === 'U')

  it('yellow cross: keeps the first two layers and walks dot -> L -> line -> cross', () => {
    const a = alg('yellow-cross')
    expect(keeps(applyAlg(HELD, a.moves), firstTwoLayers)).toBe(true)
    // Line (left to right) -> cross in one go.
    const line = applyAlg(HELD, invertAlg(a.moves))
    expect(yellowUpEdges(line)).toEqual(['UR', 'UL'])
    expect(yellowUpEdges(applyAlg(line, a.moves))).toHaveLength(4)
    // L held in the back-left -> line.
    const fromL = applyAlg(line, invertAlg(a.moves))
    expect([...yellowUpEdges(fromL)].sort()).toEqual(['UB', 'UL'])
    // Dot -> three applications (re-aiming the top in between) -> cross.
    const dot = applyAlg(applyAlg(fromL, 'U2'), invertAlg(a.moves))
    expect(yellowUpEdges(dot)).toEqual([])
    const end = applyAlg(dot, [...a.moves, ...parseAlg('U2'), ...a.moves, ...a.moves])
    expect(yellowUpEdges(end)).toHaveLength(4)
    expect(keeps(end, firstTwoLayers)).toBe(true)
  })

  it('sune: keeps the first two layers and the yellow cross, cycles three top edges, front edge stays', () => {
    const s = applyAlg(HELD, alg('sune').alg)
    expect(keeps(s, firstTwoLayers)).toBe(true)
    expect(yellowUpEdges(s)).toHaveLength(4)
    expect(pieceAt(s, 'UF').piece).toBe(pieceAt(HELD, 'UF').piece)
    for (const e of ['UR', 'UL', 'UB'] as const) expect(pieceAt(s, e).piece).not.toBe(pieceAt(HELD, e).piece)
    // Three rounds bring the edges back.
    const three = applyAlg(HELD, `(${alg('sune').alg})3`)
    for (const e of topEdges) expect(pieceAt(three, e).piece).toBe(pieceAt(HELD, e).piece)
  })

  it('edge swap: swaps the front and left top edges, keeps the back and right ones', () => {
    const s = applyAlg(HELD, alg('yellow-edge-swap').alg)
    expect(keeps(s, firstTwoLayers)).toBe(true)
    expect(yellowUpEdges(s)).toHaveLength(4)
    expect(pieceAt(s, 'UF').piece).toBe(pieceAt(HELD, 'UL').piece)
    expect(pieceAt(s, 'UL').piece).toBe(pieceAt(HELD, 'UF').piece)
    expect(pieceAt(s, 'UR').piece).toBe(pieceAt(HELD, 'UR').piece)
    expect(pieceAt(s, 'UB').piece).toBe(pieceAt(HELD, 'UB').piece)
  })

  it('corner cycle: three top corners move round, front-right corner and all edges untouched', () => {
    const a = alg('corner-cycle')
    const s = applyAlg(HELD, a.alg)
    expect(algOrder(a.alg)).toBe(3)
    expect(unsolved(s).sort()).toEqual(['UBR', 'UFL', 'ULB'])
    for (const e of EDGES) expect(isSlotSolved(s, e)).toBe(true)
    expect(isSlotSolved(s, 'URF')).toBe(true)
    for (const c of ['UFL', 'ULB', 'UBR'] as const) expect(pieceAt(s, c).piece).not.toBe(pieceAt(HELD, c).piece)
    // Each corner is still a top-layer corner: its home is on the top face.
    for (const c of topCorners) expect(homeSlot(s, pieceAt(s, c).piece)).toContain('U')
  })

  it('corner twist: order 6; twice twists the corner one way, four times the other', () => {
    const a = alg('corner-twist')
    expect(algOrder(a.alg)).toBe(6)
    const corner = pieceAt(HELD, 'URF').piece
    const twice = applyAlg(HELD, `(${a.alg})2`)
    const four = applyAlg(HELD, `(${a.alg})4`)
    expect(findPiece(twice, corner).slot).toBe('URF')
    expect(findPiece(four, corner).slot).toBe('URF')
    const facings = [findPiece(twice, corner).facing.yellow, findPiece(four, corner).facing.yellow]
    expect(facings.sort()).toEqual(['F', 'R'])
    // The rest of the top layer is never touched by the twist itself.
    for (const s of [twice, four]) {
      expect(SLOTS.filter((x) => x.includes('U') && x !== 'URF' && !isSlotSolved(s, x))).toEqual([])
    }
    // The bottom layers look scrambled in between ...
    expect(keeps(twice, firstTwoLayers)).toBe(false)
  })

  it('corner twist: the lower layers repair themselves once all corners are twisted', () => {
    const a = alg('corner-twist')
    // Two twisted corners next to each other.
    const full = parseAlg(`(${a.alg})2 U (${a.alg})4 U'`)
    const s = applyAlg(HELD, full)
    expect(unsolved(s).sort()).toEqual(['UBR', 'URF'])
    expect(pieceAt(s, 'URF').piece).toBe(pieceAt(HELD, 'URF').piece)
    expect(pieceAt(s, 'UBR').piece).toBe(pieceAt(HELD, 'UBR').piece)
    // Solving that case: the inverse situation is fixed by the same recipe.
    const twisted = applyAlg(HELD, invertAlg(full))
    expect(applyAlg(twisted, full)).toBe(HELD)
    // Three corners twisted the same way: 2 + 2 + 2 rounds with U turns in between.
    const three = parseAlg(`(${a.alg})2 U (${a.alg})2 U (${a.alg})2 U2`)
    const t = applyAlg(HELD, three)
    expect(unsolved(t)).toHaveLength(3)
    expect(unsolved(t).every((x) => x.length === 3 && x.includes('U'))).toBe(true)
  })
})
