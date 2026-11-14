import { beforeAll, describe, expect, it } from 'vitest'
import { applyAlg, CUBE_ROTATIONS, stateFromAlg } from '../moves'
import { FACE_MOVES, type FaceMove } from '../notation'
import { solveShallow, solveSync } from '../optimal/core'
import {
  createOptimalSolver,
  disposeOptimalSolver,
  isOptimalSolverReady,
  solveOptimal,
  warmUpOptimalSolver,
} from '../optimal/optimalSolver'
import { handleSolverRequest, type SolverRequest, type SolverResponse, type SolverTransport } from '../optimal/protocol'
import { fromCubieArrays, toCubieArrays } from '../pieces'
import { randomScramble, randomState } from '../scramble'
import { isSolved, isUpright, SOLVED, type CubeState } from '../state'
import { randomMoves, seededRng } from './helpers'

const SUPERFLIP = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2"

function expectSolves(state: CubeState, solution: readonly FaceMove[], maxLength = 22) {
  for (const m of solution) expect(FACE_MOVES).toContain(m)
  expect(solution.length).toBeLessThanOrEqual(maxLength)
  const end = applyAlg(state, solution)
  expect(isSolved(end)).toBe(true)
  // The cube stays in the orientation it was held in.
  for (let f = 0; f < 6; f++) expect(end[f * 9 + 4]).toBe(state[f * 9 + 4])
}

describe('optimal solver (async API)', () => {
  beforeAll(async () => {
    expect(isOptimalSolverReady()).toBe(false)
    await warmUpOptimalSolver()
    expect(isOptimalSolverReady()).toBe(true)
  }, 120_000)

  it('warmUp is idempotent', async () => {
    await warmUpOptimalSolver()
    await Promise.all([warmUpOptimalSolver(), warmUpOptimalSolver()])
    expect(isOptimalSolverReady()).toBe(true)
  })

  it('returns no moves for a solved cube, in any orientation', async () => {
    expect(await solveOptimal(SOLVED)).toEqual([])
    expect(await solveOptimal(applyAlg(SOLVED, 'x y'))).toEqual([])
  })

  it('solves 40 random scrambles in at most 22 face turns', async () => {
    const rng = seededRng(51)
    for (let i = 0; i < 40; i++) {
      const state = applyAlg(SOLVED, randomScramble({ rng }))
      expectSolves(state, await solveOptimal(state))
    }
  }, 120_000)

  it('solves 20 uniformly random states', async () => {
    const rng = seededRng(52)
    for (let i = 0; i < 20; i++) {
      const state = randomState(rng)
      expectSolves(state, await solveOptimal(state))
    }
  }, 120_000)

  it('solves the superflip', async () => {
    const state = stateFromAlg(SUPERFLIP)
    expectSolves(state, await solveOptimal(state))
  }, 60_000)

  it('solves a scrambled cube held in each of the 24 orientations, without rotating it', async () => {
    const rng = seededRng(53)
    for (const rot of CUBE_ROTATIONS) {
      const state = applyAlg(applyAlg(SOLVED, randomScramble({ rng })), rot)
      expect(isUpright(state)).toBe(rot.length === 0)
      expectSolves(state, await solveOptimal(state))
    }
  }, 120_000)

  it('solves cubes scrambled with slices, wide moves and rotations', async () => {
    const rng = seededRng(54)
    for (let i = 0; i < 10; i++) {
      const state = applyAlg(SOLVED, randomMoves(rng, 30))
      expectSolves(state, await solveOptimal(state))
    }
  }, 120_000)

  it('finds the truly shortest solution for short scrambles', async () => {
    expect(await solveOptimal(stateFromAlg('R'))).toEqual(["R'"])
    expect(await solveOptimal(stateFromAlg('R2'))).toEqual(['R2'])
    expect(await solveOptimal(stateFromAlg("R U R' U'"))).toEqual(['U', 'R', "U'", "R'"])
    expect(await solveOptimal(stateFromAlg("F R U R' U' F'"))).toHaveLength(6)
    expect(await solveOptimal(stateFromAlg("R U R' U R U2 R'"))).toHaveLength(7)
    // Held differently: still 4 moves, and written for the cube as held.
    const held = applyAlg(stateFromAlg("R U R' U'"), 'z2')
    const solution = await solveOptimal(held)
    expect(solution).toHaveLength(4)
    expectSolves(held, solution, 4)
    const rng = seededRng(55)
    for (let i = 0; i < 30; i++) {
      const length = 1 + (i % 7)
      const state = applyAlg(SOLVED, randomScramble({ rng, length }))
      expectSolves(state, await solveOptimal(state), length)
    }
  }, 60_000)

  it('rejects an unsolvable cube instead of searching forever', async () => {
    const twisted = fromCubieArrays({ ...toCubieArrays(SOLVED), co: [1, 0, 0, 0, 0, 0, 0, 0] })
    await expect(solveOptimal(twisted)).rejects.toThrow(/cannot be solved/)
    await expect(solveOptimal('garbage' as CubeState)).rejects.toThrow()
    // ... and keeps working afterwards.
    expect(await solveOptimal(stateFromAlg('U'))).toEqual(["U'"])
  })

  it('answers concurrent requests correctly', async () => {
    const rng = seededRng(56)
    const states = Array.from({ length: 8 }, () => applyAlg(SOLVED, randomScramble({ rng })))
    const solutions = await Promise.all(states.map((s) => solveOptimal(s)))
    states.forEach((s, i) => expectSolves(s, solutions[i]))
  }, 60_000)

  it('can be disposed and restarts on demand', async () => {
    disposeOptimalSolver()
    expect(isOptimalSolverReady()).toBe(false)
    expect(await solveOptimal(stateFromAlg('F2'))).toEqual(['F2'])
  })
})

