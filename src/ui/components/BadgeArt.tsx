/**
 * Badge art — every badge is a designed object, drawn in one system (DESIGN.md S7):
 *
 *   • Shape by family:  learning = a cube face (rounded square) · solving = a hexagon (the cube's
 *     silhouette) · speed = a stopwatch · streak = a shield · skills = an octagon.
 *   • The motif is cube stuff: the stage badges show that stage's goal as a sticker grid seen from
 *     above (the daisy is a daisy), solves show the cube, speed shows the time to beat, notation
 *     shows the letters.
 *   • Tier: 1 a white keycap · 2 a white keycap with a yellow (reward) rim · 3 a yellow keycap.
 *     Small yellow pips under the motif count the tier.
 *   • Locked: the same silhouette sunk into the page (dashed outline, motif in grey).
 *
 *   <BadgeArt badge={getBadge('stage-daisy')!} earned size={96} />
 */
import { useId, type CSSProperties, type ReactNode } from 'react'
import type { BadgeCategory, BadgeDef } from '../../store/badges'
import type { CubeColor } from '../../store/stages'
import { cx } from '../cx'
import { IsoCube, SCRAMBLED_FACES } from './IsoCube'

export type BadgeTier = 1 | 2 | 3

export interface BadgeArtProps {
  badge: Pick<BadgeDef, 'id' | 'category' | 'name'>
  earned?: boolean
  /** Pixel width. Height is 8% more (the keycap edge). */
  size?: number
  className?: string
  style?: CSSProperties
  /** Decorative by default (the badge name is usually next to it). */
  title?: string
  /** Draw this text as the motif instead of the badge's own (a personal best's time on a stopwatch). */
  text?: string
  /** Override the tier (a personal best is always gold). */
  tier?: BadgeTier
}

const TIERS: Record<string, BadgeTier> = {
  'full-method': 3,
  'stage-yellow-corners-orient': 2,
  'solves-50': 2,
  'solves-100': 3,
  'real-deal': 2,
  'sub-2': 2,
  'sub-1': 3,
  'streak-7': 2,
  'streak-30': 3,
  'notation-master': 2,
  'algorithm-ace': 2,
  'pattern-curator': 2,
  'level-5': 2,
  'level-10': 3,
}

export const badgeTier = (id: string): BadgeTier => TIERS[id] ?? 1

// ───────────────────────── Shapes (100 × 100 box) ─────────────────────────

const SHAPES: Record<BadgeCategory, string> = {
  learning: 'M26 5h48a21 21 0 0 1 21 21v48a21 21 0 0 1-21 21H26A21 21 0 0 1 5 74V26A21 21 0 0 1 26 5z',
  solving: 'M44.5 4.2a11 11 0 0 1 11 0l32.3 18.6a11 11 0 0 1 5.5 9.5v35.4a11 11 0 0 1-5.5 9.5L55.5 95.8a11 11 0 0 1-11 0L12.2 77.2a11 11 0 0 1-5.5-9.5V32.3a11 11 0 0 1 5.5-9.5z',
  speed: 'M42 2h16a4 4 0 0 1 0 8h-3v3.4A43 43 0 1 1 45 13.4V10h-3a4 4 0 0 1 0-8z',
  streak: 'M50 3.5 86 14a6 6 0 0 1 4.3 5.8V48c0 25-17.4 40.6-38 47.8a7 7 0 0 1-4.6 0C27.1 88.6 9.7 73 9.7 48V19.8A6 6 0 0 1 14 14z',
  skills: 'M35 4h30a9 9 0 0 1 6.4 2.6l21 21A9 9 0 0 1 95 34v32a9 9 0 0 1-2.6 6.4l-21 21A9 9 0 0 1 65 96H35a9 9 0 0 1-6.4-2.6l-21-21A9 9 0 0 1 5 66V34a9 9 0 0 1 2.6-6.4l21-21A9 9 0 0 1 35 4z',
}

/** Where the motif sits inside each shape (its centre y; the stopwatch's dial is lower). */
const MOTIF_Y: Record<BadgeCategory, number> = { learning: 50, solving: 50, speed: 56, streak: 47, skills: 50 }

