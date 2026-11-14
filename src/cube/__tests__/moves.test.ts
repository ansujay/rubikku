import { describe, expect, it } from 'vitest'
import { FACELETS, SLOT_POSITION, SLOTS, type Vec3 } from '../geometry'
import {
  algOrder,
  algPermutation,
  algStates,
  applyAlg,
  applyMove,
  CUBE_ROTATIONS,
  isPositionInMove,
  moveLayer,
  movePermutation,
  rotateAlg,
  stateFromAlg,
  toUpright,
  uprightRotation,
  withoutRotations,
} from '../moves'
import { ALL_MOVES, FACE_MOVES, invertAlg, invertMove, isRotation, MOVE_BASES, moveKind, type Move } from '../notation'
import { allPieces, findPiece, pieceAt } from '../pieces'
import { isSolved, isUpright, SOLVED, toNet, type CubeState } from '../state'
import { cubejsState, randomMoves, seededRng } from './helpers'

const SEXY = "R U R' U'"
const SUNE = "R U R' U R U2 R'"
const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'"
const SUPERFLIP = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2"

describe('move tables', () => {
  it('has 54 moves, each a permutation of the 54 facelets', () => {
    expect(ALL_MOVES).toHaveLength(54)
    for (const m of ALL_MOVES) {
      expect([...movePermutation(m)].sort((a, b) => a - b)).toEqual(Array.from({ length: 54 }, (_, i) => i))
    }
  })

  it.each(MOVE_BASES)('%s has order 4, its half turn order 2, and prime = three quarter turns', (base) => {
    let s = SOLVED
    for (let k = 1; k <= 4; k++) {
      s = applyMove(s, base)
      if (k < 4) expect(s).not.toBe(SOLVED)
      if (k === 2) expect(s).toBe(applyMove(SOLVED, `${base}2`))
      if (k === 3) expect(s).toBe(applyMove(SOLVED, `${base}'`))
    }
    expect(s).toBe(SOLVED)
    expect(algOrder([base])).toBe(4)
    expect(algOrder([`${base}2`])).toBe(2)
  })

  it.each(ALL_MOVES)('%s followed by its inverse is the identity', (move) => {
    const start = stateFromAlg("R U2 F' L D B2 M E' S x y' z2 r u' f")
    expect(applyMove(applyMove(start, move), invertMove(move))).toBe(start)
  })

  it.each(ALL_MOVES)('%s matches cubejs', (move) => {
    expect(applyMove(SOLVED, move)).toBe(cubejsState([move]))
  })

  it('matches cubejs on 300 random 40-move sequences of face turns', () => {
    const rng = seededRng(1)
    for (let i = 0; i < 300; i++) {
      const alg = randomMoves(rng, 40, FACE_MOVES)
      expect(applyAlg(SOLVED, alg), alg.join(' ')).toBe(cubejsState(alg))
    }
  })

  it('matches cubejs on 300 random 40-move sequences using every kind of move', () => {
    const rng = seededRng(2)
    for (let i = 0; i < 300; i++) {
      const alg = randomMoves(rng, 40)
      expect(applyAlg(SOLVED, alg), alg.join(' ')).toBe(cubejsState(alg))
    }
  })

  it('does not mutate and is deterministic', () => {
    const before = SOLVED
    const a = applyAlg(SOLVED, SEXY)
    expect(SOLVED).toBe(before)
    expect(applyAlg(SOLVED, SEXY)).toBe(a)
    expect(applyAlg(SOLVED, [])).toBe(SOLVED)
    expect(applyAlg(SOLVED, '')).toBe(SOLVED)
  })

  it('rejects unknown moves', () => {
    expect(() => applyMove(SOLVED, 'Q' as Move)).toThrow()
    expect(() => moveLayer('R3' as Move)).toThrow()
  })
})

