#!/usr/bin/env node
/**
 * End-to-end tests for the app shell, the stores and the PWA, in headless Chromium.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node e2e/app.e2e.mjs [baseUrl] [--only=home,daily] [--dist=dist]
 *
 * Covers: a new player's Home leads to the primer (and to the full solve once the stages are
 * done); the hero paints with a still cube before three.js arrives, without layout shift; the
 * daily challenge completes from real feature use, pays once, shows done after a reload and
 * starts afresh the next day; two tabs keep each other up to date; importing a bad backup
 * changes nothing; a page whose code failed to load can be retried; the whole site works
 * offline after one visit (every route, fonts, the solver worker); and — with --dist, the folder
 * being served — an update waits for "Refresh" and leaves saved progress alone.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { chromium } from 'playwright'

const Cube = createRequire(import.meta.url)('cubejs')
const args = process.argv.slice(2)
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '')
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const ONLY = flag('only')?.split(',')
const DIST = flag('dist')

const failures = []
let checks = 0
const check = (ok, message) => {
  checks++
  if (!ok) {
    failures.push(message)
    console.error(`    ✗ ${message}`)
  }
}
const equal = (actual, expected, message) => check(actual === expected, `${message}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`)

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

const pad = (n) => String(n).padStart(2, '0')
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const yesterdayKey = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dateKey(d)
}
const STAGES = ['daisy', 'white-cross', 'white-corners', 'middle-layer', 'yellow-cross', 'yellow-edges', 'yellow-corners-position', 'yellow-corners-orient']
const stamp = new Date(Date.now() - 86_400_000 * 3).toISOString()
const lessonsDone = (n) => Object.fromEntries(STAGES.slice(0, n).map((id) => [id, { startedAt: stamp, completedAt: stamp }]))
const progressSave = (state) => ({ version: 1, state: { xp: 0, badges: {}, streak: { current: 0, best: 0, lastActive: null }, lessons: {}, counters: {}, bestSolveMs: null, patterns: [], algorithms: [], activity: {}, dailyDoneOn: null, daily: null, tally: { date: '', counts: {} }, log: [], ...state } })
const SETTINGS = { version: 1, state: { theme: 'light', sound: false, motion: 'full', turnSpeed: 2, showFaceLabels: false } }

/** A fresh browser profile. `storage` is written once, before the app first runs. */
async function profile({ storage = {}, serviceWorkers = 'block', settings = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, serviceWorkers })
  await context.addInitScript(
    ({ storage }) => {
      if (localStorage.getItem('e2e-seeded')) return
      localStorage.setItem('e2e-seeded', '1')
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, JSON.stringify(value))
    },
    { storage: settings ? { 'rubikku:settings': SETTINGS, ...storage } : storage },
  )
  const errors = []
  const watch = (page) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    return page
  }
  const open = async (route) => {
    const page = watch(await context.newPage())
    await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' })
    return page
  }
  return { context, open, errors, watch }
}

const t = (id) => `[data-testid="${id}"]`
const saved = (page, name) => page.evaluate((name) => JSON.parse(localStorage.getItem(`rubikku:${name}`) ?? 'null')?.state ?? null, name)
const go = async (page, route) => {
  await page.evaluate((route) => (window.location.hash = route), route)
  await page.waitForFunction((route) => window.location.hash === `#${route}`, route)
}
const cubeReady = (page, id) => page.waitForFunction((id) => window.__rubikku?.cubes?.[id]?.frames() > 0, id, { timeout: 30_000 })
const idle = (page, id) => page.evaluate((id) => window.__rubikku.cubes[id].whenIdle(), id)
async function keys(page, id, moves) {
  for (const move of moves.split(' ')) {
    await page.evaluate(() => document.querySelector('.stage [tabindex]').focus())
    await page.keyboard.press(move.endsWith("'") ? `Shift+${move[0]}` : move[0])
    await idle(page, id)
    await page.waitForTimeout(40)
  }
}
/** Everything Rubikku has saved, minus the marker that only tells other tabs to re-read. */
const dump = (page) =>
  page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith('rubikku:') && key !== 'rubikku:!sync').sort().map((key) => [key, localStorage.getItem(key)])))
const toastTexts = (page) => page.locator(t('toast')).allTextContents()

