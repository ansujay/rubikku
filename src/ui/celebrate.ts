/**
 * Celebrations — one system, three tiers, for every pay-off in the app (DESIGN.md M7).
 *
 *   import { celebration } from '../../ui'
 *
 *   // TICK — a correct move or answer: a bright little "ding" and a pop on the thing he got right.
 *   celebration.tick(buttonElement)             // element optional; sound only without one
 *   celebration.tick(null, { cube: true })      // …and the cube on screen hops
 *
 *   // MOMENT — a stage learned, a pattern made, a personal best, a badge. A composed card at the
 *   // top of the content column (~3 s, tap to dismiss, never blocks the page): the badge as a
 *   // keycap that lands and presses in, the XP counting up, and the cube on screen (if any)
 *   // does its own `celebrate('moment')`.
 *   celebration.moment({ title: 'White cross learned', subtitle: 'Stage 2 of 8', badge, xp: 120 })
 *
 *   // MILESTONE — first full solve, a level-up, all eight stages. A takeover of the content area
 *   // (~4 s, then it leaves by itself; tap, Escape or the button skips it; never loops): a big
 *   // headline over the hero — a live 3D cube, solved, doing its `celebrate('milestone')` victory
 *   // spin in a pool of light — with the badge or level as a keycap landing beside the counting
 *   // XP, confetti in the six cube colours from the cube, and a second, smaller beat (a burst and
 *   // a ripple through the cube) as the XP lands.
 *   celebration.milestone({ title: 'You solved the cube', subtitle: '…', badge, xp, action: { label: 'Keep going', to: '/timer' } })
 *
 *   // A personal best: the time itself is the art (a gold stopwatch keycap showing it); badges
 *   // earned with it ride along as a row of small keycaps.
 *   celebration.moment({ eyebrow: 'Personal best', title: '11.09', art: { time: '11.09' } })
 *
 *   // A page can offer a place in its own flow for moment cards (instead of the top of the
 *   // column): <CelebrationSlot media="(max-width: 639.98px)" /> — the Timer does, under its pad.
 *
 *   celebration.confetti(elementOrPoint)        // the app's one confetti (skipped under reduced motion)
 *   const release = celebration.hold()          // e.g. while the timer runs: celebrations wait…
 *   release()                                   // …and play when released
 *
 * The cube on screen celebrates too. Every cube driven by `useCubeController` registers itself
 * (`celebration.registerCube`) while it is mounted, so pages do nothing. A bare `<Cube3D ref>`
 * without the controller can opt in with `useCelebrationCube(ref)`.
 *
 * Rewards are wired in already: `reward()` in src/app/rewards.ts turns a level-up into a
 * milestone and a new badge into a moment, everywhere. To give your own pay-off the right tier AND
 * have the reward merged into it, pass it to reward: `reward('lesson-completed', { stageId },
 * { moment: { title: 'Stage 3 learned' } })` (or `milestone: {…}`). Calls that land within ~1 s of
 * each other are merged into one celebration (the higher tier wins; badges and XP are combined),
 * so a lesson that also earns a badge and a level shows ONE takeover, not three.
 *
 * Reduced motion: the same content, without movement or confetti. Sound follows the mute setting.
 */
import { useEffect, type RefObject } from 'react'
import confettiLib from 'canvas-confetti'
import { create } from 'zustand'
import type { BadgeDef } from '../store/badges'
import type { IconName } from './icons'
import { prefersReducedMotion } from './motion'
import { sound } from './sound'

export type CelebrationTier = 'tick' | 'moment' | 'milestone'

/**
 * Anything with an optional `celebrate(tier)` — a `Cube3DHandle`. The cube's own tiers are
 * 'tick' (a hop), 'stage' (spin + ripple: our moment) and 'milestone'.
 */
export interface CelebrationCube {
  celebrate?: (tier: 'tick' | 'stage' | 'milestone') => unknown
}

export interface CelebrationArt {
  /** A time to show on a stopwatch keycap ("11.09"). */
  time: string
}

export interface CelebrationAction {
  label: string
  /** A route (hash-router path such as '/timer'). */
  to?: string
  onClick?: () => void
}

