import type { ReactNode } from 'react'
import { cx } from '../cx'
import type { Tone } from '../colors'
import type { IconName } from '../icons'
import { IsoCube } from './IsoCube'
import { Sticker } from './Sticker'

export interface EmptyStateProps {
  title: string
  description?: ReactNode
  /** An icon on a sticker. Without it, a ghost cube is drawn. */
  icon?: IconName
  tone?: Tone
  /** Usually one Button. */
  action?: ReactNode
  /** `card` draws a dashed outline; `plain` has no border. */
  variant?: 'card' | 'plain'
  /** Heading level of the title: `h1` when the empty state IS the page (a not-found page). Default h3. */
  headingLevel?: 'h1' | 'h2' | 'h3'
  className?: string
}

/** Shown where there is nothing yet. <EmptyState icon="timer" title="No solves yet" description="…" action={<Button>…</Button>} /> */
export function EmptyState({ title, description, icon, tone = 'accent', action, variant = 'card', headingLevel: Heading = 'h3', className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center px-6 py-10 text-center',
        variant === 'card' && 'rounded-lg border-[1.5px] border-dashed border-line-strong',
        className,
      )}
    >
      {icon ? <Sticker tone={tone} icon={icon} size="lg" variant="soft" /> : <IsoCube size={84} ghost />}
      <Heading className={cx('mt-4 text-ink', Heading === 'h1' ? 'text-2xl' : 'text-lg')}>{title}</Heading>
      {description && <p className="mt-1 max-w-sm text-base text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
