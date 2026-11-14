/**
 * The controller driving the *real* view (CubeView, no WebGL needed), with the state prop
 * arriving the way React delivers it: after the handler that changed it has returned.
 *
 * Regression tests for: a demo's "Play again" stalling after one move, load + autoplay and
 * reset + apply from a different cube being cancelled by the next render, playback staying
 * "playing" after the view dropped a move, and a cube unmounted mid-run leaving `busy` set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyAlg, parseAlg, SOLVED, type CubeState } from '../../cube'
import { CubeController, HISTORY_LIMIT, sanitizeSession } from '../controller'
import { viewTheme } from '../theme'
import { CubeView } from '../view'

const realDocument = (globalThis as { document?: unknown }).document

beforeAll(() => {
  // The model draws its sticker textures on a 2D canvas; a do-nothing one is enough here.
  const context: unknown = new Proxy({}, { get: (_target, key) => (key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true })
  ;(globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => context, style: {} }) }
})
afterAll(() => {
  ;(globalThis as { document?: unknown }).document = realDocument
})

function rig(initial: CubeState = SOLVED) {
  const controller = new CubeController({ initial, playerGapMs: 1 })
  const view = new CubeView(viewTheme('light'))
  view.callbacks = { onMove: (move, meta) => controller.handleViewMove(move, meta), requestFrame: () => {} }
  view.setState(controller.state, false)
  // What <Cube3D>'s handle gives the controller.
  controller.attachView({
    play: (alg, options) => view.play(parseAlg(typeof alg === 'string' ? alg : alg.join(' ')), options),
    stop: () => view.stop(),
    whenIdle: () => view.whenIdle(),
    setStateInstant: (state) => view.setState(state, false),
  })
  /** "React": after a handler, the controller's state reaches the view as the `state` prop. */
  const render = () => view.setState(controller.state, true)
  /** Run frames (big time steps, so turns finish quickly) until `done()` or the frame budget runs out. */
  const run = async (done: () => boolean, frames = 4000) => {
    for (let i = 0; i < frames && !done(); i++) {
      view.update(0.1)
      render()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  const settled = () => !controller.getSnapshot().busy && !controller.getSnapshot().player?.playing
  return { controller, view, render, run, settled }
}

const TRIGGER = parseAlg("F R U R' U' F'")

describe('controller + real view', () => {
  it('load({ from, autoplay }) from a different cube plays to the end', async () => {
    const { controller, view, render, run, settled } = rig(applyAlg(SOLVED, "R U R' U'"))
    controller.load(TRIGGER, { from: SOLVED, autoplay: true })
    render()
    await run(settled)
    const player = controller.getSnapshot().player!
    expect(player.position).toBe(TRIGGER.length)
    expect(player.playing).toBe(false)
    expect(controller.state).toBe(applyAlg(SOLVED, TRIGGER))
    expect(view.getState()).toBe(controller.state)
  })

  it('"Play again" at the end of a demo plays the whole thing again', async () => {
    const { controller, render, run, settled } = rig()
    controller.load(TRIGGER, { from: SOLVED })
    render()
    controller.play()
    render()
    await run(settled)
    expect(controller.getSnapshot().player!.position).toBe(TRIGGER.length)
    // Second time round: play() rewinds and starts in the same handler, before any render.
    controller.play()
    render()
    await run(settled)
    const player = controller.getSnapshot().player!
    expect(player.position).toBe(TRIGGER.length)
    expect(player.playing).toBe(false)
    expect(controller.getSnapshot().busy).toBe(false)
  })

  it('reset() then apply() in one handler runs to the end', async () => {
    const { controller, render, run, settled } = rig(applyAlg(SOLVED, 'R U'))
    controller.reset(SOLVED)
    const result = controller.apply(TRIGGER)
    render()
    await run(settled)
    expect(await result).toBe(true)
    expect(controller.state).toBe(applyAlg(SOLVED, TRIGGER))
  })

  it('grabbing a layer during playback ends playback (the button goes back to Play)', async () => {
    const { controller, view, render, run } = rig()
    controller.load(parseAlg("F R U R' U' F' F R U R' U' F'"), { from: SOLVED })
    render()
    controller.play()
    render()
    await run(() => controller.getSnapshot().player!.position >= 2)
    expect(controller.getSnapshot().player!.playing).toBe(true)
    // He turns a layer himself while it plays.
    view.userMove('L', 'drag')
    render()
    await run(() => !controller.getSnapshot().busy && !view.isAnimating, 400)
    const snapshot = controller.getSnapshot()
    expect(snapshot.player!.playing).toBe(false)
    expect(snapshot.busy).toBe(false)
    expect(snapshot.player!.detached).toBe(true)
    // One press on Play picks the algorithm up again and finishes it.
    controller.play()
    render()
    await run(() => !controller.getSnapshot().busy && !controller.getSnapshot().player?.playing)
    expect(controller.getSnapshot().player!.position).toBe(12)
    expect(controller.getSnapshot().player!.playing).toBe(false)
  })

  it('the view dropping a move mid-playback (a snap) leaves playback stopped, not stuck on "playing"', async () => {
    const { controller, view, render, run } = rig()
    controller.load(TRIGGER, { from: SOLVED })
    render()
    controller.play()
    render()
    await run(() => controller.getSnapshot().player!.position >= 1)
    view.stop() // what a snap or a grabbed layer does to the script in flight
    await run(() => !controller.getSnapshot().busy, 400)
    expect(controller.getSnapshot().player!.playing).toBe(false)
    expect(controller.getSnapshot().busy).toBe(false)
  })

  it('a cube unmounted mid-run does not leave busy / playing set', async () => {
    const { controller, view, render, run } = rig()
    const changes: boolean[] = []
    controller.subscribe(() => changes.push(controller.getSnapshot().busy))
    controller.load(TRIGGER, { from: SOLVED })
    render()
    controller.play()
    render()
    await run(() => controller.getSnapshot().player!.position >= 1)
    controller.attachView(null)
    view.dispose()
    expect(controller.getSnapshot().busy).toBe(false)
    expect(controller.getSnapshot().player!.playing).toBe(false)
    expect(changes[changes.length - 1]).toBe(false)
  })

  it('a string that is not a cube is ignored by the view instead of throwing', () => {
    const { view } = rig()
    expect(() => view.setState('hello' as CubeState, false)).not.toThrow()
    expect(view.getState()).toBe(SOLVED)
  })
})

describe('a long history', () => {
  it('is trimmed from the front, and the session still says how many moves were made', () => {
    const controller = new CubeController({ initial: SOLVED })
    const moves = parseAlg("R U R' U'")
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) controller.handleViewMove(moves[i % 4], { source: 'drag' })
    const snapshot = controller.getSnapshot()
    expect(snapshot.history).toHaveLength(HISTORY_LIMIT)
    expect(snapshot.moveCount).toBe(HISTORY_LIMIT + 50)
    // `start` has moved along with the trim — so it cannot identify the cube the session began from.
    expect(snapshot.start).not.toBe(SOLVED)
    // The count survives a save and a reload, and undo counts back down.
    const restored = new CubeController({ initial: sanitizeSession(JSON.parse(JSON.stringify(controller.getSession()))) })
    expect(restored.getSnapshot().moveCount).toBe(HISTORY_LIMIT + 50)
    expect(restored.state).toBe(controller.state)
    restored.undo()
    expect(restored.getSnapshot().moveCount).toBe(HISTORY_LIMIT + 49)
    restored.reset(SOLVED)
    expect(restored.getSnapshot().moveCount).toBe(0)
  })
})
