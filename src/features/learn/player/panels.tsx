/** The part of the text panel that is specific to each kind of beat. */
import { useState } from 'react'
import { motion } from 'motion/react'
import type { CubeAnalysis, Move } from '../../../cube'
import { STAGE_IDS } from '../../../cube'
import { getStage } from '../../../store'
import type { CubePlayerApi } from '../../../three'
import { Button, cx, Icon, IconButton, MoveChip, ProgressBar, SegmentedControl, springs } from '../../../ui'
import type { Beat, DemoBeat, DrillBeat, GuidedBeat } from '../content'
import { segmentAt, type ResolvedPlay } from '../engine'
import { MASTERY_TARGET, type DrillSave } from '../learnStore'
import { AlgorithmNote, MoveLine, SegmentedMoves, SegmentNames } from './bits'
import { HintCard, type Coach } from './coach'
import { Prose, RichText } from './RichText'

// ───────────────────────── Title + text (every beat) ─────────────────────────

export function BeatBody({ beat, section, index, total, compact = false, fold = false }: { beat: Beat; section: string; index: number; total: number; compact?: boolean; fold?: boolean }) {
  // Once he has started an exercise only its first paragraph stays (it can be opened again):
  // the instruction he needs now is in the strip under the cube.
  const [open, setOpen] = useState(false)
  const short = compact && !open && beat.body.length > 1
  // A recognition round: the question and its answers come first; the words round it wait behind "?".
  const folded = fold && !open
  return (
    <div className="flex flex-col gap-2 sm:gap-2.5">
      <p className="eyebrow" data-testid="beat-eyebrow">
        {section} · {index + 1} of {total}
      </p>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl leading-tight text-ink outline-none md:text-2xl" data-testid="beat-title" tabIndex={-1}>
          {beat.title}
        </h2>
        {fold && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Hide the explanation' : 'What is this round about?'}
            className={cx(
              '-mt-0.5 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold transition-colors duration-150',
              open ? 'bg-accent-soft text-accent-text' : 'bg-inset text-ink-muted hover:text-ink',
            )}
            data-testid="beat-more"
          >
            ?
          </button>
        )}
      </div>
      {!folded && <Prose paragraphs={short ? beat.body.slice(0, 1) : beat.body} className="max-sm:gap-2 max-sm:leading-normal" />}
      {short && (
        <button type="button" onClick={() => setOpen(true)} className="-mt-1 self-start text-sm font-bold text-accent-text underline-offset-4 hover:underline">
          Read the rest
        </button>
      )}
      {beat.tip && !short && !folded && (
        <p className="flex gap-2.5 rounded-sm bg-cube-yellow-soft px-3 py-2.5 text-sm leading-snug font-semibold text-cube-yellow-text">
          <Icon name="lightbulb" size={17} className="mt-px shrink-0" />
          <span>
            <RichText text={beat.tip} />
          </span>
        </p>
      )}
    </div>
  )
}

// ───────────────────────── Info: a short animation to watch ─────────────────────────

export function InfoPanel({ label, watched, busy, onWatch }: { label: string; watched: boolean; busy: boolean; onWatch: () => void }) {
  // Nothing plays until he asks: the button pulses three times to say it is there, then rests.
  return (
    <div className="flex min-h-[3.75rem] items-center gap-3 rounded-md border border-line bg-surface px-2 py-1.5 shadow-1" data-testid="info-dock">
      <motion.div
        className="inline-block rounded-md"
        initial={false}
        animate={watched ? { scale: 1 } : { scale: [1, 1.06, 1] }}
        transition={watched ? { duration: 0.1 } : { duration: 0.9, repeat: 2, ease: 'easeInOut', delay: 0.6 }}
      >
        <Button variant={watched ? 'soft' : 'primary'} iconLeft={watched ? 'restart' : 'play'} onClick={onWatch} disabled={busy} data-testid="info-watch">
          {watched ? 'Watch again' : label}
        </Button>
      </motion.div>
      <p className="min-w-0 text-sm leading-snug text-ink-muted">{watched ? 'Watch it as often as you like.' : 'Read first, then watch.'}</p>
    </div>
  )
}

