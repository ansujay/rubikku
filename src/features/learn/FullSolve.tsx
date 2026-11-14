/**
 * The capstone: a full random scramble, solved start to finish. The coach is there if he asks
 * (the same hints as everywhere else), and a tracker shows which stage he is in as he goes.
 *
 * The tracker describes `coach.view` — the cube at the last sound moment while he is inside an
 * algorithm — so it never drops back to "Stage 1" in the middle of a corner insert.
 *
 * A solve counts (reward, "N solved") when he made at least half of the turns himself: hints are
 * fine, but letting "Show me" turn the whole cube is watching, not solving.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { reward } from '../../app/rewards'
import { analyzeCube, isRotation, isSolved, type CubeState, type Move } from '../../cube'
import { STAGES } from '../../store'
import { Cube3D, StageControls, useCubeController, type CubeSession } from '../../three'
import { Badge, Button, ButtonLink, Card, CubeStage, Icon, Page, ProgressBar, sound, springs, StageTracker, Sticker } from '../../ui'
import { capstoneState } from './engine'
import { useLearn } from './learnStore'
import { TwistMeter } from './player/bits'
import { HintCard, useCoach } from './player/coach'
import { useLearnPath } from './usePath'

export default function FullSolve() {
  const capstone = useLearn((s) => s.capstone)
  const path = useLearnPath()
  const locked = path.stops[path.stops.length - 1].status === 'locked'
  const stageBox = useRef<HTMLDivElement>(null)
  const [mirrors, setMirrors] = useState(false)
  const [justSolved, setJustSolved] = useState(false)

  const cube = useCubeController({
    initial: (): CubeSession | CubeState => {
      const saved = useLearn.getState().capstone
      const start = capstoneState(saved.n)
      // `sessionStart`, not `session.start`: a long solve trims its history, which moves `session.start`.
      return saved.session && saved.sessionStart === start ? saved.session : start
    },
    onChange: (session) => {
      const learn = useLearn.getState()
      learn.updateCapstone({ session, sessionStart: capstoneState(learn.capstone.n) })
    },
  })
  const { state, history, moveCount, busy } = cube
  // White corners the way the lessons teach them: the trigger, unless he has opened the shortcuts.
  const shortcuts = useLearn((s) => Boolean(s.lessons['white-corners']?.done['faster']))
  const coach = useCoach(cube, { enabled: !capstone.solved, levels: true, whiteCorners: shortcuts ? undefined : 'trigger' })
  const analysis = useMemo(() => analyzeCube(coach.view), [coach.view])
  // The coach made more than half of the turns: a solve to watch, not one of his own.
  const watched = capstone.solved && capstone.shown * 2 > moveCount

  const timers = useRef<number[]>([])
  useEffect(() => {
    useLearn.getState().open('full-solve')
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  // Solved by his own hands (or with hints — it still counts).
  useEffect(() => {
    if (busy || capstone.solved || history.length === 0 || !isSolved(state)) return
    const learn = useLearn.getState()
    // His own solve: at least half of the turns were his.
    const own = learn.capstone.shown * 2 <= moveCount
    learn.updateCapstone({ solved: true, solves: learn.capstone.solves + (own ? 1 : 0) })
    if (own) {
      // His solve: a moment — which the reward turns into the "You solved the cube" milestone by
      // itself when it is his first solve ever (src/app/rewards.ts).
      reward('solve-completed', { context: 'lesson' }, { moment: { eyebrow: 'Full solve', title: 'Solved!', subtitle: `Scrambled to solved in ${moveCount} moves.`, icon: 'trophy' } })
    } else {
      // The coach did most of it: a quiet "Solved!" on the cube.
      sound.play('success')
      setJustSolved(true)
      // Not returned as a cleanup: marking the cube solved re-runs this effect.
      timers.current.push(window.setTimeout(() => setJustSolved(false), 3200))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, state, capstone.solved])

  const newScramble = () => {
    coach.clear()
    const n = capstone.n + 1
    useLearn.getState().updateCapstone({ n, hints: 0, shown: 0, solved: false })
    cube.reset(capstoneState(n))
  }
  const startAgain = () => {
    coach.clear()
    useLearn.getState().updateCapstone({ hints: 0, shown: 0, solved: false })
    cube.reset(capstoneState(capstone.n))
  }
  const showMe = (moves: readonly Move[]) => {
    useLearn.getState().updateCapstone({ shown: capstone.shown + moves.filter((move) => !isRotation(move)).length })
    void cube.apply(moves, { speed: 0.8 })
  }
  const askHint = () => {
    useLearn.getState().updateCapstone({ hints: capstone.hints + 1 })
    coach.ask()
  }
  const turnCube = (move: Move) => void cube.apply([move], { speed: 1.2 })
  const solvedReal = () => {
    const learn = useLearn.getState()
    const first = learn.capstone.realSolves === 0
    learn.updateCapstone({ realSolves: learn.capstone.realSolves + 1 })
    // The first real solve is the biggest moment on the site; after that, a moment card (a
    // button that can be tapped again must not keep taking over the screen).
    reward(
      'real-cube-solved',
      {},
      first
        ? { milestone: { eyebrow: 'Your first real solve', title: 'You solved your real cube!', subtitle: 'Go and show someone — then scramble it and do it again.', icon: 'trophy', headline: true, action: { label: 'Keep going' } } }
        : { moment: { eyebrow: 'Another real solve', title: 'Solved it again!', subtitle: 'Every solve is a little faster. Try the timer.', icon: 'trophy' } },
    )
  }

  const currentStage = analysis.current ? STAGES.find((s) => s.id === analysis.current) : undefined
  const currentProgress = analysis.current ? analysis.stages[analysis.current] : undefined

  return (
    <Page className="pt-3! md:pt-6!">
      <header className="mb-3 flex items-center gap-2 md:mb-4">
        <Link
          to="/learn"
          aria-label="Back to the path"
          className="-ml-1.5 flex size-11 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-inset hover:text-ink"
        >
          <Icon name="arrowLeft" size={22} />
        </Link>
        <div className="min-w-0 grow">
          <p className="eyebrow">Finale</p>
          <h1 className="truncate text-xl text-ink md:text-2xl">Full solve</h1>
        </div>
        {capstone.solves > 0 && (
          <Badge tone="green" icon="trophy" data-testid="capstone-solves">
            {capstone.solves} solved
          </Badge>
        )}
      </header>

      {locked && (
        <p className="mb-3 flex items-center gap-2 rounded-sm bg-cube-yellow-soft px-3 py-2 text-sm font-semibold text-cube-yellow-text" data-testid="peek-banner">
          <Icon name="eye" size={16} className="shrink-0" />
          <span>You are peeking ahead. This is where the path ends — have a go, and ask for hints whenever you like.</span>
        </p>
      )}

      <div className="grid items-start gap-x-5 gap-y-3 min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div ref={stageBox} className="sticky top-(--topbar-h) z-20 -mx-4 bg-bg px-4 pt-1 pb-2 sm:-mx-6 sm:px-6 md:top-0 md:-mx-0 md:px-0 md:pt-4 min-[900px]:pb-0">
          <CubeStage
            label="Full solve cube"
            fit="square"
            className="w-full [--stage-max-h:34dvh] [--stage-min-h:12rem] md:[--stage-max-h:44dvh] min-[56.25rem]:[--stage-max-h:calc(100dvh-13rem)]"
            controls={
              <StageControls
                view={cube.view}
                onTurnCube={!capstone.solved ? turnCube : undefined}
                busy={busy}
                mirrors={mirrors || coach.hidden}
                onMirrorsChange={() => setMirrors(!mirrors)}
                status={
                  <>
                    {capstone.solved ? (
                      <Badge tone="green" icon="check" data-testid="capstone-status">
                        Solved
                      </Badge>
                    ) : (
                      <Badge tone="neutral" data-testid="capstone-status">
                        {moveCount} {moveCount === 1 ? 'move' : 'moves'}
                      </Badge>
                    )}
                    <TwistMeter analysis={analysis} />
                  </>
                }
              />
            }
          >
            <Cube3D
              {...cube.bind}
              mode={capstone.solved ? 'view' : 'interactive'}
              highlight={coach.highlight}
              arrow={busy ? null : coach.nextMove}
              mirrors={mirrors || coach.hidden}
              label="Full solve cube"
              debugId="lesson"
            />
            <AnimatePresence>
              {justSolved && (
                <motion.div
                  className="pointer-events-none absolute inset-x-0 bottom-[14%] flex justify-center"
                  initial={{ opacity: 0, y: 14, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={springs.bouncy}
                >
                  <span className="rounded-lg bg-ink px-5 py-2.5 font-display text-2xl font-extrabold text-ink-inverse shadow-3">Solved!</span>
                </motion.div>
              )}
            </AnimatePresence>
          </CubeStage>
        </div>

        <Card variant="raised" padding="none" className="flex min-w-0 flex-col gap-4 p-4 sm:p-5" data-testid="capstone-panel" data-solved={capstone.solved} data-n={capstone.n}>
          {capstone.solved ? (
            <div className="flex flex-col gap-4" data-testid="capstone-done">
              <div className="flex items-center gap-3.5">
                <Sticker tone="yellow" icon="trophy" size="lg" />
                <div>
                  <h2 className="text-2xl leading-tight text-ink">{watched ? 'The cube is solved.' : 'You solved the cube.'}</h2>
                  <p className="mt-0.5 text-base text-ink-muted">
                    Scrambled to solved in {moveCount} moves{capstone.hints === 0 ? ', with no hints at all' : capstone.hints === 1 ? ', with one hint' : `, with ${capstone.hints} hints`}.
                  </p>
                </div>
              </div>
              <p className="text-base leading-relaxed text-ink-muted" data-testid="capstone-verdict" data-own={!watched}>
                {watched
                  ? 'The coach made most of those turns, so this one was for watching. Take another scramble and make the turns yourself — ask for hints as often as you like — and that solve is yours.'
                  : capstone.hints === 0
                    ? 'That is the real thing: nobody helped. Now do it on your own cube — and then see how fast you can go.'
                    : 'Every solve needs fewer hints than the last. Go again and see how few you need.'}
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Button variant="primary" iconLeft="shuffle" onClick={newScramble} data-testid="capstone-new">
                  Another scramble
                </Button>
                <ButtonLink to="/timer" variant="secondary" iconLeft="timer">
                  Race the clock
                </ButtonLink>
              </div>
              <div className="rounded-md bg-inset px-3.5 py-3" data-testid="capstone-next">
                <p className="eyebrow mb-2">What next?</p>
                <ul className="flex flex-col gap-1.5 text-sm text-ink-muted">
                  <li>
                    <span className="font-bold text-ink">Get faster:</span> the timer, and one stage at a time — redo the drills for a star on every stage.
                  </li>
                  <li>
                    <span className="font-bold text-ink">Make patterns:</span> a checkerboard, a cube in a cube — with the moves you know.
                  </li>
                </ul>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <ButtonLink to="/patterns" variant="soft" size="sm" iconLeft="grid">
                    Patterns
                  </ButtonLink>
                  <ButtonLink to="/algorithms" variant="soft" size="sm" iconLeft="cube">
                    Your algorithm cards
                  </ButtonLink>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <p className="eyebrow">Scramble {capstone.n + 1}</p>
                <h2 className="text-xl leading-tight text-ink md:text-2xl">Solve it, start to finish</h2>
                <p className="text-base leading-relaxed text-ink-muted">
                  A real scramble and all eight stages. No arrows this time. The tracker shows where you are, and the coach is one tap away.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-md bg-inset p-3.5" data-testid="stage-tracker" data-current={analysis.current ?? 'solved'}>
                <StageTracker
                  variant="strip"
                  size="sm"
                  label="Stages"
                  items={STAGES.map((s) => ({
                    id: s.id,
                    number: s.number,
                    title: s.title,
                    state: analysis.stages[s.id].complete ? ('done' as const) : s.id === analysis.current ? ('current' as const) : ('todo' as const),
                  }))}
                />
                {currentStage && currentProgress && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-bold text-ink">
                        Stage {currentStage.number} · {currentStage.title}
                      </p>
                      <Link to={`/learn/${currentStage.id}`} className="text-xs font-bold text-accent-text underline-offset-4 hover:underline">
                        Revise it
                      </Link>
                    </div>
                    <ProgressBar value={currentProgress.done} max={currentProgress.total} segments={currentProgress.total} size="sm" tone="green" label={`${currentStage.title} pieces in place`} />
                    <p className="text-sm text-ink-muted" data-testid="tracker-summary">
                      {analysis.twistInProgress ? 'Twisting corners. The bottom comes back at the end — top only, never the whole cube.' : currentProgress.summary}
                    </p>
                  </div>
                )}
              </div>

              <HintCard coach={coach} onShowMe={showMe} onUndo={cube.undo} onMore={askHint} busy={busy} />

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="reward" size="sm" iconLeft="lightbulb" onClick={askHint} disabled={busy} data-testid="hint-button">
                  Hint
                </Button>
                <Button variant="secondary" size="sm" iconLeft="undo" onClick={cube.undo} disabled={!cube.canUndo || busy} data-testid="undo-button">
                  Undo
                </Button>
                <Button variant="ghost" size="sm" iconLeft="restart" onClick={startAgain} disabled={!cube.canUndo}>
                  Start again
                </Button>
                <Button variant="ghost" size="sm" iconLeft="shuffle" onClick={newScramble} className="ml-auto" data-testid="capstone-new">
                  New scramble
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <RealCubeCard count={capstone.realSolves} onSolved={solvedReal} />
    </Page>
  )
}

/**
 * The real goal: his own cube, start to finish. The biggest celebration on the site, and the
 * one that asks him to show somebody.
 */
function RealCubeCard({ count, onSolved }: { count: number; onSolved: () => void }) {
  return (
    <Card variant="raised" className="mt-5 flex flex-col gap-3.5 sm:flex-row sm:items-center" data-testid="real-cube-card" data-count={count}>
      <Sticker tone="yellow" icon="cube" size="lg" />
      <div className="min-w-0 grow">
        <h2 className="text-xl leading-tight text-ink">Now your own cube</h2>
        <p className="mt-1 text-base leading-relaxed text-ink-muted">
          Scramble it — twenty random turns — and solve it with your hands, stage by stage. Yellow on top the whole way. Stuck? Go back to the last stage that is still whole.
          {count > 0 && (
            <span className="font-bold text-ink" data-testid="real-solves">
              {' '}
              Solved {count === 1 ? 'once' : `${count} times`} so far.
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:w-60">
        <Button variant="success" size="lg" iconLeft="trophy" onClick={onSolved} data-testid="real-cube-solved">
          {count > 0 ? 'Solved it again!' : 'I solved my real cube!'}
        </Button>
        <ButtonLink to="/solve?where" variant="ghost" size="sm" iconLeft="wand">
          Lost? Where is my cube?
        </ButtonLink>
      </div>
    </Card>
  )
}
