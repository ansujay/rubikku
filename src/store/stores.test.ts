import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installMemoryStorage, type MemoryStorage } from './testStorage'
import { XP } from './progressLogic'

let storage: MemoryStorage

async function loadStores() {
  vi.resetModules()
  return await import('./index')
}

beforeEach(() => {
  storage = installMemoryStorage()
})

describe('createPersistedStore', () => {
  it('saves under a namespaced key with a version', async () => {
    const { useSettings } = await loadStores()
    useSettings.getState().setTheme('dark')
    const saved = JSON.parse(storage.getItem('rubikku:settings')!)
    expect(saved.version).toBe(1)
    expect(saved.state.theme).toBe('dark')
    expect(saved.state.setTheme).toBeUndefined()
  })

  it('restores state on the next load', async () => {
    const first = await loadStores()
    first.useSettings.getState().setTurnSpeed(1.5)
    first.useProgress.getState().recordEvent('lesson-completed', { stageId: 'daisy' })
    const second = await loadStores()
    expect(second.useSettings.getState().turnSpeed).toBe(1.5)
    expect(second.useProgress.getState().xp).toBe(XP.lessonFirst)
    expect(second.useProgress.getState().lessons.daisy.completedAt).toBeTruthy()
    expect(typeof second.useProgress.getState().recordEvent).toBe('function')
  })

  it('survives corrupt JSON, quarantines it, and starts from defaults', async () => {
    storage.setItem('rubikku:settings', '{"state":{"theme":"dar')
    storage.setItem('rubikku:progress', 'null')
    const { useSettings, useProgress } = await loadStores()
    expect(useSettings.getState().theme).toBe('system')
    expect(useProgress.getState().xp).toBe(0)
    expect(storage.getItem('rubikku:settings:corrupt')).toBe('{"state":{"theme":"dar')
    useSettings.getState().setSound(false)
    expect(JSON.parse(storage.getItem('rubikku:settings')!).state.sound).toBe(false)
  })

  it('drops invalid values but keeps valid ones', async () => {
    storage.setItem(
      'rubikku:settings',
      JSON.stringify({ version: 1, state: { theme: 'neon', sound: 'yes', motion: 'reduced', turnSpeed: 99, setTheme: 'x' } }),
    )
    const { useSettings } = await loadStores()
    const s = useSettings.getState()
    expect(s.theme).toBe('system')
    expect(s.sound).toBe(true)
    expect(s.motion).toBe('reduced')
    expect(s.turnSpeed).toBe(2)
    expect(typeof s.setTheme).toBe('function')
  })

  it('runs migrate for other versions and tolerates a migrate that throws', async () => {
    const { createPersistedStore } = await loadStores()
    storage.setItem('rubikku:old', JSON.stringify({ version: 1, state: { points: 7 } }))
    const migrated = createPersistedStore<{ score: number }>(
      {
        name: 'old',
        version: 2,
        migrate: (saved, from) => (from === 1 ? { score: (saved as { points: number }).points * 10 } : saved),
      },
      () => ({ score: 0 }),
    )
    expect(migrated.getState().score).toBe(70)

    storage.setItem('rubikku:boom', JSON.stringify({ version: 0, state: { score: 5 } }))
    const safe = createPersistedStore<{ score: number }>(
      {
        name: 'boom',
        version: 3,
        migrate: () => {
          throw new Error('bad migration')
        },
      },
      () => ({ score: 1 }),
    )
    expect(safe.getState().score).toBe(1)
  })

  it('rejects bad and duplicate names', async () => {
    const { createPersistedStore } = await loadStores()
    const make = (name: string) => createPersistedStore<{ a: number }>({ name, version: 1, migrate: (s) => s }, () => ({ a: 1 }))
    expect(() => make('Has Spaces')).toThrow()
    expect(() => make('settings')).toThrow()
  })

  it('works with no localStorage at all', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    const { useSettings } = await loadStores()
    expect(() => useSettings.getState().setTheme('light')).not.toThrow()
    expect(useSettings.getState().theme).toBe('light')
  })
})