// ───────────────────────── Motifs ─────────────────────────

type Cell = CubeColor | null
const W: Cell = 'white'
const Y: Cell = 'yellow'
const _: Cell = null

/** Stage goals as seen from above (row by row), plus the side stickers that touch the top layer. */
interface FaceMotif {
  cells: Cell[]
  /** Side strips (top, right, bottom, left), three stickers each, or none. */
  sides?: [Cell[], Cell[], Cell[], Cell[]]
  /** Draw these cells as outlines only ("in place, not yet twisted"). */
  hollow?: number[]
}

const B: Cell = 'blue'
const R: Cell = 'red'
const G: Cell = 'green'
const O: Cell = 'orange'

const FACES: Record<string, FaceMotif> = {
  'first-steps': { cells: [_, _, _, _, W, _, _, _, _] },
  'stage-daisy': { cells: [_, W, _, W, Y, W, _, W, _] },
  'stage-white-cross': { cells: [_, W, _, W, W, W, _, W, _], sides: [[_, B, _], [_, R, _], [_, G, _], [_, O, _]] },
  'stage-white-corners': { cells: [W, W, W, W, W, W, W, W, W], sides: [[B, B, B], [R, R, R], [G, G, G], [O, O, O]] },
  'stage-middle-layer': { cells: [_, _, _, G, G, G, G, G, G] },
  'stage-yellow-cross': { cells: [_, Y, _, Y, Y, Y, _, Y, _] },
  'stage-yellow-edges': { cells: [_, Y, _, Y, Y, Y, _, Y, _], sides: [[_, B, _], [_, R, _], [_, G, _], [_, O, _]] },
  'stage-yellow-corners-position': { cells: [Y, Y, Y, Y, Y, Y, Y, Y, Y], hollow: [0, 2, 6, 8], sides: [[_, B, _], [_, R, _], [_, G, _], [_, O, _]] },
  'stage-yellow-corners-orient': { cells: [Y, Y, Y, Y, Y, Y, Y, Y, Y], sides: [[B, B, B], [R, R, R], [G, G, G], [O, O, O]] },
  'pattern-collector': { cells: [G, W, G, W, G, W, G, W, G] },
  'pattern-curator': { cells: [R, R, R, R, B, R, R, R, R] },
}

/** Text motifs: the number or the moves the badge is about. */
const TEXTS: Record<string, { text: string; mono?: boolean; sub?: string }> = {
  'solves-10': { text: '10', sub: 'SOLVES' },
  'solves-50': { text: '50', sub: 'SOLVES' },
  'solves-100': { text: '100', sub: 'SOLVES' },
  'sub-5': { text: '5:00', mono: true },
  'sub-3': { text: '3:00', mono: true },
  'sub-2': { text: '2:00', mono: true },
  'sub-1': { text: '0:59', mono: true },
  'streak-3': { text: '3', sub: 'DAYS' },
  'streak-7': { text: '7', sub: 'DAYS' },
  'streak-30': { text: '30', sub: 'DAYS' },
  'daily-5': { text: '5', sub: 'DAILIES' },
  'notation-rookie': { text: 'R′', mono: true },
  'notation-master': { text: 'RUR′', mono: true },
  'algorithm-ace': { text: '×10', sub: 'ALGS' },
  'level-5': { text: '5', sub: 'LEVEL' },
  'level-10': { text: '10', sub: 'LEVEL' },
}

const fillOf = (cell: Cell, lit: boolean): string => (cell ? (lit ? `var(--cube-${cell})` : 'var(--line-strong)') : lit ? 'color-mix(in oklab, var(--cube-body) 72%, #8a8d96)' : 'var(--line)')