describe('known facts about the cube', () => {
  it('R on a solved cube brings the front colour to the top and leaves the left alone', () => {
    const s = applyMove(SOLVED, 'R')
    expect(toNet(s)).toBe(
      [
        '    WWG',
        '    WWG',
        '    WWG',
        'OOO GGY RRR WBB',
        'OOO GGY RRR WBB',
        'OOO GGY RRR WBB',
        '    YYB',
        '    YYB',
        '    YYB',
      ].join('\n'),
    )
  })

  it('U moves the front row to the left face; F moves the top row to the right face', () => {
    const u = applyMove(SOLVED, 'U')
    expect(u.slice(36, 39)).toBe('FFF') // L top row is now green
    expect(u.slice(18, 21)).toBe('RRR') // F top row is now red
    const f = applyMove(SOLVED, 'F')
    expect([f[9], f[12], f[15]].join('')).toBe('UUU') // R left column is now white
    expect(f.slice(6, 9)).toBe('LLL') // U bottom row is now orange
  })

  it('the sexy move has order 6', () => {
    expect(algOrder(SEXY)).toBe(6)
    expect(applyAlg(SOLVED, `(${SEXY})6`)).toBe(SOLVED)
    for (let k = 1; k < 6; k++) expect(applyAlg(SOLVED, `(${SEXY})${k}`)).not.toBe(SOLVED)
  })

  it('sune has order 6 and only disturbs the top layer', () => {
    expect(algOrder(SUNE)).toBe(6)
    const s = stateFromAlg(SUNE)
    for (const p of allPieces(s)) if (!p.slot.includes('U')) expect(p.solved, p.slot).toBe(true)
    // The top face keeps its cross.
    for (const e of ['UR', 'UF', 'UL', 'UB'] as const) expect(pieceAt(s, e).facing.white).toBe('U')
  })

  it('the T-perm swaps two corners and two edges, and twice is the identity', () => {
    expect(algOrder(T_PERM)).toBe(2)
    const moved = allPieces(stateFromAlg(T_PERM)).filter((p) => p.piece !== p.slot)
    expect(moved.map((p) => p.slot).sort()).toEqual(['UBR', 'UL', 'UR', 'URF'])
    expect(moved.every((p) => p.facing.white === 'U')).toBe(true)
  })

  it('M2 E2 S2 makes the checkerboard', () => {
    const s = stateFromAlg('M2 E2 S2')
    expect(s).toBe('UDUDUDUDURLRLRLRLRFBFBFBFBFDUDUDUDUDLRLRLRLRLBFBFBFBFB')
    expect(algOrder('M2 E2 S2')).toBe(2)
  })

  it('the superflip flips all 12 edges in place, keeps corners, and commutes with every move', () => {
    const s = stateFromAlg(SUPERFLIP)
    for (const p of allPieces(s)) {
      expect(p.piece).toBe(p.slot)
      expect(p.orientation).toBe(p.kind === 'edge' ? 1 : 0)
    }
    expect(applyAlg(s, SUPERFLIP)).toBe(SOLVED)
    for (const m of FACE_MOVES) {
      expect(applyAlg(applyMove(SOLVED, m), SUPERFLIP)).toBe(applyMove(s, m))
    }
  })

  it('slice, wide and rotation moves relate to face turns as the WCA defines them', () => {
    const same = (a: string, b: string) => expect(stateFromAlg(a), `${a} = ${b}`).toBe(stateFromAlg(b))
    same('M', "R L' x'")
    same('E', "U D' y'")
    same('S', "F' B z")
    same('r', "R M'")
    same('l', 'L M')
    same('u', "U E'")
    same('d', 'D E')
    same('f', 'F S')
    same('b', "B S'")
    same('r', 'L x')
    same('u', 'D y')
    same('f', 'B z')
    same('x', "R M' L'")
    same('y', "U E' D'")
    same('z', "F S B'")
  })

  it('rotation identities hold', () => {
    const same = (a: string, b: string) => expect(stateFromAlg(a), `${a} = ${b}`).toBe(stateFromAlg(b))
    same("x y x'", 'z')
    same("y z y'", 'x')
    same("z x z'", 'y')
    same('x2 y2', 'z2')
    same('x2 y2 z2', '')
    same('x y', 'y z')
    expect(stateFromAlg('x y')).not.toBe(stateFromAlg('y x'))
  })

  it('rotations move centres the right way', () => {
    // x follows R: the front centre goes to the top.
    expect(applyMove(SOLVED, 'x')[4]).toBe('F')
    // y follows U: the right centre comes to the front.
    expect(applyMove(SOLVED, 'y')[22]).toBe('R')
    // z follows F: the top centre goes to the right.
    expect(applyMove(SOLVED, 'z')[13]).toBe('U')
    // M follows L: the top centre comes to the front. E follows D: front goes right.
    expect(applyMove(SOLVED, 'M')[22]).toBe('U')
    expect(applyMove(SOLVED, 'E')[13]).toBe('F')
    expect(applyMove(SOLVED, 'S')[13]).toBe('U')
  })

  it('a rotated solved cube is still solved; face turns never move centres', () => {
    for (const rot of CUBE_ROTATIONS) expect(isSolved(applyAlg(SOLVED, rot))).toBe(true)
    const rng = seededRng(5)
    const s = applyAlg(SOLVED, randomMoves(rng, 50, FACE_MOVES))
    expect(isUpright(s)).toBe(true)
    expect(isSolved(s)).toBe(false)
  })
})

