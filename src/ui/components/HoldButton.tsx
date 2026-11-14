import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../cx'
import { Icon, type IconName } from '../icons'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './Button'

export interface HoldButtonProps {
  /** Called once the button has been held for `holdMs`. */
  onConfirm: () => void
  children: ReactNode
  /** How long to hold, in ms. Default 1500. */
  holdMs?: number
  variant?: ButtonVariant
  size?: ButtonSize
  iconLeft?: IconName
  fullWidth?: boolean
  disabled?: boolean
  className?: string
}

/**
 * A button that must be held down: for actions that cannot be undone. Works with touch, mouse
 * and keyboard (hold Space or Enter). Assistive tech that can only "click" gets a
 * press-twice fallback.
 * <HoldButton variant="danger" onConfirm={erase}>Hold to erase</HoldButton>
 */
export function HoldButton({ onConfirm, children, holdMs = 1500, variant = 'danger', size = 'md', iconLeft, fullWidth, disabled, className }: HoldButtonProps) {
  const fill = useRef<HTMLSpanElement>(null)
  const frame = useRef(0)
  const startedAt = useRef(0)
  const holding = useRef(false)
  const done = useRef(false)
  const confirmRef = useRef(onConfirm)
  useEffect(() => {
    confirmRef.current = onConfirm
  })
  const [pressed, setPressed] = useState(false)
  const [armed, setArmed] = useState(false)

  const paint = (fraction: number) => {
    if (fill.current) fill.current.style.transform = `scaleX(${fraction})`
  }

  const stop = () => {
    if (!holding.current) return
    holding.current = false
    cancelAnimationFrame(frame.current)
    setPressed(false)
    if (!done.current) paint(0)
  }

  /** After a completed hold, empty the fill and allow another one (once the finger is up). */
  const rearm = () => {
    if (!done.current) return
    window.setTimeout(() => {
      done.current = false
      paint(0)
    }, 500)
  }

  const start = () => {
    if (disabled || holding.current || done.current) return
    holding.current = true
    startedAt.current = performance.now()
    setPressed(true)
    const tick = (now: number) => {
      const fraction = Math.min(1, (now - startedAt.current) / holdMs)
      paint(fraction)
      if (fraction >= 1) {
        done.current = true
        holding.current = false
        setPressed(false)
        confirmRef.current()
        rearm()
        return
      }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(timer)
  }, [armed])

  return (
    <button
      type="button"
      disabled={disabled}
      data-pressed={pressed}
      className={buttonClasses({ variant, size, fullWidth }, cx('overflow-hidden', className))}
      onPointerDown={(event) => {
        if (event.button === 0) start()
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault()
          start()
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') stop()
      }}
      onBlur={stop}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        // A click with no pointer or key hold behind it comes from assistive tech: confirm on the second press.
        if (event.detail !== 0 || holding.current || done.current) return
        if (armed) {
          done.current = true
          confirmRef.current()
          rearm()
        } else {
          setArmed(true)
        }
      }}
    >
      <span ref={fill} aria-hidden="true" className="absolute inset-0 origin-left bg-(--hold-fill)" style={{ transform: 'scaleX(0)' }} />
      <span className="relative inline-flex items-center gap-2">
        {iconLeft && <Icon name={iconLeft} size={18} weight={2.4} />}
        {armed ? 'Press again to confirm' : children}
      </span>
    </button>
  )
}