describe('settings', () => {
  it('clamps and steps turn speed', async () => {
    const { useSettings, turnDurationMs } = await loadStores()
    useSettings.getState().setTurnSpeed(0.1)
    expect(useSettings.getState().turnSpeed).toBe(0.5)
    useSettings.getState().setTurnSpeed(1.3)
    expect(useSettings.getState().turnSpeed).toBe(1.25)
    expect(turnDurationMs(1)).toBe(320)
    expect(turnDurationMs(2)).toBe(160)
    expect(turnDurationMs(Number.NaN)).toBe(320)
  })
})

describe('progress store', () => {
  it('recordEvent returns what changed and persists it', async () => {
    const { useProgress } = await loadStores()
    const result = useProgress.getState().recordEvent('solve-completed', { context: 'play' }, new Date(2026, 4, 4, 10))
    expect(result.xpGained).toBe(130)
    expect(result.newBadges.map((b) => b.id)).toContain('first-solve')
    expect(result.streak).toBe(1)
    const saved = JSON.parse(storage.getItem('rubikku:progress')!).state
    expect(saved.xp).toBe(130)
    expect(saved.streak.lastActive).toBe('2026-05-04')
    expect(saved.recordEvent).toBeUndefined()
  })

  it('correctBestSolve moves only the all-time best: no XP, badges, streak or log entry', async () => {
    const { useProgress } = await loadStores()
    useProgress.getState().recordEvent('solve-completed', { context: 'timer', ms: 45_000 }, new Date(2026, 4, 4, 10))
    const { correctBestSolve: _fn, recordEvent: _fn2, ...before } = useProgress.getState()
    void _fn
    void _fn2
    expect(before.bestSolveMs).toBe(45_000)

    useProgress.getState().correctBestSolve(58_014.6)
    expect(useProgress.getState().bestSolveMs).toBe(58_015)
    useProgress.getState().correctBestSolve(null)
    expect(useProgress.getState().bestSolveMs).toBeNull()
    // Rubbish is treated as "no best", never stored.
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      useProgress.getState().correctBestSolve(45_000)
      useProgress.getState().correctBestSolve(bad)
      expect(useProgress.getState().bestSolveMs).toBeNull()
    }
    const { correctBestSolve: _a, recordEvent: _b, ...after } = useProgress.getState()
    void _a
    void _b
    expect(after).toEqual({ ...before, bestSolveMs: null })
    const saved = JSON.parse(storage.getItem('rubikku:progress')!).state
    expect(saved.bestSolveMs).toBeNull()
    expect(saved.correctBestSolve).toBeUndefined()
    // The next real solve sets a best again in the usual way.
    useProgress.getState().recordEvent('solve-completed', { context: 'timer', ms: 61_000 }, new Date(2026, 4, 4, 11))
    expect(useProgress.getState().bestSolveMs).toBe(61_000)
  })
})