describe('moveLayer (animation contract)', () => {
  const rotate = (v: Vec3, axis: 'x' | 'y' | 'z', angle: number): Vec3 => {
    const c = Math.round(Math.cos(angle))
    const s = Math.round(Math.sin(angle))
    const [x, y, z] = v
    const r: Vec3 =
      axis === 'x' ? [x, y * c - z * s, y * s + z * c] : axis === 'y' ? [x * c + z * s, y, -x * s + z * c] : [x * c - y * s, x * s + y * c, z]
    return [r[0] + 0, r[1] + 0, r[2] + 0]
  }

  it.each(ALL_MOVES)('%s: rotating the listed cubies by the given angle reproduces the move', (move) => {
    const layer = moveLayer(move)
    const after = applyMove(SOLVED, move)
    for (const slot of SLOTS) {
      const inLayer = layer.slots.includes(slot)
      expect(isPositionInMove(SLOT_POSITION[slot], move)).toBe(inLayer)
      // On a solved cube the piece in a slot has the slot's name.
      const now = findPiece(after, slot)
      const expectedPosition = inLayer ? rotate(SLOT_POSITION[slot], layer.axis, layer.angle) : SLOT_POSITION[slot]
      expect(now.position, `${move} ${slot}`).toEqual(expectedPosition)
      // Every sticker must also point the way the rotation says.
      for (const sticker of pieceAt(SOLVED, slot).stickers) {
        const normalBefore = FACELETS[sticker.facelet].normal
        const normalAfter = FACELETS[now.stickers.find((s) => s.color === sticker.color)!.facelet].normal
        expect(normalAfter).toEqual(inLayer ? rotate(normalBefore, layer.axis, layer.angle) : normalBefore)
      }
    }
  })

  it('reports sizes, kinds and directions', () => {
    expect(moveLayer('R')).toMatchObject({ axis: 'x', layers: [1], quarterTurns: -1, kind: 'face' })
    expect(moveLayer('R').angle).toBeCloseTo(-Math.PI / 2)
    expect(moveLayer("R'").angle).toBeCloseTo(Math.PI / 2)
    expect(moveLayer('R2').angle).toBeCloseTo(-Math.PI)
    expect(moveLayer('L').angle).toBeCloseTo(Math.PI / 2)
    expect(moveLayer('U').angle).toBeCloseTo(-Math.PI / 2)
    expect(moveLayer('D').angle).toBeCloseTo(Math.PI / 2)
    expect(moveLayer('F').angle).toBeCloseTo(-Math.PI / 2)
    expect(moveLayer('B').angle).toBeCloseTo(Math.PI / 2)
    for (const m of ALL_MOVES) {
      const n = moveLayer(m).slots.length
      const kind = moveKind(m)
      expect(n).toBe(kind === 'face' ? 9 : kind === 'slice' ? 8 : kind === 'wide' ? 17 : 26)
    }
    expect(moveLayer('R').slots).toEqual(expect.arrayContaining(['URF', 'UBR', 'DFR', 'DRB', 'UR', 'DR', 'FR', 'BR', 'R']))
    expect(moveLayer('M').slots).toEqual(expect.arrayContaining(['UF', 'UB', 'DF', 'DB', 'U', 'D', 'F', 'B']))
  })
})

