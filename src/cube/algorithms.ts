/**
 * The algorithms of the beginner method, as data for lessons, algorithm cards and the solver.
 *
 * Every algorithm is written for the beginner hold (`BEGINNER_HOLD`): yellow centre on top,
 * white centre on the bottom. "Front", "right" and so on mean the faces as you look at the cube.
 */
import { algToString, invertAlg, parseAlg, type Move } from './notation'
import type { StageId } from './stages'

export interface BeginnerAlgorithm {
  /** Stable id, e.g. "right-trigger". */
  id: string
  /** Display name. */
  name: string
  /** The stage of the method this belongs to. */
  stage: StageId
  /** The moves as notation text. */
  alg: string
  /** The same moves, parsed. */
  moves: readonly Move[]
  /** When to use it — the situation on the cube, in one sentence. */
  when: string
  /** What it does, in one sentence. */
  does: string
  /** Present when the algorithm is meant to be repeated: how to know when to stop. */
  repeat?: string
  /** A way to remember it. */
  mnemonic: string
  /** Which fingers do what. */
  fingerHint: string
  /**
   * A ready-made demonstration: start from a solved cube in the beginner hold, apply `setup`,
   * then play `alg` — the cube ends solved again. (`alg` may be the algorithm repeated, or
   * combined with a top-layer turn, to show a complete use.)
   */
  demo: { setup: string; alg: string }
}

interface Spec extends Omit<BeginnerAlgorithm, 'moves' | 'demo'> {
  /** Demonstration moves if different from `alg`. */
  demoAlg?: string
}

function define(spec: Spec): BeginnerAlgorithm {
  const { demoAlg, ...rest } = spec
  const demo = algToString(parseAlg(demoAlg ?? spec.alg))
  return { ...rest, moves: parseAlg(spec.alg), demo: { setup: algToString(invertAlg(demo)), alg: demo } }
}