function FaceGrid({ motif, lit, cy }: { motif: FaceMotif; lit: boolean; cy: number }) {
  const hasSides = Boolean(motif.sides)
  const cell = hasSides ? 13 : 16
  const gap = 2
  const span = cell * 3 + gap * 4
  const x0 = 50 - span / 2
  const y0 = cy - span / 2
  const out: ReactNode[] = []
  out.push(<rect key="plate" x={x0} y={y0} width={span} height={span} rx={6} style={{ fill: lit ? 'var(--cube-body)' : 'var(--line-strong)', opacity: lit ? 1 : 0.55 }} />)
  motif.cells.forEach((c, i) => {
    const x = x0 + gap + (i % 3) * (cell + gap)
    const y = y0 + gap + Math.floor(i / 3) * (cell + gap)
    const hollow = motif.hollow?.includes(i)
    out.push(
      <rect
        key={i}
        x={x + (hollow ? 1.2 : 0)}
        y={y + (hollow ? 1.2 : 0)}
        width={cell - (hollow ? 2.4 : 0)}
        height={cell - (hollow ? 2.4 : 0)}
        rx={3}
        style={hollow ? { fill: 'none', stroke: fillOf(c, lit), strokeWidth: 2.4 } : { fill: fillOf(c, lit) }}
      />,
    )
  })
  if (motif.sides) {
    const t = 4.5 // strip thickness
    motif.sides.forEach((strip, side) => {
      strip.forEach((c, k) => {
        if (!c) return
        const along = x0 + gap + k * (cell + gap)
        const alongY = y0 + gap + k * (cell + gap)
        const pos =
          side === 0
            ? { x: along, y: y0 - t - 2, w: cell, h: t }
            : side === 1
              ? { x: x0 + span + 2, y: alongY, w: t, h: cell }
              : side === 2
                ? { x: along, y: y0 + span + 2, w: cell, h: t }
                : { x: x0 - t - 2, y: alongY, w: t, h: cell }
        out.push(<rect key={`s${side}${k}`} x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx={1.6} style={{ fill: fillOf(c, lit) }} />)
      })
    })
  }
  return <g>{out}</g>
}

/** A small isometric cube for the solving family (the same drawing as the logo and stand-ins). */
function IsoMotif({ lit, scrambled, cy }: { lit: boolean; scrambled: boolean; cy: number }) {
  const w = 56
  const h = w * 1.155
  return (
    <svg x={50 - w / 2} y={cy - h / 2} width={w} height={h} overflow="visible">
      <IsoCube size={w} ghost={!lit} {...(scrambled ? SCRAMBLED_FACES : {})} />
    </svg>
  )
}

function TextMotif({ text, mono, sub, lit, cy, gold }: { text: string; mono?: boolean; sub?: string; lit: boolean; cy: number; gold: boolean }) {
  const ink = lit ? 'var(--on-yellow)' : 'var(--ink-faint)'
  const long = text.length >= 4
  // Long times ("1:04.53") shrink to stay inside the dial.
  const fontSize = mono ? (long ? Math.min(21, 64 / (text.length * 0.6)) : 34) : text.length >= 3 ? 30 : 40
  return (
    <g style={{ fill: ink }}>
      <text
        x={50}
        y={cy + (sub ? 4 : fontSize * 0.36)}
        textAnchor="middle"
        style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)', fontWeight: 800, fontSize, letterSpacing: mono ? '-0.04em' : '-0.04em' }}
      >
        {text}
      </text>
      {sub && (
        <text x={50} y={cy + 19} textAnchor="middle" style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 9, letterSpacing: '0.14em', opacity: gold ? 0.8 : 0.62 }}>
          {sub}
        </text>
      )}
    </g>
  )
}

/** Stopwatch ticks round the dial. */
function Ticks({ lit }: { lit: boolean }) {
  const out: ReactNode[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const r1 = 35.5
    const r2 = i % 3 === 0 ? 30.5 : 32.5
    out.push(
      <line
        key={i}
        x1={50 + Math.sin(a) * r1}
        y1={56 - Math.cos(a) * r1}
        x2={50 + Math.sin(a) * r2}
        y2={56 - Math.cos(a) * r2}
        style={{ stroke: lit ? 'var(--on-yellow)' : 'var(--ink-faint)', strokeWidth: 2, strokeLinecap: 'round', opacity: 0.45 }}
      />,
    )
  }
  return <g>{out}</g>
}

