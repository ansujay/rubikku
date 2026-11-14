import { describe, expect, it } from 'vitest'
import {
  ALGORITHMS,
  BEGINNER_HOLD,
  CUBE_ROTATIONS,
  SOLVED,
  STAGE_IDS,
  analyzeCube,
  applyAlg,
  findPiece,
  firstIncompleteStage,
  fromCubieArrays,
  getAlgorithm,
  homeSlot,
  invertAlg,
  isDaisy,
  isPetal,
  isSolved,
  isStageComplete,
  randomState,
  topLayerInfo,
  toCubieArrays,
  yellowCrossShape,
  yellowUpRotation,
  type CubeState,
  type StageId,
} from '../index'
import { detectTwistPhase } from '../beginner/analyze'
import { seededRng } from './helpers'

/** Solved cube in the beginner hold: yellow up, white down, green front. */
const HOLD = applyAlg(SOLVED, BEGINNER_HOLD)
const alg = (id: string) => getAlgorithm(id)!.moves
/** The beginner-hold cube on which doing `moves` would finish the solve. */
const before = (...moves: (string | readonly string[])[]) =>
  moves.reduce<CubeState>((s, m) => applyAlg(s, invertAlg(m as string)), HOLD)

const stagesUpTo = (stage: StageId | null): StageId[] =>
  stage === null ? [...STAGE_IDS] : STAGE_IDS.slice(0, STAGE_IDS.indexOf(stage))

function expectCurrent(state: CubeState, current: StageId | null) {
  const a = analyzeCube(state)
  expect(a.current).toBe(current)
  expect(a.completed).toEqual(stagesUpTo(current))
  for (const id of STAGE_IDS) {
    expect(a.stages[id].complete).toBe(a.completed.includes(id))
    if (!a.twistInProgress) expect(isStageComplete(state, id)).toBe(a.completed.includes(id))
  }
  return a
}

