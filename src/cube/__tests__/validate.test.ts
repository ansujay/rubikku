import { describe, expect, it } from 'vitest'
import { FACELETS, SLOT_FACELETS, type Color, type SlotId } from '../geometry'
import { applyAlg, CUBE_ROTATIONS, stateFromAlg } from '../moves'
import { FACE_MOVES } from '../notation'
import { fromCubieArrays, toCubieArrays } from '../pieces'
import { randomState } from '../scramble'
import { SOLVED, toColors, type CubeState } from '../state'
import { describeSlot, isSolvable, validateCube, type CubeProblem, type CubeProblemCode } from '../validate'
import { randomMoves, seededRng } from './helpers'

type Painted = (Color | null)[]

const paint = (state: CubeState): Painted => toColors(state)
const codes = (problems: CubeProblem[]): CubeProblemCode[] => problems.map((p) => p.code)

function problemsOf(input: Painted | string): CubeProblem[] {
  const result = validateCube(input)
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('expected problems')
  for (const p of result.problems) {
    expect(p.message.length).toBeGreaterThan(15)
    expect(p.message).not.toMatch(/undefined|null|\[object/)
    for (const f of p.facelets) {
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(54)
    }
  }
  return result.problems
}

function only<C extends CubeProblemCode>(problems: CubeProblem[], code: C): Extract<CubeProblem, { code: C }> {
  const found = problems.filter((p) => p.code === code)
  expect(found, `expected exactly one ${code} in ${codes(problems).join(', ')}`).toHaveLength(1)
  return found[0] as Extract<CubeProblem, { code: C }>
}

/** A solvable cube with its cubie arrays tampered with. */
function tamper(base: CubeState, change: (a: ReturnType<typeof toCubieArrays>) => void): CubeState {
  const arrays = toCubieArrays(base)
  change(arrays)
  return fromCubieArrays(arrays)
}

describe('validateCube — valid cubes', () => {
  it('accepts the solved cube', () => {
    const r = validateCube(paint(SOLVED))
    expect(r).toEqual({ ok: true, state: SOLVED, upright: SOLVED, rotation: [], problems: [] })
  })

  it('accepts a facelet string as well as colours', () => {
    const s = stateFromAlg("R U R' U' F2 D")
    expect(validateCube(s)).toMatchObject({ ok: true, state: s })
    expect(validateCube(paint(s))).toMatchObject({ ok: true, state: s })
  })

  it('accepts 500 random states and 200 random scrambles', () => {
    const rng = seededRng(31)
    for (let i = 0; i < 500; i++) expect(validateCube(randomState(rng)).ok).toBe(true)
    for (let i = 0; i < 200; i++) expect(validateCube(applyAlg(SOLVED, randomMoves(rng, 30))).ok).toBe(true)
  })

  it('accepts a cube entered in any of the 24 orientations and reports how to turn it upright', () => {
    const scrambled = stateFromAlg("R U2 F' L D B2 R' U F2 L2 D'")
    for (const rot of CUBE_ROTATIONS) {
      const held = applyAlg(scrambled, rot)
      const r = validateCube(paint(held))
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect(r.state).toBe(held)
      expect(r.upright).toBe(scrambled)
      expect(applyAlg(held, r.rotation)).toBe(scrambled)
    }
  })

  it('requires exactly 54 stickers', () => {
    expect(() => validateCube(paint(SOLVED).slice(0, 53))).toThrow()
    expect(() => validateCube('UUU')).toThrow()
  })
})

describe('validateCube — painting mistakes', () => {
  it('reports unpainted stickers without complaining about low counts', () => {
    const p = paint(SOLVED)
    p[0] = null
    p[20] = null
    p[53] = null
    const problems = problemsOf(p)
    expect(codes(problems)).toEqual(['unpainted'])
    expect(only(problems, 'unpainted').facelets).toEqual([0, 20, 53])
    expect(only(problems, 'unpainted').message).toBe('3 stickers still need a colour.')
    p[20] = 'green'
    p[53] = 'blue'
    expect(only(problemsOf(p), 'unpainted').message).toBe('One sticker still needs a colour.')
  })

  it('treats unknown characters in a string as unpainted', () => {
    const s = '?' + SOLVED.slice(1)
    expect(only(problemsOf(s), 'unpainted').facelets).toEqual([0])
    expect(codes(problemsOf(' '.repeat(54)))).toEqual(['unpainted'])
  })

  it('still reports a colour used too often while stickers are blank', () => {
    const p = paint(SOLVED)
    p[0] = null
    p[1] = 'red'
    const problems = problemsOf(p)
    expect(codes(problems)).toContain('unpainted')
    const count = only(problems, 'wrong-count')
    expect(count).toMatchObject({ color: 'red', count: 10, expected: 9 })
  })

  it('reports which colours have the wrong number of stickers, and how many', () => {
    const p = paint(SOLVED)
    p[1] = 'red' // the white sticker of the top-back edge becomes red
    const problems = problemsOf(p)
    const counts = problems.filter((x) => x.code === 'wrong-count')
    expect(counts).toHaveLength(2)
    const white = counts.find((c) => c.code === 'wrong-count' && c.color === 'white')!
    const red = counts.find((c) => c.code === 'wrong-count' && c.color === 'red')!
    expect(white).toMatchObject({ count: 8, expected: 9 })
    expect(red).toMatchObject({ count: 10, expected: 9 })
    expect(red.facelets).toHaveLength(10)
    expect(red.facelets).toContain(1)
    expect(white.facelets).not.toContain(1)
    expect(red.message).toContain('10 red')
    expect(white.message).toContain('only 8 white')
  })

  it('reports wildly wrong counts for every colour involved', () => {
    const p: Painted = new Array(54).fill('white')
    const problems = problemsOf(p)
    const counts = problems.filter((x) => x.code === 'wrong-count')
    expect(counts).toHaveLength(6)
    expect(codes(problems)).toContain('duplicate-centers')
    expect(codes(problems)).not.toContain('impossible-piece') // not checked until the centres make sense
  })

  it('reports centres that are not all different', () => {
    const p = paint(SOLVED)
    p[4] = 'red'
    const problems = problemsOf(p)
    const dup = only(problems, 'duplicate-centers')
    expect(dup.color).toBe('red')
    expect(dup.faces).toEqual(['U', 'R'])
    expect(dup.facelets).toEqual([4, 13])
    expect(dup.message).toContain('top and right')
    expect(codes(problems)).toContain('wrong-count')
  })

  it('reports centres in an impossible arrangement (white not opposite yellow)', () => {
    const p = paint(SOLVED)
    ;[p[4], p[22]] = [p[22], p[4]] // swap the top and front centres
    const problems = problemsOf(p)
    expect(codes(problems)).toEqual(['impossible-centers'])
    const c = only(problems, 'impossible-centers')
    expect(c.facelets.sort((a, b) => a - b)).toEqual([4, 22, 31, 49])
    expect(c.message).toContain('opposite')
  })

  it('reports centres that are a mirror image of a real cube', () => {
    const p = paint(SOLVED)
    ;[p[13], p[40]] = [p[40], p[13]] // swap the right and left centres
    const problems = problemsOf(p)
    expect(codes(problems)).toEqual(['impossible-centers'])
    expect(only(problems, 'impossible-centers').message).toContain('mirror')
  })

  it('reports an edge with two opposite colours and an edge with the same colour twice', () => {
    const p = paint(SOLVED)
    const ufFront = SLOT_FACELETS.UF[1]
    const dfDown = SLOT_FACELETS.DF[0]
    ;[p[ufFront], p[dfDown]] = [p[dfDown], p[ufFront]]
    const problems = problemsOf(p)
    expect(codes(problems)).toEqual(['impossible-piece', 'impossible-piece'])
    const [a, b] = problems as Extract<CubeProblem, { code: 'impossible-piece' }>[]
    expect(a).toMatchObject({ kind: 'edge', slot: 'UF', reason: 'opposite-colors', colors: ['white', 'yellow'] })
    expect(a.facelets).toEqual([...SLOT_FACELETS.UF])
    expect(a.message).toContain('white and yellow')
    expect(a.message).toContain('top-front edge')
    expect(b).toMatchObject({ kind: 'edge', slot: 'DF', reason: 'same-color', colors: ['green', 'green'] })
    expect(b.message).toContain('green on it twice')
  })

  it('reports a corner with impossible colours', () => {
    const p = paint(SOLVED)
    const a = SLOT_FACELETS.URF[2] // green sticker of the white-red-green corner
    const b = SLOT_FACELETS.DBL[0] // yellow sticker of the yellow-blue-orange corner
    ;[p[a], p[b]] = [p[b], p[a]]
    const problems = problemsOf(p)
    expect(codes(problems)).toEqual(['impossible-piece', 'impossible-piece'])
    expect(problems[0]).toMatchObject({ kind: 'corner', slot: 'URF', reason: 'opposite-colors' })
    expect(problems[1]).toMatchObject({ kind: 'corner', slot: 'DBL', reason: 'opposite-colors' })
  })

  it('reports a corner whose colours go round the wrong way', () => {
    const p = paint(SOLVED)
    const [, r, f] = SLOT_FACELETS.URF
    ;[p[r], p[f]] = [p[f], p[r]]
    const problems = problemsOf(p)
    expect(codes(problems)).toEqual(['impossible-piece'])
    expect(problems[0]).toMatchObject({
      kind: 'corner',
      slot: 'URF',
      reason: 'mirrored',
      colors: ['white', 'green', 'red'],
      facelets: [...SLOT_FACELETS.URF],
    })
  })

  it('reports duplicated pieces with both locations', () => {
    const p = paint(SOLVED)
    p[SLOT_FACELETS.UF[1]] = 'red' // top-front edge is now white-red, like the top-right edge
    p[SLOT_FACELETS.DR[1]] = 'green' // bottom-right edge is now yellow-green, like the bottom-front edge
    const problems = problemsOf(p)
    expect(codes(problems)).toEqual(['duplicate-piece', 'duplicate-piece'])
    const [a, b] = problems as Extract<CubeProblem, { code: 'duplicate-piece' }>[]
    expect(a).toMatchObject({ kind: 'edge', piece: 'UR', colors: ['white', 'red'] })
    expect([...a.slots].sort()).toEqual(['UF', 'UR'])
    expect([...a.facelets].sort((x, y) => x - y)).toEqual([...SLOT_FACELETS.UF, ...SLOT_FACELETS.UR].sort((x, y) => x - y))
    expect(a.message).toContain('white and red edge appears twice')
    expect(b).toMatchObject({ kind: 'edge', piece: 'DF' })
    expect([...b.slots].sort()).toEqual(['DF', 'DR'])
  })

  it('reports a duplicated corner', () => {
    const p = paint(SOLVED)
    // Paint the top-back-right corner (read U, B, R) white, red, green: a second URF corner.
    const [u, b, r] = SLOT_FACELETS.UBR
    p[u] = 'white'
    p[b] = 'red'
    p[r] = 'green'
    // Keep the sticker counts right: the front-left edge becomes blue-orange, a second BL edge.
    p[SLOT_FACELETS.FL[0]] = 'blue'
    const problems = problemsOf(p)
    expect(codes(problems)).toEqual(['duplicate-piece', 'duplicate-piece'])
    const [corner, edge] = problems as Extract<CubeProblem, { code: 'duplicate-piece' }>[]
    expect(corner).toMatchObject({ kind: 'corner', piece: 'URF', colors: ['white', 'red', 'green'] })
    expect([...corner.slots].sort()).toEqual(['UBR', 'URF'])
    expect(corner.facelets).toHaveLength(6)
    expect(corner.message).toContain('white, red and green corner appears twice')
    expect(edge).toMatchObject({ kind: 'edge', piece: 'BL' })
    expect([...edge.slots].sort()).toEqual(['BL', 'FL'])
  })

  it('skips pieces that are not fully painted', () => {
    const p = paint(SOLVED)
    p[SLOT_FACELETS.UF[0]] = null
    expect(codes(problemsOf(p))).toEqual(['unpainted'])
  })
})

describe('validateCube — assembled but unsolvable cubes', () => {
  it('reports a single twisted corner, its direction and where it is', () => {
    const cw = tamper(SOLVED, (a) => (a.co[0] = 1))
    let t = only(problemsOf(cw), 'twisted-corner')
    expect(t).toMatchObject({ twist: 'clockwise', slots: ['URF'] })
    expect(t.facelets).toEqual([...SLOT_FACELETS.URF])
    expect(t.message).toContain('top-right-front corner')
    expect(t.message).toContain('counter-clockwise to fix')
    expect(codes(problemsOf(cw))).toEqual(['twisted-corner'])

    const ccw = tamper(SOLVED, (a) => (a.co[5] = 2))
    t = only(problemsOf(ccw), 'twisted-corner')
    expect(t).toMatchObject({ twist: 'counter-clockwise', slots: ['DLF'] })
  })

  it('a clockwise twist really is clockwise: the top sticker moves to the next face round', () => {
    const cw = tamper(SOLVED, (a) => (a.co[0] = 1))
    // URF letters go clockwise U -> R -> F, so the white sticker is now on R.
    expect(cw[SLOT_FACELETS.URF[1]]).toBe('U')
  })

  it('detects a twisted corner on a scrambled cube (location unknown)', () => {
    const rng = seededRng(41)
    for (let i = 0; i < 50; i++) {
      const base = randomState(rng)
      const twisted = tamper(base, (a) => (a.co[3] = (a.co[3] + 1 + (i % 2)) % 3))
      const problems = problemsOf(twisted)
      expect(codes(problems)).toEqual(['twisted-corner'])
      const t = only(problems, 'twisted-corner')
      expect(t.twist).toBe(i % 2 === 0 ? 'clockwise' : 'counter-clockwise')
      // Undoing the twist as advised makes the cube valid again.
      expect(isSolvable(base)).toBe(true)
    }
  })

  it('reports a single flipped edge and where it is', () => {
    const flipped = tamper(SOLVED, (a) => (a.eo[1] = 1))
    const problems = problemsOf(flipped)
    expect(codes(problems)).toEqual(['flipped-edge'])
    const f = only(problems, 'flipped-edge')
    expect(f.slots).toEqual(['UF'])
    expect(f.facelets).toEqual([...SLOT_FACELETS.UF])
    expect(f.message).toContain('top-front edge')
  })

  it('detects a flipped edge on a scrambled cube', () => {
    const rng = seededRng(42)
    for (let i = 0; i < 50; i++) {
      const flipped = tamper(randomState(rng), (a) => (a.eo[i % 12] ^= 1))
      expect(codes(problemsOf(flipped))).toEqual(['flipped-edge'])
    }
  })

  it('reports two swapped edges and where they are', () => {
    const swapped = tamper(SOLVED, (a) => ([a.ep[0], a.ep[1]] = [a.ep[1], a.ep[0]]))
    const problems = problemsOf(swapped)
    expect(codes(problems)).toEqual(['swapped-pieces'])
    const s = only(problems, 'swapped-pieces')
    expect(s.slots).toEqual(['UR', 'UF'])
    expect(s.facelets).toHaveLength(4)
    expect(s.message).toContain('top-right edge')
    expect(s.message).toContain('top-front edge')
  })

  it('reports two swapped corners and where they are', () => {
    const swapped = tamper(SOLVED, (a) => ([a.cp[4], a.cp[7]] = [a.cp[7], a.cp[4]]))
    const s = only(problemsOf(swapped), 'swapped-pieces')
    expect(s.slots).toEqual(['DFR', 'DRB'])
    expect(s.facelets).toHaveLength(6)
  })

  it('detects a swapped pair on a scrambled cube (location unknown)', () => {
    const rng = seededRng(43)
    for (let i = 0; i < 50; i++) {
      const swapped = tamper(randomState(rng), (a) => {
        if (i % 2) [a.ep[2], a.ep[9]] = [a.ep[9], a.ep[2]]
        else [a.cp[1], a.cp[6]] = [a.cp[6], a.cp[1]]
      })
      const problems = problemsOf(swapped)
      expect(codes(problems)).toEqual(['swapped-pieces'])
    }
  })

  it('reports several problems at once', () => {
    const bad = tamper(SOLVED, (a) => {
      a.co[2] = 2
      a.eo[7] = 1
      ;[a.ep[8], a.ep[9]] = [a.ep[9], a.ep[8]]
    })
    const problems = problemsOf(bad)
    expect(codes(problems)).toEqual(['twisted-corner', 'flipped-edge', 'swapped-pieces'])
    expect(only(problems, 'twisted-corner').slots).toEqual(['ULB'])
    expect(only(problems, 'flipped-edge').slots).toEqual(['DB'])
    expect(only(problems, 'swapped-pieces').slots).toEqual(['FR', 'FL'])
  })

  it('reports locations on the cube as painted, even when it is held another way', () => {
    const twisted = tamper(SOLVED, (a) => (a.co[0] = 1))
    for (const rot of CUBE_ROTATIONS) {
      const held = applyAlg(twisted, rot)
      const t = only(problemsOf(held), 'twisted-corner')
      expect(t.slots).toHaveLength(1)
      const slot = t.slots[0] as SlotId
      // The reported slot is where the white-red-green corner sits on the cube as held ...
      const letters = SLOT_FACELETS[slot].map((f) => held[f]).sort().join('')
      expect(letters).toBe('FRU')
      // ... and the facelets are that slot's facelets.
      expect([...t.facelets].sort((a, b) => a - b)).toEqual([...SLOT_FACELETS[slot]].sort((a, b) => a - b))
      for (const f of t.facelets) expect(FACELETS[f].slot).toBe(slot)
      expect(t.twist).toBe('clockwise')
    }
    // y brings the right side to the front, so the top-right-front corner goes to top-front-left.
    expect(only(problemsOf(applyAlg(twisted, 'y')), 'twisted-corner').slots).toEqual(['UFL'])
  })

  it('any single sticker swap between two different-coloured stickers is caught', () => {
    const rng = seededRng(44)
    for (let i = 0; i < 300; i++) {
      const base = applyAlg(SOLVED, randomMoves(rng, 25, FACE_MOVES))
      const p = paint(base)
      const a = Math.floor(rng() * 54)
      const b = Math.floor(rng() * 54)
      if (p[a] === p[b]) continue
      ;[p[a], p[b]] = [p[b], p[a]]
      expect(validateCube(p).ok, `swap ${a} ${b}`).toBe(false)
    }
  })
})

describe('isSolvable and describeSlot', () => {
  it('isSolvable', () => {
    expect(isSolvable(SOLVED)).toBe(true)
    expect(isSolvable(stateFromAlg('R U x M'))).toBe(true)
    expect(isSolvable(tamper(SOLVED, (a) => (a.eo[0] = 1)))).toBe(false)
    expect(isSolvable('junk' as CubeState)).toBe(false)
  })

  it('describeSlot', () => {
    expect(describeSlot('UF')).toBe('top-front edge')
    expect(describeSlot('DRB')).toBe('bottom-right-back corner')
    expect(describeSlot('L')).toBe('left centre')
  })
})
