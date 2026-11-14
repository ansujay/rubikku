/**
 * The step follower: what it promises to every screen that coaches a solve.
 *
 * The big tests replay the solver's own solution on hundreds of random cubes one *quarter turn*
 * at a time (the way drags and key presses arrive) and check after every single turn that the
 * learner is never told a finished stage "came undone", never gets a hint for an earlier stage,
 * and is always shown the move the path really continues with.
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_MOVES,
  FACE_MOVES,
  FOLLOW_LOST_AFTER,
  SOLVED,
  STAGE_IDS,
  analyzeCube,
  applyAlg,
  applyMove,
  askFollow,
  followMove,
  followMoves,
  followState,
  invertMove,
  isRotation,
  isSolved,
  moveAmount,
  moveBase,
  parseAlg,
  pathNext,
  pathRemaining,
  pathStatus,
  pathUndo,
  randomState,
  replanFollow,
  solveBeginner,
  startFollow,
  startPath,
  stepPath,
  trackPath,
  type CubeState,
  type Move,
  type SolveStep,
  type StageId,
  type StepFollower,
} from '../index'
import { seededRng } from './helpers'
import { HOLD } from './solverChecks'

const stageIndex = (id: StageId) => STAGE_IDS.indexOf(id)

/** A half turn as the two quarter turns a hand makes: clockwise twice, or anticlockwise twice. */
function quarters(move: Move, anticlockwise: boolean): Move[] {
  if (moveAmount(move) !== 2) return [move]
  const quarter = (anticlockwise ? `${moveBase(move)}'` : moveBase(move)) as Move
  return [quarter, quarter]
}

/** The warning the drill and capstone panels raise, computed exactly as they do. */
function warnedStage(follower: StepFollower, working: StageId): StageId | null {
  const current = currentStage(follower.view)
  return current !== null && stageIndex(current) < stageIndex(working) ? current : null
}

/** `analysis.current` unless the corner twist is under way — remembered, since `view` rarely changes inside a step. */
const seenViews = new Map<CubeState, StageId | null>()
function currentStage(view: CubeState): StageId | null {
  let current = seenViews.get(view)
  if (current === undefined) {
    const a = analyzeCube(view)
    current = a.twistInProgress ? null : a.current
    if (seenViews.size > 5000) seenViews.clear()
    seenViews.set(view, current)
  }
  return current
}

const sameStep = (a: SolveStep | null, b: SolveStep | null) => a !== null && b !== null && a.caseId === b.caseId && a.before === b.before && a.after === b.after

function randomCubes(seed: number, count: number): CubeState[] {
  const rng = seededRng(seed)
  return Array.from({ length: count }, () => applyAlg(randomState(rng), 'z2'))
}

