# Rubikku — whole-codebase code review

Read-only review of `src/` (store, cube-adjacent UI, three, ui, app, all features). `npx tsc -b` is clean. `npx oxlint` gives warnings only; the three "refs/immutability during render" warnings were checked and are false positives or benign. No browser was run (per instructions), so UI consequences are derived from code plus engine-level scripts.

"Confirmed (script)" = throwaway vitest script against the real modules, kept under
`/tmp/claude-31381/-home-sujay-narayana-thoughtspot-com-rubikku/5df0888d-3ec6-412a-9841-6aab1967a4ad/scratchpad/review-code/{lead,solve,misc,three}/`.
Paths below are relative to the project root.

Counts: **3 Blockers, 17 Majors, 38 Minors.**

---

## Blockers

### B1. Drills tell the kid his correct moves broke the cube ("Stage 1 (The daisy) has come undone")
- **Where:** `src/features/learn/player/panels.tsx:296-297, 349-356` (`broken` from live `analyzeCube(state)`); same root cause in the capstone tracker `src/features/learn/FullSolve.tsx:82-83, 200-234`.
- **Wrong:** `broken` is computed after every single move. Every algorithm from stage 3 on temporarily disturbs earlier layers, and `twistInProgress` only covers part of the corner twist. So one correct move into an algorithm, a red banner says an earlier stage "has come undone. Undo your last moves, or tap Hint and it will lead you back".
- **Scenario:** middle-layer drill, he does `U R` of `U R U' R' U' F' U F`. Banner: "Stage 1 (The daisy) has come undone. Undo your last moves…". If he obeys he can never finish any algorithm. In the capstone the tracker drops to "Stage 1 · The daisy" in the middle of every algorithm.
- **Confirmed (script):** following the solver's own steps on 10 drills per stage, the banner shows on the correct path in 46/81 white-corner steps, 44/72 middle-layer, 17/17 yellow-cross, 12/29 yellow-edges, 13/22 corner-position, 26/38 corner-orient steps (e.g. after the first `R'` of the corner twist). Daisy and white-cross are unaffected.
- **Fix:** only evaluate "broken" at rest points: compare against the state at the last step boundary, or suppress while the moves since the last boundary are a prefix of a known algorithm for the stage / while `followPath` against the solver step is on-path. Same for the capstone tracker (hold the last boundary's stage while inside a step).

### B2. Hints re-solve from a half-done step: a half turn gets "undo it", a slip restarts from the daisy
- **Where:** `src/features/learn/player/coach.tsx:50-67` (drills, free guided beats, capstone) and the independent copy in `src/features/play/PlayPage.tsx:147-160`. Also the Hint button itself when pressed mid-algorithm (`coach.ask` → `nextHint(state)`), which B1's banner explicitly invites.
- **Wrong:** progress is `algStates(step.before, step.moves).lastIndexOf(state)`. A drag or key press makes a quarter turn, so the first half of any `X2` is "off the path" and the effect immediately calls `nextHint` on the half-done state. The solver is only valid at step boundaries.
- **Scenario 1 (every white-cross step ends in `F2`):** hint says `F2`; he turns F once; the card flips to "Stage 1 · The daisy — White edge in the middle layer [F′]" with an arrow for F′; he follows it, and the hint is `F2` again. Loop.
- **Scenario 2:** one wrong layer in the middle of a corner insert and the hint silently becomes a daisy rebuild instead of "undo that".
- **Confirmed (script):** learn drills: 159 half-turn mid-states, 82 give a hint other than "finish the turn", 77 point at an earlier stage; 1311 of 1339 one-wrong-move mid-step states re-hint to an earlier stage. Play (300 scrambles): every solve has double turns (avg 10.3); in 608 single-move `X2` steps the re-hint after one quarter was exactly `X′`; 76% of mid-step states regress, costing 33 extra turns on average.
- **Fix:** one shared follower for hints (the guided beats already have the right one: `followPath` in `src/features/learn/engine.ts:382`, with `half`/`off`/`wrong`). Never call `nextHint` while inside a step: on `off > 0` show "undo that turn" (arrow = inverse); only re-hint on an explicit Hint press from a boundary, or after undoing back to one.

### B3. The Home page's daily challenge is a stub that can never be completed
- **Where:** `src/store/daily.ts:1-5` ("These are placeholders… feature agents wire up completion"), `src/features/home/HomePage.tsx:211-242`, `src/store/badges.ts:57` (`daily-5`), `src/features/progress/ProgressPage.tsx:283`.
- **Wrong:** nothing in the codebase ever sends `daily-challenge-completed`, and none of the seven challenges ("cross in under 60 s", "first layer, no hints", "three timed solves"…) is measured anywhere.
- **Scenario:** every day Home offers "+50 XP · Take it on". He does it; nothing happens; the card never shows "Done today"; the "Daily Driver" badge sits at 0 of 5 and the "Dailies" stat at 0 forever.
- **Confirmed:** grep of every `reward(` / `recordEvent(` call site.
- **Fix:** implement completion per challenge (several map onto existing events: 3 timed solves, new pattern, real-cube solve, notation speed round), or remove the card, badge and stat until it exists.

---

## Majors

### Learning flow and rewards

**M1. Home sends a brand-new user to stage 1, skipping the primer; mid-primer it still says "Start stage 1".**
`src/features/home/HomePage.tsx:63-84` uses `useLearningPath` (`src/store/hooks.ts:72`), which knows only the eight stages; the primer and capstone live in `src/features/learn/path.ts`. Fresh user: Home → `/learn/daisy`, Learn → `primer` (script: `buildPath({}, {}, …).next.id === 'primer'`). With all eight done Home says "You know the whole method" while Learn says the full solve is next. Fix: one path source (move primer/capstone completion into the progress store, or have Home read the learn path).

**M2. One tap on "Wrap-up" completes any lesson, including locked ones.**
`src/features/learn/player/SectionStepper.tsx:24` jumps to any section; `LessonPlayer.tsx:228-232` completes the lesson on reaching the wrap beat; "Skip" (`:477`) does the same more slowly. Eight taps = 960 XP, all stage badges, "full-method", every stage green, capstone unlocked, nothing learned. By reading. Fix: complete only when the guided beats are done (`save.done`) or at least one drill is solved; limit the stepper to `furthest`.

**M3. Demo "Play again" stalls after one move.**
`src/three/controller.ts:368-376` drives the view before the view has received the new state; the next render snaps and cancels the run. Affects every finished `PlaybackBar`, Play after touching the cube mid-demo, and `PatternDetailPage.tsx:123,132`. Kid sees the cube jump to move 1, the button stuck on Pause, nothing moving. Confirmed (harness wiring the real controller and view): ends at `position 1, playing true, busy false`. Fix: sync the view (`setStateInstant(session.state)`) at the top of `drive()`; verified in the harness.

**M4. Playback stays "playing" when the view interrupts a run.**
`src/three/controller.ts:471-472` returns without clearing `playing`. Grabbing a layer during a demo leaves Pause showing and Play a no-op until pressed twice. Confirmed (harness, timing-dependent). Fix: on `!ok && token === this.playToken` set `playing = false` and commit.

### Solve my cube

**M5. "Fix the colours → carry on" and the beginner/fastest toggle re-solve from a mid-step state.**
`src/features/solve/SolvePage.tsx:164-192`. Mid-algorithm, either path restarts the plan from a half-done cube: tracker back to Daisy, 30+ turns that undo finished layers on his real cube. Numbers from B2; path by reading. Fix: if the re-entered cells equal the expected state, restore the old walk and position; only switch modes at step boundaries or keep the old position.

**M6. "Where am I?" from inside a walk shows the original cube, and "Solve it with me" restarts from it.**
`SolvePage.tsx:400, 424`. Sixty turns in, every instruction is for a cube he no longer has. By reading. Fix: pass `walkState` and offer "Carry on".

**M7. `real-cube-solved` (+80 XP, "real-deal" badge) is granted for the pretend cube and is farmable.**
`src/features/solve/solveStore.ts:191-195, 211`: any sticker tap, even a no-op, clears `demo` (confirmed by script). `solveStore.ts:233` resets `rewarded` on each `startWalk`, so "Back a turn → Fastest way → Next" re-fires it; held Space runs a whole walk (`SolvePage.tsx:218-222`, no `event.repeat` check). Fix: clear `demo` only when cells change; key `rewarded` to the entered cube.

### Play

**M8. Hints begin with a whole-cube turn that cannot be made by touch.**
`src/features/play/PlayPage.tsx:133-144, 290-298`. `nextHint` on an upright scramble returns `hold ['z2']` (script; 12 hold steps per solve on average). On a tablet only "Show me" advances. Fix: auto-apply hold steps or add a "Turn it for me" button (lessons already have `TurnCubeButtons`).

**M9. Play's solved detection misses real solves and fires on fake ones.**
`PlayPage.tsx:70-96`. If the last move comes from "Show me" or redo there is no celebration or reward, and `scrambled` stays true so a later `R R′` earns `solve-completed`. A cube mixed by hand and solved is never celebrated. By reading. Fix: detect unsolved→solved on `state`; clear the flag whenever solved.

### Timer

**M10. A 3-second test press sets the all-time best for good and unlocks every speed badge.**
`src/features/timer/TimerPage.tsx:46-66`, `logic/solves.ts:35`, `src/store/progressLogic.ts:258-272`. Stop at 4.1 s on first try: first-solve +100 XP, sub-5/3/2/1 badges, best 4.10 that deleting or DNF-ing the solve does not undo. Start/stop every 4 s farms 40 XP. Escape while running records a solve (`useTimerEngine.ts:116-122`). By reading. Fix: realistic floor for XP/badges/best; recompute best on delete and penalty change; Escape abandons.

### Other features

**M11. Flash-card quiz marks an equally valid answer wrong.**
`src/features/algorithms/logic.ts:110-128` only de-duplicates identical move strings. `sune` vs `yellow-edge-swap` and `right-trigger` vs `white-corner-right` differ by a turn of the top (script). Fix: exclude distractors that solve the card's case up to a U turn.

**M12. "Notation Master" cannot be earned from any level round.**
`progressLogic.ts:297` needs `total >= 20`; levels have 8–12 questions (`src/features/notation/logic/levels.ts:31-36`) and `NotationPage.tsx:362` sends questions, not moves. Only a flawless 20+ speed round qualifies. Fix: send moves, or reword the badge.

**M13. Algorithm practice pays unlimited XP and floods the activity feed.**
`src/features/algorithms/AlgorithmDetailPage.tsx:106-107`. "Petal Drop" is `F2`: two key presses per XP, a log row each, streak kept alive by two key presses. Fix: repeat XP once per algorithm per day; do not log repeats.

**M14. After a failed page-chunk load, "Try again" can never work.**
`src/app/ErrorBoundary.tsx:41` with `lazy()` in `src/app/routes.tsx:5-20`: React caches the rejected import. After a flaky connection or a redeploy the error page stays until a manual reload. By reading (standard `React.lazy` behaviour). Fix: retrying loader, or reload on import errors.

### Persistence

**M15. Two tabs overwrite each other's progress.**
`src/store/persist.ts:181-202`: no `storage` listener anywhere (grep). Each tab writes its whole in-memory store on any change. Timer open in tab B earns XP; any event in stale tab A writes the old `rubikku:progress` back; B's XP, badges and streak are gone on reload. Same for timer history and lesson position. By reading. Fix: on `storage` events for `rubikku:*`, call `store.persist.rehydrate()`.

**M16. Saving can fail silently, and import is destructive before it is safe.**
`persist.ts:79-85` swallows quota errors with no signal, so he plays on and loses everything at reload. `src/store/backup.ts:97-114` resets and clears all stores before writing; a write failure part-way leaves a half-restored app, and `src/features/settings/SettingsPage.tsx:305-337` ignores `restored` and has no `catch`. Corrupt saves are also copied to `:corrupt` keys (up to 200k chars each) that count against quota. By reading. Fix: surface a one-time "couldn't save" toast; snapshot the old keys and roll back on any failed write; report partial restores.

**M17. Lesson and capstone cubes are thrown away on reload after 600 moves.**
`src/three/controller.ts:259-270` trims history by moving `session.start`; `LessonPlayer.tsx:82` and `FullSolve.tsx:32` only restore when `saved.session.start === start`. A long capstone attempt resets to the scramble on reload; "solved in N moves" is also capped. By reading. Fix: store the scramble id with the session and compare that, not `start`.

---

## Minors

### Persistence and data
1. `backup.ts:58` — the 5 MB check runs after `file.text()` has read the whole file (`SettingsPage.tsx:305`). Check `file.size` first.
2. `timerStore` solves capped at 2,000, entry history 120, play history 600, progress log 60, activity 400 days — fine; nothing writes per frame. No action; recorded so nobody re-checks.
3. Hand-edited `fastest` for a different `start` in `rubikku:solve` passes sanitize and ends on "Solved!" plus the reward (`walkthrough.ts` has an unused `endsSolved()`).
4. `src/three/view.ts:378-385` → `model.ts:246-250` — a non-state string passed straight to `<Cube3D state>`/`<MiniCube state>` throws in a layout effect (confirmed: `setState('hello')`). `useCubeController` sanitises; direct users do not.
5. Theme/motion changed in one tab is not reflected in another (same root as M15).

### Cross-feature inconsistencies
6. Two `describeMove`s disagree: `src/ui/moves.ts:47-55` says "Up face"/"Down face"/"Turn the whole cube on x"; `src/cube/notation.ts:376` says "Top face"/"Bottom face"/"Whole cube, clockwise (like R)". A chip tooltip and the Solve panel name the same move differently (confirmed over all 54 moves). UI `parseMoveToken("R3")` is invalid where the engine reads `R′`. Delegate to the engine.
7. Three "follow a step" implementations: `followPath` (learn guided, state-based, handles halves), `followMove` (`src/features/notation/logic/follow.ts`, index-based, handles halves, shared by notation/algorithms/patterns), and `lastIndexOf` (coach + play, no halves — B2). Collapse to one.
8. Stage ids/titles are duplicated in `src/store/stages.ts`, `src/cube/stages.ts` and each lesson file. They agree today; nothing enforces it.
9. Home path strip renders locked stages as non-links (`HomePage.tsx:166`) while Learn allows "Peek ahead".
10. `solve-completed` context `'guided'` is declared and never sent (Solve sends `real-cube-solved`). Dead union member.
11. Finishing the primer is logged as "Bonus" (`progressView.ts:153`, `custom` event).
12. Capstone: "Start again" after solving leaves `solved: true` (`FullSolve.tsx:72-75`) — scrambled cube under a "Solved" badge with hints disabled.
13. Capstone/drill "Show me" plays every hinted step, so a full "solve" (first-solve badge, +130 XP) needs no turns by hand. Probably intended; decide.

### Solve / play / timer
14. `SolvePage.tsx:152-158` sets `rewarded` before the 380 ms timeout; leaving inside the window loses the reward.
15. Inspection-timeout DNF is stored with `ms: 0` (`logic/machine.ts:131,143`); the pad then offers OK/+2, giving a 0.00 or 2.00 "Best".
16. "New personal best" stays on the pad after the solve is changed to +2 (`TimerPage.tsx:117`).
17. `SolvePage.tsx:70` runs `checkCube` in render on every paint; a full invalid cube costs 50–60 ms in Node (about 1,100 swap trials in `checkModel.ts:87-127`). Defer or debounce.
18. Guided entry grid is colour-only on painted stickers (`EntryPanel.tsx:179`); red vs orange is the classic slip. Add the letter.
19. Full cube + "Face by face" (`SolvePage.tsx:76-79, 236`): grid without the tilt instruction; reload flips back to "Whole cube".
20. `#/play?lab` (CubeLab) and `#/kitchen-sink` (736-line showcase, in `ROUTE_PATHS`) ship in production; `src/app/StubPage.tsx` is dead code.

### Notation / algorithms / patterns / settings
21. Mastery can be gamed by switching to "Memory" for the last move (`AlgorithmDetailPage.tsx:101`).
22. `notation/logic/explain.ts:29-31` says "Your second turn went back again" for any wrong second quarter, not just the inverse.
23. Help arrow keeps showing `R2` after a first quarter of `R′`, when only `R′` again is accepted (`NotationPage.tsx:381`, `AlgorithmDetailPage.tsx:147`, `PatternDetailPage.tsx:192`). Unconfirmed.
24. `notationStore.ts:184-190` records the wrong move as missed when it appears earlier in the sequence; hinted answers always blame the first move.
25. `NotationPage.tsx:306` — `quit` does not clear pending answer timers.
26. Pattern "real cube" mode rewards on an honour button (`PatternDetailPage.tsx:444`): 120 XP and both pattern badges with Space and "Yes". Decide.
27. `SettingsPage.tsx:220` — Animations control still writes when the OS forces reduced motion, with no visible effect. `:430` has a ternary with identical branches.

### Three / UI
28. `controller.ts:218-222` — `attachView(null)` cancels runs without committing; `busy`/`playing` stay true (confirmed in harness; no affected page found).
29. `MiniCube.tsx:132-143`, `miniRenderer.ts:86-119` — animating minis re-render every frame during holds and after a non-looping run ends; cost on the patterns gallery. Unconfirmed.
30. `miniRenderer.ts:62,132` — a stale `webglcontextlost` event can dispose a newer shared renderer (self-heals).
31. `Cube3D.tsx:488-492` — pointer-up handlers are dropped when input turns off mid-gesture; on touch every later touch is treated as a pinch until remount. `releaseAllPointers()` exists and is never called. Unconfirmed.
32. `turns.ts:239-268` — Alt+letter wide turns read `event.key`; on macOS Option+letter is another character, so the documented keys do nothing. Use `event.code`.
33. `view.ts:1228-1241, 634` — a pending camera tween never resolves on dispose; `setPose` during a peek is overridden.
34. SVG fallback (`Cube3D.tsx:512-519`): pointer input still hits the invisible 3D geometry, which does not line up with the drawn cube.
35. `sound.ts:28-45` — `AudioContext` is created outside the unlocking gesture; likely silent or bursty on iOS, and `'interrupted'` is not handled. Needs a real iPad.
36. Small primitives: `HoldButton.tsx:52-63` is one-shot (latent); one Escape closes all stacked Modals (`Modal.tsx:57-62`); `AnimatedNumber.tsx:22-45` flashes the final value first; `Tooltip.tsx:76` puts `aria-describedby` on the wrapper; `Tabs.tsx:76,144` unreachable by keyboard when `value` matches nothing; `optimalSolver.ts:36-48,119-129` has no fallback if `new Worker()` throws, no timeout, unhandled rejection from `void warmUp…`.

### App shell, accessibility, production
37. `AppShell.tsx:53` scrolls to top on every navigation, including Back. No `document.title` per route, and focus lands on an unlabelled `<main>`. `aria-label` on role-less spans is ignored (`PlayerStatus.tsx:16`, `AlgorithmDetailPage.tsx:343`, `PatternsPage.tsx:47`, `RoundPanels.tsx:217`); the radiogroups in `Hub.tsx:43` and `SettingsPage.tsx:106` have no arrow keys.
38. Production: `vite-plugin-pwa` is installed but not in `vite.config.ts` — no service worker or manifest, so the "works offline" requirement is unmet while `index.html` advertises `apple-mobile-web-app-capable`. Home lazy-loads the 980 kB three chunk straight after first paint (not eagerly; acceptable, but every Home visit pays it). Font subsets for Cyrillic/Greek/Vietnamese are emitted (unicode-range, harmless).

---

## Checked and fine (so nobody re-checks)

- **Backup with lazy stores:** export reads `rubikku:*` keys from localStorage, so stores whose page was not opened this session are included. Import writes all keys; loaded stores rehydrate without a reload, unloaded ones read the new data when their chunk loads. Reset clears the whole namespace. An imported theme applies immediately.
- **Every store** (settings, progress, learn, play, solve, timer, notation, algorithms, patterns, trophy-room) goes through `createPersistedStore` with version, migrate and a sanitize; unparseable JSON is quarantined; hostile `rubikku:solve` and 16 malformed cube sessions did not throw.
- **Bad URLs:** `#/learn/garbage`, `#/algorithms/nope`, `#/patterns/nope` render not-found states; every `to=` target resolves to a real route and id.
- **Streak/date logic:** calendar-day arithmetic in UTC fields; DST and clock-backwards cases are handled; the day rolls over via `useToday`.
- **Main-thread cost:** `drillState` 2–10 ms, all beats of a lesson cold 2–23 ms, the Learn map 8 ms, `nextHint` < 1 ms, `solveBeginner` about 2 ms.
- **Three:** StrictMode double mount, disposal of geometries/materials/textures, single shared mini WebGL context, no per-frame store writes, no animation drift from engine state.
- **`window.__rubikku`:** entries removed on unmount; only acts if called from the console. Harmless.
- **`new Function` cubejs loader:** runs only inside the lazy worker; no CSP in `index.html`.
- **Timer maths and machine:** `performance.now`, key-repeat ignored, +2 applied once, DNF handling in ao5/ao12, chart safe with 0/1/all-DNF solves, listeners and rAF cleaned up.
- **No double rewards under StrictMode in production paths** (notation round, play, timer, lesson completion).
- **Lint "refs during render" warnings** (`useCubeController.ts:143`, `Cube3D.tsx:135,183`, `useCubeQueue.ts:25`, `PatternsPage.tsx:69`): false positives or benign.
