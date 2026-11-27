import { describe, expect, it } from 'vitest'
import { BADGES } from './badges'
import { addDays, daysBetween, isDateKey, localDateKey, weekOf, weekdayIndex } from './dates'
import {
  applyEvent,
  countPatterns,
  currentStreak,
  initialProgress,
  levelFromXp,
  sanitizeProgress,
  touchStreak,
  XP,
  xpForLevel,
  type ProgressData,
  type ProgressEventMap,
  type ProgressEventType,
} from './progressLogic'
import { STAGE_IDS } from './stages'

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min)

function run(
  data: ProgressData,
  events: [ProgressEventType, ProgressEventMap[ProgressEventType], Date][],
): ProgressData {
  return events.reduce((acc, [type, payload, now]) => applyEvent(acc, type, payload as never, now).data, data)
}

describe('dates', () => {
  it('uses the local calendar day', () => {
    expect(localDateKey(at(2026, 3, 9, 0, 1))).toBe('2026-03-09')
    expect(localDateKey(at(2026, 3, 9, 23, 59))).toBe('2026-03-09')
    expect(localDateKey(at(2026, 12, 31, 23, 59))).toBe('2026-12-31')
  })

  it('counts calendar days across month, year and leap-day boundaries', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2026-03-10', '2026-03-08')).toBe(-2)
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('is not fooled by daylight-saving days (23h and 25h long)', () => {
    // US spring forward 2026-03-08, EU 2026-03-29; autumn 2026-11-01 / 2026-10-25.
    for (const day of ['2026-03-08', '2026-03-29', '2026-10-25', '2026-11-01']) {
      expect(daysBetween(addDays(day, -1), day)).toBe(1)
      expect(daysBetween(day, addDays(day, 1))).toBe(1)
    }
  })

  it('validates date keys', () => {
    expect(isDateKey('2026-02-28')).toBe(true)
    expect(isDateKey('2026-02-30')).toBe(false)
    expect(isDateKey('2026-2-3')).toBe(false)
    expect(isDateKey(20260203)).toBe(false)
  })

  it('knows the week, Monday first', () => {
    expect(weekdayIndex('2026-11-12')).toBe(3) // a Thursday
    expect(weekdayIndex('2026-11-09')).toBe(0)
    expect(weekdayIndex('2026-11-15')).toBe(6)
    expect(weekOf('2026-11-12')).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
    ])
  })
})

describe('levels', () => {
  it('follows the 100 / 300 / 600 / 1000 curve', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(100)
    expect(xpForLevel(3)).toBe(300)
    expect(xpForLevel(5)).toBe(1000)
    expect(levelFromXp(0).level).toBe(1)
    expect(levelFromXp(99).level).toBe(1)
    expect(levelFromXp(100).level).toBe(2)
    expect(levelFromXp(299).level).toBe(2)
    expect(levelFromXp(300).level).toBe(3)
  })

  it('is exact at every boundary up to level 60', () => {
    for (let level = 2; level <= 60; level++) {
      expect(levelFromXp(xpForLevel(level)).level).toBe(level)
      expect(levelFromXp(xpForLevel(level) - 1).level).toBe(level - 1)
    }
  })

  it('reports progress inside the level', () => {
    const info = levelFromXp(150)
    expect(info).toMatchObject({ level: 2, xpIntoLevel: 50, xpForNext: 200, xpToNext: 150, progress: 0.25 })
    expect(info.title).toBe('Twister')
    expect(levelFromXp(1e7).title).toBe('Cube Master')
  })

  it('survives nonsense input', () => {
    expect(levelFromXp(-5).level).toBe(1)
    expect(levelFromXp(Number.NaN).level).toBe(1)
    expect(levelFromXp(Infinity).level).toBe(1)
  })
})

