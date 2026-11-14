import type { MouseEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cx, Icon, SegmentedControl, springs, useTheme, type ThemeChoice } from '../ui'

const originOf = (event: MouseEvent<HTMLElement>) => {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * One-tap light ↔ dark switch, always labelled with the theme on screen ("Light" / "Dark").
 * The sun sets and the moon rises, and the new theme grows as a circle from the button.
 * `layout="row"` (phone top bar): icon then word. `layout="stack"` (tablet rail): word under the icon.
 */
export function ThemeToggleButton({ className, layout = 'row' }: { className?: string; layout?: 'row' | 'stack' }) {
  const { isDark, toggle } = useTheme()
  const label = isDark ? 'Dark' : 'Light'
  return (
    <button
      type="button"
      aria-label={`Theme: ${label}. Switch to ${isDark ? 'light' : 'dark'}`}
      onClick={(event) => toggle(originOf(event))}
      className={cx(
        'key key-secondary relative overflow-hidden font-bold',
        layout === 'row' ? 'h-11 gap-1.5 rounded-full pr-3.5 pl-3 text-sm' : 'h-14 w-full flex-col gap-0.5 rounded-md text-xs',
        className,
      )}
      data-testid="theme-toggle"
    >
      <span className="relative grid size-5 place-items-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={isDark ? 'moon' : 'sun'}
            initial={{ y: 18, rotate: -70, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: -18, rotate: 70, opacity: 0 }}
            transition={springs.snappy}
            className="grid place-items-center"
          >
            <Icon name={isDark ? 'moon' : 'sun'} size={19} weight={2.2} />
          </motion.span>
        </AnimatePresence>
      </span>
      <span aria-hidden="true">{label}</span>
    </button>
  )
}

const ITEMS: { value: ThemeChoice; label: string; icon: 'sun' | 'moon' | 'monitor'; ariaLabel: string }[] = [
  { value: 'light', label: 'Light', icon: 'sun', ariaLabel: 'Light' },
  { value: 'dark', label: 'Dark', icon: 'moon', ariaLabel: 'Dark' },
  { value: 'system', label: 'Auto', icon: 'monitor', ariaLabel: 'Auto (match this device)' },
]

/** Three-way theme picker, every option named: Light / Dark / Auto (match the device). */
export function ThemeSwitch({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { choice, setTheme } = useTheme()
  return (
    <div
      className={cx(compact && '[&_[role=radio]]:h-11 [&_[role=radio]]:gap-1 [&_[role=radio]]:px-1.5 [&_[role=radio]]:text-xs', className)}
      // Capture the click position so the reveal starts from the option that was tapped.
      onClickCapture={(event) => {
        lastOrigin = { x: event.clientX, y: event.clientY }
      }}
      data-testid="theme-switch"
    >
      <SegmentedControl ariaLabel="Theme" items={ITEMS} value={choice} onChange={(value) => setTheme(value, lastOrigin)} size={compact ? 'sm' : 'md'} fullWidth />
    </div>
  )
}

let lastOrigin: { x: number; y: number } | undefined
