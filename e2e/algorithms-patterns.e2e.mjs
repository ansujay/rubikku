#!/usr/bin/env node
/**
 * End-to-end tests for the algorithm cards and the pattern gallery, in headless Chromium
 * (software WebGL) with real keyboard input on the cube.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node e2e/algorithms-patterns.e2e.mjs [baseUrl] [--only=gallery,practise]
 *
 * Expected cube states are computed independently with cubejs.
 * Covers: the gallery (filter, search, deep links), stepping through an algorithm, a practice
 * rep with a refused wrong move and a double turn, mastery shown on the cards, the flash cards,
 * making a pattern, the collected state, undoing it, follow-along, persistence across reloads,
 * the flags tab (making Nigeria, India's rotated start and hold), the "make your own" designer,
 * and no console errors.
 */
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const Cube = createRequire(import.meta.url)('cubejs')
const args = process.argv.slice(2)
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '')
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1].split(',')
const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
const after = (alg) => {
  const cube = new Cube()
  if (alg.trim()) cube.move(alg)
  return cube.asString()
}

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

async function open(route, { storage = {}, cube } = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
  await context.addInitScript(
    ({ storage }) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('rubikku:settings', JSON.stringify({ version: 1, state: { theme: 'light', sound: false, motion: 'full', turnSpeed: 2, showFaceLabels: false } }))
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, JSON.stringify(value))
    },
    { storage },
  )
  const page = await context.newPage()
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' })
  if (cube) await cubeReady(page, cube)
  return { page, context, errors }
}

const cubeReady = (page, id) => page.waitForFunction((id) => window.__rubikku?.cubes?.[id]?.frames() > 0, id, { timeout: 20_000 })
const idle = (page, id) => page.evaluate((id) => window.__rubikku.cubes[id].whenIdle(), id)
const stateOf = (page, id) => page.evaluate((id) => window.__rubikku.cubes[id].getState(), id)
const saved = (page, name) => page.evaluate((name) => JSON.parse(localStorage.getItem(`rubikku:${name}`) ?? 'null')?.state ?? null, name)
const waitState = (page, id, state) => page.waitForFunction(([id, state]) => window.__rubikku.cubes[id].getState() === state && !window.__rubikku.cubes[id].isAnimating(), [id, state], { timeout: 10_000 })

async function keys(page, id, moves) {
  for (const move of moves.split(' ')) {
    await page.evaluate(() => document.querySelector('.stage [tabindex]').focus())
    await page.keyboard.press(move.endsWith("'") ? `Shift+${move[0]}` : move[0])
    await idle(page, id)
    await page.waitForTimeout(40)
  }
}

