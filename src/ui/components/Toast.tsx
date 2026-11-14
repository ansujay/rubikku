import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'
import type { Tone } from '../colors'
import type { IconName } from '../icons'
import { springs } from '../motion'
import { Sticker } from './Sticker'

export interface ToastOptions {
  title: string
  /** A second, quieter line. Wraps to two lines (three when there is an action). */
  description?: string
  /** Colour of the icon sticker. */
  tone?: Tone
  icon?: IconName
  /** Milliseconds on screen. Default 3600. `0` keeps it until it is tapped away or replaced. */
  duration?: number
  /**
   * Toasts with the same key replace each other instead of stacking (and the timer restarts).
   * Use it for anything that can fire repeatedly: "saved", an update prompt, a running total.
   */
  key?: string
  /** One button inside the toast (e.g. "Refresh"). Pressing it also dismisses the toast. */
  action?: { label: string; onClick: () => void }
}

interface ToastItem extends Required<Pick<ToastOptions, 'title' | 'tone' | 'duration'>> {
  id: number
  /** Bumped when a keyed toast is replaced, so its timer restarts. */
  rev: number
  key?: string
  description?: string
  icon?: IconName
  action?: ToastOptions['action']
}

interface ToastStore {
  items: ToastItem[]
  push: (options: ToastOptions) => number
  dismiss: (id: number) => void
}

const MAX_VISIBLE = 3
let nextId = 1

const useToasts = create<ToastStore>((set, get) => ({
  items: [],
  push: (options) => {
    const existing = options.key ? get().items.find((item) => item.key === options.key) : undefined
    if (existing) {
      const next: ToastItem = { tone: 'neutral', duration: 3600, ...options, id: existing.id, rev: existing.rev + 1 }
      set((state) => ({ items: state.items.map((item) => (item.id === existing.id ? next : item)) }))
      return existing.id
    }
    const id = nextId++
    const item: ToastItem = { id, rev: 0, tone: 'neutral', duration: 3600, ...options }
    // When the stack is full the oldest *timed* toast makes room; sticky ones (an update prompt) stay.
    set((state) => {
      const items = [...state.items, item]
      while (items.length > MAX_VISIBLE) {
        const drop = items.findIndex((it) => it.duration > 0 && it.id !== id)
        items.splice(drop >= 0 ? drop : 0, 1)
      }
      return { items }
    })
    return id
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}))

/**
 * Show a brief message. Callable from anywhere (no hook needed):
 *
 *   toast({ title: '+120 XP', description: 'Lesson complete', tone: 'yellow', icon: 'bolt' })
 *   toast({ key: 'update', title: 'A new version is ready', duration: 0, action: { label: 'Refresh', onClick: reload } })
 *
 * Toasts appear at the top of the content column — clear of the phone tab bar, a lesson's
 * bottom bar and the timer's buttons — and never block taps on what is behind them.
 * For rewards (XP, badges, level-ups) use `reward()` from src/app/rewards.ts, which decides
 * what deserves a toast and merges several into one.
 */
export function toast(options: ToastOptions): number {
  return useToasts.getState().push(options)
}
toast.dismiss = (id: number) => useToasts.getState().dismiss(id)
/** Remove every toast (tests, and leaving a page that owns a sticky one). */
toast.clear = () => useToasts.setState({ items: [] })

function ToastCard({ item, more = 0 }: { item: ToastItem; more?: number }) {
  const dismiss = useToasts((s) => s.dismiss)
  useEffect(() => {
    if (item.duration <= 0) return
    const timer = window.setTimeout(() => dismiss(item.id), item.duration)
    return () => window.clearTimeout(timer)
  }, [item.id, item.rev, item.duration, dismiss])

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -20, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.15 } }}
      transition={springs.bouncy}
      className="pointer-events-auto flex w-fit max-w-full min-w-48 items-center gap-3 rounded-lg bg-surface py-2 pr-4 pl-2 shadow-pop ring-1 ring-line sm:max-w-sm"
      onClick={() => dismiss(item.id)}
      data-testid="toast"
      data-toast-key={item.key}
    >
      {item.icon && <Sticker tone={item.tone} icon={item.icon} size="md" filled={item.icon === 'bolt' || item.icon === 'star' || item.icon === 'flame'} />}
      <div className={item.icon ? 'min-w-0 flex-1' : 'min-w-0 flex-1 pl-2'}>
        <p className="truncate font-display text-base leading-5 font-bold text-ink">{item.title}</p>
        {item.description && <p className={item.action ? 'line-clamp-3 text-sm leading-[1.2rem] text-ink-muted' : 'line-clamp-2 text-sm leading-[1.2rem] text-ink-muted'}>{item.description}</p>}
      </div>
      {more > 0 && (
        <span className="num shrink-0 rounded-full bg-inset px-2 py-0.5 text-xs font-bold text-ink-muted" aria-label={`${more} more`}>
          +{more} more
        </span>
      )}
      {item.action && (
        <button
          type="button"
          className="key key-primary h-10 shrink-0 rounded-sm px-3.5 text-sm font-bold"
          onClick={(event) => {
            event.stopPropagation()
            dismiss(item.id)
            item.action?.onClick()
          }}
        >
          {item.action.label}
        </button>
      )}
    </motion.li>
  )
}

/**
 * Mount once near the root (the app shell does this). One toast is visible at a time — a sticky
 * one (an update prompt) first, else the newest — with "+N more" when others wait their turn.
 */
export function Toaster() {
  const items = useToasts((s) => s.items)
  if (typeof document === 'undefined') return null
  const shown = items.find((item) => item.duration <= 0) ?? items[items.length - 1]
  return createPortal(
    <ol aria-live="polite" aria-relevant="additions" className="toaster">
      <AnimatePresence mode="popLayout">{shown && <ToastCard key={shown.id} item={shown} more={items.length - 1} />}</AnimatePresence>
    </ol>,
    document.body,
  )
}
