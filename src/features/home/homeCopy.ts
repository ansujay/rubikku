/**
 * The words and the stage strip on Home, from the one "what is next" rule the whole app shares
 * (`nextStop` in src/features/learn/next.ts — a light module: the two stores and nothing else).
 */
import { STAGES, type LessonProgress } from '../../store'
import type { StageTrackerItem } from '../../ui'
import type { NextStop } from '../learn/next'

export interface HeroCopy {
  title: string
  lede: string
  /** The main button. */
  cta: { to: string; label: string; icon?: 'timer' }
}

/** The words on the Home hero for where he is on the path. */
export function heroCopy(next: NextStop | null): HeroCopy {
  if (!next) {
    return {
      title: 'You know the whole method.',
      lede: 'Every stage is done, and so is a full solve. Now make it faster — the timer is waiting.',
      cta: { to: '/timer', label: 'Race the clock', icon: 'timer' },
    }
  }
  if (next.kind === 'primer') {
    return {
      title: 'Let’s solve your first cube.',
      lede: next.started ? 'You have met the cube. Finish the warm-up, then it is on to stage 1.' : 'Eight short stages, one layer at a time. First, a two-minute look at how the cube works.',
      cta: { to: next.to, label: next.started ? 'Continue' : 'Start here' },
    }
  }
  if (next.kind === 'capstone') {
    return {
      title: 'Time for a full solve.',
      lede: 'All eight stages are done. Now put them together: scrambled to solved, start to finish.',
      cta: { to: next.to, label: next.started ? 'Continue the solve' : 'Start the full solve' },
    }
  }
  const stage = STAGES.find((s) => s.id === next.id)
  return {
    title: `Next up: ${next.title.toLowerCase()}.`,
    lede: stage?.goal ?? '',
    cta: { to: next.to, label: next.started ? 'Continue' : `Start stage ${next.number}` },
  }
}

/** Stages finished, out of eight. */
export const stagesDone = (lessons: Readonly<Record<string, LessonProgress>>): number => STAGES.filter((s) => lessons[s.id]?.completedAt).length

/** One line under "Your path". */
export function pathSummary(next: NextStop | null, done: number): string {
  if (!next) return 'All eight stages and a full solve: complete.'
  if (next.kind === 'capstone') return 'All eight stages complete. One thing left: a full solve.'
  if (next.kind === 'primer') return 'Eight stages. A quick warm-up comes first.'
  return `${done} of ${STAGES.length} stages complete`
}

/**
 * The eight stages for the `StageTracker`: done, the current one (only once the warm-up is
 * behind him), to do (the first open stage while the warm-up comes first), locked after that.
 * Every stage links to its lesson — a locked one can be peeked at, as on the Learn map.
 */
export function stageItems(lessons: Readonly<Record<string, LessonProgress>>, next: NextStop | null): StageTrackerItem[] {
  const firstOpen = STAGES.find((s) => !lessons[s.id]?.completedAt)?.id
  return STAGES.map((stage): StageTrackerItem => {
    const done = Boolean(lessons[stage.id]?.completedAt)
    const state = done ? 'done' : stage.id === firstOpen ? (next?.kind === 'primer' ? 'todo' : 'current') : 'locked'
    const word = state === 'done' ? 'complete' : state === 'current' ? 'up next' : state === 'todo' ? 'open after the warm-up' : 'locked — peek ahead'
    return { id: stage.id, number: stage.number, title: stage.title, state, to: `/learn/${stage.id}`, ariaLabel: `Stage ${stage.number}, ${stage.title}: ${word}` }
  })
}
