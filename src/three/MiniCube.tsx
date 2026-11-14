import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { algStates, isStateString, moveLayer, SOLVED, toAlg, type Alg, type CubeState } from '../cube'
import { turnDurationMs, useSettings } from '../store'
import { cx, useMotionPref, useTheme } from '../ui'
import { CubeSvg } from './CubeSvg'
import { DEFAULT_LOOP_TIMING, loopFrame } from './loopTimeline'
import { addTicker, miniRenderer } from './miniRenderer'
import { viewTheme } from './theme'
import type { CameraPose, CubeHighlight, CubeInput } from './view'

export interface MiniCubeProps {
  /** The cube at rest — and where `alg` starts from. A state or 54 painted colours. Default: solved. */
  state?: CubeInput
  /**
   * An algorithm to animate, starting from `state`. For "this algorithm solves this case" cards
   * pass `state={stateFromAlg(invertAlg(alg))}`; for patterns pass the solved cube.
   */
  alg?: Alg | string
  /**
   * When the algorithm plays: `'hover'` (default) while hovered, focused, or after a tap;
   * `'visible'` whenever the mini is on screen; `false` never. Reduced motion always shows a still.
   */
  play?: 'hover' | 'visible' | false
  /** Start over after finishing (default true). When false it stops on the finished cube. */
  loop?: boolean
  /** Speed multiplier on the turn-speed setting. */
  speed?: number
  /** Show the finished cube instead of the starting one while at rest. */
  restOnEnd?: boolean
  /** Edge length in CSS pixels. Omit to fill the parent's width (the mini is always square). */
  size?: number
  pose?: Partial<CameraPose>
  /** Light up pieces / slots / stickers and dim the rest (applies to the resting cube). */
  highlight?: CubeHighlight | null
  /** Accessible name; without one the mini is decorative. */
  label?: string
  className?: string
  style?: CSSProperties
}

/**
 * A small, cheap cube for grids (algorithm cards, pattern gallery). It looks like the big cube
 * but is not interactive, and it does not own a WebGL context: all minis are drawn by one shared
 * renderer and copied into plain 2D canvases, so a page can show dozens.
 */
