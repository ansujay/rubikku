import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type Ref } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { applyMove, FACELETS, isStateString, toAlg, type Alg, type CubeState, type FaceletInfo, type Move } from '../cube'
import { turnDurationMs, useSettings } from '../store'
import { cx, sound, useMotionPref, useTheme } from '../ui'
import type { CubeViewDriver, MoveMeta, PlayOptions } from './controller'
import { CubeSvg } from './CubeSvg'
import { countContext, isWebGLAvailable, registerCube } from './debug'
import { viewTheme } from './theme'
import { actionForKey } from './turns'
import type { ArrowStyle } from './model'
import { CubeView, type CameraPose, type CelebrateTier, type CubeHighlight, type CubeInput } from './view'

export type CubeMode =
  /** Everything: drag stickers to turn, drag the background to look around, zoom, keyboard. */
  | 'interactive'
  /** Look but don't turn: orbit only. */
  | 'view'
  /** No input at all (demos); pointer events pass through to the page. */
  | 'playback'

export interface Cube3DHandle extends CubeViewDriver {
  /**
   * Animate an algorithm, one move after another. Each move is reported through `onMove`
   * (source `'play'`) as it starts, so the parent's state follows along. Resolves true when it
   * finished, false if it was interrupted (stop(), a new state, the user grabbing a layer).
   */
  play(alg: Alg | string, options?: PlayOptions): Promise<boolean>
  /** Stop playing: the move in flight lands at once and the rest is dropped. */
  stop(): void
  /** Resolves when nothing is turning. */
  whenIdle(): Promise<void>
  /** Make one turn exactly as if the user had (reported with source `'keyboard'`). False if refused. */
  turn(move: Move): boolean
  /** Drop every animation and show the `state` prop right now. */
  setStateInstant(state?: CubeInput): void
  /** Glide back to the default three-quarter view. */
  resetView(): Promise<void>
  /** Glide the camera to face pieces / slots / stickers. Pass null to ease back. */
  focusOn(target: CubeHighlight | null, options?: { zoom?: number; free?: boolean }): Promise<void>
  /** Swing round to show the back, left and bottom, hold, and return. */
  peek(holdMs?: number): Promise<void>
  getPose(): CameraPose
  setPose(pose: Partial<CameraPose>, options?: { duration?: number; instant?: boolean }): Promise<void>
  /**
   * The cube's own part of a celebration (pair it with the UI's celebration of the same tier):
   * `'tick'` a small hop and shine, `'stage'` a spin with a layer ripple and a light sweep
   * (~1 s), `'milestone'` a double spin, lift and glow (~1.9 s). Reduced motion: a brief glow
   * only. Resolves when it is over; touching the cube ends it early.
   */
  celebrate(tier?: CelebrateTier): Promise<void>
  /** The state the view is heading for; null while showing a painted (non-state) cube. */
  getState(): CubeState | null
  readonly isAnimating: boolean
  /** Give the cube keyboard focus. */
  focus(): void
}

export interface Cube3DProps {
  /**
   * The cube to show: an engine state, or 54 painted colours (null = blank grey sticker) for a
   * cube that is still being entered. The component is controlled: when this changes by exactly
   * one move the move animates; any other change snaps.
   */
  state: CubeInput
  /**
   * A move has started — one the user made (source `'drag'` / `'keyboard'`) or one from
   * `ref.play()` (source `'play'`). The parent must apply it (`meta.state` is the result) and
   * pass the new state back. Use `allowMove` to refuse moves; do not just ignore them.
   */
  onMove?: (move: Move, meta: MoveMeta) => void
  /** Called before a user turn is accepted. Return false and the layer springs back. */
  allowMove?: (move: Move) => boolean
  /** A user turn was refused by `allowMove`. */
  onRejectedMove?: (move: Move) => void
  /** A move's animation landed. */
  onMoveEnd?: (move: Move) => void
  onAnimatingChange?: (animating: boolean) => void
  /** Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z while the cube has focus. */
  onUndo?: () => void
  onRedo?: () => void
  /** A sticker was tapped (not dragged). Works for painted cubes too — the paint surface. */
  onStickerClick?: (facelet: number, info: FaceletInfo) => void

