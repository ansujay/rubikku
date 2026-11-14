/**
 * Step 3, "Where am I?": what is already done on his cube, which stage he is on, and the very
 * next thing to do — before (or instead of) the full guided solution.
 */
import { useMemo } from 'react'
import { motion } from 'motion/react'
import { analyzeCube, nextHint, type BeginnerHint, type CubeState } from '../../cube'
import { STAGES } from '../../store'
import { Button, ButtonLink, Card, cx, Icon, MoveSequence, springs, StageTracker } from '../../ui'
import { useSolve } from './solveStore'

export interface WhereResume {
  /** Turns of the solution done so far, and how many it has. */
  turn: number
  total: number
  /** Turns left in the step he is in the middle of (0 between steps). */
  toStepEnd: number
  mode: 'beginner' | 'fastest'
  onResume: () => void
}

export interface WherePanelProps {
  /** The cube to describe. Opened from inside a solution, this is the cube as it is now. */
  state: CubeState
  onSolve: () => void
  onFastest: () => void
  /** Set when a solution is under way: the panel offers to carry on with it instead of starting one. */
  resume?: WhereResume
}

export function WherePanel({ state, onSolve, onFastest, resume }: WherePanelProps) {
  const intent = useSolve((s) => s.intent)
  const demo = useSolve((s) => s.demo)
  const analysis = useMemo(() => analyzeCube(state), [state])
  const hint = useMemo<BeginnerHint | null>(() => {
    try {
      return nextHint(state)
    } catch {
      return null
    }
  }, [state])
  const current = analysis.current ? STAGES.find((stage) => stage.id === analysis.current) : undefined
  const doneCount = analysis.completed.length

  if (analysis.solved) {
    return (
      <Card variant="raised" padding="lg" className="flex flex-col items-start gap-4" data-testid="where-panel" data-solved="true">
        <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springs.bouncy} className="flex size-14 items-center justify-center rounded-[15px] bg-cube-green text-on-green shadow-[0_3px_0_0_var(--cube-green-edge)]">
          <Icon name="check" size={30} weight={3} />
        </motion.span>
        <div>
          <h2 className="text-2xl text-ink">It’s already solved!</h2>
          <p className="mt-1 text-base text-ink-muted">Every face is one colour — nothing left to do. Give it a good scramble and come back, and I’ll walk you through it.</p>
        </div>
        <Button variant="primary" iconLeft="restart" onClick={() => useSolve.getState().startOver()}>
          Enter another cube
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="where-panel" data-current={analysis.current ?? ''} data-resume={resume ? resume.turn : undefined}>
      <Card variant="raised" padding="md" className="flex flex-col gap-3">
        <div>
          <p className="eyebrow">Where you are</p>
          <h2 className="text-xl text-ink" data-testid="where-title">
            {doneCount === 0 ? 'Right at the start' : doneCount === 1 ? '1 stage done already' : `${doneCount} stages done already`}
            {current ? ` — next: ${current.title.toLowerCase()}` : ''}
          </h2>
        </div>
        <StageTracker
          variant="list"
          size="sm"
          label="The eight stages"
          items={analysis.stageList.map((progress, i) => {
            const info = STAGES[i]
            const state = progress.complete ? ('done' as const) : progress.stage === analysis.current ? ('current' as const) : ('todo' as const)
            return {
              id: progress.stage,
              number: info.number,
              title: info.title,
              state,
              summary: state === 'done' ? 'Done' : state === 'current' ? progress.summary : info.goal,
              meta:
                state === 'current' ? (
                  <span className="flex gap-0.5 pt-0.5" aria-label={`${progress.done} of ${progress.total} pieces in place`}>
                    {Array.from({ length: progress.total }, (_, k) => (
                      <span key={k} className={cx('h-4 w-1.5 rounded-full', k < progress.done ? 'bg-accent' : 'bg-line-strong')} />
                    ))}
                  </span>
                ) : undefined,
            }
          })}
        />
        {resume && resume.toStepEnd > 0 ? (
          <p className="text-sm font-semibold text-ink-muted" data-testid="where-midstep">
            You’re in the middle of a step, so a few pieces are out of place for a moment. That’s normal — they come back when the step is finished.
          </p>
        ) : (
          doneCount > 0 && <p className="text-sm font-semibold text-ink-muted">The pieces that are already home are lit up on the cube.</p>
        )}
      </Card>

      {resume && (
        <Card variant="raised" padding="md" className="flex flex-col gap-3" data-testid="where-resume">
          <div>
            <h3 className="text-lg text-ink">We’re in the middle of solving it</h3>
            <p className="text-base text-ink-muted">
              {resume.turn === 0 ? 'No turns done yet' : `${resume.turn} of ${resume.total} turns done`}
              {resume.mode === 'fastest' ? ' on the fastest way' : ''}. The big cube shows your cube as it should look right now.
              {resume.toStepEnd > 0 ? ` ${resume.toStepEnd === 1 ? 'One more turn finishes' : `${resume.toStepEnd} more turns finish`} the step you’re on.` : ''}
            </p>
          </div>
          <Button variant="primary" size="lg" iconRight="arrowRight" fullWidth onClick={resume.onResume} data-testid="where-carry-on">
            Carry on from here
          </Button>
        </Card>
      )}

      {!resume && hint?.step && current && (
        <Card variant="raised" padding="md" className="flex flex-col gap-3" data-testid="where-hint">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-cube-yellow-soft text-cube-yellow-text">
              <Icon name="lightbulb" size={20} />
            </span>
            <div className="min-w-0">
              <p className="eyebrow">Your very next step</p>
              <h3 className="text-lg text-ink">{hint.step.caseName}</h3>
              <p className="mt-1 text-base text-ink-muted">{hint.step.explanation}</p>
            </div>
          </div>
          {hint.step.kind === 'turn' && <MoveSequence moves={hint.step.moves} size="sm" label="Moves for this step" />}
          <ButtonLink to={`/learn/${current.id}`} variant={intent === 'where' ? 'primary' : 'soft'} size="sm" iconRight="arrowRight" className="self-start" data-testid="lesson-link">
            Learn stage {current.number}: {current.title}
          </ButtonLink>
        </Card>
      )}

      {!resume && <Card variant="raised" padding="md" className="flex flex-col gap-3">
        <div>
          <h3 className="text-lg text-ink">Want to solve it together?</h3>
          <p className="text-base text-ink-muted">
            I’ll show every turn on the cube, one at a time, and you copy it on yours.{demo ? ' (This is a pretend cube — it works just the same.)' : ''}
          </p>
        </div>
        <Button variant={intent === 'where' ? 'secondary' : 'primary'} size="lg" iconRight="arrowRight" fullWidth onClick={onSolve} data-testid="start-solve">
          Solve it with me
        </Button>
        <div className="flex flex-col items-start gap-2.5 rounded-md bg-inset p-3">
          <div>
            <p className="text-sm font-bold text-ink">In a hurry?</p>
            <p className="text-sm text-ink-muted">The fastest way takes about 20 turns. It’s quick, but it won’t teach you anything — the stage-by-stage way is the one to learn.</p>
          </div>
          <Button variant="secondary" size="sm" iconLeft="bolt" onClick={onFastest} data-testid="start-fastest">
            Fastest way
          </Button>
        </div>
        <Button variant="ghost" size="sm" iconLeft="chevronLeft" className="self-start" onClick={() => useSolve.getState().setPhase('entry')} data-testid="edit-colours">
          Change the colours
        </Button>
      </Card>}
    </div>
  )
}