export interface MomentOptions {
  title: string
  subtitle?: string
  /** Small line above the title: "New badge", "Stage learned", "Personal best". */
  eyebrow?: string
  /** The art: a badge keycap (first badge), else `icon` on a sticker. */
  badge?: BadgeDef
  /**
   * Art that IS the news, ahead of any badge: `{ time: '11.09' }` draws a gold stopwatch keycap
   * showing that time (a personal best). Badges earned with it then show as a row of small
   * keycaps under the title.
   */
  art?: CelebrationArt
  badges?: readonly BadgeDef[]
  icon?: IconName
  /** XP to count up. */
  xp?: number
  /** Small extra news shown as ticks under the title ("Daily challenge done"). */
  notes?: readonly string[]
  /** A cube to celebrate instead of the registered one (null: no cube). */
  cube?: CelebrationCube | null
  /**
   * These words headline the celebration when it merges with another (e.g. the reward's "You
   * solved the cube" over a page's plain "Solved!"). Without it a feature's words win.
   */
  headline?: boolean
}

export interface MilestoneOptions extends MomentOptions {
  /** A level reached: the art becomes the level number on a large keycap. */
  level?: number
  /** Name of that level ("Twister"). */
  levelTitle?: string
  /** The one button. Default "Keep going" (just closes). */
  action?: CelebrationAction
}

export interface Celebration {
  id: number
  tier: 'moment' | 'milestone'
  title: string
  subtitle?: string
  eyebrow?: string
  badges: BadgeDef[]
  icon?: IconName
  art?: CelebrationArt
  xp: number
  notes: string[]
  level: number | null
  levelTitle?: string
  action?: CelebrationAction
  /** Who asked: a feature's own words beat the generic reward ones when merging. */
  source: 'feature' | 'reward'
  /** Words that headline a merge (see `MomentOptions.headline`). */
  headline: boolean
  createdAt: number
}

/** Requests closer together than this become one celebration. */
export const MERGE_MS = 1000
/** How long each tier stays (ms). */
export const CELEBRATION_MS = { moment: 3400, milestone: 4300 } as const

interface CelebrationStore {
  current: Celebration | null
  queue: Celebration[]
  held: number
  /**
   * Where moment cards go instead of the top of the content column, when a page offers a place
   * in its own flow (`<CelebrationSlot>` — e.g. under the timer pad on a phone, so a personal
   * best never covers the pad).
   */
  slot: HTMLElement | null
}

export const useCelebrations = create<CelebrationStore>(() => ({ current: null, queue: [], held: 0, slot: null }))

let nextId = 1
const cubes: CelebrationCube[] = []
let explicitCube: CelebrationCube | null | undefined

/** Merge `b` into `a` (pure; exported for tests). */
export function mergeCelebrations(a: Celebration, b: Celebration): Celebration {
  const tier = a.tier === 'milestone' || b.tier === 'milestone' ? 'milestone' : 'moment'
  // Words: a headline beats everything; then a feature's beat a reward's; between equals, the
  // higher tier's; else the newer (a lesson finished just after its "on your own cube" step is
  // the news, not the step).
  const words =
    a.headline !== b.headline
      ? a.headline
        ? a
        : b
      : a.source !== b.source
        ? a.source === 'feature'
          ? a
          : b
        : a.tier !== b.tier
          ? a.tier === tier
            ? a
            : b
          : b
  const badges = [...a.badges]
  for (const badge of b.badges) if (!badges.some((x) => x.id === badge.id)) badges.push(badge)
  const level = a.level !== null || b.level !== null ? Math.max(a.level ?? 0, b.level ?? 0) : null
  // The same XP is often reported twice (the page's own call and the reward's): never add it up.
  const xp = a.source === b.source ? a.xp + b.xp : Math.max(a.xp, b.xp)
  return {
    ...a,
    tier,
    title: words.title,
    subtitle: words.subtitle ?? (words === a ? b.subtitle : a.subtitle),
    eyebrow: words.eyebrow,
    icon: words.icon ?? a.icon ?? b.icon,
    art: words.art ?? a.art ?? b.art,
    action: words.action ?? a.action ?? b.action,
    levelTitle: a.levelTitle ?? b.levelTitle,
    badges,
    level,
    xp,
    notes: [...new Set([...a.notes, ...b.notes])],
    source: a.source === 'feature' || b.source === 'feature' ? 'feature' : 'reward',
    headline: a.headline || b.headline,
  }
}

