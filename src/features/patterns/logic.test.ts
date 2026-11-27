import { describe, expect, it } from 'vitest'
import { FLAGS, PATTERNS, SOLVED, applyAlg, faceColors, isSolved, isUpright, randomScramble, seededRng } from '../../cube'
import { collectedCount, collectionLine, filterPatterns, getMakeable, holdWords, makeableEnd, matchesInAnyOrientation, orientationsOf, patternState, showsPattern, undoMoves } from './logic'

describe('matching in any orientation', () => {
  it('finds a state however the cube is held', () => {
    const target = applyAlg(SOLVED, randomScramble({ rng: seededRng(5) }))
    const held = orientationsOf(target)
    expect(held).toHaveLength(24)
    expect(new Set(held).size).toBe(24)
    for (const state of held) expect(matchesInAnyOrientation(state, target)).toBe(true)
    expect(matchesInAnyOrientation(applyAlg(target, 'x y'), target)).toBe(true)
    expect(matchesInAnyOrientation(applyAlg(target, 'R'), target)).toBe(false)
    expect(matchesInAnyOrientation(SOLVED, target)).toBe(false)
  })

  it('a rotated solved cube is still solved', () => {
    expect(matchesInAnyOrientation(applyAlg(SOLVED, 'z2 y'), SOLVED)).toBe(true)
  })
})

describe('patterns', () => {
  it('are detected after their own moves, in any orientation, and not one move short', () => {
    for (const pattern of PATTERNS) {
      const made = patternState(pattern)
      expect(showsPattern(made, pattern)).toBe(true)
      expect(showsPattern(applyAlg(made, "y x'"), pattern)).toBe(true)
      expect(showsPattern(applyAlg(SOLVED, pattern.moves.slice(0, -1)), pattern)).toBe(false)
      expect(showsPattern(SOLVED, pattern)).toBe(false)
    }
  })

  it('every pattern is undone by its moves backwards', () => {
    for (const pattern of PATTERNS) {
      const undo = undoMoves(pattern)
      expect(undo).toHaveLength(pattern.moves.length)
      expect(isSolved(applyAlg(patternState(pattern), undo))).toBe(true)
    }
    expect(undoMoves({ moves: ['R', "U'", 'F2'] })).toEqual(['F2', 'U', "R'"])
  })

  it('counts and filters the collection', () => {
    const made = ['checkerboard', 'superflip', 'not-a-pattern']
    expect(collectedCount(made, PATTERNS)).toBe(2)
    expect(filterPatterns(PATTERNS, made, 'made').map((p) => p.id)).toEqual(['checkerboard', 'superflip'])
    expect(filterPatterns(PATTERNS, made, 'todo')).toHaveLength(PATTERNS.length - 2)
    expect(filterPatterns(PATTERNS, made, 'all')).toHaveLength(PATTERNS.length)
  })
})

describe('makeables', () => {
  it('a trick starts solved and upright, and behaves exactly like the pattern', () => {
    for (const pattern of PATTERNS) {
      const item = getMakeable(pattern.id)!
      expect(item.kind).toBe('trick')
      expect(item.start).toBe(SOLVED)
      expect(item.holdLine).toBe('white on top and green facing you')
      expect(item.back.to).toBe('/patterns')
      expect(makeableEnd(item)).toBe(patternState(pattern))
      expect(item.shows(makeableEnd(item))).toBe(true)
      expect(item.shows(SOLVED)).toBe(false)
    }
  })

  it('a flag starts from a solved cube held its way and ends with the flag on the front', () => {
    for (const flag of FLAGS) {
      const item = getMakeable(flag.id)!
      expect(item.kind).toBe('flag')
      expect(item.flag).toBe(flag)
      expect(item.back.to).toBe('/patterns?tab=flags')
      expect(isSolved(item.start)).toBe(true)
      const end = makeableEnd(item)
      expect(faceColors(end, 'F')).toEqual([...flag.grid])
      expect(item.shows(end)).toBe(true)
      expect(item.shows(applyAlg(end, "y x'"))).toBe(true)
      expect(item.shows(item.start)).toBe(false)
      expect(item.shows(applyAlg(item.start, flag.moves.slice(0, -1)))).toBe(false)
      // Undo walks back to the same held, solved cube.
      expect(applyAlg(end, undoMoves(item))).toBe(item.start)
    }
  })

  it('says how to hold the cube in words', () => {
    expect(holdWords(SOLVED)).toBe('white on top and green facing you')
    expect(getMakeable('flag-india')!.holdLine).toBe('white on top and blue facing you')
    expect(getMakeable('flag-japan')!.holdLine).toBe('blue on top and white facing you')
    expect(isUpright(getMakeable('flag-india')!.start)).toBe(false)
  })

  it('finds tricks and flags by id, the same object each time, and nothing else', () => {
    expect(getMakeable('checkerboard')).toBe(getMakeable('checkerboard'))
    expect(getMakeable('flag-nigeria')?.name).toBe('Nigeria')
    expect(getMakeable('flag-own')).toBeUndefined()
    expect(getMakeable('nope')).toBeUndefined()
  })

  it('counts tricks and flags apart for the "made it" line', () => {
    const made = ['checkerboard', 'flag-japan', 'flag-own']
    expect(collectionLine(getMakeable('superflip')!, made)).toBe('2 of 12 in your collection')
    expect(collectionLine(getMakeable('checkerboard')!, made)).toBe('1 of 12 in your collection')
    expect(collectionLine(getMakeable('flag-india')!, made)).toBe('2 of 21 flags')
    expect(collectionLine(getMakeable('flag-japan')!, made)).toBe('1 of 21 flags')
    expect(collectedCount(made, FLAGS)).toBe(1)
  })
})