export function MiniCube({ state = SOLVED, alg, play = 'hover', loop = true, speed = 1, restOnEnd = false, size, pose, highlight, label, className, style }: MiniCubeProps) {
  const { resolved } = useTheme()
  const { reduced } = useMotionPref()
  const turnSpeed = useSettings((s) => s.turnSpeed)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [fallback, setFallback] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [visible, setVisible] = useState(false)
  const [pixels, setPixels] = useState(0)

  const stateKey = typeof state === 'string' ? state : Array.from({ length: 54 }, (_, i) => state[i] ?? '-').join(',')
  const algKey = typeof alg === 'string' ? alg : (alg?.join(' ') ?? '')
  const poseKey = pose ? `${pose.azimuth},${pose.elevation},${pose.zoom}` : ''
  const highlightKey = highlight ? JSON.stringify(highlight) : ''

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableState = useMemo(() => state, [stateKey])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stablePose = useMemo(() => pose, [poseKey])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHighlight = useMemo(() => highlight, [highlightKey])
  const moves = useMemo(() => {
    try {
      return algKey ? [...toAlg(algKey)] : []
    } catch {
      return []
    }
  }, [algKey])
  const states = useMemo<CubeState[] | null>(
    () => (typeof stableState === 'string' && isStateString(stableState) && moves.length > 0 ? algStates(stableState, moves) : null),
    [stableState, moves],
  )
  const theme = viewTheme(resolved)
  const animate = states !== null && play !== false && !reduced && visible && (play === 'visible' || hovered || pinned)
  const rest: CubeInput = states && restOnEnd ? states[states.length - 1] : stableState

  useEffect(() => {
    miniRenderer.retain()
    return () => miniRenderer.release()
  }, [])

  // Track size (device pixels) and whether the mini is on screen.
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const measure = () => setPixels(Math.round(element.clientWidth * Math.min(2, window.devicePixelRatio || 1)))
    measure()
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    resize?.observe(element)
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => setVisible(entries[entries.length - 1].isIntersecting), { rootMargin: '60px' })
        : null
    if (io) io.observe(element)
    else setVisible(true)
    return () => {
      resize?.disconnect()
      io?.disconnect()
    }
  }, [fallback])

  // The still picture.
  useLayoutEffect(() => {
    const element = canvas.current
    if (!element || pixels < 2 || animate) return
    if (element.width !== pixels) {
      element.width = pixels
      element.height = pixels
    }
    const ctx = element.getContext('2d')
    if (!ctx || !miniRenderer.draw(ctx, pixels, { state: rest, theme, pose: stablePose, highlight: stableHighlight })) setFallback(true)
  }, [pixels, animate, rest, theme, stablePose, stableHighlight])

  // The moving picture: a pure function of the clock, drawn from the shared loop. (A layout
  // effect, so that its ticker is gone before the still above is drawn — otherwise one last
  // animated frame could land on top of the resting picture.)
  useLayoutEffect(() => {
    const element = canvas.current
    if (!element || !animate || !states || pixels < 2) return
    // Size the backing store here too: a mini that starts out playing never drew a still, and a
    // 300×150 default canvas squashes the cube.
    if (element.width !== pixels) {
      element.width = pixels
      element.height = pixels
    }
    const ctx = element.getContext('2d')
    if (!ctx) return
    const timing = { ...DEFAULT_LOOP_TIMING, quarterMs: (turnDurationMs(turnSpeed) * 1.1) / (speed > 0 ? speed : 1), loop }
    let start = -1
    // In a grid of always-playing minis, start out of step so they do not march in lockstep.
    const offset = play === 'visible' ? Math.random() * 500 : 0
    // What the last drawn frame showed: while the loop holds still (before, between and after
    // turns) nothing changes, so nothing is drawn.
    let drawn = ''
    const tick = (now: number) => {
      if (start < 0) start = now + offset - (play === 'visible' ? 0 : timing.holdStartMs - 120)
      const frame = loopFrame(moves, now - start, timing)
      const layer = frame.move ? moveLayer(frame.move) : null
      const key = `${frame.applied}|${layer ? frame.progress : '-'}|${frame.alpha}`
      if (key === drawn) return
      drawn = key
      miniRenderer.draw(ctx, pixels, {
        state: states[frame.applied],
        theme,
        pose: stablePose,
        turn: layer ? { axis: layer.axis, layers: layer.layers, angle: layer.angle * frame.progress } : null,
        alpha: frame.alpha,
        // The highlight holds while it plays too (lit pieces are followed from state to state).
        highlight: stableHighlight,
      })
    }
    // Draw the first frame now: resizing the backing store above cleared the canvas, and waiting
    // for the shared loop's next frame would flash an empty square.
    tick(performance.now())
    return addTicker(tick)
  }, [animate, states, moves, pixels, theme, stablePose, stableHighlight, turnSpeed, speed, loop, play])

  const box: CSSProperties = size ? { width: size, height: size } : { width: '100%', aspectRatio: '1 / 1' }
  const interactive = states !== null && play === 'hover'

  if (fallback) {
    return (
      <span className={cx('inline-flex items-center justify-center', className)} style={{ ...box, ...style }} data-minicube="svg">
        <CubeSvg state={rest} title={label} style={{ width: '86%', height: '86%' }} />
      </span>
    )
  }
  return (
    <canvas
      ref={canvas}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-minicube={animate ? 'playing' : 'still'}
      className={cx('block', className)}
      style={{ ...box, ...style }}
      onPointerEnter={interactive ? (event) => event.pointerType === 'mouse' && setHovered(true) : undefined}
      onPointerLeave={interactive ? () => setHovered(false) : undefined}
      onPointerDown={interactive ? (event) => event.pointerType !== 'mouse' && setPinned((on) => !on) : undefined}
    />
  )
}
