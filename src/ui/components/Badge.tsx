import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { cx } from '../cx'
import { TONE_CLASSES, type Tone } from '../colors'
import { Icon, type IconName } from '../icons'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  variant?: 'soft' | 'solid' | 'outline'
  size?: 'sm' | 'md'
  icon?: IconName
}

/** A small, non-interactive label. <Badge tone="green" icon="check">Done</Badge> */
export function Badge({ tone = 'neutral', variant = 'soft', size = 'md', icon, className, children, ...rest }: BadgeProps) {
  const t = TONE_CLASSES[tone]
  return (
    <span
      className={cx(
        'inline-flex items-center font-bold whitespace-nowrap',
        size === 'sm' ? 'h-5 gap-1 rounded-[6px] px-1.5 text-2xs' : 'h-6.5 gap-1 rounded-[8px] px-2 text-xs',
        variant === 'soft' && [t.soft, t.text],
        variant === 'solid' && [t.solid, t.onSolid, tone === 'white' && 'ring-1 ring-inset ring-(color:--sticker-outline)'],
        variant === 'outline' && ['ring-[1.5px] ring-inset ring-line-strong', t.text],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 11 : 13} weight={2.6} />}
      {children}
    </span>
  )
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  icon?: IconName
}

/** A selectable pill for filters and options. <Chip selected onClick={…}>All</Chip> */
export function Chip({ selected = false, icon, className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx(
        'relative inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold whitespace-nowrap',
        'transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-95',
        'before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-[""]',
        selected
          ? 'bg-ink text-ink-inverse'
          : 'bg-surface text-ink-muted ring-1 ring-inset ring-line-strong hover:text-ink hover:bg-surface-2',
        'disabled:opacity-45',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={15} weight={2.4} />}
      {children}
    </button>
  )
}
