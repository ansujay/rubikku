#!/usr/bin/env node
/**
 * End-to-end tests for Learn: the path, the lesson player and the full solve, in headless
 * Chromium (software WebGL), driven the way a learner would — reading the move chips, turning the
 * cube with the keyboard, pressing the lesson's own buttons.
 *
 *   npm run build && npx vite preview --port 4201 &
 *   node e2e/learn.e2e.mjs [baseUrl] [--only=primer,daisy]
 *
 * Walks three whole lessons (the primer, the daisy, the white cross), checks that a reload in the
 * middle of a demo and of a guided exercise restores the exact position and cube, that stages
 * unlock in order (and can be peeked at), that drills count clean solves and hints correctly, and
 * that the full solve rewards a solved cube. "Clean" drill solves use a solution computed
 * independently with cubejs.
 *
 * `earn` checks that reaching a wrap-up (the section stepper, Skip) never completes a lesson.
 * `corners` and `middle` follow the coach through drills of stages 3 and 4 with quarter-turn key
 * presses, checking after every single turn that nothing is said to have "come undone" and that
 * the hint never regresses, then slip on purpose and undo. `walk3` / `walk4` walk stages 3 and 4
 * from the first beat to an earned wrap-up. Exits non-zero on any failed check or console error.
 */
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const Cube = createRequire(import.meta.url)('cubejs')
Cube.initSolver()

const args = process.argv.slice(2)
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4201').replace(/\/$/, '')
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

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const settings = { version: 1, state: { theme: 'light', sound: false, motion: 'full', turnSpeed: 2, showFaceLabels: false } }

async function open(route, { viewport = { width: 1024, height: 768 }, storage = {} } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript(
    ({ storage, settings }) => {
      if (sessionStorage.getItem('seeded')) return // keep what the app saved across reloads
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('rubikku:settings', JSON.stringify(settings))
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, JSON.stringify(value))
    },
    { storage, settings },
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
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' })
  return { page, context, errors }
}

const ID = 'lesson'
const cheers = (page) => page.evaluate(() => (window.__cheers ?? []).map((c) => ({ ...c })))
const cubeReady = (page) => page.waitForFunction((id) => window.__rubikku?.cubes?.[id]?.frames() > 0, ID, { timeout: 20_000 })
const idle = (page) => page.evaluate((id) => window.__rubikku.cubes[id].whenIdle(), ID)
const stateOf = (page) => page.evaluate((id) => window.__rubikku.cubes[id].getState(), ID)
const saved = (page, name) => page.evaluate((name) => JSON.parse(localStorage.getItem(`rubikku:${name}`) ?? 'null')?.state ?? null, name)
const panel = (page) => page.locator('[data-testid="lesson-panel"]')
const beatOf = (page) => panel(page).getAttribute('data-beat')
const kindOf = (page) => panel(page).getAttribute('data-kind')
const attr = (page, testid, name) =>
  page
    .locator(`[data-testid="${testid}"]`)
    .first()
    .getAttribute(name, { timeout: 8000 })
    .catch(() => null) // not there: the check that wanted it fails with a readable message
const visible = (page, testid) => page.locator(`[data-testid="${testid}"]`).first().isVisible().catch(() => false)

/** Turn the cube with the keyboard: "R", "U'", "F2", "y" … */
async function type(page, moves) {
  await page.focus(`[data-cube3d=${ID}]`)
  for (const move of moves) {
    const base = move[0]
    const key = move.endsWith("'") ? `Shift+${base.toUpperCase()}` : base.toLowerCase()
    for (let n = 0; n < (move.endsWith('2') ? 2 : 1); n++) {
      await page.keyboard.press(key)
      await idle(page)
    }
  }
  await page.waitForTimeout(60)
}

/** The moves written on the chips of a guided exercise, in order (a whole-cube turn chip carries its move). */
const chipMoves = (page) => page.$$eval('[data-testid="moves"] [data-state]', (chips) => chips.map((c) => (c.dataset.move ?? c.textContent.trim()).replace('′', "'")))
/** The move shown in the "now" strip under the cube. */
const nowMove = (page) => page.locator('[data-testid="now-strip"]').getAttribute('data-move', { timeout: 4000 }).catch(() => null)

async function next(page) {
  const before = await beatOf(page)
  await page.click('[data-testid="beat-next"]')
  await page.waitForFunction((b) => document.querySelector('[data-testid="lesson-panel"]')?.getAttribute('data-beat') !== b, before, { timeout: 12000 })
  await page.waitForTimeout(260) // the panel swap
}

/** Do a guided exercise the way its scaffold expects; returns the number of moves made. */
async function doGuided(page) {
  const scaffold = await attr(page, 'guided-panel', 'data-scaffold')
  const reps = Number((await attr(page, 'guided-panel', 'data-reps')) ?? 0)
  let made = 0
  /** One go: by the chips when they are all there, else move by move from the hint. */
  const once = async () => {
    const help = await attr(page, 'guided-panel', 'data-help')
    if (help === 'full' || help === 'chips') {
      const moves = await chipMoves(page)
      await type(page, moves)
      made += moves.length
      return
    }
    for (let guard = 0; guard < 80; guard++) {
      const status = await attr(page, 'guided-panel', 'data-status')
      if (status === 'done' || (await page.locator('[data-testid="now-strip"][data-kind="done"]').count())) break
      if ((await attr(page, 'now-strip', 'data-kind')) !== 'move') await page.click('[data-testid="hint-button"]')
      await page.waitForSelector('[data-testid="now-strip"][data-kind="move"]', { timeout: 4000 })
      const move = (await nowMove(page)).replace('′', "'")
      await type(page, [move])
      made++
    }
  }
  if (reps > 0) {
    for (let round = Number(await attr(page, 'guided-panel', 'data-rep')); round < reps; round++) {
      await once()
      if (round < reps - 1) {
        // The same cube comes back with less help.
        await page.waitForFunction((r) => document.querySelector('[data-testid="guided-panel"]')?.getAttribute('data-rep') === String(r + 1) && document.querySelector('[data-testid="guided-panel"]')?.getAttribute('data-position') === '0', round, { timeout: 20000 })
        await page.waitForTimeout(400)
        await idle(page)
      }
    }
  } else if (scaffold === 'none') {
    made = await solveWithHints(page, () => attr(page, 'guided-panel', 'data-status').then((s) => s === 'done'))
  } else await once()
  await page.waitForSelector('[data-testid="guided-success"]', { timeout: 8000 }).catch(() => {})
  check(await visible(page, 'guided-success'), `${await beatOf(page)}: the guided exercise (${scaffold}) ends with its success message`)
  equal(await attr(page, 'beat-next', 'data-ready'), 'true', `${await beatOf(page)}: Next is ready after the exercise`)
  return made
}

/** Open the hint all the way: three taps (the piece, then the case, then the moves). */
async function fullHint(page) {
  for (let tap = 0; tap < 4; tap++) {
    if ((await visible(page, 'hint-card')) && (await attr(page, 'hint-card', 'data-level')) === '3') return
    await page.click('[data-testid="hint-button"]')
    await page.waitForSelector('[data-testid="hint-card"]', { timeout: 4000 }).catch(() => {})
  }
}

/** Hint → "Show me", until `done()`; returns the number of hints used. */
async function solveWithHints(page, done) {
  let hints = 0
  for (let guard = 0; guard < 90; guard++) {
    if (await done()) break
    if (!(await visible(page, 'hint-card')) || (await attr(page, 'hint-card', 'data-level')) !== '3') {
      await fullHint(page)
      hints++
    }
    const show = page.locator('[data-testid="hint-card"] [data-testid="hint-show"]') // "Show me" / "Turn the cube"
    if (await show.isEnabled().catch(() => false)) await show.click()
    await page.waitForTimeout(150)
    await idle(page)
    await page.waitForTimeout(1050) // the hint card puts itself away
  }
  return hints
}

