import type { Ref } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { cx, durations, Kbd } from '../../../ui'
import type { TimerMachine } from '../logic/machine'

export interface FocusOverlayProps {
  machine: TimerMachine
  /** Root element: the page sets `data-stage` on it every frame. */
  rootRef: Ref<HTMLDivElement>
  /** The numerals: the page writes the time into it every frame. */
  numeralsRef: Ref<HTMLParagraphElement>
}

/**
 * While inspecting or solving, everything else gets out of the way: one number on a clean
 * page. It also swallows taps, so stopping the clock can never press something by accident.
 */
export function FocusOverlay({ machine, rootRef, numeralsRef }: FocusOverlayProps) {
  const running = machine.phase === 'running'
  const inspecting = !running && machine.inspectStart !== null
  const open = running || inspecting
  const holding = machine.phase === 'holding'
  const ready = machine.phase === 'ready'

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={rootRef}
          key="focus"
          data-testid="timer-focus"
          data-phase={machine.phase}
          data-stage={running ? 'run' : 'calm'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: durations.fast } }}
          exit={{ opacity: 0, transition: { duration: durations.base } }}
          className={cx(
            'group fixed inset-0 z-[70] flex touch-none flex-col items-center justify-center px-4 select-none',
            'transition-colors duration-150',
            ready ? 'bg-cube-green-soft' : 'bg-bg',
          )}
        >
          <p className="eyebrow h-5">{running ? (machine.penalty === '+2' ? 'Solving · +2 from inspection' : 'Solving') : 'Inspection'}</p>
          <p
            ref={numeralsRef}
            aria-hidden="true"
            data-testid="timer-live"
            className={cx(
              'num font-display tracking-[-0.04em] mt-2 text-[clamp(4.5rem,21vw,13rem)] leading-none font-extrabold transition-colors duration-150',
              // One colour at a time: armed is green and a hold is red, whatever the countdown says.
              ready
                ? 'text-cube-green-text'
                : holding
                  ? 'text-cube-red-text'
                  : running
                    ? 'text-ink'
                    : 'text-ink group-data-[stage=eight]:text-cube-orange-text group-data-[stage=over]:text-cube-red-text group-data-[stage=twelve]:text-cube-red-text',
            )}
          >
            {running ? '0.00' : '15'}
          </p>

          <div className="mt-5 h-14 text-center">
            {running ? (
              <p className="text-base font-semibold text-ink-faint">
                Tap anywhere or press any key to stop
                <span className="mt-1 flex items-center justify-center gap-1.5 text-sm pointer-coarse:hidden">
                  <Kbd>Esc</Kbd> cancels without saving
                </span>
              </p>
            ) : ready ? (
              <p className="font-display text-2xl font-bold text-cube-green-text">Let go to start</p>
            ) : holding ? (
              <p className="font-display text-2xl font-bold text-cube-red-text">Keep holding…</p>
            ) : (
              <>
                <p className="font-display text-xl font-bold text-ink">
                  <span className="group-data-[stage=eight]:hidden group-data-[stage=over]:hidden group-data-[stage=twelve]:hidden">Look for your first moves</span>
                  <span className="hidden text-cube-orange-text group-data-[stage=eight]:inline">More than half gone</span>
                  <span className="hidden text-cube-red-text group-data-[stage=twelve]:inline">Nearly out of time — get ready</span>
                  <span className="hidden text-cube-red-text group-data-[stage=over]:inline">Time is up — start now</span>
                </p>
                <p className="mt-1.5 flex items-center justify-center gap-1.5 text-sm font-semibold text-ink-faint">
                  Hold <Kbd>Space</Kbd> or the screen, then let go
                </p>
              </>
            )}
          </div>
          <span className="sr-only" role="status">
            {running ? 'Timer running' : 'Inspection started'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
