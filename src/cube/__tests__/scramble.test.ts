import { describe, expect, it } from 'vitest'
import { applyAlg } from '../moves'
import { FACE_MOVES, MOVE_BASE_DEFS, moveBase, simplifyAlg } from '../notation'
import { dailyScramble, dateKey, randomScramble, seededRng } from '../scramble'
import { isSolved, SOLVED } from '../state'
import { isSolvable } from '../validate'

describe('seededRng', () => {
  it('is repeatable and in range', () => {
    const a = seededRng(42)
    const b = seededRng(42)
    const c = seededRng(43)
    const seqA = Array.from({ length: 50 }, () => a())
    expect(Array.from({ length: 50 }, () => b())).toEqual(seqA)
    expect(Array.from({ length: 50 }, () => c())).not.toEqual(seqA)
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(seededRng('hello')()).toBe(seededRng('hello')())
    expect(seededRng('hello')()).not.toBe(seededRng('hellp')())
  })

  it('is roughly uniform', () => {
    const rng = seededRng(7)
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 20000; i++) buckets[Math.floor(rng() * 10)]++
    for (const b of buckets) expect(Math.abs(b - 2000)).toBeLessThan(200)
  })
})

describe('randomScramble', () => {
  it('gives 20 face turns by default and honours length', () => {
    const s = randomScramble({ rng: seededRng(1) })
    expect(s).toHaveLength(20)
    for (const m of s) expect(FACE_MOVES).toContain(m)
    expect(randomScramble({ length: 7, rng: seededRng(1) })).toHaveLength(7)
    expect(randomScramble({ length: 0 })).toEqual([])
    expect(randomScramble()).toHaveLength(20)
  })

  it('is reproducible with a seeded rng', () => {
    expect(randomScramble({ rng: seededRng(5) })).toEqual(randomScramble({ rng: seededRng(5) }))
    expect(randomScramble({ rng: seededRng(5) })).not.toEqual(randomScramble({ rng: seededRng(6) }))
  })

  it('never has redundant consecutive moves (R R\', R L R) in 2000 scrambles', () => {
    const rng = seededRng(99)
    const used = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const s = randomScramble({ rng })
      for (let k = 0; k < s.length; k++) {
        used.add(s[k])
        if (k >= 1) expect(moveBase(s[k]), s.join(' ')).not.toBe(moveBase(s[k - 1]))
        if (k >= 2 && moveBase(s[k]) === moveBase(s[k - 2])) {
          expect(MOVE_BASE_DEFS[moveBase(s[k - 1])].axis, s.join(' ')).not.toBe(MOVE_BASE_DEFS[moveBase(s[k])].axis)
        }
      }
      // Nothing to cancel, and the result is a real scrambled cube.
      expect(simplifyAlg(s)).toEqual(s)
    }
    expect(used.size).toBe(18)
  })

  it('actually scrambles the cube and stays solvable', () => {
    const rng = seededRng(100)
    for (let i = 0; i < 50; i++) {
      const state = applyAlg(SOLVED, randomScramble({ rng }))
      expect(isSolved(state)).toBe(false)
      expect(isSolvable(state)).toBe(true)
    }
  })

  it('survives an rng that returns values at the edges of its range', () => {
    expect(randomScramble({ rng: () => 0.999999999999 })).toHaveLength(20)
    let flip = false
    const s = randomScramble({
      rng: () => {
        flip = !flip
        return flip ? 0 : 0.5
      },
    })
    expect(s).toHaveLength(20)
  })
})

describe('dailyScramble', () => {
  it('is the same all day and different the next day', () => {
    const morning = new Date(2026, 10, 12, 7, 0)
    const evening = new Date(2026, 10, 12, 22, 30)
    const tomorrow = new Date(2026, 10, 13, 7, 0)
    expect(dateKey(morning)).toBe('2026-11-12')
    expect(dateKey(new Date(2027, 0, 5))).toBe('2027-01-05')
    expect(dailyScramble(morning)).toEqual(dailyScramble(evening))
    expect(dailyScramble(morning)).toEqual(dailyScramble('2026-11-12'))
    expect(dailyScramble(morning)).not.toEqual(dailyScramble(tomorrow))
    expect(dailyScramble(morning)).toHaveLength(20)
    expect(dailyScramble(morning, 25)).toHaveLength(25)
    expect(dailyScramble()).toHaveLength(20)
  })

  it('gives a different scramble on each of 365 days', () => {
    const seen = new Set<string>()
    for (let d = 0; d < 365; d++) seen.add(dailyScramble(new Date(2026, 0, 1 + d)).join(' '))
    expect(seen.size).toBe(365)
  })
})
