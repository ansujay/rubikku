import { afterEach, describe, expect, it, vi } from 'vitest'
import { BADGES } from '../store/badges'
import { celebration, mergeCelebrations, useCelebrations, type Celebration } from './celebrate'

const base = (patch: Partial<Celebration>): Celebration => ({ id: 1, tier: 'moment', title: 't', badges: [], xp: 0, notes: [], level: null, source: 'reward', headline: false, createdAt: 0, ...patch })

describe('celebrations', () => {
  afterEach(() => celebration.reset())

  it('merging: the higher tier wins, a page’s own words beat a reward’s, XP is not counted twice', () => {
    const page = base({ tier: 'moment', title: 'Pattern made', source: 'feature', xp: 10 })
    const rewardLevel = base({ tier: 'milestone', title: 'Level 3', level: 3, xp: 10, badges: [BADGES[0]], notes: ['Daily challenge done'] })
    const merged = mergeCelebrations(page, rewardLevel)
    expect(merged).toMatchObject({ tier: 'milestone', title: 'Pattern made', level: 3, xp: 10, source: 'feature', notes: ['Daily challenge done'] })
    expect(merged.badges.map((b) => b.id)).toEqual([BADGES[0].id])
  })

  it('merging: a headline achievement (the first solve) takes the words, even from a page', () => {
    const page = base({ tier: 'moment', title: 'You solved it!', source: 'feature' })
    const first = base({ tier: 'milestone', title: 'You solved the cube', headline: true, badges: [BADGES[0]] })
    expect(mergeCelebrations(page, first)).toMatchObject({ tier: 'milestone', title: 'You solved the cube', headline: true })
    expect(mergeCelebrations(first, page)).toMatchObject({ tier: 'milestone', title: 'You solved the cube' })
  })

  it('a held celebration waits, and plays when released', () => {
    const release = celebration.hold()
    celebration.moment({ title: 'Personal best' })
    expect(useCelebrations.getState().current).toBeNull()
    release()
    expect(useCelebrations.getState().current?.title).toBe('Personal best')
  })

  it('requests that land together become one celebration; later ones wait their turn', () => {
    vi.useFakeTimers()
    celebration.moment({ title: 'A' })
    celebration.fromReward('moment', { title: 'New badge', badges: [BADGES[1]] })
    expect(useCelebrations.getState().current?.title).toBe('A')
    expect(useCelebrations.getState().current?.badges).toHaveLength(1)
    vi.advanceTimersByTime(1500)
    celebration.milestone({ title: 'B' })
    expect(useCelebrations.getState().queue.map((c) => c.title)).toEqual(['B'])
    celebration.dismiss()
    expect(useCelebrations.getState().current?.title).toBe('B')
    vi.useRealTimers()
  })

  it('held celebrations wait until released, and the cube on screen is asked to celebrate', () => {
    const cube = { celebrate: vi.fn() }
    const off = celebration.registerCube(cube)
    const release = celebration.hold()
    celebration.moment({ title: 'Later' })
    expect(useCelebrations.getState().current).toBeNull()
    release()
    expect(useCelebrations.getState().current?.title).toBe('Later')
    expect(cube.celebrate).toHaveBeenCalledWith('stage')
    off()
  })
})
