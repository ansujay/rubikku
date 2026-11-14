import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Badge, Button, Card, cx, Kbd, SegmentedControl, springs } from '../../../ui'
import { formatSolve, spokenTime } from '../logic/format'
import type { TimerMachine } from '../logic/machine'
import { countsForRecords, RECORD_FLOOR_MS, resultMs, type Penalty, type Solve } from '../logic/solves'
import type { TimerEngine } from '../useTimerEngine'

const PENALTY_ITEMS: { value: Penalty; label: string; ariaLabel: string }[] = [
  { value: 'ok', label: 'OK', ariaLabel: 'OK, no penalty' },
  { value: '+2', label: '+2', ariaLabel: 'Plus 2 seconds' },
  { value: 'dnf', label: 'DNF', ariaLabel: 'Did not finish' },
]

export interface TimerPadProps {
  machine: TimerMachine
  padProps: TimerEngine['padProps']
  inspection: boolean
  /** The solve just finished, if it is still on show. */
  last: Solve | null
  lastIsBest: boolean
  /** XP the solve on show earned (0 when it earned nothing). Shown here because timer solves raise no XP toast. */
  xp: number
  /** The last attempt was thrown away with Escape (or lost to a reload). */
  cancelled: boolean
  /** What to say about it (default: cancelled with Escape). */
  cancelledText?: string
  onPenalty: (penalty: Penalty) => void
  onDelete: () => void
}

/** The big pad: press and hold to arm, let go to start. Shows the result of the last solve. */
export function TimerPad({ machine, padProps, inspection, last, lastIsBest, xp, cancelled, cancelledText, onPenalty, onDelete }: TimerPadProps) {
  const holding = machine.phase === 'holding'
  const ready = machine.phase === 'ready'
  const showResult = last !== null && !holding && !ready
  const text = showResult ? formatSolve(last) : '0.00'
  /** Inspection ran out before the start: there is no time, so nothing to turn the DNF into. */
  const noTime = showResult && last.penalty === 'dnf' && last.ms === 0
  const tooQuick = showResult && last.penalty !== 'dnf' && !countsForRecords(last)

  let hint: ReactNode
  if (ready) hint = <span className="font-display text-xl font-bold text-cube-green-text">Let go to start</span>
  else if (holding) hint = <span className="font-display text-xl font-bold text-cube-red-text">Keep holding…</span>
  else if (inspection)
    hint = (
      <>
        <span className="inline-flex items-center gap-1.5 pointer-coarse:hidden">
          Tap <Kbd>Space</Kbd> or
        </span>{' '}
        <span className="pointer-coarse:hidden">tap here to start your 15 seconds</span>
        <span className="pointer-fine:hidden">Tap here to start your 15 seconds</span>
      </>
    )
  else
    hint = (
      <>
        <span className="inline-flex items-center gap-1.5 pointer-coarse:hidden">
          Hold <Kbd>Space</Kbd> or
        </span>{' '}
        <span className="pointer-coarse:hidden">press and hold here. Let go to start.</span>
        <span className="pointer-fine:hidden">Press and hold here. Let go to start.</span>
      </>
    )

  return (
    <Card padding="none" className={cx('overflow-hidden transition-[background-color,border-color] duration-150', ready ? 'border-cube-green! bg-cube-green-soft!' : holding && 'border-line-strong!')}>
      <button
        type="button"
        {...padProps}
        data-phase={machine.phase}
        data-testid="timer-pad"
        aria-label={inspection ? 'Timer. Tap to start inspection.' : 'Timer. Press and hold, then let go to start.'}
        className="relative flex min-h-52 w-full touch-manipulation flex-col items-center justify-center px-4 pt-7 pb-7 sm:pt-9 select-none sm:min-h-64 [-webkit-touch-callout:none]"
      >
        <span className="flex min-h-7 flex-wrap items-center justify-center gap-1.5" data-testid="solve-news">
          <AnimatePresence>
            {showResult && lastIsBest && (
              <motion.span key="pb" initial={{ opacity: 0, scale: 0.6, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ ...springs.bouncy, delay: 0.12 }}>
                <Badge tone="yellow" variant="solid" icon="trophy" data-testid="pb-badge">
                  New personal best
                </Badge>
              </motion.span>
            )}
            {showResult && xp > 0 && (
              <motion.span key="xp" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ ...springs.gentle, delay: 0.16 }}>
                <Badge tone="yellow" icon="bolt" data-testid="news-xp">
                  +{xp} XP
                </Badge>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <motion.span
          key={showResult ? last.id : 'zero'}
          initial={showResult ? { scale: 0.82, opacity: 0.4 } : false}
          animate={{ scale: holding || ready ? 0.96 : 1, opacity: 1 }}
          transition={springs.bouncy}
          aria-hidden="true"
          data-testid="timer-display"
          className={cx(
            'num font-display tracking-[-0.04em] block text-[clamp(4rem,17vw,7.5rem)] leading-none font-extrabold transition-colors duration-150',
            ready ? 'text-cube-green-text' : holding ? 'text-cube-red-text' : showResult ? (last.penalty === 'dnf' ? 'text-ink-muted' : 'text-ink') : 'text-ink-faint',
          )}
        >
          {text}
        </motion.span>
        <span className="mt-4 flex min-h-7 flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-base font-semibold text-ink-muted">{hint}</span>
        {cancelled && !showResult && !holding && !ready && (
          <span className="mt-1.5 text-sm font-semibold text-ink-faint" data-testid="timer-cancelled">
            {cancelledText ?? 'Cancelled — that one wasn’t saved.'}
          </span>
        )}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {showResult
          ? `${last.penalty === 'dnf' ? 'Did not finish' : spokenTime(resultMs(last))}${lastIsBest ? '. New personal best.' : ''}${xp > 0 ? ` Plus ${xp} XP.` : ''}`
          : cancelled
            ? 'Attempt cancelled. Nothing was saved.'
            : ''}
      </span>

      <AnimatePresence initial={false}>
        {showResult && (
          <motion.div
            key="actions"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springs.gentle}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2.5 border-t border-line bg-surface-2 px-4 py-3.5">
              {!noTime && <SegmentedControl ariaLabel="Result" size="sm" items={PENALTY_ITEMS} value={last.penalty} onChange={onPenalty} />}
              <Button variant="ghost" size="sm" iconLeft="trash" onClick={onDelete}>
                Delete
              </Button>
              {tooQuick && (
                <p className="w-full text-center text-sm text-ink-muted" data-testid="too-quick">
                  Under {RECORD_FLOOR_MS / 1000} seconds is too quick to be a whole solve, so this one earns no XP and can’t be a best. If it was a slip, delete it.
                </p>
              )}
              {noTime && (
                <p className="w-full text-center text-sm text-ink-muted" data-testid="no-time">
                  Inspection ran out before the solve started, so there is no time to keep.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
