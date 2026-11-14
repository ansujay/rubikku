import { useEffect, useRef } from 'react'
import { animate } from 'motion/react'
import { easings, useMotionPref } from '../motion'

export interface AnimatedNumberProps {
  value: number
  /** Turn the (rounded) number into text. Default: grouped digits. */
  format?: (value: number) => string
  /** Seconds. */
  duration?: number
  /** Count up from this on first show (e.g. 0 for "+120 XP" in a celebration). Default: no count on mount. */
  from?: number
  /** Seconds to wait before counting. */
  delay?: number
  className?: string
}

const defaultFormat = (n: number) => n.toLocaleString('en-US')

/** A number that counts to its new value when it changes. <AnimatedNumber value={xp} /> */
export function AnimatedNumber({ value, format = defaultFormat, duration = 0.7, from, delay = 0, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(from ?? value)
  const { reduced } = useMotionPref()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const from = shown.current
    if (reduced || from === value) {
      shown.current = value
      el.textContent = format(value)
      return
    }
    const controls = animate(from, value, {
      duration,
      delay,
      ease: easings.out,
      onUpdate: (latest) => {
        shown.current = Math.round(latest)
        el.textContent = format(shown.current)
      },
    })
    return () => controls.stop()
  }, [value, reduced, duration, delay, format])

  return (
    <span ref={ref} className={className ? `num ${className}` : 'num'}>
      {/* The number on screen right now; the effect above counts it up to `value`. Rendering
          `value` here would flash the final number for a frame before the count starts. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {format(shown.current)}
    </span>
  )
}
