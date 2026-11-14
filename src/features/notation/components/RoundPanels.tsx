import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { describeMove, slotsOnFace, SLOTS, SOLVED, type Move, type SlotId } from '../../../cube'
import { MiniCube } from '../../../three'
import { AnimatedNumber, Badge, Button, Card, cx, Icon, IconButton, Kbd, MoveChip, MoveSequence, popIn, ProgressBar, ProgressRing, springs, Sticker } from '../../../ui'
import { pretty } from '../logic/explain'
import type { FollowState } from '../logic/follow'
import { levelsFor, UNLOCK_ACCURACY, LEVELS } from '../logic/levels'
import { currentRun, movesToWorkOn, scoreRound, type AnswerRecord, type MoveStats } from '../logic/mastery'
import { SPEED_ROUND_MS, type Round } from '../notationStore'
import { MoveCell } from './Hub'

const MODE_TITLE = { do: 'Do the move', name: 'Name the move', speed: 'Speed round' } as const

// ───────────────────────── Top bar ─────────────────────────

export function RoundBar({ round, onQuit }: { round: Round; onQuit: () => void }) {
  const level = LEVELS.find((item) => item.id === round.levelId)
  const levelNumber = round.mode === 'speed' ? 0 : levelsFor(round.mode).findIndex((item) => item.id === round.levelId) + 1
  const run = currentRun(round.answers)
  const total = round.questions.length
  const done = round.answers.length
  return (
    <header className="mb-4 flex items-center gap-3 md:mb-5">
      <IconButton icon="x" label={round.phase === 'summary' ? 'Back to the trainer' : 'Leave this round'} variant="secondary" size="sm" onClick={onQuit} data-testid="quit-round" />
      <div className="min-w-0 grow">
        <h1 className="truncate text-xl text-ink md:text-2xl">{MODE_TITLE[round.mode]}</h1>
        {level && (
          <p className="truncate text-sm font-semibold text-ink-muted">
            Level {levelNumber} · {level.title}
          </p>
        )}
      </div>
      <AnimatePresence>
        {run >= 2 && round.phase !== 'summary' && (
          <motion.span key="run" variants={popIn} initial="hidden" animate="show" exit="exit">
            <Badge tone="orange" icon="flame" data-testid="run">
              {run} in a row
            </Badge>
          </motion.span>
        )}
      </AnimatePresence>
      {round.mode !== 'speed' && (
        <div className="w-24 shrink-0 sm:w-36">
          <p className="num mb-1 text-right text-sm font-bold text-ink-muted" data-testid="round-progress">
            {Math.min(done + (round.phase === 'question' ? 1 : 0), total)} / {total}
          </p>
          <ProgressBar label="Round progress" value={done} max={total} size="sm" tone="accent" />
        </div>
      )}
    </header>
  )
}

// ───────────────────────── Prompts ─────────────────────────

