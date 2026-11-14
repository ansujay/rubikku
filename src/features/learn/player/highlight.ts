/** What a beat lights on the cube (pure, so the tests can check what the text promises). */
import { nextBeginnerStep, pieceAt, type CubeState, type PieceId, type SlotId, type SolveStep } from '../../../cube'
import type { CubeHighlight } from '../../../three'
import type { HighlightSpec } from '../content'
import { segmentAt, type ResolvedPlay } from '../engine'

const SIDE_CENTRES: readonly SlotId[] = ['F', 'R', 'B', 'L']

/**
 * `current`: the step he is on when an exercise is judged by result (the plan follows him, so
 * "the step" is the follower's, not the play's).
 */
export function resolveHighlight(spec: HighlightSpec | undefined, start: CubeState, play: ResolvedPlay | null, position: number, current?: SolveStep | null): CubeHighlight | null {
  if (!spec) return null
  const fromStep = spec === 'step' || spec === 'step-target' ? spec : spec.step === 'target' ? 'step-target' : spec.step ? 'step' : null
  const pieces: PieceId[] = []
  const slots: SlotId[] = []
  if (fromStep) {
    const step = current !== undefined ? current : ((play && play.steps.length > 0 ? segmentAt(play, Math.min(position, play.moves.length - 1))?.step : null) ?? nextBeginnerStep(start))
    if (step) {
      pieces.push(...step.highlight.pieces)
      if (fromStep === 'step-target') slots.push(...step.highlight.targets)
    }
  }
  let dim = true
  if (typeof spec === 'object') {
    pieces.push(...(spec.pieces ?? []), ...(spec.piecesAt ?? []).map((slot) => pieceAt(start, slot).piece))
    slots.push(...(spec.slots ?? []))
    if (spec.centres) slots.push(...(spec.centres === 'sides' ? SIDE_CENTRES : spec.centres === 'all' ? (['U', 'D', ...SIDE_CENTRES] as SlotId[]) : spec.centres))
    dim = spec.dim ?? true
    if (spec.facelets) return { pieces, slots, facelets: spec.facelets, dimOthers: dim }
  }
  if (pieces.length === 0 && slots.length === 0) return null
  return { pieces, slots, dimOthers: dim }
}

