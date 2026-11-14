/**
 * Shared motion language. Import springs and variants from here instead of inventing
 * timings per component, so the whole app moves the same way.
 *
 * Reduced motion: <MotionProvider> (src/ui/MotionProvider.tsx) wraps the app in
 * <MotionConfig reducedMotion="always"> when the system preference or the in-app setting asks
 * for it — motion then skips transforms and layout animation and keeps short opacity fades.
 * For anything driven by hand (canvas, timers, confetti), ask `useMotionPref()`.
 */
import { useSyncExternalStore } from 'react'
import type { Transition, Variants } from 'motion/react'
import { useSettings } from '../store/settings'

// ───────────────────────── Springs ─────────────────────────

export const springs = {
  /** Buttons, toggles, chips: fast, no visible overshoot. */
  snappy: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 },
  /** Panels, cards, page content: calm settle. */
  gentle: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 },
  /** Rewards and "pop" moments: one small overshoot. */
  bouncy: { type: 'spring', stiffness: 420, damping: 17, mass: 0.8 },
  /** Shared-layout indicators (active tab pill, nav marker). */
  layout: { type: 'spring', stiffness: 480, damping: 38, mass: 0.8 },
  /** Progress fills and counters: smooth, slightly slow. */
  fill: { type: 'spring', stiffness: 120, damping: 22, mass: 1 },
} as const satisfies Record<string, Transition>

export const durations = { instant: 0.09, fast: 0.15, base: 0.22, slow: 0.36, slower: 0.56 } as const

export const easings = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.5, 0, 0.75, 0],
} as const

// ───────────────────────── Variants ─────────────────────────

/**
 * Page enter/exit, overlapped (the app shell stacks the two pages): the new page rises and fades
 * in underneath while the old one holds for a beat and then fades out on top — a cross-fade, so
 * the content area is never empty (design review 2, M-new-1).
 */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12 },
  enter: { opacity: 1, y: 0, transition: { ...springs.gentle, opacity: { duration: 0.18, ease: easings.out } } },
  exit: { opacity: [1, 1, 0], y: -6, transition: { duration: 0.2, times: [0, 0.35, 1], ease: easings.in, y: { duration: 0.2, ease: easings.in } } },
}

/** Parent for staggered reveals. Children use `staggerItem` (or any variants named hidden/show). */
export const staggerContainer = (stagger = 0.05, delay = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
})

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  // The rise is a spring; the fade is short, so a new page's content is readable at once.
  show: { opacity: 1, y: 0, transition: { ...springs.gentle, opacity: { duration: 0.18, ease: easings.out } } },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: durations.base, ease: easings.out } },
}

/** Scale-in for things that appear in place (badges, check marks, toasts). */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  show: { opacity: 1, scale: 1, transition: springs.bouncy },
  exit: { opacity: 0, scale: 0.92, transition: { duration: durations.fast, ease: easings.in } },
}

/** Dialog panel. */
export const dialogPanel: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 12 },
  show: { opacity: 1, scale: 1, y: 0, transition: springs.gentle },
  exit: { opacity: 0, scale: 0.97, y: 6, transition: { duration: durations.fast, ease: easings.in } },
}

/** Bottom sheet panel. */
export const sheetPanel: Variants = {
  hidden: { y: '100%' },
  show: { y: 0, transition: { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 } },
  exit: { y: '100%', transition: { duration: durations.base, ease: easings.in } },
}

export const scrim: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: durations.base } },
  exit: { opacity: 0, transition: { duration: durations.fast } },
}

/** Props for a hover-lift / press-squeeze on cards and tiles: <motion.div {...pressable} /> */
export const pressable = {
  whileHover: { y: -3 },
  whileTap: { scale: 0.98, y: 0 },
  transition: springs.snappy,
} as const

// ───────────────────────── Reduced motion ─────────────────────────

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribeSystem(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

const systemPrefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches

/** Non-hook check, for event handlers and imperative code. */
export const prefersReducedMotion = (): boolean =>
  useSettings.getState().motion === 'reduced' || systemPrefersReduced()

export interface MotionPref {
  /** True when motion should be minimal: the system asks for it, or the in-app setting does. */
  reduced: boolean
  /** True when it is the device (not the app setting) asking. */
  system: boolean
}

export function useMotionPref(): MotionPref {
  const setting = useSettings((s) => s.motion)
  const system = useSyncExternalStore(subscribeSystem, systemPrefersReduced, () => false)
  return { reduced: system || setting === 'reduced', system }
}