describe('streak', () => {
  const empty = { current: 0, best: 0, lastActive: null }

  it('starts at one and does not double-count a day', () => {
    const a = touchStreak(empty, '2026-05-01')
    expect(a).toEqual({ current: 1, best: 1, lastActive: '2026-05-01' })
    expect(touchStreak(a, '2026-05-01')).toBe(a)
  })

  it('extends on consecutive days and resets after a gap', () => {
    let s = touchStreak(empty, '2026-05-01')
    s = touchStreak(s, '2026-05-02')
    s = touchStreak(s, '2026-05-03')
    expect(s.current).toBe(3)
    s = touchStreak(s, '2026-05-05')
    expect(s).toEqual({ current: 1, best: 3, lastActive: '2026-05-05' })
  })

  it('late night then early next morning is two days, not a broken streak', () => {
    let data = initialProgress()
    data = applyEvent(data, 'custom', { xp: 5 }, at(2026, 5, 1, 23, 58)).data
    data = applyEvent(data, 'custom', { xp: 5 }, at(2026, 5, 2, 0, 3)).data
    expect(data.streak.current).toBe(2)
  })

  it('shows the streak until the end of the next day, then zero', () => {
    const s = { current: 4, best: 6, lastActive: '2026-05-10' }
    expect(currentStreak(s, '2026-05-10')).toBe(4)
    expect(currentStreak(s, '2026-05-11')).toBe(4)
    expect(currentStreak(s, '2026-05-12')).toBe(0)
    expect(currentStreak(empty, '2026-05-12')).toBe(0)
  })

  it('keeps the run if the clock goes backwards', () => {
    const s = touchStreak({ current: 5, best: 5, lastActive: '2026-05-10' }, '2026-05-09')
    expect(s.current).toBe(5)
  })

  it('awards streak badges at 3, 7 and 30 days', () => {
    let data = initialProgress()
    const unlockedOn: Record<string, number> = {}
    for (let day = 1; day <= 30; day++) {
      const { data: next, result } = applyEvent(data, 'custom', { xp: 1 }, new Date(2026, 0, day, 18))
      for (const badge of result.newBadges) unlockedOn[badge.id] = day
      data = next
    }
    expect(unlockedOn['streak-3']).toBe(3)
    expect(unlockedOn['streak-7']).toBe(7)
    expect(unlockedOn['streak-30']).toBe(30)
    expect(data.streak).toMatchObject({ current: 30, best: 30 })
  })
})

