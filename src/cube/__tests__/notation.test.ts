import { describe, expect, it } from 'vitest'
import { FACELETS, faceletAtPosition } from '../geometry'
import { applyAlg, stateFromAlg } from '../moves'
import {
  AlgParseError,
  ALL_MOVES,
  algToString,
  countMoves,
  describeMove,
  invertAlg,
  invertMove,
  isMove,
  isRotation,
  makeMove,
  mirrorAlg,
  moveAmount,
  moveBase,
  moveKind,
  parseAlg,
  simplifyAlg,
  tryParseAlg,
  type Move,
} from '../notation'
import { SOLVED, type CubeState } from '../state'
import { randomMoves, seededRng } from './helpers'

describe('parseAlg', () => {
  it('parses plain notation', () => {
    expect(parseAlg("R U R' U'")).toEqual(['R', 'U', "R'", "U'"])
    expect(parseAlg('F2 M E\' S2 x y\' z2 r u\' f2')).toEqual(['F2', 'M', "E'", 'S2', 'x', "y'", 'z2', 'r', "u'", 'f2'])
    expect(parseAlg('')).toEqual([])
    expect(parseAlg('   ')).toEqual([])
  })

  it('tolerates whitespace, parentheses, commas and typographic primes', () => {
    expect(parseAlg("  (R U R' U')\n\t(R'   F R2) ")).toEqual(['R', 'U', "R'", "U'", "R'", 'F', 'R2'])
    expect(parseAlg('R’ U′ F` L‘ D´')).toEqual(["R'", "U'", "F'", "L'", "D'"])
    expect(parseAlg('R, U, F2')).toEqual(['R', 'U', 'F2'])
    expect(parseAlg("(R U)(R' U')")).toEqual(['R', 'U', "R'", "U'"])
  })

  it('accepts both spellings of wide moves', () => {
    expect(parseAlg("Rw Uw' Fw2 Lw Dw Bw")).toEqual(['r', "u'", 'f2', 'l', 'd', 'b'])
    expect(parseAlg("r u' f2")).toEqual(['r', "u'", 'f2'])
    expect(stateFromAlg('Rw')).toBe(stateFromAlg('r'))
  })

  it('normalises unusual suffixes', () => {
    expect(parseAlg("R2' U3 F3' L'2")).toEqual(['R2', "U'", 'F', 'L2'])
  })

  it('expands repeated and inverted groups', () => {
    expect(parseAlg("(R U R' U')3")).toHaveLength(12)
    expect(parseAlg("(R U)*2 F")).toEqual(['R', 'U', 'R', 'U', 'F'])
    expect(parseAlg("(R U)'")).toEqual(["U'", "R'"])
    expect(parseAlg("((R U)2 F)2")).toEqual(['R', 'U', 'R', 'U', 'F', 'R', 'U', 'R', 'U', 'F'])
    expect(parseAlg('(R U)0')).toEqual([])
    expect(applyAlg(SOLVED, "(R U R' U')6")).toBe(SOLVED)
  })

  it('rejects rubbish with a helpful error', () => {
    for (const bad of ['Q', 'R U X', 'RU', "R''", '(R U', 'R U)', 'R4', 'x6', 'hello', '2R', "R'w", 'Mw', '(R U)999']) {
      expect(() => parseAlg(bad), bad).toThrow(AlgParseError)
      expect(tryParseAlg(bad), bad).toBeNull()
    }
    try {
      parseAlg('R U Q F')
    } catch (e) {
      expect((e as AlgParseError).position).toBe(4)
    }
    expect(tryParseAlg("R U'")).toEqual(['R', "U'"])
  })

  it('round-trips every move through text', () => {
    for (const m of ALL_MOVES) {
      expect(parseAlg(m)).toEqual([m])
      expect(isMove(m)).toBe(true)
    }
    const rng = seededRng(3)
    const alg = randomMoves(rng, 200)
    expect(parseAlg(algToString(alg))).toEqual(alg)
    expect(algToString("R  U'")).toBe("R U'")
    expect(isMove('R3')).toBe(false)
    expect(isMove('Rw')).toBe(false)
    expect(isMove(7)).toBe(false)
  })
})

