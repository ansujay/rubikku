# Rubikku — build plan

A website that teaches an 11-year-old to solve a 3x3 cube. One interactive 3D cube sits at the
centre; lessons, hints, the timer and the "help with my real cube" flow all drive that same cube.
It should feel like a coach beside him: fluid, tasteful, cool rather than childish.

This file is the shared brief for every agent. Read it fully before touching code.

## Audience and tone

- The user is 11, bright, new to cubing. Copy is short, friendly and concrete. No baby talk,
  no walls of text, no jargon before it has been taught.
- Show before telling: an animation of an idea comes before the algorithm for it.
- Rewards are satisfying but brief. Nothing flashes, loops forever or nags.

## Stack (already installed — do not add dependencies without a strong reason)

Vite 8 + React 19 + TypeScript, three + @react-three/fiber + @react-three/drei, `motion`
(Framer Motion; import from `motion/react`), zustand (+ `persist`), react-router-dom (use
`HashRouter` so static hosting works), Tailwind v4 (`@tailwindcss/vite`), cubejs (Kociemba),
canvas-confetti, vitest, playwright, vite-plugin-pwa.

## Directory ownership

Agents edit only the directories they own. Need a change elsewhere? Make the smallest possible
edit and call it out in your final report.

```
src/cube/        Pure TypeScript engine. No React, no DOM. Fully unit-tested.
src/three/       The 3D cube component and camera/gesture logic.
src/store/       Zustand stores + persistence helper.
src/ui/          Design system: tokens, theme, primitives, icons, sound, motion presets.
src/app/         App shell: routes, layout, navigation, page transitions.
src/features/
  home/          Dashboard: continue where you left off, daily challenge, streak.
  play/          Free play with the cube.
  learn/         Learning path map + lesson player.
  notation/      Notation trainer game.
  algorithms/    Algorithm cards.
  solve/         "Help with my real cube": colour entry, validation, guided solution.
  timer/         Speed timer + stats.
  progress/      XP, badges, streaks page.
  patterns/      Pattern gallery.
  settings/      Settings + backup export/import.
e2e/             Playwright tests and screenshot scripts.
```

## Engine contract (`src/cube/`)

- Colour scheme: U white, D yellow, F green, B blue, R red, L orange.
- State interops with the Kociemba 54-char facelet string (order U R F D L B), so cubejs can
  be used directly.
- Immutable: `applyMove(state, move) -> state`. States are cheap to copy and compare.
- Notation: face turns `U D L R F B` with `'` and `2`; slices `M E S`; wide moves `u d l r f b`
  / `Uw`…; whole-cube rotations `x y z`. Parser, stringifier, inverse, simplify.
- Scrambles: random-move scrambles of ~20 moves with no redundant consecutive moves.
- Validation of a user-entered cube with *specific, kid-readable* diagnostics: wrong sticker
  counts, impossible piece, duplicate piece, twisted corner, flipped edge, swapped pair.
- Stage detection: which of the beginner stages are complete, for a cube in any orientation.
- Beginner solver: solves any valid state with the same layer-by-layer method the lessons teach,
  returning steps grouped by stage, each with the case name, a plain-English explanation, the
  moves, and the pieces involved (for highlighting). Must pass a test of thousands of random
  scrambles. It should also resume from a partially solved cube without redoing finished stages.
- Optimal solver: thin async wrapper around cubejs (its table init is slow — run it lazily,
  ideally in a Web Worker, never blocking first paint).
- Everything exported from `src/cube/index.ts`.

Beginner stages, in order (ids are stable and used across the app):
`daisy`, `white-cross`, `white-corners`, `middle-layer`, `yellow-cross`, `yellow-edges`,
`yellow-corners-position`, `yellow-corners-orient`.

## 3D cube contract (`src/three/`)

One `<Cube3D>` component used everywhere, controlled by state plus an imperative handle:

- Renders a given cube state; animates face turns (ease in/out, adjustable speed, queued moves,
  instant mode for reduced motion). The engine state is the source of truth — the animation
  commits to it, never drifts from it.
- Input: drag on a sticker to turn that layer; drag on empty space to orbit; pinch/scroll zoom
  clamped to ~0.8x–1.6x; double-tap/click and a button reset the view. Keyboard notation.
