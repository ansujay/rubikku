import type { CSSProperties } from 'react'
import { cx } from '../cx'
import { CUBE_CLASSES, FACE_COLOR } from '../colors'
import { describeMove, parseMoveToken, tokenizeMoves, type ParsedMove } from '../moves'

export type MoveChipSize = 'sm' | 'md' | 'lg' | 'xl'
/** `upcoming` (default) sits raised; `active` is the move happening now; `done` looks pressed in. */
export type MoveChipState = 'upcoming' | 'active' | 'done'

const SIZES: Record<MoveChipSize, { box: string; letter: string; bar: string; depth: number }> = {
  sm: { box: 'h-8 min-w-8 px-1.5 rounded-[8px] pb-1', letter: 'text-sm', bar: 'inset-x-1.5 bottom-[3px] h-[2.5px]', depth: 2 },
  md: { box: 'h-11 min-w-11 px-2.5 rounded-[11px] pb-1.5', letter: 'text-lg', bar: 'inset-x-2 bottom-1 h-[3px]', depth: 3 },
  lg: { box: 'h-[4.5rem] min-w-[4.5rem] px-4 rounded-[18px] pb-2', letter: 'text-4xl', bar: 'inset-x-3.5 bottom-2 h-[5px]', depth: 4 },
  /** The notation trainer's prompt: a keycap you could press with your whole thumb. */
  xl: { box: 'h-32 min-w-32 px-6 rounded-[28px] pb-3', letter: 'text-[4.25rem]', bar: 'inset-x-6 bottom-3.5 h-[7px]', depth: 6 },
}

export interface MoveChipProps {
  /** One move in standard notation: "R", "U'", "F2", "Rw", "M'", "x". */
  move: string | ParsedMove
  size?: MoveChipSize
  state?: MoveChipState
  /** Makes the chip a button. */
  onClick?: () => void
  className?: string
}

/**
 * One move as a keycap. The stripe underneath is the colour of the face that turns
 * (U white, D yellow, F green, B blue, R red, L orange); slices and rotations have no stripe.
 * <MoveChip move="R'" />  <MoveChip move="U2" state="active" size="lg" />
 */
export function MoveChip({ move, size = 'md', state = 'upcoming', onClick, className }: MoveChipProps) {
  const parsed = typeof move === 'string' ? parseMoveToken(move) : move
  const s = SIZES[size]
  const active = state === 'active'
  const done = state === 'done'
  const isWhite = parsed.face === 'U'
  const stripe = parsed.face ? CUBE_CLASSES[FACE_COLOR[parsed.face]].cssVar : null
  const depth = done ? 0 : s.depth
  const Tag = onClick ? 'button' : 'span'

  const style: CSSProperties = {
    boxShadow: `0 ${depth}px 0 0 ${active ? 'color-mix(in oklab, var(--ink) 55%, var(--bg))' : 'var(--line-strong)'}`,
    translate: done ? `0 ${s.depth}px` : active ? '0 -2px' : undefined,
    scale: active ? '1.08' : undefined,
    transition:
      'translate var(--dur-base) var(--ease-spring), scale var(--dur-base) var(--ease-spring), box-shadow var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
  }

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      role={onClick ? undefined : 'img'}
      aria-label={describeMove(parsed)}
      aria-current={active ? 'step' : undefined}
      data-state={state}
      title={parsed.valid ? describeMove(parsed) : 'Not a move'}
      style={style}
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center border font-mono font-bold select-none',
        s.box,
        s.letter,
        active ? 'z-10 border-transparent bg-ink text-ink-inverse' : 'border-line-strong bg-surface text-ink',
        done && 'bg-inset! text-ink-faint!',
        !parsed.valid && 'border-dashed text-cube-red-text',
        onClick && 'cursor-pointer active:brightness-95',
        className,
      )}
    >
      <span aria-hidden="true" className="leading-none tracking-[-0.04em]">
        {parsed.base}
        {parsed.modifier === "'" && <span className="ml-[0.04em]">′</span>}
        {parsed.modifier === '2' && <span className="ml-[0.06em] text-[0.82em]">2</span>}
      </span>
      {stripe && (
        <span
          aria-hidden="true"
          className={cx('absolute rounded-full', s.bar, done && 'opacity-40')}
          style={{ background: stripe, boxShadow: isWhite && !active ? 'inset 0 0 0 1.25px var(--cube-white-mark)' : undefined }}
        />
      )}
    </Tag>
  )
}

export interface MoveSequenceProps {
  /** "R U R' U'" or ['R', 'U', "R'", "U'"]. Parentheses group moves: "(R U R' U') F". */
  moves: string | readonly string[]
  size?: MoveChipSize
  /** Index of the move being played. Earlier moves render as done. -1 or undefined: none active. */
  activeIndex?: number
  /** Called with the move index when a chip is tapped (makes chips buttons). */
  onMoveClick?: (index: number) => void
  /** Accessible name for the whole algorithm. */
  label?: string
  className?: string
}

/** A row of MoveChips that wraps. <MoveSequence moves="(R U R' U') F" activeIndex={2} /> */
export function MoveSequence({ moves, size = 'md', activeIndex, onMoveClick, label, className }: MoveSequenceProps) {
  const tokens = tokenizeMoves(moves)
  const tracking = typeof activeIndex === 'number' && activeIndex >= 0
  const gap = size === 'sm' ? 'gap-x-1 gap-y-2' : size === 'md' ? 'gap-x-1.5 gap-y-2.5' : 'gap-x-2.5 gap-y-3.5'
  return (
    <div role="group" aria-label={label ?? 'Moves'} className={cx('flex flex-wrap items-center', gap, className)}>
      {tokens.map((token, i) =>
        token.type === 'move' ? (
          <MoveChip
            key={i}
            move={token.move}
            size={size}
            state={!tracking ? 'upcoming' : token.index < activeIndex ? 'done' : token.index === activeIndex ? 'active' : 'upcoming'}
            onClick={onMoveClick ? () => onMoveClick(token.index) : undefined}
          />
        ) : (
          <span
            key={i}
            aria-hidden="true"
            className={cx('font-mono font-medium text-ink-faint select-none', size === 'sm' ? 'text-lg' : size === 'md' ? 'text-2xl' : 'text-4xl', token.type === 'open' ? '-mr-0.5' : '-ml-0.5')}
          >
            {token.type === 'open' ? '(' : ')'}
          </span>
        ),
      )}
    </div>
  )
}
