import type { Move } from '../cube'
import { IconButton } from '../ui'

/**
 * The two "turn the whole cube" buttons (`y′` / `y`): there is no drag gesture for a
 * whole-cube turn (dragging beside the cube only moves the camera), so on a touch screen these
 * are how `y` / `y′` are made. Normally you don't place this yourself: `<StageControls
 * onTurnCube={…}>` puts it at the left of the stage's control bar.
 */
export function TurnCubeButtons({ onTurn, disabled }: { onTurn: (move: Move) => void; disabled?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" role="group" aria-label="Turn the whole cube" data-testid="turn-cube">
      <IconButton icon="rotateCw" label="Turn the whole cube: left side to the front" size="sm" tooltip={false} className="-scale-x-100" disabled={disabled} onClick={() => onTurn("y'")} data-testid="turn-cube-left" />
      <span className="px-0.5 text-2xs font-bold tracking-wide text-ink-faint uppercase select-none @max-[24rem]/stage:hidden" aria-hidden="true">
        Cube
      </span>
      <IconButton icon="rotateCw" label="Turn the whole cube: right side to the front" size="sm" tooltip={false} disabled={disabled} onClick={() => onTurn('y')} data-testid="turn-cube-right" />
    </div>
  )
}
