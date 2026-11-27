/**
 * Flags you can make on the front face of a cube: hold the solved cube a certain way, do a few
 * moves, and the front shows the flag. Every entry was found and proven shortest by `faceSearch`
 * (see `__tests__/flags.test.ts`); nothing is computed at runtime.
 *
 * The art specs live here too, so there is one list of flags. `FlagArtSpec` is a plain data type
 * (in `flagPalette.ts`), which keeps `src/cube` free of any UI imports.
 */
import type { Color } from './geometry'
import type { FaceGrid } from './faceSearch'
import type { FlagArtSpec } from './flagPalette'
import { CUBE_ROTATIONS } from './moves'
import { parseAlg, type Move, type RotationMove } from './notation'

export type FlagFamily = 'stripes' | 'dots' | 'crosses'

export interface CubeFlag {
  id: `flag-${string}`
  name: string
  family: FlagFamily
  /** The front face, row by row. */
  grid: FaceGrid
  /** How to hold the solved cube first: one entry of `CUBE_ROTATIONS`. */
  hold: readonly RotationMove[]
  /** The moves as notation text, done as held. The flag ends upright on F. */
  alg: string
  moves: readonly Move[]
  /** 1 (short) to 3 (long, follow along carefully). */
  difficulty: 1 | 2 | 3
  /** One or two sentences for an 11-year-old. */
  description: string
  /** What the cube has to fake, e.g. "Orange stands in for apricot." */
  standIns?: string
  /** Another flag with the same nine stickers. */
  alsoLooksLike?: string
  /** The real flag, as data for `FlagArt`. */
  art: FlagArtSpec
}

export const FLAG_FAMILIES: readonly { id: FlagFamily; name: string; blurb: string }[] = [
  { id: 'stripes', name: 'Stripes', blurb: 'Bands of colour, across or down.' },
  { id: 'dots', name: 'Dots', blurb: 'One round spot in the middle.' },
  { id: 'crosses', name: 'Crosses', blurb: 'A cross or a plus across the face.' },
]

const LETTER: Record<string, Color> = { W: 'white', Y: 'yellow', R: 'red', O: 'orange', B: 'blue', G: 'green' }

/** "GWG GWG GWG" -> nine colours, rows top to bottom. */
function grid(text: string): FaceGrid {
  return text.replace(/\s/g, '').split('').map((c) => LETTER[c]) as unknown as FaceGrid
}

/** The `CUBE_ROTATIONS` entry written as text ("x2 z"), so a typo fails loudly. */
function holdFor(text: string): readonly RotationMove[] {
  const hold = CUBE_ROTATIONS.find((h) => h.join(' ') === text)
  if (!hold) throw new Error(`No cube rotation "${text}"`)
  return hold
}

interface FlagInput {
  name: string
  family: FlagFamily
  grid: string
  hold: string
  alg: string
  description: string
  art: FlagArtSpec
  standIns?: string
  alsoLooksLike?: string
}

function flag(input: FlagInput): CubeFlag {
  const moves = parseAlg(input.alg)
  const { grid: gridText, hold, ...rest } = input
  return {
    ...rest,
    id: `flag-${input.name.toLowerCase()}`,
    grid: grid(gridText),
    hold: holdFor(hold),
    moves,
    difficulty: moves.length <= 2 ? 1 : moves.length <= 4 ? 2 : 3,
  }
}

const stripes = (dir: 'h' | 'v', colors: string[], ratios?: number[]): FlagArtSpec => ({ kind: 'bands', dir, colors, ratios })

