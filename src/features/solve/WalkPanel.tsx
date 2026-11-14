/**
 * Step 4, the guided solution: the panel beside the cube. One step at a time, one move at a
 * time, with the hold made unmissable, a milestone at the end of every stage, a blame-free
 * "my cube doesn't match" path and the finish.
 */
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { describeHold, describeMove, STAGE_IDS, type Move } from '../../cube'
import { getStage } from '../../store'
import { Button, ButtonLink, Card, CubeNet, cx, Icon, IconButton, MoveChip, MoveSequence, ProgressBar, SegmentedControl, Spinner, springs, StageTracker, toast } from '../../ui'
import { HoldLine } from './parts'
import { SPEEDS, useSolve, type WalkMode } from './solveStore'
import { currentMove, faceTurns, globalIndex, groupStatus, holdOf, isAtStart, isFinished, isMilestone, movesToBoundary, stateAt, stepPlace, type Walk, type WalkPos } from './walkthrough'

export interface WalkPanelProps {
  walk: Walk | null
  pos: WalkPos
  mode: WalkMode
  /** The fastest-way search failed. */
  fastestError: boolean
  /** The other way of solving was asked for mid-step: it starts when this step is done (or rewound). */
  pendingMode: WalkMode | null
  playing: boolean
  compare: boolean
  onBack: () => void
  onStepStart: () => void
  onTogglePlay: () => void
  onCompare: (open: boolean) => void
  onReenter: () => void
  onSwitchMode: (mode: WalkMode) => void
}

const swap = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6, transition: { duration: 0.1 } }, transition: springs.gentle }

export function BigMove({ move, index, total, hold }: { move: Move; index: number; total: number; hold: boolean }) {
  // Whole-cube turns in the lessons' words ("Roll the whole cube upside down"), never `z2`.
  const words = hold ? describeHold(move) : describeMove(move)
  return (
    <div className="flex items-center gap-4 rounded-lg bg-inset p-3.5" data-testid="big-move" data-move={move}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={`${index}-${move}`} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.08 } }} transition={springs.bouncy} className="shrink-0">
          {hold ? (
            <span className="flex size-[4.5rem] items-center justify-center rounded-[18px] bg-accent text-accent-ink shadow-[0_4px_0_0_var(--accent-edge)]">
              <Icon name="rotateCw" size={38} weight={2.4} />
            </span>
          ) : (
            <MoveChip move={move} size="lg" state="active" />
          )}
        </motion.div>
      </AnimatePresence>
      <div className="min-w-0" aria-live="polite">
        <p className="num text-xs font-bold tracking-wide text-ink-faint uppercase">
          {hold ? 'Whole cube' : 'Turn'} {index + 1} of {total}
        </p>
        <p className="font-display text-xl leading-6 font-extrabold text-ink sm:text-2xl sm:leading-7">{words.text}</p>
        <p className="mt-0.5 text-sm font-semibold text-ink-muted">{words.detail}</p>
      </div>
    </div>
  )
}

/**
 * Where he is, in the words of the method: "Stage 3 of 8 · step 2 of 5" — never "turn 1 of 151",
 * which is a wall to a beginner. The fastest way has no stages: there it is its ~20 turns.
 */
export function walkProgress(walk: Walk, pos: WalkPos, mode: WalkMode): string {
  const step = walk.steps[pos.step]
  if (!step) return ''
  if (mode === 'fastest' || step.group === 'fastest') return `turn ${Math.min(globalIndex(walk, pos) + 1, walk.total)} of ${walk.total}`
  const stage = getStage(step.group)
  const place = stepPlace(walk, pos.step)
  return `Stage ${stage?.number ?? '?'} of 8 · ${stage?.title ?? ''} · step ${place.number} of ${place.of}`
}