describe('applyEvent', () => {
  const now = at(2026, 6, 15)
  /** Fresh progress with today's daily challenge already paid, so XP sums are about the event alone. */
  const noDaily = (): ProgressData => ({ ...initialProgress(), dailyDoneOn: localDateKey(now) })

  it('gives full XP for a lesson once, a little for repeats, and the stage badge', () => {
    const first = applyEvent(initialProgress(), 'lesson-completed', { stageId: 'daisy' }, now)
    expect(first.result.xpGained).toBe(XP.lessonFirst)
    expect(XP.lessonFirst).toBe(60)
    expect(first.result.newBadges.map((b) => b.id)).toEqual(['stage-daisy'])
    expect(first.result.leveledUp).toBe(false)
    expect(first.data.lessons.daisy.completedAt).toBe(now.toISOString())

    const again = applyEvent(first.data, 'lesson-completed', { stageId: 'daisy' }, now)
    expect(again.result.xpGained).toBe(XP.lessonRepeat)
    expect(again.result.newBadges).toEqual([])
    expect(again.data.badges['stage-daisy']).toBe(first.data.badges['stage-daisy'])
  })

  it('starting a lesson records it, counts as practice, but gives no XP', () => {
    const { data, result } = applyEvent(initialProgress(), 'lesson-started', { stageId: 'white-cross' }, now)
    expect(result.xpGained).toBe(0)
    expect(data.lessons['white-cross']).toEqual({ startedAt: now.toISOString(), completedAt: null })
    expect(data.streak.current).toBe(1)
    // First Steps is for finishing the basics, not for opening a lesson.
    expect(data.badges['first-steps']).toBeUndefined()
  })

  it('finishing the primer earns First Steps and its XP, once', () => {
    const first = applyEvent(initialProgress(), 'primer-completed', {}, now)
    expect(first.result.newBadges.map((b) => b.id)).toEqual(['first-steps'])
    expect(first.result.xpGained).toBeGreaterThanOrEqual(XP.primer)
    const again = applyEvent(first.data, 'primer-completed', {}, now)
    expect(again.result.newBadges).toEqual([])
    expect(again.data.counters.primer).toBe(1)
  })

  it('unlocks Method Master only when all eight stages are done', () => {
    let data = initialProgress()
    STAGE_IDS.slice(0, 7).forEach((stageId) => {
      data = applyEvent(data, 'lesson-completed', { stageId }, now).data
    })
    expect(data.badges['full-method']).toBeUndefined()
    const last = applyEvent(data, 'lesson-completed', { stageId: STAGE_IDS[7] }, now)
    expect(last.result.newBadges.map((b) => b.id)).toContain('full-method')
  })

  it('handles first solve, timer milestones and personal bests', () => {
    // A real solve first (Free play): the first-solve milestone.
    const played = applyEvent(initialProgress(), 'solve-completed', { context: 'play' }, now)
    expect(played.result.newBadges.map((b) => b.id)).toEqual(['first-solve'])
    const first = applyEvent(played.data, 'solve-completed', { context: 'timer', ms: 170_000 }, now)
    expect(first.result.xpGained).toBe(XP.timedSolve)
    expect(first.result.newBadges.map((b) => b.id).sort()).toEqual(['sub-3', 'sub-5'])
    expect(first.data.bestSolveMs).toBe(170_000)

    const faster = applyEvent(first.data, 'solve-completed', { context: 'timer', ms: 59_999 }, now)
    expect(faster.result.xpGained).toBe(XP.timedSolve + XP.personalBestBonus)
    expect(faster.result.newBadges.map((b) => b.id).sort()).toEqual(['sub-1', 'sub-2'])
    expect(faster.data.bestSolveMs).toBe(59_999)

    const slower = applyEvent(faster.data, 'solve-completed', { context: 'timer', ms: 90_000 }, now)
    expect(slower.result.xpGained).toBe(XP.timedSolve)
    expect(slower.data.bestSolveMs).toBe(59_999)
  })

  it('does not trust the timer alone: no solve, badges or bonus before a real solve, or for an unbelievable time (QA 2, M10)', () => {
    // A complete beginner pressing the timer for 11.5 s: a little XP, his time kept, nothing else.
    const press = applyEvent(initialProgress(), 'solve-completed', { context: 'timer', ms: 11_500 }, now)
    expect(press.result.newBadges).toEqual([])
    expect(press.result.xpGained).toBe(XP.timerPractice)
    expect(press.data.counters.solves ?? 0).toBe(0)
    expect(press.data.counters.timedSolves).toBe(1)
    expect(press.data.bestSolveMs).toBe(11_500)
    // Even a believable time does not count before he has solved the cube somewhere.
    const slow = applyEvent(press.data, 'solve-completed', { context: 'timer', ms: 200_000 }, now)
    expect(slow.result.newBadges).toEqual([])
    // After a real solve, a time under the floor still earns no speed badge.
    const played = applyEvent(slow.data, 'solve-completed', { context: 'play' }, now).data
    const tooFast = applyEvent(played, 'solve-completed', { context: 'timer', ms: 15_000 }, now)
    expect(tooFast.result.newBadges).toEqual([])
    expect(tooFast.result.xpGained).toBe(XP.timerPractice)
    // A real cube solved in the walk-through also proves it.
    const real = applyEvent(applyEvent(initialProgress(), 'real-cube-solved', {} as never, now).data, 'solve-completed', { context: 'timer', ms: 100_000 }, now)
    expect(real.result.newBadges.map((b) => b.id).sort()).toEqual(['sub-2', 'sub-3', 'sub-5'])
  })

  it('does not give speed badges for untimed solves or exactly-on-the-limit times', () => {
    const play = applyEvent(initialProgress(), 'solve-completed', { context: 'play', ms: 1000 }, now)
    expect(play.result.newBadges.map((b) => b.id)).toEqual(['first-solve'])
    expect(play.data.bestSolveMs).toBeNull()
    const exact = applyEvent(play.data, 'solve-completed', { context: 'timer', ms: 300_000 }, now)
    expect(exact.result.newBadges.map((b) => b.id)).not.toContain('sub-5')
  })

  it('counts solves toward 10 / 50 / 100', () => {
    let data = initialProgress()
    for (let i = 0; i < 10; i++) data = applyEvent(data, 'solve-completed', { context: 'play' }, now).data
    expect(data.counters.solves).toBe(10)
    expect(data.badges['solves-10']).toBeDefined()
    expect(data.badges['solves-50']).toBeUndefined()
  })

  it('scores notation rounds and clamps impossible scores', () => {
    const round = applyEvent(noDaily(), 'notation-round', { correct: 20, total: 20 }, now)
    expect(round.result.xpGained).toBe(20 * XP.notationPerCorrect + XP.notationPerfectBonus)
    expect(round.result.newBadges.map((b) => b.id)).toEqual(['notation-rookie'])
    const cheat = applyEvent(noDaily(), 'notation-round', { correct: 9999, total: 10 }, now)
    expect(cheat.result.xpGained).toBe(10 * XP.notationPerCorrect + XP.notationPerfectBonus)
    expect(cheat.data.badges['notation-master']).toBeUndefined()
  })

  it('gives Notation Master for three flawless level rounds (8–12 questions each)', () => {
    let data = noDaily()
    const badges: string[][] = []
    for (const [correct, total] of [[8, 8], [9, 10], [10, 10], [3, 3], [12, 12]] as const) {
      const step = applyEvent(data, 'notation-round', { correct, total }, now)
      data = step.data
      badges.push(step.result.newBadges.map((b) => b.id))
    }
    // 9/10 is not flawless and 3/3 is too short to count; the third real perfect round earns it.
    expect(badges).toEqual([['notation-rookie'], [], [], [], ['notation-master']])
    expect(data.counters.notationPerfect).toBe(3)
  })

  it('collects patterns and algorithms without duplicates', () => {
    let data = noDaily()
    for (const id of ['a', 'b', 'c', 'd', 'a', 'b']) data = applyEvent(data, 'pattern-made', { patternId: id }, now).data
    expect(data.patterns).toEqual(['a', 'b', 'c', 'd'])
    expect(data.xp).toBe(4 * XP.patternFirst)
    const fifth = applyEvent(data, 'pattern-made', { patternId: 'e' }, now)
    expect(fifth.result.newBadges.map((b) => b.id)).toEqual(['pattern-collector'])

    let algs = initialProgress()
    for (let i = 0; i < 10; i++) algs = applyEvent(algs, 'algorithm-practised', { algorithmId: `alg-${i}` }, now).data
    expect(algs.badges['algorithm-ace']).toBeDefined()
    // Already practised today: nothing more. The first rep on another day is worth a little.
    expect(applyEvent(algs, 'algorithm-practised', { algorithmId: 'alg-1' }, now).result.xpGained).toBe(0)
    expect(applyEvent(algs, 'algorithm-practised', { algorithmId: 'alg-1' }, at(2026, 6, 16)).result.xpGained).toBe(XP.algorithmRepeat)
  })

  it('tracks XP per day and keeps a short log, newest first', () => {
    const data = run(initialProgress(), [
      ['custom', { xp: 10 }, at(2026, 6, 15)],
      ['custom', { xp: 5 }, at(2026, 6, 15, 20)],
      ['custom', { xp: 7 }, at(2026, 6, 16)],
    ])
    expect(data.activity).toEqual({ '2026-06-15': 15, '2026-06-16': 7 })
    expect(data.log.map((entry) => entry.xp)).toEqual([7, 5, 10])
    let many = initialProgress()
    for (let i = 0; i < 100; i++) many = applyEvent(many, 'custom', { xp: 1 }, now).data
    expect(many.log).toHaveLength(60)
  })

  it('announces level-ups and level badges', () => {
    const { result, data } = applyEvent({ ...initialProgress(), xp: 990 }, 'custom', { xp: 20 }, now)
    expect(result).toMatchObject({ leveledUp: true, level: 5 })
    expect(data.badges['level-5']).toBeDefined()
  })

  it('ignores unknown events and never mutates its input', () => {
    const start = initialProgress()
    const frozen = JSON.stringify(start)
    const { data, result } = applyEvent(start, 'nope' as never, {} as never, now)
    expect(data).toBe(start)
    expect(result.xpGained).toBe(0)
    applyEvent(start, 'lesson-completed', { stageId: 'daisy' }, now)
    expect(JSON.stringify(start)).toBe(frozen)
  })
})

