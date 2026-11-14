import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { storageKey, useDailyChallenge, useLevel, useProgress, useStreak, useWeekActivity, XP } from '../../store'
import {
  AnimatedNumber,
  Badge,
  ButtonLink,
  Card,
  CardLink,
  CubeStage,
  cx,
  FACE_COLOR,
  Icon,
  isIconName,
  IsoCube,
  Page,
  ProgressBar,
  Reveal,
  Section,
  springs,
  StageTracker,
  Sticker,
  type CubeColor,
  type Face,
  type IconName,
} from '../../ui'
import { useNextStop, type NextStop } from '../learn/next'
import { heroCopy, pathSummary, stageItems, stagesDone } from './homeCopy'

// The live 3D cube (three.js, ~1 MB) loads after the page has painted. Until it is on screen
// a flat drawing of the same cube stands in, at the same size, so nothing jumps.
const HeroCube = lazy(() => import('./HeroCube'))

function greeting(now = new Date()): string {
  const hour = now.getHours()
  const part = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const day = now.toLocaleDateString('en-US', { weekday: 'long' })
  return `${day} · ${part}`
}

export default function HomePage() {
  const next = useNextStop()
  return (
    <Page>
      <Hero next={next} />
      <PathStrip next={next} />
      <Reveal className="mt-5 grid gap-5 md:grid-cols-[1.2fr_1fr]">
        <DailyCard />
        <StreakCard />
      </Reveal>
      <QuickLinks />
    </Page>
  )
}

// ───────────────────────── Hero ─────────────────────────

/**
 * The three visible faces of the free-play cube as he left it, read straight from its save
 * (`rubikku:play`) so the stand-in needs neither the play store nor the cube engine.
 * Facelet order is U R F D L B, nine each; anything unexpected draws a solved cube.
 */
function savedCubeFaces(): { top: CubeColor[]; front: CubeColor[]; right: CubeColor[] } | null {
  try {
    const raw = window.localStorage.getItem(storageKey('play'))
    const state: unknown = raw ? JSON.parse(raw)?.state?.session?.state : null
    if (typeof state !== 'string' || !/^[URFDLB]{54}$/.test(state)) return null
    const face = (from: number) => [...state.slice(from, from + 9)].map((letter) => FACE_COLOR[letter as Face])
    return { top: face(0), right: face(9), front: face(18) }
  } catch {
    return null
  }
}

const HELD_FACE = (color: CubeColor): CubeColor[] => new Array<CubeColor>(9).fill(color)

/** If the 3D cube cannot load (offline before it was cached), the drawing simply stays. */
class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function HeroStage() {
  // No save yet: the method's hold, yellow on top (the same cube the live one draws).
  const faces = useMemo(() => savedCubeFaces() ?? { top: HELD_FACE('yellow'), front: HELD_FACE('green'), right: HELD_FACE('orange') }, [])
  const [live, setLive] = useState(false)
  return (
    <CubeStage
      label="Your cube"
      className="aspect-[5/4] min-h-64 md:aspect-auto md:min-h-[21rem]"
      bottomRight={
        <ButtonLink to="/play" size="sm" variant="secondary" iconRight="arrowRight">
          Pick it up
        </ButtonLink>
      }
    >
      <div
        aria-hidden="true"
        data-testid="hero-standin"
        data-live={live}
        className={cx('pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-out', live && 'opacity-0')}
      >
        <IsoCube size={300} {...faces} style={{ width: 'auto', height: '56%', maxWidth: '70%' }} />
      </div>
      <QuietBoundary>
        <Suspense fallback={null}>
          <HeroCube onReady={() => setLive(true)} />
        </Suspense>
      </QuietBoundary>
    </CubeStage>
  )
}

