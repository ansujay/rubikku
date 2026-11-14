#!/usr/bin/env node
/**
 * End-to-end tests for "Solve my cube" (#/solve), driven through the real UI in headless
 * Chromium (software WebGL).
 *
 *   npm run build && npx vite preview --port 4203 &
 *   node e2e/solve.e2e.mjs [baseUrl] [--only=guided,walk]
 *
 * Expected cube states are computed independently with cubejs, never with the app's engine:
 * what the kid "sees" on each face in guided mode is read off a cubejs cube turned the way the
 * instructions say, and the guided solution is checked by replaying the moves the page shows.
 * Exits non-zero if any check fails or any page logs a console error.
 */
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const Cube = createRequire(import.meta.url)('cubejs')
const args = process.argv.slice(2)
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4203').replace(/\/$/, '')
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1].split(',')

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
const SCRAMBLE = "R U F' L2 D B' R2 U' F D2 L' B U2 R' F2 D' L U B2 R"
const COLOR = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' }
const after = (alg, from) => {
  const cube = from ? Cube.fromString(from) : new Cube()
  if (alg.trim()) cube.move(alg)
  return cube.asString()
}
const STATE = after(SCRAMBLE)
const isSolved = (state) => [0, 1, 2, 3, 4, 5].every((f) => new Set(state.slice(f * 9, f * 9 + 9)).size === 1)
const BLANK = [...SOLVED].map((c, i) => (i % 9 === 4 ? c : '-')).join('')
/** Swap the stickers at facelets a[i] and b[i]. */
const swap = (cells, a, b) => {
  const out = [...cells]
  a.forEach((fa, i) => {
    out[fa] = cells[b[i]]
    out[b[i]] = cells[fa]
  })
  return out.join('')
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

async function open({ viewport = { width: 1024, height: 768 }, touch = false, solve = null, motion = 'reduced', route = '/solve', block = null } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, serviceWorkers: block ? 'block' : 'allow' })
  if (block) await context.route(block, (request) => request.abort())
  await context.addInitScript(
    ({ solve, motion }) => {
      if (sessionStorage.getItem('seeded')) return // keep what the app saved across reloads
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('rubikku:settings', JSON.stringify({ version: 1, state: { theme: 'light', sound: false, motion, turnSpeed: 2, showFaceLabels: false } }))
      if (solve) localStorage.setItem('rubikku:solve', JSON.stringify({ version: 1, state: solve }))
    },
    { solve, motion },
  )
  // Every celebration that comes on screen, with its tier and its (final) words.
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
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('main h1')
  return { page, context, errors }
}

const t = (id) => `[data-testid="${id}"]`
const cubeReady = (page) => page.waitForFunction(() => window.__rubikku?.cubes?.solve?.frames() > 0, null, { timeout: 20_000 })
const cubeState = (page) => page.evaluate(async () => (await window.__rubikku.cubes.solve.whenIdle(), window.__rubikku.cubes.solve.getState()))
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rubikku:solve') ?? '{}').state ?? {})
const brush = (page, letter) => page.click(`${t('palette')} [data-color="${COLOR[letter]}"]`)
/** The check's verdict, once it has caught up with the last tap (it says "checking" for a moment — QA N12). */
const status = async (page) => {
  await page.waitForFunction(() => document.querySelector('[data-testid="check-card"]')?.getAttribute('data-status') !== 'checking', null, { timeout: 8000 }).catch(() => {})
  return page.getAttribute(t('check-card'), 'data-status')
}
/** Facelets the net keeps bright (the highlighted ones). Empty when nothing is highlighted. */
const litOnNet = (page) =>
  page.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-testid="entry-net"] [data-facelet]')]
    const lit = cells.filter((el) => !el.hasAttribute('data-dim')).map((el) => Number(el.dataset.facelet))
    return lit.length === cells.length ? [] : lit.sort((a, b) => a - b)
  })

/** Paint a whole cube on the flat net with real clicks, colour by colour. */
async function paintOnNet(page, state) {
  for (const letter of 'URFDLB') {
    await brush(page, letter)
    for (let i = 0; i < 54; i++) {
      if (i % 9 === 4 || state[i] !== letter) continue
      // The last blanks of the last colour fill themselves in; skip what is already right.
      const now = await page.getAttribute(`${t('entry-net')} [data-facelet="${i}"]`, 'data-color')
      if (now !== COLOR[letter]) await page.click(`${t('entry-net')} [data-facelet="${i}"]`)
    }
  }
}

/**
 * Walk the solution to the end by pressing Next, replaying every move the page shows on an
 * independent cubejs cube. Returns what happened on the way.
 */
async function walkToEnd(page, start, { compareEvery = 1 } = {}) {
  const shadow = Cube.fromString(start)
  let moves = 0
  let milestones = 0
  let holds = 0
  let mismatches = 0
  for (let guard = 0; guard < 600; guard++) {
    const state = await page.getAttribute(t('walk-panel'), 'data-state')
    if (state === 'finished') break
    if (state === 'milestone') milestones++
    else {
      const move = await page.getAttribute(t('big-move'), 'data-move')
      if (await page.locator(`${t('step-card')}[data-kind="hold"]`).count()) holds++
      shadow.move(move)
      moves++
    }
    await page.click(t('walk-next'))
    if (state !== 'milestone' && moves % compareEvery === 0 && (await cubeState(page)) !== shadow.asString()) mismatches++
  }
  return { moves, milestones, holds, mismatches, end: shadow.asString() }
}

const index = async (page) => Number(await page.getAttribute(t('walk-panel'), 'data-index'))
const progressOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rubikku:progress') ?? '{}').state ?? {})
/** Which of the eight stages the tracker shows as done (empty when the tracker is not on screen). */
const doneStages = (page) => page.$$eval(`${t('stage-tracker')} li[data-stage]`, (els) => els.filter((el) => el.dataset.status === 'done').map((el) => el.dataset.stage))
/** Is the page in the middle of a step (the next turn is not the first of its step)? */
const midStep = (page) => page.evaluate(() => /Turn (\d+) of/.test(document.querySelector('[data-testid="big-move"]')?.textContent ?? '') && Number(/Turn (\d+) of/.exec(document.querySelector('[data-testid="big-move"]').textContent)[1]) > 1)

/**
 * One press of Next, replayed on the "real cube" in his hands (cubejs). Also watches the stage
 * tracker: a stage that was done must never stop being done — that would mean the page is
 * undoing finished layers on his real cube. Returns false once the solve is finished.
 */
async function turn(page, real, watch) {
  const state = await page.getAttribute(t('walk-panel'), 'data-state')
  if (state === 'finished') return false
  if (state === 'step') real.move(await page.getAttribute(t('big-move'), 'data-move'))
  await page.click(t('walk-next'))
  if (watch) {
    const done = await doneStages(page)
    if ((await page.locator(t('stage-tracker')).count()) > 0) {
      for (const stage of watch.done) if (!done.includes(stage)) watch.undone.push(`${stage} @${await index(page)}`)
      watch.done = done
    }
  }
  return true
}
/** Press Next until the page is in the middle of a step and `enough(page)` holds. */
async function turnUntilMidStep(page, real, watch, enough = async () => true) {
  for (let guard = 0; guard < 400; guard++) {
    if ((await page.getAttribute(t('walk-panel'), 'data-state')) === 'step' && (await midStep(page)) && (await page.locator(`${t('step-card')}[data-kind="turn"]`).count()) > 0 && (await enough(page))) return
    if (!(await turn(page, real, watch))) throw new Error('reached the end before a mid-step place')
  }
  throw new Error('never reached a mid-step place')
}
async function turnToEnd(page, real, watch) {
  for (let guard = 0; guard < 700; guard++) if (!(await turn(page, real, watch))) return
  throw new Error('the solve never finished')
}