describe('following the solver’s own path, one quarter turn at a time', () => {
  for (const guiding of [true, false]) {
    it(`never warns, never regresses and always points at the path’s next move (${guiding ? 'hint showing' : 'no hint'})`, () => {
      const perStage: Record<string, { steps: number; turns: number }> = {}
      for (const id of STAGE_IDS) perStage[id] = { steps: 0, turns: 0 }
      let cube = 0
      for (const start of randomCubes(guiding ? 31 : 32, 200)) {
        cube++
        const solution = solveBeginner(start)
        let follower = startFollow(start)
        let furthest = -1
        solution.steps.forEach((step, n) => {
          const where = `cube ${cube}, step ${n} ${step.caseId} [${step.moves.join(' ')}]`
          // At the boundary the follower holds exactly the solver's step.
          if (follower.step?.caseId !== step.caseId || follower.state !== step.before) throw new Error(`plan differs at ${where}`)
          if (follower.position !== 0 || follower.status !== 'on') throw new Error(`not at the start of the step at ${where}`)
          if (stageIndex(step.stage) < furthest) throw new Error(`hint for an earlier stage at ${where}`)
          furthest = stageIndex(step.stage)
          perStage[step.stage].steps++
          step.moves.forEach((move, k) => {
            const turns = quarters(move, (cube + n + k) % 2 === 0)
            // "U2 then U" (a setup turn followed by an algorithm that starts with the same face) can
            // be folded by a quarter turn the other way; the follower is allowed to notice.
            const folds = [step.moves[k - 1], step.moves[k + 1]].some((m) => m !== undefined && moveBase(m) === moveBase(move))
            turns.forEach((turn, q) => {
              // The hint's next move is the path's next move (after one quarter: that quarter again).
              const expected = q === 0 ? move : turn
              if (follower.next !== expected && !folds) throw new Error(`next is ${follower.next}, the path continues with ${expected} at ${where} move ${k}`)
              follower = followMove(follower, turn, { guiding })
              perStage[step.stage].turns++
              const last = k === step.moves.length - 1 && q === turns.length - 1
              if (last) {
                if (!sameStep(follower.completed, step)) throw new Error(`step not reported complete at ${where}`)
                return
              }
              if (!sameStep(follower.step, step)) throw new Error(`step changed mid-way at ${where} move ${k}`)
              if (follower.trail.length !== 0 || !follower.inside) throw new Error(`thought to be off the path at ${where} move ${k}`)
              if (!folds && follower.status !== (q === 0 && turns.length === 2 ? 'half' : 'on')) throw new Error(`status ${follower.status} at ${where} move ${k}`)
              if (!folds && follower.position !== (q === 0 && turns.length === 2 ? k : k + 1)) throw new Error(`position ${follower.position} at ${where} move ${k}`)
              const warned = warnedStage(follower, step.stage)
              if (warned) throw new Error(`"${warned} has come undone" at ${where} after move ${k}`)
            })
          })
          // At the new boundary too.
          const warned = warnedStage(follower, step.stage)
          if (warned) throw new Error(`"${warned} has come undone" after ${where}`)
        })
        expect(follower.status).toBe('solved')
        expect(follower.step).toBeNull()
        expect(follower.next).toBeNull()
        expect(follower.serial).toBe(solution.steps.length)
        expect(isSolved(follower.state)).toBe(true)
      }
      // Every stage was walked hundreds of times.
      for (const id of STAGE_IDS) {
        expect(perStage[id].steps, id).toBeGreaterThan(200)
        expect(perStage[id].turns, id).toBeGreaterThan(400)
      }
    }, 120_000)
  }

  it('the same with the trigger-only way of placing white corners', { timeout: 60_000 }, () => {
    for (const start of randomCubes(33, 30)) {
      const solution = solveBeginner(start, { whiteCorners: 'trigger' })
      let follower = startFollow(start, { whiteCorners: 'trigger' })
      for (const step of solution.steps) {
        expect(follower.step?.caseId).toBe(step.caseId)
        for (const move of step.moves) {
          for (const turn of quarters(move, false)) {
            follower = followMove(follower, turn, { guiding: true })
            expect(follower.trail).toHaveLength(0)
            expect(warnedStage(follower, step.stage)).toBeNull()
          }
        }
      }
      expect(follower.status).toBe('solved')
    }
  })
})

