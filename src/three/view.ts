/**
 * CubeView: everything that moves — the turn queue, drag-to-turn, the orbiting camera and the
 * teaching aids — as one plain class driven by `update(dt)`. No React, no renderer: it owns a
 * `root` group and a `camera`, and asks for frames through `requestFrame`.
 *
 * State model
 *   shown    what is drawn at rest (the last landed state)
 *   logical  shown + the move in flight + the user's queued moves. This is what the parent's
 *            `state` prop is compared against, and what `onMove` reports.
 * A move is reported (`onMove`) when it *starts*; when its animation lands, `shown` catches up
 * and every transform is rebuilt from the engine state — nothing accumulates.
 */
import * as THREE from 'three'
import {
  applyMove,
  FACE_NORMAL,
  faceletAtPosition,
  FACELETS,
  FACES,
  findPiece,
  isMove,
  isRotation,
  isStateString,
  moveLayer,
  movePermutation,
  permuteFacelets,
  SLOT_FACELETS,
  toColors,
  type Axis,
  type Color,
  type CubeState,
  type Face,
  type Move,
  type PieceId,
  type SlotId,
  type Vec3,
} from '../cube'
import type { MoveMeta, PlayOptions } from './controller'
import { arrowRing, CubeModel, FaceLabels, hasFaceArrow, ringPerimeter, ringPoint, shadowTexture, type ArrowRing, type ArrowStyle, type ModelTheme } from './model'
import {
  dragAngle,
  easeInOutCubic,
  easeTurn,
  moveForTurn,
  pickTurn,
  resolveRelease,
  singleMoveBetween,
  turnDuration,
  type TurnGrab,
  type Vec2,
} from './turns'

export type CubeInput = CubeState | ArrayLike<Color | null | undefined>

export interface ViewTheme extends ModelTheme {
  ambient: number
  key: number
  shadow: string
  shadowOpacity: number
  labelInk: string
  labelPaper: string
}

export interface CubeHighlight {
  /** Pieces to light up, by id ("UF" = the white-green edge). The light follows them as they move. */
  pieces?: readonly PieceId[]
  /** Places to light up ("UF" = the top-front edge position). Stays put while pieces move through. */
  slots?: readonly SlotId[]
  /** Individual stickers, by facelet number (0–53). Stays put. */
  facelets?: readonly number[]
  /** Draw a ring round the highlighted stickers (it pulses three times, then rests). Default true. */
  outline?: boolean
  /** Dim everything else. Default true. (Never dims while the arrow shows a whole-cube rotation.) */
  dimOthers?: boolean
  /**
   * Keep the six centres bright while everything else is dimmed, so "match it to the centre"
   * can be checked on the picture. Default true.
   */
  keepCentres?: boolean
  /**
   * How "everything else" dims: `'tint'` (default) keeps each sticker's hue, pastel by day;
   * `'grey'` turns it all one neutral grey, so at thumbnail size the lit part reads at a glance
   * (the Learn map's minis: the solved part of the cube against grey).
   */
  dimTo?: 'tint' | 'grey'
}

/** How the cube celebrates: a small hop, a stage moment (spin and ripple), a milestone (orbit and glow). */
export type CelebrateTier = 'tick' | 'stage' | 'milestone'

export interface CameraPose {
  /** Radians round the vertical axis; 0 looks straight at the front face, positive towards the right face. */
  azimuth: number
  /** Radians above the horizon. */
  elevation: number
  /** 0.8 … 1.6. */
  zoom: number
}

export const DEFAULT_POSE: CameraPose = { azimuth: 0.62, elevation: 0.5, zoom: 1 }
export const ZOOM_MIN = 0.8
export const ZOOM_MAX = 1.6
export const ELEVATION_MIN = -0.92
export const ELEVATION_MAX = 1.22
/** How far `orbit: 'limited'` lets the camera swing from the default view (radians). */
const LIMITED_SWING = 1.05
const FOV = 30
/**
 * Half the height (or width, whichever is narrower) of the view, in cube units, at zoom 1.
 * The cube is 3 units wide and about 4.4 across in the three-quarter view, so it fills about
 * three quarters of the narrow side: the stage controls live outside the canvas, so nothing has to be
 * kept clear inside it.
 */
const FRAMING_RADIUS = 2.92
/**
 * Extra zoom-out while the mirror stickers are showing. Small: the mirrors are drawn small and
 * close, in the stage's spare space, so the cube itself stays large (it used to drop to 68%).
 */
const MIRROR_FIT = 0.77
const TARGET_Y = -0.24
const TAP_SLOP_MOUSE = 5
const TAP_SLOP_TOUCH = 9
const DOUBLE_TAP_MS = 340

export interface ViewOptions {
  turn: boolean
  orbit: boolean | 'limited'
  zoom: boolean
  /** No animation at all: turns and camera moves land at once. */
  reducedMotion: boolean
  /** Milliseconds for a quarter turn at speed 1. */
  quarterMs: number
  /** False while off-screen or without WebGL: everything lands instantly, nothing is drawn. */
  visible: boolean
}

export interface ViewCallbacks {
  requestFrame?: () => void
  onMove?: (move: Move, meta: MoveMeta) => void
  /** Return false to refuse a turn the user is trying to make. */
  allowMove?: (move: Move) => boolean
  onRejectedMove?: (move: Move) => void
  onMoveEnd?: (move: Move) => void
  onStickerClick?: (facelet: number) => void
  onAnimatingChange?: (animating: boolean) => void
  onTurnSound?: () => void
}

export interface PointerInfo {
  id: number
  x: number
  y: number
  touch: boolean
  /** When the event happened (event.timeStamp). Events can be delivered late; speeds use this. */
  time?: number
}

interface Hit {
  face: Face
  facelet: number
  position: Vec3
  point: Vec3
}

type Turn =
  | { kind: 'tween'; move: Move; axis: Axis; layers: readonly number[]; to: number; t: number; duration: number }
  | { kind: 'drag'; grab: TurnGrab; axis: Axis; layers: readonly number[]; angle: number; origin: Vec2; dead: number; samples: { time: number; angle: number }[] }
  | { kind: 'spring'; move: Move | null; axis: Axis; layers: readonly number[]; angle: number; velocity: number; to: number }

type Gesture =
  | { type: 'pending'; hit: Hit; start: Vec2; touch: boolean }
  | { type: 'turn' }
  | { type: 'orbit'; last: Vec2; moved: number; time: number }
  | { type: 'pinch'; distance: number; zoom: number }
  | { type: 'idle' }

interface Script {
  moves: readonly Move[]
  index: number
  speed: number
  instant: boolean
  resolve: (completed: boolean) => void
}

