import { describe, expect, it } from 'vitest'
import { STAGE_IDS } from '../../cube'
import { LESSONS } from './content'
import { emptyCapstone, emptyLesson, sanitizeLearn, useLearn, MASTERY_TARGET } from './learnStore'
import { buildPath, stopLabel } from './path'

const done = (ids: readonly string[]) => Object.fromEntries(ids.map((id) => [id, { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-02T00:00:00.000Z' }]))
const statuses = (path: ReturnType<typeof buildPath>) => path.stops.map((s) => s.status)

describe('the learning path', () => {
  it('starts at the primer, with stage 1 open and the rest locked', () => {
    const path = buildPath({}, {}, emptyCapstone())
    expect(path.stops.map((s) => s.id)).toEqual(['primer', ...STAGE_IDS, 'full-solve'])
    expect(statuses(path)).toEqual(['current', 'open', ...Array(8).fill('locked')])
    expect(path.next?.id).toBe('primer')
    expect(path.stops.map(stopLabel)).toEqual(['Start here', ...STAGE_IDS.map((_, i) => `Stage ${i + 1}`), 'Finale'])
  })

  it('unlocks stages in order', () => {
    const primer = { primer: { ...emptyLesson(), completed: true } }
    expect(buildPath({}, primer, emptyCapstone()).next?.id).toBe('daisy')
    const three = buildPath(done(STAGE_IDS.slice(0, 3)), primer, emptyCapstone())
    expect(statuses(three)).toEqual(['complete', 'complete', 'complete', 'complete', 'current', 'locked', 'locked', 'locked', 'locked', 'locked'])
    expect(three.stagesDone).toBe(3)
    // A stage finished on an older save counts the primer as known.
    expect(buildPath(done(['daisy']), {}, emptyCapstone()).stops[0].status).toBe('complete')
    // A later stage completed while peeking ahead does not skip the ones before it.
    const peeked = buildPath(done(['daisy', 'yellow-cross']), primer, emptyCapstone())
    expect(peeked.next?.id).toBe('white-cross')
    expect(peeked.stops.find((s) => s.id === 'yellow-cross')?.status).toBe('complete')
  })

  it('opens the full solve after stage 8 and completes it with a solve', () => {
    const all = done(STAGE_IDS)
    expect(buildPath(all, {}, emptyCapstone()).next?.id).toBe('full-solve')
    const finished = buildPath(all, {}, { ...emptyCapstone(), solves: 1 })
    expect(finished.next).toBeNull()
    expect(statuses(finished).every((s) => s === 'complete')).toBe(true)
  })

  it('reports progress inside a lesson and mastery', () => {
    const lesson = LESSONS[1]
    const save = { ...emptyLesson(), beatId: lesson.beats[4].id, furthest: 6, drill: { n: 3, hinted: false, solved: false, total: 4, clean: MASTERY_TARGET, own: 4, shown: 0, streak: 1, best: 2, hard: ['top-flipped', 'bottom-flipped'] } }
    const stop = buildPath({}, { [lesson.id]: save }, emptyCapstone()).stops[1]
    expect(stop).toMatchObject({ started: true, seen: 7, beats: lesson.beats.length, mastered: true, clean: MASTERY_TARGET })
  })
})

describe('the learn store', () => {
  it('survives a corrupt save', () => {
    expect(sanitizeLearn(null)).toEqual({ lessons: {}, capstone: emptyCapstone(), last: null })
    const messy = sanitizeLearn({ lessons: { daisy: { beatId: 7, furthest: -3, done: { a: true, b: 'yes' }, session: { state: 'nope' }, sessionKey: 'x', drill: { clean: 9, total: 2, streak: 50 } }, junk: 'text' }, capstone: 'no', last: 4 })
    expect(messy.lessons.daisy).toEqual({ ...emptyLesson(), done: { a: true }, drill: { n: 0, hinted: false, solved: false, total: 2, clean: 2, own: 2, shown: 0, streak: 0, best: 0, hard: [] } })
    expect(messy.lessons.junk).toEqual(emptyLesson())
    expect(messy.capstone).toEqual(emptyCapstone())
  })

  it('counts clean drills and streaks; a hint or a skipped cube breaks the streak', () => {
    const s = () => useLearn.getState().lessons.t.drill
    const { drillSolved, drillNext, drillHint } = useLearn.getState()
    drillSolved('t', 20)
    drillSolved('t', 20) // solving the same cube twice counts once
    expect(s()).toMatchObject({ total: 1, clean: 1, streak: 1, solved: true })
    drillNext('t')
    drillSolved('t', 20)
    expect(s()).toMatchObject({ n: 1, total: 2, clean: 2, streak: 2, best: 2 })
    drillNext('t')
    drillHint('t')
    drillSolved('t', 20)
    expect(s()).toMatchObject({ total: 3, clean: 2, streak: 0, best: 2, hinted: true })
    drillNext('t')
    drillNext('t') // skipped without solving
    expect(s()).toMatchObject({ n: 4, hinted: false, solved: false, streak: 0 })
    drillSolved('t', 20)
    expect(s()).toMatchObject({ clean: 3, streak: 1, own: 4 })
  })

  it('a practice cube that "Show me" turned for him is solved, but not his own (and not clean)', () => {
    const s = () => useLearn.getState().lessons.u.drill
    const { drillSolved, drillNext, drillShown } = useLearn.getState()
    drillShown('u', 14)
    drillSolved('u', 20)
    expect(s()).toMatchObject({ total: 1, own: 0, clean: 0, hinted: true })
    drillNext('u')
    expect(s()).toMatchObject({ shown: 0 })
    drillShown('u', 4)
    drillSolved('u', 20)
    expect(s()).toMatchObject({ total: 2, own: 1, clean: 0 })
  })

  it('keeps recognition rounds, "five in a row" and the real-cube step', () => {
    const l = () => useLearn.getState().lessons.v
    const store = useLearn.getState()
    store.quizAnswer('v', 'q', 'left', true)
    store.quizAnswer('v', 'q', 'right', false) // one answer per question
    expect(l().quiz.q).toEqual({ n: 0, right: 1, wrong: 0, answer: 'left' })
    store.quizNext('v', 'q')
    store.quizAnswer('v', 'q', 'right', false)
    expect(l().quiz.q).toEqual({ n: 1, right: 1, wrong: 1, answer: 'right' })
    store.repDone('v', 'r')
    store.repDone('v', 'r')
    expect(l().reps.r).toBe(2)
    store.repReset('v', 'r')
    expect(l().reps.r).toBe(0)
    store.realDone('v', 'cube')
    const at = l().real.cube
    expect(typeof at).toBe('string')
    store.realDone('v', 'cube')
    expect(l().real.cube).toBe(at)
    // …and they survive a reload, cleaned.
    const back = sanitizeLearn(JSON.parse(JSON.stringify({ lessons: { v: l() } })))
    expect(back.lessons.v).toMatchObject({ quiz: { q: { n: 1, right: 1, wrong: 1, answer: 'right' } }, reps: { r: 0 }, real: { cube: at } })
    expect(sanitizeLearn({ lessons: { v: { quiz: { q: { n: -1, right: 'x' } }, reps: { r: 'many' }, real: { cube: 5 } } } }).lessons.v).toMatchObject({ quiz: { q: { n: 0, right: 0, wrong: 0, answer: null } }, reps: {}, real: {} })
  })
})

describe('mastery and the hard cases', () => {
  it('a clean solve records the hard cases it had; an old save that was mastered stays mastered', () => {
    const { drillSolved, drillNext } = useLearn.getState()
    drillSolved('h', 30, ['left'])
    expect(useLearn.getState().lessons.h.drill.hard).toEqual(['left'])
    drillNext('h')
    useLearn.getState().drillHint('h')
    drillSolved('h', 30, ['stuck'])
    expect(useLearn.getState().lessons.h.drill.hard, 'a hinted solve does not count').toEqual(['left'])
    const old = sanitizeLearn({ lessons: { 'middle-layer': { drill: { clean: 4, total: 4 } } } })
    expect(old.lessons['middle-layer'].drill.hard).toEqual(['*'])
    const fresh = sanitizeLearn({ lessons: { 'middle-layer': { drill: { clean: 1, total: 4 } } } })
    expect(fresh.lessons['middle-layer'].drill.hard).toEqual([])
  })
})
