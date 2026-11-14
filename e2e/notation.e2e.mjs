#!/usr/bin/env node
/**
 * End-to-end tests for the notation trainer, with real mouse and keyboard input in headless
 * Chromium (software WebGL).
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node e2e/notation.e2e.mjs [baseUrl] [--only=do,name]
 *
 * Covers: a full "do the move" round (drags and keys, one wrong answer, the feedback), double
 * turns done both ways and with the "2" key, a full "name the move" round with a wrong pick,
 * the speed round, the tap-to-watch demo, persistence across reloads, and no console errors.
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '')
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1].split(',')
const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
const CUBE = 'notation'

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

async function open(route, { storage = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
  await context.addInitScript(
    ({ storage }) => {
      if (sessionStorage.getItem('seeded')) return // keep what the app saved across reloads
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
  await page.waitForFunction((id) => window.__rubikku?.cubes?.[id]?.frames() > 0, CUBE, { timeout: 20_000 })
  return { page, context, errors }
}

const idle = (page) => page.evaluate((id) => window.__rubikku.cubes[id].whenIdle(), CUBE)
const stateOf = (page) => page.evaluate((id) => window.__rubikku.cubes[id].getState(), CUBE)
const saved = (page, name = 'notation') => page.evaluate((name) => JSON.parse(localStorage.getItem(`rubikku:${name}`) ?? 'null')?.state ?? null, name)
const asked = (page) => page.getAttribute('[data-testid=prompt]', 'data-question')
const progressText = async (page) => (await page.textContent('[data-testid=round-progress]')).replace(/\s+/g, ' ').trim()
/** Wait until the cube is back to solved and ready for the next answer. */
async function ready(page) {
  await page.waitForFunction(([id, solved]) => !window.__rubikku.cubes[id].isAnimating() && window.__rubikku.cubes[id].getState() === solved, [CUBE, SOLVED], { timeout: 8000 })
  await page.waitForTimeout(120)
}

/** Do one move with the keyboard: letter, Shift+letter for prime, and for doubles the given style. */
async function keyMove(page, move, double = 'repeat') {
  await page.evaluate(() => document.querySelector('.stage [tabindex]').focus())
  const base = move[0]
  const suffix = move.slice(1)
  if (suffix === '2') {
    if (double === 'repeat') {
      await page.keyboard.press(base)
      await page.keyboard.press('2') // "2" repeats the last turn
    } else if (double === 'clockwise') {
      await page.keyboard.press(base)
      await page.keyboard.press(base)
    } else {
      await page.keyboard.press(`Shift+${base}`)
      await page.keyboard.press(`Shift+${base}`)
    }
  } else {
    await page.keyboard.press(suffix === "'" ? `Shift+${base}` : base)
  }
}

const F = (row, col) => 18 + row * 3 + col
const R = (row, col) => 9 + row * 3 + col
// Drags that make each clockwise face turn from the default view: [facelet, dx, dy].
const DRAGS = { R: [F(1, 2), 0, -110], L: [F(1, 0), 0, 110], U: [F(0, 1), -110, -38], D: [F(2, 1), 110, 38], F: [R(1, 0), 0, 110], B: [R(1, 2), 0, -110] }

async function dragMove(page, move) {
  const [index, dx, dy] = DRAGS[move]
  // For L, B and D the camera swings round to show the face first: a drag planned while it is
  // still moving lands on the wrong layer, so wait for it to settle (as a child would).
  let last = ''
  for (let k = 0; k < 30; k++) {
    const pose = JSON.stringify(await page.evaluate((id) => window.__rubikku.cubes[id].getPose(), CUBE))
    if (pose === last) break
    last = pose
    await page.waitForTimeout(120)
  }
  const at = await page.evaluate(([id, index]) => window.__rubikku.cubes[id].facelet(index), [CUBE, index])
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(at.x + (dx * i) / 10, at.y + (dy * i) / 10)
    await page.waitForTimeout(8)
  }
  await page.waitForTimeout(130)
  await page.mouse.up()
}

async function startRound(page, mode) {
  if (mode !== 'do') await page.click(`[data-testid=play-card] [role=radio]:has-text("${mode === 'name' ? 'Name it' : 'Speed'}")`)
  await page.click('[data-testid=start-round]')
}