describe('analyzeCube: basics', () => {
  it('solved cube: every stage complete, nothing to do', () => {
    const a = expectCurrent(SOLVED, null)
    expect(a.solved).toBe(true)
    expect(a.twistInProgress).toBeNull()
    expect(a.topTurn).toBeNull()
    expect(a.yellowCrossShape).toBe('cross')
    for (const p of a.stageList) {
      expect(p.done).toBe(4)
      expect(p.total).toBe(4)
      expect(p.remainingPieces).toEqual([])
      expect(p.targetSlots).toEqual([])
      expect(p.remainingFacelets).toEqual([])
      expect(p.doneFacelets.length).toBe(p.stage.includes('corner') ? 12 : 8)
      expect(p.summary).toMatch(/^4 of 4 /)
    }
    expect(a.stageList.map((p) => p.stage)).toEqual([...STAGE_IDS])
  })

  it('solved cube in all 24 orientations', () => {
    for (const rot of CUBE_ROTATIONS) {
      const a = expectCurrent(applyAlg(SOLVED, rot), null)
      expect(a.solved).toBe(true)
    }
  })

  it('suggests the yellow-up hold', () => {
    expect(analyzeCube(SOLVED).hold.rotation).toEqual(['z2'])
    expect(analyzeCube(SOLVED).hold.alreadyHeld).toBe(false)
    expect(analyzeCube(HOLD).hold.rotation).toEqual([])
    expect(analyzeCube(HOLD).hold.alreadyHeld).toBe(true)
    for (const rot of CUBE_ROTATIONS) {
      const s = applyAlg(applyAlg(SOLVED, "R U F' L2 D B"), rot)
      const a = analyzeCube(s)
      expect(a.hold.rotation.length).toBeLessThanOrEqual(1)
      const held = applyAlg(s, a.hold.rotation)
      expect(findPiece(held, 'D').slot).toBe('U') // yellow centre on top
      expect(findPiece(held, 'U').slot).toBe('D') // white centre underneath
      expect(a.hold.rotation).toEqual(yellowUpRotation(s))
      expect(a.hold.description.length).toBeGreaterThan(10)
    }
  })

  it('a scrambled cube is on the daisy', () => {
    const s = applyAlg(SOLVED, "D2 F' L U2 R' B D L2 F U' R2 B' L D' F2 R U B2 L' D")
    const a = expectCurrent(s, 'daisy')
    expect(a.solved).toBe(false)
    expect(a.stages.daisy.done + a.stages.daisy.remainingPieces.length).toBe(4)
  })

  it('gives the same answer however the cube is held', () => {
    const rng = seededRng(77)
    const samples: CubeState[] = [
      before(alg('middle-right')),
      before(alg('yellow-cross')),
      before(alg('corner-cycle')),
      before("R' D' R D R' D' R D"),
      randomState(rng),
      randomState(rng),
    ]
    for (const s of samples) {
      const base = analyzeCube(s)
      for (const rot of CUBE_ROTATIONS) {
        const a = analyzeCube(applyAlg(s, rot))
        expect(a.current).toBe(base.current)
        expect(a.completed).toEqual(base.completed)
        expect(a.yellowCrossShape).toBe(base.yellowCrossShape)
        expect(a.twistInProgress).toEqual(base.twistInProgress)
        for (const id of STAGE_IDS) {
          expect(a.stages[id].done).toBe(base.stages[id].done)
          expect([...a.stages[id].donePieces].sort()).toEqual([...base.stages[id].donePieces].sort())
          expect(a.stages[id].goalMet).toBe(base.stages[id].goalMet)
        }
      }
    }
  })

  it('reports pieces, slots and facelets that agree with the cube', () => {
    const rng = seededRng(3)
    for (let i = 0; i < 50; i++) {
      const s = applyAlg(randomState(rng), CUBE_ROTATIONS[i % 24])
      const a = analyzeCube(s)
      for (const p of a.stageList) {
        expect(p.done).toBe(p.donePieces.length)
        expect(p.donePieces.length + p.remainingPieces.length).toBe(4)
        const facelets = (pieces: readonly string[]) =>
          pieces.flatMap((id) => findPiece(s, id as never).stickers.map((st) => st.facelet)).sort((x, y) => x - y)
        expect([...p.doneFacelets].sort((x, y) => x - y)).toEqual(facelets(p.donePieces))
        expect([...p.remainingFacelets].sort((x, y) => x - y)).toEqual(facelets(p.remainingPieces))
        if (p.stage !== 'daisy') expect(p.targetSlots).toEqual(p.remainingPieces.map((id) => homeSlot(s, id)))
        expect(p.summary).toContain(`${p.done} of 4`)
      }
      // `completed` is always a prefix and `current` the first stage after it.
      expect(a.completed).toEqual(stagesUpTo(a.current))
    }
  })
})

