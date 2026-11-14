#!/usr/bin/env node
/**
 * Screenshots of every state of "Solve my cube", in light and dark, at tablet and phone sizes.
 *
 *   npm run build && npx vite preview --port 4203 &
 *   node e2e/solve.shots.mjs [baseUrl] [--only=entry-guided-top,walk-step] [--out=e2e/screenshots/solve] [--themes=light] [--viewports=tablet] [--fold]
 *
 * --fold keeps the real viewport height (what is on screen before scrolling) instead of the whole page.
 *
 * States are reached by seeding the saved "solve" store, so each shot is one page load.
 */
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const Cube = createRequire(import.meta.url)('cubejs')
const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4203').replace(/\/$/, '')
const OUT = path.resolve(flag('out') ?? 'e2e/screenshots/solve')
const ONLY = flag('only')?.split(',')
const THEMES = flag('themes')?.split(',') ?? ['light', 'dark']
const VIEWPORTS = [
  { name: 'tablet', width: 1024, height: 768, deviceScaleFactor: 1 },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => !flag('viewports') || flag('viewports').split(',').includes(v.name))

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
const SCRAMBLE = "R U F' L2 D B' R2 U' F D2 L' B U2 R' F2 D' L U B2 R"
const after = (alg) => {
  const cube = new Cube()
  cube.move(alg)
  return cube.asString()
}
const STATE = after(SCRAMBLE)
const BLANK = [...SOLVED].map((c, i) => (i % 9 === 4 ? c : '-')).join('')
const set = (cells, index, letter) => cells.slice(0, index) + letter + cells.slice(index + 1)
/** Swap two cubies' stickers in a state string: (facelets a) <-> (facelets b). */
const swap = (cells, a, b) => {
  const out = [...cells]
  a.forEach((fa, i) => {
    out[fa] = cells[b[i]]
    out[b[i]] = cells[fa]
  })
  return out.join('')
}
const half = [...STATE].map((c, i) => (i < 27 || i % 9 === 4 ? c : '-')).join('')
// A cube held yellow-up with the first two layers done (so "where am I?" has something to show).
const CROSS = after("z2 R U R' U R U2 R' F R U R' U' F' U2 R U R' U R U2 R'")

const entry = (extra) => ({ phase: 'entry', intent: 'solve', cells: BLANK, entryMode: 'guided', guidedIndex: 0, ...extra })
const walkAt = (extra) => ({ phase: 'walk', intent: 'solve', cells: STATE, start: STATE, walkMode: 'beginner', pos: { step: 0, move: 0 }, ...extra })

