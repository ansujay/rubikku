/**
 * The learning path as data: ten stops (the primer, the eight stages, the full solve), each with
 * its status and how far he is inside it. Pure, so it can be tested without React.
 */
import type { LessonProgress } from '../../store'
import { STAGES } from '../../store/stages'
import type { StageId } from '../../cube'
import { CAPSTONE_ID, LESSONS, PRIMER_ID, beatIndex, type LessonId } from './content'
import { isMastered, type CapstoneSave, type LessonSave } from './learnStore'

export type StopStatus =
  /** Finished. */
  | 'complete'
  /** The stop to do next. */
  | 'current'
  /** Unlocked, but not the next one. */
  | 'open'
  /** An earlier stage comes first — it can still be peeked at. */
  | 'locked'

export interface PathStop {
  id: LessonId
  /** 0 for the primer, 1–8 for stages, 9 for the full solve. */
  number: number
  title: string
  goal: string
  status: StopStatus
  /** He has been inside this lesson. */
  started: boolean
  /** Beats seen, and how many there are (0 for the capstone). */
  seen: number
  beats: number
  /** Clean drills so far (stages only). */
  clean: number
  mastered: boolean
}

export interface LearnPath {
  stops: PathStop[]
  /** The stop to continue with; null when everything is done. */
  next: PathStop | null
  /** Stages complete, out of eight. */
  stagesDone: number
}

export function buildPath(progress: Record<string, LessonProgress>, lessons: Record<string, LessonSave>, capstone: CapstoneSave): LearnPath {
  const stageDone = (id: string) => Boolean(progress[id]?.completedAt)
  const stagesDone = STAGES.filter((s) => stageDone(s.id)).length
  const firstOpenStage = STAGES.find((s) => !stageDone(s.id))?.id ?? null
  const primerDone = Boolean(lessons[PRIMER_ID]?.completed) || stagesDone > 0

  const stops: PathStop[] = LESSONS.map((lesson) => {
    const save = lessons[lesson.id]
    const isPrimer = lesson.id === PRIMER_ID
    const complete = isPrimer ? primerDone : stageDone(lesson.id)
    let status: StopStatus
    if (complete) status = 'complete'
    else if (isPrimer) status = 'current'
    else if (lesson.id === firstOpenStage) status = primerDone ? 'current' : 'open'
    else status = 'locked'
    const seen = save ? Math.min(lesson.beats.length, Math.max(save.furthest, beatIndex(lesson, save.beatId)) + 1) : 0
    return {
      id: lesson.id,
      number: lesson.number,
      title: lesson.title,
      goal: lesson.goal,
      status,
      started: Boolean(save) || Boolean(progress[lesson.id]),
      seen: complete ? lesson.beats.length : seen,
      beats: lesson.beats.length,
      clean: save?.drill.clean ?? 0,
      mastered: isMastered(save, lesson.id === 'primer' ? null : (lesson.id as StageId)),
    }
  })

  stops.push({
    id: CAPSTONE_ID,
    number: 9,
    title: 'Full solve',
    goal: 'Scrambled to solved, start to finish.',
    status: capstone.solves > 0 ? 'complete' : stagesDone === STAGES.length ? 'current' : 'locked',
    started: capstone.session !== null || capstone.solves > 0,
    seen: 0,
    beats: 0,
    clean: 0,
    mastered: false,
  })

  return { stops, next: stops.find((s) => s.status === 'current') ?? null, stagesDone }
}

/** "Stage 3" / "Start here" / "Finale". */
export function stopLabel(stop: Pick<PathStop, 'id' | 'number'>): string {
  if (stop.id === PRIMER_ID) return 'Start here'
  if (stop.id === CAPSTONE_ID) return 'Finale'
  return `Stage ${stop.number}`
}
