import { useParams } from 'react-router-dom'
import NotFoundPage from '../../app/NotFoundPage'
import { CAPSTONE_ID, getLesson } from './content'
import FullSolve from './FullSolve'
import { LessonPlayer } from './player/LessonPlayer'

/** `#/learn/:stageId` — the primer (`primer`), one of the eight stages, or the full solve. */
export default function LessonPage() {
  const { stageId = '' } = useParams()
  if (stageId === CAPSTONE_ID) return <FullSolve />
  const lesson = getLesson(stageId)
  if (!lesson) return <NotFoundPage />
  return <LessonPlayer key={lesson.id} lesson={lesson} />
}
