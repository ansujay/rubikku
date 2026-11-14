import { describe, expect, it } from 'vitest'
import { BADGES, DAILY_CHALLENGES, type EventResult } from '../store'
import { combineRewards, rewardPlan, youreA, type RewardMode } from './rewards'

const result = (patch: Partial<EventResult> = {}): EventResult => ({
  xpGained: 0,
  newBadges: [],
  leveledUp: false,
  level: 1,
  streak: 1,
  streakExtended: false,
  dailyCompleted: null,
  ...patch,
})
const batch = (...entries: [Partial<EventResult>, RewardMode?][]) => entries.map(([patch, mode = 'full']) => ({ result: result(patch), mode }))
const titleOf = (level: number) => `Title${level}`
const plan = (...entries: [Partial<EventResult>, RewardMode?][]) => rewardPlan(combineRewards(batch(...entries)), titleOf)
const toasts = (...entries: [Partial<EventResult>, RewardMode?][]) => plan(...entries).toasts.map((t) => [t.title, t.description])

describe('reward plan', () => {
  const [badgeA, badgeB] = BADGES

  it('plain XP is one small toast; several at once add up', () => {
    expect(toasts([{ xpGained: 15 }])).toEqual([['+15 XP', undefined]])
    expect(toasts([{ xpGained: 15 }], [{ xpGained: 25 }])).toEqual([['+40 XP', undefined]])
    expect(plan([{ xpGained: 15 }]).celebration).toBeNull()
  })

  it('quiet rewards say nothing unless something big happened', () => {
    expect(plan([{ xpGained: 40 }, 'quiet'])).toEqual({ celebration: null, toasts: [] })
    expect(toasts([{ xpGained: 40 }, 'quiet'], [{ xpGained: 15 }])).toEqual([['+15 XP', undefined]])
    const badge = plan([{ xpGained: 40, newBadges: [badgeA] }, 'quiet'])
    expect(badge.toasts).toEqual([])
    expect(badge.celebration?.tier).toBe('moment')
    expect(badge.celebration?.options).toMatchObject({ title: badgeA.name, eyebrow: 'New badge', xp: 40, badges: [badgeA] })
  })

  it('a level-up is a milestone, with any badges and the XP inside it', () => {
    const up = plan([{ xpGained: 120, leveledUp: true, level: 3, newBadges: [badgeA, badgeB] }], [{ xpGained: 15 }])
    expect(up.toasts).toEqual([])
    expect(up.celebration?.tier).toBe('milestone')
    expect(up.celebration?.options).toMatchObject({ title: 'Level 3', level: 3, levelTitle: 'Title3', xp: 135, badges: [badgeA, badgeB] })
  })

  it('level 2 comes with the first 100 XP: a moment, not a takeover', () => {
    const two = plan([{ xpGained: 120, leveledUp: true, level: 2 }])
    expect(two.celebration?.tier).toBe('moment')
    expect(two.celebration?.options).toMatchObject({ title: 'Level 2', level: 2 })
    const withBadge = plan([{ xpGained: 120, leveledUp: true, level: 2, newBadges: [badgeA] }])
    expect(withBadge.celebration?.tier).toBe('moment')
    expect(withBadge.celebration?.options).toMatchObject({ title: badgeA.name, level: 2 })
  })

  it('the first solve and all stages learned are milestones in their own words, on any page', () => {
    const firstSolve = BADGES.find((b) => b.id === 'first-solve')!
    const solved = plan([{ xpGained: 130, newBadges: [firstSolve] }, 'quiet'])
    expect(solved.celebration?.tier).toBe('milestone')
    expect(solved.celebration?.options).toMatchObject({ title: 'You solved the cube', headline: true, badges: [firstSolve] })
    const method = plan([{ xpGained: 80, newBadges: [BADGES.find((b) => b.id === 'full-method')!] }])
    expect(method.celebration?.tier).toBe('milestone')
  })

  it('a capped reward never takes over the screen', () => {
    const firstSolve = BADGES.find((b) => b.id === 'first-solve')!
    const capped = rewardPlan(combineRewards(batch([{ xpGained: 140, leveledUp: true, level: 3, newBadges: [firstSolve] }, 'quiet'])), titleOf, 'moment')
    expect(capped.celebration?.tier).toBe('moment')
    expect(capped.celebration?.options).toMatchObject({ level: 3, badges: [firstSolve] })
    const level = rewardPlan(combineRewards(batch([{ xpGained: 40, leveledUp: true, level: 4 }, 'quiet'])), titleOf, 'moment')
    expect(level.celebration?.tier).toBe('moment')
  })

  it('silent rewards never show', () => {
    expect(plan([{ xpGained: 500, leveledUp: true, level: 3, newBadges: [badgeA] }, 'silent'])).toEqual({ celebration: null, toasts: [] })
  })

  it('several badges are one moment; the same badge twice is one badge', () => {
    const two = plan([{ xpGained: 15, newBadges: [badgeA] }], [{ xpGained: 25, newBadges: [badgeB] }])
    expect(two.celebration?.options).toMatchObject({ eyebrow: '2 new badges', xp: 40, badges: [badgeA, badgeB] })
    expect(plan([{ newBadges: [badgeA] }], [{ newBadges: [badgeA] }]).celebration?.options.badges).toHaveLength(1)
  })

  it('announces the daily challenge: a toast alone, a line inside a celebration', () => {
    const daily = DAILY_CHALLENGES[0]
    expect(toasts([{ xpGained: 70, dailyCompleted: daily }, 'quiet'])).toEqual([['Daily challenge done', `${daily.title} · +70 XP`]])
    const withBadge = plan([{ xpGained: 70, dailyCompleted: daily, newBadges: [badgeA] }])
    expect(withBadge.toasts).toEqual([])
    expect(withBadge.celebration?.options).toMatchObject({ subtitle: badgeA.description, notes: ['Daily challenge done'] })
  })
})

describe('youreA', () => {
  it('uses "an" before a vowel (QA 2, N6)', () => {
    expect(youreA('Apprentice')).toBe('You’re an Apprentice now')
    expect(youreA('Twister')).toBe('You’re a Twister now')
  })
})
