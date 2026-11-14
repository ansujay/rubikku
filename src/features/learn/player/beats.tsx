/**
 * The newer parts of the lesson player: the "now" strip pinned under the cube, the recognition
 * rounds ("Which is it?") and the real-cube steps ("Now on your cube").
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { isRotation, type Color, type Move } from '../../../cube'
import { Button, celebration, cx, Icon, MoveChip, ProgressBar, springs, Sticker } from '../../../ui'
import type { QuizBeat, RealBeat } from '../content'
import type { QuizSave } from '../learnStore'
import type { QuizQuestion } from '../quiz'
import { MoveLine } from './bits'
import { RichText } from './RichText'

// ───────────────────────── The "now" strip ─────────────────────────

export type NowState =
  /** The move to make now, shown big. `step`: what this move is part of. */
  | { kind: 'move'; move: Move; step?: string; count?: string }
  /** Half-way through a half turn. */
  | { kind: 'half'; move: Move }
  /** No move shown: the step's name (or a nudge). */
  | { kind: 'name'; title: string; sub: string }
  /** A slip: what happened and the way back. */
  | { kind: 'off'; title: string; sub: string; back: Move | null }
  | { kind: 'done'; title: string }

/**
 * One line, directly under the stage, on every size: what to do *now*. On a phone it is the only
 * instruction in view while the cube is, so the wrong-move message lives here too.
 */
