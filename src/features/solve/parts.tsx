/**
 * Small shared pieces of the "Solve my cube" page: the flow steps, the
 * hold line ("yellow on top, red facing you") and the tilt picture for guided entry.
 */
import type { Color, Face } from '../../cube'
import { CubeSwatch, cx, Icon, IsoCube, type IsoFace } from '../../ui'

// ───────────────────────── Flow steps (1 Colours · 2 Check · 3 Where am I? · 4 Solve) ─────────────────────────

export type FlowStep = 0 | 1 | 2 | 3
const FLOW = ['Colours', 'Check', 'Where am I?', 'Solve']

export function FlowSteps({ current, last = 3 }: { current: FlowStep; last?: FlowStep }) {
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Steps">
      {FLOW.slice(0, last + 1).map((label, i) => {
        const done = i < current
        const now = i === current
        return (
          <li key={label} className="flex items-center gap-1.5 sm:gap-2" aria-current={now ? 'step' : undefined}>
            {i > 0 && <span className={cx('h-0.5 w-3 rounded-full sm:w-5', done || now ? 'bg-ink-faint' : 'bg-line-strong')} aria-hidden="true" />}
            <span
              className={cx(
                'inline-flex h-7 items-center gap-1.5 rounded-[9px] px-2 text-xs font-bold transition-colors duration-200',
                now ? 'bg-accent text-accent-ink' : done ? 'bg-cube-green-soft text-cube-green-text' : 'bg-inset text-ink-faint',
              )}
            >
              {done ? <Icon name="check" size={13} weight={3} /> : <span className="num">{i + 1}</span>}
              <span className={cx(!now && 'max-sm:sr-only')}>{label}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ───────────────────────── Hold line ─────────────────────────

/** "white on top · green facing you" with swatches — how the cube is held. */
export function HoldLine({ top, front, className }: { top: Color; front: Color; className?: string }) {
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-bold text-ink', className)} data-testid="hold-line" data-top={top} data-front={front}>
      <span className="inline-flex items-center gap-1.5">
        <CubeSwatch color={top} size="sm" showLetter />
        {top} on top
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CubeSwatch color={front} size="sm" showLetter />
        {front} facing you
      </span>
    </span>
  )
}

// ───────────────────────── Tilt picture ─────────────────────────

const full = (color: Color): IsoFace => new Array<Color>(9).fill(color)

/**
 * A little drawing of the gesture for one face in guided entry: the cube in the home hold with
 * an arrow showing how to move it. (The drawn cube shows top, front and right; the arrow says
 * which way the whole cube goes.)
 */
export function TiltPicture({ face, centres, className }: { face: Face; centres: Readonly<Record<Face, Color | null>>; className?: string }) {
  const color = (f: Face, fallback: Color): Color => centres[f] ?? fallback
  const caption: Record<Face, string> = {
    U: 'Tip it towards you',
    F: 'Look straight at it',
    R: 'Quarter turn',
    B: 'Quarter turn again',
    L: 'And once more',
    D: 'Tip it away from you',
  }
  // Arrow paths in a 100 × 100 box laid over the drawing.
  const arrows: Record<Face, { d: string; head: string } | null> = {
    U: { d: 'M 50 6 C 30 10, 22 30, 26 52', head: 'M 18 43 L 26 54 L 35 44' },
    D: { d: 'M 26 92 C 6 78, 6 52, 22 36', head: 'M 11 39 L 23 34 L 25 47' },
    F: null,
    R: { d: 'M 90 78 C 70 100, 34 100, 12 80', head: 'M 13 93 L 10 78 L 25 80' },
    B: { d: 'M 90 78 C 70 100, 34 100, 12 80', head: 'M 13 93 L 10 78 L 25 80' },
    L: { d: 'M 90 78 C 70 100, 34 100, 12 80', head: 'M 13 93 L 10 78 L 25 80' },
  }
  const arrow = arrows[face]
  return (
    <figure className={cx('flex w-24 shrink-0 flex-col items-center gap-1', className)} aria-hidden="true">
      <div className="relative size-[5.5rem]">
        <div className="absolute inset-0 grid place-items-center">
          <IsoCube size={62} top={full(color('U', 'white'))} front={full(color('F', 'green'))} right={full(color('R', 'red'))} />
        </div>
        {arrow ? (
          <svg viewBox="0 0 100 100" className="absolute inset-0 size-full text-accent-text" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
            <path d={arrow.d} />
            <path d={arrow.head} />
          </svg>
        ) : (
          <span className="absolute -bottom-0.5 left-0 flex size-7 items-center justify-center rounded-full bg-surface text-accent-text shadow-1 ring-1 ring-line">
            <Icon name="eye" size={16} />
          </span>
        )}
      </div>
      <figcaption className="text-center text-2xs leading-3 font-bold tracking-wide text-ink-faint uppercase">{caption[face]}</figcaption>
    </figure>
  )
}
