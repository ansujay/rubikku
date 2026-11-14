import type { CSSProperties } from 'react'
import { CUBE_CLASSES, type CubeColor } from '../colors'

export type IsoFace = readonly CubeColor[]

export interface IsoCubeProps {
  /** Pixel width; height follows. */
  size?: number
  /** Stickers per edge: 1 (logo mark), 2 or 3. */
  n?: 1 | 2 | 3
  /**
   * Colours of the three visible faces, row by row as you look at each face
   * (top: back row first; front and right: top row first). n×n entries each.
   * Defaults to a solved cube: white on top, green in front, red on the right.
   */
  top?: IsoFace
  front?: IsoFace
  right?: IsoFace
  /** Draw sticker outlines only, for locked / ghost states. */
  ghost?: boolean
  className?: string
  style?: CSSProperties
  title?: string
}

const COS = Math.cos(Math.PI / 6)
const SIN = 0.5

/** Project cube coordinates (x → right-front, y → left-front, z → up) to the screen. */
const project = (x: number, y: number, z: number): [number, number] => [(x - y) * COS, (x + y) * SIN - z]

const fmt = (points: [number, number][]) => points.map(([px, py]) => `${px.toFixed(3)},${py.toFixed(3)}`).join(' ')

/** Scrambled faces for illustrations (error page, empty states). */
export const SCRAMBLED_FACES = {
  top: ['red', 'white', 'blue', 'white', 'white', 'orange', 'green', 'yellow', 'white'],
  front: ['yellow', 'green', 'orange', 'blue', 'green', 'white', 'green', 'red', 'red'],
  right: ['white', 'orange', 'green', 'red', 'red', 'yellow', 'blue', 'green', 'orange'],
} as const satisfies Record<string, IsoFace>

/**
 * A flat isometric drawing of the cube (SVG, no WebGL). Used for the logo, illustrations and
 * as the stand-in on the cube stage until the 3D cube mounts.
 */
export function IsoCube({ size = 160, n = 3, top, front, right, ghost = false, className, style, title }: IsoCubeProps) {
  const gap = n === 1 ? 0.085 : 0.075
  const round = n === 1 ? 0.2 : 0.17 // stroke width that rounds sticker corners
  const inset = gap + round / 2
  const color = (face: IsoFace | undefined, fallback: CubeColor, i: number) => CUBE_CLASSES[face?.[i] ?? fallback].cssVar

  const stickers: { points: string; fill: string; shade: number }[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      const a = inset
      const b = 1 - inset
      // Top face: row r runs back → front, column c runs left → right as seen from the front-right corner.
      stickers.push({
        points: fmt([project(c + a, r + a, n), project(c + b, r + a, n), project(c + b, r + b, n), project(c + a, r + b, n)]),
        fill: color(top, 'white', i),
        shade: 0,
      })
      // Front face (the left one on screen): plane y = n.
      const z0 = n - r
      stickers.push({
        points: fmt([project(c + a, n, z0 - a), project(c + b, n, z0 - a), project(c + b, n, z0 - b), project(c + a, n, z0 - b)]),
        fill: color(front, 'green', i),
        shade: 0.07,
      })
      // Right face: plane x = n, columns run front → back.
      const y0 = n - c
      stickers.push({
        points: fmt([project(n, y0 - a, z0 - a), project(n, y0 - b, z0 - a), project(n, y0 - b, z0 - b), project(n, y0 - a, z0 - b)]),
        fill: color(right, 'red', i),
        shade: 0.16,
      })
    }
  }

  const body = fmt([project(0, 0, n), project(n, 0, n), project(n, 0, 0), project(n, n, 0), project(0, n, 0), project(0, n, n)])
  const pad = 0.12
  const w = 2 * n * COS + pad * 2
  const h = 2 * n + pad * 2
  const height = (size * h) / w

  return (
    <svg
      width={size}
      height={height}
      viewBox={`${-n * COS - pad} ${-n - pad} ${w} ${h}`}
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <polygon
        points={body}
        fill={ghost ? 'none' : 'var(--cube-body)'}
        stroke={ghost ? 'var(--line-strong)' : 'var(--cube-body)'}
        strokeWidth={ghost ? 0.05 : 0.2}
        strokeLinejoin="round"
        strokeDasharray={ghost ? '0.16 0.14' : undefined}
      />
      {stickers.map((s, i) =>
        ghost ? (
          <polygon key={i} points={s.points} fill="var(--line)" stroke="var(--line)" strokeWidth={round} strokeLinejoin="round" />
        ) : (
          <g key={i}>
            <polygon points={s.points} fill={s.fill} stroke={s.fill} strokeWidth={round} strokeLinejoin="round" />
            {s.shade > 0 && <polygon points={s.points} fill="#000" stroke="#000" strokeWidth={round} strokeLinejoin="round" opacity={s.shade} />}
          </g>
        ),
      )}
    </svg>
  )
}
