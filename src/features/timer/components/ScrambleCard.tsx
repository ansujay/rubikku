import { SOLVED } from '../../../cube'
import { MiniCube } from '../../../three'
import { Card, IconButton, MoveSequence } from '../../../ui'

export interface ScrambleCardProps {
  scramble: string
  canGoBack: boolean
  onPrevious: () => void
  onNext: () => void
}

/**
 * The scramble in one compact row: the moves as keycaps on the left, the cube as it should look
 * after them on the right (a 3D mini on its stage — tap or hover it to watch the scramble play
 * out from solved). Kept short (about 190 px on a tablet) so the timer pad and its result row
 * stay on the first screen.
 */
export function ScrambleCard({ scramble, canGoBack, onPrevious, onNext }: ScrambleCardProps) {
  return (
    <Card padding="none" className="p-4 sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_1fr] gap-x-4 gap-y-2.5 sm:gap-x-6">
        <div className="min-w-0 self-center">
          <h2 className="eyebrow">Scramble</h2>
          <p className="mt-0.5 text-sm text-ink-muted" data-testid="scramble-hold">
            Hold it white on top, green in front. After scrambling, roll it over so yellow is on top.
          </p>
        </div>
        <div className="flex shrink-0 justify-center gap-2 self-start">
          <IconButton icon="chevronLeft" label="Previous scramble" size="sm" variant="secondary" disabled={!canGoBack} onClick={onPrevious} />
          <IconButton icon="chevronRight" label="Next scramble" size="sm" variant="secondary" onClick={onNext} />
        </div>
        <div className="min-w-0 self-center" data-testid="scramble" data-scramble={scramble}>
          <MoveSequence moves={scramble} size="sm" label="Scramble moves" className="sm:hidden" />
          <MoveSequence moves={scramble} size="md" label="Scramble moves" className="max-sm:hidden" />
        </div>
        <div className="stage grid size-24 place-items-center self-start justify-self-center rounded-lg! p-1 sm:size-28 sm:p-1.5" data-testid="scramble-cube">
          <MiniCube key={scramble} state={SOLVED} alg={scramble} play="hover" loop={false} restOnEnd speed={2.4} label="Your cube after this scramble. Tap to watch the scramble." className="w-full" />
        </div>
      </div>
    </Card>
  )
}
