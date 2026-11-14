/**
 * The hard cases of each stage's drills, by id and in words. Kept apart from the engine (which
 * knows how to find them on a cube) so that the learn store can name them without loading it.
 */
import type { StageId } from '../../cube'

export const HARD_CASES: Record<StageId, readonly { id: string; label: string }[]> = {
  daisy: [
    { id: 'top-flipped', label: 'a white edge on top, flipped' },
    { id: 'bottom-flipped', label: 'a bottom edge with white on the side' },
  ],
  'white-cross': [],
  'white-corners': [
    { id: 'twisted', label: 'a corner at home but twisted' },
    { id: 'wrong-slot', label: 'a corner stuck in the wrong slot' },
  ],
  'middle-layer': [
    { id: 'left', label: 'an edge that goes left' },
    { id: 'stuck', label: 'an edge stuck in the middle layer' },
  ],
  'yellow-cross': [{ id: 'dot', label: 'the dot' }],
  'yellow-edges': [{ id: 'opposite', label: 'a matching pair opposite each other' }],
  'yellow-corners-position': [{ id: 'none-home', label: 'no corner at home' }],
  'yellow-corners-orient': [{ id: 'four-twists', label: 'a corner that needs 4 twists' }],
}
