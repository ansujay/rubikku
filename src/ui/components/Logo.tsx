import { cx } from '../cx'
import { IsoCube } from './IsoCube'

export interface LogoProps {
  /** Height of the mark in px. */
  size?: number
  /** Show only the cube mark. */
  markOnly?: boolean
  className?: string
}

/** The Rubikku mark (yellow / blue / red cube) and wordmark. */
export function Logo({ size = 32, markOnly = false, className }: LogoProps) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <IsoCube n={1} size={size * 0.9} top={['yellow']} front={['blue']} right={['red']} />
      {!markOnly && (
        <span className="font-display font-extrabold tracking-[-0.045em] text-ink" style={{ fontSize: size * 0.72, lineHeight: 1 }}>
          rubikku
        </span>
      )}
    </span>
  )
}