function Motif({ badge, lit, gold, override }: { badge: BadgeArtProps['badge']; lit: boolean; gold: boolean; override?: string }) {
  const cy = MOTIF_Y[badge.category]
  if (override !== undefined)
    return (
      <>
        {badge.category === 'speed' && <Ticks lit={lit} />}
        <TextMotif text={override} mono lit={lit} cy={cy} gold={gold} />
      </>
    )
  const face = FACES[badge.id]
  if (face) return <FaceGrid motif={face} lit={lit} cy={cy} />
  if (badge.id === 'first-solve' || badge.id === 'real-deal' || badge.id === 'full-method') return <IsoMotif lit={lit} scrambled={badge.id === 'real-deal'} cy={cy - 1} />
  const text = TEXTS[badge.id]
  if (text)
    return (
      <>
        {badge.category === 'speed' && <Ticks lit={lit} />}
        <TextMotif {...text} lit={lit} cy={cy} gold={gold} />
      </>
    )
  // Unknown badge: its initial.
  return <TextMotif text={badge.name.slice(0, 1)} lit={lit} cy={cy} gold={gold} />
}

export function BadgeArt({ badge, earned = true, size = 72, className, style, title, text, tier: tierOverride }: BadgeArtProps) {
  const uid = useId().replace(/:/g, '')
  const tier = tierOverride ?? badgeTier(badge.id)
  const gold = earned && tier === 3
  const shape = SHAPES[badge.category] ?? SHAPES.learning
  const face = gold ? 'var(--cube-yellow)' : 'var(--cube-white)'
  const edge = gold ? 'var(--cube-yellow-edge)' : 'var(--cube-white-edge)'
  return (
    <svg
      viewBox="0 -2 100 112"
      width={size}
      height={size * 1.12}
      className={cx('shrink-0 overflow-visible', className)}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-badge-art={badge.id}
      data-earned={earned}
      data-tier={tier}
    >
      <defs>
        <clipPath id={`clip-${uid}`}>
          <path d={shape} />
        </clipPath>
      </defs>
      {earned ? (
        <>
          {/* the keycap edge */}
          <path d={shape} transform="translate(0 6)" style={{ fill: edge }} />
          <path d={shape} style={{ fill: face, stroke: 'var(--sticker-outline)', strokeWidth: 1 }} />
          {/* a soft top-light on the face */}
          <g clipPath={`url(#clip-${uid})`}>
            <rect x={0} y={0} width={100} height={8} style={{ fill: 'white', opacity: gold ? 0.28 : 0.5 }} />
          </g>
          {tier === 2 && <path d={shape} transform="translate(50 50) scale(0.86) translate(-50 -50)" style={{ fill: 'none', stroke: 'var(--cube-yellow)', strokeWidth: 4.5 }} />}
        </>
      ) : (
        <path d={shape} transform="translate(0 3)" style={{ fill: 'var(--inset)', stroke: 'var(--line-strong)', strokeWidth: 2, strokeDasharray: '5 4' }} />
      )}
      <g transform={earned ? undefined : 'translate(0 3)'} style={{ opacity: earned ? 1 : 0.85 }}>
        <Motif badge={badge} lit={earned} gold={gold} override={text} />
      </g>
      {earned && (
        <g aria-hidden="true">
          {Array.from({ length: tier }, (_, i) => {
            const w = 6
            const x = 50 - (tier * w + (tier - 1) * 3) / 2 + i * (w + 3)
            const y = badge.category === 'streak' ? 84 : badge.category === 'speed' ? 88 : 86
            return <rect key={i} x={x} y={y} width={w} height={w} rx={1.6} style={{ fill: gold ? 'var(--on-yellow)' : 'var(--cube-yellow)', stroke: gold ? 'none' : 'var(--cube-yellow-edge)', strokeWidth: 0.8, opacity: gold ? 0.55 : 1 }} />
          })}
        </g>
      )}
    </svg>
  )
}
