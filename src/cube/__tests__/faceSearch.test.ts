import { describe, expect, it } from 'vitest'
import { findFaceAlgs, faceShows, flagStart, type FaceGrid, type FaceSolution } from '../faceSearch'
import { COLORS, type Color } from '../geometry'
import { applyAlg, CUBE_ROTATIONS } from '../moves'
import { invertAlg, moveKind } from '../notation'
import { centerColors, faceColors, isSolved, SOLVED } from '../state'
import { seededRng } from './helpers'

const LETTER: Record<string, Color> = { W: 'white', Y: 'yellow', R: 'red', O: 'orange', B: 'blue', G: 'green' }

/** "GWG GWG GWG" -> nine colours, rows top to bottom. */
function grid(text: string): FaceGrid {
  return text.replace(/\s/g, '').split('').map((c) => LETTER[c]) as unknown as FaceGrid
}

function frontAfter(s: FaceSolution): Color[] {
  return faceColors(applyAlg(flagStart(s.hold), s.moves), 'F')
}

function expectAllReproduce(g: FaceGrid, solutions: FaceSolution[], slices: boolean): void {
  expect(solutions.length).toBeGreaterThan(0)
  const length = solutions[0].moves.length
  for (const s of solutions) {
    expect(CUBE_ROTATIONS).toContain(s.hold)
    expect(s.moves).toHaveLength(length)
    for (const m of s.moves) expect(slices ? ['face', 'slice'] : ['face']).toContain(moveKind(m))
    expect(frontAfter(s), `${s.hold.join(' ')} | ${s.moves.join(' ')}`).toEqual([...g])
  }
}

describe('findFaceAlgs: known optima', () => {
  it.each([
    ['Nigeria', 'GWG GWG GWG', 1, 2],
    ['France', 'BWR BWR BWR', 5, 5],
    ['Japan', 'WWW WRW WWW', 3, 6],
    ['Switzerland', 'RWR WWW RWR', 5, 8],
    ['Armenia', 'RRR BBB OOO', 2, 2],
    ['India', 'OOO WBW GGG', 5, 5],
  ] as const)('%s (%s): %d moves with slices, %d with face turns only', (_name, text, withSlices, faceOnly) => {
    const g = grid(text)
    const sliced = findFaceAlgs(g, { slices: true })
    expectAllReproduce(g, sliced, true)
    expect(sliced[0].moves).toHaveLength(withSlices)
    const faces = findFaceAlgs(g)
    expectAllReproduce(g, faces, false)
    expect(faces[0].moves).toHaveLength(faceOnly)
  })

  it('finds the M S M\' dot for Japan and puts face-turn answers first', () => {
    const japan = findFaceAlgs(grid('WWW WRW WWW'), { slices: true })
    expect(japan.map((s) => s.moves.join(' '))).toContain("M S M'")
    const nigeria = findFaceAlgs(grid('GWG GWG GWG'), { slices: true })
    expect(nigeria[0]).toEqual({ hold: [], moves: ['M'] })
    // France has face-turn-only optima: they rank ahead of any that use a slice.
    const france = findFaceAlgs(grid('BWR BWR BWR'), { slices: true, limit: 100 })
    expect(france[0].moves.every((m) => moveKind(m) === 'face')).toBe(true)
  })

  it('a plain face needs no moves, just the right hold', () => {
    const [s] = findFaceAlgs(grid('BBB BBB BBB'))
    expect(s.moves).toEqual([])
    expect(centerColors(flagStart(s.hold)).F).toBe('blue')
  })

  it('respects limit and maxDepth', () => {
    const g = grid('BWR BWR BWR')
    expect(findFaceAlgs(g, { limit: 3 })).toHaveLength(3)
    expect(findFaceAlgs(g, { maxDepth: 4 })).toEqual([])
  })

  it('rejects something that is not nine colours', () => {
    expect(() => findFaceAlgs(['white'] as unknown as FaceGrid)).toThrow()
    expect(() => findFaceAlgs(Array(9).fill('pink') as unknown as FaceGrid)).toThrow()
  })
})

describe('findFaceAlgs: random pictures', () => {
  const rng = seededRng('face-search')
  const randomGrid = () => Array.from({ length: 9 }, () => COLORS[Math.floor(rng() * 6)]) as unknown as FaceGrid
  const faceOnly = Array.from({ length: 20 }, randomGrid)
  const sliced = Array.from({ length: 4 }, randomGrid)

  it.each(faceOnly.map((g) => [g.map((c) => c[0].toUpperCase()).join(''), g] as const))(
    'face turns: %s',
    (_key, g) => {
      const solutions = findFaceAlgs(g, { limit: 4 })
      expectAllReproduce(g, solutions, false)
      expect(solutions[0].moves.length).toBeLessThanOrEqual(9)
    },
  )

  it.each(sliced.map((g) => [g.map((c) => c[0].toUpperCase()).join(''), g] as const))(
    'with slices: %s',
    (_key, g) => {
      const solutions = findFaceAlgs(g, { slices: true, limit: 4 })
      expectAllReproduce(g, solutions, true)
      expect(solutions[0].moves.length).toBeLessThanOrEqual(findFaceAlgs(g, { limit: 1 })[0].moves.length)
    },
  )
})

describe('faceShows and flagStart', () => {
  const japan = grid('WWW WRW WWW')
  const [solution] = findFaceAlgs(japan, { slices: true })
  const start = flagStart(solution.hold)
  const made = applyAlg(start, solution.moves)

  it('flagStart is the solved cube held as asked', () => {
    expect(isSolved(start)).toBe(true)
    expect(flagStart([])).toBe(SOLVED)
    expect(applyAlg(made, invertAlg(solution.moves))).toBe(start)
  })

  it('sees the picture on any face, however it is turned', () => {
    expect(faceShows(made, japan)).toBe(true)
    expect(faceShows(applyAlg(made, "y x'"), japan)).toBe(true)
    expect(faceShows(applyAlg(made, 'z'), japan)).toBe(true)
    expect(faceShows(applyAlg(start, solution.moves.slice(0, -1)), japan)).toBe(false)
    expect(faceShows(SOLVED, japan)).toBe(false)
  })

  it('needs every sticker, and accepts the grid quarter-turned', () => {
    const france = grid('BWR BWR BWR')
    const [s] = findFaceAlgs(france)
    const state = applyAlg(flagStart(s.hold), s.moves)
    expect(faceShows(state, france)).toBe(true)
    expect(faceShows(state, grid('BBB WWW RRR'))).toBe(true) // the same flag on its side
    expect(faceShows(state, grid('BWR BWR BWO'))).toBe(false)
  })
})
