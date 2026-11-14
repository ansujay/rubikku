/**
 * StageTracker — the one way the app draws the journey through the stages (DESIGN.md S4).
 *
 *   import { StageTracker, type StageTrackerItem } from '../../ui'
 *
 *   <StageTracker
 *     variant="strip"            // 'strip' (a row, Home / walkthrough header) · 'list' (rows with
 *                                // summaries, Progress) · 'vertical' (a dense column, side rails)
 *     size="md"                  // 'sm' 32 px · 'md' 56 px markers (a strip drops to sm by itself
 *                                // when its container is narrow, and shows a caption instead of labels)
 *     label="Learning path"      // accessible name of the list
 *     items={[
 *       { id: 'daisy', number: 1, title: 'The daisy', state: 'done', to: '/learn/daisy' },
 *       { id: 'white-cross', number: 2, title: 'White cross', state: 'current', summary: 'Beat 3 of 9' },
 *       { id: 'white-corners', number: 3, title: 'White corners', state: 'locked' },
 *       { id: 'full-solve', number: 9, title: 'Full solve', state: 'todo', icon: 'cube' },
 *     ]}
 *   />
 *
 * Item fields: `id`, `number` (shown on the marker), `title`, `state`
 * ('done' | 'current' | 'todo' | 'locked' | 'peeked'), and optional `icon` (replaces the number —
 * the primer and the full solve), `summary` (list/vertical: a line under the title), `meta` (list/
 * vertical: right-hand text, e.g. a date), `to` (a router link) or `onSelect` (a button),
 * `ariaLabel`.
 *
 * States look like objects: done = green, pressed in, a tick · current = blue, lifted, its number,
 * pulses three times · todo = a neutral keycap · locked = sunk into the page, faint · peeked = a
 * locked stage he opened anyway (dashed blue ring). The line between two stages fills green once
 * the first is done. `aria-current="step"` marks the current stage.
 *
 * Each `<li>` carries `data-stage` (the item id) and `data-status` (its state) for tests.
 *
 * `<StageMarker state number size />` is the marker on its own (for headers and chips).
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { cx } from '../cx'
import { Icon, type IconName } from '../icons'
import { springs, useMotionPref } from '../motion'

export type StageTrackerState = 'done' | 'current' | 'todo' | 'locked' | 'peeked'

export interface StageTrackerItem {
  id: string
  number: number
  title: string
  state: StageTrackerState
  icon?: IconName
  summary?: ReactNode
  meta?: ReactNode
  to?: string
  onSelect?: () => void
  ariaLabel?: string
}

export interface StageTrackerProps {
  items: readonly StageTrackerItem[]
  variant?: 'strip' | 'list' | 'vertical'
  size?: 'sm' | 'md'
  label?: string
  className?: string
}

const STATE_WORD: Record<StageTrackerState, string> = {
  done: 'done',
  current: 'up next',
  todo: 'to do',
  locked: 'locked',
  peeked: 'locked, peeked at',
}

export interface StageMarkerProps {
  state: StageTrackerState
  number?: number
  icon?: IconName
  size?: 'sm' | 'md'
  /** Strip only: shrink to `sm` when the tracker's container is narrow. */
  responsive?: boolean
  className?: string
}

/** One stage marker: a keycap whose height and colour say where the stage is. */
export function StageMarker({ state, number, icon, size = 'md', responsive = false, className }: StageMarkerProps) {
  const { reduced } = useMotionPref()
  const md = size === 'md'
  const box = md
    ? responsive
      ? 'size-9 rounded-[10px] text-base @xl:size-14 @xl:rounded-[15px] @xl:text-xl'
      : 'size-14 rounded-[15px] text-xl'
    : 'size-8 rounded-[9px] text-sm'
  const iconSize = md ? (responsive ? 20 : 24) : 16
  const glyph = state === 'done' ? <Icon name="check" size={iconSize} weight={3} /> : icon ? <Icon name={icon} size={iconSize} weight={2.3} /> : number
  return (
    <span className={cx('relative inline-grid shrink-0 place-items-center', className)} data-state={state}>
      {state === 'current' && (
        <>
          <span aria-hidden="true" className={cx('absolute -inset-1.5 bg-accent-soft', md ? 'rounded-[19px]' : 'rounded-[12px]')} />
          {!reduced && (
            <span
              aria-hidden="true"
              className={cx('absolute inset-0 bg-accent opacity-0 motion-ok:animate-[rk-pulse-ring_1.6s_var(--ease-out)_3]', md ? 'rounded-[15px]' : 'rounded-[9px]')}
            />
          )}
        </>
      )}
      <span
        className={cx(
          'stage-marker relative grid place-items-center font-display font-extrabold num',
          box,
          state === 'done' && 'stage-marker-done',
          state === 'current' && 'stage-marker-current',
          state === 'todo' && 'stage-marker-todo',
          (state === 'locked' || state === 'peeked') && 'stage-marker-locked',
          state === 'peeked' && 'stage-marker-peeked',
        )}
      >
        {glyph}
      </span>
    </span>
  )
}

function ItemShell({ item, className, children }: { item: StageTrackerItem; className?: string; children: ReactNode }) {
  const label = item.ariaLabel ?? `${item.title}: ${STATE_WORD[item.state]}`
  const current = item.state === 'current' ? ('step' as const) : undefined
  const classes = cx('group rounded-md transition-transform duration-150 ease-out', (item.to || item.onSelect) && 'hover:-translate-y-0.5 active:scale-[0.97]', className)
  if (item.to)
    return (
      <Link to={item.to} aria-label={label} aria-current={current} className={classes} data-stage={item.id}>
        {children}
      </Link>
    )
  if (item.onSelect)
    return (
      <button type="button" onClick={item.onSelect} aria-label={label} aria-current={current} className={cx(classes, 'text-left')} data-stage={item.id}>
        {children}
      </button>
    )
  return (
    <div aria-label={label} aria-current={current} className={classes} data-stage={item.id}>
      {children}
    </div>
  )
}