export const ALGORITHMS: readonly BeginnerAlgorithm[] = [
  define({
    id: 'white-cross-drop',
    name: 'Petal Drop',
    stage: 'white-cross',
    alg: 'F2',
    when: 'A white petal of the daisy sits above the centre that matches its side colour.',
    does: 'Sends that white edge straight down to the white face, exactly where it belongs.',
    mnemonic: 'Match the side colour, then flip it down: front face, twice.',
    fingerHint: 'Turn the front face a half turn with your right hand — two quarter turns the same way.',
  }),
  define({
    id: 'right-trigger',
    name: 'Right Trigger',
    stage: 'white-corners',
    alg: "R U R' U'",
    when: 'Any time you need to take a piece out of the front-right corner or put one in. It is the most useful four moves in cubing.',
    does: 'Swaps the corner above the front-right slot with the corner in it, leaving the rest of the bottom layer alone. Do it six times and the cube is back where it started.',
    mnemonic: 'Up, over, down, back.',
    fingerHint: 'Right hand turns the right side up (R). Right index finger flicks the top (U). Right hand comes back down (R\'). Left index finger pushes the top back (U\').',
  }),
  define({
    id: 'left-trigger',
    name: 'Left Trigger',
    stage: 'white-corners',
    alg: "L' U' L U",
    when: 'The same job as the right trigger, but for the front-left corner.',
    does: 'Swaps the corner above the front-left slot with the corner in it — the mirror image of the right trigger.',
    mnemonic: 'Up, over, down, back — with your left hand.',
    fingerHint: 'Left hand turns the left side up (L\'). Left index finger flicks the top (U\'). Left hand comes back down (L). Right index finger pushes the top back (U).',
  }),
  define({
    id: 'white-corner-insert',
    name: 'White Corner Insert',
    stage: 'white-corners',
    alg: "R U R' U'",
    repeat: 'Repeat until the corner drops into the front-right slot with white facing down (1 to 5 times).',
    when: 'A white corner is in the top layer directly above the slot where it belongs (front-right), or it is in that slot but twisted.',
    does: 'Each round moves the corner between the top and the slot and twists it; within five rounds it lands correctly, without disturbing the white cross or the other white corners.',
    mnemonic: 'Park it above its home, then: up, over, down, back — until it fits.',
    fingerHint: 'Keep your right hand on the right side the whole time; only your index fingers touch the top.',
    demoAlg: "(R U R' U')3",
  }),
  define({
    id: 'white-corner-right',
    name: 'Corner In: White Facing Right',
    stage: 'white-corners',
    alg: "R U R'",
    when: 'The white corner is above its slot (front-right) and its white sticker faces right.',
    does: 'Drops the corner into the slot in one go, white facing down.',
    mnemonic: 'White on the right? Right side up, top over, right side down.',
    fingerHint: 'Right hand up, right index finger flicks the top, right hand down.',
  }),
  define({
    id: 'white-corner-front',
    name: 'Corner In: White Facing Front',
    stage: 'white-corners',
    alg: "F' U' F",
    when: 'The white corner is above its slot (front-right) and its white sticker faces you.',
    does: 'Drops the corner into the slot in one go, white facing down.',
    mnemonic: 'White at the front? Front opens, top slides away, front closes.',
    fingerHint: 'Right thumb pulls the front face open (F\'), left index finger pushes the top (U\'), then close the front again (F).',
  }),
  define({
    id: 'white-corner-top',
    name: 'Corner In: White Facing Up',
    stage: 'white-corners',
    alg: "R U2 R' U' R U R'",
    when: 'The white corner is above its slot (front-right) and its white sticker faces up.',
    does: 'Turns the corner so white faces sideways, then drops it into the slot.',
    mnemonic: 'White on top takes two trips: one to tip it over, one to put it in.',
    fingerHint: 'Right hand does every R; your right index finger double-flicks the top for U2.',
  }),
  define({
    id: 'middle-right',
    name: 'Middle Edge to the Right',
    stage: 'middle-layer',
    alg: "U R U' R' U' F' U F",
    when: 'An edge with no yellow is in the top layer at the front, its front sticker matches the front centre, and it belongs in the slot to the right.',
    does: 'Moves that top-front edge down into the front-right slot of the middle layer, keeping the whole white layer solved.',
    mnemonic: 'Top goes away from the slot first. Then: right trigger, turn, left-style trigger on the front.',
    fingerHint: 'First half with your right hand (U R U\' R\'), then the front face with your right thumb and index finger (U\' F\' U F).',
  }),
  define({
    id: 'middle-left',
    name: 'Middle Edge to the Left',
    stage: 'middle-layer',
    alg: "U' L' U L U F U' F'",
    when: 'An edge with no yellow is in the top layer at the front, its front sticker matches the front centre, and it belongs in the slot to the left.',
    does: 'Moves that top-front edge down into the front-left slot of the middle layer, keeping the whole white layer solved.',
    mnemonic: 'The mirror of the right-hand version: top goes away from the slot first, then left hand, then the front.',
    fingerHint: 'First half with your left hand (U\' L\' U L), then the front face (U F U\' F\').',
  }),
  define({
    id: 'yellow-cross',
    name: 'Yellow Cross',
    stage: 'yellow-cross',
    alg: "F R U R' U' F'",
    repeat: 'From a single yellow dot you need it three times; from an L shape twice; from a line once.',
    when: 'The first two layers are done and the top does not show a yellow cross yet. Hold an L shape in the back-left corner, or a line going left to right.',
    does: 'Flips two yellow edges on the top, stepping from dot to L to line to cross, without breaking the first two layers.',
    mnemonic: 'Front, then a right trigger, then front back: F (R U R\' U\') F\'.',
    fingerHint: 'Right index finger or thumb turns the front (F), do the right trigger, then turn the front back (F\').',
  }),
  define({
    id: 'sune',
    name: 'Sune',
    stage: 'yellow-edges',
    alg: "R U R' U R U2 R'",
    when: 'The yellow cross is made but its edges do not all match the side centres.',
    does: 'Moves three of the yellow-cross edges round one place each — the front edge stays put — while the cross stays yellow and the first two layers stay solved.',
    mnemonic: 'Up, over, down, over, up, over-over, down. The right side goes up three times and comes down three times.',
    fingerHint: 'Your right hand never leaves the right side; your right index finger does every U, with a double flick for U2.',
  }),
  define({
    id: 'yellow-edge-swap',
    name: 'Edge Swap',
    stage: 'yellow-edges',
    alg: "R U R' U R U2 R' U",
    when: 'Two yellow-cross edges next to each other need to trade places. Hold them at the front and on the left.',
    does: 'Swaps the front and left edges of the yellow cross and leaves the back and right edges where they are.',
    mnemonic: 'Sune, plus one more turn of the top.',
    fingerHint: 'Same as Sune, then one last flick of the top with your right index finger.',
  }),
  define({
    id: 'corner-cycle',
    name: 'Corner Cycle',
    stage: 'yellow-corners-position',
    alg: "U R U' L' U R' U' L",
    repeat: 'If the other three corners are still not in their places, do it once more.',
    when: 'The yellow edges match, but the yellow corners are in the wrong places. Hold a corner that is already in the right place (even if twisted) at the front-right.',
    does: 'Moves the other three top corners round in a circle and leaves the front-right corner and every edge untouched.',
    mnemonic: 'Top, right up, top, left up — top, right down, top, left down.',
    fingerHint: 'Both hands hold the sides: right hand does R and R\', left hand does L\' and L, index fingers turn the top in between.',
  }),
  define({
    id: 'corner-twist',
    name: 'Corner Twist',
    stage: 'yellow-corners-orient',
    alg: "R' D' R D",
    repeat: 'Repeat until the front-right top corner shows yellow on top (2 or 4 times). Then turn only the top (U) to bring the next twisted corner to the front-right and repeat.',
    when: 'Every piece is in the right place, but some yellow corners are twisted. Hold a twisted corner at the front-right of the top.',
    does: 'Twists the front-right top corner. The bottom layers look scrambled in between, but they come back by themselves once every corner has been twisted.',
    mnemonic: 'Down, left, up, right — the right trigger turned upside down. Never rotate the whole cube, only the top.',
    fingerHint: 'Right hand pulls the right side down (R\') and pushes it back up (R); left ring finger turns the bottom (D\' and D).',
    demoAlg: "(R' D' R D)2 U (R' D' R D)4 U'",
  }),
]

/** Look a beginner-method algorithm up by id. */
export function getAlgorithm(id: string): BeginnerAlgorithm | undefined {
  return ALGORITHMS.find((a) => a.id === id)
}

/** The algorithms taught in a stage, in teaching order. */
export function algorithmsForStage(stage: StageId): BeginnerAlgorithm[] {
  return ALGORITHMS.filter((a) => a.stage === stage)
}
