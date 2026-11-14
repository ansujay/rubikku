/**
 * One WebGL context for every mini cube on the page.
 *
 * Browsers allow only a handful of WebGL contexts (8–16), so a grid of twenty algorithm cards
 * cannot each have a canvas of their own. Instead a single hidden renderer draws each mini in
 * turn and the picture is copied into that mini's ordinary 2D canvas. Static minis cost nothing
 * after their first draw; animating ones share one requestAnimationFrame loop.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Axis } from '../cube'
import { countContext, isWebGLAvailable } from './debug'
import { CubeView, DEFAULT_POSE, type CameraPose, type CubeHighlight, type CubeInput, type ViewTheme } from './view'

export interface MiniFrame {
  state: CubeInput
  theme: ViewTheme
  /** A layer caught mid-turn. */
  turn?: { axis: Axis; layers: readonly number[]; angle: number } | null
  pose?: Partial<CameraPose>
  highlight?: CubeHighlight | null
  /** 0…1, for fades at loop boundaries. */
  alpha?: number
}

class MiniRenderer {
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private view: CubeView | null = null
  private env: THREE.WebGLRenderTarget | null = null
  private theme: ViewTheme | null = null
  private size = 0
  private failed = false
  private users = 0
  private disposeTimer: ReturnType<typeof setTimeout> | null = null

  /** A mini mounted / unmounted. The context is released a little after the last one leaves. */
  retain(): void {
    this.users++
    if (this.disposeTimer) clearTimeout(this.disposeTimer)
    this.disposeTimer = null
  }

  release(): void {
    this.users = Math.max(0, this.users - 1)
    if (this.users === 0 && !this.disposeTimer) {
      this.disposeTimer = setTimeout(() => {
        this.disposeTimer = null
        if (this.users === 0) this.dispose()
      }, 4000)
    }
  }

  private ensure(theme: ViewTheme): boolean {
    if (this.failed || !isWebGLAvailable()) return false
    if (this.renderer) return true
    try {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
      renderer.setPixelRatio(1)
      renderer.toneMapping = THREE.NoToneMapping
      renderer.setClearColor(0x000000, 0)
      // Only if it is still *this* renderer: a late event from one that was already replaced must
      // not take the new one down with it.
      renderer.domElement.addEventListener('webglcontextlost', () => {
        if (this.renderer === renderer) this.dispose()
      })
      const pmrem = new THREE.PMREMGenerator(renderer)
      const room = new RoomEnvironment()
      this.env = pmrem.fromScene(room, 0.04)
      room.dispose()
      pmrem.dispose()
      this.view = new CubeView(theme, 1)
      this.view.model.setEnvironment(this.env.texture)
      this.view.setOptions({ turn: false, orbit: false, zoom: false, reducedMotion: true })
      this.view.setFraming(2.9, 0, false)
      this.view.setSize(1, 1)
      this.scene.add(this.view.root)
      this.theme = theme
      this.renderer = renderer
      this.size = 0
      countContext(1)
      return true
    } catch {
      this.failed = true
      return false
    }
  }

  /** Draw one frame into a 2D canvas context of `pixels` × `pixels`. False if WebGL is not available. */
  draw(target: CanvasRenderingContext2D, pixels: number, frame: MiniFrame): boolean {
    if (pixels < 2 || !this.ensure(frame.theme)) return false
    const renderer = this.renderer!
    const view = this.view!
    if (pixels > this.size) {
      this.size = Math.min(1024, Math.ceil(pixels / 64) * 64)
      renderer.setSize(this.size, this.size, false)
    }
    if (this.theme !== frame.theme) {
      this.theme = frame.theme
      view.setTheme(frame.theme)
    }
    view.setState(frame.state, false)
    view.setHighlight(frame.highlight ? { ...frame.highlight, outline: frame.highlight.outline ?? false } : null)
    void view.setPose({ ...DEFAULT_POSE, ...frame.pose }, { instant: true })
    view.update(0.03)
    const turn = frame.turn
    view.model.setTurn(turn ? turn.axis : null, turn?.layers, turn?.angle)

    const side = Math.min(pixels, this.size)
    renderer.setViewport(0, 0, side, side)
    renderer.setScissor(0, 0, side, side)
    renderer.setScissorTest(true)
    renderer.clear()
    renderer.render(this.scene, view.camera)
    view.model.setTurn(null)

    target.clearRect(0, 0, pixels, pixels)
    target.globalAlpha = frame.alpha ?? 1
    // The WebGL viewport is at the bottom-left of its canvas; canvas images are read from the top.
    target.drawImage(renderer.domElement, 0, this.size - side, side, side, 0, 0, pixels, pixels)
    target.globalAlpha = 1
    return true
  }

  private dispose(): void {
    if (!this.renderer) return
    countContext(-1)
    if (this.view) {
      this.scene.remove(this.view.root)
      this.view.dispose()
    }
    this.view = null
    this.env?.dispose()
    this.env = null
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer = null
    this.size = 0
  }
}

export const miniRenderer = new MiniRenderer()

// ───────────────────────── shared animation loop ─────────────────────────

type Ticker = (now: number) => void
const tickers = new Set<Ticker>()
let raf = 0
let parity = 0
/** With more than this many minis animating at once, each is drawn every other frame. */
const FULL_RATE_LIMIT = 10

function loop(now: number): void {
  raf = 0
  if (tickers.size === 0) return
  const all = [...tickers]
  const halve = all.length > FULL_RATE_LIMIT
  parity ^= 1
  all.forEach((tick, i) => {
    if (!halve || (i & 1) === parity) tick(now)
  })
  if (tickers.size > 0) raf = requestAnimationFrame(loop)
}

/** Join the shared animation loop; returns a function to leave it. */
export function addTicker(tick: Ticker): () => void {
  tickers.add(tick)
  if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(loop)
  return () => {
    tickers.delete(tick)
  }
}