describe('move helpers', () => {
  it('splits and builds moves', () => {
    expect(moveBase("R'")).toBe('R')
    expect(moveAmount('R')).toBe(1)
    expect(moveAmount('R2')).toBe(2)
    expect(moveAmount("R'")).toBe(3)
    expect(makeMove('R', 1)).toBe('R')
    expect(makeMove('R', -1)).toBe("R'")
    expect(makeMove('R', 6)).toBe('R2')
    expect(makeMove('R', 4)).toBeNull()
    expect(moveKind('R')).toBe('face')
    expect(moveKind("M'")).toBe('slice')
    expect(moveKind('r2')).toBe('wide')
    expect(moveKind('x')).toBe('rotation')
    expect(isRotation('y2')).toBe(true)
    expect(isRotation('U')).toBe(false)
    expect(countMoves("x R U y R' z2")).toBe(3)
  })

  it('inverts', () => {
    expect(invertMove('R')).toBe("R'")
    expect(invertMove("R'")).toBe('R')
    expect(invertMove('R2')).toBe('R2')
    expect(invertAlg("R U R' U'")).toEqual(['U', 'R', "U'", "R'"])
    expect(invertAlg('F R U2')).toEqual(['U2', "R'", "F'"])
    const rng = seededRng(4)
    for (let i = 0; i < 100; i++) {
      const alg = randomMoves(rng, 30)
      expect(applyAlg(applyAlg(SOLVED, alg), invertAlg(alg))).toBe(SOLVED)
      expect(invertAlg(invertAlg(alg))).toEqual(alg)
    }
  })
})

describe('simplifyAlg', () => {
  it('merges and cancels', () => {
    expect(simplifyAlg('R R')).toEqual(['R2'])
    expect(simplifyAlg("R R'")).toEqual([])
    expect(simplifyAlg('R R R')).toEqual(["R'"])
    expect(simplifyAlg('R2 R2')).toEqual([])
    expect(simplifyAlg("R2 R'")).toEqual(['R'])
    expect(simplifyAlg("R U U' R'")).toEqual([])
    expect(simplifyAlg("F R U U' R' F")).toEqual(['F2'])
    expect(simplifyAlg("R U R' U'")).toEqual(['R', 'U', "R'", "U'"])
    expect(simplifyAlg('')).toEqual([])
  })

  it('sees through moves on the same axis', () => {
    expect(simplifyAlg("R L R'")).toEqual(['L'])
    expect(simplifyAlg('U D U')).toEqual(['U2', 'D'])
    expect(simplifyAlg("R M R'")).toEqual(['M'])
    expect(simplifyAlg("R U R'")).toEqual(['R', 'U', "R'"])
    expect(simplifyAlg("R L U L' R'")).toEqual(['R', 'L', 'U', "L'", "R'"])
  })

  it('never changes what the algorithm does and never gets longer', () => {
    const rng = seededRng(6)
    const pool: Move[] = ['R', "R'", 'R2', 'L', "L'", 'U', "U'", 'D2', 'M', "M'", 'x', "x'", 'r', 'F', "F'"]
    for (let i = 0; i < 300; i++) {
      const alg = randomMoves(rng, 30, pool)
      const simple = simplifyAlg(alg)
      expect(applyAlg(SOLVED, simple)).toBe(applyAlg(SOLVED, alg))
      expect(simple.length).toBeLessThanOrEqual(alg.length)
      expect(simplifyAlg(simple)).toEqual(simple)
      for (let k = 1; k < simple.length; k++) expect(moveBase(simple[k])).not.toBe(moveBase(simple[k - 1]))
    }
  })
})

