/**
 * The bulk test of the beginner solver: thousands of cubes, every step and every stage verified.
 * It lives in its own file so that it runs in parallel with the other solver tests.
 */
import { describe, expect, it } from 'vitest'
import { SOLVED, applyAlg, randomScramble, randomState, solveBeginner, type BeginnerSolverOptions, type CubeState } from '../index'
import { randomMoves, seededRng } from './helpers'
import { randomStates, solveAll } from './solverChecks'

describe('solveBeginner: random cubes', () => {
  it('solves 5,000 uniformly random states, with every step and stage verified', () => {
    const stats = solveAll(randomStates(20240611, 5000))
    expect(stats.count).toBe(5000)
    // Recorded with this seed: mean 134.67 face turns, max 193, min 62; mean 36.8 steps, max 47.
    // The bounds are tight on purpose so that a regression in any stage shows up here.
    console.info('beginner solver, 5000 random states:', JSON.stringify(stats))
    expect(stats.mean).toBeGreaterThan(131)
    expect(stats.mean).toBeLessThan(137)
    expect(stats.max).toBeLessThanOrEqual(200)
    expect(stats.min).toBeGreaterThan(40)
    expect(stats.meanSteps).toBeLessThan(38)
    expect(stats.maxSteps).toBeLessThanOrEqual(52)
  }, 60_000)

  it('solves 2,000 random-move scrambles, short and long, some held any way round', () => {
    const rng = seededRng(987654)
    const states: CubeState[] = []
    // 1,000 standard 20-move scrambles.
    for (let i = 0; i < 1000; i++) states.push(applyAlg(SOLVED, randomScramble({ rng })))
    // 500 short scrambles (1–10 moves): mostly-solved cubes exercise the "already done" paths.
    for (let i = 0; i < 500; i++) states.push(applyAlg(SOLVED, randomScramble({ rng, length: 1 + (i % 10) })))
    // 500 sequences of any moves at all — slices, wide moves, rotations — so the cube ends up in any orientation.
    for (let i = 0; i < 500; i++) states.push(applyAlg(SOLVED, randomMoves(rng, 5 + (i % 40))))
    const stats = solveAll(states)
    expect(stats.count).toBe(2000)
    // Recorded: mean 128.3 (the short scrambles pull it down), max 186.
    console.info('beginner solver, 2000 scrambles:', JSON.stringify(stats))
    expect(stats.mean).toBeGreaterThan(123)
    expect(stats.mean).toBeLessThan(133)
    expect(stats.max).toBeLessThanOrEqual(200)
  }, 60_000)

  it("solves with the trigger-only white corner style ({ whiteCorners: 'trigger' })", () => {
    const options: BeginnerSolverOptions = { whiteCorners: 'trigger' }
    const stats = solveAll(randomStates(4242, 500), options)
    // Recorded: mean 163.2, max 238 — the price of knowing only one corner algorithm.
    console.info('beginner solver, trigger style, 500 states:', JSON.stringify(stats))
    expect(stats.mean).toBeGreaterThan(155)
    expect(stats.mean).toBeLessThan(170)
    expect(stats.max).toBeLessThanOrEqual(250)
    const rng = seededRng(4242)
    for (let i = 0; i < 100; i++) {
      const sol = solveBeginner(randomState(rng), options)
      const corner = sol.steps.filter((s) => s.stage === 'white-corners' && s.algorithm)
      expect(corner.length).toBeGreaterThan(0)
      for (const step of corner) {
        expect(['white-corner-insert', 'right-trigger']).toContain(step.algorithm!.id)
        expect(step.algorithm!.repetitions).toBeLessThanOrEqual(5)
      }
    }
  }, 30_000)

  it('is deterministic', () => {
    for (const s of randomStates(5, 50)) {
      expect(solveBeginner(s)).toEqual(solveBeginner(s))
    }
  })
})