describe('sanitizeProgress', () => {
  it('returns defaults for junk', () => {
    for (const junk of [null, undefined, 42, 'x', [], { xp: 'lots' }, { streak: 7, badges: [] }]) {
      expect(sanitizeProgress(junk)).toEqual(initialProgress())
    }
  })

  it('keeps the valid parts of a partly broken save', () => {
    const clean = sanitizeProgress({
      xp: 420.9,
      badges: { 'first-solve': '2026-01-02T10:00:00.000Z', 'made-up': '2026-01-02T10:00:00.000Z', 'sub-5': 'yesterday-ish' },
      streak: { current: 4, best: 2, lastActive: '2026-01-02' },
      lessons: { daisy: { startedAt: '2026-01-01T10:00:00.000Z', completedAt: 5 }, bad: { startedAt: 1 } },
      counters: { solves: 3, weird: -1 },
      bestSolveMs: -10,
      patterns: ['x', 'x', 3],
      activity: { '2026-01-02': 40, nope: 3 },
      dailyDoneOn: '2026-13-40',
      log: [{ at: '2026-01-02T10:00:00.000Z', type: 'custom', xp: 5 }, { at: 'bad' }],
    })
    expect(clean.xp).toBe(420)
    expect(Object.keys(clean.badges)).toEqual(['first-solve'])
    expect(clean.streak).toEqual({ current: 4, best: 4, lastActive: '2026-01-02' })
    expect(clean.lessons).toEqual({ daisy: { startedAt: '2026-01-01T10:00:00.000Z', completedAt: null } })
    expect(clean.counters).toEqual({ solves: 3 })
    expect(clean.bestSolveMs).toBeNull()
    expect(clean.patterns).toEqual(['x'])
    expect(clean.activity).toEqual({ '2026-01-02': 40 })
    expect(clean.dailyDoneOn).toBeNull()
    expect(clean.log).toHaveLength(1)
  })
})