describe('slips', () => {
  it('one wrong move at every position: the undo is offered, and undoing brings the hint back exactly', () => {
    let slips = 0
    let offered = 0
    let adopted = 0
    const rng = seededRng(77)
    for (const start of randomCubes(41, 40)) {
      const solution = solveBeginner(start)
      let follower = startFollow(start)
      for (const step of solution.steps) {
        const done: Move[] = []
        for (let k = 0; k < step.moves.length; k++) {
          // Three different wrong face turns here (never the expected face, never the one just made).
          const expected = step.moves[k]
          const wrongs = FACE_MOVES.filter((m) => moveBase(m) !== moveBase(expected) && (k === 0 || moveBase(m) !== moveBase(step.moves[k - 1])))
          for (let t = 0; t < 3; t++) {
            const wrong = wrongs[Math.floor(rng() * wrongs.length)]
            const slipped = followMove(follower, wrong, { guiding: true })
            slips++
            const where = `${step.caseId} [${step.moves.join(' ')}] after ${k} moves + ${wrong}`
            if (slipped.status === 'off') {
              offered++
              // The step being hinted has not changed, and the way back is the one move.
              if (slipped.step !== follower.step || slipped.position !== k) throw new Error(`hint changed on a slip: ${where}`)
              expect(slipped.undo, where).toEqual([invertMove(wrong)])
              expect(slipped.next, where).toBe(invertMove(wrong))
              expect(slipped.fresh).toBeNull()
              // Undo by hand: exactly where he was.
              const back = followMove(slipped, invertMove(wrong), { guiding: true })
              if (back.step !== follower.step || back.position !== k || back.status !== follower.status || back.next !== follower.next || back.state !== follower.state) {
                throw new Error(`undoing did not restore the hint: ${where}`)
              }
              // The Undo button changes the state without naming a move: same result.
              const viaState = followState(slipped, follower.state, { guiding: true })
              if (viaState.step !== follower.step || viaState.position !== k || viaState.trail.length !== 0) throw new Error(`followState did not restore the hint: ${where}`)
            } else {
              // The only other outcome: the cube is still in good shape and the new plan is as good —
              // it ends where the old step ended, or the slip happened to make real progress.
              adopted++
              const sameEnd = slipped.step !== null && slipped.states[slipped.states.length - 1] === step.after
              const progress = slipped.baseline > follower.baseline
              const sameCase = slipped.step?.caseId === step.caseId
              if (!sameEnd && !progress && !sameCase) throw new Error(`a slip changed the plan: ${where} -> ${slipped.step?.caseId}`)
              if (slipped.step && stageIndex(slipped.step.stage) < stageIndex(step.stage)) throw new Error(`a slip regressed the hint: ${where}`)
            }
          }
          follower = followMove(follower, expected, { guiding: true })
          done.push(expected)
        }
      }
      expect(follower.status).toBe('solved')
    }
    console.info(`slips: ${slips}, undo offered ${offered}, equivalent plan adopted ${adopted}`)
    expect(slips).toBeGreaterThan(10_000)
    expect(offered / slips).toBeGreaterThan(0.9)
  }, 120_000)

  it('a wrong move after the first quarter of a half turn leads back to the half-way point', () => {
    const start = applyAlg(HOLD, "F2 U'") // a petal one turn away from its drop
    let follower = startFollow(applyAlg(start, ''))
    // Find a step with a half turn.
    let guard = 0
    while (follower.step && !follower.step.moves.some((m) => moveAmount(m) === 2) && guard++ < 50) follower = followMoves(follower, follower.step.moves)
    const step = follower.step!
    const k = step.moves.findIndex((m) => moveAmount(m) === 2)
    follower = followMoves(follower, step.moves.slice(0, k), { guiding: true })
    const quarter = moveBase(step.moves[k]) as Move
    const half = followMove(follower, quarter, { guiding: true })
    expect(half.status).toBe('half')
    expect(half.next).toBe(quarter)
    expect(pathRemaining(half)[0]).toBe(quarter)
    const wrong = quarter === 'L' ? 'R' : 'L'
    const off = followMove(half, wrong, { guiding: true })
    expect(off.status).toBe('off')
    expect(off.undo).toEqual([invertMove(wrong)])
    const back = followMove(off, invertMove(wrong), { guiding: true })
    expect(back.status).toBe('half')
    // Taking the quarter back is fine too; so is finishing it.
    expect(followMove(back, invertMove(quarter), { guiding: true }).status).toBe('on')
    expect(followMove(back, invertMove(quarter), { guiding: true }).position).toBe(k)
    const finished = followMove(back, quarter, { guiding: true })
    expect(finished.trail).toHaveLength(0)
    expect(sameStep(finished.completed, step) || finished.position === k + 1).toBe(true)
  })

  it('several wrong moves: each undo shortens the way back; far enough off, a fresh plan is made and marked', () => {
    const start = solveBeginner(randomCubes(5, 1)[0]).steps.find((s) => s.stage === 'middle-layer' && s.algorithm)!
    const follower = followMoves(startFollow(start.before), start.moves.slice(0, 2), { guiding: true })
    expect(follower.status).toBe('on')
    const wrong: Move[] = ['L', 'D', "B'"]
    let off = follower
    wrong.forEach((move, i) => {
      off = followMove(off, move, { guiding: true })
      expect(off.status).toBe('off')
      expect(off.trail).toHaveLength(i + 1)
      expect(off.step).toBe(follower.step)
      expect(off.fresh).toBeNull()
    })
    expect(off.undo).toEqual(['B', "D'", "L'"])
    // By hand, one at a time.
    let back = off
    for (const [i, move] of off.undo.entries()) {
      expect(back.next).toBe(move)
      back = followMove(back, move, { guiding: true })
      expect(back.trail).toHaveLength(wrong.length - i - 1)
    }
    expect(back.status).toBe('on')
    expect(back.position).toBe(2)
    expect(back.next).toBe(start.moves[2])

    // Carrying on the wrong way instead: after FOLLOW_LOST_AFTER moves off, a fresh plan.
    let lost = off
    for (const move of ['L', 'D', 'F2'] as Move[]) lost = followMove(lost, move, { guiding: true })
    expect(wrong.length + 3).toBeGreaterThan(FOLLOW_LOST_AFTER)
    expect(lost.fresh).toBe('lost')
    expect(lost.trail).toHaveLength(0)
    expect(lost.status).toBe('on')
    expect(lost.step!.before).toBe(lost.state)
    // Progress clears the note.
    expect(followMove(lost, lost.next!, { guiding: true }).fresh === null || lost.moves.length === 1).toBe(true)

    // An explicit request does the same at once.
    const asked = replanFollow(off)
    expect(asked.fresh).toBe('asked')
    expect(asked.step!.before).toBe(off.state)
    expect(asked.trail).toHaveLength(0)
  })

  it('doing a full turn the long way round (X X X for X′) comes back onto the path', () => {
    const step = solveBeginner(randomCubes(6, 1)[0]).steps.find((s) => s.kind === 'turn' && s.moves.some((m) => moveAmount(m) === 3 && moveBase(m) !== 'U'))!
    const k = step.moves.findIndex((m) => moveAmount(m) === 3 && moveBase(m) !== 'U')
    let follower = followMoves(startFollow(step.before), step.moves.slice(0, k), { guiding: true })
    const quarter = moveBase(step.moves[k]) as Move
    follower = followMoves(follower, [quarter, quarter, quarter], { guiding: true })
    expect(follower.trail).toHaveLength(0)
    expect(follower.state).toBe(applyAlg(step.before, step.moves.slice(0, k + 1)))
    expect(['on', 'half']).toContain(follower.status)
  })
})

