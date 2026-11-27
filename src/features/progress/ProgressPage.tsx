import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { STAGES } from '../../store'
import { motion } from 'motion/react'
import {
  BADGES,
  countPatterns,
  LEVEL_TITLES,
  levelFromXp,
  useLearningPath,
  useLevel,
  useProgress,
  useStreak,
  useToday,
  xpForLevel,
  type BadgeCategory,
  type BadgeDef,
  type ProgressState,
} from '../../store'
import {
  AnimatedNumber,
  Badge,
  BadgeArt,
  badgeTier,
  Button,
  ButtonLink,
  Card,
  cx,
  EmptyState,
  Icon,
  isIconName,
  Modal,
  Page,
  PageHeader,
  ProgressBar,
  ProgressRing,
  Reveal,
  springs,
  StageTracker,
  Sticker,
  useMotionPref,
  type IconName,
  type StageTrackerItem,
} from '../../ui'
import { useLearn } from '../learn/learnStore'
import { useNextStop } from '../learn/next'
import { formatResult } from '../timer/logic/format'
import {
  badgeLink,
  badgeProgress,
  buildHeatMap,
  CATEGORY_TITLE,
  closestBadge,
  describeEntry,
  describeHeatDay,
  formatLongDate,
  formatShortDate,
  nextInFamily,
  timeAgo,
  type HeatDay,
} from './progressView'
import { useSeenBadges } from './seenStore'

const iconOf = (name: string, fallback: IconName = 'medal'): IconName => (isIconName(name) ? name : fallback)

export default function ProgressPage() {
  return (
    <Page>
      <PageHeader title="Progress" lede="Your trophy room, your level and your streak." />
      <TrophyRoom />
      <Reveal className="mt-5 grid gap-5 md:mt-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <LevelCard />
        <StreakCard />
      </Reveal>
      <Reveal className="mt-5 grid gap-5 md:mt-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <PathCard />
        <div className="flex flex-col gap-5">
          <Numbers />
          <HistoryCard />
        </div>
      </Reveal>
    </Page>
  )
}

// ───────────────────────── Level ─────────────────────────