describe('daisy and white cross', () => {
  // Lifting all four cross edges with half turns makes a daisy whose petals sit over their own centres.
  const daisy = applyAlg(HOLD, 'F2 R2 B2 L2')

  it('recognises the classic daisy', () => {
    expect(isDaisy(daisy)).toBe(true)
    const a = expectCurrent(daisy, 'white-cross')
    expect(a.stages.daisy.done).toBe(4)
    expect(a.stages['white-cross'].done).toBe(0)
    expect(a.stages['white-cross'].targetSlots.sort()).toEqual(['DB', 'DF', 'DL', 'DR'])
    for (const e of ['UF', 'UR', 'UB', 'UL'] as const) expect(isPetal(daisy, e)).toBe(true)
  })

  it('a daisy stays a daisy when the top is turned, and in any orientation', () => {
    for (const turn of ['U', "U'", 'U2']) expect(isDaisy(applyAlg(daisy, turn))).toBe(true)
    for (const rot of CUBE_ROTATIONS) {
      const s = applyAlg(applyAlg(daisy, 'U'), rot)
      expect(isDaisy(s)).toBe(true)
      expectCurrent(s, 'white-cross')
    }
  })

  it('half-dropped daisy (two petals, two cross edges) still counts as daisy done', () => {
    const s = applyAlg(daisy, 'F2 R2')
    expect(isDaisy(s)).toBe(false)
    const a = expectCurrent(s, 'white-cross')
    expect(a.stages.daisy.done).toBe(4)
    expect(a.stages['white-cross'].done).toBe(2)
    expect(a.stages['white-cross'].summary).toBe('2 of 4 white edges are in place.')
  })

  it('the finished cross has passed the daisy even though no petals remain', () => {
    expect(isDaisy(HOLD)).toBe(false)
    expect(isStageComplete(HOLD, 'daisy')).toBe(true)
    expect(isStageComplete(HOLD, 'daisy', { only: true })).toBe(true)
    // Cross done, everything else scrambled by moves that never touch the white face edges.
    const s = applyAlg(HOLD, "R U R' U' L' U2 L U F' U' F")
    const a = expectCurrent(s, 'white-corners')
    expect(a.stages.daisy.complete).toBe(true)
    expect(a.stages['white-cross'].done).toBe(4)
  })

  it('a petal with white facing sideways is not a petal', () => {
    const s = applyAlg(daisy, "F U' R U") // flips the front petal in place
    expect(findPiece(s, 'UF').slot[0]).toBe('U')
    expect(isPetal(s, 'UF')).toBe(false)
    expect(isDaisy(s)).toBe(false)
    const a = expectCurrent(s, 'daisy')
    expect(a.stages.daisy.done).toBe(3)
    expect(a.stages.daisy.remainingPieces).toEqual(['UF'])
    expect(a.stages.daisy.targetSlots.length).toBe(1) // the one free petal spot
    expect(a.stages.daisy.summary).toBe('3 of 4 white edges are petals next to the yellow centre.')
  })

  it('white edges on the white face but next to the wrong centres are not a cross', () => {
    // Swap the front and back cross edges: white still faces down everywhere.
    const s = applyAlg(HOLD, 'F2 U2 B2 U2 F2')
    for (const e of ['UF', 'UR', 'UB', 'UL'] as const) expect(findPiece(s, e).facing.white).toBe('D')
    expect(isStageComplete(s, 'white-cross')).toBe(false)
    const a = analyzeCube(s)
    expect(a.stages['white-cross'].done).toBe(2)
    expect(a.stages['white-cross'].goalMet).toBe(false)
    // Two edges are neither petals nor solved, so the way forward is back through the daisy.
    expect(a.current).toBe('daisy')
    expect(a.stages.daisy.done).toBe(2)
  })
})

describe('first two layers', () => {
  it('one white corner out', () => {
    const s = before(alg('white-corner-right'))
    const a = expectCurrent(s, 'white-corners')
    expect(a.stages['white-corners'].done).toBe(3)
    expect(a.stages['white-corners'].remainingPieces.length).toBe(1)
    expect(a.stages['white-corners'].targetSlots).toEqual(['DFR'])
    expect(a.stages['white-corners'].summary).toBe('3 of 4 white corners are in place.')
  })

  it('white corner in its slot but twisted', () => {
    const s = applyAlg(HOLD, "R U R' U' R U R' U'")
    const a = expectCurrent(s, 'white-corners')
    expect(a.stages['white-corners'].done).toBe(3)
    expect(findPiece(s, a.stages['white-corners'].remainingPieces[0]).slot).toBe('DFR')
  })

  it('one middle edge out', () => {
    for (const id of ['middle-right', 'middle-left']) {
      const a = expectCurrent(before(alg(id)), 'middle-layer')
      expect(a.stages['middle-layer'].done).toBe(3)
      expect(a.stages['white-corners'].complete).toBe(true)
      expect(a.stages['middle-layer'].summary).toBe('3 of 4 middle-layer edges are in place.')
    }
  })

  it('middle edge in its slot but flipped', () => {
    // Take the front-right edge out and put it back the other way round.
    const s = applyAlg(HOLD, [...alg('middle-right'), 'U2', ...alg('middle-right')])
    const a = expectCurrent(s, 'middle-layer')
    expect(a.stages['middle-layer'].done).toBe(3)
    const piece = a.stages['middle-layer'].remainingPieces[0]
    expect(findPiece(s, piece).slot).toBe(homeSlot(s, piece))
  })
})