  mode?: CubeMode
  /** `'limited'` keeps the front face in front (about 60° either way). Default true (free) unless mode is playback. */
  orbit?: boolean | 'limited'
  /** Pinch / wheel zoom. Default: on in interactive mode. */
  zoom?: boolean
  /** Keyboard notation. Default: on in interactive mode. */
  keyboard?: boolean
  /**
   * Let vertical swipes scroll the page (touch-action: pan-y) instead of tilting the cube —
   * for cubes that sit in a scrolling page as decoration (the Home hero). Default false.
   */
  pageScroll?: boolean
  /** Animate single-move changes of `state` (default true). */
  animateStateChanges?: boolean
  /** Multiplier on the turn-speed setting. */
  speed?: number
  /** Play the click when a turn lands (default true). */
  turnSound?: boolean

  /** Light up pieces / slots / stickers and dim the rest. */
  highlight?: CubeHighlight | null
  /** Preview a move with a curved arrow on the cube. */
  arrow?: Move | null
  /**
   * `'layer'` (default): the arrow runs round the turning layer's edge, on the side facing the
   * camera — the layer is the point (lessons). `'face'`: a single-face move (U D L R F B) is drawn
   * as a curved arc on that face, round its centre — the letter IS the face (Notation, primer).
   */
  arrowStyle?: ArrowStyle
  /** Float copies of the three hidden faces beside the cube. */
  mirrors?: boolean
  /** Face letters on the centres. Default: the `showFaceLabels` setting. */
  faceLabels?: boolean
  /** The pose reset-view returns to, and the starting pose. */
  initialPose?: Partial<CameraPose>

  /** Accessible name. */
  label?: string
  /** Id under `window.__rubikku.cubes` for tests. Default "cube". */
  debugId?: string
  className?: string
  style?: CSSProperties
  ref?: Ref<Cube3DHandle>
}

interface SceneProps {
  view: CubeView
  onLost: (lost: boolean) => void
  onReady: () => void
  frames: { current: number }
}

/** Lives inside <Canvas>: hands the view its frames, an environment map and the canvas size. */
function Scene({ view, onLost, onReady, frames }: SceneProps) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const ready = useRef(false)
  // Bumped when a lost context comes back: GPU-side things (the environment map) are rebuilt.
  const [generation, setGeneration] = useState(0)

  useLayoutEffect(() => {
    view.callbacks.requestFrame = () => invalidate()
    invalidate()
    return () => {
      view.callbacks.requestFrame = undefined
    }
  }, [view, invalidate])

  useLayoutEffect(() => {
    view.setSize(size.width, size.height)
  }, [view, size.width, size.height])

  useEffect(() => {
    // Soft studio reflections for the plastic, generated on the GPU: no image to download.
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04)
    view.model.setEnvironment(env.texture)
    room.dispose()
    invalidate()
    return () => {
      view.model.setEnvironment(null)
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, view, invalidate, generation])

  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event: Event) => {
      event.preventDefault()
      onLost(true)
    }
    const restored = () => {
      setGeneration((n) => n + 1)
      onLost(false)
      invalidate()
    }
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    countContext(1)
    return () => {
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
      countContext(-1)
    }
  }, [gl, onLost, invalidate])

  useFrame((_, delta) => {
    frames.current++
    if (view.update(delta)) invalidate()
    if (!ready.current) {
      ready.current = true
      onReady()
    }
  })

  return <primitive object={view.root} />
}

const GL_OPTIONS = { alpha: true, antialias: true, powerPreference: 'high-performance' as const }

/**
 * The cube. Fills its parent (mount it inside <CubeStage>); the canvas is transparent.
 *
 *   const cube = useCubeController()
 *   <CubeStage className="aspect-square"><Cube3D {...cube.bind} /></CubeStage>
 */
