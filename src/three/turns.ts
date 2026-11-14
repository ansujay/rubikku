/**
 * Pure turn logic for the 3D cube: no three.js, no DOM. Everything here is unit-tested.
 *
 *  - which move a (axis, layer, quarter turns) rotation is
 *  - which layer a drag on a sticker turns, and how many pixels make a radian
 *  - where a released drag should settle
 *  - which key means which move
 *  - how long a queued turn should take
 */
import {
  ALL_MOVES,
  applyMove,
  FACE_NORMAL,
  makeMove,
  MOVE_BASE_DEFS,
  moveAmount,
  moveBase,
  moveKind,
  type Axis,
  type CubeState,
  type Face,
  type Move,
  type MoveBase,
  type Vec3,
} from '../cube'

export const AXES: readonly Axis[] = ['x', 'y', 'z']
export const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }
export const AXIS_VECTOR: Record<Axis, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
const HALF_PI = Math.PI / 2

export type Vec2 = readonly [number, number]

// ───────────────────────── (axis, layer, turns) → move ─────────────────────────

/** The single-layer move letter for each axis and layer: x/+1 is R, x/0 is M, x/-1 is L … */
const SINGLE_LAYER_BASE: Record<Axis, Record<number, MoveBase>> = (() => {
  const table: Record<Axis, Record<number, MoveBase>> = { x: {}, y: {}, z: {} }
  for (const [base, def] of Object.entries(MOVE_BASE_DEFS) as [MoveBase, (typeof MOVE_BASE_DEFS)[MoveBase]][]) {
    if (def.layers.length === 1) table[def.axis][def.layers[0]] = base
  }
  return table
})()

/**
 * The move that turns one layer by `quarterTurns` quarter turns, counted the right-hand way
 * about the positive axis (the same sign convention as `moveLayer(move).quarterTurns`).
 * Null when the turn cancels out (0, ±4 …).
 */
export function moveForTurn(axis: Axis, layer: number, quarterTurns: number): Move | null {
  const base = SINGLE_LAYER_BASE[axis][layer]
  if (!base) return null
  // A plain move is `sign` right-hand quarter turns, so q right-hand turns are q * sign plain ones.
  return makeMove(base, Math.round(quarterTurns) * MOVE_BASE_DEFS[base].sign)
}

/** Signed right-hand quarter turns of a move about its axis: R is -1, R' is +1, R2 is -2. */
export function quarterTurnsOf(move: Move): number {
  const def = MOVE_BASE_DEFS[moveBase(move)]
  const amount = moveAmount(move)
  return amount === 1 ? def.sign : amount === 3 ? -def.sign : 2 * def.sign
}

// ───────────────────────── drag → layer ─────────────────────────

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * A point on a turning face travels r·sin(θ) along its starting direction, not r·θ. Scaling the
 * pixels-per-radian by sin(45°)/(π/4) makes the linear drag mapping exact at 45°.
 */
const FOLLOW_GAIN = Math.SQRT1_2 / (Math.PI / 4)

export interface TurnGrab {
  /** Axis the grabbed layer turns about. */
  axis: Axis
  /** Which layer along that axis: -1, 0 or 1. */
  layer: number
  /** Unit screen direction (x right, y down) that turns the layer the positive, right-hand way. */
  dir: Vec2
  /** Pixels of drag along `dir` for one radian of turn. */
  pxPerRad: number
}

export interface TurnGrabInput {
  /** Face of the grabbed sticker. */
  face: Face
  /** Cubie coordinates (-1/0/1) of the grabbed sticker's cubie. */
  position: Vec3
  /** The point that was grabbed, in cube coordinates (on the surface, e.g. z = 1.5 for F). */
  point: Vec3
  /** Drag so far in screen pixels (x right, y down). */
  drag: Vec2
  /** Projects a point in cube coordinates to screen pixels. */
  project: (point: Vec3) => Vec2
  /** Lower bound for `pxPerRad`, so a face seen edge-on does not spin wildly. Default 36. */
  minPxPerRad?: number
}

/**
 * Decide which layer a drag on a sticker turns.
 *
 * A sticker can move two ways: about either axis that lies in its face. Turning about axis `a`
 * slides the face along `a × n` (n = face normal) — the direction its rows or columns are drawn
 * in on screen. Both candidates are projected to the screen and the one that lines up best with
 * the finger wins. Its projected length gives the pixels-per-radian, which is what makes the
 * layer follow the finger: the mapping is linear (so a straight drag always makes progress,
 * even on a face seen at a slant) and tuned so the sticker sits under the finger around the
 * 45° mark, where the decision to complete or spring back is made.
 */
