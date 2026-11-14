import { STAGE_IDS } from '../../../cube'
import { Button, ButtonLink, Icon, Sticker } from '../../../ui'
import type { LessonTodo } from '../completion'
import { CAPSTONE_ID, getLesson, PRIMER_ID, type Lesson, type LessonId, type Trouble } from '../content'
import { MASTERY_TARGET } from '../learnStore'
import { stopLabel, type PathStop } from '../path'
import { AlgorithmCard } from './bits'
import { RichText } from './RichText'

/** "Stuck?" — the common problems of a stage, each opening to its fix. */
export function TroubleList({ troubles, open = false }: { troubles: readonly Trouble[]; open?: boolean }) {
  return (
    <div className="flex flex-col gap-2" data-testid="troubles">
      {troubles.map((trouble) => (
        <details key={trouble.problem} open={open || undefined} className="group rounded-md bg-inset open:bg-surface open:ring-1 open:ring-line-strong open:ring-inset">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-3.5 py-2.5 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
            <Icon name="chevronRight" size={16} className="shrink-0 text-ink-faint transition-transform duration-150 group-open:rotate-90" />
            <span>“{trouble.problem}”</span>
          </summary>
          <p className="px-3.5 pb-3.5 pl-10 text-sm leading-relaxed text-ink-muted">
            <RichText text={trouble.fix} />
          </p>
        </details>
      ))}
    </div>
  )
}