describe('lining up the top a different way', () => {
  it('a setup turn made the other way round is adopted, not scolded, and ends in the same place', () => {
    let checked = 0
    let scolded = 0
    for (const start of randomCubes(51, 40)) {
      for (const step of solveBeginner(start).steps) {
        if (step.setup.length !== 1 || step.kind !== 'turn') continue
        const setup = step.setup[0]
        // The other quarter: U for U′, U′ for U, and for U2 either quarter is simply half-way.
        const other = (moveAmount(setup) === 1 ? "U'" : 'U') as Move
        const follower = followMove(startFollow(step.before), other, { guiding: true })
        checked++
        if (follower.status === 'off') {
          // Only when the solver would now go for a different piece altogether: then the hinted
          // step stays, with the one move back.
          expect(startFollow(follower.state).step!.caseId, `${step.caseId} ${setup} done as ${other}`).not.toBe(step.caseId)
          expect(follower.undo).toEqual([invertMove(other)])
          scolded++
          continue
        }
        expect(follower.trail).toHaveLength(0)
        expect(stageIndex(follower.step!.stage)).toBeGreaterThanOrEqual(stageIndex(step.stage))
        // Following the hint from there reaches the cube the original step would have reached.
        let walk = follower
        for (let i = 0; i < 40 && walk.completed === null; i++) walk = followMove(walk, walk.next!, { guiding: true })
        // … or, for the daisy (where any free petal spot will do), one just as good.
        if (walk.state !== step.after) {
          expect(walk.completed!.caseId, `${step.caseId} ${setup} done as ${other}`).toBe(step.caseId)
          expect(analyzeCube(walk.state).stages[step.stage].done).toBeGreaterThanOrEqual(analyzeCube(step.after).stages[step.stage].done)
          expect(analyzeCube(walk.state).completed.length).toBeGreaterThanOrEqual(analyzeCube(step.after).completed.length)
        }
      }
    }
    expect(checked).toBeGreaterThan(150)
    expect(scolded / checked).toBeLessThan(0.25)
  })
})

