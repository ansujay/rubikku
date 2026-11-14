/**
 * The coach: a hint on demand, for drills, free exercises, the full solve and free play.
 *
 * It is a thin layer over the shared step follower (`useStepFollower`, `src/cube/beginner/follow`):
 * the follower always knows where he is in the method, so a hint is never worked out from a
 * half-done algorithm. On the step → the next move; half-way through a half turn → "once more";
 * a slip → "undo that" (and the step is still there afterwards); only a cube that is genuinely
 * somewhere else gets a fresh plan, and the card says so.
 */
import { useEffect, useMemo, useState } from 'react'
import { findPiece, isRotation, pathRemaining, type CubeState, type FreshPlan, type Move, type SolveStep, type StepFollower } from '../../../cube'
import { getStage } from '../../../store'
import { useStepFollower, type CubeControllerApi, type CubeHighlight } from '../../../three'
import { Button, Card, cx, Icon, IconButton, MoveSequence } from '../../../ui'
import { MoveLine, TurnChip } from './bits'
import { RichText } from './RichText'

export interface Coach {
  /** Where he is in the method — live even while no hint is showing. */
  follower: StepFollower
  /** The cube to describe in a tracker or a warning (the last sound cube while inside an algorithm). */
  view: CubeState
  /** A hint is on screen. */
  showing: boolean
  /** The step on the card (for a moment after finishing it: the finished step), or null. */
  step: SolveStep | null
  /** Its moves, as they read in the current hold. */
  moves: readonly Move[]
  /** Moves of the step done so far. */
  index: number
  /** The step on the card has just been finished. */
  done: boolean
  /** On the step, one quarter into a half turn, or off it (with `undo` leading back). */
  status: 'on' | 'half' | 'off'
  /** The move to preview on the cube: the next move, or the undo after a slip. Null without a hint. */
  nextMove: Move | null
  /** The moves that finish the step from here ("Show me"). */
  remaining: readonly Move[]
  /** The first move that left the step, and the way back. */
  wrong: Move | null
  undo: readonly Move[]
  /** Why the plan was made from the middle of nowhere, if it was. */
  fresh: FreshPlan | null
  /** A message when there is no step to show ("already solved"). */
  note: string | null
  highlight: CubeHighlight | null
  /** True when a hinted piece cannot be seen from the front (so the mirrors should come out). */
  hidden: boolean
  ask: () => void
  clear: () => void
  /** A fresh plan from the cube as it is now ("hint from here"). */
  replan: () => void
  /**
   * How much the hint gives away (with `levels` on): 1 — the piece is lit and he is asked which
   * case it is; 2 — the case is named and explained; 3 — the moves and the arrow. Always 3 without
   * `levels`. Only level 3 costs a clean solve.
   */
  level: 1 | 2 | 3
}

export interface CoachOptions {
  /** False on beats and screens with no coach. */
  enabled?: boolean
  /** Keep the hint open from one step to the next (free play). Default: one hint, one step. */
  advance?: boolean
  solvedNote?: string
  /** Hints in three taps (see `Coach.level`). Default false: the whole hint at once. */
  levels?: boolean
  /** How white corners are put in (the lessons teach the trigger first). */
  whiteCorners?: 'cases' | 'trigger'
}

const STUCK_NOTE = 'I cannot work out a hint for this cube. Start it again.'

