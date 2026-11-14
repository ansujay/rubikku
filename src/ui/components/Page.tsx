import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cx } from '../cx'
import { staggerContainer, staggerItem } from '../motion'

export interface PageProps {
  children: ReactNode
  /** `wide` uses the full content width; `narrow` suits reading and settings. */
  width?: 'wide' | 'narrow'
  className?: string
}

/**
 * Page wrapper: content width, gutters, and a staggered reveal for its direct `Reveal` children.
 * Every route component should return a <Page>.
 */
export function Page({ children, width = 'wide', className }: PageProps) {
  return (
    <motion.div
      variants={staggerContainer()}
      initial="hidden"
      animate="show"
      className={cx(
        'mx-auto w-full px-4 pt-5 pb-10 sm:px-6 md:px-8 md:pt-8 md:pb-14',
        width === 'wide' ? 'max-w-(--content-max)' : 'max-w-2xl',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

/** One staggered block inside a <Page> (or any staggerContainer). */
export function Reveal({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'header' | 'li' }) {
  const Tag = motion[as]
  return (
    <Tag variants={staggerItem} className={className}>
      {children}
    </Tag>
  )
}

export interface PageHeaderProps {
  title: ReactNode
  /** Small caps line above the title. */
  eyebrow?: ReactNode
  /** One or two friendly sentences under the title. */
  lede?: ReactNode
  /** Buttons on the right (below on phones). */
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, eyebrow, lede, actions, className }: PageHeaderProps) {
  return (
    <Reveal as="header" className={cx('mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl text-ink md:text-4xl">{title}</h1>
        {lede && <p className="mt-2 max-w-xl text-lg text-ink-muted">{lede}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </Reveal>
  )
}

export interface SectionProps {
  title: ReactNode
  /** Right-aligned link or control. */
  action?: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}

/** A titled block of a page. */
export function Section({ title, action, description, children, className }: SectionProps) {
  return (
    <Reveal as="section" className={cx('mt-8 md:mt-10', className)}>
      <div className="mb-3.5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-base text-ink-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Reveal>
  )
}

export interface FieldProps {
  label: ReactNode
  /** Id of the control, so the label is clickable. */
  htmlFor?: string
  /** Id to put on the label element, for `aria-labelledby`. */
  labelId?: string
  hint?: ReactNode
  /** The control. `inline` puts it on the right of the label; `stacked` puts it below. */
  children: ReactNode
  layout?: 'inline' | 'stacked'
  className?: string
}

/** A labelled row for a setting. */
export function Field({ label, htmlFor, labelId, hint, children, layout = 'inline', className }: FieldProps) {
  const Label = htmlFor ? 'label' : 'div'
  return (
    <div className={cx(layout === 'inline' ? 'flex items-center justify-between gap-5' : 'flex flex-col gap-3', 'py-4', className)}>
      <div className="min-w-0">
        <Label id={labelId} htmlFor={htmlFor} className="block text-base font-bold text-ink">
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>}
      </div>
      <div className={cx(layout === 'inline' && 'shrink-0')}>{children}</div>
    </div>
  )
}
