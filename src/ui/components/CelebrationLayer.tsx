/**
 * Where celebrations appear. Mount once near the root (the app shell does). The API is
 * `celebration` in src/ui/celebrate.ts.
 */
import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { SOLVED } from '../../cube'
import { CELEBRATION_MS, celebration, useCelebrations, type Celebration } from '../celebrate'
import { cx } from '../cx'
import { springs, useMotionPref } from '../motion'
import { AnimatedNumber } from './AnimatedNumber'
import { BadgeArt } from './BadgeArt'
import { Sticker } from './Sticker'

// The child's own cube is the hero of a milestone. Loaded lazily: src/three imports src/ui, so a
// static import would be circular — and every page with a cube has fetched this chunk already.
const Cube3D = lazy(() => import('../../three/Cube3D').then((module) => ({ default: module.Cube3D })))
type CelebratingCube = import('../../three').Cube3DHandle

const BURST = ['--cube-yellow', '--cube-blue', '--cube-green', '--cube-red', '--cube-orange', '--cube-white', '--cube-green', '--cube-yellow']

/** Eight small stickers flying out from the art, once. */
function StickerBurst({ radius = 70, delay = 0.25 }: { radius?: number; delay?: number }) {
  const { reduced } = useMotionPref()
  if (reduced) return null
  return (
    <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2">
      {BURST.map((token, i) => {
        const angle = (i / BURST.length) * Math.PI * 2 - Math.PI / 2 + 0.3
        const r = radius * (0.85 + (i % 3) * 0.12)
        return (
          <motion.span
            key={i}
            className="absolute -top-1.5 -left-1.5 size-3 rounded-[3px] shadow-[inset_0_0_0_1px_var(--sticker-outline)]"
            style={{ background: `var(${token})` }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
            animate={{ x: Math.cos(angle) * r, y: Math.sin(angle) * r, scale: [0, 1.1, 0.7], opacity: [1, 1, 0], rotate: i % 2 ? 90 : -90 }}
            transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
          />
        )
      })}
    </span>
  )
}

/** The art lands like a keycap dropped on a desk: falls, settles, presses in once. */
function Landing({ children, delay = 0.06 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.span
      className="relative inline-grid place-items-center"
      initial={{ y: -26, scale: 1.16, rotate: -9, opacity: 0 }}
      animate={{ y: [-26, 0, 5, 0], scale: [1.16, 1, 0.97, 1], rotate: [-9, 0, 0, 0], opacity: [0, 1, 1, 1] }}
      transition={{ duration: 0.85, delay, times: [0, 0.45, 0.62, 1], ease: 'easeOut' }}
    >
      {children}
    </motion.span>
  )
}

function LevelKeycap({ level, size }: { level: number; size: number }) {
  return (
    <span
      className="relative grid place-items-center bg-cube-yellow text-on-yellow"
      style={{ width: size, height: size, borderRadius: size * 0.24, boxShadow: `0 ${Math.round(size * 0.055)}px 0 0 var(--cube-yellow-edge), inset 0 2px 0 rgb(255 255 255 / 0.45)` }}
    >
      <span className="flex flex-col items-center leading-none">
        <span className="font-sans font-extrabold tracking-[0.16em]" style={{ fontSize: size * 0.1 }}>
          LEVEL
        </span>
        <span className="num font-display font-extrabold tracking-[-0.05em]" style={{ fontSize: size * 0.5, marginTop: size * 0.02 }}>
          {level}
        </span>
      </span>
    </span>
  )
}

/**
 * A level-up's art is the level, unless a page's own celebration (or a headline achievement such
 * as the first solve) brought a badge to show.
 */
const showsLevel = (item: Celebration) =>
  item.level !== null && !item.headline && (item.tier === 'milestone' ? item.source === 'reward' || item.badges.length === 0 : item.source === 'reward' && item.badges.length === 0)

const PB_ART = { id: 'personal-best', category: 'speed', name: 'Personal best' } as const

function Art({ item, size }: { item: Celebration; size: number }) {
  // Art that is the news itself (a personal best's time) beats any badge that came with it.
  if (item.art) return <BadgeArt badge={PB_ART} text={item.art.time} tier={3} earned size={size} />
  if (showsLevel(item) && item.level !== null) return <LevelKeycap level={item.level} size={size} />
  const badge = item.badges[0]
  if (badge) return <BadgeArt badge={badge} earned size={size} />
  return <Sticker tone="green" icon={item.icon ?? 'check'} size="xl" className={size > 100 ? 'size-32! rounded-[30px]! [&_svg]:size-16' : undefined} />
}

const plus = (n: number) => `+${n.toLocaleString('en-US')}`

function XpPill({ xp, delay, large = false }: { xp: number; delay: number; large?: boolean }) {
  if (xp <= 0) return null
  return (
    <span className={cx('inline-flex items-baseline gap-1 rounded-full bg-cube-yellow-soft font-display font-extrabold text-cube-yellow-text', large ? 'px-4 py-1.5 text-2xl' : 'px-2.5 py-0.5 text-base')}>
      <AnimatedNumber value={xp} from={0} delay={delay} duration={0.9} format={plus} />
      <span className={large ? 'text-base' : 'text-xs'}>XP</span>
    </span>
  )
}

function Notes({ notes, large = false }: { notes: readonly string[]; large?: boolean }) {
  return notes.map((note) => (
    <span key={note} className={cx('inline-flex items-center gap-1 rounded-full bg-cube-green-soft font-bold text-cube-green-text', large ? 'px-3.5 py-1.5 text-sm' : 'px-2 py-0.5 text-xs')}>
      <svg viewBox="0 0 24 24" width={large ? 15 : 12} height={large ? 15 : 12} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
      {note}
    </span>
  ))
}

const momentEyebrow = (item: Celebration) => item.eyebrow ?? (item.badges.length > 0 ? (item.badges.length === 1 ? 'New badge' : `${item.badges.length} new badges`) : 'Nice')

function MomentCard({ item }: { item: Celebration }) {
  useEffect(() => {
    const timer = window.setTimeout(() => celebration.dismiss(), CELEBRATION_MS.moment)
    return () => window.clearTimeout(timer)
  }, [item.id])
  // Badges not used as the art ride along as a row of small keycaps under the title.
  const extras = item.art ? item.badges : item.badges.slice(1)
  // A level reached on the way (level 2, or any level on the timer) rides along as a line.
  const levelNote = item.level !== null && !showsLevel(item) ? `Level ${item.level}${item.levelTitle ? ` · ${item.levelTitle}` : ''}` : null
  return (
    <motion.div
      key={item.id}
      role="status"
      aria-live="polite"
      data-testid="celebration"
      data-tier="moment"
      initial={{ opacity: 0, y: -22, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.16 } }}
      transition={springs.gentle}
      onClick={() => celebration.dismiss()}
      className="pointer-events-auto relative flex w-[min(30rem,100%)] cursor-pointer items-center gap-4 rounded-xl bg-surface py-3 pr-6 pl-3.5 shadow-pop ring-1 ring-line"
    >
      {/* The border flashes green once. */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl ring-[3px] ring-cube-green ring-inset"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.9, delay: 0.35, ease: 'easeOut' }}
      />
      <span className="relative grid w-[5.5rem] shrink-0 place-items-center">
        <Landing>
          <Art item={item} size={84} />
        </Landing>
        <StickerBurst radius={64} delay={0.42} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block text-cube-yellow-text!">{momentEyebrow(item)}</span>
        <span className="mt-0.5 block font-display text-xl leading-6 font-extrabold text-ink sm:text-2xl sm:leading-7">{item.title}</span>
        {item.subtitle && <span className="mt-0.5 line-clamp-2 block text-sm text-ink-muted">{item.subtitle}</span>}
        {extras.length > 0 && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="celebration-badges">
            <span className="sr-only">{`And ${extras.length === 1 ? 'a badge' : `${extras.length} badges`}: ${extras.map((b) => b.name).join(', ')}.`}</span>
            {extras.map((badge, i) => (
              <motion.span
                key={badge.id}
                title={badge.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-1 text-xs font-bold text-ink-muted ring-1 ring-line"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...springs.bouncy, delay: 0.6 + i * 0.1 }}
              >
                <BadgeArt badge={badge} size={26} />
                <span aria-hidden="true">{badge.name}</span>
              </motion.span>
            ))}
          </span>
        )}
        {(item.xp > 0 || item.notes.length > 0 || levelNote) && (
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <XpPill xp={item.xp} delay={0.45} />
            <Notes notes={levelNote ? [levelNote, ...item.notes] : item.notes} />
          </span>
        )}
      </span>
    </motion.div>
  )
}

function MilestoneTakeover({ item }: { item: Celebration }) {
  const titleId = useId()
  const art = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const { reduced } = useMotionPref()

  const cube = useRef<CelebratingCube | null>(null)
  /** The XP has finished counting: the second beat (a smaller burst, the badge lands). */
  const [landed, setLanded] = useState(false)
  /**
   * The cube joins once the takeover has faded in: starting a WebGL view is a heavy moment for
   * the browser, and it must not stall the fade (the cube then springs in on its own).
   */
  const [cubeOn, setCubeOn] = useState(false)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const focus = requestAnimationFrame(() => button.current?.focus({ preventScroll: true }))
    // Beat 1: the cube does its victory spin (double spin, lift, glow) and the confetti fires.
    // (The cube's code may still be arriving: try again for a moment rather than skip the spin.)
    const mountCube = window.setTimeout(() => setCubeOn(true), 260)
    let spin = 0
    const startSpin = (tries: number) => {
      spin = window.setTimeout(() => {
        if (cube.current) void cube.current.celebrate('milestone').catch(() => {})
        else if (tries > 0) startSpin(tries - 1)
      }, tries === 12 ? 420 : 100)
    }
    startSpin(12)
    const confetti = window.setTimeout(() => celebration.confetti(art.current ?? undefined), 380)
    // Beat 2, as the XP lands: a second, smaller burst and a ripple through the layers, so the
    // hold has an event in it rather than 2 s of stillness.
    const second = window.setTimeout(() => {
      setLanded(true)
      celebration.confetti(art.current ?? undefined, { small: true })
      void cube.current?.celebrate('stage').catch(() => {})
    }, 2250)
    const close = window.setTimeout(() => celebration.dismiss(), CELEBRATION_MS.milestone)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        celebration.dismiss()
      } else if (event.key === 'Tab') {
        // aria-modal: focus stays in the dialog (its one button) until it closes (QA 2, N7).
        event.preventDefault()
        button.current?.focus({ preventScroll: true })
      }
    }
    // Focus that escapes anyway (a click behind, a screen reader) is brought back.
    const onFocusIn = (event: FocusEvent) => {
      const dialog = button.current?.closest('[role=dialog]')
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) button.current?.focus({ preventScroll: true })
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(focus)
      window.clearTimeout(mountCube)
      window.clearTimeout(spin)
      window.clearTimeout(second)
      window.clearTimeout(confetti)
      window.clearTimeout(close)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocusIn)
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true })
    }
  }, [item.id])

  const act = () => {
    celebration.dismiss()
    const action = item.action
    if (action?.onClick) action.onClick()
    if (action?.to) window.location.hash = `#${action.to}`
  }
  const words = item.title.split(' ')
  const eyebrow = item.eyebrow ?? (item.level !== null ? 'Level up' : 'Milestone')
  const levelArt = showsLevel(item)
  const extras = levelArt ? item.badges : item.badges.slice(1)
  const levelChip = !levelArt && item.level !== null
  /** A badge or a level to show beside the XP (a plain milestone has neither). */
  const secondary = levelArt || item.badges.length > 0

  return (
    <motion.div
      key={item.id}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="celebration"
      data-tier="milestone"
      className="celebrate-takeover pointer-events-auto fixed inset-y-0 right-0 left-0 z-[75] grid cursor-pointer place-items-center overflow-hidden md:left-(--rail-w) lg:left-(--sidebar-w)"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      transition={{ duration: 0.25 }}
      onClick={() => celebration.dismiss()}
    >
      <div className="relative flex w-full max-w-xl flex-col items-center px-6 py-10 text-center">
        <motion.p className="eyebrow text-cube-yellow-text!" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springs.gentle, delay: 0.05 }}>
          {eyebrow}
        </motion.p>

        {/* The hero: the child's own cube, solved, doing its victory spin on a lit floor. */}
        <span ref={art} className="relative mt-3 grid size-[clamp(11rem,31vh,15rem)] place-items-center" data-testid="celebration-cube">
          <span aria-hidden="true" className="celebrate-cube-spot absolute inset-[-12%] rounded-full" />
          {!reduced &&
            [0, 1].map((i) => (
              <motion.span
                key={i}
                aria-hidden="true"
                className="absolute inset-[8%] rounded-full ring-2 ring-cube-yellow"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: [0.7, 1.55], opacity: [0.6, 0] }}
                transition={{ duration: 1.3, delay: 0.42 + i * 0.22, ease: 'easeOut' }}
              />
            ))}
          {cubeOn && (
          <motion.span
            // The cube's contact shadow runs past the canvas: fade the square's edges into the wash.
            className="relative size-full [mask-image:radial-gradient(farthest-side,#000_80%,transparent)]"
            initial={{ opacity: 0, scale: 0.7, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={springs.bouncy}
          >
            <Suspense
              fallback={
                <span className="grid size-full place-items-center">
                  <Art item={item} size={150} />
                </span>
              }
            >
              <Cube3D
                ref={cube}
                state={SOLVED}
                mode="playback"
                orbit={false}
                zoom={false}
                keyboard={false}
                faceLabels={false}
                turnSound={false}
                label="Your cube, solved"
                debugId="celebration"
                className="size-full"
              />
            </Suspense>
          </motion.span>
          )}
          <StickerBurst radius={150} delay={0.5} />
        </span>

        <h2 id={titleId} className="mt-5 font-display text-4xl leading-[1.05] font-extrabold tracking-[-0.03em] text-ink sm:text-5xl md:text-[3.5rem]">
          {words.map((word, i) => (
            <motion.span key={i} className="inline-block" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springs.gentle, delay: 0.55 + i * 0.06 }}>
              {word}
              {i < words.length - 1 ? ' ' : ''}
            </motion.span>
          ))}
        </h2>
        {item.subtitle && (
          <motion.p className="mt-3 max-w-md text-lg text-ink-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.85 }}>
            {item.subtitle}
          </motion.p>
        )}

        {(item.xp > 0 || extras.length > 0 || levelChip || item.notes.length > 0 || secondary) && (
          <motion.div className="mt-5 flex flex-wrap items-center justify-center gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springs.gentle, delay: 0.95 }}>
            {/* The badge (or the level) is the supporting act: it lands beside the XP. */}
            {secondary && (
              <span className="relative grid place-items-center" data-testid="celebration-art">
                <Landing delay={1.05}>
                  <Art item={item} size={60} />
                </Landing>
                {landed && <StickerBurst radius={46} delay={0} />}
              </span>
            )}
            <XpPill xp={item.xp} delay={1.0} large />
            <Notes notes={item.notes} large />
            {levelChip && (
              <span className="inline-flex items-center gap-2 rounded-full bg-cube-yellow py-1 pr-3.5 pl-1.5 text-sm font-extrabold text-on-yellow shadow-[0_2px_0_0_var(--cube-yellow-edge)]">
                <span className="grid size-7 place-items-center rounded-full bg-[rgb(255_255_255/0.45)] font-display">{item.level}</span>
                Level up{item.levelTitle ? ` · ${item.levelTitle}` : ''}
              </span>
            )}
            {extras.map((badge, i) => (
              <motion.span key={badge.id} className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pr-3.5 pl-1.5 text-sm font-bold text-ink shadow-1 ring-1 ring-line" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...springs.bouncy, delay: 1.1 + i * 0.12 }}>
                <BadgeArt badge={badge} size={30} />
                {badge.name}
              </motion.span>
            ))}
          </motion.div>
        )}

        <motion.div className="mt-8 flex flex-col items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 1.15 }}>
          <button
            ref={button}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              act()
            }}
            className="key key-primary h-14 rounded-md px-8 font-display text-lg font-bold"
            data-testid="celebration-action"
          >
            {item.action?.label ?? 'Keep going'}
          </button>
          <span className="text-sm text-ink-muted">Tap anywhere to carry on</span>
        </motion.div>
      </div>
      {/* How long is left, so leaving by itself is no surprise. */}
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-line">
        <motion.span
          className="absolute inset-0 origin-left bg-cube-yellow"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: CELEBRATION_MS.milestone / 1000, ease: 'linear' }}
        />
      </span>
    </motion.div>
  )
}

