import type { HTMLAttributes } from 'react'
import { cx } from '../cx'

/** A keyboard key. <Kbd>Space</Kbd> */
export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cx(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] border border-line-strong bg-surface px-1.5',
        'font-mono text-xs font-semibold text-ink-muted shadow-[0_2px_0_0_var(--line-strong)]',
        className,
      )}
      {...rest}
    />
  )
}