export function useCoach(cube: Pick<CubeControllerApi, 'state' | 'start' | 'history' | 'busy'>, options: CoachOptions = {}): Coach {
  const { enabled = true, advance = false, solvedNote = 'This cube is already solved.', levels = false, whiteCorners } = options
  /** The follower's step count when the hint was asked for; null when no hint is open. */
  const [openAt, setOpenAt] = useState<number | null>(null)
  /** The step count whose "done" moment is over. */
  const [flashed, setFlashed] = useState(-1)
  const [asked, setAsked] = useState(false)
  const [level, setLevel] = useState<1 | 2 | 3>(3)
  const { follower, ask: prepare, replan } = useStepFollower(cube, { enabled, guiding: openAt !== null, whiteCorners })
  const { state, busy } = cube
  const { serial, completed } = follower

  const flashing = openAt !== null && completed !== null && flashed !== serial && (advance || openAt === serial - 1)
  const showing = enabled && openAt !== null && (flashing || advance || openAt === serial)
  const settled = follower.status === 'solved' || follower.status === 'stuck'

  const clear = () => {
    setOpenAt(null)
    setAsked(false)
  }

  // A finished step stays on the card for a moment, then makes way (free play: for the next step).
  useEffect(() => {
    if (!flashing || busy) return
    const timer = window.setTimeout(
      () => {
        setFlashed(serial)
        if (!advance || settled) setOpenAt(null)
      },
      advance ? 500 : 900,
    )
    return () => window.clearTimeout(timer)
  }, [flashing, busy, serial, advance, settled])

  // One hint, one step: once he has moved on, the next hint is his to ask for.
  useEffect(() => {
    if (openAt !== null && !showing) setOpenAt(null)
  }, [openAt, showing])
  useEffect(() => {
    if (asked && !settled) setAsked(false)
  }, [asked, settled])

  const step = !showing ? null : flashing ? completed : follower.step
  const done = showing && flashing
  const status: Coach['status'] = !showing || done || follower.status === 'on' || follower.status === 'done' || settled ? 'on' : follower.status

  const highlight = useMemo<CubeHighlight | null>(() => (step && !done && step.highlight.pieces.length > 0 ? { pieces: step.highlight.pieces } : null), [step, done])
  const hidden = useMemo(() => {
    if (!step || done) return false
    try {
      return step.highlight.pieces.some((piece) => findPiece(state, piece).stickers.every((sticker) => 'BLD'.includes(sticker.face)))
    } catch {
      return false
    }
  }, [step, done, state])

  return {
    follower,
    view: enabled ? follower.view : state,
    showing,
    step,
    moves: done ? completed!.moves : follower.moves,
    index: done ? completed!.moves.length : follower.position,
    done,
    status,
    nextMove: showing && !done && (!levels || level === 3 || status === 'off') ? follower.next : null,
    remaining: showing && !done && status !== 'off' ? pathRemaining(follower) : [],
    wrong: status === 'off' ? follower.trail[0] : null,
    undo: status === 'off' ? follower.undo : [],
    fresh: showing && !done ? follower.fresh : null,
    note: enabled && asked && settled ? (follower.status === 'solved' ? solvedNote : STUCK_NOTE) : null,
    highlight,
    hidden,
    ask: () => {
      if (levels && showing && !done && level < 3) {
        setLevel(level === 1 ? 2 : 3)
        return
      }
      prepare()
      setAsked(true)
      setOpenAt(serial)
      setLevel(levels ? 1 : 3)
    },
    clear,
    replan,
    level: levels ? level : 3,
  }
}

const FRESH_TEXT: Record<FreshPlan, string> = {
  lost: 'That was a long way from the last step, so here is a new plan from where the cube is now.',
  asked: 'A new plan, starting from the cube as it is now.',
}

