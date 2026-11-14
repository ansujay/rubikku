/**
 * The six cube colours as a typed accent system. Classes are written out in full so
 * Tailwind can see them. `tone` adds the UI's neutral and the action accent (blue).
 */
import type { CubeColor } from '../store/stages'

export type { CubeColor }
export const CUBE_COLORS: readonly CubeColor[] = ['white', 'yellow', 'green', 'blue', 'red', 'orange']

export const CUBE_COLOR_LETTER: Record<CubeColor, string> = {
  white: 'W',
  yellow: 'Y',
  green: 'G',
  blue: 'B',
  red: 'R',
  orange: 'O',
}

export const CUBE_COLOR_NAME: Record<CubeColor, string> = {
  white: 'White',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  red: 'Red',
  orange: 'Orange',
}

/** Standard scheme (PLAN.md): U white, D yellow, F green, B blue, R red, L orange. */
export type Face = 'U' | 'D' | 'F' | 'B' | 'R' | 'L'
export const FACE_COLOR: Record<Face, CubeColor> = {
  U: 'white',
  D: 'yellow',
  F: 'green',
  B: 'blue',
  R: 'red',
  L: 'orange',
}
/** Everyday names, the same words the lessons and the engine use: U is the *top* face. */
export const FACE_NAME: Record<Face, string> = {
  U: 'top',
  D: 'bottom',
  F: 'front',
  B: 'back',
  R: 'right',
  L: 'left',
}

interface ColorClasses {
  /** Solid sticker fill. */
  solid: string
  /** Text colour to use on top of `solid`. */
  onSolid: string
  /** Tinted background. */
  soft: string
  /** Readable text in this colour on surfaces (AA). */
  text: string
  /** The darker keycap edge. */
  edge: string
  /** CSS variable holding the solid colour, e.g. for SVG fills. */
  cssVar: string
}

export const CUBE_CLASSES: Record<CubeColor, ColorClasses> = {
  white: { solid: 'bg-cube-white', onSolid: 'text-on-yellow', soft: 'bg-cube-white-soft', text: 'text-cube-white-text', edge: 'bg-cube-white-edge', cssVar: 'var(--cube-white)' },
  yellow: { solid: 'bg-cube-yellow', onSolid: 'text-on-yellow', soft: 'bg-cube-yellow-soft', text: 'text-cube-yellow-text', edge: 'bg-cube-yellow-edge', cssVar: 'var(--cube-yellow)' },
  green: { solid: 'bg-cube-green', onSolid: 'text-on-green', soft: 'bg-cube-green-soft', text: 'text-cube-green-text', edge: 'bg-cube-green-edge', cssVar: 'var(--cube-green)' },
  blue: { solid: 'bg-cube-blue', onSolid: 'text-accent-ink', soft: 'bg-cube-blue-soft', text: 'text-cube-blue-text', edge: 'bg-cube-blue-edge', cssVar: 'var(--cube-blue)' },
  red: { solid: 'bg-cube-red', onSolid: 'text-on-red', soft: 'bg-cube-red-soft', text: 'text-cube-red-text', edge: 'bg-cube-red-edge', cssVar: 'var(--cube-red)' },
  orange: { solid: 'bg-cube-orange', onSolid: 'text-on-orange', soft: 'bg-cube-orange-soft', text: 'text-cube-orange-text', edge: 'bg-cube-orange-edge', cssVar: 'var(--cube-orange)' },
}

export type Tone = 'neutral' | 'accent' | CubeColor

export const TONE_CLASSES: Record<Tone, ColorClasses> = {
  ...CUBE_CLASSES,
  neutral: { solid: 'bg-ink', onSolid: 'text-ink-inverse', soft: 'bg-inset', text: 'text-ink-muted', edge: 'bg-line-strong', cssVar: 'var(--ink)' },
  accent: { solid: 'bg-accent', onSolid: 'text-accent-ink', soft: 'bg-accent-soft', text: 'text-accent-text', edge: 'bg-accent-edge', cssVar: 'var(--accent)' },
}
