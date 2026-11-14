/**
 * Test hook. Every mounted <Cube3D> registers itself on `window.__rubikku.cubes[id]` so that
 * Playwright can read the engine state, find stickers on screen and wait for animations.
 *
 * It is switched on only where it is wanted: in development, in a browser driven by automation
 * (`navigator.webdriver`, which Playwright sets), or when someone asks for it by hand — run
 * `localStorage.setItem('rubikku:debug', '1')` in the console and reload. An ordinary visitor's
 * page gets no `window.__rubikku` at all.
 */
import type { CubeState } from '../cube'
import type { CameraPose } from './view'

export interface CubeDebug {
  /** State after everything queued (what the parent holds). */
  getState(): CubeState | null
  /** State drawn right now. */
  getShownState(): CubeState | null
  getPose(): CameraPose
  isAnimating(): boolean
  whenIdle(): Promise<void>
  /** Centre of a sticker in viewport (client) pixels, and whether it faces the camera. */
  facelet(index: number): { x: number; y: number; facing: boolean }
  /** Frames rendered so far (stays still while the cube is idle). */
  frames(): number
  /** The box round the cube's projected corners, in viewport (client) pixels. */
  bounds(): { left: number; top: number; right: number; bottom: number } | null
  /** Start a celebration (see Cube3DHandle.celebrate). */
  celebrate(tier?: 'tick' | 'stage' | 'milestone'): Promise<void>
  isCelebrating(): boolean
  /** The arrow on show, the stickers it lies over and the highlighted stickers it must keep off. */
  arrowInfo(): { move: string | null; start: number; covers: number[]; avoid: number[] }
  /** 'webgl' or 'fallback'. */
  renderer(): 'webgl' | 'fallback'
  loseContext(): void
  restoreContext(): void
}

interface RubikkuDebug {
  cubes: Record<string, CubeDebug>
  /** Live WebGL contexts created by cubes (big cubes + the one shared mini renderer). */
  contexts: number
  forceFallback?: boolean
}

declare global {
  interface Window {
    __rubikku?: RubikkuDebug
  }
}

let enabled: boolean | null = null

/** Is the test hook wanted on this page? Decided once. */
export function debugEnabled(): boolean {
  if (enabled !== null) return enabled
  if (typeof window === 'undefined') return false
  let asked = false
  try {
    asked = window.localStorage.getItem('rubikku:debug') === '1'
  } catch {
    /* storage blocked: not asked for */
  }
  enabled = import.meta.env.DEV === true || window.navigator?.webdriver === true || asked || window.__rubikku !== undefined
  return enabled
}

export function debugRoot(): RubikkuDebug | null {
  if (!debugEnabled()) return null
  if (!window.__rubikku) window.__rubikku = { cubes: {}, contexts: 0 }
  window.__rubikku.cubes ??= {}
  window.__rubikku.contexts ??= 0
  return window.__rubikku
}

export function registerCube(id: string, api: CubeDebug): () => void {
  const root = debugRoot()
  if (!root) return () => {}
  root.cubes[id] = api
  return () => {
    if (root.cubes[id] === api) delete root.cubes[id]
  }
}

export function countContext(delta: 1 | -1): void {
  const root = debugRoot()
  if (root) root.contexts = Math.max(0, root.contexts + delta)
}

let webglSupport: boolean | null = null

/** True when this browser can give us a WebGL context. Checked once. */
export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (window.__rubikku?.forceFallback) return false
  if (webglSupport !== null) return webglSupport
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
    webglSupport = gl !== null
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglSupport = false
  }
  return webglSupport
}
