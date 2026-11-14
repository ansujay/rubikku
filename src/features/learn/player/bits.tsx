/** Small shared pieces of the lesson player. */
import { motion } from 'motion/react'
import { describeMove, getAlgorithm, HOLD_WORDS, isRotation, type CubeAnalysis, type Move } from '../../../cube'
import { MiniCube } from '../../../three'
import { Card, cx, Icon, MoveSequence, springs, type IconName } from '../../../ui'
import type { PlaySegment, ResolvedPlay } from '../engine'
import { HELD } from '../engine'
import { RichText } from './RichText'
import { applyAlg } from '../../../cube'

/** Whole-cube turns in words (shared with the coach, Free play and Solve: `HOLD_WORDS` in the engine). */
export const ROTATION_WORDS = HOLD_WORDS

/** "Right face, clockwise. The right side goes up." */
export function MoveLine({ move, className }: { move: Move; className?: string }) {
  const d = ROTATION_WORDS[move] ?? describeMove(move)
  return (
    <p className={cx('text-sm leading-snug text-ink-muted', className)} data-testid="move-line">
      <span className="font-bold text-ink">{d.text.replace('counter-clockwise', 'anticlockwise')}.</span> {d.detail}
    </p>
  )
}

/** A whole-cube turn as a chip: an icon and words, not a letter. */
export function TurnChip({ move, state = 'upcoming', size = 'md' }: { move: Move; state?: 'upcoming' | 'active' | 'done'; size?: 'sm' | 'md' | 'lg' }) {
  const words = HOLD_WORDS[move]?.short ?? 'Turn the cube'
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-sm font-bold whitespace-nowrap transition-colors duration-150',
        size === 'lg' ? 'h-14 px-3.5 text-base' : size === 'md' ? 'h-10 px-2.5 text-sm' : 'h-8 px-2 text-xs',
        state === 'active' ? 'bg-accent-soft text-accent-text ring-2 ring-inset ring-accent' : state === 'done' ? 'bg-inset text-ink-faint' : 'bg-surface text-ink ring-1 ring-inset ring-line-strong',
      )}
      data-state={state}
      data-move={move}
      aria-label={ROTATION_WORDS[move]?.text ?? 'Turn the whole cube'}
    >
      <Icon name="rotateCw" size={size === 'lg' ? 20 : 16} weight={2.4} className={cx(move === "y'" && '-scale-x-100')} />
      {words}
    </span>
  )
}