const tests = {
  // ── the gallery: all fourteen, grouped, filter and search, links ──
  async gallery() {
    const { page, context, errors } = await open('/algorithms')
    await page.waitForSelector('[data-testid^=alg-card-]')
    equal(await page.locator('[data-testid^=alg-card-]').count(), 14, 'fourteen algorithm cards')
    equal(await page.locator('[data-testid^=alg-card-] canvas, [data-testid^=alg-card-] [data-minicube]').count(), 14, 'each card has a mini cube')
    check((await page.evaluate(() => window.__rubikku.contexts)) <= 1, 'all the minis share one WebGL context')
    equal(await page.locator('a[href="#/learn/white-corners"]').count(), 1, 'a stage group links to its lesson')

    await page.click('[data-testid=filter-yellow-edges]')
    equal(await page.locator('[data-testid^=alg-card-]').count(), 2, 'filtering by stage leaves that stage')
    await page.click('text=All')
    await page.fill('[data-testid=alg-search]', 'sune')
    equal(await page.locator('[data-testid^=alg-card-]').count(), 1, 'search by name')
    await page.fill('[data-testid=alg-search]', "L' U' L")
    check((await page.locator('[data-testid=alg-card-left-trigger]').count()) === 1, 'search by moves')
    await page.fill('[data-testid=alg-search]', 'zzz')
    check((await page.textContent('main')).includes('No algorithm matches'), 'an empty search says so')
    await page.fill('[data-testid=alg-search]', 'sune')
    await page.click('[data-testid=alg-card-sune]')
    await page.waitForSelector('[data-testid=watch-panel]')
    check(page.url().endsWith('#/algorithms/sune'), `the card opens a deep-linkable page (${page.url()})`)
    equal(await page.getAttribute('[data-testid=lesson-link]', 'href'), '#/learn/yellow-edges', 'the detail page links to its lesson')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── watch: the case is set up, stepping plays the algorithm and ends solved ──
  async watch() {
    const { page, context, errors } = await open('/algorithms/right-trigger', { cube: 'algorithm' })
    // Beginner hold (z2), then the inverse of the trigger.
    const start = after("z2 U R U' R'")
    equal(await stateOf(page, 'algorithm'), start, 'the case is set up: one trigger away from solved, yellow on top')
    check((await page.textContent('[data-testid=move-text]')).includes('Right face, clockwise'), 'the next move is described in words')
    await page.click('[aria-label="Step forward"]')
    await waitState(page, 'algorithm', after("z2 U R U' R' R"))
    check((await page.textContent('[data-testid=move-text]')).includes('Top face, clockwise'), 'the description follows the steps')
    await page.click('[aria-label="Play"]')
    await waitState(page, 'algorithm', after('z2'))
    check((await page.textContent('[data-testid=move-text]')).includes('Done'), 'at the end it says so')
    check((await page.textContent('[data-testid=mnemonic]')).includes('over'), 'the mnemonic is shown beat by beat')

    // Mirror: the left-hand twin.
    await page.click('[role=switch]')
    await waitState(page, 'algorithm', after("z2 U' L' U L"))
    check(page.url().includes('mirror=1'), 'the mirror is part of the URL')
    equal(await page.locator('a[href="#/algorithms/left-trigger"]').count(), 1, 'the mirror links to its twin')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── practise: a refused wrong move, a double turn, clean reps, mastery, persistence ──
  async practise() {
    const { page, context, errors } = await open('/algorithms/sune?mode=practise', { cube: 'algorithm' })
    await page.waitForSelector('[data-testid=practise-panel]')
    const start = after("z2 R U2 R' U' R U' R'")
    equal(await stateOf(page, 'algorithm'), start, 'the deep link opens practice on the set-up case')
    equal(await page.getAttribute('[data-testid=practise-panel]', 'data-guidance'), 'arrows', 'the first reps show arrows')

    await keys(page, 'algorithm', 'F')
    equal(await stateOf(page, 'algorithm'), start, 'a wrong move is refused: the cube does not change')
    check((await page.textContent('[data-testid=practise-line]')).includes('Not that one'), 'and the next move is pointed out')

    // R U R' U R U2 R' — the double as two quarter turns.
    await keys(page, 'algorithm', "R U R' U R U U R'")
    await page.waitForSelector('[data-testid=rep-done]')
    check((await page.textContent('[data-testid=rep-done]')).includes('Rep done'), 'a rep with a slip is done but not clean')
    await waitState(page, 'algorithm', start)
    await page.waitForFunction(() => document.querySelector('[data-testid=practise-panel]')?.dataset.follow === '0')
    check((await page.textContent('[data-testid=rep-count]')).replace(/\s+/g, ' ').includes('1 rep'), 'the rep is counted')
    let stats = (await saved(page, 'algorithms')).stats.sune
    equal(JSON.stringify(stats), JSON.stringify({ reps: 1, clean: 0, blind: 0 }), 'stats: one rep, not clean')
    check((await saved(page, 'progress')).algorithms.includes('sune'), 'the progress store knows it was practised')

    // Two clean reps (the double the other way round this time): help fades to "moves".
    for (let i = 0; i < 2; i++) {
      await keys(page, 'algorithm', "R U R' U R U' U' R'")
      await page.waitForSelector('[data-testid=rep-done]')
      check((await page.textContent('[data-testid=rep-done]')).includes('Clean rep'), `clean rep ${i + 1}`)
      await waitState(page, 'algorithm', start)
      await page.waitForFunction(() => document.querySelector('[data-testid=practise-panel]')?.dataset.follow === '0' && !document.querySelector('[data-testid=rep-done]'))
    }
    equal(await page.getAttribute('[data-testid=practise-panel]', 'data-guidance'), 'moves', 'after two clean reps the arrows go')

    // From memory: the moves are hidden; three clean ones master it.
    await page.click('[data-testid=practise-panel] [role=radio]:has-text("Memory")')
    await page.waitForSelector('[data-testid=hidden-moves]')
    check(!(await page.textContent('[data-testid=hidden-moves]')).includes('R'), 'in memory mode the moves are hidden')
    for (let i = 0; i < 3; i++) {
      await keys(page, 'algorithm', "R U R' U R U U R'")
      await page.waitForSelector('[data-testid=rep-done]')
      await waitState(page, 'algorithm', start)
      await page.waitForFunction(() => document.querySelector('[data-testid=practise-panel]')?.dataset.follow === '0' && !document.querySelector('[data-testid=rep-done]'))
    }
    stats = (await saved(page, 'algorithms')).stats.sune
    equal(JSON.stringify(stats), JSON.stringify({ reps: 6, clean: 5, blind: 3 }), 'stats after six reps')
    await page.waitForSelector('header [data-status=mastered]')

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=practise-panel]')
    equal(await page.locator('header [data-status=mastered]').count(), 1, 'mastery survives a reload')
    check((await page.textContent('[data-testid=rep-count]')).replace(/\s+/g, ' ').includes('6 reps'), 'the rep count survives a reload')
    await page.goto(`${BASE}/#/algorithms`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=alg-card-sune]')
    equal(await page.locator('[data-testid=alg-card-sune] [data-status=mastered]').count(), 1, 'the card shows it as mastered')
    equal(await page.locator('[data-status=learning]').count(), 13, 'the others are still "learning"')
    check((await page.textContent('[data-testid=mastered-count]')).includes('1 mastered'), 'the gallery counts it')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── flash cards ──
  async quiz() {
    const { page, context, errors } = await open('/algorithms')
    await page.click('[data-testid=open-quiz]')
    await page.waitForSelector('[data-testid=quiz-card]')
    for (let i = 0; i < 6; i++) {
      // Wait for the next card to slide in (the old one leaves first).
      await page.waitForFunction((n) => document.querySelector('[data-testid=quiz-progress]')?.textContent.replace(/\s+/g, ' ').trim() === `${n} / 6` && document.querySelectorAll('[data-option][aria-disabled=false]').length === 4, i + 1)
      const answer = await page.getAttribute('[data-testid=quiz-card]', 'data-answer')
      equal(await page.locator('[data-option]').count(), 4, 'four choices')
      // Get the second card wrong.
      const pick = i === 1 ? await page.evaluate((a) => [...document.querySelectorAll('[data-option]')].map((el) => el.dataset.option).find((id) => id !== a), answer) : answer
      await page.click(`[data-option="${pick}"]`)
      await page.click('[data-testid=quiz-next]')
    }
    await page.waitForSelector('[data-testid=quiz-summary]')
    check((await page.textContent('[data-testid=quiz-summary]')).replace(/\s+/g, '').includes('5/6'), 'the score is 5 of 6')
    equal((await saved(page, 'algorithms')).quizBest, 5, 'the best score is saved')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── patterns: gallery, make one yourself, collected state, undo, persistence ──
  async pattern() {
    const { page, context, errors } = await open('/patterns')
    await page.waitForSelector('[data-testid^=pattern-card-]')
    equal(await page.locator('[data-testid^=pattern-card-]').count(), 12, 'twelve pattern cards')
    check((await page.textContent('[data-testid=collection-count]')).replace(/\s+/g, ' ').includes('0 of 12'), 'nothing collected yet')
    equal(await page.getAttribute('[data-testid=pattern-card-checkerboard]', 'data-made'), 'false', 'the checkerboard is not made yet')
    await page.click('[data-testid=pattern-card-checkerboard]')
    await cubeReady(page, 'pattern')
    check(page.url().endsWith('#/patterns/checkerboard'), 'the card opens a deep-linkable page')

    // Watch it, then undo it.
    await page.click('[data-testid=watch-play]')
    const board = after('M2 E2 S2')
    await waitState(page, 'pattern', board)
    equal((await page.textContent('[data-testid=cube-status]')).trim(), 'Checkerboard', 'the cube is recognised as the pattern')
    equal(await page.textContent('[data-testid=collected-badge]'), 'Not made yet', 'watching does not collect it')
    await page.click('[data-testid=undo-it]')
    await waitState(page, 'pattern', SOLVED)
    check((await page.textContent('[data-testid=undo-card]')).includes('Back to solved'), 'undoing ends on a solved cube')

    // Try it yourself.
    await page.click('[role=radio]:has-text("Try it")')
    await page.waitForSelector('[data-testid=try-panel]')
    check(page.url().includes('mode=try'), 'the mode is part of the URL')
    await keys(page, 'pattern', 'R')
    equal(await stateOf(page, 'pattern'), SOLVED, 'a wrong move is refused')
    check((await page.textContent('[data-testid=try-line]')).includes('Not that one'), 'and explained')
    await keys(page, 'pattern', 'M M')
    equal(await page.getAttribute('[data-testid=try-panel]', 'data-follow'), '1', 'M M counts as M2')

    // Half-way reload: still one move in.
    await page.reload({ waitUntil: 'networkidle' })
    await cubeReady(page, 'pattern')
    await page.waitForSelector('[data-testid=try-panel]')
    equal(await page.getAttribute('[data-testid=try-panel]', 'data-follow'), '1', 'a reload keeps his place in the pattern')
    equal(await stateOf(page, 'pattern'), after('M2'), 'and the cube as he left it')

    await keys(page, 'pattern', "E' E' S")
    await page.evaluate(() => document.querySelector('.stage [tabindex]').focus())
    await page.keyboard.press('2') // repeat the last turn: S S = S2
    await page.waitForSelector('[data-testid=made-banner]')
    equal(await stateOf(page, 'pattern'), board, 'the cube shows the checkerboard')
    await page.waitForFunction(() => document.querySelector('[data-testid=collected-badge]')?.textContent.includes('Collected'))
    const progress = await saved(page, 'progress')
    check(progress.patterns.includes('checkerboard'), 'the pattern is in the progress store')
    // 10 XP for a new pattern — plus the 50 XP daily bonus on days when "Make a pattern" is the daily challenge.
    const dailyBonus = progress.log.some((entry) => entry.type === 'daily-challenge-completed') ? 50 : 0
    equal(progress.xp, 10 + dailyBonus, 'first-time XP for a pattern')

    // Undo from here too.
    await page.click('[data-testid=undo-it]')
    await waitState(page, 'pattern', SOLVED)

    await page.goto(`${BASE}/#/patterns`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid^=pattern-card-]')
    check((await page.textContent('[data-testid=collection-count]')).replace(/\s+/g, ' ').includes('1 of 12'), 'the gallery counts it')
    equal(await page.getAttribute('[data-testid=pattern-card-checkerboard]', 'data-made'), 'true', 'the card is marked collected')
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid^=pattern-card-]')
    equal(await page.getAttribute('[data-testid=pattern-card-checkerboard]', 'data-made'), 'true', 'collected survives a reload')
    await page.click('[data-testid=filter-made]')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^=pattern-card-]').length === 1)
    check(true, 'the "collected" filter shows just that one')
    await page.click('[data-testid=filter-todo]')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^=pattern-card-]').length === 11)
    check(true, 'the "to make" filter shows the other eleven')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── follow along with a real cube ──
  async follow() {
    const { page, context, errors } = await open('/patterns/six-spots?mode=follow', { cube: 'pattern' })
    await page.waitForSelector('[data-testid=follow-panel]')
    equal((await page.textContent('[data-testid=follow-move]')).trim(), 'U', 'the first move is shown large')
    const size = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid=follow-move]')).fontSize))
    check(size >= 110, `the move is big enough to read from a distance (${size}px)`)
    await page.keyboard.press('Space')
    await waitState(page, 'pattern', after('U'))
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=follow-move]').length === 1)
    equal((await page.textContent('[data-testid=follow-move]')).trim(), 'D′', 'space moves on to the next move')
    await page.click('[data-testid=follow-tap]')
    await waitState(page, 'pattern', after("U D'"))
    equal((await page.textContent('[data-testid=follow-count]')).replace(/\s+/g, ' ').trim(), '3 / 8', 'tapping advances too')

    await page.reload({ waitUntil: 'networkidle' })
    await cubeReady(page, 'pattern')
    equal(await page.getAttribute('[data-testid=follow-panel]', 'data-position'), '2', 'a reload keeps the place')
    equal(await stateOf(page, 'pattern'), after("U D'"), 'and the cube matches')

    for (let i = 0; i < 6; i++) {
      await page.click('[data-testid=follow-next]')
      await idle(page, 'pattern')
    }
    await waitState(page, 'pattern', after("U D' R L' F B' U D'"))
    await page.click('[data-testid=follow-made]')
    await page.waitForFunction(() => document.querySelector('[data-testid=collected-badge]')?.textContent.includes('Collected'))
    check((await saved(page, 'progress')).patterns.includes('six-spots'), 'saying "I made it" on the real cube collects it')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── flags: the tab, the 21 cards, making Nigeria, counts ──
  async flags() {
    const { page, context, errors } = await open('/patterns')
    await page.waitForSelector('[data-testid^=pattern-card-]')
    await page.getByRole('tab', { name: 'Flags' }).click()
    await page.waitForSelector('[data-testid^=flag-card-]')
    check(page.url().endsWith('#/patterns?tab=flags'), `the Flags tab is in the address (${page.url()})`)
    equal(await page.locator('[data-testid^=flag-card-]').count(), 21, 'twenty-one flag cards')
    equal(await page.locator('[data-testid^=pattern-card-]').count(), 0, 'and no trick cards on that tab')
    check((await page.textContent('[data-testid=flag-collection-count]')).replace(/\s+/g, ' ').includes('0 of 21'), 'no flags made yet')
    check((await page.locator('[data-testid^=flag-family-]').count()) >= 2, 'the flags are grouped in families')
    check((await page.locator('[data-testid=flags-left-out]').count()) === 1, 'there is a "why isn\'t my flag here" note')

    await page.click('[data-testid=flag-card-flag-nigeria]')
    await cubeReady(page, 'pattern')
    check(page.url().endsWith('#/patterns/flag-nigeria'), 'the card opens a deep-linkable page')
    equal(await page.getAttribute('[data-testid=back-link]', 'href'), '#/patterns?tab=flags', 'the back link returns to the Flags tab')
    const flagEnd = after('M')
    equal(await stateOf(page, 'pattern'), SOLVED, 'Nigeria starts from a plain solved cube')
    await page.click('[data-testid=watch-play]')
    await waitState(page, 'pattern', flagEnd)
    equal((await stateOf(page, 'pattern')).slice(18, 27), flagEnd.slice(18, 27), 'watching ends with the flag on the front face')
    equal(await page.textContent('[data-testid=collected-badge]'), 'Not made yet', 'watching does not collect it')
    await page.click('[data-testid=undo-it]')
    await waitState(page, 'pattern', SOLVED)

    await page.click('[role=radio]:has-text("Try it")')
    await page.waitForSelector('[data-testid=try-panel]')
    await keys(page, 'pattern', 'M')
    await page.waitForSelector('[data-testid=made-banner]')
    equal((await stateOf(page, 'pattern')).slice(18, 27), flagEnd.slice(18, 27), 'trying it with M puts the flag on the front')
    await page.waitForFunction(() => document.querySelector('[data-testid=collected-badge]')?.textContent.includes('Collected'))
    const progress = await saved(page, 'progress')
    check(progress.patterns.includes('flag-nigeria'), 'progress has flag-nigeria')
    check(!Object.keys(progress.badges).some((id) => id === 'flag-bearer' || id === 'pattern-collector'), 'one flag earns no flag or trick badge yet')

    await page.goto(`${BASE}/#/patterns?tab=flags`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid^=flag-card-]')
    check((await page.textContent('[data-testid=flag-collection-count]')).replace(/\s+/g, ' ').includes('1 of 21'), 'the Flags tab counts "1 of 21"')
    equal(await page.getAttribute('[data-testid=flag-card-flag-nigeria]', 'data-made'), 'true', 'the Nigeria card is marked made')
    await page.getByRole('tab', { name: 'Tricks' }).click()
    await page.waitForSelector('[data-testid^=pattern-card-]')
    check((await page.textContent('[data-testid=collection-count]')).replace(/\s+/g, ' ').includes('0 of 12'), 'Tricks still say "0 of 12"')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── a flag that starts from a rotated cube: the hold, and follow mode ──
  async 'flag-hold'() {
    const { page, context, errors } = await open('/patterns/flag-india', { cube: 'pattern' })
    await page.waitForSelector('[data-testid=watch-panel]')
    const hold = (await page.textContent('[data-testid=hold-line]')).replace(/\s+/g, ' ')
    check(/white/i.test(hold) && /blue/i.test(hold), `the hold line names white and blue (${hold})`)
    check(await page.locator('[data-testid=flag-compare]').isVisible(), 'the real-vs-cube card is shown')
    const start = after('y2')
    equal(await stateOf(page, 'pattern'), start, 'India starts from a solved cube held with white on top')
    await page.click('[data-testid=watch-play]')
    await waitState(page, 'pattern', after("y2 R' D2 U B' L"))
    check((await page.textContent('[data-testid=cube-status]')).includes('India'), 'at the end the cube is recognised as India')
    await page.close()

    const follow = await open('/patterns/flag-india?mode=follow', { cube: 'pattern' })
    await follow.page.waitForSelector('[data-testid=follow-panel]')
    equal(await stateOf(follow.page, 'pattern'), start, 'follow mode starts from the rotated solved cube')
    equal((await follow.page.textContent('[data-testid=follow-move]')).trim(), 'R′', 'the first move is R′')
    check((await follow.page.textContent('[data-testid=follow-hold]')).includes('white on top and blue facing you'), 'the hold is explained for a real cube')
    equal(follow.errors.length, 0, `no console errors: ${follow.errors.join(' | ')}`)
    await follow.context.close()
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── the designer: paint, result, make it, try it, the badge, the share link ──
  async design() {
    const cells = (page) => page.$$eval('[data-testid=design-canvas] [role=group] button[data-color]', (els) => els.map((e) => e.dataset.color[0].toUpperCase()).join(''))
    const ready = (page) => page.waitForSelector('[data-testid=design-result][data-state=ready]', { timeout: 15_000 })
    const { page, context, errors } = await open('/patterns')
    await page.getByRole('tab', { name: 'Make your own' }).click()
    await page.waitForSelector('[data-testid=design-studio]')
    check(page.url().includes('#/patterns/design?face=WWWWWWWWW'), `the tab opens the designer (${page.url()})`)
    equal(await page.getAttribute('[data-testid=design-result]', 'data-state'), 'plain', 'a blank canvas is plain, not "impossible"')
    check(await page.locator('[data-testid=design-make]').isDisabled(), 'Make it is off for a plain face')

    await page.click('[data-testid=design-paint-red] button')
    await page.locator('[data-testid=design-canvas] [role=group][aria-label^="Your design"] button').nth(4).click()
    await ready(page)
    equal(await cells(page), 'WWWWRWWWW', 'the centre is painted red')
    equal(await page.getAttribute('[data-testid=design-result]', 'data-moves'), '6', 'a red dot takes 6 moves')
    check(await page.locator('[data-testid=design-looks-like]').isVisible(), 'it says the design looks like a real flag (Japan)')
    check((await page.evaluate(() => location.hash)).includes('face=WWWWRWWWW'), 'the address follows the canvas')
    const alg = await page.getAttribute('[data-testid=design-result]', 'data-alg')
    equal(alg.split(' ').length, 6, 'the result carries its moves')

    await page.click('[data-testid=design-make]')
    await page.waitForSelector('[data-testid=watch-panel]', { timeout: 15_000 })
    equal(await page.evaluate(() => location.hash), '#/patterns/flag-own?face=WWWWRWWWW', 'Make it opens the player with the design')
    await cubeReady(page, 'pattern')
    await page.click('[role=radio]:has-text("Try it")')
    await page.waitForSelector('[data-testid=try-panel]')
    await keys(page, 'pattern', alg)
    await page.waitForSelector('[data-testid=made-banner]', { timeout: 8000 })
    await page.waitForFunction(() => document.querySelector('[data-testid=collected-badge]')?.textContent.includes('Made it'))
    const progress = await saved(page, 'progress')
    check(Object.keys(progress.badges).includes('flag-designer'), 'the Flag Designer badge is earned')
    check(!Object.keys(progress.badges).some((id) => id === 'flag-bearer' || id === 'pattern-collector'), 'and no flag or trick badge')
    equal(await page.getAttribute('[data-testid=back-link]', 'href'), '#/patterns/design?face=WWWWRWWWW', 'the back link returns to the design')
    await page.goto(`${BASE}/#/patterns`, { waitUntil: 'networkidle' })
    check((await page.textContent('[data-testid=collection-count]')).replace(/\s+/g, ' ').includes('0 of 12'), 'Tricks still say "0 of 12"')
    await page.getByRole('tab', { name: 'Flags' }).click()
    check((await page.textContent('[data-testid=flag-collection-count]')).replace(/\s+/g, ' ').includes('0 of 21'), 'Flags still say "0 of 21"')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()

    // The share link, in a fresh browser, and a reload.
    const fresh = await open('/patterns/design?face=GGGWWWRRR')
    await fresh.page.waitForSelector('[data-testid=design-studio]')
    await ready(fresh.page)
    equal(await cells(fresh.page), 'GGGWWWRRR', 'a shared designer link opens on its face')
    await fresh.page.reload({ waitUntil: 'networkidle' })
    await ready(fresh.page)
    equal(await cells(fresh.page), 'GGGWWWRRR', 'the face survives a reload')
    await fresh.page.goto(`${BASE}/#/patterns/flag-own?face=GGGWWWRRR`, { waitUntil: 'networkidle' })
    await fresh.page.waitForSelector('[data-testid=watch-panel]', { timeout: 15_000 })
    equal((await fresh.page.textContent('h1')).trim(), 'Your design', 'the player link shows "Your design"')
    await fresh.page.reload({ waitUntil: 'networkidle' })
    await fresh.page.waitForSelector('[data-testid=watch-panel]', { timeout: 15_000 })
    check(true, 'the player link reloads')
    equal(fresh.errors.length, 0, `no console errors: ${fresh.errors.join(' | ')}`)
    await fresh.context.close()
  },
}

for (const [name, test] of Object.entries(tests)) {
  if (ONLY && !ONLY.includes(name)) continue
  console.log(`  ${name}`)
  try {
    await test()
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
    console.error(`    ✗ ${name} threw: ${error.message}`)
  }
}

await browser.close()
console.log(`\n${checks} checks, ${failures.length} failed`)
if (failures.length > 0) process.exit(1)
