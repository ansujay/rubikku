import { useMemo } from 'react'
import { useProgress } from '../../store'
import { useLearn } from './learnStore'
import { buildPath, type LearnPath } from './path'

/** The learning path with live statuses (see `buildPath`). */
export function useLearnPath(): LearnPath {
  const progress = useProgress((s) => s.lessons)
  const lessons = useLearn((s) => s.lessons)
  const capstone = useLearn((s) => s.capstone)
  return useMemo(() => buildPath(progress, lessons, capstone), [progress, lessons, capstone])
}