function LevelCard() {
  const level = useLevel()
  const badgeCount = useProgress((s) => Object.keys(s.badges).length)
  const path = useLearningPath()
  const nextTitle = levelFromXp(xpForLevel(level.level + 1)).title
  const sameTitle = nextTitle === level.title && level.level >= LEVEL_TITLES.length

  return (
    <Card padding="lg" className="flex flex-col">
      <div className="flex items-center gap-5">
        <ProgressRing value={level.xpIntoLevel} max={level.xpForNext} size={112} thickness={11} tone="yellow" label={`Level ${level.level}: ${level.xpIntoLevel} of ${level.xpForNext} XP`} className="shrink-0">
          <span className="flex flex-col items-center">
            <span className="eyebrow !text-2xs">Level</span>
            <span className="-mt-0.5 font-display text-[2.75rem] leading-none font-extrabold tracking-[-0.04em] text-ink" data-testid="level-number">
              <AnimatedNumber value={level.level} />
            </span>
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl leading-7 text-balance text-ink xl:text-3xl xl:leading-9">{level.title}</h2>
          <p className="num mt-1 text-base font-bold whitespace-nowrap text-ink">
            <AnimatedNumber value={level.xpIntoLevel} /> <span className="font-semibold text-ink-muted">/ {level.xpForNext} XP</span>
          </p>
        </div>
      </div>
      <p className="mt-4 flex items-center gap-2 rounded-sm bg-cube-yellow-soft py-2 pr-3 pl-2.5 text-sm font-semibold text-balance text-cube-yellow-text">
        <Icon name="bolt" size={15} filled className="shrink-0" />
        <span className="min-w-0">
          <span className="num font-extrabold">{level.xpToNext} XP</span> to level {level.level + 1}
          {!sameTitle && <>: {nextTitle}</>}
        </span>
      </p>

      <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-line pt-4 max-md:mt-5">
        {[
          { label: 'Total XP', value: level.xp, of: null },
          { label: 'Badges', value: badgeCount, of: BADGES.length },
          { label: 'Stages', value: path.completed, of: path.total },
        ].map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="eyebrow">{item.label}</dt>
            <dd className="mt-0.5 flex items-baseline gap-1">
              <span className="font-display text-2xl leading-8 font-extrabold tracking-[-0.03em] text-ink">
                <AnimatedNumber value={item.value} />
              </span>
              {item.of !== null && <span className="num text-sm font-bold text-ink-muted">/ {item.of}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

// ───────────────────────── Streak + heat-map ─────────────────────────

const HEAT_FILL = [
  'bg-inset shadow-[inset_0_0_0_1px_var(--line)]',
  'bg-[color-mix(in_oklab,var(--cube-orange)_28%,var(--inset))]',
  'bg-[color-mix(in_oklab,var(--cube-orange)_52%,var(--inset))]',
  'bg-[color-mix(in_oklab,var(--cube-orange)_76%,var(--inset))]',
  'bg-cube-orange',
] as const

function StreakCard() {
  const streak = useStreak()
  const activity = useProgress((s) => s.activity)
  const today = useToday()
  const map = useMemo(() => buildHeatMap(activity, today, 12), [activity, today])
  const [cursor, setCursor] = useState<{ week: number; day: number } | null>(null)
  const { reduced } = useMotionPref()

  const picked: HeatDay | null = cursor ? map.weeks[cursor.week][cursor.day] : null
  const message = streak.days === 0 ? 'Practise today to start a streak.' : streak.doneToday ? 'Today counts. See you tomorrow.' : 'Practise today to keep it alive.'
  const summary = map.activeDays === 0 ? 'No practice days yet. Your first one lights up here.' : `${map.activeDays} practice ${map.activeDays === 1 ? 'day' : 'days'} in the last 12 weeks`

  const onKeyDown = (event: KeyboardEvent) => {
    const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (event.key === 'Escape') return setCursor(null)
    const step = delta[event.key]
    if (!step) return
    event.preventDefault()
    setCursor((c) => {
      if (!c) return { week: map.weeks.length - 1, day: Math.max(0, map.weeks[map.weeks.length - 1].findIndex((d) => d.isToday)) }
      return { week: Math.min(map.weeks.length - 1, Math.max(0, c.week + step[0])), day: Math.min(6, Math.max(0, c.day + step[1])) }
    })
  }

  return (
    <Card padding="lg" className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Sticker tone="orange" icon="flame" size="lg" filled variant={streak.days > 0 ? 'solid' : 'locked'} />
          <div>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-5xl leading-none font-extrabold tracking-[-0.04em] text-ink" data-testid="streak-days">
                <AnimatedNumber value={streak.days} />
              </span>
              <span className="text-base font-bold whitespace-nowrap text-ink-muted">day streak</span>
            </p>
          </div>
        </div>
        {streak.best > 0 && (
          <Badge tone="orange" icon="trophy" className="shrink-0">
            Best {streak.best}
          </Badge>
        )}
      </div>
      <p className="mt-2.5 text-base text-ink-muted">{message}</p>

      <div
        className="mt-5 rounded-md outline-offset-4"
        tabIndex={0}
        role="group"
        aria-label={`Practice calendar, last 12 weeks. ${summary}. Use the arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onBlur={() => setCursor(null)}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setCursor(null)
        }}
        data-testid="heatmap"
      >
        <div className="grid grid-cols-[1.25rem_repeat(12,minmax(0,1fr))] gap-x-[5px] gap-y-1" aria-hidden="true">
          <span />
          {map.monthLabels.map((label, i) => (
            <span key={i} className="h-4 overflow-visible text-2xs font-bold whitespace-nowrap text-ink-faint">
              {label}
            </span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-[1.25rem_repeat(12,minmax(0,1fr))] gap-[5px]" aria-hidden="true">
          <div className="grid grid-rows-7 gap-[5px] text-2xs font-bold text-ink-faint">
            {['M', '', 'W', '', 'F', '', 'S'].map((label, i) => (
              <span key={i} className="flex items-center">
                {label}
              </span>
            ))}
          </div>
          {map.weeks.map((week, w) => (
            <div key={week[0].date} className="grid grid-rows-7 gap-[5px]">
              {week.map((day, d) => {
                const isPicked = cursor?.week === w && cursor.day === d
                return (
                  <motion.span
                    key={day.date}
                    data-level={day.level}
                    data-date={day.date}
                    initial={reduced ? false : { opacity: 0, scale: 0.5 }}
                    animate={{ opacity: day.isFuture ? 0.35 : 1, scale: 1 }}
                    transition={{ ...springs.snappy, delay: reduced ? 0 : 0.15 + w * 0.025 + d * 0.008 }}
                    onPointerEnter={() => setCursor({ week: w, day: d })}
                    onPointerDown={() => setCursor({ week: w, day: d })}
                    className={cx(
                      'aspect-square w-full rounded-[5px]',
                      HEAT_FILL[day.level],
                      day.isToday && day.level === 0 && 'shadow-[inset_0_0_0_2px_var(--cube-orange)]!',
                      isPicked && 'outline-2 outline-offset-1 outline-ink',
                    )}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="text-sm font-semibold text-ink-muted" role="status" data-testid="heatmap-readout">
          {picked ? describeHeatDay(picked) : summary}
        </p>
        <p className="flex items-center gap-1 text-2xs font-bold text-ink-faint" aria-hidden="true">
          Less
          {HEAT_FILL.map((fill, i) => (
            <span key={i} className={cx('size-3 rounded-[3.5px]', fill)} />
          ))}
          More
        </p>
      </div>
    </Card>
  )
}

// ───────────────────────── Key numbers ─────────────────────────

/** Three numbers that matter, as one row. Colour only where it has a job: green = solved. */
function Numbers() {
  const counters = useProgress((s) => s.counters)
  const bestSolveMs = useProgress((s) => s.bestSolveMs)
  const algorithms = useProgress((s) => s.algorithms.length)
  const solves = counters.solves ?? 0
  return (
    <Card padding="none" className="grid divide-line max-md:grid-cols-3 max-md:divide-x md:divide-y" aria-label="By the numbers">
      <NumberCell label="Solved" value={<AnimatedNumber value={solves} />} icon="cube" tone={solves > 0 ? 'green' : 'white'} />
      <NumberCell label="Best time" value={bestSolveMs ? formatResult(bestSolveMs) : '—'} icon="timer" tone="white" />
      <NumberCell label="Algorithms" value={<AnimatedNumber value={algorithms} />} icon="cards" tone="white" />
    </Card>
  )
}

function NumberCell({ label, value, icon, tone }: { label: string; value: ReactNode; icon: IconName; tone: 'green' | 'white' }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2 p-4 md:flex-row md:items-center md:gap-3 md:px-5 md:py-3.5">
      <Sticker size="sm" tone={tone} icon={icon} />
      <p className="eyebrow order-2 max-w-full truncate md:order-1 md:grow">{label}</p>
      <p className="num order-1 font-display text-2xl leading-7 font-extrabold tracking-[-0.03em] text-ink md:order-2">{value}</p>
    </div>
  )
}

// ───────────────────────── Learning path ─────────────────────────

/** The whole path — warm-up, eight stages, full solve — in the shared StageTracker. */
function PathCard() {
  const progress = useProgress((s) => s.lessons)
  const lessons = useLearn((s) => s.lessons)
  const capstone = useLearn((s) => s.capstone)
  const next = useNextStop()
  const stagesDone = STAGES.filter((stage) => progress[stage.id]?.completedAt).length

  const items = useMemo((): StageTrackerItem[] => {
    const primerDone = Boolean(lessons.primer?.completed) || stagesDone > 0
    const stateOf = (id: string, done: boolean, opened: boolean) => (done ? 'done' : next?.id === id ? 'current' : opened ? 'peeked' : 'locked')
    const when = (iso: string | null | undefined) => (iso ? formatShortDate(iso) : 'Done')
    const meta = (state: StageTrackerItem['state'], date?: string | null) =>
      state === 'done' ? when(date) : state === 'current' ? 'Up next' : state === 'peeked' ? 'Peeked' : <Icon name="lock" size={13} title="Locked" />
    const primerState = stateOf('primer', primerDone, Boolean(lessons.primer))
    const out: StageTrackerItem[] = [
      { id: 'primer', number: 0, icon: 'cube', title: 'Meet your cube', summary: 'The warm-up: faces, layers and moves.', state: primerState, meta: primerState === 'done' ? 'Done' : meta(primerState), to: '/learn/primer' },
    ]
    for (const stage of STAGES) {
      const lesson = progress[stage.id]
      const state = stateOf(stage.id, Boolean(lesson?.completedAt), Boolean(lessons[stage.id]) || Boolean(lesson))
      out.push({ id: stage.id, number: stage.number, title: stage.title, summary: stage.goal, state, meta: meta(state, lesson?.completedAt), to: `/learn/${stage.id}` })
    }
    const capState = stateOf('full-solve', capstone.solves > 0, capstone.session !== null)
    out.push({
      id: 'full-solve',
      number: 9,
      icon: 'trophy',
      title: 'Full solve',
      summary: capstone.solves > 1 ? `Scrambled to solved — ${capstone.solves} times.` : 'Scrambled to solved, start to finish.',
      state: capState,
      meta: capState === 'done' ? 'Done' : meta(capState),
      to: '/learn/full-solve',
    })
    return out
  }, [progress, lessons, capstone, next, stagesDone])

  return (
    <Card padding="lg" className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-ink">Learning path</h2>
          <p className="text-base text-ink-muted">{stagesDone === STAGES.length ? (capstone.solves > 0 ? 'Every stage and a full solve. The whole method.' : 'All eight stages. Now a full solve.') : `${stagesDone} of ${STAGES.length} stages complete`}</p>
        </div>
        <ButtonLink to="/learn" variant="soft" size="sm" iconRight="chevronRight" className="shrink-0">
          Map
        </ButtonLink>
      </div>
      <StageTracker className="mt-4" items={items} variant="list" size="sm" label="Learning path" />
    </Card>
  )
}

// ───────────────────────── History ─────────────────────────

/** Recent activity and the smaller numbers, folded away until he asks. */
function HistoryCard() {
  const log = useProgress((s) => s.log)
  const counters = useProgress((s) => s.counters)
  const patternList = useProgress((s) => s.patterns)
  const { tricks: patterns, flags } = countPatterns(patternList)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!open) return
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [open])
  const entries = log.slice(0, 10)
  const latest = log[0]
  return (
    <Card padding="none" className="overflow-hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-16 w-full items-center gap-3.5 px-5 py-3 text-left transition-colors hover:bg-surface-2" data-testid="history-toggle">
        <Sticker size="sm" tone="white" icon="calendar" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold text-ink">History</span>
          <span className="block truncate text-sm text-ink-muted">{latest ? `Last: ${describeEntry(latest).label.toLowerCase()}, ${timeAgo(latest.at, now)}` : 'Nothing yet'}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={springs.snappy} className="text-ink-muted">
          <Icon name="chevronDown" size={20} />
        </motion.span>
      </button>
      <motion.div initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={springs.gentle} className="overflow-hidden" aria-hidden={!open}>
        <div className="border-t border-line px-5 pt-3 pb-5">
          <dl className="grid grid-cols-2 gap-3 pb-3 sm:grid-cols-4">
            {[
              { label: 'Patterns', value: patterns },
              { label: 'Flags', value: flags },
              { label: 'Moves read', value: counters.notationCorrect ?? 0 },
              { label: 'Dailies', value: counters.dailyChallenges ?? 0 },
            ].map((item) => (
              <div key={item.label}>
                <dt className="eyebrow">{item.label}</dt>
                <dd className="num font-display text-xl font-extrabold text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
          {entries.length === 0 ? (
            <EmptyState variant="plain" icon="sparkle" tone="white" title="Nothing yet" description="Finish a lesson or a solve and it shows up here." className="px-0 py-4" />
          ) : (
            <ol className="divide-y divide-line border-t border-line" data-testid="activity-feed">
              {entries.map((entry, i) => {
                const view = describeEntry(entry)
                return (
                  <li key={`${entry.at}-${i}`} className="flex items-center gap-3 py-2.5">
                    <Sticker size="sm" tone="white" variant="soft" icon={iconOf(view.icon, 'sparkle')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{view.label}</span>
                      <span className="block text-xs text-ink-muted">{timeAgo(entry.at, now)}</span>
                    </span>
                    {entry.xp > 0 && <span className="num shrink-0 text-sm font-bold text-cube-yellow-text">+{entry.xp} XP</span>}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </motion.div>
    </Card>
  )
}

// ───────────────────────── Trophy room ─────────────────────────

const CATEGORIES: BadgeCategory[] = ['learning', 'solving', 'speed', 'streak', 'skills']

/** The hero: every badge as an object on a lit shelf, the latest one in the spotlight. */
function TrophyRoom() {
  const unlocked = useProgress((s) => s.badges)
  const data = useProgress() as ProgressState
  const streak = useStreak()
  const level = useLevel()
  const seen = useSeenBadges((s) => s.seenBadges)
  const [openId, setOpenId] = useState<string | null>(null)
  /** Shelves opened to show every locked badge. */
  const [expanded, setExpanded] = useState<ReadonlySet<BadgeCategory>>(() => new Set())
  // Decide once, on arrival, which badges are new: earned in the last day and not seen here
  // before. They stay marked for this visit. (A badge from last week is not "New", even on a
  // first visit to this page.)
  const [fresh] = useState(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    return new Set(Object.keys(unlocked).filter((id) => !seen.includes(id) && Date.parse(unlocked[id]) > dayAgo))
  })

  useEffect(() => {
    const ids = Object.keys(unlocked)
    if (ids.length === 0) return
    const timer = window.setTimeout(() => useSeenBadges.getState().markSeen(ids), 1500)
    return () => window.clearTimeout(timer)
  }, [unlocked])

  const progressOf = (id: string) => badgeProgress(id, data, streak.days, level.level)
  const count = Object.keys(unlocked).length
  const latestId = Object.entries(unlocked).sort((a, b) => b[1].localeCompare(a[1]))[0]?.[0]
  const latest = latestId ? BADGES.find((b) => b.id === latestId) : undefined
  const closest = closestBadge(BADGES, unlocked, progressOf)
  const open = openId ? (BADGES.find((badge) => badge.id === openId) ?? null) : null

  return (
    <Reveal as="section" className="cabinet p-5 sm:p-7" >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="eyebrow">Trophy room</p>
          <h2 className="mt-1 flex items-baseline gap-2 font-display text-4xl leading-none font-extrabold tracking-[-0.03em] text-ink sm:text-5xl">
            <AnimatedNumber value={count} />
            <span className="text-xl font-bold tracking-normal text-ink-muted sm:text-2xl">of {BADGES.length} badges</span>
          </h2>
          <p className="mt-2.5 max-w-md text-base text-ink-muted" data-testid="badge-closest">
            {closest ? (
              <>
                Closest: <span className="font-bold text-ink">{closest.badge.name}</span> — {closest.progress.value} of {closest.progress.max} {closest.progress.unit}.
              </>
            ) : count === 0 ? (
              'Thirty to collect. Tap any one to see how to earn it.'
            ) : (
              'Tap any badge for the story behind it.'
            )}
          </p>
        </div>
        {latest && (
          <button type="button" onClick={() => setOpenId(latest.id)} className="group flex items-center gap-3.5 rounded-lg bg-surface py-2.5 pr-5 pl-3 text-left shadow-2 ring-1 ring-line transition-transform duration-200 hover:-translate-y-0.5" data-testid="badge-latest">
            <BadgeArt badge={latest} size={64} />
            <span className="min-w-0">
              <span className="eyebrow block text-cube-yellow-text!">Latest</span>
              <span className="block font-display text-lg leading-6 font-bold text-ink">{latest.name}</span>
              <span className="block text-sm text-ink-muted">{formatLongDate(unlocked[latest.id])}</span>
            </span>
          </button>
        )}
      </div>

      <div className="mt-6 space-y-5">
        {CATEGORIES.map((category) => {
          const list = BADGES.filter((badge) => badge.category === category)
          const got = list.filter((badge) => unlocked[badge.id]).length
          // A shelf shows what he has and the next one to go for; the rest of the locked ones
          // wait behind "+N more" (a phone would otherwise scroll past thirty grey shapes).
          const firstLocked = list.find((badge) => !unlocked[badge.id])
          const shown = expanded.has(category) ? list : list.filter((badge) => unlocked[badge.id] || badge === firstLocked)
          const hidden = list.length - shown.length
          return (
            <div key={category} className="shelf" data-testid="badge-shelf" data-category={category}>
              <h3 className="mb-2 flex items-baseline gap-2">
                <span className="eyebrow text-ink-muted!">{CATEGORY_TITLE[category]}</span>
                <span className="num text-xs font-bold text-ink-muted">
                  {got} / {list.length}
                </span>
              </h3>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-x-2 gap-y-4">
                {shown.map((badge, i) => (
                  <BadgeTile key={badge.id} badge={badge} unlockedAt={unlocked[badge.id]} isNew={fresh.has(badge.id)} index={i} progress={unlocked[badge.id] ? null : progressOf(badge.id)} onOpen={() => setOpenId(badge.id)} />
                ))}
                {hidden > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setExpanded((now) => new Set(now).add(category))}
                      className="flex w-full flex-col items-center rounded-md px-1 pt-1.5 pb-1 text-center transition-transform duration-200 ease-out hover:-translate-y-1 active:scale-[0.97]"
                      aria-label={`Show ${hidden} more ${CATEGORY_TITLE[category].toLowerCase()} badges`}
                      data-testid="badge-more"
                    >
                      <span className="grid size-16 place-items-center rounded-[18px] border-2 border-dashed border-line-strong font-display text-lg font-extrabold text-ink-muted">+{hidden}</span>
                      <span className="mt-3 block font-display text-xs leading-4 font-bold text-ink-muted">more to earn</span>
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )
        })}
      </div>
      <BadgeDetail badge={open} unlocked={unlocked} onClose={() => setOpenId(null)} onOpen={setOpenId} />
    </Reveal>
  )
}

function BadgeTile({
  badge,
  unlockedAt,
  isNew,
  index,
  progress,
  onOpen,
}: {
  badge: BadgeDef
  unlockedAt?: string
  isNew: boolean
  index: number
  progress: { value: number; max: number } | null
  onOpen: () => void
}) {
  const got = Boolean(unlockedAt)
  const { reduced } = useMotionPref()
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid="badge-tile"
        data-unlocked={got}
        aria-label={`${badge.name}. ${got ? `Unlocked ${formatLongDate(unlockedAt!)}` : `Locked. ${badge.description}`}`}
        className="group relative flex w-full flex-col items-center rounded-md px-1 pt-1.5 pb-1 text-center transition-transform duration-200 ease-out hover:-translate-y-1 active:scale-[0.97]"
      >
        {got && isNew && (
          <Badge tone="yellow" variant="solid" size="sm" className="absolute top-0 right-0 z-10">
            New
          </Badge>
        )}
        <motion.span
          className="relative block"
          initial={reduced || !got ? false : isNew ? { rotateY: 180, scale: 0.6, opacity: 0 } : { scale: 0.8, opacity: 0 }}
          whileInView={{ rotateY: 0, scale: 1, opacity: 1 }}
          viewport={{ once: true, margin: '0px 0px -40px 0px' }}
          transition={{ ...springs.bouncy, delay: reduced ? 0 : (isNew ? 0.25 : 0.05) + index * 0.04 }}
        >
          <BadgeArt badge={badge} earned={got} size={64} />
        </motion.span>
        {/* the shelf it stands on */}
        <span aria-hidden="true" className={cx('mt-1 h-2 w-16 rounded-[50%]', got ? 'bg-[radial-gradient(closest-side,var(--stage-shadow),transparent)] opacity-70' : 'opacity-0')} />
        <span className={cx('mt-1 line-clamp-2 block font-display text-xs leading-4 font-bold', got ? 'text-ink' : 'text-ink-muted')}>{badge.name}</span>
        {!got && progress && progress.value > 0 ? (
          <span className="num mt-1 block text-2xs font-bold text-cube-yellow-text">
            {progress.value} / {progress.max}
          </span>
        ) : null}
      </button>
    </li>
  )
}

function BadgeDetail({ badge, unlocked, onClose, onOpen }: { badge: BadgeDef | null; unlocked: Readonly<Record<string, string>>; onClose: () => void; onOpen: (id: string) => void }) {
  // Keep the last badge while the dialog animates out.
  const [shown, setShown] = useState<BadgeDef | null>(badge)
  if (badge && badge !== shown) setShown(badge)
  const b = badge ?? shown
  const data = useProgress() as ProgressState
  const streak = useStreak()
  const level = useLevel()
  if (!b) return null
  const unlockedAt = unlocked[b.id]
  const got = Boolean(unlockedAt)
  const progress = got ? null : badgeProgress(b.id, data, streak.days, level.level)
  const link = badgeLink(b)
  const next = nextInFamily(b, BADGES, unlocked)
  const tier = badgeTier(b.id)
  return (
    <Modal
      open={badge !== null}
      onClose={onClose}
      size="sm"
      title={<span className="block text-center">{b.name}</span>}
      media={
        <div className="cabinet mb-1 grid place-items-center pt-7 pb-5">
          <motion.span key={b.id} className="inline-block" initial={{ y: -18, scale: 0.8, rotate: -8, opacity: 0 }} animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }} transition={springs.bouncy}>
            <BadgeArt badge={b} earned={got} size={160} />
          </motion.span>
        </div>
      }
      footer={
        got ? (
          <Button variant="secondary" onClick={onClose}>
            Nice
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Later
            </Button>
            <ButtonLink to={link.to} iconRight="arrowRight">
              {link.label}
            </ButtonLink>
          </>
        )
      }
    >
      <div className="pb-1 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {got ? (
            <Badge tone="green" icon="check">
              Earned {formatLongDate(unlockedAt)}
            </Badge>
          ) : (
            <Badge tone="neutral" icon="lock">
              Not yet
            </Badge>
          )}
          <Badge tone="neutral" variant="outline">
            {CATEGORY_TITLE[b.category]} · {tier === 3 ? 'Gold' : tier === 2 ? 'Rare' : 'Classic'}
          </Badge>
        </div>
        <p className="mt-3 text-base text-ink">{got ? `You earned it: ${b.description.charAt(0).toLowerCase()}${b.description.slice(1)}` : `To earn it: ${b.description.charAt(0).toLowerCase()}${b.description.slice(1)}`}</p>
        {progress && (
          <ProgressBar className="mt-4 text-left" label="So far" showLabel value={progress.value} max={progress.max} tone="yellow" valueText={`${progress.value} of ${progress.max} ${progress.unit}`} />
        )}
        {next && (
          <button type="button" onClick={() => onOpen(next.id)} className="mt-4 flex w-full items-center gap-3 rounded-md bg-inset p-2.5 text-left transition-colors hover:bg-line" data-testid="badge-next">
            <BadgeArt badge={next} earned={false} size={40} />
            <span className="min-w-0 flex-1">
              <span className="eyebrow block">Next in {CATEGORY_TITLE[next.category].toLowerCase()}</span>
              <span className="block truncate text-sm font-bold text-ink">{next.name}</span>
            </span>
            <Icon name="chevronRight" size={18} className="text-ink-muted" />
          </button>
        )}
      </div>
    </Modal>
  )
}
