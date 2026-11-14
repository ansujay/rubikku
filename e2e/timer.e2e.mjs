#!/usr/bin/env node
/**
 * End-to-end test of the timer flow, in headless Chromium.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node e2e/timer.e2e.mjs [baseUrl] [--shots=dir]
 *
 * Covers: hold-to-start with the keyboard, the mouse and touch; stopping; a tap that is too
 * short; key repeat; the stop key not re-arming; penalties; personal best + rewards; delete and
 * clear; persistence across a reload; a reload mid-solve; inspection; blur mid-hold; no page
 * scroll on Space; and what counts for records (a test press earns nothing, Escape cancels a
 * running attempt, deletes and penalties are reflected in the all-time best). Exits non-zero on the first failed check or on any console error.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '')
const SHOTS = args.find((a) => a.startsWith('--shots='))?.split('=')[1]
if (SHOTS) await mkdir(SHOTS, { recursive: true })

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
let checks = 0

function check(condition, message) {
  checks++
  if (!condition) throw new Error(`FAILED: ${message}`)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const seconds = (text) => {
  const clean = text.replace('+', '')
  const [a, b] = clean.includes(':') ? clean.split(':') : ['0', clean]
  return Number(a) * 60 + Number(b)
}

async function open(options = {}, seed = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, ...options })
  await context.addInitScript((seed) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('rubikku:settings', JSON.stringify({ version: 1, state: { theme: 'light', sound: false, motion: 'full', turnSpeed: 1, showFaceLabels: false } }))
    for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, JSON.stringify(value))
  }, seed)
  const page = await context.newPage()
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${BASE}/#/timer`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="timer-pad"]')
  await sleep(600)
  return { context, page }
}

const phase = (page) => page.getAttribute('[data-testid="timer-pad"]', 'data-phase')
const display = async (page) => (await page.textContent('[data-testid="timer-display"]')).trim()
const count = (page) => page.locator('[data-testid="history-row"]').count()
const scramble = (page) => page.getAttribute('[data-testid="scramble"]', 'data-scramble')
const focusOpen = (page) => page.locator('[data-testid="timer-focus"]').count().then((n) => n > 0)
const saved = (page, name) => page.evaluate((name) => JSON.parse(localStorage.getItem(`rubikku:${name}`) ?? 'null')?.state, name)
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
async function waitClosed(page) {
  await page.waitForSelector('[data-testid="timer-focus"]', { state: 'detached', timeout: 3000 })
}

const waitIdle = (page) => page.waitForSelector('[data-testid="timer-pad"][data-phase="idle"]', { state: 'attached', timeout: 3000 }).then(() => sleep(150))

async function test(name, fn) {
  const before = checks
  try {
    await fn()
    console.log(`  ok  ${name} (${checks - before} checks)`)
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`)
    await browser.close()
    process.exit(1)
  }
}

// ───────────────────────── Keyboard ─────────────────────────
await test('keyboard: hold Space, release to start, any key stops; a 4-second test press earns nothing', async () => {
  const { context, page } = await open()
  check(await page.getByText('No times yet').isVisible(), 'first-time empty state is shown')
  check((await display(page)) === '0.00', 'display starts at 0.00')
  const firstScramble = await scramble(page)
  check(firstScramble.split(' ').length === 20, 'a 20-move scramble is shown')
  // The scramble card is one compact row: moves + a 3D mini of the scrambled cube (the flat net
  // was dropped — design review 2, M-new-2 — so the pad stays on the first screen).
  check(await page.locator('[data-testid="scramble-cube"] canvas').isVisible(), 'scramble preview: a 3D mini of the cube after the scramble')
  await shot(page, 'timer-empty')

  // A quick tap does not start anything.
  await page.keyboard.down('Space')
  await sleep(80)
  check((await phase(page)) === 'holding', 'Space down → holding')
  await page.keyboard.up('Space')
  await sleep(80)
  check((await phase(page)) === 'idle' && !(await focusOpen(page)), 'a short tap does not start the timer')

  // Hold: holding → ready (armed) after ~300 ms. Key repeat must not disturb it.
  await page.keyboard.down('Space')
  await sleep(120)
  check((await phase(page)) === 'holding', 'still holding at 120 ms')
  await page.keyboard.down('Space') // auto-repeat
  await sleep(330)
  check((await phase(page)) === 'ready', 'armed after the hold')
  await shot(page, 'timer-armed')
  check((await page.evaluate(() => window.scrollY)) === 0, 'Space did not scroll the page')
  await page.keyboard.up('Space')
  await sleep(150)
  check(await focusOpen(page), 'focus view opens when the timer starts')
  check((await phase(page)) === 'running', 'running after release')
  const live1 = await page.textContent('[data-testid="timer-live"]')
  await sleep(1000)
  const live2 = await page.textContent('[data-testid="timer-live"]')
  check(seconds(live2) - seconds(live1) > 0.8 && seconds(live2) - seconds(live1) < 1.3, `live display advances in real time (${live1} → ${live2})`)
  await shot(page, 'timer-running')
  await sleep(2300)

  // Stop with an ordinary key, and keep it held: it must not arm the next attempt.
  const t0 = Date.now()
  await page.keyboard.down('KeyA')
  await waitClosed(page)
  await sleep(450)
  check((await phase(page)) === 'idle', 'the key that stopped the timer does not re-arm it')
  await page.keyboard.up('KeyA')
  const shown = await display(page)
  check(seconds(shown) > 3.2 && seconds(shown) < 4.6, `result is the elapsed time (${shown})`)
  check((await count(page)) === 1, 'the solve is in the history')
  check((await page.textContent('[data-testid="stat-count"]')) === '1', 'solve count is 1')
  check((await page.textContent('[data-testid="stat-ao5"]')) === '—', 'no average of 5 yet')
  check((await scramble(page)) !== firstScramble, 'a new scramble is dealt')
  await sleep(500)
  await shot(page, 'timer-result-too-quick')
  void t0

  // M10: a 4-second test press is not a solve. No best, no XP, no badges, no celebration.
  check((await page.textContent('[data-testid="stat-best"]')) === '—', 'a test press is not the session best')
  check(!(await page.locator('[data-testid="pb-badge"]').isVisible().catch(() => false)), 'a test press is not a personal best')
  check(await page.locator('[data-testid="too-quick"]').isVisible(), 'the pad says why it does not count')
  check((await page.locator('[data-testid="toast"]').count()) === 0, 'a test press raises no toast')
  const progress = await saved(page, 'progress')
  check((progress?.counters?.timedSolves ?? 0) === 0 && (progress?.counters?.solves ?? 0) === 0, 'a test press is not counted as a solve')
  check((progress?.bestSolveMs ?? null) === null, 'a test press does not set the all-time best')
  check(Object.keys(progress?.badges ?? {}).length === 0, 'a test press unlocks no badges')
  check((progress?.xp ?? 0) === 0, 'a test press earns no XP')

  // Penalties.
  await page.getByRole('radio', { name: 'Plus 2 seconds' }).first().click()
  const plus = await display(page)
  check(plus.endsWith('+') && Math.abs(seconds(plus) - seconds(shown) - 2) < 0.011, `+2 adds two seconds (${plus})`)
  await page.getByRole('radio', { name: 'Did not finish' }).first().click()
  check((await display(page)) === 'DNF', 'DNF shows DNF')
  await page.getByRole('radio', { name: 'OK, no penalty' }).first().click()
  check((await display(page)) === shown, 'OK restores the time')

  // After clicking a control with the mouse, Space still belongs to the timer.
  await page.keyboard.down('Space')
  await sleep(380)
  check((await phase(page)) === 'ready', 'Space arms the timer even after clicking a button')
  await page.keyboard.up('Space')
  await sleep(700)
  await page.keyboard.down('Space') // stop with Space this time
  await waitClosed(page)
  await sleep(400)
  check((await phase(page)) === 'idle', 'Space that stops does not re-arm while held')
  await page.keyboard.up('Space')
  check((await count(page)) === 2, 'second solve recorded')
  check(!(await page.locator('[data-testid="pb-badge"]').isVisible().catch(() => false)), 'a sub-3-second slip is not celebrated')
  check(await page.getByText('If it was a slip, delete it').isVisible(), 'a slip gets a gentle hint')

  // …but a button reached with Tab keeps Space for itself.
  const sBefore = await scramble(page)
  await page.getByRole('button', { name: 'Next scramble' }).focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  check(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Next scramble'), 'tabbed to the next-scramble button')
  await page.keyboard.press('Space')
  await sleep(150)
  check((await scramble(page)) !== sBefore, 'Space presses a keyboard-focused button')
  check((await phase(page)) === 'idle' && !(await focusOpen(page)), '…and does not touch the timer')
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())

  // Persistence across reload.
  const beforeScramble = await scramble(page)
  const beforeSolves = (await saved(page, 'timer')).solves
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="timer-pad"]')
  await sleep(500)
  check((await count(page)) === 2, 'history survives a reload')
  check((await scramble(page)) === beforeScramble, 'the scramble survives a reload')
  check(JSON.stringify((await saved(page, 'timer')).solves) === JSON.stringify(beforeSolves), 'saved solves are unchanged')
  check((await display(page)) === '0.00', 'pad is ready for a new attempt after reload')

  // Reload while running discards the attempt.
  await page.keyboard.down('Space')
  await sleep(400)
  await page.keyboard.up('Space')
  await sleep(300)
  check(await focusOpen(page), 'running before the reload')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="timer-pad"]')
  await sleep(500)
  check(!(await focusOpen(page)) && (await phase(page)) === 'idle', 'a reload mid-solve comes back idle')
  check((await count(page)) === 2, 'the running attempt was discarded')
  check((await scramble(page)) === beforeScramble, 'same scramble after discarding')

  // Scramble navigation.
  await page.getByRole('button', { name: 'Next scramble' }).click()
  const next = await scramble(page)
  check(next !== beforeScramble, 'next scramble changes it')
  await page.getByRole('button', { name: 'Previous scramble' }).click()
  check((await scramble(page)) === beforeScramble, 'previous scramble brings it back')

  // History: expand, delete; then clear the session behind a hold.
  await page.locator('[data-testid="history-row"] > button').first().click()
  await sleep(350)
  await page.locator('[data-testid="history-row"]').first().getByRole('button', { name: 'Delete' }).click()
  await sleep(200)
  check((await count(page)) === 1, 'delete removes one solve')
  await page.getByRole('button', { name: 'Clear session' }).click()
  await page.waitForSelector('[role="dialog"]')
  await sleep(350)
  // Space inside a dialog belongs to the dialog (here it presses the focused Close button), not the timer.
  await page.keyboard.down('Space')
  await sleep(400)
  check((await phase(page)) === 'idle', 'Space is ignored by the timer while a dialog is open')
  await page.keyboard.up('Space')
  await sleep(400)
  check(!(await focusOpen(page)) && (await count(page)) === 1, 'nothing started or cleared')
  if ((await page.locator('[role="dialog"]').count()) === 0) await page.getByRole('button', { name: 'Clear session' }).click()
  await page.waitForSelector('[role="dialog"]')
  await sleep(350)
  const hold = page.getByRole('button', { name: 'Hold to clear' })
  const box = await hold.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await sleep(300)
  check((await count(page)) === 1, 'a short press does not clear')
  await sleep(900)
  await page.mouse.up()
  await sleep(500)
  check(await page.getByText('No times yet').isVisible(), 'clearing the session brings back the empty state')
  check((await saved(page, 'timer')).solves.length === 0, 'saved history is empty')
  await context.close()
})

// ───────────────────────── Records (M10) ─────────────────────────
await test('records: real solves earn XP and bests; +2, DNF and delete are reflected in the all-time best; Escape cancels', async () => {
  // Reduced motion: the dialog that closes after a level-up must really leave, even though this test jumps the page clock.
  // He has already solved the cube once in Free play: a timer can't see the cube, so timed
  // solves only count (badges, solve count, personal-best bonus) after a real solve (QA 2, M10).
  const solvedOnce = { version: 1, state: { xp: 130, badges: { 'first-solve': new Date(Date.now() - 86_400_000).toISOString() }, counters: { solves: 1, fullSolves: 1 } } }
  const { context, page } = await open({}, { 'rubikku:settings': { version: 1, state: { theme: 'light', sound: false, motion: 'reduced', turnSpeed: 1, showFaceLabels: false } }, 'rubikku:progress': solvedOnce })
  // Real solves take a while: fast-forward the page clock instead of waiting.
  await page.evaluate(() => {
    const real = performance.now.bind(performance)
    window.__skew = 0
    performance.now = () => real() + window.__skew
  })
  // A level-up (the first real solve earns one) is a dialog the player closes: Space belongs to it while it is open.
  const dismissCelebration = async () => {
    await page.evaluate(() => (window.__skew = 0)) // no solve is running: put the page clock back, so the dialog's fade can finish
    for (let i = 0; i < 6 && (await page.locator('[role="dialog"]').count()) > 0; i++) {
      const keep = page.getByRole('button', { name: 'Keep going' })
      if (await keep.isVisible().catch(() => false)) await keep.click().catch(() => {})
      await page.locator('[role="dialog"]').waitFor({ state: 'detached', timeout: 2500 }).catch(() => {})
    }
    await sleep(300)
  }
  let solveNo = 0
  const solve = async (skipMs, stopKey = 'KeyA') => {
    solveNo++
    await dismissCelebration()
    await page.keyboard.down('Space')
    await sleep(900) // generous: on a busy machine the frames that arm the hold come late
    await page.keyboard.up('Space')
    await page.waitForSelector('[data-testid="timer-pad"][data-phase="running"]', { timeout: 5000 }).catch(() => {})
    check((await phase(page)) === 'running', `running (solve ${solveNo}, was ${await phase(page)}, dialogs ${await page.locator('[role="dialog"]').count()}, focus ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))})`)
    await page.evaluate((ms) => (window.__skew += ms), skipMs)
    await page.keyboard.press(stopKey)
    await page.evaluate(() => (window.__skew = 0)) // the result is in: the page clock goes back, so the level-up dialog's animations are not left waiting
    await waitIdle(page)
    await sleep(250)
    await hideHungOverlay()
  }
  // The jump in the page clock leaves the focus view's fade-out hanging (only here, never for
  // real): get the leftover out of the way of the clicks that follow.
  const hideHungOverlay = () => page.evaluate(() => document.querySelectorAll('[data-testid="timer-focus"]').forEach((el) => (el.style.display = 'none')))
  const best = async () => (await saved(page, 'progress'))?.bestSolveMs ?? null
  const ms = (text) => Math.round(seconds(text) * 1000)

  // Solve A: about 62 s. First timed solve: best, XP on the pad, badges — but only the honest ones.
  await solve(62_000)
  const a = await display(page)
  check(seconds(a) > 62 && seconds(a) < 63.5, `a real solve shows its time (${a})`)
  check(await page.locator('[data-testid="pb-badge"]').isVisible(), 'the first real solve is a personal best')
  check((await page.textContent('[data-testid="news-xp"]')).trim() === '+40 XP', 'the XP earned is shown on the pad')
  check((await page.textContent('[data-testid="stat-best"]')) === a, 'session best is the solve')
  let progress = await saved(page, 'progress')
  check(progress.bestSolveMs === ms(a), `the all-time best is the solve (${progress.bestSolveMs})`)
  check(progress.badges['first-solve'] && progress.badges['sub-5'] && progress.badges['sub-3'] && progress.badges['sub-2'], 'badges the solve really earned are unlocked')
  check(!progress.badges['sub-1'], 'a 62-second solve does not unlock the sub-minute badge')
  check(progress.xp === 170 && progress.counters.timedSolves === 1 && progress.counters.solves === 2, 'XP and the solve count are recorded')
  // The result and its buttons are never under a toast, and no "+XP" toast is raised.
  await sleep(500)
  const toasts = await page.locator('[data-testid="toast"]').all()
  for (const item of toasts) check(!/^\+\d+ XP$/.test((await item.textContent()).trim()), 'no bare "+XP" toast for a timer solve')
  const padBox = await page.locator('[data-testid="timer-pad"]').boundingBox()
  const actions = await page.getByRole('radiogroup', { name: 'Result' }).boundingBox()
  for (const item of toasts) {
    const box = await item.boundingBox()
    if (!box) continue
    const overlaps = (target) => box.x < target.x + target.width && box.x + box.width > target.x && box.y < target.y + target.height && box.y + box.height > target.y
    check(!overlaps(actions), 'a reward toast does not cover the OK / +2 / DNF buttons')
    check(!overlaps({ ...padBox, y: padBox.y + 40, height: padBox.height - 40 }), 'a reward toast does not cover the result')
  }
  await shot(page, 'timer-result-pb')

  // Solve B: about 45 s — a new best.
  await sleep(4800) // let the first solve's toasts go
  await solve(45_000)
  const b = await display(page)
  check(seconds(b) > 45 && seconds(b) < 46.5, `second solve (${b})`)
  check(await page.locator('[data-testid="pb-badge"]').isVisible(), 'a faster solve is a new personal best')
  check((await page.textContent('[data-testid="news-xp"]')).trim() === '+60 XP', 'solve + personal-best XP shown on the pad')
  check((await best()) === ms(b), 'the all-time best moved to the faster solve')
  const later = await page.locator('[data-testid="toast"]').allTextContents()
  check(!later.some((text) => /^\+\d+ XP$/.test(text.trim())), `a later solve raises no bare "+XP" toast: ${JSON.stringify(later)}`)

  // +2 on the best solve: the best is the penalised time (it is still the fastest).
  await page.getByRole('radio', { name: 'Plus 2 seconds' }).first().click()
  check((await best()) === ms(b) + 2000, '+2 on the best solve is reflected in the all-time best')
  check((await page.textContent('[data-testid="stat-best"]')) === (await display(page)).replace('+', ''), 'stats use the penalised time')
  check(await page.locator('[data-testid="pb-badge"]').isVisible(), 'still the best even with +2')
  // DNF: the best falls back to solve A, and the badge goes.
  await page.getByRole('radio', { name: 'Did not finish' }).first().click()
  check((await display(page)) === 'DNF', 'DNF shows DNF')
  check((await best()) === ms(a), 'a DNF on the best solve moves the all-time best back')
  check((await page.textContent('[data-testid="stat-best"]')) === a, 'session best falls back too')
  // (Read from the pad's announcement: with the skewed clock the badge's fade-out never finishes.)
  const announced = () => page.evaluate(() => document.querySelector('[data-testid="timer-pad"]').parentElement.querySelector('[role="status"]').textContent)
  check(!/personal best/i.test(await announced()), 'a DNF is not a personal best')
  // OK again: it is the best again.
  await page.getByRole('radio', { name: 'OK, no penalty' }).first().click()
  check((await best()) === ms(b), 'taking the DNF off restores the best')
  check(/personal best/i.test(await announced()), 'and it is the personal best again')
  // Delete the best solve from the pad.
  await page.locator('[data-testid="timer-pad"]').locator('xpath=ancestor::*[.//button[normalize-space()="Delete"]][1]').getByRole('button', { name: 'Delete' }).first().click()
  await sleep(200)
  check((await count(page)) === 1, 'the solve is gone from the history')
  check((await best()) === ms(a), 'deleting the best solve moves the all-time best to the one still standing')
  // Delete the last one from the history: no best at all, but XP and badges earned honestly stay.
  await page.locator('[data-testid="history-row"] > button').first().click()
  await sleep(350)
  await page.locator('[data-testid="history-row"]').first().getByRole('button', { name: 'Delete' }).click()
  await sleep(200)
  check((await best()) === null, 'with no solve left there is no all-time best')
  progress = await saved(page, 'progress')
  check(progress.xp === 230 && progress.badges['first-solve'], 'XP and badges already earned stay')

  // Escape while running cancels the attempt: nothing recorded, same scramble.
  const before = await scramble(page)
  await dismissCelebration()
  await page.keyboard.down('Space')
  await sleep(900)
  await page.keyboard.up('Space')
  await page.waitForSelector('[data-testid="timer-pad"][data-phase="running"]', { timeout: 5000 }).catch(() => {})
  check((await phase(page)) === 'running', 'running before Escape')
  await page.evaluate(() => (window.__skew += 30_000))
  await page.keyboard.press('Escape')
  await waitIdle(page)
  check((await phase(page)) === 'idle', 'Escape stops the attempt')
  check((await saved(page, 'timer')).solves.length === 0, 'Escape while running records no solve')
  check(await page.locator('[data-testid="timer-cancelled"]').isVisible(), 'the pad says the attempt was cancelled')
  check((await scramble(page)) === before, 'the scramble is kept for another go')
  progress = await saved(page, 'progress')
  check(progress.counters.timedSolves === 2 && progress.xp === 230 && progress.bestSolveMs === null, 'a cancelled attempt earns nothing and sets no best')
  // The next attempt works as usual, and the note goes.
  await solve(20_000, 'Enter')
  check((await count(page)) === 1 && !(await page.locator('[data-testid="timer-cancelled"]').isVisible().catch(() => false)), 'the next attempt records normally')
  check((await best()) === ms(await display(page)), 'and sets the best again')
  await context.close()
})

// ───────────────────────── Mouse ─────────────────────────
await test('mouse: press and hold the pad, release to start, click anywhere to stop', async () => {
  const { context, page } = await open()
  const pad = await page.locator('[data-testid="timer-pad"]').boundingBox()
  const x = pad.x + pad.width / 2
  const y = pad.y + pad.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await sleep(100)
  check((await phase(page)) === 'holding', 'mouse down → holding')
  await page.mouse.up()
  await sleep(100)
  check((await phase(page)) === 'idle', 'short click does not start')
  await page.mouse.down()
  await sleep(400)
  check((await phase(page)) === 'ready', 'armed after holding the pad')
  // Drag off the pad before letting go: it must still start.
  await page.mouse.move(x + 300, y - 200)
  await page.mouse.up()
  await sleep(200)
  check((await phase(page)) === 'running' && (await focusOpen(page)), 'release starts the timer')
  await sleep(600)
  // Click where the "Next scramble" button is: it must stop the timer and NOT change the scramble.
  const nextButton = await page.getByRole('button', { name: 'Next scramble' }).boundingBox()
  await page.mouse.click(nextButton.x + nextButton.width / 2, nextButton.y + nextButton.height / 2)
  await waitClosed(page)
  check((await count(page)) === 1, 'click stopped the timer and recorded the solve')
  const after = await scramble(page)
  await sleep(300)
  check((await scramble(page)) === after && (await saved(page, 'timer')).scrambles.length === 2, 'the stopping click did not press the button underneath')
  const shown = seconds(await display(page))
  check(shown > 0.6 && shown < 1.6, `mouse result is right (${shown})`)

  // Window blur in the middle of a hold drops the hold.
  await page.mouse.move(x, y)
  await page.mouse.down()
  await sleep(380)
  check((await phase(page)) === 'ready', 'armed again')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await sleep(100)
  check((await phase(page)) === 'idle', 'blur mid-hold cancels')
  await page.mouse.up()
  await sleep(150)
  check(!(await focusOpen(page)) && (await count(page)) === 1, 'no attempt started after the cancelled hold')

  // Blur while running: the clock keeps going.
  await page.keyboard.down('Space')
  await sleep(380)
  await page.keyboard.up('Space')
  await sleep(200)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await sleep(300)
  check((await phase(page)) === 'running', 'blur while running keeps the solve going')
  await page.keyboard.press('Enter')
  await waitClosed(page)
  check((await count(page)) === 2, 'stopped with Enter')
  await context.close()
})

// ───────────────────────── Touch ─────────────────────────
await test('touch (phone): press and hold the pad, lift to start, tap to stop', async () => {
  const { context, page } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(overflow <= 1, 'no sideways scroll on a phone')
  await page.locator('[data-testid="timer-pad"]').scrollIntoViewIfNeeded()
  const pad = await page.locator('[data-testid="timer-pad"]').boundingBox()
  const point = { x: Math.round(pad.x + pad.width / 2), y: Math.round(pad.y + pad.height / 2) }
  const cdp = await context.newCDPSession(page)
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
  await touch('touchStart', [point])
  await sleep(420)
  check((await phase(page)) === 'ready', 'armed by touch')
  await shot(page, 'timer-armed-phone')
  await touch('touchEnd', [])
  await sleep(250)
  check((await phase(page)) === 'running' && (await focusOpen(page)), 'lifting the finger starts the timer')
  await sleep(900)
  await shot(page, 'timer-running-phone')
  await touch('touchStart', [{ x: 60, y: 200 }])
  await sleep(60)
  await touch('touchEnd', [])
  await waitClosed(page)
  check((await count(page)) === 1, 'a tap stops the timer')
  await sleep(500)
  check((await phase(page)) === 'idle' && !(await focusOpen(page)), 'the stopping tap does not start another attempt')
  const shown = seconds(await display(page))
  check(shown > 0.9 && shown < 2, `touch result is right (${shown})`)
  await shot(page, 'timer-result-phone')
  await context.close()
})

// ───────────────────────── Inspection ─────────────────────────
await test('inspection: tap to start the countdown, hold and release to solve', async () => {
  const { context, page } = await open()
  await page.getByRole('switch').click()
  check((await saved(page, 'timer')).inspection === true, 'inspection setting is saved')
  await page.keyboard.down('Space')
  await sleep(60)
  await page.keyboard.up('Space')
  await sleep(250)
  check(await focusOpen(page), 'a tap opens the inspection view')
  check((await page.getAttribute('[data-testid="timer-focus"]', 'data-phase')) === 'inspecting', 'inspecting')
  const left = Number(await page.textContent('[data-testid="timer-live"]'))
  check(left === 15 || left === 14, `countdown starts at 15 (${left})`)
  await sleep(1100)
  check(Number(await page.textContent('[data-testid="timer-live"]')) < left, 'countdown counts down')
  await shot(page, 'timer-inspection')
  // A short tap during inspection does not start the solve.
  await page.keyboard.down('Space')
  await sleep(60)
  await page.keyboard.up('Space')
  await sleep(100)
  check((await page.getAttribute('[data-testid="timer-focus"]', 'data-phase')) === 'inspecting', 'short tap keeps inspecting')
  await page.keyboard.down('Space')
  await sleep(400)
  check((await page.getAttribute('[data-testid="timer-focus"]', 'data-phase')) === 'ready', 'hold arms during inspection')
  await page.keyboard.up('Space')
  await sleep(500)
  check((await page.getAttribute('[data-testid="timer-focus"]', 'data-phase')) === 'running', 'release starts the solve')
  await page.keyboard.press('KeyX')
  await waitClosed(page)
  check((await count(page)) === 1, 'solve recorded after inspection')
  check((await saved(page, 'timer')).solves[0].penalty === 'ok', 'no penalty when started in time')

  // Escape abandons an inspection without recording anything.
  await page.keyboard.press('Space')
  await sleep(250)
  check(await focusOpen(page), 'inspecting again')
  await page.keyboard.press('Escape')
  await waitClosed(page)
  check((await count(page)) === 1, 'Escape abandons the attempt')

  // Fast-forward the page clock: starting after 15 s costs +2; past 17 s is a DNF.
  // (The skewed clock also confuses the fade-out animation, so wait on the pad's state instead.)
  await page.evaluate(() => {
    const real = performance.now.bind(performance)
    window.__skew = 0
    performance.now = () => real() + window.__skew
  })
  await page.keyboard.press('Space')
  await sleep(250)
  await page.evaluate(() => (window.__skew += 15_200))
  await sleep(120)
  check((await page.textContent('[data-testid="timer-live"]')) === '+2', 'countdown shows +2 once time is up')
  await page.keyboard.down('Space')
  await sleep(400)
  await page.keyboard.up('Space')
  await sleep(300)
  check((await page.getAttribute('[data-testid="timer-focus"]', 'data-phase')) === 'running', 'started late')
  await page.keyboard.press('KeyX')
  await waitIdle(page)
  let solves = (await saved(page, 'timer')).solves
  check(solves.length === 2 && solves[1].penalty === '+2', 'a late start is recorded with +2')
  check((await display(page)).endsWith('+'), 'the +2 shows on the result')

  await page.keyboard.press('Space')
  await sleep(250)
  await page.evaluate(() => (window.__skew += 17_500))
  await waitIdle(page)
  solves = (await saved(page, 'timer')).solves
  check(solves.length === 3 && solves[2].penalty === 'dnf', 'running out of inspection is a DNF')
  check((await display(page)) === 'DNF', 'DNF is shown')
  // There is no time behind this DNF, so it cannot be turned into a 0.00 "best".
  check(await page.locator('[data-testid="no-time"]').isVisible(), 'a DNF from inspection says no time was recorded')
  check((await page.getByRole('radiogroup', { name: 'Result' }).count()) === 0, 'and offers no OK / +2')
  check((await page.textContent('[data-testid="stat-best"]')) === '—', 'short test solves and DNFs are not a best')
  const progress = await saved(page, 'progress')
  check((progress?.counters?.timedSolves ?? 0) === 0, 'slips and DNFs earn no timed-solve credit')
  await context.close()
})

// ───────────────────────── Seeded history ─────────────────────────
await test('a long history: stats, chart tooltip, pagination, no scroll on Space', async () => {
  const at = (i) => new Date(Date.now() - (60 - i) * 300_000).toISOString()
  const solves = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, ms: 90_000 - i * 500 + (i % 7) * 900, penalty: i === 20 ? 'dnf' : 'ok', scramble: "R U R' U'", at: at(i) }))
  const { context, page } = await open({}, { 'rubikku:timer': { version: 1, state: { solves, scrambles: ["R U R' U' F2 D"], scrambleIndex: 0, inspection: false } } })
  check((await page.textContent('[data-testid="stat-count"]')) === '60', '60 solves loaded')
  check((await count(page)) === 12, 'history shows the first page')
  await page.getByRole('button', { name: /Show \d+ more/ }).click()
  check((await count(page)) === 36, 'show more reveals more rows')
  check((await page.textContent('[data-testid="stat-ao12"]')) !== '—', 'average of 12 is computed')

  const chart = page.locator('[data-testid="time-chart"]')
  await chart.scrollIntoViewIfNeeded()
  const box = await chart.boundingBox()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await sleep(150)
  check(await chart.locator('[role="status"]').isVisible(), 'hovering the chart shows a tooltip')
  check(/Solve \d+/.test(await chart.locator('[role="status"]').textContent()), 'tooltip names the solve')
  await shot(page, 'timer-chart-tooltip')
  await page.mouse.move(5, 5)
  await chart.focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  check((await chart.locator('[role="status"]').textContent()).includes('Solve 59'), 'arrow keys walk the chart')

  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null))
  await page.evaluate(() => window.scrollTo(0, 300))
  const before = await page.evaluate(() => window.scrollY)
  await page.keyboard.down('Space')
  await sleep(150)
  await page.keyboard.up('Space')
  await sleep(200)
  check((await page.evaluate(() => window.scrollY)) === before, 'Space never scrolls the page')
  await context.close()
})

await browser.close()
if (errors.length > 0) {
  console.error(`\n${errors.length} console error(s):\n` + errors.map((e) => `  - ${e}`).join('\n'))
  process.exit(1)
}
console.log(`\nTimer e2e: all ${checks} checks passed.`)
