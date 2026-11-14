import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cx } from '../cx'
import { springs } from '../motion'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name. Either this or `aria-labelledby` via `labelledBy`. */
  label?: string
  labelledBy?: string
  disabled?: boolean
  id?: string
  className?: string
  /** Optional visible content to the left of the switch (makes the whole row clickable). */
  children?: ReactNode
}

/** An on/off switch. <Toggle label="Sound" checked={on} onChange={setOn} /> */
export function Toggle({ checked, onChange, label, labelledBy, disabled = false, id, className, children }: ToggleProps) {
  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={children ? undefined : label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-8 w-14 shrink-0 items-center rounded-[11px] p-1 transition-colors duration-200',
        'before:absolute before:-inset-1.5 before:content-[""]',
        checked ? 'justify-end bg-accent' : 'justify-start bg-line-strong',
        'disabled:opacity-45',
        !children && className,
      )}
    >
      <motion.span
        layout
        transition={springs.snappy}
        className="block size-6 rounded-[8px] bg-cube-white shadow-[0_1px_2px_rgb(0_0_0/0.25)]"
      />
    </button>
  )
  if (!children) return control
  return (
    <label className={cx('flex cursor-pointer items-center justify-between gap-4', disabled && 'cursor-not-allowed', className)}>
      <span className="min-w-0">{children}</span>
      {control}
    </label>
  )
}
