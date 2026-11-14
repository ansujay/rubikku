/**
 * Every claim a lesson makes is checked here against the engine: each beat's cube can be built,
 * each demo and exercise does what it says, every solver case is taught somewhere, and drills
 * are real, unfinished, solvable cubes.
 */
import { describe, expect, it } from 'vitest'
import {
  ALGORITHMS,
  analyzeCube,
  applyAlg,
  BEGINNER_HOLD,
  centerColors,
  getAlgorithm,
  isSolved,
  isStageComplete,
  nextBeginnerStep,
  parseAlg,
  pieceAt,
  randomState,
  seededRng,
  solveBeginner,
  SOLVED,
  STAGE_IDS as ENGINE_STAGE_IDS,
  yellowCrossShape,
  followMove,
  followState,
  invertMove,
  moveAmount,
  moveBase,
  startFollow,
  type CubeState,
  type Move,
  type StageId,
  type StepFollower,
  findPiece,
  applyMove,
} from '../../cube'
import { STAGE_IDS as STORE_STAGE_IDS, STAGES } from '../../store/stages'
import { lessonTodo } from './completion'
import { beatPlay, LESSONS, PATH_IDS, RECOVERY_RULES, type Beat, type Lesson } from './content'
import { emptyDrill, emptyLesson, isMastered } from './learnStore'
import { resolveHighlight } from './player/highlight'
import { capstoneState, checkOutcomes, DRILL_HARD, drillState, drillTags, drillWants, excursion, excursionWords, followPath, HELD, neutralSegments, outcomeReached, resolvePlay, resolveScene, solverSteps, solveToStage, stageDone, stepsUntil } from './engine'

const beats: [string, Lesson, Beat][] = LESSONS.flatMap((lesson) => lesson.beats.map((beat) => [`${lesson.id}/${beat.id}`, lesson, beat] as [string, Lesson, Beat]))

/** Every case id the solver can produce, found by solving many cubes both ways plus the special situations. */
function allSolverCases(): Set<string> {
  const seen = new Set<string>()
  for (const trigger of [false, true]) {
    for (let seed = 0; seed < 400; seed++) {
      for (const step of solverSteps(applyAlg(randomState(seededRng(`cases-${seed}`)), BEGINNER_HOLD), trigger)) seen.add(step.caseId)
    }
  }
  for (let seed = 0; seed < 40; seed++) {
    // Not held with yellow on top; half-way through a corner twist; and the cube turned mid-twist.
    seen.add(nextBeginnerStep(randomState(seededRng(`up-${seed}`)))!.caseId)
    const twisting = solveToStage(applyAlg(randomState(seededRng(`tw-${seed}`)), BEGINNER_HOLD), 'yellow-corners-orient')
    for (const step of solverSteps(twisting)) {
      if (step.caseId !== 'yellow-corners-orient/twist') continue
      seen.add(nextBeginnerStep(applyAlg(step.before, "R' D' R D"))!.caseId)
      seen.add(nextBeginnerStep(applyAlg(step.before, "R' D' R D R' D' R D y"))!.caseId)
      break
    }
  }
  return seen
}

