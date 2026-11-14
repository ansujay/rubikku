# Rubikku — exploratory QA report 2 (new build)

**Build under test:** frozen snapshot `…/scratchpad/snap2/dist`, served with the threaded `serve.py` on port 4263 (stopped at the end). Source was only read (PLAN.md, `src/three/README.md`, `e2e/`, a few `src/` files to confirm wording and the 10 s record floor). Nothing was built or modified.
**Baseline:** `reviews/qa-report.md` (build snap1).
`S2` below = `/tmp/claude-31381/-home-sujay-narayana-thoughtspot-com-rubikku/5df0888d-3ec6-412a-9841-6aab1967a4ad/scratchpad/review-qa2`. Evidence: screenshots in `S2/shots` and `S2/solve/shots`, logs beside the scripts.

**Rig notes.** The machine was loaded by other jobs for most of the session (load 13–40), so timings are slow. I stayed at two browsers except for about one minute when a third (`takeover2.mjs`) ran beside the journey and one other run; nothing failed because of it. A few of my own scripts were wrong, not the app. These are not bugs: a first-draft journey that skipped the "five in a row" rounds; net taps in whole-cube entry (they now open the face instead of painting); the phone "More" sheet (it covers the tab bar, so the Timer tab cannot be tapped under it).

## Summary

| Severity | New findings | Notes |
|---|---|---|
| Blocker | 0 | None found. The whole path Home → primer → 8 lessons → full solve completed in one session. |
| Major | 2 | N1, N2 |
| Minor | 10 | N3–N12 |
| Unconfirmed | 3 | UC1–UC3 |

Earlier findings: of the 5 Majors, 4 are fixed (L1, L2, L3, S4) and 1 is still present (S1). Of the Minors, S5, L4, P5 and P6 are fixed; S2, S3, P1, P2(?), P3, P4, X2 and X3 are still present or changed. See the re-check table.

Majors, one line each:
- **N1** — Solve my cube, walk screen at 1024x768 landscape: the primary **Next** button sits below the fold on 11 of 12 steps (y 743–841 in a 768-high window), so a child has to scroll to find it on almost every step.
- **N2** — Solve my cube, guided entry: when the first impossible piece is detected the view jumps to another face under his finger, and his next tap paints a wrong sticker there. A face entered with a swapped pair gives an extra wrong sticker.

## The core promise, as a kid (priority 1)

One browser context, fresh storage, 1024x768, touch emulation, no seeding. Script `S2/journey.mjs`, log `S2/run2/out.txt`, screenshots `S2/shots/j-*.png`. Home hero → "Start here" went to `#/learn/primer` and every wrap-up's "next" button went to the next lesson (M1 fixed).

| Stage | Screens | Own turns (finger drags unless noted) | Result |
|---|---|---|---|
| Primer | 15 | 10 | +100 XP, First Steps badge |
| 1 Daisy | 18 | 22 | Stage badge; "Turn it" button works (L1 fixed) |
| 2 White cross | 14 | 24 | Level 3 takeover came up on the "Now on your cube" step |
| 3 White corners | 24 | 117 | Level 4 merged into the stage moment |
| 4 Middle layer | 19 | 161 | |
| 5 Yellow cross | 15 | 77 | |
| 6 Yellow edges | 15 | 82 | Level 5 takeover |
| 7 Place the corners | 17 | 90 | |
| 8 Final twist | 19 | 100 | "All eight stages" takeover |
| Full solve (capstone) | 1 screen | 198 turns, 114 hints | Solved. Run in a second session with the eight lessons seeded as complete (`S2/cap2.mjs`) because my first capstone loop looked for the now-strip, which the capstone does not have. |

