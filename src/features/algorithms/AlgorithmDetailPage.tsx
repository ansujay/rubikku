import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { reward } from '../../app/rewards'
import { algToString, describeMove, getAlgorithm, type BeginnerAlgorithm, type Move } from '../../cube'
import { getStage } from '../../store'
import { Cube3D, MiniCube, StageControls, useCubeController } from '../../three'
import { Badge, Button, ButtonLink, Card, CubeStage, cx, EmptyState, Icon, MoveChip, MoveSequence, Page, PlaybackBar, Reveal, SegmentedControl, sound, springs, Sticker, Toggle, celebration } from '../../ui'
import { FOLLOW_START, acceptsMove, followMove, type FollowState } from '../notation/logic/follow'
import { pretty } from '../notation/logic/explain'
import { sleep, useCubeQueue } from '../notation/useCubeQueue'
import { StatusBadge } from './AlgorithmsPage'
import { useAlgorithms } from './algorithmsStore'
import { algView, guidanceFor, HOLD_STATE, MASTERY_REPS, mirrorInfo, mnemonicBeats, statusOf, type Guidance } from './logic'

const SPEEDS = [0.5, 1, 2] as const
/** Less is more help. */
const HELP_RANK: Record<Guidance, number> = { arrows: 0, moves: 1, memory: 2 }
type Mode = 'watch' | 'practise'

export default function AlgorithmDetailPage() {
  const { id = '' } = useParams()
  const algorithm = getAlgorithm(id)
  if (!algorithm) {
    return (
      <Page width="narrow">
        <EmptyState
          headingLevel="h1"
          icon="cards"
          title="No algorithm by that name"
          description="It may have been renamed. All fourteen are on the algorithms page."
          action={<ButtonLink to="/algorithms">See all algorithms</ButtonLink>}
        />
      </Page>
    )
  }
  return <Detail key={algorithm.id} algorithm={algorithm} />
}