/** The line joining two markers; fills green when the stage before it is done. */
function Connector({ done, vertical, index, className }: { done: boolean; vertical: boolean; index: number; className?: string }) {
  const { reduced } = useMotionPref()
  return (
    <span aria-hidden="true" className={cx('absolute overflow-hidden rounded-full bg-line', className)}>
      {done && (
        <motion.span
          className="absolute inset-0 rounded-full bg-cube-green"
          style={{ transformOrigin: vertical ? '50% 0%' : '0% 50%' }}
          initial={reduced ? false : vertical ? { scaleY: 0 } : { scaleX: 0 }}
          animate={vertical ? { scaleY: 1 } : { scaleX: 1 }}
          transition={{ ...springs.fill, delay: reduced ? 0 : 0.15 + index * 0.07 }}
        />
      )}
    </span>
  )
}

export function StageTracker({ items, variant = 'strip', size = 'md', label = 'Stages', className }: StageTrackerProps) {
  if (variant === 'strip') return <Strip items={items} size={size} label={label} className={className} />
  return <Column items={items} size={variant === 'vertical' ? 'sm' : size} dense={variant === 'vertical'} label={label} className={className} />
}

function Strip({ items, size, label, className }: { items: readonly StageTrackerItem[]; size: 'sm' | 'md'; label: string; className?: string }) {
  const focus = items.find((item) => item.state === 'current') ?? items.find((item) => item.state === 'todo')
  const md = size === 'md'
  return (
    <div className={cx('@container', className)} data-testid="stage-tracker" data-variant="strip">
      <ol aria-label={label} className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item, i) => (
          <li key={item.id} className="relative flex min-w-0 flex-col items-center" data-stage={item.id} data-status={item.state}>
            {i < items.length - 1 && (
              <Connector
                done={item.state === 'done'}
                vertical={false}
                index={i}
                className={cx(
                  'h-[3px]',
                  md
                    ? 'top-[1.0625rem] left-[calc(50%+1.375rem)] w-[calc(100%-2.75rem)] @xl:top-[1.625rem] @xl:left-[calc(50%+2.125rem)] @xl:w-[calc(100%-4.25rem)]'
                    : 'top-[0.9375rem] left-[calc(50%+1.25rem)] w-[calc(100%-2.5rem)]',
                )}
              />
            )}
            <ItemShell item={item} className="flex w-full flex-col items-center">
              <StageMarker state={item.state} number={item.number} icon={item.icon} size={size} responsive={md} />
              {md && (
                <span
                  className={cx(
                    'mt-2.5 hidden px-1 text-center text-xs leading-4 font-bold text-balance @xl:line-clamp-2',
                    item.state === 'done' || item.state === 'current' ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  {item.title}
                </span>
              )}
            </ItemShell>
          </li>
        ))}
      </ol>
      {md && focus && (
        <p className="mt-3 text-center text-sm font-bold text-ink @xl:hidden" aria-hidden="true">
          <span className="text-ink-muted">{focus.state === 'current' ? 'Up next · ' : 'Next · '}</span>
          {focus.title}
        </p>
      )}
    </div>
  )
}

function Column({ items, size, dense, label, className }: { items: readonly StageTrackerItem[]; size: 'sm' | 'md'; dense: boolean; label: string; className?: string }) {
  const md = size === 'md'
  return (
    <ol aria-label={label} className={cx('relative', className)} data-testid="stage-tracker" data-variant={dense ? 'vertical' : 'list'}>
      {items.map((item, i) => {
        const lit = item.state === 'done' || item.state === 'current'
        return (
          <li key={item.id} className="relative" data-stage={item.id} data-status={item.state}>
            {i < items.length - 1 && (
              <Connector
                done={item.state === 'done'}
                vertical
                index={i}
                className={cx('w-[3px]', md ? 'top-[4.25rem] bottom-[-0.25rem] left-[1.65625rem]' : 'left-[0.90625rem]', !md && (dense ? 'top-[2.4375rem] bottom-[-0.0625rem]' : 'top-[2.75rem] bottom-[-0.25rem]'))}
              />
            )}
            <ItemShell item={item} className={cx('flex w-full gap-3.5', dense ? 'items-center py-1' : 'items-start py-2', (item.to || item.onSelect) && 'hover:translate-x-0.5 hover:translate-y-0!')}>
              <StageMarker state={item.state} number={item.number} icon={item.icon} size={size} />
              <span className={cx('min-w-0 flex-1', !dense && (md ? 'pt-2' : 'pt-1.5'))}>
                <span className={cx('block font-bold', dense ? 'truncate text-sm' : 'text-base leading-5', lit ? 'text-ink' : 'text-ink-muted')}>{item.title}</span>
                {!dense && item.summary && <span className="mt-0.5 block text-sm leading-5 text-ink-muted">{item.summary}</span>}
              </span>
              {item.meta && <span className={cx('shrink-0 text-xs font-bold', !dense && (md ? 'pt-2.5' : 'pt-2'), item.state === 'current' ? 'text-accent-text' : 'text-ink-muted')}>{item.meta}</span>}
            </ItemShell>
          </li>
        )
      })}
    </ol>
  )
}
