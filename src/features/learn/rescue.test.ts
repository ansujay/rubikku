/**
 * The picture chooser ("Which picture looks most like your cube?"): each picture really shows the
 * stage it names (and no more), and each route opens the next stage's real-cube step or practice.
 */
import { describe, expect, it } from 'vitest'
import { analyzeCube, centerColors, isStageComplete, STAGE_IDS } from '../../cube'
import { beatIndex, getLesson } from './content'
import { RESCUE_PICKS, rescueRoute, stagePicture } from './rescue'

describe('the picture chooser', () => {
  it('offers eight pictures, in path order: scrambled, then each of the first seven stages finished', () => {
    expect(RESCUE_PICKS).toEqual(['scrambled', ...STAGE_IDS.slice(0, 7)])
    RESCUE_PICKS.forEach((pick, i) => {
      const { state } = stagePicture(pick)
      const analysis = analyzeCube(state)
      expect(centerColors(state).U, `${pick}: held yellow up, as he holds his cube`).toBe('yellow')
      // Exactly the stages up to the pictured one are finished.
      expect(analysis.completed, pick).toEqual(STAGE_IDS.slice(0, i))
      if (pick !== 'scrambled') expect(isStageComplete(state, pick), pick).toBe(true)
      expect(isStageComplete(state, STAGE_IDS[i]), `${pick}: the next stage is not done`).toBe(false)
    })
  })

  it('the white cross and the white corners are seen from below (they are built underneath); the rest from above', () => {
    expect(RESCUE_PICKS.filter((pick) => stagePicture(pick).below)).toEqual(['white-cross', 'white-corners'])
  })

  it('lights what is solved: more of the cube with every stage', () => {
    let last = 0
    for (const pick of RESCUE_PICKS) {
      const lit = stagePicture(pick).lit!.length
      expect(lit, pick).toBeGreaterThanOrEqual(last)
      last = lit
    }
  })

  it('routes each picture to the stage after it: its real-cube step and its practice cubes', () => {
    RESCUE_PICKS.forEach((pick, i) => {
      const route = rescueRoute(pick)
      expect(route.next, pick).toBe(STAGE_IDS[i])
      const lesson = getLesson(route.next)!
      expect(lesson.number).toBe(i + 1)
      // The beats exist, and are the real-cube step and the drills.
      const cube = lesson.beats[beatIndex(lesson, route.cube.beat)]
      const drill = lesson.beats[beatIndex(lesson, route.drill.beat)]
      expect(cube.id).toBe('cube')
      expect(cube.kind).toBe('real')
      expect(drill.id).toBe('drill')
      expect(drill.kind).toBe('drill')
      // A picture of a finished stage asks him to check that stage on his cube first.
      if (pick === 'scrambled') expect(route.checks).toEqual([])
      else expect(route.checks.length).toBeGreaterThan(0)
      // "Not quite" goes one picture back.
      expect(route.earlier).toBe(i > 0 ? RESCUE_PICKS[i - 1] : null)
    })
  })

  it('the checks name the place to look: underneath for the white layer, on top for the yellow stages', () => {
    expect(rescueRoute('white-cross').checks.join(' ')).toMatch(/Underneath/)
    expect(rescueRoute('white-corners').checks.join(' ')).toMatch(/Underneath/)
    expect(rescueRoute('daisy').checks.join(' ')).toMatch(/On top/)
    expect(rescueRoute('yellow-cross').checks.join(' ')).toMatch(/On top: a \*\*yellow cross\*\*/)
    // Mid-way through the final twist the cube matches no picture: he is told which one to pick.
    expect(rescueRoute('yellow-corners-position').checks.join(' ')).toMatch(/middle of the final twist/)
  })
})
