import { describe, expect, it } from 'vitest'
import { ALL_MOVES, applyAlg, applyMove, FACELETS, moveLayer, randomScramble, SOLVED, type Face, type Move, type Vec3 } from '../../cube'
import {
  actionForKey,
  dragAngle,
  easeTurn,
  moveForTurn,
  pickTurn,
  quarterTurnsOf,
  resolveRelease,
  singleMoveBetween,
  turnDuration,
  type Vec2,
} from '../turns'
import { DEFAULT_LOOP_TIMING, loopDuration, loopFrame } from '../loopTimeline'

/** A simple camera: orthographic three-quarter view from the front-right-top, like the default pose. */
function projector(azimuth = 0.62, elevation = 0.5, scale = 60): (p: Vec3) => Vec2 {
  const ca = Math.cos(azimuth)
  const sa = Math.sin(azimuth)
  const ce = Math.cos(elevation)
  const se = Math.sin(elevation)
  return ([x, y, z]) => {
    const rx = x * ca - z * sa // screen right
    const depth = x * sa + z * ca
    const up = y * ce - depth * se
    return [300 + rx * scale, 300 - up * scale]
  }
}

const surface = (face: Face, position: Vec3): Vec3 => {
  const n = FACELETS.find((f) => f.face === face)!.normal
  return [position[0] + n[0] * 0.5, position[1] + n[1] * 0.5, position[2] + n[2] * 0.5]
}

function dragMove(face: Face, position: Vec3, drag: Vec2, project = projector()): Move | null {
  const grab = pickTurn({ face, position, point: surface(face, position), drag, project })
  if (!grab) return null
  return moveForTurn(grab.axis, grab.layer, resolveRelease(dragAngle(grab, drag)))
}

describe('moveForTurn', () => {
  it('agrees with the engine for every single-layer move', () => {
    for (const move of ALL_MOVES) {
      const layer = moveLayer(move)
      if (layer.layers.length !== 1) continue
      expect(moveForTurn(layer.axis, layer.layers[0], layer.quarterTurns)).toBe(move)
      expect(quarterTurnsOf(move)).toBe(layer.quarterTurns)
    }
  })

  it('wraps and cancels', () => {
    expect(moveForTurn('x', 1, 0)).toBeNull()
    expect(moveForTurn('x', 1, 4)).toBeNull()
    expect(moveForTurn('x', 1, -1)).toBe('R')
    expect(moveForTurn('x', 1, 3)).toBe('R')
    expect(moveForTurn('x', 1, -3)).toBe("R'")
    expect(moveForTurn('y', 0, 1)).toBe('E')
    expect(moveForTurn('z', 0, -1)).toBe('S')
    expect(moveForTurn('x', 0, 1)).toBe('M')
  })
})