describe('backup', () => {
  it('round-trips every namespaced store, including ones this build does not know', async () => {
    const a = await loadStores()
    a.useSettings.getState().setTheme('dark')
    a.useProgress.getState().recordEvent('lesson-completed', { stageId: 'daisy' }, new Date(2026, 4, 4, 10))
    storage.setItem('rubikku:timer', JSON.stringify({ version: 2, state: { solves: [1, 2, 3] } }))
    storage.setItem('other-app', 'leave me alone')
    storage.setItem('rubikku:settings:corrupt', 'junk')

    const backup = a.createBackup(new Date('2026-05-04T10:00:00Z'))
    expect(Object.keys(backup.stores).sort()).toEqual(['progress', 'settings', 'timer'])
    const text = a.serializeBackup(backup)

    a.resetEverything()
    expect(a.useSettings.getState().theme).toBe('system')
    expect(a.useProgress.getState().xp).toBe(0)
    expect(storage.getItem('rubikku:timer')).toBeNull()
    expect(storage.getItem('rubikku:settings:corrupt')).toBeNull()
    expect(storage.getItem('other-app')).toBe('leave me alone')

    const result = await a.importBackupText(text)
    expect(result.ok && result.restored).toEqual(['progress', 'settings', 'timer'])
    expect(a.useSettings.getState().theme).toBe('dark')
    expect(a.useProgress.getState().xp).toBe(XP.lessonFirst)
    expect(a.useProgress.getState().badges['stage-daisy']).toBeTruthy()
    expect(JSON.parse(storage.getItem('rubikku:timer')!)).toEqual({ version: 2, state: { solves: [1, 2, 3] } })
  })

  it('import replaces, it does not merge', async () => {
    const a = await loadStores()
    a.useSettings.getState().setSound(false)
    const text = a.serializeBackup(a.createBackup())
    a.useSettings.getState().setSound(true)
    a.useProgress.getState().recordEvent('custom', { xp: 500 })
    await a.importBackupText(text)
    expect(a.useSettings.getState().sound).toBe(false)
    expect(a.useProgress.getState().xp).toBe(0)
  })

  it('rejects files that are not backups, with friendly messages', async () => {
    const { parseBackup } = await loadStores()
    const bad = [
      '',
      'not json',
      '[]',
      '{"app":"other","kind":"backup","schema":1,"stores":{}}',
      '{"app":"rubikku","kind":"backup","schema":99,"stores":{"settings":{"state":{},"version":1}}}',
      '{"app":"rubikku","kind":"backup","schema":1,"stores":{}}',
      '{"app":"rubikku","kind":"backup","schema":1,"stores":{"settings":"nope","../evil":{"state":{},"version":1}}}',
    ]
    for (const text of bad) {
      const result = parseBackup(text)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.length).toBeGreaterThan(5)
    }
  })

  it('a tampered backup cannot inject invalid state', async () => {
    const a = await loadStores()
    const result = await a.importBackupText(
      JSON.stringify({
        app: 'rubikku',
        kind: 'backup',
        schema: 1,
        exportedAt: 'whenever',
        stores: {
          settings: { version: 1, state: { theme: 'hacker', turnSpeed: -4, sound: false } },
          progress: { version: 1, state: { xp: -100, badges: { 'sub-1': 'x' }, recordEvent: 'gone' } },
        },
      }),
    )
    expect(result.ok).toBe(true)
    expect(a.useSettings.getState()).toMatchObject({ theme: 'system', turnSpeed: 0.5, sound: false })
    expect(a.useProgress.getState().xp).toBe(0)
    expect(a.useProgress.getState().badges).toEqual({})
    expect(typeof a.useProgress.getState().recordEvent).toBe('function')
  })

  it('names the file by local date', async () => {
    const { backupFileName } = await loadStores()
    expect(backupFileName(new Date(2026, 0, 5))).toBe('rubikku-backup-2026-01-05.json')
  })
})

/** The storage text of every rubikku key, to compare before/after. */
const dump = () => Object.fromEntries(Array.from({ length: storage.length }, (_, i) => storage.key(i)!).sort().map((key) => [key, storage.getItem(key)]))

describe('atomic import', () => {
  it('rolls everything back when a store cannot be written, and says so', async () => {
    const a = await loadStores()
    a.useSettings.getState().setTheme('dark')
    a.useProgress.getState().recordEvent('lesson-completed', { stageId: 'daisy' }, new Date(2026, 4, 4, 10))
    storage.setItem('rubikku:timer', JSON.stringify({ version: 1, state: { solves: ['mine'] } }))
    const before = dump()
    const xp = a.useProgress.getState().xp

    const backup = {
      app: 'rubikku',
      kind: 'backup',
      schema: 1,
      exportedAt: '2026-05-01T00:00:00Z',
      stores: {
        settings: { version: 1, state: { theme: 'light' } },
        progress: { version: 1, state: { xp: 9000 } },
        timer: { version: 1, state: { solves: ['x'.repeat(5000)] } },
      },
    }
    // The device fills up part-way through: the big timer history does not fit.
    const realSet = storage.setItem.bind(storage)
    storage.setItem = (key: string, value: string) => {
      if (key === 'rubikku:timer' && value.length > 1000) throw new DOMException('full', 'QuotaExceededError')
      realSet(key, value)
    }

    const result = await a.importBackupText(JSON.stringify(backup))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/nothing was changed/i)
    storage.setItem = realSet
    // Storage and memory are exactly as they were (bar the marker that tells other tabs to re-read).
    const after = dump()
    delete after['rubikku:!sync']
    expect(after).toEqual(before)
    expect(a.useSettings.getState().theme).toBe('dark')
    expect(a.useProgress.getState().xp).toBe(xp)
    expect(a.useProgress.getState().lessons.daisy.completedAt).toBeTruthy()
    // And saving still works afterwards.
    a.useSettings.getState().setTheme('light')
    expect(JSON.parse(storage.getItem('rubikku:settings')!).state.theme).toBe('light')
  })

  it('validates the whole file before touching anything', async () => {
    const a = await loadStores()
    a.useProgress.getState().recordEvent('custom', { xp: 70 })
    const before = dump()
    for (const text of ['', '{"app":"rubikku","kind":"backup","schema":1,"stores":{"progress":', JSON.stringify({ app: 'rubikku', kind: 'backup', schema: 1, stores: { progress: 'nope' } })]) {
      const result = await a.importBackupText(text)
      expect(result.ok).toBe(false)
      expect(dump()).toEqual(before)
    }
    expect(a.useProgress.getState().xp).toBe(70)
  })

  it('a store missing from the backup goes back to defaults, in memory and in storage', async () => {
    const a = await loadStores()
    a.useSettings.getState().setTheme('dark')
    a.useProgress.getState().recordEvent('custom', { xp: 70 })
    const result = await a.importBackupText(JSON.stringify({ app: 'rubikku', kind: 'backup', schema: 1, exportedAt: '2026-05-01T00:00:00Z', stores: { progress: { version: 1, state: { xp: 300 } } } }))
    expect(result.ok && result.restored).toEqual(['progress'])
    expect(a.useProgress.getState().xp).toBe(300)
    expect(a.useSettings.getState().theme).toBe('system')
    expect(JSON.parse(storage.getItem('rubikku:settings')!).state.theme).toBe('system')
    const reloaded = await loadStores()
    expect(reloaded.useProgress.getState().xp).toBe(300)
    expect(reloaded.useSettings.getState().theme).toBe('system')
  })
})