- **Totals for the lessons:** 156 screens (15 + 141), 683 finger drags and 0 keyboard turns, 330 other taps; 101 wrong quiz answers (my script cycles answers blindly, so this is not a signal). Final state after stage 8: 1,500 XP, 10 stage/level badges plus `full-method`. Wall time 87 minutes under heavy load, 5 to 17 minutes per lesson. The capstone adds roughly 200 turns and 16 minutes of script time.
- **No point where he is stuck, none where the screen's instruction disagreed with the cube, and no right action rejected** (the script flags a strip move that fails three times; none did).
- **Every exercise type completed:** demos, goal before/after, "Which is it?" quizzes, "five in a row" (all five rounds), guided full / names / none, drills (hints are fine), "Now on your cube" confirm, wrap-ups. Each wrap-up showed no to-do list and awarded its badge.
- The deliberate wrong move `D` in the daisy and final-twist `try-1` is *not* flagged, because those exercises judge by result and `D` kept the cube sound. Not a bug. Wrong moves in explicit-algorithm exercises were flagged every time ("That was D, not the next move… Undo that"), and "Undo that" cleared them.
- Celebration events captured (`window.__cheers`): 19 moments and 4 takeovers over the lessons. None fired twice, none blocked a tap (330 taps, no interception), none was the wrong size. Moment cards were 461x123 at the top of the content column (they slide in from y = -5). Takeovers covered the content column (240..1024) on the tablet and the whole screen on a phone (checked: `S2/shots/phonecel.png`).

## Re-check of the earlier report

| ID | Earlier | Now | Evidence and repro |
|---|---|---|---|
| L1 | Major: "Turn the cube" on the daisy's first exercise crashes | **Fixed** | Daisy `hold` beat by "Turn it" on touch: success message, no error page. 1 journey run + 1 reload run. `shots/j-daisy-hold-start.png` |
| L2 | Major: camera angle never reset between screens | **Fixed** | After an orbit drag, pose returned to `{0.62, 0.5}` on every later screen (`pose.mjs`, 2 variants). |
| L3 | Major: dimmed stickers look alike, centres included | **Fixed** | Centres stay lit and the dimmed stickers are pastel and distinguishable. `shots/j-white-corners-02-home.png`, `hintfold-middle-layer.png` |
| L4 | Minor: hint moves below the fold | **Fixed** | Hint card and strip fully in view at 1024x768 on white-corners, middle-layer `try-3` (hints now show on the card and in the "now" strip). Note the page scrolls when the card opens. |
| S1 | Major: turned/mirrored face gives many unrelated cards, no fix | **Still present** | rot90 and rot180, cubes 0 and 1: 4 cards each, all `impossible-piece` / `duplicate-piece`, no fix button. 4 of 4. `solve/out-m-rot90-*.json`, `rot180-*.json` |
| S2 | Minor: solution turns a face and straight back | **Still present** | 3 of 3 cubes: `U U`, `F′ F`, `U2 U′`, `U′ U′` etc. (2, 4 and 5 adjacent pairs). `solve/seq-log.txt` |
| S3 | Minor: wrong centre gets two messages and no fix | **Still present** | 2 of 2 (`centre` 0 and 1): "10 red and 8 green" plus "Two middles are red", no fix button. |
| S4 | Major: last tap of guided entry paints a ghost sticker (touch) | **Fixed in the cases tried; a related bug found, see N2** | `ghost.mjs` touch clean/slip and mouse clean: cells equal the intended cube (3 of 3); the touch's `click` no longer lands on the net. The net no longer paints on tap. |
| S5 | Minor: two "Back" buttons on guided entry | **Fixed** | Only "Back face" is named Back (`xchecks.mjs`). |
| P1 | Minor: flash-card quiz resets on reload | **Still present** | Reload at question 4: "1 / 6" with different cards (2 of 2 runs, `persist-log.txt`). |
| P2 | Minor: each lesson reload adds "Started a lesson" | **Not re-confirmed** | My counter read 0 rows before and after three reloads; the activity-feed row name may differ. Not reached further. |
| P3 | Minor: algorithm/pattern/search lose place on reload | **Partly checked: search still clears** (2 of 2). Watch step and pattern playback not re-run. |
| P4 | Minor: transient panels and timer attempt dropped | **Still present (timer part)** | Reload while the timer runs: back to idle, 0 rows, no message (1 run now, 2+ before). Hint card was not re-checked. |
| P5 | Minor: primer auto-animation replays on top of saved cube | **Fixed** | Primer "Centres never move": same cube after reload plus settle (1 run). |
| P6 | Minor: unknown algorithm/pattern id has no h1 | **Fixed** | `/algorithms/nope`, `/patterns/nope`, `/algorithms/__proto__` each show an h1. |
| X1 | Minor: where-am-I lesson link opens "peeking ahead" | **Not re-checked** (needs a staged cube; not reached). |
| X2 | Minor: touch targets under 44 px on phones | **Still present** | 390x844, 12 routes: Learn "Open" 35x20, stage dots 39x36, algorithm card stage link 161x20, cube toolbar buttons 40x40, "Rubikku home" 99x27, etc. `xchecks-log.txt` |
| X3 | Minor: focus falls to BODY after Next | **Still present** | 4 of 4 Enters on Next leave focus on BODY. In the keyboard primer, every guided screen needs 24 Tab presses to reach the cube and 2–6 to reach Next. `kbprimer-log.txt` |
| B1 | Banner "has come undone" mid-algorithm | **Fixed** | 4 drills followed move by move (white-corners 52 moves, yellow-cross, yellow-edges, yellow-corners-position): 0 banners (`b12-log.txt`). Also none in the 8 journey drills. |
| B2 | Hint flips to the previous stage mid-corner | **Fixed** | Same runs: no stage flip. |
| M1 | Home sends a new user to stage 1 | **Fixed** | Hero goes to `#/learn/primer`. |
| M9/M10 | Play solved by hint gives no reward; timer test press earns badges | **Changed** | A Play solve now rewards (+130 XP, First Solve takeover). Timer: a 5.4 s and a 6.2 s press are "too quick to count", but an **11.5 s press still awarded 5 badges and 140 XP** (record floor is 10 s). `consist-log.txt` |
| U1 | Final-twist demo stops at 22 of 27 | **Not reproduced** | All demos played to the end in the journey. |
| U2 | Wrong-type backup accepted as-is | **Not re-checked** | |
| U3 | Corrupt settings not rewritten | **Not reproduced as a bug** | `turnSpeed: null`, `showFaceLabels: 7`, `theme: 12`: `/play`, `/settings`, primer render, an R move works, no errors. Whether the value is rewritten was not checked. |
| U4, U5 | Reduced-motion and theme-diff pixels | **Not re-checked** | |
| U6 | Escape sometimes does not close keyboard help | **Not reproduced** | 3 of 3 closed, focus returned to the "Keyboard moves" button. |
| U7 | Phone More sheet then Timer tab does nothing | **Explained, not a bug** | The sheet covers the tab bar; the point under the finger is the sheet. |
| U8 | Double-tap on "Next face" skips two faces | **Not reproduced** | 0 of 3 on an empty face (the button does nothing there). A filled face was not tried. |
| U9 | Milestone copy "1 of 8 done… 6 to go" | **Not re-checked** | |