function Hero({ next }: { next: NextStop | null }) {
  const level = useLevel()
  const copy = heroCopy(next)

  return (
    <Reveal as="section" className="grid items-stretch gap-5 md:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] md:gap-7">
      <div className="flex flex-col justify-center py-1 md:py-4">
        <p className="eyebrow">{greeting()}</p>
        <h1 className="mt-3 text-4xl text-ink xl:text-5xl">{copy.title}</h1>
        <p className="mt-3 max-w-md text-lg text-ink-muted">{copy.lede}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink to={copy.cta.to} size="lg" iconLeft={copy.cta.icon} iconRight={copy.cta.icon ? undefined : 'arrowRight'} data-testid="hero-cta">
            {copy.cta.label}
          </ButtonLink>
          <ButtonLink to="/play" size="lg" variant="secondary" iconLeft="cube">
            Free play
          </ButtonLink>
        </div>

        <Link to="/progress" className="group mt-7 block max-w-md rounded-md" aria-label={`Level ${level.level}, ${level.title}. ${level.xpToNext} XP to the next level.`}>
          <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
            <span className="font-bold text-ink">
              Level {level.level} <span className="font-semibold text-ink-muted">· {level.title}</span>
            </span>
            <span className="num font-semibold text-ink-muted">
              <AnimatedNumber value={level.xpIntoLevel} /> / {level.xpForNext} XP
            </span>
          </div>
          <ProgressBar label="Level progress" value={level.xpIntoLevel} max={level.xpForNext} tone="yellow" size="md" />
        </Link>
      </div>

      <HeroStage />
    </Reveal>
  )
}

// ───────────────────────── Path ─────────────────────────

function PathStrip({ next }: { next: NextStop | null }) {
  const lessons = useProgress((s) => s.lessons)
  const items = useMemo(() => stageItems(lessons, next), [lessons, next])
  return (
    <Reveal as="section" className="mt-6 md:mt-8">
      <Card padding="lg">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl text-ink">Your path</h2>
            <p className="text-base text-ink-muted" data-testid="path-summary">
              {pathSummary(next, stagesDone(lessons))}
            </p>
          </div>
          <ButtonLink to="/learn" variant="soft" size="sm" iconRight="chevronRight">
            Open the map
          </ButtonLink>
        </div>
        <StageTracker items={items} variant="strip" size="md" label="The eight stages" />
      </Card>
    </Reveal>
  )
}

// ───────────────────────── Daily challenge + streak ─────────────────────────

function DailyCard() {
  const { challenge, done, count, target, progressLabel } = useDailyChallenge()
  const icon: IconName = isIconName(challenge.icon) ? challenge.icon : 'target'
  const started = count > 0 && !done
  return (
    <Card padding="lg" className="flex flex-col" data-testid="daily-card" data-daily={challenge.id} data-done={done} data-count={count}>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Daily challenge</p>
        {done ? (
          <Badge tone="green" icon="check">
            Done today · +{XP.daily} XP
          </Badge>
        ) : (
          <Badge tone="yellow" icon="bolt">
            +{XP.daily} XP
          </Badge>
        )}
      </div>
      <div className="mt-4 flex items-start gap-4">
        <motion.span key={done ? 'done' : 'todo'} initial={done ? { scale: 0.6, rotate: -12 } : false} animate={{ scale: 1, rotate: 0 }} transition={springs.bouncy} className="shrink-0">
          <Sticker tone={done ? 'green' : 'white'} icon={done ? 'check' : icon} size="lg" />
        </motion.span>
        <div className="min-w-0">
          <h2 className="text-xl text-ink">{challenge.title}</h2>
          <p className="mt-1 text-base text-ink-muted">{done ? 'Nice work. A new challenge arrives tomorrow.' : challenge.detail}</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-bold">
          <span className={done ? 'text-cube-green-text' : 'text-ink'} data-testid="daily-progress">
            {progressLabel}
          </span>
          {started && <span className="text-ink-muted">Keep going</span>}
        </div>
        <ProgressBar label="Daily challenge progress" value={count} max={target} tone={done ? 'green' : 'accent'} size="sm" />
      </div>
      <div className="mt-auto pt-5">
        <ButtonLink to={challenge.to} variant={done ? 'secondary' : 'ink'} iconRight="arrowRight" data-testid="daily-cta">
          {done ? 'Do it again' : started ? 'Carry on' : 'Take it on'}
        </ButtonLink>
      </div>
    </Card>
  )
}