/** Solve the whole cube without the app's help: stand it upright, then follow cubejs. */
async function solveIndependently(page) {
  await type(page, ['z2'])
  for (let n = 0; n < 4 && (await stateOf(page))[22] !== 'F'; n++) await type(page, ['y'])
  const state = await stateOf(page)
  equal(state[4] + state[22], 'UF', 'the cube can be stood upright with whole-cube turns')
  const solution = Cube.fromString(state).solve().split(' ').filter(Boolean)
  await type(page, solution)
  return solution.length + 2
}

/** Walk a lesson from wherever it is to its wrap-up, doing every exercise; returns what was seen. */
async function walkLesson(page, { drill }) {
  const seen = { kinds: [], guided: 0, demos: 0 }
  for (let guard = 0; guard < 60; guard++) {
    const kind = await kindOf(page)
    const beat = await beatOf(page)
    seen.kinds.push(kind)
    if (kind === 'wrap') break
    if (kind === 'guided') {
      await idle(page)
      await doGuided(page)
      seen.guided++
    } else if (kind === 'demo') {
      // Play the demo right through with the playback bar.
      const total = Number(await attr(page, 'moves', 'data-total'))
      await page.click('[data-testid="demo-play"]')
      await page.waitForFunction((t) => document.querySelector('[data-testid="moves"]')?.getAttribute('data-position') === String(t), total, { timeout: 30_000 }).catch(() => {})
      equal(Number(await attr(page, 'moves', 'data-position')), total, `${beat}: the demo plays to its last move`)
      await idle(page)
      await page.waitForSelector('[data-testid="demo-dock"] [data-testid="move-line"]', { state: 'detached', timeout: 3000 }).catch(() => {})
      check(await visible(page, 'move-line') === false, `${beat}: the move description gives way to the "whole case" line at the end`)
      seen.demos++
    } else if (kind === 'goal') {
      await page.click('[role="radio"]:has-text("After")')
      equal(await attr(page, 'goal-panel', 'data-where'), 'after', `${beat}: After shows the finished stage`)
      await page.click('[role="radio"]:has-text("Before")')
      equal(await attr(page, 'goal-panel', 'data-where'), 'before', `${beat}: Before goes back`)
    } else if (kind === 'drill') {
      await drill(page)
    } else if (kind === 'quiz') {
      await doQuiz(page)
      seen.quizzes = (seen.quizzes ?? 0) + 1
    } else if (kind === 'real') {
      await page.click('[data-testid="real-confirm"]')
      await page.waitForSelector('[data-testid="real-done"]', { timeout: 4000 })
      seen.real = (seen.real ?? 0) + 1
    }
    await next(page)
  }
  return seen
}

/**
 * A "Which is it?" round: the first option each time — wrong ones are answered with the right
 * one lit, and then another cube — until the round is passed.
 */
async function doQuiz(page, { pick = 0 } = {}) {
  let wrong = 0
  for (let guard = 0; guard < 120; guard++) {
    if ((await attr(page, 'beat-next', 'data-ready')) === 'true') break
    const n = await attr(page, 'quiz-panel', 'data-n')
    const options = page.locator('[data-testid="quiz-option"]')
    // A different option each time, so every kind of question gets passed sooner or later.
    await options.nth((pick + guard) % (await options.count())).click()
    await page.waitForSelector('[data-testid="quiz-feedback"]', { timeout: 4000 })
    const right = (await attr(page, 'quiz-panel', 'data-right')) === 'true'
    if (!right) {
      wrong++
      check((await page.locator('[data-testid="quiz-option"][data-result="right"]').count()) === 1, 'a wrong answer shows the right one')
    }
    if ((await attr(page, 'beat-next', 'data-ready')) === 'true') break
    await page.click('[data-testid="quiz-next"]')
    await page.waitForFunction((n) => document.querySelector('[data-testid="quiz-panel"]')?.getAttribute('data-n') !== n, n, { timeout: 4000 })
    await idle(page)
  }
  equal(await attr(page, 'beat-next', 'data-ready'), 'true', `${await beatOf(page)}: the round is passed`)
  return wrong
}

const STAGES = ['daisy', 'white-cross', 'white-corners', 'middle-layer', 'yellow-cross', 'yellow-edges', 'yellow-corners-position', 'yellow-corners-orient']
const emptyLessonSave = (beatId = null) => ({ beatId, furthest: 0, done: {}, session: null, sessionKey: null, drill: { n: 0, hinted: false, solved: false, total: 0, clean: 0, streak: 0, best: 0 }, completed: false })
/** Saves for someone who has finished the primer and the first `stagesDone` stages. */
function learnerStorage(stagesDone, lessons = {}) {
  const at = '2026-01-02T10:00:00.000Z'
  return {
    'rubikku:learn': { version: 1, state: { lessons: { primer: { ...emptyLessonSave(), completed: true }, ...lessons }, capstone: { n: 0, session: null, hints: 0, solved: false, solves: 0 }, last: null } },
    'rubikku:progress': { version: 1, state: { lessons: Object.fromEntries(STAGES.slice(0, stagesDone).map((id) => [id, { startedAt: at, completedAt: at }])) } },
  }
}

const hintCard = '[data-testid="hint-card"]'
// Whole-cube turns are chips in words ("Turn left") carrying their move in data-move; face turns are letters.
const hintChips = (page) => page.$$eval(`${hintCard} [role="group"] [data-state]`, (chips) => chips.map((c) => c.dataset.move ?? c.textContent.trim().replace('′', "'")))

/**
 * One drill, solved by asking the coach and making every turn by hand as *quarter* turns (the way
 * drags and key presses arrive). After every single key press: no "come undone" line, the hint
 * is still for this stage, and it never says "off the path".
 */
async function followDrillWithQuarterTurns(page, stage, label) {
  let presses = 0
  let halves = 0
  let steps = 0
  const checkAfterPress = async (where) => {
    check(!(await visible(page, 'drill-undone')), `${label}: no "come undone" line ${where}`)
    // Read in one go: a finished step's card puts itself away after a moment, and two separate
    // reads on a busy machine can straddle that.
    const card = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="hint-card"]')
      return el ? { status: el.getAttribute('data-status'), stage: el.getAttribute('data-stage') } : null
    })
    if (card) {
      check(card.status !== 'off', `${label}: the hint does not say "off the path" ${where} (status ${card.status})`)
      check(STAGES.indexOf(card.stage) >= STAGES.indexOf(stage), `${label}: the hint is not for an earlier stage ${where} (it is for ${card.stage})`)
    }
  }
  for (let guard = 0; guard < 40 && !(await visible(page, 'drill-solved')); guard++) {
    await fullHint(page)
    await page.waitForSelector(`${hintCard}[data-status="on"][data-level="3"]`, { timeout: 5000 })
    const caseId = await attr(page, 'hint-card', 'data-case')
    equal(await attr(page, 'hint-card', 'data-stage'), stage, `${label}: step ${guard + 1} (${caseId}) is a ${stage} step`)
    const moves = await hintChips(page)
    steps++
    await page.focus(`[data-cube3d=${ID}]`)
    for (let k = Number(await attr(page, 'hint-card', 'data-index')); k < moves.length; k++) {
      const move = moves[k]
      const double = move.endsWith('2')
      // Half turns alternately as two clockwise and two anticlockwise quarters.
      // … except before a turn of the same face ("U2 then U"): one quarter the other way would be
      // a legitimate short cut (the coach follows it), so there the quarters go the long way round.
      const after = moves[k + 1]
      const anticlockwise = double && after && after[0] === move[0] ? after.endsWith("'") : double && halves % 2 === 1
      const key = move.endsWith("'") || anticlockwise ? `Shift+${move[0].toUpperCase()}` : move[0].toLowerCase()
      for (let n = 0; n < (double ? 2 : 1); n++) {
        await page.keyboard.press(key)
        await idle(page)
        await page.waitForTimeout(40)
        presses++
        const last = k === moves.length - 1 && n === (double ? 1 : 0)
        await checkAfterPress(`after turn ${k + 1}${double ? ` (quarter ${n + 1})` : ''} of ${caseId} [${moves.join(' ')}]`)
        if (!last && !(await visible(page, 'hint-card'))) {
          // The step ended sooner than its chips said: only right if the cube really is at a boundary.
          console.log(`    note: ${label}: the hint for ${caseId} [${moves.join(' ')}] closed after turn ${k + 1}${double ? ` (quarter ${n + 1})` : ''}; solved=${await visible(page, 'drill-solved')}`)
          check(await visible(page, 'drill-solved'), `${label}: the hint for ${caseId} [${moves.join(' ')}] stays open until the step is finished (closed after turn ${k + 1})`)
          k = moves.length
          break
        }
        if (double && n === 0) {
          equal(await attr(page, 'hint-card', 'data-status'), 'half', `${label}: one quarter of ${move} is "half-way", not a mistake`)
          equal(await attr(page, 'hint-card', 'data-case'), caseId, `${label}: half-way through ${move} the hint is still the same step`)
        } else if (!last) {
          equal(await attr(page, 'hint-card', 'data-case'), caseId, `${label}: the hint stays on ${caseId} after turn ${k + 1}`)
          equal(await attr(page, 'hint-card', 'data-index'), String(k + 1), `${label}: ${caseId} has moved on to turn ${k + 2}`)
        }
      }
      if (double) halves++
    }
    // The finished step shows as done for a moment, then the card puts itself away.
    await page.waitForSelector(hintCard, { state: 'detached', timeout: 4000 }).catch(() => {})
  }
  check(await visible(page, 'drill-solved'), `${label}: the drill is solved by following the hints`)
  return { presses, halves, steps }
}