function show(item: Celebration, cube: CelebrationCube | null | undefined): void {
  const now = Date.now()
  const state = useCelebrations.getState()
  // Join a celebration that started a moment ago, or one still waiting.
  if (state.current && now - state.current.createdAt < MERGE_MS) {
    const merged = mergeCelebrations(state.current, item)
    const upgraded = merged.tier !== state.current.tier
    useCelebrations.setState({ current: upgraded ? { ...merged, id: nextId++, createdAt: state.current.createdAt } : merged })
    if (upgraded) effects(merged, cube)
    return
  }
  const lastQueued = state.queue[state.queue.length - 1]
  if (lastQueued && now - lastQueued.createdAt < MERGE_MS) {
    useCelebrations.setState({ queue: [...state.queue.slice(0, -1), mergeCelebrations(lastQueued, item)] })
    return
  }
  if (!state.current && state.held === 0) {
    useCelebrations.setState({ current: item })
    effects(item, cube)
    return
  }
  // Waiting: keep at most two; a waiting milestone pushes out waiting moments.
  let queue = [...state.queue, item]
  if (item.tier === 'milestone') queue = queue.filter((q) => q.tier === 'milestone' || q === item)
  useCelebrations.setState({ queue: queue.slice(-2) })
  explicitCube = cube
}

/** The sound and the cube's own reaction, as a celebration comes on screen. */
function effects(item: Celebration, cube: CelebrationCube | null | undefined): void {
  sound.play(item.tier === 'milestone' ? 'fanfare' : 'success')
  // A milestone's takeover covers the page and brings its own cube to spin: the page's cube,
  // hidden underneath, stays still (two cubes animating at once would only cost frames).
  if (item.tier === 'milestone') return
  const target = cube === undefined ? cubes[cubes.length - 1] : cube
  try {
    target?.celebrate?.(item.tier === 'moment' ? 'stage' : 'milestone')
  } catch {
    /* the cube's flourish is a nicety */
  }
}

/** Bring the next waiting celebration on screen. */
function playNext(): void {
  const [first, ...rest] = useCelebrations.getState().queue
  if (!first) return
  const next = { ...first, createdAt: Date.now() }
  useCelebrations.setState({ current: next, queue: rest })
  effects(next, explicitCube)
  explicitCube = undefined
}

function build(tier: 'moment' | 'milestone', options: MilestoneOptions, source: Celebration['source']): Celebration {
  const badges = [...(options.badge ? [options.badge] : []), ...(options.badges ?? [])].filter((b, i, all) => all.findIndex((x) => x.id === b.id) === i)
  return {
    id: nextId++,
    tier,
    title: options.title,
    subtitle: options.subtitle,
    eyebrow: options.eyebrow,
    badges,
    icon: options.icon,
    art: options.art,
    xp: Math.max(0, Math.round(options.xp ?? 0)),
    notes: [...(options.notes ?? [])],
    level: options.level ?? null,
    levelTitle: options.levelTitle,
    action: options.action,
    source,
    headline: Boolean(options.headline),
    createdAt: Date.now(),
  }
}

/** Point (0–1 of the viewport) at the centre of an element. */
function originOf(target: Element | { x: number; y: number } | undefined): { x: number; y: number } {
  if (!target) return { x: 0.5, y: 0.42 }
  if ('getBoundingClientRect' in target) {
    const rect = target.getBoundingClientRect()
    return { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight }
  }
  return target
}

const CONFETTI_TOKENS = ['--cube-yellow', '--cube-blue', '--cube-green', '--cube-red', '--cube-orange', '--cube-white']

