/**
 * "What is next for this player?" — one answer for the whole app (Home, Learn, anywhere a
 * "continue" button is wanted): the primer first for someone new, then the eight stages in
 * order, then the full solve; null once all of that is done.
 *
 * This module is deliberately light: it imports the two stores and nothing else — no lesson
 * content, no lesson player, no 3D cube — so the Home page can use it without waiting for any of
 * them. It follows the same rule as the Learn map (`buildPath` in ./path, which needs the
 * lesson content for its beat counts); `next.test.ts` checks the two always agree.
 */
import { useMemo } from 'react'
import { STAGES, useProgress, type LessonProgress } from '../../store'
import { useLearn, type CapstoneSave, type LessonSave } from './learnStore'

export const NEXT_PRIMER_ID = 'primer'
export const NEXT_CAPSTONE_ID = 'full-solve'

export interface NextStop {
  /** `'primer'`, a stage id, or `'full-solve'`. */
  id: string
  kind: 'primer' | 'stage' | 'capstone'
  /** 0 for the primer, 1–8 for stages, 9 for the full solve. */
  number: number
  title: string
  /** "Start here" / "Stage 3" / "Finale". */
  label: string
  /** He has been inside it before (so the button says "Continue"). */
  started: boolean
  /** Route to open: `/learn/<id>`. */
  to: string
}

export interface LearnSaves {
  lessons: Readonly<Record<string, LessonSave>>
  capstone: Pick<CapstoneSave, 'session' | 'solves'>
}

/** The stop to continue with, or null when the primer, all eight stages and a full solve are done. */
export function nextStop(progress: Readonly<Record<string, LessonProgress>>, learn: LearnSaves): NextStop | null {
  const stageDone = (id: string) => Boolean(progress[id]?.completedAt)
  const stagesDone = STAGES.filter((stage) => stageDone(stage.id)).length
  // Finishing any stage means the primer is behind him, whatever the primer's own save says.
  if (!learn.lessons[NEXT_PRIMER_ID]?.completed && stagesDone === 0) {
    return { id: NEXT_PRIMER_ID, kind: 'primer', number: 0, title: 'Meet your cube', label: 'Start here', started: Boolean(learn.lessons[NEXT_PRIMER_ID]), to: `/learn/${NEXT_PRIMER_ID}` }
  }
  const stage = STAGES.find((s) => !stageDone(s.id))
  if (stage) {
    const started = Boolean(learn.lessons[stage.id]) || Boolean(progress[stage.id])
    return { id: stage.id, kind: 'stage', number: stage.number, title: stage.title, label: `Stage ${stage.number}`, started, to: `/learn/${stage.id}` }
  }
  if (learn.capstone.solves > 0) return null
  return { id: NEXT_CAPSTONE_ID, kind: 'capstone', number: 9, title: 'Full solve', label: 'Finale', started: learn.capstone.session !== null, to: `/learn/${NEXT_CAPSTONE_ID}` }
}

/** `nextStop` with live data from the progress and learn stores. */
export function useNextStop(): NextStop | null {
  const progress = useProgress((s) => s.lessons)
  const lessons = useLearn((s) => s.lessons)
  const capstone = useLearn((s) => s.capstone)
  return useMemo(() => nextStop(progress, { lessons, capstone }), [progress, lessons, capstone])
}
