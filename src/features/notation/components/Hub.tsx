import { useState } from 'react'
import { motion } from 'motion/react'
import { describeMove, moveBase, moveKind, SOLVED, type Move } from '../../../cube'
import { MiniCube } from '../../../three'
import { Badge, Button, Card, CUBE_CLASSES, cx, FACE_COLOR, Icon, MoveChip, radioGroupKeyDown, SegmentedControl, springs, type Face } from '../../../ui'
import { pretty } from '../logic/explain'
import { levelsFor, MOVE_GROUPS, type GameMode } from '../logic/levels'
import { MASTERY_LABEL, masteredShare, masteryOf, type MasteryLevel, type MoveStats } from '../logic/mastery'
import { useNotation } from '../notationStore'

// ───────────────────────── Play card ─────────────────────────

const MODE_COPY: Record<GameMode, { label: string; line: string }> = {
  do: { label: 'Do it', line: 'A move appears. Turn the cube to match it.' },
  name: { label: 'Name it', line: 'The cube makes a move. Pick the letter for it.' },
  speed: { label: 'Speed', line: 'Sixty seconds. Do as many moves as you can.' },
}

export function PlayCard({ onStart }: { onStart: (mode: GameMode) => void }) {
  const mode = useNotation((s) => s.hubMode)
  const unlocked = useNotation((s) => s.unlocked)
  const chosen = useNotation((s) => s.chosen)
  const best = useNotation((s) => s.best)
  const speedBest = useNotation((s) => s.speedBest)
  const levels = mode === 'speed' ? [] : levelsFor(mode)
  const index = mode === 'speed' ? 0 : chosen[mode]
  const level = levels[index]
  const levelBest = level ? best[`${mode}:${level.id}`] : undefined

  return (
    <Card padding="md" className="flex flex-col gap-4" data-testid="play-card">
      <SegmentedControl
        ariaLabel="Game"
        fullWidth
        value={mode}
        onChange={(value) => useNotation.getState().setHubMode(value)}
        items={(['do', 'name', 'speed'] as const).map((value) => ({ value, label: MODE_COPY[value].label }))}
      />
      <p className="text-base text-ink-muted">{MODE_COPY[mode].line}</p>

      {mode !== 'speed' && level && (
        <>
          <div role="radiogroup" aria-label="Level" className="flex gap-1.5" onKeyDown={radioGroupKeyDown}>
            {levels.map((item, i) => {
              const locked = i > unlocked[mode]
              const selected = i === index
              const passed = i < unlocked[mode]
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  aria-label={`Level ${i + 1}: ${item.title}${locked ? ' (locked)' : passed ? ' (cleared)' : ''}`}
                  disabled={locked}
                  data-testid={`level-${i + 1}`}
                  onClick={() => useNotation.getState().chooseLevel(mode, i)}
                  className={cx(
                    'num relative flex h-11 min-w-0 flex-1 items-center justify-center rounded-[11px] font-display text-base font-extrabold',
                    'transition-[background-color,color,translate,box-shadow] duration-150 ease-out',
                    selected
                      ? '-translate-y-0.5 bg-accent text-accent-ink shadow-[0_3px_0_0_var(--accent-edge)]'
                      : locked
                        ? 'bg-inset text-ink-faint'
                        : passed
                          ? 'bg-cube-green-soft text-cube-green-text hover:-translate-y-0.5'
                          : 'bg-surface text-ink ring-[1.5px] ring-line-strong ring-inset hover:-translate-y-0.5',
                  )}
                >
                  {locked ? <Icon name="lock" size={15} weight={2.4} /> : i + 1}
                  {passed && !selected && (
                    <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-cube-green text-on-green">
                      <Icon name="check" size={10} weight={3.4} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <motion.div key={`${mode}-${level.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={springs.gentle} className="flex items-start justify-between gap-3 rounded-md bg-inset px-4 py-3">
            <div className="min-w-0">
              <p className="eyebrow">
                Level {index + 1}
                {level.bonus ? ' · bonus' : ''}
              </p>
              <p className="font-display text-lg leading-6 font-bold text-ink">{level.title}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{level.blurb}</p>
            </div>
            {levelBest !== undefined ? (
              <Badge tone={levelBest >= 80 ? 'green' : 'neutral'} icon={levelBest >= 80 ? 'check' : undefined} className="mt-0.5">
                Best {levelBest}%
              </Badge>
            ) : (
              <Badge tone="accent" className="mt-0.5">
                New
              </Badge>
            )}
          </motion.div>
          {index === unlocked[mode] && index < levels.length - 1 && <p className="-mt-1.5 text-sm text-ink-muted">Score 80% or more to open level {index + 2}.</p>}
        </>
      )}

      {mode === 'speed' && (
        <div className="flex items-center gap-4 rounded-md bg-inset px-4 py-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-cube-orange-soft text-cube-orange-text">
            <Icon name="bolt" size={22} filled />
          </span>
          <div>
            <p className="eyebrow">Personal best</p>
            <p className="num font-display text-2xl leading-8 font-extrabold text-ink" data-testid="speed-best">
              {speedBest > 0 ? speedBest : '–'}
              <span className="ml-1.5 font-sans text-sm font-bold text-ink-muted">{speedBest === 1 ? 'move' : 'moves'}</span>
            </p>
          </div>
        </div>
      )}

      <Button size="lg" fullWidth iconRight="arrowRight" onClick={() => onStart(mode)} data-testid="start-round">
        {mode === 'speed' ? 'Start the clock' : 'Start round'}
      </Button>
    </Card>
  )
}

// ───────────────────────── Mastery grid ─────────────────────────

const MASTERY_TINT: Record<MasteryLevel, string> = {
  0: 'bg-surface text-ink ring-[1.5px] ring-line-strong ring-inset',
  1: 'bg-cube-red-soft text-cube-red-text',
  2: 'bg-cube-yellow-soft text-cube-yellow-text',
  3: 'bg-cube-green-soft text-cube-green-text',
}

function Pips({ level }: { level: MasteryLevel }) {
  return (
    <span className="flex gap-[3px]" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span key={n} className={cx('h-[3px] w-[7px] rounded-full bg-current', n > level && 'opacity-20')} />
      ))}
    </span>
  )
}

export function MoveCell({ move, stats, active, onClick }: { move: Move; stats: MoveStats; active?: boolean; onClick: () => void }) {
  const level = masteryOf(stats[move])
  return (
    <button
      type="button"
      onClick={onClick}
      data-move={move}
      data-mastery={level}
      aria-pressed={active}
      aria-label={`${describeMove(move).text}. ${MASTERY_LABEL[level]}. Show it on the cube.`}
      className={cx(
        'flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-[11px] font-mono text-base font-bold',
        'transition-[translate,box-shadow,scale] duration-150 ease-out hover:-translate-y-0.5 active:scale-95',
        MASTERY_TINT[level],
        active && 'outline-[2.5px] outline-offset-2 outline-accent',
      )}
    >
      <span className="leading-none tracking-[-0.04em]">{pretty(move)}</span>
      <Pips level={level} />
    </button>
  )
}

export function MasteryGrid({ stats, activeMove, onPick }: { stats: MoveStats; activeMove: Move | null; onPick: (move: Move) => void }) {
  const extrasSeen = MOVE_GROUPS.slice(3).some((group) => group.moves.some((move) => stats[move]))
  const extrasUnlocked = useNotation((s) => s.unlocked.do >= 5 || s.unlocked.name >= 4)
  const [more, setMore] = useState(extrasSeen || extrasUnlocked)
  const faceMoves = MOVE_GROUPS.slice(0, 3).flatMap((group) => group.moves)
  const mastered = Math.round(masteredShare(stats, faceMoves) * faceMoves.length)
  const groups = more ? MOVE_GROUPS : MOVE_GROUPS.slice(0, 3)

  return (
    <Card padding="md" data-testid="mastery-grid">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg text-ink">Your moves</h2>
        <span className="num text-sm font-bold text-ink-muted">
          {mastered} / {faceMoves.length} mastered
        </span>
      </div>
      <p className="mt-0.5 text-sm text-ink-muted">Tap one to watch it on the cube.</p>

      <div className="mt-3 flex flex-col gap-2.5">
        {groups.map((group) => (
          <div key={group.id}>
            <p className="eyebrow mb-1.5">{group.title}</p>
            <div className={cx('grid gap-1.5', group.moves.length > 9 ? 'grid-cols-6' : group.moves.length === 9 ? 'grid-cols-[repeat(9,minmax(0,1fr))] max-sm:grid-cols-6' : 'grid-cols-6')}>
              {group.moves.map((move) => (
                <MoveCell key={move} move={move} stats={stats} active={activeMove === move} onClick={() => onPick(move)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs font-semibold text-ink-muted" aria-label="What the colours mean">
          {([1, 2, 3] as const).map((level) => (
            <li key={level} className="flex items-center gap-1.5">
              <span className={cx('grid h-4 w-6 place-items-center rounded-[5px]', MASTERY_TINT[level])}>
                <Pips level={level} />
              </span>
              {MASTERY_LABEL[level]}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" iconRight={more ? 'chevronUp' : 'chevronDown'} onClick={() => setMore(!more)} aria-expanded={more}>
          {more ? 'Fewer moves' : 'Slices and more'}
        </Button>
      </div>
    </Card>
  )
}

// ───────────────────────── Guide ─────────────────────────

const FACE_ROWS: readonly { face: Face; name: string; where: string }[] = [
  { face: 'U', name: 'Up', where: 'the top' },
  { face: 'D', name: 'Down', where: 'the bottom' },
  { face: 'L', name: 'Left', where: 'left side' },
  { face: 'R', name: 'Right', where: 'right side' },
  { face: 'F', name: 'Front', where: 'facing you' },
  { face: 'B', name: 'Back', where: 'far side' },
]

const SUFFIXES: readonly { move: Move; say: string; line: string }[] = [
  { move: 'R', say: 'Just the letter', line: 'One quarter turn, clockwise.' },
  { move: "R'", say: 'A tick: “R prime”', line: 'One quarter turn the other way.' },
  { move: 'R2', say: 'A two', line: 'Twice. A half turn, either way round.' },
]

/** Camera angles that look (almost) straight at a face, keeping a little depth. */
const FACE_ON_MINI = {
  R: { azimuth: Math.PI / 2 - 0.26, elevation: 0.24 },
  L: { azimuth: -Math.PI / 2 + 0.26, elevation: 0.24 },
} as const

function ClockMini({ move, faceOn, caption }: { move: 'R' | 'L'; faceOn: boolean; caption: string }) {
  return (
    <figure className="flex min-w-0 flex-col items-center gap-1.5">
      <div className="relative w-full max-w-[8.5rem]">
        <MiniCube state={SOLVED} alg={move} play="visible" speed={0.55} pose={faceOn ? FACE_ON_MINI[move] : undefined} label={`${move} seen ${faceOn ? 'looking straight at that face' : 'from the front'}`} />
        {faceOn && (
          <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-cube-green text-on-green shadow-1">
            <Icon name="rotateCw" size={14} weight={2.6} />
          </span>
        )}
      </div>
      <figcaption className="flex items-center gap-1.5 text-center text-sm font-semibold text-ink-muted">
        <span className="font-mono font-bold text-ink">{move}</span>
        {caption}
      </figcaption>
    </figure>
  )
}

export function Guide({ onPick, activeMove }: { onPick: (move: Move) => void; activeMove: Move | null }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
      <Card padding="md">
        <h3 className="text-lg text-ink">Six faces, six letters</h3>
        <p className="mt-0.5 text-sm text-ink-muted">Hold the cube with white on top and green facing you. Each face is named for where it is.</p>
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          {FACE_ROWS.map(({ face, name, where }) => {
            const color = CUBE_CLASSES[FACE_COLOR[face]]
            return (
              <button
                key={face}
                type="button"
                onClick={() => onPick(face as Move)}
                aria-pressed={activeMove !== null && moveBase(activeMove) === face && moveKind(activeMove) === 'face'}
                aria-label={`${face}: ${name}, ${where}. ${FACE_COLOR[face]} centre. Show it on the cube.`}
                className="group flex items-center gap-3 rounded-md bg-inset p-2 text-left transition-[background-color,scale] duration-150 ease-out hover:bg-surface-2 active:scale-[0.97] aria-pressed:bg-accent-soft"
              >
                <span
                  className={cx(
                    'grid size-11 shrink-0 place-items-center rounded-[11px] font-mono text-xl font-bold shadow-[inset_0_0_0_1px_var(--sticker-outline),inset_0_-3px_0_0_rgb(0_0_0/0.12)]',
                    color.solid,
                    color.onSolid,
                  )}
                >
                  {face}
                </span>
                <span className="min-w-0">
                  <span className="block text-base leading-5 font-bold text-ink">{name}</span>
                  <span className="block truncate text-sm text-ink-muted">{where}</span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-3.5 flex items-start gap-2 text-sm text-ink-muted">
          <Icon name="lightbulb" size={16} className="mt-0.5 shrink-0 text-cube-yellow-text" />
          The centre sticker of a face never moves, so its colour tells you which face you are looking at.
        </p>
      </Card>

      <Card padding="md">
        <h3 className="text-lg text-ink">Three ways to turn</h3>
        <p className="mt-0.5 text-sm text-ink-muted">What comes after the letter tells you how far, and which way.</p>
        <ul className="mt-3.5 flex flex-col gap-2">
          {SUFFIXES.map(({ move, say, line }) => (
            <li key={move} className="flex items-center gap-3 rounded-md bg-inset p-2">
              <MoveChip move={move} onClick={() => onPick(move)} />
              <div className="min-w-0 grow">
                <p className="text-base leading-5 font-bold text-ink">{say}</p>
                <p className="text-sm text-ink-muted">{line}</p>
              </div>
              <div className="w-14 shrink-0">
                <MiniCube state={SOLVED} alg={move} play="visible" speed={0.55} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="md" className="md:col-span-2" data-testid="clockwise-rule">
        <div className="grid items-center gap-x-8 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div>
            <h3 className="text-lg text-ink">Which way is clockwise?</h3>
            <p className="mt-1.5 text-base text-ink-muted">
              Pretend each face is a clock on a wall and you are standing <strong className="font-bold text-ink">right in front of it</strong>. Clockwise is the way its hands go.
            </p>
            <p className="mt-2 text-base text-ink-muted">
              That is why <span className="font-mono font-bold text-ink">R</span> goes up but <span className="font-mono font-bold text-ink">L</span> comes down: from the front they look opposite, yet each one is clockwise when you look
              straight at it. The same goes for U and D, and for F and B.
            </p>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2.5 gap-y-3">
            <p className="eyebrow w-16 leading-4">From the front</p>
            <ClockMini move="R" faceOn={false} caption="goes up" />
            <ClockMini move="L" faceOn={false} caption="comes down" />
            <p className="eyebrow w-16 leading-4">Straight at the face</p>
            <ClockMini move="R" faceOn caption="clockwise" />
            <ClockMini move="L" faceOn caption="clockwise" />
          </div>
        </div>
      </Card>
    </div>
  )
}
