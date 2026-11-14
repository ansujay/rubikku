#!/usr/bin/env node
/**
 * End-to-end checks that the features agree with each other, in headless Chromium.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node e2e/integration.e2e.mjs [baseUrl] [--only=play,timer]
 *
 * Covers what no single feature's suite owns:
 *  - celebrations of the right tier from real play: a first Play solve is the "You solved the
 *    cube" takeover (the reward lifts it by itself), the next one a moment card; a pretend cube
 *    walked to solved in "Solve my cube" gets a stage moment at the end of each stage and a
 *    moment (never a takeover) at the finish;
 *  - routine first actions never take over the screen: a first timer solve, a first lesson
 *    opened (and no badge for merely opening one);
 *  - one hold, one story: Free play starts yellow on top; the hint card says whole-cube turns in
 *    words; the Timer and "Solve my cube" say when to hold white on top and when to roll it over;
 *    the walk-through counts progress by stage, not "turn 1 of 151".
 * (Lesson completion, the real-cube finish and a first notation round are checked in their own
 * suites: learn.e2e.mjs, solve.e2e.mjs and notation.e2e.mjs.)
 * Exits non-zero on any failed check or console error.
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '')
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1].split(',')

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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const t = (id) => `[data-testid="${id}"]`

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const settings = { version: 1, state: { theme: 'light', sound: false, motion: 'full', turnSpeed: 2, showFaceLabels: false } }

async function open(route, { storage = {}, viewport = { width: 1024, height: 768 } } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript(
    ({ storage, settings }) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('rubikku:settings', JSON.stringify(settings))
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, JSON.stringify(value))
    },
    { storage, settings },
  )
  // Every celebration that comes on screen, with its tier and (final) words.
  await context.addInitScript(() => {
    window.__cheers = []
    const seen = new Map()
    const scan = () => {
      for (const el of document.querySelectorAll('[data-testid="celebration"]')) {
        let entry = seen.get(el)
        if (!entry) {
          entry = { tier: el.dataset.tier, text: '' }
          seen.set(el, entry)
          window.__cheers.push(entry)
        }
        entry.text = el.textContent
      }
    }
    new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true })
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' })
  return { page, context, errors }
}

const cheers = (page) => page.evaluate(() => window.__cheers.map((c) => ({ ...c })))
const saved = (page, name) => page.evaluate((name) => JSON.parse(localStorage.getItem(`rubikku:${name}`) ?? 'null')?.state ?? null, name)
const cubeReady = (page, id) => page.waitForFunction((id) => window.__rubikku?.cubes?.[id]?.frames() > 0, id, { timeout: 30_000 })
const idle = (page, id) => page.evaluate((id) => window.__rubikku.cubes[id].whenIdle(), id)
const stateOf = (page, id) => page.evaluate((id) => window.__rubikku.cubes[id].getState(), id)
async function keys(page, id, moves) {
  for (const move of moves) {
    await page.evaluate((id) => document.querySelector(`[data-cube3d="${id}"]`)?.focus(), id)
    await page.keyboard.press(move.endsWith("'") ? `Shift+${move[0]}` : move[0].toLowerCase())
    await idle(page, id)
  }
}
const invert = (moves) => [...moves].reverse().map((m) => (m.endsWith("'") ? m[0] : `${m}'`))
/** Words for a whole-cube turn are fine; the letters x / y / z (with ' or 2) are not. */
const ROTATION_LETTER = /(^|[\s(·])[xyz][2'′]?(?=$|[\s).,·])/

/** A solved cube in the method's hold (z2): yellow on top, white underneath, green in front. */
const HELD = 'D'.repeat(9) + 'L'.repeat(9) + 'F'.repeat(9) + 'U'.repeat(9) + 'R'.repeat(9) + 'B'.repeat(9)
const MIX = "R U F' L D' B R' U' F L' D B' R U' F' L D B R' U".split(' ')

const tests = {
  // ── Free play: the method's hold, words for whole-cube turns, celebrations by tier ──
  async play() {
    const { page, context, errors } = await open('/play')
    await cubeReady(page, 'play')
    equal(await stateOf(page, 'play'), HELD, 'play: a fresh cube starts in the method’s hold — yellow on top, green in front')

    // His first ever solve: the takeover, in the achievement's words.
    await keys(page, 'play', MIX)
    check((await saved(page, 'play'))?.scrambled === true, 'play: twenty turns by hand count as a scramble')
    await keys(page, 'play', invert(MIX))
    await page.waitForSelector(`${t('celebration')}[data-tier="milestone"]`, { timeout: 6000 }).catch(() => {})
    await sleep(1200)
    let seen = await cheers(page)
    equal(seen.length, 1, 'play: a solve is one celebration (the reward and the page merge)')
    equal(seen[0]?.tier, 'milestone', 'play: the first solve ever is a milestone')
    check(/You\s+solved\s+the\s+cube/.test(seen[0]?.text ?? ''), `play: …headlined by the achievement (${seen[0]?.text})`)
    equal((await saved(page, 'progress'))?.counters?.solves, 1, 'play: the solve is counted')
    // (It leaves by itself after ~4 s; Escape skips it if it is still there.)
    if ((await page.locator(t('celebration')).count()) > 0) await page.keyboard.press('Escape')
    await page.waitForSelector(t('celebration'), { state: 'detached', timeout: 5000 })

    // The next one is a moment card.
    await keys(page, 'play', MIX)
    await keys(page, 'play', invert(MIX))
    await page.waitForSelector(t('celebration'), { timeout: 6000 }).catch(() => {})
    await sleep(1200)
    seen = await cheers(page)
    equal(seen.length, 2, 'play: the second solve is celebrated too')
    equal(seen[1]?.tier, 'moment', 'play: …as a moment, not a takeover')
    check(/You solved it/.test(seen[1]?.text ?? ''), `play: …in the page’s words (${seen[1]?.text})`)

    // A cube held white on top: the hint's first step is a hold, said in words.
    await page.fill('[aria-label="Moves to play"]', 'z2')
    await page.click('button:has-text("Play")')
    await page.waitForFunction(() => window.__rubikku.cubes.play.getState().slice(0, 9) === 'UUUUUUUUU', null, { timeout: 8000 })
    await idle(page, 'play')
    await keys(page, 'play', ['R', 'U', "F'"])
    await page.click(t('hint-button'))
    await page.waitForSelector(t('hint-card'))
    const hold = await page.locator(t('hint-hold')).textContent({ timeout: 4000 }).catch(() => '')
    check(/whole cube/i.test(hold), `play: the hint's hold step is in words (${hold})`)
    const card = await page.textContent(t('hint-card'))
    check(!ROTATION_LETTER.test(card), `play: the hint card shows no x / y / z letters (${card})`)
    check(errors.length === 0, `play: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── Timer: the hold line; a beginner's quick press earns no badges; a first counted timed solve is a card, not a takeover ──
  async timer() {
    // 1. A complete beginner: an 11-second press is not believable as a solve (QA 2, M10).
    {
      const { page, context } = await open('/timer')
      await page.waitForSelector(t('timer-pad'))
      const line = await page.textContent(t('scramble-hold'))
      check(/white on top, green in front/.test(line) && /yellow is on top/.test(line), `timer: the scramble says how to hold it and when to roll it over (${line})`)
      await page.keyboard.down('Space')
      await sleep(450)
      await page.keyboard.up('Space')
      await sleep(11_500)
      await page.keyboard.press('KeyA')
      await page.waitForSelector(`${t('timer-pad')}[data-phase="idle"]`, { state: 'attached' })
      await sleep(1500)
      const before = await saved(page, 'progress')
      equal(before?.counters?.timedSolves, 1, 'timer: a beginner’s press is kept as a time')
      equal(Object.keys(before?.badges ?? {}).length, 0, 'timer: …but earns no badges before he has solved the cube for real')
      check((before?.xp ?? 0) <= 10, `timer: …and only a little XP (${before?.xp})`)
      await context.close()
    }
    // 2. He has solved the cube in Free play: a 21-second timed solve counts, with a card.
    const solvedOnce = { version: 1, state: { xp: 130, badges: { 'first-solve': new Date(Date.now() - 86_400_000).toISOString() }, counters: { solves: 1, fullSolves: 1 } } }
    const { page, context, errors } = await open('/timer', { storage: { 'rubikku:progress': solvedOnce } })
    await page.waitForSelector(t('timer-pad'))
    await page.keyboard.down('Space')
    await sleep(450)
    await page.keyboard.up('Space')
    await sleep(21_000)
    await page.keyboard.press('KeyA')
    await page.waitForSelector(`${t('timer-pad')}[data-phase="idle"]`, { state: 'attached' })
    await sleep(2000)
    const progress = await saved(page, 'progress')
    equal(progress?.counters?.timedSolves, 1, 'timer: the first timed solve counts')
    check(Boolean(progress?.badges?.['sub-1']), 'timer: it earns the speed badges it beat')
    const seen = await cheers(page)
    check(seen.length >= 1, 'timer: the first counted timed solve is celebrated')
    check(seen.every((c) => c.tier === 'moment'), `timer: …with a card, never a takeover (${seen.map((c) => c.tier).join(', ')})`)
    // Space straight away starts the next attempt: nothing is in the way.
    await page.keyboard.down('Space')
    await sleep(450)
    equal(await page.getAttribute(t('timer-pad'), 'data-phase'), 'ready', 'timer: Space arms the next attempt right after a celebration')
    await page.keyboard.up('Space')
    await sleep(300)
    equal(await page.locator(t('celebration')).count(), 0, 'timer: a celebration gets out of the way of a running attempt')
    await page.keyboard.press('Escape')
    check(errors.length === 0, `timer: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── a first lesson opened: no badge for opening it, no takeover ──
  async lesson() {
    const { page, context, errors } = await open('/learn/primer')
    await page.waitForSelector('[data-testid="lesson-panel"]')
    await sleep(1500)
    const progress = await saved(page, 'progress')
    check(!progress?.badges?.['first-steps'], 'lesson: opening the first lesson earns no badge (First Steps is for finishing the basics)')
    equal((await cheers(page)).length, 0, 'lesson: opening the first lesson is not celebrated')
    check(errors.length === 0, `lesson: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── Solve my cube: the hold story, progress by stage, a moment per stage ──
  async solve() {
    const { page, context, errors } = await open('/solve')
    await page.waitForSelector(t('intro-panel'))
    const intro = await page.textContent(t('intro-panel'))
    check(intro.includes('For copying the colours, hold it white on top and green in front; we’ll roll it to yellow-up to solve.'), 'solve: the intro says which way to hold it, and why')
    await page.click(t('begin-solve'))
    const entry = await page.textContent(t('entry-hold'))
    check(entry.includes('hold it white on top and green in front') && entry.includes('roll it to yellow-up'), `solve: the entry says it too (${entry})`)
    await page.click(t('more-helpers'))
    await page.click(t('fill-random'))
    await page.waitForSelector(`${t('check-card')}[data-status="ok"]`)
    await page.click(t('entry-continue'))
    await page.click(t('start-solve'))
    await page.waitForSelector(`${t('step-card')}[data-kind="hold"]`)
    const progress = await page.textContent(t('walk-progress'))
    check(/^Stage 1 of 8 · The daisy · step 1 of \d+$/.test(progress.trim()), `solve: progress is by stage (${progress})`)
    check(!/turn \d+ of \d+/i.test(await page.textContent(t('walk-panel'))), 'solve: no "turn 1 of 151"')
    const big = await page.textContent(t('big-move'))
    check(/whole cube/i.test(big) && !ROTATION_LETTER.test(big), `solve: the first hold is said in words, as the lessons say it (${big})`)
    // Walk to the end of the daisy: a moment, not a takeover.
    for (let guard = 0; guard < 120 && (await page.getAttribute(t('walk-panel'), 'data-state')) !== 'milestone'; guard++) await page.click(t('walk-next'))
    equal(await page.getAttribute(t('walk-panel'), 'data-state'), 'milestone', 'solve: reached the end of stage 1')
    await page.waitForSelector(t('celebration'), { timeout: 4000 }).catch(() => {})
    const seen = await cheers(page)
    equal(seen.length, 1, 'solve: finishing a stage is celebrated once')
    equal(seen[0]?.tier, 'moment', 'solve: …as a moment')
    check(/daisy/i.test(seen[0]?.text ?? ''), `solve: …naming the stage (${seen[0]?.text})`)
    check(/Stage 1 of 8/.test(await page.textContent(t('walk-panel'))), 'solve: the tracker caption names the stage')
    check(errors.length === 0, `solve: console errors: ${errors.join(' | ')}`)
    await context.close()
  },
}

for (const [name, run] of Object.entries(tests)) {
  if (ONLY && !ONLY.includes(name)) continue
  const before = checks
  const failed = failures.length
  try {
    await run()
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
    console.error(`    ✗ ${name} threw: ${error.message}`)
  }
  console.log(`  ${failures.length === failed ? 'ok ' : 'FAIL'} ${name} (${checks - before} checks)`)
}
await browser.close()
console.log(failures.length === 0 ? `\nAll ${checks} checks passed.` : `\n${failures.length} of ${checks} checks failed.`)
process.exit(failures.length === 0 ? 0 : 1)