/** The last beat: what he learned, the algorithms as cards, what goes wrong, and what is next. */
export function WrapPanel({
  lesson,
  nextId,
  stops,
  todo,
  complete,
  locked,
  onJump,
}: {
  lesson: Lesson
  nextId: LessonId | null
  stops: readonly PathStop[]
  /** What is still to do before the lesson counts (see `lessonTodo`). */
  todo: LessonTodo
  /** The lesson is complete (now, or from before). */
  complete: boolean
  /** He is peeking ahead at a stage that is not open yet. */
  locked: boolean
  /** Go to a beat of this lesson. */
  onJump: (beatId: string) => void
}) {
  const stop = stops.find((s) => s.id === lesson.id)
  const next = nextId ? stops.find((s) => s.id === nextId) : undefined
  const nextLesson = nextId ? getLesson(nextId) : undefined
  const isPrimer = lesson.id === PRIMER_ID
  const isLast = lesson.id === STAGE_IDS[STAGE_IDS.length - 1]
  const optional = lesson.optional ?? []
  const main = lesson.algorithms.filter((id) => !optional.includes(id))
  return (
    <div className="flex flex-col gap-5" data-testid="wrap-panel" data-complete={complete}>
      {!complete && (
        <div className="flex flex-col gap-3 rounded-md bg-cube-yellow-soft px-3.5 py-3" data-testid="wrap-todo">
          <div className="flex items-center gap-3">
            <Sticker tone="yellow" icon="target" size="md" />
            <div className="min-w-0">
              <p className="text-base font-bold text-ink">
                {todo.earned ? 'You have done the exercises.' : isPrimer ? 'Not finished yet.' : `Stage ${lesson.number} is not finished yet.`}
              </p>
              <p className="text-sm text-ink-muted">
                {todo.earned
                  ? 'This stage opens for real once the stages before it are done. It will count then.'
                  : locked
                    ? 'Reading ahead is fine. To finish a stage you do its exercises yourself — and the stages before it come first.'
                    : `Reading it is the easy half. The stage is yours when you can do it: ${todo.done} of ${todo.total} done.`}
              </p>
            </div>
          </div>
          {!todo.earned && (
            <ul className="flex flex-col gap-1.5">
              {todo.exercises.map((beat) => (
                <li key={beat.id}>
                  <Button variant="secondary" size="sm" iconRight="arrowRight" fullWidth className="justify-between! text-left" onClick={() => onJump(beat.id)} data-testid="wrap-todo-item">
                    <span className="min-w-0 truncate">{beat.kind === 'quiz' ? `${beat.title} (${beat.count ?? 5} right answers)` : beat.title}</span>
                  </Button>
                </li>
              ))}
              {todo.practice.length > 0 && (
                <li className="flex flex-col gap-1.5">
                  <p className="pt-1 text-xs font-bold text-ink-muted">And do the stage once for real — either one:</p>
                  {todo.practice.map((beat) => (
                    <Button key={beat.id} variant="secondary" size="sm" iconRight="arrowRight" fullWidth className="justify-between! text-left" onClick={() => onJump(beat.id)} data-testid="wrap-todo-item">
                      <span className="min-w-0 truncate">{beat.kind === 'drill' ? 'Solve one practice cube yourself' : 'Do it on your own cube'}</span>
                    </Button>
                  ))}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
      <div className={complete ? 'flex items-center gap-3 rounded-md bg-cube-green-soft px-3.5 py-3' : 'hidden'}>
        <Sticker tone="green" icon={isLast ? 'trophy' : 'check'} size="md" />
        <div className="min-w-0">
          <p className="text-base font-bold text-ink">{isLast ? 'You know the whole method. All eight stages.' : isPrimer ? 'Basics complete.' : `Stage ${lesson.number} complete.`}</p>
          {stop && !isPrimer && (
            <p className="text-sm text-ink-muted">
              {stop.mastered ? 'And mastered: three clean drills.' : `Clean drills: ${Math.min(stop.clean, MASTERY_TARGET)} of ${MASTERY_TARGET}. Go back any time to earn the star.`}
            </p>
          )}
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-base font-bold text-ink">{complete ? 'What you can do now' : 'What this teaches'}</h3>
        <ul className="flex flex-col gap-1.5">
          {lesson.learned.map((line) => (
            <li key={line} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
              <Icon name="check" size={16} weight={2.8} className="mt-1 shrink-0 text-cube-green-text" />
              <span>
                <RichText text={line.replace(/'/g, '′')} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {main.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-base font-bold text-ink">{main.length === 1 ? 'Your new algorithm' : 'Your new algorithms'}</h3>
            <ButtonLink to="/algorithms" variant="ghost" size="sm" iconRight="chevronRight" className="-mr-2">
              All cards
            </ButtonLink>
          </div>
          <ul className="grid gap-2.5">
            {main.map((id) => (
              <AlgorithmCard key={id} id={id} />
            ))}
          </ul>
        </section>
      )}

      {optional.length > 0 && (
        <section data-testid="wrap-optional">
          <h3 className="mb-0.5 text-base font-bold text-ink">{lesson.optionalTitle ?? 'Optional extras'}</h3>
          {lesson.optionalNote && <p className="mb-2 text-sm text-ink-muted">{lesson.optionalNote}</p>}
          <ul className="grid gap-2.5">
            {optional.map((id) => (
              <AlgorithmCard key={id} id={id} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-base font-bold text-ink">If it goes wrong</h3>
        <TroubleList troubles={lesson.troubles} />
      </section>

      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        {isPrimer && (
          <ButtonLink to="/notation" variant="soft" iconLeft="notation" fullWidth data-testid="notation-link">
            Practise the letters in the notation trainer
          </ButtonLink>
        )}
        {nextId === CAPSTONE_ID ? (
          <ButtonLink to={`/learn/${CAPSTONE_ID}`} size="lg" variant={complete ? 'primary' : 'secondary'} iconRight="arrowRight" fullWidth data-testid="wrap-next">
            Now solve a whole cube
          </ButtonLink>
        ) : (
          next &&
          nextLesson && (
            <ButtonLink to={`/learn/${nextLesson.id}`} size="lg" variant={complete ? 'primary' : 'secondary'} iconRight="arrowRight" fullWidth data-testid="wrap-next">
              {stopLabel(next)}: {nextLesson.title}
            </ButtonLink>
          )
        )}
        <ButtonLink to="/learn" variant="ghost" iconLeft="route" fullWidth>
          Back to the path
        </ButtonLink>
      </div>
    </div>
  )
}
