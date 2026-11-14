# src/three — the 3D cube

```ts
import { Cube3D, MiniCube, CubeSvg, KeyboardHelp, useCubeController } from '../../three'
```

| Thing | What it is |
|---|---|
| `<Cube3D>` | The big cube. Fills its parent (put it in `<CubeStage>`), transparent canvas, one WebGL context. |
| `useCubeController()` | State + undo/redo history + animated runs + step-through player. Use this; don't reimplement. |
| `<MiniCube>` | Small non-interactive cube for grids. All minis on a page share **one** WebGL context. |
| `<CubeSvg>` | Flat isometric drawing of a state (no WebGL). The automatic fallback. |
| `<KeyboardHelp>` | The list of cube keys, for a popover. |
| `<StageControls>` | The one control bar for every stage: ↺ CUBE ↻ (whole-cube turns), a status slot, mirrors / face letters / peek / reset view. Goes in `<CubeStage controls={…}>`, under the cube — never on it. |
| `<TurnCubeButtons>` | The two "turn the whole cube" buttons (`y′` / `y`) on their own. Touch has no drag for a whole-cube turn, so any stage where the learner follows moves needs them — `StageControls onTurnCube` includes them. |
| `useStepFollower()` | Follows a cube through the beginner method move by move: on the step / half-way / off it (with the way back) / finished / a fresh plan. Hints, stage trackers and "came undone" warnings must come from this, never from analysing the live cube. |

Try everything at `#/play?lab` (the cube lab).

## The contract

`<Cube3D>` is **controlled**: it draws the `state` prop (a `CubeState`, or 54 painted colours with
`null` for blank stickers).

- `state` changes by **exactly one move** → that move animates. Any other change → it snaps.
- A move that *starts* in the view — the user dragged a layer or pressed a key, or you called
  `ref.play()` — is reported through `onMove(move, { source, state })` where source is
  `'drag' | 'keyboard' | 'play'`. **You must apply it** and pass the new state back (synchronously,
  not in a transition). To refuse a user's move use `allowMove`; the layer springs back.
- The engine state is the truth. When an animation lands, every transform is rebuilt from the
  state — nothing accumulates, nothing drifts.

`useCubeController` does all of that for you:

### The stage

Every big cube sits on a `<CubeStage>` (src/ui) with a `<StageControls>` bar under it. Nothing is
drawn over the cube's view, so the camera frames the cube to about three quarters of the view's
narrow side. Size the stage with `fit`:

```tsx
<CubeStage
  fit="square"                         // view = stage width, square…
  maxViewHeight="calc(100dvh - 15rem)" // …but never taller than this (or set --stage-max-h by class)
  controls={
    <StageControls
      view={cube.view}                                   // peek + reset view act on this cube
      onTurnCube={(move) => void cube.apply([move])}     // ↺ CUBE ↻ at the left
      busy={cube.busy}
      mirrors={mirrors} onMirrorsChange={setMirrors}     // optional toggles
      labels={labels} onLabelsChange={setLabels}
      status={<Badge>12 moves</Badge>}                   // a badge, a caption, a meter
      extra={<IconButton icon="keyboard" … size="sm" />} // more buttons at the right
    />
  }
>
  <Cube3D {...cube.bind} />
</CubeStage>
```

`fit="wide"` is 4:3; `fit="fill"` (default) fills a height you give the stage with `className`.
Responsive caps are easiest as variables on the stage: `className="[--stage-max-h:30dvh]
md:[--stage-max-h:42dvh]"`. The bar is a container (`@container/stage`): its parts shrink on a
narrow stage. The old corner slots (`topLeft` …) still work but are drawn in the bar.

### Celebrations

```tsx
await cube.view.current?.celebrate('tick')       // a hop and a shine: a clean rep, a right answer
await cube.view.current?.celebrate('stage')      // spin + layer ripple + a light sweep (~1 s)
await cube.view.current?.celebrate('milestone')  // double spin, tilt, lift, two sweeps, a glow (~1.9 s)
```

