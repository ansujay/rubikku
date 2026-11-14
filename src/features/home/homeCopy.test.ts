import { describe, expect, it } from 'vitest'
import { STAGE_IDS, type LessonProgress } from '../../store'
import { nextStop } from '../learn/next'
import { emptyCapstone } from '../learn/learnStore'
import { heroCopy, pathSummary, stageItems, stagesDone } from './homeCopy'

const stamp = '2026-01-01T00:00:00.000Z'
const done = (n: number): Record<string, LessonProgress> => Object.fromEntries(STAGE_IDS.slice(0, n).map((id) => [id, { startedAt: stamp, completedAt: stamp }]))

describe('home copy', () => {
  it('a new player starts with the warm-up, and no stage is "current" yet', () => {
    const next = nextStop({}, { lessons: {}, capstone: emptyCapstone() })
    expect(heroCopy(next).cta).toEqual({ to: '/learn/primer', label: 'Start here' })
    expect(pathSummary(next, 0)).toMatch(/warm-up/)
    const items = stageItems({}, next)
    expect(items.map((i) => i.state)).toEqual(['todo', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked'])
  })

  it('mid-path: the next stage is current and the hero names it', () => {
    const lessons = done(3)
    const next = nextStop(lessons, { lessons: {}, capstone: emptyCapstone() })
    expect(heroCopy(next).title).toBe('Next up: middle layer.')
    expect(pathSummary(next, stagesDone(lessons))).toBe('3 of 8 stages complete')
    expect(stageItems(lessons, next).map((i) => i.state)).toEqual(['done', 'done', 'done', 'current', 'locked', 'locked', 'locked', 'locked'])
  })

  it('after the eight stages comes the full solve, then the timer', () => {
    const lessons = done(8)
    expect(heroCopy(nextStop(lessons, { lessons: {}, capstone: emptyCapstone() })).cta.to).toBe('/learn/full-solve')
    expect(heroCopy(nextStop(lessons, { lessons: {}, capstone: { ...emptyCapstone(), solves: 1 } })).cta.to).toBe('/timer')
  })
})
