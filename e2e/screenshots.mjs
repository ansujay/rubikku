#!/usr/bin/env node
/**
 * Screenshot every route in light and dark at tablet and phone sizes.
 *
 *   npm run build && npx vite preview --port 4173 &      # or: npm run dev
 *   node e2e/screenshots.mjs [baseUrl] [--only=home,settings] [--out=e2e/screenshots] [--slices]
 *
 * baseUrl defaults to $BASE_URL or http://localhost:4173. PNGs are written to e2e/screenshots/
 * as <route>.<viewport>.<theme>.png. Home, Timer and Progress are also captured with a seeded
 * save ("home-seeded", "timer-seeded", "progress-seeded") so progress, streak, path and timer
 * history can be reviewed with real-looking data.
 * Exits non-zero if any page logs a console error or throws.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '')
const OUT = path.resolve(flag('out') ?? 'e2e/screenshots')
const ONLY = flag('only')?.split(',')
// --slices: also cut pages taller than 1600px into readable pieces (<name>.<n>.png in slices/).
const SLICES = args.includes('--slices')
const SLICE_H = 1300

const VIEWPORTS = [
  { name: 'tablet', width: 1024, height: 768, deviceScaleFactor: 1 },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]
const THEMES = ['light', 'dark']

const pad = (n) => String(n).padStart(2, '0')
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

/** A believable mid-journey save: three stages done, a four-day streak, level 4. */
function seededProgress() {
  const iso = (n) => daysAgo(n).toISOString()
  const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString()
  return {
    version: 1,
    state: {
      xp: 765,
      badges: {
        'first-steps': iso(6),
        'stage-daisy': iso(6),
        'stage-white-cross': iso(4),
        'stage-white-corners': iso(2),
        'streak-3': iso(1),
        'notation-rookie': iso(3),
        'first-solve': iso(1),
        'sub-5': iso(1),
      },
      streak: { current: 4, best: 4, lastActive: dateKey(daysAgo(0)) },
      lessons: {
        daisy: { startedAt: iso(6), completedAt: iso(6) },
        'white-cross': { startedAt: iso(5), completedAt: iso(4) },
        'white-corners': { startedAt: iso(3), completedAt: iso(2) },
        'middle-layer': { startedAt: iso(0), completedAt: null },
      },
      counters: { solves: 3, timedSolves: 2, notationRounds: 4, notationCorrect: 61 },
      bestSolveMs: 252_340,
      patterns: ['checkerboard'],
      algorithms: ['sexy-move', 'sledgehammer'],
      activity: Object.fromEntries([
        ...[0, 1, 2, 3, 6].map((n) => [dateKey(daysAgo(n)), 60 + n * 35]),
        // Older practice, for the 12-week calendar on the Progress page.
        ...[9, 10, 13, 16, 17, 18, 24, 30, 31, 37, 45, 52, 53].map((n, i) => [dateKey(daysAgo(n)), [25, 80, 150, 240, 60][i % 5]]),
      ]),
      dailyDoneOn: null,
      log: [
        { at: minutesAgo(12), type: 'solve-completed', xp: 40 },
        { at: minutesAgo(31), type: 'lesson-started', xp: 0 },
        { at: minutesAgo(64), type: 'notation-round', xp: 34 },
        { at: iso(1), type: 'solve-completed', xp: 140 },
        { at: iso(2), type: 'lesson-completed', xp: 120 },
        { at: iso(3), type: 'algorithm-practised', xp: 6 },
        { at: iso(3), type: 'pattern-made', xp: 10 },
        { at: iso(4), type: 'lesson-completed', xp: 120 },
      ],
    },
  }
}