/** In the middle of a hinted step, make one wrong turn: "undo that" is offered and brings the same hint back. */
async function slipAndUndo(page, label) {
  await fullHint(page)
  await page.waitForSelector(`${hintCard}[data-status="on"]`)
  let moves = await hintChips(page)
  // Get one turn into a step that has at least three (so the slip lands mid-algorithm).
  for (let guard = 0; guard < 12 && moves.length < 3; guard++) {
    await page.click(`${hintCard} [data-testid="hint-show"]`)
    // The short step plays, shows as done for a moment, and the card puts itself away.
    await page.waitForSelector(hintCard, { state: 'detached', timeout: 15_000 })
    await idle(page)
    await fullHint(page)
    await page.waitForSelector(`${hintCard}[data-status="on"]`)
    moves = await hintChips(page)
  }
  const caseId = await attr(page, 'hint-card', 'data-case')
  const stage = await attr(page, 'hint-card', 'data-stage')
  await type(page, [moves[0].endsWith('2') ? moves[0] : moves[0]])
  const index = await attr(page, 'hint-card', 'data-index')
  const before = await stateOf(page)
  const wrong = ['L', 'B', 'D', 'R', 'F'].find((face) => face !== moves[0][0] && face !== (moves[1] ?? '')[0])
  await type(page, [wrong])
  await page.waitForSelector('[data-testid="hint-off"]', { timeout: 4000 }).catch(() => {})
  check(await visible(page, 'hint-off'), `${label}: a wrong turn (${wrong}) mid-step is answered with "undo that"`)
  check((await page.textContent(hintCard)).includes(wrong), `${label}: the message names the wrong turn`)
  equal(await attr(page, 'hint-card', 'data-case'), caseId, `${label}: after the slip the hint is still the same step`)
  equal(await attr(page, 'hint-card', 'data-stage'), stage, `${label}: after the slip the hint has not gone back a stage`)
  await page.click('[data-testid="hint-undo"]')
  await idle(page)
  await page.waitForSelector('[data-testid="hint-off"]', { state: 'detached', timeout: 4000 }).catch(() => {})
  equal(await stateOf(page), before, `${label}: "Undo that" puts the cube back`)
  equal(await attr(page, 'hint-card', 'data-case'), caseId, `${label}: after undoing, the original hint is back`)
  equal(await attr(page, 'hint-card', 'data-index'), index, `${label}: … at the same place in the step`)
  equal(await attr(page, 'hint-card', 'data-status'), 'on', `${label}: … and back on the path`)
  // The same by hand: the wrong turn, then its opposite.
  await type(page, [wrong, `${wrong}'`])
  equal(await attr(page, 'hint-card', 'data-status'), 'on', `${label}: undoing the slip by hand works too`)
  equal(await attr(page, 'hint-card', 'data-case'), caseId, `${label}: … with the same hint`)
}

async function drillWithCoach(stage, stagesDone) {
  const { page, context, errors } = await open(`/learn/${stage}`, { storage: learnerStorage(stagesDone, { [stage]: emptyLessonSave('drill') }) })
  await cubeReady(page)
  equal(await kindOf(page), 'drill', `${stage}: opens on its drills`)
  await idle(page)
  const first = await followDrillWithQuarterTurns(page, stage, `${stage} drill 1`)
  check(first.presses >= 6, `${stage} drill 1 took ${first.presses} key presses over ${first.steps} steps`)
  equal(await attr(page, 'drill-panel', 'data-total'), '1', `${stage}: the drill counts as solved`)
  equal(await attr(page, 'drill-panel', 'data-clean'), '0', `${stage}: a hinted drill is not clean`)
  // A second cube: slip on purpose in the middle of a step, undo, then finish it the same way.
  await page.click('[data-testid="drill-next"]')
  await page.waitForSelector('[data-testid="drill-solved"]', { state: 'detached' })
  await idle(page)
  await slipAndUndo(page, `${stage} drill 2`)
  const second = await followDrillWithQuarterTurns(page, stage, `${stage} drill 2`)
  console.log(`    ${stage}: ${first.presses + second.presses} quarter-turn presses, ${first.steps + second.steps} hinted steps, ${first.halves + second.halves} half turns`)
  equal(errors.join('\n'), '', `${stage} drills: no console errors`)
  await context.close()
}

/** A whole stage lesson, first beat to wrap-up, every exercise done; the stage is then complete. */
async function walkStage(stage, stagesDone) {
  const { page, context, errors } = await open(`/learn/${stage}`, { storage: learnerStorage(stagesDone) })
  await cubeReady(page)
  check(!(await visible(page, 'peek-banner')), `${stage}: open, not a peek`)
  const xpBefore = (await saved(page, 'progress'))?.xp ?? 0
  const seen = await walkLesson(page, {
    drill: async (page) => {
      await idle(page)
      await solveWithHints(page, () => visible(page, 'drill-solved'))
      await page.waitForSelector('[data-testid="drill-solved"]', { timeout: 8000 })
      check(!(await visible(page, 'drill-undone')), `${stage}: no "come undone" line on the solved drill`)
    },
  })
  equal(seen.kinds[seen.kinds.length - 1], 'wrap', `${stage}: the walk ends on the wrap-up`)
  check(seen.guided >= 2, `${stage}: ${seen.guided} guided exercises were done on the way`)
  check((seen.quizzes ?? 0) >= 1, `${stage}: the "Which is it?" round was passed on the way`)
  check((seen.real ?? 0) === 1, `${stage}: the "Now on your cube" step was confirmed`)
  check(seen.kinds.includes('drill') && seen.kinds.includes('demo') && seen.kinds.includes('goal'), `${stage}: goal, demos and drills were all visited`)
  equal(await attr(page, 'wrap-panel', 'data-complete'), 'true', `${stage}: the wrap-up says the stage is complete`)
  check(!(await visible(page, 'wrap-todo')), `${stage}: nothing is left to do`)
  const progress = await saved(page, 'progress')
  check(Boolean(progress.lessons[stage]?.completedAt), `${stage}: complete in the progress store`)
  check(progress.xp > xpBefore, `${stage}: finishing it earned XP`)
  equal((await saved(page, 'learn')).lessons[stage].completed, true, `${stage}: saved as complete`)
  // The pay-off: a moment ("Stage learned"), not a takeover — the stage's badge and XP in it.
  await page.waitForFunction(() => window.__cheers.some((c) => /Stage learned/.test(c.text)), null, { timeout: 9000 }).catch(() => {})
  const party = await cheers(page)
  const learned = party.find((c) => /Stage learned/.test(c.text))
  check(Boolean(learned), `${stage}: completing the lesson is celebrated (${party.map((c) => `${c.tier}: ${c.text}`).join(' | ')})`)
  // (Level 3 — 300 XP — is the first level-up that takes over the screen; a walk that crosses
  // it may end in that takeover, titled the lesson's way.)
  const levelUp = progress.xp >= 300 || ((await saved(page, 'progress'))?.xp ?? 0) >= 300
  if (!levelUp) {
    equal(learned?.tier, 'moment', `${stage}: …as a moment`)
    check(party.every((c) => c.tier !== 'milestone'), `${stage}: nothing on the way took over the screen`)
  } else check(party.filter((c) => c.tier === 'milestone').length <= 1, `${stage}: at most one takeover (the level-up)`)
  await page.waitForSelector('[data-testid="celebration"]', { state: 'detached', timeout: 6000 }).catch(() => {})
  await page.click('[aria-label="Back to the path"]')
  await page.waitForSelector('[data-testid="path"]')
  equal(await page.getAttribute(`[data-testid="stop-${stage}"]`, 'data-status'), 'complete', `path: ${stage} is complete`)
  equal(await page.getAttribute(`[data-testid="stop-${STAGES[stagesDone + 1]}"]`, 'data-status'), 'current', `path: the next stage is up`)
  equal(errors.join('\n'), '', `${stage} walk: no console errors`)
  await context.close()
}