const tests = {
  // ── guided entry: every face entered exactly as the instructions say he sees it ──
  async guided() {
    const { page, errors, context } = await open()
    await cubeReady(page)
    await page.click(t('begin-solve'))
    await page.waitForSelector(t('face-grid'))
    // What he sees on each face: the cube turned as told, looking at the front (cubejs, not our engine).
    const views = [
      ['U', "x'", 'B', 'F'],
      ['F', '', 'U', 'D'],
      ['R', 'y', 'U', 'D'],
      ['B', 'y2', 'U', 'D'],
      ['L', "y'", 'U', 'D'],
      ['D', 'x', 'F', 'B'],
    ]
    for (const [face, turn, above, below] of views) {
      await page.waitForSelector(`${t('face-grid')}[data-face="${face}"]`, { timeout: 5000 }).catch(() => {})
      equal(await page.getAttribute(t('face-grid'), 'data-face'), face, `guided: the grid is on face ${face}`)
      // The coloured bars round the grid name the sides the instructions talk about.
      equal(await page.getAttribute(`${t('face-grid')} [data-side="top"]`, 'data-neighbour'), COLOR[above], `guided ${face}: side above the grid`)
      equal(await page.getAttribute(`${t('face-grid')} [data-side="bottom"]`, 'data-neighbour'), COLOR[below], `guided ${face}: side below the grid`)
      const seen = after(turn, STATE).slice(18, 27)
      for (const letter of new Set(seen)) {
        await brush(page, letter)
        for (let i = 0; i < 9; i++) {
          if (i === 4 || seen[i] !== letter) continue
          // The last stickers of the last colour fill themselves in, and a full cube leaves the grid.
          if ((await page.locator(t('face-grid')).count()) === 0) break
          const cell = page.locator(`${t('face-grid')} button`).nth(i)
          if ((await cell.getAttribute('data-color')) !== COLOR[letter]) await cell.click()
        }
      }
      if (face !== 'D') await page.click(t('next-face'))
    }
    await page.waitForSelector(`${t('check-card')}[data-status="ok"]`)
    equal((await saved(page)).cells, STATE, 'guided: the entered cube is exactly the real cube')
    await page.click(t('entry-continue'))
    await page.waitForSelector(t('where-panel'))
    equal(await cubeState(page), STATE, 'guided: the 3D cube shows the entered cube')
    check(errors.length === 0, `guided: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── the main journey: paint the net, check, where am I, walk every move to solved ──
  async walk() {
    const { page, errors, context } = await open()
    await cubeReady(page)
    await page.click(t('begin-solve'))
    await page.click('[role="radio"]:has-text("Whole cube")')
    equal(await page.textContent(t('entry-progress')), '6 / 54', 'walk: starts with only the centres')
    await paintOnNet(page, STATE)
    equal(await status(page), 'ok', 'walk: a correctly entered cube passes the check')
    equal((await saved(page)).cells, STATE, 'walk: net taps entered the right cube')
    await page.click(t('entry-continue'))
    await page.waitForSelector(t('where-panel'))
    equal(await page.getAttribute(t('where-panel'), 'data-current'), 'daisy', 'walk: a scrambled cube starts at the daisy')
    check((await page.locator(`${t('where-panel')} li[data-stage]`).count()) === 8, 'walk: where-am-I lists eight stages')
    check((await page.getAttribute(t('lesson-link'), 'href')).endsWith('/learn/daisy'), 'walk: the lesson link goes to the current stage')
    await page.click(t('start-solve'))
    await page.waitForSelector(`${t('step-card')}[data-kind="hold"]`)
    equal(await page.getAttribute(`${t('step-card')} ${t('hold-line')}`, 'data-top'), 'yellow', 'walk: the first step is the hold, yellow on top')

    const result = await walkToEnd(page, STATE)
    equal(result.mismatches, 0, 'walk: the 3D cube matched the replayed moves after every turn')
    check(isSolved(result.end), 'walk: replaying the shown moves on cubejs solves the cube')
    check(isSolved(await cubeState(page)), 'walk: the 3D cube ends solved')
    check(result.milestones >= 6 && result.milestones <= 8, `walk: a milestone per stage worked (${result.milestones})`)
    check(result.holds >= 5, `walk: whole-cube turns are their own steps (${result.holds})`)
    await page.waitForSelector(t('finish-card'))
    check(Number(await page.textContent(t('finish-turns'))) > 40, 'walk: the finish shows the turn count')
    // His real cube, solved: the takeover. Each stage on the way was a moment.
    await page.waitForSelector(`${t('celebration')}[data-tier="milestone"]`, { timeout: 6000 }).catch(() => {})
    const party = await page.evaluate(() => window.__cheers.map((c) => ({ ...c })))
    const finale = party.find((c) => c.tier === 'milestone')
    check(Boolean(finale) && /You\s+solved\s+your\s+cube/.test(finale.text), `walk: finishing a real cube is a milestone (${party.map((c) => `${c.tier}: ${c.text.slice(0, 40)}`).join(' | ')})`)
    check(party.filter((c) => c.tier === 'moment' && /done/.test(c.text)).length >= 5, `walk: the stages on the way were moments (${party.filter((c) => c.tier === 'moment').length})`)
    if (finale) await page.keyboard.press('Escape') // (its button goes to Learn)
    await page.waitForSelector(t('celebration'), { state: 'detached', timeout: 5000 }).catch(() => {})
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('rubikku:progress') ?? '{}').state?.counters?.realCubeSolves === 1, null, { timeout: 5000 }).catch(() => {})
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('rubikku:progress') ?? '{}').state)
    equal(progress?.counters?.realCubeSolves, 1, 'walk: solving a real cube is rewarded once')
    const xpAfterFirst = progress?.xp
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector(t('finish-card'))
    await page.waitForTimeout(900)
    equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rubikku:progress')).state.counters.realCubeSolves), 1, 'walk: a reload on the finish does not reward again')

    // M7: the reward is once per entered cube. Stepping back and finishing again does not pay twice…
    await page.click(t('finish-back'))
    await page.click(t('walk-next'))
    await page.waitForSelector(t('finish-card'))
    await page.waitForTimeout(900)
    equal((await progressOf(page)).counters.realCubeSolves, 1, 'walk: back a turn and finishing again does not reward again')
    // …nor does switching to the fastest way and finishing that.
    await page.click(t('finish-back'))
    await page.click(t('walk-mismatch'))
    await page.click(t('compare-step-start'))
    await page.click(t('compare-done'))
    const from = await cubeState(page)
    await page.click('[role="radio"]:has-text("Fastest way")')
    await page.waitForSelector(`${t('walk-panel')}[data-state="step"] ${t('step-card')}`, { timeout: 60_000 })
    await page.waitForFunction(() => document.querySelector('[data-testid="step-title"]')?.textContent.includes('hortcut'), null, { timeout: 60_000 })
    check(isSolved((await walkToEnd(page, from, { compareEvery: 3 })).end), 'walk: the fastest way from there ends solved')
    await page.waitForSelector(t('finish-card'))
    await page.waitForTimeout(900)
    equal((await progressOf(page)).counters.realCubeSolves, 1, 'walk: finishing again the fastest way does not reward again')
    equal((await progressOf(page)).xp, xpAfterFirst, 'walk: no extra XP either')
    // A new cube gets its own reward: "Solve another cube" starts a clean entry.
    await page.click(t('finish-again'))
    await page.waitForSelector(t('entry-panel'))
    equal((await saved(page)).rewarded, false, 'walk: a new cube can earn its own reward')
    equal((await saved(page)).cells, BLANK, 'walk: and starts empty')
    check(errors.length === 0, `walk: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── a cube with a single wrong sticker: the slip is explained, lit and fixable ──
  async typo() {
    const wrong = STATE[7] === 'R' ? 'L' : 'R'
    const cells = STATE.slice(0, 7) + wrong + STATE.slice(8)
    const { page, errors, context } = await open({ solve: { phase: 'entry', cells, entryMode: 'free' } })
    await page.waitForSelector(`${t('check-card')}[data-status="problems"]`)
    const ids = await page.$$eval('[data-issue]', (els) => els.map((el) => el.dataset.issueId))
    equal(ids[0], 'guess', 'typo: the first card is the best guess')
    check(ids.includes('count'), 'typo: the colour count is explained too')
    equal(JSON.stringify(await litOnNet(page)), '[7]', 'typo: exactly the wrong sticker is lit on the net')
    const text = await page.textContent(t('issues'))
    check(text.includes(`10 ${COLOR[wrong]}`) && text.includes(`8 ${COLOR[STATE[7]]}`), 'typo: the message names both colours and their counts')
    equal(await page.getAttribute(`${t('palette')} [data-color="${COLOR[wrong]}"]`, 'data-left'), '-1', 'typo: the palette warns about the tenth sticker')
    await page.click(t('issue-fix'))
    await page.waitForSelector(`${t('check-card')}[data-status="ok"]`)
    equal((await saved(page)).cells, STATE, 'typo: one tap fixes the slip')
    // An impossible piece is lit on the net when its card is opened.
    await page.evaluate((cells) => localStorage.setItem('rubikku:solve', JSON.stringify({ version: 1, state: { phase: 'entry', cells, entryMode: 'free' } })), SOLVED.slice(0, 19) + 'D' + SOLVED.slice(20))
    await page.reload({ waitUntil: 'networkidle' })
    await page.click('[data-issue="impossible-piece"] > button')
    const lit = await litOnNet(page)
    equal(JSON.stringify(lit), '[7,19]', 'typo: an impossible edge lights its two stickers')
    check(/opposite sides/.test(await page.textContent('[data-issue="impossible-piece"][data-open="true"]')), 'typo: white with yellow is explained')
    check(errors.length === 0, `typo: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── cubes that were twisted or taken apart: the right message, the pieces lit, a how-to ──
  async physical() {
    const cases = [
      ['twisted-corner', swap(swap(SOLVED, [8], [20]), [8], [9]), [8, 9, 20], /twist/i],
      ['flipped-edge', swap(SOLVED, [7], [19]), [7, 19], /flip/i],
      ['swapped-pieces', swap(SOLVED, [7, 19], [5, 10]), [5, 7, 10, 19], /swap|other’s place/i],
    ]
    for (const [code, cells, facelets, words] of cases) {
      const { page, errors, context } = await open({ solve: { phase: 'entry', cells, entryMode: 'free' } })
      await page.waitForSelector(`${t('check-card')}[data-status="problems"]`)
      const codes = await page.$$eval('[data-issue]', (els) => els.map((el) => el.dataset.issue))
      equal(codes.join(), code, `physical: ${code} is the only problem reported`)
      equal(JSON.stringify(await litOnNet(page)), JSON.stringify(facelets), `physical: ${code} lights the piece on the net`)
      const card = await page.textContent(`[data-issue="${code}"]`)
      check(words.test(card) && /Every sticker makes sense/.test(card), `physical: ${code} explains what happened`)
      check((await page.locator(`[data-issue="${code}"] ol li`).count()) >= 3, `physical: ${code} has a step-by-step fix`)
      await page.click(t('issue-fix'))
      await page.waitForSelector(`${t('check-card')}[data-status="ok"]`)
      equal((await saved(page)).cells, SOLVED, `physical: ${code} — the picture follows the fix`)
      check(errors.length === 0, `physical ${code}: console errors: ${errors.join(' | ')}`)
      await context.close()
    }
  },

  // ── a reload in the middle of entering loses nothing ──
  async reloadEntry() {
    const { page, errors, context } = await open()
    await page.click(t('begin-solve'))
    await brush(page, 'R')
    await page.locator(`${t('face-grid')} button`).nth(0).click()
    await page.locator(`${t('face-grid')} button`).nth(1).click()
    await page.click(t('next-face'))
    await page.click(t('next-face'))
    await brush(page, 'B')
    await page.locator(`${t('face-grid')} button`).nth(8).click()
    const before = await saved(page)
    equal(before.cells, 'RR--U----' + '----R---B' + BLANK.slice(18), 'reload entry: the three painted stickers are saved')
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector(t('face-grid'))
    const afterReload = await saved(page)
    equal(JSON.stringify(afterReload), JSON.stringify(before), 'reload entry: everything saved is identical after a reload')
    equal(await page.getAttribute(t('face-grid'), 'data-face'), 'R', 'reload entry: still on the right face')
    equal(await page.getAttribute(`${t('palette')} [data-color="blue"]`, 'aria-checked'), 'true', 'reload entry: the brush is still blue')
    equal(await page.locator(`${t('face-grid')} button`).nth(8).getAttribute('data-color'), 'blue', 'reload entry: the grid shows the painted sticker')
    await page.click('button[aria-label="Undo"]')
    equal((await saved(page)).cells[17], '-', 'reload entry: undo still works after the reload')
    await page.click('button[aria-label="Redo"]')
    equal((await saved(page)).cells[17], 'B', 'reload entry: and redo')
    check(errors.length === 0, `reload entry: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── a reload in the middle of the solution comes back to the same move ──
  async reloadWalk() {
    const { page, errors, context } = await open({ solve: { phase: 'walk', cells: STATE, start: STATE, walkMode: 'beginner', pos: { step: 0, move: 0 } }, motion: 'full' })
    await cubeReady(page)
    const shadow = Cube.fromString(STATE)
    for (let i = 0; i < 12; i++) {
      if ((await page.getAttribute(t('walk-panel'), 'data-state')) === 'step') shadow.move(await page.getAttribute(t('big-move'), 'data-move'))
      await page.click(t('walk-next'))
    }
    equal(await cubeState(page), shadow.asString(), 'reload walk: animated turns land on the right cube')
    const index = await page.getAttribute(t('walk-panel'), 'data-index')
    const title = await page.textContent(t('step-title'))
    const move = await page.getAttribute(t('big-move'), 'data-move')
    await page.reload({ waitUntil: 'networkidle' })
    await cubeReady(page)
    equal(await page.getAttribute(t('walk-panel'), 'data-index'), index, 'reload walk: same turn number')
    equal(await page.textContent(t('step-title')), title, 'reload walk: same step')
    equal(await page.getAttribute(t('big-move'), 'data-move'), move, 'reload walk: same next move')
    equal(await cubeState(page), shadow.asString(), 'reload walk: same cube')
    // Keyboard: space and the arrows.
    await page.locator('main h1').click()
    await page.keyboard.press('Space')
    equal(await page.getAttribute(t('walk-panel'), 'data-index'), String(Number(index) + 1), 'reload walk: Space is the next turn')
    // A held key auto-repeats: it must still be one turn, not a run through the whole solve.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.down('Space')
    for (let i = 0; i < 6; i++) await page.keyboard.down('Space')
    await page.keyboard.up('Space')
    await page.keyboard.down('ArrowRight')
    for (let i = 0; i < 6; i++) await page.keyboard.down('ArrowRight')
    await page.keyboard.up('ArrowRight')
    equal(await page.getAttribute(t('walk-panel'), 'data-index'), String(Number(index) + 2), 'reload walk: a held key is one turn per press')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    equal(await page.getAttribute(t('walk-panel'), 'data-index'), index, 'reload walk: ← goes back a turn')
    equal(await cubeState(page), shadow.asString(), 'reload walk: back a turn restores the cube')
    // Tap the cube to advance.
    const at = await page.evaluate(() => window.__rubikku.cubes.solve.facelet(22))
    await page.mouse.click(at.x, at.y)
    equal(await page.getAttribute(t('walk-panel'), 'data-index'), String(Number(index) + 1), 'reload walk: tapping the cube is the next turn')
    check(errors.length === 0, `reload walk: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── the fastest way: a short solution from the worker, same player ──
  async fastest() {
    const { page, errors, context } = await open({ solve: { phase: 'where', cells: STATE, start: STATE } })
    await cubeReady(page)
    await page.click(t('start-fastest'))
    await page.waitForSelector(t('step-card'), { timeout: 60_000 })
    const total = Number(await page.getAttribute(t('walk-panel'), 'data-total'))
    check(total > 0 && total <= 22, `fastest: at most 22 turns (${total})`)
    const result = await walkToEnd(page, STATE)
    equal(result.moves, total, 'fastest: every turn was walked')
    equal(result.mismatches, 0, 'fastest: the 3D cube matched after every turn')
    check(isSolved(result.end) && isSolved(await cubeState(page)), 'fastest: ends solved')
    equal(result.holds, 0, 'fastest: no whole-cube turns')
    // Switching back in the middle of a part waits for the part to end (M5): go back to turn 7.
    await page.click(t('finish-back'))
    while ((await index(page)) > 7) await page.click(t('walk-back'))
    const mid = await cubeState(page)
    await page.click('[role="radio"]:has-text("Stage by stage")')
    await page.waitForSelector(t('mode-pending'))
    check(/3 more turns/.test(await page.textContent(t('mode-pending'))), 'fastest: the switch waits and says how many turns are left in this part')
    equal(await cubeState(page), mid, 'fastest: asking for the other way mid-part changes nothing yet')
    equal((await saved(page)).walkMode, 'fastest', 'fastest: still on the fastest way')
    // Changing his mind is one tap.
    await page.click(t('mode-pending-cancel'))
    equal(await page.locator(t('mode-pending')).count(), 0, 'fastest: the waiting switch can be cancelled')
    await page.click('[role="radio"]:has-text("Stage by stage")')
    await page.waitForSelector(t('mode-pending'))
    const real = Cube.fromString(mid)
    for (let i = 0; i < 3; i++) {
      real.move(await page.getAttribute(t('big-move'), 'data-move'))
      await page.click(t('walk-next'))
    }
    await page.waitForSelector(t('stage-tracker'))
    equal((await saved(page)).start, real.asString(), 'fastest: the stage-by-stage plan starts from the end of the part')
    equal(await cubeState(page), real.asString(), 'fastest: switching keeps the cube')
    await turnToEnd(page, real, null)
    check(isSolved(real.asString()), 'fastest: the stage-by-stage way finishes from there')
    check(errors.length === 0, `fastest: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── "my cube doesn't match": compare, step back, or re-enter and re-solve ──
  async mismatch() {
    const { page, errors, context } = await open({ solve: { phase: 'walk', cells: STATE, start: STATE, walkMode: 'beginner', pos: { step: 0, move: 0 } } })
    await cubeReady(page)
    const shadow = Cube.fromString(STATE)
    const trail = [STATE]
    for (let i = 0; i < 5; i++) {
      shadow.move(await page.getAttribute(t('big-move'), 'data-move'))
      trail.push(shadow.asString())
      await page.click(t('walk-next'))
    }
    await page.click(t('walk-mismatch'))
    await page.waitForSelector(t('compare-panel'))
    const net = () => page.$$eval(`${t('compare-panel')} [data-facelet]`, (els) => els.map((el) => el.dataset.color[0]).join(''))
    const letters = (state) => [...state].map((c) => ({ U: 'w', R: 'r', F: 'g', D: 'y', L: 'o', B: 'b' })[c]).join('')
    equal(await net(), letters(trail[5]), 'mismatch: the net shows the expected cube')
    await page.click(t('compare-back'))
    equal(await net(), letters(trail[4]), 'mismatch: back one turn shows the cube before it')
    equal(await cubeState(page), trail[4], 'mismatch: the 3D cube steps back too')
    await page.click(t('compare-done'))
    await page.waitForSelector(t('step-card'))
    equal(await page.getAttribute(t('walk-panel'), 'data-index'), '4', 'mismatch: carry on from where it matched')

    // Now the other way out: his cube is really somewhere else (he did an extra R).
    await page.click(t('walk-mismatch'))
    await page.click(t('compare-reenter'))
    await page.waitForSelector(t('entry-net'))
    equal((await saved(page)).cells, trail[4], 'mismatch: entry is pre-filled with the expected cube')
    equal(await status(page), 'ok', 'mismatch: the pre-filled cube is valid')
    const actual = after('R', trail[4])
    for (const letter of 'URFDLB') {
      const diff = [...actual].flatMap((c, i) => (c === letter && trail[4][i] !== c ? [i] : []))
      if (diff.length === 0) continue
      await brush(page, letter)
      for (const i of diff) await page.click(`${t('entry-net')} [data-facelet="${i}"]`)
    }
    await page.waitForSelector(`${t('check-card')}[data-status="ok"]`)
    equal((await saved(page)).cells, actual, 'mismatch: only the differences needed fixing')
    await page.click(t('entry-continue'))
    await page.waitForSelector(t('walk-panel'))
    equal(await cubeState(page), actual, 'mismatch: the new solution starts from his real cube')
    check(isSolved((await walkToEnd(page, actual, { compareEvery: 5 })).end), 'mismatch: the re-solve ends solved')
    check(errors.length === 0, `mismatch: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── M5: never plan again from the middle of a step ──
  async replan() {
    const { page, errors, context } = await open({ solve: { phase: 'walk', cells: STATE, start: STATE, walkMode: 'beginner', pos: { step: 0, move: 0 } } })
    await cubeReady(page)
    const real = Cube.fromString(STATE) // the cube in his hands
    const watch = { done: [], undone: [] }
    const twoStagesDone = async (page) => (await doneStages(page)).length >= 2

    // 1. Mid-step, "my cube doesn't match" → "fix the colours" → it is all the same → carry on.
    await turnUntilMidStep(page, real, watch, twoStagesDone)
    let at = await index(page)
    let move = await page.getAttribute(t('big-move'), 'data-move')
    const doneBefore = await doneStages(page)
    await page.click(t('walk-mismatch'))
    await page.click(t('compare-reenter'))
    await page.waitForSelector(`${t('check-ok-text')}[data-reentry="same"]`)
    equal((await saved(page)).cells, real.asString(), 'replan: the colours to fix are the cube in his hands')
    await page.click(t('entry-continue'))
    await page.waitForSelector(t('step-card'))
    equal(await index(page), at, 'replan: carrying on after "fix the colours" is the same turn of the same plan')
    equal(await page.getAttribute(t('big-move'), 'data-move'), move, 'replan: with the same next move')
    equal((await saved(page)).start, STATE, 'replan: nothing was planned again')
    equal(JSON.stringify(await doneStages(page)), JSON.stringify(doneBefore), 'replan: the finished stages are still finished')
    equal(await cubeState(page), real.asString(), 'replan: the 3D cube is his cube')

    // 2. Mid-step again, but his cube is really one turn behind: found in the plan, not re-planned.
    await turn(page, real, watch)
    await turnUntilMidStep(page, real, watch)
    at = await index(page)
    const behind = await page.evaluate(async () => {
      // The cube one turn ago, read from the page's own "back one turn" picture.
      document.querySelector('[data-testid="walk-back"]').click()
      await new Promise((resolve) => setTimeout(resolve, 150))
      await window.__rubikku.cubes.solve.whenIdle()
      const state = window.__rubikku.cubes.solve.getState()
      document.querySelector('[data-testid="walk-next"]').click()
      await new Promise((resolve) => setTimeout(resolve, 150))
      return state
    })
    equal(await index(page), at, 'replan: back at the same turn')
    await page.click(t('walk-mismatch'))
    await page.click(t('compare-reenter'))
    await page.waitForSelector(t('entry-net'))
    const expected = (await saved(page)).cells
    for (const letter of 'URFDLB') {
      const diff = [...behind].flatMap((c, i) => (c === letter && expected[i] !== c ? [i] : []))
      if (diff.length === 0) continue
      await brush(page, letter)
      for (const i of diff) await page.click(`${t('entry-net')} [data-facelet="${i}"]`)
    }
    await page.waitForSelector(`${t('check-ok-text')}[data-reentry="known"]`)
    check(/one turn back/.test(await page.textContent(t('check-ok-text'))), 'replan: the page says his cube is one turn back')
    await page.click(t('entry-continue'))
    await page.waitForSelector(t('step-card'))
    equal(await index(page), at - 1, 'replan: the plan carries on from the turn his cube is really at')
    equal((await saved(page)).start, STATE, 'replan: still the same plan')
    const realBehind = Cube.fromString(behind) // his real cube was one turn behind all along
    equal(await cubeState(page), behind, 'replan: the 3D cube shows his real cube')

    // 3. Mid-step, ask for the fastest way: it waits for the step to end, then switches.
    await turn(page, realBehind, watch)
    await turnUntilMidStep(page, realBehind, watch)
    const doneAtSwitch = await doneStages(page)
    await page.click('[role="radio"]:has-text("Fastest way")')
    await page.waitForSelector(t('mode-pending'))
    equal((await saved(page)).walkMode, 'beginner', 'replan: the mode does not change in the middle of a step')
    equal((await saved(page)).start, STATE, 'replan: and nothing is planned from a half-done step')
    for (let guard = 0; guard < 30 && (await page.locator(t('mode-pending')).count()) > 0; guard++) await turn(page, realBehind, watch)
    await page.waitForFunction(() => document.querySelector('[data-testid="step-title"]')?.textContent.includes('hortcut'), null, { timeout: 60_000 })
    equal((await saved(page)).start, realBehind.asString(), 'replan: the fastest way starts from the end of the step, on his real cube')
    equal(await cubeState(page), realBehind.asString(), 'replan: the cube did not jump')
    // …and straight back (the start of a part is a step boundary, so this is immediate).
    await page.click('[role="radio"]:has-text("Stage by stage")')
    await page.waitForSelector(t('stage-tracker'))
    equal((await saved(page)).start, realBehind.asString(), 'replan: stage by stage carries on from the same cube')
    const doneAfter = await doneStages(page)
    check(doneAtSwitch.every((stage) => doneAfter.includes(stage)), `replan: every stage that was done is still done after switching there and back (${doneAtSwitch} → ${doneAfter})`)
    watch.done = doneAfter

    // 4. To the end: his real cube is solved, and no finished stage was ever redone.
    await turnToEnd(page, realBehind, watch)
    check(isSolved(realBehind.asString()), 'replan: the cube in his hands ends solved')
    check(isSolved(await cubeState(page)), 'replan: the 3D cube ends solved')
    equal(watch.undone.join(), '', 'replan: no finished stage was ever undone')
    check(errors.length === 0, `replan: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── M6: "where am I?" from inside a walk is about the cube as it is now, and carries on ──
  async whereInWalk() {
    const { page, errors, context } = await open({ solve: { phase: 'walk', cells: STATE, start: STATE, walkMode: 'beginner', pos: { step: 0, move: 0 } } })
    await cubeReady(page)
    const real = Cube.fromString(STATE)
    const watch = { done: [], undone: [] }
    await turnUntilMidStep(page, real, watch, async (page) => (await doneStages(page)).length >= 3)
    const at = await index(page)
    const move = await page.getAttribute(t('big-move'), 'data-move')
    const done = await doneStages(page)
    await page.click(t('walk-exit'))
    await page.waitForSelector(t('where-panel'))
    equal(await cubeState(page), real.asString(), 'where in walk: the cube shown is the cube as it is now, not the one entered')
    equal(await page.getAttribute(t('where-panel'), 'data-resume'), String(at), 'where in walk: it knows how many turns are done')
    const listed = await page.$$eval(`${t('where-panel')} li[data-stage][data-status="done"]`, (els) => els.map((el) => el.dataset.stage))
    equal(JSON.stringify(listed), JSON.stringify(done), 'where in walk: the stages listed as done are the ones done now')
    check(await page.locator(t('where-midstep')).isVisible(), 'where in walk: half-way through a step is explained, not shown as undone stages')
    equal(await page.locator(t('start-solve')).count(), 0, 'where in walk: there is no "solve it with me" that would start over')
    equal(await page.locator(t('start-fastest')).count(), 0, 'where in walk: nor a fastest-way restart')
    // A reload here keeps the place too.
    await page.reload({ waitUntil: 'networkidle' })
    await cubeReady(page)
    equal(await cubeState(page), real.asString(), 'where in walk: still the current cube after a reload')
    await page.click(t('where-carry-on'))
    await page.waitForSelector(t('step-card'))
    equal(await index(page), at, 'where in walk: carry on is the same turn')
    equal(await page.getAttribute(t('big-move'), 'data-move'), move, 'where in walk: with the same next move')
    equal((await saved(page)).start, STATE, 'where in walk: the plan was not started again')
    await turnToEnd(page, real, watch)
    check(isSolved(real.asString()), 'where in walk: the cube in his hands ends solved')
    equal(watch.undone.join(), '', 'where in walk: no finished stage was undone')
    check(errors.length === 0, `where in walk: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── M7: a pretend cube never earns the real-cube reward, whatever is tapped ──
  async pretend() {
    const { page, errors, context } = await open({ solve: { phase: 'entry', cells: BLANK, entryMode: 'free' } })
    await cubeReady(page)
    await page.click(t('more-helpers'))
    await page.click(t('fill-solved'))
    check((await saved(page)).demo === true, 'pretend: a helper fill is a pretend cube')
    check(await page.locator(t('pretend-note')).isVisible(), 'pretend: and the page says so')
    // A tap that changes nothing…
    await brush(page, 'U')
    await page.click(`${t('entry-net')} [data-facelet="0"]`)
    check((await saved(page)).demo === true, 'pretend: tapping a sticker with its own colour does not make it a real cube')
    // …and real edits: turn the top face by repainting the top row of the four sides.
    const turned = after('U')
    for (const letter of 'RFLB') {
      await brush(page, letter)
      for (let i = 0; i < 54; i++) if (turned[i] === letter && SOLVED[i] !== letter) await page.click(`${t('entry-net')} [data-facelet="${i}"]`)
    }
    equal((await saved(page)).cells, turned, 'pretend: the edited cube is one turn from solved')
    check((await saved(page)).demo === true, 'pretend: editing a pretend cube keeps it pretend')
    await page.waitForSelector(`${t('check-card')}[data-status="ok"]`)
    await page.click(t('entry-continue'))
    await page.click(t('start-solve'))
    await page.waitForSelector(t('walk-panel'))
    const result = await walkToEnd(page, turned)
    check(isSolved(result.end), 'pretend: the pretend cube is solved')
    await page.waitForSelector(t('finish-card'))
    await page.waitForTimeout(1000)
    const progress = await progressOf(page)
    equal(progress.counters?.realCubeSolves ?? 0, 0, 'pretend: a pretend cube earns no real-cube reward')
    check(!progress.badges?.['real-deal'], 'pretend: and no "real deal" badge')
    check(/pretend|real cube/i.test(await page.textContent(t('finish-card'))), 'pretend: the finish says to try a real one')
    // Undoing the fill makes the entry his own again; clearing does too.
    await page.click(t('finish-again'))
    await page.click(t('more-helpers'))
    await page.click(t('fill-random'))
    check((await saved(page)).demo === true, 'pretend: random scramble is pretend')
    await page.click('button[aria-label="Undo"]')
    check((await saved(page)).demo === false, 'pretend: undoing the fill gives back his own (empty) cube')
    await page.click('button[aria-label="Redo"]')
    check((await saved(page)).demo === true, 'pretend: redoing it is pretend again')
    check(errors.length === 0, `pretend: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── "Play this step": plays the rest of the step by itself and stops at its end ──
  async autoplay() {
    const { page, errors, context } = await open({ solve: { phase: 'walk', cells: STATE, start: STATE, walkMode: 'beginner', pos: { step: 15, move: 0 }, speed: 1.5 } })
    await cubeReady(page)
    // The card moves a little as each turn plays: press the button the way a finger does, without waiting for it to hold still.
    const press = (page) => page.locator(t('walk-play')).dispatchEvent('click')
    const real = Cube.fromString(await cubeState(page))
    // Find a step with at least four turns.
    for (let guard = 0; guard < 200; guard++) {
      const chips = await page.locator(`${t('step-card')} [aria-label="All the turns of this step"] [data-move], ${t('step-card')} [aria-label="All the turns of this step"] li`).count()
      const text = (await page.textContent(t('big-move'))) ?? ''
      const total = Number(/of (\d+)/.exec(text)?.[1] ?? 0)
      void chips
      if ((await page.locator(t('walk-play')).count()) > 0 && /Turn 1 of/.test(text) && total >= 4) break
      if ((await page.getAttribute(t('walk-panel'), 'data-state')) === 'step') real.move(await page.getAttribute(t('big-move'), 'data-move'))
      await page.click(t('walk-next'))
    }
    const total = Number(/of (\d+)/.exec(await page.textContent(t('big-move')))[1])
    const startIndex = await index(page)
    const step = await page.getAttribute(t('step-card'), 'data-step')
    // The moves of this step: read by stepping through it by hand, then stepping back.
    const played = []
    for (let i = 0; i < total; i++) {
      played.push(await page.getAttribute(t('big-move'), 'data-move'))
      await page.click(t('walk-next'))
    }
    while ((await index(page)) > startIndex) await page.click(t('walk-back'))
    equal(await page.getAttribute(t('step-card'), 'data-step'), step, 'autoplay: back at the start of the step')
    await press(page)
    equal(await page.getAttribute(t('walk-play'), 'aria-pressed'), 'true', 'autoplay: the button turns into Pause')
    // Pause after the first turn or two: it stops there.
    await page.waitForFunction((from) => Number(document.querySelector('[data-testid="walk-panel"]').dataset.index) > from, startIndex, { timeout: 8000 })
    await press(page)
    const paused = await index(page)
    check(paused > startIndex && paused < startIndex + total, `autoplay: pause stops in the middle of the step (${paused - startIndex} of ${total})`)
    await page.waitForTimeout(1800)
    equal(await index(page), paused, 'autoplay: nothing moves while paused')
    // Play again: it runs to the end of the step and stops by itself — never into the next step.
    await press(page)
    for (let guard = 0; guard < 400 && (await index(page)) < startIndex + total; guard++) {
        await page.waitForTimeout(60)
    }
    equal(await index(page), startIndex + total, 'autoplay: it plays every turn of the step')
    await page.waitForTimeout(2200)
    equal(await index(page), startIndex + total, 'autoplay: and stops at the end of the step, on its own')
    check((await page.locator(`${t('walk-play')}[aria-pressed="true"]`).count()) === 0, 'autoplay: the button is not left on Pause')
    for (const move of played) real.move(move)
    equal(await cubeState(page), real.asString(), 'autoplay: the cube is where those turns lead')
    // A manual turn while playing stops the playing.
    if ((await page.locator(t('walk-play')).count()) > 0) {
      await press(page)
      await page.click(t('walk-next'))
      check((await page.locator(`${t('walk-play')}[aria-pressed="true"]`).count()) === 0, 'autoplay: pressing Next takes over from Play')
    }
    check(errors.length === 0, `autoplay: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── the fastest way cannot be found: a calm card and a way on ──
  async fastestFails() {
    const { page, context } = await open({ solve: { phase: 'where', cells: STATE, start: STATE }, block: '**/solver.worker*' })
    await cubeReady(page)
    await page.click(t('start-fastest'))
    await page.waitForSelector(`${t('walk-panel')}[data-state="error"]`, { timeout: 30_000 })
    check(/got stuck/.test(await page.textContent(t('walk-panel'))), 'fastest fails: the card says the shortcut finder got stuck')
    check(await page.locator(t('fastest-fallback')).isVisible(), 'fastest fails: it offers the stage-by-stage way')
    equal(await cubeState(page), STATE, 'fastest fails: the cube is untouched')
    // Asking again tries again (and fails again here) rather than doing nothing.
    await page.click('[role="radio"]:has-text("Fastest way")')
    await page.waitForSelector(`${t('walk-panel')}[data-state="error"]`, { timeout: 30_000 })
    await page.click(t('fastest-fallback'))
    await page.waitForSelector(t('stage-tracker'))
    equal((await saved(page)).walkMode, 'beginner', 'fastest fails: the fallback is the stage-by-stage way')
    equal((await saved(page)).start, STATE, 'fastest fails: from the same cube')
    check(isSolved((await walkToEnd(page, STATE, { compareEvery: 9 })).end), 'fastest fails: and it solves the cube')
    await context.close()
  },

  // ── fingers on a small net: tap a face on the map, paint it big ──
  async zoom() {
    for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 1024, height: 768 }]]) {
      const { page, errors, context } = await open({ viewport, touch: true, solve: { phase: 'entry', cells: BLANK, entryMode: 'free' } })
      await page.waitForSelector(`${t('entry-net')}[data-zoom="true"]`)
      await page.tap(`${t('palette')} [data-color="blue"]`)
      // A tap on the little net opens that face; it does not paint a sticker too small to aim at.
      await page.tap(`${t('entry-net')} [data-facelet="9"]`)
      equal((await saved(page)).cells, BLANK, `zoom ${name}: a tap on the small net paints nothing`)
      equal(await page.getAttribute(t('net-open-face'), 'data-face'), 'R', `zoom ${name}: it opens the face that was tapped`)
      equal(await page.getAttribute(`${t('zoom-face')} ${t('face-grid')}`, 'data-face'), 'R', `zoom ${name}: the big grid shows that face`)
      const sizes = await page.$$eval(`${t('zoom-face')} ${t('face-grid')} button`, (els) => els.map((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)))
      check(sizes.length === 9 && Math.min(...sizes) >= 44, `zoom ${name}: every sticker to paint is at least 44px (${Math.round(Math.min(...sizes))}px)`)
      await page.locator(`${t('zoom-face')} ${t('face-grid')} button`).nth(0).tap()
      equal((await saved(page)).cells[9], 'B', `zoom ${name}: a tap on the big grid paints the sticker`)
      equal(await page.getAttribute(`${t('entry-net')} [data-facelet="9"]`, 'data-color'), 'blue', `zoom ${name}: and the little net shows it`)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check(overflow <= 1, `zoom ${name}: no sideways scroll (${overflow}px)`)
      // A slip that is pointed out opens the face it is on.
      const wrong = STATE[7] === 'R' ? 'L' : 'R'
      await page.evaluate((cells) => localStorage.setItem('rubikku:solve', JSON.stringify({ version: 1, state: { phase: 'entry', cells, entryMode: 'free', guidedIndex: 5 } })), STATE.slice(0, 7) + wrong + STATE.slice(8))
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector(`${t('check-card')}[data-status="problems"]`)
      await page.waitForSelector(`${t('net-open-face')}[data-face="U"]`)
      await page.tap(t('issue-fix'))
      await page.waitForSelector(`${t('check-card')}[data-status="ok"]`)
      check(errors.length === 0, `zoom ${name}: console errors: ${errors.join(' | ')}`)
      await context.close()
    }
  },

  // ── S1: a whole face entered turned, mirrored or on the wrong side is ONE message with a one-tap fix ──
  async faceMistakes() {
    const face = (cells, f, from) => {
      const out = [...cells]
      for (let i = 0; i < 9; i++) if (i !== 4) out[f * 9 + i] = cells[f * 9 + from[i]]
      return out.join('')
    }
    const cases = [
      ['top quarter turn', face(STATE, 0, [6, 3, 0, 7, 4, 1, 8, 5, 2]), 0, /quarter turn/],
      ['right face upside down', face(STATE, 1, [8, 7, 6, 5, 4, 3, 2, 1, 0]), 1, /upside down/],
      ['bottom mirrored', face(STATE, 3, [2, 1, 0, 5, 4, 3, 8, 7, 6]), 3, /mirror/],
      ['front quarter turn the other way', face(STATE, 2, [2, 5, 8, 1, 4, 7, 0, 3, 6]), 2, /quarter turn/],
    ]
    for (const [name, cells, f, words] of cases) {
      const { page, errors, context } = await open({ solve: { phase: 'entry', cells, entryMode: 'free' } })
      await page.waitForSelector(`${t('check-card')}[data-status="problems"]`)
      const ids = await page.$$eval('[data-issue]', (els) => els.map((el) => el.dataset.issueId))
      equal(ids.join(), 'face', `face mistake (${name}): one message, not a pile of cards`)
      equal(JSON.stringify(await litOnNet(page)), JSON.stringify(Array.from({ length: 9 }, (_, i) => f * 9 + i)), `face mistake (${name}): the whole face is lit`)
      check(words.test(await page.textContent('[data-issue="impossible-piece"]')), `face mistake (${name}): it says what happened`)
      await page.click(t('issue-fix'))
      await page.waitForSelector(`${t('check-card')}[data-status="ok"]`)
      equal((await saved(page)).cells, STATE, `face mistake (${name}): one tap gives the real cube back`)
      check(errors.length === 0, `face mistake (${name}): console errors: ${errors.join(' | ')}`)
      await context.close()
    }
  },

  // ── QA2 N1 / N10: the walk's Next is on the first screen on every step (tablet, phone, 200% zoom) ──
  async walkFold() {
    for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 512, height: 384 }]) {
      const { page, errors, context } = await open({ viewport, solve: { phase: 'walk', cells: STATE, start: STATE, walkMode: 'beginner', pos: { step: 0, move: 0 } } })
      await page.waitForSelector(t('walk-next'))
      let worst = 0
      for (let n = 0; n < 14; n++) {
        const box = await page.locator(t('walk-next')).boundingBox()
        worst = Math.max(worst, box.y + box.height)
        await page.click(t('walk-next'))
        await page.waitForTimeout(250)
      }
      check(worst <= viewport.height, `walk ${viewport.width}x${viewport.height}: Next is on the first screen on every step (lowest bottom ${Math.round(worst)})`)
      check(errors.length === 0, `walk fold: console errors: ${errors.join(' | ')}`)
      await context.close()
    }
  },

  // ── QA2 N2 + S1: a face entered with a slip — the grid never jumps to another face under his
  // finger, every tap paints the face he is on, and the slip comes back as one card with a fix ──
  async faceSlipGuided() {
    const rot = (s) => [6, 3, 0, 7, 4, 1, 8, 5, 2].map((i) => s[i]).join('')
    const swapFirstPair = (s) => {
      for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) if (a !== 4 && b !== 4 && s[a] !== s[b]) return [...s].map((c, i) => (i === a ? s[b] : i === b ? s[a] : c)).join('')
      return s
    }
    const views = [['U', "x'"], ['F', ''], ['R', 'y'], ['B', 'y2'], ['L', "y'"], ['D', 'x']]
    for (const [name, slip] of [['R turned a quarter', { R: rot }], ['two front stickers swapped', { F: swapFirstPair }]]) {
      const { page, errors, context } = await open({ touch: true })
      await page.tap(t('begin-solve'))
      await page.waitForSelector(t('face-grid'))
      let jumped = 0
      for (const [face, turn] of views) {
        await page.waitForSelector(`${t('face-grid')}[data-face="${face}"]`, { timeout: 5000 }).catch(() => {})
        let seen = after(turn, STATE).slice(18, 27)
        if (slip[face]) seen = slip[face](seen)
        for (const letter of new Set(seen)) {
          await page.tap(`${t('palette')} [data-color="${COLOR[letter]}"]`)
          for (let i = 0; i < 9; i++) {
            if (i === 4 || seen[i] !== letter) continue
            if ((await page.getAttribute(t('face-grid'), 'data-face').catch(() => null)) !== face) jumped++
            const cell = page.locator(`${t('face-grid')}[data-face="${face}"] button`).nth(i)
            if ((await cell.count()) === 0) continue
            if ((await cell.getAttribute('data-color')) !== COLOR[letter]) await cell.tap()
          }
        }
        if (face !== 'D') await page.tap(t('next-face'))
      }
      await page.waitForTimeout(600)
      equal(jumped, 0, `${name}: the grid stayed on the face being painted (QA N2)`)
      equal(await page.getAttribute(t('face-grid'), 'data-face'), 'D', `${name}: still on the bottom face after the last tap`)
      equal(await status(page), 'problems', `${name}: the slip is found`)
      const cells = (await saved(page)).cells
      const wrong = [...cells].filter((c, i) => c !== STATE[i]).length
      check(wrong <= 4, `${name}: only the slip itself is wrong — no extra sticker painted by a stray tap (${wrong} differ)`)
      const fixes = await page.locator(t('issue-fix')).count()
      check(fixes >= 1, `${name}: a one-tap fix is offered (S1)`)
      if (name.startsWith('R')) equal(await page.locator(`${t('issues')} > li`).count(), 1, `${name}: one card for the turned face, not a pile (S1)`)
      await page.locator(t('issue-fix')).first().tap()
      equal(await status(page), 'ok', `${name}: after the fix the cube checks out`)
      equal((await saved(page)).cells, STATE, `${name}: …and it is the real cube`)
      check(errors.length === 0, `${name}: console errors: ${errors.join(' | ')}`)
      await context.close()
    }
  },

  // ── S4: the last tap of face-by-face entry, by finger, paints only the sticker under it ──
  async lastTapTouch() {
    for (const [name, viewport] of [['tablet', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
      for (const hole of [27, 34, 35]) {
        const cells = STATE.slice(0, hole) + '-' + STATE.slice(hole + 1)
        const { page, errors, context } = await open({ viewport, touch: true, solve: { phase: 'entry', intent: 'solve', entryMode: 'guided', guidedIndex: 5, centresLocked: true, brush: COLOR[STATE[hole]], cells } })
        const target = page.locator(`${t('face-grid')} [data-facelet="${hole}"]`)
        await target.waitFor()
        await target.tap() // a real touch: pointerdown on the 3x3 grid, whose click arrives after the cube is complete
        await page.waitForSelector(t('check-card'))
        await page.waitForTimeout(500) // the click of that same touch arrives after the net has mounted
        equal((await saved(page)).cells, STATE, `last tap ${name} @${hole}: exactly the tapped sticker was painted`)
        equal(await status(page), 'ok', `last tap ${name} @${hole}: the cube passes the check`)
        check(errors.length === 0, `last tap ${name}: console errors: ${errors.join(' | ')}`)
        await context.close()
      }
    }
  },

  // ── a cube entered in a non-standard hold is solved in that hold ──
  async orientation() {
    const turned = after('x y', STATE)
    const { page, errors, context } = await open({ solve: { phase: 'entry', cells: turned, entryMode: 'free', centresLocked: false } })
    await cubeReady(page)
    equal(await status(page), 'ok', 'orientation: a cube held another way round passes the check')
    await page.click(t('entry-continue'))
    await page.click(t('start-solve'))
    await page.waitForSelector(`${t('step-card')}[data-kind="hold"]`)
    equal(await cubeState(page), turned, 'orientation: the 3D cube is held the way it was entered')
    const result = await walkToEnd(page, turned, { compareEvery: 3 })
    equal(result.mismatches, 0, 'orientation: the 3D cube and the instructions agree throughout')
    check(isSolved(result.end), 'orientation: ends solved')
    check(errors.length === 0, `orientation: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── painting helpers: keyboard colours, drag-painting, forced stickers, clear all ──
  async painting() {
    const { page, errors, context } = await open({ solve: { phase: 'entry', cells: BLANK, entryMode: 'free' } })
    await page.locator('main h1').click()
    await page.keyboard.press('5')
    equal(await page.getAttribute(`${t('palette')} [data-color="red"]`, 'aria-checked'), 'true', 'painting: key 5 picks red')
    // Drag across the top row of the front face: three stickers, one undo step.
    const box = async (i) => (await page.locator(`${t('entry-net')} [data-facelet="${i}"]`).boundingBox())
    const from = await box(18)
    const to = await box(20)
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
    await page.mouse.up()
    equal((await saved(page)).cells.slice(18, 21), 'RRR', 'painting: dragging paints every sticker it crosses')
    await page.keyboard.press('Control+z')
    equal((await saved(page)).cells.slice(18, 21), '---', 'painting: one undo takes back the whole stroke')
    await page.keyboard.press('Control+Shift+z')
    equal((await saved(page)).cells.slice(18, 21), 'RRR', 'painting: redo brings it back')
    // Centres are locked.
    await page.click(`${t('entry-net')} [data-facelet="4"]`, { force: true })
    equal((await saved(page)).cells[4], 'U', 'painting: a locked centre cannot be painted')
    // Arrow keys move across the net; Enter paints.
    await page.focus(`${t('entry-net')} [data-facelet="21"]`)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    equal((await saved(page)).cells[24], 'R', 'painting: arrows move the cursor and Enter paints')
    // Too many of one colour is flagged at once.
    await page.keyboard.press('1')
    for (const i of [0, 1, 2, 3, 5, 6, 7, 8, 9]) await page.click(`${t('entry-net')} [data-facelet="${i}"]`)
    equal(await page.getAttribute(`${t('palette')} [data-color="white"]`, 'data-left'), '-1', 'painting: a tenth white is counted')
    // The check follows the paint within a moment (it is deferred so the tap itself is instant).
    check(await page.waitForSelector('[data-issue="wrong-count"]', { timeout: 3000 }).then(() => true, () => false), 'painting: and explained straight away')
    // Clear all is guarded.
    await page.click(t('clear-all'))
    await page.click(t('confirm-clear'))
    equal((await saved(page)).cells, BLANK, 'painting: clear all empties everything but the centres')

    // Forced stickers: a cube with six holes offers to fill what is certain; the last colour fills itself.
    const holes = [0, 2, 20, 45, 47, 53]
    const holed = [...STATE].map((c, i) => (holes.includes(i) ? '-' : c)).join('')
    await page.evaluate((cells) => localStorage.setItem('rubikku:solve', JSON.stringify({ version: 1, state: { phase: 'entry', cells, entryMode: 'free' } })), holed)
    await page.reload({ waitUntil: 'networkidle' })
    await page.click(t('fill-forced'))
    const filled = (await saved(page)).cells
    check([...filled].every((c, i) => c === '-' || c === STATE[i]), 'painting: every sticker filled in for him is right')
    check([...filled].filter((c) => c === '-').length < holes.length, 'painting: the sure ones were filled')
    // Try-it helpers.
    await page.click(t('more-helpers'))
    await page.click(t('fill-random'))
    equal(await status(page), 'ok', 'painting: a random scramble is a valid cube')
    check((await saved(page)).demo === true, 'painting: a pretend cube is marked as one')
    await page.click(t('fill-solved'))
    await page.click(t('entry-continue'))
    await page.waitForSelector(`${t('where-panel')}[data-solved="true"]`)
    check(errors.length === 0, `painting: console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── phone: touch, the 3D painting surface, thumb-reach controls, where-am-I entry point ──
  async phone() {
    const { page, errors, context } = await open({ viewport: { width: 390, height: 844 }, touch: true, route: '/solve?where' })
    // "Where am I?" opens with the eight pictures (MF2); "none of these" goes on to the stickers.
    await page.waitForSelector(t('chooser'))
    await page.tap(t('chooser-none'))
    await page.waitForSelector(t('face-grid'))
    equal((await saved(page)).intent, 'where', 'phone: #/solve?where → "none of these" opens the sticker check')
    await page.tap(`${t('palette')} [data-color="orange"]`)
    await page.locator(`${t('face-grid')} button`).nth(2).tap()
    equal((await saved(page)).cells[2], 'L', 'phone: a tap paints the big grid')
    await page.tap('[role="radio"]:has-text("3D")')
    await cubeReady(page)
    await page.waitForTimeout(900)
    const at = await page.evaluate(() => window.__rubikku.cubes.solve.facelet(8))
    check(at.facing, 'phone: the 3D cube faces the top while entering the top face')
    await page.touchscreen.tap(at.x, at.y)
    equal((await saved(page)).cells[8], 'L', 'phone: a tap on the 3D cube paints that sticker')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(overflow <= 1, `phone: entry does not scroll sideways (${overflow}px)`)
    // In the solution the Next button stays on screen, above the tab bar.
    await page.evaluate((cells) => localStorage.setItem('rubikku:solve', JSON.stringify({ version: 1, state: { phase: 'walk', cells, start: cells, pos: { step: 15, move: 1 } } })), STATE)
    await page.reload({ waitUntil: 'networkidle' })
    await cubeReady(page)
    await page.evaluate(() => window.scrollTo(0, 600))
    await page.waitForTimeout(200)
    const next = await page.locator(t('walk-next')).boundingBox()
    const stage = await page.locator('[data-cube3d="solve"]').boundingBox()
    check(next && next.y > 600 && next.y + next.height <= 844 - 60, `phone: Next stays in thumb reach while scrolled (${next?.y})`)
    check(stage && stage.y >= 50 && stage.y < 120, `phone: the cube stays pinned at the top while scrolled (${stage?.y})`)
    check(next.height >= 44, 'phone: Next is a big target')
    const index = Number(await page.getAttribute(t('walk-panel'), 'data-index'))
    await page.tap(t('walk-next'))
    equal(Number(await page.getAttribute(t('walk-panel'), 'data-index')), index + 1, 'phone: tapping Next advances one turn')
    check(errors.length === 0, `phone: console errors: ${errors.join(' | ')}`)
    await context.close()
  },
}

for (const [name, run] of Object.entries(tests)) {
  if (ONLY && !ONLY.includes(name)) continue
  console.log(`  ${name}`)
  try {
    await run()
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
    console.error(`    ✗ ${name} threw: ${error.message}`)
  }
}

await browser.close()
console.log(`\n${checks} checks, ${failures.length} failed`)
if (failures.length > 0) {
  console.error(failures.map((f) => `  - ${f.split('\nCall log')[0]}`).join('\n'))
  process.exit(1)
}
