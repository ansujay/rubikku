import { Fragment, type ReactNode } from 'react'
import { cx } from '../../../ui'

/**
 * Lesson text markup: `**bold**` and backticks for notation (`R U R' U'`, shown in the mono
 * face with a proper prime).
 */
export function RichText({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**')) {
          return (
            <strong key={i} className="font-bold text-ink">
              {part.slice(2, -2)}
            </strong>
          )
        }
        if (part.startsWith('`')) {
          return (
            <span key={i} className="rounded-xs bg-inset px-1.5 py-0.5 font-mono text-[0.92em] font-semibold whitespace-nowrap text-ink">
              {part.slice(1, -1).replace(/'/g, '′')}
            </span>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

export function Prose({ paragraphs, className }: { paragraphs: readonly string[]; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-2.5 text-base leading-relaxed text-ink-muted', className)}>
      {paragraphs.map((text, i) => (
        <p key={i}>
          <RichText text={text} />
        </p>
      ))}
    </div>
  )
}