const tests = {
  // Completion is earned, not reached: the stepper and Skip never complete a lesson.
  async earn() {
    const { page, context, errors } = await open('/learn/daisy', { storage: learnerStorage(0) })
    await cubeReady(page)
    const xp = (await saved(page, 'progress'))?.xp ?? 0
    await page.click('[data-testid="stepper"] button[aria-label^="Wrap-up"]')
    await page.waitForSelector('[data-testid="wrap-panel"]')
    equal(await attr(page, 'wrap-panel', 'data-complete'), 'false', 'one tap on "Wrap-up" does not complete the stage')
    check(await visible(page, 'wrap-todo'), 'the wrap-up says what is still to do')
    const todo = await page.locator('[data-testid="wrap-todo-item"]').count()
    check(todo >= 3, `the wrap-up lists the exercises to do (${todo})`)
    await page.waitForTimeout(600)
    let progress = await saved(page, 'progress')
    check(!progress?.lessons?.daisy?.completedAt, 'the progress store does not mark stage 1 complete')
    equal(progress?.xp ?? 0, xp, 'no XP for jumping to the end')
    equal((await saved(page, 'learn')).lessons.daisy.completed, false, 'the lesson is not saved as complete')
    // The list leads straight to the first exercise.
    await page.locator('[data-testid="wrap-todo-item"]').first().click()
    await page.waitForFunction(() => document.querySelector('[data-testid="lesson-panel"]')?.getAttribute('data-kind') === 'guided', null, { timeout: 5000 })
    equal(await kindOf(page), 'guided', 'a to-do item opens that exercise')
    // "Skip" all the way to the end: still not complete.
    for (let guard = 0; guard < 40 && (await kindOf(page)) !== 'wrap'; guard++) await next(page)
    equal(await attr(page, 'wrap-panel', 'data-complete'), 'false', 'skipping every beat does not complete the stage either')
    progress = await saved(page, 'progress')
    check(!progress?.lessons?.daisy?.completedAt, 'still not complete in the progress store after skipping through')
    await page.click('[aria-label="Back to the path"]')
    await page.waitForSelector('[data-testid="path"]')
    equal(await page.getAttribute('[data-testid="stop-daisy"]', 'data-status'), 'current', 'path: stage 1 is still the one to do')
    equal(await page.getAttribute('[data-testid="stop-white-cross"]', 'data-status'), 'locked', 'path: stage 2 is still locked')

    // A locked stage, peeked at: the same, and it says why.
    await page.goto(`${BASE}/#/learn/yellow-cross`)
    await page.waitForSelector('[data-testid="peek-banner"]')
    await cubeReady(page)
    await page.click('[data-testid="stepper"] button[aria-label^="Wrap-up"]')
    await page.waitForSelector('[data-testid="wrap-panel"]')
    equal(await attr(page, 'wrap-panel', 'data-complete'), 'false', 'a locked stage cannot be completed by peeking at its wrap-up')
    await page.waitForTimeout(400)
    check(!(await saved(page, 'progress'))?.lessons?.['yellow-cross']?.completedAt, 'peeking: nothing marked complete')
    equal(errors.join('\n'), '', 'earn: no console errors')
    await context.close()
  },

  // Drills of later stages, by following the coach with quarter-turn key presses.
  async corners() {
    await drillWithCoach('white-corners', 2)
  },
  async middle() {
    await drillWithCoach('middle-layer', 3)
  },

  // Stages 3, 4 and 7, walked end to end.
  async walk3() {
    await walkStage('white-corners', 2)
  },
  async walk4() {
    await walkStage('middle-layer', 3)
  },
  async walk7() {
    await walkStage('yellow-corners-position', 6)
  },

  // QA L1: "Turn it" on the daisy's first exercise (the last move of the exercise) used to throw.
  async hold() {
    const { page, context, errors } = await open('/learn/daisy', { storage: learnerStorage(0, { daisy: emptyLessonSave('hold') }) })
    await cubeReady(page)
    equal(await beatOf(page), 'hold', 'opens on "First: yellow on top"')
    equal(await attr(page, 'now-strip', 'data-move'), 'z2', 'the strip under the cube says: roll it over')
    check((await page.textContent('[data-testid="now-strip"]')).includes('Roll the whole cube'), 'the whole-cube turn is in words, not "z2"')
    await page.click('[data-testid="turn-cube-expected"]')
    await page.waitForSelector('[data-testid="guided-success"]', { timeout: 8000 }).catch(() => {})
    check(await visible(page, 'guided-success'), 'tapping "Turn it" finishes the exercise')
    check(!(await page.locator('text=Something broke').count()), 'no error page')
    equal((await stateOf(page))[4], 'D', 'yellow is on top')
    equal(errors.join('\n'), '', 'hold: no console errors (QA L1)')
    await context.close()
  },

  // QA L2: a view swung round on one beat does not stay swung round on the next.
  async view() {
    const { page, context, errors } = await open('/learn/primer')
    await cubeReady(page)
    const pose = () => page.evaluate((id) => window.__rubikku.cubes[id].getPose(), ID)
    const start = await pose()
    const box = await page.locator('[data-cube3d=lesson]').boundingBox()
    // Drag on the empty stage beside the cube.
    await page.mouse.move(box.x + 12, box.y + box.height - 12)
    await page.mouse.down()
    await page.mouse.move(box.x + 70, box.y + box.height - 120, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(700)
    const swung = await pose()
    check(Math.abs(swung.azimuth - start.azimuth) + Math.abs(swung.elevation - start.elevation) > 0.2, `the drag swung the view round (${JSON.stringify(swung)})`)
    await next(page)
    await page.waitForTimeout(900)
    const after = await pose()
    check(Math.abs(after.azimuth - start.azimuth) < 0.02 && Math.abs(after.elevation - start.elevation) < 0.02, `the next beat starts from the standard view (QA L2): ${JSON.stringify(after)} vs ${JSON.stringify(start)}`)
    // QA X3: Next by keyboard — focus lands on the new beat's title, not on the page.
    const before = await beatOf(page)
    await page.focus('[data-testid="beat-next"]')
    await page.keyboard.press('Enter')
    await page.waitForFunction((b) => document.querySelector('[data-testid="lesson-panel"]')?.getAttribute('data-beat') !== b, before, { timeout: 12000 })
    await page.waitForTimeout(700)
    equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName), 'beat-title', 'after Next, focus is on the new beat (QA X3)')
    equal(errors.join('\n'), '', 'view: no console errors')
    await context.close()
  },

  // A "Which is it?" round: a wrong answer shows the right one and brings another cube; the round
  // only counts once enough are right, and it is part of earning the stage.
  async quiz() {
    const { page, context, errors } = await open('/learn/middle-layer', { storage: learnerStorage(3, { 'middle-layer': emptyLessonSave('quiz') }) })
    await cubeReady(page)
    equal(await kindOf(page), 'quiz', 'opens on the recognition round')
    equal(await attr(page, 'beat-next', 'data-ready'), 'false', 'the round is to do')
    const before = await stateOf(page)
    // A wrong answer on purpose: the answer is never "the same as the first option" every time, so
    // pick the one the right answer is not.
    const options = page.locator('[data-testid="quiz-option"]')
    await options.nth(2).click()
    await page.waitForSelector('[data-testid="quiz-feedback"]')
    const right = (await attr(page, 'quiz-panel', 'data-right')) === 'true'
    check((await page.locator('[data-testid="quiz-option"][data-result="right"]').count()) === 1, 'after answering, the right answer is marked')
    check((await page.textContent('[data-testid="quiz-feedback"]')).length > 40, 'and it says why')
    equal(await stateOf(page), before, 'nobody turned the cube: it is a question about this cube')
    await page.click('[data-testid="quiz-next"]')
    await page.waitForFunction(() => document.querySelector('[data-testid="quiz-panel"]')?.getAttribute('data-n') === '1')
    check((await stateOf(page)) !== before, 'the next question is another cube')
    const wrong = await doQuiz(page, { pick: 1 })
    console.log(`    quiz: first answer ${right ? 'right' : 'wrong'}, then ${wrong} wrong on the way`)
    const kept = (await saved(page, 'learn')).lessons['middle-layer']
    equal(kept.done.quiz, true, 'the round is saved as passed')
    check(kept.quiz.quiz.right >= 6, 'six right answers')
    equal(errors.join('\n'), '', 'quiz: no console errors')
    await context.close()
  },

  // "Now on your cube": done on the real cube counts as practising the stage (instead of a
  // drill), but never instead of the exercises.
  async real() {
    const done = Object.fromEntries(['move-f2', 'quiz', 'try-1', 'try-2', 'try-3'].map((id) => [id, true]))
    const { page, context, errors } = await open('/learn/white-cross', { storage: learnerStorage(1, { 'white-cross': { ...emptyLessonSave('wrap'), done } }) })
    await cubeReady(page)
    equal(await attr(page, 'wrap-panel', 'data-complete'), 'false', 'exercises done, nothing practised: not complete')
    const items = await page.locator('[data-testid="wrap-todo-item"]').allTextContents()
    check(items.some((t) => t.includes('practice cube')) && items.some((t) => t.includes('own cube')), `the wrap-up offers a practice cube or his own cube (${items.join(' | ')})`)
    await page.locator('[data-testid="wrap-todo-item"]', { hasText: 'own cube' }).click()
    await page.waitForSelector('[data-testid="real-panel"]')
    equal(await kindOf(page), 'real', 'the to-do opens the real-cube step')
    equal(await attr(page, 'beat-next', 'data-ready'), 'false', 'not yet confirmed')
    // Two hands on the cube: Space is the Done button.
    await page.locator('body').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press('Space')
    await page.waitForSelector('[data-testid="real-done"]', { timeout: 4000 })
    check(await visible(page, 'real-done'), 'Space confirms the real-cube step')
    await next(page)
    await page.waitForSelector('[data-testid="wrap-panel"][data-complete="true"]', { timeout: 4000 }).catch(() => {})
    equal(await attr(page, 'wrap-panel', 'data-complete'), 'true', 'done on his own cube: the stage is complete')
    const progress = await saved(page, 'progress')
    check(Boolean(progress.lessons['white-cross']?.completedAt), 'complete in the progress store')
    // "I'm stuck" on a real-cube step leads to the rules and to "Where am I?".
    await page.click('[data-testid="beat-back"]')
    await page.waitForSelector('[data-testid="real-panel"]')
    await page.click('[data-testid="stuck-button"]')
    await page.waitForSelector('[role="dialog"] [data-testid="recovery-rules"]')
    check((await page.textContent('[role="dialog"]')).includes('straight back'), 'Stuck? starts with the real-cube rules')
    // …and, at the very top, "Which picture looks most like your cube?" (MF2): 20 seconds, not 54 stickers.
    const where = await page.locator('[role="dialog"] [data-testid="where-card"]').boundingBox()
    const rules = await page.locator('[role="dialog"] [data-testid="recovery-rules"]').boundingBox()
    check(where && rules && where.y < rules.y, 'the picture chooser comes first in Stuck?')
    await page.click('[role="dialog"] [data-testid="where-link"]')
    await page.waitForSelector('[role="dialog"] [data-testid="chooser"]')
    equal(await page.locator('[role="dialog"] [data-testid^="chooser-pick-"]').count(), 8, 'eight pictures to choose from')
    await page.click('[role="dialog"] [data-testid="chooser-pick-white-cross"]')
    await page.waitForSelector('[role="dialog"] [data-testid="chooser-route"]')
    equal(await attr(page, 'chooser-route', 'data-next'), 'white-corners', 'the white cross done: stage 3 is next')
    check((await page.textContent('[data-testid="chooser-checks"]')).includes('Underneath'), 'a quick check first: look underneath')
    await page.click('[data-testid="chooser-earlier"]')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="chooser-route"]').length === 1 && document.querySelector('[data-testid="chooser-route"]').dataset.next === 'white-cross', null, { timeout: 4000 }).catch(() => {})
    equal(await attr(page, 'chooser-route', 'data-next'), 'white-cross', '"Not quite" goes one picture back: the cross itself is next')
    await page.click('[data-testid="chooser-go-cube"]')
    await page.waitForSelector('[data-testid="lesson-panel"][data-beat="cube"]')
    equal(await kindOf(page), 'real', 'the same lesson: straight to its real-cube step')
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 4000 }).catch(() => {})
    check(!(await page.locator('[role="dialog"]').count()), 'and the sheet is closed')
    equal(errors.join('\n'), '', 'real: no console errors')
    await context.close()
  },

  // MF2: "Which picture looks most like your cube?" from another lesson's real-cube step, and at
  // #/solve?where; "none of these" leads to painting the stickers.
  async chooser() {
    const { page, context, errors } = await open('/learn/middle-layer', { storage: learnerStorage(3, { 'middle-layer': emptyLessonSave('cube') }) })
    await cubeReady(page)
    equal(await kindOf(page), 'real', 'opens on the real-cube step')
    await page.click('[data-testid="real-stuck"]')
    await page.click('[role="dialog"] [data-testid="where-link"]')
    await page.waitForSelector('[role="dialog"] [data-testid="chooser"]')
    await page.click('[role="dialog"] [data-testid="chooser-pick-middle-layer"]')
    await page.waitForSelector('[data-testid="chooser-route"]')
    equal(await attr(page, 'chooser-route', 'data-next'), 'yellow-cross', 'two layers done: stage 5 is next')
    await page.click('[data-testid="chooser-go-drill"]')
    await page.waitForFunction(() => location.hash.endsWith('/learn/yellow-cross'), null, { timeout: 8000 })
    await page.waitForSelector('[data-testid="lesson-panel"][data-beat="drill"]', { timeout: 8000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="lesson-panel"]').length === 1, null, { timeout: 12000 })
    equal(await kindOf(page), 'drill', 'another lesson: straight to its practice cubes')
    // From the Learn map's "Where is my cube?" (and the capstone's): the chooser, not 54 stickers.
    await page.goto(`${BASE}/#/solve?where`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="where-chooser"] [data-testid="chooser"]')
    check(!(await visible(page, 'entry-net')) && !(await visible(page, 'face-grid')), '/solve?where does not open on the sticker entry')
    const firstTile = await page.locator('[data-testid="chooser-pick-scrambled"]').boundingBox()
    const lastTile = await page.locator('[data-testid="chooser-pick-yellow-corners-position"]').boundingBox()
    check(firstTile.y + firstTile.height <= 768 && lastTile.y + lastTile.height <= 768, `all eight pictures are on the first screen (${Math.round(lastTile.y + lastTile.height)})`)
    await page.click('[data-testid="chooser-pick-scrambled"]')
    await page.waitForSelector('[data-testid="chooser-route"]')
    equal(await attr(page, 'chooser-route', 'data-next'), 'daisy', 'nothing done yet: stage 1')
    check(!(await visible(page, 'chooser-checks')), 'a scrambled cube needs no check')
    await page.click('[data-testid="chooser-go-cube"]')
    await page.waitForFunction(() => location.hash.endsWith('/learn/daisy'), null, { timeout: 8000 })
    await page.waitForSelector('[data-testid="lesson-panel"][data-beat="cube"]', { timeout: 8000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="lesson-panel"]').length === 1, null, { timeout: 12000 })
    equal(await kindOf(page), 'real', 'the daisy, at its real-cube step')
    await page.goto(`${BASE}/#/solve?where`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="chooser-none"]')
    check(!(await visible(page, 'chooser-route')), 'arriving again at /solve?where starts from the pictures')
    await page.click('[data-testid="chooser-none"]')
    await page.waitForSelector('[data-testid="face-grid"], [data-testid="entry-net"]', { timeout: 8000 })
    const solve = await saved(page, 'solve')
    equal(solve.intent, 'where', '"None of these": the sticker check, for "where am I?"')
    equal(solve.phase, 'entry', '…starting with the colours')
    equal(errors.join('\n'), '', 'chooser: no console errors')
    await context.close()
  },

  // SF1: the right algorithm from the wrong side is named as a choice, not "you broke it".
  async wrongside() {
    const { page, context, errors } = await open('/learn/middle-layer', { storage: learnerStorage(3, { 'middle-layer': emptyLessonSave('try-2') }) })
    await cubeReady(page)
    await idle(page)
    equal(await beatOf(page), 'try-2', 'opens on "Which way? You choose"')
    // Make the T with the hints (names only: a hint shows one move), until the step is "send it".
    for (let guard = 0; guard < 6; guard++) {
      const title = await page.textContent('[data-testid="now-strip"]')
      if (/Send the edge to its side/.test(title)) break
      if ((await attr(page, 'now-strip', 'data-kind')) !== 'move') await page.click('[data-testid="now-strip"] [data-testid="hint-button"]')
      await page.waitForSelector('[data-testid="now-strip"][data-kind="move"]', { timeout: 4000 })
      await type(page, [(await nowMove(page)).replace('′', "'")])
    }
    check(/Send the edge to its side/.test(await page.textContent('[data-testid="now-strip"]')), 'the T is made')
    // This edge goes left. Start the right-hand version instead.
    await type(page, ['U', 'R'])
    await page.waitForSelector('[data-testid="now-strip"][data-kind="off"]', { timeout: 4000 })
    const said = await page.textContent('[data-testid="now-strip"]')
    check(/right-hand version/.test(said) && /left centre/.test(said), `named as the wrong side (${said})`)
    check(!/broke/.test(said), 'not "you broke it"')
    check(said.includes("U' L' U L U F U' F'".replace(/'/g, '′')) || said.includes("U' L' U L U F U' F'"), 'and it gives the left-hand moves')
    await page.click('[data-testid="undo-that"]')
    await idle(page)
    await page.waitForSelector('[data-testid="now-strip"]:not([data-kind="off"])', { timeout: 4000 })
    check(true, 'Undo that: back on the plan')
    equal(errors.join('\n'), '', 'wrong side: no console errors')
    await context.close()
  },

  // Every answer and primary action of every beat is on the first screen at 1024×768 (and, on a
  // phone, reachable without scrolling): quiz answers, Done on the real cube, the demo's play
  // button, Before/After, Watch, the strip under the cube, the shape tiles and diagrams.
  async fold() {
    const actions = {
      quiz: '[data-testid="quiz-option"]',
      real: '[data-testid="real-confirm"], [data-testid="real-stuck"]',
      demo: '[data-testid="demo-play"]',
      goal: '[data-testid="goal-play"]',
      guided: '[data-testid="now-strip"]',
      drill: '[data-testid="now-strip"]',
      info: '[data-testid="info-watch"]',
    }
    for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      const phone = viewport.width < 600
      const { page, context, errors } = await open('/learn/yellow-cross', { viewport, storage: learnerStorage(4) })
      await cubeReady(page)
      const kinds = new Set()
      for (let guard = 0; guard < 16; guard++) {
        await page.waitForTimeout(320)
        const kind = await kindOf(page)
        const beat = await beatOf(page)
        if (kind === 'wrap') break
        kinds.add(kind)
        const selector = actions[kind]
        const hasShow = kind !== 'info' || (await page.locator(selector).count()) > 0
        if (selector && hasShow) {
          const boxes = await page.$$eval(selector, (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().bottom))
          check(boxes.length > 0, `${viewport.width}: ${beat} has its action`)
          const bottom = Math.max(...boxes)
          check(bottom <= viewport.height - (phone ? 56 : 0), `${viewport.width}: ${beat} (${kind}) — its action is on the first screen (bottom ${Math.round(bottom)})`)
        }
        if (!phone) {
          // The diagrams sit under the cube, not below the fold of the text.
          for (const figure of ['top-figure', 'shape-tiles']) {
            const box = await page.$$eval(`[data-testid="${figure}"]`, (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().bottom))
            if (box.length) check(Math.max(...box) <= viewport.height, `${viewport.width}: ${beat} — the ${figure} is on screen (${Math.round(Math.max(...box))})`)
          }
        }
        // On a phone the Back/Skip bar of a round sits after the answers (not over them) until he has answered.
        if (kind === 'quiz' && phone) {
          const bar = await page.locator('[data-testid="beat-footer"]').boundingBox()
          const answers = Math.max(...(await page.$$eval('[data-testid="quiz-option"]', (els) => els.map((e) => e.getBoundingClientRect().bottom))))
          check(bar && bar.y >= answers, `${viewport.width}: ${beat} — the bar does not cover the answers`)
        }
        await next(page)
      }
      for (const kind of ['goal', 'info', 'demo', 'guided', 'quiz', 'drill', 'real']) check(kinds.has(kind), `${viewport.width}: a ${kind} beat was measured`)
      // 200% zoom (512×384, QA N10): Back/Next of a lesson stays reachable on the first screen.
      if (!phone) {
        await page.setViewportSize({ width: 512, height: 384 })
        await page.goto(`${BASE}/#/learn/primer`, { waitUntil: 'networkidle' })
        await page.waitForSelector('[data-testid="beat-next"]')
        await page.waitForTimeout(500)
        const zoomed = await page.locator('[data-testid="beat-next"]').last().boundingBox()
        check(zoomed && zoomed.y + zoomed.height <= 384, `512×384: the lesson's Next is on screen (bottom ${zoomed ? Math.round(zoomed.y + zoomed.height) : '?'})`)
        await page.setViewportSize(viewport)
      }
      // The rounds with long answers: stage 4 (right, left, neither) and stage 6 (match, hold, swap).
      for (const [stage, done] of [['white-corners', 2], ['middle-layer', 3], ['yellow-edges', 5]]) {
        for (const n of [0, 1]) {
          await page.evaluate(({ stage, done, n }) => {
            const learn = JSON.parse(localStorage.getItem('rubikku:learn'))
            learn.state.lessons[stage] = { ...(learn.state.lessons[stage] ?? {}), beatId: 'quiz', quiz: { quiz: { n, right: 0, wrong: 0, answer: null } } }
            localStorage.setItem('rubikku:learn', JSON.stringify(learn))
          }, { stage, done, n })
          await page.reload({ waitUntil: 'networkidle' }) // the store reads the edited save on load (before anything writes it back)
          await page.goto(`${BASE}/#/learn/${stage}`, { waitUntil: 'networkidle' })
          await page.waitForSelector('[data-testid="quiz-option"]')
          await page.waitForTimeout(400)
          const bottom = Math.max(...(await page.$$eval('[data-testid="quiz-option"]', (els) => els.map((e) => e.getBoundingClientRect().bottom))))
          // (On a phone the Back/Skip bar sits after the answers until he has answered.)
          const footer = await page.locator('[data-testid="beat-footer"]').boundingBox()
          check(bottom <= Math.min(viewport.height - (phone ? 56 : 0), footer ? footer.y + 2 : Infinity), `${viewport.width}: ${stage} question ${n + 1} — every answer above the footer (${Math.round(bottom)} vs ${footer ? Math.round(footer.y) : 'no bar'})`)
        }
      }
      check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, `${viewport.width}: no sideways scroll`)
      equal(errors.join('\n'), '', `fold ${viewport.width}: no console errors`)
      await context.close()
    }
  },

  async path() {
    const { page, context, errors } = await open('/learn')
    await page.waitForSelector('[data-testid="path"]')
    const status = (id) => page.getAttribute(`[data-testid="stop-${id}"]`, 'data-status')
    equal(await status('primer'), 'current', 'a new learner starts at the primer')
    equal(await status('daisy'), 'open', 'stage 1 is open from the start')
    equal(await status('white-cross'), 'locked', 'stage 2 is locked')
    equal(await status('full-solve'), 'locked', 'the full solve is locked')
    equal(await page.locator('[data-testid="path"] > li').count(), 10, 'the path has ten stops')
    check((await page.textContent('[data-testid="path-continue"]')).includes('Meet your cube'), 'the continue button points at the primer')

    // A locked lesson can be peeked at, and says so.
    await page.click('[data-testid="stop-white-corners"] [data-testid="stop-peek"]')
    await page.waitForSelector('[data-testid="peek-banner"]')
    equal(await beatOf(page), 'goal', 'peeking opens the lesson at its first beat')
    await cubeReady(page)
    await next(page)
    equal(await beatOf(page), 'home', 'a peeked lesson can be walked through')
    await page.click('[aria-label="Back to the path"]')
    await page.waitForSelector('[data-testid="path"]')
    equal(await status('white-corners'), 'locked', 'peeking does not unlock the stage')
    equal(await status('primer'), 'current', 'the path still points at what is next')

    // Unknown lesson ids are a 404, not a crash.
    await page.goto(`${BASE}/#/learn/not-a-stage`)
    await page.waitForSelector('main h1')
    check(!(await page.locator('[data-testid="lesson-panel"]').count()), 'an unknown lesson id shows the not-found page')
    equal(errors.join('\n'), '', 'path: no console errors')
    await context.close()
  },

  async primer() {
    const { page, context, errors } = await open('/learn/primer')
    await cubeReady(page)
    equal(await beatOf(page), 'welcome', 'the primer opens on its first beat')

    // Walk to the first guided move, then to the first algorithm, checking persistence on the way.
    while ((await beatOf(page)) !== 'first-alg') {
      if ((await kindOf(page)) === 'guided') await doGuided(page)
      await next(page)
    }
    const moves = await chipMoves(page)
    equal(moves.join(' '), "R U R' U'", 'the first algorithm is the Right Trigger')
    await type(page, moves.slice(0, 2))
    equal(await attr(page, 'guided-panel', 'data-position'), '2', 'two moves in, the exercise is at position 2')
    const midway = await stateOf(page)

    // A wrong move is allowed to happen, explained, and undone with one tap.
    await type(page, ['F'])
    await page.waitForSelector('[data-testid="guided-off"]')
    check((await page.textContent('[data-testid="guided-off"]')).includes('F'), 'the off-path message names the move that was made')
    await page.click('[data-testid="undo-that"]')
    await idle(page)
    await page.waitForSelector('[data-testid="guided-off"]', { state: 'detached' })
    equal(await stateOf(page), midway, 'Undo that puts the cube back on the path')

    // Reload in the middle of the exercise: same lesson, same beat, same cube, same position.
    await page.reload({ waitUntil: 'networkidle' })
    await cubeReady(page)
    equal(await beatOf(page), 'first-alg', 'reload: still on the same beat')
    equal(await stateOf(page), midway, 'reload: the cube is exactly as it was left')
    equal(await attr(page, 'guided-panel', 'data-position'), '2', 'reload: still two moves in')
    await type(page, moves.slice(2))
    await page.waitForSelector('[data-testid="guided-success"]')

    const seen = await walkLesson(page, { drill: async () => {} })
    equal(seen.kinds[seen.kinds.length - 1], 'wrap', 'the primer ends on its wrap-up')
    check(await visible(page, 'notation-link'), 'the wrap-up links to the notation trainer')
    equal((await saved(page, 'learn')).lessons.primer.completed, true, 'the primer is saved as complete')
    check((await saved(page, 'progress')).xp > 0, 'finishing the primer earns XP')
    // A routine first lesson: a moment with the First Steps badge — never a takeover.
    check(Boolean((await saved(page, 'progress')).badges?.['first-steps']), 'finishing the primer earns First Steps')
    // (The "on your own cube" step just before has its own moment: this one may wait its turn.)
    await page.waitForFunction(() => window.__cheers.some((c) => /You\s+speak\s+cube/.test(c.text)), null, { timeout: 9000 }).catch(() => {})
    const party = await cheers(page)
    check(party.some((c) => c.tier === 'moment' && /You\s+speak\s+cube/.test(c.text)), `the primer ends with a moment (${party.map((c) => `${c.tier}: ${c.text}`).join(' | ')})`)
    check(party.every((c) => c.tier !== 'milestone'), 'finishing the first lesson does not take over the screen')
    check((await page.textContent('[data-testid="wrap-next"]')).includes('The daisy'), 'the wrap-up leads on to stage 1')

    await page.click('[aria-label="Back to the path"]')
    await page.waitForSelector('[data-testid="path"]')
    equal(await page.getAttribute('[data-testid="stop-primer"]', 'data-status'), 'complete', 'path: the primer is complete')
    equal(await page.getAttribute('[data-testid="stop-daisy"]', 'data-status'), 'current', 'path: stage 1 is up next')
    equal(errors.join('\n'), '', 'primer: no console errors')
    await context.close()
  },

  async daisy() {
    const { page, context, errors } = await open('/learn/daisy')
    await cubeReady(page)
    equal(await beatOf(page), 'goal', 'the daisy opens on its goal')

    // Reload in the middle of a demo: the playback position and the cube come back.
    while ((await beatOf(page)) !== 'top-flipped') {
      if ((await kindOf(page)) === 'guided') await doGuided(page)
      await next(page)
    }
    await page.click('[data-testid="demo-dock"] button[aria-label="Step forward"]')
    await idle(page)
    await page.waitForTimeout(150)
    equal(await attr(page, 'moves', 'data-position'), '1', 'the demo steps one move forward')
    const stepped = await stateOf(page)
    await page.reload({ waitUntil: 'networkidle' })
    await cubeReady(page)
    equal(await beatOf(page), 'top-flipped', 'reload mid-demo: same beat')
    equal(await attr(page, 'moves', 'data-position'), '1', 'reload mid-demo: same playback position')
    equal(await stateOf(page), stepped, 'reload mid-demo: same cube')

    const seen = await walkLesson(page, {
      drill: async (page) => {
        // Three clean drills (no hints): mastered.
        for (let n = 0; n < 3; n++) {
          equal(await attr(page, 'drill-panel', 'data-n'), String(n), `daisy drill ${n + 1} is a new cube`)
          await idle(page)
          if (n === 1) {
            // Reload mid-drill: the half-turned cube and the drill number survive.
            await type(page, ['R', 'U'])
            const mid = await stateOf(page)
            await page.reload({ waitUntil: 'networkidle' })
            await cubeReady(page)
            equal(await kindOf(page), 'drill', 'reload mid-drill: still in the drills')
            equal(await stateOf(page), mid, 'reload mid-drill: the cube is as it was left')
            equal(await attr(page, 'drill-panel', 'data-n'), '1', 'reload mid-drill: same drill cube')
          }
          await solveIndependently(page)
          await page.waitForSelector('[data-testid="drill-solved"]', { timeout: 8000 })
          equal(await attr(page, 'drill-panel', 'data-clean'), String(n + 1), `daisy drill ${n + 1} counts as clean`)
          if (n < 2) {
            await page.click('[data-testid="drill-next"]')
            await page.waitForSelector('[data-testid="drill-solved"]', { state: 'detached' })
          }
        }
      },
    })
    equal(seen.guided, 3, 'the daisy has three guided exercises after the hold')
    check(seen.demos >= 2, 'the remaining daisy demos were played')
    const learn = await saved(page, 'learn')
    equal(learn.lessons.daisy.drill.clean, 3, 'three clean drills are saved')
    equal(learn.lessons.daisy.completed, true, 'the daisy is saved as complete')
    const progress = await saved(page, 'progress')
    check(Boolean(progress.lessons.daisy?.completedAt), 'the progress store marks stage 1 complete')
    equal(progress.counters.drills, 3, 'three drills were rewarded')
    check((await page.textContent('[data-testid="wrap-panel"]')).includes('mastered'), 'the wrap-up says the stage is mastered')

    await page.click('[data-testid="wrap-next"]')
    await page.waitForFunction(() => location.hash.endsWith('/learn/white-cross'))
    await page.waitForSelector('[data-testid="lesson-panel"][data-beat="goal"]')
    check(!(await visible(page, 'peek-banner')), 'stage 2 is unlocked: no peeking banner')
    await page.click('[aria-label="Back to the path"]')
    await page.waitForSelector('[data-testid="path"]')
    equal(await page.getAttribute('[data-testid="stop-daisy"]', 'data-status'), 'complete', 'path: stage 1 complete')
    equal(await page.getAttribute('[data-testid="stop-white-cross"]', 'data-status'), 'current', 'path: stage 2 is up next')
    equal(await page.getAttribute('[data-testid="stop-white-corners"]', 'data-status'), 'locked', 'path: stage 3 still locked')
    equal(errors.join('\n'), '', 'daisy: no console errors')
    await context.close()
  },

  async cross() {
    // Stage 1 is done: stage 2 is open (a stage that is only being peeked at cannot be completed).
    const { page, context, errors } = await open('/learn/white-cross', { storage: learnerStorage(1) })
    await cubeReady(page)
    const seen = await walkLesson(page, {
      drill: async (page) => {
        // One drill with the coach: solved, rewarded, but not clean.
        await idle(page)
        const hints = await solveWithHints(page, () => visible(page, 'drill-solved'))
        check(hints > 0, 'the cross drill was solved with hints')
        await page.waitForSelector('[data-testid="drill-solved"]', { timeout: 8000 })
        equal(await attr(page, 'drill-panel', 'data-clean'), '0', 'a hinted drill is not clean')
        equal(await attr(page, 'drill-panel', 'data-total'), '1', 'a hinted drill still counts as solved')
        check((await page.textContent('[data-testid="drill-solved"]')).includes('hint'), 'the drill result says a hint was used')
      },
    })
    equal(seen.kinds.filter((k) => k === 'guided').length, 4, 'the white cross has four guided exercises (F2, then three)')
    check(Boolean((await saved(page, 'progress')).lessons['white-cross']?.completedAt), 'stage 2 is complete in the progress store')
    check(await visible(page, 'algorithm-note') === false && (await page.locator('[data-testid="wrap-panel"] li').count()) > 0, 'the wrap-up lists what was learned')
    // The "Stuck?" sheet opens with this stage's problems.
    await page.click('[data-testid="stuck-button"]')
    await page.waitForSelector('[role="dialog"] [data-testid="troubles"]')
    check((await page.locator('[role="dialog"] details').count()) >= 3, 'Stuck? lists at least three problems')
    await page.keyboard.press('Escape')
    equal(errors.join('\n'), '', 'white cross: no console errors')
    await context.close()
  },

  async twist() {
    const lesson = (beatId) => ({ beatId, furthest: 0, done: {}, session: null, sessionKey: null, drill: { n: 0, hinted: false, solved: false, total: 0, clean: 0, streak: 0, best: 0 }, completed: false })
    const storage = { 'rubikku:learn': { version: 1, state: { lessons: { 'yellow-corners-orient': lesson('dont-panic') }, capstone: { n: 0, session: null, hints: 0, solved: false, solves: 0 }, last: null } } }
    const { page, context, errors } = await open('/learn/yellow-corners-orient', { storage, viewport: { width: 390, height: 844 } })
    await cubeReady(page)
    equal(await beatOf(page), 'dont-panic', 'a saved position opens the lesson at that beat')
    equal(await attr(page, 'twist-meter', 'data-twists'), '1', 'mid-twist, the meter shows one twist in')
    // Phone: the stage stays in view while the text scrolls.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(300)
    const box = await page.locator('.stage').first().boundingBox()
    check(box.y >= 0 && box.y + box.height <= 844, 'phone: the cube stays on screen when the page is scrolled to the end')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(overflow <= 1, 'phone: no sideways scroll')
    // The guided twist: the meter climbs and the exercise ends with the corner done.
    while ((await beatOf(page)) !== 'try-1') await next(page)
    await idle(page)
    await doGuided(page)
    check(Number(await attr(page, 'twist-meter', 'data-twists')) > 0, 'after one corner the bottom is still borrowed (the meter says so)')
    equal(errors.join('\n'), '', 'final twist: no console errors')
    await context.close()
  },

  async capstone() {
    const { page, context, errors } = await open('/learn/full-solve')
    await cubeReady(page)
    equal(await attr(page, 'stage-tracker', 'data-current'), 'daisy', 'a fresh scramble starts at the daisy')
    await page.click('[data-testid="hint-button"]')
    await page.waitForSelector('[data-testid="hint-card"]')
    check((await page.textContent('[data-testid="hint-card"]')).includes('Stage 1'), 'the coach hints at stage 1 first')
    await type(page, ['R', 'U'])
    const mid = await stateOf(page)
    await page.reload({ waitUntil: 'networkidle' })
    await cubeReady(page)
    equal(await stateOf(page), mid, 'reload mid-solve: the cube is as it was left')
    await solveIndependently(page)
    await page.waitForSelector('[data-testid="capstone-done"]', { timeout: 8000 })
    const progress = await saved(page, 'progress')
    equal(progress.counters.solves, 1, 'the full solve is recorded as a solve')
    equal((await saved(page, 'learn')).capstone.solves, 1, 'the capstone remembers the solve')
    await page.click('[data-testid="capstone-new"]')
    await page.waitForSelector('[data-testid="stage-tracker"]')
    equal(await attr(page, 'capstone-panel', 'data-n'), '1', 'another scramble is a new cube')
    equal(errors.join('\n'), '', 'full solve: no console errors')
    await context.close()
  },
}

for (const [name, test] of Object.entries(tests)) {
  if (ONLY && !ONLY.includes(name)) continue
  const started = Date.now()
  console.log(`• ${name}`)
  try {
    await test()
  } catch (error) {
    failures.push(`${name}: ${error.stack ?? error.message}`)
    console.error(`    ✗ ${name} threw: ${error.message}`)
  }
  console.log(`  ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

await browser.close()
console.log(`\n${checks} checks, ${failures.length} failed`)
if (failures.length > 0) process.exit(1)