describe('solver core', () => {
  it('solveShallow is exact up to 7 moves and gives up beyond', () => {
    expect(solveShallow(SOLVED)).toEqual([])
    expect(solveShallow(stateFromAlg("R U R' U'"))).toHaveLength(4)
    expect(solveShallow(stateFromAlg("R U R' U R U2 R'"))).toHaveLength(7)
    expect(solveShallow(stateFromAlg(SUPERFLIP))).toBeNull()
    // The T-perm needs far more than 7 moves.
    expect(solveShallow(stateFromAlg("R U R' U' R' F R2 U' R' U' R U R' F'"))).toBeNull()
  })

  it('solveSync works without the async wrapper', () => {
    const state = stateFromAlg("L2 D' B U2 R F' L D2 B2 U R'")
    expectSolves(state, solveSync(state))
  })
})

describe('worker protocol', () => {
  const core = {
    initSolverSync: () => {},
    solveSync: (state: CubeState): FaceMove[] => {
      if (state !== SOLVED) throw new Error('boom')
      return ['R', "U'"]
    },
  }

  it('answers init and solve requests', () => {
    expect(handleSolverRequest(core, { id: 1, type: 'init' })).toEqual({ id: 1, ok: true, moves: null })
    expect(handleSolverRequest(core, { id: 2, type: 'solve', state: SOLVED })).toEqual({ id: 2, ok: true, moves: ['R', "U'"] })
  })

  it('turns exceptions into error responses', () => {
    expect(handleSolverRequest(core, { id: 3, type: 'solve', state: stateFromAlg('R') })).toEqual({
      id: 3,
      ok: false,
      error: 'boom',
    })
  })
})

describe('createOptimalSolver with a custom transport', () => {
  function fakeTransport() {
    const sent: SolverRequest[] = []
    let respond: (r: SolverResponse) => void = () => {}
    let fail: (e: Error) => void = () => {}
    let terminated = 0
    const transport: SolverTransport = {
      send: (r) => void sent.push(r),
      onResponse: (l) => void (respond = l),
      onFailure: (l) => void (fail = l),
      terminate: () => void terminated++,
    }
    return { transport, sent, respond: (r: SolverResponse) => respond(r), fail: (e: Error) => fail(e), terminated: () => terminated }
  }

  it('is lazy: nothing is created until first use', async () => {
    let created = 0
    const fake = fakeTransport()
    const solver = createOptimalSolver({
      createTransport: () => {
        created++
        return fake.transport
      },
    })
    expect(created).toBe(0)
    expect(solver.ready).toBe(false)
    const p = solver.solve(SOLVED)
    expect(created).toBe(1)
    expect(fake.sent).toEqual([{ id: 1, type: 'solve', state: SOLVED }])
    fake.respond({ id: 1, ok: true, moves: ['R'] })
    expect(await p).toEqual(['R'])
    void solver.solve(SOLVED)
    expect(created).toBe(1)
  })

  it('matches out-of-order responses to their requests', async () => {
    const fake = fakeTransport()
    const solver = createOptimalSolver({ createTransport: () => fake.transport })
    const a = solver.solve(SOLVED)
    const b = solver.solve(stateFromAlg('R'))
    fake.respond({ id: 2, ok: true, moves: ["R'"] })
    fake.respond({ id: 1, ok: true, moves: [] })
    expect(await a).toEqual([])
    expect(await b).toEqual(["R'"])
  })

  it('rejects on error responses, and warmUp can be retried after a failure', async () => {
    const fake = fakeTransport()
    const solver = createOptimalSolver({ createTransport: () => fake.transport })
    const p = solver.solve(SOLVED)
    fake.respond({ id: 1, ok: false, error: 'nope' })
    await expect(p).rejects.toThrow('nope')
    const w = solver.warmUp()
    fake.respond({ id: 2, ok: false, error: 'no tables' })
    await expect(w).rejects.toThrow('no tables')
    expect(solver.ready).toBe(false)
    const w2 = solver.warmUp()
    fake.respond({ id: 3, ok: true, moves: null })
    await w2
    expect(solver.ready).toBe(true)
  })

  it('rejects everything pending when the worker dies or the solver is disposed', async () => {
    const fake = fakeTransport()
    let created = 0
    const solver = createOptimalSolver({
      createTransport: () => {
        created++
        return fake.transport
      },
    })
    const a = solver.solve(SOLVED)
    fake.fail(new Error('worker crashed'))
    await expect(a).rejects.toThrow('worker crashed')
    expect(fake.terminated()).toBe(1)
    const b = solver.solve(SOLVED)
    expect(created).toBe(2) // a fresh worker is made on the next call
    solver.dispose()
    await expect(b).rejects.toThrow('stopped')
    expect(fake.terminated()).toBe(2)
  })

  it('rejects if the transport cannot be created', async () => {
    const solver = createOptimalSolver({
      createTransport: () => {
        throw new Error('no workers here')
      },
    })
    await expect(solver.solve(SOLVED)).rejects.toThrow('no workers here')
  })
})
