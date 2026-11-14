/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrast, readTheme, TEXT_PAIRS } from './contrast'

const css = readFileSync(fileURLToPath(new URL('./styles/tokens.css', import.meta.url)), 'utf8')

it('reads every token it measures', () => {
  expect(Object.keys(readTheme(css, 'light')).length).toBeGreaterThan(40)
  expect(Object.keys(readTheme(css, 'dark')).length).toBeGreaterThan(40)
})

describe.each(['light', 'dark'] as const)('%s theme contrast', (theme) => {
  const tokens = readTheme(css, theme)
  it.each(TEXT_PAIRS.map(([fg, bg, min]) => [`${fg} on ${bg}`, fg, bg, min] as const))('%s meets AA', (_name, fg, bg, min) => {
    expect(tokens[fg], `--${fg}`).toMatch(/^#[0-9a-f]{6}$/i)
    expect(tokens[bg], `--${bg}`).toMatch(/^#[0-9a-f]{6}$/i)
    expect(Number(contrast(tokens[fg], tokens[bg]).toFixed(2))).toBeGreaterThanOrEqual(min)
  })
})
