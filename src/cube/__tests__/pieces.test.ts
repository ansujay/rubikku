import Cube from 'cubejs'
import { describe, expect, it } from 'vitest'
import {
  CORNERS,
  EDGES,
  FACE_COLOR,
  FACELETS,
  faceletAtPosition,
  faceletIndex,
  FACES,
  kindOf,
  oppositeColor,
  pieceColors,
  pieceWithColors,
  SLOT_FACELETS,
  SLOT_POSITION,
  slotAtPosition,
  SLOTS,
  slotsOnFace,
  slotWithFaces,
} from '../geometry'
import { applyAlg, applyMove, CUBE_ROTATIONS, stateFromAlg } from '../moves'
import { FACE_MOVES } from '../notation'
import {
  allPieces,
  faceOfSticker,
  findPiece,
  fromCubieArrays,
  getCubies,
  homeSlot,
  identifyStickers,
  isPieceSolved,
  isSlotSolved,
  permutationParity,
  pieceAt,
  toCubieArrays,
} from '../pieces'
import { randomState } from '../scramble'
import {
  centerColors,
  colorAt,
  faceColors,
  faceOfColor,
  fromColors,
  fromKociemba,
  isFaceSolved,
  isSolved,
  isStateString,
  isUpright,
  parseState,
  SOLVED,
  stickerAt,
  toColors,
  toKociemba,
  toNet,
  type CubeState,
} from '../state'
import { randomMoves, seededRng } from './helpers'

