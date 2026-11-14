import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { cx } from '../cx'
import { Icon, type IconName } from '../icons'
import { springs } from '../motion'

export interface OptionItem<T extends string> {
  value: T
  label: ReactNode
  icon?: IconName
  /** Needed when `label` is not plain text, or with `iconOnly`. */
  ariaLabel?: string
  disabled?: boolean
}

/** Arrow-key movement between options (roving focus), shared by Tabs and SegmentedControl. */
function useRovingKeys<T extends string>(items: readonly OptionItem<T>[], value: T, onChange: (value: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (event: KeyboardEvent) => {
    const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0)
    if (enabled.length === 0) return
    const current = enabled.indexOf(items.findIndex((item) => item.value === value))
    let next = -1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = enabled[(current + 1) % enabled.length]
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = enabled[current < 0 ? enabled.length - 1 : (current - 1 + enabled.length) % enabled.length]
    else if (event.key === 'Home') next = enabled[0]
    else if (event.key === 'End') next = enabled[enabled.length - 1]
    if (next < 0) return
    event.preventDefault()
    onChange(items[next].value)
    refs.current[next]?.focus()
  }
  // When `value` matches no option, the first enabled one takes the tab stop, so the group can
  // still be reached from the keyboard.
  const hasSelection = items.some((item) => item.value === value && !item.disabled)
  const firstEnabled = items.findIndex((item) => !item.disabled)
  return { refs, onKeyDown, hasSelection, firstEnabled }
}

/**
 * Arrow keys for a hand-made `role="radiogroup"` whose children are `role="radio"` buttons:
 * put it on the group's `onKeyDown`, and give each radio `tabIndex={selected ? 0 : -1}`.
 * Arrows move to the next enabled radio and choose it, like native radio buttons.
 */
export function radioGroupKeyDown(event: KeyboardEvent<HTMLElement>): void {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
  if (step === 0) return
  const radios = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)')]
  const at = radios.indexOf(document.activeElement as HTMLElement)
  if (at < 0 || radios.length < 2) return
  event.preventDefault()
  const next = radios[(at + step + radios.length) % radios.length]
  next.focus()
  next.click()
}

export interface SegmentedControlProps<T extends string> {
  items: readonly OptionItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
  fullWidth?: boolean
  /** Hide labels and show only icons (labels are still read by screen readers). */
  iconOnly?: boolean
  className?: string
}

/**
 * Pick one of a few options; the selected pill slides between them.
 * <SegmentedControl ariaLabel="Theme" value={v} onChange={setV} items={[{ value: 'light', label: 'Light', icon: 'sun' }, …]} />
 */
export function SegmentedControl<T extends string>({ items, value, onChange, ariaLabel, size = 'md', fullWidth = false, iconOnly = false, className }: SegmentedControlProps<T>) {
  const id = useId()
  const { refs, onKeyDown, hasSelection, firstEnabled } = useRovingKeys(items, value, onChange)
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cx('inline-flex gap-1 rounded-md bg-inset p-1 ring-1 ring-inset ring-line', fullWidth && 'flex w-full', className)}
    >
      {items.map((item, i) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={item.ariaLabel ?? (iconOnly && typeof item.label === 'string' ? item.label : undefined)}
            title={iconOnly && typeof item.label === 'string' ? item.label : undefined}
            disabled={item.disabled}
            tabIndex={selected || (!hasSelection && i === firstEnabled) ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cx(
              'relative inline-flex items-center justify-center gap-1.5 rounded-[10px] font-bold whitespace-nowrap transition-colors duration-150',
              size === 'sm' ? 'h-9 min-w-9 px-2.5 text-sm' : 'h-11 min-w-11 px-4 text-sm',
              fullWidth && 'flex-1',
              selected ? 'text-ink' : 'text-ink-muted hover:text-ink',
              'disabled:opacity-45',
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${id}-pill`}
                transition={springs.layout}
                className="absolute inset-0 rounded-[10px] bg-surface shadow-1 ring-1 ring-inset ring-line"
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {item.icon && <Icon name={item.icon} size={size === 'sm' ? 16 : 18} weight={2.2} />}
              {!iconOnly && item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export interface TabsProps<T extends string> {
  items: readonly OptionItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  /** Id prefix linking tabs to panels: tab `${idBase}-tab-${value}`, panel `${idBase}-panel-${value}`. */
  idBase?: string
  className?: string
}

/**
 * Section tabs with a sliding underline. Render the panel yourself (see TabPanel).
 * <Tabs ariaLabel="Timer views" value={tab} onChange={setTab} items={[{ value: 'stats', label: 'Stats' }, …]} />
 */
export function Tabs<T extends string>({ items, value, onChange, ariaLabel, idBase, className }: TabsProps<T>) {
  const auto = useId()
  const base = idBase ?? auto
  const { refs, onKeyDown, hasSelection, firstEnabled } = useRovingKeys(items, value, onChange)
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cx('no-scrollbar flex gap-1 overflow-x-auto border-b border-line', className)}
    >
      {items.map((item, i) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${item.value}`}
            aria-controls={`${base}-panel-${item.value}`}
            aria-selected={selected}
            aria-label={item.ariaLabel}
            disabled={item.disabled}
            tabIndex={selected || (!hasSelection && i === firstEnabled) ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cx(
              'relative inline-flex h-12 shrink-0 items-center gap-2 px-3.5 text-base font-bold whitespace-nowrap transition-colors duration-150',
              selected ? 'text-ink' : 'text-ink-muted hover:text-ink',
              'disabled:opacity-45',
            )}
          >
            {item.icon && <Icon name={item.icon} size={18} weight={2.2} />}
            {item.label}
            {selected && (
              <motion.span
                layoutId={`${base}-underline`}
                transition={springs.layout}
                className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-accent"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({ idBase, value, children, className }: { idBase: string; value: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${value}`} aria-labelledby={`${idBase}-tab-${value}`} tabIndex={0} className={className}>
      {children}
    </div>
  )
}