function StreakCard() {
  const streak = useStreak()
  const week = useWeekActivity()
  const message =
    streak.days === 0
      ? 'Practise today to start a streak.'
      : streak.doneToday
        ? 'Today counts. See you tomorrow.'
        : 'Practise today to keep it alive.'
  return (
    <Card padding="lg" className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Streak</p>
        {streak.best > 0 && <span className="text-xs font-bold text-ink-faint">Best {streak.best}</span>}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <Sticker tone="orange" icon="flame" size="lg" filled variant={streak.days > 0 ? 'solid' : 'locked'} />
        <p className="flex items-baseline gap-2">
          <span className="font-display text-5xl leading-none font-extrabold tracking-[-0.04em] text-ink">
            <AnimatedNumber value={streak.days} />
          </span>
          <span className="text-base font-bold text-ink-muted">{streak.days === 1 ? 'day' : 'days'}</span>
        </p>
      </div>
      <p className="mt-2 text-base text-ink-muted">{message}</p>
      <ol className="mt-auto grid grid-cols-7 gap-1.5 pt-5" aria-label="This week">
        {week.map((day, i) => {
          const active = day.xp > 0
          return (
            <li key={day.date} className="flex flex-col items-center gap-1.5" aria-label={`${day.label}: ${active ? `${day.xp} XP` : day.isFuture ? 'not yet' : 'no practice'}`}>
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...springs.bouncy, delay: 0.25 + i * 0.04 }}
                className={cx(
                  'grid aspect-square w-full max-w-9 place-items-center rounded-[9px]',
                  active ? 'bg-cube-orange text-on-orange shadow-[0_2px_0_0_var(--cube-orange-edge)]' : 'bg-inset',
                  day.isToday && !active && 'ring-2 ring-cube-orange ring-inset',
                  day.isFuture && 'opacity-50',
                )}
              >
                {active && <Icon name="check" size={15} weight={3} />}
              </motion.span>
              <span className={cx('text-2xs font-bold', day.isToday ? 'text-ink' : 'text-ink-faint')}>{day.label[0]}</span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

// ───────────────────────── Quick links ─────────────────────────

// Navigation is neutral: colour on Home means done (green), XP (yellow) and the streak (orange).
const LINKS: { to: string; title: string; line: string; icon: IconName }[] = [
  { to: '/notation', title: 'Notation', line: 'Read R, U′ and F2 at a glance.', icon: 'notation' },
  { to: '/solve', title: 'Solve my cube', line: 'Stuck? Show us your real cube.', icon: 'wand' },
  { to: '/timer', title: 'Timer', line: 'Scramble, solve, beat your best.', icon: 'timer' },
  { to: '/algorithms', title: 'Algorithms', line: 'Every sequence, one card each.', icon: 'cards' },
  { to: '/patterns', title: 'Patterns', line: 'Checkerboards and other tricks.', icon: 'grid' },
  { to: '/progress', title: 'Progress', line: 'Badges, levels and your streak.', icon: 'trophy' },
]

function QuickLinks() {
  return (
    <Section title="Jump in">
      <ul className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((link) => (
          <li key={link.to}>
            <CardLink to={link.to} padding="none" className="group flex h-full items-center gap-3.5 p-3.5 pr-3">
              <Sticker tone="white" icon={link.icon} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base font-bold text-ink">{link.title}</span>
                <span className="block text-sm leading-5 text-ink-muted">{link.line}</span>
              </span>
              <Icon name="chevronRight" size={18} className="text-ink-faint transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
            </CardLink>
          </li>
        ))}
      </ul>
    </Section>
  )
}
