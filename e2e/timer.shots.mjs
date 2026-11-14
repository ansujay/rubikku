#!/usr/bin/env node
/**
 * Screenshots of the timer states that are awkward to reach by hand, in light and dark, at
 * tablet and phone sizes: the armed pad, the running focus view, the inspection countdown at
 * its calm / 8 s / 12 s / over stages, results (personal best, too quick, +2, no-time DNF,
 * cancelled) and the stats + chart with 0, 1, 2 and many solves.
 *
 *   npm run build && npx vite preview --port 4222 &
 *   node e2e/timer.shots.mjs [baseUrl] [--out=e2e/screenshots/timer] [--only=armed,inspect-8] [--themes=light] [--viewports=phone]
 *
 * The page clock is fast-forwarded (performance.now is skewed), so nothing waits in real time.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4222').replace(/\/$/, '')
const OUT = path.resolve(flag('out') ?? 'e2e/screenshots/timer')
const ONLY = flag('only')?.split(',')
const THEMES = flag('themes')?.split(',') ?? ['light', 'dark']
const VIEWPORTS = [
  { name: 'tablet', width: 1024, height: 768, deviceScaleFactor: 1 },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => !flag('viewports') || flag('viewports').split(',').includes(v.name))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const at = (i, n) => new Date(Date.now() - (n - i) * 300_000).toISOString()
const history = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, ms: 95_000 - i * 1800 + ((i * 37) % 11) * 1300, penalty: i === 7 ? 'dnf' : i === 3 ? '+2' : 'ok', scramble: "R U R' U' F2 D L2 B' U2 R", at: at(i, n) }))
const timer = (solves, extra = {}) => ({ version: 1, state: { solves, scrambles: ["R U F' L2 D B' R2 U' F D2 L' B U2 R' F2 D' L U B2 R"], scrambleIndex: 0, inspection: false, ...extra } })

const skew = (page, ms) => page.evaluate((ms) => (window.__skew += ms), ms)
const hold = async (page) => {
  await page.keyboard.down('Space')
  await sleep(450)
}
const start = async (page) => {
  await hold(page)
  await page.keyboard.up('Space')
  await sleep(300)
}
const inspect = async (page, usedMs) => {
  await page.keyboard.press('Space')
  await sleep(300)
  await skew(page, usedMs)
  await sleep(250)
}

/**
 * name, saved timer state, what to do before the picture, and whether to capture only the viewport.
 * `calm` turns animations off: the skewed clock leaves the focus view's fade-out hanging otherwise.
 */
const SHOTS = [
  { name: 'empty', seed: timer([]) },
  { name: 'armed', seed: timer([]), run: hold, fold: true },
  { name: 'running', seed: timer([]), run: async (page) => (await start(page), await skew(page, 23_400), await sleep(200)), fold: true },
  { name: 'inspect-calm', seed: timer([], { inspection: true }), run: (page) => inspect(page, 2_000), fold: true },
  { name: 'inspect-8', seed: timer([], { inspection: true }), run: (page) => inspect(page, 8_300), fold: true },
  { name: 'inspect-12', seed: timer([], { inspection: true }), run: (page) => inspect(page, 12_300), fold: true },
  { name: 'inspect-over', seed: timer([], { inspection: true }), run: (page) => inspect(page, 15_400), fold: true },
  { name: 'inspect-armed', seed: timer([], { inspection: true }), run: async (page) => (await inspect(page, 5_000), await hold(page)), fold: true },
  { name: 'result-first', calm: true, seed: timer([]), run: async (page) => (await start(page), await skew(page, 62_000), await page.keyboard.press('KeyA'), await sleep(1500)), fold: true },
  { name: 'result-first-full', calm: true, seed: timer([]), run: async (page) => (await start(page), await skew(page, 62_000), await page.keyboard.press('KeyA'), await sleep(1500)) },
  { name: 'result-too-quick', calm: true, seed: timer(history(2)), run: async (page) => (await start(page), await skew(page, 3_600), await page.keyboard.press('KeyA'), await sleep(1200)), fold: true },
  { name: 'result-plus2', calm: true, seed: timer(history(2), { inspection: true }), run: async (page) => (await inspect(page, 15_400), await start(page), await skew(page, 48_000), await page.keyboard.press('KeyA'), await sleep(1200)), fold: true },
  { name: 'result-no-time', calm: true, seed: timer(history(2), { inspection: true }), run: async (page) => (await inspect(page, 17_400), await sleep(900)), fold: true },
  { name: 'cancelled', calm: true, seed: timer(history(2)), run: async (page) => (await start(page), await skew(page, 20_000), await page.keyboard.press('Escape'), await sleep(900)), fold: true },
  { name: 'solves-1', seed: timer(history(1)) },
  { name: 'solves-2', seed: timer(history(2)) },
  { name: 'solves-12', seed: timer(history(12)) },
  { name: 'solves-60', seed: timer(history(60)) },
].filter((shot) => !ONLY || ONLY.includes(shot.name))

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const problems = []
let count = 0

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const shot of SHOTS) {
      const { name: vpName, ...vp } = viewport
      const context = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height }, colorScheme: theme })
      await context.addInitScript(
        ({ theme, seed, motion }) => {
          const real = performance.now.bind(performance)
          window.__skew = 0
          performance.now = () => real() + window.__skew
          localStorage.setItem('rubikku:settings', JSON.stringify({ version: 1, state: { theme, sound: false, motion, turnSpeed: 1, showFaceLabels: false } }))
          localStorage.setItem('rubikku:timer', JSON.stringify(seed))
        },
        { theme, seed: shot.seed, motion: shot.calm ? 'reduced' : 'full' },
      )
      const page = await context.newPage()
      const label = `${shot.name}.${vpName}.${theme}`
      page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push(`${label}: console error: ${msg.text()}`)
      })
      page.on('pageerror', (error) => problems.push(`${label}: page error: ${error.message}`))
      await page.goto(`${BASE}/#/timer`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid="timer-pad"]', { timeout: 10_000 }).catch(() => problems.push(`${label}: no timer pad`))
      await page.evaluate(() => document.fonts.ready)
      await sleep(700)
      if (shot.run) await shot.run(page)
      // The skewed clock leaves the focus view's fade-out hanging: take it away for the picture.
      if (shot.calm) await page.evaluate(() => document.querySelectorAll('[data-testid="timer-focus"]').forEach((el) => (el.style.display = 'none')))
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow > 1) problems.push(`${label}: page scrolls sideways by ${overflow}px`)
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      if (!shot.fold && height > vp.height) {
        await page.setViewportSize({ width: vp.width, height: Math.min(height, 6000) })
        await sleep(500)
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
