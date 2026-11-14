import type { ReactNode, RefObject } from 'react'
import type { Move } from '../cube'
import { IconButton } from '../ui'
import type { Cube3DHandle } from './Cube3D'
import { TurnCubeButtons } from './TurnCubeButtons'

export interface StageControlsProps {
  /** The cube the view buttons act on (peek, reset view). `cube.view` from useCubeController. */
  view?: RefObject<Cube3DHandle | null>
  /** Turn the whole cube (`y′` / `y`): shows ↺ CUBE ↻ at the left. Omit to leave it out. */
  onTurnCube?: (move: Move) => void
  /** Disables the turn buttons (e.g. while the cube is busy). */
  busy?: boolean
  /** A status badge or a short caption, between the turn buttons and the tools. */
  status?: ReactNode
  /** Mirrors toggle (shown when `onMirrorsChange` is given). */
  mirrors?: boolean
  onMirrorsChange?: (on: boolean) => void
  mirrorsDisabled?: boolean
  /** Face-letters toggle (shown when `onLabelsChange` is given). */
  labels?: boolean
  onLabelsChange?: (on: boolean) => void
  /** Peek at the back. Default true when `view` is given. */
  peek?: boolean
  /** Reset the view. Default: `view.current.resetView()`. Pass false to hide the button. */
  onResetView?: (() => void) | false
  /** More buttons at the right end (IconButton size="sm"). */
  extra?: ReactNode
}

/**
 * The one control bar for every cube stage: put it in `<CubeStage controls={…}>`. Left: turn the
 * whole cube. Middle: status. Right: mirrors, face letters, peek, reset view, extras.
 *
 *   <CubeStage fit="square" controls={
 *     <StageControls view={cube.view} onTurnCube={(m) => void cube.apply([m])} busy={cube.busy}
 *       mirrors={mirrors} onMirrorsChange={setMirrors} status={<Badge>3 moves</Badge>} />
 *   }>
 */
export function StageControls({
  view,
  onTurnCube,
  busy,
  status,
  mirrors,
  onMirrorsChange,
  mirrorsDisabled,
  labels,
  onLabelsChange,
  peek,
  onResetView,
  extra,
}: StageControlsProps) {
  const showPeek = peek ?? Boolean(view)
  const reset = onResetView === false ? null : (onResetView ?? (view ? () => void view.current?.resetView() : null))
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5" data-testid="stage-controls">
      {onTurnCube && <TurnCubeButtons onTurn={onTurnCube} disabled={busy} />}
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-1" data-testid="stage-status">
        {status}
      </div>
      <div className="flex shrink-0 items-center" role="toolbar" aria-label="View">
        {onMirrorsChange && (
          <IconButton
            icon="layers"
            label={mirrors ? 'Hide the mirrors' : 'Show the hidden sides in mirrors'}
            size="sm"
            pressed={Boolean(mirrors)}
            disabled={mirrorsDisabled}
            onClick={() => onMirrorsChange(!mirrors)}
          />
        )}
        {onLabelsChange && <IconButton icon="label" label={labels ? 'Hide face letters' : 'Show face letters'} size="sm" pressed={Boolean(labels)} onClick={() => onLabelsChange(!labels)} />}
        {showPeek && <IconButton icon="eye" label="Peek at the back" size="sm" onClick={() => void view?.current?.peek()} />}
        {reset && <IconButton icon="target" label="Reset the view" size="sm" onClick={reset} />}
        {extra}
      </div>
    </div>
  )
}