export function WalkPanel({ walk, pos, mode, fastestError, pendingMode, playing, compare, onBack, onStepStart, onTogglePlay, onCompare, onReenter, onSwitchMode }: WalkPanelProps) {
  const speed = useSolve((s) => s.speed)
  const demo = useSolve((s) => s.demo)
  const priorTurns = useSolve((s) => s.priorTurns)

  const modeSwitch = (
    <SegmentedControl
      ariaLabel="Which solution"
      size="sm"
      value={mode}
      onChange={onSwitchMode}
      items={[
        { value: 'beginner', label: 'Stage by stage' },
        { value: 'fastest', label: 'Fastest way', icon: 'bolt' },
      ]}
    />
  )

  // ── the fastest way is still being worked out, or could not be ──
  if (!walk) {
    return (
      <div className="flex flex-col gap-4" data-testid="walk-panel" data-state={fastestError ? 'error' : 'loading'}>
        {modeSwitch}
        <Card variant="raised" padding="lg" className="flex flex-col items-start gap-4" aria-live="polite">
          {fastestError ? (
            <>
              <span className="flex size-12 items-center justify-center rounded-[13px] bg-cube-yellow-soft text-cube-yellow-text">
                <Icon name="alert" size={26} />
              </span>
              <div>
                <h2 className="text-xl text-ink">The shortcut finder got stuck</h2>
                <p className="mt-1 text-base text-ink-muted">It couldn’t find the fastest way this time. The stage-by-stage way always works — let’s use that.</p>
              </div>
              <Button variant="primary" iconRight="arrowRight" onClick={() => onSwitchMode('beginner')} data-testid="fastest-fallback">
                Solve it stage by stage
              </Button>
            </>
          ) : (
            <>
              <span className="flex size-12 items-center justify-center rounded-[13px] bg-accent-soft text-accent-text">
                <Spinner size={26} />
              </span>
              <div>
                <h2 className="text-xl text-ink">Hunting for a shortcut…</h2>
                <p className="mt-1 text-base text-ink-muted">A cube has 43 quintillion positions. I’m searching for a way home from yours in about 20 turns — it takes a few seconds the first time.</p>
              </div>
            </>
          )}
        </Card>
      </div>
    )
  }

  const finished = isFinished(walk, pos)
  const milestone = isMilestone(walk, pos)
  const step = walk.steps[pos.step]
  const index = globalIndex(walk, pos)
  const state = stateAt(walk, pos)
  const move = currentMove(walk, pos)
  const hold = step?.kind === 'hold'
  const stage = step && step.group !== 'fastest' ? getStage(step.group) : undefined
  const place = step ? stepPlace(walk, pos.step) : null
  const turnsDone = priorTurns + faceTurns(walk, index)
  const toBoundary = movesToBoundary(walk, pos)
  const statuses = STAGE_IDS.map((id) => groupStatus(walk, pos, id))
  const doneCount = statuses.filter((status) => status === 'done').length
  const currentInfo = getStage(STAGE_IDS[statuses.indexOf('current')] ?? '')

  const header =
    mode === 'beginner' ? (
      <div className="flex flex-col gap-2">
        <StageTracker
          variant="strip"
          size="sm"
          label={`Stages: ${doneCount} of 8 done`}
          items={STAGE_IDS.map((id, i) => {
            const info = getStage(id)!
            return { id, number: info.number, title: info.title, state: statuses[i] }
          })}
        />
        <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
          {currentInfo && !finished ? (
            <span className="text-ink" data-testid="walk-progress">
              {walkProgress(walk, pos, mode)}
            </span>
          ) : (
            <span className="text-cube-green-text">{doneCount === 8 ? 'All eight stages done' : `${doneCount} of 8 stages done`}</span>
          )}
        </p>
      </div>
    ) : (
      <ProgressBar value={index} max={Math.max(1, walk.total)} label="Turns done" showLabel valueText={`${index} of ${walk.total} turns`} tone="yellow" size="sm" />
    )

  let body: ReactNode

  if (compare) {
    body = (
      <motion.div key="compare" {...swap}>
        <Card variant="raised" padding="md" className="flex flex-col gap-3.5" data-testid="compare-panel">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
              <Icon name="eye" size={20} />
            </span>
            <div>
              <h2 className="text-lg text-ink">No problem — let’s find your place</h2>
              <p className="mt-0.5 text-base text-ink-muted">A wrong turn happens to everyone. This is how your cube should look right now. Is yours the same?</p>
            </div>
          </div>
          <div className="rounded-md bg-inset p-3">
            <CubeNet state={state} label="How your cube should look right now" className="mx-auto max-w-80" />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <HoldLine {...holdOf(state)} />
              <span className="num text-xs font-bold text-ink-faint" data-testid="compare-index">
                after turn {index} of {walk.total}
              </span>
            </div>
          </div>
          <p className="text-sm font-semibold text-ink-muted">The hidden sides are shown beside the big cube. If yours is different, step back until the picture matches your cube — then carry on from there.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" iconLeft="stepBack" onClick={onBack} disabled={isAtStart(pos)} data-testid="compare-back">
              Back one turn
            </Button>
            <Button variant="secondary" size="sm" iconLeft="restart" onClick={onStepStart} disabled={isAtStart(pos)} data-testid="compare-step-start">
              Start of this step
            </Button>
          </div>
          <div className="flex flex-col items-start gap-2.5 rounded-md bg-inset p-3">
            <div>
              <p className="text-sm font-bold text-ink">Never looks the same?</p>
              <p className="text-sm text-ink-muted">Show me your cube again. The colours are already filled in — you only fix the ones that are different, and I’ll solve it from there.</p>
            </div>
            <Button variant="secondary" size="sm" iconRight="arrowRight" onClick={onReenter} data-testid="compare-reenter">
              Fix the colours
            </Button>
          </div>
        </Card>
      </motion.div>
    )
  } else if (finished) {
    const stagesWorked = walk.groups.filter((group) => group !== 'fastest').length
    body = (
      <motion.div key="finished" {...swap}>
        <Card variant="raised" padding="lg" className="flex flex-col gap-4" data-testid="finish-card">
          <motion.span initial={{ scale: 0.5, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={springs.bouncy} className="flex size-16 items-center justify-center rounded-[18px] bg-cube-yellow text-on-yellow shadow-[0_4px_0_0_var(--cube-yellow-edge)]">
            <Icon name="trophy" size={34} />
          </motion.span>
          <div>
            <h2 className="text-3xl text-ink">Solved!</h2>
            <p className="mt-1 text-lg text-ink-muted">
              {walk.total === 0
                ? 'It was solved already.'
                : demo
                  ? 'That’s the whole solve, start to finish. Now grab a real cube and do it for real.'
                  : 'Look at the cube in your hands. Every face one colour — and you turned every turn yourself.'}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-2.5">
            <div className="rounded-md bg-inset px-3.5 py-3">
              <dt className="text-xs font-bold tracking-wide text-ink-faint uppercase">Turns</dt>
              <dd className="num font-display text-3xl font-extrabold text-ink" data-testid="finish-turns">
                {turnsDone}
              </dd>
            </div>
            <div className="rounded-md bg-inset px-3.5 py-3">
              <dt className="text-xs font-bold tracking-wide text-ink-faint uppercase">{mode === 'beginner' ? 'Stages worked' : 'Way'}</dt>
              <dd className="num font-display text-3xl font-extrabold text-ink">{mode === 'beginner' ? stagesWorked : 'Fastest'}</dd>
            </div>
          </dl>
          <p className="text-base text-ink-muted">
            {mode === 'beginner'
              ? 'You just did all eight stages with me showing the way. Learn each one properly and you won’t need me at all.'
              : 'That was the computer’s shortcut. To solve any cube yourself, learn the eight stages — they always work.'}
          </p>
          <div className="flex flex-wrap gap-2.5">
            <ButtonLink to="/learn" variant="primary" iconRight="arrowRight" data-testid="finish-learn">
              Learn to do it yourself
            </ButtonLink>
            <Button variant="secondary" iconLeft="restart" onClick={() => useSolve.getState().startOver()} data-testid="finish-again">
              Solve another cube
            </Button>
            <Button variant="ghost" iconLeft="arrowLeft" onClick={onBack} disabled={walk.total === 0} data-testid="finish-back">
              Back a turn
            </Button>
          </div>
        </Card>
      </motion.div>
    )
  } else if (milestone && step) {
    const nextStep = walk.steps[pos.step + 1]
    const nextStage = nextStep && nextStep.group !== 'fastest' ? getStage(nextStep.group) : undefined
    const left = walk.groups.length - walk.groups.indexOf(step.group) - 1
    body = (
      <motion.div key={`milestone-${pos.step}`} {...swap}>
        <Card variant="raised" padding="lg" className="flex flex-col gap-3.5" data-testid="milestone-card" data-stage={step.group}>
          <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springs.bouncy} className="flex size-14 items-center justify-center rounded-[15px] bg-cube-green text-on-green shadow-[0_3px_0_0_var(--cube-green-edge)]">
            <Icon name="check" size={30} weight={3} />
          </motion.span>
          <div>
            <p className="eyebrow">Stage {stage?.number} of 8</p>
            <h2 className="text-2xl text-ink">{stage?.title ?? 'Stage'} done!</h2>
            <p className="mt-1 text-base text-ink-muted">
              {nextStage ? (
                <>
                  Check your cube matches the picture. Next up: <span className="font-bold text-ink">{nextStage.title.toLowerCase()}</span> — {nextStage.goal.charAt(0).toLowerCase() + nextStage.goal.slice(1)}
                </>
              ) : (
                'Check your cube matches the picture.'
              )}
            </p>
          </div>
          <p className="text-sm font-semibold text-ink-muted">
            {left === 1 ? 'Just one stage to go.' : `${left} stages to go.`} Need a rest? Your place is saved — close the page and come back any time.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/" variant="secondary" size="sm" onClick={() => toast({ title: 'Saved', description: 'Open “Solve my cube” to carry on right here.', tone: 'green', icon: 'check' })} data-testid="take-break">
              Take a break
            </ButtonLink>
            <Button variant="ghost" size="sm" iconLeft="alert" onClick={() => onCompare(true)}>
              My cube doesn’t match
            </Button>
          </div>
        </Card>
      </motion.div>
    )
  } else if (step && move) {
    const first = pos.step === 0 && hold
    const after = holdOf(walk.states[walk.offsets[pos.step + 1]])
    const algorithm = step.algorithm
    body = (
      <motion.div key={`step-${pos.step}`} {...swap}>
        <Card variant="raised" padding="md" className={cx('flex flex-col gap-3.5', hold && 'ring-2 ring-accent')} data-testid="step-card" data-kind={step.kind} data-step={pos.step}>
          <div>
            <p className={cx('eyebrow flex items-center gap-1.5', hold && 'text-accent-text!')}>
              {hold && <Icon name="rotateCw" size={13} weight={2.8} />}
              {hold ? (first ? 'Before we start · hold your cube like this' : 'Stop · turn the whole cube') : mode === 'fastest' ? 'Fastest way' : `Step ${place!.number} of ${place!.of}`}
            </p>
            <h2 className="mt-0.5 text-xl text-ink" data-testid="step-title">
              {step.title}
            </h2>
            <p className="mt-1 text-base text-ink-muted">{step.explanation}</p>
          </div>

          {hold && (
            <div className="flex flex-col gap-1.5 rounded-md bg-accent-soft px-3.5 py-3">
              <p className="text-xs font-bold tracking-wide text-accent-text uppercase">When you’ve turned it, you should have</p>
              <HoldLine {...after} />
            </div>
          )}

          {!hold && step.moves.length > 1 && (
            <div className="flex flex-col gap-2">
              <MoveSequence moves={step.moves as string[]} size="md" activeIndex={pos.move} label="All the turns of this step" />
              {step.setupCount > 0 && pos.move < step.setupCount && <p className="text-sm font-semibold text-ink-muted">First line things up — then the real moves start.</p>}
            </div>
          )}

          {algorithm && stage && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
              <Icon name="cards" size={16} className="text-ink-faint" />
              <span>
                This is the <span className="font-bold text-ink">{algorithm.name}</span>
                {algorithm.repetitions > 1 ? `, ${algorithm.repetitions} times in a row` : ''}.
              </span>
              <Link to="/algorithms" className="font-bold text-accent-text underline-offset-2 hover:underline">
                See the card
              </Link>
              <span aria-hidden="true">·</span>
              <Link to={`/learn/${stage.id}`} className="font-bold text-accent-text underline-offset-2 hover:underline">
                Learn it
              </Link>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {!hold && step.moves.length > 1 && (
              <>
                <Button variant="soft" size="sm" iconLeft={playing ? 'pause' : 'play'} onClick={onTogglePlay} data-testid="walk-play" aria-pressed={playing}>
                  {playing ? 'Pause' : 'Play this step'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft="gauge"
                  onClick={() => useSolve.getState().setSpeed(SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length])}
                  aria-label={`Play speed ${speed}×. Tap to change.`}
                  data-testid="walk-speed"
                >
                  <span className="num">{speed}×</span>
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" iconLeft="alert" className="ml-auto" onClick={() => onCompare(true)} data-testid="walk-mismatch">
              My cube doesn’t match
            </Button>
          </div>
        </Card>
      </motion.div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="walk-panel" data-state={finished ? 'finished' : milestone ? 'milestone' : 'step'} data-index={index} data-total={walk.total}>
      <div className="flex flex-col gap-3">
        {!finished && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {modeSwitch}
            {mode === 'fastest' && (
              <span className="num text-xs font-bold text-ink-faint" data-testid="walk-progress">
                {walkProgress(walk, pos, mode)}
              </span>
            )}
          </div>
        )}
        {pendingMode && !finished && toBoundary > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-accent-soft px-3.5 py-3" role="status" data-testid="mode-pending" data-mode={pendingMode}>
            <p className="min-w-0 grow basis-60 text-sm text-ink">
              <span className="font-bold">
                Finish this step first — {toBoundary === 1 ? '1 more turn' : `${toBoundary} more turns`}.
              </span>{' '}
              Then I’ll switch to {pendingMode === 'fastest' ? 'the fastest way' : 'stage by stage'}. Changing plans half-way through a step would mess up the parts you’ve already solved.
            </p>
            <Button variant="secondary" size="sm" onClick={() => onSwitchMode(mode)} data-testid="mode-pending-cancel">
              {mode === 'fastest' ? 'Stay on the fastest way' : 'Stay with stage by stage'}
            </Button>
          </div>
        )}
        {header}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {body}
      </AnimatePresence>
    </div>
  )
}

export interface WalkDockProps {
  walk: Walk
  pos: WalkPos
  compare: boolean
  onNext: () => void
  onBack: () => void
  onCompare: (open: boolean) => void
}

/**
 * The big Back / Next buttons. Beside the cube on a tablet; on a phone they ride just above
 * the tab bar, in reach of the thumb of the hand that is holding the cube.
 */
export function WalkDock({ walk, pos, compare, onNext, onBack, onCompare }: WalkDockProps) {
  const finished = isFinished(walk, pos)
  const milestone = isMilestone(walk, pos)
  const hold = walk.steps[pos.step]?.kind === 'hold'
  if (finished && !compare) return null
  return (
    <div
      className="sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-20 -mx-4 flex items-center gap-2.5 border-t border-line bg-bg px-4 py-3 max-md:order-4 sm:-mx-6 sm:px-6 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0"
      data-testid="walk-controls"
    >
      {compare ? (
        <Button variant="primary" size="lg" iconLeft="check" fullWidth onClick={() => onCompare(false)} data-testid="compare-done">
          It matches now — carry on
        </Button>
      ) : (
        <>
          <IconButton icon="arrowLeft" label="Back a turn" variant="secondary" size="lg" onClick={onBack} disabled={isAtStart(pos)} data-testid="walk-back" />
          <Button variant="primary" size="lg" iconRight="arrowRight" fullWidth onClick={onNext} data-testid="walk-next">
            {milestone ? 'Keep going' : hold ? 'Done — I’ve turned it' : 'Next turn'}
          </Button>
        </>
      )}
    </div>
  )
}
