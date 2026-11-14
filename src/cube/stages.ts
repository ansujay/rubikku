/**
 * The stages of the beginner (layer-by-layer) method, in the order they are taught.
 * The ids are stable and used across the whole app. Stage detection and the beginner solver
 * build on these.
 */
import type { RotationMove } from './notation'

export const STAGE_IDS = [
  'daisy',
  'white-cross',
  'white-corners',
  'middle-layer',
  'yellow-cross',
  'yellow-edges',
  'yellow-corners-position',
  'yellow-corners-orient',
] as const

export type StageId = (typeof STAGE_IDS)[number]

/**
 * How the cube is held for the whole beginner method: yellow on top, white on the bottom (the
 * daisy is built round the yellow centre and its petals drop down onto the white face).
 * Apply this to an upright cube (`applyAlg(state, BEGINNER_HOLD)`) to get that view with green
 * still in front. All algorithms in `ALGORITHMS` are written for this hold; the beginner solver
 * only ever spins the cube about its vertical axis (`y`) once it is held this way.
 */
export const BEGINNER_HOLD: readonly RotationMove[] = ['z2']
