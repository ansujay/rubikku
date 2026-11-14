import { describe, expect, it } from 'vitest'
import { STAGE_IDS, SOLVED } from '../../cube'
import { createSession } from '../../three/controller'
import { emptyCapstone, emptyLesson, type CapstoneSave, type LessonSave } from './learnStore'
import { nextStop } from './next'
import { buildPath, stopLabel } from './path'
import learnStoreSource from './learnStore.ts?raw'
import nextSource from './next.ts?raw'

const done = (ids: readonly string[]) => Object.fromEntries(ids.map((id) => [id, { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-02T00:00:00.000Z' }]))

describe('nextStop: what is next for this player', () => {
  it('a new player starts with the primer, then the stages in order, then the full solve', () => {
    expect(nextStop({}, { lessons: {}, capstone: emptyCapstone() })).toMatchObject({ id: 'primer', kind: 'primer', started: false, to: '/learn/primer', label: 'Start here' })
    const primerSeen = { primer: emptyLesson() }
    expect(nextStop({}, { lessons: primerSeen, capstone: emptyCapstone() })).toMatchObject({ id: 'primer', started: true })
    const primerDone = { primer: { ...emptyLesson(), completed: true } }
    expect(nextStop({}, { lessons: primerDone, capstone: emptyCapstone() })).toMatchObject({ id: 'daisy', kind: 'stage', number: 1, label: 'Stage 1', started: false })
    expect(nextStop(done(STAGE_IDS.slice(0, 4)), { lessons: primerDone, capstone: emptyCapstone() })).toMatchObject({ id: 'yellow-cross', number: 5 })
    expect(nextStop(done(STAGE_IDS), { lessons: {}, capstone: emptyCapstone() })).toMatchObject({ id: 'full-solve', kind: 'capstone', label: 'Finale', to: '/learn/full-solve' })
    expect(nextStop(done(STAGE_IDS), { lessons: {}, capstone: { ...emptyCapstone(), solves: 1 } })).toBeNull()
  })

  it('always agrees with the Learn map (buildPath): same stop, title, label and "started"', () => {
    const lessonSets: Record<string, LessonSave>[] = [
      {},
      { primer: emptyLesson() },
      { primer: { ...emptyLesson(), completed: true } },
      { primer: { ...emptyLesson(), completed: true }, daisy: emptyLesson(), 'middle-layer': emptyLesson() },
    ]
    const capstones: CapstoneSave[] = [emptyCapstone(), { ...emptyCapstone(), session: createSession(SOLVED) }, { ...emptyCapstone(), solves: 2 }]
    const progresses = [
      ...STAGE_IDS.map((_, i) => done(STAGE_IDS.slice(0, i))),
      done(STAGE_IDS),
      done(['daisy', 'yellow-cross']),
      done(['white-cross']),
      { daisy: { startedAt: '2026-01-01T00:00:00.000Z', completedAt: null } },
    ]
    let checked = 0
    for (const lessons of lessonSets) {
      for (const capstone of capstones) {
        for (const progress of progresses) {
          const map = buildPath(progress, lessons, capstone).next
          const next = nextStop(progress, { lessons, capstone })
          checked++
          if (!map) {
            expect(next).toBeNull()
            continue
          }
          expect(next).toMatchObject({ id: map.id, number: map.number, title: map.title, started: map.started, label: stopLabel(map), to: `/learn/${map.id}` })
        }
      }
    }
    expect(checked).toBe(lessonSets.length * capstones.length * progresses.length)
  })

  it('does not import the lesson content, the lesson player or the 3D cube', () => {
    // Home uses this before any of those have loaded; keep it that way.
    const imports = (source: string) => [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(imports(nextSource).sort()).toEqual(['../../store', './learnStore', 'react'])
    expect(imports(learnStoreSource).length).toBeGreaterThan(1)
    for (const path of imports(learnStoreSource)) {
      expect(path, 'learnStore must stay light').not.toMatch(/content|player|engine|three'$|\/three$/)
    }
  })
})