/**
 * A place in a page's own flow for moment cards, used instead of the top of the content column
 * while it is mounted and `media` matches. The Timer puts one under its pad on phones, so a
 * personal best or a badge never covers the pad or its result.
 *
 *   <CelebrationSlot media="(max-width: 639.98px)" />
 */
export function CelebrationSlot({ media, className }: { media?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const query = media && typeof window.matchMedia === 'function' ? window.matchMedia(media) : null
    const sync = () => {
      const on = !query || query.matches
      const { slot } = useCelebrations.getState()
      if (on && slot !== element) useCelebrations.setState({ slot: element })
      else if (!on && slot === element) useCelebrations.setState({ slot: null })
    }
    sync()
    query?.addEventListener('change', sync)
    return () => {
      query?.removeEventListener('change', sync)
      if (useCelebrations.getState().slot === element) useCelebrations.setState({ slot: null })
    }
  }, [media])
  return <div ref={ref} className={className} data-testid="celebration-slot" />
}

/** Mount once (the app shell does). Renders the moment card and the milestone takeover. */
export function CelebrationLayer() {
  const current = useCelebrations((s) => s.current)
  const slot = useCelebrations((s) => s.slot)
  if (typeof document === 'undefined') return null
  const moment = current?.tier === 'moment' ? current : null
  return (
    <>
      {slot
        ? // In the page's flow: the space opens, the card lands in it, the space closes after.
          createPortal(
            <AnimatePresence>
              {moment && (
                <motion.div
                  key={moment.id}
                  className="-mx-3 -mb-4 flex justify-center overflow-hidden px-3 pt-3 pb-4"
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0, transition: { duration: 0.2 } }}
                  transition={springs.gentle}
                >
                  <AnimatePresence mode="wait">
                    <MomentCard key={moment.id} item={moment} />
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>,
            slot,
          )
        : null}
      {createPortal(
        <>
          <div className="celebrate-moment-slot" aria-live="polite">
            <AnimatePresence mode="wait">{!slot && moment && <MomentCard key={moment.id} item={moment} />}</AnimatePresence>
          </div>
          <AnimatePresence>{current?.tier === 'milestone' && <MilestoneTakeover key={current.id} item={current} />}</AnimatePresence>
        </>,
        document.body,
      )}
    </>
  )
}