## New bugs

### Solve my cube

#### N1 — Major — On a landscape tablet the walk's Next button is below the fold on almost every step
- **Repro rate:** 3 of 3 runs (`solve/walk2.mjs spam`, `solve/tapnext.mjs`, `solve/fold.mjs`).
- **Steps:** 1024x768, touch. Open a walk (guided entry, or seed `rubikku:solve` with a `phase: 'walk'` cube, `solve/fold.mjs`). Look at the screen without scrolling.
- **Expected:** the one primary action ("Next") is in view on every step, or a sticky bar keeps it there, as in the lessons.
- **Actual:** Next spans y 765–821, 757–813, 743–799, 785–841, … for 11 of the first 12 steps; the window is 768 high, so at best the top edge shows. No cue says to scroll. A coordinate tap at the button does nothing (my first spam run read "index 0/135" after 55 taps for this reason). At 768x1024 (y 587–821 of 1024) and 1366x1024 (881–937 of 1024) it is in view.
- **Evidence:** `S2/solve/shots/walk-fold.png`, `S2/solve/fold.mjs` (output: Next y-range per step, quoted above), `S2/solve/spam-log.txt`.

#### N2 — Major — Mid-entry the view jumps to another face and the next tap paints a wrong sticker
- **Repro rate:** 2 of 2 (`solve/mistakes.mjs swapSame 0`, `solve/ghost3.mjs` twice). Needs a face entered with a slip.
- **Steps:** `/#/solve`, touch, guided face-by-face entry of cube `R U F' L2 D B' R2 U' F D2 L' B U2 R' F2 D' L U B2 R`, entering the front face with its first two stickers swapped, then continue with L and D as normal. On the bottom face, paint seven stickers.
- **Expected:** the face he is painting stays on screen until he leaves it. A slip is shown as a card, not by moving the grid.
- **Actual:** after the seventh bottom-face sticker the entry mode flips from `guided` to `free`, the grid switches to the Front face and the screen scrolls (the `pointerup` target is the panel, not the cell). The eighth tap, meant for the bottom face, lands on the Front grid and paints facelet 24 with the current brush (U→B). Final cube differs from the real one by three stickers (`18:D>U 19:U>D 24:U>B`), one more than he typed wrongly.
- **Evidence:** `S2/solve/ghost3-log2.txt`, `S2/solve/shots/ghost3-before-last-tap.png`, `S2/solve/out-m-swapSame-0.json`. This is the same family as old S4 but a different trigger; the old S4 case itself is fixed.

