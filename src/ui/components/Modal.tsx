import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { cx } from '../cx'
import { dialogPanel, scrim, sheetPanel } from '../motion'
import { IconButton } from './IconButton'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let openCount = 0

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Buttons, right-aligned on wide screens and stacked on phones. */
  footer?: ReactNode
  /** `dialog` is centred; `sheet` slides up from the bottom edge. */
  variant?: 'dialog' | 'sheet'
  size?: 'sm' | 'md' | 'lg'
  /** Set false for dialogs that must be answered (hides the close button, ignores scrim clicks and Escape). */
  dismissible?: boolean
  /** Decoration above the title (a Sticker, an illustration). */
  media?: ReactNode
}

/** Open dialogs, oldest first. */
const openStack: object[] = []

const WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' } as const

/**
 * Accessible dialog: focus is trapped and restored, Escape closes, the page behind cannot scroll.
 * <Modal open={open} onClose={close} title="Reset everything?" footer={<Button>…</Button>}>…</Modal>
 */
export function Modal({ open, onClose, title, description, children, footer, variant = 'dialog', size = 'md', dismissible = true, media }: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const token = {}
    openStack.push(token)
    openCount++
    document.documentElement.style.overflow = 'hidden'
    // Focus the first control, or the panel itself.
    const frame = requestAnimationFrame(() => {
      const el = panel.current
      if (!el) return
      const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? el).focus({ preventScroll: true })
    })
    const onKey = (event: KeyboardEvent) => {
      // With dialogs stacked, only the one on top answers the keyboard: Escape closes one at a time.
      if (openStack[openStack.length - 1] !== token) return
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !panel.current.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey, true)
      const at = openStack.indexOf(token)
      if (at >= 0) openStack.splice(at, 1)
      openCount--
      if (openCount === 0) document.documentElement.style.overflow = ''
      previous?.focus?.({ preventScroll: true })
    }
  }, [open, dismissible])

  if (typeof document === 'undefined') return null
  const sheet = variant === 'sheet'

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cx('fixed inset-0 z-[60] flex justify-center', sheet ? 'items-end' : 'items-end p-0 sm:items-center sm:p-6')}>
          <motion.div
            variants={scrim}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute inset-0 bg-scrim"
            onClick={dismissible ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            variants={sheet ? sheetPanel : dialogPanel}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cx(
              'relative flex max-h-[min(92dvh,720px)] w-full flex-col overflow-hidden bg-surface shadow-pop ring-1 ring-line',
              WIDTH[size],
              sheet ? 'rounded-t-xl pb-[env(safe-area-inset-bottom)]' : 'rounded-t-xl sm:rounded-xl',
            )}
          >
            {sheet && <span className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />}
            <div className="flex items-start gap-3 px-6 pt-5">
              <div className="min-w-0 flex-1">
                {media && <div className="mb-4">{media}</div>}
                <h2 id={titleId} className="text-xl text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1.5 text-base text-ink-muted">
                    {description}
                  </p>
                )}
              </div>
              {dismissible && <IconButton icon="x" label="Close" size="sm" variant="soft" tooltip={false} onClick={onClose} className="-mr-2 -mt-1" />}
            </div>
            {children && <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4">{children}</div>}
            <div className={cx('px-6 pb-6', footer ? 'pt-5' : 'pt-1')}>
              {footer && <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">{footer}</div>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** A bottom sheet: `Modal` with `variant="sheet"`. Good for phone menus and pickers. */
export function Sheet(props: Omit<ModalProps, 'variant'>) {
  return <Modal {...props} variant="sheet" />
}
