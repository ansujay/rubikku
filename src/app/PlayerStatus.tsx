import { Link } from 'react-router-dom'
import { useLevel, useStreak } from '../store'
import { AnimatedNumber, cx, Icon, ProgressRing } from '../ui'

/** Streak flame + count. Grey until today has been counted, lit once it has. */
export function StreakPill({ className }: { className?: string }) {
  const { days, doneToday } = useStreak()
  const lit = days > 0 && doneToday
  return (
    <span
      className={cx(
        'inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-sm font-extrabold',
        lit ? 'bg-cube-orange-soft text-cube-orange-text' : 'bg-inset text-ink-muted',
        className,
      )}
      role="img"
      aria-label={`${days} day streak`}
      title={days === 0 ? 'No streak yet — practise today to start one' : doneToday ? `${days}-day streak` : `${days}-day streak — practise today to keep it`}
    >
      <Icon name="flame" size={16} filled={lit} weight={2.2} />
      <AnimatedNumber value={days} />
    </span>
  )
}

export function XpPill({ className }: { className?: string }) {
  const { xp } = useLevel()
  return (
    <span className={cx('inline-flex h-9 items-center gap-1 rounded-full bg-cube-yellow-soft px-2.5 text-sm font-extrabold text-cube-yellow-text', className)}>
      <Icon name="bolt" size={15} filled weight={2} />
      <AnimatedNumber value={xp} />
      <span className="sr-only">XP</span>
    </span>
  )
}

/** Sidebar card: level ring, title, XP to go, streak. Links to Progress. */
export function PlayerCard({ compact = false }: { compact?: boolean }) {
  const level = useLevel()
  const ring = (
    <ProgressRing label={`Level ${level.level} progress`} value={level.progress} size={compact ? 44 : 42} thickness={5} tone="yellow">
      <span className="num font-display text-base font-extrabold text-ink">{level.level}</span>
    </ProgressRing>
  )
  if (compact) {
    return (
      <Link to="/progress" aria-label={`Level ${level.level}, ${level.xp} XP. Open progress.`} className="grid place-items-center rounded-md py-1 transition-transform duration-150 active:scale-95">
        {ring}
      </Link>
    )
  }
  return (
    <Link
      to="/progress"
      className="flex items-center gap-2.5 rounded-lg border border-line bg-surface p-2.5 shadow-1 transition-[translate,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-2 active:translate-y-0"
    >
      {ring}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-display text-sm leading-[1.1rem] font-bold text-ink">{level.title}</span>
        <span className="num block truncate text-xs font-semibold text-ink-muted">
          <AnimatedNumber value={level.xp} /> XP
        </span>
      </span>
      <StreakPill className="h-7! gap-0.5! px-2! text-xs!" />
    </Link>
  )
}