describe('the lesson catalogue', () => {
  it('has the same stage ids in the engine and the store, and one lesson per stage', () => {
    expect([...STORE_STAGE_IDS]).toEqual([...ENGINE_STAGE_IDS])
    expect(LESSONS.map((l) => l.id)).toEqual(['primer', ...ENGINE_STAGE_IDS])
    expect(PATH_IDS[PATH_IDS.length - 1]).toBe('full-solve')
    for (const stage of STAGES) {
      const lesson = LESSONS.find((l) => l.id === stage.id)!
      expect(lesson.number).toBe(stage.number)
      expect(lesson.title).toBe(stage.title)
      expect(lesson.goal).toBe(stage.goal)
    }
  })

  it.each(LESSONS.map((l) => [l.id, l] as const))('%s is well formed', (_id, lesson) => {
    const ids = lesson.beats.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    const sections = lesson.sections.map((s) => s.id)
    // Beats use known sections, in order, and every section has at least one beat.
    const order = lesson.beats.map((b) => sections.indexOf(b.section))
    expect(order.every((n) => n >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(new Set(order).size).toBe(sections.length)
    expect(lesson.beats[lesson.beats.length - 1].kind).toBe('wrap')
    for (const id of lesson.algorithms) expect(getAlgorithm(id), id).toBeDefined()
    expect(lesson.learned.length).toBeGreaterThanOrEqual(3)
    expect(lesson.troubles.length).toBeGreaterThanOrEqual(3)
    expect(lesson.troubles.length).toBeLessThanOrEqual(4)
    for (const beat of lesson.beats) {
      expect(beat.title.length).toBeGreaterThan(3)
      expect(beat.body.length).toBeGreaterThan(0)
      for (const text of [...beat.body, beat.tip ?? '']) {
        // Balanced markup; notation in backticks parses.
        expect((text.match(/\*\*/g)?.length ?? 0) % 2, text).toBe(0)
        const ticks = text.split('`')
        expect(ticks.length % 2, text).toBe(1)
        ticks.filter((_, i) => i % 2 === 1).forEach((alg) => expect(() => parseAlg(alg), alg).not.toThrow())
      }
    }
    if (lesson.number > 0) {
      const kinds = lesson.beats.map((b) => b.kind)
      expect(kinds[0]).toBe('goal')
      expect(kinds.filter((k) => k === 'drill')).toHaveLength(1)
      const guided = lesson.beats.filter((b) => b.kind === 'guided' && b.section === 'turn' && !b.reps)
      // The scaffolding fades: all moves, then names only, then nothing.
      expect(guided.map((b) => (b.kind === 'guided' ? b.scaffold : ''))).toEqual(['full', 'name', 'none'])
      // A "Which is it?" round comes before the exercises, and "Now on your cube" after the drills.
      const quiz = kinds.indexOf('quiz')
      expect(quiz, `${lesson.id}: a recognition round`).toBeGreaterThan(0)
      expect(quiz).toBeLessThan(lesson.beats.findIndex((b) => b.kind === 'guided' && b.section === 'turn'))
      const real = lesson.beats.filter((b) => b.kind === 'real')
      expect(real, `${lesson.id}: one real-cube step`).toHaveLength(1)
      expect(lesson.beats.indexOf(real[0])).toBeGreaterThan(kinds.indexOf('drill'))
      if (real[0].kind === 'real') expect(real[0].picture).toBe(lesson.id === 'yellow-corners-orient' ? null : lesson.id)
    }
    for (const beat of lesson.beats) {
      if (beat.kind === 'real') {
        expect(beat.steps.length).toBeGreaterThanOrEqual(3)
        expect(beat.checks.length).toBeGreaterThanOrEqual(2)
        for (const text of [...beat.steps, ...beat.checks, beat.done]) {
          const ticks = text.split('`')
          expect(ticks.length % 2, text).toBe(1)
          ticks.filter((_, i) => i % 2 === 1).forEach((alg) => expect(() => parseAlg(alg), alg).not.toThrow())
        }
      }
    }
  })

  it('the real cube: from the primer on he is told to keep it in hand, held one way', () => {
    const primer = LESSONS[0]
    expect(primer.beats[0].body.join(' ')).toMatch(/your own cube/i)
    const hold = primer.beats.find((b) => b.id === 'hold')!
    expect(hold.body.join(' ')).toMatch(/yellow centre on top, white underneath\. Always\./)
    // One hold, everywhere: no lesson text tells him to keep green in front for good, or to hold
    // white on top without saying that yellow goes back on top to solve.
    for (const lesson of LESSONS) {
      for (const beat of lesson.beats) {
        const texts = [...beat.body, beat.tip ?? '', ...(beat.kind === 'real' ? [...beat.steps, ...beat.checks] : [])]
        for (const text of texts) {
          expect(text, `${lesson.id}/${beat.id}`).not.toMatch(/for the whole method[^.]*green/i)
          if (/white (centre )?on top/i.test(text)) expect(text, `${lesson.id}/${beat.id}`).toMatch(/yellow/i)
        }
      }
      // "Stuck?" never sends him to a button his real cube does not have.
      for (const trouble of lesson.troubles) expect(trouble.fix, `${lesson.id}: ${trouble.problem}`).not.toMatch(/tap hint|hint button/i)
    }
  })

  it('teaches every algorithm of a stage in that stage (shown in a demo or listed in the wrap-up)', () => {
    for (const algorithm of ALGORITHMS) {
      const lesson = LESSONS.find((l) => l.id === algorithm.stage)!
      expect(lesson.algorithms, algorithm.id).toContain(algorithm.id)
    }
  })
})

describe('every beat', () => {
  it.each(beats)('%s starts from a real cube and does what it claims', (_name, lesson, beat) => {
    if (beat.kind === 'info') {
      const start = resolveScene(beat.scene)
      expect(analyzeCube(start).state).toBe(start)
      if (lesson.number > 0 || beat.id !== 'layers') expect(centerColors(start).U === 'yellow' || beat.id === 'edges-upright').toBe(true)
      if (beat.show) {
        const after = applyAlg(start, beat.show.alg)
        expect(checkOutcomes(beat.show.outcome, start, after)).toBe(true)
      }
      if (typeof beat.view?.highlight === 'string') expect(nextBeginnerStep(start)).not.toBeNull()
      return
    }
    if (beat.kind === 'quiz' || beat.kind === 'real' || beat.kind === 'drill' || beat.kind === 'wrap') return
    const play = beatPlay(beat)
    if (!play) return
    const resolved = resolvePlay(play)
    expect(resolved.moves.length).toBeGreaterThan(0)
    expect(applyAlg(resolved.start, resolved.moves)).toBe(resolved.end)
    // Segments tile the moves exactly.
    expect(resolved.segments.flatMap((s) => s.moves)).toEqual(resolved.moves)
    resolved.segments.forEach((s) => expect(resolved.moves.slice(s.start, s.start + s.moves.length)).toEqual(s.moves))
    if (beat.kind === 'goal') {
      expect(checkOutcomes(beat.outcome, resolved.start, resolved.start)).toBe(false)
      expect(checkOutcomes(beat.outcome, resolved.start, resolved.end)).toBe(true)
      return
    }
    if (beat.kind !== 'demo' && beat.kind !== 'guided') return
    if (beat.cases) expect(resolved.steps.map((s) => s.caseId)).toEqual([...beat.cases])
    expect(checkOutcomes(beat.outcome, resolved.start, resolved.end), 'outcome after the moves').toBe(true)
    if (beat.kind === 'demo' && beat.algorithm) {
      const entry = getAlgorithm(beat.algorithm)!
      expect(resolved.moves.join(' ')).toContain(entry.moves.join(' '))
    }
    if (beat.kind === 'guided') {
      expect(checkOutcomes(beat.outcome, resolved.start, resolved.start), 'not already finished').toBe(false)
      if (resolved.steps.length === 0) {
        // Explicit moves: followed move by move, and following them completes it.
        const done: Move[] = []
        resolved.moves.forEach((move, i) => {
          expect(followPath(resolved.start, resolved.moves, done)).toMatchObject({ position: i, off: 0, complete: false })
          done.push(move)
        })
        expect(followPath(resolved.start, resolved.moves, done).complete).toBe(true)
        if (beat.reps) {
          expect(beat.reps).toBeGreaterThanOrEqual(3)
          expect(beat.play.algorithm, 'five in a row is for a named algorithm').toBeDefined()
        }
      } else {
        // Judged by result: the step follower (as the player runs it) accepts every move of the
        // plan, and the exercise counts as done exactly at the end of it.
        expect(beat.reps).toBeUndefined()
        const options = beat.play.trigger ? ({ whiteCorners: 'trigger' } as const) : {}
        let follower = startFollow(resolved.start, options)
        resolved.moves.forEach((move, i) => {
          expect(outcomeReached(beat.outcome, resolved.start, follower.state) && follower.position === 0, `${_name}: done too early at move ${i}`).toBe(false)
          follower = followMove(follower, move, options)
          expect(follower.status, `${_name}: move ${i + 1} (${move}) is on the plan`).not.toBe('off')
        })
        expect(follower.state).toBe(resolved.end)
        expect(outcomeReached(beat.outcome, resolved.start, follower.state)).toBe(true)
        expect(follower.position === 0 || follower.status === 'solved').toBe(true)
        // What the panel shows as still to do, from the start, is the whole plan.
        const ahead = stepsUntil(resolved.start, resolved.steps[0].after, beat.outcome, beat.play.trigger)
        expect([resolved.steps[0], ...ahead].map((s) => s.caseId)).toEqual(resolved.steps.map((s) => s.caseId))
      }
    }
  })

  it('covers every case the solver distinguishes', { timeout: 60_000 }, () => {
    const taught = new Set<string>()
    for (const [, , beat] of beats) {
      const play = beatPlay(beat)
      if (play) for (const step of resolvePlay(play).steps) taught.add(step.caseId)
      if (beat.kind === 'info' && (typeof beat.view?.highlight === 'string' || (typeof beat.view?.highlight === 'object' && beat.view.highlight.step))) taught.add(nextBeginnerStep(resolveScene(beat.scene))!.caseId)
    }
    const solver = allSolverCases()
    expect(solver.size).toBeGreaterThanOrEqual(36)
    const missing = [...solver].filter((id) => !taught.has(id) && !id.endsWith('/hold-yellow-up'))
    expect(missing).toEqual([])
    expect([...taught].some((id) => id.endsWith('/hold-yellow-up'))).toBe(true)
    // …and each stage's cases are taught in that stage's own lesson.
    for (const lesson of LESSONS.slice(1)) {
      const own = new Set<string>()
      for (const beat of lesson.beats) {
        if (beat.section !== 'idea' && beat.section !== 'cases' && beat.section !== 'faster') continue
        const play = beatPlay(beat)
        if (play) for (const step of resolvePlay(play).steps) own.add(step.caseId)
      }
      const wanted = [...solver].filter((id) => id.startsWith(`${lesson.id}/`) && !id.endsWith('/hold-yellow-up'))
      expect(wanted.filter((id) => !own.has(id)), lesson.id).toEqual([])
    }
  })
})

describe('claims made in the lesson text', () => {
  const trigger = "R U R' U'"
  const cross = "F R U R' U' F'"

  it('holds the cube yellow up, white down, green in front', () => {
    expect(centerColors(HELD)).toMatchObject({ U: 'yellow', D: 'white', F: 'green' })
    expect(isSolved(HELD)).toBe(true)
  })

  it('six Right Triggers put the cube back; a corner above its home needs 1, 3 or 5; a twisted one 2 or 4', () => {
    expect(applyAlg(HELD, `(${trigger})6`)).toBe(HELD)
    const home = pieceAt(HELD, 'DFR').piece
    const solvedAfter = (start: CubeState) => [1, 2, 3, 4, 5].filter((n) => pieceAt(applyAlg(start, `(${trigger})${n}`), 'DFR').piece === home && pieceAt(applyAlg(start, `(${trigger})${n}`), 'DFR').solved)
    expect(solvedAfter(applyAlg(HELD, `(${trigger})1`))).toEqual([5])
    expect(solvedAfter(applyAlg(HELD, `(${trigger})3`))).toEqual([3])
    expect(solvedAfter(applyAlg(HELD, `(${trigger})5`))).toEqual([1])
    expect(solvedAfter(applyAlg(HELD, `(${trigger})2`))).toEqual([4])
    expect(solvedAfter(applyAlg(HELD, `(${trigger})4`))).toEqual([2])
    // After one trigger the corner sits on top, right above its home.
    expect(pieceAt(applyAlg(HELD, trigger), 'URF').piece).toBe(home)
  })

  it('dropping a petal touches no other petal spot and no other cross edge', () => {
    const before = HELD
    const after = applyAlg(before, 'F2')
    for (const slot of ['UR', 'UB', 'UL', 'DR', 'DB', 'DL'] as const) expect(pieceAt(after, slot)).toEqual(pieceAt(before, slot))
  })

  it('the middle-layer insert first pairs the white corner with the edge, then puts both in', () => {
    const entry = getAlgorithm('middle-right')!
    const start = applyAlg(HELD, entry.demo.setup)
    const edge = pieceAt(start, 'UF').piece
    const corner = pieceAt(start, 'DFR').piece
    const half = applyAlg(start, entry.moves.slice(0, 4))
    expect(pieceAt(half, 'UF').piece).toBe(edge)
    expect(pieceAt(half, 'URF').piece).toBe(corner)
    const end = applyAlg(start, entry.moves)
    expect(pieceAt(end, 'FR').piece).toBe(edge)
    expect(isSolved(end)).toBe(true)
    // Going right the top turns left (U) first; going left it turns right (U').
    expect(entry.moves[0]).toBe('U')
    expect(getAlgorithm('middle-left')!.moves[0]).toBe("U'")
  })

  it('the yellow cross goes dot → L → line → cross, and the line after an L already lies left to right', () => {
    for (let seed = 0; seed < 60; seed++) {
      const start = solveToStage(applyAlg(randomState(seededRng(`yc-${seed}`)), BEGINNER_HOLD), 'yellow-cross')
      const order = ['dot', 'L', 'line', 'cross']
      let last = order.indexOf(yellowCrossShape(start))
      for (const step of solverSteps(start)) {
        if (step.stage !== 'yellow-cross') break
        const shape = order.indexOf(yellowCrossShape(step.after))
        expect(shape).toBe(last + 1)
        if (step.caseId === 'yellow-cross/L') expect(nextBeginnerStep(step.after)).toMatchObject({ caseId: 'yellow-cross/line', setup: [] })
        last = shape
      }
    }
  })

  it('a yellow shape must be held the right way to move on', () => {
    for (let seed = 0; seed < 30; seed++) {
      const start = solveToStage(applyAlg(randomState(seededRng(`hold-${seed}`)), BEGINNER_HOLD), 'yellow-cross')
      for (const step of solverSteps(start)) {
        if (step.stage !== 'yellow-cross') break
        if (step.caseId === 'yellow-cross/dot') continue
        const ready = applyAlg(step.before, step.setup)
        const want = step.caseId === 'yellow-cross/L' ? 'line' : 'cross'
        const have = yellowCrossShape(ready)
        expect(yellowCrossShape(applyAlg(ready, cross))).toBe(want)
        // Other holds: a line pointing at you falls back to a dot; an L a quarter turn out stays an L.
        const others = ['U', 'U2', "U'"].map((turn) => yellowCrossShape(applyAlg(applyAlg(ready, turn), cross)))
        expect(others).toEqual(have === 'line' ? ['dot', 'cross', 'dot'] : ['L', 'line', 'L'])
      }
    }
  })

  it('yellow edges: some turn of the top always matches exactly two (or all four)', () => {
    for (let seed = 0; seed < 80; seed++) {
      const start = solveToStage(applyAlg(randomState(seededRng(`ye-${seed}`)), BEGINNER_HOLD), 'yellow-edges')
      const counts = ['', 'U', 'U2', "U'"].map((turn) => (['UF', 'UR', 'UB', 'UL'] as const).filter((slot) => pieceAt(applyAlg(start, turn), slot).solved).length)
      expect(counts.includes(4) || counts.includes(2)).toBe(true)
      if (!counts.includes(4)) expect(Math.max(...counts)).toBe(2)
    }
  })

  it('yellow corners: one, none or all four are at home once the top is lined up; after a cycle from "none", exactly one is', () => {
    const homeCount = (state: CubeState) => analyzeCube(state).stages['yellow-corners-position'].done
    for (let seed = 0; seed < 80; seed++) {
      const start = solveToStage(applyAlg(randomState(seededRng(`yp-${seed}`)), BEGINNER_HOLD), 'yellow-corners-position')
      expect([0, 1, 4]).toContain(homeCount(start))
      for (const step of solverSteps(start)) {
        if (step.caseId === 'yellow-corners-position/cycle-none-home') expect(homeCount(step.after)).toBe(1)
        if (step.stage !== 'yellow-corners-position') break
      }
    }
  })

  it('a twisted corner needs 2 or 4 Corner Twists, the lower layers come back at the end, and half-way a white corner sits on the workbench', () => {
    for (let seed = 0; seed < 60; seed++) {
      const start = solveToStage(applyAlg(randomState(seededRng(`tw-${seed}`)), BEGINNER_HOLD), 'yellow-corners-orient')
      let total = 0
      for (const step of solverSteps(start)) {
        if (step.algorithm?.id === 'corner-twist') {
          if (step.caseId !== 'yellow-corners-orient/twist-continue') expect([2, 4]).toContain(step.algorithm.repetitions)
          total += step.algorithm.repetitions
          const afterOne = applyAlg(applyAlg(step.before, step.setup), "R' D' R D")
          expect(pieceAt(afterOne, 'URF').stickers.some((s) => s.color === 'white')).toBe(true)
        }
        expect(step.moves.every((m) => !'xyz'.includes(m[0])) || step.caseId.endsWith('/face-twisted')).toBe(true)
      }
      expect(total % 6).toBe(0)
      expect(isStageComplete(start, 'yellow-corners-position')).toBe(true)
    }
  })

  it('the primer "layers" beat shows a finished face that is not a finished layer', () => {
    const beat = LESSONS[0].beats.find((b) => b.id === 'layers')!
    if (beat.kind !== 'info') throw new Error('expected an info beat')
    const start = resolveScene(beat.scene)
    expect([27, 28, 29, 30, 31, 32, 33, 34, 35].every((i) => start[i] === start[31])).toBe(true)
    expect(isStageComplete(start, 'white-corners')).toBe(false)
    expect((['DF', 'DR', 'DB', 'DL', 'DFR', 'DLF', 'DBL', 'DRB'] as const).every((slot) => !pieceAt(start, slot).solved)).toBe(true)
  })
})

describe('following a path by hand', () => {
  const path = parseAlg("U2 R U R' y F2")
  it('counts quarter turns towards a half turn, either way round', () => {
    expect(followPath(HELD, path, ['U'])).toMatchObject({ position: 0, half: true, off: 0, complete: false })
    expect(followPath(HELD, path, ['U', 'U'])).toMatchObject({ position: 1, half: false, off: 0 })
    expect(followPath(HELD, path, ["U'", "U'"])).toMatchObject({ position: 1, half: false })
    expect(followPath(HELD, path, ['U2', 'R', 'U', "R'", 'y', 'F', 'F'])).toMatchObject({ position: 6, complete: true })
  })
  it('notices a wrong move and comes back when it is undone, by button or by hand', () => {
    expect(followPath(HELD, path, ['U2', 'F'])).toMatchObject({ position: 1, off: 1, wrong: 'F' })
    expect(followPath(HELD, path, ['U2', 'F', 'L'])).toMatchObject({ position: 1, off: 2, wrong: 'F' })
    expect(followPath(HELD, path, ['U2', 'F', "F'"])).toMatchObject({ position: 1, off: 0, wrong: null })
    expect(followPath(HELD, path, ['U2', 'R', "R'"])).toMatchObject({ position: 1, off: 0 })
    // A different move after one quarter of a half turn: one move off, and undoing it is half-way again.
    expect(followPath(HELD, path, ['U', 'R'])).toMatchObject({ position: 0, off: 1, half: false, wrong: 'R' })
    expect(followPath(HELD, path, ['U', 'R', "R'"])).toMatchObject({ position: 0, off: 0, half: true })
  })
})

describe('drills', () => {
  it.each(ENGINE_STAGE_IDS.map((s) => [s] as const))('%s drills are real cubes at the start of the stage, never done, always solvable by the method', (stage) => {
    const index = ENGINE_STAGE_IDS.indexOf(stage)
    const seen = new Set<CubeState>()
    for (let n = 0; n < 150; n++) {
      const state = drillState(stage, n)
      seen.add(state)
      expect(drillState(stage, n)).toBe(state)
      expect(centerColors(state).U).toBe('yellow')
      expect(stageDone(state, stage)).toBe(false)
      expect(analyzeCube(state).twistInProgress).toBeNull()
      for (const earlier of ENGINE_STAGE_IDS.slice(0, index)) expect(isStageComplete(state, earlier), earlier).toBe(true)
      const solution = solveBeginner(state)
      expect(isSolved(solution.end)).toBe(true)
      expect(solution.steps[0].stage).toBe(stage)
      // Following the method finishes the stage, and the app's goal check agrees.
      let current = state
      for (const step of solution.steps) {
        if (stageDone(current, stage)) break
        expect(step.stage).toBe(stage)
        current = step.after
      }
      expect(stageDone(current, stage)).toBe(true)
    }
    expect(seen.size).toBeGreaterThan(stage === 'yellow-cross' || stage === 'yellow-corners-orient' ? 20 : 100)
  })

  it('capstone scrambles are fully scrambled, held yellow up, and solvable', () => {
    for (let n = 0; n < 50; n++) {
      const state = capstoneState(n)
      expect(centerColors(state).U).toBe('yellow')
      expect(analyzeCube(state).completed).toEqual([])
      expect(isSolved(solveBeginner(state).end)).toBe(true)
      expect(state).not.toBe(SOLVED)
    }
  })
})

describe('guided exercises', () => {
  it('never line up the top with a turn that the algorithm\'s first move takes straight back', () => {
    // "U′ then U R U′ R′ …" is what the method does on some cubes (make the T, then the algorithm),
    // but an exercise that is being followed move by move should not start with a turn and its undo.
    const quarters = (move: Move) => Math.min(moveAmount(move), 4 - moveAmount(move))
    for (const [name, , beat] of beats) {
      if (beat.kind !== 'guided') continue
      for (const step of resolvePlay(beat.play).steps) {
        if (step.setup.length === 0 || moveBase(step.setup[0]) !== moveBase(step.main[0])) continue
        const net = (moveAmount(step.setup[0]) + moveAmount(step.main[0])) % 4
        expect(Math.min(net, 4 - net), `${name}: ${step.moves.join(' ')}`).toBe(quarters(step.setup[0]) + quarters(step.main[0]))
      }
    }
  })
})

describe('drills and the capstone with the coach following along', () => {
  const index = (stage: StageId) => ENGINE_STAGE_IDS.indexOf(stage)
  /** The panel's own rule for the red "Stage N has come undone" line (see DrillPanel). */
  const banner = (follower: StepFollower, stage: StageId): StageId | null => {
    const a = analyzeCube(follower.view)
    return !a.twistInProgress && a.current !== null && index(a.current) < index(stage) ? a.current : null
  }
  const asQuarters = (move: Move, n: number): Move[] => (moveAmount(move) === 2 ? Array<Move>(2).fill((n % 2 ? `${moveBase(move)}'` : moveBase(move)) as Move) : [move])

  it.each(ENGINE_STAGE_IDS.map((s) => [s] as const))(
    '%s drills solved by following the hints with quarter turns: no "come undone", no hint for an earlier stage, hint = the path',
    { timeout: 60_000 },
    (stage) => {
      let steps = 0
      for (let n = 0; n < 25; n++) {
        let follower = startFollow(drillState(stage, n))
        for (let guard = 0; guard < 60 && !stageDone(follower.state, stage); guard++) {
          const step = follower.step!
          expect(step.stage, `drill ${n}`).toBe(stage)
          expect(banner(follower, stage)).toBeNull()
          steps++
          step.moves.forEach((move, k) => {
            for (const turn of asQuarters(move, n + k)) {
              follower = followMove(follower, turn, { guiding: true })
              // The reviewer's checks, after every single turn: no banner, and the hint has not regressed.
              expect(banner(follower, stage), `drill ${n} ${step.caseId} [${step.moves.join(' ')}] after ${k + 1}`).toBeNull()
              expect(follower.status === 'off', `drill ${n} ${step.caseId} after ${k + 1}`).toBe(false)
              if (follower.step) expect(index(follower.step.stage)).toBeGreaterThanOrEqual(index(stage))
            }
          })
          expect(follower.completed?.caseId).toBe(step.caseId)
        }
        expect(stageDone(follower.state, stage)).toBe(true)
      }
      expect(steps).toBeGreaterThan(25)
    },
  )

  it('one wrong turn in the middle of a drill step: "undo that", then the same hint again (never the daisy)', () => {
    let slips = 0
    for (const stage of ENGINE_STAGE_IDS.slice(2)) {
      for (let n = 0; n < 6; n++) {
        let follower = startFollow(drillState(stage, n))
        const step = follower.step!
        for (let k = 1; k < step.moves.length; k++) {
          follower = followMove(follower, step.moves[k - 1], { guiding: true })
          if (follower.half) continue
          const wrong = (['L', 'B', 'D', 'R', 'F', 'U'] as Move[]).find((m) => m[0] !== step.moves[k][0] && m[0] !== step.moves[k - 1][0])!
          const slipped = followMove(follower, wrong, { guiding: true })
          slips++
          expect(slipped.status, `${stage} ${n} [${step.moves.join(' ')}] after ${k} + ${wrong}`).toBe('off')
          expect(slipped.step).toBe(follower.step)
          expect(slipped.next).toBe(invertMove(wrong))
          // Undo (the button changes the cube without naming a move).
          const back = followState(slipped, follower.state, { guiding: true })
          expect(back.step).toBe(follower.step)
          expect(back.position).toBe(k)
          expect(back.next).toBe(step.moves[k])
        }
      }
    }
    expect(slips).toBeGreaterThan(150)
  })

  it('a whole capstone solve by quarter turns: the tracker never goes backwards', { timeout: 60_000 }, () => {
    for (let n = 0; n < 8; n++) {
      let follower = startFollow(capstoneState(n))
      let furthest = 0
      for (let guard = 0; guard < 120 && follower.step; guard++) {
        const step = follower.step
        step.moves.forEach((move, k) => {
          for (const turn of asQuarters(move, n + k)) {
            follower = followMove(follower, turn, { guiding: guard % 2 === 0 })
            const shown = analyzeCube(follower.view).completed.length
            expect(shown, `capstone ${n} ${step.caseId} after ${k + 1}`).toBeGreaterThanOrEqual(furthest)
            furthest = Math.max(furthest, shown)
          }
        })
      }
      expect(isSolved(follower.state)).toBe(true)
    }
  })
})

describe('completing a lesson', () => {
  it('needs every exercise and recognition round done, and the stage done once for real — reaching the end is not enough', () => {
    for (const lesson of LESSONS) {
      const needed = lesson.beats.filter((b) => b.kind === 'guided' || b.kind === 'quiz')
      const hasDrill = lesson.beats.some((b) => b.kind === 'drill')
      const real = lesson.beats.find((b) => b.kind === 'real')
      expect(needed.length + (hasDrill ? 1 : 0), `${lesson.id} has something to do`).toBeGreaterThan(0)
      const none = lessonTodo(lesson, undefined)
      expect(none.earned).toBe(false)
      expect(none.done).toBe(0)
      expect(none.total).toBe(needed.length + (hasDrill ? 1 : 0))
      const all = Object.fromEntries(needed.map((b) => [b.id, true as const]))
      const exercisesOnly = lessonTodo(lesson, { done: all, drill: emptyDrill() })
      expect(exercisesOnly.earned).toBe(!hasDrill)
      expect(exercisesOnly.exercises).toEqual([])
      if (!hasDrill) continue
      expect(exercisesOnly.practice.map((b) => b.kind)).toEqual(['drill', 'real'])
      // A practice cube solved mostly by "Show me" does not count; one of his own does.
      expect(lessonTodo(lesson, { done: all, drill: { ...emptyDrill(), total: 3, own: 0 } }).earned).toBe(false)
      expect(lessonTodo(lesson, { done: all, drill: { ...emptyDrill(), total: 1, own: 1 } }).earned).toBe(true)
      // …or the stage done on his own cube.
      expect(lessonTodo(lesson, { done: all, drill: emptyDrill(), real: { [real!.id]: '2026-11-13T10:00:00.000Z' } }).earned).toBe(true)
      // Practice without the exercises (or without the round) is not enough either.
      for (const skipped of needed) {
        const missing = Object.fromEntries(needed.filter((b) => b !== skipped).map((b) => [b.id, true as const]))
        const todo = lessonTodo(lesson, { done: missing, drill: { ...emptyDrill(), total: 5, own: 5, clean: 5 } })
        expect(todo.earned, `${lesson.id} without ${skipped.id}`).toBe(false)
        expect(todo.exercises.map((b) => b.id)).toEqual([skipped.id])
      }
    }
  })
})

describe('what the text asks him to look at is on show', () => {
  // ("Check first: yellow centre on top" is about the hold, not a comparison.)
  const textOf = (beat: Beat) => [...beat.body, beat.tip ?? ''].join(' ').replace(/yellow centre on top/gi, '')

  it('a beat that says "compare with the centre(s)" keeps those centres lit; one that mentions the mirrors shows them', () => {
    for (const [name, , beat] of beats) {
      const text = textOf(beat)
      const spec = beat.view?.highlight
      if (spec && /\b(lit|compare|check)\b[^.]*\bcentres?\b|\bcentres?\b[^.]*\blit\b/i.test(text)) {
        const start = beat.kind === 'info' ? resolveScene(beat.scene) : beatPlay(beat) ? resolvePlay(beatPlay(beat)!).start : null
        if (!start) continue
        const play = beatPlay(beat) ? resolvePlay(beatPlay(beat)!) : null
        const light = resolveHighlight(spec, start, play, 0)
        const centres = [...(light?.slots ?? []), ...(light?.pieces ?? [])].filter((id) => id.length === 1)
        expect(light?.dimOthers === false || centres.length > 0 || (light?.facelets ?? []).some((f) => f % 9 === 4), `${name}: the text talks about a centre`).toBe(true)
      }
      // (A recognition round sets the mirrors per question; "mirror image" is a figure of speech.)
      if (/\bmirrors?\b(?! image)/i.test(text) && beat.kind !== 'quiz') expect(Boolean(beat.view?.mirrors) || beat.kind === 'drill', `${name}: the text mentions the mirrors`).toBe(true)
    }
  })

  it('stage 7: the "at home" example really is a twisted home corner, the contrast really is not home — with the colours the text names', () => {
    const lesson = LESSONS.find((l) => l.id === 'yellow-corners-position')!
    const home = lesson.beats.find((b) => b.id === 'home')!
    const notHome = lesson.beats.find((b) => b.id === 'not-home')!
    if (home.kind !== 'info' || notHome.kind !== 'info') throw new Error('info beats expected')
    const a = resolveScene(home.scene)
    const at = pieceAt(a, 'URF')
    const centres = centerColors(a)
    expect(at.solved).toBe(false)
    expect([...at.stickers.map((s) => s.color)].sort()).toEqual([centres.U, centres.F, centres.R].sort())
    const words = Object.fromEntries(at.stickers.map((s) => [s.face, s.color]))
    expect(home.body[1]).toContain(`**${words.U}** on top, **${words.F}** at the front, **${words.R}** on the right`)
    expect(home.body[1]).toContain(`**${centres.U}** on top, **${centres.F}** at the front, **${centres.R}** on the right`)
    const b = resolveScene(notHome.scene)
    const there = pieceAt(b, 'URF').stickers.map((s) => s.color)
    const round = centerColors(b)
    expect([...there].sort()).not.toEqual([round.U, round.F, round.R].sort())
    expect(notHome.body[0]).toContain(`**${['yellow', ...there.filter((c) => c !== 'yellow').sort((x, y) => notHome.body[0].indexOf(x) - notHome.body[0].indexOf(y))].join(', ').replace(/, ([a-z]+)$/, ' and $1')}**`)
    expect(notHome.body[0]).toContain(`**${['yellow', ...[round.F, round.R].sort((x, y) => notHome.body[0].lastIndexOf(x) - notHome.body[0].lastIndexOf(y))].join(', ').replace(/, ([a-z]+)$/, ' and $1')}**`)
  })

  it('the kick-out demos use the side the text names', () => {
    const lesson = LESSONS.find((l) => l.id === 'middle-layer')!
    for (const id of ['kick-wrong', 'kick-flipped']) {
      const beat = lesson.beats.find((b) => b.id === id)!
      const first = resolvePlay(beatPlay(beat)!).steps[0]
      expect(first.algorithm?.id, id).toBe('middle-right')
    }
  })
})

describe('free moves are not punished (stages 1 and 2 are judged by result)', () => {
  const exercises = LESSONS.filter((l) => l.id === 'daisy' || l.id === 'white-cross').flatMap((l) => l.beats.filter((b) => b.kind === 'guided' && b.section === 'turn'))

  it.each(exercises.map((b) => [b.id, b] as const))('%s: a turn of the top to look round is accepted, and the plan re-made from there still finishes', (_id, beat) => {
    if (beat.kind !== 'guided') throw new Error('guided')
    const play = resolvePlay(beat.play)
    expect(play.steps.length).toBeGreaterThan(0)
    for (const look of ['U', "U'", 'U2'] as Move[]) {
      let follower = startFollow(play.start)
      follower = followMove(follower, look)
      expect(follower.status, `${beat.id}: ${look} is not a mistake`).not.toBe('off')
      // Follow the re-made plan to the end.
      for (let guard = 0; guard < 40 && !(outcomeReached(beat.outcome, play.start, follower.state) && follower.position === 0); guard++) {
        const step = follower.step!
        for (const move of step.moves.slice(follower.position)) follower = followMove(follower, move)
      }
      expect(outcomeReached(beat.outcome, play.start, follower.state), `${beat.id} after ${look}`).toBe(true)
    }
  })

  it('the daisy accepts another order: any sound move is taken up and the daisy still gets built', () => {
    const daisy = LESSONS.find((l) => l.id === 'daisy')!
    for (const beat of daisy.beats) {
      if (beat.kind !== 'guided' || beat.section !== 'turn') continue
      const play = resolvePlay(beat.play)
      let tried = 0
      for (const move of ['F', "F'", 'R', "R'", 'L', "L'", 'B', "B'", 'D', "D'"] as Move[]) {
        const after = followMove(startFollow(play.start), move)
        if (after.status === 'off') {
          // Only a move that loses a petal is a slip.
          expect(analyzeCube(after.state).stages.daisy.done, `${beat.id}: ${move}`).toBeLessThan(analyzeCube(play.start).stages.daisy.done)
          continue
        }
        tried++
        let follower = after
        for (let guard = 0; guard < 40 && !isStageComplete(follower.state, 'daisy'); guard++) for (const m of follower.step!.moves.slice(follower.position)) follower = followMove(follower, m)
        expect(isStageComplete(follower.state, 'daisy'), `${beat.id} starting with ${move}`).toBe(true)
      }
      expect(tried, `${beat.id}: several first moves of his own are fine`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('review 2: what the lessons now promise', () => {
  const lessonOf = (id: string) => LESSONS.find((l) => l.id === id)!
  const beatOf = (lesson: string, id: string) => lessonOf(lesson).beats.find((b) => b.id === id)!

  it('every wrap-up card is taught in that lesson, or set apart as optional with a heading', () => {
    for (const lesson of LESSONS) {
      const taught = new Set<string>()
      for (const beat of lesson.beats) {
        if (beat.kind === 'demo' && beat.algorithm) taught.add(beat.algorithm)
        const play = beatPlay(beat)
        if (!play) continue
        if (play.algorithm) taught.add(play.algorithm)
        for (const step of resolvePlay(play).steps) if (step.algorithm) taught.add(step.algorithm.id)
      }
      const optional = lesson.optional ?? []
      for (const id of lesson.algorithms) {
        if (optional.includes(id)) continue
        expect(taught.has(id), `${lesson.id}: the wrap-up card "${id}" is never taught in the lesson`).toBe(true)
      }
      for (const id of optional) expect(lesson.algorithms, `${lesson.id}: optional ${id}`).toContain(id)
      if (optional.length > 0) {
        expect(lesson.optionalTitle, lesson.id).toMatch(/optional/i)
        expect(lesson.optionalNote, lesson.id).toBeTruthy()
      }
    }
    // The stray Sune: optional, and the note says how it relates to the Edge Swap (checked on the moves).
    const edges = lessonOf('yellow-edges')
    expect(edges.optional).toEqual(['sune'])
    expect(edges.optionalNote).toMatch(/Edge Swap is the Sune plus one more turn of the top/)
    expect([...getAlgorithm('sune')!.moves, 'U']).toEqual([...getAlgorithm('yellow-edge-swap')!.moves])
  })

  it('step names fit the stage, and names-only exercises never give a count away', () => {
    for (const [name, , beat] of beats) {
      const play = beatPlay(beat)
      if (!play) continue
      const resolved = resolvePlay(play)
      for (const segment of resolved.segments) {
        expect(segment.label, name).not.toBe('Turn the top to line it up')
        if (segment.kind === 'setup') expect(segment.label, `${name}: ${segment.step?.caseId}`).not.toBe('Turn the top')
      }
      if (beat.kind === 'guided' && beat.scaffold === 'name') {
        for (const segment of neutralSegments(resolved.segments)) {
          expect(segment.label, `${name}: names only`).not.toMatch(/×|White Corner Insert/)
          expect(segment.label, `${name}: names only`).not.toMatch(/goes to the (right|left)/)
        }
      }
    }
  })

  it('stage 4 "Right or left?": both centres on show (the left one in the mirror), and the target slot is not lit by whatever sits in it', () => {
    const beat = beatOf('middle-layer', 'which-way')
    expect(beat.view?.mirrors).toBe(true)
    if (beat.kind !== 'info') throw new Error('info')
    const start = resolveScene(beat.scene)
    const light = resolveHighlight(beat.view?.highlight, start, null, 0)!
    expect(light.slots).toEqual(expect.arrayContaining(['F', 'R', 'L']))
    expect(light.slots).not.toContain('FR')
    expect(light.slots).not.toContain('FL')
    expect(beat.body.join(' ')).toMatch(/left one is in the mirror/)
    // The same for "Every corner has one home": the corner and the centres, not its home's occupant.
    const home = beatOf('white-corners', 'home')
    if (home.kind !== 'info') throw new Error('info')
    const homeLight = resolveHighlight(home.view?.highlight, resolveScene(home.scene), null, 0)!
    expect(homeLight.slots?.some((slot) => slot.length === 3)).toBe(false)
    // …and that corner really is right above its home.
    const step = nextBeginnerStep(resolveScene(home.scene))!
    expect(step.setup).toEqual([])
    expect(step.highlight.targets).toEqual(['DFR'])
    expect(findPiece(resolveScene(home.scene), step.highlight.pieces[0]).slot).toBe('URF')
  })

  it('stage 4 "Its centre is on another side?": the lit edge\'s side colour really is not the front centre\'s', () => {
    const beat = beatOf('middle-layer', 'face-centre')
    const play = resolvePlay(beatPlay(beat)!)
    const piece = play.steps[0].highlight.pieces[0]
    const loc = findPiece(play.start, piece)
    const side = loc.stickers.find((s) => s.face !== 'U')!
    expect(side.color).not.toBe(centerColors(play.start).F)
    expect(beat.body[0]).not.toMatch(/no turn of the top can make a T/)
  })

  it('daisy "If the petal spot is taken": the lit petal at the front is the one the lifting turn would knock off', () => {
    const beat = beatOf('daisy', 'taken')
    const play = resolvePlay(beatPlay(beat)!)
    const step = play.steps[0]
    expect(step.setup.length).toBeGreaterThan(0)
    const face = moveBase(step.main[0])
    expect(face).toBe('F')
    const petal = pieceAt(play.start, 'UF')
    expect(petal.stickers.find((s) => s.face === 'U')!.color).toBe('white')
    const light = resolveHighlight(beat.view?.highlight, play.start, play, 0)!
    expect(light.pieces).toContain(petal.piece)
    // Without the turn of the top first, the lifting turn really would knock it off.
    expect(pieceAt(applyAlg(play.start, step.main), 'UF').piece).not.toBe(petal.piece)
  })

  it('stage 7 "Check all four" says the answer for the cube on screen; the Corner Cycle demo lights the three corners that travel', () => {
    const check = beatOf('yellow-corners-position', 'check')
    if (check.kind !== 'info') throw new Error('info')
    expect(check.body.join(' ')).toMatch(/Here: none of them/)
    expect(analyzeCube(resolveScene(check.scene)).stages['yellow-corners-position'].done).toBe(0)
    expect(isStageComplete(resolveScene(check.scene), 'yellow-edges', { aligned: true })).toBe(true)
    const cycle = beatOf('yellow-corners-position', 'cycle')
    expect(cycle.body.join(' ')).toMatch(/three lit corners are the ones that travel/)
    const play = resolvePlay(beatPlay(cycle)!)
    const lit = resolveHighlight(cycle.view?.highlight, play.start, play, 0)!.pieces!
    const travel = (['URF', 'UFL', 'ULB', 'UBR'] as const).filter((slot) => pieceAt(play.start, slot).piece !== pieceAt(play.end, slot).piece).map((slot) => pieceAt(play.start, slot).piece)
    expect(travel).toHaveLength(3)
    expect([...lit].sort()).toEqual([...travel].sort())
  })

  it('stage 8 "Lost count?" lights the workbench corner too; "Turned the cube by accident?" brings the named front centre back', () => {
    const lost = beatOf('yellow-corners-orient', 'continue')
    const play = resolvePlay(beatPlay(lost)!)
    const light = resolveHighlight(lost.view?.highlight, play.start, play, 0)!
    expect(light.slots).toContain('URF')
    expect(pieceAt(play.start, 'URF').stickers.some((s) => s.color === 'white')).toBe(true)
    const turned = beatOf('yellow-corners-orient', 'working-column')
    const back = resolvePlay(beatPlay(turned)!)
    // Before the accident (the scene without its last "y"), and after the way back: the same front centre, yellow on top.
    if (turned.kind !== 'demo' || turned.play.scene.kind !== 'case') throw new Error('demo')
    const before = resolveScene({ ...turned.play.scene, then: turned.play.scene.then!.replace(/ y$/, '') })
    expect(centerColors(back.start).F).not.toBe(centerColors(before).F)
    expect(centerColors(back.end)).toMatchObject({ U: 'yellow', F: centerColors(before).F })
    expect(back.end).toBe(before)
  })

  it('the recovery rule does not promise "a stage or two"', () => {
    const text = [...RECOVERY_RULES.map((r) => r.fix), ...LESSONS.flatMap((l) => l.beats.flatMap((b) => b.body))].join(' ')
    expect(text).not.toMatch(/never lose more than a stage or two/)
    expect(RECOVERY_RULES[1].fix).toMatch(/each stage goes much faster the second time/)
  })
})

describe('right algorithm, wrong side or hold (SF1)', () => {
  const stepsOf = (seed: string, stage: StageId) => [...solverSteps(solveToStage(applyAlg(randomState(seededRng(seed)), BEGINNER_HOLD), stage))].filter((s) => s.stage === stage)
  /** Make `moves` from `start` with the step follower, as the exercise does: is the last one called a slip? */
  const offAfter = (start: CubeState, moves: readonly Move[]) => {
    let follower = startFollow(start)
    for (const move of moves) follower = followMove(follower, move)
    return follower
  }

  it('stage 4: the T made, the other side\'s algorithm started — named as the wrong side, with the right moves', () => {
    let tried = 0
    for (let seed = 0; seed < 60; seed++) {
      for (const step of stepsOf(`ex4-${seed}`, 'middle-layer')) {
        if (step.caseId !== 'middle-layer/insert-left' && step.caseId !== 'middle-layer/insert-right') continue
        const ready = applyAlg(step.before, step.setup)
        const wrong = step.caseId === 'middle-layer/insert-left' ? getAlgorithm('middle-right')! : getAlgorithm('middle-left')!
        const made = wrong.moves.slice(0, 2)
        const follower = offAfter(ready, made)
        expect(follower.status, step.caseId).toBe('off')
        const now = applyAlg(ready, made)
        const ex = excursion('middle-layer', now, made, follower.trail.length)!
        expect(ex, `${seed} ${step.caseId}`).not.toBeNull()
        expect(ex.algorithm).toBe(wrong.id)
        expect(ex.good).toBe(false)
        const words = excursionWords('middle-layer', ex, 'Undo')
        const top = pieceAt(ready, 'UF').stickers.find((s) => s.face === 'U')!.color
        expect(words.title).toContain(`**${top}**`)
        expect(words.title).toMatch(step.caseId.endsWith('left') ? /right-hand version.*left centre/ : /left-hand version.*right centre/)
        expect(words.sub).toContain(getAlgorithm(step.caseId.endsWith('left') ? 'middle-left' : 'middle-right')!.alg)
        expect(words.title + words.sub).not.toMatch(/broke/)
        // The right side from the same cube is no excursion: it is on the plan.
        expect(offAfter(ready, getAlgorithm(step.caseId.endsWith('left') ? 'middle-left' : 'middle-right')!.moves.slice(0, 2)).status).not.toBe('off')
        tried++
      }
    }
    expect(tried).toBeGreaterThan(40)
  })

  /** Yellow-cross rounds still needed, read off the four top edges (independent of the solver). */
  const crossRounds = (state: CubeState) => ({ dot: 3, L: 2, line: 1, cross: 0 })[yellowCrossShape(state) as 'dot' | 'L' | 'line' | 'cross']
  /** Edge Swaps still needed, read off the stickers: 0 if some turn of the top matches all four, 1 for a neighbouring pair, else 2. */
  const swapRounds = (state: CubeState) => {
    const best = ['', 'U', 'U2', "U'"].map((t) => (['UF', 'UR', 'UB', 'UL'] as const).filter((slot) => pieceAt(applyAlg(state, t), slot).solved))
    if (best.some((m) => m.length === 4)) return 0
    return best.some((m) => m.length === 2 && !((m.includes('UF') && m.includes('UB')) || (m.includes('UR') && m.includes('UL')))) ? 1 : 2
  }

  it('stage 5: the L or the line not held right, F pressed — "right algorithm, wrong hold" unless that hold happens to work too', () => {
    let wrong = 0
    let lucky = 0
    for (let seed = 0; seed < 60; seed++) {
      for (const step of stepsOf(`ex5-${seed}`, 'yellow-cross')) {
        if (step.setup.length === 0) continue
        const follower = offAfter(step.before, ['F'])
        expect(follower.status).toBe('off')
        const ex = excursion('yellow-cross', applyMove(step.before, 'F'), ['F'], follower.trail.length)!
        const works = crossRounds(applyAlg(step.before, getAlgorithm('yellow-cross')!.moves)) < crossRounds(step.before)
        expect(ex.good).toBe(works)
        const words = excursionWords('yellow-cross', ex, 'Undo `F`')
        if (works) {
          expect(words.title).toMatch(/Your own way/)
          lucky++
        } else {
          expect(words.title).toBe('Right algorithm, wrong hold.')
          expect(words.sub).toMatch(step.caseId === 'yellow-cross/L' ? /L points to the back and the left/ : /line runs left to right/)
          wrong++
        }
        // Held right, the same F is not a slip at all.
        expect(offAfter(applyAlg(step.before, step.setup), ['F']).status).not.toBe('off')
      }
    }
    expect(wrong).toBeGreaterThan(15)
    expect(lucky).toBeGreaterThan(0)
  })

  it('stage 6: the Edge Swap from the wrong hold is named; from any side in the opposite case it is his own (good) way', () => {
    let wrong = 0
    let good = 0
    for (let seed = 0; seed < 80; seed++) {
      for (const step of stepsOf(`ex6-${seed}`, 'yellow-edges')) {
        for (const spin of ['', 'y', 'y2', "y'"]) {
          const held = applyAlg(step.before, spin)
          const ex = excursion('yellow-edges', applyMove(held, 'R'), ['R'], 1)!
          const works = swapRounds(applyAlg(held, getAlgorithm('yellow-edge-swap')!.moves)) < swapRounds(held)
          expect(ex.good, `${step.caseId} ${spin}`).toBe(works)
          if (works) good++
          else {
            expect(excursionWords('yellow-edges', ex, 'Undo').title).toMatch(/not at the back and right|fewer than two/)
            wrong++
          }
          if (step.caseId === 'yellow-edges/swap-opposite') expect(works, 'opposite: any side').toBe(true)
        }
      }
    }
    expect(wrong).toBeGreaterThan(20)
    expect(good).toBeGreaterThan(20)
  })

  it('stage 8: twisting a corner that already has yellow up is named', () => {
    let tried = 0
    for (let seed = 0; seed < 40; seed++) {
      for (const step of stepsOf(`ex8-${seed}`, 'yellow-corners-orient')) {
        if (step.caseId !== 'yellow-corners-orient/next-corner') continue
        const ex = excursion('yellow-corners-orient', applyMove(step.before, "R'"), ["R'"], 1)!
        expect(ex.good).toBe(false)
        expect(excursionWords('yellow-corners-orient', ex, 'Undo').title).toMatch(/already has yellow on top/)
        tried++
      }
    }
    expect(tried).toBeGreaterThan(10)
  })

  it('nothing to say about moves that are not the start of a stage algorithm', () => {
    const start = drillState('middle-layer', 0)
    expect(excursion('middle-layer', applyMove(start, 'B'), ['B'], 1)).toBeNull()
    expect(excursion('daisy', applyMove(start, 'R'), ['R'], 1)).toBeNull()
  })
})

describe('drills cover the hard cases (S8)', () => {
  it.each(ENGINE_STAGE_IDS.map((s) => [s] as const))('%s: every few cubes is a hard case, and each hard case comes round', (stage) => {
    const hard = DRILL_HARD[stage]
    const seen = new Set<string>()
    for (let n = 0; n < (hard.length + 1) * 4; n++) {
      const wants = drillWants(stage, n)
      const tags = drillTags(stage, drillState(stage, n))
      if (wants) expect(tags, `${stage} #${n}`).toContain(wants)
      tags.forEach((t) => seen.add(t))
    }
    expect([...seen].sort()).toEqual(hard.map((h) => h.id).sort())
    if (hard.length > 0) {
      // In any run of (hard cases + 1) cubes, rerolling with "New cube" included, every hard case is asked for once.
      for (let from = 0; from < 6; from++) {
        const run = Array.from({ length: hard.length + 1 }, (_, k) => drillWants(stage, from + k)).filter(Boolean)
        expect([...run].sort()).toEqual(hard.map((h) => h.id).sort())
      }
    }
  })

  it('mastery needs three clean solves and every hard case solved cleanly', () => {
    const save = (clean: number, hard: string[]) => ({ ...emptyLesson(), drill: { ...emptyDrill(), total: clean, clean, own: clean, hard } })
    expect(isMastered(save(5, []), 'middle-layer')).toBe(false)
    expect(isMastered(save(3, ['left']), 'middle-layer')).toBe(false)
    expect(isMastered(save(3, ['left', 'stuck']), 'middle-layer')).toBe(true)
    expect(isMastered(save(2, ['left', 'stuck']), 'middle-layer')).toBe(false)
    expect(isMastered(save(3, []), 'white-cross')).toBe(true)
  })
})