describe('cube orientation', () => {
  it('there are 24 distinct ways to hold the cube', () => {
    expect(CUBE_ROTATIONS).toHaveLength(24)
    expect(new Set(CUBE_ROTATIONS.map((r) => applyAlg(SOLVED, r))).size).toBe(24)
    expect(CUBE_ROTATIONS[0]).toEqual([])
    expect(Math.max(...CUBE_ROTATIONS.map((r) => r.length))).toBe(2)
  })

  it('toUpright undoes any rotation, also on a scrambled cube', () => {
    const scrambled = stateFromAlg("R U2 F' L D B2 R' U F2")
    for (const rot of CUBE_ROTATIONS) {
      const held = applyAlg(scrambled, rot)
      const up = toUpright(held)
      expect(up.state).toBe(scrambled)
      expect(up.rotation.every(isRotation)).toBe(true)
      expect(applyAlg(held, up.rotation)).toBe(scrambled)
      expect(isUpright(up.state)).toBe(true)
    }
    expect(toUpright(SOLVED).rotation).toEqual([])
  })

  it('uprightRotation returns null for impossible centres', () => {
    const chars = SOLVED.split('')
    ;[chars[4], chars[22]] = [chars[22], chars[4]]
    expect(uprightRotation(chars.join('') as CubeState)).toBeNull()
  })

  it('rotateAlg re-expresses an algorithm so no rotation is needed', () => {
    expect(rotateAlg("R U R' U'", 'y').join(' ')).toBe("B U B' U'")
    const rng = seededRng(11)
    for (const rot of CUBE_ROTATIONS) {
      const alg = randomMoves(rng, 25)
      const start = stateFromAlg(randomMoves(rng, 20))
      const direct = applyAlg(start, [...rot, ...alg, ...invertAlg(rot)])
      expect(applyAlg(start, rotateAlg(alg, rot))).toBe(direct)
    }
    expect(() => rotateAlg('R', 'U')).toThrow()
  })

  it('withoutRotations pushes rotations to the end', () => {
    const rng = seededRng(12)
    for (let i = 0; i < 100; i++) {
      const alg = randomMoves(rng, 30)
      const { moves, rotation } = withoutRotations(alg)
      expect(moves.some(isRotation)).toBe(false)
      expect(rotation.every(isRotation)).toBe(true)
      expect(moves).toHaveLength(alg.filter((m) => !isRotation(m)).length)
      expect(applyAlg(SOLVED, [...moves, ...rotation])).toBe(applyAlg(SOLVED, alg))
    }
  })
})

describe('helpers', () => {
  it('algStates lists every intermediate state', () => {
    const states = algStates(SOLVED, SEXY)
    expect(states).toHaveLength(5)
    expect(states[0]).toBe(SOLVED)
    expect(states[4]).toBe(stateFromAlg(SEXY))
    expect(states[1]).toBe(applyMove(SOLVED, 'R'))
  })

  it('algPermutation composes in order', () => {
    const perm = algPermutation('R U')
    const s = stateFromAlg('R U')
    const start = stateFromAlg("F L' D2")
    let out = ''
    for (let j = 0; j < 54; j++) out += start[perm[j]]
    expect(out).toBe(applyAlg(start, 'R U'))
    expect(s).not.toBe(stateFromAlg('U R'))
  })

  it('algOrder of well-known sequences', () => {
    expect(algOrder('')).toBe(1)
    expect(algOrder('R U')).toBe(105)
    expect(algOrder("R U R' U")).toBe(5)
    expect(algOrder('R2 U2')).toBe(6)
    expect(algOrder('x')).toBe(4)
  })
})