export const FLAGS: readonly CubeFlag[] = [
  // --- Stripes -------------------------------------------------------------------------------
  flag({
    name: 'Nigeria', family: 'stripes', grid: 'GWG GWG GWG', hold: '', alg: 'M',
    description: 'Green, white, green: one turn of the middle slice and you are done. The perfect first flag!',
    art: stripes('v', ['green', 'white', 'green']),
  }),
  flag({
    name: 'Peru', family: 'stripes', grid: 'RWR RWR RWR', hold: 'y', alg: 'M',
    description: 'Same single move as Nigeria, just held with red facing you. Two flags for one turn!',
    standIns: 'No coat of arms in the middle.',
    art: stripes('v', ['red', 'white', 'red']),
  }),
  flag({
    name: 'Austria', family: 'stripes', grid: 'RRR WWW RRR', hold: "x'", alg: 'U D\'',
    description: 'Red, white, red in bands. Turn the top one way and the bottom the other, and the stripes appear.',
    art: stripes('h', ['red', 'white', 'red']),
  }),
  flag({
    name: 'Spain', family: 'stripes', grid: 'RRR YYY RRR', hold: 'x', alg: 'U D\'',
    description: 'Same moves as Austria! Hold the yellow side to the front and you get a sunny Spanish stripe.',
    standIns: 'Three equal bands, and no coat of arms.',
    art: stripes('h', ['crimson', 'yellow', 'crimson'], [1, 2, 1]),
  }),
  flag({
    name: 'Armenia', family: 'stripes', grid: 'RRR BBB OOO', hold: 'x2', alg: 'U D',
    description: 'Red, blue and orange from top to bottom. Turn the top and bottom layers the same way and it pops out.',
    standIns: 'Orange stands in for apricot.',
    art: stripes('h', ['red', 'blue', 'apricot']),
  }),
  flag({
    name: 'France', family: 'stripes', grid: 'BWR BWR BWR', hold: "x'", alg: "U F' R2 F2 L",
    description: 'Blue, white and red stripes, one of the most famous flags. Five turns, and the next two flags are nearly the same!',
    art: stripes('v', ['blue', 'white', 'red']),
  }),
  flag({
    name: 'Italy', family: 'stripes', grid: 'GWR GWR GWR', hold: "x'", alg: "U F' R2 F2 L'",
    description: 'Almost the same as France: only the very last turn goes the other way. Green, white and red, buon appetito!',
    art: stripes('v', ['green', 'white', 'red']),
  }),
  flag({
    name: 'Ireland', family: 'stripes', grid: 'GWO GWO GWO', hold: 'x y2', alg: "U F' R2 F2 L",
    description: 'Same moves as France, just hold the cube with green on top. Green, white and orange, easy as that!',
    art: stripes('v', ['green', 'white', 'orange']),
  }),
  flag({
    name: 'Netherlands', family: 'stripes', grid: 'RRR WWW BBB', hold: "x'", alg: "L F' U2 B U'",
    description: 'Red, white and blue bands. Five moves, and the same ones will make Colombia too.',
    alsoLooksLike: 'Luxembourg',
    art: stripes('h', ['red', 'white', 'blue']),
  }),
  flag({
    name: 'Colombia', family: 'stripes', grid: 'YYY BBB RRR', hold: 'x2 z', alg: "L' F' U2 B U'",
    description: 'Almost the same moves as the Netherlands, but the first turn goes the other way. Yellow, blue, red!',
    standIns: 'Three equal bands (the real yellow band is twice as tall).',
    art: stripes('h', ['yellow', 'blue', 'red'], [2, 1, 1]),
  }),
  flag({
    name: 'India', family: 'stripes', grid: 'OOO WBW GGG', hold: 'y2', alg: "R' D2 U B' L",
    description: 'Orange on top, white in the middle, green below. The blue centre sticker plays the Ashoka wheel!',
    standIns: 'Orange stands in for saffron; the blue centre is the chakra wheel.',
    art: { kind: 'bands', dir: 'h', colors: ['saffron', 'white', 'green'], chakra: 'chakraBlue' },
  }),
  // --- Dots ----------------------------------------------------------------------------------
  flag({
    name: 'Japan', family: 'dots', grid: 'WWW WRW WWW', hold: "x'", alg: "M S M'",
    description: 'A red dot on white, made by three slice moves. Learn this trick: it works for lots of dot flags!',
    art: { kind: 'disc', field: 'white', disc: 'red' },
  }),
  flag({
    name: 'Bangladesh', family: 'dots', grid: 'GGG GRG GGG', hold: '', alg: "M S M'",
    description: 'Same moves as Japan! A red circle on a green field, just held with green facing you.',
    standIns: 'The red disc sits in the exact centre.',
    art: { kind: 'disc', field: 'darkGreen', disc: 'red', offset: -0.05, r: 0.33 },
  }),
  flag({
    name: 'Palau', family: 'dots', grid: 'BBB BYB BBB', hold: 'x2 z', alg: "M S M'",
    description: 'A sunny yellow moon on a blue sea. Same moves as Japan and Bangladesh, with blue facing you!',
    standIns: 'The yellow disc sits in the centre (on the real flag it is a little off to the side).',
    art: { kind: 'disc', field: 'skyBlue', disc: 'yellow', offset: -0.05 },
  }),
  flag({
    name: 'Laos', family: 'dots', grid: 'RRR BWB RRR', hold: "x'", alg: "R' L U D'",
    description: 'Red, blue, red with a white moon in the middle. Four turns and your cube looks like Laos!',
    standIns: 'The blue band is no taller than the red ones (the real one is twice as tall).',
    art: { kind: 'bands', dir: 'h', colors: ['red', 'blue', 'red'], ratios: [1, 2, 1], disc: 'white' },
  }),
  // --- Crosses -------------------------------------------------------------------------------
  flag({
    name: 'Switzerland', family: 'crosses', grid: 'RWR WWW RWR', hold: "x'", alg: "M' D' M2 U M'",
    description: 'A white plus on red. Learn these five moves and three more cross flags are yours.',
    alsoLooksLike: 'Denmark',
    art: { kind: 'cross', field: 'red', cross: 'white', short: true, square: true },
  }),
  flag({
    name: 'England', family: 'crosses', grid: 'WRW RRR WRW', hold: 'x y', alg: "M' D' M2 U M'",
    description: 'The red cross of St George on white. Same moves as Switzerland, just a different hold!',
    art: { kind: 'cross', field: 'white', cross: 'red' },
  }),
  flag({
    name: 'Sweden', family: 'crosses', grid: 'BYB YYY BYB', hold: 'x z', alg: "M U' M2 D M",
    description: 'A golden cross on blue. The moves look like the Switzerland ones, but flipped upside down!',
    standIns: 'The cross is in the centre (the real one sits closer to the pole).',
    art: { kind: 'cross', field: 'blue', cross: 'yellow', nordic: true },
  }),
  flag({
    name: 'Finland', family: 'crosses', grid: 'WBW BBB WBW', hold: 'x2 z', alg: "M U' M2 D M",
    description: 'A blue cross on snowy white. Same moves as Sweden, just hold the blue side to the front.',
    standIns: 'The cross is in the centre (the real one sits closer to the pole).',
    art: { kind: 'cross', field: 'white', cross: 'blue', nordic: true },
  }),
  flag({
    name: 'Scotland', family: 'crosses', grid: 'WBW BWB WBW', hold: 'x2 z', alg: "M S' U' M2 D M",
    description: 'The white X of St Andrew on blue. It is the Finland moves with one extra slice turn.',
    art: { kind: 'saltire', field: 'blue', cross: 'white' },
  }),
  flag({
    name: 'Brazil', family: 'crosses', grid: 'GYG YBY GYG', hold: 'z2', alg: "M F' U M2 U' M'",
    description: 'Green, a yellow diamond and a blue globe, the trickiest flag here. Six moves, take your time.',
    standIns: 'The yellow edges are the diamond; the blue centre is the globe.',
    art: { kind: 'brazil' },
  }),
]