export function Cube3D({
  state,
  onMove,
  allowMove,
  onRejectedMove,
  onMoveEnd,
  onAnimatingChange,
  onUndo,
  onRedo,
  onStickerClick,
  mode = 'interactive',
  orbit,
  zoom,
  keyboard,
  pageScroll = false,
  animateStateChanges = true,
  speed = 1,
  turnSound = true,
  highlight,
  arrow,
  arrowStyle = 'layer',
  mirrors = false,
  faceLabels,
  initialPose,
  label,
  debugId = 'cube',
  className,
  style,
  ref,
}: Cube3DProps) {
  const { resolved } = useTheme()
  const { reduced } = useMotionPref()
  const turnSpeed = useSettings((s) => s.turnSpeed)
  const labelSetting = useSettings((s) => s.showFaceLabels)
  const theme = viewTheme(resolved)

  const wrapper = useRef<HTMLDivElement>(null)
  const viewRef = useRef<CubeView | null>(null)
  const [view, setView] = useState<CubeView | null>(null)
  const [webgl] = useState(isWebGLAvailable)
  const [lost, setLost] = useState(false)
  const [ready, setReady] = useState(false)
  const [onScreen, setOnScreen] = useState(true)
  const frames = useRef(0)
  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  const loseExtension = useRef<WEBGL_lose_context | null>(null)

  // Latest props for callbacks that outlive a render.
  const latest = useRef({ state, onMove, allowMove, onRejectedMove, onMoveEnd, onAnimatingChange, onUndo, onRedo, onStickerClick, turnSound })
  useLayoutEffect(() => {
    latest.current = { state, onMove, allowMove, onRejectedMove, onMoveEnd, onAnimatingChange, onUndo, onRedo, onStickerClick, turnSound }
  })

  const interactive = mode === 'interactive'
  const canOrbit = mode === 'playback' ? false : (orbit ?? true)
  const canZoom = zoom ?? interactive
  const canKey = keyboard ?? interactive
  const canTurn = interactive && typeof state === 'string'
  const drawing = webgl && !lost

  // The view is created in an effect (not during render) so StrictMode's double mount gets a
  // fresh one each time and the disposed one is never reused.
  useEffect(() => {
    const created = new CubeView(viewTheme(resolved))
    created.callbacks = {
      onMove: (move, meta) => latest.current.onMove?.(move, meta),
      allowMove: (move) => latest.current.allowMove?.(move) ?? true,
      onRejectedMove: (move) => {
        sound.play('error')
        latest.current.onRejectedMove?.(move)
      },
      onMoveEnd: (move) => latest.current.onMoveEnd?.(move),
      onAnimatingChange: (animating) => latest.current.onAnimatingChange?.(animating),
      onStickerClick: (facelet) => latest.current.onStickerClick?.(facelet, FACELETS[facelet]),
      onTurnSound: () => {
        if (latest.current.turnSound) sound.play('turn')
      },
    }
    if (initialPose) created.setHome(initialPose)
    created.setState(latest.current.state, false)
    viewRef.current = created
    setView(created)
    // Face letters are drawn with the display font: redraw once it has loaded.
    let alive = true
    document.fonts?.ready.then(() => alive && created.refreshLabels()).catch(() => {})
    return () => {
      alive = false
      viewRef.current = null
      created.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    view?.setTheme(theme)
  }, [view, theme])

  useLayoutEffect(() => {
    view?.setOptions({
      turn: canTurn,
      orbit: canOrbit,
      zoom: canZoom,
      reducedMotion: reduced,
      quarterMs: turnDurationMs(turnSpeed) / (speed > 0 ? speed : 1),
      visible: drawing && onScreen,
    })
  }, [view, canTurn, canOrbit, canZoom, reduced, turnSpeed, speed, drawing, onScreen])

  useLayoutEffect(() => {
    view?.setState(state, animateStateChanges)
  }, [view, state, animateStateChanges])

  useLayoutEffect(() => {
    view?.setHighlight(highlight)
  }, [view, highlight])

  useLayoutEffect(() => {
    view?.setArrowStyle(arrowStyle)
    view?.setArrow(arrow)
  }, [view, arrow, arrowStyle])

  useLayoutEffect(() => {
    view?.setMirrors(mirrors)
  }, [view, mirrors])

  const showLabels = faceLabels ?? labelSetting
  useLayoutEffect(() => {
    view?.setFaceLabels(showLabels)
  }, [view, showLabels])

  // Pause when scrolled out of sight.
  useEffect(() => {
    const element = wrapper.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => setOnScreen(entries[entries.length - 1].isIntersecting), { rootMargin: '80px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Wheel zoom needs a non-passive listener. A plain wheel only zooms once the cube has focus
  // (so the page still scrolls past it); a pinch on a trackpad (ctrl+wheel) always zooms.
  useEffect(() => {
    const element = wrapper.current
    if (!element || !canZoom) return
    const onWheel = (event: WheelEvent) => {
      const pinch = event.ctrlKey || event.metaKey
      if (!pinch && document.activeElement !== element) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 320 : 1
      const changed = viewRef.current?.zoomBy(event.deltaY * unit * (pinch ? 3 : 1)) ?? false
      if (changed || pinch) event.preventDefault()
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [canZoom])

  const handle = useMemo<Cube3DHandle>(
    () => ({
      play(alg, options) {
        const moves = toAlg(alg)
        const current = viewRef.current
        if (current) return current.play(moves, options)
        // Not mounted yet: report the moves straight away so the parent's state is right.
        let next = latest.current.state
        for (const move of moves) {
          if (typeof next !== 'string' || !isStateString(next)) return Promise.resolve(false)
          next = applyMove(next, move)
          latest.current.onMove?.(move, { source: 'play', state: next })
        }
        return Promise.resolve(true)
      },
      stop: () => viewRef.current?.stop(),
      whenIdle: () => viewRef.current?.whenIdle() ?? Promise.resolve(),
      turn: (move) => viewRef.current?.userMove(move, 'keyboard') ?? false,
      setStateInstant: (next) => viewRef.current?.setState(next ?? latest.current.state, false),
      resetView: () => viewRef.current?.resetView() ?? Promise.resolve(),
      focusOn: (target, options) => viewRef.current?.focusOn(target, options) ?? Promise.resolve(),
      peek: (holdMs) => viewRef.current?.peek(holdMs) ?? Promise.resolve(),
      getPose: () => viewRef.current?.getPose() ?? { azimuth: 0, elevation: 0, zoom: 1 },
      setPose: (pose, options) => viewRef.current?.setPose(pose, options) ?? Promise.resolve(),
      getState: () => viewRef.current?.getState() ?? null,
      celebrate: (tier) => viewRef.current?.celebrate(tier) ?? Promise.resolve(),
      get isAnimating() {
        return viewRef.current?.isAnimating ?? false
      },
      focus: () => wrapper.current?.focus({ preventScroll: true }),
    }),
    [],
  )
  useImperativeHandle(ref, () => handle, [handle])

  // Test hook.
  useEffect(() => {
    return registerCube(debugId, {
      getState: () => viewRef.current?.getState() ?? null,
      getShownState: () => viewRef.current?.getShownState() ?? null,
      getPose: () => viewRef.current?.getPose() ?? { azimuth: 0, elevation: 0, zoom: 1 },
      isAnimating: () => viewRef.current?.isAnimating ?? false,
      whenIdle: () => viewRef.current?.whenIdle() ?? Promise.resolve(),
      facelet: (index) => {
        const rect = wrapper.current?.getBoundingClientRect()
        const at = viewRef.current?.faceletOnScreen(index)
        return at && rect ? { x: rect.left + at.x, y: rect.top + at.y, facing: at.facing } : { x: 0, y: 0, facing: false }
      },
      frames: () => frames.current,
      bounds: () => {
        const rect = wrapper.current?.getBoundingClientRect()
        const b = viewRef.current?.screenBounds()
        return rect && b ? { left: rect.left + b.left, top: rect.top + b.top, right: rect.left + b.right, bottom: rect.top + b.bottom } : null
      },
      celebrate: (tier) => viewRef.current?.celebrate(tier) ?? Promise.resolve(),
      isCelebrating: () => viewRef.current?.isCelebrating ?? false,
      arrowInfo: () => viewRef.current?.arrowInfo() ?? { move: null, start: -1, covers: [], avoid: [] },
      renderer: () => (wrapper.current?.querySelector('canvas') ? 'webgl' : 'fallback'),
      loseContext: () => {
        // The extension object must be fetched while the context is alive, and kept for the restore.
        loseExtension.current = glRef.current?.getContext().getExtension('WEBGL_lose_context') ?? null
        loseExtension.current?.loseContext()
      },
      restoreContext: () => loseExtension.current?.restoreContext(),
    })
  }, [debugId])

  // ── input ──

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top, touch: event.pointerType !== 'mouse', time: event.timeStamp }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!view || (event.pointerType === 'mouse' && event.button !== 0)) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* the pointer is already gone */
    }
    if (canKey && document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true })
    view.pointerDown(point(event))
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => view?.pointerMove(point(event))
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => view?.pointerUp(point(event))
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => view?.pointerUp(point(event), true)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!view || !canKey || event.target !== event.currentTarget) return
    const action = actionForKey(event)
    if (!action) return
    switch (action.type) {
      case 'move':
        if (!canTurn) return
        view.userMove(action.move, 'keyboard')
        break
      case 'double':
        if (!canTurn) return
        view.repeatLastMove()
        break
      case 'orbit':
        if (!canOrbit) return
        view.orbitBy(action.dx, action.dy)
        break
      case 'undo':
        if (!onUndo) return
        onUndo()
        break
      case 'redo':
        if (!onRedo) return
        onRedo()
        break
      case 'resetView':
        void view.resetView()
        break
      case 'peek':
        void view.peek()
        break
    }
    event.preventDefault()
  }

  // No pointer input on the flat fallback drawing: the hidden 3D geometry does not line up with it
  // (keys and `play()` keep working).
  const inputOn = drawing && mode !== 'playback' && (canOrbit !== false || canTurn || canZoom || onStickerClick !== undefined)
  // Input switched off in the middle of a gesture (a beat finished under his finger): the
  // pointer-up will never arrive, so let go of every pointer now.
  useEffect(() => {
    if (!inputOn) view?.releaseAllPointers()
  }, [inputOn, view])
  const name = label ?? (interactive ? 'Cube. Drag a sticker to turn a layer, drag around it to look. Letter keys turn faces.' : 'Cube')

  return (
    <div
      ref={wrapper}
      role={interactive ? 'application' : 'img'}
      aria-label={name}
      aria-roledescription={interactive ? '3D puzzle cube' : undefined}
      tabIndex={canKey ? 0 : undefined}
      data-cube3d={debugId}
      data-renderer={drawing ? 'webgl' : 'fallback'}
      className={cx(
        'relative h-full w-full overflow-hidden rounded-[inherit] outline-none select-none',
        'focus-visible:[box-shadow:inset_0_0_0_3px_var(--focus,var(--accent))]',
        inputOn ? ['cursor-grab active:cursor-grabbing', pageScroll ? 'touch-pan-y' : 'touch-none'] : 'pointer-events-none',
        className,
      )}
      style={{ WebkitTapHighlightColor: 'transparent', WebkitTouchCallout: 'none', ...style }}
      onPointerDown={inputOn ? onPointerDown : undefined}
      onPointerMove={inputOn ? onPointerMove : undefined}
      onPointerUp={inputOn ? onPointerUp : undefined}
      onPointerCancel={inputOn ? onPointerCancel : undefined}
      onLostPointerCapture={inputOn ? onPointerCancel : undefined}
      onKeyDown={canKey ? onKeyDown : undefined}
      onContextMenu={inputOn ? (event) => event.preventDefault() : undefined}
    >
      {webgl && view && (
        <Canvas
          flat
          frameloop="demand"
          dpr={[1, 2]}
          camera={view.camera}
          gl={GL_OPTIONS}
          onCreated={({ gl }) => {
            glRef.current = gl
          }}
          style={{ position: 'absolute', inset: 0, touchAction: pageScroll ? 'pan-y' : 'none', opacity: ready && !lost ? 1 : 0, transition: 'opacity 240ms ease-out' }}
          aria-hidden="true"
        >
          <Scene view={view} onLost={setLost} onReady={() => setReady(true)} frames={frames} />
        </Canvas>
      )}
      {!drawing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6" data-cube-fallback>
          <CubeSvg state={view?.getState() ?? state} className="h-[62%] max-h-80 w-auto" title="The cube, drawn flat" />
          <p className="max-w-64 text-center text-sm text-ink-muted">
            {webgl ? 'The 3D view took a nap. It will be right back.' : 'This device can’t show the 3D cube, so here it is drawn flat.'}
          </p>
        </div>
      )}
    </div>
  )
}
