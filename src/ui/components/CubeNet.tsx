import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { cx } from '../cx'
import { CUBE_CLASSES, type CubeColor, type Face } from '../colors'
import {
  NET_CELLS,
  NET_FACE_LABEL,
  NET_FACE_ORDER,
  NET_FACE_ORIGIN,
  netColors,
  netNeighbor,
  netStickerLabel,
  type NetDirection,
} from '../cubeNetLayout'

export interface CubeNetProps {
  /**
   * What to draw: the engine's 54-character state string (`CubeState`), or 54 colours in the
   * same facelet order (U R F D L B, row by row) where `null` is an unpainted sticker.
   */
  state: string | readonly (CubeColor | null | undefined)[]
  /** Width of one sticker cell in px. Leave out to fill the width of the parent. */
  size?: number
  /** Letter each centre with its face (U L F R B D), so colour is not the only signal. */
  showFaceLetters?: boolean
  /** Facelet numbers to keep bright; every other sticker dims. */
  highlight?: ReadonlySet<number> | readonly number[]
  /**
   * How see-through the stickers outside `highlight` are, 0 (gone) … 1 (not dimmed at all).
   * Default 0.25. Raise it when the dimmed stickers still have to be readable, e.g. a net that
   * is being painted while one face is in focus.
   */
  dimOpacity?: number
  /** Makes every sticker a button (roving focus, arrow keys move across the net). */
  onStickerClick?: (faceletIndex: number) => void
  /** Facelet drawn with a selection ring (e.g. the sticker being painted). */
  selected?: number | null
  /** Interactive mode only: stickers that cannot be pressed (e.g. the six centres). */
  isLocked?: (faceletIndex: number) => boolean
  /** Accessible name for the whole net. Default "Unfolded cube". */
  label?: string
  className?: string
}

const KEY_DIRECTION: Record<string, NetDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

// The net is 12 cells wide; everything inside is sized in container-query units so one
// component is crisp at 6px or 60px per sticker.
const CELL = 100 / 12

/**
 * A flat, unfolded cube: U on top, L F R B in a row, D below.
 *
 *   <CubeNet state={cubeState} size={18} />                       // read-only preview
 *   <CubeNet state={painted} onStickerClick={paint} showFaceLetters selected={cursor} />
 */
export function CubeNet({ state, size, showFaceLetters = false, highlight, dimOpacity, onStickerClick, selected = null, isLocked, label = 'Unfolded cube', className }: CubeNetProps) {
  const colors = useMemo(() => netColors(state), [state])
  const bright = useMemo(() => (highlight ? (highlight instanceof Set ? highlight : new Set(highlight)) : null), [highlight])
  const interactive = Boolean(onStickerClick)
  const [focusIndex, setFocusIndex] = useState(() => (typeof selected === 'number' ? selected : 22))
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const direction = KEY_DIRECTION[event.key]
    if (!direction) return
    event.preventDefault()
    const next = netNeighbor(index, direction)
    setFocusIndex(next)
    buttons.current[next]?.focus()
  }

  const faces = NET_FACE_ORDER.map((face: Face) => {
    const origin = NET_FACE_ORIGIN[face]
    const style: CSSProperties = {
      left: `${origin.col * CELL}%`,
      top: `${(origin.row / 9) * 100}%`,
      width: `${3 * CELL}%`,
      padding: '0.55cqw',
      gap: '0.55cqw',
      borderRadius: '1.5cqw',
    }
    return (
      <div key={face} role={interactive ? 'group' : undefined} aria-label={interactive ? `${NET_FACE_LABEL[face]} face` : undefined} className="absolute grid aspect-square grid-cols-3 bg-cube-body" style={style}>
        {NET_CELLS.filter((cell) => cell.face === face).map((cell) => {
          const color = colors[cell.index]
          const dim = bright !== null && !bright.has(cell.index)
          const isSelected = selected === cell.index
          const locked = interactive && isLocked?.(cell.index) === true
          const classes = cx(
            'relative grid place-items-center font-mono font-bold',
            'transition-[background-color,opacity,scale,box-shadow] duration-200 ease-out',
            color
              ? [CUBE_CLASSES[color].solid, CUBE_CLASSES[color].onSolid, color === 'white' ? 'sticker-white-key' : 'shadow-[inset_0_0_0_1px_var(--sticker-outline)]']
              : 'sticker-empty',
            // The default dimming is a class; `dimOpacity` replaces it with an exact value.
            dim && dimOpacity === undefined && 'opacity-25',
            isSelected && 'z-10 outline-[2.5px] outline-offset-1 outline-solid! outline-ink',
            interactive && !locked && 'cursor-pointer hover:brightness-105 active:scale-90',
            interactive && 'focus-visible:z-20',
          )
          const cellStyle: CSSProperties = { borderRadius: '1cqw', fontSize: '4.2cqw', lineHeight: 1, ...(color || isSelected ? null : { outlineWidth: '0.3cqw', outlineOffset: '-0.75cqw' }), opacity: dim && dimOpacity !== undefined ? Math.min(1, Math.max(0, dimOpacity)) : undefined }
          const letter = showFaceLetters && cell.isCenter ? <span aria-hidden="true">{face}</span> : color ? null : <span aria-hidden="true" className="sticker-empty-dot" />
          if (!interactive) {
            return (
              <span key={cell.index} className={cx(classes, 'aspect-square')} style={cellStyle} data-facelet={cell.index} data-color={color ?? 'empty'} data-dim={dim || undefined}>
                {letter}
              </span>
            )
          }
          return (
            <button
              key={cell.index}
              ref={(el) => {
                buttons.current[cell.index] = el
              }}
              type="button"
              tabIndex={focusIndex === cell.index ? 0 : -1}
              aria-label={netStickerLabel(cell.index, color) + (locked ? ' (fixed)' : '')}
              aria-pressed={isSelected || undefined}
              aria-disabled={locked || undefined}
              data-facelet={cell.index}
              data-color={color ?? 'empty'}
              data-dim={dim || undefined}
              onFocus={() => setFocusIndex(cell.index)}
              onKeyDown={(event) => onKeyDown(event, cell.index)}
              onClick={() => {
                if (!locked) onStickerClick?.(cell.index)
              }}
              className={cx(classes, 'aspect-square')}
              style={cellStyle}
            >
              {letter}
            </button>
          )
        })}
      </div>
    )
  })

  return (
    <div
      role={interactive ? 'group' : 'img'}
      aria-label={label}
      className={cx('@container relative aspect-[4/3] shrink-0', size === undefined && 'w-full', className)}
      style={size !== undefined ? { width: size * 12 } : undefined}
    >
      {faces}
    </div>
  )
}