// ───────────────────────── Goal: before → after ─────────────────────────

export function GoalPanel({ player, busy }: { player: CubePlayerApi; busy: boolean }) {
  const { position, total, playing } = player
  const where = position === 0 ? 'before' : position === total ? 'after' : 'between'
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-2 shadow-1" data-testid="goal-panel" data-where={where}>
      <div className="flex flex-wrap items-center gap-2.5">
        <SegmentedControl
          ariaLabel="Show the cube before or after this stage"
          value={where}
          onChange={(value) => player.seek(value === 'before' ? 0 : total)}
          items={[
            { value: 'before', label: 'Before' },
            { value: 'after', label: 'After' },
          ]}
        />
        <Button variant="soft" iconLeft={playing ? 'pause' : position === total ? 'restart' : 'play'} onClick={player.toggle} disabled={busy && !playing} data-testid="goal-play">
          {playing ? 'Pause' : position === total ? 'Watch again' : 'Watch it happen'}
        </Button>
      </div>
      <ProgressBar value={position} max={total} size="sm" tone="accent" label="How far through the stage" valueText={`${position} of ${total} moves`} />
    </div>
  )
}

// ───────────────────────── Demo: step through a case ─────────────────────────

export function DemoPanel({ beat, play, player }: { beat: DemoBeat; play: ResolvedPlay; player: CubePlayerApi }) {
  const { position, activeIndex } = player
  const now = activeIndex >= 0 ? activeIndex : position
  return (
    <div className="flex flex-col gap-3.5" data-testid="demo-panel">
      <SegmentedMoves play={play} position={position} active={now} onSeek={player.seek} />
      {beat.algorithm && <AlgorithmNote id={beat.algorithm} />}
    </div>
  )
}

/**
 * Under the cube, always in view: the move being shown, in words, and one compact row of
 * transport buttons (the move chips in the panel are the scrubber: tap one to jump there).
 */
export function DemoDock({ play, player, speeds }: { play: ResolvedPlay; player: CubePlayerApi; speeds: readonly number[] }) {
  const { position, total, activeIndex, playing, speed } = player
  const now = activeIndex >= 0 ? activeIndex : position
  const move = play.moves[now]
  const segment = segmentAt(play, now)
  const atStart = position <= 0
  const atEnd = position >= total
  const nextSpeed = () => player.setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length])
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-surface px-2 py-1.5 shadow-1" data-testid="demo-dock">
      <div className="flex min-h-10 items-center px-1">
        {move ? (
          <div className="min-w-0">
            {play.segments.length === 1 && segment && segment.kind !== 'algorithm' && <p className="text-xs font-bold text-ink-faint">{segment.label}</p>}
            <MoveLine move={move} className="line-clamp-2" />
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-bold text-cube-green-text" data-testid="demo-end">
            <Icon name="check" size={16} weight={2.6} /> That is the whole case. Step back, or watch again.
          </p>
        )}
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="Playback">
        <IconButton icon="restart" label="Back to start" size="sm" onClick={player.restart} disabled={atStart} />
        <IconButton icon="stepBack" label="Step back" size="sm" filled onClick={() => player.step(-1)} disabled={atStart} />
        <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : atEnd && total > 0 ? 'Play again' : 'Play'} variant="primary" size="md" filled onClick={player.toggle} disabled={total === 0} className="mx-0.5" data-testid="demo-play" />
        <IconButton icon="stepForward" label="Step forward" size="sm" filled onClick={() => player.step(1)} disabled={atEnd} />
        <span className="num ml-auto text-center font-mono text-sm font-semibold text-ink-muted" aria-label={`Move ${Math.min(position, total)} of ${total}`}>
          {Math.min(position, total)}
          <span className="text-ink-faint">/{total}</span>
        </span>
        <button type="button" onClick={nextSpeed} aria-label={`Speed ${speed} times. Tap to change.`} className="key key-soft num h-10 min-w-12 rounded-sm px-2 font-mono text-sm font-bold">
          {`${String(speed).replace(/^0\./, '.')}×`}
        </button>
      </div>
    </div>
  )
}

// ───────────────────────── Guided: your turn ─────────────────────────

