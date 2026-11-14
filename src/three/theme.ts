import { SCENE_THEME, type ResolvedTheme } from '../ui'
import type { ViewTheme } from './view'

/**
 * Everything the 3D scene needs to know about a theme. Sticker and body colours come from the
 * design system (`SCENE_THEME`, mirrored from tokens.css); the few scene-only values live here.
 *
 * Dimming (a highlight's "everything else"): a dimmed sticker keeps its hue but loses most of
 * its chroma and moves towards the stage's neutral (`dimNeutral`): pastel on the light stage,
 * a deep tint on the dark one. Red, orange and yellow stay three different colours. While
 * something is dimmed, the lit stickers (not the centres) are `litBoost` brighter.
 */
const EXTRA: Record<ResolvedTheme, Omit<ViewTheme, 'body' | 'stickers' | 'ambient' | 'key'>> = {
  light: {
    // Unpainted: a dark, recessed slot with a dashed ring, never mistaken for white.
    blank: '#5e5b55',
    blankMark: '#d9d5cb',
    // The outline round lit stickers: the action blue, so a lit WHITE sticker is marked too
    // (a white ring vanished against it — learning review 2, SF4).
    ring: '#2664ec',
    // Guide arrows: the action blue, a white inner stroke and a thin dark outline, so they
    // read on all six sticker colours (blue on blue is separated by the white stroke).
    arrow: '#2664ec',
    arrowStroke: '#ffffff',
    arrowOutline: '#101114',
    // A touch deeper than paper (it was #d9d5cb), so a lit WHITE sticker still outshines the
    // dimmed pastels around it (learning review 2, SF4); colours stay soft pastels.
    dimNeutral: '#c9c4b8',
    dimMix: 0.6,
    dimSaturation: 0.5,
    // White has no hue to keep: dimmed, it drops to a clear mid grey, so a LIT white sticker
    // (paper white) never looks like the pale dimmed ones (learning review 2).
    dimWhite: '#938f86',
    litBoost: 0,
    dimGrey: '#b9b5ab',
    shadow: '#3a3020',
    shadowOpacity: 0.34,
    labelInk: '#ffffff',
    labelPaper: 'rgba(23, 24, 28, 0.9)',
  },
  dark: {
    blank: '#232731',
    blankMark: '#8a91a3',
    ring: '#ffffff',
    arrow: '#4f8dff',
    arrowStroke: '#ffffff',
    arrowOutline: '#05060a',
    // At night the lit piece must jump out (design review 2, N4): dimmed stickers sink most of
    // the way to the desk and keep only a tint of their hue, and the lit ones shine a little.
    dimNeutral: '#3a3f4b',
    dimMix: 0.7,
    dimSaturation: 0.38,
    dimWhite: '#5f636d',
    litBoost: 0.12,
    dimGrey: '#454a56',
    shadow: '#000000',
    shadowOpacity: 0.62,
    labelInk: '#ffffff',
    labelPaper: 'rgba(5, 6, 10, 0.88)',
  },
}

const cache = new Map<ResolvedTheme, ViewTheme>()

export function viewTheme(resolved: ResolvedTheme): ViewTheme {
  let theme = cache.get(resolved)
  if (!theme) {
    const scene = SCENE_THEME[resolved]
    theme = { ...EXTRA[resolved], body: scene.body, stickers: scene.stickers, ambient: scene.ambient, key: scene.key }
    cache.set(resolved, theme)
  }
  return theme
}