describe('flags and pattern badges', () => {
  const now = at(2026, 6, 15, 10)
  const make = (data: ProgressData, ...ids: string[]) => {
    const badges: string[] = []
    for (const id of ids) {
      const step = applyEvent(data, 'pattern-made', { patternId: id }, now)
      data = step.data
      badges.push(...step.result.newBadges.map((b) => b.id))
    }
    return { data, badges }
  }

  it('five flags do not award the pattern badges, three award Flag Bearer', () => {
    const three = make(initialProgress(), 'flag-japan', 'flag-india', 'flag-peru')
    expect(three.badges).toEqual(['flag-bearer'])
    const five = make(three.data, 'flag-spain', 'flag-laos')
    expect(five.badges).toEqual([])
    expect(five.data.badges['pattern-collector']).toBeUndefined()
  })

  it('twelve flags are a World Tour; the designed flag is not one of them', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `flag-f${i}`)
    const eleven = make(initialProgress(), ...ids, 'flag-own')
    expect(eleven.data.badges['world-tour']).toBeUndefined()
    expect(eleven.badges).toContain('flag-designer')
    expect(make(eleven.data, 'flag-f11').badges).toEqual(['world-tour'])
  })

  it('tricks and flags count separately', () => {
    const { data } = make(initialProgress(), 'a', 'b', 'c', 'd', 'flag-x', 'flag-own')
    expect(countPatterns(data.patterns)).toEqual({ tricks: 4, flags: 1 })
    expect(data.badges['pattern-collector']).toBeUndefined()
    expect(make(data, 'e').badges).toEqual(['pattern-collector'])
  })

  it('old saves load unchanged', () => {
    const old = { ...initialProgress(), patterns: ['checkerboard', 'cube-in-cube'] }
    expect(sanitizeProgress(JSON.parse(JSON.stringify(old))).patterns).toEqual(old.patterns)
  })

  it('a flag completes the daily "make a pattern" challenge', () => {
    const data: ProgressData = { ...initialProgress(), daily: { date: localDateKey(now), id: 'pattern-1', count: 0, items: [] } }
    expect(applyEvent(data, 'pattern-made', { patternId: 'flag-india' }, now).result.dailyCompleted).toBeTruthy()
  })
})

describe('badge catalogue', () => {
  it('has unique ids and covers the brief', () => {
    const ids = BADGES.map((badge) => badge.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of [
      'first-solve', 'streak-3', 'streak-7', 'streak-30', 'sub-5', 'sub-3', 'sub-2', 'sub-1',
      'notation-master', 'pattern-collector', 'flag-bearer', 'world-tour', 'flag-designer', ...STAGE_IDS.map((stage) => `stage-${stage}`),
    ]) {
      expect(ids).toContain(id)
    }
  })
})