/** The moves of a play, grouped into its segments, lighting up as they are done. */
export function SegmentedMoves({
  play,
  position,
  active,
  onSeek,
  showLabels = true,
}: {
  play: Pick<ResolvedPlay, 'moves' | 'segments'>
  /** Moves done so far. */
  position: number
  /** The move to show as "now" (animating, or next). Default: `position`. */
  active?: number
  onSeek?: (position: number) => void
  showLabels?: boolean
}) {
  const now = active ?? position
  const size = play.moves.length > 12 ? 'sm' : 'md'
  const labelled = showLabels && play.segments.length > 1
  return (
    <div className="flex flex-col gap-3" data-testid="moves" data-position={position} data-total={play.moves.length}>
      {play.segments.map((segment, i) => {
        const local = now - segment.start
        return (
          <div key={i} className="flex flex-col gap-1.5">
            {labelled && <p className="text-xs font-bold text-ink-faint">{segment.label}</p>}
            {segment.moves.every(isRotation) ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={segment.label}>
                {segment.moves.map((move, k) => (
                  <TurnChip key={k} move={move} size={size === 'sm' ? 'sm' : 'md'} state={local > k ? 'done' : local === k ? 'active' : 'upcoming'} />
                ))}
              </div>
            ) : (
              <MoveSequence
                moves={segment.moves}
                size={size}
                activeIndex={local < 0 ? undefined : Math.min(local, segment.moves.length)}
                onMoveClick={onSeek ? (index) => onSeek(segment.start + index + 1) : undefined}
                label={segment.label}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The steps of a play by name only: done, current (with a count), still to come. */
export function SegmentNames({ segments, position }: { segments: readonly PlaySegment[]; position: number }) {
  return (
    <ol className="flex flex-col gap-1.5" data-testid="segment-names">
      {segments.map((segment, i) => {
        const done = position >= segment.start + segment.moves.length
        const current = !done && position >= segment.start
        const made = Math.max(0, position - segment.start)
        return (
          <li
            key={i}
            aria-current={current ? 'step' : undefined}
            className={cx(
              'flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-semibold transition-colors duration-150',
              current ? 'bg-accent-soft text-ink' : done ? 'text-ink-faint' : 'text-ink-muted',
            )}
          >
            <span
              className={cx(
                'flex size-5.5 shrink-0 items-center justify-center rounded-[7px] text-2xs font-extrabold',
                done ? 'bg-cube-green text-on-green' : current ? 'bg-accent text-accent-ink' : 'bg-inset text-ink-faint ring-1 ring-inset ring-line',
              )}
            >
              {done ? <Icon name="check" size={12} weight={3} /> : i + 1}
            </span>
            <span className="min-w-0 grow">{segment.label}</span>
            {current && (
              <span className="flex shrink-0 gap-1" aria-label={`${made} of ${segment.moves.length} moves`}>
                {segment.moves.map((_, k) => (
                  <span key={k} className={cx('size-1.5 rounded-full', k < made ? 'bg-accent' : 'bg-line-strong')} />
                ))}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Name, moves, mnemonic and finger hint of an algorithm — the compact note under a demo. */
export function AlgorithmNote({ id }: { id: string }) {
  const algorithm = getAlgorithm(id)
  if (!algorithm) return null
  return (
    <Card variant="inset" padding="sm" className="flex flex-col gap-2 p-3.5!" data-testid="algorithm-note">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-bold text-ink">{algorithm.name}</h3>
        <span className="font-mono text-sm font-semibold text-ink-muted">{algorithm.alg.replace(/'/g, '′')}</span>
      </div>
      <NoteLine icon="sparkle" label="Remember it">
        {algorithm.mnemonic}
      </NoteLine>
      <NoteLine icon="target" label="Fingers">
        {algorithm.fingerHint}
      </NoteLine>
      {algorithm.repeat && (
        <NoteLine icon="restart" label="Repeat">
          {algorithm.repeat}
        </NoteLine>
      )}
    </Card>
  )
}

function NoteLine({ icon, label, children }: { icon: IconName; label: string; children: string }) {
  return (
    <p className="flex gap-2 text-sm leading-snug text-ink-muted">
      <Icon name={icon} size={15} className="mt-0.5 shrink-0 text-ink-faint" />
      <span>
        <span className="font-bold text-ink">{label}:</span> <RichText text={children.replace(/'/g, '′')} />
      </span>
    </p>
  )
}

/** A full algorithm card for the wrap-up: a mini cube playing it, the moves, when to use it. */
export function AlgorithmCard({ id }: { id: string }) {
  const algorithm = getAlgorithm(id)
  if (!algorithm) return null
  return (
    <Card as="li" variant="flat" padding="sm" className="flex gap-3.5 p-3.5!">
      <div className="w-20 shrink-0">
        <MiniCube state={applyAlg(HELD, algorithm.demo.setup)} alg={algorithm.demo.alg} play="hover" label={`${algorithm.name}, playing`} />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-ink">{algorithm.name}</h3>
        <MoveSequence moves={algorithm.alg} size="sm" className="mt-1.5" label={`${algorithm.name} moves`} />
        <p className="mt-2 text-sm leading-snug text-ink-muted">{algorithm.mnemonic.replace(/'/g, '′')}</p>
      </div>
    </Card>
  )
}

/**
 * The corner-twist meter: six pips, one per Corner Twist. While the lower layers are "borrowed"
 * it shows how many twists are in, and that they come back when it is full.
 */
export function TwistMeter({ analysis }: { analysis: CubeAnalysis }) {
  const twist = analysis.twistInProgress
  if (!twist) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className="pointer-events-none flex flex-col gap-1.5 rounded-sm border border-line bg-surface/92 px-3 py-2 shadow-1"
      data-testid="twist-meter"
      data-twists={twist.twistsDone}
      role="status"
    >
      <p className="text-xs font-bold text-ink">Bottom layers borrowed</p>
      <div className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={cx('h-2 w-5 rounded-[3px] transition-colors duration-200', i < twist.twistsDone ? 'bg-cube-yellow' : 'bg-inset ring-1 ring-inset ring-line-strong')} />
        ))}
      </div>
      <p className="text-2xs font-semibold text-ink-muted">
        Back in {twist.twistsToRestore} more {twist.twistsToRestore === 1 ? 'twist' : 'twists'}
      </p>
    </motion.div>
  )
}
