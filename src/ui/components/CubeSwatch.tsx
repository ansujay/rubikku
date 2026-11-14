import { cx } from '../cx'
import { CUBE_CLASSES, CUBE_COLOR_LETTER, CUBE_COLOR_NAME, type CubeColor } from '../colors'

export type CubeSwatchSize = 'sm' | 'md' | 'lg'

const SIZES: Record<CubeSwatchSize, string> = {
  sm: 'size-6 rounded-[6px] text-2xs',
  md: 'size-9 rounded-[9px] text-xs',
  lg: 'size-12 rounded-[12px] text-sm',
}

export interface CubeSwatchProps {
  color: CubeColor
  size?: CubeSwatchSize
  /** Show the colour's letter (W Y G B R O) so colour is not the only signal. */
  showLetter?: boolean
  selected?: boolean
  /** Makes it a button (e.g. a paint palette). */
  onClick?: () => void
  disabled?: boolean
  className?: string
}

/** One cube sticker. <CubeSwatch color="red" showLetter selected onClick={…} /> */
export function CubeSwatch({ color, size = 'md', showLetter = false, selected = false, onClick, disabled, className }: CubeSwatchProps) {
  const c = CUBE_CLASSES[color]
  const classes = cx(
    'relative inline-grid shrink-0 place-items-center font-mono font-bold',
    'shadow-[inset_0_0_0_1px_var(--sticker-outline),inset_0_-3px_0_0_rgb(0_0_0/0.1)]',
    SIZES[size],
    c.solid,
    c.onSolid,
    selected && 'outline-[2.5px] outline-offset-[3px] outline-ink',
    onClick && 'transition-[scale] duration-150 ease-out hover:scale-105 active:scale-90 disabled:opacity-40',
    onClick && size !== 'lg' && 'before:absolute before:-inset-2 before:content-[""]',
    className,
  )
  const content = showLetter ? <span aria-hidden="true">{CUBE_COLOR_LETTER[color]}</span> : null
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={CUBE_COLOR_NAME[color]} className={classes}>
        {content}
      </button>
    )
  }
  return (
    <span role="img" aria-label={CUBE_COLOR_NAME[color]} className={classes}>
      {content}
    </span>
  )
}
