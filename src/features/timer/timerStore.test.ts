import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installMemoryStorage, type MemoryStorage } from '../../store/testStorage'

let storage: MemoryStorage

async function load() {
  vi.resetModules()
  return await import('./timerStore')
}

beforeEach(() => {
  storage = installMemoryStorage()
})

describe('timer store', () => {
  it('starts with a 20-move scramble and no solves', async () => {
    const { useTimer, currentScramble } = await load()
    const state = useTimer.getState()
    expect(state.solves).toEqual([])
    expect(currentScramble(state).split(' ')).toHaveLength(20)
    expect(state.inspection).toBe(false)
  })

  it('records a solve against the scramble on screen, then deals a new one', async () => {
    const { useTimer, currentScramble } = await load()
    const before = currentScramble(useTimer.getState())
    const solve = useTimer.getState().addSolve({ ms: 12_345.6, penalty: 'ok' })
    expect(solve).toMatchObject({ ms: 12_346, penalty: 'ok', scramble: before })
    const after = useTimer.getState()
    expect(after.solves).toEqual([solve])
    expect(currentScramble(after)).not.toBe(before)
  })

  it('steps back and forward through scrambles without inventing new ones', async () => {
    const { useTimer, currentScramble } = await load()
    const first = currentScramble(useTimer.getState())
    useTimer.getState().nextScramble()
    const second = currentScramble(useTimer.getState())
    expect(second).not.toBe(first)
    useTimer.getState().previousScramble()
    expect(currentScramble(useTimer.getState())).toBe(first)
    useTimer.getState().previousScramble()
    expect(currentScramble(useTimer.getState())).toBe(first)
    useTimer.getState().nextScramble()
    expect(currentScramble(useTimer.getState())).toBe(second)
  })

  it('edits penalties, deletes and clears', async () => {
    const { useTimer } = await load()
    const a = useTimer.getState().addSolve({ ms: 1000, penalty: 'ok' })
    const b = useTimer.getState().addSolve({ ms: 2000, penalty: '+2' })
    useTimer.getState().setPenalty(a.id, 'dnf')
    expect(useTimer.getState().solves.map((s) => s.penalty)).toEqual(['dnf', '+2'])
    useTimer.getState().deleteSolve(a.id)
    expect(useTimer.getState().solves.map((s) => s.id)).toEqual([b.id])
    useTimer.getState().clearSolves()
    expect(useTimer.getState().solves).toEqual([])
  })

  it('a solve with no time (inspection ran out) can only be a DNF', async () => {
    const { useTimer } = await load()
    const none = useTimer.getState().addSolve({ ms: 0, penalty: 'dnf' })
    useTimer.getState().setPenalty(none.id, 'ok')
    useTimer.getState().setPenalty(none.id, '+2')
    expect(useTimer.getState().solves[0].penalty).toBe('dnf')
    const timed = useTimer.getState().addSolve({ ms: 40_000, penalty: 'dnf' })
    useTimer.getState().setPenalty(timed.id, 'ok')
    expect(useTimer.getState().solves[1].penalty).toBe('ok')
  })

  it('deleting or penalising the record solve corrects the all-time best in the progress store', async () => {
    const { useTimer } = await load()
    const { useProgress } = await import('../../store')
    const { reconcileBest, resultMs } = await import('./logic/solves')
    const edit = (id: string, change: () => void) => {
      const before = useTimer.getState().solves.find((solve) => solve.id === id) ?? null
      change()
      useProgress.getState().correctBestSolve(reconcileBest(useProgress.getState().bestSolveMs, before, useTimer.getState().solves))
    }
    const slow = useTimer.getState().addSolve({ ms: 70_000, penalty: 'ok' })
    useProgress.getState().recordEvent('solve-completed', { context: 'timer', ms: resultMs(slow) })
    const fast = useTimer.getState().addSolve({ ms: 45_000, penalty: 'ok' })
    useProgress.getState().recordEvent('solve-completed', { context: 'timer', ms: resultMs(fast) })
    expect(useProgress.getState().bestSolveMs).toBe(45_000)
    const xp = useProgress.getState().xp

    edit(fast.id, () => useTimer.getState().setPenalty(fast.id, '+2'))
    expect(useProgress.getState().bestSolveMs).toBe(47_000)
    edit(fast.id, () => useTimer.getState().setPenalty(fast.id, 'dnf'))
    expect(useProgress.getState().bestSolveMs).toBe(70_000)
    edit(fast.id, () => useTimer.getState().setPenalty(fast.id, 'ok'))
    expect(useProgress.getState().bestSolveMs).toBe(45_000)
    edit(fast.id, () => useTimer.getState().deleteSolve(fast.id))
    expect(useProgress.getState().bestSolveMs).toBe(70_000)
    edit(slow.id, () => useTimer.getState().deleteSolve(slow.id))
    expect(useProgress.getState().bestSolveMs).toBeNull()
    // Corrections never touch XP or badges.
    expect(useProgress.getState().xp).toBe(xp)
    expect(JSON.parse(storage.getItem('rubikku:progress')!).state.bestSolveMs).toBeNull()
  })

  it('caps the history', async () => {
    const { useTimer, MAX_SOLVES } = await load()
    const at = new Date().toISOString()
    useTimer.setState({ solves: Array.from({ length: MAX_SOLVES }, (_, i) => ({ id: `s${i}`, ms: 1000 + i, penalty: 'ok' as const, scramble: '', at })) })
    useTimer.getState().addSolve({ ms: 5, penalty: 'ok' })
    const { solves } = useTimer.getState()
    expect(solves).toHaveLength(MAX_SOLVES)
    expect(solves[0].id).toBe('s1')
    expect(solves[solves.length - 1].ms).toBe(5)
  })

  it('restores scramble, history and settings after a reload', async () => {
    const first = await load()
    first.useTimer.getState().setInspection(true)
    first.useTimer.getState().addSolve({ ms: 43_210, penalty: '+2' })
    first.useTimer.getState().nextScramble()
    first.useTimer.getState().previousScramble()
    const shown = first.currentScramble(first.useTimer.getState())
    const second = await load()
    const state = second.useTimer.getState()
    expect(second.currentScramble(state)).toBe(shown)
    expect(state.scrambles).toHaveLength(3)
    expect(state.inspection).toBe(true)
    expect(state.solves).toHaveLength(1)
    expect(state.solves[0]).toMatchObject({ ms: 43_210, penalty: '+2' })
    expect(JSON.parse(storage.getItem('rubikku:timer')!).version).toBe(1)
  })

  it('survives a damaged save', async () => {
    storage.setItem(
      'rubikku:timer',
      JSON.stringify({ version: 1, state: { solves: [{ id: 'ok', ms: 900, penalty: 'ok', scramble: 'R', at: '2026-01-01T00:00:00.000Z' }, { id: 7 }, 'x'], scrambles: [3, ''], scrambleIndex: 99, inspection: 'yes' } }),
    )
    const { useTimer, currentScramble } = await load()
    const state = useTimer.getState()
    expect(state.solves.map((s) => s.id)).toEqual(['ok'])
    expect(currentScramble(state).split(' ')).toHaveLength(20)
    expect(state.inspection).toBe(false)
  })
})