### Lessons

#### N3 — Minor — The "Now on your cube" confirm button is below the fold with only "Later" visible
- **Repro rate:** 4 of 4 measurements (`realfold.mjs`).
- **Steps:** any lesson's real-cube step at 1024x768 (confirm at y 928–1047 of 768), 768x1024 (1133–1197 of 1024), 390x844 (1066–1130 of 844).
- **Expected / actual:** the check list and "I've done it" button are hidden below the panel's visible edge with no scroll cue; the only visible action on the bar is "Later →". The stage can still be earned through a drill, so he is not blocked.
- **Evidence:** `shots/realfold-daisy-1024.png`, `j-yellow-edges-14-cube.png`.

#### N4 — Minor — On the white-corners quiz at 1024x768 the 4th answer is hidden behind the Back/Skip bar
- **Repro rate:** 2 of 2 (`shots/j-white-corners-quiz-fb.png` earlier screen, `quizfold.mjs`).
- **Actual:** options at y 497–559, 567–629, 637–699 and 707–769; the bar starts at 708, so option 4 is under it and unreachable without scrolling. The daisy quiz fits.

#### N5 — Minor — The "3 / 18" counter in the Back/Next bar wraps onto three lines on the tablet
- **Repro rate:** every lesson screenshot at 1024x768 (`j-daisy-hold-start.png`, `j-white-corners-02-home.png`, `j-primer-14-cube.png`).
- **Actual:** the counter reads "3 /" over "18" (and "14 / / 15" in the narrowest case). Cosmetic.

#### N6 — Minor — The level-up line reads "You're a Apprentice now"
- **Repro rate:** 1 of 1 in the journey (`out.txt`, level 5 takeover) plus the template in `src/app/rewards.ts:148,185` (`You’re a ${levelTitle(level)} now`).
- **Expected:** "an Apprentice". The same template fits every other level name.

### Celebrations

#### N7 — Minor — The milestone takeover is `aria-modal` but focus is not held in it
- **Repro rate:** 2 of 2 (`takeover2.mjs tab`, `tab2`).
- **Steps:** solve the Play cube (First full solve). "Keep going" has focus. Press Tab.
- **Expected:** focus stays in the dialog until it closes.
- **Actual:** the first Tab moves to BODY, then to "Skip to content" and "Rubikku home" behind the takeover; Shift+Tab walks the page backwards, all while the dialog (`role=dialog aria-modal=true`) is up for about 4.5–6 s. Escape works and returns focus to the cube; tap and "Keep going" work.

### Settings, storage, layout

#### N8 — Minor — No warning when storage is completely unavailable
- **Repro rate:** 2 of 2 modes (`localStorage` getter throws; `localStorage` undefined) in `storage.mjs`.
- **Actual:** all seven routes work, nothing says progress is not being kept. When only `setItem` throws, or everything throws, a warning toast now does appear.
- **Expected:** the same warning when nothing can be saved (already code-review M16; partly fixed).

#### N9 — Minor — The "can't save" toast is cut off and covers the page title
- **Repro rate:** 2 of 2 (`shots/storage-setThrows.png`, `storage-allThrow.png`, Settings at 1024x768).
- **Actual:** the title reads "Rubikku can't save right n…" and the body ends "ask a grown-up to…", with the toast over the "Settings" heading.

#### N10 — Minor — At 200% zoom (512x384) the lesson's Next is off-screen
- **Repro rate:** 2 of 2 (primer, daisy). No horizontal scroll on any of nine routes at that size. `zoomhide-log.txt`, `shots/zoom-_learn_daisy.png`.
- **Actual:** only the cube's top shows; Back/Next is below with no cue.

#### N11 — Minor — Level title truncated in the sidebar
- **Repro rate:** 4 of 4 screenshots with level 3 ("Cross Buil…" at 1024x768). `shots/j-white-corners-02-home.png`.