export function pickTurn(input: TurnGrabInput): TurnGrab | null {
  const { face, position, point, drag, project, minPxPerRad = 36 } = input
  const n = FACE_NORMAL[face]
  const dragLength = Math.hypot(drag[0], drag[1])
  if (dragLength === 0) return null
  const origin = project(point)
  let best: (TurnGrab & { score: number }) | null = null
  for (const axis of AXES) {
    const a = AXIS_VECTOR[axis]
    if (Math.abs(a[0] * n[0] + a[1] * n[1] + a[2] * n[2]) > 0.5) continue // the face's own axis
    // Surface velocity for one radian about +a: a × (1.5 n). Probe a short step of it.
    const t = cross(a, n)
    const step = 0.25
    const probe = project([point[0] + t[0] * step, point[1] + t[1] * step, point[2] + t[2] * step])
    const sx = ((probe[0] - origin[0]) / step) * 1.5
    const sy = ((probe[1] - origin[1]) / step) * 1.5
    const length = Math.hypot(sx, sy)
    if (length < 1e-6) continue
    const dir: Vec2 = [sx / length, sy / length]
    const score = Math.abs(drag[0] * dir[0] + drag[1] * dir[1]) / dragLength
    if (!best || score > best.score) {
      best = { axis, layer: position[AXIS_INDEX[axis]], dir, pxPerRad: Math.max(minPxPerRad, length * FOLLOW_GAIN), score }
    }
  }
  if (!best) return null
  return { axis: best.axis, layer: best.layer, dir: best.dir, pxPerRad: best.pxPerRad }
}

/** Angle (radians, right-hand about the axis) for a drag, measured along the grab direction. */
export function dragAngle(grab: TurnGrab, drag: Vec2): number {
  return (drag[0] * grab.dir[0] + drag[1] * grab.dir[1]) / grab.pxPerRad
}

/** Fraction of a quarter turn after which a released layer goes on to the next stop. */
export const RELEASE_THRESHOLD = 0.3
/** Angular speed (rad/s) that counts as a flick. */
export const FLICK_SPEED = 2.4

/**
 * Where a released layer settles, in quarter turns. It carries on to the next stop when it has
 * been dragged far enough or flicked that way; otherwise it springs back.
 */
export function resolveRelease(angle: number, velocity = 0): number {
  const turns = angle / HALF_PI
  const base = Math.trunc(turns)
  const rest = turns - base
  const direction = Math.sign(rest)
  if (direction === 0) return base || 0
  const far = Math.abs(rest) >= RELEASE_THRESHOLD
  const flicked = Math.abs(velocity) >= FLICK_SPEED && Math.sign(velocity) === direction && Math.abs(rest) >= 0.06
  const flickedBack = Math.abs(velocity) >= FLICK_SPEED && Math.sign(velocity) === -direction && Math.abs(rest) < 0.7
  if ((far || flicked) && !flickedBack) return base + direction
  return base || 0
}

// ───────────────────────── state diffs ─────────────────────────

/** The one move that takes `from` to `to`, or null if they are not exactly one move apart. */
export function singleMoveBetween(from: CubeState, to: CubeState): Move | null {
  if (from === to) return null
  for (const move of ALL_MOVES) {
    if (applyMove(from, move) === to) return move
  }
  return null
}

// ───────────────────────── timing ─────────────────────────

/** Double turns take a little longer than quarter turns, not twice as long. */
export const DOUBLE_TURN_FACTOR = 1.45
/** A turn never animates faster than this (ms), however long the queue is. */
export const MIN_TURN_MS = 55

/**
 * Milliseconds for one turn. `waiting` is how many moves are queued behind it: the more that
 * are waiting, the quicker each one goes, so fast input never builds up lag.
 */
export function turnDuration(move: Move, quarterMs: number, waiting = 0): number {
  const base = quarterMs * (moveAmount(move) === 2 ? DOUBLE_TURN_FACTOR : 1)
  const hurry = 1 + 0.55 * Math.max(0, waiting)
  return Math.max(Math.min(MIN_TURN_MS, base), base / hurry)
}

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)
/**
 * Snappy turn ease: a short quadratic push-off, then a cubic glide into a crisp landing.
 * The two pieces meet at `EASE_SPLIT` with matching value and slope.
 */
