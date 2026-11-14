import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cx } from '../cx'
import { TONE_CLASSES, type Tone } from '../colors'
import { springs, useMotionPref } from '../motion'

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

export interface ProgressBarProps {
  value: number
  max?: number
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  /** Draw the bar as this many blocks (best for small whole numbers, e.g. 8 stages). */
  segments?: number
  /** Accessible name, e.g. "Stages completed". */
  label: string
  /** Show the label and "3 / 8" above the bar. */
  showLabel?: boolean
  /** Custom text for the value, e.g. "140 / 200 XP". */
  valueText?: string
  className?: string
}

const HEIGHT = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' } as const

/** <ProgressBar label="Level 2" value={140} max={200} tone="yellow" showLabel valueText="140 / 200 XP" /> */
export function ProgressBar({ value, max = 1, tone = 'accent', size = 'md', segments, label, showLabel = false, valueText, className }: ProgressBarProps) {
  const { reduced } = useMotionPref()
  const fraction = clamp01(max > 0 ? value / max : 0)
  const t = TONE_CLASSES[tone]
  const text = valueText ?? `${Math.round(value)} / ${max}`

  return (
    <div className={cx('w-full', className)}>
      {showLabel && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold text-ink">{label}</span>
          <span className="num font-semibold text-ink-muted">{text}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(max, Math.max(0, value))}
        aria-valuetext={text}
        className={cx(segments ? 'flex gap-1' : cx('overflow-hidden rounded-full bg-inset ring-1 ring-inset ring-line', HEIGHT[size]))}
      >
        {segments
          ? Array.from({ length: segments }, (_, i) => {
              const on = i < Math.round(fraction * segments)
              return (
                <span key={i} className={cx('relative flex-1 overflow-hidden rounded-[4px] bg-inset ring-1 ring-inset ring-line', HEIGHT[size])}>
                  <motion.span
                    className={cx('absolute inset-0 origin-left rounded-[4px]', t.solid)}
                    initial={false}
                    animate={{ scaleX: on ? 1 : 0, opacity: on ? 1 : 0 }}
                    transition={reduced ? { duration: 0 } : { ...springs.gentle, delay: on ? i * 0.04 : 0 }}
                  />
                </span>
              )
            })
          : (
              <motion.div
                className={cx('h-full rounded-full', t.solid)}
                initial={{ width: 0 }}
                animate={{ width: `${fraction * 100}%` }}
                transition={reduced ? { duration: 0 } : springs.fill}
              />
            )}
      </div>
    </div>
  )
}

export interface ProgressRingProps {
  /** 0…1, or use `max`. */
  value: number
  max?: number
  /** Diameter in px. */
  size?: number
  thickness?: number
  tone?: Tone
  label: string
  /** Centre content (a number, an icon…). */
  children?: ReactNode
  className?: string
}

/** <ProgressRing label="Level progress" value={0.7} size={72}>7</ProgressRing> */
export function ProgressRing({ value, max = 1, size = 64, thickness = 7, tone = 'accent', label, children, className }: ProgressRingProps) {
  const { reduced } = useMotionPref()
  const fraction = clamp01(max > 0 ? value / max : 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      className={cx('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--inset)" strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={1} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONE_CLASSES[tone].cssVar}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - fraction) }}
          transition={reduced ? { duration: 0 } : springs.fill}
          style={{ opacity: fraction > 0 ? 1 : 0 }}
        />
      </svg>
      <span className="relative grid place-items-center">{children}</span>
    </div>
  )
}