const BY_ID = new Map(FLAGS.map((f) => [f.id as string, f]))

export function getFlag(id: string): CubeFlag | undefined {
  return BY_ID.get(id)
}

export interface LeftOutFlag {
  name: string
  /** A kid-friendly reason a cube cannot show it. */
  reason: string
}

/** Flags a cube cannot show, for a "Why isn't my flag here?" note. */
export const LEFT_OUT_FLAGS: readonly LeftOutFlag[] = [
  { name: 'Germany', reason: "It has a black stripe, and a cube has no black stickers." },
  { name: 'Belgium', reason: "It has a black stripe, and a cube has no black stickers." },
  { name: 'Estonia', reason: "It has a black stripe, and a cube has no black stickers." },
  { name: 'Jamaica', reason: "It has black in it, and a cube has no black stickers." },
  { name: 'Poland', reason: "Two equal bands can't be split across three rows." },
  { name: 'Ukraine', reason: "Two equal bands can't be split across three rows." },
  { name: 'Indonesia', reason: "Two equal bands can't be split across three rows." },
  { name: 'United Kingdom', reason: "The Union Jack has too much detail for nine stickers." },
  { name: 'United States', reason: "Fifty stars and thirteen stripes won't fit on nine stickers." },
  { name: 'Canada', reason: "The maple leaf is too detailed for nine stickers." },
]
