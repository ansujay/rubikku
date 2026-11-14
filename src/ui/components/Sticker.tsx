import type { HTMLAttributes } from 'react'
import { cx } from '../cx'
import { TONE_CLASSES, type Tone } from '../colors'
import { Icon, type IconName } from '../icons'

export type StickerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<StickerSize, { box: string; icon: number; depth: number }> = {
  xs: { box: 'size-6 rounded-[7px]', icon: 13, depth: 0 },
  sm: { box: 'size-8 rounded-[9px]', icon: 16, depth: 2 },
  md: { box: 'size-11 rounded-[12px]', icon: 22, depth: 3 },
  lg: { box: 'size-14 rounded-[15px]', icon: 28, depth: 3 },
  xl: { box: 'size-20 rounded-[22px]', icon: 40, depth: 4 },
}

const EDGE_VAR: Record<Tone, string> = {
  neutral: 'var(--line-strong)',
  accent: 'var(--accent-edge)',
  white: 'var(--cube-white-edge)',
  yellow: 'var(--cube-yellow-edge)',
  green: 'var(--cube-green-edge)',
  blue: 'var(--cube-blue-edge)',
  red: 'var(--cube-red-edge)',
  orange: 'var(--cube-orange-edge)',
}

export interface StickerProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  icon?: IconName
  size?: StickerSize
  /** `solid` is a real cube sticker; `soft` is a quiet tint; `locked` is greyed out. */
  variant?: 'solid' | 'soft' | 'locked'
  filled?: boolean
}

/**
 * The brand motif: an icon sitting on a cube sticker.
 * <Sticker tone="orange" icon="flame" size="lg" />
 */
export function Sticker({ tone = 'accent', icon, size = 'md', variant = 'solid', filled, className, children, style, ...rest }: StickerProps) {
  const t = TONE_CLASSES[tone]
  const s = SIZES[size]
  const solid = variant === 'solid'
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-display font-extrabold',
        s.box,
        solid && [tone === 'neutral' ? 'bg-inset text-ink' : [t.solid, t.onSolid], tone === 'white' && 'ring-1 ring-inset ring-(color:--sticker-outline)'],
        variant === 'soft' && [t.soft, t.text],
        variant === 'locked' && 'bg-inset text-ink-faint',
        className,
      )}
      style={solid && s.depth ? { boxShadow: `0 ${s.depth}px 0 0 ${EDGE_VAR[tone]}`, ...style } : style}
      {...rest}
    >
      {icon ? <Icon name={icon} size={s.icon} filled={filled} weight={2.2} /> : children}
    </span>
  )
}
