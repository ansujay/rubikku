import { describe, expect, it } from 'vitest'
import {
  ALGORITHMS,
  BeginnerSolverError,
  CUBE_ROTATIONS,
  FACE_MOVES,
  PATTERNS,
  SOLVED,
  analyzeCube,
  applyAlg,
  findPiece,
  flattenSolution,
  fromCubieArrays,
  getAlgorithm,
  invertAlg,
  isSolved,
  isStageComplete,
  nextBeginnerStep,
  nextHint,
  randomState,
  solutionStages,
  solveBeginner,
  toCubieArrays,
  type CubeState,
  type Move,
} from '../index'
import { seededRng } from './helpers'
import { HOLD, checkSolution, randomStates, stageIndex } from './solverChecks'

describe('solveBeginner: orientations', () => {
  it('solves from all 24 orientations', () => {
    const rng = seededRng(99)
    for (let i = 0; i < 12; i++) {
      const base = randomState(rng)
      for (const rot of CUBE_ROTATIONS) {
        const s = applyAlg(base, rot)
        const sol = solveBeginner(s)
        checkSolution(s, sol)
        const yellowUp = findPiece(s, 'D').slot === 'U'
        // Unless yellow is already on top, the very first step is "hold it like this".
        expect(sol.steps[0].kind === 'hold' && sol.steps[0].caseId.endsWith('/hold-yellow-up')).toBe(!yellowUp)
        if (!yellowUp) {
          expect(sol.steps[0].moves.length).toBe(1)
          expect(findPiece(sol.steps[0].after, 'D').slot).toBe('U')
        }
        // After that the yellow centre never leaves the top.
        for (const step of sol.steps.slice(1)) expect(findPiece(step.after, 'D').slot).toBe('U')
      }
    }
  }, 30_000)

  it('a solved cube needs no steps, however it is held', () => {
    for (const rot of CUBE_ROTATIONS) {
      const sol = solveBeginner(applyAlg(SOLVED, rot))
      expect(sol.steps).toEqual([])
      expect(sol.stages).toEqual([])
      expect(sol.moves).toEqual([])
      expect(sol.faceTurns).toBe(0)
      expect(sol.end).toBe(sol.start)
    }
  })
})