describe('turning the whole cube', () => {
  it('before a step is begun: the plan is made again for the new hold, never "off the path"', { timeout: 60_000 }, () => {
    for (const start of randomCubes(61, 8)) {
      for (const step of solveBeginner(start).steps) {
        for (const rotation of ['y', "y'", 'y2', 'x'] as Move[]) {
          if (step.moves[0] === rotation) continue
          const follower = followMove(startFollow(step.before), rotation, { guiding: true })
          expect(follower.trail).toHaveLength(0)
          expect(['on', 'half']).toContain(follower.status)
          if (follower.status === 'on') expect(follower.step!.before).toBe(follower.state)
          expect(stageIndex(follower.step!.stage)).toBeGreaterThanOrEqual(stageIndex(step.stage))
          expect(warnedStage(follower, step.stage)).toBeNull()
        }
      }
    }
  })

  it('in the middle of a step: the rest of it is rewritten for the new hold and still works', { timeout: 60_000 }, () => {
    let checked = 0
    for (const start of randomCubes(62, 20)) {
      for (const step of solveBeginner(start).steps) {
        if (step.kind !== 'turn' || step.moves.length < 3) continue
        for (const rotation of ['y', "y'"] as Move[]) {
          const k = 1 + (checked % (step.moves.length - 1))
          let follower = followMoves(startFollow(step.before), step.moves.slice(0, k), { guiding: true })
          if (follower.half) continue
          follower = followMove(follower, rotation, { guiding: true })
          checked++
          expect(follower.status, `${step.caseId} turned ${rotation} after ${k}`).toBe('on')
          expect(follower.position).toBe(k)
          expect(sameStep(follower.step, step)).toBe(true)
          expect(warnedStage(follower, step.stage)).toBeNull()
          // Carry on with whatever the hint says: the step completes, on the turned cube.
          for (let i = 0; i < 40 && follower.completed === null; i++) {
            expect(isRotation(follower.next!)).toBe(false)
            follower = followMove(follower, follower.next!, { guiding: true })
            expect(follower.trail).toHaveLength(0)
          }
          expect(sameStep(follower.completed, step)).toBe(true)
          expect(follower.state).toBe(applyMove(step.after, rotation))
          // Turning the cube back mid-way restores the original wording.
          const there = followMove(followMoves(startFollow(step.before), step.moves.slice(0, k), { guiding: true }), rotation, { guiding: true })
          const andBack = followMove(there, invertMove(rotation), { guiding: true })
          expect(andBack.moves).toEqual(step.moves)
          expect(andBack.position).toBe(k)
        }
      }
    }
    expect(checked).toBeGreaterThan(200)
  })
})

describe('solving it his own way, with no hint showing', () => {
  it('any algorithm of the method, from any side, mirrored or backwards: never a warning mid-way', () => {
    // A cube with the first two layers done: every later algorithm keeps or restores them.
    const boundary = solveBeginner(randomCubes(71, 1)[0]).steps.find((s) => s.stage === 'yellow-cross')!.before
    const algs = ["F R U R' U' F'", "R U R' U R U2 R'", "U R U' L' U R' U' L", "L' U' L U' L' U2 L", "B U L U' L' B'", "R U2 R' U' R U' R'"]
    for (const alg of algs) {
      let follower = startFollow(boundary)
      for (const move of parseAlg(alg)) {
        for (const turn of quarters(move, true)) {
          follower = followMove(follower, turn)
          expect(warnedStage(follower, 'yellow-cross'), `${alg} at ${turn}`).toBeNull()
        }
      }
      // Finished: the plan has caught up with the cube as it is.
      expect(follower.trail).toHaveLength(0)
      expect(follower.view).toBe(follower.state)
      expect(follower.step === null || follower.step.before === follower.state).toBe(true)
    }
  })

  it('placing white corners and middle edges in a different order than the solver would', () => {
    for (const start of randomCubes(72, 30)) {
      const solution = solveBeginner(start)
      for (const stage of ['white-corners', 'middle-layer'] as StageId[]) {
        const steps = solution.steps.filter((s) => s.stage === stage && s.kind === 'turn')
        if (steps.length === 0) continue
        const first: SolveStep = steps[0]
        // Hold the cube a different way first, then follow the hint for *that* hold without ever asking for it.
        let follower = startFollow(first.before)
        follower = followMove(follower, 'y2')
        const target = stageIndex(stage)
        for (let i = 0; i < 400 && follower.step && stageIndex(follower.step.stage) <= target; i++) {
          // Do the planned step, but as a learner without the hint would: every move by hand, silently.
          for (const turn of quarters(follower.next!, i % 2 === 0)) {
            follower = followMove(follower, turn)
            expect(warnedStage(follower, stage)).toBeNull()
          }
        }
        expect(analyzeCube(follower.state).stages[stage].complete).toBe(true)
      }
    }
  })

  it('a real mess is still called a mess, and asking for a hint then gives a fresh plan', () => {
    const boundary = solveBeginner(randomCubes(73, 1)[0]).steps.find((s) => s.stage === 'yellow-cross')!.before
    let follower = startFollow(boundary)
    for (const move of parseAlg("L D' B R2 D L' F")) follower = followMove(follower, move)
    expect(follower.inside).toBe(false)
    expect(follower.view).toBe(follower.state)
    expect(warnedStage(follower, 'yellow-cross')).not.toBeNull()
    // The way back is still known …
    expect(applyAlg(follower.state, follower.undo)).toBe(boundary)
    // … but seven moves is a long way: a hint now starts from here, and says so.
    const asked = askFollow(follower)
    expect(asked.fresh).toBe('lost')
    expect(asked.step!.before).toBe(follower.state)
    // One or two moves off, asking keeps the step and offers the way back.
    const slipped = followMoves(startFollow(boundary), parseAlg('D L'))
    expect(askFollow(slipped)).toBe(slipped)
    expect(slipped.undo).toEqual(["L'", "D'"])
  })
})