export function HintCard({
  coach,
  onShowMe,
  onUndo,
  onMore,
  busy,
  size = 'sm',
}: {
  coach: Coach
  /** Play the rest of the step. */
  onShowMe?: (moves: readonly Move[]) => void
  /** Take the latest move back (after a slip). */
  onUndo?: () => void
  /** The next level of help (with `levels`): usually the same as the Hint button. */
  onMore?: () => void
  busy?: boolean
  /** `md` is the roomier card of the Play page. */
  size?: 'sm' | 'md'
}) {
  const { step, note, index, done, status, level } = coach
  // Level 1: only the piece is lit — he names the case himself.
  const nudge = step !== null && !done && status !== 'off' && level === 1
  const named = step !== null && (done || status === 'off' || level >= 2)
  const withMoves = step !== null && (done || status === 'off' || level === 3)
  if (!step && !note) return null
  const stage = step ? getStage(step.stage) : undefined
  const md = size === 'md'
  // On the Play page the card sits directly under the page title; inside a lesson it is one level down.
  const Heading = md ? 'h2' : 'h3'
  const hold = step?.kind === 'hold' || (coach.remaining.length > 0 && coach.remaining.every(isRotation))
  /** Only whole-cube turns: shown in words, never as `y` or `z2`. */
  const turnsOnly = coach.moves.length > 0 && coach.moves.every(isRotation)
  const half = status === 'half' ? coach.moves[index] : null
  return (
    <Card
      variant={md ? 'raised' : 'inset'}
      padding={md ? 'md' : 'sm'}
      className={cx('flex flex-col', md ? 'gap-3' : 'gap-2.5 p-3.5!')}
      data-testid="hint-card"
      data-status={done ? 'done' : status}
      data-stage={step?.stage}
      data-case={step?.caseId}
      data-index={index}
      data-level={level}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className={cx('mt-0.5 flex shrink-0 items-center justify-center bg-cube-yellow-soft text-cube-yellow-text', md ? 'size-9 rounded-md' : 'size-8 rounded-sm')}>
          <Icon name="lightbulb" size={md ? 20 : 18} />
        </span>
        <div className="min-w-0 grow">
          {nudge && step ? (
            <>
              {stage && (
                <p className="eyebrow mb-0.5">
                  Stage {stage.number} · {stage.title}
                </p>
              )}
              <Heading className={cx('text-ink', md ? 'text-lg' : 'text-base font-bold')}>{step.kind === 'hold' ? 'How should you hold it?' : 'Which case is this?'}</Heading>
              <p className={cx('mt-1 text-ink-muted', md ? 'text-base' : 'text-sm leading-relaxed')}>
                {step.kind === 'hold'
                  ? 'Look at the lit pieces. Which side should face you to work on them? Yellow always stays on top.'
                  : 'Look at the lit piece: where is it, and which way do its stickers face? Work out which case it is — or ask for a little more help.'}
              </p>
            </>
          ) : step && named ? (
            <>
              {stage && (
                <p className="eyebrow mb-0.5">
                  Stage {stage.number} · {stage.title}
                </p>
              )}
              <Heading className={cx('text-ink', md ? 'text-lg' : 'text-base font-bold')}>{step.caseName}</Heading>
              {status !== 'off' && (
                <p className={cx('mt-1 text-ink-muted', md ? 'text-base' : 'text-sm leading-relaxed')}>
                  <RichText text={step.explanation} />
                </p>
              )}
              {coach.fresh && status !== 'off' && (
                <p className="mt-1.5 text-sm font-semibold text-ink" data-testid="hint-fresh">
                  {FRESH_TEXT[coach.fresh]}
                </p>
              )}
            </>
          ) : (
            <p className={cx('font-semibold text-ink', md ? 'pt-1.5 text-base' : 'pt-1 text-sm')}>{note}</p>
          )}
        </div>
        <IconButton icon="x" label="Close the hint" size="sm" onClick={coach.clear} />
      </div>

      {step && status === 'off' && coach.wrong && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-md bg-cube-red-soft px-3.5 py-3" role="alert" data-testid="hint-off" data-count={coach.undo.length}>
          <div className="min-w-0 grow basis-52">
            <p className="text-base font-bold text-ink">
              {coach.undo.length > 1 ? `You are ${coach.undo.length} moves off this step.` : <RichText text={`That was \`${coach.wrong}\`, not the next move.`} />}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">
              {coach.undo.length > 1 ? 'No harm done. Undo them one at a time — the arrow shows which way — and the step is still here.' : 'No harm done. Undo it and carry on from where you were.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onUndo && (
              <Button variant="secondary" size="sm" iconLeft="undo" onClick={onUndo} disabled={busy} data-testid="hint-undo">
                Undo that
              </Button>
            )}
            <Button variant="ghost" size="sm" iconLeft="lightbulb" onClick={coach.replan} disabled={busy} data-testid="hint-from-here">
              Hint from here
            </Button>
          </div>
        </div>
      )}

      {step && half && (
        <p className="rounded-md bg-accent-soft px-3.5 py-2.5 text-sm text-ink-muted" data-testid="hint-half">
          <span className="font-bold text-ink">Half-way.</span> <RichText text={`\`${half}\` is a half turn: turn the same ${isRotation(half) ? 'way' : 'face'} once more.`} />
        </p>
      )}

      {step && !withMoves && onMore && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="soft" size="sm" iconLeft="lightbulb" onClick={onMore} disabled={busy} data-testid="hint-more">
            {level === 1 ? 'Tell me the case' : 'Show me the moves'}
          </Button>
          <span className="text-xs font-semibold text-ink-faint">{level === 1 ? 'Help 1 of 3' : 'Help 2 of 3 · the moves cost the star'}</span>
        </div>
      )}

      {step && withMoves && (
        <div className={cx('flex flex-wrap items-center justify-between', md ? 'gap-3' : 'gap-2.5')}>
          {turnsOnly ? (
            // A hold step reads in words, as the lessons say it: "Roll the whole cube upside down".
            <div className="flex min-w-0 grow basis-60 flex-col gap-2" data-testid="hint-hold">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Turn the whole cube">
                {coach.moves.map((move, k) => (
                  <TurnChip key={k} move={move} size="sm" state={k < index ? 'done' : k === index && !done ? 'active' : done ? 'done' : 'upcoming'} />
                ))}
              </div>
              {!done && coach.moves[index] && <MoveLine move={coach.moves[index]} />}
            </div>
          ) : (
            <MoveSequence moves={coach.moves} size="sm" activeIndex={index} label="Moves for this step" />
          )}
          {onShowMe && (
            <Button
              variant="soft"
              size="sm"
              iconLeft={hold ? 'rotateCw' : 'play'}
              disabled={busy || done || status === 'off' || coach.remaining.length === 0}
              onClick={() => onShowMe(coach.remaining)}
              data-testid="hint-show"
            >
              {hold ? 'Turn the cube' : 'Show me'}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