export function DoPrompt({
  question,
  follow,
  fresh,
  hinted,
  onHint,
  speed,
}: {
  question: readonly Move[]
  follow: FollowState
  /** First time he meets this move: explain it. */
  fresh: boolean
  hinted: boolean
  onHint?: () => void
  speed?: boolean
}) {
  const single = question.length === 1
  const current = question[Math.min(follow.index, question.length - 1)]
  const help = fresh || hinted
  return (
    <Card padding="md" className={cx('flex gap-4', single ? 'items-start' : 'items-center')} data-testid="prompt" data-question={question.join(' ')}>
      <div className={cx('min-w-0 grow', single && 'flex flex-col items-center text-center')}>
        <p className="eyebrow mb-3">{single ? 'Do this move' : `Do these ${question.length} moves`}</p>
        <motion.div key={question.join(' ')} initial={{ opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={springs.bouncy} className={single ? 'origin-center pb-1.5' : 'origin-left'}>
          {single ? <MoveChip move={question[0]} size="xl" state={follow.partial ? 'active' : 'upcoming'} /> : <MoveSequence moves={question} size="md" activeIndex={follow.index} label="Moves to do" />}
        </motion.div>
        <p className="mt-3 min-h-5 text-sm font-semibold text-ink-muted" aria-live="polite">
          {follow.partial ? (
            'Halfway. Once more, the same way.'
          ) : help ? (
            <>
              {fresh && !hinted && <span className="mr-1.5 rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-accent-text">New</span>}
              {describeMove(current).text}. {describeMove(current).detail}
            </>
          ) : speed ? (
            'Go!'
          ) : single ? (
            'Turn the cube to match.'
          ) : (
            'One after the other, left to right.'
          )}
        </p>
      </div>
      {onHint && !help && (
        <Button variant="reward" size="sm" iconLeft="lightbulb" onClick={onHint} className="shrink-0 self-start" data-testid="hint">
          Hint
        </Button>
      )}
    </Card>
  )
}

export function NamePrompt({ onReplay, busy }: { onReplay: () => void; busy: boolean }) {
  return (
    <Card padding="md" className="flex items-center gap-4" data-testid="prompt">
      <div className="min-w-0 grow">
        <p className="eyebrow mb-1">Watch the cube</p>
        <p className="font-display text-xl leading-7 font-bold text-ink">Which move was that?</p>
      </div>
      <Button variant="secondary" size="sm" iconLeft="restart" onClick={onReplay} disabled={busy} className="shrink-0" data-testid="replay">
        Replay
      </Button>
    </Card>
  )
}

export function NameOptions({ options, picked, answer, onPick, disabled }: { options: readonly Move[]; picked: Move | null; answer: Move; onPick: (move: Move) => void; disabled: boolean }) {
  // Number keys pick an answer.
  useEffect(() => {
    if (disabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const n = Number(event.key)
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        event.preventDefault()
        onPick(options[n - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [options, onPick, disabled])

  return (
    <div role="group" aria-label="Answers" className={cx('grid gap-2.5', options.length > 4 ? 'grid-cols-3' : 'grid-cols-4 lg:grid-cols-2')} data-testid="options">
      {options.map((move, i) => {
        const isPicked = picked === move
        const right = isPicked && move === answer
        return (
          <motion.button
            key={move}
            type="button"
            disabled={disabled}
            onClick={() => onPick(move)}
            data-move={move}
            aria-label={describeMove(move).text}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.gentle, delay: i * 0.035 }}
            className={cx(
              'key relative h-[4.25rem] rounded-md border-[1.5px] font-mono text-3xl font-bold',
              right ? 'key-success' : isPicked ? 'key-danger' : 'key-secondary',
              disabled && !isPicked && 'opacity-55',
            )}
          >
            <span className="tracking-[-0.04em]">{pretty(move)}</span>
            <span className="absolute top-1.5 left-2 font-sans text-2xs font-bold opacity-50 max-lg:hidden" aria-hidden="true">
              {i + 1}
            </span>
            {right && (
              <span className="absolute top-1.5 right-1.5">
                <Icon name="check" size={16} weight={3} />
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

export function SpeedPanel({ timeLeft, score, best, running, started, onGo, line }: { timeLeft: number; score: number; best: number; running: boolean; started: boolean; onGo: () => void; line: string | null }) {
  const seconds = Math.ceil(timeLeft / 1000)
  return (
    <Card padding="md" className="flex flex-col gap-3" data-testid="speed-panel">
      <div className="flex items-center gap-4">
        <ProgressRing label="Time left" value={timeLeft} max={SPEED_ROUND_MS} size={68} thickness={7} tone={seconds <= 10 ? 'red' : 'orange'}>
          <span className="num font-display text-xl font-extrabold text-ink" data-testid="speed-time">
            {seconds}
          </span>
        </ProgressRing>
        <div className="grow">
          <p className="eyebrow">Moves</p>
          <p className="num font-display text-3xl leading-9 font-extrabold text-ink" data-testid="speed-score">
            <AnimatedNumber value={score} />
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Best</p>
          <p className="num font-display text-xl leading-9 font-extrabold text-ink-muted">{best > 0 ? best : '–'}</p>
        </div>
      </div>
      {!running && (
        <Button size="lg" fullWidth iconLeft="play" onClick={onGo} data-testid="speed-go">
          {started ? 'Carry on' : 'Go'}
        </Button>
      )}
      <AnimatePresence>
        {line && running && (
          <motion.p key={line} role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-sm bg-cube-red-soft px-3 py-2 text-sm font-semibold text-cube-red-text" data-testid="speed-line">
            {line}
          </motion.p>
        )}
      </AnimatePresence>
    </Card>
  )
}

/** The answers so far, as a trail of small chips. */
export function Trail({ answers, total }: { answers: readonly AnswerRecord[]; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2" role="group" aria-label="This round so far" data-testid="trail">
      {Array.from({ length: total }, (_, i) => {
        const answer = answers[i]
        if (!answer) return <span key={i} className="size-5 rounded-[6px] bg-inset shadow-[inset_0_0_0_1px_var(--line-strong)]" aria-hidden="true" />
        const tone = answer.result === 'correct' ? 'bg-cube-green text-on-green' : answer.result === 'hinted' ? 'bg-cube-yellow text-on-yellow' : 'bg-cube-red text-on-red'
        return (
          <motion.span
            key={i}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={springs.bouncy}
            data-result={answer.result}
            title={`${answer.moves.map(pretty).join(' ')}: ${answer.result === 'correct' ? 'right' : answer.result === 'hinted' ? 'with a hint' : 'missed'}`}
            className={cx('grid size-5 place-items-center rounded-[6px]', tone)}
          >
            <Icon name={answer.result === 'correct' ? 'check' : answer.result === 'hinted' ? 'lightbulb' : 'x'} size={13} weight={3} />
          </motion.span>
        )
      })}
    </div>
  )
}

export function KeyTip() {
  return (
    <p className="text-sm text-ink-muted max-lg:hidden pointer-coarse:hidden">
      Drag a layer to turn it. Or click the cube and type: <Kbd>R</Kbd> for R, <Kbd>Shift</Kbd> <Kbd>R</Kbd> for R′, then <Kbd>2</Kbd> to do it again.
    </p>
  )
}

// ───────────────────────── Feedback ─────────────────────────

/** The places a move turns (null for a whole-cube rotation: nothing to single out). */
function layerSlots(moves: readonly Move[]): SlotId[] | null {
  const out = new Set<SlotId>()
  for (const move of moves) {
    const letter = move[0]
    const upper = letter.toUpperCase()
    if ('xyz'.includes(letter)) return null
    if ('MES'.includes(letter)) {
      const [a, b] = letter === 'M' ? ['L', 'R'] : letter === 'E' ? ['U', 'D'] : ['F', 'B']
      for (const slot of SLOTS) if (!slot.includes(a) && !slot.includes(b)) out.add(slot)
      continue
    }
    if (!'UDLRFB'.includes(upper)) return null
    for (const slot of slotsOnFace(upper as Parameters<typeof slotsOnFace>[0])) out.add(slot)
    // A wide move (r, Rw) turns the middle slice with it.
    if (letter !== upper || move.includes('w')) {
      const opposite = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' }[upper]!
      for (const slot of SLOTS) if (!slot.includes(upper) && !slot.includes(opposite)) out.add(slot)
    }
  }
  return [...out]
}

/** One side of "what you did / what was asked": a square mini cube with the turned layer lit. */
function Replay({ title, moves, tone }: { title: string; moves: readonly Move[]; tone: 'red' | 'green' }) {
  const slots = layerSlots(moves)
  return (
    <div className={cx('flex min-w-0 flex-col items-center gap-2 overflow-hidden rounded-md pb-3', tone === 'red' ? 'bg-cube-red-soft' : 'bg-cube-green-soft')} data-testid={`replay-${tone}`}>
      {/* The label rides on the cube's stage as a chip, so the cube gets the space. */}
      <div className="stage relative grid aspect-square w-full max-w-[11rem] shrink-0 place-items-center rounded-none! border-x-0! border-t-0!">
        <p className={cx('absolute top-1.5 left-1.5 z-10 rounded-full px-2 py-0.5 text-[0.6875rem] leading-4 font-extrabold tracking-[0.08em] uppercase shadow-1', tone === 'red' ? 'bg-cube-red-soft text-cube-red-text' : 'bg-cube-green-soft text-cube-green-text')}>{title}</p>
        <div className="w-full">
        <MiniCube
          state={SOLVED}
          alg={moves}
          play="visible"
          speed={0.6}
          restOnEnd
          highlight={slots ? { slots, outline: false, keepCentres: false } : null}
          label={`${title}: ${moves.map((m) => describeMove(m).text).join(', then ')}`}
        />
        </div>
      </div>
      <MoveSequence moves={moves} size="sm" className="justify-center" label={title} />
    </div>
  )
}

export function Feedback({ asked, mistake, mode, onWatch, onNext, busy }: { asked: readonly Move[]; mistake: NonNullable<Round['mistake']>; mode: Round['mode']; onWatch: () => void; onNext: () => void; busy: boolean }) {
  const yours = mode === 'name' ? (mistake.chosen ? [mistake.chosen] : []) : mistake.made
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springs.gentle}>
      <Card padding="md" className="flex flex-col gap-3.5" data-testid="feedback" role="status">
        <div className="flex items-start gap-3">
          <Sticker tone="red" icon="x" size="sm" />
          <div className="min-w-0">
            <h2 className="text-lg text-ink">Not quite</h2>
            <p className="mt-0.5 text-base text-ink-muted" data-testid="feedback-line">
              {mistake.line}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {yours.length > 0 && <Replay title={mode === 'name' ? 'You picked' : 'You did'} moves={yours} tone="red" />}
          <Replay title={mode === 'name' ? 'The cube did' : 'We asked for'} moves={asked} tone="green" />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="secondary" iconLeft="play" onClick={onWatch} disabled={busy} className="grow" data-testid="watch-again">
            Show me
          </Button>
          <Button iconRight="arrowRight" onClick={onNext} className="grow" autoFocus data-testid="got-it">
            Got it
          </Button>
        </div>
      </Card>
    </motion.div>
  )
}

// ───────────────────────── Summary ─────────────────────────

export function Summary({ round }: { round: Round }) {
  const score = scoreRound(round.answers)
  const speed = round.mode === 'speed'
  const attempts = score.correct + round.misses
  const accuracy = speed ? (attempts > 0 ? Math.round((score.correct / attempts) * 100) : 0) : score.accuracy
  const passed = !speed && accuracy >= UNLOCK_ACCURACY * 100
  const perfect = accuracy === 100 && (speed ? score.correct > 0 : true)
  const outcome = round.outcome
  const unlockedLevel = outcome?.unlockedLevelId ? LEVELS.find((level) => level.id === outcome.unlockedLevelId) : undefined

  const title = speed
    ? outcome?.newBest
      ? 'New personal best!'
      : score.correct === 0
        ? 'Time’s up'
        : 'Time’s up. Nice work.'
    : perfect
      ? 'Perfect round!'
      : passed
        ? 'Level cleared'
        : accuracy >= 50
          ? 'Good practice'
          : 'Tricky one. Go again?'

  return (
    <Card padding="md" className="flex flex-col gap-4" data-testid="summary" data-accuracy={accuracy} data-correct={score.correct}>
      <div className="flex items-center gap-4">
        <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springs.bouncy}>
          {speed ? (
            <span className="grid size-[84px] place-items-center rounded-[22px] bg-cube-orange text-on-orange shadow-[0_4px_0_0_var(--cube-orange-edge)]">
              <span className="num font-display text-4xl font-extrabold">{score.correct}</span>
            </span>
          ) : (
            <ProgressRing label="Accuracy" value={accuracy} max={100} size={84} thickness={9} tone={passed ? 'green' : 'yellow'}>
              <span className="num font-display text-xl font-extrabold text-ink">{accuracy}%</span>
            </ProgressRing>
          )}
        </motion.div>
        <div className="min-w-0">
          <h2 className="text-xl text-ink">{title}</h2>
          <p className="mt-0.5 text-base text-ink-muted">
            {speed ? (
              <>
                {score.correct} {score.correct === 1 ? 'move' : 'moves'} in a minute{round.misses > 0 ? `, ${round.misses} ${round.misses === 1 ? 'slip' : 'slips'}` : attempts > 0 ? ', no slips' : ''}.
              </>
            ) : (
              <>
                {score.correct} of {score.total} right{score.bestStreak >= 3 ? `, ${score.bestStreak} in a row` : ''}.
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {outcome && outcome.xp > 0 && (
              <Badge tone="yellow" icon="bolt" data-testid="summary-xp">
                +{outcome.xp} XP
              </Badge>
            )}
            {speed && outcome && !outcome.newBest && outcome.previousBest > 0 && <Badge tone="neutral">Best {outcome.previousBest}</Badge>}
            {!speed && outcome?.newBest && (
              <Badge tone="green" icon="star">
                New best
              </Badge>
            )}
          </div>
        </div>
      </div>

      {unlockedLevel && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springs.gentle, delay: 0.25 }} className="flex items-center gap-3 rounded-md bg-accent-soft px-4 py-3" data-testid="unlocked">
          <Icon name="lock" size={18} className="text-accent-text" />
          <p className="text-base font-semibold text-ink">
            New level open: <span className="font-bold">{unlockedLevel.title}</span>
          </p>
        </motion.div>
      )}
      {!speed && !passed && <p className="text-sm text-ink-muted">Reach 80% to open the next level. The moves you missed will come up more often.</p>}
    </Card>
  )
}

export function WorkOn({ round, stats, activeMove, onPick }: { round: Round; stats: MoveStats; activeMove: Move | null; onPick: (move: Move) => void }) {
  const weak = movesToWorkOn(round.answers, stats)
  if (round.mode === 'speed' || weak.length === 0) return null
  return (
    <Card padding="md" data-testid="work-on">
      <h3 className="text-lg text-ink">Moves to work on</h3>
      <p className="mt-0.5 text-sm text-ink-muted">Tap one to watch it again.</p>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {weak.map((move) => (
          <MoveCell key={move} move={move} stats={stats} active={activeMove === move} onClick={() => onPick(move)} />
        ))}
      </div>
    </Card>
  )
}