describe('saving can fail', () => {
  it('tells the app once, frees quarantined copies, and recovers', async () => {
    const a = await loadStores()
    const failures = vi.fn()
    a.onSaveFailure(failures)
    storage.setItem('rubikku:timer:corrupt', 'junk')
    const realSet = storage.setItem.bind(storage)
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    a.useSettings.getState().setTheme('dark')
    a.useSettings.getState().setSound(false)
    a.useProgress.getState().recordEvent('custom', { xp: 5 })
    expect(failures).toHaveBeenCalledTimes(1)
    expect(a.isSaveFailing()).toBe(true)
    // The app keeps running from memory, and the junk that was hogging space is gone.
    expect(a.useSettings.getState().theme).toBe('dark')
    expect(storage.getItem('rubikku:timer:corrupt')).toBeNull()

    storage.setItem = realSet
    a.useSettings.getState().setSound(true)
    expect(a.isSaveFailing()).toBe(false)
    expect(JSON.parse(storage.getItem('rubikku:settings')!).state).toMatchObject({ theme: 'dark', sound: true })
    // A second outage is reported again.
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    a.useSettings.getState().setSound(false)
    expect(failures).toHaveBeenCalledTimes(2)
    storage.setItem = realSet
  })
})

describe('two tabs', () => {
  /** Two module instances sharing one storage; `deliver` plays the browser's storage events. */
  async function twoTabs() {
    const a = await loadStores()
    const b = await loadStores()
    const seen = { a: dump(), b: dump() }
    let events = 0
    const deliver = () => {
      // Each tab is told about keys that changed since it last looked (as `storage` events do
      // for writes made by the *other* tab). Loop until everything is quiet.
      for (let round = 0; round < 20; round++) {
        let changed = false
        for (const [tab, name] of [[a, 'a'], [b, 'b']] as const) {
          const now = dump()
          // Sorted, so the "everything is being replaced" marker (rubikku:!sync) arrives first, as it does in a browser.
          for (const key of [...new Set([...Object.keys(now), ...Object.keys(seen[name])])].sort()) {
            if (now[key] === seen[name][key]) continue
            changed = true
            events++
            seen[name] = { ...seen[name], [key]: now[key] }
            tab.handleStorageChange(key, now[key] ?? null)
            // What this tab wrote in response is its own write: it never hears about it.
            seen[name] = dump()
          }
        }
        if (!changed) return events
      }
      throw new Error('tabs never settled')
    }
    /** A tab does not get events for its own writes. */
    const own = (name: 'a' | 'b') => {
      seen[name] = dump()
    }
    return { a, b, deliver, own }
  }

  it('a stale tab picks up the other tab’s progress instead of overwriting it', async () => {
    const { a, b, deliver, own } = await twoTabs()
    const day = new Date(2026, 4, 4, 10)
    // Tab B (the timer) earns XP and a badge.
    b.useProgress.getState().recordEvent('solve-completed', { context: 'play' }, day)
    own('b')
    deliver()
    expect(a.useProgress.getState().xp).toBe(b.useProgress.getState().xp)
    expect(a.useProgress.getState().badges['first-solve']).toBeTruthy()
    // Tab A now does something: B's XP must survive in storage.
    a.useProgress.getState().recordEvent('pattern-made', { patternId: 'checkerboard' }, day)
    own('a')
    deliver()
    const saved = JSON.parse(storage.getItem('rubikku:progress')!).state
    expect(saved.badges['first-solve']).toBeTruthy()
    expect(saved.patterns).toEqual(['checkerboard'])
    expect(saved.xp).toBe(b.useProgress.getState().xp)
    expect(b.useProgress.getState().patterns).toEqual(['checkerboard'])
  })

  it('merges when both tabs earned something before hearing from each other, then settles', async () => {
    const { a, b, deliver } = await twoTabs()
    const day = new Date(2026, 4, 4, 10)
    a.useProgress.getState().recordEvent('lesson-completed', { stageId: 'daisy' }, day)
    b.useProgress.getState().recordEvent('solve-completed', { context: 'play' }, day) // overwrites A's save in storage
    const events = deliver()
    expect(events).toBeLessThan(8)
    for (const tab of [a, b]) {
      const state = tab.useProgress.getState()
      expect(state.badges['stage-daisy']).toBeTruthy()
      expect(state.badges['first-solve']).toBeTruthy()
      expect(state.lessons.daisy.completedAt).toBeTruthy()
      expect(state.counters.solves).toBe(1)
      expect(state.xp).toBeGreaterThanOrEqual(130)
    }
    const saved = JSON.parse(storage.getItem('rubikku:progress')!).state
    expect(Object.keys(saved.badges).sort()).toEqual(Object.keys(a.useProgress.getState().badges).sort())
  })

  it('settings changed in one tab show up in the other', async () => {
    const { a, b, deliver, own } = await twoTabs()
    a.useSettings.getState().setTheme('dark')
    own('a')
    deliver()
    expect(b.useSettings.getState().theme).toBe('dark')
  })

  it('a reset or import in one tab is the truth for the other (no merging old progress back)', async () => {
    vi.useFakeTimers()
    try {
      const { a, b, deliver, own } = await twoTabs()
      const day = new Date(2026, 4, 4, 10)
      a.useProgress.getState().recordEvent('lesson-completed', { stageId: 'daisy' }, day)
      own('a')
      deliver()
      expect(b.useProgress.getState().xp).toBe(XP.lessonFirst)

      a.resetEverything()
      own('a')
      deliver()
      vi.advanceTimersByTime(500)
      expect(b.useProgress.getState().xp).toBe(0)
      expect(b.useProgress.getState().badges).toEqual({})
      expect(JSON.parse(storage.getItem('rubikku:progress')!).state.xp).toBe(0)

      // Import an older, smaller save in A: B must take it, not "improve" it.
      b.useProgress.getState().recordEvent('custom', { xp: 900 }, day)
      own('b')
      deliver()
      const result = await a.importBackupText(JSON.stringify({ app: 'rubikku', kind: 'backup', schema: 1, exportedAt: '2026-05-01T00:00:00Z', stores: { progress: { version: 1, state: { xp: 40 } } } }))
      expect(result.ok).toBe(true)
      own('a')
      deliver()
      vi.advanceTimersByTime(500)
      expect(b.useProgress.getState().xp).toBe(40)
      expect(JSON.parse(storage.getItem('rubikku:progress')!).state.xp).toBe(40)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores saves it cannot read', async () => {
    const { a } = await twoTabs()
    a.useSettings.getState().setTheme('dark')
    a.handleStorageChange('rubikku:settings', '{broken')
    a.handleStorageChange('rubikku:settings', JSON.stringify({ version: 99, state: { theme: 'light' } }))
    a.handleStorageChange('other-app', 'x')
    a.handleStorageChange('rubikku:unknown-store', JSON.stringify({ version: 1, state: {} }))
    expect(a.useSettings.getState().theme).toBe('dark')
  })
})