#### N12 — Minor — A correct cube is briefly shown as "problems" after the last tap
- **Repro rate:** 2 of 2 at 0.6 s (`ghost.mjs touch clean`, `mouse clean`); "ok" at 0.8 s and later. Probably a short debounce; flagged because the card says "problems" over a right cube.

### Not new but re-confirmed (see the table)
S1, S2, S3, P1, P3 (search), P4 (timer), X2, X3.

## Unconfirmed

| # | Observation |
|---|---|
| UC1 | Timer: an 11.5 s press (no cube) awards five badges, 140 XP and a level-up. It may be the intended floor (10 s); a real beginner solve takes minutes, so the "Under Five" badge family can be earned by waiting. 1 run (`consist-log.txt`). |
| UC2 | Heap after 600 random Play moves and 120 route changes: 10.3 → 15.9 → 19.5 MB (after forced GC); the DOM grows about 3.5 nodes per recorded move (366 → 2451 after 600 moves). One WebGL context throughout, no errors. Probably the move history; slowly rising, no failure. 1 run. |
| UC3 | `getItem` throwing (reads fail, writes succeed) shows no warning and no data is read back after reload. Same family as N8; 1 mode. |

## Coverage

| Charter | Exercised | Not reached, and why |
|---|---|---|
| 1. Core promise | Whole path in one session: Home → primer → 8 lessons → full solve (the capstone in a second, seeded session). Touch, 683 finger drags. All exercise kinds. | The capstone was not in the same browser context as the lessons: my first capstone loop was wrong, the retry used seeding. Phone and portrait lesson walks not done. Drag fidelity was not checked on a real device. |
| 2. Re-check | Every L, S, P, X, B and M finding and most U items (table). | P2, P3 (watch/pattern), P4 (hint card), X1, U2, U4, U5, U8 on a filled face, U9. |
| 3. Uncovered charters | "My cube doesn't match" (compare, back x40, done, re-enter, re-solve to solved), Next/Back spam, reload mid-walk (solve), reload mid-demo and mid-guided in all eight lessons (position, cube and "now" move identical; demos in the daisy and white-cross are one move, so only stages 3–8 test mid-demo), storage failure in 5 modes, dragging during animations (Play scramble, lesson demo: state valid and shown equals engine, 3 runs), hidden tab (timer keeps real time; animation finishes on return), 200% zoom (9 routes), long Play session and 120 route hops, badge links (14 of 30 tiles), XP/badge/streak across nav, Home and Progress after a timer solve, a Play solve and a flash-card round, theme "Auto" flipping live (follows within a second), theme flip mid-timer and mid-animation (no effect on either; timer can only change via the system since its focus mode hides the switch), with a modal open (switch not reachable, by design; Escape restores focus), keyboard-only primer (15 screens, 223 Tab presses, 100 XP) and focus trap/restore. | Keyboard-only solve entry (not re-run; earlier tester did it). The other 16 badge tiles (reached only through "Next in…"). Phone touch on Play and Timer, streak in other time zones, import with wrong-type stores, reduced-motion checks. Accessibility-tree names for the new controls were read through aria-labels only ("Turn the whole cube: left side", "Keyboard moves", "Back face"), not through a full tree dump. |
| 4. Celebrations | Moments, level-up and all-stages takeovers in the lesson flow; first-solve takeover in Play (desktop and 390x844); Escape, tap, button, idle; tab order. | Reduced-motion celebration. A takeover over the timer was not reached (the 11.5 s press shows one: `shots/consist-timer.png`). |
| 5. Console | Dark-theme phone sweep of 26 routes at 390x844 (all lessons, capstone, algorithms, patterns, play, lab, solve, timer, progress, settings, a bad URL): no errors, no failed requests, no horizontal scroll. Only SwiftShader/THREE.Clock notices (filtered). One aborted prefetch of a route chunk during a reload (benign). | |

### Scripts in `S2`
`journey.mjs` (the continuous walk), `cap2.mjs` (capstone), `solve/*.mjs` (adapted from the first pass: `mistakes`, `ghost`, `walk2`, `reenter`, `ghost3`, `seq`, `fold`), `persist`, `themes`, `takeover2`, `xchecks`, `storage`, `zoomhide`, `mem`, `badges`, `consist`, `reload`, `realfold`, `quizfold`, `hintfold`, `b12`, `kbprimer`, `sweep`. All use `http://127.0.0.1:4263`. The server on that port was stopped; no browsers of mine remain. PID 515095 was left alone.
