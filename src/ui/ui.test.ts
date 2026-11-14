import { describe, expect, it } from 'vitest'
import { BADGES } from '../store/badges'
import { DAILY_CHALLENGES } from '../store/daily'
import { ALL_MOVES, describeMove as describeEngineMove } from '../cube'
import { cx } from './cx'
import { describeMove, parseMoveToken, tokenizeMoves } from './moves'

describe('cx', () => {
  it('joins truthy class names, flattening arrays', () => {
    expect(cx('a', false, null, undefined, ['b', [0, true, 'c']], '')).toBe('a b c')
  })
})

describe('parseMoveToken', () => {
  it('reads face turns with modifiers', () => {
    expect(parseMoveToken('R')).toMatchObject({ base: 'R', face: 'R', kind: 'face', modifier: '', valid: true })
    expect(parseMoveToken("U'")).toMatchObject({ base: 'U', face: 'U', modifier: "'" })
    expect(parseMoveToken('F2')).toMatchObject({ base: 'F', face: 'F', modifier: '2' })
    expect(parseMoveToken("B2'").modifier).toBe('2')
  })

  it('accepts typographic primes', () => {
    for (const prime of ['’', '′', '`']) expect(parseMoveToken(`L${prime}`)).toMatchObject({ face: 'L', modifier: "'", valid: true })
  })

  it('knows wide moves, slices and rotations', () => {
    expect(parseMoveToken('Rw')).toMatchObject({ base: 'Rw', face: 'R', kind: 'wide' })
    expect(parseMoveToken("f'")).toMatchObject({ base: 'f', face: 'F', kind: 'wide', modifier: "'" })
    expect(parseMoveToken('M2')).toMatchObject({ face: null, kind: 'slice', modifier: '2' })
    expect(parseMoveToken("y'")).toMatchObject({ face: null, kind: 'rotation', modifier: "'" })
  })

  it('flags nonsense without throwing', () => {
    for (const bad of ['', 'Q', 'RU', 'R U', "R''", 'w']) expect(parseMoveToken(bad).valid, bad).toBe(false)
  })

  it('reads every token exactly as the engine does', () => {
    // The engine accepts R3 (three quarter turns = R′); the chip must agree, not call it invalid.
    expect(parseMoveToken('R3')).toMatchObject({ valid: true, move: "R'", modifier: "'", base: 'R' })
    expect(parseMoveToken("Rw'")).toMatchObject({ valid: true, move: "r'", base: 'Rw' })
    for (const move of ALL_MOVES) expect(parseMoveToken(move)).toMatchObject({ valid: true, move })
  })
})

describe('describeMove', () => {
  it('writes a readable sentence', () => {
    expect(describeMove(parseMoveToken('R'))).toBe('Right face, clockwise')
    expect(describeMove(parseMoveToken("U'"))).toBe('Top face, counter-clockwise')
    expect(describeMove(parseMoveToken('D'))).toBe('Bottom face, clockwise')
    expect(describeMove(parseMoveToken('F2'))).toBe('Front face, half turn')
    expect(describeMove(parseMoveToken('Lw'))).toBe('Left two layers, clockwise')
    expect(describeMove(parseMoveToken("M'"))).toBe('Middle slice, counter-clockwise')
    expect(describeMove(parseMoveToken('x'))).toBe('Whole cube, clockwise (like R)')
    expect(describeMove(parseMoveToken('nope'))).toBe('nope')
  })

  it('says exactly what the engine says, for all 54 moves', () => {
    for (const move of ALL_MOVES) expect(describeMove(parseMoveToken(move)), move).toBe(describeEngineMove(move).text)
  })
})

describe('tokenizeMoves', () => {
  it('splits moves and keeps brackets, indexing moves only', () => {
    const tokens = tokenizeMoves("(R U R' U')  F2")
    expect(tokens.map((t) => t.type)).toEqual(['open', 'move', 'move', 'move', 'move', 'close', 'move'])
    const moves = tokens.filter((t) => t.type === 'move')
    expect(moves.map((t) => t.index)).toEqual([0, 1, 2, 3, 4])
    expect(moves.map((t) => t.move.raw)).toEqual(['R', 'U', "R'", "U'", 'F2'])
  })

  it('accepts arrays and empty input', () => {
    expect(tokenizeMoves(['R', "U'"])).toHaveLength(2)
    expect(tokenizeMoves('   ')).toEqual([])
  })
})

describe('catalogues reference real icons', () => {
  it('every badge and daily challenge icon exists in the icon set', async () => {
    const { isIconName } = await import('./icons')
    for (const item of [...BADGES, ...DAILY_CHALLENGES]) expect(isIconName(item.icon), `${item.id} → ${item.icon}`).toBe(true)
  })
})

describe('sound', () => {
  it('is silent and safe without a browser', async () => {
    const { sound, initSound } = await import('./sound')
    expect(() => initSound()).not.toThrow()
    expect(() => sound.play('turn')).not.toThrow()
    expect(sound.ready).toBe(false)
  })
})