/** A believable timer session: 34 solves drifting from ~4:40 down to ~3:05, with a +2 and a DNF. */
function seededTimer() {
  const moves = ["R", "U'", "F2", "D", "L'", "B2", "U", "R'", "F", "D2", "L", "B'", "U2", "R2", "F'", "D'", "L2", "B", "U", "R"]
  const scramble = (k) => moves.map((_, i) => moves[(i * 7 + k * 3) % moves.length]).filter((m, i, all) => i === 0 || m[0] !== all[i - 1][0]).join(' ')
  let seed = 7
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const count = 34
  const solves = Array.from({ length: count }, (_, i) => {
    const trend = 280_000 - (95_000 * i) / (count - 1)
    const ms = Math.round(trend + (rand() - 0.5) * 60_000)
    const day = Math.floor(((count - 1 - i) / count) * 6)
    const at = new Date(daysAgo(day).getTime() - (count - i) * 4 * 60_000).toISOString()
    return { id: `seed-${i}`, ms, penalty: i === 11 ? 'dnf' : i === 22 ? '+2' : 'ok', scramble: scramble(i), at }
  })
  return { version: 1, state: { solves, scrambles: ["F2 U' R2 D B2 L' U2 F R' D2 L B' U R2 F' D' L2 B U' R"], scrambleIndex: 0, inspection: false } }
}

const SHOTS = [
  { name: 'home', route: '/' },
  { name: 'home-seeded', route: '/', seed: true },
  { name: 'learn', route: '/learn' },
  { name: 'lesson', route: '/learn/white-cross' },
  { name: 'play', route: '/play' },
  { name: 'notation', route: '/notation' },
  { name: 'algorithms', route: '/algorithms' },
  { name: 'algorithm-detail', route: '/algorithms/sune' },
  { name: 'algorithm-quiz', route: '/algorithms/quiz' },
  { name: 'solve', route: '/solve' },
  { name: 'timer', route: '/timer' },
  { name: 'timer-seeded', route: '/timer', seed: true, timer: true },
  { name: 'progress', route: '/progress' },
  { name: 'progress-seeded', route: '/progress', seed: true },
  { name: 'patterns', route: '/patterns' },
  { name: 'pattern-detail', route: '/patterns/checkerboard' },
  { name: 'patterns-flags', route: '/patterns?tab=flags' },
  { name: 'flag-detail', route: '/patterns/flag-india' },
  { name: 'pattern-design', route: '/patterns?tab=design&face=OOOWBWGGG' },
  { name: 'settings', route: '/settings' },
  { name: 'kitchen-sink', route: '/kitchen-sink' },
  { name: 'not-found', route: '/nope' },
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
        ({ theme, progress, timer }) => {
          localStorage.setItem(
            'rubikku:settings',
            JSON.stringify({ version: 1, state: { theme, sound: false, motion: 'full', turnSpeed: 1, showFaceLabels: false } }),
          )
          if (progress) localStorage.setItem('rubikku:progress', JSON.stringify(progress))
          if (timer) localStorage.setItem('rubikku:timer', JSON.stringify(timer))
        },
        { theme, progress: shot.seed ? seededProgress() : null, timer: shot.timer ? seededTimer() : null },
      )
      const page = await context.newPage()
      const label = `${shot.name}.${vpName}.${theme}`
      page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push(`${label}: console error: ${msg.text()}`)
      })
      page.on('pageerror', (error) => problems.push(`${label}: page error: ${error.message}`))

      await page.goto(`${BASE}/#${shot.route}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('main h1', { timeout: 10_000 }).catch(() => problems.push(`${label}: no <h1> rendered`))
      await page.evaluate(() => document.fonts.ready)
      const applied = await page.evaluate(() => document.documentElement.dataset.theme)
      if (applied !== theme) problems.push(`${label}: expected data-theme=${theme}, got ${applied}`)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow > 1) problems.push(`${label}: page scrolls sideways by ${overflow}px`)
      // Let entrance springs and progress fills settle.
      await page.waitForTimeout(1400)
      // Grow the viewport to the page height instead of using fullPage, so fixed bars
      // (sidebar, phone tab bar) land where they belong rather than mid-page.
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      if (height > vp.height) {
        await page.setViewportSize({ width: vp.width, height: Math.min(height, 12_000) })
        await page.waitForTimeout(250)
      }
      await page.screenshot({ path: path.join(OUT, `${label}.png`) })
      if (SLICES && height > 1600) {
        await mkdir(path.join(OUT, 'slices'), { recursive: true })
        for (let y = 0, n = 1; y < Math.min(height, 12_000); y += SLICE_H, n++) {
          await page.screenshot({
            path: path.join(OUT, 'slices', `${label}.${n}.png`),
            clip: { x: 0, y, width: vp.width, height: Math.min(SLICE_H, height - y) },
          })
        }
      }
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
