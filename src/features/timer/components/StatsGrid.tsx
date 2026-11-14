import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { cx, Icon, springs } from '../../../ui'
import type { TimerStats } from '../logic/averages'
import { formatResult } from '../logic/format'

const bestHint = (value: number | null) => (value === null ? undefined : `Best ${formatResult(value)}`)

/**
 * The record book: two plaques for the numbers that matter (your best, your average of 5), the
 * solve count, and the other averages folded under "More numbers". Averages follow competition
 * rules.
 */
export function StatsGrid({ stats }: { stats: TimerStats }) {
  const [more, setMore] = useState(false)
  const need = (n: number) => (stats.count < n ? `After ${n} solves` : undefined)
  return (
    <div data-testid="timer-stats">
      <div className="grid grid-cols-2 gap-3">
        <Plaque label="Best" icon="trophy" record={stats.best !== null} value={<span data-testid="stat-best">{formatResult(stats.best)}</span>} hint={stats.count > 0 ? `Latest ${formatResult(stats.latest)}` : 'Your first solve sets it'} />
        <Plaque label="Average of 5" icon="target" value={<span data-testid="stat-ao5">{formatResult(stats.ao5)}</span>} hint={need(5) ?? bestHint(stats.bestAo5)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-semibold text-ink-muted">
          <span className="num font-display text-base font-extrabold text-ink" data-testid="stat-count">
            {stats.count}
          </span>{' '}
          {stats.count === 1 ? 'solve' : 'solves'} this session{stats.count !== stats.finished ? ` · ${stats.count - stats.finished} DNF` : ''}
        </p>
        <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)} className="flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm font-bold text-accent-text hover:bg-accent-soft" data-testid="more-numbers">
          More numbers
          <motion.span animate={{ rotate: more ? 180 : 0 }} transition={springs.snappy} className="grid">
            <Icon name="chevronDown" size={16} weight={2.6} />
          </motion.span>
        </button>
      </div>
      <motion.div initial={false} animate={{ height: more ? 'auto' : 0, opacity: more ? 1 : 0 }} transition={springs.gentle} className="overflow-hidden" aria-hidden={!more}>
        <dl className="mt-2 grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface">
          <Row label="Average of 12" value={<span data-testid="stat-ao12">{formatResult(stats.ao12)}</span>} hint={need(12) ?? bestHint(stats.bestAo12)} />
          <Row label="Mean of 3" value={<span data-testid="stat-mo3">{formatResult(stats.mo3)}</span>} hint={need(3) ?? bestHint(stats.bestMo3)} />
          <Row label="Session mean" value={formatResult(stats.mean)} hint={stats.worst !== null ? `Slowest ${formatResult(stats.worst)}` : undefined} />
        </dl>
        <p className="mt-3 text-sm text-ink-muted">An average of 5 drops your fastest and slowest solve, then averages the other three. It shows how fast you really are.</p>
      </motion.div>
    </div>
  )
}

/** A record on a plaque: a keycap-like card with the number set large. */
function Plaque({ label, value, hint, icon, record = false }: { label: string; value: ReactNode; hint?: string; icon: 'trophy' | 'target'; record?: boolean }) {
  return (
    <div className={cx('relative overflow-hidden rounded-lg border bg-surface p-4 sm:p-5', record ? 'border-cube-yellow-edge/40 shadow-[0_3px_0_0_var(--cube-yellow-edge)]' : 'border-line shadow-[0_3px_0_0_var(--line-strong)]')}>
      <p className="flex items-center gap-1.5">
        <span className={cx('grid size-6 place-items-center rounded-[7px]', record ? 'bg-cube-yellow text-on-yellow' : 'bg-inset text-ink-muted')}>
          <Icon name={icon} size={14} weight={2.4} />
        </span>
        <span className="eyebrow">{label}</span>
      </p>
      <p className="num mt-2 font-display text-4xl leading-none font-extrabold tracking-[-0.04em] text-ink sm:text-5xl">{value}</p>
      {hint && <p className="mt-2 truncate text-sm text-ink-muted">{hint}</p>}
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 p-3">
      <dt className="eyebrow truncate">{label}</dt>
      <dd className="num mt-0.5 font-display text-xl font-extrabold text-ink">{value}</dd>
      {hint && <dd className="truncate text-xs text-ink-muted">{hint}</dd>}
    </div>
  )
}