const tests = {
  // ── Home: what is next, for a new player and at the end of the path ──
  async home() {
    const fresh = await profile()
    const page = fresh.watch(await fresh.context.newPage())
    // Hold three.js back: the page must paint, with a still cube, without it.
    let releaseThree
    const threeHeld = new Promise((resolve) => (releaseThree = resolve))
    let threeAsked = false
    await page.route('**/assets/three-*.js', async (route) => {
      threeAsked = true
      await threeHeld
      await route.continue()
    })
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(t('hero-cta'))
    equal((await page.textContent('h1')).trim(), 'Let’s solve your first cube.', 'home: a new player is greeted')
    equal(await page.getAttribute(t('hero-cta'), 'href'), '#/learn/primer', 'home: the main button goes to the primer, not stage 1')
    equal((await page.textContent(t('hero-cta'))).trim(), 'Start here', 'home: and says so')
    check(/warm-up/.test(await page.textContent(t('path-summary'))), 'home: the path strip mentions the warm-up')
    equal(await page.locator('a[aria-current="step"]').count(), 0, 'home: no stage is marked "up next" before the primer')
    equal(await page.locator('ol a[href^="#/learn/"]').count(), 8, 'home: all eight stages are links (locked ones can be peeked at)')
    equal(await page.title(), 'Rubikku — learn to solve the cube', 'home: document title')
    // First paint did not wait for three.js, and a still cube stands in.
    check(threeAsked, 'home: three.js is requested after the page has painted')
    check(await page.locator(`${t('hero-standin')} svg`).isVisible(), 'home: a flat cube stands in until the 3D one is ready')
    equal(await page.getAttribute(t('hero-standin'), 'data-live'), 'false', 'home: the stand-in is showing while three.js loads')
    const box = (sel) => page.evaluate((sel) => JSON.stringify(document.querySelector(sel).getBoundingClientRect().toJSON()), sel)
    const stageBefore = await box('.stage')
    const ctaBefore = await box(t('hero-cta'))
    releaseThree()
    await cubeReady(page, 'home')
    await page.waitForFunction(() => document.querySelector('[data-testid="hero-standin"]').dataset.live === 'true', null, { timeout: 20_000 })
    equal(await box('.stage'), stageBefore, 'home: the stage does not move when the live cube arrives')
    equal(await box(t('hero-cta')), ctaBefore, 'home: nor does anything else (no layout shift)')
    equal(await page.locator('nav a[href="#/kitchen-sink"]').count(), 0, 'home: the kitchen sink is not in the navigation')

    await page.click(t('hero-cta'))
    await page.waitForSelector(t('lesson-panel'), { timeout: 20_000 })
    equal(await page.evaluate(() => window.location.hash), '#/learn/primer', 'home: "Start here" opens the primer')
    equal(await page.title(), 'Lesson · Rubikku', 'home: the lesson has its own document title')
    equal(await page.getAttribute('main', 'aria-label'), 'Lesson', 'home: the main region is named after the page')
    // Mid-primer, Home says Continue and still points at the primer.
    await page.click(t('beat-next')).catch(() => {})
    await go(page, '/')
    await page.waitForSelector(t('hero-cta'))
    equal(await page.getAttribute(t('hero-cta'), 'href'), '#/learn/primer', 'home: mid-primer still points at the primer')
    equal((await page.textContent(t('hero-cta'))).trim(), 'Continue', 'home: mid-primer says Continue')
    equal(fresh.errors.length, 0, `home: no console errors: ${fresh.errors.join(' | ')}`)
    await fresh.context.close()

    // Three stages in: the next stage.
    const mid = await profile({ storage: { 'rubikku:progress': progressSave({ lessons: { ...lessonsDone(3), 'middle-layer': { startedAt: stamp, completedAt: null } } }) } })
    const midPage = await mid.open('/')
    equal(await midPage.getAttribute(t('hero-cta'), 'href'), '#/learn/middle-layer', 'home: mid-path points at the stage he is on')
    equal((await midPage.textContent(t('hero-cta'))).trim(), 'Continue', 'home: a started stage says Continue')
    equal(await midPage.getAttribute('a[aria-current="step"]', 'href'), '#/learn/middle-layer', 'home: that stage is marked on the strip')
    await mid.context.close()

    // All eight stages done: the full solve is next.
    const done = await profile({ storage: { 'rubikku:progress': progressSave({ lessons: lessonsDone(8) }) } })
    const donePage = await done.open('/')
    equal(await donePage.getAttribute(t('hero-cta'), 'href'), '#/learn/full-solve', 'home: with all stages done the full solve is next')
    equal((await donePage.textContent('h1')).trim(), 'Time for a full solve.', 'home: and the headline says so')
    await done.context.close()

    // …and once that is done too, the timer.
    const master = await profile({
      storage: { 'rubikku:progress': progressSave({ lessons: lessonsDone(8) }), 'rubikku:learn': { version: 1, state: { lessons: {}, capstone: { n: 1, session: null, hints: 0, solved: false, solves: 1 }, last: null } } },
    })
    const masterPage = await master.open('/')
    equal(await masterPage.getAttribute(t('hero-cta'), 'href'), '#/timer', 'home: after a full solve it is the timer')
    await master.context.close()
  },

  // ── the daily challenge: real use completes it, once; a reload keeps it; tomorrow is new ──
  async daily() {
    const today = dateKey()
    // (a) From nothing: make a pattern.
    const a = await profile({ storage: { 'rubikku:progress': progressSave({ daily: { date: today, id: 'pattern-1', count: 0, items: [] } }) } })
    const page = await a.open('/')
    await page.waitForSelector(t('daily-card'))
    equal(await page.getAttribute(t('daily-card'), 'data-daily'), 'pattern-1', 'daily: today’s challenge is on Home')
    equal((await page.textContent(t('daily-progress'))).trim(), '0 of 1 pattern', 'daily: progress starts at zero')
    equal(await page.getAttribute(t('daily-cta'), 'href'), '#/patterns', 'daily: "Take it on" goes to the right place')
    equal((await page.textContent(t('daily-cta'))).trim(), 'Take it on', 'daily: the button invites')

    await go(page, '/patterns/checkerboard?mode=try')
    await cubeReady(page, 'pattern')
    await page.waitForSelector(t('try-panel'))
    await keys(page, 'pattern', 'M M E E S S')
    await page.waitForFunction((today) => JSON.parse(localStorage.getItem('rubikku:progress')).state.dailyDoneOn === today, today, { timeout: 10_000 })
    let progress = await saved(page, 'progress')
    equal(progress.counters.dailyChallenges, 1, 'daily: making a pattern in the pattern gallery completed it')
    equal(progress.xp, 10 + 50, 'daily: the pattern’s XP plus the daily bonus')
    equal(progress.log[0].type, 'daily-challenge-completed', 'daily: it is in the activity feed')
    // Making the pattern is a celebration "moment"; the daily challenge joins it as a line
    // instead of stacking a toast on top of it.
    await page.waitForSelector(t('celebration'))
    const cheer = await page.textContent(t('celebration'))
    check(/Daily challenge done/.test(cheer) && /Checkerboard/.test(cheer), `daily: the pattern's moment says so (${cheer})`)
    equal(await page.locator(t('toast')).count(), 0, 'daily: XP and the daily arrive in one celebration, not a stack of toasts')
    const cheerBox = await page.locator(t('celebration')).first().boundingBox()
    check(cheerBox.y < 120 && cheerBox.x > 240, `daily: the moment is at the top of the content column (${Math.round(cheerBox.x)}, ${Math.round(cheerBox.y)})`)

    await go(page, '/')
    await page.waitForSelector(t('daily-card'))
    equal(await page.getAttribute(t('daily-card'), 'data-done'), 'true', 'daily: Home shows it done')
    equal((await page.textContent(t('daily-progress'))).trim(), '1 of 1 pattern', 'daily: with full progress')
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector(t('daily-card'))
    equal(await page.getAttribute(t('daily-card'), 'data-done'), 'true', 'daily: still done after a reload')
    check(/Done today/.test(await page.textContent(t('daily-card'))), 'daily: the card says "Done today"')

    // Doing it again pays nothing more.
    await go(page, '/patterns/six-spots?mode=follow')
    await page.waitForSelector(t('follow-panel'))
    for (let i = 0; i < 12 && (await page.locator(t('follow-made')).count()) === 0; i++) await page.click(t('follow-next'))
    await page.click(t('follow-made'))
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('rubikku:progress')).state.patterns.length === 2)
    progress = await saved(page, 'progress')
    equal(progress.counters.dailyChallenges, 1, 'daily: a second pattern the same day does not pay the bonus again')
    equal(progress.xp, 10 + 50 + 10, 'daily: only the new pattern’s XP was added')

    // The next day: yesterday's is history, a fresh challenge at zero.
    await page.evaluate((yesterday) => {
      const save = JSON.parse(localStorage.getItem('rubikku:progress'))
      save.state.daily.date = yesterday
      save.state.dailyDoneOn = yesterday
      localStorage.setItem('rubikku:progress', JSON.stringify(save))
    }, yesterdayKey())
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector(t('daily-card'))
    equal(await page.getAttribute(t('daily-card'), 'data-done'), 'false', 'daily: a new day starts not done')
    equal(await page.getAttribute(t('daily-card'), 'data-count'), '0', 'daily: and at zero')
    check(/^0 of \d/.test((await page.textContent(t('daily-progress'))).trim()), 'daily: progress reads "0 of N"')
    equal(a.errors.length, 0, `daily: no console errors: ${a.errors.join(' | ')}`)
    await a.context.close()

    // (b) Part-way: two of three algorithms done, the third finishes it.
    const b = await profile({
      storage: {
        'rubikku:progress': progressSave({ lessons: lessonsDone(3), algorithms: ['sune', 'right-trigger'], daily: { date: today, id: 'algs-3', count: 2, items: ['sune', 'right-trigger'] } }),
      },
    })
    const pageB = await b.open('/')
    await pageB.waitForSelector(t('daily-card'))
    equal((await pageB.textContent(t('daily-progress'))).trim(), '2 of 3 algorithms', 'daily: live progress shows "2 of 3"')
    equal((await pageB.textContent(t('daily-cta'))).trim(), 'Carry on', 'daily: a started challenge says "Carry on"')
    await pageB.click(t('daily-cta'))
    await pageB.waitForFunction(() => window.location.hash === '#/algorithms')
    await go(pageB, '/algorithms/white-cross-drop?mode=practise')
    await cubeReady(pageB, 'algorithm')
    await pageB.waitForSelector(t('practise-panel'))
    await keys(pageB, 'algorithm', 'F F')
    await pageB.waitForFunction((today) => JSON.parse(localStorage.getItem('rubikku:progress')).state.dailyDoneOn === today, today, { timeout: 10_000 })
    // Ten more reps: no XP farming, one row in the feed, no stack of toasts.
    const xpAfter = (await saved(pageB, 'progress')).xp
    equal(xpAfter, 6 + 50, 'daily: the third algorithm finished it (+6 XP, +50 bonus)')
    for (let i = 0; i < 3; i++) {
      await pageB.waitForFunction(() => document.querySelector('[data-testid="practise-panel"]')?.dataset.follow === '0' && !document.querySelector('[data-testid="rep-done"]'), null, { timeout: 15_000 })
      await keys(pageB, 'algorithm', 'F F')
    }
    await pageB.waitForFunction(() => JSON.parse(localStorage.getItem('rubikku:algorithms')).state.stats['white-cross-drop'].reps === 4, null, { timeout: 15_000 })
    const progressB = await saved(pageB, 'progress')
    equal(progressB.xp, xpAfter, 'daily: repeating the same algorithm earns nothing more that day')
    equal(progressB.log.filter((entry) => entry.type === 'algorithm-practised').length, 1, 'daily: the reps are one row in the activity feed')
    check((await pageB.locator(t('toast')).count()) <= 1, 'daily: practice reps do not stack toasts')
    await go(pageB, '/')
    await pageB.waitForSelector(t('daily-card'))
    equal(await pageB.getAttribute(t('daily-card'), 'data-done'), 'true', 'daily: done on Home')
    equal(b.errors.length, 0, `daily: no console errors (b): ${b.errors.join(' | ')}`)
    await b.context.close()
  },

  // ── two tabs: neither overwrites the other ──
  async tabs() {
    const p = await profile({ storage: { 'rubikku:progress': progressSave({ xp: 100, lessons: lessonsDone(1), dailyDoneOn: dateKey() }) } })
    const a = await p.open('/')
    const b = await p.open('/algorithms/white-cross-drop?mode=practise')
    await cubeReady(b, 'algorithm')
    await keys(b, 'algorithm', 'F F')
    await b.waitForFunction(() => JSON.parse(localStorage.getItem('rubikku:progress')).state.xp === 106)
    // Tab A hears about it without a reload…
    await a.waitForFunction(() => /106\s*XP/.test(document.querySelector('aside')?.textContent ?? ''), null, { timeout: 10_000 }).catch(() => {})
    check(/106\s*XP/.test(await a.textContent('aside')), 'tabs: the other tab shows the new XP without a reload')
    // …so when A earns something, B's XP is not lost.
    await go(a, '/patterns/six-spots?mode=follow')
    await a.waitForSelector(t('follow-panel'))
    for (let i = 0; i < 12 && (await a.locator(t('follow-made')).count()) === 0; i++) await a.click(t('follow-next'))
    await a.click(t('follow-made'))
    await a.waitForFunction(() => JSON.parse(localStorage.getItem('rubikku:progress')).state.patterns.length === 1)
    const progress = await saved(a, 'progress')
    equal(progress.xp, 116, 'tabs: both tabs’ XP is in the save (100 + 6 + 10)')
    check(progress.algorithms.includes('white-cross-drop') && progress.patterns.includes('six-spots'), 'tabs: and both tabs’ collections')
    await b.waitForFunction(() => /116\s*XP/.test(document.querySelector('aside')?.textContent ?? ''), null, { timeout: 10_000 }).catch(() => {})
    check(/116\s*XP/.test(await b.textContent('aside')), 'tabs: the first tab catches up too')
    // B acts again from its (now current) memory: nothing of A's is lost.
    await b.waitForFunction(() => document.querySelector('[data-testid="practise-panel"]')?.dataset.follow === '0' && !document.querySelector('[data-testid="rep-done"]'), null, { timeout: 15_000 })
    await keys(b, 'algorithm', 'F F')
    await b.waitForFunction(() => JSON.parse(localStorage.getItem('rubikku:algorithms')).state.stats['white-cross-drop'].reps === 2)
    equal((await saved(b, 'progress')).patterns.length, 1, 'tabs: a later save from the first tab keeps the other tab’s pattern')

    // Settings travel too: the theme changes in the other tab.
    await go(a, '/settings')
    await a.click('[role="radiogroup"][aria-label="Theme"] [role="radio"]:has-text("Dark")')
    await b.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 10_000 }).catch(() => {})
    equal(await b.evaluate(() => document.documentElement.dataset.theme), 'dark', 'tabs: a theme change shows up in the other tab')
    equal(p.errors.length, 0, `tabs: no console errors: ${p.errors.join(' | ')}`)
    await p.context.close()
  },

  // ── import: all or nothing ──
  async importing() {
    const p = await profile({ storage: { 'rubikku:progress': progressSave({ xp: 340, lessons: lessonsDone(2), badges: { 'first-steps': stamp } }), 'rubikku:timer': { version: 1, state: { solves: [] } } } })
    const page = await p.open('/settings')
    await page.waitForSelector(t('backup-file'), { state: 'attached' })
    const before = await dump(page)
    const file = (name, text) => ({ name, mimeType: 'application/json', buffer: Buffer.from(text) })

    // 1. Not a backup at all.
    for (const [name, text, why] of [
      ['holiday.json', '{"photos":[1,2,3]}', 'some other JSON'],
      ['broken.json', '{"app":"rubikku","kind":"backup","schema":1,"stores":{"progress":{"version":1,"sta', 'a truncated backup'],
      ['empty.json', '   ', 'an empty file'],
    ]) {
      await page.setInputFiles(t('backup-file'), file(name, text))
      await page.waitForSelector(t('backup-error'))
      check((await page.textContent(t('backup-error'))).length > 20, `import: ${why} is refused with a message`)
      equal(await page.locator(t('backup-restore')).count(), 0, `import: ${why} never reaches the confirm step`)
      equal(JSON.stringify(await dump(page)), JSON.stringify(before), `import: ${why} changes nothing`)
    }

    // 2. A real backup that cannot be written (the device is full): rolled back, and reported.
    const big = { app: 'rubikku', kind: 'backup', schema: 1, exportedAt: new Date().toISOString(), stores: { settings: SETTINGS, progress: progressSave({ xp: 9000 }), timer: { version: 1, state: { solves: Array.from({ length: 400 }, (_, i) => ({ id: `s${i}`, ms: 60000 + i, at: stamp, scramble: "R U R' U' F2 D L2 B", penalty: null })) } } } }
    await page.evaluate(() => {
      const real = Storage.prototype.setItem
      window.__realSetItem = real
      Storage.prototype.setItem = function (key, value) {
        if (key === 'rubikku:timer' && value.length > 2000) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        return real.call(this, key, value)
      }
    })
    await page.setInputFiles(t('backup-file'), file('big.json', JSON.stringify(big)))
    await page.click(t('backup-restore'))
    await page.waitForSelector(t('backup-error'))
    check(/nothing was changed/i.test(await page.textContent(t('backup-error'))), `import: a failed restore says nothing was changed (${await page.textContent(t('backup-error'))})`)
    equal(JSON.stringify(await dump(page)), JSON.stringify(before), 'import: a failed restore leaves every saved store exactly as it was')
    check(/340\s*XP/.test(await page.textContent('aside')), 'import: and the running app still shows the old progress')
    equal((await toastTexts(page)).filter((text) => /restored/i.test(text)).length, 0, 'import: no "restored" toast after a failure')
    await page.evaluate(() => (Storage.prototype.setItem = window.__realSetItem))

    // 3. The same backup, now that there is room: restored completely.
    await page.setInputFiles(t('backup-file'), file('big.json', JSON.stringify(big)))
    await page.click(t('backup-restore'))
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('rubikku:progress')).state.xp === 9000, null, { timeout: 10_000 })
    equal((await saved(page, 'timer')).solves.length, 400, 'import: a good backup restores every store')
    await page.waitForFunction(() => /9,?000\s*XP/.test(document.querySelector('aside')?.textContent ?? ''), null, { timeout: 10_000 }).catch(() => {})
    check(/9,?000\s*XP/.test(await page.textContent('aside')), 'import: and the app shows it without a reload')
    equal(p.errors.length, 0, `import: no console errors: ${p.errors.join(' | ')}`)
    await p.context.close()
  },

  // ── a page whose code failed to load: "Try again" really tries again ──
  async chunk() {
    const p = await profile()
    // Pages are fetched ahead of time once the first one has painted, so the network is cut
    // before the app starts: the idle prefetch fails quietly and the real visit shows the error.
    const page = p.watch(await p.context.newPage())
    let failing = true
    let requests = 0
    let settingsFailing = true
    await page.route('**/assets/TimerPage-*.js', (route) => {
      requests++
      return failing ? route.abort('internetdisconnected') : route.continue()
    })
    await page.route('**/assets/SettingsPage-*.js', (route) => (settingsFailing ? route.abort('internetdisconnected') : route.continue()))
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
    await page.waitForSelector(t('hero-cta'))
    await page.click('aside a[href="#/timer"]')
    await page.waitForSelector(t('error-page'))
    equal(await page.getAttribute(t('error-page'), 'data-error'), 'chunk', 'chunk: a failed page load shows the "didn’t load" page')
    check(/didn’t load/.test(await page.textContent(t('error-page'))), 'chunk: in friendly words')
    check(/saved/.test(await page.textContent(t('error-page'))), 'chunk: and reassures that progress is saved')
    const first = requests

    // Still failing: the second failure offers a reload (the chunk may be gone after an update).
    await page.click(t('error-retry'))
    await page.waitForSelector(t('error-reload'))
    check(requests > first, `chunk: "Try again" really requests the page again (${first} → ${requests})`)
    check(/updated/.test(await page.textContent(t('error-page'))), 'chunk: a second failure explains the app may have been updated')

    // The connection is back: Try again now works, with no reload.
    failing = false
    await page.evaluate(() => (window.__sameDocument = true))
    await page.click(t('error-retry'))
    await page.waitForFunction(() => !document.querySelector('[data-testid="error-page"]') && document.title.startsWith('Timer'), null, { timeout: 15_000 })
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').length > 40, null, { timeout: 15_000 })
    equal(await page.evaluate(() => window.__sameDocument), true, 'chunk: the page recovered without a reload')
    equal(await page.locator(t('error-page')).count(), 0, 'chunk: the error page is gone')

    // Navigating away from a failed page and back also retries.
    await page.unroute('**/assets/TimerPage-*.js')
    await page.click('aside a[href="#/settings"]')
    await page.waitForSelector(t('error-page'))
    settingsFailing = false
    await page.click('aside a[href="#/"]')
    await page.waitForSelector(t('hero-cta'))
    await page.click('aside a[href="#/settings"]')
    await page.waitForFunction(() => document.title.startsWith('Settings') && !document.querySelector('[data-testid="error-page"]'), null, { timeout: 15_000 })
    const loaded = await page.waitForSelector(t('backup-file'), { state: 'attached', timeout: 15_000 }).then(() => true, () => false)
    check(loaded, 'chunk: coming back to a page that failed loads it')
    await p.context.close()
  },

  // ── offline: one visit, then everything works with no network ──
  async offline() {
    const p = await profile({ serviceWorkers: 'allow', storage: { 'rubikku:progress': progressSave({ xp: 420, lessons: lessonsDone(2), badges: { 'first-steps': stamp } }) } })
    const page = await p.open('/')
    equal(await page.evaluate(() => 'serviceWorker' in navigator), true, 'offline: service workers are available')
    // The first visit installs the service worker, which caches the whole app.
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated' && !!navigator.serviceWorker.controller, null, { timeout: 60_000 })
    const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href')
    check(!!manifestHref, 'offline: the page links a web manifest')
    const manifest = await page.evaluate(async (href) => (await fetch(href)).json(), manifestHref)
    equal(manifest.name, 'Rubikku', 'offline: manifest name')
    equal(manifest.display, 'standalone', 'offline: it installs as a standalone app')
    check(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512' && icon.type === 'image/png'), 'offline: a 512px maskable PNG icon')
    check(manifest.icons.some((icon) => icon.purpose === 'any' && icon.sizes === '192x192' && icon.type === 'image/png'), 'offline: a 192px PNG icon')
    check(!!manifest.theme_color && !!manifest.background_color, 'offline: theme and background colours')
    for (const icon of manifest.icons) equal(await page.evaluate(async (src) => (await fetch(src)).status, new URL(icon.src, new URL(manifestHref, page.url())).href), 200, `offline: icon ${icon.src} exists`)
    const swText = await page.evaluate(async () => (await fetch('./sw.js')).text())
    const workerUrl = /assets\/solver\.worker-[\w-]+\.js/.exec(swText)?.[0]
    check(!!workerUrl, 'offline: the solver worker is in the precache list')
    for (const needle of ['three-', 'LessonPage-', 'TimerPage-', 'SolvePage-', 'figtree-latin-wght', 'jetbrains-mono-latin-wght', 'bricolage-grotesque-latin-wght', 'index.html']) check(swText.includes(needle), `offline: ${needle} is precached`)
    // What he had before going offline. (Opening a lesson later legitimately records "lesson started".)
    const kept = async () => {
      const progress = await saved(page, 'progress')
      const done = Object.entries(progress.lessons).filter(([, lesson]) => lesson.completedAt).map(([id]) => id).sort()
      return JSON.stringify({ xp: progress.xp, badges: Object.fromEntries(Object.entries(progress.badges).filter(([id]) => id !== 'first-steps' || true)), done, settings: await saved(page, 'settings') })
    }
    const before = await kept()

    await p.context.setOffline(true)
    p.errors.length = 0
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector(t('hero-cta'), { timeout: 20_000 })
    check(/420\s*XP/.test(await page.textContent('aside')), 'offline: a reload with no network shows Home with his progress')
    await cubeReady(page, 'home')
    equal(await page.evaluate(() => window.__rubikku.cubes.home.renderer()), 'webgl', 'offline: the 3D cube (three.js) loads from the cache')
    const routes = [
      ['/learn', 'Learn'],
      ['/learn/primer', 'Lesson'],
      ['/learn/daisy', 'Lesson'],
      ['/learn/full-solve', 'Lesson'],
      ['/play', 'Free play'],
      ['/notation', 'Notation'],
      ['/algorithms', 'Algorithms'],
      ['/algorithms/quiz', 'Flash cards'],
      ['/algorithms/sune', 'Algorithm'],
      ['/solve', 'Solve my cube'],
      ['/timer', 'Timer'],
      ['/progress', 'Progress'],
      ['/patterns', 'Patterns'],
      ['/patterns/checkerboard', 'Pattern'],
      ['/patterns?tab=flags', 'Patterns'],
      ['/patterns/flag-india', 'Pattern'],
      ['/patterns?tab=design&face=OOOWBWGGG', 'Patterns'],
      ['/settings', 'Settings'],
      ['/kitchen-sink', 'Kitchen sink'],
      ['/nowhere', 'Page not found'],
      ['/', 'Rubikku'],
    ]
    for (const [route, title] of routes) {
      await go(page, route)
      let why = ''
      await page.waitForFunction((title) => document.title.startsWith(title), title, { timeout: 15_000 }).catch((error) => (why = String(error.message).slice(0, 120)))
      // Wait for *this* route's page (the previous one stays on screen while it animates out).
      await page
        .waitForFunction(
          (route) => {
            const pages = [...document.querySelectorAll('main [data-route]')]
            // data-route is the path alone: "/patterns?tab=flags" is the /patterns page.
            const own = pages.length === 1 && pages[0].dataset.route === route.split('?')[0] ? pages[0] : null
            return !!own && own.textContent.trim().length > 30 && !own.querySelector('[role="status"][aria-label="Loading"]')
          },
          route,
          { timeout: 60_000 },
        )
        .catch((error) => (why = String(error.message).slice(0, 120)))
      const state = await page.evaluate(() => ({ title: document.title, error: !!document.querySelector('[data-testid="error-page"]'), text: (document.querySelector('main')?.textContent ?? '').trim().length, html: (document.querySelector('main')?.innerHTML ?? '').slice(0, 300) }))
      check(state.title.startsWith(title) && !state.error && state.text > 30, `offline: ${route} renders (${JSON.stringify(state).slice(0, 260)} ${why})`)
    }
    // The three typefaces come from the cache (the notation font is only fetched where moves are shown).
    await go(page, '/algorithms/sune')
    await page.waitForSelector('[data-testid="watch-panel"]', { timeout: 30_000 })
    await page.evaluate(() => document.fonts.ready)
    for (const font of ['Figtree Variable', 'Bricolage Grotesque Variable', 'JetBrains Mono Variable']) {
      equal(await page.evaluate((font) => document.fonts.check(`16px "${font}"`) && [...document.fonts].some((face) => face.family.replace(/"/g, '') === font && face.status === 'loaded'), font), true, `offline: the ${font} font is loaded`)
    }
    equal(await page.evaluate(() => [...document.fonts].filter((face) => face.status === 'error').length), 0, 'offline: no font failed to load')

    // A fresh navigation (new tab, deep link) works offline too.
    const deep = p.watch(await p.context.newPage())
    await deep.goto(`${BASE}/#/play`, { waitUntil: 'load' })
    await cubeReady(deep, 'play')
    equal(await deep.evaluate(() => window.__rubikku.cubes.play.renderer()), 'webgl', 'offline: a deep link in a new tab loads, cube and all')
    await deep.close()

    // The optimal solver: its worker, and the solver code it imports, come from the cache.
    const scramble = "R U2 F' L D2 B R' U F2 L' D B2 U' R2 F D' L2 B' U R"
    const cube = new Cube()
    cube.move(scramble)
    const solved = await page.evaluate(
      ({ url, state }) =>
        new Promise((resolve) => {
          const worker = new Worker(new URL(url, document.baseURI), { type: 'module' })
          const timer = setTimeout(() => resolve({ ok: false, error: 'timed out' }), 120_000)
          worker.onerror = (event) => resolve({ ok: false, error: event.message || 'worker failed to load' })
          worker.onmessage = (event) => {
            clearTimeout(timer)
            worker.terminate()
            resolve(event.data)
          }
          worker.postMessage({ id: 1, type: 'solve', state })
        }),
      { url: workerUrl, state: cube.asString() },
    )
    check(solved.ok === true && Array.isArray(solved.moves), `offline: the solver worker answers with no network (${JSON.stringify(solved).slice(0, 120)})`)
    if (solved.ok && Array.isArray(solved.moves)) {
      cube.move(solved.moves.join(' '))
      check(cube.isSolved(), 'offline: and its solution solves the cube')
      check(solved.moves.length <= 24, `offline: in a short solution (${solved.moves.length} turns)`)
    }
    equal(await kept(), before, 'offline: saved progress is untouched by going offline and reloading')
    const real = p.errors.filter((text) => !/favicon/.test(text))
    equal(real.length, 0, `offline: no console errors while offline: ${real.join(' | ')}`)
    await p.context.setOffline(false)

    // ── an update: it waits for "Refresh", and never touches saved progress ──
    if (!DIST) {
      console.log('    (update prompt not tested: pass --dist=<folder being served> to test it)')
    } else {
      const swPath = path.resolve(DIST, 'sw.js')
      const original = readFileSync(swPath, 'utf8')
      try {
        // A new deploy: the service worker file changes (here: one revision hash, same length).
        const match = /revision:"([0-9a-f]{8,})"/.exec(original)
        const flipped = match[1].slice(0, -1) + (match[1].endsWith('0') ? '1' : '0')
        writeFileSync(swPath, original.replace(match[0], `revision:"${flipped}"`))
        await go(page, '/learn/primer')
        await page.waitForSelector(t('lesson-panel'))
        await page.evaluate(() => (window.__sameDocument = true))
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
        await page.waitForSelector(`${t('toast')}[data-toast-key="app-update"]`, { timeout: 60_000 })
        check(/new version/i.test(await page.textContent(`${t('toast')}[data-toast-key="app-update"]`)), 'update: a toast offers the new version')
        await page.waitForTimeout(6000)
        equal(await page.evaluate(() => window.__sameDocument), true, 'update: the page is not reloaded under him')
        equal(await page.locator(`${t('toast')}[data-toast-key="app-update"]`).count(), 1, 'update: the prompt stays until he decides')
        equal(await page.evaluate(() => window.location.hash), '#/learn/primer', 'update: he is still in his lesson')
        const beforeUpdate = await dump(page)
        await Promise.all([page.waitForEvent('load', { timeout: 30_000 }), page.click(`${t('toast')}[data-toast-key="app-update"] button`)])
        await page.waitForSelector(t('lesson-panel'), { timeout: 20_000 })
        equal(await page.evaluate(() => window.__sameDocument), undefined, 'update: "Refresh" reloads into the new version')
        equal(await page.evaluate(() => window.location.hash), '#/learn/primer', 'update: on the same page')
        equal(JSON.stringify(await dump(page)), JSON.stringify(beforeUpdate), 'update: every saved store is byte-for-byte the same after the update')
        check(/420\s*XP/.test(await page.textContent('aside')), 'update: and his progress is on screen')
      } finally {
        writeFileSync(swPath, original)
      }
    }
    await p.context.close()
  },

  // ── Navigation: the old page fades out ON TOP of the new one; the content area is never empty ──
  async navigation() {
    const p = await profile({ storage: { 'rubikku:progress': progressSave({ xp: 420, lessons: lessonsDone(2) }) } })
    const page = await p.open('/')
    await page.waitForSelector(t('hero-cta'))
    // Load both pages' code first (a visit each), so this measures the transition, not the network.
    for (const route of ['/timer', '/patterns', '/progress', '/']) {
      await go(page, route)
      await page.waitForFunction((route) => [...document.querySelectorAll('main [data-route]')].some((el) => el.dataset.route === route && el.querySelector('h1')), route)
      await page.waitForTimeout(400)
    }
    /** Every animation frame for `ms` after `action`: how visible the most visible page title is (0 = an empty content area). */
    const watchFrames = async (action, ms = 600) => {
      await page.evaluate((ms) => {
        window.__frames = []
        const t0 = performance.now()
        const visible = (el) => {
          let o = 1
          for (let n = el; n && n.tagName !== 'MAIN'; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
          const r = el.getBoundingClientRect()
          return r.bottom > 0 && r.top < innerHeight && r.width > 0 ? o : 0
        }
        const step = () => {
          const pages = [...document.querySelectorAll('main [data-route]')]
          const best = Math.max(0, ...pages.map((pg) => Math.max(0, ...[...pg.querySelectorAll('h1, .stage, [data-testid]')].slice(0, 12).map(visible))))
          window.__frames.push({ t: Math.round(performance.now() - t0), pages: pages.map((pg) => pg.dataset.route).join('+'), best: Math.round(best * 100) / 100 })
          // Until the old page is gone (and at least `ms`; software GL can stall a mount for seconds).
          const settled = pages.length === 1 && performance.now() - t0 > ms
          if (!settled && performance.now() - t0 < 12_000) requestAnimationFrame(step)
          else window.__framesDone = true
        }
        requestAnimationFrame(step)
      }, ms)
      await page.evaluate(() => (window.__framesDone = false))
      await action()
      await page.waitForFunction(() => window.__framesDone, null, { timeout: 20_000 })
      return page.evaluate(() => window.__frames)
    }
    for (const [from, to] of [['/', '/timer'], ['/timer', '/patterns']]) {
      if (from !== '/') await go(page, from)
      await page.waitForTimeout(600)
      const frames = await watchFrames(() => page.click(`aside a[href="#${to}"]`))
      const worst = frames.reduce((a, b) => (b.best < a.best ? b : a), frames[0])
      check(frames.length > 5 && worst.best >= 0.3, `navigation ${from} → ${to}: no frame with an empty content area (worst frame ${JSON.stringify(worst)} of ${frames.length})`)
      check(frames.some((f) => f.pages.includes('+')), `navigation ${from} → ${to}: the two pages overlap (cross-fade) for a moment`)
      check(frames.at(-1).pages === to, `navigation ${from} → ${to}: only the new page is left (${frames.at(-1).pages})`)
      equal(await page.evaluate(() => document.activeElement?.id), 'main', `navigation ${from} → ${to}: focus moves to the page`)
      equal(await page.locator('main [data-route][inert]').count(), 0, `navigation ${from} → ${to}: nothing inert is left behind`)
    }
    // Scroll: a new page starts at the top; Back returns to where he was.
    await go(page, '/progress')
    await page.waitForSelector('main [data-route="/progress"] h1')
    await page.waitForTimeout(500)
    await page.evaluate(() => window.scrollTo(0, 700))
    await page.waitForTimeout(200)
    const leftAt = await page.evaluate(() => window.scrollY)
    await page.click('aside a[href="#/timer"]')
    await page.waitForTimeout(80)
    equal(await page.evaluate(() => window.scrollY), 0, 'navigation: the new page starts at the top straight away')
    await page.waitForTimeout(700)
    await page.goBack()
    await page.waitForFunction(() => [...document.querySelectorAll('main [data-route]')].length === 1 && document.querySelector('main [data-route="/progress"]'))
    await page.waitForTimeout(300)
    const back = await page.evaluate(() => window.scrollY)
    check(leftAt > 300 && Math.abs(back - leftAt) < 4, `navigation: Back returns to the same scroll (${leftAt} → ${back})`)
    check(p.errors.length === 0, `navigation: console errors: ${p.errors.join(' | ')}`)
    await p.context.close()
  },

  // ── The main controls are on the first screen (design review 2: M-new-2, N1) ──
  async fold() {
    const sizes = [
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]
    for (const viewport of sizes) {
      const p = await profile()
      const page = await p.open('/play')
      await page.setViewportSize(viewport)
      const size = `${viewport.width}×${viewport.height}`
      /** The bottom of what is not covered by the phone's tab bar. */
      const floor = () => page.evaluate(() => {
        const bar = [...document.querySelectorAll('nav')].find((nav) => getComputedStyle(nav).position === 'fixed' && nav.getBoundingClientRect().top > innerHeight / 2 && nav.getBoundingClientRect().height > 0)
        return bar ? bar.getBoundingClientRect().top : innerHeight
      })
      const below = async (selector) => {
        const box = await page.locator(selector).first().boundingBox()
        return box ? Math.round(box.y + box.height) : Infinity
      }
      await page.waitForSelector(t('hint-button'))
      await page.waitForTimeout(600)
      const bottom = await floor()
      for (const [name, selector] of [['Scramble', 'main button:has-text("Scramble")'], ['Hint', t('hint-button')], ['Undo', 'main button[aria-label="Undo"]'], ['Reset', 'main button:has-text("Reset")']]) {
        const y = await below(selector)
        check(y <= bottom, `fold ${size}: Free play's ${name} button is on the first screen (bottom ${y} ≤ ${bottom})`)
      }
      // The Scramble/Hint row: one row on tablets and up; on a phone Reset never sits alone.
      const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="play-actions"] > *')].map((el) => Math.round(el.getBoundingClientRect().top)))
      const distinct = [...new Set(rows.map((y) => Math.round(y / 8)))].length
      check(viewport.width >= 640 ? distinct === 1 : distinct <= 2, `fold ${size}: Free play's actions are ${viewport.width >= 640 ? 'one row' : 'at most two designed rows'} (${rows.join(',')})`)

      await go(page, '/timer')
      await page.waitForSelector(t('timer-pad'))
      await page.waitForTimeout(500)
      await page.keyboard.down('Space')
      await page.waitForTimeout(600)
      await page.keyboard.up('Space')
      await page.waitForTimeout(1200)
      await page.keyboard.press('KeyA')
      await page.waitForSelector('[role="radiogroup"][aria-label="Result"]', { timeout: 5000 })
      await page.waitForTimeout(700)
      const timeBottom = await below(t('timer-display'))
      const resultBottom = await below('[role="radiogroup"][aria-label="Result"]')
      check(timeBottom <= bottom, `fold ${size}: the timer's time is on the first screen (bottom ${timeBottom} ≤ ${bottom})`)
      check(resultBottom <= bottom, `fold ${size}: the OK / +2 / DNF row is on the first screen (bottom ${resultBottom} ≤ ${bottom})`)
      if (viewport.width >= 640) {
        const card = await page.locator(t('scramble')).evaluate((el) => {
          let n = el
          while (n && !n.className.includes('p-4')) n = n.parentElement
          return n ? Math.round(n.getBoundingClientRect().height) : 0
        })
        // Tablets in landscape and up: one compact row (portrait tablets wrap the moves a third row).
        check(card > 0 && card <= (viewport.width >= 1000 ? 230 : 280), `fold ${size}: the scramble card is compact (${card}px)`)
      }
      check(p.errors.length === 0, `fold ${size}: console errors: ${p.errors.join(' | ')}`)
      await p.context.close()
    }
  },
}
for (const [name, run] of Object.entries(tests)) {
  if (ONLY && !ONLY.includes(name)) continue
  const started = Date.now()
  const before = failures.length
  console.log(`▸ ${name}`)
  try {
    await run()
  } catch (error) {
    failures.push(`${name}: ${error.stack ?? error}`)
    console.error(`    ✗ ${name} threw: ${error.stack ?? error}`)
  }
  console.log(`  ${failures.length === before ? '✓' : '✗'} ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
}
await browser.close()
console.log(`\n${checks} checks, ${failures.length} failed`)
process.exit(failures.length === 0 ? 0 : 1)