describe('pickTurn: drag on a sticker → move', () => {
  // On screen, in the default view: F is the left face, R the right face, U the top.
  const cases: [string, Face, Vec3, Vec2, Move][] = [
    ['front, right column, up', 'F', [1, 0, 1], [0, -90], 'R'],
    ['front, right column, down', 'F', [1, 0, 1], [0, 90], "R'"],
    ['front, left column, down', 'F', [-1, 0, 1], [0, 90], 'L'],
    ['front, middle column, down', 'F', [0, 0, 1], [0, 90], 'M'],
    ['front, top row, to the left', 'F', [0, 1, 1], [-90, -40], 'U'],
    ['front, top row, to the right', 'F', [0, 1, 1], [90, 40], "U'"],
    ['front, bottom row, to the right', 'F', [0, -1, 1], [90, 40], 'D'],
    ['front, middle row, to the right', 'F', [1, 0, 1], [90, 40], 'E'],
    ['right, front column, up', 'R', [1, 0, 1], [0, -90], "F'"],
    ['right, front column, down', 'R', [1, 0, 1], [0, 90], 'F'],
    ['right, back column, up', 'R', [1, 0, -1], [0, -90], 'B'],
    ['right, top row, towards the front', 'R', [1, 1, 0], [-90, 60], 'U'],
    ['right, bottom row, towards the back', 'R', [1, -1, 0], [90, -60], 'D'],
    ['top, right column, away', 'U', [1, 1, 0], [50, -40], 'R'],
    ['top, right column, towards you', 'U', [1, 1, 0], [-50, 40], "R'"],
    ['top, front row, to the right', 'U', [0, 1, 1], [70, 40], 'F'],
    ['top, front row, to the left', 'U', [0, 1, 1], [-70, -40], "F'"],
    ['top, back row, to the right', 'U', [0, 1, -1], [70, 40], "B'"],
    ['top, middle row, to the right', 'U', [0, 1, 0], [70, 40], 'S'],
  ]
  for (const [name, face, position, drag, expected] of cases) {
    it(`${name} → ${expected}`, () => {
      expect(dragMove(face, position, drag)).toBe(expected)
    })
  }

  it('a drag turns the layer the way the finger went, from any camera angle', () => {
    let checked = 0
    for (const azimuth of [0.2, 0.62, 1.2, 2.4, -0.9, 3.6]) {
      for (const elevation of [-0.7, 0.2, 0.5, 1.0]) {
        const project = projector(azimuth, elevation)
        const toCamera: Vec3 = [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)]
        for (const f of FACELETS) {
          if (f.normal[0] * toCamera[0] + f.normal[1] * toCamera[1] + f.normal[2] * toCamera[2] < 0.3) continue // cannot grab what you cannot see
          const point = surface(f.face, f.position)
          for (const drag of [[40, 0], [0, 40], [-40, 0], [0, -40], [30, 30], [-30, 30]] as Vec2[]) {
            const grab = pickTurn({ face: f.face, position: f.position, point, drag, project })!
            const angle = dragAngle(grab, drag)
            expect(angle).not.toBe(0)
            // Slide the grabbed face a little way round and see where its middle line goes on screen.
            const n = f.normal
            const index = { x: 0, y: 1, z: 2 }[grab.axis]
            const middle = [n[0] * 1.5, n[1] * 1.5, n[2] * 1.5]
            middle[index] = point[index]
            const mid = middle as unknown as Vec3
            const [c, s] = [Math.cos(Math.sign(angle) * 0.2), Math.sin(Math.sign(angle) * 0.2)]
            const [x, y, z] = mid
            const moved: Vec3 = grab.axis === 'x' ? [x, y * c - z * s, y * s + z * c] : grab.axis === 'y' ? [x * c + z * s, y, -x * s + z * c] : [x * c - y * s, x * s + y * c, z]
            const a = project(mid)
            const b = project(moved)
            // (Skip layers seen so edge-on that they barely move on screen.)
            if (grab.pxPerRad > 40) {
              expect((b[0] - a[0]) * drag[0] + (b[1] - a[1]) * drag[1]).toBeGreaterThan(0)
              checked++
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1500)
  })

  it('dragging a face-width along a row is at least a quarter turn', () => {
    // F face, top row, default view: the row runs along +x on screen.
    const project = projector()
    const a = project([-1.5, 1, 1.5])
    const b = project([1.5, 1, 1.5])
    const drag: Vec2 = [a[0] - b[0], a[1] - b[1]]
    const grab = pickTurn({ face: 'F', position: [1, 1, 1], point: [1, 1, 1.5], drag, project })!
    expect(grab.axis).toBe('y')
    expect(Math.abs(dragAngle(grab, drag))).toBeGreaterThan(Math.PI / 2)
    expect(Math.abs(dragAngle(grab, drag))).toBeLessThan(Math.PI)
  })

  it('never picks the axis through the sticker', () => {
    const grab = pickTurn({ face: 'F', position: [0, 0, 1], point: [0, 0, 1.5], drag: [30, 30], project: projector() })
    expect(grab?.axis).not.toBe('z')
  })
})

describe('resolveRelease', () => {
  const Q = Math.PI / 2
  it('springs back from a small drag and carries on from a big one', () => {
    expect(resolveRelease(0.1 * Q)).toBe(0)
    expect(resolveRelease(-0.2 * Q)).toBe(0)
    expect(resolveRelease(0.35 * Q)).toBe(1)
    expect(resolveRelease(-0.6 * Q)).toBe(-1)
    expect(resolveRelease(1.2 * Q)).toBe(1)
    expect(resolveRelease(1.4 * Q)).toBe(2)
    expect(resolveRelease(-1.9 * Q)).toBe(-2)
  })
  it('a flick completes the turn, a flick back cancels it', () => {
    expect(resolveRelease(0.12 * Q, 5)).toBe(1)
    expect(resolveRelease(0.12 * Q, -5)).toBe(0)
    expect(resolveRelease(0.5 * Q, -5)).toBe(0)
    expect(resolveRelease(-0.1 * Q, -6)).toBe(-1)
    expect(resolveRelease(0.02 * Q, 9)).toBe(0)
  })
})

describe('singleMoveBetween', () => {
  it('finds the move for every move from random states, and nothing for far states', () => {
    const state = applyAlg(SOLVED, randomScramble())
    for (const move of ALL_MOVES) expect(singleMoveBetween(state, applyMove(state, move))).toBe(move)
    expect(singleMoveBetween(state, state)).toBeNull()
    expect(singleMoveBetween(state, applyAlg(state, 'R U'))).toBeNull()
  })
})

describe('timing', () => {
  it('double turns are slower but not twice as slow; a queue speeds things up', () => {
    expect(turnDuration('R', 300)).toBe(300)
    expect(turnDuration('R2', 300)).toBeGreaterThan(300)
    expect(turnDuration('R2', 300)).toBeLessThan(600)
    expect(turnDuration('R', 300, 3)).toBeLessThan(turnDuration('R', 300, 1))
    expect(turnDuration('R', 300, 100)).toBeGreaterThanOrEqual(55)
  })
  it('easeTurn runs 0 → 1 monotonically', () => {
    expect(easeTurn(0)).toBe(0)
    expect(easeTurn(1)).toBeCloseTo(1, 10)
    let last = 0
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const v = easeTurn(t)
      expect(v).toBeGreaterThanOrEqual(last - 1e-9)
      last = v
    }
  })
})

describe('keyboard', () => {
  it('maps notation keys', () => {
    expect(actionForKey({ key: 'r' })).toEqual({ type: 'move', move: 'R' })
    expect(actionForKey({ key: 'R', shiftKey: true })).toEqual({ type: 'move', move: "R'" })
    expect(actionForKey({ key: 'u', altKey: true })).toEqual({ type: 'move', move: 'u' })
    // macOS: Option+letter types another character (or a dead key); the physical key still says which letter.
    expect(actionForKey({ key: '®', code: 'KeyR', altKey: true })).toEqual({ type: 'move', move: 'r' })
    expect(actionForKey({ key: 'Dead', code: 'KeyU', altKey: true, shiftKey: true })).toEqual({ type: 'move', move: "u'" })
    expect(actionForKey({ key: '‰', code: 'KeyR', altKey: true, shiftKey: true })).toEqual({ type: 'move', move: "r'" })
    // Without Alt the typed character decides, whatever the layout.
    expect(actionForKey({ key: 'r', code: 'KeyP' })).toEqual({ type: 'move', move: 'R' })
    expect(actionForKey({ key: 'M', shiftKey: true })).toEqual({ type: 'move', move: "M'" })
    expect(actionForKey({ key: 'x' })).toEqual({ type: 'move', move: 'x' })
    expect(actionForKey({ key: 'Y', shiftKey: true })).toEqual({ type: 'move', move: "y'" })
    expect(actionForKey({ key: '2' })).toEqual({ type: 'double' })
    expect(actionForKey({ key: 'ArrowLeft' })).toEqual({ type: 'orbit', dx: -1, dy: 0 })
    expect(actionForKey({ key: 'z', ctrlKey: true })).toEqual({ type: 'undo' })
    expect(actionForKey({ key: 'Z', metaKey: true, shiftKey: true })).toEqual({ type: 'redo' })
    expect(actionForKey({ key: 'y', ctrlKey: true })).toEqual({ type: 'redo' })
    expect(actionForKey({ key: 'r', ctrlKey: true })).toBeNull()
    expect(actionForKey({ key: 'q' })).toBeNull()
    expect(actionForKey({ key: 'Tab' })).toBeNull()
  })
})

describe('loopFrame', () => {
  const alg: Move[] = ['R', 'U2', "R'"]
  const timing = { ...DEFAULT_LOOP_TIMING, quarterMs: 300, gapMs: 100, holdStartMs: 500, holdEndMs: 1000, fadeMs: 100 }
  it('rests, turns each move in order, rests, and loops', () => {
    expect(loopFrame(alg, 0, timing)).toMatchObject({ applied: 0, move: null })
    expect(loopFrame(alg, 600, timing)).toMatchObject({ applied: 0, move: 'R' })
    expect(loopFrame(alg, 850, timing)).toMatchObject({ applied: 1, move: null })
    expect(loopFrame(alg, 1000, timing)).toMatchObject({ applied: 1, move: 'U2' })
    const total = loopDuration(alg, timing)
    expect(loopFrame(alg, total - 500, timing)).toMatchObject({ applied: 3, move: null, alpha: 1 })
    expect(loopFrame(alg, total - 20, timing).alpha).toBeLessThan(0.5)
    expect(loopFrame(alg, total + 600, timing)).toMatchObject({ applied: 0, move: 'R' })
  })
  it('stops on the finished cube when not looping', () => {
    const total = loopDuration(alg, timing)
    expect(loopFrame(alg, total * 3, { ...timing, loop: false })).toMatchObject({ applied: 3, done: true, alpha: 1 })
  })
  it('progress stays within 0…1', () => {
    for (let t = 0; t < 6000; t += 37) {
      const frame = loopFrame(alg, t, timing)
      expect(frame.progress).toBeGreaterThanOrEqual(0)
      expect(frame.progress).toBeLessThanOrEqual(1)
      expect(frame.applied).toBeLessThanOrEqual(alg.length)
    }
  })
})
