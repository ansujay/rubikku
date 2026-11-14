import type { CSSProperties } from 'react'
import { FACE_COLOR as FACE_TO_COLOR, type Color, type CubeState } from '../cube'
import { CUBE_CLASSES } from '../ui'

export interface CubeSvgProps {
  /** A cube state, or 54 painted colours (null = not painted yet). */
  state: CubeState | ArrayLike<Color | null | undefined>
  /** Facelets to keep bright; when given, the rest are dimmed. */
  highlight?: readonly number[]
  className?: string
  style?: CSSProperties
  title?: string
}

const COS = Math.cos(Math.PI / 6)
const SIN = 0.5
/** x → right-front, y → left-front, z → up. */
const project = (x: number, y: number, z: number): string => `${((x - y) * COS).toFixed(3)},${((x + y) * SIN - z).toFixed(3)}`

/** Colour of a facelet from either kind of input. */
export function colorOfFacelet(state: CubeSvgProps['state'], facelet: number): Color | null {
  const value = state[facelet]
  if (!value) return null
  return typeof state === 'string' ? FACE_TO_COLOR[value as keyof typeof FACE_TO_COLOR] : (value as Color)
}

const N = 3
const GAP = 0.075
const ROUND = 0.17
const INSET = GAP + ROUND / 2

/**
 * A flat isometric drawing of a cube state (top, front and right faces) — no WebGL. It is the
 * stand-in when WebGL is unavailable or the context is lost, and the placeholder minis show
 * before their first render.
 */
export function CubeSvg({ state, highlight, className, style, title }: CubeSvgProps) {
  const lit = highlight && highlight.length > 0 ? new Set(highlight) : null
  const stickers: { points: string; facelet: number; shade: number }[] = []
  const a = INSET
  const b = 1 - INSET
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = r * N + c
      // U (facelets 0–8): row = back → front, column = left → right.
      stickers.push({
        points: [project(c + a, r + a, N), project(c + b, r + a, N), project(c + b, r + b, N), project(c + a, r + b, N)].join(' '),
        facelet: i,
        shade: 0,
      })
      const z = N - r
      // F (18–26): the left face on screen.
      stickers.push({
        points: [project(c + a, N, z - a), project(c + b, N, z - a), project(c + b, N, z - b), project(c + a, N, z - b)].join(' '),
        facelet: 18 + i,
        shade: 0.07,
      })
      // R (9–17): columns run front → back.
      const y = N - c
      stickers.push({
        points: [project(N, y - a, z - a), project(N, y - b, z - a), project(N, y - b, z - b), project(N, y - a, z - b)].join(' '),
        facelet: 9 + i,
        shade: 0.16,
      })
    }
  }
  const body = [project(0, 0, N), project(N, 0, N), project(N, 0, 0), project(N, N, 0), project(0, N, 0), project(0, N, N)].join(' ')
  const pad = 0.12
  const w = 2 * N * COS + pad * 2
  const h = 2 * N + pad * 2
  return (
    <svg
      viewBox={`${-N * COS - pad} ${-N - pad} ${w} ${h}`}
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <polygon points={body} fill="var(--cube-body)" stroke="var(--cube-body)" strokeWidth={0.2} strokeLinejoin="round" />
      {stickers.map((s) => {
        const color = colorOfFacelet(state, s.facelet)
        const fill = color ? CUBE_CLASSES[color].cssVar : 'var(--ink-faint)'
        const dimmed = lit !== null && !lit.has(s.facelet)
        return (
          <g key={s.facelet} opacity={dimmed ? 0.28 : color ? 1 : 0.5}>
            <polygon points={s.points} fill={fill} stroke={fill} strokeWidth={ROUND} strokeLinejoin="round" />
            {s.shade > 0 && <polygon points={s.points} fill="#000" stroke="#000" strokeWidth={ROUND} strokeLinejoin="round" opacity={s.shade} />}
          </g>
        )
      })}
    </svg>
  )
}