const EASE_SPLIT = 0.32
const EASE_IN_K = 1 / (EASE_SPLIT * EASE_SPLIT + (2 * EASE_SPLIT * (1 - EASE_SPLIT)) / 3)
const EASE_OUT_K = (2 * EASE_IN_K * EASE_SPLIT) / (3 * (1 - EASE_SPLIT) * (1 - EASE_SPLIT))
export const easeTurn = (t: number): number => {
  const c = Math.min(1, Math.max(0, t))
  return c < EASE_SPLIT ? EASE_IN_K * c * c : 1 - EASE_OUT_K * Math.pow(1 - c, 3)
}

// ───────────────────────── keyboard ─────────────────────────

export interface KeyLike {
  key: string
  /** The physical key ("KeyR"). Used when a modifier changes what `key` reports (Option on a Mac). */
  code?: string
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

export type KeyAction =
  | { type: 'move'; move: Move }
  | { type: 'double' }
  | { type: 'orbit'; dx: number; dy: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'resetView' }
  | { type: 'peek' }

const FACE_KEYS = 'udlrfb'
const SLICE_KEYS = 'mes'
const ROTATION_KEYS = 'xyz'

/**
 * Keyboard notation.
 *   U D L R F B        face turn            Shift  = the other way (prime)
 *   M E S              slice                Alt    = wide (two layers)
 *   X Y Z              turn the whole cube  2      = do the last move again (makes it a double)
 *   Arrow keys         look around          0 / Home = reset the view      P = peek behind
 *   Ctrl/Cmd+Z         undo                 Ctrl/Cmd+Shift+Z or Ctrl+Y = redo
 */
export function actionForKey(event: KeyLike): KeyAction | null {
  let key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  // With Alt held, macOS reports another character altogether (Option+R is "®", Option+U a dead
  // key), so read the letter off the physical key instead.
  const physical = event.altKey ? /^Key([A-Z])$/.exec(event.code ?? '') : null
  if (physical) key = physical[1].toLowerCase()
  if (event.ctrlKey || event.metaKey) {
    if (key === 'z') return event.shiftKey ? { type: 'redo' } : { type: 'undo' }
    if (key === 'y') return { type: 'redo' }
    return null
  }
  switch (key) {
    case 'ArrowLeft':
      return { type: 'orbit', dx: -1, dy: 0 }
    case 'ArrowRight':
      return { type: 'orbit', dx: 1, dy: 0 }
    case 'ArrowUp':
      return { type: 'orbit', dx: 0, dy: 1 }
    case 'ArrowDown':
      return { type: 'orbit', dx: 0, dy: -1 }
    case 'Home':
    case '0':
      return { type: 'resetView' }
    case '2':
      return { type: 'double' }
    case 'p':
      return event.altKey ? null : { type: 'peek' }
  }
  if (key.length !== 1) return null
  const suffix = event.shiftKey ? "'" : ''
  if (FACE_KEYS.includes(key)) {
    const base = event.altKey ? key : key.toUpperCase()
    return { type: 'move', move: `${base}${suffix}` as Move }
  }
  if (event.altKey) return null
  if (SLICE_KEYS.includes(key)) return { type: 'move', move: `${key.toUpperCase()}${suffix}` as Move }
  if (ROTATION_KEYS.includes(key)) return { type: 'move', move: `${key}${suffix}` as Move }
  return null
}

/** Rows for the keyboard help popover. */
export const KEYBOARD_HELP: readonly { keys: readonly string[]; label: string }[] = [
  { keys: ['U', 'D', 'L', 'R', 'F', 'B'], label: 'Turn a face clockwise' },
  { keys: ['Shift', '+ letter'], label: 'Turn it the other way (prime)' },
  { keys: ['2'], label: 'Do the last turn again (a double)' },
  { keys: ['M', 'E', 'S'], label: 'Turn a middle slice' },
  { keys: ['Alt', '+ letter'], label: 'Wide turn: two layers at once' },
  { keys: ['X', 'Y', 'Z'], label: 'Turn the whole cube' },
  { keys: ['←', '→', '↑', '↓'], label: 'Look around' },
  { keys: ['0'], label: 'Reset the view' },
  { keys: ['P'], label: 'Peek at the hidden sides' },
  { keys: ['Ctrl', 'Z'], label: 'Undo (add Shift to redo)' },
]

/** True for moves that change the puzzle (not just how it is held). */
export const isPuzzleMove = (move: Move): boolean => moveKind(move) !== 'rotation'