const SHOTS = [
  { name: 'intro', seed: null },
  { name: 'entry-guided-top', seed: entry({ cells: [...BLANK].map((c, i) => (i < 5 ? STATE[i] : c)).join(''), brush: 'red' }) },
  { name: 'entry-guided-back', seed: entry({ cells: half, guidedIndex: 3, brush: 'blue' }) },
  { name: 'entry-guided-bottom', seed: entry({ cells: half, guidedIndex: 5, brush: 'yellow' }) },
  { name: 'entry-free', seed: entry({ cells: half, entryMode: 'free', brush: 'green' }) },
  { name: 'entry-3d', seed: entry({ cells: half, entryMode: 'free', surface: '3d', brush: 'green' }) },
  { name: 'entry-forced', seed: entry({ cells: [...STATE].map((c, i) => ([0, 2, 20, 45, 47, 53].includes(i) ? '-' : c)).join(''), entryMode: 'free' }) },
  { name: 'check-ok', seed: entry({ cells: STATE, entryMode: 'free' }) },
  { name: 'check-typo', seed: entry({ cells: set(STATE, 7, STATE[7] === 'R' ? 'L' : 'R'), entryMode: 'free' }) },
  { name: 'check-impossible', seed: entry({ cells: swap(STATE, [1], [19]), entryMode: 'free' }), open: 1 },
  { name: 'check-over', seed: entry({ cells: set(set(half, 30, 'R'), 28, 'R'), entryMode: 'free' }) },
  { name: 'check-twisted', seed: entry({ cells: swap(swap(SOLVED, [8], [20]), [8], [9]), entryMode: 'free' }) },
  { name: 'check-flipped', seed: entry({ cells: swap(SOLVED, [7], [19]), entryMode: 'free' }) },
  { name: 'check-swapped', seed: entry({ cells: swap(SOLVED, [7, 19], [5, 10]), entryMode: 'free' }) },
  { name: 'where', seed: { phase: 'where', intent: 'solve', cells: CROSS, start: CROSS } },
  { name: 'where-solved', seed: { phase: 'where', intent: 'where', cells: SOLVED, start: SOLVED } },
  { name: 'walk-hold-first', seed: walkAt({}) },
  { name: 'walk-step', seed: walkAt({ pos: { step: 15, move: 2 } }) },
  { name: 'walk-hold', seed: walkAt({ pos: { step: 8, move: 0 } }) },
  { name: 'walk-algorithm', seed: walkAt({ pos: { step: 23, move: 3 } }) },
  { name: 'walk-milestone', seed: walkAt({ pos: { step: 13, move: 2 } }) },
  { name: 'walk-mismatch', seed: walkAt({ pos: { step: 15, move: 2 } }), click: '[data-testid="walk-mismatch"]' },
  { name: 'walk-fastest', seed: walkAt({ walkMode: 'fastest' }), waitFor: '[data-testid="step-card"]', then: 3 },
  { name: 'walk-finished', seed: walkAt({ pos: { step: 999, move: 99 }, rewarded: true }) },
  { name: 'reentry', seed: entry({ cells: after(SCRAMBLE + ' z2 L2'), entryMode: 'free', reentry: true, start: STATE }) },
  // Fingers on a small net: the net is the map, the open face is painted big.
  { name: 'entry-zoom', seed: entry({ cells: half, entryMode: 'free', guidedIndex: 3, brush: 'blue' }), touch: true },
  { name: 'entry-zoom-slip', seed: entry({ cells: set(STATE, 7, STATE[7] === 'R' ? 'L' : 'R'), entryMode: 'free' }), touch: true },
  { name: 'entry-pretend', seed: entry({ cells: STATE, entryMode: 'free', demo: true, demoCells: STATE }) },
  { name: 'entry-guided-full', seed: entry({ cells: STATE, entryMode: 'guided', guidedIndex: 2 }) },
  // The other way of solving asked for in the middle of a step: it waits for the step to end.
  { name: 'walk-pending', seed: walkAt({ pos: { step: 23, move: 3 } }), click: '[role="radio"]:has-text("Fastest way")' },
  // "Where am I?" opened from inside the solution.
  { name: 'where-paused', seed: { ...walkAt({ pos: { step: 23, move: 3 } }), phase: 'where', paused: true } },
].filter((shot) => !ONLY || ONLY.includes(shot.name))

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const problems = []
let count = 0

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const shot of SHOTS) {
      const { name: vpName, ...vp } = viewport
      const context = await browser.newContext({ ...vp, ...(shot.touch ? { hasTouch: true, isMobile: true } : {}), viewport: { width: vp.width, height: vp.height }, colorScheme: theme })
      await context.addInitScript(
        ({ theme, seed }) => {
          localStorage.setItem('rubikku:settings', JSON.stringify({ version: 1, state: { theme, sound: false, motion: 'full', turnSpeed: 2, showFaceLabels: false } }))
          if (seed) localStorage.setItem('rubikku:solve', JSON.stringify({ version: 1, state: seed }))
        },
        { theme, seed: shot.seed },
      )
      const page = await context.newPage()
      const label = `${shot.name}.${vpName}.${theme}`
      page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push(`${label}: console error: ${msg.text()}`)
      })
      page.on('pageerror', (error) => problems.push(`${label}: page error: ${error.message}`))
      await page.goto(`${BASE}/#/solve`, { waitUntil: 'networkidle' })
      await page.waitForSelector('main h1', { timeout: 10_000 }).catch(() => problems.push(`${label}: no <h1> rendered`))
      await page.evaluate(() => document.fonts.ready)
      if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 60_000 }).catch(() => problems.push(`${label}: ${shot.waitFor} never appeared`))
      if (shot.click) await page.click(shot.click)
      if (shot.open !== undefined) await page.locator('[data-issue] > button').nth(shot.open).click()
      for (let i = 0; i < (shot.then ?? 0); i++) {
        await page.click('[data-testid="walk-next"]')
        await page.waitForTimeout(500)
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow > 1) problems.push(`${label}: page scrolls sideways by ${overflow}px`)
      await page.waitForTimeout(1600)
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      if (height > vp.height && !args.includes('--fold')) {
        await page.setViewportSize({ width: vp.width, height: Math.min(height, 6000) })
        await page.waitForTimeout(400)
      }
      await page.screenshot({ path: path.join(OUT, `${label}.png`) })
      count++
      await context.close()
    }
  }
}

await browser.close()
console.log(`Saved ${count} screenshots to ${OUT}`)
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join('\n'))
  process.exit(1)
}