export type GuidedStatus =
  /** On the path. `revealed` when the next move is shown. */
  | { kind: 'go'; expected: Move; revealed: boolean }
  /** One quarter of a half turn made. */
  | { kind: 'half'; expected: Move }
  /** Off the path: `count` moves to undo. */
  | { kind: 'off'; wrong: Move; count: number; expected: Move }
  /** A free exercise: any moves, the goal decides. */
  | { kind: 'free' }
  | { kind: 'done' }

/**
 * How much of the moves is on show: all of them with the arrow; all of them without it; the
 * first one only; none (the step names, or nothing at all).
 */
export type RepScaffold = 'full' | 'chips' | 'first' | 'names' | 'none'

export function GuidedPanel({
  beat,
  display,
  status,
  position,
  scaffold,
  judged,
  rep,
  explanation,
  coach,
  busy,
  canUndo,
  onUndo,
  onHint,
  onRestart,
  onShowMe,
}: {
  beat: GuidedBeat
  /** The moves still to make (re-planned from where he is when judged by result). */
  display: Pick<ResolvedPlay, 'moves' | 'segments'>
  status: GuidedStatus
  position: number
  scaffold: RepScaffold
  judged: 'path' | 'result'
  /** "Five in a row": rounds finished and how many there are. */
  rep: { done: number; total: number } | null
  /** The solver's reason for the step, once he has asked for a hint. */
  explanation: string | null
  coach: Coach
  busy: boolean
  canUndo: boolean
  onUndo: () => void
  onHint: () => void
  onRestart: () => void
  onShowMe: (moves: readonly Move[]) => void
}) {
  const coached = judged === 'result' && beat.scaffold === 'none'
  const algorithm = display.segments.find((s) => s.kind === 'algorithm')
  return (
    <div
      className="flex flex-col gap-3.5"
      data-testid="guided-panel"
      data-status={status.kind}
      data-scaffold={beat.scaffold}
      data-help={scaffold}
      data-judged={judged}
      data-position={position}
      data-rep={rep?.done}
      data-reps={rep?.total}
    >
      {rep && (
        <div className="flex items-center gap-3 rounded-md bg-inset px-3.5 py-2.5" data-testid="reps">
          <p className="eyebrow shrink-0">Five in a row</p>
          <div className="flex grow gap-1.5" role="img" aria-label={`${Math.min(rep.done, rep.total)} of ${rep.total} rounds done`}>
            {Array.from({ length: rep.total }, (_, i) => (
              <motion.span
                key={i}
                initial={false}
                animate={{ scale: i < rep.done ? 1 : 0.9 }}
                transition={springs.bouncy}
                className={cx('h-2.5 w-7 rounded-full', i < rep.done ? 'bg-cube-green' : i === rep.done ? 'bg-accent' : 'bg-surface ring-1 ring-inset ring-line-strong')}
              />
            ))}
          </div>
          <span className="shrink-0 text-xs font-bold text-ink-muted">
            {rep.done >= rep.total ? 'All five!' : ['Arrows', 'Moves only', 'First move', 'From memory', 'From memory'][Math.min(rep.done, 4)]}
          </span>
        </div>
      )}

      {(scaffold === 'full' || scaffold === 'chips') && <SegmentedMoves play={display} position={position} />}
      {scaffold === 'first' && (
        <div className="flex flex-col gap-1.5" data-testid="moves" data-position={position} data-total={display.moves.length}>
          <p className="text-xs font-bold text-ink-faint">{algorithm?.label ?? 'The moves'} — the first move, then from memory</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <MoveChip move={display.moves[0]} size="md" state={position > 0 ? 'done' : 'active'} />
            {display.moves.slice(1).map((_, i) => (
              <span key={i} className={cx('flex size-10 items-center justify-center rounded-sm text-sm font-bold', i + 1 < position ? 'bg-cube-green-soft text-cube-green-text' : 'bg-inset text-ink-faint')} aria-hidden="true">
                {i + 1 < position ? <Icon name="check" size={14} weight={3} /> : '?'}
              </span>
            ))}
          </div>
        </div>
      )}
      {scaffold === 'none' && rep && (
        <p className="rounded-md bg-inset px-3.5 py-3 text-sm text-ink-muted" data-testid="moves" data-position={position} data-total={display.moves.length}>
          <span className="font-bold text-ink">{algorithm?.label ?? 'The algorithm'}</span>, from memory: {display.moves.length} moves. {position > 0 ? `${position} done.` : 'Say them as you go.'}
        </p>
      )}
      {scaffold === 'names' && <SegmentNames segments={display.segments} position={status.kind === 'done' ? display.moves.length : position} />}
      {explanation && scaffold === 'names' && (
        <p className="rounded-md bg-cube-yellow-soft px-3.5 py-3 text-sm leading-relaxed text-ink-muted" data-testid="hint-why">
          <Icon name="lightbulb" size={15} className="mr-1.5 -mt-0.5 inline text-cube-yellow-text" />
          <RichText text={explanation} />
        </p>
      )}
      {coached && <HintCard coach={coach} onShowMe={onShowMe} onUndo={onUndo} onMore={onHint} busy={busy} />}

      <div className="flex flex-wrap items-center gap-2">
        {status.kind === 'done' ? (
          <Button variant="soft" size="sm" iconLeft="restart" onClick={onRestart} data-testid="guided-again">
            {rep ? 'Five more' : 'Do it again'}
          </Button>
        ) : (
          <>
            {status.kind !== 'off' && (
              <Button variant="secondary" size="sm" iconLeft="undo" onClick={onUndo} disabled={!canUndo || busy} data-testid="undo-button">
                Undo
              </Button>
            )}
            <Button variant="ghost" size="sm" iconLeft="restart" onClick={onRestart} disabled={!canUndo} className={cx(!canUndo && 'invisible')}>
              Start again
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ───────────────────────── Drills ─────────────────────────

const joinWords = (words: readonly string[]) => (words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`)

export function DrillPanel({
  beat,
  drill,
  analysis,
  coach,
  busy,
  moves,
  canUndo,
  onUndo,
  onHint,
  onRestart,
  onNext,
  onShowMe,
  mastered,
  hardLeft,
  hardHere,
}: {
  beat: DrillBeat
  drill: DrillSave
  /** Three clean solves, the hard cases among them. */
  mastered: boolean
  /** The stage's hard cases not yet solved cleanly (words). */
  hardLeft: readonly string[]
  /** The hard cases on this practice cube (words). */
  hardHere: readonly string[]
  analysis: CubeAnalysis
  coach: Coach
  busy: boolean
  moves: number
  canUndo: boolean
  onUndo: () => void
  onHint: () => void
  onRestart: () => void
  onNext: () => void
  onShowMe: (moves: readonly Move[]) => void
}) {
  const stage = analysis.stages[beat.stage]
  // An earlier stage came undone. `analysis` describes the cube at the last sound moment while he
  // is inside an algorithm (see the step follower), so this is only ever said at a step boundary
  // or when he has really left the path — never one correct move into an algorithm.
  const broken = !drill.solved && !analysis.twistInProgress && analysis.current !== null && STAGE_IDS.indexOf(analysis.current) < STAGE_IDS.indexOf(beat.stage)
  const brokenStage = broken && analysis.current ? getStage(analysis.current) : undefined
  // A few turns off a step is a slip, not a ruined cube: say how to get back, not what "came undone"
  // (and say nothing here while the hint card is already saying it).
  const slipped = coach.follower.trail.length
  return (
    <div className="flex flex-col gap-3.5" data-testid="drill-panel" data-n={drill.n} data-solved={drill.solved} data-clean={drill.clean} data-total={drill.total} data-mastered={mastered} data-hard={hardHere.join('|')}>
      <div className="flex items-center gap-3.5 rounded-md bg-inset px-3.5 py-3">
        <div className="shrink-0">
          <p className="eyebrow mb-1">{mastered ? 'Mastered' : 'Clean solves'}</p>
          <div className="flex items-center gap-1.5" role="img" aria-label={`${Math.min(drill.clean, MASTERY_TARGET)} of ${MASTERY_TARGET} clean solves`}>
            {Array.from({ length: MASTERY_TARGET }, (_, i) => (
              <motion.span
                key={i}
                initial={false}
                animate={{ scale: i < drill.clean ? 1 : 0.92 }}
                transition={springs.bouncy}
                className={cx(
                  'flex size-7 items-center justify-center rounded-[9px]',
                  i < drill.clean ? 'bg-cube-yellow text-on-yellow shadow-[0_2px_0_0_var(--cube-yellow-edge)]' : 'bg-surface text-ink-faint ring-1 ring-inset ring-line-strong',
                )}
              >
                <Icon name="star" size={15} weight={2.4} />
              </motion.span>
            ))}
          </div>
        </div>
        <p className="min-w-0 border-l border-line-strong pl-3.5 text-sm leading-snug text-ink-muted">
          {mastered
            ? `You have mastered this stage. ${drill.total} solved so far.`
            : drill.clean >= MASTERY_TARGET && hardLeft.length > 0
              ? `Three clean! To master it, also solve one with ${joinWords(hardLeft)} without help.`
              : hardLeft.length > 0
                ? `Solve ${MASTERY_TARGET} cubes without being shown the moves — among them ${joinWords(hardLeft)}.`
                : `Solve ${MASTERY_TARGET} cubes without being shown the moves to master the stage.`}
        </p>
      </div>
      {hardHere.length > 0 && !drill.solved && (
        <p className="flex items-center gap-2 rounded-md bg-cube-yellow-soft px-3.5 py-2 text-sm font-semibold text-cube-yellow-text" data-testid="drill-hard">
          <Icon name="target" size={16} className="shrink-0" />
          <span>A hard one: this cube has {joinWords(hardHere)}.</span>
        </p>
      )}

      {drill.solved ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-md bg-cube-green-soft px-3.5 py-3" data-testid="drill-solved" aria-live="polite">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-cube-green text-on-green">
            <Icon name="check" size={20} weight={3} />
          </span>
          <div className="min-w-0 grow basis-40">
            <p className="text-base font-bold text-ink">{drill.hinted ? 'Solved, with a hint.' : 'Solved. No hints!'}</p>
            <p className="text-sm text-ink-muted">
              {drill.hinted ? 'Hints are fine. Only solves without the moves shown earn a star.' : drill.streak > 1 ? `${drill.streak} clean in a row.` : `${moves} moves.`}
            </p>
          </div>
          <Button variant="success" size="sm" iconRight="arrowRight" onClick={onNext} data-testid="drill-next">
            Another cube
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="sr-only">
            <span data-testid="drill-summary">{analysis.twistInProgress ? 'Twisting corners. The bottom comes back at the end.' : stage.summary}</span>
          </p>
          <ProgressBar value={stage.done} max={stage.total} segments={stage.total} size="md" tone="green" label="Pieces of this stage in place" />
          {brokenStage && !(slipped > 0 && coach.showing) && (
            <p className="flex gap-2 text-sm leading-snug font-semibold text-cube-red-text" role="status" data-testid="drill-undone" data-slipped={slipped}>
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              <span>
                {slipped > 0
                  ? `${slipped === 1 ? 'That last turn has' : `Your last ${slipped} turns have`} disturbed a layer you had finished. Turn ${slipped === 1 ? 'it' : 'them'} straight back (or tap Undo).`
                  : `Stage ${brokenStage.number} (${brokenStage.title}) has come undone. On a real cube: go back to stage ${brokenStage.number} and redo it from there. Here, Hint leads you back.`}
              </span>
            </p>
          )}
        </div>
      )}

      {!drill.solved && <HintCard coach={coach} onShowMe={onShowMe} onUndo={onUndo} onMore={onHint} busy={busy} />}

      {!drill.solved && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" iconLeft="undo" onClick={onUndo} disabled={!canUndo || busy} data-testid="undo-button">
            Undo
          </Button>
          <Button variant="ghost" size="sm" iconLeft="restart" onClick={onRestart} disabled={!canUndo}>
            Start again
          </Button>
          <Button variant="ghost" size="sm" iconLeft="shuffle" onClick={onNext} className="ml-auto" data-testid="drill-skip">
            New cube
          </Button>
        </div>
      )}
    </div>
  )
}
