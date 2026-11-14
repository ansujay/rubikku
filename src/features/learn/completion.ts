/**
 * When is a lesson complete? When he can do the stage — never just because the last screen was
 * reached. Reading ahead (the section stepper, "Skip", peeking at a locked stage) is always
 * allowed, and never earns the stage, its XP or its badge.
 *
 * The rule:
 *  - every guided "your turn" exercise of the lesson is finished (each "five in a row" all five
 *    times), and every "Which is it?" round is passed — the recognition is part of the stage;
 *  - and, if the lesson has practice, the stage has been done for real at least once: a practice
 *    cube solved with at least half of the turns his own (hints are fine, "Show me" for every
 *    step is not), **or** the stage done on his own cube ("Now on your cube").
 */
import type { Beat, Lesson } from './content/types'
import type { LessonSave } from './learnStore'

export interface LessonTodo {
  /** Exercises and recognition rounds still to do, in lesson order. */
  exercises: Beat[]
  /** The practice still to do (the drill beat, and the real-cube beat beside it), or empty. */
  practice: Beat[]
  /** Things done and the total (the practice counts as one). */
  done: number
  total: number
  /** Nothing left: the lesson has been earned. */
  earned: boolean
}

type Saved = Pick<LessonSave, 'done' | 'drill'> & Partial<Pick<LessonSave, 'real'>>

export function lessonTodo(lesson: Lesson, save: Saved | undefined): LessonTodo {
  const needed = lesson.beats.filter((beat) => beat.kind === 'guided' || beat.kind === 'quiz')
  const exercises = needed.filter((beat) => !save?.done[beat.id])
  const drillBeat = lesson.beats.find((beat) => beat.kind === 'drill') ?? null
  const realBeat = lesson.beats.find((beat) => beat.kind === 'real') ?? null
  const practised = (save?.drill.own ?? 0) > 0 || (realBeat !== null && Boolean(save?.real?.[realBeat.id]))
  const hasPractice = drillBeat !== null
  const practice = hasPractice && !practised ? [drillBeat, ...(realBeat ? [realBeat] : [])] : []
  const total = needed.length + (hasPractice ? 1 : 0)
  const left = exercises.length + (practice.length > 0 ? 1 : 0)
  return { exercises, practice, done: total - left, total, earned: left === 0 }
}