- Teaching aids: highlight a set of pieces and dim the rest; camera glides to focus on a piece
  and eases back; "peek" reveals the hidden faces (back/left/bottom); optional face-letter labels
  and move arrows.
- Modes: interactive, playback-only (for demos and cards), and a cheap mini variant for grids of
  many cubes (must not create one WebGL context per card — share a renderer or render to images).
- 60fps on a mid-range tablet. Respect `prefers-reduced-motion` and the in-app motion setting.

## Design system (`src/ui/`)

- **Light and dark themes with a visible toggle in the main navigation** (user requirement —
  he uses it day and night). Default follows the system, the choice persists, and there is no
  flash of the wrong theme on load. Both themes are designed, not one inverted. The 3D scene
  (background, lighting, sticker contrast) adapts to the theme too.
- All colour, spacing, radius, shadow, type and motion values are tokens (CSS variables). No
  raw hex values in feature code.
- Fonts are self-hosted (the site must work offline).
- Motion: spring-based, interruptible, purposeful. Shared presets live in `src/ui/motion`.
  Page transitions, layout animations, staggered reveals, satisfying press states.
- Accessible: keyboard reachable, visible focus, WCAG AA contrast in both themes, touch targets
  at least 44px. Colour is never the only signal (cube colours are also labelled where it matters).
- Responsive from a 360px phone to a desktop; tablet is the primary target.

## Persistence (`src/store/`)

- Everything saves automatically to localStorage through zustand `persist`: settings, the current
  cube state per context, lesson progress and position within a lesson, timer history, XP,
  badges, streaks, the in-progress real-cube entry.
- Every store is versioned with a `migrate` function. A corrupt save must never crash the app.
- Export/import of one JSON backup file, and a guarded "reset everything".
- A reload at any point returns him to exactly where he was.

## Features

1. **Learn** — a map of the 8 stages (locked/unlocked/complete). Each lesson: idea → animated
   demo → guided "your turn" on a cube set up for that stage, with goal detection → drills on
   random cases until reliable. Mnemonics and finger hints for every algorithm.
2. **Notation trainer** — see a move, do it; later the reverse. Scored, short rounds.
3. **Algorithm cards** — every algorithm looping on a mini cube, with a "practise" jump.
4. **Solve my cube** — paint the 54 stickers on a flat net (and see it on the 3D cube), validate
   with clear messages, then walk the beginner-method solution stage by stage with play/step
   controls. Toggle for the shortest (Kociemba) solution.
5. **Where am I?** — from any cube state: what is done, what is next, relevant pieces highlighted.
6. **Timer** — hold to start (space/touch), scramble, optional 15s inspection, ao5/ao12, personal
   bests, history, improvement chart.
7. **Progress** — XP, levels, badges, daily streak, daily challenge.
8. **Patterns** — gallery of fun patterns, each playable on the cube; a Flags tab (21 flags with verified sequences, some from a rotated start with a "how to hold it" line) and a "Make your own" designer that searches the moves for any painted face.
9. **Play** — free cube with scramble, undo/redo, reset, solve-hint.
10. **Settings** — theme, sound, motion, turn speed, backup, reset.

## Waves

| Wave | Agents (parallel within a wave) |
|---|---|
| 1 | Engine core · Design system + app shell + stores |
| 2 | 3D cube + Play page · Stage detection + beginner solver |
| 3 | Learn · Notation + Algorithms + Patterns · Solve my cube + Where am I · Timer + Progress + Home + Settings |
| 4 | Independent reviews: design (from screenshots), code, QA (e2e tests), kid's-eye walkthrough |
| 5+ | Fix what the reviews found; re-review. Repeat until the reviewers and the lead are proud. Then PWA/offline. |

## Definition of done

- `npm run build` passes with no type errors; `npx vitest run` is green.
- Playwright smoke test visits every route in both themes with no console errors.
- Solver test: thousands of random scrambles all end solved.
- Reload mid-lesson, mid-solve and mid-entry restores the exact state.
- Screenshots of every page in light and dark look deliberate and polished on tablet and phone.

## Working rules for agents

- Verify your own work: build, run tests, and for UI work take Playwright screenshots and look
  at them. Report what you verified and what you could not.
- Do not leave stubs, TODOs or placeholder copy in what you own.
- Do not run `git` commits. Do not start long-lived dev servers without stopping them.
- Final report: what you built, the public API others depend on, anything you changed outside
  your directories, and known gaps.