The UI's celebration module calls this for you. A cube driven by `useCubeController` registers
itself as "the cube on screen" (`celebration.registerCube`) while its `<Cube3D>` is mounted —
pages do nothing (pass `celebrate: false` to opt out). `celebration.moment(…)` /
`.tick(null, { cube: true })` then make it celebrate. (A `.milestone(…)` takeover covers the page and spins a
solved cube of its own; the page's cube stays still underneath.) A bare `<Cube3D ref>` without the
controller can pass `cube: ref.current` to a celebration, or call `useCelebrationCube(ref)`. Reduced motion: no movement, the stickers brighten and fade back. Touching the
cube ends a celebration at once; the cube's state and camera are never changed by it.

### The controller

```tsx
const cube = useCubeController({
  initial: () => useMyStore.getState().session,          // CubeState | CubeSession | null, read once
  onChange: (session) => useMyStore.getState().save(session), // plain JSON: state + history + player
  onUserMove: (move, state, source) => { /* only the kid's own turns */ },
})

<CubeStage className="aspect-square">
  <Cube3D {...cube.bind} highlight={{ pieces: ['UF'] }} arrow="R" mirrors={false} />
</CubeStage>

cube.state / cube.history / cube.moveCount / cube.redoStack / cube.canUndo / cube.canRedo / cube.busy
await cube.apply("R U R' U'")                       // animated, recorded in history; resolves true/false
await cube.apply(randomScramble(), { speed: 3, record: false })   // scramble: history starts over
await cube.apply(alg, { animate: false })           // instant
cube.undo(); cube.redo(); cube.reset(state); cube.stop()
cube.view.current?.peek() / .resetView() / .focusOn({ pieces: ['UF'] }) / .focusOn(null)
```

Persist `cube.getSession()` (or use `onChange`) with `createPersistedStore`; validate saved data
with `sanitizeSession(saved)`.

The history keeps the latest 600 moves; older ones are trimmed off the front, and `session.start`
moves along with the trim (`session.dropped` counts them, `cube.moveCount` is the true total). So
**do not use `session.start` to tell which cube a save belongs to** — store your own id or the
original start state beside the session (see `sessionStart` in the learn store).

### Coaching a solve: `useStepFollower`

```tsx
const cube = useCubeController(...)
const { follower, ask, replan } = useStepFollower(cube, { guiding: hintIsOpen })

follower.status            // 'on' | 'half' | 'off' | 'done' | 'solved' | 'stuck'
follower.step / .moves / .position      // the solver step being followed and how far he is
follower.next              // the move for <Cube3D arrow>: the next move, the same quarter again when
                           // half-way through a half turn, or the undo after a slip
follower.undo              // the way back after a slip (he can also just take the moves back by hand)
follower.completed         // the step the latest move finished (for one beat of "done")
follower.fresh             // 'lost' | 'asked' when the plan was made from the middle of nowhere
follower.view              // analyse THIS (analyzeCube) for trackers and warnings, never cube.state
<Button onClick={ask}>Hint</Button>    <Button onClick={replan}>Hint from here</Button>
```

The logic is pure and lives in the engine (`src/cube/beginner/follow.ts`: `startFollow`,
`followMove`, `followState`, and `startPath` / `stepPath` for a fixed list of moves). The lessons'
coach (`useCoach` + `<HintCard>` in `src/features/learn/player/coach.tsx`) is the ready-made UI
on top of it, shared by drills, the full solve and Play.

### Lesson recipe: set up → demo → your turn

```tsx
// 1. Set up a state and step through an algorithm
cube.load("R U R' U'", { from: setupState, autoplay: false })
const p = cube.player!   // null when nothing is loaded
<PlaybackBar playing={p.playing} onPlayPause={p.toggle} position={p.position} total={p.total}
  onStepBack={() => p.step(-1)} onStepForward={() => p.step(1)} onRestart={p.restart}
  onScrub={p.seek} speed={p.speed} onSpeedChange={p.setSpeed} />
<MoveSequence moves={p.alg} activeIndex={p.activeIndex >= 0 ? p.activeIndex : p.position} />
<Cube3D {...cube.bind} mode="playback" arrow={p.alg[p.position] ?? null} />   // preview the next move

// 2. Let the kid try: same loaded algorithm, interactive cube
cube.player.restart()
<Cube3D {...cube.bind} arrow={p.alg[p.position] ?? null}
        allowMove={(move) => move === p.alg[p.position]} />   // optional: refuse wrong moves
// Doing the player's next move by hand advances `position`; a different move sets
// `player.detached` (the next play/step/seek snaps back). `onUserMove` sees every move he makes.
```

The player is a window onto the history ("the moves after `offset` are the first `position` moves
of `alg`"), so Undo is "step back" and a reload restores a half-played algorithm exactly.

## `<Cube3D>` props

| Prop | |
|---|---|
| `state` | `CubeState` or `(Color \| null)[54]` (paint mode: no turning; a blank sticker is a dark sunken slot with a dashed ring — never mistaken for white) |
| `onMove`, `allowMove`, `onRejectedMove`, `onMoveEnd`, `onAnimatingChange` | see the contract |
| `onUndo`, `onRedo` | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z / Ctrl+Y while focused |
| `onStickerClick(facelet, info)` | a tap on a sticker (works in paint mode — the 3D cube as an input surface) |
| `mode` | `'interactive'` (default) · `'view'` (look only) · `'playback'` (no input, pointer events pass through) |
| `orbit` | `true` (free) · `'limited'` (front stays in front, ±60°) · `false` |
| `zoom`, `keyboard` | default on in interactive mode. Wheel zooms only when the cube has focus (or ctrl/pinch) |
| `pageScroll` | vertical swipes scroll the page instead of tilting (for decorative cubes, e.g. Home hero) |
| `highlight` | `{ pieces?, slots?, facelets?, outline?, dimOthers?, keepCentres?, dimTo? }` — pieces follow the piece, slots/facelets stay put. Everything else dims but keeps its hue (pastel by day, a deep tint at night); the six centres stay bright unless `keepCentres: false`; nothing dims while `arrow` is a whole-cube rotation; `dimTo: 'grey'` dims everything else to one neutral grey instead (thumbnails, e.g. the Learn map) |
| `arrow` | a `Move` to preview: a narrow action-blue arrow (white stroke, dark outline — it reads on all six colours) curved round the turning layer, placed on the side facing the camera (so B, L and D show on the visible side of their layer) and kept off the highlighted stickers. `x y z` get one floating whole-cube arrow |
| `arrowStyle` | `'layer'` (default: the strip round the turning layer, as above) · `'face'`: a single-face move (U D L R F B) is drawn as a curved arc on that face round its centre — the letter IS the face (Notation uses it; use it wherever a move is introduced by its letter, e.g. the primer). Falls back to the layer strip while that face is turned away from the camera. Wide moves, slices and rotations always use the layer strip |
| `mirrors` | float smaller copies of the three hidden faces in the stage's spare space beside the cube (dimmed exactly like the cube); the camera pulls back only a little, so the cube stays big |
| `faceLabels` | U/D/L/R/F/B badges; defaults to the `showFaceLabels` setting |
| `speed` | multiplier on the turn-speed setting |
| `turnSound`, `animateStateChanges`, `initialPose`, `label`, `debugId`, `className` | |

Handle (`ref`): `play(alg, { speed, instant }) → Promise<boolean>`, `stop()`, `whenIdle()`,
`turn(move)`, `setStateInstant(state?)`, `resetView()`, `focusOn(target | null, { zoom, free })`,
`peek(holdMs?)`, `getPose()`, `setPose(pose, { duration, instant })`, `celebrate(tier)`, `getState()`,
`isAnimating`, `focus()`.

Input: drag a sticker → that layer follows the finger and springs to the nearest quarter turn
(under ~30% and no flick → springs back). Drag empty space → orbit (elevation clamped −53°…70°,
with a short glide). Pinch / wheel → zoom 0.8–1.6. Double-tap empty space → reset view. Keys:
`U D L R F B` (Shift = prime, Alt = wide), `M E S`, `X Y Z`, `2` repeats the last move, arrows
orbit, `0` resets the view, `P` peeks.

Motion: turns use a short push-off and a crisp landing (`easeTurn`); a released drag springs to
its stop with one small overshoot; camera glides (reset, focus, orbit keys) follow a critically
damped spring curve — most of the way in the first half, a soft settle — in ≤ 0.6 s.

Behaviour: renders on demand (an idle cube draws nothing), pauses off-screen, honours reduced
motion (system or setting: turns and camera moves land instantly), falls back to `<CubeSvg>` with
a note when WebGL is missing or the context is lost (keyboard and `play()` keep working).

## `<MiniCube>`

```tsx
<MiniCube state={stateFromAlg(invertAlg(alg))} alg={alg} play="hover" label="Right trigger" />
<MiniCube state={SOLVED} alg={pattern.alg} play="visible" restOnEnd />     // loops while on screen
<MiniCube state={state} highlight={{ pieces: ['UF'] }} size={96} />        // still
```

Props: `state`, `alg`, `play` (`'hover'` default — hover, or tap to toggle on touch · `'visible'` ·
`false`), `loop`, `speed`, `restOnEnd`, `size` (px; omit to fill the parent's width), `pose`,
`highlight`, `label`.

How it works: one hidden WebGL renderer (`miniRenderer.ts`) draws each mini and the picture is
copied into that mini's 2D `<canvas>`. Stills are drawn once; animating minis share one rAF loop
(above 10 at once each is drawn every other frame). The shared context is released 4 s after the
last mini unmounts.

Limits: not interactive (no drag, orbit or keyboard — wrap it in a button/link for clicks); no
mirrors, arrows or face letters; always square; reduced motion shows a still.

## Tests

- `src/three/__tests__` — vitest: drag → move resolution, release thresholds, drag direction,
  keyboard map, timing, the controller (history, runs, player, sessions).
- `src/three/__tests__/controllerView.test.ts` — the controller driving the real `CubeView` with
  the state prop arriving late, as React delivers it (play again, load + autoplay, a grabbed layer).
- `e2e/cube.e2e.mjs` — Playwright with real mouse/touch/keyboard. Uses the hook
  `window.__rubikku.cubes[debugId]` → `getState()`, `getShownState()`, `getPose()`,
  `isAnimating()`, `whenIdle()`, `facelet(i) → {x, y, facing}` (client px of a sticker),
  `bounds()` (client box round the cube), `arrowInfo()` (the stickers the arrow covers and the lit
  ones it must avoid), `celebrate(tier)`, `isCelebrating()`, `frames()`, `loseContext()`; and
  `window.__rubikku.contexts` (live WebGL contexts). The suite also checks, at four
  breakpoints, that no stage control overlaps the cube; that arrows show in the action blue over
  white and yellow; and (by sampling pixels) that dimmed stickers keep their hue.
  The hook exists only in development, under automation (`navigator.webdriver`, which Playwright
  sets) or after `localStorage.setItem('rubikku:debug', '1')` + reload — not for ordinary visitors.

## Files

`turns.ts` pure turn/drag/key logic · `controller.ts` state, history, player (no React) ·
`useCubeController.ts` the hook · `useStepFollower.ts` the step follower as a hook ·
`StageControls.tsx` the stage's control bar · `TurnCubeButtons.tsx` whole-cube turn buttons · `model.ts` instanced meshes, arrow, labels · `view.ts` turn
queue, drag, camera, teaching aids · `Cube3D.tsx` React + R3F canvas · `miniRenderer.ts` /
`MiniCube.tsx` / `loopTimeline.ts` minis · `CubeSvg.tsx` fallback · `theme.ts` scene colours ·
`debug.ts` test hook.