describe('yellow cross: dot, L, line', () => {
  const yc = alg('yellow-cross')
  const line = before(yc)
  const ell = before(yc, yc)
  const dot = before(yc, yc, 'U2', yc)

  it.each([
    ['line', line, 2],
    ['L', ell, 2],
    ['dot', dot, 0],
  ] as const)('%s', (shape, state, up) => {
    const a = expectCurrent(state, 'yellow-cross')
    expect(a.yellowCrossShape).toBe(shape)
    expect(yellowCrossShape(state)).toBe(shape)
    expect(a.stages['yellow-cross'].done).toBe(up)
    expect(a.stages['middle-layer'].complete).toBe(true)
    for (const rot of CUBE_ROTATIONS) expect(yellowCrossShape(applyAlg(state, rot))).toBe(shape)
    for (const turn of ['U', "U'", 'U2']) expect(yellowCrossShape(applyAlg(state, turn))).toBe(shape)
  })

  it('cross', () => {
    expect(yellowCrossShape(HOLD)).toBe('cross')
    expect(yellowCrossShape(before(alg('sune')))).toBe('cross')
  })

  it('{ only: true } looks at the yellow edges alone', () => {
    const broken = applyAlg(HOLD, 'D') // bottom layer turned: the yellow cross is untouched
    expect(isStageComplete(broken, 'yellow-cross', { only: true })).toBe(true)
    expect(isStageComplete(broken, 'yellow-cross')).toBe(false)
    expect(analyzeCube(broken).stages['yellow-cross'].goalMet).toBe(true)
    expect(analyzeCube(broken).stages['yellow-cross'].complete).toBe(false)
    expect(isStageComplete(applyAlg(line, 'D'), 'yellow-cross', { only: true })).toBe(false)
  })
})

describe('yellow edges', () => {
  it('two edges need to swap', () => {
    const s = before(alg('yellow-edge-swap'))
    const a = expectCurrent(s, 'yellow-edges')
    expect(a.stages['yellow-edges'].done).toBe(2)
    expect(a.stages['yellow-cross'].complete).toBe(true)
    expect(a.topTurn).toBeNull()
    expect(a.stages['yellow-edges'].summary).toBe('2 of 4 yellow edges match their side centres.')
  })

  it('Sune setup: cross is yellow but the edges do not match', () => {
    expectCurrent(before(alg('sune')), 'yellow-edges')
  })

  it('a top layer that is only a turn away counts, and topTurn says which turn', () => {
    for (const [turn, fix] of [
      ['U', "U'"],
      ["U'", 'U'],
      ['U2', 'U2'],
    ]) {
      const s = applyAlg(HOLD, turn)
      expect(isSolved(s)).toBe(false)
      const a = expectCurrent(s, 'yellow-corners-orient')
      expect(a.topTurn).toBe(fix)
      expect(a.stages['yellow-edges'].done).toBe(4)
      expect(isStageComplete(s, 'yellow-edges')).toBe(true)
      expect(isStageComplete(s, 'yellow-edges', { aligned: true })).toBe(false)
      expect(isStageComplete(s, 'yellow-corners-position', { aligned: true })).toBe(false)
      expect(topLayerInfo(s).turnMoves).toEqual([fix])
    }
    expect(isStageComplete(HOLD, 'yellow-edges', { aligned: true })).toBe(true)
    expect(isStageComplete(HOLD, 'yellow-corners-position', { aligned: true })).toBe(true)
  })

  it('topTurn is expressed for the cube as it is held', () => {
    // White on top: the yellow face is D, so the fixing turn is a D move.
    const s = applyAlg(SOLVED, 'D')
    expect(analyzeCube(s).topTurn).toBe("D'")
    expect(isSolved(applyAlg(s, [analyzeCube(s).topTurn!]))).toBe(true)
  })
})