interface CameraTween {
  from: CameraPose
  to: CameraPose
  t: number
  duration: number
  done?: () => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
/** The six centre stickers (Kociemba order: the middle of each face). */
const CENTRE_FACELETS = [4, 13, 22, 31, 40, 49]
const approach = (current: number, target: number, dt: number, rate: number) => {
  const next = current + (target - current) * (1 - Math.exp(-dt * rate))
  return Math.abs(target - next) < 0.002 ? target : next
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
/**
 * Camera glides: the step response of a critically damped spring, normalised to land at t = 1.
 * It leaves smoothly, covers most of the way in the first half and settles softly ("fast in").
 */
const GLIDE_K = 6
const GLIDE_NORM = 1 - (1 + GLIDE_K) * Math.exp(-GLIDE_K)
export const easeGlide = (t: number): number => {
  const c = Math.min(1, Math.max(0, t))
  return c >= 1 ? 1 : (1 - (1 + GLIDE_K * c) * Math.exp(-GLIDE_K * c)) / GLIDE_NORM
}
/** Ease out with a single small overshoot (rewards "pop once"). */
const easeOutBack = (t: number, overshoot = 1.15): number => {
  const c = Math.min(1, Math.max(0, t)) - 1
  return 1 + (overshoot + 1) * c * c * c + overshoot * c * c
}
/** 0 → 1 → 0 over [from, to], smooth at both ends. */
const bump = (t: number, from: number, to: number): number => {
  if (t <= from || t >= to) return 0
  return Math.sin(((t - from) / (to - from)) * Math.PI)
}

interface Celebration {
  tier: CelebrateTier
  t: number
  duration: number
  /** Reduced motion: light only, no movement. */
  still: boolean
  resolve: () => void
}

const CELEBRATION_SECONDS: Record<CelebrateTier, number> = { tick: 0.42, stage: 1.05, milestone: 1.9 }
/** Rest positions of the 54 stickers, for the light sweep. */
const STICKER_SWEEP = FACELETS.map((f) => f.position[0] * 0.62 + f.position[1] * 0.78 + f.position[2] * 0.2 + f.normal[1] * 0.25)

export class CubeView {
  readonly root = new THREE.Group()
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 80)
  readonly model: CubeModel

  callbacks: ViewCallbacks = {}

  private options: ViewOptions = { turn: true, orbit: true, zoom: true, reducedMotion: false, quarterMs: 320, visible: true }
  private theme: ViewTheme
  private labels: FaceLabels
  private shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private lightRig = new THREE.Group()
  private ambient = new THREE.HemisphereLight('#ffffff', '#eceef2', 1)
  private topLight = new THREE.DirectionalLight('#ffffff', 1)
  private keyLight = new THREE.DirectionalLight('#ffffff', 1)
  private fillLight = new THREE.DirectionalLight('#ffffff', 1)
  private underLight = new THREE.DirectionalLight('#ffffff', 1)

  private width = 1
  private height = 1
  private framing = FRAMING_RADIUS
  private targetY = TARGET_Y

  // cube
  private shownState: CubeState | null = null
  private shownColors: (Color | null)[] = new Array(54).fill(null)
  private logical: CubeState | null = null
  /** States reported through onMove that the parent has not echoed back yet. */
  private unacked: CubeState[] = []
  private turn: Turn | null = null
  private pending: Move[] = []
  private script: Script | null = null
  private idleWaiters: (() => void)[] = []
  private animating = false
  private lastKeyMove: Move | null = null

  // camera
  private home: CameraPose = { ...DEFAULT_POSE }
  private pose: CameraPose = { ...DEFAULT_POSE }
  private zoomTarget = DEFAULT_POSE.zoom
  private spin = { azimuth: 0, elevation: 0 }
  private tween: CameraTween | null = null
  private focusReturn: CameraPose | null = null
  private peekTimer: ReturnType<typeof setTimeout> | null = null
  private peekResolve: (() => void) | null = null

  // input
  private pointers = new Map<number, Vec2>()
  private gesture: Gesture = { type: 'idle' }
  private down: { at: Vec2; time: number; facelet: number; touch: boolean } | null = null
  private lastEmptyTap: { at: Vec2; time: number } | null = null
  private raycaster = new THREE.Raycaster()

  // teaching aids
  private highlight: CubeHighlight | null = null
  private levels = new Float32Array(54).fill(1)
  private levelTargets = new Float32Array(54).fill(1)
  private ringOn = false
  private ringAge = 0
  private ringFade = 0
  private mirrors = false
  private mirrorAmount = 0
  private labelsOn = false
  private labelAmount = 0
  private arrowMove: Move | null = null
  private arrowRing: ArrowRing | null = null
  /** Asked-for style (see `ArrowStyle`); a face arc falls back to the layer strip while its face is turned away. */
  private arrowStyle: ArrowStyle = 'layer'
  private arrowAmount = 0
  private arrowStart = -1
  private arrowLength = 0
  private arrowCamera = new THREE.Vector3()
  /** Highlighted stickers the arrow keeps off. */
  private arrowAvoid = new Set<number>()
  private disposed = false
  private running = false
  private celebration: Celebration | null = null
  private glow = new Float32Array(54)

  constructor(theme: ViewTheme, detail: 1 | 2 = 2) {
    this.theme = theme
    this.model = new CubeModel(theme, { detail })
    this.labels = new FaceLabels(theme.labelInk, theme.labelPaper)
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 7.4),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), color: theme.shadow, transparent: true, opacity: theme.shadowOpacity, depthWrite: false, toneMapped: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = -2.02
    this.shadow.renderOrder = -1

