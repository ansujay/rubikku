import { describe, expect, it } from 'vitest'
import { findFaceAlgs, flagStart } from '../faceSearch'
import { FLAG_FAMILIES, FLAGS, getFlag, LEFT_OUT_FLAGS } from '../flags'
import { FLAG_PALETTE } from '../flagPalette'
import { applyAlg, CUBE_ROTATIONS } from '../moves'
import { invertAlg, moveKind, parseAlg } from '../notation'
import { faceColors, isSolved } from '../state'

describe('flags data', () => {
  it('has 21 flags with unique ids, names and grids', () => {
    expect(FLAGS).toHaveLength(21)
    for (const key of ['id', 'name'] as const) expect(new Set(FLAGS.map((f) => f[key])).size).toBe(21)
    expect(new Set(FLAGS.map((f) => f.grid.join())).size).toBe(21)
  })

  it('groups by family in order: stripes, dots, crosses', () => {
    const order = FLAGS.map((f) => f.family)
    const ids = FLAG_FAMILIES.map((f) => f.id)
    expect(ids).toEqual(['stripes', 'dots', 'crosses'])
    expect([...new Set(order)]).toEqual(ids)
    expect(order.join()).toBe([...order].sort((a, b) => ids.indexOf(a) - ids.indexOf(b)).join())
    expect(order.filter((f) => f === 'stripes')).toHaveLength(11)
    expect(order.filter((f) => f === 'dots')).toHaveLength(4)
    expect(order.filter((f) => f === 'crosses')).toHaveLength(6)
  })

  it('looks flags up by id', () => {
    expect(getFlag('flag-japan')?.name).toBe('Japan')
    expect(getFlag('checkerboard')).toBeUndefined()
    for (const f of FLAGS) expect(getFlag(f.id)).toBe(f)
  })

  it('has kid-friendly text, art and a valid hold for every flag', () => {
    for (const f of FLAGS) {
      expect(f.id).toBe(`flag-${f.name.toLowerCase()}`)
      expect(CUBE_ROTATIONS).toContain(f.hold)
      expect(parseAlg(f.alg)).toEqual(f.moves)
      expect(f.description.length).toBeGreaterThan(20)
      expect(f.description.split(/[.!?]+\s/).length).toBeLessThanOrEqual(3)
      expect([1, 2, 3]).toContain(f.difficulty)
      expect(f.art.kind).toBeTruthy()
    }
    // Named art colours must exist in the palette.
    const names = new Set(Object.keys(FLAG_PALETTE))
    for (const f of FLAGS) {
      const a = f.art
      const used: string[] =
        a.kind === 'bands' ? [...a.colors, ...(a.disc ? [a.disc] : []), ...(a.chakra ? [a.chakra] : [])]
        : a.kind === 'disc' ? [a.field, a.disc]
        : a.kind === 'cross' || a.kind === 'saltire' ? [a.field, a.cross]
        : []
      for (const c of used) expect(names.has(c), `${f.name}: ${c}`).toBe(true)
    }
  })

  it('lists the flags left out, with a reason each', () => {
    expect(LEFT_OUT_FLAGS.map((f) => f.name)).toContain('Germany')
    for (const f of LEFT_OUT_FLAGS) {
      expect(f.reason.length).toBeGreaterThan(10)
      expect(getFlag(`flag-${f.name.toLowerCase()}`)).toBeUndefined()
    }
  })
})

describe('every flag on the cube', () => {
  it.each(FLAGS.map((f) => [f.name, f] as const))('%s', (_name, f) => {
    const start = flagStart(f.hold)
    expect(isSolved(start)).toBe(true)
    const made = applyAlg(start, f.moves)
    expect(faceColors(made, 'F')).toEqual([...f.grid])
    expect(applyAlg(made, invertAlg(f.moves))).toBe(start)
    // Only the dot trick and the cross/Brazil sequences use middle slices; none uses wide moves.
    for (const m of f.moves) expect(['face', 'slice']).toContain(moveKind(m))
  })

  it('is within two moves of the shortest answer found by search', () => {
    for (const f of FLAGS) {
      const best = findFaceAlgs(f.grid, { slices: true, limit: 1 })[0]!.moves.length
      expect(f.moves.length, f.name).toBeLessThanOrEqual(best + 2)
    }
  }, 120_000)
})
