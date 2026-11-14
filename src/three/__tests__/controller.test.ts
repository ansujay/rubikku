import { describe, expect, it, vi } from 'vitest'
import { applyAlg, applyMove, isMove, parseAlg, randomScramble, SOLVED, toAlg, type CubeState, type Move } from '../../cube'
import { createSession, CubeController, sanitizeSession, type CubeViewDriver, type PlayOptions } from '../controller'

/** A stand-in for the mounted cube: reports each move a tick apart, like the real view. */
function fakeView(controller: () => CubeController) {
  let stopped = false
  let running = 0
  const played: Move[] = []
  const view: CubeViewDriver = {
    async play(alg, _options?: PlayOptions) {
      const run = ++running
      stopped = false
      for (const move of toAlg(alg)) {
        await Promise.resolve()
        if (stopped || run !== running) return false
        played.push(move)
        controller().handleViewMove(move, { source: 'play' })
      }
      await Promise.resolve()
      return !stopped && run === running
    },
    stop() {
      stopped = true
    },
    whenIdle: () => Promise.resolve(),
  }
  return { view, played }
}

const flush = async (times = 60) => {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('CubeController: history', () => {
  it('records user moves and undoes / redoes them', () => {
    const c = new CubeController()
    const seen: Move[] = []
    c.onUserMove((move) => seen.push(move))
    for (const move of parseAlg("R U F'")) c.handleViewMove(move, { source: 'drag' })
    expect(c.state).toBe(applyAlg(SOLVED, "R U F'"))
    expect(c.getSnapshot().history).toEqual(['R', 'U', "F'"])
    expect(seen).toEqual(['R', 'U', "F'"])

    expect(c.undo()).toBe(true)
    expect(c.state).toBe(applyAlg(SOLVED, 'R U'))
    expect(c.getSnapshot().redoStack).toEqual(["F'"])
    expect(c.undo()).toBe(true)
    expect(c.redo()).toBe(true)
    expect(c.state).toBe(applyAlg(SOLVED, 'R U'))
    expect(c.getSnapshot().canRedo).toBe(true)

    // A new move drops the redo stack.
    c.handleViewMove('D', { source: 'keyboard' })
    expect(c.getSnapshot().canRedo).toBe(false)
    expect(c.getSnapshot().history).toEqual(['R', 'U', 'D'])
    c.undo()
    c.undo()
    c.undo()
    expect(c.state).toBe(SOLVED)
    expect(c.undo()).toBe(false)
    expect(seen).toHaveLength(4) // undo / redo are not "user moves"
  })

  it('state always equals start + history, through any mix of operations', () => {
    const c = new CubeController({ historyLimit: 25 })
    const moves = randomScramble({ length: 60 })
    moves.forEach((move, i) => {
      c.handleViewMove(move, { source: 'drag' })
      if (i % 7 === 3) c.undo()
      if (i % 11 === 5) {
        c.undo()
        c.redo()
      }
      const { start, state, done } = c.getSession()
      expect(applyAlg(start, done)).toBe(state)
      expect(done.length).toBeLessThanOrEqual(25)
    })
  })

  it('apply without a view is instant; record: false starts the history over', async () => {
    const c = new CubeController()
    await c.apply("R U R' U'")
    expect(c.state).toBe(applyAlg(SOLVED, "R U R' U'"))
    expect(c.getSnapshot().history).toHaveLength(4)
    const scramble = randomScramble()
    await c.apply(scramble, { record: false })
    expect(c.state).toBe(applyAlg(applyAlg(SOLVED, "R U R' U'"), scramble))
    expect(c.getSnapshot().history).toHaveLength(0)
    expect(c.getSnapshot().canUndo).toBe(false)
    expect(c.getSession().start).toBe(c.state)
  })

  it('apply through a view follows the moves one by one and can be interrupted', async () => {
    let c!: CubeController
    const { view, played } = fakeView(() => c)
    c = new CubeController()
    c.attachView(view)
    const states: CubeState[] = []
    c.subscribe(() => states.push(c.state))
    const done = c.apply('R U F D')
    expect(c.getSnapshot().busy).toBe(true)
    await flush(1)
    c.reset(SOLVED) // interrupt mid-run
    expect(await done).toBe(false)
    expect(c.state).toBe(SOLVED)
    expect(played.length).toBeLessThan(4)
    expect(c.getSnapshot().busy).toBe(false)

    expect(await c.apply('R U')).toBe(true)
    expect(c.state).toBe(applyAlg(SOLVED, 'R U'))
    expect(c.getSnapshot().busy).toBe(false)
  })

  it('reset clears everything', () => {
    const c = new CubeController()
    c.handleViewMove('R', { source: 'drag' })
    c.load('U U')
    const scrambled = applyAlg(SOLVED, 'F2 D')
    c.reset(scrambled)
    expect(c.getSnapshot()).toMatchObject({ state: scrambled, start: scrambled, history: [], redoStack: [], player: null })
  })
})

describe('CubeController: player', () => {
  const alg = "R U R' U'"
  const setup = applyAlg(SOLVED, "U R U' R'")

  it('steps, seeks and restarts over the history', async () => {
    const c = new CubeController()
    c.load(alg, { from: setup })
    expect(c.state).toBe(setup)
    expect(c.getSnapshot().player).toMatchObject({ position: 0, total: 4, playing: false })

    c.step(1)
    await flush()
    expect(c.getSnapshot().player!.position).toBe(1)
    expect(c.state).toBe(applyAlg(setup, 'R'))
    c.step(1)
    await flush()
    c.step(-1)
    expect(c.getSnapshot().player!.position).toBe(1)
    expect(c.state).toBe(applyAlg(setup, 'R'))

    c.seek(4)
    expect(c.state).toBe(SOLVED)
    expect(c.getSnapshot().player!.position).toBe(4)
    c.seek(99)
    expect(c.getSnapshot().player!.position).toBe(4)
    c.restart()
    expect(c.state).toBe(setup)
    expect(c.getSnapshot().history).toHaveLength(0)
  })

  it('plays to the end and stops', async () => {
    const c = new CubeController({ playerGapMs: 0 })
    c.load(alg, { from: setup })
    c.play()
    await flush(200)
    expect(c.getSnapshot().player).toMatchObject({ position: 4, playing: false })
    expect(c.state).toBe(SOLVED)
    // Play again from the end starts over.
    c.play()
    await flush(200)
    expect(c.getSnapshot().player).toMatchObject({ position: 4, playing: false })
    expect(c.state).toBe(SOLVED)
  })

  it('plays through a view with pauses, and pause holds the position', async () => {
    vi.useFakeTimers()
    try {
      let c!: CubeController
      const { view } = fakeView(() => c)
      c = new CubeController({ playerGapMs: 100 })
      c.attachView(view)
      c.load(alg, { from: setup, autoplay: true })
      expect(c.getSnapshot().player!.playing).toBe(true)
      await vi.advanceTimersByTimeAsync(150)
      const position = c.getSnapshot().player!.position
      expect(position).toBeGreaterThan(0)
      expect(position).toBeLessThan(4)
      c.pause()
      await vi.advanceTimersByTimeAsync(1000)
      expect(c.getSnapshot().player).toMatchObject({ position, playing: false })
      c.play()
      await vi.advanceTimersByTimeAsync(2000)
      expect(c.getSnapshot().player).toMatchObject({ position: 4, playing: false })
      expect(c.state).toBe(SOLVED)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps earlier history when loaded without `from`, and undo steps back', async () => {
    const c = new CubeController()
    c.handleViewMove('F', { source: 'drag' })
    c.load('R U')
    c.step(1)
    await flush()
    c.step(1)
    await flush()
    expect(c.getSnapshot().history).toEqual(['F', 'R', 'U'])
    c.undo()
    expect(c.getSnapshot().player!.position).toBe(1)
    c.undo()
    expect(c.getSnapshot().player!.position).toBe(0)
    c.undo() // before the algorithm started: the player lets go
    expect(c.getSnapshot().player).toBeNull()
    expect(c.state).toBe(SOLVED)
  })

  it("the user's own correct move advances the player; a wrong one detaches it until the next action", async () => {
    const c = new CubeController()
    c.load(alg, { from: setup })
    c.handleViewMove('R', { source: 'drag' })
    expect(c.getSnapshot().player).toMatchObject({ position: 1, detached: false })
    c.handleViewMove('F', { source: 'drag' })
    c.handleViewMove('B', { source: 'drag' })
    expect(c.getSnapshot().player).toMatchObject({ position: 1, detached: true })
    expect(c.state).toBe(applyAlg(setup, 'R F B'))
    // Undoing the stray moves re-attaches.
    c.undo()
    c.undo()
    expect(c.getSnapshot().player).toMatchObject({ position: 1, detached: false })
    c.handleViewMove('F', { source: 'drag' })
    // Any player action snaps back onto the algorithm.
    c.step(1)
    await flush()
    expect(c.getSnapshot().player).toMatchObject({ position: 2, detached: false })
    expect(c.state).toBe(applyAlg(setup, 'R U'))
  })

  it('setSpeed and unload', () => {
    const c = new CubeController()
    c.load(alg)
    c.setSpeed(2)
    expect(c.getSnapshot().player!.speed).toBe(2)
    c.unload()
    expect(c.getSnapshot().player).toBeNull()
  })
})

describe('sessions', () => {
  it('round-trips through JSON, player included', async () => {
    const c = new CubeController()
    c.handleViewMove('F', { source: 'drag' })
    c.load("R U R'")
    c.step(1)
    await flush()
    c.step(1)
    await flush()
    const saved = JSON.parse(JSON.stringify(c.getSession()))
    const restored = new CubeController({ initial: sanitizeSession(saved) })
    expect(restored.state).toBe(c.state)
    expect(restored.getSnapshot().history).toEqual(['F', 'R', 'U'])
    expect(restored.getSnapshot().player).toMatchObject({ position: 2, total: 3 })
    restored.step(1)
    await flush()
    expect(restored.state).toBe(applyAlg(SOLVED, "F R U R'"))
  })

  it('repairs or rejects damaged saves', () => {
    expect(sanitizeSession(null)).toBeNull()
    expect(sanitizeSession({ state: 'nope' })).toBeNull()
    expect(sanitizeSession(SOLVED)).toEqual(createSession(SOLVED))
    const state = applyMove(SOLVED, 'R')
    // History that does not lead to the state: keep the state, drop the history.
    expect(sanitizeSession({ start: SOLVED, state, done: ['U'], undone: [] })).toEqual(createSession(state))
    // Unknown moves.
    expect(sanitizeSession({ start: SOLVED, state, done: ['R', 'Q'], undone: [] })).toEqual(createSession(state))
    // A player that does not line up with the history is dropped.
    const session = sanitizeSession({ start: SOLVED, state, done: ['R'], undone: ['zz'], player: { alg: ['U'], offset: 0, position: 1, speed: 1 } })
    expect(session).toMatchObject({ state, done: ['R'], undone: [], player: null })
    expect(session!.done.every(isMove)).toBe(true)
  })
})
