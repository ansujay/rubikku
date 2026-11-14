#!/usr/bin/env node
/**
 * Screenshots of the Learn feature: the path and a spread of lesson beats, light and dark,
 * tablet and phone.
 *
 *   npm run build && npx vite preview --port 4201 &
 *   node e2e/learn.shots.mjs [baseUrl] [--only=path,demo] [--out=e2e/screenshots/learn]
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4201').replace(/\/$/, '')
const OUT = path.resolve(flag('out') ?? 'e2e/screenshots/learn')
const ONLY = flag('only')?.split(',')
const THEMES = flag('themes')?.split(',') ?? ['light', 'dark']
const SIZES = flag('sizes')?.split(',') ?? ['tablet', 'phone']

const VIEWPORTS = [
  { name: 'tablet', width: 1024, height: 768, deviceScaleFactor: 1 },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => SIZES.includes(v.name))

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()
const midJourney = {
  version: 1,
  state: {
    xp: 520,
    badges: {},
    streak: { current: 2, best: 4, lastActive: null },
    lessons: {
      daisy: { startedAt: iso(6), completedAt: iso(6) },
      'white-cross': { startedAt: iso(5), completedAt: iso(4) },
      'white-corners': { startedAt: iso(3), completedAt: iso(2) },
      'middle-layer': { startedAt: iso(0), completedAt: null },
    },
    counters: {},
    bestSolveMs: null,
    patterns: [],
    algorithms: [],
    activity: {},
    dailyDoneOn: null,
    log: [],
  },
}
const drill = (clean, total) => ({ n: total, hinted: false, solved: false, total, clean, streak: clean, best: clean })
const lessonAt = (beatId, furthest, extra = {}) => ({ beatId, furthest, done: {}, session: null, sessionKey: null, drill: drill(0, 0), completed: false, ...extra })
const learnMid = {
  version: 1,
  state: {
    lessons: {
      primer: lessonAt('wrap', 16, { completed: true }),
      daisy: lessonAt('wrap', 15, { completed: true, drill: drill(3, 4) }),
      'white-cross': lessonAt('wrap', 10, { completed: true, drill: drill(1, 2) }),
      'white-corners': lessonAt('wrap', 20, { completed: true, drill: drill(3, 3) }),
      'middle-layer': lessonAt('right', 4),
    },
    capstone: { n: 0, session: null, hints: 0, solved: false, solves: 0 },
    last: 'middle-layer',
  },
}
const at = (lesson, beatId, extra) => ({ version: 1, state: { lessons: { [lesson]: lessonAt(beatId, 0, extra) }, capstone: { n: 0, session: null, hints: 0, solved: false, solves: 0 }, last: lesson } })

/** name, route, saved stores, and optional steps to run before the shot. */
const answer = (pick) => async (page) => {
  const options = page.locator('[data-testid="quiz-option"]')
  await options.nth(pick).click()
  await page.waitForTimeout(700)
}
const SHOTS = [
  { name: 'path-new', route: '/learn' },
  { name: 'path-mid', route: '/learn', progress: midJourney, learn: learnMid },
  { name: 'primer-welcome', route: '/learn/primer', learn: at('primer', 'welcome') },
  { name: 'primer-hold', route: '/learn/primer', learn: at('primer', 'hold') },
  { name: 'primer-move-l', route: '/learn/primer', learn: at('primer', 'move-l') },
  { name: 'primer-real', route: '/learn/primer', learn: at('primer', 'cube') },
  { name: 'daisy-goal', route: '/learn/daisy', learn: at('daisy', 'goal'), wait: 300 },
  { name: 'daisy-hold', route: '/learn/daisy', learn: at('daisy', 'hold') },
  { name: 'daisy-quiz', route: '/learn/daisy', learn: at('daisy', 'quiz'), steps: answer(0) },
  { name: 'daisy-guided', route: '/learn/daisy', learn: at('daisy', 'try-1') },
  { name: 'daisy-slip', route: '/learn/daisy', learn: at('daisy', 'try-2'), steps: async (page) => { await page.focus('[data-cube3d=lesson]'); for (const k of ['f', 'r', 'l', 'b']) { await page.keyboard.press(k); await page.waitForTimeout(500); if (await page.locator('[data-testid="now-strip"][data-kind="off"]').count()) break; await page.keyboard.press(`Shift+${k.toUpperCase()}`); await page.waitForTimeout(500) } } },
  { name: 'daisy-real', route: '/learn/daisy', learn: at('daisy', 'cube') },
  { name: 'cross-wrong', route: '/learn/white-cross', learn: at('white-cross', 'wrong') },
  { name: 'corners-home', route: '/learn/white-corners', learn: at('white-corners', 'home') },
  { name: 'corners-five', route: '/learn/white-corners', learn: at('white-corners', 'trigger-try') },
  { name: 'corners-guided', route: '/learn/white-corners', learn: at('white-corners', 'try-1') },
  { name: 'corners-rules', route: '/learn/white-corners', learn: at('white-corners', 'rules') },
  { name: 'middle-quiz', route: '/learn/middle-layer', learn: at('middle-layer', 'quiz'), steps: answer(1) },
  { name: 'middle-five', route: '/learn/middle-layer', learn: at('middle-layer', 'five-right', { reps: { 'five-right': 2 } }) },
  { name: 'middle-guided-name', route: '/learn/middle-layer', learn: at('middle-layer', 'try-2'), steps: async (page) => { await page.click('[data-testid="hint-button"]'); await page.waitForTimeout(600) } },
  { name: 'yellow-cross-shapes', route: '/learn/yellow-cross', learn: at('yellow-cross', 'shapes') },
  { name: 'yellow-cross-quiz', route: '/learn/yellow-cross', learn: at('yellow-cross', 'quiz') },
  { name: 'edges-swap', route: '/learn/yellow-edges', learn: at('yellow-edges', 'swap') },
  { name: 'edges-drill', route: '/learn/yellow-edges', learn: at('yellow-edges', 'drill', { drill: drill(2, 2) }), steps: async (page) => { await page.click('[data-testid="hint-button"]'); await page.waitForTimeout(700) } },
  { name: 'place-home', route: '/learn/yellow-corners-position', learn: at('yellow-corners-position', 'home') },
  { name: 'place-quiz', route: '/learn/yellow-corners-position', learn: at('yellow-corners-position', 'quiz'), steps: answer(4) },
  { name: 'place-real', route: '/learn/yellow-corners-position', learn: at('yellow-corners-position', 'cube') },
  { name: 'twist-panic', route: '/learn/yellow-corners-orient', learn: at('yellow-corners-orient', 'dont-panic') },
  { name: 'twist-stuck', route: '/learn/yellow-corners-orient', learn: at('yellow-corners-orient', 'try-1'), steps: async (page) => { await page.click('[data-testid="stuck-button"]'); await page.waitForTimeout(600) } },
  { name: 'twist-wrap', route: '/learn/yellow-corners-orient', learn: at('yellow-corners-orient', 'wrap', { completed: true, drill: drill(3, 3) }) },
  { name: 'corners-wrap-todo', route: '/learn/white-corners', learn: at('white-corners', 'wrap'), progress: midJourney },
  { name: 'full-solve', route: '/learn/full-solve', progress: midJourney },
].filter((shot) => !ONLY || ONLY.some((o) => shot.name.startsWith(o)))

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
        ({ theme, progress, learn }) => {
          localStorage.setItem('rubikku:settings', JSON.stringify({ version: 1, state: { theme, sound: false, motion: 'full', turnSpeed: 1.5, showFaceLabels: false } }))
          if (progress) localStorage.setItem('rubikku:progress', JSON.stringify(progress))
          if (learn) localStorage.setItem('rubikku:learn', JSON.stringify(learn))
        },
        { theme, progress: shot.progress ?? null, learn: shot.learn ?? null },
      )
      const page = await context.newPage()
      const label = `${shot.name}.${vpName}.${theme}`
      page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push(`${label}: console error: ${msg.text()}`)
      })
      page.on('pageerror', (error) => problems.push(`${label}: page error: ${error.message}`))
      await page.goto(`${BASE}/#${shot.route}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('main h1', { timeout: 10_000 }).catch(() => problems.push(`${label}: no <h1>`))
      await page.evaluate(() => document.fonts.ready)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow > 1) problems.push(`${label}: page scrolls sideways by ${overflow}px`)
      await page.waitForTimeout(1500 + (shot.wait ?? 0))
      if (shot.steps) await shot.steps(page).catch((error) => problems.push(`${label}: steps failed: ${error.message}`))
      // Lesson pages are shot at the real viewport (the sticky stage is the point); the path in full.
      if (shot.route === '/learn') {
        const height = await page.evaluate(() => document.documentElement.scrollHeight)
        if (height > vp.height) await page.setViewportSize({ width: vp.width, height: Math.min(height, 6000) })
        await page.waitForTimeout(600)
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
