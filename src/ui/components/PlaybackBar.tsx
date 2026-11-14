import type { CSSProperties } from 'react'
import { cx } from '../cx'
import { IconButton } from './IconButton'

export interface PlaybackBarProps {
  playing: boolean
  onPlayPause: () => void
  /** Number of moves already applied: 0 … total. */
  position: number
  total: number
  onStepBack?: () => void
  onStepForward?: () => void
  /** Jump back to the start. */
  onRestart?: () => void
  /** Called while dragging the scrubber. Omit to make it read-only. */
  onScrub?: (position: number) => void
  speed?: number
  /** Speeds to cycle through. Default [0.5, 1, 2]. */
  speeds?: readonly number[]
  onSpeedChange?: (speed: number) => void
  disabled?: boolean
  className?: string
}

const formatSpeed = (speed: number) => `${String(speed).replace(/^0\./, '.')}×`

/**
 * Transport controls for stepping through moves: restart, step back, play/pause, step forward,
 * a scrubber with one notch per move, a position counter and a speed button.
 * This is a controlled shell — the owner holds position/playing and does the actual playback.
 */
export function PlaybackBar({
  playing,
  onPlayPause,
  position,
  total,
  onStepBack,
  onStepForward,
  onRestart,
  onScrub,
  speed = 1,
  speeds = [0.5, 1, 2],
  onSpeedChange,
  disabled = false,
  className,
}: PlaybackBarProps) {
  const atStart = position <= 0
  const atEnd = position >= total
  const off = disabled || total === 0
  const pct = total > 0 ? (Math.min(total, Math.max(0, position)) / total) * 100 : 0
  const nextSpeed = () => {
    const i = speeds.indexOf(speed)
    onSpeedChange?.(speeds[(i + 1) % speeds.length])
  }
  const notches = total > 0 && total <= 32

  return (
    <div
      role="group"
      aria-label="Playback"
      className={cx('@container rounded-lg border border-line bg-surface p-2 shadow-2', className)}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <div className="flex items-center gap-1">
        {onRestart && <IconButton icon="restart" label="Back to start" size="sm" onClick={onRestart} disabled={off || atStart} />}
        {onStepBack && <IconButton icon="stepBack" label="Step back" size="sm" filled onClick={onStepBack} disabled={off || atStart} />}
        <IconButton
          icon={playing ? 'pause' : 'play'}
          label={playing ? 'Pause' : atEnd && total > 0 ? 'Play again' : 'Play'}
          variant="primary"
          size="md"
          filled
          onClick={onPlayPause}
          disabled={off}
          className="mx-1"
        />
        {onStepForward && <IconButton icon="stepForward" label="Step forward" size="sm" filled onClick={onStepForward} disabled={off || atEnd} />}
      </div>

      <div className="relative order-first flex h-11 min-w-40 basis-full items-center px-2 @xl:order-none @xl:basis-0 @xl:grow">
        <input
          type="range"
          className="slider"
          aria-label="Position"
          aria-valuetext={`Move ${position} of ${total}`}
          min={0}
          max={Math.max(1, total)}
          step={1}
          value={Math.min(total, Math.max(0, position))}
          disabled={off || !onScrub}
          onChange={(event) => onScrub?.(Number(event.target.value))}
          style={{ '--_pct': `${pct}%` } as CSSProperties}
        />
        {notches && (
          <div className="pointer-events-none absolute inset-x-[22px] top-1/2 flex -translate-y-1/2 justify-between" aria-hidden="true">
            {Array.from({ length: total + 1 }, (_, i) => (
              <span key={i} className={cx('h-1 w-0.5 rounded-full', i <= position ? 'bg-accent-ink/50' : 'bg-line-strong')} />
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="num min-w-14 text-center font-mono text-sm font-semibold text-ink-muted" aria-hidden="true">
          {Math.min(position, total)}
          <span className="text-ink-faint"> / {total}</span>
        </span>
        {onSpeedChange && (
          <button
            type="button"
            onClick={nextSpeed}
            disabled={off}
            aria-label={`Speed ${speed} times. Tap to change.`}
            className="key key-soft num h-10 min-w-13 rounded-sm px-2 font-mono text-sm font-bold"
          >
            {formatSpeed(speed)}
          </button>
        )}
      </div>
      </div>
    </div>
  )
}