function Detail({ algorithm }: { algorithm: BeginnerAlgorithm }) {
  const [params, setParams] = useSearchParams()
  const mode: Mode = params.get('mode') === 'practise' ? 'practise' : 'watch'
  const mirror = useMemo(() => mirrorInfo(algorithm), [algorithm])
  const mirrored = mirror.meaningful && params.get('mirror') === '1'
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const view = useMemo(() => algView(algorithm, mirrored), [algorithm, mirrored])
  const stage = getStage(algorithm.stage)
  const stat = useAlgorithms((s) => s.stats[algorithm.id])
  const status = statusOf(stat)

  // ── practice state ──
  const [follow, setFollowState] = useState<FollowState>(FOLLOW_START)
  const followRef = useRef(FOLLOW_START)
  const setFollow = (next: FollowState) => {
    followRef.current = next
    setFollowState(next)
  }
  const [override, setOverride] = useState<Guidance | null>(null)
  const guidance = override ?? guidanceFor(stat)
  const guidanceRef = useRef(guidance)
  guidanceRef.current = guidance
  const dirty = useRef(false)
  /** The most help used so far in the current rep. */
  const repHelp = useRef<Guidance>(guidance)
  if (follow.index === 0 && !follow.partial) repHelp.current = guidance
  else if (HELP_RANK[guidance] < HELP_RANK[repHelp.current]) repHelp.current = guidance
  const locked = useRef(false)
  const [peek, setPeek] = useState(false)
  const [nudge, setNudge] = useState<Move | null>(null)
  const [done, setDone] = useState<'clean' | 'helped' | null>(null)
  const [sessionReps, setSessionReps] = useState(0)

  const cube = useCubeController({ initial: view.demoStart, onUserMove: (move) => handleTurn(move) })
  const { controller, player } = cube
  const queue = useCubeQueue(controller, mode === 'watch' ? view.demoStart : view.practiceStart)

  // Set the cube up whenever the mode or the mirror changes.
  useEffect(() => {
    queue.cancel()
    setFollow(FOLLOW_START)
    dirty.current = false
    locked.current = false
    setPeek(false)
    setNudge(null)
    setDone(null)
    if (mode === 'watch') controller.load(view.demo, { from: view.demoStart, autoplay: false })
    else controller.reset(view.practiceStart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, view])

  function handleTurn(move: Move) {
    if (mode !== 'practise') return
    const result = followMove(view.moves, followRef.current, move)
    if (result.status === 'wrong') return
    setNudge(null)
    setFollow(result.next)
    if (result.status !== 'complete') return
    // A rep is done.
    locked.current = true
    const clean = !dirty.current
    // Mastery counts the *most* help used at any point in the rep, so switching to "Memory"
    // for the last move does not make it a from-memory rep.
    const wasMastered = statusOf(useAlgorithms.getState().stats[algorithm.id]) === 'mastered'
    useAlgorithms.getState().addRep(algorithm.id, { clean, guidance: repHelp.current })
    const nowMastered = statusOf(useAlgorithms.getState().stats[algorithm.id]) === 'mastered'
    setSessionReps((n) => n + 1)
    setDone(clean ? 'clean' : 'helped')
    // A clean rep is a tick (ding + the cube hops); the rep that masters it is a moment.
    if (clean && !(nowMastered && !wasMastered)) celebration.tick(document.querySelector('[data-testid="rep-done"]'), { cube: true })
    // The page shows "Clean rep!" itself, so the reward is quiet: no XP toast per rep. The store
    // pays XP once per algorithm per day and keeps repeats out of the activity feed; a new
    // badge or the daily challenge still gets its moment.
    reward(
      'algorithm-practised',
      { algorithmId: algorithm.id },
      nowMastered && !wasMastered ? { mode: 'quiet', moment: { eyebrow: 'Mastered', title: algorithm.name, subtitle: 'Three clean reps from memory. It is yours now.', icon: 'star' } } : { mode: 'quiet' },
    )
    void queue.run(() => sleep(1100))
    void queue.rewind(2.6)
    void queue.run(() => {
      setFollow(FOLLOW_START)
      dirty.current = false
      setPeek(false)
      setDone(null)
      locked.current = false
    })
  }

  const allowMove = useCallback(
    (move: Move) => !locked.current && !controller.getSnapshot().busy && acceptsMove(view.moves, followRef.current, move),
    [controller, view],
  )

  const onRejected = () => {
    if (locked.current || controller.getSnapshot().busy) return
    dirty.current = true
    sound.play('error')
    setNudge(view.moves[followRef.current.index] ?? null)
  }

  const startOver = () => {
    queue.cancel()
    controller.reset(view.practiceStart)
    setFollow(FOLLOW_START)
    dirty.current = false
    locked.current = false
    setPeek(false)
    setNudge(null)
    setDone(null)
  }

  // ── what to show ──
  const watching = mode === 'watch'
  const nextWatch = watching && player && player.position < player.total ? player.alg[player.position] : null
  const nextPractise = !watching && follow.index < view.moves.length ? view.moves[follow.index] : null
  const showMoves = guidance !== 'memory' || peek
  // Half-way through a double turn, only the same quarter turn again is accepted: point at that.
  const arrow = cube.busy ? null : watching ? nextWatch : guidance === 'arrows' && !done ? (follow.partial ?? nextPractise) : null
  const beats = useMemo(() => mnemonicBeats(algorithm.mnemonic, algorithm.moves.length), [algorithm])
  // The chant follows the first go through the moves (demos may repeat the algorithm).
  const repeats = view.demo.every((move, i) => move === view.moves[i % view.moves.length])
  // The beat for the move that comes next; -1 before anything has happened.
  const activeBeat = watching
    ? player && player.position > 0 && player.position < player.total && (repeats || player.position < view.moves.length)
      ? player.position % view.moves.length
      : -1
    : follow.index > 0 || follow.partial
      ? follow.index
      : -1
  const hideBeatMoves = !watching && !showMoves
  const blind = stat?.blind ?? 0

  return (
    <Page>
      <Reveal as="header" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 md:mb-5">
        <Link to="/algorithms" aria-label="All algorithms" className="key key-secondary grid size-10 shrink-0 place-items-center rounded-sm">
          <Icon name="arrowLeft" size={18} weight={2.4} />
        </Link>
        <div className="min-w-0 grow">
          <h1 className="text-2xl text-ink md:text-3xl">{algorithm.name}</h1>
          {stage && (
            <Link to={`/learn/${stage.id}`} className="relative mt-0.5 inline-flex items-center gap-1 text-sm font-bold text-accent-text before:absolute before:-inset-y-3 before:-inset-x-1 before:content-[''] hover:underline" data-testid="lesson-link">
              Stage {stage.number} · {stage.title}
              <Icon name="chevronRight" size={14} weight={2.6} />
            </Link>
          )}
        </div>
        <StatusBadge status={status} size="md" />
        {/* The mode bar stays in one place in both modes, so switching never moves the control
            just tapped (Watch has a playback bar under the cube; Practise does not). On a wide
            screen it shares the title row, pinned to the right edge (the title takes up the slack),
            so the badge changing never nudges it; narrower, it gets a row of its own. */}
        <SegmentedControl
          ariaLabel="Mode"
          fullWidth
          className="basis-full xl:w-xs xl:basis-auto"
          value={mode}
          onChange={(value) => setParam('mode', value === 'practise' ? 'practise' : null)}
          items={[
            { value: 'watch', label: 'Watch', icon: 'eye' },
            { value: 'practise', label: 'Practise', icon: 'target' },
          ]}
        />
      </Reveal>

      <Reveal className="grid items-start gap-4 [--chrome-h:22.5rem] xl:[--chrome-h:18rem] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-5">
        <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springs.gentle} className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6">
          <CubeStage
            label={`${algorithm.name} on the cube`}
            fit="square"
            maxViewHeight="calc(100dvh - var(--chrome-h))"
            minViewHeight="16rem"
            className="w-full"
            controls={<StageControls view={cube.view} status={mirrored ? <Badge tone="accent">Mirrored</Badge> : undefined} />}
          >
            <Cube3D {...cube.bind} mode={watching ? 'view' : 'interactive'} allowMove={allowMove} onRejectedMove={onRejected} arrow={arrow} debugId="algorithm" />
            <AnimatePresence>
              {done && (
                <motion.div className="pointer-events-none absolute inset-x-0 bottom-[10%] flex justify-center" initial={{ opacity: 0, y: 14, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={springs.bouncy} data-testid="rep-done">
                  <span className={cx('flex items-center gap-2 rounded-lg px-4 py-2 font-display text-xl font-extrabold shadow-3', done === 'clean' ? 'bg-cube-green text-on-green' : 'bg-ink text-ink-inverse')}>
                    <Icon name="check" size={20} weight={3} />
                    {done === 'clean' ? 'Clean rep!' : 'Rep done'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </CubeStage>
          {watching && player && (
            <PlaybackBar
              playing={player.playing}
              onPlayPause={player.toggle}
              position={player.position}
              total={player.total}
              onStepBack={() => player.step(-1)}
              onStepForward={() => player.step(1)}
              onRestart={player.restart}
              onScrub={player.seek}
              speed={player.speed}
              speeds={SPEEDS}
              onSpeedChange={player.setSpeed}
            />
          )}
        </motion.div>

        <div className="flex min-w-0 flex-col gap-4">
          {watching && player && (
            <Card padding="md" className="flex flex-col gap-3" data-testid="watch-panel">
              <MoveSequence
                moves={player.alg}
                size={player.alg.length > 12 ? 'sm' : 'md'}
                activeIndex={player.detached ? undefined : player.activeIndex >= 0 ? player.activeIndex : player.position}
                onMoveClick={(index) => player.seek(index + 1)}
                label={`${algorithm.name}, move by move`}
              />
              <p className="min-h-11 text-base text-ink-muted" aria-live="polite" data-testid="move-text">
                {nextWatch ? (
                  <>
                    <span className="font-bold text-ink">Next: {pretty(nextWatch)}.</span> {describeMove(nextWatch).text}. {describeMove(nextWatch).detail}
                  </>
                ) : (
                  <>
                    <span className="font-bold text-ink">Done.</span> {view.demo.length > view.moves.length ? 'That was the algorithm repeated until the job was finished.' : 'Press play to watch it again.'}
                  </>
                )}
              </p>
            </Card>
          )}

          {!watching && (
            <Card padding="md" className="flex flex-col gap-3.5" data-testid="practise-panel" data-follow={follow.index} data-guidance={guidance}>
              <div className="flex flex-col gap-2">
                <p className="eyebrow">Your turn · how much help?</p>
                <SegmentedControl
                  ariaLabel="How much help"
                  size="sm"
                  fullWidth
                  value={guidance}
                  onChange={(value) => {
                    setOverride(value)
                    setPeek(false)
                  }}
                  items={[
                    { value: 'arrows', label: 'Arrows' },
                    { value: 'moves', label: 'Moves' },
                    { value: 'memory', label: 'Memory' },
                  ]}
                />
              </div>

              {showMoves ? (
                <MoveSequence moves={view.moves} size="md" activeIndex={follow.index} label="Moves to do" />
              ) : (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2.5" role="group" aria-label="Moves, hidden until you do them" data-testid="hidden-moves">
                  {view.moves.map((move, i) =>
                    i < follow.index ? (
                      <MoveChip key={i} move={move} state="done" />
                    ) : (
                      <span key={i} className={cx('grid h-11 min-w-11 place-items-center rounded-[11px] border border-dashed border-line-strong font-mono text-lg font-bold text-ink-faint', i === follow.index && 'border-solid border-accent text-accent-text')}>
                        ?
                      </span>
                    ),
                  )}
                </div>
              )}

              <p className="min-h-6 text-base text-ink-muted" aria-live="polite" data-testid="practise-line">
                {done ? (
                  <span className="font-bold text-cube-green-text">{done === 'clean' ? 'No slips. That one counts.' : 'Done. Next time, try it with no slips.'}</span>
                ) : nudge ? (
                  <span className="font-semibold text-cube-red-text">
                    Not that one.{' '}
                    {showMoves ? (
                      <>
                        Next is {pretty(nudge)}: {describeMove(nudge).detail.toLowerCase()}
                      </>
                    ) : (
                      'Think of the chant, or take a peek.'
                    )}
                  </span>
                ) : follow.partial ? (
                  'Halfway. Once more, the same way.'
                ) : guidance === 'arrows' && nextPractise ? (
                  <>
                    <span className="font-bold text-ink">{pretty(nextPractise)}.</span> {describeMove(nextPractise).detail}
                  </>
                ) : guidance === 'moves' ? (
                  'No arrows now. Read the moves and turn the cube.'
                ) : (
                  'From memory. Every clean one counts towards mastering it.'
                )}
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                {guidance === 'memory' && !peek && (
                  <Button
                    variant="reward"
                    size="sm"
                    iconLeft="eye"
                    onClick={() => {
                      dirty.current = true
                      setPeek(true)
                    }}
                    data-testid="peek"
                  >
                    Peek
                  </Button>
                )}
                <Button variant="ghost" size="sm" iconLeft="restart" onClick={startOver} disabled={follow.index === 0 && !follow.partial}>
                  Start over
                </Button>
                <div className="ml-auto flex items-center gap-3 text-sm font-bold text-ink-muted">
                  <span data-testid="rep-count">
                    <span className="num text-ink">{stat?.reps ?? 0}</span> {stat?.reps === 1 ? 'rep' : 'reps'}
                  </span>
                  <span className="flex items-center gap-1" role="img" title={`${Math.min(blind, MASTERY_REPS)} of ${MASTERY_REPS} clean reps from memory`} aria-label={`${Math.min(blind, MASTERY_REPS)} of ${MASTERY_REPS} clean reps from memory`}>
                    {Array.from({ length: MASTERY_REPS }, (_, i) => (
                      <Icon key={i} name="star" size={17} filled={i < blind} className={i < blind ? 'text-cube-yellow' : 'text-line-strong'} />
                    ))}
                  </span>
                </div>
              </div>
              {sessionReps === 0 && status !== 'mastered' && <p className="text-sm text-ink-muted">Three clean reps from memory and it is mastered. The help fades as you go.</p>}
            </Card>
          )}

          <Card padding="md" className="bg-cube-yellow-soft! border-transparent!" data-testid="mnemonic">
            <div className="flex items-center gap-2.5">
              <Sticker tone="yellow" icon="lightbulb" size="sm" />
              <p className="eyebrow text-cube-yellow-text!">Remember it</p>
            </div>
            {beats.beats ? (
              <ol className="mt-3 flex flex-wrap gap-x-1.5 gap-y-3">
                {beats.beats.map((beat, i) => (
                  <li key={i} className={cx('flex flex-col items-center gap-1.5 rounded-sm px-1 transition-[opacity,translate] duration-200', activeBeat >= 0 && i > activeBeat && 'opacity-45', i === activeBeat && '-translate-y-0.5')}>
                    {hideBeatMoves && i >= follow.index ? (
                      <span className="grid h-8 min-w-8 place-items-center rounded-[8px] border border-dashed border-cube-yellow-edge font-mono text-sm font-bold text-cube-yellow-text">?</span>
                    ) : (
                      <MoveChip move={view.moves[i]} size="sm" state={i === activeBeat ? 'active' : i < activeBeat ? 'done' : 'upcoming'} />
                    )}
                    <span className="font-display text-base leading-5 font-bold text-ink">{beat}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {beats.rest && <p className={cx('font-display text-ink', beats.beats ? 'mt-3 text-base font-semibold' : 'mt-2.5 text-xl leading-7 font-bold')}>{mirrored && !beats.beats ? `${beats.rest} (Shown mirrored: swap left and right.)` : beats.rest}</p>}
          </Card>

          {mirror.meaningful && (
            <Card padding="md" variant="flat" className="flex items-center gap-4">
              <div className="min-w-0 grow">
                <p id="mirror-label" className="text-base font-bold text-ink">
                  Mirror it
                </p>
                <p className="text-sm text-ink-muted">
                  {mirror.twin ? (
                    <>
                      The left-right twin is the{' '}
                      <Link to={`/algorithms/${mirror.twin.id}`} className="font-bold text-accent-text hover:underline">
                        {mirror.twin.name}
                      </Link>
                      .
                    </>
                  ) : (
                    <>
                      The same job on the other side: <span className="font-mono font-semibold text-ink">{algToString(mirror.moves).replace(/'/g, '′')}</span>
                    </>
                  )}
                </p>
              </div>
              <Toggle checked={mirrored} onChange={(on) => setParam('mirror', on ? '1' : null)} labelledBy="mirror-label" />
            </Card>
          )}
        </div>
      </Reveal>

      <Reveal className="mt-5 grid gap-4 md:grid-cols-2 lg:gap-5">
        <Card padding="md" className="flex flex-col gap-4">
          <Fact icon="target" tone="white" title="When to use it" text={algorithm.when} />
          <Fact icon="sparkle" tone="white" title="What it does" text={algorithm.does} />
          {algorithm.repeat && <Fact icon="restart" tone="white" title="How many times" text={algorithm.repeat} />}
        </Card>
        <div className="flex flex-col gap-4 lg:gap-5">
          <Card padding="md">
            <Fact icon="wand" tone="white" title="Fingers" text={algorithm.fingerHint} />
          </Card>
          <Card padding="md" data-testid="before-after">
            <p className="eyebrow mb-3">Before and after</p>
            <div className="flex items-center justify-center gap-4">
              <figure className="flex w-28 flex-col items-center gap-1.5">
                <MiniCube state={view.demoStart} label="The cube before the algorithm" />
                <figcaption className="text-sm font-bold text-ink-muted">Before</figcaption>
              </figure>
              <Icon name="arrowRight" size={22} className="shrink-0 text-ink-faint" />
              <figure className="flex w-28 flex-col items-center gap-1.5">
                <MiniCube state={HOLD_STATE} label="The cube after the algorithm" />
                <figcaption className="text-sm font-bold text-ink-muted">After</figcaption>
              </figure>
            </div>
          </Card>
        </div>
      </Reveal>
    </Page>
  )
}

function Fact({ icon, tone, title, text }: { icon: 'target' | 'sparkle' | 'restart' | 'wand'; tone: 'white'; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <Sticker tone={tone} icon={icon} size="sm" variant="soft" />
      <div className="min-w-0">
        <p className="eyebrow">{title}</p>
        <p className="mt-0.5 text-base text-ink">{text}</p>
      </div>
    </div>
  )
}
