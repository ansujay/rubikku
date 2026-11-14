import { describe, expect, it } from 'vitest'
import { PATTERNS, SOLVED, applyAlg, isSolved, randomScramble, seededRng } from '../../cube'
import { collectedCount, filterPatterns, matchesInAnyOrientation, orientationsOf, patternState, showsPattern, undoMoves } from './logic'

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