describe('solveBeginner: resuming', () => {
  it('never redoes a finished stage', () => {
    for (const start of randomStates(31337, 150)) {
      const sol = solveBeginner(start)
      for (const group of sol.stages) {
        const rest = solveBeginner(group.after)
        checkSolution(group.after, rest, 'none')
        for (const step of rest.steps) {
          expect(stageIndex(step.stage)).toBeGreaterThan(stageIndex(group.stage))
        }
        // In fact the rest of the solution is reproduced exactly.
        const expected = sol.steps.slice(sol.steps.indexOf(group.steps[group.steps.length - 1]) + 1)
        expect(rest.steps).toEqual(expected)
      }
    }
  }, 30_000)

  it('picks up identically from every step boundary', () => {
    for (const start of randomStates(8, 60)) {
      const sol = solveBeginner(start)
      sol.steps.forEach((step, i) => {
        expect(nextBeginnerStep(step.before)).toEqual(step)
        if (i % 5 === 0) expect(solveBeginner(step.after).steps).toEqual(sol.steps.slice(i + 1))
      })
      expect(nextBeginnerStep(sol.end)).toBeNull()
    }
  }, 30_000)

  it('resumes in the middle of the corner twist, after any number of twists', () => {
    const twist = getAlgorithm('corner-twist')!.moves
    let checked = 0
    for (const start of randomStates(555, 120)) {
      const sol = solveBeginner(start)
      const last = sol.stages[sol.stages.length - 1]
      if (last.stage !== 'yellow-corners-orient') continue
      for (const step of last.steps) {
        if (step.algorithm?.id !== 'corner-twist') continue
        let s = applyAlg(step.before, step.setup)
        for (let k = 1; k <= step.algorithm.repetitions; k++) {
          s = applyAlg(s, twist)
          if (isSolved(s)) continue
          const rest = solveBeginner(s)
          checkSolution(s, rest, 'none')
          // Only last-stage steps, no whole-cube turns, and no more work than finishing the stage.
          for (const r of rest.steps) {
            expect(r.stage).toBe('yellow-corners-orient')
            expect(r.kind).toBe('turn')
          }
          expect(rest.faceTurns).toBeLessThanOrEqual(last.faceTurns)
          expect(analyzeCube(s).current).toBe('yellow-corners-orient')
          checked++

          // Picked up and turned round mid-twist: first put it back, then carry on the same way.
          const turned = applyAlg(s, CUBE_ROTATIONS[1 + (checked % 23)])
          const again = solveBeginner(turned)
          expect(isSolved(again.end)).toBe(true)
          if (analyzeCube(s).twistInProgress) {
            expect(again.steps[0].kind).toBe('hold')
            expect(again.steps[0].after).toBe(s)
            expect(again.steps.slice(1)).toEqual(rest.steps)
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500)
  }, 30_000)

  it('white cross already done: no daisy or cross steps', () => {
    const s = applyAlg(HOLD, "R U R' U' L' U2 L U F' U' F R U2 R'")
    expect(isStageComplete(s, 'white-cross')).toBe(true)
    const sol = solveBeginner(s)
    checkSolution(s, sol)
    expect(solutionStages(sol)[0]).toBe('white-corners')
  })

  it('half-dropped daisy: only the remaining petals are dropped', () => {
    const s = applyAlg(HOLD, 'F2 R2 U') // two petals up (misaligned), two cross edges still home
    const sol = solveBeginner(s)
    checkSolution(s, sol)
    const cross = sol.stages[0]
    expect(cross.stage).toBe('white-cross')
    expect(cross.steps.filter((x) => x.algorithm?.id === 'white-cross-drop').length).toBe(2)
    expect(cross.faceTurns).toBeLessThanOrEqual(4)
  })

  it('only the last turn missing: one step', () => {
    for (const [turn, fix] of [
      ['U', "U'"],
      ["U'", 'U'],
      ['U2', 'U2'],
    ]) {
      const sol = solveBeginner(applyAlg(HOLD, turn))
      expect(sol.steps.length).toBe(1)
      expect(sol.steps[0].moves).toEqual([fix])
      expect(sol.steps[0].stage).toBe('yellow-corners-orient')
    }
  })
})

describe('solveBeginner: named positions', () => {
  it.each(PATTERNS.map((p) => [p.id, p] as const))('solves the %s pattern', (_id, pattern) => {
    const s = applyAlg(SOLVED, pattern.moves)
    const sol = solveBeginner(s)
    checkSolution(s, sol)
    expect(sol.faceTurns).toBeLessThanOrEqual(205)
  })

  it('uses each lesson algorithm on the cube its card demonstrates', () => {
    // For these, the demo setup is exactly one application away, and the solver must choose that algorithm.
    const direct = [
      'white-cross-drop',
      'white-corner-right',
      'white-corner-front',
      'white-corner-top',
      'middle-right',
      'middle-left',
      'yellow-cross',
      'yellow-edge-swap',
      'corner-cycle',
    ]
    for (const id of direct) {
      const entry = getAlgorithm(id)!
      const s = applyAlg(HOLD, entry.demo.setup)
      const sol = solveBeginner(s)
      checkSolution(s, sol)
      expect(sol.steps.length, id).toBe(1)
      expect(sol.steps[0].algorithm, id).toEqual({ id, name: entry.name, repetitions: 1, moves: [...entry.moves] })
      expect(sol.steps[0].stage, id).toBe(entry.stage)
      expect(sol.steps[0].moves, id).toEqual([...entry.moves])
    }
    // Every other demo is solved too, starting in the algorithm's own stage.
    for (const entry of ALGORITHMS) {
      const s = applyAlg(HOLD, entry.demo.setup)
      const sol = solveBeginner(s)
      checkSolution(s, sol)
      expect(sol.steps[0].stage, entry.id).toBe(entry.stage)
    }
  })

  it('the corner-twist demo is solved exactly as the card shows it', () => {
    const entry = getAlgorithm('corner-twist')!
    const sol = solveBeginner(applyAlg(HOLD, entry.demo.setup))
    expect(sol.moves.join(' ')).toBe(entry.demo.alg)
    expect(sol.steps.map((s) => s.algorithm?.repetitions)).toEqual([2, 4, undefined])
    expect(sol.steps.map((s) => s.setup)).toEqual([[], ['U'], []])
  })

  it("the trigger style solves the 'white-corner-insert' demo with triggers alone", () => {
    const entry = getAlgorithm('white-corner-insert')!
    const s = applyAlg(HOLD, entry.demo.setup)
    const sol = solveBeginner(s, { whiteCorners: 'trigger' })
    checkSolution(s, sol)
    expect(sol.steps.length).toBe(1)
    expect(sol.steps[0].algorithm).toMatchObject({ id: 'white-corner-insert', repetitions: 3 })
  })

  it('yellow cross from the dot takes three rounds, from the L two, from the line one', () => {
    const yc = getAlgorithm('yellow-cross')!.moves
    const undo = (s: CubeState, moves: readonly Move[] | string) => applyAlg(s, invertAlg(moves))
    const line = undo(HOLD, yc)
    const ell = undo(line, yc)
    const dot = undo(undo(ell, 'U2'), yc)
    for (const [state, cases] of [
      [line, ['line']],
      [ell, ['L', 'line']],
      [dot, ['dot', 'L', 'line']],
    ] as const) {
      const sol = solveBeginner(state)
      checkSolution(state, sol)
      const steps = sol.steps.filter((s) => s.stage === 'yellow-cross')
      expect(steps.map((s) => s.caseId)).toEqual(cases.map((c) => `yellow-cross/${c}`))
      for (const s of steps) expect(s.algorithm).toMatchObject({ id: 'yellow-cross', repetitions: 1 })
    }
  })
})

describe('steps are teachable', () => {
  const solutions = [...randomStates(2718, 300)].map((s) => solveBeginner(s))
  const steps = solutions.flatMap((s) => s.steps)

  it('covers every case of the method in a few hundred solves', () => {
    const cases = new Set(steps.map((s) => s.caseId))
    for (const expected of [
      'daisy/hold-yellow-up',
      'daisy/middle',
      'daisy/bottom',
      'daisy/top-flipped',
      'daisy/bottom-flipped',
      'white-cross/drop',
      'white-cross/face-next-petal',
      'white-corners/face-home',
      'white-corners/insert-right',
      'white-corners/insert-front',
      'white-corners/insert-top',
      'white-corners/face-stuck',
      'white-corners/pop-twisted',
      'white-corners/pop-wrong-slot',
      'middle-layer/face-centre',
      'middle-layer/insert-right',
      'middle-layer/insert-left',
      'middle-layer/kick-out-flipped',
      'middle-layer/kick-out-wrong-slot',
      'middle-layer/face-stuck',
      'yellow-cross/dot',
      'yellow-cross/L',
      'yellow-cross/line',
      'yellow-edges/match-two',
      'yellow-edges/face-swap',
      'yellow-edges/swap',
      'yellow-edges/swap-opposite',
      'yellow-corners-position/line-up',
      'yellow-corners-position/cycle-none-home',
      'yellow-corners-position/face-home-corner',
      'yellow-corners-position/cycle',
      'yellow-corners-position/cycle-twice',
      'yellow-corners-orient/face-twisted',
      'yellow-corners-orient/twist',
      'yellow-corners-orient/next-corner',
      'yellow-corners-orient/final-turn',
    ]) {
      expect(cases, expected).toContain(expected)
    }
  })

  it('every step has a case name and an explanation a person can follow', () => {
    for (const step of steps) {
      expect(step.caseName.length).toBeGreaterThanOrEqual(8)
      expect(step.caseName.length).toBeLessThan(70)
      expect(step.explanation.length).toBeGreaterThan(40)
      expect(step.explanation.length).toBeLessThan(520)
      expect(step.explanation).toMatch(/[.!]$/)
      expect(step.explanation).not.toMatch(/ {2}|\.\.|undefined/)
      // Turn steps always say which moves to make; a named algorithm is spelled out.
      if (step.algorithm) expect(step.explanation).toContain(getAlgorithm(step.algorithm.id)!.alg)
      else if (step.kind === 'turn') expect(step.explanation).toContain(`(${step.main.join(' ')})`)
      if (step.setup.length) expect(step.explanation).toContain(`(${step.setup.join(' ')})`)
    }
  })

  it('highlights real pieces, with facelets that match the cube before the step', () => {
    for (const step of steps) {
      if (!step.caseId.endsWith('/face-working-column')) expect(step.highlight.pieces.length).toBeGreaterThan(0)
      const facelets = step.highlight.pieces
        .flatMap((p) => findPiece(step.before, p).stickers.map((s) => s.facelet))
        .sort((a, b) => a - b)
      expect(step.highlight.facelets).toEqual(facelets)
      expect(new Set(step.highlight.pieces).size).toBe(step.highlight.pieces.length)
    }
  })

  it('a step with a single target slot puts its piece there', () => {
    let checked = 0
    for (const step of steps) {
      if (step.kind !== 'turn' || step.highlight.targets.length !== 1 || step.highlight.pieces.length !== 1) continue
      if (step.stage === 'white-cross') continue // its second highlighted piece is the centre
      expect(findPiece(step.after, step.highlight.pieces[0]).slot, step.caseId).toBe(step.highlight.targets[0])
      checked++
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('white corner and middle edge inserts solve the piece they talk about', () => {
    for (const step of steps) {
      if (/\/insert-/.test(step.caseId)) {
        expect(findPiece(step.before, step.highlight.pieces[0]).solved).toBe(false)
        expect(findPiece(step.after, step.highlight.pieces[0]).solved).toBe(true)
      }
      if (step.caseId === 'white-cross/drop') expect(findPiece(step.after, step.highlight.pieces[0]).solved).toBe(true)
    }
  })

  it('uses only algorithms from the library, each in its own stage or a later one', () => {
    const used = new Set<string>()
    for (const step of steps) {
      if (!step.algorithm) continue
      used.add(step.algorithm.id)
      expect(stageIndex(getAlgorithm(step.algorithm.id)!.stage)).toBeLessThanOrEqual(stageIndex(step.stage))
    }
    expect([...used].sort()).toEqual(
      [
        'corner-cycle',
        'corner-twist',
        'middle-left',
        'middle-right',
        'right-trigger',
        'white-corner-front',
        'white-corner-right',
        'white-corner-top',
        'white-cross-drop',
        'yellow-cross',
        'yellow-edge-swap',
      ].sort(),
    )
  })
})

describe('flattenSolution', () => {
  it('gives face turns only that solve the cube without ever turning it round', () => {
    const rng = seededRng(64)
    for (let i = 0; i < 100; i++) {
      const s = applyAlg(randomState(rng), CUBE_ROTATIONS[i % 24])
      const sol = solveBeginner(s)
      const flat = flattenSolution(sol)
      expect(flat.moves.every((m) => (FACE_MOVES as readonly string[]).includes(m))).toBe(true)
      expect(flat.faceTurns).toBe(sol.faceTurns)
      expect(flat.moves.length).toBe(sol.faceTurns)
      expect(isSolved(applyAlg(s, flat.moves))).toBe(true)
      expect(applyAlg(applyAlg(s, flat.moves), flat.rotation)).toBe(sol.end)

      const short = flattenSolution(sol, { simplify: true })
      expect(short.faceTurns).toBeLessThanOrEqual(flat.faceTurns)
      expect(applyAlg(s, short.moves)).toBe(applyAlg(s, flat.moves))
      expect(flattenSolution(sol.moves)).toEqual(flat)
    }
  })
})

describe('nextHint', () => {
  it('says so when the cube is solved', () => {
    const hint = nextHint(applyAlg(SOLVED, 'x y'))
    expect(hint.solved).toBe(true)
    expect(hint.step).toBeNull()
    expect(hint.stage).toBeNull()
    expect(hint.message.length).toBeGreaterThan(5)
  })

  it('is the first step of the full solution', () => {
    for (const s of randomStates(73, 100)) {
      const hint = nextHint(s)
      const sol = solveBeginner(s)
      expect(hint.solved).toBe(false)
      expect(hint.step).toEqual(sol.steps[0])
      expect(hint.stage).toBe(sol.steps[0].stage)
      expect(hint.message).toBe(sol.steps[0].caseName)
    }
  })

  it('following hints move by move always gets there', () => {
    for (const start of randomStates(1234, 40)) {
      let s = start
      let guard = 0
      for (let hint = nextHint(s); !hint.solved; hint = nextHint(s)) {
        s = hint.step!.after
        if (++guard > 100) throw new Error(`Hints do not converge: ${start}`)
      }
      expect(isSolved(s)).toBe(true)
    }
  })

  it('is cheap enough to call after every move', () => {
    const states = [...randomStates(5150, 200)].flatMap((s) => solveBeginner(s).steps.map((x) => x.before))
    const t0 = performance.now()
    for (const s of states) nextHint(s)
    const perCall = (performance.now() - t0) / states.length
    expect(states.length).toBeGreaterThan(5000)
    expect(perCall).toBeLessThan(1) // milliseconds; typically ~0.03
  })
})

describe('impossible cubes', () => {
  function tampered(change: (a: ReturnType<typeof toCubieArrays>) => void): CubeState {
    const arrays = toCubieArrays(applyAlg(SOLVED, "R U2 F' L D B2 R' U F2 D' L2 B"))
    change(arrays)
    return fromCubieArrays(arrays)
  }

  it.each([
    ['a flipped edge', (a: ReturnType<typeof toCubieArrays>) => void (a.eo[3] ^= 1)],
    ['a twisted corner', (a: ReturnType<typeof toCubieArrays>) => void (a.co[2] = (a.co[2] + 1) % 3)],
    ['two swapped edges', (a: ReturnType<typeof toCubieArrays>) => void ([a.ep[0], a.ep[5]] = [a.ep[5], a.ep[0]])],
    ['two swapped corners', (a: ReturnType<typeof toCubieArrays>) => void ([a.cp[1], a.cp[6]] = [a.cp[6], a.cp[1]])],
  ])('throws BeginnerSolverError instead of looping on %s', (_name, change) => {
    const s = tampered(change)
    let error: unknown
    try {
      solveBeginner(s)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(BeginnerSolverError)
    expect((error as BeginnerSolverError).state).toMatch(/^[URFDLB]{54}$/)
    expect((error as BeginnerSolverError).message).toContain('state: ')
  })

  it('throws on every kind of tampering, for many cubes, without ever hanging', () => {
    const rng = seededRng(404)
    for (let i = 0; i < 300; i++) {
      const arrays = toCubieArrays(randomState(rng))
      const kind = i % 3
      if (kind === 0) arrays.eo[i % 12] ^= 1
      else if (kind === 1) arrays.co[i % 8] = (arrays.co[i % 8] + 1 + (i % 2)) % 3
      else [arrays.ep[i % 12], arrays.ep[(i + 5) % 12]] = [arrays.ep[(i + 5) % 12], arrays.ep[i % 12]]
      expect(() => solveBeginner(fromCubieArrays(arrays))).toThrow(BeginnerSolverError)
    }
  })
})
