#!/usr/bin/env node
/**
 * End-to-end tests for the 3D cube and the Play page, driven with real pointer / touch /
 * keyboard input in headless Chromium (software WebGL).
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node e2e/cube.e2e.mjs [baseUrl] [--only=drag,keyboard]
 *
 * Expected states are computed independently with cubejs, never with the app's own engine.
 * The page exposes `window.__rubikku.cubes[id]` (see src/three/debug.ts) for reading the
 * engine state, finding stickers on screen and waiting for animations.
 * Exits non-zero if any check fails or any page logs a console error.
 */
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const Cube = createRequire(import.meta.url)('cubejs')
const args = process.argv.slice(2)
const BASE = (args.find((a) => !a.startsWith('--')) ?? process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '')
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1].split(',')

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
/** The state after doing `alg` on a solved cube, by cubejs. */
const after = (alg) => {
  const cube = new Cube()
  if (alg.trim()) cube.move(alg)
  return cube.asString()
}

/** The state after doing `alg` on any cube state (whole-cube turns included). */
const applyAlg = (state, alg) => {
  const cube = Cube.fromString(state)
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

const settings = (extra = {}) => ({ version: 1, state: { theme: 'light', sound: false, motion: 'full', turnSpeed: 2, showFaceLabels: false, ...extra } })

/**
 * Free play starts a new player's cube in the method's hold (yellow on top — checked in
 * integration.e2e.mjs). This suite is about the cube's mechanics and works from a solved cube
 * held white on top, so it seeds that unless a test brings its own save.
 */
const UPRIGHT_PLAY = { version: 1, state: { session: { start: SOLVED, state: SOLVED, done: [], undone: [] }, scrambled: false, mirrors: false, algText: '' } }

async function open(route, { viewport = { width: 1024, height: 768 }, touch = false, storage = {}, settingsExtra = {}, init } = {}) {
  if (route.startsWith('/play') && !('rubikku:play' in storage)) storage = { ...storage, 'rubikku:play': UPRIGHT_PLAY }
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 })
  await context.addInitScript(
    ({ storage, settings }) => {
      if (sessionStorage.getItem('seeded')) return // keep what the app saved across reloads
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('rubikku:settings', JSON.stringify(settings))
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, JSON.stringify(value))
    },
    { storage, settings: settings(settingsExtra) },
  )
  if (init) await context.addInitScript(init)
  const page = await context.newPage()
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
    if (msg.type() === 'warning' && /context|WebGL: /i.test(msg.text()) && !/GPU stall|ReadPixels/.test(msg.text())) errors.push(`warning: ${msg.text()}`)
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' })
  return { page, context, errors }
}

const cubeReady = (page, id) => page.waitForFunction((id) => window.__rubikku?.cubes?.[id]?.frames() > 0, id, { timeout: 20_000 })
const idle = (page, id) => page.evaluate((id) => window.__rubikku.cubes[id].whenIdle(), id)
const stateOf = (page, id) => page.evaluate((id) => window.__rubikku.cubes[id].getState(), id)
const shownOf = (page, id) => page.evaluate((id) => window.__rubikku.cubes[id].getShownState(), id)
const poseOf = (page, id) => page.evaluate((id) => window.__rubikku.cubes[id].getPose(), id)
const facelet = (page, id, index) => page.evaluate(([id, index]) => window.__rubikku.cubes[id].facelet(index), [id, index])
const framesOf = (page, id) => page.evaluate((id) => window.__rubikku.cubes[id].frames(), id)
/** Wait until the camera and every fade have come to rest (no new frames). */
async function still(page, id) {
  let last = -1
  let same = 0
  while (same < 3) {
    await page.waitForTimeout(120)
    const frames = await framesOf(page, id)
    if (frames === last) same++
    else {
      same = 0
      last = frames
    }
  }
}

/** Drag from a sticker's centre by (dx, dy) with the mouse, slowly enough not to count as a flick. */
async function dragSticker(page, id, index, dx, dy, { steps = 10, hold = 130 } = {}) {
  const at = await facelet(page, id, index)
  if (!at.facing) throw new Error(`facelet ${index} is not facing the camera`)
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(at.x + (dx * i) / steps, at.y + (dy * i) / steps)
    await page.waitForTimeout(8)
  }
  await page.waitForTimeout(hold)
  await page.mouse.up()
  await idle(page, id)
}

const F = (row, col) => 18 + row * 3 + col
const R = (row, col) => 9 + row * 3 + col
const U = (row, col) => row * 3 + col