const tests = {
  // ── a full "do the move" round: drags, one wrong answer, feedback, summary, unlock ──
  async do() {
    const { page, context, errors } = await open('/notation')
    await startRound(page, 'do')
    await page.waitForSelector('[data-testid=prompt]')
    equal(await progressText(page), '1 / 10', 'round starts at question 1 of 10')

    // Question 1: do the wrong face on purpose.
    await ready(page)
    const first = await asked(page)
    const wrong = first === 'R' ? 'L' : 'R'
    // With the keyboard: on a first question about a hidden face (L, B, D) the camera swings round
    // to show its arrow, and a drag planned for the front view would land on the wrong layer.
    await keyMove(page, wrong)
    await page.waitForSelector('[data-testid=feedback]')
    const line = await page.textContent('[data-testid=feedback-line]')
    check(line.includes(`That was ${wrong}`) && line.includes(`${first} is the`), `feedback explains the difference: "${line}"`)
    equal(await page.locator('[data-testid=feedback] canvas, [data-testid=feedback] [data-minicube]').count(), 2, 'feedback shows what he did and what was asked side by side')
    await ready(page)
    equal(await stateOf(page), SOLVED, 'the cube glides back to solved after a wrong answer')
    await page.click('[data-testid=got-it]')

    // Mid-round reload: same place, same question.
    await page.waitForFunction(() => document.querySelector('[data-testid=round-progress]')?.textContent.replace(/\s+/g, ' ').trim() === '2 / 10')
    const second = await asked(page)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=prompt]')
    equal(await progressText(page), '2 / 10', 'a reload keeps the round where it was')
    equal(await asked(page), second, 'a reload keeps the same question')
    equal(await page.locator('[data-testid=trail] [data-result=wrong]').count(), 1, 'the trail remembers the miss')

    // The other nine: drag every one of them.
    for (let i = 2; i <= 10; i++) {
      await page.waitForFunction((n) => document.querySelector('[data-testid=summary]') || document.querySelector('[data-testid=round-progress]')?.textContent.replace(/\s+/g, ' ').trim() === `${n} / 10`, i, { timeout: 8000 })
      await ready(page)
      const move = await asked(page)
      check(move in DRAGS, `level 1 asks a clockwise face turn (${move})`)
      if (i % 2) await keyMove(page, move)
      else await dragMove(page, move)
    }
    await page.waitForSelector('[data-testid=summary]', { timeout: 8000 })
    equal(await page.getAttribute('[data-testid=summary]', 'data-accuracy'), '90', 'summary shows 90% accuracy')
    // A first round is routine: a moment card at most, never a takeover of the screen.
    await page.waitForSelector('[data-testid=celebration]', { timeout: 4000 }).catch(() => {})
    check((await page.locator('[data-testid=celebration][data-tier=moment]').count()) === 1, 'a passed first round is a moment')
    equal(await page.locator('[data-testid=celebration][data-tier=milestone]').count(), 0, 'a first notation round does not take over the screen')
    await page.waitForSelector('[data-testid=unlocked]')
    check((await page.textContent('[data-testid=unlocked]')).includes('Primes'), 'clearing level 1 opens Primes')
    check((await page.textContent('[data-testid=work-on]')).includes(first), 'the missed move is listed to work on')
    await ready(page)

    const store = await saved(page)
    equal(store.unlocked.do, 1, 'level 2 is unlocked in the store')
    equal(store.best['do:faces'], 90, 'best accuracy is saved')
    // The missed move may well come up again later in the round (it is weighted to).
    check(store.stats[first].seen >= 1, 'per-move stats count the missed move')
    equal(store.stats[first].correct, store.stats[first].seen - 1, 'exactly one miss is recorded for it')
    const progress = await saved(page, 'progress')
    equal(progress.counters.notationRounds, 1, 'the round is recorded in the progress store')
    equal(progress.counters.notationCorrect, 9, 'correct answers are recorded')
    check('notation-rookie' in progress.badges, 'the "Speaks Cube" badge is unlocked')
    equal(progress.xp, 18, 'XP for nine correct answers')

    // The summary survives a reload and is not rewarded twice.
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=summary]')
    equal((await saved(page, 'progress')).counters.notationRounds, 1, 'a reload does not reward the round again')

    await page.click('[data-testid=done]')
    await page.waitForSelector('[data-testid=mastery-grid]')
    const mastery = await page.getAttribute(`[data-testid=mastery-grid] [data-move="${first}"]`, 'data-mastery')
    check(mastery === '1' || mastery === '2', `the missed move is not yet mastered in the grid (${mastery})`)
    check((await page.locator('[data-testid=mastery-grid] [data-mastery="0"]').count()) >= 12, 'moves not met yet stay neutral')
    check(await page.isEnabled('[data-testid=level-2]'), 'level 2 can be chosen')
    check(await page.isDisabled('[data-testid=level-3]'), 'level 3 is still locked')
    check((await page.textContent('[data-testid=play-card]')).includes('Best 90%'), 'the level shows its best score')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── the arrow for a letter is drawn ON that face (design review 2, N5: F's arrow ran down R) ──
  async arrows() {
    const FACE_RANGE = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 }
    // Every face, clockwise and prime, and a double; each is new to him, so its arrow shows.
    const questions = [['F'], ['R'], ['U'], ['D'], ['L'], ['B'], ["F'"], ['F2']]
    const round = { mode: 'do', levelId: 'faces', questions, options: [], answers: [], phase: 'question', mistake: null, remainingMs: 60000, misses: 0, outcome: null }
    const { page, context, errors } = await open('/notation', { storage: { 'rubikku:notation': { version: 1, state: { unlocked: { do: 2, name: 0 }, chosen: { do: 0, name: 0 }, round } } } })
    await page.waitForSelector('[data-testid=prompt]')
    for (const [move] of questions) {
      await ready(page)
      equal(await asked(page), move, `arrows: asks ${move}`)
      // The camera may swing round for L, B and D: wait for the arrow to settle on the face.
      let info = null
      for (let k = 0; k < 40; k++) {
        info = await page.evaluate((id) => window.__rubikku.cubes[id].arrowInfo(), CUBE)
        const lo = FACE_RANGE[move[0]]
        if (info.move === move && info.covers.length > 0 && info.covers.every((f) => f >= lo && f < lo + 9)) break
        await page.waitForTimeout(150)
      }
      const lo = FACE_RANGE[move[0]]
      const off = info.covers.filter((f) => f < lo || f >= lo + 9)
      check(info.move === move, `arrows: ${move} has an arrow (${info.move})`)
      check(info.covers.length >= 4 && off.length === 0, `arrows: the ${move} arrow lies on the ${move[0]} face only (covers ${info.covers.join(',')})`)
      await keyMove(page, move, 'clockwise')
      await page.waitForFunction((m) => document.querySelector('[data-testid=prompt]')?.dataset.question !== m || document.querySelector('[data-testid=summary]'), move, { timeout: 8000 })
    }
    equal(errors.length, 0, `arrows: no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── double turns: two quarter turns either way, the "2" key, and a double that turns back ──
  async doubles() {
    const round = {
      mode: 'do',
      levelId: 'doubles',
      questions: [['R2'], ['U2'], ['F2'], ["L'"], ['D2']],
      options: [],
      answers: [],
      phase: 'question',
      mistake: null,
      remainingMs: 60000,
      misses: 0,
      outcome: null,
    }
    const { page, context, errors } = await open('/notation', { storage: { 'rubikku:notation': { version: 1, state: { unlocked: { do: 2, name: 0 }, chosen: { do: 2, name: 0 }, round } } } })
    await page.waitForSelector('[data-testid=prompt]')
    equal(await asked(page), 'R2', 'a saved round in progress is restored')
    const plan = [
      ['R2', 'clockwise'],
      ['U2', 'counter'],
      ['F2', 'repeat'],
      ["L'", null],
    ]
    for (const [move, style] of plan) {
      await ready(page)
      equal(await asked(page), move, `asks ${move}`)
      await keyMove(page, move, style ?? undefined)
      await page.waitForFunction((m) => document.querySelector('[data-testid=prompt]')?.dataset.question !== m, move, { timeout: 8000 })
    }
    equal(await page.locator('[data-testid=trail] [data-result=correct]').count(), 4, 'R R, U′ U′, F then "2", and L′ all count as right')

    // D2 as D then D′ is not a double.
    await ready(page)
    await page.evaluate(() => document.querySelector('.stage [tabindex]').focus())
    await page.keyboard.press('d')
    await page.waitForTimeout(250)
    check((await page.textContent('[data-testid=prompt]')).includes('Halfway'), 'after one quarter turn the prompt says it is halfway')
    await page.keyboard.press('Shift+D')
    await page.waitForSelector('[data-testid=feedback]')
    check((await page.textContent('[data-testid=feedback-line]')).includes('two turns the same way'), 'turning back is explained')
    await page.click('[data-testid=got-it]')
    await page.waitForSelector('[data-testid=summary]')
    equal(await page.getAttribute('[data-testid=summary]', 'data-accuracy'), '80', '4 of 5 right')
    const store = await saved(page)
    equal(store.unlocked.do, 3, '80% opens the next level')
    equal(store.stats.R2.correct, 1, 'R2 done as R R is recorded as correct')
    equal(store.stats.D2.correct, 0, 'D2 turned back is recorded as a miss')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── a full "name the move" round with one wrong pick ──
  async name() {
    const { page, context, errors } = await open('/notation')
    await startRound(page, 'name')
    await page.waitForSelector('[data-testid=options]')
    let round = (await saved(page)).round
    equal(round.mode, 'name', 'a name round is running')
    equal(round.questions.length, 10, 'ten questions')
    for (const [i, options] of round.options.entries()) {
      const answer = round.questions[i][0]
      check(options.includes(answer), `question ${i + 1} offers the answer`)
      check(options.includes(answer.endsWith("'") ? answer[0] : `${answer}'`), `question ${i + 1} offers the inverse as a distractor`)
      check(options.length >= 4 && options.length <= 6, 'four to six options')
    }

    // The cube really performs the move.
    const answer = round.questions[0][0]
    await page.waitForFunction(([id, solved]) => window.__rubikku.cubes[id].getState() !== solved && !window.__rubikku.cubes[id].isAnimating(), [CUBE, SOLVED], { timeout: 8000 })
    const shown = await stateOf(page)
    await page.click('[data-testid=replay]')
    await page.waitForTimeout(150)
    await page.waitForFunction(([id, state]) => window.__rubikku.cubes[id].getState() === state && !window.__rubikku.cubes[id].isAnimating(), [CUBE, shown], { timeout: 8000 })
    check(true, 'replay shows the same move again')

    // Wrong pick: the inverse.
    const inverse = `${answer}'`
    await page.click(`[data-testid=options] [data-move="${inverse}"]`)
    await page.waitForSelector('[data-testid=feedback]')
    check((await page.textContent('[data-testid=feedback-line]')).includes('wrong direction'), 'picking the inverse is explained as the wrong direction')
    check((await page.textContent('[data-testid=feedback]')).includes('You picked'), 'feedback shows the pick beside the real move')
    await page.click('[data-testid=got-it]')

    for (let i = 1; i < 10; i++) {
      await page.waitForFunction((n) => document.querySelector('[data-testid=round-progress]')?.textContent.replace(/\s+/g, ' ').trim() === `${n} / 10` && document.querySelector('[data-testid=options]'), i + 1, { timeout: 8000 })
      if (i === 4) {
        // Number keys pick too.
        const index = round.options[i].indexOf(round.questions[i][0])
        await page.keyboard.press(String(index + 1))
      } else {
        await page.click(`[data-testid=options] [data-move="${round.questions[i][0]}"]`)
      }
    }
    await page.waitForSelector('[data-testid=summary]', { timeout: 8000 })
    equal(await page.getAttribute('[data-testid=summary]', 'data-accuracy'), '90', 'summary shows 90%')
    const store = await saved(page)
    equal(store.unlocked.name, 1, 'the next "name" level opens')
    equal(store.unlocked.do, 0, '"do" levels unlock separately')
    await ready(page)
    await page.click('[data-testid=next-level]')
    await page.waitForSelector('[data-testid=options]')
    round = (await saved(page)).round
    equal(round.levelId, 'primes', '"Next level" starts the Primes round')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── the speed round: score, a slip, pause across reload, personal best ──
  async speed() {
    const { page, context, errors } = await open('/notation')
    await startRound(page, 'speed')
    await page.waitForSelector('[data-testid=speed-go]')
    await page.evaluate(() => document.querySelector('.stage [tabindex]').focus())
    await page.keyboard.press('r')
    await page.waitForTimeout(300)
    equal(await stateOf(page), SOLVED, 'the cube cannot be turned before "Go"')
    await page.click('[data-testid=speed-go]')
    for (let i = 0; i < 3; i++) {
      await ready(page)
      await keyMove(page, await asked(page))
      await page.waitForFunction((n) => document.querySelector('[data-testid=speed-score]')?.textContent.trim() === String(n), i + 1, { timeout: 8000 })
    }
    await ready(page)
    const move = await asked(page)
    await keyMove(page, move === 'U' ? 'D' : 'U')
    await page.waitForSelector('[data-testid=speed-line]')
    equal(await asked(page), move, 'after a slip the same move stays')
    await ready(page)
    let round = (await saved(page)).round
    equal(round.misses, 1, 'the slip is counted')
    check(round.remainingMs < 60000 && round.remainingMs > 30000, `time left is saved (${round.remainingMs})`)

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=speed-go]')
    check((await page.textContent('[data-testid=speed-go]')).includes('Carry on'), 'after a reload the round waits, paused')
    equal((await page.textContent('[data-testid=speed-score]')).trim(), '3', 'the score survives the reload')
    const before = (await saved(page)).round.remainingMs
    await page.waitForTimeout(1300)
    equal((await saved(page)).round.remainingMs, before, 'the clock does not run while paused')
    await context.close()

    // The last second of a round: time runs out, the best is saved.
    const ending = {
      mode: 'speed',
      levelId: 'speed',
      questions: [['R'], ['U'], ['F']],
      options: [],
      answers: [
        { moves: ['R'], result: 'correct' },
        { moves: ['U'], result: 'correct' },
      ],
      phase: 'question',
      mistake: null,
      remainingMs: 900,
      misses: 0,
      outcome: null,
    }
    const second = await open('/notation', { storage: { 'rubikku:notation': { version: 1, state: { round: ending } } } })
    await second.page.click('[data-testid=speed-go]')
    await second.page.waitForSelector('[data-testid=summary]', { timeout: 8000 })
    equal(await second.page.getAttribute('[data-testid=summary]', 'data-correct'), '2', 'the summary counts the moves')
    equal((await saved(second.page)).speedBest, 2, 'the personal best is saved')
    await second.page.click('[data-testid=done]')
    await second.page.click('[data-testid=play-card] [role=radio]:has-text("Speed")')
    equal((await second.page.textContent('[data-testid=speed-best]')).replace(/\s+/g, ''), '2moves', 'the hub shows the personal best')
    equal(errors.length + second.errors.length, 0, `no console errors: ${[...errors, ...second.errors].join(' | ')}`)
    await second.context.close()
  },

  // ── the hub: tap a move, watch it face-on and from the front ──
  async demo() {
    const { page, context, errors } = await open('/notation')
    equal(await page.locator('[data-testid=mastery-grid] [data-move]').count(), 18, 'the mastery grid shows the 18 face turns')
    await page.click('[data-testid=mastery-grid] [data-move="L"]')
    await page.waitForSelector('[data-testid=demo-view]')
    check((await page.textContent('[data-testid=demo-view]')).includes('straight'), 'the camera first looks straight at the left face')
    const pose = await page.evaluate((id) => new Promise((resolve) => setTimeout(() => resolve(window.__rubikku.cubes[id].getPose()), 900)), CUBE)
    check(pose.azimuth < -1, `the camera swung round to the left (azimuth ${pose.azimuth.toFixed(2)})`)
    await page.waitForFunction(() => document.querySelector('[data-testid=demo-view]')?.textContent.includes('front'), null, { timeout: 10_000 })
    check((await page.textContent('[data-testid=demo-caption]')).includes('Left face, clockwise'), 'the caption describes the move')
    await page.waitForFunction(() => !document.querySelector('[data-testid=demo-view]'), null, { timeout: 10_000 })
    await idle(page)
    equal(await stateOf(page), SOLVED, 'the cube is solved again after the demo')
    equal(await page.locator('[data-testid=clockwise-rule] canvas, [data-testid=clockwise-rule] [data-minicube]').count(), 4, 'the clockwise rule is shown with four little cubes')
    equal(await page.evaluate(() => window.__rubikku.contexts), 2, 'one WebGL context for the cube and one shared by all the minis')
    equal(errors.length, 0, `no console errors: ${errors.join(' | ')}`)
    await context.close()
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
