/**
 * Every lesson, in path order: the primer ("stage 0"), then the eight stages of the method.
 * The capstone ("full-solve") is not a lesson made of beats; it has its own page.
 */
import type { StageId } from '../../../cube'
import { daisy } from './daisy'
import { middleLayer } from './middleLayer'
import { primer } from './primer'
import type { Beat, Lesson, LessonId } from './types'
import { whiteCorners } from './whiteCorners'
import { whiteCross } from './whiteCross'
import { yellowCornersOrient } from './yellowCornersOrient'
import { yellowCornersPosition } from './yellowCornersPosition'
import { yellowCross } from './yellowCross'
import { yellowEdges } from './yellowEdges'

export * from './types'

export const LESSONS: readonly Lesson[] = [
  primer,
  daisy,
  whiteCross,
  whiteCorners,
  middleLayer,
  yellowCross,
  yellowEdges,
  yellowCornersPosition,
  yellowCornersOrient,
]

export const PRIMER_ID = 'primer' as const
export const CAPSTONE_ID = 'full-solve' as const

/** Every stop on the path, in order. */
export const PATH_IDS: readonly LessonId[] = [...LESSONS.map((lesson) => lesson.id), CAPSTONE_ID]

export function getLesson(id: string | undefined): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id)
}

export function isLessonId(id: unknown): id is LessonId {
  return typeof id === 'string' && (PATH_IDS as readonly string[]).includes(id)
}

/** The lesson after this one on the path (the capstone after stage 8), or null at the end. */
export function nextOnPath(id: LessonId): LessonId | null {
  const index = PATH_IDS.indexOf(id)
  return index >= 0 && index < PATH_IDS.length - 1 ? PATH_IDS[index + 1] : null
}

export function beatIndex(lesson: Lesson, beatId: string | null | undefined): number {
  const index = lesson.beats.findIndex((beat) => beat.id === beatId)
  return index < 0 ? 0 : index
}

/** The stage a lesson teaches; null for the primer. */
export function lessonStage(lesson: Lesson): StageId | null {
  return lesson.id === PRIMER_ID ? null : (lesson.id as StageId)
}

/** The cube a beat starts from and the play it follows, if it has one. */
export function beatPlay(beat: Beat) {
  return beat.kind === 'goal' || beat.kind === 'demo' || beat.kind === 'guided' ? beat.play : null
}