/** Pixels (RGBA, row by row) of a region of the page, read back from a screenshot. */
async function grab(page, clip) {
  const png = await page.screenshot({ clip })
  return page.evaluate(
    async ({ b64, w, h }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h).data
      let out = ''
      for (let i = 0; i < data.length; i += 0x8000) out += String.fromCharCode(...data.subarray(i, i + 0x8000))
      return btoa(out)
    },
    { b64: png.toString('base64'), w: clip.width, h: clip.height },
  ).then((b64) => {
    const pixels = Buffer.from(b64, 'base64')
    pixels.width = clip.width
    return pixels
  })
}
/** Mean colour of a (2r+1)² patch at (x, y) of a grabbed image. */
function patch(pixels, x, y, r = 3) {
  const sum = [0, 0, 0]
  let n = 0
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const i = ((Math.round(y) + dy) * pixels.width + Math.round(x) + dx) * 4
      for (let c = 0; c < 3; c++) sum[c] += pixels[i + c]
      n++
    }
  }
  return sum.map((v) => v / n)
}
/** CIE76 colour difference between two sRGB triples. */
function deltaE(a, b) {
  const lab = (rgb) => {
    const [r, g, bl] = rgb.map((v) => {
      const c = v / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
    const x = f((r * 0.4124 + g * 0.3576 + bl * 0.1805) / 0.95047)
    const y = f(r * 0.2126 + g * 0.7152 + bl * 0.0722)
    const z = f((r * 0.0193 + g * 0.1192 + bl * 0.9505) / 1.08883)
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
  }
  const p = lab(a)
  const q = lab(b)
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}
/** Hue in degrees of an sRGB triple. */
function hue([r, g, b]) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}
const rgbHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

const tests = {
  // ── drag a sticker → the right layer turns the right way ──
  async drag() {
    const { page, context, errors } = await open('/play')
    await cubeReady(page, 'play')
    await still(page, 'play')
    equal(await stateOf(page, 'play'), SOLVED, 'starts solved')
    // [what, facelet, dx, dy, expected move] — default view: F on the left, R on the right, U on top.
    const drags = [
      ['front face, right column, up', F(1, 2), 0, -110, 'R'],
      ['front face, left column, down', F(1, 0), 0, 110, 'L'],
      ['front face, top row, left', F(0, 1), -110, -38, 'U'],
      ['front face, bottom row, right', F(2, 1), 110, 38, 'D'],
      ['right face, front column, down', R(1, 0), 0, 110, 'F'],
      ['right face, back column, up', R(1, 2), 0, -110, 'B'],
      ['right face, top row, towards the front', R(0, 1), -90, 52, 'U'],
      ['top face, right column, away', U(1, 2), 70, -48, 'R'],
      ['top face, front row, right', U(2, 1), 90, 52, 'F'],
      ['front face, middle column, down', F(1, 1), 0, 110, 'M'],
      ['front face, middle row, right', F(1, 1), 110, 38, 'E'],
      ['top face, middle row, right', U(1, 1), 90, 52, 'S'],
      ['front face, right column, down', F(1, 2), 0, 110, "R'"],
    ]
    const done = []
    for (const [what, index, dx, dy, move] of drags) {
      await dragSticker(page, 'play', index, dx, dy)
      done.push(move)
      equal(await stateOf(page, 'play'), after(done.join(' ')), `drag ${what} → ${move}`)
      equal(await shownOf(page, 'play'), after(done.join(' ')), `shown state after ${move} equals the engine state`)
    }
    equal(await page.getAttribute('[data-testid=history]', 'data-moves'), done.join(' '), 'history lists the dragged moves')
    equal((await page.textContent('[data-testid=move-count]')).trim(), String(done.length), 'move count')

    // A long drag makes a double turn: about three and a half sticker widths (the cube's size on
    // screen depends on the stage, so measure a sticker first).
    const top = await facelet(page, 'play', F(0, 2))
    const bottom = await facelet(page, 'play', F(2, 2))
    const sticker = Math.hypot(top.x - bottom.x, top.y - bottom.y) / 2
    await dragSticker(page, 'play', F(1, 2), 0, -Math.round(sticker * 3.6), { steps: 20 })
    done.push('R2')
    equal(await stateOf(page, 'play'), after(done.join(' ')), 'a long drag is a double turn (R2)')

    // A short drag springs back and changes nothing.
    await dragSticker(page, 'play', F(1, 2), 0, -16)
    equal(await stateOf(page, 'play'), after(done.join(' ')), 'a short drag springs back')
    check(!(await page.evaluate(() => window.__rubikku.cubes.play.isAnimating())), 'idle after the spring-back')

    // A quick flick completes the turn even though it is short. Software rendering makes real
    // timing impossible here, so the events are sent with explicit timestamps 8 ms apart.
    const at = await facelet(page, 'play', F(1, 0))
    const cdp = await context.newCDPSession(page)
    const t0 = Date.now() / 1000
    const mouse = (type, y, i) => cdp.send('Input.dispatchMouseEvent', { type, x: at.x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, timestamp: t0 + i * 0.008 })
    await page.mouse.move(at.x, at.y)
    await mouse('mousePressed', at.y, 0)
    for (let i = 1; i <= 4; i++) await mouse('mouseMoved', at.y + i * 9, i)
    await mouse('mouseReleased', at.y + 36, 5)
    await idle(page, 'play')
    done.push('L')
    equal(await stateOf(page, 'play'), after(done.join(' ')), 'a quick flick completes the turn (L)')

    // Mid-drag the layer follows the pointer and nothing is committed yet.
    const grab = await facelet(page, 'play', F(1, 2))
    await page.mouse.move(grab.x, grab.y)
    await page.mouse.down()
    await page.mouse.move(grab.x, grab.y - 40, { steps: 5 })
    equal(await stateOf(page, 'play'), after(done.join(' ')), 'no move is reported while the finger is still down')
    check(await page.evaluate(() => window.__rubikku.cubes.play.isAnimating()), 'the cube reports a turn in progress during a drag')
    await page.mouse.move(grab.x, grab.y, { steps: 5 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after(done.join(' ')), 'dragging back to the start cancels the turn')
    check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── touch: drag a sticker, pinch to zoom, the page must not scroll ──
  async touch() {
    const { page, context, errors } = await open('/play', { viewport: { width: 390, height: 844 }, touch: true })
    await cubeReady(page, 'play')
    await still(page, 'play')
    const cdp = await context.newCDPSession(page)
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) })
    const at = await facelet(page, 'play', F(1, 2))
    const scrollBefore = await page.evaluate(() => window.scrollY)
    await touch('touchStart', [[at.x, at.y]])
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', [[at.x, at.y - i * 9]])
      await page.waitForTimeout(10)
    }
    await page.waitForTimeout(140)
    await touch('touchEnd', [])
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after('R'), 'touch drag up the front-right column → R')
    equal(await page.evaluate(() => window.scrollY), scrollBefore, 'the page does not scroll while a layer is dragged')

    // Pinch out, then in: zoom stays within its clamps.
    const box = await (await page.$('[data-cube3d=play]')).boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height - 30
    const pinch = async (from, to) => {
      await touch('touchStart', [[cx - from, cy], [cx + from, cy]])
      for (let i = 1; i <= 8; i++) {
        const d = from + ((to - from) * i) / 8
        await touch('touchMove', [[cx - d, cy], [cx + d, cy]])
        await page.waitForTimeout(10)
      }
      await touch('touchEnd', [])
      await still(page, 'play')
    }
    await pinch(20, 170)
    let pose = await poseOf(page, 'play')
    check(pose.zoom > 1.3 && pose.zoom <= 1.6 + 1e-9, `pinch out zooms in, clamped at 1.6 (got ${pose.zoom})`)
    await pinch(170, 8)
    pose = await poseOf(page, 'play')
    check(pose.zoom >= 0.8 - 1e-9 && pose.zoom < 0.95, `pinch in zooms out, clamped at 0.8 (got ${pose.zoom})`)
    equal(await stateOf(page, 'play'), after('R'), 'pinching does not turn anything')
    equal(await page.evaluate(() => window.scrollY), scrollBefore, 'the page does not scroll while pinching')
    check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── orbit, clamps, zoom, reset view ──
  async camera() {
    const { page, context, errors } = await open('/play')
    await cubeReady(page, 'play')
    await still(page, 'play')
    const box = await (await page.$('[data-cube3d=play]')).boundingBox()
    const corner = { x: box.x + 60, y: box.y + box.height - 90 }
    const home = await poseOf(page, 'play')
    const orbit = async (dx, dy) => {
      await page.mouse.move(corner.x, corner.y)
      await page.mouse.down()
      await page.mouse.move(corner.x + dx, corner.y + dy, { steps: 8 })
      await page.waitForTimeout(120)
      await page.mouse.up()
      await still(page, 'play')
    }
    await orbit(140, 0)
    let pose = await poseOf(page, 'play')
    check(pose.azimuth < home.azimuth - 0.3, `dragging empty space to the right turns the view (azimuth ${home.azimuth.toFixed(2)} → ${pose.azimuth.toFixed(2)})`)
    equal(await stateOf(page, 'play'), SOLVED, 'orbiting does not turn any layer')
    await orbit(0, 900)
    pose = await poseOf(page, 'play')
    check(pose.elevation <= 1.22 + 1e-6 && pose.elevation > 1.1, `tilt is clamped from above (elevation ${pose.elevation.toFixed(2)})`)
    await orbit(0, -1500)
    pose = await poseOf(page, 'play')
    check(pose.elevation >= -0.92 - 1e-6 && pose.elevation < -0.8, `tilt is clamped from below (elevation ${pose.elevation.toFixed(2)})`)

    // Double-click on empty space resets the view.
    await page.mouse.dblclick(corner.x, corner.y)
    await still(page, 'play')
    pose = await poseOf(page, 'play')
    check(Math.abs(pose.azimuth - home.azimuth) < 0.01 && Math.abs(pose.elevation - home.elevation) < 0.01, 'double-click on empty space resets the view')

    // Wheel zoom (the cube has focus after the clicks), clamped both ways.
    await page.mouse.move(corner.x, corner.y)
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -120)
    await still(page, 'play')
    pose = await poseOf(page, 'play')
    check(Math.abs(pose.zoom - 1.6) < 1e-6, `wheel zoom in clamps at 1.6 (got ${pose.zoom})`)
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 120)
    await still(page, 'play')
    pose = await poseOf(page, 'play')
    check(Math.abs(pose.zoom - 0.8) < 1e-6, `wheel zoom out clamps at 0.8 (got ${pose.zoom})`)

    // Arrow keys orbit; the reset button brings it back.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowUp')
    await still(page, 'play')
    pose = await poseOf(page, 'play')
    check(pose.azimuth < home.azimuth - 0.2 && pose.elevation > home.elevation + 0.15, 'arrow keys look around')
    await page.click('button[aria-label="Reset the view"]')
    await still(page, 'play')
    pose = await poseOf(page, 'play')
    check(Math.abs(pose.azimuth - home.azimuth) < 0.01 && Math.abs(pose.zoom - home.zoom) < 0.01, 'the reset-view button resets azimuth and zoom')

    // Peek swings round and comes back by itself.
    await page.click('button[aria-label="Peek at the back"]')
    await page.waitForFunction((a) => Math.abs(Math.cos(window.__rubikku.cubes.play.getPose().azimuth - a)) > 0.9 && Math.cos(window.__rubikku.cubes.play.getPose().azimuth - a) < 0, home.azimuth, { timeout: 15_000 })
    check((await poseOf(page, 'play')).elevation < 0, 'peek looks from underneath at the hidden faces')
    await page.waitForFunction((a) => Math.cos(window.__rubikku.cubes.play.getPose().azimuth - a) > 0.999, home.azimuth, { timeout: 20_000 })
    await still(page, 'play')
    pose = await poseOf(page, 'play')
    check(Math.abs(pose.elevation - home.elevation) < 0.01, 'peek returns to where it started')

    // After orbiting to the back, dragging still turns the layer under the finger.
    await page.evaluate(() => document.querySelector('[data-cube3d=play]').focus())
    for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight')
    await still(page, 'play')
    // Now the back face (B, facelets 45–53) faces us.
    const b = await facelet(page, 'play', 45 + 4)
    check(b.facing, 'after orbiting half-way round the back face is in view')
    await dragSticker(page, 'play', 45 + 3 + 2, 0, -110) // B face, middle row, the column at x = -1: the L layer
    equal(await stateOf(page, 'play'), after('L'), 'seen from behind, dragging the left layer up at the back is L')
    check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── keyboard notation, undo / redo, persistence ──
  async keyboard() {
    const { page, context, errors } = await open('/play')
    await cubeReady(page, 'play')
    await page.focus('[data-cube3d=play]')
    const keys = [
      ['r', 'R'],
      ['Shift+U', "U'"],
      ['f', 'F'],
      ['2', 'F'],
      ['d', 'D'],
      ['Shift+L', "L'"],
      ['b', 'B'],
      ['m', 'M'],
      ['Shift+E', "E'"],
      ['s', 'S'],
      ['x', 'x'],
      ['Shift+Y', "y'"],
      ['z', 'z'],
      ['Alt+r', 'r'],
    ]
    const done = []
    for (const [key, move] of keys) {
      await page.keyboard.press(key)
      done.push(move)
    }
    // Typed fast: the queue must catch up without losing or reordering anything.
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after(done.join(' ')), `keyboard moves ${done.join(' ')}`)
    equal(await shownOf(page, 'play'), after(done.join(' ')), 'shown state equals engine state after a fast burst of keys')
    equal(await page.getAttribute('[data-testid=history]', 'data-moves'), done.join(' '), 'history lists the keyed moves')

    // Undo with Ctrl+Z (three times), redo with Ctrl+Shift+Z and Ctrl+Y.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z')
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after(done.slice(0, -3).join(' ')), 'Ctrl+Z undoes')
    await page.keyboard.press('Control+Shift+Z')
    await page.keyboard.press('Control+y')
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after(done.slice(0, -1).join(' ')), 'Ctrl+Shift+Z and Ctrl+Y redo')

    // Buttons.
    await page.click('button[aria-label="Undo"]')
    await page.click('button[aria-label="Undo"]')
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after(done.slice(0, -3).join(' ')), 'the Undo button undoes')
    await page.click('button[aria-label="Redo"]')
    await idle(page, 'play')
    const expected = after(done.slice(0, -2).join(' '))
    equal(await stateOf(page, 'play'), expected, 'the Redo button redoes')
    check(await page.isEnabled('button[aria-label="Redo"]'), 'one redo is still available')

    // Reload: the cube, the history and the redo stack are all still there.
    await page.reload({ waitUntil: 'networkidle' })
    await cubeReady(page, 'play')
    equal(await stateOf(page, 'play'), expected, 'the cube state survives a reload')
    equal(await page.getAttribute('[data-testid=history]', 'data-moves'), done.slice(0, -2).join(' '), 'the history survives a reload')
    check(await page.isEnabled('button[aria-label="Redo"]'), 'the redo stack survives a reload')
    await page.click('button[aria-label="Redo"]')
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after(done.slice(0, -1).join(' ')), 'redo after a reload replays the right move')

    // Keys typed into the text box do not turn the cube.
    await page.fill('input[aria-label="Moves to play"]', 'rufd')
    equal(await stateOf(page, 'play'), after(done.slice(0, -1).join(' ')), 'typing in the moves box does not turn the cube')
    check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── typed algorithm, playback bar, scramble, reset ──
  async playback() {
    const { page, context, errors } = await open('/play')
    await cubeReady(page, 'play')
    const alg = "R U R' U' F2 M x D'"
    await page.fill('input[aria-label="Moves to play"]', alg)
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-testid=player]')
    await page.waitForFunction(() => document.querySelector('[data-testid=player] input[type=range]')?.value === '8' && !document.querySelector('[data-testid=player] button[aria-label="Pause"]'), null, { timeout: 60_000 })
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after(alg), 'a typed algorithm plays to the end')
    equal(await shownOf(page, 'play'), after(alg), 'shown state equals engine state after playback (slice, rotation and double turns included)')

    // "Play again" at the end: the whole algorithm plays again (it used to stall after one move).
    await page.click('[data-testid=player] [aria-label="Playback"] button[aria-label^="Play"]')
    await page.waitForFunction(() => Number(document.querySelector('[data-testid=player] input[type=range]')?.value) < 8, null, { timeout: 10_000 }).catch(() => check(false, 'Play again rewinds'))
    await page.waitForFunction(() => document.querySelector('[data-testid=player] input[type=range]')?.value === '8' && !document.querySelector('[data-testid=player] button[aria-label="Pause"]'), null, { timeout: 60_000 }).catch(() => check(false, 'Play again runs to the last move and stops'))
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after(alg), 'after "Play again" the cube is at the end of the algorithm again')
    equal(await shownOf(page, 'play'), after(alg), 'and the picture agrees')

    await page.click('[data-testid=player] button[aria-label="Step back"]')
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after("R U R' U' F2 M x"), 'step back undoes the last move')
    await page.click('[data-testid=player] button[aria-label="Back to start"]')
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), SOLVED, 'back to start')
    await page.click('[data-testid=player] button[aria-label="Step forward"]')
    await idle(page, 'play')
    await page.click('[data-testid=player] button[aria-label="Step forward"]')
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after('R U'), 'step forward twice')
    // Scrub to move 5.
    await page.evaluate(() => {
      const range = document.querySelector('[data-testid=player] input[type=range]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(range, '5')
      range.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after("R U R' U' F2"), 'scrubbing jumps to that move')
    // Reload mid-algorithm: the player is still loaded at the same place.
    await page.reload({ waitUntil: 'networkidle' })
    await cubeReady(page, 'play')
    equal(await stateOf(page, 'play'), after("R U R' U' F2"), 'a half-played algorithm survives a reload')
    equal(await page.inputValue('[data-testid=player] input[type=range]'), '5', 'the player position survives a reload')

    // Nonsense is refused politely.
    await page.fill('input[aria-label="Moves to play"]', 'R U Q')
    await page.keyboard.press('Enter')
    check(await page.isVisible('#alg-error'), 'bad notation shows a message')
    equal(await stateOf(page, 'play'), after("R U R' U' F2"), 'bad notation does not move the cube')

    // Scramble: animated, ends on a scrambled cube with a clean history.
    await page.click('button:has-text("Scramble")')
    await page.waitForFunction(() => window.__rubikku.cubes.play.isAnimating())
    await idle(page, 'play')
    await page.waitForFunction(() => !window.__rubikku.cubes.play.isAnimating())
    const scrambled = await stateOf(page, 'play')
    check(scrambled !== SOLVED && /^[URFDLB]{54}$/.test(scrambled), 'scramble leaves a scrambled cube')
    equal(await shownOf(page, 'play'), scrambled, 'shown state equals engine state after the scramble')
    equal((await page.textContent('[data-testid=move-count]')).trim(), '0', 'the scramble is not in the undo history')
    check(await page.isDisabled('button[aria-label="Undo"]'), 'undo is disabled after a scramble')
    // The scramble is solvable and really is that state: cubejs agrees it is a legal cube.
    check(Cube.fromString(scrambled).asString() === scrambled, 'the scrambled state is a legal cube')

    // Reset.
    await page.click('button:has-text("Reset")')
    await page.waitForTimeout(200)
    if (await page.isVisible('role=dialog')) await page.click('role=dialog >> button:has-text("Reset")')
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), applyAlg(SOLVED, 'z2'), 'reset returns to a solved cube in the method’s hold (yellow on top)')
    check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── solving a scrambled cube celebrates once and records the solve ──
  async solve() {
    const almost = after("R U")
    const { page, context, errors } = await open('/play', {
      storage: { 'rubikku:play': { version: 1, state: { session: { start: almost, state: almost, done: [], undone: [] }, scrambled: true, mirrors: false, algText: '' } } },
    })
    await cubeReady(page, 'play')
    await still(page, 'play')
    equal(await stateOf(page, 'play'), almost, 'the saved cube is restored')
    await page.focus('[data-cube3d=play]')
    await page.keyboard.press('Shift+U')
    // Finish with a real drag: the right column of the front face, downwards = R′.
    await idle(page, 'play')
    await dragSticker(page, 'play', F(1, 2), 0, 110)
    equal(await stateOf(page, 'play'), SOLVED, 'solved by hand')
    // His first solve ever: the celebration system's takeover, in the achievement's words. (The
    // takeover now starts a 3D cube of its own; under software GL that stalls the page for a few
    // seconds, so allow longer than a real device needs.)
    await page.waitForSelector('[data-testid=celebration][data-tier=milestone]:has-text("You solved the cube")', { timeout: 15000 }).catch(() => check(false, 'a first solve is celebrated with the "You solved the cube" milestone'))
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-testid=celebration]', { state: 'detached', timeout: 4000 }).catch(() => {})
    await page.focus('[data-cube3d=play]')
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('rubikku:progress') ?? '{}').state?.counters?.solves === 1, null, { timeout: 5000 }).catch(() => check(false, 'the solve is recorded in progress'))
    equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rubikku:play')).state.scrambled), false, 'the scrambled flag is cleared')
    // Unsolving and re-solving does not celebrate again.
    await page.keyboard.press('r')
    await page.keyboard.press('Shift+R')
    await idle(page, 'play')
    await page.waitForTimeout(600)
    equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rubikku:progress')).state.counters.solves), 1, 'solving an unscrambled cube again is not counted twice')
    check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── hint: explains the next step, follows along turn by turn, never re-solves a half-done step ──
  async hint() {
    const { page, context, errors } = await open('/play')
    await cubeReady(page, 'play')
    await page.fill('input[aria-label="Moves to play"]', "F R U' D2 L B' R2")
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('[data-testid=player] input[type=range]')?.value === '7', null, { timeout: 60_000 })
    await idle(page, 'play')
    const card = '[data-testid=hint-card]'
    const cardAttr = (name) => page.getAttribute(card, name)
    // Whole-cube turns are chips in words ("Roll over") that carry their move in data-move.
    const chips = () => page.$$eval(`${card} [role="group"] [data-state]`, (list) => list.map((c) => c.dataset.move ?? c.textContent.trim().replace('′', "'")))
    const STAGES = ['daisy', 'white-cross', 'white-corners', 'middle-layer', 'yellow-cross', 'yellow-edges', 'yellow-corners-position', 'yellow-corners-orient']
    await page.click('[data-testid=hint-button]')
    await page.waitForSelector(`${card} h2`)
    check((await page.textContent(`${card} h2`)).trim().length > 3, 'the hint names the case')

    // The first step on an upright cube is a whole-cube turn. Touch cannot drag that, so the hint
    // offers a button for it, and the stage has its own whole-cube buttons.
    equal((await chips()).join(' '), 'z2', 'on an upright cube the first hint is to turn the whole cube over')
    check(/Roll the whole cube upside down/.test(await page.textContent(card)), 'the whole-cube turn is said in words, as the lessons say it')
    equal((await page.textContent(`${card} [data-testid=hint-show]`)).trim(), 'Turn the cube', 'a whole-cube step offers "Turn the cube"')
    check(await page.isVisible('[data-testid=turn-cube-left]') && (await page.isVisible('[data-testid=turn-cube-right]')), 'the Play stage has whole-cube turn buttons')
    const upright = await stateOf(page, 'play')
    await page.click('[data-testid=turn-cube-right]')
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), applyAlg(upright, 'y'), 'the stage button turns the whole cube')
    await page.waitForSelector(`${card}[data-status="on"]`)
    check((await chips()).every((m) => 'xyz'.includes(m[0])), 'after turning the cube the hint is still "hold it this way", not a mistake')
    await page.click(`${card} [data-testid=hint-show]`)
    await page.waitForFunction(() => window.__rubikku.cubes.play.getState()[4] === 'D', null, { timeout: 10_000 })
    await idle(page, 'play')
    equal((await stateOf(page, 'play'))[4], 'D', '"Turn the cube" puts yellow on top')

    // Follow the next steps by hand with quarter turns. A half turn is "half-way" after one
    // quarter (not "undo it"), and the hint never goes back a stage.
    await page.focus('[data-cube3d=play]')
    let furthest = 0
    let halves = 0
    let presses = 0
    for (let step = 0; step < 14 && halves < 3; step++) {
      await page.waitForSelector(`${card}[data-status="on"]`, { timeout: 5000 })
      const caseId = await cardAttr('data-case')
      const stage = STAGES.indexOf(await cardAttr('data-stage'))
      check(stage >= furthest, `step ${step + 1} (${caseId}) is not for an earlier stage`)
      furthest = Math.max(furthest, stage)
      const moves = await chips()
      for (let k = Number(await cardAttr('data-index')); k < moves.length; k++) {
        const move = moves[k]
        const double = move.endsWith('2')
        const key = move.endsWith("'") || (double && halves % 2 === 1) ? `Shift+${move[0].toUpperCase()}` : move[0].toLowerCase()
        for (let n = 0; n < (double ? 2 : 1); n++) {
          await page.keyboard.press(key)
          await idle(page, 'play')
          await page.waitForTimeout(40)
          presses++
          const status = await cardAttr('data-status')
          check(status !== 'off', `after turn ${k + 1} of ${caseId} [${moves.join(' ')}] the hint does not say "off the path"`)
          if (double && n === 0) {
            equal(status, 'half', `one quarter of ${move} is "half-way"`)
            equal(await cardAttr('data-case'), caseId, `half-way through ${move} the hint is still ${caseId}`)
            check(await page.isVisible('[data-testid=hint-half]'), 'the card says to turn the same face once more')
          }
        }
        if (double) halves++
      }
      // The finished step shows for a moment, then the next one takes its place (free play keeps the hint open).
      await page.waitForFunction((id) => document.querySelector('[data-testid=hint-card]')?.getAttribute('data-case') !== id || document.querySelector('[data-testid=hint-card]')?.getAttribute('data-status') === 'on', caseId, { timeout: 5000 })
      await page.waitForTimeout(700)
    }
    check(halves >= 3 && presses > 10, `followed the hints through ${halves} half turns with ${presses} quarter-turn presses`)

    // A slip in the middle of a step: "undo that", and the same hint comes back.
    await page.waitForSelector(`${card}[data-status="on"]`)
    const caseId = await cardAttr('data-case')
    const index = await cardAttr('data-index')
    const before = await stateOf(page, 'play')
    const moves = await chips()
    const wrong = ['l', 'b', 'r', 'f'].find((face) => face.toUpperCase() !== moves[Number(index)][0])
    await page.keyboard.press(wrong)
    await idle(page, 'play')
    await page.waitForTimeout(100)
    if ((await cardAttr('data-status')) === 'off') {
      equal(await cardAttr('data-case'), caseId, 'after a slip the hint is still the same step')
      await page.click('[data-testid=hint-undo]')
      await idle(page, 'play')
      await page.waitForSelector('[data-testid=hint-off]', { state: 'detached', timeout: 4000 }).catch(() => {})
      equal(await stateOf(page, 'play'), before, '"Undo that" puts the cube back')
      equal(await cardAttr('data-case'), caseId, 'after undoing, the original hint is back')
      equal(await cardAttr('data-index'), index, '… at the same place')
    } else {
      // (In the daisy stage a different turn can leave the cube just as good: the plan follows.)
      check(STAGES.indexOf(await cardAttr('data-stage')) >= furthest, 'a harmless different turn does not send the hint back a stage')
    }

    const beforeShow = await stateOf(page, 'play')
    await page.click(`${card} [data-testid=hint-show]`)
    await page.waitForFunction((s) => window.__rubikku.cubes.play.getState() !== s, beforeShow, { timeout: 10_000 })
    await idle(page, 'play')
    check((await stateOf(page, 'play')) !== beforeShow, '"Show me" plays the hinted moves')
    await page.click('button[aria-label="Close the hint"]')
    await page.waitForSelector(card, { state: 'detached', timeout: 3000 }).catch(() => check(false, 'the hint closes'))
    check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── solved detection: judged on the cube, however the last turn was made ──
  async solved() {
    const solves = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rubikku:progress') ?? '{}').state?.counters?.solves ?? 0)
    const flag = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rubikku:play')).state.scrambled)

    // 1. A scrambled cube finished by "Show me": celebrated, flag cleared — but it was the coach's
    //    solve, so no reward, and a later R R′ on the solved cube is not a solve either.
    const lastLayer = applyAlg(applyAlg(SOLVED, 'z2'), "R U R' U R U2 R' U")
    const coach = await open('/play', {
      storage: { 'rubikku:play': { version: 1, state: { session: { start: lastLayer, state: lastLayer, done: [], undone: [] }, scrambled: true, mirrors: false, algText: '' } } },
    })
    await cubeReady(coach.page, 'play')
    await still(coach.page, 'play')
    await coach.page.click('[data-testid=hint-button]')
    const solvedNow = async (page) => ((await page.textContent('[data-testid=cube-status]')) ?? '').includes('Solved')
    for (let guard = 0; guard < 30 && !(await solvedNow(coach.page)); guard++) {
      const show = coach.page.locator('[data-testid=hint-card] [data-testid=hint-show]')
      if (await show.isEnabled().catch(() => false)) await show.click()
      await coach.page.waitForTimeout(200)
      await idle(coach.page, 'play')
      await coach.page.waitForTimeout(700)
    }
    check(await solvedNow(coach.page), 'the coach\'s "Show me" can finish the cube')
    await coach.page.waitForSelector('text=Solved!', { timeout: 5000 }).catch(() => check(false, 'a cube finished by "Show me" still gets its "Solved!" moment'))
    await coach.page.waitForTimeout(500)
    equal(await flag(coach.page), false, 'the scrambled flag is cleared when the cube is solved by "Show me"')
    equal(await solves(coach.page), 0, 'a solve the coach turned is not rewarded as his')
    await coach.page.focus('[data-cube3d=play]')
    await coach.page.keyboard.press('r')
    await coach.page.keyboard.press('Shift+R')
    await idle(coach.page, 'play')
    await coach.page.waitForTimeout(500)
    equal(await solves(coach.page), 0, 'R R′ on the solved cube afterwards is not a solve')
    check(coach.errors.length === 0, `console errors: ${coach.errors.join(' | ')}`)
    await coach.context.close()

    // 2. A cube mixed up by hand (no Scramble button) and solved by hand is celebrated and rewarded.
    const hand = await open('/play')
    await cubeReady(hand.page, 'play')
    await hand.page.focus('[data-cube3d=play]')
    const mix = "R U F' L D B' U R' F D' L' B R F U' D"
    const press = async (moves) => {
      for (const move of moves) {
        await hand.page.keyboard.press(move.endsWith("'") ? `Shift+${move[0]}` : move[0].toLowerCase())
        await idle(hand.page, 'play')
      }
    }
    await press(mix.split(' '))
    equal(await stateOf(hand.page, 'play'), after(mix), 'mixed by hand')
    equal(await flag(hand.page), true, 'a cube properly mixed by hand counts as scrambled')
    equal(await solves(hand.page), 0, 'nothing rewarded yet')
    const back = mix.split(' ').reverse().map((m) => (m.endsWith("'") ? m[0] : `${m}'`))
    await press(back)
    equal(await stateOf(hand.page, 'play'), SOLVED, 'solved again by hand')
    await hand.page.waitForSelector('[data-testid=celebration]', { timeout: 5000 }).catch(() => check(false, 'solving a hand-mixed cube is celebrated'))
    await hand.page.keyboard.press('Escape') // a first solve is a takeover; out of the way
    await hand.page.waitForSelector('[data-testid=celebration][data-tier=milestone]', { state: 'detached', timeout: 4000 }).catch(() => {})
    await hand.page.focus('[data-cube3d=play]')
    await hand.page.waitForFunction(() => JSON.parse(localStorage.getItem('rubikku:progress') ?? '{}').state?.counters?.solves === 1, null, { timeout: 5000 }).catch(() => check(false, 'the hand-made solve is recorded'))
    equal(await flag(hand.page), false, 'the flag is cleared again')
    // A couple of turns and back: not another solve.
    await press(['R', 'U', "U'", "R'"])
    await hand.page.waitForTimeout(500)
    equal(await solves(hand.page), 1, 'two turns away and back is not a second solve')
    check(hand.errors.length === 0, `console errors: ${hand.errors.join(' | ')}`)
    await hand.context.close()
  },

  // ── an idle cube draws nothing; reduced motion turns instantly ──
  async idle() {
    const { page, context, errors } = await open('/play')
    await cubeReady(page, 'play')
    await still(page, 'play')
    const a = await framesOf(page, 'play')
    await page.waitForTimeout(1500)
    equal(await framesOf(page, 'play'), a, 'no frames are rendered while the cube is idle')
    await page.focus('[data-cube3d=play]')
    await page.keyboard.press('r')
    await idle(page, 'play')
    check((await framesOf(page, 'play')) > a + 2, 'a turn renders several frames')
    await context.close()

    const reduced = await open('/play', { settingsExtra: { motion: 'reduced' } })
    await cubeReady(reduced.page, 'play')
    await still(reduced.page, 'play')
    await reduced.page.focus('[data-cube3d=play]')
    await reduced.page.keyboard.press('r')
    equal(await shownOf(reduced.page, 'play'), after('R'), 'reduced motion: the turn lands at once')
    check(!(await reduced.page.evaluate(() => window.__rubikku.cubes.play.isAnimating())), 'reduced motion: nothing is animating')
    await dragSticker(reduced.page, 'play', F(1, 2), 0, -110)
    equal(await shownOf(reduced.page, 'play'), after('R R'), 'reduced motion: dragging still works')
    check(errors.length + reduced.errors.length === 0, `console errors: ${[...errors, ...reduced.errors].join(' | ')}`)
    await reduced.context.close()
  },

  // ── many route changes: no leaked contexts, no errors, the cube still works ──
  async routes() {
    const { page, context, errors } = await open('/play')
    await cubeReady(page, 'play')
    const go = async (route) => {
      await page.evaluate((route) => (location.hash = `#${route}`), route)
      await page.waitForTimeout(140)
    }
    for (let i = 0; i < 14; i++) {
      await go('/')
      await go('/play')
      await go('/settings')
      await go('/play?lab')
      await go('/play')
    }
    await cubeReady(page, 'play')
    await page.waitForTimeout(5200) // R3F releases a context shortly after unmount; the mini renderer after 4s
    const contexts = await page.evaluate(() => window.__rubikku.contexts)
    equal(contexts, 1, 'after 70 route changes exactly one cube context is alive')
    equal(await page.evaluate(() => document.querySelectorAll('canvas').length), 1, 'exactly one canvas is in the page')
    equal(Object.keys(await page.evaluate(() => window.__rubikku.cubes)).join(','), 'play', 'only the Play cube is registered')
    await page.focus('[data-cube3d=play]')
    await page.keyboard.press('u')
    await idle(page, 'play')
    equal(await stateOf(page, 'play'), after('U'), 'the cube still works after all that')
    // Leave mid-animation: nothing throws.
    await page.keyboard.press('r')
    await go('/settings')
    await go('/play')
    await cubeReady(page, 'play')
    equal(await stateOf(page, 'play'), after('U R'), 'a move made just before leaving is kept')
    check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── Home hero: live cube, look-only ──
  async home() {
    const state = after("R U F")
    const { page, context, errors } = await open('/', {
      storage: { 'rubikku:play': { version: 1, state: { session: { start: state, state, done: [], undone: [] }, scrambled: false, mirrors: false, algText: '' } } },
    })
    await cubeReady(page, 'home')
    await still(page, 'home')
    equal(await stateOf(page, 'home'), state, 'the Home hero shows the free-play cube as it was left')
    const at = await facelet(page, 'home', F(1, 2))
    const before = await poseOf(page, 'home')
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x - 80, at.y, { steps: 6 })
    await page.waitForTimeout(120)
    await page.mouse.up()
    await still(page, 'home')
    equal(await stateOf(page, 'home'), state, 'dragging a sticker on the hero cube does not turn it')
    check((await poseOf(page, 'home')).azimuth > before.azimuth + 0.2, 'dragging the hero cube looks around')
    check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── minis, paint surface, playback-only cube (the cube lab) ──
  async lab() {
    const { page, context, errors } = await open('/play?lab', { viewport: { width: 1024, height: 1400 } })
    await page.waitForSelector('[data-testid=minis] canvas')
    await cubeReady(page, 'paint')
    await cubeReady(page, 'demo')
    const minis = await page.$$eval('[data-testid=minis] canvas', (list) => list.length)
    check(minis >= 20, `the lab shows at least 20 minis (${minis})`)
    await page.waitForTimeout(600)
    equal(await page.evaluate(() => window.__rubikku.contexts), 3, 'two big cubes + every mini = three WebGL contexts')
    equal(await page.evaluate(() => document.querySelectorAll('[data-minicube=svg]').length), 0, 'no mini fell back to SVG')
    // Every mini has actually been drawn (not blank).
    const blank = await page.$$eval('[data-testid=minis] canvas', (list) =>
      list.filter((c) => {
        if (c.dataset.minicube === 'playing') return false // may be mid-fade at its loop point
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let painted = 0
        for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 200) painted++
        return painted < 20
      }).length,
    )
    equal(blank, 0, 'every mini canvas has a cube drawn in it')
    // "visible" minis animate: their pixels change over time. "hover" minis are still until hovered.
    const snap = (i) => page.$$eval('[data-testid=minis] canvas', (list, i) => list[i].toDataURL().length + ':' + list[i].toDataURL().slice(-400), i)
    const still0 = await snap(0)
    const moving0 = await snap(8)
    await page.waitForTimeout(1800)
    equal(await snap(0), still0, 'a hover mini is still until hovered')
    check((await snap(8)) !== moving0, 'a visible mini animates')
    const first = await (await page.$$('[data-testid=minis] canvas'))[0].boundingBox()
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2)
    await page.waitForFunction(() => document.querySelector('[data-testid=minis] canvas').dataset.minicube === 'playing')
    await page.waitForTimeout(1500)
    check((await snap(0)) !== still0, 'a hover mini animates while hovered')
    await page.mouse.move(5, 5)
    await page.waitForFunction(() => document.querySelector('[data-testid=minis] canvas').dataset.minicube === 'still')
    await page.waitForTimeout(200)
    equal(await snap(0), still0, 'and returns to its resting picture afterwards')

    // Paint surface: tapping a blank sticker paints it; dragging on a painted cube only looks around.
    equal(await stateOf(page, 'paint'), null, 'a painted cube has no engine state')
    const target = await facelet(page, 'paint', F(0, 0))
    await page.mouse.click(target.x, target.y)
    await page.waitForTimeout(150)
    const greenCount = () => page.$$eval('[data-testid=minis] canvas', (list) => {
      const c = list[list.length - 1]
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i + 1] > 140 && d[i] < 90 && d[i + 2] < 140) n++
      return n
    })
    const one = await greenCount()
    const second = await facelet(page, 'paint', F(0, 1))
    await page.mouse.click(second.x, second.y)
    await page.waitForTimeout(150)
    check((await greenCount()) > one * 1.5, 'tapping stickers on the 3D cube paints them (seen in the painted mini)')

    // Playback-only cube ignores the pointer but plays what it is told.
    const demoBefore = await stateOf(page, 'demo')
    await page.click('button:has-text("Do the arrow move")')
    await idle(page, 'demo')
    const cube = Cube.fromString(SOLVED)
    cube.move("F R U R' U' F' R")
    equal(await stateOf(page, 'demo'), cube.asString(), 'the playback-only cube plays an applied move')
    check(demoBefore !== (await stateOf(page, 'demo')), 'demo state changed')
    equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-cube3d=demo]')).pointerEvents), 'none', 'the playback-only cube lets pointer events through')
    check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    await context.close()
  },

  // ── the stage: controls live in a bar of their own and never cover the cube ──
  async stage() {
    const STATE = after("R U F' L2 D B' R2 U' F D2 L' B U2 R' F2 D' L U B2 R")
    const learnAt = (lesson, beatId) => ({
      version: 1,
      state: { lessons: { [lesson]: { beatId, furthest: 0, done: {}, session: null, sessionKey: null, drill: { n: 0, hinted: false, solved: false, total: 0, clean: 0, streak: 0, best: 0 }, completed: false } }, last: lesson },
    })
    const pages = [
      ['/play', 'play', {}],
      ['/learn/white-corners', 'lesson', { 'rubikku:learn': learnAt('white-corners', 'try-1') }],
      ['/learn/yellow-corners-orient', 'lesson', { 'rubikku:learn': learnAt('yellow-corners-orient', 'try-1') }],
      ['/notation', 'notation', {}],
      ['/algorithms/sune', 'algorithm', {}],
      ['/patterns/checkerboard', 'pattern', {}],
      ['/solve', 'solve', { 'rubikku:solve': { version: 1, state: { phase: 'walk', intent: 'solve', cells: STATE, start: STATE, walkMode: 'beginner', pos: { step: 15, move: 2 } } } }],
      ['/learn/full-solve', 'lesson', {}],
    ]
    const viewports = [
      { name: '1024x768', viewport: { width: 1024, height: 768 } },
      { name: '768x1024', viewport: { width: 768, height: 1024 }, touch: true },
      { name: '390x844', viewport: { width: 390, height: 844 }, touch: true },
      { name: '1440x900', viewport: { width: 1440, height: 900 } },
    ]
    const sizes = []
    for (const vp of viewports) {
      for (const [route, id, storage] of pages) {
        const { page, context, errors } = await open(route, { viewport: vp.viewport, touch: vp.touch, storage })
        await cubeReady(page, id)
        await still(page, id)
        const result = await page.evaluate((id) => {
          const cube = document.querySelector(`[data-cube3d=${id}]`)
          const stage = cube.closest('.stage')
          const view = cube.closest('[data-stage-view]')
          const b = window.__rubikku.cubes[id].bounds()
          const v = view.getBoundingClientRect()
          const hits = []
          for (const el of stage.querySelectorAll('button, a, [role=status], [data-testid=stage-status] > *')) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue
            const overlap = Math.min(r.right, b.right) - Math.max(r.left, b.left) > 1 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 1
            if (overlap) hits.push(el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 30))
          }
          return {
            hits,
            cube: { w: Math.round(b.right - b.left), h: Math.round(b.bottom - b.top) },
            view: { w: Math.round(v.width), h: Math.round(v.height) },
            inside: b.left >= v.left - 2 && b.right <= v.right + 2 && b.top >= v.top - 2 && b.bottom <= v.bottom + 2,
          }
        }, id)
        const label = `${route} at ${vp.name}`
        check(result.hits.length === 0, `${label}: no control overlaps the cube (overlapping: ${result.hits.join(', ')})`)
        check(result.inside, `${label}: the whole cube is inside its view (cube ${JSON.stringify(result.cube)}, view ${JSON.stringify(result.view)})`)
        const fill = Math.min(result.cube.w, result.cube.h) / Math.min(result.view.w, result.view.h)
        check(fill > 0.7, `${label}: the cube fills its view (${Math.round(fill * 100)}%)`)
        sizes.push(`${label}: cube ${result.cube.w}px in a ${result.view.w}×${result.view.h} view`)
        check(errors.length === 0, `${label}: console errors: ${errors.join(' | ')}`)
        await context.close()
      }
    }
    console.log(`    ${sizes.join('\n    ')}`)
  },

  // ── guide arrows: blue, readable on white and yellow, on the visible side, off the lit piece ──
  async arrows() {
    for (const theme of ['light', 'dark']) {
      const { page, context, errors } = await open('/play?lab', { viewport: { width: 1024, height: 1400 }, settingsExtra: { theme } })
      await cubeReady(page, 'demo')
      // Clicking a chip can scroll the page: measure where the cube is at every grab.
      const grabCube = async () => {
        const box = await (await page.$('[data-cube3d=demo]')).boundingBox()
        return grab(page, { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) })
      }
      const chip = (name) => page.click(`button:text-is("${name}")`)
      const blue = theme === 'light' ? [38, 100, 236] : [79, 141, 255]
      await chip('None')
      // How much of the arrow is drawn, and how strongly it stands out from what is under it.
      const arrowNow = () => page.evaluate(() => window.__rubikku.cubes.demo.arrowInfo().move)
      const setArrow = async (move) => {
        for (let i = 0; i < 3 && (await arrowNow()) !== move; i++) await chip(move ?? (await arrowNow()))
        await still(page, 'demo')
      }
      const measure = async (move) => {
        await setArrow(move)
        const on = await grabCube()
        await setArrow(null)
        const off = await grabCube()
        let changed = 0
        let blueish = 0
        let contrast = 0
        for (let i = 0; i < on.length; i += 4) {
          const d = deltaE([on[i], on[i + 1], on[i + 2]], [off[i], off[i + 1], off[i + 2]])
          if (d < 12) continue
          changed++
          contrast += d
          if (Math.hypot(on[i] - blue[0], on[i + 1] - blue[1], on[i + 2] - blue[2]) < 70) blueish++
        }
        return { changed, blueish, contrast: changed ? contrast / changed : 0 }
      }
      // White on top (the lab's cube), then yellow on top (x2).
      const white = await measure('R')
      await setArrow('x')
      await page.click('button:has-text("Do the arrow move")')
      await idle(page, 'demo')
      await page.click('button:has-text("Do the arrow move")')
      await idle(page, 'demo')
      await setArrow(null)
      equal((await stateOf(page, 'demo'))[4], 'D', 'the lab cube now has the yellow centre on top')
      const yellow = await measure('R')
      const back = await measure('B')
      const rotation = await measure("y'")
      for (const [name, m] of [['R over white', white], ['R over yellow', yellow], ['B (a hidden face)', back], ["y′ (whole cube)", rotation]]) {
        console.log(`    ${theme} ${name}: ${m.changed} px changed, ${m.blueish} px arrow blue, mean ΔE ${m.contrast.toFixed(1)}`)
        check(m.blueish > 250, `${theme}: the ${name} arrow is drawn in the action blue (${m.blueish} px)`)
        check(m.contrast > 30, `${theme}: the ${name} arrow stands out from the stickers under it (mean ΔE ${m.contrast.toFixed(1)})`)
      }
      // One clear arrow for a whole-cube turn, not three ribbons: about as big as a single-layer arrow.
      check(rotation.blueish < white.blueish * 2.6, `${theme}: a whole-cube turn draws one arrow (${rotation.blueish} vs ${white.blueish} px)`)

      // With a piece lit, the arrow keeps off it (when the layer leaves room).
      await chip('White-green edge (piece)')
      for (const move of ['R', "U'", 'F2', 'L', "D'", 'B']) {
        await setArrow(move)
        const info = await page.evaluate(() => window.__rubikku.cubes.demo.arrowInfo())
        const onLit = info.covers.filter((f) => info.avoid.includes(f))
        check(info.avoid.length > 0 && onLit.length === 0, `${theme}: the ${move} arrow does not lie on the lit piece (covers ${info.covers.join(',')}; lit ${info.avoid.join(',')})`)
      }
      check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
      await context.close()
    }
  },

  // ── dimming keeps each colour's hue; centres stay bright; unpainted ≠ white ──
  async dimming() {
    const NAMES = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' }
    for (const theme of ['light', 'dark']) {
      const { page, context, errors } = await open('/play?lab', { viewport: { width: 1024, height: 1400 }, settingsExtra: { theme } })
      await cubeReady(page, 'demo')
      await cubeReady(page, 'paint')
      const chip = (name) => page.click(`button:text-is("${name}")`)
      await chip('R') // the lab starts with the R arrow on: switch it off
      await chip('None')
      await still(page, 'demo')
      const state = await stateOf(page, 'demo')
      const visible = []
      for (let i = 0; i < 27; i++) if ((await facelet(page, 'demo', i)).facing) visible.push(i)
      const sampleAll = async (id, list) => {
        const box = await (await page.$(`[data-cube3d=${id}]`)).boundingBox()
        const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
        const pixels = await grab(page, clip)
        const out = {}
        for (const i of list) {
          const at = await facelet(page, id, i)
          out[i] = patch(pixels, at.x - clip.x, at.y - clip.y)
        }
        return out
      }
      const lit = await sampleAll('demo', visible)
      await chip('White-green edge (piece)')
      await still(page, 'demo')
      const avoid = (await page.evaluate(() => window.__rubikku.cubes.demo.arrowInfo())).avoid
      const dim = await sampleAll('demo', visible)
      const rows = []
      const dimmedByColour = {}
      for (const i of visible) {
        const colour = NAMES[state[i]]
        const centre = i % 9 === 4
        const d = deltaE(lit[i], dim[i])
        const hueShift = Math.abs(((hue(lit[i]) - hue(dim[i]) + 540) % 360) - 180)
        rows.push(`${String(i).padStart(2)} ${colour.padEnd(6)} lit ${rgbHex(lit[i])} → ${rgbHex(dim[i])} ΔE ${d.toFixed(0).padStart(3)} hue ${hue(lit[i]).toFixed(0)}° → ${hue(dim[i]).toFixed(0)}°${centre ? ' (centre)' : avoid.includes(i) ? ' (lit)' : ''}`)
        if (centre) check(d < 8, `${theme}: centre ${i} (${colour}) stays bright while a piece is lit (ΔE ${d.toFixed(1)})`)
        else if (!avoid.includes(i)) {
          check(d > 12, `${theme}: sticker ${i} (${colour}) is dimmed (ΔE ${d.toFixed(1)})`)
          if (colour !== 'white') check(hueShift < 16, `${theme}: dimmed ${colour} sticker ${i} keeps its hue (shift ${hueShift.toFixed(0)}°)`)
          ;(dimmedByColour[colour] ??= []).push(dim[i])
        }
      }
      console.log(`    ${theme}:\n      ${rows.join('\n      ')}`)
      // Lit vs dimmed must be obvious in BOTH themes (design review 2, N4: at night it was not),
      // and hues must survive: every dimmed sticker moved well away from its lit colour.
      const minDim = Math.min(...visible.filter((i) => i % 9 !== 4 && !avoid.includes(i) && NAMES[state[i]] !== 'white').map((i) => deltaE(lit[i], dim[i])))
      console.log(`    ${theme}: smallest lit→dimmed change of a coloured sticker ΔE ${minDim.toFixed(1)}`)
      check(minDim > (theme === 'dark' ? 30 : 20), `${theme}: every dimmed colour is clearly darker/paler than when lit (min ΔE ${minDim.toFixed(1)})`)
      // White (learning review 2, SF4): a lit white sticker must stand out from every dimmed one,
      // and a dimmed white must not look lit.
      const litWhite = avoid.filter((i) => NAMES[state[i]] === 'white' && visible.includes(i))
      const dimmedAll = visible.filter((i) => i % 9 !== 4 && !avoid.includes(i))
      for (const w of litWhite) {
        const closest = dimmedAll.reduce((a, i) => (deltaE(dim[w], dim[i]) < deltaE(dim[w], dim[a]) ? i : a), dimmedAll[0])
        const nearest = deltaE(dim[w], dim[closest])
        console.log(`    ${theme}: lit white sticker ${w} ${rgbHex(dim[w])}: nearest dimmed sticker ${closest} (${NAMES[state[closest]]} ${rgbHex(dim[closest])}) ΔE ${nearest.toFixed(1)}`)
        // (Light: plus the action-blue outline round every lit sticker.)
        check(nearest > (theme === 'dark' ? 30 : 27), `${theme}: the lit white sticker ${w} stands out from every dimmed sticker (nearest ΔE ${nearest.toFixed(1)})`)
      }
      check(litWhite.length > 0, `${theme}: the lit piece shows a white sticker to measure`)
      for (const i of dimmedAll.filter((i) => NAMES[state[i]] === 'white')) {
        const d = deltaE(lit[i], dim[i])
        check(d > 25, `${theme}: dimmed white sticker ${i} is clearly not lit white (ΔE ${d.toFixed(1)})`)
      }
      // Dimmed colours must stay apart from each other (red vs orange vs yellow in particular).
      const colours = Object.keys(dimmedByColour)
      for (let a = 0; a < colours.length; a++) {
        for (let b = a + 1; b < colours.length; b++) {
          const d = deltaE(dimmedByColour[colours[a]][0], dimmedByColour[colours[b]][0])
          check(d > 15, `${theme}: dimmed ${colours[a]} and dimmed ${colours[b]} can be told apart (ΔE ${d.toFixed(1)})`)
        }
      }
      // Paint mode: an unpainted sticker looks nothing like a white one.
      await still(page, 'paint')
      const paint = await sampleAll('paint', [4, F(2, 2)])
      const white = paint[4]
      const blank = paint[F(2, 2)]
      const d = deltaE(white, blank)
      console.log(`    ${theme}: white centre ${rgbHex(white)} vs unpainted ${rgbHex(blank)}: ΔE ${d.toFixed(1)}`)
      check(d > 40, `${theme}: an unpainted sticker is unmistakable from a white one (ΔE ${d.toFixed(1)})`)
      check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
      await context.close()
    }
  },

  // ── the cube's own celebration ──
  async celebrate() {
    for (const motion of ['full', 'reduced']) {
      const { page, context, errors } = await open('/play', { settingsExtra: { motion } })
      await cubeReady(page, 'play')
      await still(page, 'play')
      const pose = await poseOf(page, 'play')
      for (const tier of ['tick', 'stage', 'milestone']) {
        const frames = await framesOf(page, 'play')
        const started = Date.now()
        const done = page.evaluate((tier) => window.__rubikku.cubes.play.celebrate(tier), tier)
        await page.waitForTimeout(150)
        check(await page.evaluate(() => window.__rubikku.cubes.play.isCelebrating()), `${motion}: ${tier} is under way`)
        await done
        const took = Date.now() - started
        check(took < 6000, `${motion}: ${tier} finishes (${took} ms)`)
        check(!(await page.evaluate(() => window.__rubikku.cubes.play.isCelebrating())), `${motion}: ${tier} has ended`)
        check((await framesOf(page, 'play')) > frames + 3, `${motion}: ${tier} animates`)
        equal(await stateOf(page, 'play'), SOLVED, `${motion}: ${tier} leaves the cube's state alone`)
        const poseNow = await poseOf(page, 'play')
        check(Math.abs(poseNow.azimuth - pose.azimuth) < 1e-6 && Math.abs(poseNow.elevation - pose.elevation) < 1e-6, `${motion}: ${tier} leaves the camera where it was`)
      }
      // A finger on the cube ends a celebration at once.
      if (motion === 'full') {
        const done = page.evaluate(() => window.__rubikku.cubes.play.celebrate('milestone'))
        await page.waitForTimeout(200)
        const box = await (await page.$('[data-cube3d=play]')).boundingBox()
        await page.mouse.click(box.x + 30, box.y + 30)
        await done
        check(!(await page.evaluate(() => window.__rubikku.cubes.play.isCelebrating())), 'touching the cube ends the celebration')
        await page.keyboard.press('r')
        await idle(page, 'play')
        equal(await stateOf(page, 'play'), after('R'), 'the cube turns normally right after a celebration')
      }
      check(errors.length === 0, `console errors: ${errors.join(' | ')}`)
      await context.close()
    }
  },

  // ── no WebGL, and a lost context ──
  async fallback() {
    const none = await open('/play', { init: () => (window.__rubikku = { cubes: {}, contexts: 0, forceFallback: true }) })
    await none.page.waitForSelector('[data-cube-fallback] svg')
    check(await none.page.isVisible('text=drawn flat'), 'without WebGL a flat cube and a friendly note are shown')
    equal(await none.page.evaluate(() => document.querySelectorAll('canvas').length), 0, 'no canvas is created without WebGL')
    await none.page.focus('[data-cube3d=play]')
    await none.page.keyboard.press('r')
    await none.page.keyboard.press('u')
    equal(await stateOf(none.page, 'play'), after('R U'), 'without WebGL the keyboard still turns the cube')
    const reds = await none.page.$$eval('[data-cube-fallback] svg polygon[fill="var(--cube-red)"]', (list) => list.length)
    check(reds > 0, 'the flat cube shows the state')
    await none.page.fill('input[aria-label="Moves to play"]', "F2 D")
    await none.page.keyboard.press('Enter')
    await none.page.waitForFunction(() => document.querySelector('[data-testid=player] input[type=range]')?.value === '2')
    equal(await stateOf(none.page, 'play'), after('R U F2 D'), 'without WebGL algorithms still play (instantly)')
    check(none.errors.length === 0, `console errors: ${none.errors.join(' | ')}`)
    await none.context.close()

    const { page, context } = await open('/play')
    await cubeReady(page, 'play')
    await page.evaluate(() => window.__rubikku.cubes.play.loseContext())
    await page.waitForSelector('[data-cube-fallback] svg', { timeout: 5000 }).catch(() => check(false, 'a lost context shows the flat cube'))
    await page.focus('[data-cube3d=play]')
    await page.keyboard.press('f')
    equal(await stateOf(page, 'play'), after('F'), 'the cube keeps working while the context is lost')
    await page.evaluate(() => window.__rubikku.cubes.play.restoreContext())
    await page.waitForSelector('[data-cube-fallback]', { state: 'detached', timeout: 8000 }).catch(() => check(false, 'the 3D view comes back when the context is restored'))
    await page.keyboard.press('u')
    await idle(page, 'play')
    equal(await shownOf(page, 'play'), after('F U'), 'after the context is restored the cube shows the right state')
    await context.close()
  },
}

for (const [name, run] of Object.entries(tests)) {
  if (ONLY && !ONLY.includes(name)) continue
  const before = failures.length
  const started = Date.now()
  try {
    await run()
  } catch (error) {
    failures.push(`${name}: threw ${error.message}`)
    console.error(`    ✗ ${name} threw: ${error.stack ?? error.message}`)
  }
  console.log(`${failures.length === before ? '✓' : '✗'} ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
}

await browser.close()
console.log(`\n${checks} checks, ${failures.length} failed`)
if (failures.length > 0) process.exit(1)
