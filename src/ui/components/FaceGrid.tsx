import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { cx } from '../cx'
import { CUBE_CLASSES, CUBE_COLOR_LETTER, CUBE_COLOR_NAME, type CubeColor } from '../colors'

export interface FaceGridProps {
  /** Nine colours, row by row from the top left. `null` is an unpainted sticker. */
  colors: readonly (CubeColor | null | undefined)[]
  /** Width of one sticker in px. Leave out to fill the width of the parent. */
  size?: number
  /** Show each sticker's letter (W Y G B R O) so colour is not the only signal. */
  showLetters?: boolean
  /** Makes every sticker a button (roving focus, arrow keys move across the grid). */
  onCellClick?: (index: number) => void
  /** Cell drawn with a selection ring. Passing it (even null) makes the stickers toggle buttons. */
  selected?: number | null
  /** Accessible name. Default "Front face". */
  label?: string
  className?: string
}

const POSITION = ['top left', 'top middle', 'top right', 'middle left', 'centre', 'middle right', 'bottom left', 'bottom middle', 'bottom right']
const ROWS = ['top row', 'middle row', 'bottom row']
const name = (c: CubeColor | null | undefined) => (c ? CUBE_COLOR_NAME[c].toLowerCase() : 'empty')

function neighbor(index: number, key: string): number | null {
  const row = Math.floor(index / 3)
  const col = index % 3
  if (key === 'ArrowUp') return row > 0 ? index - 3 : null
  if (key === 'ArrowDown') return row < 2 ? index + 3 : null
  if (key === 'ArrowLeft') return col > 0 ? index - 1 : null
  if (key === 'ArrowRight') return col < 2 ? index + 1 : null
  if (key === 'Home') return row * 3
  if (key === 'End') return row * 3 + 2
  return null
}

/**
 * One cube face: a 3x3 grid of stickers. Read-only by default (a picture), or editable.
 *
 *   <FaceGrid colors={grid} size={16} />
 *   <FaceGrid colors={painted} onCellClick={paint} selected={cursor} showLetters />
 */
export function FaceGrid({ colors, size, showLetters = false, onCellClick, selected, label = 'Front face', className }: FaceGridProps) {
  const interactive = Boolean(onCellClick)
  const [focusIndex, setFocusIndex] = useState(() => (typeof selected === 'number' ? selected : 4))
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const next = neighbor(index, event.key)
    if (next === null) return
    event.preventDefault()
    setFocusIndex(next)
    buttons.current[next]?.focus()
  }

  const cells = Array.from({ length: 9 }, (_, i) => {
    const color = colors[i] ?? null
    const isSelected = selected === i
    const classes = cx(
      'relative grid aspect-square place-items-center font-mono font-bold',
      'transition-[background-color,scale,box-shadow] duration-200 ease-out',
      color ? [CUBE_CLASSES[color].solid, CUBE_CLASSES[color].onSolid, color === 'white' ? 'sticker-white-key' : 'shadow-[inset_0_0_0_1px_var(--sticker-outline)]'] : 'sticker-empty',
      isSelected && 'z-10 outline-[2.5px] outline-offset-1 outline-solid! outline-ink',
      interactive && 'cursor-pointer hover:brightness-105 active:scale-90 focus-visible:z-20',
    )
    const style: CSSProperties = { borderRadius: '9cqw', fontSize: '20cqw', lineHeight: 1 }
    const letter = showLetters && color ? <span aria-hidden="true">{CUBE_COLOR_LETTER[color]}</span> : color ? null : <span aria-hidden="true" className="sticker-empty-dot" />
    if (!interactive) {
      return (
        <span key={i} className={classes} style={style} data-color={color ?? 'empty'}>
          {letter}
        </span>
      )
    }
    return (
      <button
        key={i}
        ref={(el) => {
          buttons.current[i] = el
        }}
        type="button"
        tabIndex={focusIndex === i ? 0 : -1}
        aria-label={`${POSITION[i]}, ${name(color)}`}
        aria-pressed={selected === undefined ? undefined : isSelected}
        data-color={color ?? 'empty'}
        onFocus={() => setFocusIndex(i)}
        onKeyDown={(event) => onKeyDown(event, i)}
        onClick={() => onCellClick?.(i)}
        className={classes}
        style={style}
      >
        {letter}
      </button>
    )
  })

  const summary = [0, 1, 2].map((r) => `${ROWS[r]} ${[0, 1, 2].map((c) => name(colors[r * 3 + c])).join(', ')}`).join('; ')
  return (
    <div
      className={cx('@container aspect-square shrink-0', size === undefined && 'w-full', className)}
      style={size !== undefined ? { width: size * 3 + 6 } : undefined}
    >
      <div
        role={interactive ? 'group' : 'img'}
        aria-label={interactive ? label : `${label}: ${summary}`}
        className="grid size-full grid-cols-3 bg-cube-body"
        style={{ padding: '3cqw', gap: '3cqw', borderRadius: '12cqw' }}
      >
        {cells}
      </div>
    </div>
  )
}