describe('yellow corners', () => {
  it('edges solved but corners in the wrong places', () => {
    const s = before(alg('corner-cycle'))
    const a = expectCurrent(s, 'yellow-corners-position')
    expect(a.stages['yellow-edges'].complete).toBe(true)
    expect(a.stages['yellow-edges'].done).toBe(4)
    expect(a.stages['yellow-corners-position'].done).toBe(1)
    expect(a.stages['yellow-corners-position'].summary).toBe('1 of 4 yellow corners is in its own place.')
    // ... and still so with the top turned.
    expectCurrent(applyAlg(s, 'U'), 'yellow-corners-position')
  })

  it('no corner in the right place', () => {
    const cyc = alg('corner-cycle')
    const s = before(cyc, 'y', cyc)
    const a = expectCurrent(s, 'yellow-corners-position')
    expect(a.stages['yellow-corners-position'].done).toBe(0)
  })

  it('corners positioned but twisted', () => {
    const s = before(getAlgorithm('corner-twist')!.demo.alg)
    const a = expectCurrent(s, 'yellow-corners-orient')
    expect(a.twistInProgress).toBeNull()
    expect(a.stages['yellow-corners-position'].complete).toBe(true)
    expect(a.stages['yellow-corners-position'].done).toBe(4)
    expect(a.stages['yellow-corners-orient'].done).toBe(2)
    expect(a.stages['yellow-corners-orient'].summary).toBe('2 of 4 yellow corners have yellow facing up.')
    expect(isStageComplete(s, 'yellow-corners-position')).toBe(true)
    expect(isStageComplete(s, 'yellow-corners-orient')).toBe(false)
    expect(isStageComplete(s, 'yellow-corners-orient', { only: true })).toBe(false)
    // Twisted corners with the top also turned: still the last stage.
    expectCurrent(applyAlg(s, "U'"), 'yellow-corners-orient')
  })

  it('{ only: true } for corner position ignores everything but the corners', () => {
    // Turn the middle belt: the edges no longer match anything, the corners are untouched.
    const s = applyAlg(HOLD, 'E')
    expect(isStageComplete(s, 'yellow-corners-position')).toBe(false)
    expect(isStageComplete(s, 'yellow-corners-position', { only: true })).toBe(true)
    expect(isStageComplete(applyAlg(s, 'U'), 'yellow-corners-position', { only: true })).toBe(true)
    expect(isStageComplete(applyAlg(s, 'U'), 'yellow-corners-position', { only: true, aligned: true })).toBe(false)
    expect(isStageComplete(before(alg('corner-cycle')), 'yellow-corners-position', { only: true })).toBe(false)
  })
})