describe('mirrorAlg', () => {
  // An independent, geometric definition of the mirror image of a state.
  const mirrorState = (state: CubeState): CubeState => {
    const swap: Record<string, string> = { R: 'L', L: 'R' }
    const out = new Array<string>(54)
    for (const f of FACELETS) {
      const j = faceletAtPosition([-f.position[0] + 0, f.position[1], f.position[2]], [-f.normal[0] + 0, f.normal[1], f.normal[2]])
      out[j] = swap[state[f.index]] ?? state[f.index]
    }
    return out.join('') as CubeState
  }

  it('turns the right trigger into the left trigger', () => {
    expect(mirrorAlg("R U R' U'")).toEqual(["L'", "U'", 'L', 'U'])
    expect(mirrorAlg("U R U' R' U' F' U F")).toEqual(parseAlg("U' L' U L U F U' F'"))
  })

  it('produces the mirror image for every move and for random algorithms', () => {
    expect(mirrorState(SOLVED)).toBe(SOLVED)
    for (const m of ALL_MOVES) expect(applyAlg(SOLVED, mirrorAlg([m])), m).toBe(mirrorState(applyAlg(SOLVED, [m])))
    const rng = seededRng(7)
    for (let i = 0; i < 100; i++) {
      const alg = randomMoves(rng, 30)
      expect(applyAlg(SOLVED, mirrorAlg(alg))).toBe(mirrorState(applyAlg(SOLVED, alg)))
      expect(mirrorAlg(mirrorAlg(alg))).toEqual(alg)
    }
  })
})

describe('describeMove', () => {
  it('uses kid-friendly words', () => {
    expect(describeMove('R').text).toBe('Right face, clockwise')
    expect(describeMove("R'").text).toBe('Right face, counter-clockwise')
    expect(describeMove('U2').text).toBe('Top face, half turn')
    expect(describeMove('D').text).toBe('Bottom face, clockwise')
    expect(describeMove("L'").text).toBe('Left face, counter-clockwise')
    expect(describeMove('F').text).toBe('Front face, clockwise')
    expect(describeMove('B2').text).toBe('Back face, half turn')
    expect(describeMove('M').text).toBe('Middle slice, clockwise')
    expect(describeMove('r').text).toBe('Right two layers, clockwise')
    expect(describeMove("x'").text).toBe("Whole cube, counter-clockwise (like R')")
    expect(describeMove('y2').text).toBe('Whole cube, half turn (like U2)')
    expect(describeMove('R')).toMatchObject({ move: 'R', kind: 'face', layer: 'Right face', direction: 'clockwise' })
  })

  it('has a distinct, non-empty detail sentence for every move', () => {
    const details = ALL_MOVES.map((m) => describeMove(m).detail)
    for (const d of details) expect(d.length).toBeGreaterThan(10)
    expect(new Set(details).size).toBe(ALL_MOVES.length)
    for (const m of ALL_MOVES) expect(describeMove(m).text.length).toBeGreaterThan(5)
  })

  it('detail sentences agree with what the moves really do', () => {
    const centre = (alg: string, facelet: number) => stateFromAlg(alg)[facelet]
    // "The right side goes up": the front-right sticker ends on top.
    expect(stateFromAlg('R')[5]).toBe('F')
    // "The left side comes down": the top-left sticker ends on the front.
    expect(stateFromAlg('L')[21]).toBe('U')
    // "The top slides to the left": front stickers end on the left face.
    expect(stateFromAlg('U')[37]).toBe('F')
    // "The bottom slides to the right": front stickers end on the right face.
    expect(stateFromAlg('D')[16]).toBe('F')
    // x: "the front becomes the top".
    expect(centre('x', 4)).toBe('F')
    // x': "the top becomes the front".
    expect(centre("x'", 22)).toBe('U')
    // y: "the right side comes to the front"; y': the left side does.
    expect(centre('y', 22)).toBe('R')
    expect(centre("y'", 22)).toBe('L')
    // z: "the top becomes the right side"; z': the left side.
    expect(centre('z', 13)).toBe('U')
    expect(centre("z'", 40)).toBe('U')
    // M: "the middle strip comes down" — top centre to the front. E: belt slides right.
    expect(centre('M', 22)).toBe('U')
    expect(centre('E', 13)).toBe('F')
    // r: right side and middle strip go up together — front centre to the top.
    expect(centre('r', 4)).toBe('F')
    expect(centre('l', 22)).toBe('U')
    expect(centre('u', 40)).toBe('F')
    expect(centre('d', 13)).toBe('F')
  })
})
