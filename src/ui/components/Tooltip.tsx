import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { durations, easings } from '../motion'

export interface TooltipProps {
  label: ReactNode
  children: ReactNode
  /** Preferred side. Flips automatically near the viewport edge. */
  side?: 'top' | 'bottom'
  /** Hover delay in ms. Keyboard focus shows it immediately. */
  delay?: number
  disabled?: boolean
}

interface Position {
  x: number
  y: number
  side: 'top' | 'bottom'
}

/**
 * Hover / focus hint. Wraps its child in an inline-flex span.
 * <Tooltip label="Reset view"><button>…</button></Tooltip>
 */
export function Tooltip({ label, children, side = 'top', delay = 350, disabled = false }: TooltipProps) {
  const id = useId()
  const anchor = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [pos, setPos] = useState<Position | null>(null)
  const [shift, setShift] = useState(0)

  const show = useCallback(() => {
    const el = anchor.current
    if (!el || disabled) return
    const rect = el.getBoundingClientRect()
    const wantTop = side === 'top'
    const placeTop = wantTop ? rect.top > 56 : rect.bottom > window.innerHeight - 56
    setShift(0)
    setPos({ x: rect.left + rect.width / 2, y: placeTop ? rect.top - 8 : rect.bottom + 8, side: placeTop ? 'top' : 'bottom' })
  }, [disabled, side])

  const hide = useCallback(() => {
    window.clearTimeout(timer.current)
    setPos(null)
  }, [])

  // Keep the bubble inside the viewport horizontally.
  useLayoutEffect(() => {
    if (!pos || !bubble.current) return
    const rect = bubble.current.getBoundingClientRect()
    const overflowLeft = 8 - rect.left
    const overflowRight = rect.right - (window.innerWidth - 8)
    if (overflowLeft > 0) setShift(overflowLeft)
    else if (overflowRight > 0) setShift(-overflowRight)
  }, [pos])

  useEffect(() => {
    if (!pos) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && hide()
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', hide, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', hide, true)
    }
  }, [pos, hide])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <span
      ref={anchor}
      className="inline-flex"
      aria-describedby={pos ? id : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(show, delay)
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(event) => {
        if ((event.target as HTMLElement).matches?.(':focus-visible')) show()
      }}
      onBlur={hide}
    >
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {pos && (
              <motion.div
                ref={bubble}
                id={id}
                role="tooltip"
                initial={{ opacity: 0, y: pos.side === 'top' ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: durations.fast, ease: easings.out }}
                className="pointer-events-none fixed z-[80] max-w-64 rounded-sm bg-ink px-2.5 py-1.5 text-xs font-semibold text-ink-inverse shadow-2"
                style={{
                  left: pos.x + shift,
                  top: pos.y,
                  translate: pos.side === 'top' ? '-50% -100%' : '-50% 0',
                }}
              >
                {label}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </span>
  )
}
