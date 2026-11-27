import { describe, expect, it } from 'vitest'
import { FLAGS, PATTERNS, SOLVED, applyAlg, faceColors, findFaceAlgs, getFlag, isSolved, isUpright, randomScramble, seededRng } from '../../cube'
import { BLANK_FACE, collectedCount, collectionLine, designDifficulty, designerLink, designLink, designMakeable, designPlaceId, designResultLine, faceCode, filterPatterns, flagLookingLike, getMakeable, holdWords, isPlainFace, parseFaceCode, makeableEnd, matchesInAnyOrientation, orientationsOf, patternState, showsPattern, undoMoves } from './logic'

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

describe('your own design', () => {
  const india = getFlag('flag-india')!

  it('reads and writes faces as nine letters, in any case, and nothing else', () => {
    expect(faceCode(india.grid)).toBe('OOOWBWGGG')
    expect(parseFaceCode('oooWbwGGG')).toEqual([...india.grid])
    for (const bad of [null, undefined, '', 'OOOWBWGG', 'OOOWBWGGGG', 'OOOWBWGGK', 'OOO WBW GGG']) expect(parseFaceCode(bad)).toBeNull()
    expect(parseFaceCode(BLANK_FACE)!.every((c) => c === 'white')).toBe(true)
  })

  it('knows a plain face', () => {
    expect(isPlainFace(parseFaceCode('RRRRRRRRR')!)).toBe(true)
    expect(isPlainFace(india.grid)).toBe(false)
  })

  it('builds a makeable that ends on the design, from a rotated solved cube', () => {
    const solution = findFaceAlgs(india.grid)[0]
    const item = designMakeable(india.grid, solution, false)
    expect(item).toMatchObject({ id: 'flag-own', kind: 'design', placeId: 'flag-own:OOOWBWGGG', name: 'Your design' })
    expect(item.flag).toBeUndefined()
    expect(isSolved(item.start)).toBe(true)
    expect(faceColors(makeableEnd(item), 'F')).toEqual([...india.grid])
    expect(item.shows(makeableEnd(item))).toBe(true)
    expect(item.shows(item.start)).toBe(false)
    expect(item.difficulty).toBe(designDifficulty(solution.moves.length))
    expect(item.back.to).toBe('/patterns?tab=design&face=OOOWBWGGG')
    expect(designMakeable(india.grid, findFaceAlgs(india.grid, { slices: true })[0], true).placeId).toBe('flag-own:OOOWBWGGG+s')
  })

  it('links to the player and back to the designer, slices included', () => {
    expect(designLink('OOOWBWGGG', false)).toBe('/patterns/flag-own?face=OOOWBWGGG')
    expect(designLink('OOOWBWGGG', true)).toBe('/patterns/flag-own?face=OOOWBWGGG&slices=1')
    expect(designerLink('OOOWBWGGG', true)).toBe('/patterns?tab=design&face=OOOWBWGGG&slices=1')
    expect(designPlaceId('OOOWBWGGG', true)).toBe('flag-own:OOOWBWGGG+s')
  })

  it('names the flag a design shows, upright or turned', () => {
    const nigeria = getFlag('flag-nigeria')!
    expect(flagLookingLike(nigeria.grid)).toBe(nigeria)
    // Nigeria's green-white-green stripes turned on their side.
    expect(flagLookingLike(parseFaceCode('GGGWWWGGG')!)).toBe(nigeria)
    // India upside down is still India.
    expect(flagLookingLike(parseFaceCode('GGGWBWOOO')!)?.id).toBe('flag-india')
    expect(flagLookingLike(parseFaceCode('BWRBWRBWR')!)?.id).toBe('flag-france')
    expect(flagLookingLike(parseFaceCode('BBBWWWRRR')!)?.id).toBe('flag-france')
    expect(flagLookingLike(parseFaceCode('RWYOBGWWW')!)).toBeUndefined()
    // Every flag, every quarter turn: some flag that is truly that picture turned.
    for (const flag of FLAGS) {
      const turns = [faceCode(flag.grid)]
      for (let k = 1; k < 4; k++) turns.push([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => turns[k - 1][(2 - (i % 3)) * 3 + Math.floor(i / 3)]).join(''))
      for (const code of turns) {
        const found = flagLookingLike(parseFaceCode(code)!)
        expect(found, code).toBeDefined()
        if (code === turns[0]) expect(found).toBe(flag)
      }
    }
  })

  it('says how many moves and how to hold it', () => {
    expect(designResultLine({ hold: [], moves: ['R', 'U'] })).toBe('2 moves. Hold it with white on top and green facing you.')
    expect(designResultLine({ hold: ['x'], moves: ['M'] })).toBe('1 move. Hold it with green on top and yellow facing you.')
    expect([1, 3, 4, 6, 7].map(designDifficulty)).toEqual([1, 1, 2, 2, 3])
  })

  it('a design is never a curated flag in the collection count', () => {
    const design = designMakeable(india.grid, findFaceAlgs(india.grid)[0], false)
    expect(collectionLine(design, ['flag-india'])).toBe('Your own flag, on your own cube')
    expect(collectionLine(getMakeable('flag-india')!, ['flag-own'])).toBe(`1 of ${FLAGS.length} flags`)
    expect(collectedCount(['flag-own', 'flag-india'], FLAGS)).toBe(1)
  })
})