describe('followState: the cube changed without saying how', () => {
  it('one move away is followed as that move; a reset or a new cube starts a new plan', () => {
    const [a, b] = randomCubes(81, 2)
    const follower = startFollow(a)
    const step = follower.step!
    const moved = followState(follower, applyMove(a, step.moves[0]))
    expect(moved.completed !== null || moved.position === 1 || moved.status === 'half').toBe(true)
    expect(followState(moved, a).position).toBe(0)
    expect(followState(follower, a)).toBe(follower)
    const jumped = followState(follower, b)
    expect(jumped.step!.before).toBe(b)
    expect(jumped.serial).toBe(0)
    // Several moves of the step at once (an instant "show me").
    if (step.moves.length > 2) {
      const skipped = followState(follower, applyAlg(a, step.moves.slice(0, 2)))
      expect(skipped.step).toBe(step)
      expect(skipped.position).toBe(2)
    }
    expect(followState(follower, SOLVED).status).toBe('solved')
  })

  it('a cube that is not a real cube never throws', () => {
    const chars = SOLVED.split('')
    ;[chars[0], chars[9]] = [chars[9], chars[0]]
    const broken = chars.join('') as CubeState
    const follower = startFollow(broken)
    expect(['stuck', 'on']).toContain(follower.status)
    for (const move of ALL_MOVES.slice(0, 12)) expect(() => followMove(follower, move, { guiding: true })).not.toThrow()
  })
})

describe('PathTrack: a fixed list of moves', () => {
  it('tracks position, half turns either way, slips and undo', () => {
    const path = parseAlg("R U2 R' F2")
    let track = startPath(SOLVED, path)
    expect(pathStatus(track)).toBe('on')
    expect(pathNext(track)).toBe('R')
    track = stepPath(track, 'R')
    expect(track.position).toBe(1)
    track = stepPath(track, "U'")
    expect(pathStatus(track)).toBe('half')
    expect(pathNext(track)).toBe("U'")
    expect(pathRemaining(track)).toEqual(["U'", "R'", 'F2'])
    track = stepPath(track, "U'")
    expect(track.position).toBe(2)
    track = stepPath(track, 'L')
    track = stepPath(track, 'D')
    expect(pathStatus(track)).toBe('off')
    expect(pathUndo(track)).toEqual(["D'", "L'"])
    expect(pathNext(track)).toBe("D'")
    track = stepPath(track, "D'")
    expect(track.trail).toEqual(['L'])
    track = stepPath(track, "L'")
    expect(pathStatus(track)).toBe('on')
    expect(track.position).toBe(2)
    // Stepping back along the path by hand.
    track = stepPath(track, 'U2')
    expect(track.position).toBe(1)
    track = trackPath(SOLVED, path, [...path])
    expect(pathStatus(track)).toBe('done')
    expect(pathNext(track)).toBeNull()
  })

  it('an algorithm repeated until the cube comes round is followed in order', () => {
    const path = parseAlg("(R U R' U')6")
    let track = startPath(SOLVED, path)
    path.forEach((move, i) => {
      track = stepPath(track, move)
      expect(track.position).toBe(i + 1)
    })
    expect(pathStatus(track)).toBe('done')
    // And backwards from the end.
    track = stepPath(track, 'U')
    expect(track.position).toBe(path.length - 1)
  })
})
