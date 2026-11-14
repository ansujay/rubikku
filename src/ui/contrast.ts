/**
 * WCAG contrast for the design tokens. `TEXT_PAIRS` is the documented list of text-on-surface
 * pairs the app uses; contrast.test.ts measures every one in both themes against tokens.css and
 * fails if any drops below AA (4.5:1). Large/graphic pairs (icons on stickers) need 3:1.
 */
export type ThemeName = 'light' | 'dark'

/** [text token, background token, minimum ratio]. */
export const TEXT_PAIRS: readonly [string, string, number][] = [
  ...['bg', 'surface', 'surface-2', 'inset'].flatMap((bg): [string, string, number][] => [
    ['ink', bg, 4.5],
    ['ink-muted', bg, 4.5],
    ['ink-faint', bg, 4.5],
  ]),
  ['ink-inverse', 'ink', 4.5],
  ['accent-ink', 'accent', 4.5],
  ['accent-text', 'surface', 4.5],
  ['accent-text', 'bg', 4.5],
  ['accent-text', 'accent-soft', 4.5],
  ['on-green', 'cube-green', 4.5],
  ['on-red', 'cube-red', 4.5],
  ['on-yellow', 'cube-yellow', 4.5],
  ['on-orange', 'cube-orange', 4.5],
  ['on-yellow', 'cube-white', 4.5],
  ...['green', 'yellow', 'red', 'orange', 'blue', 'white'].flatMap((c): [string, string, number][] => [
    [`cube-${c}-text`, 'surface', 4.5],
    [`cube-${c}-text`, 'bg', 4.5],
    [`cube-${c}-text`, `cube-${c}-soft`, 4.5],
  ]),
  // Graphics: a tick on a done stage, the focus ring.
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
]

/** Read `--name: #hex` declarations for one theme block of tokens.css (resolving `var()` aliases). */
export function readTheme(css: string, theme: ThemeName): Record<string, string> {
  const block = theme === 'light' ? /:root,\s*\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/.exec(css) : /\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/.exec(css)
  const out: Record<string, string> = {}
  if (!block) return out
  for (const match of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[match[1]] = match[2].trim()
  for (const key of Object.keys(out)) {
    let value = out[key]
    for (let i = 0; i < 4; i++) {
      const alias = /^var\(--([\w-]+)\)$/.exec(value)
      if (!alias) break
      value = out[alias[1]] ?? value
    }
    out[key] = value
  }
  return out
}

const channel = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return NaN
  const n = parseInt(m[1], 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