describe('the corner twist in progress', () => {
  const twist = alg('corner-twist')
  const start = before(getAlgorithm('corner-twist')!.demo.alg)

  it('is recognised after every single twist, in any orientation', () => {
    // The demo: twist one corner twice, turn the top, twist the next four times, turn the top back.
    const chunks: (readonly string[])[] = [twist, twist, ['U'], twist, twist, twist, twist, ["U'"]]
    let s = start
    let twists = 0
    for (const chunk of chunks) {
      s = applyAlg(s, chunk as never)
      if (chunk === twist) twists++
      if (isSolved(s)) continue
      const a = analyzeCube(s)
      expect(a.current).toBe('yellow-corners-orient')
      expect(a.completed).toEqual(stagesUpTo('yellow-corners-orient'))
      if (twists % 6 === 0) {
        expect(a.twistInProgress).toBeNull()
        continue
      }
      expect(a.twistInProgress).toEqual({ twistsDone: twists % 6, twistsToRestore: 6 - (twists % 6) })
      expect(a.hold.alreadyHeld).toBe(true)
      // Literal predicates disagree on purpose: the white layer really is broken right now.
      expect(firstIncompleteStage(s)).not.toBe('yellow-corners-orient')
      expect(isStageComplete(s, 'white-corners')).toBe(false)
      for (const rot of CUBE_ROTATIONS) {
        const turned = applyAlg(s, rot)
        const b = analyzeCube(turned)
        expect(b.current).toBe('yellow-corners-orient')
        expect(b.twistInProgress).toEqual(a.twistInProgress)
        // The suggested hold brings the cube back to how it was being held.
        expect(applyAlg(turned, b.hold.rotation)).toBe(s)
      }
    }
    expect(twists).toBe(6)
    expect(isSolved(s)).toBe(true)
  })

  it('counts every lower-layer stage as done while twisting', () => {
    const s = applyAlg(start, [...twist, ...twist])
    const a = analyzeCube(s)
    expect(a.twistInProgress).toEqual({ twistsDone: 2, twistsToRestore: 4 })
    for (const id of stagesUpTo('yellow-corners-orient')) {
      expect(a.stages[id].complete).toBe(true)
      expect(a.stages[id].done).toBe(4)
    }
    expect(a.stages['yellow-corners-orient'].complete).toBe(false)
    expect(a.stages['yellow-corners-orient'].done).toBe(3)
  })

  it('is not triggered by ordinary cubes', () => {
    const rng = seededRng(11)
    for (let i = 0; i < 300; i++) expect(detectTwistPhase(randomState(rng))).toBeNull()
    expect(detectTwistPhase(SOLVED)).toBeNull()
    expect(detectTwistPhase(start)).toBeNull()
    expect(detectTwistPhase(before(alg('right-trigger')))).toBeNull()
  })
})

describe('isStageComplete', () => {
  it('is cumulative by default', () => {
    // Yellow face fully solved but the white layer turned: nothing counts.
    const s = applyAlg(HOLD, 'D')
    expect(isStageComplete(s, 'daisy')).toBe(false)
    for (const id of STAGE_IDS) expect(isStageComplete(s, id)).toBe(false)
    expect(isStageComplete(s, 'middle-layer', { only: true })).toBe(true)
    expect(isStageComplete(s, 'yellow-edges', { only: true })).toBe(true)
    expect(isStageComplete(s, 'yellow-corners-position', { only: true })).toBe(true)
    expect(isStageComplete(s, 'yellow-corners-orient', { only: true })).toBe(true)
    expect(isStageComplete(s, 'white-cross', { only: true })).toBe(false)
  })

  it('rejects unknown stages', () => {
    expect(() => isStageComplete(SOLVED, 'nope' as StageId)).toThrow()
  })

  it('works as the goal check of every algorithm demo', () => {
    for (const a of ALGORITHMS) {
      const setup = applyAlg(HOLD, a.demo.setup)
      expect(analyzeCube(setup).current, a.id).toBe(a.stage)
      expect(isStageComplete(setup, a.stage), a.id).toBe(false)
      const done = applyAlg(setup, a.demo.alg)
      expect(isStageComplete(done, a.stage), a.id).toBe(true)
      expect(analyzeCube(done).solved, a.id).toBe(true)
    }
  })

  it('agrees with analyzeCube on random cubes (no twist in progress)', () => {
    const rng = seededRng(21)
    for (let i = 0; i < 200; i++) {
      const s = applyAlg(randomState(rng), CUBE_ROTATIONS[i % 24])
      const a = analyzeCube(s)
      for (const id of STAGE_IDS) {
        expect(isStageComplete(s, id)).toBe(a.stages[id].complete)
        expect(isStageComplete(s, id, { only: true })).toBe(a.stages[id].goalMet)
      }
      expect(firstIncompleteStage(s)).toBe(a.current)
    }
  })

  it('handles cubes that were put together wrongly without throwing', () => {
    const arrays = toCubieArrays(SOLVED)
    arrays.eo[0] = 1 // one flipped edge: unsolvable, but still a cube made of real pieces
    const s = fromCubieArrays(arrays)
    const a = analyzeCube(s)
    expect(a.solved).toBe(false)
    expect(a.current).toBe('daisy')
  })
})
