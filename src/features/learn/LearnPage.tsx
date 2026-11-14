import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { MiniCube } from '../../three'
import { Badge, ButtonLink, cx, Icon, Page, PageHeader, ProgressBar, Reveal, StageMarker, StageTracker, Sticker, useMotionPref, type StageTrackerState } from '../../ui'
import { CAPSTONE_ID, PRIMER_ID } from './content'
import { stagePicture, type StagePicture } from './rescue'
import { MASTERY_TARGET } from './learnStore'
import { stopLabel, type PathStop } from './path'
import { useLearnPath } from './usePath'
import type { StageId } from '../../cube'

/**
 * Geometry of the trail (px). Rows are a fixed height so the winding line can be drawn exactly.
 * Narrow: the stones in a column at the left, the words beside them. Wide (a tablet and up): the
 * trail swings across the whole width, the words on the open side of each stone.
 */
interface Trail {
  wide: boolean
  row: number
  stone: number
  /** The width the line is drawn in. */
  width: number
  x: (i: number) => number
  y: (i: number) => number
}

function trail(width: number): Trail {
  if (width >= 640) {
    const row = 164
    return { wide: true, row, stone: 112, width, x: (i) => width / 2 + (i % 2 === 0 ? -1 : 1) * Math.min(220, width * 0.22), y: (i) => i * row + row / 2 }
  }
  const row = 150
  const column = 136
  return { wide: false, row, stone: 100, width: column, x: (i) => column / 2 + 17 * Math.round(Math.sin((i * Math.PI) / 2)), y: (i) => i * row + row / 2 }
}

/**
 * The cube at each stop — the same cube all the way down the path: scrambled at the start, with
 * only what is solved lit up, so reading down the path the cube fills in layer by layer.
 */
function stopCube(stop: PathStop): StagePicture | null {
  if (stop.id === CAPSTONE_ID) return null
  return stagePicture(stop.id === PRIMER_ID ? 'scrambled' : (stop.id as StageId))
}

function statusLine(stop: PathStop): string {
  if (stop.id === CAPSTONE_ID) return stop.status === 'complete' ? 'Solved. Go again any time.' : stop.status === 'locked' ? 'Opens when all eight stages are done.' : 'You are ready.'
  if (stop.status === 'complete') return stop.mastered ? 'Complete and mastered' : stop.id === PRIMER_ID ? 'Complete' : `Complete · ${Math.min(stop.clean, MASTERY_TARGET)} of ${MASTERY_TARGET} clean drills`
  if (stop.started && stop.seen > 1) return `Step ${stop.seen} of ${stop.beats}`
  return stop.status === 'locked' ? 'Locked for now' : 'Not started'
}

/** A stop as the shared StageTracker draws it. */
function trackerState(stop: PathStop): StageTrackerState {
  return stop.status === 'complete' ? 'done' : stop.status === 'current' ? 'current' : stop.status === 'locked' ? 'locked' : 'todo'
}

