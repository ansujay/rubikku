import { motion } from 'motion/react'
import { cx, springs, useMotionPref } from '../../../ui'
import type { Lesson } from '../content'

/**
 * Where he is in the lesson: one segment per section (Goal · Idea · Cases · Your turn · Drills ·
 * Wrap-up), each filling as its beats go by. Tap a section to jump to its first beat.
 */
export function SectionStepper({ lesson, index, furthest, onJump }: { lesson: Lesson; index: number; furthest: number; onJump: (index: number) => void }) {
  const { reduced } = useMotionPref()
  const current = lesson.beats[index].section
  return (
    <nav aria-label="Lesson sections" className="flex gap-1.5" data-testid="stepper">
      {lesson.sections.map((section) => {
        const first = lesson.beats.findIndex((b) => b.section === section.id)
        const count = lesson.beats.filter((b) => b.section === section.id).length
        const isCurrent = section.id === current
        const fraction = index >= first + count ? 1 : index < first ? 0 : (index - first + 1) / count
        const reached = furthest >= first
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onJump(first)}
            aria-current={isCurrent ? 'step' : undefined}
            aria-label={`${section.label}${isCurrent ? ', current section' : ''}`}
            className={cx('group flex min-w-0 flex-col gap-1 rounded-xs py-1 text-left sm:gap-1.5', isCurrent ? 'flex-[1.6]' : 'flex-1')}
          >
            <span className="relative block h-1.5 overflow-hidden rounded-full bg-inset ring-1 ring-inset ring-line">
              <motion.span
                className={cx('absolute inset-y-0 left-0 rounded-full', fraction === 1 && !isCurrent ? 'bg-cube-green' : 'bg-accent')}
                initial={false}
                animate={{ width: `${fraction * 100}%` }}
                transition={reduced ? { duration: 0 } : springs.fill}
              />
            </span>
            <span
              className={cx(
                'truncate text-xs leading-tight font-bold transition-colors duration-150 sm:leading-normal',
                isCurrent ? 'text-ink' : reached ? 'text-ink-muted group-hover:text-ink max-sm:hidden' : 'text-ink-faint group-hover:text-ink-muted max-sm:hidden',
              )}
            >
              {section.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
