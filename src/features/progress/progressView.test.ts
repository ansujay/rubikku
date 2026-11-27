import { describe, expect, it } from 'vitest'
import { BADGES, getBadge, initialProgress } from '../../store'
import { badgeLink, badgeProgress, closestBadge, nextInFamily, buildHeatMap, describeEntry, describeEvent, describeHeatDay, formatDay, heatLevel, timeAgo, unlockedBadges } from './progressView'

describe('heat-map', () => {
  const today = '2026-11-12' // a Thursday

  it('builds 12 Monday-to-Sunday weeks ending with this week', () => {
    const map = buildHeatMap({}, today)
    expect(map.weeks).toHaveLength(12)
    expect(map.weeks.every((week) => week.length === 7)).toBe(true)
    const last = map.weeks[11]
    expect(last[0].date).toBe('2026-11-09')
    expect(last[3]).toMatchObject({ date: today, isToday: true, isFuture: false })
    expect(last[4]).toMatchObject({ date: '2026-11-13', isFuture: true })
    expect(map.weeks[0][0].date).toBe('2026-08-24')
    expect(map.activeDays).toBe(0)
  })

  it('counts activity and ignores future or out-of-range days', () => {
    const map = buildHeatMap({ '2026-11-12': 120, '2026-11-10': 30, '2026-11-14': 500, '2026-01-01': 80 }, today)
    expect(map.activeDays).toBe(2)
    expect(map.totalXp).toBe(150)
    expect(map.weeks[11][3].level).toBe(3)
    expect(map.weeks[11][1].level).toBe(1)
    expect(map.weeks[11][5]).toMatchObject({ xp: 0, level: 0, isFuture: true })
  })

  it('labels each month once, at its first week', () => {
    const { monthLabels } = buildHeatMap({}, today)
    expect(monthLabels.filter(Boolean)).toEqual(['Aug', 'Sep', 'Oct', 'Nov'])
    expect(monthLabels[0]).toBe('Aug')
  })

  it('grades days', () => {
    expect([0, -5, 1, 39, 40, 99, 100, 199, 200, 5000].map(heatLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })

  it('describes a day', () => {
    expect(formatDay('2026-11-12')).toBe('Thu 12 Nov')
    expect(formatDay('2026-11-09')).toBe('Mon 9 Nov')
    const map = buildHeatMap({ '2026-11-10': 30 }, today)
    expect(describeHeatDay(map.weeks[11][1])).toBe('Tue 10 Nov · 30 XP')
    expect(describeHeatDay(map.weeks[11][3])).toBe('Today · no practice')
    expect(describeHeatDay(map.weeks[11][6])).toBe('Sun 15 Nov · not yet')
  })
})

describe('badge helpers', () => {
  it('reports progress for countable badges, clamped', () => {
    const data = { ...initialProgress(), counters: { solves: 3, dailyChallenges: 9 }, patterns: ['a', 'b', 'flag-x', 'flag-own'], algorithms: ['x'] }
    expect(badgeProgress('solves-10', data, 0, 1)).toEqual({ value: 3, max: 10, unit: 'solves' })
    expect(badgeProgress('daily-5', data, 0, 1)).toEqual({ value: 5, max: 5, unit: 'daily challenges' })
    expect(badgeProgress('streak-7', data, 4, 1)).toMatchObject({ value: 4, max: 7 })
    expect(badgeProgress('level-5', data, 0, 4)).toMatchObject({ value: 4, max: 5 })
    expect(badgeProgress('pattern-curator', data, 0, 1)).toMatchObject({ value: 2, max: 12 })
    expect(badgeProgress('flag-bearer', data, 0, 1)).toEqual({ value: 1, max: 3, unit: 'flags' })
    expect(badgeProgress('world-tour', data, 0, 1)).toMatchObject({ value: 1, max: 12 })
    expect(badgeProgress('first-solve', data, 0, 1)).toBeNull()
  })

  it('counts finished stages for the method badge', () => {
    const data = { ...initialProgress(), lessons: { daisy: { startedAt: 'x', completedAt: 'y' }, 'white-cross': { startedAt: 'x', completedAt: null } } }
    expect(badgeProgress('full-method', data, 0, 1)).toMatchObject({ value: 1, max: 8 })
  })

  it('has somewhere to go for every badge', () => {
    for (const badge of BADGES) {
      const link = badgeLink(badge)
      expect(link.to.startsWith('/')).toBe(true)
      expect(link.label.length).toBeGreaterThan(3)
    }
    expect(badgeLink(getBadge('sub-1')!).to).toBe('/timer')
    expect(badgeLink(getBadge('real-deal')!).to).toBe('/solve')
    expect(badgeLink(getBadge('pattern-curator')!).to).toBe('/patterns')
    for (const id of ['flag-bearer', 'world-tour', 'flag-designer']) expect(badgeLink(getBadge(id)!).to).toBe('/patterns?tab=flags')
  })

  it('lists unlocked badges newest first, skipping unknown ids', () => {
    const list = unlockedBadges({ 'first-solve': '2026-11-01T10:00:00.000Z', 'sub-5': '2026-11-03T10:00:00.000Z', nope: '2026-11-05T10:00:00.000Z' })
    expect(list.map((entry) => entry.badge.id)).toEqual(['sub-5', 'first-solve'])
  })
})

describe('activity feed', () => {
  it('words every known event and survives unknown ones', () => {
    expect(describeEvent('lesson-completed').label).toBe('Finished a lesson')
    expect(describeEvent('who-knows')).toMatchObject({ label: 'Practised' })
    // Collapsed runs say how many; a custom event that names itself is not a mystery "Bonus".
    expect(describeEntry({ type: 'drill-completed', count: 4 }).label).toBe('Finished 4 practice cubes')
    expect(describeEntry({ type: 'drill-completed' }).label).toBe('Finished a practice cube')
    expect(describeEntry({ type: 'custom', label: 'Meet your cube' }).label).toBe('Finished: Meet your cube')
    expect(describeEntry({ type: 'custom' }).label).toBe('Bonus')
  })

  it('writes relative times', () => {
    const now = new Date('2026-11-12T12:00:00.000Z')
    const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms).toISOString(), now)
    expect(ago(20_000)).toBe('just now')
    expect(ago(5 * 60_000)).toBe('5 min ago')
    expect(ago(3 * 3_600_000)).toBe('3 h ago')
    expect(ago(30 * 3_600_000)).toBe('yesterday')
    expect(ago(4 * 86_400_000)).toBe('4 days ago')
    expect(ago(31 * 86_400_000)).toMatch(/^\d+ Oct$/)
    expect(timeAgo('rubbish', now)).toBe('')
  })
})

const ALL = BADGES

describe('badge families', () => {
  it('the next badge in a family skips ones already earned', () => {
    const sub5 = ALL.find((b) => b.id === 'sub-5')!
    expect(nextInFamily(sub5, ALL, {})?.id).toBe('sub-3')
    expect(nextInFamily(sub5, ALL, { 'sub-3': 'x' })?.id).toBe('sub-2')
    expect(nextInFamily(ALL.find((b) => b.id === 'sub-1')!, ALL, {})?.id).toBe('sub-5')
  })
  it('the closest badge is the one with the largest share of its goal done', () => {
    const progress = (id: string) => (id === 'solves-10' ? { value: 7, max: 10, unit: 'solves' } : id === 'streak-30' ? { value: 4, max: 30, unit: 'days' } : null)
    expect(closestBadge(ALL, {}, progress)?.badge.id).toBe('solves-10')
    expect(closestBadge(ALL, { 'solves-10': 'x' }, progress)?.badge.id).toBe('streak-30')
    expect(closestBadge(ALL, {}, () => null)).toBeNull()
  })
})
