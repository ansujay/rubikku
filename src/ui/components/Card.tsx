import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from '../cx'

export type CardVariant = 'raised' | 'flat' | 'inset' | 'outline'
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const VARIANTS: Record<CardVariant, string> = {
  raised: 'bg-surface border border-line shadow-1',
  flat: 'bg-surface border border-line',
  inset: 'bg-inset',
  outline: 'border-[1.5px] border-dashed border-line-strong',
}
const PADDING: Record<CardPadding, string> = { none: '', sm: 'p-3', md: 'p-5', lg: 'p-6 sm:p-7' }

const INTERACTIVE =
  'transition-[translate,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-2 hover:border-line-strong active:translate-y-0 active:scale-[0.99] active:shadow-1'

export interface CardStyleProps {
  variant?: CardVariant
  padding?: CardPadding
  /** Hover lift + press squeeze. Set automatically by CardLink. */
  interactive?: boolean
}

export function cardClasses({ variant = 'raised', padding = 'md', interactive = false }: CardStyleProps = {}, extra?: string) {
  return cx('relative rounded-lg', VARIANTS[variant], PADDING[padding], interactive && INTERACTIVE, extra)
}

export interface CardProps extends HTMLAttributes<HTMLElement>, CardStyleProps {
  as?: 'div' | 'section' | 'article' | 'li'
  ref?: Ref<HTMLElement>
}

/** A surface. <Card variant="raised" padding="lg">…</Card> */
export function Card({ as: Tag = 'div', variant, padding, interactive, className, ref, ...rest }: CardProps) {
  return <Tag ref={ref as never} className={cardClasses({ variant, padding, interactive }, className)} {...rest} />
}

export interface CardLinkProps extends LinkProps, Omit<CardStyleProps, 'interactive'> {
  children?: ReactNode
}

/** A whole card that navigates. Lifts on hover, squeezes on press. */
export function CardLink({ variant, padding, className, ...rest }: CardLinkProps) {
  return <Link className={cardClasses({ variant, padding, interactive: true }, cx('block', className))} {...rest} />
}