function fireConfetti(target?: Element | { x: number; y: number }, small = false): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) return
  const styles = getComputedStyle(document.documentElement)
  const colors = CONFETTI_TOKENS.map((token) => styles.getPropertyValue(token).trim()).filter((value) => /^#[0-9a-f]{6}$/i.test(value))
  const origin = originOf(target)
  const base = { origin, colors: colors.length > 0 ? colors : undefined, shapes: ['square' as const], scalar: 1.1, ticks: 160, gravity: 1.1, disableForReducedMotion: true, zIndex: 90 }
  try {
    if (small) {
      // A second, softer beat (the milestone's XP landing): fewer pieces, a wider, lower fan.
      void confettiLib({ ...base, particleCount: 36, spread: 120, startVelocity: 30, scalar: 0.9, decay: 0.91 })
      return
    }
    void confettiLib({ ...base, particleCount: 80, spread: 78, startVelocity: 44 })
    void confettiLib({ ...base, particleCount: 40, spread: 140, startVelocity: 28, decay: 0.92 })
  } catch {
    /* confetti is a nicety */
  }
}

function tickElement(target: Element): void {
  if (prefersReducedMotion() || !(target instanceof HTMLElement || target instanceof SVGElement)) return
  try {
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
    const rect = target.getBoundingClientRect()
    const ring = document.createElement('span')
    ring.setAttribute('aria-hidden', 'true')
    ring.className = 'celebrate-tick-ring'
    Object.assign(ring.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    document.body.appendChild(ring)
    window.setTimeout(() => ring.remove(), 600)
  } catch {
    /* a nicety */
  }
}

export const celebration = {
  /** Tier 1: a correct move or answer. A ding, and a pop + green ring on `target`. */
  tick(target?: Element | null, options: { cube?: boolean | CelebrationCube } = {}): void {
    sound.play('tick')
    if (target) tickElement(target)
    // `{ cube: true }`: the registered cube hops too (or pass the cube to hop).
    const cube = options.cube === true ? cubes[cubes.length - 1] : options.cube || undefined
    try {
      cube?.celebrate?.('tick')
    } catch {
      /* a nicety */
    }
  },
  /** Tier 2: a stage learned, a pattern made, a personal best, a badge. */
  moment(options: MomentOptions): void {
    show(build('moment', options, 'feature'), options.cube)
  },
  /** Tier 3: first full solve, a level-up, all stages. */
  milestone(options: MilestoneOptions): void {
    show(build('milestone', options, 'feature'), options.cube)
  },
  /** Used by `reward()`: the same as moment/milestone, but its generic words yield to a feature's. */
  fromReward(tier: 'moment' | 'milestone', options: MilestoneOptions): void {
    show(build(tier, options, 'reward'), options.cube)
  },
  /** The one confetti burst, from an element or a point (0–1 of the viewport). `small`: the softer second beat. */
  confetti(target?: Element | { x: number; y: number }, options: { small?: boolean } = {}): void {
    fireConfetti(target, options.small)
  },
  /** Close what is showing now (the next waiting one, if any, follows). */
  dismiss(): void {
    const state = useCelebrations.getState()
    if (!state.current) return
    useCelebrations.setState({ current: null })
    if (state.held === 0) playNext()
  },
  /** Hold celebrations (they wait in line) until the returned function is called. */
  hold(): () => void {
    useCelebrations.setState((s) => ({ held: s.held + 1 }))
    let released = false
    return () => {
      if (released) return
      released = true
      useCelebrations.setState((s) => ({ held: Math.max(0, s.held - 1) }))
      const state = useCelebrations.getState()
      if (state.held === 0 && !state.current) playNext()
    }
  },
  /** Register the cube on screen; returns the unregister function. */
  registerCube(cube: CelebrationCube): () => void {
    cubes.push(cube)
    return () => {
      const at = cubes.lastIndexOf(cube)
      if (at >= 0) cubes.splice(at, 1)
    }
  },
  /** True while a celebration is on screen or waiting (news can join it instead of a toast). */
  get busy(): boolean {
    const state = useCelebrations.getState()
    return state.current !== null || state.queue.length > 0
  },
  /** Clear everything (tests). */
  reset(): void {
    cubes.length = 0
    useCelebrations.setState({ current: null, queue: [], held: 0, slot: null })
  },
}

/** Mark a Cube3D (by its ref) as the cube on screen for moments and milestones. */
export function useCelebrationCube(ref: RefObject<CelebrationCube | null>): void {
  useEffect(
    () =>
      celebration.registerCube({
        celebrate: (tier) => ref.current?.celebrate?.(tier),
      }),
    [ref],
  )
}
