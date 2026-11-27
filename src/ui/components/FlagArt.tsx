import { useId } from 'react'
import { cx } from '../cx'

import { FLAG_PALETTE, type FlagPaletteName } from '../flagPalette'

/** A palette name (preferred) or any CSS colour. */
export type FlagColor = FlagPaletteName | (string & {})

/**
 * What a flag looks like, declaratively. Flags are drawn 3:2 (30x20); `square` flags sit in the middle.
 *  - bands: stripes (`dir` 'h' = stacked, 'v' = side by side), optional `ratios`, plus a centred
 *    `disc` (Laos) or a `chakra` ring with spokes (India).
 *  - disc: plain field with a round disc; `offset` shifts it along the flag's width
 *    (negative = towards the hoist, e.g. Palau -0.05); `r` is the radius as a fraction of height.
 *  - cross: `nordic` puts the cross off-centre towards the hoist; `short` stops the arms short of
 *    the edge (Switzerland, with `square`).
 *  - saltire: diagonal cross (Scotland).
 *  - brazil: green field, yellow diamond, blue globe with its white band.
 */
export type FlagArtSpec =
  | { kind: 'bands'; dir: 'h' | 'v'; colors: FlagColor[]; ratios?: number[]; disc?: FlagColor; chakra?: FlagColor }
  | { kind: 'disc'; field: FlagColor; disc: FlagColor; offset?: number; r?: number }
  | { kind: 'cross'; field: FlagColor; cross: FlagColor; nordic?: boolean; short?: boolean; square?: boolean }
  | { kind: 'saltire'; field: FlagColor; cross: FlagColor }
  | { kind: 'brazil' }

export interface FlagArtProps {
  spec: FlagArtSpec
  /** Width in px. Leave out to fill the width of the parent. */
  size?: number
  /** Accessible name, e.g. "Flag of India". Default "Flag". */
  label?: string
  className?: string
}

const W = 30
const H = 20
const color = (c: FlagColor): string => (c in FLAG_PALETTE ? FLAG_PALETTE[c as FlagPaletteName] : c)

function Chakra({ cx: x, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12
    return <line key={i} x1={x} y1={cy} x2={x + Math.cos(a) * r} y2={cy + Math.sin(a) * r} />
  })
  return (
    <g stroke={fill} strokeWidth={0.35} fill="none">
      <circle cx={x} cy={cy} r={r} strokeWidth={0.6} />
      {spokes}
      <circle cx={x} cy={cy} r={r * 0.22} fill={fill} />
    </g>
  )
}

/**
 * The real flag as inline SVG, with a hairline border so white flags read on both themes.
 *
 *   <FlagArt spec={{ kind: 'disc', field: 'white', disc: 'red' }} size={72} label="Flag of Japan" />
 */
export function FlagArt({ spec, size, label = 'Flag', className }: FlagArtProps) {
  const clipId = useId()
  const square = spec.kind === 'cross' && spec.square
  const w = square ? H : W
  const x0 = (W - w) / 2
  const cxm = x0 + w / 2
  let body: React.ReactNode = null

  if (spec.kind === 'bands') {
    const ratios = spec.ratios ?? spec.colors.map(() => 1)
    const total = ratios.reduce((a, b) => a + b, 0)
    const horizontal = spec.dir === 'h'
    const bands = spec.colors.map((c, i) => {
      const unit = (horizontal ? H : W) / total
      const at = ratios.slice(0, i).reduce((a, b) => a + b, 0) * unit
      const part = ratios[i]! * unit
      const rect = horizontal ? <rect key={i} x={0} y={at} width={W} height={part + 0.05} fill={color(c)} /> : <rect key={i} x={at} y={0} width={part + 0.05} height={H} fill={color(c)} />
      return rect
    })
    body = (
      <>
        {bands}
        {spec.disc && <circle cx={W / 2} cy={H / 2} r={H * 0.2} fill={color(spec.disc)} />}
        {spec.chakra && <Chakra cx={W / 2} cy={H / 2} r={H * 0.15} fill={color(spec.chakra)} />}
      </>
    )
  } else if (spec.kind === 'disc') {
    body = (
      <>
        <rect width={W} height={H} fill={color(spec.field)} />
        <circle cx={W / 2 + (spec.offset ?? 0) * W} cy={H / 2} r={(spec.r ?? 0.3) * H} fill={color(spec.disc)} />
      </>
    )
  } else if (spec.kind === 'cross') {
    const t = spec.short ? w * 0.19 : H * 0.2
    const vx = spec.nordic ? x0 + w * 0.36 : cxm
    const len = spec.short ? w * 0.62 : undefined
    body = (
      <>
        <rect x={x0} width={w} height={H} fill={color(spec.field)} />
        <rect x={len ? cxm - len / 2 : x0} y={H / 2 - t / 2} width={len ?? w} height={t} fill={color(spec.cross)} />
        <rect x={vx - t / 2} y={len ? H / 2 - len / 2 : 0} width={t} height={len ?? H} fill={color(spec.cross)} />
      </>
    )
  } else if (spec.kind === 'saltire') {
    body = (
      <>
        <rect width={W} height={H} fill={color(spec.field)} />
        <path d={`M0 0L${W} ${H}M${W} 0L0 ${H}`} stroke={color(spec.cross)} strokeWidth={3.6} fill="none" />
      </>
    )
  } else {
    const r = H * 0.25
    body = (
      <>
        <rect width={W} height={H} fill={color('brazilGreen')} />
        <path d={`M${W * 0.085} ${H / 2}L${W / 2} ${H * 0.086}L${W * 0.915} ${H / 2}L${W / 2} ${H * 0.914}Z`} fill={color('brazilYellow')} />
        <circle cx={W / 2} cy={H / 2} r={r} fill={color('navy')} />
        <path
          d={`M${W / 2 - r} ${H / 2 + r * 0.15}Q${W / 2} ${H / 2 - r * 0.55} ${W / 2 + r} ${H / 2 + r * 0.45}`}
          stroke={color('white')}
          strokeWidth={r * 0.28}
          fill="none"
          clipPath={`url(#${clipId}-globe)`}
        />
      </>
    )
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${W} ${H}`}
      className={cx('block aspect-[3/2] shrink-0', size === undefined && 'w-full', className)}
      style={size !== undefined ? { width: size } : undefined}
    >
      <defs>
        <clipPath id={`${clipId}-flag`}>
          <rect x={x0} width={w} height={H} rx={1.2} />
        </clipPath>
        <clipPath id={`${clipId}-globe`}>
          <circle cx={W / 2} cy={H / 2} r={H * 0.25} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId}-flag)`}>{body}</g>
      <rect x={x0} width={w} height={H} rx={1.2} fill="none" stroke="var(--line-strong)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
