import type { ReactNode } from 'react'
import { cx } from '../cx'
import type { Tone } from '../colors'
import type { IconName } from '../icons'
import { Sticker } from './Sticker'

export interface StatTileProps {
  label: string
  value: ReactNode
  /** Small text after the value: "XP", "days", "s". */
  unit?: string
  icon?: IconName
  tone?: Tone
  /** A line under the value: "Best: 12 days". */
  hint?: ReactNode
  /** `tile` is a card; `bare` has no surface (for use inside another card). */
  variant?: 'tile' | 'bare'
  className?: string
}

/** One number that matters. <StatTile label="Streak" value={7} unit="days" icon="flame" tone="orange" hint="Best: 12" /> */
export function StatTile({ label, value, unit, icon, tone = 'accent', hint, variant = 'tile', className }: StatTileProps) {
  return (
    <div className={cx('flex items-center gap-3.5', variant === 'tile' && 'rounded-lg border border-line bg-surface p-4 shadow-1', className)}>
      {icon && <Sticker tone={tone} icon={icon} size="md" filled={icon === 'flame' || icon === 'bolt' || icon === 'star'} />}
      <div className="min-w-0">
        <p className="eyebrow truncate">{label}</p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="num font-display text-2xl leading-8 font-extrabold tracking-[-0.03em] text-ink">{value}</span>
          {unit && <span className="text-sm font-bold text-ink-muted">{unit}</span>}
        </p>
        {hint && <p className="truncate text-sm text-ink-muted">{hint}</p>}
      </div>
    </div>
  )
}