export default function LearnPage() {
  const path = useLearnPath()
  const map = useRef<HTMLDivElement>(null)
  const [mapWidth, setMapWidth] = useState(0)
  useLayoutEffect(() => {
    const element = map.current
    if (!element) return
    const measure = () => setMapWidth(element.clientWidth)
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [])
  const t = trail(mapWidth)
  const { reduced } = useMotionPref()
  const { stops, next } = path
  const allDone = next === null
  const nextStarted = next ? next.started && next.seen > 1 : false

  return (
    <Page>
      <PageHeader
        eyebrow="Learn"
        title="Your path to a solved cube"
        lede={
          allDone
            ? 'You have travelled the whole path. Every stage is yours to revisit.'
            : 'Eight stages, one at a time. Each stop leaves the cube a little more solved.'
        }
        actions={
          next ? (
            <ButtonLink to={`/learn/${next.id}`} size="lg" iconRight="arrowRight" data-testid="path-continue">
              <span>
                {nextStarted ? 'Continue' : next.id === PRIMER_ID ? 'Start here' : 'Start'}
                <span className="max-xs:hidden">: {next.title}</span>
              </span>
            </ButtonLink>
          ) : (
            <ButtonLink to="/timer" size="lg" variant="secondary" iconLeft="timer">
              Race the clock
            </ButtonLink>
          )
        }
      />

      <Reveal className="mx-auto max-w-[680px]">
        <StageTracker
          variant="strip"
          label={`Stages: ${path.stagesDone} of 8 done`}
          items={stops
            .filter((stop) => stop.id !== PRIMER_ID && stop.id !== CAPSTONE_ID)
            .map((stop, i) => ({ id: stop.id, number: i + 1, title: stop.title, state: trackerState(stop), to: `/learn/${stop.id}` }))}
        />
      </Reveal>

      <div ref={map} className={cx('relative mx-auto mt-6', t.wide ? 'max-w-[920px]' : 'max-w-[680px]')} data-testid="path-map" data-wide={t.wide}>
        {/* The winding line: solid green behind you, dashed ahead. */}
        <svg width={t.width} height={stops.length * t.row} className="pointer-events-none absolute top-0 left-0" aria-hidden="true">
          {stops.slice(0, -1).map((stop, i) => {
            const [x1, y1, x2, y2] = [t.x(i), t.y(i), t.x(i + 1), t.y(i + 1)]
            const done = stop.status === 'complete'
            return (
              <path
                key={stop.id}
                d={`M ${x1} ${y1} C ${x1} ${y1 + t.row * 0.5}, ${x2} ${y2 - t.row * 0.5}, ${x2} ${y2}`}
                fill="none"
                strokeWidth={done ? 6 : 5}
                strokeLinecap="round"
                strokeDasharray={done ? undefined : '2 12'}
                className={done ? 'stroke-cube-green' : 'stroke-line-strong'}
              />
            )
          })}
        </svg>

        <ol className="relative" data-testid="path">
          {stops.map((stop, i) => {
            const cubeState = stopCube(stop)
            const current = stop.status === 'current'
            const locked = stop.status === 'locked'
            const complete = stop.status === 'complete'
            const to = `/learn/${stop.id}`
            return (
              <li
                key={stop.id}
                className={cx('flex items-center', t.wide && 'relative')}
                style={{ height: t.row }}
                data-testid={`stop-${stop.id}`}
                data-status={stop.status}
              >
                <div className={cx('shrink-0', t.wide ? 'absolute inset-y-0 left-0' : 'relative')} style={{ width: t.wide ? 0 : t.width, height: t.row }}>
                  <Link
                    to={to}
                    aria-label={`${stopLabel(stop)}: ${stop.title}. ${statusLine(stop)}.`}
                    className="group absolute block rounded-[28px]"
                    style={{ width: t.stone, height: t.stone, left: t.x(i) - t.stone / 2, top: t.row / 2 - t.stone / 2 }}
                  >
                    {current && !reduced && (
                      <motion.span
                        aria-hidden="true"
                        className="absolute -inset-1.5 rounded-[32px] ring-[3px] ring-accent"
                        initial={{ opacity: 0.9, scale: 1 }}
                        animate={{ opacity: [0.9, 0.25, 0.9], scale: [1, 1.07, 1] }}
                        transition={{ duration: 1.3, repeat: 2, ease: 'easeInOut' }}
                      />
                    )}
                    <span
                      className={cx(
                        'absolute inset-0 flex items-center justify-center rounded-[28px] border transition-transform duration-150 group-hover:-translate-y-0.5 group-active:translate-y-0.5',
                        current ? 'border-accent bg-surface shadow-2 ring-[3px] ring-accent' : complete ? 'border-line bg-surface shadow-1' : 'border-line bg-surface shadow-1',
                        locked && 'bg-inset shadow-none',
                      )}
                    >
                      {cubeState ? (
                        <span className={cx('block', locked && 'opacity-45')} data-testid="stop-cube" data-lit={cubeState.lit?.length ?? 26}>
                          <MiniCube
                            state={cubeState.state}
                            size={t.stone - 12}
                            play={false}
                            highlight={cubeState.lit ? { pieces: cubeState.lit, dimOthers: true, outline: false, dimTo: 'grey' } : undefined}
                            pose={cubeState.below ? { elevation: -0.52 } : undefined}
                            label={`${stop.title}: the cube after this stage`}
                          />
                        </span>
                      ) : (
                        <Sticker tone="yellow" icon="trophy" size="lg" variant={locked ? 'locked' : 'solid'} />
                      )}
                    </span>
                    {(complete || locked) && (
                      <span className="absolute -right-2 -bottom-2 grid rounded-[12px] bg-bg p-[3px]" data-testid="stop-marker">
                        <StageMarker state={complete ? 'done' : 'locked'} size="sm" icon={locked ? 'lock' : undefined} number={i} />
                      </span>
                    )}
                    {stop.mastered && (
                      <span className="absolute -top-1.5 -right-1.5 flex size-7 items-center justify-center rounded-[9px] bg-cube-yellow text-on-yellow ring-[3px] ring-bg" title="Mastered">
                        <Icon name="star" size={15} weight={2.4} filled />
                      </span>
                    )}
                  </Link>
                </div>

                <div
                  className={cx(
                    'min-w-0',
                    t.wide ? 'absolute top-1/2 -translate-y-1/2' : 'grow pl-2 sm:pl-4',
                    t.wide && i % 2 === 1 && 'text-right [&>div]:justify-end',
                    current && 'rounded-lg border border-line bg-surface p-3.5 shadow-1 sm:p-4',
                  )}
                  style={
                    t.wide
                      ? i % 2 === 0
                        ? { left: t.x(i) + t.stone / 2 + 28, width: Math.min(380, t.width - (t.x(i) + t.stone / 2 + 28)) }
                        : { left: Math.max(0, t.x(i) - t.stone / 2 - 28 - 380), width: Math.min(380, t.x(i) - t.stone / 2 - 28) }
                      : undefined
                  }
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="eyebrow">{stopLabel(stop)}</p>
                    {current && (
                      <Badge tone="accent" size="sm">
                        Up next
                      </Badge>
                    )}
                  </div>
                  <h2 className={cx('mt-0.5 text-lg leading-tight', locked ? 'text-ink-muted' : 'text-ink')}>{stop.title}</h2>
                  <p className={cx('mt-0.5 text-sm leading-snug', locked ? 'text-ink-faint' : 'text-ink-muted', !current && 'line-clamp-2')}>{stop.goal}</p>

                  {current ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <ButtonLink to={to} variant="soft" size="sm" iconRight="arrowRight" data-testid="stop-continue">
                        {stop.started && stop.seen > 1 ? 'Continue' : 'Start'}
                      </ButtonLink>
                      {stop.beats > 0 && stop.seen > 1 && (
                        <div className="min-w-24 grow">
                          <ProgressBar value={stop.seen} max={stop.beats} size="sm" label={`Progress in ${stop.title}`} valueText={`step ${stop.seen} of ${stop.beats}`} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className={cx('font-semibold', complete ? 'text-cube-green-text' : 'text-ink-faint')} data-testid="stop-status">
                        {statusLine(stop)}
                      </span>
                      <Link
                        to={to}
                        className="relative font-bold text-accent-text underline-offset-4 before:absolute before:-inset-2.5 before:content-[''] hover:underline"
                        data-testid={locked ? 'stop-peek' : 'stop-open'}
                      >
                        {locked ? 'Peek ahead' : complete ? 'Review' : stop.started && stop.seen > 1 ? 'Continue' : 'Open'}
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      <Reveal className="mx-auto mt-4 flex max-w-[680px] flex-wrap items-center justify-between gap-3 rounded-lg bg-inset px-4 py-3.5">
        <p className="text-sm text-ink-muted">
          <span className="font-bold text-ink">Lost track of your real cube?</span> Pick the picture that looks most like it and go straight to the right stage.
        </p>
        <ButtonLink to="/solve?where" variant="secondary" size="sm" iconLeft="wand">
          Where is my cube?
        </ButtonLink>
      </Reveal>
    </Page>
  )
}