describe('geometry', () => {
  it('numbers facelets in Kociemba order', () => {
    expect(FACELETS).toHaveLength(54)
    FACELETS.forEach((f, i) => {
      expect(f.index).toBe(i)
      expect(f.face).toBe(FACES[Math.floor(i / 9)])
      expect(faceletIndex(f.face, f.row, f.col)).toBe(i)
      expect(faceletAtPosition(f.position, f.normal)).toBe(i)
    })
    expect(() => faceletIndex('U', 3, 0)).toThrow()
  })

  it('agrees with the Kociemba corner and edge facelet tables', () => {
    // U1..U9 = 0..8, R = 9.., F = 18.., D = 27.., L = 36.., B = 45..
    const U = (n: number) => n - 1
    const R = (n: number) => 8 + n
    const F = (n: number) => 17 + n
    const D = (n: number) => 26 + n
    const L = (n: number) => 35 + n
    const B = (n: number) => 44 + n
    expect(SLOT_FACELETS.URF).toEqual([U(9), R(1), F(3)])
    expect(SLOT_FACELETS.UFL).toEqual([U(7), F(1), L(3)])
    expect(SLOT_FACELETS.ULB).toEqual([U(1), L(1), B(3)])
    expect(SLOT_FACELETS.UBR).toEqual([U(3), B(1), R(3)])
    expect(SLOT_FACELETS.DFR).toEqual([D(3), F(9), R(7)])
    expect(SLOT_FACELETS.DLF).toEqual([D(1), L(9), F(7)])
    expect(SLOT_FACELETS.DBL).toEqual([D(7), B(9), L(7)])
    expect(SLOT_FACELETS.DRB).toEqual([D(9), R(9), B(7)])
    expect(SLOT_FACELETS.UR).toEqual([U(6), R(2)])
    expect(SLOT_FACELETS.UF).toEqual([U(8), F(2)])
    expect(SLOT_FACELETS.UL).toEqual([U(4), L(2)])
    expect(SLOT_FACELETS.UB).toEqual([U(2), B(2)])
    expect(SLOT_FACELETS.DR).toEqual([D(6), R(8)])
    expect(SLOT_FACELETS.DF).toEqual([D(2), F(8)])
    expect(SLOT_FACELETS.DL).toEqual([D(4), L(8)])
    expect(SLOT_FACELETS.DB).toEqual([D(8), B(8)])
    expect(SLOT_FACELETS.FR).toEqual([F(6), R(4)])
    expect(SLOT_FACELETS.FL).toEqual([F(4), L(6)])
    expect(SLOT_FACELETS.BL).toEqual([B(6), L(4)])
    expect(SLOT_FACELETS.BR).toEqual([B(4), R(6)])
    expect(SLOT_FACELETS.F).toEqual([22])
  })

  it('has 26 slots covering every facelet exactly once', () => {
    expect(SLOTS).toHaveLength(26)
    const all = SLOTS.flatMap((s) => SLOT_FACELETS[s])
    expect(all.sort((a, b) => a - b)).toEqual(Array.from({ length: 54 }, (_, i) => i))
    for (const s of SLOTS) {
      expect(slotAtPosition(SLOT_POSITION[s])).toBe(s)
      for (const f of SLOT_FACELETS[s]) expect(FACELETS[f].slot).toBe(s)
      expect(FACELETS[SLOT_FACELETS[s][0]].kind).toBe(kindOf(s))
    }
    expect(slotAtPosition([0, 0, 0])).toBeNull()
    expect(SLOT_POSITION.URF).toEqual([1, 1, 1])
    expect(SLOT_POSITION.DBL).toEqual([-1, -1, -1])
    expect(SLOT_POSITION.F).toEqual([0, 0, 1])
    expect(slotsOnFace('U')).toHaveLength(9)
  })

  it('names pieces by colour', () => {
    expect(pieceColors('UF')).toEqual(['white', 'green'])
    expect(pieceColors('DRB')).toEqual(['yellow', 'red', 'blue'])
    expect(pieceWithColors(['green', 'white'])).toBe('UF')
    expect(pieceWithColors(['red', 'green', 'white'])).toBe('URF')
    expect(pieceWithColors(['blue'])).toBe('B')
    expect(pieceWithColors(['white', 'yellow'])).toBeNull()
    expect(slotWithFaces(['F', 'U'])).toBe('UF')
    expect(slotWithFaces(['U', 'D'])).toBeNull()
    expect(oppositeColor('white')).toBe('yellow')
    expect(oppositeColor('red')).toBe('orange')
    expect(oppositeColor('blue')).toBe('green')
    expect(FACE_COLOR).toEqual({ U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' })
  })
})

describe('state', () => {
  it('the solved state is the Kociemba solved string', () => {
    expect(SOLVED).toBe(new Cube().asString())
    expect(isSolved(SOLVED)).toBe(true)
    expect(isUpright(SOLVED)).toBe(true)
    expect(toKociemba(SOLVED)).toBe('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB')
  })

  it('parses and rejects strings', () => {
    expect(fromKociemba(SOLVED)).toBe(SOLVED)
    expect(() => fromKociemba('UUU')).toThrow()
    expect(() => fromKociemba(SOLVED.replace('U', 'X'))).toThrow()
    expect(parseState(SOLVED)).toBe(SOLVED)
    expect(parseState('nope')).toBeNull()
    expect(parseState(undefined)).toBeNull()
    expect(parseState(42)).toBeNull()
    expect(isStateString(SOLVED + 'U')).toBe(false)
  })

  it('round-trips random scrambles through colours and through cubejs', () => {
    const rng = seededRng(21)
    for (let i = 0; i < 200; i++) {
      const s = applyAlg(SOLVED, randomMoves(rng, 25))
      expect(fromColors(toColors(s))).toBe(s)
      expect(fromKociemba(toKociemba(s))).toBe(s)
      if (isUpright(s)) expect(Cube.fromString(s).asString()).toBe(s)
    }
    for (let i = 0; i < 200; i++) {
      const s = applyAlg(SOLVED, randomMoves(rng, 25, FACE_MOVES))
      expect(Cube.fromString(s).asString()).toBe(s)
    }
    expect(() => fromColors(['white'])).toThrow()
  })

  it('reads stickers', () => {
    const s = applyMove(SOLVED, 'R')
    expect(colorAt(s, 2)).toBe('green')
    expect(stickerAt(s, 'U', 0, 2)).toBe('green')
    expect(stickerAt(s, 'U', 0, 0)).toBe('white')
    expect(faceColors(s, 'U')).toEqual(['white', 'white', 'green', 'white', 'white', 'green', 'white', 'white', 'green'])
    expect(faceColors(s, 'R')).toEqual(new Array(9).fill('red'))
    expect(isFaceSolved(s, 'R')).toBe(true)
    expect(isFaceSolved(s, 'U')).toBe(false)
    expect(toColors(SOLVED).slice(0, 10)).toEqual([...new Array(9).fill('white'), 'red'])
  })

  it('knows how the cube is held', () => {
    expect(centerColors(SOLVED)).toEqual({ U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' })
    const held = applyAlg(SOLVED, 'z2')
    expect(centerColors(held)).toEqual({ U: 'yellow', R: 'orange', F: 'green', D: 'white', L: 'red', B: 'blue' })
    expect(faceOfColor(held, 'white')).toBe('D')
    expect(faceOfColor(held, 'green')).toBe('F')
    expect(isUpright(held)).toBe(false)
    expect(isSolved(held)).toBe(true)
  })

  it('draws a net', () => {
    expect(toNet(SOLVED).split('\n')).toHaveLength(9)
    expect(toNet(SOLVED).split('\n')[3]).toBe('OOO GGG RRR BBB')
  })
})

describe('piece queries', () => {
  it('on a solved cube every piece is home', () => {
    for (const p of allPieces(SOLVED)) {
      expect(p.piece).toBe(p.slot)
      expect(p.orientation).toBe(0)
      expect(p.solved).toBe(true)
      expect(p.position).toEqual(SLOT_POSITION[p.slot])
      expect(p.stickers.map((s) => s.color)).toEqual(pieceColors(p.piece))
    }
    expect(allPieces(SOLVED)).toHaveLength(26)
  })

  it('tracks a piece through a move', () => {
    const s = applyMove(SOLVED, 'R')
    // R takes the front-right-top corner to the back.
    const urf = findPiece(s, 'URF')
    expect(urf.slot).toBe('UBR')
    expect(urf.facing).toEqual({ white: 'B', red: 'R', green: 'U' })
    expect(urf.solved).toBe(false)
    expect(urf.kind).toBe('corner')
    expect(pieceAt(s, 'URF').piece).toBe('DFR')
    expect(pieceAt(s, 'URF').facing).toEqual({ yellow: 'F', green: 'U', red: 'R' })
    expect(findPiece(s, ['red', 'green']).slot).toBe('UR')
    expect(findPiece(s, 'FR').facing).toEqual({ green: 'U', red: 'R' })
    expect(faceOfSticker(s, 'FR', 'green')).toBe('U')
    expect(() => faceOfSticker(s, 'FR', 'white')).toThrow()
    expect(findPiece(s, 'UF').solved).toBe(true)
    expect(isPieceSolved(s, 'UF')).toBe(true)
    expect(isPieceSolved(s, ['white', 'red'])).toBe(false)
    expect(isSlotSolved(s, 'UL')).toBe(true)
    expect(isSlotSolved(s, 'UR')).toBe(false)
    expect(findPiece(s, 'R').slot).toBe('R')
  })

  it('orientation follows the Kociemba definition', () => {
    // F flips the four edges it moves (F/B axis definition) and twists its corners.
    const f = applyMove(SOLVED, 'F')
    expect(pieceAt(f, 'UF')).toMatchObject({ piece: 'FL', orientation: 1 })
    expect(pieceAt(f, 'URF')).toMatchObject({ piece: 'UFL', orientation: 1 })
    expect(pieceAt(f, 'UFL')).toMatchObject({ piece: 'DLF', orientation: 2 })
    // U never changes orientation.
    for (const p of allPieces(applyMove(SOLVED, 'U'))) expect(p.orientation).toBe(0)
    // R twists corners but does not flip edges.
    const r = allPieces(applyMove(SOLVED, 'R'))
    expect(r.filter((p) => p.kind === 'edge').every((p) => p.orientation === 0)).toBe(true)
    expect(r.filter((p) => p.kind === 'corner' && p.slot.includes('R')).every((p) => p.orientation !== 0)).toBe(true)
  })

  it('findPiece and pieceAt agree on random cubes held any way', () => {
    const rng = seededRng(22)
    for (let i = 0; i < 100; i++) {
      const s = applyAlg(SOLVED, randomMoves(rng, 30))
      const seen = new Set<string>()
      for (const slot of SLOTS) {
        const at = pieceAt(s, slot)
        seen.add(at.piece)
        expect(findPiece(s, at.piece)).toEqual(at)
        expect(findPiece(s, pieceColors(at.piece))).toEqual(at)
        for (const st of at.stickers) {
          expect(colorAt(s, st.facelet)).toBe(st.color)
          expect(FACELETS[st.facelet].face).toBe(st.face)
          expect(FACELETS[st.facelet].slot).toBe(slot)
          expect(at.facing[st.color]).toBe(st.face)
        }
        expect(at.solved).toBe(isSlotSolved(s, slot))
        expect(at.solved).toBe(at.slot === homeSlot(s, at.piece) && at.stickers.every((st) => centerColors(s)[st.face] === st.color))
      }
      expect(seen.size).toBe(26)
    }
  })

  it('homeSlot and solved work relative to the centres', () => {
    const held = applyAlg(SOLVED, 'z2')
    expect(homeSlot(held, 'UF')).toBe('DF')
    expect(homeSlot(held, ['white', 'green', 'red'])).toBe('DLF')
    expect(homeSlot(SOLVED, 'UF')).toBe('UF')
    for (const rot of CUBE_ROTATIONS) {
      const s = applyAlg(SOLVED, rot)
      for (const p of allPieces(s)) {
        expect(p.solved).toBe(true)
        expect(homeSlot(s, p.piece)).toBe(p.slot)
      }
      const t = applyMove(s, 'R')
      expect(allPieces(t).filter((p) => !p.solved).map((p) => p.slot).sort()).toEqual(
        ['BR', 'DFR', 'DR', 'DRB', 'FR', 'UBR', 'UR', 'URF'].sort(),
      )
    }
  })

  it('throws for unknown or impossible pieces', () => {
    expect(() => findPiece(SOLVED, ['white', 'yellow'])).toThrow()
    expect(() => findPiece(SOLVED, 'XX' as never)).toThrow()
    const broken = (SOLVED.slice(0, 8) + 'D' + SOLVED.slice(9)) as CubeState
    expect(() => pieceAt(broken, 'URF')).toThrow()
    expect(() => findPiece(broken, 'URF')).toThrow()
    expect(identifyStickers('UD')).toBeNull()
    expect(identifyStickers('UFR')).toBeNull() // mirror image of URF
    expect(identifyStickers('RFU')).toEqual({ piece: 'URF', orientation: 2 })
  })
})

describe('getCubies', () => {
  it('lists 26 cubies with positions and stickers', () => {
    const cubies = getCubies(SOLVED)
    expect(cubies).toHaveLength(26)
    expect(cubies.filter((c) => c.kind === 'corner')).toHaveLength(8)
    expect(cubies.filter((c) => c.kind === 'edge')).toHaveLength(12)
    expect(cubies.filter((c) => c.kind === 'center')).toHaveLength(6)
    expect(new Set(cubies.map((c) => c.position.join())).size).toBe(26)
    for (const c of cubies) {
      expect(c.piece).toBe(c.slot)
      expect(c.stickers).toHaveLength(c.kind === 'corner' ? 3 : c.kind === 'edge' ? 2 : 1)
      for (const st of c.stickers) {
        expect(st.color).toBe(FACE_COLOR[st.face])
        expect(FACELETS[st.facelet].position).toEqual(c.position)
        expect(FACELETS[st.facelet].face).toBe(st.face)
      }
    }
    const urf = cubies.find((c) => c.slot === 'URF')!
    expect(urf.position).toEqual([1, 1, 1])
    expect(urf.stickers).toEqual([
      { face: 'U', color: 'white', facelet: 8 },
      { face: 'R', color: 'red', facelet: 9 },
      { face: 'F', color: 'green', facelet: 20 },
    ])
  })

  it('keeps piece identity while pieces move', () => {
    const rng = seededRng(23)
    const s = applyAlg(SOLVED, randomMoves(rng, 30))
    const cubies = getCubies(s)
    expect(new Set(cubies.map((c) => c.piece)).size).toBe(26)
    for (const c of cubies) {
      expect(c.piece).toBe(pieceAt(s, c.slot).piece)
      for (const st of c.stickers) expect(st.color).toBe(colorAt(s, st.facelet))
    }
  })

  it('accepts a half-painted cube', () => {
    const painted: (ReturnType<typeof toColors>[number] | null)[] = toColors(SOLVED)
    painted[8] = null
    painted[0] = 'yellow'
    const cubies = getCubies(painted)
    const urf = cubies.find((c) => c.slot === 'URF')!
    expect(urf.piece).toBeNull()
    expect(urf.stickers[0].color).toBeNull()
    expect(urf.stickers[1].color).toBe('red')
    expect(cubies.find((c) => c.slot === 'ULB')!.piece).toBeNull()
    expect(cubies.find((c) => c.slot === 'UF')!.piece).toBe('UF')
  })
})

describe('cubie arrays', () => {
  it('matches cubejs on random states and round-trips', () => {
    for (let i = 0; i < 200; i++) {
      const cube = Cube.random()
      const state = fromKociemba(cube.asString())
      const arrays = toCubieArrays(state)
      expect(arrays).toEqual(cube.toJSON())
      expect(fromCubieArrays(arrays)).toBe(state)
    }
  })

  it('round-trips rotated cubes too', () => {
    const rng = seededRng(24)
    for (let i = 0; i < 100; i++) {
      const s = applyAlg(SOLVED, randomMoves(rng, 30))
      expect(fromCubieArrays(toCubieArrays(s))).toBe(s)
    }
    expect(toCubieArrays(SOLVED)).toEqual({
      center: [0, 1, 2, 3, 4, 5],
      cp: [0, 1, 2, 3, 4, 5, 6, 7],
      co: new Array(8).fill(0),
      ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      eo: new Array(12).fill(0),
    })
  })

  it('face turns keep the solvability invariants', () => {
    const rng = seededRng(25)
    for (let i = 0; i < 100; i++) {
      const a = toCubieArrays(applyAlg(SOLVED, randomMoves(rng, 30, FACE_MOVES)))
      expect(a.co.reduce((x, y) => x + y, 0) % 3).toBe(0)
      expect(a.eo.reduce((x, y) => x + y, 0) % 2).toBe(0)
      expect(permutationParity(a.cp)).toBe(permutationParity(a.ep))
    }
    expect(permutationParity([0, 1, 2])).toBe(0)
    expect(permutationParity([1, 0, 2])).toBe(1)
    expect(permutationParity([1, 2, 0])).toBe(0)
  })

  it('randomState gives solvable, varied states', () => {
    const rng = seededRng(26)
    const states = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const s = randomState(rng)
      states.add(s)
      const a = toCubieArrays(s)
      expect(a.co.reduce((x, y) => x + y, 0) % 3).toBe(0)
      expect(a.eo.reduce((x, y) => x + y, 0) % 2).toBe(0)
      expect(permutationParity(a.cp)).toBe(permutationParity(a.ep))
      expect([...a.cp].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
      expect(isUpright(s)).toBe(true)
    }
    expect(states.size).toBe(200)
    expect(randomState(seededRng(9))).toBe(randomState(seededRng(9)))
    expect(CORNERS).toHaveLength(8)
    expect(EDGES).toHaveLength(12)
    expect(stateFromAlg('')).toBe(SOLVED)
  })
})
