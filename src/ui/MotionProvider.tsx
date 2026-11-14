import { useEffect, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { springs, useMotionPref } from './motion'

/**
 * Wrap the app once. Applies the reduced-motion decision to motion components and to CSS
 * (via `data-motion` on <html>), and sets the default transition.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const { reduced } = useMotionPref()

  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'
  }, [reduced])

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'} transition={springs.gentle}>
      {children}
    </MotionConfig>
  )
}
