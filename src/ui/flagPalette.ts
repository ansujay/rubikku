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