export function NowStrip({ now, busy, onTurnCube, onUndo, onHint }: { now: NowState; busy: boolean; onTurnCube: (move: Move) => void; onUndo: () => void; onHint?: () => void }) {
  const tone = now.kind === 'off' ? 'bg-cube-yellow-soft' : now.kind === 'done' ? 'bg-cube-green-soft' : 'bg-surface'
  const key = now.kind === 'move' || now.kind === 'half' ? `${now.kind}:${now.move}:${now.kind === 'move' ? (now.count ?? '') : ''}` : `${now.kind}:${'title' in now ? now.title : ''}`
  return (
    <div
      className={cx('relative mt-2 flex min-h-[3.75rem] items-center overflow-hidden rounded-md border border-line px-3 py-2 shadow-1 transition-colors duration-200', tone)}
      aria-live="polite"
      data-testid="now-strip"
      data-kind={now.kind}
      data-move={now.kind === 'move' || now.kind === 'half' ? now.move : undefined}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="flex w-full min-w-0 items-center gap-3">
          {now.kind === 'move' && (
            <>
              {isRotation(now.move) ? (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text ring-2 ring-inset ring-accent" aria-hidden="true">
                  <Icon name="rotateCw" size={24} weight={2.4} className={cx(now.move === "y'" && '-scale-x-100')} />
                </span>
              ) : (
                <MoveChip move={now.move} size="lg" state="active" className="scale-90!" />
              )}
              <div className="min-w-0 grow">
                {(now.step || now.count) && !isRotation(now.move) && (
                  <p className="eyebrow mb-0.5 truncate">
                    {[now.step, now.count].filter(Boolean).join(' · ')}
                  </p>
                )}
                <MoveLine move={now.move} className="max-sm:line-clamp-2" />
              </div>
              {onHint && !isRotation(now.move) && (
                <Button variant="reward" size="sm" iconLeft="lightbulb" onClick={onHint} disabled={busy} className="shrink-0" aria-label="More hint" data-testid="hint-button">
                  <span className="max-sm:sr-only">More</span>
                </Button>
              )}
              {isRotation(now.move) && (
                <Button variant="primary" size="sm" iconLeft="rotateCw" onClick={() => onTurnCube(now.move)} disabled={busy} data-testid="turn-cube-expected" className="shrink-0">
                  Turn it
                </Button>
              )}
            </>
          )}
          {now.kind === 'half' && (
            <>
              <MoveChip move={now.move} size="lg" state="active" className="scale-90!" />
              <p className="min-w-0 text-sm text-ink-muted">
                <span className="font-bold text-ink">Half-way.</span> That is a half turn: turn the same {isRotation(now.move) ? 'way' : 'face'} once more.
              </p>
            </>
          )}
          {now.kind === 'name' && (
            <>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-accent-soft text-accent-text">
                <Icon name="target" size={22} />
              </span>
              <div className="min-w-0 grow">
                <p className="truncate text-base font-bold text-ink">{now.title}</p>
                <p className="text-sm leading-snug text-ink-muted max-sm:line-clamp-1">{now.sub}</p>
              </div>
              {onHint && (
                <Button variant="reward" size="sm" iconLeft="lightbulb" onClick={onHint} disabled={busy} className="shrink-0" data-testid="hint-button">
                  Hint
                </Button>
              )}
            </>
          )}
          {now.kind === 'off' && (
            <>
              <div className="min-w-0 grow" role="alert" data-testid="guided-off">
                <p className="text-sm font-bold text-ink sm:text-base">
                  <RichText text={now.title} />
                </p>
                <p className="text-sm leading-snug text-ink-muted max-sm:line-clamp-2">
                  <RichText text={now.sub} />
                </p>
              </div>
              <Button variant="secondary" size="sm" iconLeft="undo" onClick={onUndo} disabled={busy} data-testid="undo-that" className="shrink-0">
                Undo that
              </Button>
            </>
          )}
          {now.kind === 'done' && (
            <div className="flex items-center gap-3" data-testid="guided-success">
              <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={springs.bouncy} className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-cube-green text-on-green">
                <Icon name="check" size={22} weight={3} />
              </motion.span>
              <p className="text-base font-bold text-ink">{now.title}</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ───────────────────────── "Which is it?" ─────────────────────────

const SWATCH: Record<Color, string> = {
  white: 'bg-cube-white ring-1 ring-inset ring-line-strong',
  yellow: 'bg-cube-yellow',
  green: 'bg-cube-green',
  blue: 'bg-cube-blue',
  red: 'bg-cube-red',
  orange: 'bg-cube-orange',
}

export function QuizPanel({
  beat,
  question,
  save,
  onAnswer,
  onNext,
}: {
  beat: QuizBeat
  question: QuizQuestion
  save: QuizSave
  onAnswer: (id: string) => void
  onNext: () => void
}) {
  const count = beat.count ?? 5
  const answered = save.answer
  const right = answered !== null && answered === question.answer
  const finished = save.right >= count
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})

  const feedback = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (right) celebration.tick(buttons.current[question.answer], { cube: true })
  }, [right, question.answer])
  useEffect(() => {
    if (answered === null) return
    const timer = window.setTimeout(() => feedback.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 120)
    return () => window.clearTimeout(timer)
  }, [answered])

  // Number keys answer (1, 2, 3 …); Space or Enter moves on once answered.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [role="dialog"]')) return
      const index = Number(event.key) - 1
      if (answered === null && index >= 0 && index < question.options.length) {
        event.preventDefault()
        onAnswer(question.options[index].id)
      } else if (answered !== null && !finished && (event.key === ' ' || event.key === 'Enter') && !target?.closest('button, a')) {
        event.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="flex flex-col gap-3.5" data-testid="quiz-panel" data-answer={answered ?? ''} data-right={answered === null ? '' : String(right)} data-score={save.right} data-n={save.n} data-type={question.type}>
      <div className="flex items-center gap-3 rounded-md bg-inset px-3.5 py-2.5 max-sm:-mt-1 max-sm:bg-transparent max-sm:p-0">
        <p className="eyebrow shrink-0 max-sm:hidden">{finished ? 'Round done' : `Right answers`}</p>
        <div className="min-w-0 grow">
          <ProgressBar value={Math.min(save.right, count)} max={count} segments={count} size="md" tone="green" label="Right answers" valueText={`${Math.min(save.right, count)} of ${count}`} />
        </div>
        <span className="num shrink-0 text-sm font-bold text-ink">
          {Math.min(save.right, count)}/{count}
        </span>
      </div>

      <p className="text-base leading-snug font-bold text-ink sm:text-lg" data-testid="quiz-prompt">
        <RichText text={question.prompt} />
      </p>

      {/* Short answers two to a row (a long one takes the whole row), so all of them fit under the cube on a phone. */}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Answers">
        {question.options.map((option, i) => {
          const chosen = answered === option.id
          const correct = answered !== null && option.id === question.answer
          return (
            <button
              key={option.id}
              ref={(el) => {
                buttons.current[option.id] = el
              }}
              type="button"
              aria-disabled={answered !== null}
              onClick={() => answered === null && onAnswer(option.id)}
              data-testid="quiz-option"
              data-id={option.id}
              data-result={correct ? 'right' : chosen ? 'wrong' : ''}
              className={cx(
                'flex min-h-11 items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[0.9375rem] leading-snug font-bold transition-colors duration-150 sm:min-h-12 sm:px-3.5 sm:py-2 sm:text-base',
                option.label.length > 8 && 'col-span-2',
                answered === null && 'key key-secondary',
                answered !== null && 'cursor-default',
                correct && 'bg-cube-green-soft text-ink ring-2 ring-cube-green ring-inset',
                chosen && !correct && 'bg-cube-red-soft text-ink ring-2 ring-cube-red ring-inset',
                answered !== null && !correct && !chosen && 'bg-inset text-ink-faint',
              )}
            >
              <span className={cx('num flex size-6 shrink-0 items-center justify-center rounded-[7px] text-xs font-extrabold', correct ? 'bg-cube-green text-on-green' : chosen ? 'bg-cube-red text-on-red' : 'bg-inset text-ink-faint')}>
                {correct ? <Icon name="check" size={13} weight={3} /> : chosen ? <Icon name="x" size={13} weight={3} /> : i + 1}
              </span>
              {option.swatch && (
                <span className="flex shrink-0 gap-1" aria-hidden="true">
                  {option.swatch.map((c) => (
                    <span key={c} className={cx('size-4.5 rounded-[5px]', SWATCH[c])} />
                  ))}
                </span>
              )}
              <span className="min-w-0">
                <RichText text={option.label} />
              </span>
            </button>
          )
        })}
      </div>

      <AnimatePresence initial={false}>
        {answered !== null && (
          <motion.div
            ref={feedback}
            key={`${save.n}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className={cx('flex scroll-mb-44 flex-col gap-2.5 rounded-md px-3.5 py-3', right ? 'bg-cube-green-soft' : 'bg-cube-yellow-soft')}
            data-testid="quiz-feedback"
            role="status"
          >
            <p className="text-base font-bold text-ink">{right ? (finished ? 'Right — and that is the round!' : 'Right.') : 'Not quite.'}</p>
            <p className="text-sm leading-relaxed text-ink-muted">
              <RichText text={question.why} />
            </p>
            {!finished && (
              <div>
                <Button variant={right ? 'success' : 'primary'} size="md" iconRight="arrowRight" onClick={onNext} data-testid="quiz-next">
                  {right ? 'Next cube' : 'Try another cube'}
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ───────────────────────── Now on your cube ─────────────────────────

export function RealPanel({ beat, doneAt, onDone }: { beat: RealBeat; doneAt: string | null; onDone: () => void }) {
  // Two hands on a cube: Space (or Enter) is the Done button.
  useEffect(() => {
    if (doneAt) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button, a, [role="dialog"], .stage')) return
      if (event.key === ' ') {
        event.preventDefault()
        onDone()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className="flex flex-col gap-4" data-testid="real-panel" data-done={Boolean(doneAt)}>
      <ol className="flex flex-col gap-2">
        {beat.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-base leading-snug text-ink-muted">
            <span className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-accent-soft text-xs font-extrabold text-accent-text">{i + 1}</span>
            <span>
              <RichText text={step} />
            </span>
          </li>
        ))}
      </ol>
      <RealChecks checks={beat.checks} className="min-[900px]:hidden" />
      {doneAt && (
        <div className="flex items-center gap-3 rounded-md bg-cube-green-soft px-3.5 py-3" data-testid="real-done">
          <Sticker tone="green" icon="check" size="md" />
          <p className="text-base font-bold text-ink">
            <RichText text={beat.done} />
          </p>
        </div>
      )}
    </div>
  )
}

/** "Check your cube against the picture" — beside the picture (under the cube) on a tablet. */
export function RealChecks({ checks, figure, className }: { checks: readonly string[]; figure?: ReactNode; className?: string }) {
  return (
    <div className={cx('items-center gap-3 rounded-md bg-inset px-3.5 py-3', className)} data-testid="real-checks">
      {figure && <div className="shrink-0">{figure}</div>}
      <div className="min-w-0">
      <p className="eyebrow mb-1.5">Check your cube against the picture</p>
      <ul className="flex flex-col gap-1.5">
        {checks.map((check) => (
          <li key={check} className="flex gap-2 text-sm leading-snug text-ink-muted">
            <Icon name="eye" size={15} className="mt-0.5 shrink-0 text-ink-faint" />
            <span>
              <RichText text={check} />
            </span>
          </li>
        ))}
      </ul>
      </div>
    </div>
  )
}

/**
 * The two answers to a real-cube step, pinned in the panel's footer so they are on screen at once
 * (with a cube in one hand, scrolling to find them is the last thing he needs).
 */
export function RealActions({ onDone, onStuck }: { onDone: () => void; onStuck: () => void }) {
  return (
    <div className="flex flex-col gap-2" data-testid="real-actions">
      {/* Side by side on a phone, where the footer must not eat the steps; stacked beside the cube on a tablet. */}
      <div className="grid grid-cols-[1.25fr_1fr] gap-2 min-[900px]:grid-cols-1">
        <Button variant="primary" size="lg" iconLeft="check" fullWidth onClick={onDone} data-testid="real-confirm" className="px-3! min-[900px]:min-h-14!">
          <span className="max-[899px]:hidden">Done — it matches!</span>
          <span className="min-[900px]:hidden">It matches!</span>
        </Button>
        <Button variant="secondary" size="lg" iconLeft="info" fullWidth onClick={onStuck} data-testid="real-stuck" className="px-3! min-[900px]:h-auto">
          <span className="max-[899px]:hidden">It doesn’t — I’m stuck</span>
          <span className="min-[900px]:hidden">I’m stuck</span>
        </Button>
      </div>
      <p className="text-center text-xs font-semibold text-ink-faint max-[899px]:hidden [@media(pointer:coarse)]:hidden">Hands full? Press Space for Done.</p>
    </div>
  )
}
