/**
 * "Which picture looks most like your cube?" — the 20-second way back for a learner who is lost on
 * his real cube. Eight pictures of the same example cube: just scrambled, then with each of the
 * first seven stages finished (the solved cube would be no help to someone who is stuck). He taps
 * the one that looks like his cube, answers one or two quick checks that the pictured stage really
 * is whole, and is sent to the stage after it: that stage's real-cube step, or its practice cubes.
 * Painting all 54 stickers stays as the fallback, for "none of these".
 *
 * Pure (no React): the routing is checked by the tests.
 */
import { analyzeCube, STAGE_IDS, type CubeState, type PieceId, type StageId } from '../../cube'
import { STAGES } from '../../store/stages'
import { afterStageState, scrambledShowcase } from './engine'

/** What he picked: nothing done yet, or the last stage that is whole. */
export type RescuePick = 'scrambled' | Exclude<StageId, 'yellow-corners-orient'>

export const RESCUE_PICKS: readonly RescuePick[] = ['scrambled', ...(STAGE_IDS.slice(0, 7) as Exclude<StageId, 'yellow-corners-orient'>[])]

const CENTRES: readonly PieceId[] = ['U', 'D', 'F', 'B', 'R', 'L']

/** The white cross and the white corners are built underneath: those pictures look from below. */
const FROM_BELOW = new Set<string>(['white-cross', 'white-corners'])

export interface StagePicture {
  state: CubeState
  /** The pieces to light (what is solved); the rest is greyed. Null: all lit. */
  lit: PieceId[] | null
  /** Look at it from underneath. */
  below: boolean
}

/**
 * The example cube after a stage — the same cube all the way down the path, scrambled at the
 * start — with only what is solved lit up. Shared by the Learn map and the picture chooser.
 */
export function stagePicture(stage: StageId | 'scrambled'): StagePicture {
  if (stage === 'scrambled') return { state: scrambledShowcase(), lit: [...CENTRES], below: false }
  const state = afterStageState(stage)
  if (stage === 'yellow-corners-orient') return { state, lit: null, below: false }
  const analysis = analyzeCube(state)
  const lit = new Set<PieceId>(CENTRES)
  for (const id of analysis.completed) for (const piece of analysis.stages[id].donePieces) lit.add(piece)
  // The daisy's petals are not "solved", but they are the stage's work: light them.
  if (stage === 'daisy') for (const piece of analysis.stages.daisy.donePieces) lit.add(piece)
  return { state, lit: [...lit], below: FROM_BELOW.has(stage) }
}

/** The quick checks that the pictured stage really is whole on his cube. */
const CHECKS: Record<RescuePick, readonly string[]> = {
  scrambled: [],
  daisy: ['On top: four **white** edges round the yellow centre, like petals?'],
  'white-cross': ['Underneath: a **white cross**?', 'Each arm of the cross: does its side sticker match the centre just above it?'],
  'white-corners': ['Underneath: **all white**?', 'Round the sides, just above the bottom: a **stripe** of matching colours all the way round?'],
  'middle-layer': ['Every side: the bottom **two rows** one colour, matching the centre?'],
  'yellow-cross': ['On top: a **yellow cross**? (Ignore the corners.)', 'The bottom two layers still whole?'],
  'yellow-edges': ['Each arm of the yellow cross: does its side sticker match the centre below it?'],
  'yellow-corners-position': [
    'Every top corner: are its three colours the colours of the three centres round it? (Twisted is fine.)',
    'Or are you in the middle of the final twist, with the bottom scrambled? That is this picture too.',
  ],
}

export interface RescueRoute {
  pick: RescuePick
  /** "Stage 3 done: White corners" — what the picture shows. */
  label: string
  /** Checks to make on his cube before going on (none for a cube that is just scrambled). */
  checks: readonly string[]
  /** The stage to work on now. */
  next: StageId
  nextNumber: number
  nextTitle: string
  /** Where "carry on" goes: the lesson and beat of its real-cube step, and of its practice cubes. */
  cube: { lesson: StageId; beat: 'cube' }
  drill: { lesson: StageId; beat: 'drill' }
  /** The picture one stage earlier, for "not quite". Null for "just scrambled". */
  earlier: RescuePick | null
}

export function rescueLabel(pick: RescuePick): string {
  if (pick === 'scrambled') return 'Nothing done yet'
  const info = STAGES.find((s) => s.id === pick)!
  return `Stage ${info.number} done: ${info.title}`
}

/** Where a picked picture sends him. */
export function rescueRoute(pick: RescuePick): RescueRoute {
  const index = RESCUE_PICKS.indexOf(pick)
  const next = STAGE_IDS[index] // the stage after the pictured one ("scrambled" → stage 1)
  const info = STAGES.find((s) => s.id === next)!
  return {
    pick,
    label: rescueLabel(pick),
    checks: CHECKS[pick],
    next,
    nextNumber: info.number,
    nextTitle: info.title,
    cube: { lesson: next, beat: 'cube' },
    drill: { lesson: next, beat: 'drill' },
    earlier: index > 0 ? RESCUE_PICKS[index - 1] : null,
  }
}
