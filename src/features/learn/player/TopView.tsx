/**
 * The top of the cube drawn flat, the way cubers draw last-layer cases: the nine stickers of the
 * top face, the side stickers of the top layer folded out round it, and — a step further out —
 * a small mark in each side centre's colour, so "does this match its centre?" can be read off
 * the picture. Crisp SVG, no WebGL; it follows the live cube.
 */
import type { CubeState, Face, SlotId } from '../../../cube'
import { SLOT_FACELETS } from '../../../cube'
import { cx } from '../../../ui'

/** Fill for each face letter of the state (the colour that face has on a solved cube). */
const FILL: Record<string, string> = {
  U: 'var(--cube-white)',
  D: 'var(--cube-yellow)',
  F: 'var(--cube-green)',
  B: 'var(--cube-blue)',
  R: 'var(--cube-red)',
  L: 'var(--cube-orange)',
}
const COLOUR_WORD: Record<string, string> = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' }

const S = 22 // sticker pitch
const GAP = 2.5
const STRIP = 9 // thickness of a folded-out side sticker
const MARK = 6 // the centre mark beyond each strip
const PAD = 3
const C = PAD + MARK + 3 + STRIP + 3 // where the top face starts
const SIZE = C * 2 + S * 3

/** The top-layer side stickers, as seen from above: back row left→right, right column back→front, … */
const SIDE: Record<'B' | 'R' | 'F' | 'L', readonly number[]> = {
  B: [47, 46, 45],
  R: [11, 10, 9],
  F: [18, 19, 20],
  L: [36, 37, 38],
}
const CENTRE: Record<Face, number> = { U: 4, R: 13, F: 22, D: 31, L: 40, B: 49 }
/** The top layer's corner stickers: the top face's corners and the ends of each side strip. */
const CORNER_FACELETS = new Set([0, 2, 6, 8, ...Object.values(SIDE).flatMap((strip) => [strip[0], strip[2]])])

export interface TopViewProps {
  state: CubeState
  /** Pixel size (square). */
  size?: number
  /** Facelets to mark with a ring (e.g. the stickers of a piece being asked about). */
  marked?: readonly number[]
  /** Slots whose top-layer stickers are drawn at full strength; the rest are faded. Omit: all full. */
  focus?: readonly SlotId[]
  /** Show the side centres' marks (default true). */
  centres?: boolean
  /**
   * `'edges'`: the corners drawn in one neutral grey and the yellow edges outlined, so the shape
   * the edges make is all there is to see (the yellow-cross shapes).
   */
  only?: 'edges'
  label?: string
  className?: string
  onPick?: (slot: SlotId) => void
}

