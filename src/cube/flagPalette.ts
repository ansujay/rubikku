/**
 * DOCUMENTED EXCEPTION to "no raw hex in features": a flag is a picture of a real object, like
 * the cube net, so it uses the nations' own colours. They live here and nowhere else, are the
 * same in light and dark, and never carry UI meaning. Everything else in FlagArt uses tokens.
 */
export const FLAG_PALETTE = {
  white: '#ffffff',
  red: '#d21034',
  crimson: '#aa151b',
  blue: '#0a4aa6',
  navy: '#002776',
  skyBlue: '#4aadd6',
  chakraBlue: '#06038d',
  green: '#00853f',
  darkGreen: '#006a4e',
  brazilGreen: '#009c3b',
  yellow: '#fecc02',
  brazilYellow: '#ffdf00',
  orange: '#ff883e',
  saffron: '#ff9933',
  apricot: '#f2a800',
} as const

export type FlagPaletteName = keyof typeof FLAG_PALETTE

/** A palette name (preferred) or any CSS colour. */
export type FlagColor = FlagPaletteName | (string & {})

/**
 * What a flag looks like, declaratively. Flags are drawn 3:2 (30x20); `square` flags sit in the middle.
 *  - bands: stripes (`dir` 'h' = stacked, 'v' = side by side), optional `ratios`, plus a centred
 *    `disc` (Laos) or a `chakra` ring with spokes (India).
 *  - disc: plain field with a round disc; `offset` shifts it along the flag's width
 *    (negative = towards the hoist, e.g. Palau -0.05); `r` is the radius as a fraction of height.
 *  - cross: `nordic` puts the cross off-centre towards the hoist; `short` stops the arms short of
 *    the edge (Switzerland, with `square`).
 *  - saltire: diagonal cross (Scotland).
 *  - brazil: green field, yellow diamond, blue globe with its white band.
 */
export type FlagArtSpec =
  | { kind: 'bands'; dir: 'h' | 'v'; colors: FlagColor[]; ratios?: number[]; disc?: FlagColor; chakra?: FlagColor }
  | { kind: 'disc'; field: FlagColor; disc: FlagColor; offset?: number; r?: number }
  | { kind: 'cross'; field: FlagColor; cross: FlagColor; nordic?: boolean; short?: boolean; square?: boolean }
  | { kind: 'saltire'; field: FlagColor; cross: FlagColor }
  | { kind: 'brazil' }