    this.keyLight.position.set(-3, 4.2, 6.5)
    this.fillLight.position.set(6, 2.2, 3.5)
    this.underLight.position.set(-1, -6, 1.6)
    this.topLight.position.set(0, 8, 0)
    this.lightRig.add(this.keyLight, this.fillLight, this.underLight, this.topLight)
    this.root.add(this.model.group, this.labels.group, this.shadow, this.ambient, this.lightRig)
    this.applyLights()
    this.syncCamera()
  }

  // ───────────────────────── configuration ─────────────────────────

  setOptions(options: Partial<ViewOptions>): void {
    const wasVisible = this.options.visible
    this.options = { ...this.options, ...options }
    if (!this.options.turn && this.turn?.kind === 'drag') this.releaseDrag(0, true)
    if (this.instant && (this.turn || this.pending.length || this.script)) {
      this.flush()
      this.advance()
    }
    if (this.options.visible && !wasVisible) this.frame()
  }

  setTheme(theme: ViewTheme): void {
    this.theme = theme
    this.model.setTheme(theme)
    this.labels.redraw(theme.labelInk, theme.labelPaper)
    this.shadow.material.color.set(theme.shadow)
    this.shadow.material.opacity = theme.shadowOpacity
    this.applyLights()
    this.frame()
  }

  /** Redraw canvas-drawn textures (call once web fonts have loaded). */
  refreshLabels(): void {
    this.labels.redraw(this.theme.labelInk, this.theme.labelPaper)
    this.frame()
  }

  private applyLights(): void {
    const { ambient, key } = this.theme
    // Tuned so the top face lands at ~1.0, the front at ~0.9 and the right at ~0.75: sticker
    // colours stay true to the tokens while the three faces still read as three planes.
    // (three's lights are physical: a white surface facing a light of intensity PI reflects 1.)
    this.ambient.intensity = ambient * 1.65
    this.keyLight.intensity = key * 1.57
    this.fillLight.intensity = key * 0.66
    this.topLight.intensity = key * 0.42
    // Strong enough that a white face seen from below still reads as white, not grey.
    this.underLight.intensity = key * 1.05
  }

  setSize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    this.width = width
    this.height = height
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.syncCamera()
    this.frame()
  }

  /** Tighter framing with no plinth shadow, for mini cubes. */
  setFraming(radius: number, targetY: number, shadow: boolean): void {
    this.framing = radius
    this.targetY = targetY
    this.shadow.visible = shadow
    this.syncCamera()
  }

  /** The default pose that reset-view returns to. Also moves the camera there if it has not been touched. */
  setHome(pose: Partial<CameraPose>): void {
    const untouched = this.pose.azimuth === this.home.azimuth && this.pose.elevation === this.home.elevation && this.pose.zoom === this.home.zoom
    this.home = { ...DEFAULT_POSE, ...pose }
    if (untouched) {
      this.pose = { ...this.home }
      this.zoomTarget = this.home.zoom
      this.syncCamera()
      this.frame()
    }
  }

  private frame(): void {
    // Nothing is drawn while off-screen; setOptions asks for a frame when the cube comes back.
    if (!this.disposed && this.options.visible) this.callbacks.requestFrame?.()
  }

  private get instant(): boolean {
    return this.options.reducedMotion || !this.options.visible
  }

  // ───────────────────────── state in ─────────────────────────

  /**
   * The parent's `state` prop. Equal to what the view already expects: nothing happens.
   * Exactly one move away: that move animates. Anything else: the cube snaps to it.
   */
  setState(input: CubeInput, animate = true): void {
    if (typeof input === 'string' && isStateString(input)) {
      if (input === this.logical) {
        this.unacked.length = 0
        return
      }
      const lagging = this.unacked.indexOf(input)
      if (lagging >= 0) {
        this.unacked.splice(0, lagging + 1)
        return
      }
      this.unacked.length = 0
      const move = animate && this.logical && !this.instant ? singleMoveBetween(this.logical, input) : null
      if (move) {
        this.stopScript()
        if (this.turn?.kind === 'drag') this.cancelDrag()
        this.logical = input
        this.pending.push(move)
        this.advance()
        return
      }
      this.snap(input, toColors(input))
      return
    }
    // Not a cube at all (a corrupt string, a short array): keep showing what is there.
    if (typeof input === 'string' || !input || input.length !== 54) return
    // A painted cube: colours only, no moves.
    const colors: (Color | null)[] = new Array(54)
    let same = this.shownState === null
    for (let i = 0; i < 54; i++) {
      colors[i] = input[i] ?? null
      if (colors[i] !== this.shownColors[i]) same = false
    }
    if (!same) this.snap(null, colors)
  }

  private snap(state: CubeState | null, colors: (Color | null)[]): void {
    this.stopScript()
    this.pending.length = 0
    this.turn = null
    if (this.gesture.type === 'turn') this.gesture = { type: 'idle' }
    this.model.setTurn(null)
    this.shownState = state
    this.logical = state
    this.shownColors = colors
    this.model.setColors(colors)
    this.retarget()
    this.settle()
    this.frame()
  }

  /** The state the view is heading for (after everything queued). Null for a painted cube. */
  getState(): CubeState | null {
    return this.logical
  }

  /** The state drawn right now, ignoring any move in flight. */
  getShownState(): CubeState | null {
    return this.shownState
  }

  get isAnimating(): boolean {
    return this.animating
  }

  whenIdle(): Promise<void> {
    if (!this.animating) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  // ───────────────────────── the turn queue ─────────────────────────

  /** A turn made by the user (keyboard, buttons). Returns false if it was refused. */
  userMove(move: Move, source: 'keyboard' | 'drag' = 'keyboard'): boolean {
    if (!this.logical || !this.options.turn) return false
    if (this.callbacks.allowMove && !this.callbacks.allowMove(move)) {
      this.callbacks.onRejectedMove?.(move)
      return false
    }
    this.stopScript()
    if (this.turn?.kind === 'drag') this.cancelDrag()
    this.report(move, source)
    this.pending.push(move)
    this.lastKeyMove = move
    this.advance()
    return true
  }

  /** Keyboard "2": do the last keyed move again. */
  repeatLastMove(): boolean {
    return this.lastKeyMove ? this.userMove(this.lastKeyMove) : false
  }

  private report(move: Move, source: MoveMeta['source']): void {
    this.logical = applyMove(this.logical!, move)
    this.unacked.push(this.logical)
    if (this.unacked.length > 64) this.unacked.shift()
    this.callbacks.onMove?.(move, { source, state: this.logical })
  }

  /** Animate an algorithm. Each move is reported through `onMove` as it starts. */
  play(alg: readonly Move[], options: PlayOptions = {}): Promise<boolean> {
    this.stopScript()
    const moves = alg.filter(isMove)
    if (!this.logical || moves.length === 0) return Promise.resolve(moves.length === 0)
    if (this.turn?.kind === 'drag') this.cancelDrag()
    return new Promise((resolve) => {
      this.script = { moves, index: 0, speed: options.speed && options.speed > 0 ? options.speed : 1, instant: options.instant === true, resolve }
      this.advance()
    })
  }

  /** Stop playing: the move in flight lands at once, queued moves from `play` are dropped. */
  stop(): void {
    this.stopScript()
    this.flush()
  }

  private stopScript(): void {
    const script = this.script
    if (!script) return
    this.script = null
    script.resolve(false)
  }

  /** Land the move in flight and everything the user queued, right now. */
  private flush(): void {
    if (this.turn && this.turn.kind !== 'drag') this.land(this.turn.move, false)
    while (this.pending.length) this.land(this.pending.shift()!, false)
    this.settle()
    this.frame()
  }

  /** Start the next queued move if nothing is turning. In instant mode, lands them all. */
  private advance(): void {
    let guard = 0
    while (!this.turn && guard++ < 5000) {
      let move: Move | undefined
      let speed = 1
      let instant = this.instant
      let waiting = 0
      if (this.pending.length) {
        move = this.pending.shift()!
        waiting = this.pending.length
      } else if (this.script) {
        const script = this.script
        if (script.index >= script.moves.length) {
          this.script = null
          script.resolve(true)
          continue
        }
        move = script.moves[script.index++]
        speed = script.speed
        instant = instant || script.instant
        this.report(move, 'play')
        // The parent may have answered that move by stopping the run (land it) or by
        // resetting the cube (then `logical` has moved on and there is nothing to land).
        if (this.script !== script) {
          if (this.logical === this.unacked[this.unacked.length - 1]) this.land(move, false)
          continue
        }
      }
      if (!move) break
      if (instant) {
        this.land(move, true)
        continue
      }
      const layer = moveLayer(move)
      this.turn = {
        kind: 'tween',
        move,
        axis: layer.axis,
        layers: layer.layers,
        to: layer.angle,
        t: 0,
        duration: turnDuration(move, this.options.quarterMs / speed, waiting) / 1000,
      }
    }
    this.settle()
    this.frame()
  }

  /** A move's animation has finished: the shown cube becomes the engine state, exactly. */
  private land(move: Move | null, sound: boolean): void {
    this.turn = null
    this.model.setTurn(null)
    if (!move || !this.shownState) return
    this.shownState = applyMove(this.shownState, move)
    this.shownColors = toColors(this.shownState)
    this.model.setColors(this.shownColors)
    // Light levels travel with the stickers, then ease to wherever the highlight now points.
    this.levels = Float32Array.from(permuteFacelets(this.levels, movePermutation(move)))
    this.retarget()
    this.model.setLevels(this.levels)
    if (sound) this.callbacks.onTurnSound?.()
    this.callbacks.onMoveEnd?.(move)
  }

  private settle(): void {
    const animating = this.turn !== null || this.pending.length > 0 || this.script !== null
    if (animating === this.animating) return
    this.animating = animating
    this.callbacks.onAnimatingChange?.(animating)
    if (!animating) {
      const waiters = this.idleWaiters
      this.idleWaiters = []
      for (const resolve of waiters) resolve()
    }
  }

  private stepTurn(dt: number): boolean {
    const turn = this.turn
    if (!turn) return false
    if (turn.kind === 'drag') return false
    if (turn.kind === 'tween') {
      turn.t += dt / turn.duration
      if (turn.t >= 1) {
        this.land(turn.move, true)
        this.advance()
        return this.turn !== null
      }
      this.model.setTurn(turn.axis, turn.layers, turn.to * easeTurn(turn.t))
      return true
    }
    // Spring to the stop: a little momentum from the finger, a crisp landing.
    const stiffness = 520
    const damping = 36
    const steps = Math.max(1, Math.ceil(dt / 0.004))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      turn.velocity += (-stiffness * (turn.angle - turn.to) - damping * turn.velocity) * h
      turn.angle += turn.velocity * h
    }
    if (Math.abs(turn.angle - turn.to) < 0.004 && Math.abs(turn.velocity) < 0.12) {
      this.land(turn.move, turn.move !== null)
      this.advance()
      return this.turn !== null
    }
    this.model.setTurn(turn.axis, turn.layers, turn.angle)
    return true
  }

  // ───────────────────────── camera ─────────────────────────

  private distance(): number {
    const vertical = THREE.MathUtils.degToRad(FOV) / 2
    const narrow = this.camera.aspect >= 1 ? vertical : Math.atan(Math.tan(vertical) * this.camera.aspect)
    const fit = 1 + (MIRROR_FIT - 1) * easeInOutCubic(this.mirrorAmount)
    return this.framing / Math.tan(narrow) / (this.pose.zoom * fit)
  }

  /** Put the camera where the pose says and bring its matrices up to date. */
  private syncCamera(): void {
    const { azimuth, elevation } = this.pose
    const d = this.distance()
    const cosE = Math.cos(elevation)
    this.camera.position.set(d * Math.sin(azimuth) * cosE, d * Math.sin(elevation) + this.targetY, d * Math.cos(azimuth) * cosE)
    this.camera.lookAt(0, this.targetY, 0)
    this.camera.updateMatrixWorld()
    this.lightRig.rotation.y = azimuth
    this.labels.update(this.labelAmount, this.camera.position, this.mirrorAmount)
    this.placeArrow()
  }

  /**
   * Choose where on its layer the arrow runs: the stretch of the layer's ring that faces the
   * camera best, bending over the nearest edge, and clear of the highlighted stickers (the
   * arrow never starts on, or covers, the piece being taught). Moves of hidden faces (B, L, D)
   * get their arrow on the visible side of the turning layer. Keeps the current place unless
   * another is clearly better, so the arrow does not hop about while the camera moves.
   */
  private placeArrow(force = false): void {
    if (!this.arrowMove || !this.arrowRing) return
    // Only look again once the camera has really moved.
    if (!force && this.arrowStart >= 0 && this.arrowCamera.distanceToSquared(this.camera.position) < 0.04) return
    this.arrowCamera.copy(this.camera.position)
    // A face arc needs its face in view; while it is turned away, draw round the layer instead.
    const wantFace = this.arrowStyle === 'face' && hasFaceArrow(this.arrowMove) && this.faceVisible(this.arrowMove)
    if (wantFace !== Boolean(this.arrowRing.face)) {
      this.arrowRing = arrowRing(this.arrowMove, wantFace ? 'face' : 'layer')
      this.arrowStart = -1
      force = true
    }
    const ring = this.arrowRing
    if (ring.face) {
      // On the face every place faces the camera alike: put the gap at the top right of the
      // face as he sees it, so the arc reads like a clock hand sweeping round.
      const start = this.faceArcStart(ring)
      if (force || Math.abs(start - this.arrowStart) > 0.3) {
        this.arrowStart = start
        this.arrowLength = ring.length
        this.model.setArrow(this.arrowMove, start, ring.length, 'face')
        this.model.setArrowOpacity(this.arrowAmount)
      }
      return
    }
    const perimeter = ringPerimeter(ring)
    const candidates = 48
    let best = this.arrowStart
    let bestLength = this.arrowLength
    let bestScore = -Infinity
    let currentScore = -Infinity
    // Full length first; a shorter arrow only when that is what keeps it off the lit piece.
    for (const [fraction, cost] of [[1, 0], [0.8, 0.45], [0.62, 0.9]] as const) {
      const length = ring.length * fraction
      for (let i = 0; i < candidates; i++) {
        const start = (perimeter * i) / candidates
        const score = this.scoreArrow(ring, start, length) - cost
        if (score > bestScore) {
          bestScore = score
          best = start
          bestLength = length
        }
        if (Math.abs(start - this.arrowStart) < 1e-6 && Math.abs(length - this.arrowLength) < 1e-6) currentScore = score
      }
    }
    if (!force && this.arrowStart >= 0 && currentScore > bestScore - 0.25 && currentScore > -1) {
      best = this.arrowStart
      bestLength = this.arrowLength
    }
    if (best !== this.arrowStart || bestLength !== this.arrowLength || force) {
      this.arrowStart = best
      this.arrowLength = bestLength
      this.model.setArrow(this.arrowMove, best, bestLength)
      this.model.setArrowOpacity(this.arrowAmount)
    }
  }

  /** The turning face of a face move points at the camera well enough to draw on. */
  private faceVisible(move: Move): boolean {
    const ring = arrowRing(move, 'face')
    const normal = new THREE.Vector3()
    const point = new THREE.Vector3()
    ringPoint(ring, 0, -ring.half, 0, point, normal) // the face's centre
    return normal.dot(new THREE.Vector3().subVectors(this.camera.position, point).normalize()) > 0.3
  }

  /**
   * Where a face arc starts so its gap sits at the face's top right as seen from the camera
   * (between "1 and 2 o'clock"), whichever way round it turns.
   */
  private faceArcStart(ring: ArrowRing): number {
    const perimeter = ringPerimeter(ring)
    const point = new THREE.Vector3()
    const normal = new THREE.Vector3()
    const centre = new THREE.Vector3()
    ringPoint(ring, 0, -ring.half, 0, centre, normal)
    centre.project(this.camera)
    // The point of the circle that shows furthest up and right on screen is the gap's middle.
    let bestS = 0
    let best = -Infinity
    for (let i = 0; i < 72; i++) {
      const s = (perimeter * i) / 72
      ringPoint(ring, s, 0, 0, point, normal)
      point.project(this.camera)
      const score = (point.y - centre.y) * 0.8 + (point.x - centre.x) * 0.6
      if (score > best) {
        best = score
        bestS = s
      }
    }
    const gap = perimeter - ring.length
    // The arc runs from just after the gap round to just before it.
    return (((bestS + gap / 2) % perimeter) + perimeter) % perimeter
  }

  private scoreArrow(ring: ArrowRing, start: number, length: number): number {
    const samples = 14
    const camera = this.camera.position
    const toCamera = new THREE.Vector3()
    const point = new THREE.Vector3()
    const normal = new THREE.Vector3()
    let worst = Infinity
    let sum = 0
    let covered = 0
    for (let k = 0; k <= samples; k++) {
      const d = (length * k) / samples
      ringPoint(ring, start + d, 0, 0, point, normal)
      toCamera.subVectors(camera, point).normalize()
      const facing = toCamera.dot(normal)
      worst = Math.min(worst, facing)
      sum += facing
      if (this.arrowAvoid.size && Math.abs(normal.x) + Math.abs(normal.y) + Math.abs(normal.z) < 1.01) {
        const facelet = faceletAtPosition(
          [clamp(Math.round(point.x), -1, 1), clamp(Math.round(point.y), -1, 1), clamp(Math.round(point.z), -1, 1)],
          [Math.round(normal.x), Math.round(normal.y), Math.round(normal.z)],
        )
        // The tail (where the eye starts reading) counts double.
        if (facelet >= 0 && this.arrowAvoid.has(facelet)) covered += k <= 3 ? 2 : 1
      }
    }
    const mean = sum / (samples + 1)
    // Every part must face the camera; then: face it well, and keep off the lit stickers.
    return (worst > 0.08 ? 0 : -4 + worst * 4) + mean * 2 + Math.min(worst, 0.35) * 2 - covered * 0.35
  }

  private clampPose(pose: CameraPose): CameraPose {
    let azimuth = pose.azimuth
    if (this.options.orbit === 'limited') azimuth = clamp(azimuth, this.home.azimuth - LIMITED_SWING, this.home.azimuth + LIMITED_SWING)
    return { azimuth, elevation: clamp(pose.elevation, ELEVATION_MIN, ELEVATION_MAX), zoom: clamp(pose.zoom, ZOOM_MIN, ZOOM_MAX) }
  }

  getPose(): CameraPose {
    return { ...this.pose }
  }

  /** Glide the camera to a pose (missing fields keep their value). */
  setPose(pose: Partial<CameraPose>, options: { duration?: number; instant?: boolean } = {}): Promise<void> {
    // A peek in flight would swing the camera back to where the peek started, over this pose.
    this.cancelPeek()
    return this.glide(this.clampPose({ ...this.pose, ...pose }), options.instant ? 0 : (options.duration ?? 0.5))
  }

  private glide(to: CameraPose, duration: number): Promise<void> {
    this.spin.azimuth = 0
    this.spin.elevation = 0
    this.tween?.done?.()
    this.tween = null
    // Take the short way round.
    const turns = Math.round((this.pose.azimuth - to.azimuth) / (Math.PI * 2))
    const target = { ...to, azimuth: to.azimuth + turns * Math.PI * 2 }
    if (this.instant || duration <= 0) {
      this.pose = target
      this.zoomTarget = target.zoom
      this.syncCamera()
      this.frame()
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.tween = { from: { ...this.pose }, to: target, t: 0, duration, done: resolve }
      this.frame()
    })
  }

  /** Animate back to the default three-quarter view. */
  resetView(): Promise<void> {
    this.cancelPeek()
    this.focusReturn = null
    return this.glide({ ...this.home }, 0.55)
  }

  /**
   * Glide the camera so the given pieces / slots / stickers face the viewer. Call with null to
   * ease back to where the camera was before.
   *
   * By default the camera stays on the front-right side of the cube (within ~40° of the home
   * view), so "front" and "right" keep meaning what the notation says; pieces on the back are
   * better shown with the mirrors. Pass `free: true` to let it swing all the way round.
   */
  focusOn(target: CubeHighlight | null, options: { zoom?: number; free?: boolean } = {}): Promise<void> {
    this.cancelPeek()
    if (!target) {
      const back = this.focusReturn
      this.focusReturn = null
      return back ? this.glide(back, 0.55) : Promise.resolve()
    }
    const facelets = this.faceletsOf(target)
    if (facelets.length === 0) return Promise.resolve()
    const direction = new THREE.Vector3()
    for (const i of facelets) {
      const f = FACELETS[i]
      direction.x += f.normal[0] + f.position[0] * 0.35
      direction.y += f.normal[1] + f.position[1] * 0.35
      direction.z += f.normal[2] + f.position[2] * 0.35
    }
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1)
    direction.normalize()
    // Never look dead-on: lean towards the three-quarter view so the cube keeps its depth.
    const horizontal = Math.hypot(direction.x, direction.z)
    let azimuth = horizontal < 0.2 ? this.pose.azimuth : Math.atan2(direction.x, direction.z)
    let elevation = Math.asin(clamp(direction.y, -1, 1))
    const lean = 0.34
    if (horizontal >= 0.2) {
      const offset = Math.abs(Math.sin(azimuth * 2)) < 0.3 ? lean * (Math.sin(this.pose.azimuth - azimuth) >= 0 ? 1 : -1) : 0
      azimuth += offset
    }
    elevation = clamp(elevation * 0.82 + (elevation >= -0.05 ? 0.3 : -0.12), ELEVATION_MIN + 0.1, ELEVATION_MAX - 0.12)
    if (!options.free) {
      const swing = Math.atan2(Math.sin(azimuth - this.home.azimuth), Math.cos(azimuth - this.home.azimuth))
      azimuth = this.home.azimuth + clamp(swing, -0.7, 0.7)
    }
    if (!this.focusReturn) this.focusReturn = { ...this.pose, zoom: this.zoomTarget }
    return this.glide(this.clampPose({ azimuth, elevation, zoom: options.zoom ?? Math.max(this.zoomTarget, 1.12) }), 0.6)
  }

  /** Swing round to show the three hidden faces, hold, and come back. */
  peek(holdMs = 1100): Promise<void> {
    this.cancelPeek()
    const back = { ...this.pose, zoom: this.zoomTarget }
    const away: CameraPose = { azimuth: back.azimuth + Math.PI, elevation: -Math.min(0.62, Math.max(0.42, Math.abs(back.elevation))), zoom: back.zoom }
    if (this.instant) {
      // Reduced motion: no swing — show the far side as a still, then cut back.
      this.pose = away
      this.syncCamera()
      this.frame()
      return new Promise((resolve) => {
        this.peekResolve = resolve
        this.peekTimer = setTimeout(() => {
          this.peekTimer = null
          this.peekResolve = null
          this.pose = back
          this.syncCamera()
          this.frame()
          resolve()
        }, holdMs + 500)
      })
    }
    return new Promise((resolve) => {
      this.peekResolve = resolve
      this.tween?.done?.()
      // glide() takes the short way round, so go via the exact half turn explicitly.
      this.tween = {
        from: { ...this.pose },
        to: away,
        t: 0,
        duration: 0.62,
        done: () => {
          this.peekTimer = setTimeout(() => {
            this.peekTimer = null
            this.tween = {
              from: { ...this.pose },
              to: back,
              t: 0,
              duration: 0.62,
              done: () => {
                this.peekResolve = null
                resolve()
              },
            }
            this.frame()
          }, holdMs)
        },
      }
      this.spin.azimuth = 0
      this.spin.elevation = 0
      this.frame()
    })
  }

  private cancelPeek(): void {
    if (this.peekTimer) clearTimeout(this.peekTimer)
    this.peekTimer = null
    const resolve = this.peekResolve
    this.peekResolve = null
    if (resolve) {
      this.tween = null
      resolve()
    }
  }

  /** Nudge the camera (arrow keys): steps of about 20 degrees, eased. */
  orbitBy(dx: number, dy: number): void {
    if (!this.options.orbit) return
    this.cancelPeek()
    const base = this.tween ? this.tween.to : this.pose
    void this.glide(this.clampPose({ azimuth: base.azimuth + dx * 0.36, elevation: base.elevation + dy * 0.3, zoom: this.zoomTarget }), 0.26)
  }

  /** Wheel / trackpad zoom. Returns true if the zoom changed (so the page should not scroll). */
  zoomBy(deltaY: number): boolean {
    if (!this.options.zoom) return false
    const next = clamp(this.zoomTarget * Math.exp(-deltaY * 0.0016), ZOOM_MIN, ZOOM_MAX)
    if (next === this.zoomTarget) return false
    this.zoomTarget = next
    if (this.instant) this.pose.zoom = next
    this.frame()
    return true
  }

  private stepCamera(dt: number): boolean {
    let active = false
    if (this.tween) {
      const tween = this.tween
      tween.t = Math.min(1, tween.t + dt / tween.duration)
      const k = easeGlide(tween.t)
      this.pose = {
        azimuth: tween.from.azimuth + (tween.to.azimuth - tween.from.azimuth) * k,
        elevation: tween.from.elevation + (tween.to.elevation - tween.from.elevation) * k,
        zoom: tween.from.zoom + (tween.to.zoom - tween.from.zoom) * k,
      }
      this.zoomTarget = this.pose.zoom
      if (tween.t >= 1) {
        this.tween = null
        // Keep the azimuth small so it never loses precision after many spins.
        this.pose.azimuth = Math.atan2(Math.sin(this.pose.azimuth), Math.cos(this.pose.azimuth))
        tween.done?.()
      }
      active = true
    } else {
      if (this.gesture.type !== 'orbit' && (Math.abs(this.spin.azimuth) > 0.02 || Math.abs(this.spin.elevation) > 0.02)) {
        const next = this.clampPose({ ...this.pose, azimuth: this.pose.azimuth + this.spin.azimuth * dt, elevation: this.pose.elevation + this.spin.elevation * dt })
        if (next.azimuth === this.pose.azimuth) this.spin.azimuth = 0
        if (next.elevation === this.pose.elevation) this.spin.elevation = 0
        this.pose = next
        const decay = Math.exp(-dt * 5.2)
        this.spin.azimuth *= decay
        this.spin.elevation *= decay
        active = true
      }
      if (this.pose.zoom !== this.zoomTarget) {
        this.pose.zoom = approach(this.pose.zoom, this.zoomTarget, dt, 16)
        active = true
      }
    }
    return active
  }

  // ───────────────────────── pointer input ─────────────────────────

  /** Project a point in cube coordinates to pixels inside the canvas. */
  project = (point: Vec3): Vec2 => {
    const v = new THREE.Vector3(point[0], point[1], point[2]).project(this.camera)
    return [((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height]
  }

  /** Where a sticker's centre is on screen, and whether it faces the camera. */
  faceletOnScreen(facelet: number): { x: number; y: number; facing: boolean } {
    this.syncCamera()
    const f = FACELETS[facelet]
    const point: Vec3 = [f.position[0] + f.normal[0] * 0.5, f.position[1] + f.normal[1] * 0.5, f.position[2] + f.normal[2] * 0.5]
    const [x, y] = this.project(point)
    const toCamera = this.camera.position.clone().sub(new THREE.Vector3(...point))
    return { x, y, facing: toCamera.dot(new THREE.Vector3(...f.normal)) > 0.05 * toCamera.length() }
  }

  /** The sticker under a point of the canvas, or null over empty space. */
  pick(x: number, y: number): Hit | null {
    this.syncCamera()
    this.raycaster.setFromCamera(new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.camera)
    const o = this.raycaster.ray.origin.toArray()
    const d = this.raycaster.ray.direction.toArray()
    let near = -Infinity
    let far = Infinity
    let axis = -1
    let sign = 1
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (Math.abs(o[i]) > 1.5) return null
        continue
      }
      const a = (-1.5 - o[i]) / d[i]
      const b = (1.5 - o[i]) / d[i]
      const enter = Math.min(a, b)
      if (enter > near) {
        near = enter
        axis = i
        sign = d[i] > 0 ? -1 : 1
      }
      far = Math.min(far, Math.max(a, b))
    }
    if (axis < 0 || near > far || near < 0) return null
    const point: [number, number, number] = [o[0] + d[0] * near, o[1] + d[1] * near, o[2] + d[2] * near]
    const position: [number, number, number] = [clamp(Math.round(point[0]), -1, 1), clamp(Math.round(point[1]), -1, 1), clamp(Math.round(point[2]), -1, 1)]
    position[axis] = sign
    const normal: [number, number, number] = [0, 0, 0]
    normal[axis] = sign
    const facelet = faceletAtPosition(position, normal)
    if (facelet < 0) return null
    const face = FACES.find((f) => FACE_NORMAL[f][axis] === sign)!
    return { face, facelet, position, point }
  }

  pointerDown(p: PointerInfo): void {
    // A finger on the cube ends any celebration at once: the cube is his again.
    this.endCelebration()
    this.pointers.set(p.id, [p.x, p.y])
    if (this.pointers.size === 2) {
      // Second finger: this is a pinch. Let go of whatever the first finger was doing.
      if (this.gesture.type === 'turn') this.releaseDrag(0)
      this.down = null
      const [a, b] = [...this.pointers.values()]
      this.gesture = this.options.zoom ? { type: 'pinch', distance: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, zoom: this.zoomTarget } : { type: 'idle' }
      return
    }
    if (this.pointers.size > 2) return
    const hit = this.pick(p.x, p.y)
    this.down = { at: [p.x, p.y], time: p.time ?? now(), facelet: hit ? hit.facelet : -1, touch: p.touch }
    this.spin.azimuth = 0
    this.spin.elevation = 0
    if (hit && this.options.turn && this.logical) this.gesture = { type: 'pending', hit, start: [p.x, p.y], touch: p.touch }
    else if (this.options.orbit) this.beginOrbit([p.x, p.y], p.time)
    else this.gesture = { type: 'idle' }
  }

  private beginOrbit(at: Vec2, time = now()): void {
    this.cancelPeek()
    this.tween?.done?.()
    this.tween = null
    this.gesture = { type: 'orbit', last: at, moved: 0, time }
  }

  pointerMove(p: PointerInfo): void {
    if (!this.pointers.has(p.id)) return
    this.pointers.set(p.id, [p.x, p.y])
    const gesture = this.gesture
    if (gesture.type === 'pinch') {
      if (this.pointers.size < 2) return
      const [a, b] = [...this.pointers.values()]
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1
      this.zoomTarget = clamp(gesture.zoom * (distance / gesture.distance), ZOOM_MIN, ZOOM_MAX)
      this.pose.zoom = this.zoomTarget
      this.frame()
      return
    }
    if (gesture.type === 'pending') {
      const drag: Vec2 = [p.x - gesture.start[0], p.y - gesture.start[1]]
      if (Math.hypot(drag[0], drag[1]) < (gesture.touch ? TAP_SLOP_TOUCH : TAP_SLOP_MOUSE)) return
      const grab = pickTurn({ face: gesture.hit.face, position: gesture.hit.position, point: gesture.hit.point, drag, project: this.project })
      if (!grab) {
        if (this.options.orbit) this.beginOrbit([p.x, p.y])
        else this.gesture = { type: 'idle' }
        return
      }
      // Anything still turning lands now, so the layer under the finger is free.
      this.stopScript()
      this.flush()
      // The angle is measured from the press with the slop taken off as a dead zone: the layer
      // does not jump when the drag is recognised, and a fast flick that arrives as one or two
      // big pointer events still counts in full.
      const slop = gesture.touch ? TAP_SLOP_TOUCH : TAP_SLOP_MOUSE
      this.turn = {
        kind: 'drag',
        grab,
        axis: grab.axis,
        layers: [grab.layer],
        angle: 0,
        origin: gesture.start,
        dead: slop / grab.pxPerRad,
        samples: [{ time: this.down?.time ?? now(), angle: 0 }],
      }
      this.gesture = { type: 'turn' }
      this.settle()
      this.pointerMove(p)
      return
    }
    if (gesture.type === 'turn') {
      const turn = this.turn
      if (!turn || turn.kind !== 'drag') return
      const raw = dragAngle(turn.grab, [p.x - turn.origin[0], p.y - turn.origin[1]])
      turn.angle = clamp(Math.sign(raw) * Math.max(0, Math.abs(raw) - turn.dead), -Math.PI * 1.1, Math.PI * 1.1)
      turn.samples.push({ time: p.time ?? now(), angle: turn.angle })
      if (turn.samples.length > 8) turn.samples.shift()
      this.model.setTurn(turn.axis, turn.layers, turn.angle)
      this.frame()
      return
    }
    if (gesture.type === 'orbit') {
      const dx = p.x - gesture.last[0]
      const dy = p.y - gesture.last[1]
      const time = p.time ?? now()
      const dt = Math.max(1, time - gesture.time) / 1000
      const scale = 3.6 / Math.max(240, Math.min(this.width, this.height))
      const before = this.pose
      this.pose = this.clampPose({ ...before, azimuth: before.azimuth - dx * scale, elevation: before.elevation + dy * scale })
      // Smoothed velocity, for the glide after letting go.
      const blend = 0.35
      this.spin.azimuth += ((this.pose.azimuth - before.azimuth) / dt - this.spin.azimuth) * blend
      this.spin.elevation += ((this.pose.elevation - before.elevation) / dt - this.spin.elevation) * blend
      gesture.last = [p.x, p.y]
      gesture.time = time
      gesture.moved += Math.hypot(dx, dy)
      this.frame()
    }
  }

  pointerUp(p: PointerInfo, cancelled = false): void {
    if (!this.pointers.has(p.id)) return
    this.pointers.delete(p.id)
    const gesture = this.gesture
    if (gesture.type === 'pinch') {
      // One finger left: carry on as a look-around from where it is.
      const rest = [...this.pointers.values()][0]
      if (rest && this.options.orbit) this.beginOrbit(rest)
      else this.gesture = { type: 'idle' }
      this.down = null
      return
    }
    if (this.pointers.size > 0) return
    this.gesture = { type: 'idle' }
    if (gesture.type === 'turn') {
      const turn = this.turn
      if (turn && turn.kind === 'drag') this.releaseDrag(cancelled ? 0 : this.dragVelocity(turn.samples, p.time ?? now()), cancelled)
      this.down = null
      return
    }
    if (gesture.type === 'orbit') {
      const quick = (p.time ?? now()) - gesture.time < 60
      if (!quick || this.instant || cancelled) {
        this.spin.azimuth = 0
        this.spin.elevation = 0
      } else {
        this.spin.azimuth = clamp(this.spin.azimuth, -9, 9)
        this.spin.elevation = clamp(this.spin.elevation, -6, 6)
      }
      this.frame()
    }
    const down = this.down
    this.down = null
    if (cancelled || !down) return
    const slop = down.touch ? TAP_SLOP_TOUCH : TAP_SLOP_MOUSE
    const moved = Math.hypot(p.x - down.at[0], p.y - down.at[1])
    if (moved > slop || (p.time ?? now()) - down.time > 600 || (gesture.type === 'orbit' && gesture.moved > slop * 2)) return
    // A tap.
    if (down.facelet >= 0) {
      this.lastEmptyTap = null
      this.callbacks.onStickerClick?.(down.facelet)
      return
    }
    const time = p.time ?? now()
    const last = this.lastEmptyTap
    if (last && time - last.time < DOUBLE_TAP_MS && Math.hypot(p.x - last.at[0], p.y - last.at[1]) < 32) {
      this.lastEmptyTap = null
      void this.resetView()
    } else {
      this.lastEmptyTap = { at: [p.x, p.y], time }
    }
  }

  private dragVelocity(samples: { time: number; angle: number }[], releasedAt: number): number {
    const last = samples[samples.length - 1]
    if (releasedAt - last.time > 90) return 0 // the finger stopped before letting go
    let first = last
    for (let i = samples.length - 1; i >= 0 && last.time - samples[i].time <= 90; i--) first = samples[i]
    if (first === last) return 0
    // Events can arrive bunched within a frame: never divide by less than one frame.
    return (last.angle - first.angle) / Math.max(0.016, (last.time - first.time) / 1000)
  }

  /** The finger let go of a layer: choose the stop, report the move, spring there. */
  private releaseDrag(velocity: number, cancelled = false): void {
    const turn = this.turn
    if (!turn || turn.kind !== 'drag') return
    if (this.gesture.type === 'turn') this.gesture = { type: 'idle' }
    let quarters = cancelled ? 0 : resolveRelease(turn.angle, velocity)
    let move = moveForTurn(turn.axis, turn.layers[0], quarters)
    if (move && this.callbacks.allowMove && !this.callbacks.allowMove(move)) {
      this.callbacks.onRejectedMove?.(move)
      move = null
      quarters = 0
    }
    if (move) this.report(move, 'drag')
    const to = (quarters * Math.PI) / 2
    if (this.instant) {
      this.land(move, move !== null)
      this.advance()
      return
    }
    this.turn = { kind: 'spring', move, axis: turn.axis, layers: turn.layers, angle: turn.angle, velocity: clamp(velocity, -14, 14), to }
    this.settle()
    this.frame()
  }

  private cancelDrag(): void {
    if (this.turn?.kind !== 'drag') return
    this.turn = null
    this.model.setTurn(null)
    if (this.gesture.type === 'turn') this.gesture = { type: 'idle' }
  }

  /** Forget every pointer (focus lost, pointer capture lost). */
  releaseAllPointers(): void {
    for (const [id, at] of [...this.pointers]) this.pointerUp({ id, x: at[0], y: at[1], touch: false }, true)
    this.pointers.clear()
  }

  // ───────────────────────── teaching aids ─────────────────────────

  private faceletsOf(target: CubeHighlight): number[] {
    const set = new Set<number>()
    for (const i of target.facelets ?? []) if (i >= 0 && i < 54) set.add(i)
    for (const slot of target.slots ?? []) for (const i of SLOT_FACELETS[slot] ?? []) set.add(i)
    if (target.pieces?.length && this.shownState) {
      for (const piece of target.pieces) {
        try {
          for (const sticker of findPiece(this.shownState, piece).stickers) set.add(sticker.facelet)
        } catch {
          /* not on this cube: nothing to light */
        }
      }
    }
    return [...set]
  }

  setHighlight(highlight: CubeHighlight | null | undefined): void {
    const next = highlight && (highlight.pieces?.length || highlight.slots?.length || highlight.facelets?.length) ? highlight : null
    const changed = JSON.stringify(next) !== JSON.stringify(this.highlight)
    if (!changed) return
    this.highlight = next
    this.ringAge = 0
    this.retarget()
    this.frame()
  }

  /** Recompute which stickers should be lit (after the highlight or the cube changed). */
  private retarget(): void {
    const highlight = this.highlight
    if (!highlight) {
      this.model.setDimGrey(false)
      this.levelTargets.fill(1)
      this.ringOn = false
      if (this.arrowAvoid.size) {
        this.arrowAvoid.clear()
        this.placeArrow(true)
      }
      return
    }
    this.model.setDimGrey(highlight.dimTo === 'grey')
    const facelets = this.faceletsOf(highlight)
    const rotating = this.arrowMove !== null && isRotation(this.arrowMove)
    this.levelTargets.fill(highlight.dimOthers === false || rotating ? 1 : 0)
    if (highlight.keepCentres !== false) for (const i of CENTRE_FACELETS) this.levelTargets[i] = 1
    for (const i of facelets) this.levelTargets[i] = 1
    this.ringOn = highlight.outline !== false && facelets.length > 0
    if (this.ringOn) this.model.setRingFacelets(facelets)
    const avoid = new Set(facelets)
    const same = avoid.size === this.arrowAvoid.size && facelets.every((i) => this.arrowAvoid.has(i))
    if (!same) {
      this.arrowAvoid = avoid
      this.placeArrow(true)
    }
  }

  setMirrors(on: boolean): void {
    if (this.mirrors === on) return
    this.mirrors = on
    this.frame()
  }

  setFaceLabels(on: boolean): void {
    if (this.labelsOn === on) return
    this.labelsOn = on
    this.frame()
  }

  /** Draw single-face arrows round their layer (default) or as an arc on the face (Notation). */
  setArrowStyle(style: ArrowStyle): void {
    if (style === this.arrowStyle) return
    this.arrowStyle = style
    if (this.arrowMove) {
      this.arrowRing = null
      const move = this.arrowMove
      this.arrowMove = null
      this.setArrow(move)
    }
  }

  /** Preview a move with a curved arrow on the cube. Null hides it. */
  setArrow(move: Move | null | undefined): void {
    const next = move && isMove(move) ? move : null
    if (next === this.arrowMove) return
    const wasRotation = this.arrowMove !== null && isRotation(this.arrowMove)
    this.arrowMove = next
    this.arrowRing = next ? arrowRing(next, this.arrowStyle === 'face' && hasFaceArrow(next) && this.faceVisible(next) ? 'face' : 'layer') : null
    this.arrowStart = -1
    this.arrowAmount = 0
    if (!next) this.model.setArrow(null)
    // A whole-cube rotation singles nothing out, so it never dims the cube.
    if (wasRotation !== (next !== null && isRotation(next))) this.retarget()
    this.syncCamera()
    this.placeArrow(true)
    this.frame()
  }

  private stepAids(dt: number): boolean {
    let active = false
    const fast = this.instant ? 1000 : 1

    // Light levels.
    let levelsChanged = false
    for (let i = 0; i < 54; i++) {
      if (this.levels[i] !== this.levelTargets[i]) {
        this.levels[i] = approach(this.levels[i], this.levelTargets[i], dt, 9 * fast)
        levelsChanged = true
      }
    }
    if (levelsChanged) {
      this.model.setLevels(this.levels)
      active = true
    }

    // Highlight ring: three soft pulses, then it rests.
    const ringTarget = this.ringOn ? 1 : 0
    if (this.ringFade !== ringTarget) {
      this.ringFade = approach(this.ringFade, ringTarget, dt, 10 * fast)
      active = true
    }
    let ring = this.ringFade * 0.92
    if (this.ringOn && !this.instant) {
      const pulses = 3
      const period = 0.8
      if (this.ringAge < pulses * period) {
        this.ringAge += dt
        ring *= 0.62 + 0.38 * Math.cos((this.ringAge / period) * Math.PI * 2)
        active = true
      }
    }
    this.model.setRingOpacity(ring)

    // Mirrors (and the zoom-out that makes room for them).
    const mirrorTarget = this.mirrors ? 1 : 0
    if (this.mirrorAmount !== mirrorTarget) {
      this.mirrorAmount = approach(this.mirrorAmount, mirrorTarget, dt, 7 * fast)
      active = true
    }
    this.model.setHintOpacity(this.mirrorAmount * 0.96)

    const labelTarget = this.labelsOn ? 1 : 0
    if (this.labelAmount !== labelTarget) {
      this.labelAmount = approach(this.labelAmount, labelTarget, dt, 10 * fast)
      active = true
    }

    if (this.arrowMove && this.arrowAmount !== 1) {
      this.arrowAmount = approach(this.arrowAmount, 1, dt, 9 * fast)
      active = true
    }
    this.model.setArrowOpacity(this.arrowMove ? this.arrowAmount : 0)
    return active
  }

  /** The arrow on show, where it starts on its ring, and the stickers it lies over (tests). */
  arrowInfo(): { move: Move | null; start: number; covers: number[]; avoid: number[] } {
    const ring = this.arrowRing
    const covers = new Set<number>()
    if (ring && this.arrowMove) {
      const point = new THREE.Vector3()
      const normal = new THREE.Vector3()
      for (let d = 0; d <= this.arrowLength; d += 0.04) {
        ringPoint(ring, this.arrowStart + d, 0, 0, point, normal)
        if (Math.abs(normal.x) + Math.abs(normal.y) + Math.abs(normal.z) > 1.01) continue
        const facelet = faceletAtPosition(
          [clamp(Math.round(point.x), -1, 1), clamp(Math.round(point.y), -1, 1), clamp(Math.round(point.z), -1, 1)],
          [Math.round(normal.x), Math.round(normal.y), Math.round(normal.z)],
        )
        if (facelet >= 0) covers.add(facelet)
      }
    }
    return { move: this.arrowMove, start: this.arrowStart, covers: [...covers].sort((x, y) => x - y), avoid: [...this.arrowAvoid].sort((x, y) => x - y) }
  }

  // ───────────────────────── celebration ─────────────────────────

  /**
   * The cube celebrates. `tick`: a small hop and a shine (a clean rep, a right answer).
   * `stage`: a spin with a ripple through the layers and a light sweeping across the stickers
   * (a lesson done, a pattern made, a badge). `milestone`: a double spin with a tilt, a lift and
   * a glow that sweeps twice (a full solve, the real cube solved, a level-up).
   * Reduced motion: no movement, the stickers just brighten and fade back. Resolves when done
   * (at once when the cube is off-screen). Touching the cube ends it early.
   */
  celebrate(tier: CelebrateTier = 'stage'): Promise<void> {
    this.endCelebration()
    if (!this.options.visible || this.disposed) return Promise.resolve()
    return new Promise((resolve) => {
      const still = this.options.reducedMotion
      this.celebration = { tier, t: 0, duration: still ? 0.7 : CELEBRATION_SECONDS[tier], still, resolve }
      this.frame()
    })
  }

  get isCelebrating(): boolean {
    return this.celebration !== null
  }

  private endCelebration(): void {
    const celebration = this.celebration
    if (!celebration) return
    this.celebration = null
    this.model.group.rotation.set(0, 0, 0)
    this.model.group.position.set(0, 0, 0)
    this.model.group.scale.setScalar(1)
    this.labels.group.rotation.set(0, 0, 0)
    this.labels.group.position.set(0, 0, 0)
    if (!this.turn) this.model.setLayerAngles(null)
    this.model.setGlow(null)
    this.frame()
    celebration.resolve()
  }

  private stepCelebration(dt: number): boolean {
    const c = this.celebration
    if (!c) return false
    c.t += dt
    const f = Math.min(1, c.t / c.duration)
    const glow = this.glow
    if (c.still) {
      glow.fill(0.7 * bump(f, 0, 1))
    } else if (c.tier === 'tick') {
      const hop = bump(f, 0, 1)
      this.model.group.position.y = 0.16 * hop
      this.model.group.scale.setScalar(1 + 0.035 * hop)
      glow.fill(0.35 * bump(f, 0, 0.8))
    } else {
      const milestone = c.tier === 'milestone'
      const spinEnd = milestone ? 0.72 : 0.78
      const spin = easeOutBack(f / spinEnd, milestone ? 0.9 : 1.15) * Math.PI * 2 * (milestone ? 2 : 1)
      this.model.group.rotation.y = f >= spinEnd ? Math.PI * 2 * (milestone ? 2 : 1) : spin
      if (milestone) {
        this.model.group.rotation.x = 0.28 * bump(f, 0, 0.8)
        this.model.group.position.y = 0.32 * bump(f, 0, 0.75)
        this.model.group.scale.setScalar(1 + 0.07 * bump(f, 0.05, 0.85))
      } else {
        this.model.group.position.y = 0.14 * bump(f, 0, 0.6)
      }
      // A ripple down the layers: the top layer swings out first, the others follow.
      if (!this.turn) {
        const amp = milestone ? 0.5 : 0.38
        const ripple = (delay: number) => amp * bump(f, delay, delay + (milestone ? 0.5 : 0.55)) * (1 - f)
        this.model.setLayerAngles('y', [ripple(0.22), ripple(0.11), ripple(0)])
      }
      // A light sweeping across the stickers (twice for a milestone), then everything glows once.
      const sweeps = milestone ? [0.3, 0.62] : [0.45]
      for (let i = 0; i < 54; i++) {
        let g = 0
        for (const start of sweeps) {
          const band = -2.6 + ((f - start) / 0.38) * 5.2
          if (f > start && f < start + 0.38) g = Math.max(g, Math.exp(-(((STICKER_SWEEP[i] - band) / 0.55) ** 2)))
        }
        if (milestone) g = Math.max(g, 0.55 * bump(f, 0.78, 1))
        glow[i] = g
      }
    }
    this.labels.group.rotation.copy(this.model.group.rotation)
    this.labels.group.position.copy(this.model.group.position)
    this.model.setGlow(glow)
    if (f >= 1) {
      this.endCelebration()
      return false
    }
    return true
  }

  /** The cube's outline on the canvas (pixels): the box round its eight projected corners. */
  screenBounds(): { left: number; top: number; right: number; bottom: number } {
    this.syncCamera()
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const x of [-1.5, 1.5]) {
      for (const y of [-1.5, 1.5]) {
        for (const z of [-1.5, 1.5]) {
          const [px, py] = this.project([x, y, z])
          left = Math.min(left, px)
          right = Math.max(right, px)
          top = Math.min(top, py)
          bottom = Math.max(bottom, py)
        }
      }
    }
    return { left, top, right, bottom }
  }

  // ───────────────────────── frame ─────────────────────────

  /** Advance every animation by `dt` seconds. Returns true while another frame is needed. */
  update(dt: number): boolean {
    if (this.disposed) return false
    // The first frame after a rest carries the whole idle time as `dt`: treat it as one tick.
    const step = Math.min(Math.max(dt, 0), this.running ? 0.1 : 1 / 60)
    let active = false
    if (this.stepTurn(step)) active = true
    if (this.stepCamera(step)) active = true
    if (this.stepAids(step)) active = true
    if (this.stepCelebration(step)) active = true
    this.syncCamera()
    this.running = active
    return active
  }

  dispose(): void {
    this.disposed = true
    this.endCelebration()
    this.cancelPeek()
    // Nobody will ever step a camera glide again: let whoever awaits it carry on.
    const glide = this.tween
    this.tween = null
    glide?.done?.()
    this.stopScript()
    const waiters = this.idleWaiters
    this.idleWaiters = []
    for (const resolve of waiters) resolve()
    this.model.dispose()
    this.labels.dispose()
    this.shadow.geometry.dispose()
    this.shadow.material.map?.dispose()
    this.shadow.material.dispose()
    this.callbacks = {}
  }
}