export function TopView({ state, size = 132, marked = [], focus, centres = true, only, label, className, onPick }: TopViewProps) {
  const focused = focus ? new Set(focus.flatMap((slot) => SLOT_FACELETS[slot] ?? [])) : null
  const dim = (facelet: number) => (focused && !focused.has(facelet) ? 0.32 : 1)
  const grey = only === 'edges' ? CORNER_FACELETS : null
  const ring = new Set(only === 'edges' ? [1, 3, 5, 7, 4].filter((f) => state[f] === state[4]) : marked)
  const rects: { key: string; x: number; y: number; w: number; h: number; facelet: number }[] = []
  // The top face, row by row from the back.
  for (let i = 0; i < 9; i++) rects.push({ key: `u${i}`, x: C + (i % 3) * S, y: C + Math.floor(i / 3) * S, w: S, h: S, facelet: i })
  // Folded-out side stickers.
  SIDE.B.forEach((f, i) => rects.push({ key: `b${i}`, x: C + i * S, y: C - 3 - STRIP, w: S, h: STRIP, facelet: f }))
  SIDE.F.forEach((f, i) => rects.push({ key: `f${i}`, x: C + i * S, y: C + 3 * S + 3, w: S, h: STRIP, facelet: f }))
  SIDE.L.forEach((f, i) => rects.push({ key: `l${i}`, x: C - 3 - STRIP, y: C + i * S, w: STRIP, h: S, facelet: f }))
  SIDE.R.forEach((f, i) => rects.push({ key: `r${i}`, x: C + 3 * S + 3, y: C + i * S, w: STRIP, h: S, facelet: f }))
  const marks = [
    { face: 'B' as Face, x: C + S, y: PAD, w: S, h: MARK },
    { face: 'F' as Face, x: C + S, y: SIZE - PAD - MARK, w: S, h: MARK },
    { face: 'L' as Face, x: PAD, y: C + S, w: MARK, h: S },
    { face: 'R' as Face, x: SIZE - PAD - MARK, y: C + S, w: MARK, h: S },
  ]
  const description =
    label ??
    `The top seen from above. ${(['F', 'R', 'B', 'L'] as Face[]).map((f) => `${f === 'F' ? 'front' : f === 'R' ? 'right' : f === 'B' ? 'back' : 'left'} centre ${COLOUR_WORD[state[CENTRE[f]]]}`).join(', ')}.`
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={size}
      height={size}
      role="img"
      aria-label={description}
      className={cx('shrink-0 select-none', className)}
      data-testid="top-view"
      data-state={state}
    >
      <rect x={C - GAP * 1.2} y={C - GAP * 1.2} width={S * 3 + GAP * 2.4} height={S * 3 + GAP * 2.4} rx={5} fill="var(--cube-body)" />
      {rects.map((r) => {
        const inset = r.w === S && r.h === S ? GAP / 2 : 0.8
        return (
          <rect
            key={r.key}
            x={r.x + inset}
            y={r.y + inset}
            width={r.w - inset * 2}
            height={r.h - inset * 2}
            rx={r.w === S && r.h === S ? 3.5 : 2.2}
            fill={grey?.has(r.facelet) ? 'var(--line-strong)' : FILL[state[r.facelet]]}
            fillOpacity={dim(r.facelet)}
            stroke={ring.has(r.facelet) ? 'var(--ink)' : 'var(--cube-body)'}
            strokeOpacity={ring.has(r.facelet) ? 1 : 0.35}
            strokeWidth={ring.has(r.facelet) ? 2 : 0.6}
          />
        )
      })}
      {centres &&
        marks.map((m) => <rect key={m.face} x={m.x} y={m.y} width={m.w} height={m.h} rx={2} fill={FILL[state[CENTRE[m.face]]]} stroke="var(--cube-body)" strokeOpacity={0.35} strokeWidth={0.6} />)}
      {onPick &&
        (['ULB', 'UBR', 'UFL', 'URF'] as SlotId[]).map((slot) => {
          const col = slot.includes('L') ? 0 : 2
          const row = slot.includes('B') ? 0 : 2
          return (
            <rect
              key={slot}
              x={C + col * S - 6}
              y={C + row * S - 6}
              width={S + 12}
              height={S + 12}
              fill="transparent"
              className="cursor-pointer"
              onClick={() => onPick(slot)}
            />
          )
        })}
    </svg>
  )
}

/** The four yellow-cross shapes, each drawn from a real cube, side by side. */
export function TopViewLegend({
  items,
  size = 112,
  active,
  row = false,
  onPick,
}: {
  items: readonly { id: string; label: string; state: CubeState }[]
  size?: number
  active?: string | null
  /** All four in one row (under the cube on a tablet). */
  row?: boolean
  onPick?: (id: string) => void
}) {
  return (
    <div className={cx('grid gap-2', row ? 'grid-cols-4' : 'grid-cols-2 min-[560px]:max-[899px]:grid-cols-4')} data-testid="shape-tiles">
      {items.map((item) => {
        const body = (
          <>
            <TopView state={item.state} size={size} centres={false} only="edges" label={`${item.label}, seen from above: only the edges count`} className="max-w-full" />
            <span className="text-sm font-bold text-ink">{item.label}</span>
          </>
        )
        return onPick ? (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item.id)}
            aria-pressed={active === item.id}
            className={cx(
              'flex min-h-11 flex-col items-center gap-1.5 rounded-md p-1.5 transition-colors duration-150',
              active === item.id ? 'bg-accent-soft ring-2 ring-accent' : 'bg-inset hover:bg-surface hover:ring-1 hover:ring-line-strong',
            )}
            data-testid={`shape-${item.id}`}
          >
            {body}
          </button>
        ) : (
          <div key={item.id} className="flex flex-col items-center gap-1.5 rounded-md bg-inset p-1.5">
            {body}
          </div>
        )
      })}
    </div>
  )
}
