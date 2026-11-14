import { describe, expect, it } from 'vitest'
import { ALGORITHMS, PATTERNS, STAGE_IDS as ENGINE_STAGE_IDS } from '../cube'
import { BADGES } from './badges'
import {
  advanceDaily,
  challengeForDate,
  DAILY_CHALLENGES,
  dailyFor,
  eligibleChallenges,
  isDailyComplete,
  sanitizeDaily,
  startDaily,
  type DailyPlayer,
  type DailyState,
} from './daily'
import { addDays, localDateKey } from './dates'
import {
  applyEvent,
  initialProgress,
  mergeProgress,
  NOTATION_MASTER_ROUNDS,
  repeatXp,
  sanitizeProgress,
  XP,
  type ProgressData,
  type ProgressEventMap,
  type ProgressEventType,
} from './progressLogic'
import { STAGE_IDS } from './stages'

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min)
type Ev = [ProgressEventType, ProgressEventMap[ProgressEventType]]

const lessonsDone = (count: number): ProgressData['lessons'] =>
  Object.fromEntries(STAGE_IDS.slice(0, count).map((id) => [id, { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-02T00:00:00.000Z' }]))

const NOVICE: DailyPlayer = { lessons: {}, counters: {} }
const LEARNER: DailyPlayer = { lessons: { ...lessonsDone(3), 'middle-layer': { completedAt: null } }, counters: {} }
const SOLVER: DailyPlayer = { lessons: lessonsDone(8), counters: { solves: 4 } }

/** Progress with a given challenge pinned for `now`'s day. */
function withDaily(id: string, now: Date, base: Partial<ProgressData> = {}): ProgressData {
  return { ...initialProgress(), ...base, daily: { date: localDateKey(now), id, count: 0, items: [] } }
}

/** What it takes to finish each challenge, as the real features send it. */
const RECIPES: Record<string, { miss: Ev[]; steps: Ev[] }> = {
  'notation-sharp': {
    miss: [['notation-round', { correct: 7, total: 10 }], ['notation-round', { correct: 3, total: 3 }], ['drill-completed', { stageId: 'daisy' }]],
    steps: [['notation-round', { correct: 8, total: 10 }]],
  },
  'notation-two': {
    miss: [['notation-round', { correct: 2, total: 2 }]],
    steps: [['notation-round', { correct: 4, total: 8 }], ['notation-round', { correct: 12, total: 12 }]],
  },
  'pattern-1': { miss: [['algorithm-practised', { algorithmId: 'sune' }]], steps: [['pattern-made', { patternId: 'checkerboard' }]] },
  'drills-3': {
    miss: [['lesson-started', { stageId: 'daisy' }]],
    steps: [['drill-completed', { stageId: 'daisy' }], ['drill-completed', { stageId: 'daisy' }], ['drill-completed', { stageId: 'white-cross' }]],
  },
  'lesson-1': { miss: [['lesson-started', { stageId: 'daisy' }], ['custom', { xp: 40 }]], steps: [['lesson-completed', { stageId: 'daisy' }]] },
  'algs-3': {
    // The same algorithm again is not a different one.
    miss: [],
    steps: [
      ['algorithm-practised', { algorithmId: 'sune' }],
      ['algorithm-practised', { algorithmId: 'sune' }],
      ['algorithm-practised', { algorithmId: 'right-trigger' }],
      ['algorithm-practised', { algorithmId: 'white-cross-drop' }],
    ],
  },
  'solve-1': { miss: [['real-cube-solved', {}]], steps: [['solve-completed', { context: 'play' }]] },
  'timed-3': {
    miss: [['solve-completed', { context: 'play' }], ['solve-completed', { context: 'lesson' }]],
    steps: [
      ['solve-completed', { context: 'timer', ms: 95_000 }],
      ['solve-completed', { context: 'timer', ms: 80_000 }],
      ['solve-completed', { context: 'timer', ms: 120_000 }],
    ],
  },
  'real-cube': { miss: [['solve-completed', { context: 'play' }]], steps: [['real-cube-solved', {}]] },
}

describe('daily challenge catalogue', () => {
  it('has a recipe (so: a measurable goal) for every challenge in the rotation', () => {
    expect(DAILY_CHALLENGES.map((c) => c.id).sort()).toEqual(Object.keys(RECIPES).sort())
    for (const challenge of DAILY_CHALLENGES) {
      expect(challenge.target, challenge.id).toBeGreaterThan(0)
      expect(challenge.to.startsWith('/'), challenge.id).toBe(true)
      expect(challenge.detail.length, challenge.id).toBeGreaterThan(10)
    }
  })

  it('only offers what he can do at his stage', () => {
    const ids = (player: DailyPlayer) => eligibleChallenges(player).map((c) => c.id)
    expect(ids(NOVICE)).toEqual(['notation-sharp', 'notation-two', 'pattern-1'])
    expect(ids(LEARNER)).toEqual(['notation-sharp', 'notation-two', 'pattern-1', 'drills-3', 'lesson-1', 'algs-3'])
    // No full solves before he can solve; no "finish a lesson" once the path is done.
    for (const id of ['solve-1', 'timed-3', 'real-cube']) expect(ids(LEARNER)).not.toContain(id)
    expect(ids(SOLVER)).toEqual(['notation-sharp', 'notation-two', 'pattern-1', 'drills-3', 'algs-3', 'solve-1', 'timed-3', 'real-cube'])
    // One solve in Free play mid-path opens "one full solve" — but not three timed ones, or a
    // long guided solve of a real cube: those wait until he knows the whole method.
    const early = ids({ lessons: lessonsDone(2), counters: { solves: 1 } })
    expect(early).toContain('solve-1')
    expect(early).not.toContain('timed-3')
    expect(early).not.toContain('real-cube')
  })

  it('links the drill challenge to the lesson he is on', () => {
    const to = (player: DailyPlayer) => eligibleChallenges(player).find((c) => c.id === 'drills-3')?.to
    expect(to(LEARNER)).toBe('/learn/middle-layer')
    expect(to({ lessons: lessonsDone(2), counters: {} })).toBe('/learn/white-cross')
    expect(to(SOLVER)).toBe('/learn/yellow-corners-orient')
  })

  it('picks one per day: stable all day, different the next day, spread over the pool', () => {
    const seen = new Set<string>()
    let day = '2026-01-01'
    for (let i = 0; i < 120; i++) {
      const today = challengeForDate(day, SOLVER)
      expect(challengeForDate(day, SOLVER)).toEqual(today)
      expect(challengeForDate(addDays(day, 1), SOLVER).id, day).not.toBe(today.id)
      seen.add(today.id)
      day = addDays(day, 1)
    }
    expect(seen.size).toBe(eligibleChallenges(SOLVER).length)
  })

  it('rolls over at midnight: yesterday’s state is dropped, today starts at zero', () => {
    const yesterday: DailyState = { date: '2026-06-14', id: 'drills-3', count: 2, items: [] }
    expect(dailyFor(yesterday, '2026-06-14', LEARNER)).toBe(yesterday)
    const today = dailyFor(yesterday, '2026-06-15', LEARNER)
    expect(today).toEqual(startDaily('2026-06-15', LEARNER))
    expect(today.count).toBe(0)
    expect(dailyFor(null, '2026-06-15', LEARNER)).toEqual(today)
    // A saved id that no longer exists falls back to a fresh pick.
    expect(dailyFor({ date: '2026-06-15', id: 'cross-60', count: 0, items: [] }, '2026-06-15', LEARNER)).toEqual(today)
  })

  it('sanitises saved state', () => {
    expect(sanitizeDaily({ date: '2026-06-15', id: 'drills-3', count: 99, items: ['a', 'a', 5] })).toEqual({ date: '2026-06-15', id: 'drills-3', count: 3, items: ['a'] })
    expect(sanitizeDaily({ date: 'soon', id: 'drills-3', count: 1 })).toBeNull()
    expect(sanitizeDaily({ date: '2026-06-15', id: 'nope', count: 1 })).toBeNull()
    expect(sanitizeDaily('x')).toBeNull()
  })
})

describe('daily challenge detection (from the event stream)', () => {
  const now = at(2026, 6, 15, 10)

  for (const [id, recipe] of Object.entries(RECIPES)) {
    it(`${id}: completes from real events, pays once`, () => {
      let data = withDaily(id, now)
      const target = DAILY_CHALLENGES.find((c) => c.id === id)!.target
      for (const [type, payload] of recipe.miss) {
        const step = applyEvent(data, type, payload as never, now)
        expect(step.result.dailyCompleted, `${type} must not complete ${id}`).toBeNull()
        expect(step.data.daily?.count ?? 0).toBe(0)
        data = step.data
      }
      const completions: number[] = []
      recipe.steps.forEach(([type, payload], i) => {
        const before = data.xp
        const step = applyEvent(data, type, payload as never, now)
        data = step.data
        if (step.result.dailyCompleted) {
          completions.push(i)
          expect(step.result.dailyCompleted.id).toBe(id)
          // The bonus is part of this event's XP, and of the day's activity.
          expect(step.result.xpGained).toBeGreaterThanOrEqual(XP.daily)
          expect(data.xp - before).toBe(step.result.xpGained)
        }
      })
      expect(completions).toEqual([recipe.steps.length - 1])
      expect(data.daily).toMatchObject({ id, count: target })
      expect(isDailyComplete(data.daily!)).toBe(true)
      expect(data.dailyDoneOn).toBe('2026-06-15')
      expect(data.counters.dailyChallenges).toBe(1)
      expect(data.log.filter((entry) => entry.type === 'daily-challenge-completed')).toEqual([{ at: now.toISOString(), type: 'daily-challenge-completed', xp: XP.daily }])

      // Doing it all again the same day pays nothing more…
      const again = recipe.steps.reduce((acc, [type, payload]) => {
        const step = applyEvent(acc, type, payload as never, at(2026, 6, 15, 20))
        expect(step.result.dailyCompleted).toBeNull()
        return step.data
      }, data)
      expect(again.counters.dailyChallenges).toBe(1)
    })
  }

  it('shows live progress: 0 → 1 → 2 → done', () => {
    let data = withDaily('drills-3', now)
    const counts: number[] = []
    for (let i = 0; i < 4; i++) {
      data = applyEvent(data, 'drill-completed', { stageId: 'daisy' }, now).data
      counts.push(data.daily!.count)
    }
    expect(counts).toEqual([1, 2, 3, 3])
  })

  it('saves today’s pick on the first real event and keeps it when his level changes', () => {
    const start = initialProgress()
    const pick = challengeForDate('2026-06-15', start)
    // Finishing a lesson changes what he is eligible for — today's challenge must not change.
    const after = applyEvent(start, 'lesson-completed', { stageId: 'daisy' }, now).data
    expect(after.daily).toMatchObject({ date: '2026-06-15', id: pick.id })
    const later = applyEvent(after, 'solve-completed', { context: 'play' }, at(2026, 6, 15, 18)).data
    expect(later.daily!.id).toBe(pick.id)
  })

  it('starts a new challenge the next day and can be completed again', () => {
    let data = withDaily('pattern-1', now)
    data = applyEvent(data, 'pattern-made', { patternId: 'checkerboard' }, now).data
    expect(data.dailyDoneOn).toBe('2026-06-15')

    const tomorrow = at(2026, 6, 16, 0, 1)
    const first = applyEvent(data, 'lesson-started', { stageId: 'daisy' }, tomorrow)
    expect(first.data.daily).toMatchObject({ date: '2026-06-16', count: 0 })
    expect(first.data.daily!.id).toBe(challengeForDate('2026-06-16', data).id)

    // Finish whatever today's is.
    let next = first.data
    let paid = 0
    for (const [type, payload] of RECIPES[next.daily!.id].steps) {
      const step = applyEvent(next, type, payload as never, tomorrow)
      if (step.result.dailyCompleted) paid++
      next = step.data
    }
    expect(paid).toBe(1)
    expect(next.dailyDoneOn).toBe('2026-06-16')
    expect(next.counters.dailyChallenges).toBe(2)
  })

  it('earns Daily Driver on the fifth daily', () => {
    let data = initialProgress()
    const earned: string[] = []
    for (let day = 0; day < 5; day++) {
      const when = at(2026, 6, 15 + day, 9)
      data = { ...data, daily: { date: localDateKey(when), id: 'pattern-1', count: 0, items: [] } }
      const step = applyEvent(data, 'pattern-made', { patternId: `p${day}` }, when)
      data = step.data
      earned.push(...step.result.newBadges.map((b) => b.id).filter((id) => id === 'daily-5'))
      if (day < 4) expect(data.badges['daily-5']).toBeUndefined()
    }
    expect(earned).toEqual(['daily-5'])
  })

  it('advanceDaily ignores events once the challenge is complete or unknown', () => {
    const done: DailyState = { date: 'd', id: 'pattern-1', count: 1, items: [] }
    expect(advanceDaily(done, 'pattern-made', { patternId: 'x' })).toBe(done)
    const odd: DailyState = { date: 'd', id: 'gone', count: 0, items: [] }
    expect(advanceDaily(odd, 'pattern-made', { patternId: 'x' })).toBe(odd)
  })
})

describe('every badge can be earned from events the features really send', () => {
  /**
   * The only events sent in the app (see every `reward(` call): lesson-started, lesson-completed,
   * drill-completed, solve-completed (timer with ms / play / lesson), real-cube-solved,
   * notation-round (8–12 questions per level round), algorithm-practised (ids from ALGORITHMS),
   * pattern-made (ids from PATTERNS), primer-completed and custom. The daily challenge is detected
   * by the store itself.
   */
  function playThrough(): { data: ProgressData; order: string[] } {
    let data = initialProgress()
    const order: string[] = []
    const send = (type: ProgressEventType, payload: unknown, now: Date) => {
      const step = applyEvent(data, type, payload as never, now)
      data = step.data
      order.push(...step.result.newBadges.map((b) => b.id))
    }
    // 31 days in a row; a little of everything, as a keen kid might.
    for (let day = 0; day < 31; day++) {
      const now = at(2026, 3, 1 + day, 17)
      if (day === 0) send('primer-completed', {}, now)
      if (day < STAGE_IDS.length) {
        send('lesson-started', { stageId: STAGE_IDS[day] }, now)
        for (let i = 0; i < 3; i++) send('drill-completed', { stageId: STAGE_IDS[day] }, now)
        send('lesson-completed', { stageId: STAGE_IDS[day] }, now)
      }
      // A level round: 8–12 questions (the first is not perfect).
      send('notation-round', { correct: day === 0 ? 7 : 10, total: 10 }, now)
      if (day < ALGORITHMS.length) send('algorithm-practised', { algorithmId: ALGORITHMS[day].id }, now)
      if (day < PATTERNS.length) send('pattern-made', { patternId: PATTERNS[day].id }, now)
      if (day === 8) send('solve-completed', { context: 'lesson' }, now)
      if (day === 9) send('real-cube-solved', {}, now)
      if (day >= 9) {
        send('solve-completed', { context: 'play' }, now)
        // Timed solves getting faster: 6 min down to under a minute.
        const ms = Math.max(50_000, 360_000 - (day - 9) * 20_000)
        for (let i = 0; i < 4; i++) send('solve-completed', { context: 'timer', ms: ms + i * 1000 }, now)
      }
    }
    return { data, order }
  }

  const { data, order } = playThrough()

  for (const badge of BADGES) {
    it(`${badge.id} — ${badge.description}`, () => {
      expect(data.badges[badge.id], `"${badge.name}" was never unlocked`).toBeDefined()
      expect(order.filter((id) => id === badge.id)).toHaveLength(1)
    })
  }

  it('has 30 badges, and enough patterns and algorithms for the collection badges', () => {
    expect(BADGES).toHaveLength(30)
    expect(PATTERNS.length).toBeGreaterThanOrEqual(12)
    expect(ALGORITHMS.length).toBeGreaterThanOrEqual(10)
    expect(NOTATION_MASTER_ROUNDS).toBeLessThanOrEqual(5)
    // The daily challenge was finished from ordinary play, with no feature sending anything special.
    expect(data.counters.dailyChallenges).toBeGreaterThanOrEqual(5)
  })
})

describe('repeat XP and the activity feed', () => {
  const now = at(2026, 6, 15, 10)
  const base = (): ProgressData => ({ ...initialProgress(), dailyDoneOn: localDateKey(now), counters: { solves: 1 } })

  it('tapers: full, then reduced, then a floor', () => {
    expect([1, 10, 11, 30, 31].map((n) => repeatXp('drill', XP.drill, n))).toEqual([15, 15, 5, 5, 1])
    expect([1, 12, 13, 41].map((n) => repeatXp('timed', XP.timedSolve, n))).toEqual([40, 40, 10, 2])
    expect([6, 7, 21].map((n) => repeatXp('notation', 30, n))).toEqual([30, 15, 0])
    expect([1, 2].map((n) => repeatXp('algorithm', XP.algorithmRepeat, n))).toEqual([2, 0])
  })

  it('algorithm practice cannot be farmed: one small reward per algorithm per day, one feed row', () => {
    let data = base()
    let total = 0
    for (let i = 0; i < 200; i++) {
      const step = applyEvent(data, 'algorithm-practised', { algorithmId: 'white-cross-drop' }, now)
      total += step.result.xpGained
      data = step.data
    }
    expect(total).toBe(XP.algorithmFirst)
    expect(data.xp).toBe(XP.algorithmFirst)
    expect(data.log).toEqual([{ at: now.toISOString(), type: 'algorithm-practised', xp: XP.algorithmFirst }])
    // Two key presses no longer keep a streak alive on a later day… unless it is the day's first rep.
    const nextDay = applyEvent(data, 'algorithm-practised', { algorithmId: 'white-cross-drop' }, at(2026, 6, 16))
    expect(nextDay.result.xpGained).toBe(XP.algorithmRepeat)
    expect(applyEvent(nextDay.data, 'algorithm-practised', { algorithmId: 'white-cross-drop' }, at(2026, 6, 16)).result.streakExtended).toBe(false)
  })

  it('collapses a run of the same event into one row with a count', () => {
    let data = base()
    for (let i = 0; i < 4; i++) data = applyEvent(data, 'drill-completed', { stageId: 'daisy' }, at(2026, 6, 15, 10, i)).data
    data = applyEvent(data, 'solve-completed', { context: 'play' }, at(2026, 6, 15, 11)).data
    data = applyEvent(data, 'drill-completed', { stageId: 'daisy' }, at(2026, 6, 15, 12)).data
    data = applyEvent(data, 'drill-completed', { stageId: 'daisy' }, at(2026, 6, 16, 9)).data
    expect(data.log.map((entry) => [entry.type, entry.xp, entry.count ?? 1])).toEqual([
      ['drill-completed', 15, 1], // a new day starts a new row
      ['drill-completed', 15, 1],
      ['solve-completed', 30, 1],
      ['drill-completed', 60, 4],
    ])
    expect(data.log[3].at).toBe(at(2026, 6, 15, 10, 3).toISOString())
    // Lesson completions are never collapsed.
    let lessons = base()
    lessons = applyEvent(lessons, 'lesson-completed', { stageId: 'daisy' }, now).data
    lessons = applyEvent(lessons, 'lesson-completed', { stageId: 'white-cross' }, now).data
    expect(lessons.log).toHaveLength(2)
  })

  it('pays a repeated lesson once per day', () => {
    let data = applyEvent(base(), 'lesson-completed', { stageId: 'daisy' }, now).data
    const xp = [0, 1, 2].map(() => {
      const step = applyEvent(data, 'lesson-completed', { stageId: 'daisy' }, now)
      data = step.data
      return step.result.xpGained
    })
    expect(xp).toEqual([XP.lessonRepeat, 0, 0])
  })

  it('keeps the tally for one day only and survives a round trip through storage', () => {
    let data = base()
    for (let i = 0; i < 12; i++) data = applyEvent(data, 'drill-completed', { stageId: 'daisy' }, now).data
    expect(data.tally).toEqual({ date: '2026-06-15', counts: { drill: 12 } })
    const restored = sanitizeProgress(JSON.parse(JSON.stringify(data)))
    expect(restored.tally).toEqual(data.tally)
    expect(restored.log).toEqual(data.log)
    expect(applyEvent(restored, 'drill-completed', { stageId: 'daisy' }, now).result.xpGained).toBe(5)
    const tomorrow = applyEvent(restored, 'drill-completed', { stageId: 'daisy' }, at(2026, 6, 16))
    expect(tomorrow.result.xpGained).toBe(XP.drill)
    expect(tomorrow.data.tally).toEqual({ date: '2026-06-16', counts: { drill: 1 } })
  })
})

describe('mergeProgress (two tabs)', () => {
  const now = at(2026, 6, 15, 10)

  it('never loses XP, badges, lessons or collections, whichever tab is behind', () => {
    const shared = applyEvent(initialProgress(), 'lesson-completed', { stageId: 'daisy' }, at(2026, 6, 14)).data
    // Tab A: a timed solve. Tab B (stale): a pattern and a lesson.
    const a = applyEvent(shared, 'solve-completed', { context: 'play' }, now).data
    let b = applyEvent(shared, 'pattern-made', { patternId: 'checkerboard' }, now).data
    b = applyEvent(b, 'lesson-completed', { stageId: 'white-cross' }, now).data

    for (const merged of [mergeProgress(a, b), mergeProgress(b, a)]) {
      expect(merged.xp).toBe(Math.max(a.xp, b.xp))
      expect(Object.keys(merged.badges).sort()).toEqual([...new Set([...Object.keys(a.badges), ...Object.keys(b.badges)])].sort())
      expect(merged.lessons['white-cross'].completedAt).toBeTruthy()
      expect(merged.patterns).toEqual(['checkerboard'])
      expect(merged.counters.solves).toBe(1)
      expect(merged.streak.current).toBe(2)
      expect(merged.activity['2026-06-15']).toBe(Math.max(a.activity['2026-06-15'], b.activity['2026-06-15']))
    }
    // Merging is idempotent, so two tabs settle instead of ping-ponging.
    const once = mergeProgress(a, b)
    expect(mergeProgress(once, once)).toEqual(once)
    expect(mergeProgress(a, once)).toEqual(once)
  })

  it('lets the other tab lower the best time (a deleted solve)', () => {
    const local = { ...initialProgress(), bestSolveMs: 4_100 }
    expect(mergeProgress(local, { ...initialProgress(), bestSolveMs: 62_000 }).bestSolveMs).toBe(62_000)
    expect(mergeProgress(local, initialProgress()).bestSolveMs).toBeNull()
  })

  it('keeps the daily challenge that is further along', () => {
    const mine = { ...initialProgress(), daily: { date: '2026-06-15', id: 'drills-3', count: 2, items: [] } }
    const theirs = { ...initialProgress(), daily: { date: '2026-06-15', id: 'drills-3', count: 1, items: [] }, dailyDoneOn: '2026-06-14' }
    const merged = mergeProgress(mine, theirs)
    expect(merged.daily!.count).toBe(2)
    expect(merged.dailyDoneOn).toBe('2026-06-14')
  })
})

describe('stage ids', () => {
  it('are the same eight, in the same order, in the store and in the engine', () => {
    expect([...STAGE_IDS]).toEqual([...ENGINE_STAGE_IDS])
  })
})
