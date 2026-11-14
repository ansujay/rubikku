# Rubikku — exploratory QA report (partial: testing was stopped early)

**Build under test:** frozen snapshot `…/scratchpad/snap1/dist` served statically on port 4232. The live source was not built or run.
**Status:** testing was cut short twice by usage limits and then stopped on request. This report covers what was actually exercised. The coverage table at the end says exactly what was not reached, so a follow-up tester can continue.

`S` below stands for
`/tmp/claude-31381/-home-sujay-narayana-thoughtspot-com-rubikku/5df0888d-3ec6-412a-9841-6aab1967a4ad/scratchpad/review-qa`.
Evidence lives in `S/learn` (lead tester), `S/solve`, `S/persist`, `S/abuse`, `S/cross` (four helper testers).

**How to read the provenance column.** The four helpers were cut off before writing their conclusions. Their findings here are taken from the logs and screenshots they saved, not from a written verdict.
- **Lead** = reproduced by the lead tester, as stated.
- **Helper log** = read out of a helper's saved log; the number of independent occurrences in the logs is given; not re-run by the lead.
- **Unconfirmed** = seen once, or ambiguous. Listed separately; do not treat as bugs yet.

**Test-rig caveat.** Until about 02:21 the snapshot was served by a single-threaded Python 3.6 `http.server`, which stalled under parallel browsers. Any `ERR_CONNECTION_TIMED_OUT`, failed asset request or `page.goto` timeout in logs written before then is the rig, not the app (for example `S/solve/out-c11.json`). The machine was also heavily loaded (load average 70–115) for most of the session, so many scripts hit their own timeouts. A "THREW … Target page, context or browser has been closed" line in a log is a script timeout, not an app crash.

## Summary

| Severity | New findings | Notes |
|---|---|---|
| Blocker | 0 | Code-review B1 and B2 were re-observed in the browser (one line each below). |
| Major | 5 | L1, L2, L3, S1, S4 |
| Minor | 13 | L4, S2, S3, S5, P1–P6, X1–X3 |
| Unconfirmed | 9 | U1–U9 |

Majors, one line each:
- **L1** — Stage 1 (daisy), first exercise: tapping "Turn the cube" throws and shows the "That twist went wrong" error page, every time.
- **L2** — Looking round the cube on one lesson screen leaves the camera there for every later screen, so "top", "right side up" and the hold no longer match what is shown.
- **L3** — While pieces are highlighted, everything else (including the centres) is dimmed to near-identical browns, yet the text says to compare with the centres.
- **S1** — A face entered rotated, mirrored or on the wrong side yields 4–13 separate "impossible piece" cards and no fix; the app never suggests the face was turned.
- **S4** — On touch, the tap that completes guided entry also paints a second sticker on the net that appears under the finger, so a correctly entered cube is reported as having a slip.

---

## Learn (charter 1)

### L1 — Major — "Turn the cube" on the daisy's first exercise crashes to the error page
- **Provenance:** Lead. 4 of 4 attempts (`walk.mjs daisy`, `hold.mjs` twice, `hold2.mjs`).
- **Steps:** 1024x768, touch emulation, fresh storage (default settings, animations on). Open `/#/learn/daisy`. Tap Next twice to reach beat 3 of 16, "First: yellow on top". Tap the **Turn the cube** button (`[data-testid="turn-cube-expected"]`). A mouse click does the same.
- **Expected:** the cube rolls over (`z2`) and the exercise shows "Yellow on top. Keep it there for the whole solve."
- **Actual:** the lesson is replaced by the error boundary: "That twist went wrong — Something broke on this page." Console:
  `TypeError: Cannot read properties of undefined (reading '0') at w (cube-DP42OEpu.js:2:3314) … at Ie (LessonPage-q7OHIGYM.js:1:21448)` followed by `Rubikku hit an error: …`.
- **Recovery:** "Try again" brings the lesson back with the exercise marked done (the move was saved: `session.done = ["z2"]`). A reload does the same. So he can get past it, but only through an error screen.
- **Why it matters:** Home's main button for a new user is "Start stage 1", which lands here. This is the first thing a touch user is asked to do, and the text says to use this button ("You cannot drag the whole cube with a finger"). The existing e2e suite does this beat with the keyboard (`z` twice), which does not crash.
- **Scope checked:** "Turn the cube" for a single `y` in the middle of a sequence (white-cross `try-1`) works. The crash was only seen where the button's turn is the last move of the exercise. Likely cause, not verified in source: the panel renders the "next move" for an index past the end while the turn is still animating.
- **Evidence:** `S/learn/shots/daisy-crash-hold.png`, `S/learn/shots/hold-before.png`, `S/learn/shots/hold-after-tap.png`, `S/learn/shots/hold-try-again.png`, `S/learn/log-daisy.txt` (line "CRASH").

### L2 — Major — The camera angle is never reset between lesson screens
- **Provenance:** Lead. 2 of 2 (`walk.mjs primer` first run, `pose.mjs`).
- **Steps:** 1024x768 touch, `/#/learn/primer`, screen 1 ("Drag beside the cube to look around it"). Drag a finger on the empty stage area from the bottom-left of the cube upwards (about 60 px right, 100 px up). Tap Next repeatedly.
- **Expected:** each new screen shows the cube in the standard view, or at least the "How to hold it" screen and the guided move screens do.
- **Actual:** the pose stays where he left it on every later screen. Measured: start `{azimuth 0.62, elevation 0.5}`; after the drag `{0.022, -0.496}`; identical on centres, edges, corners, piece, hold, move-r, move-u, move-prime. In the walker run the cube was seen from underneath on screens 7–13: the yellow top was hidden while the text said "the top row slides to the left", and the hold screen ("yellow centre on top") showed the bottom.
- **Note:** a drag on a sticker while a "watch" animation is running also orbits the view, which is how the first run got there. "Reset the view" does fix it, but nothing prompts him to use it.
- **Evidence:** `S/learn/shots/primer-07-move-r.png`, `primer-10-move-l.png`, `primer-11-move-f.png`, `primer-13-move-b.png`, `pose-orbit-empty-0.png`, `pose-orbit-empty-later.png`.

### L3 — Major — Dimmed stickers cannot be told apart, but the text says to compare with them
- **Provenance:** Lead, from screenshots of three lessons (light theme, 1024x768). Not measured for contrast.
- **Where:** white-corners beat 2 "Every corner has one home" ("check the two side colours against the two centres"); middle-layer `try-3` hint ("its orange sticker joins the orange centre"); yellow-corners-position `try-3` hint ("do its three colours match the three centres around it?").
- **Expected:** the centres named in the instruction are readable.
- **Actual:** every non-highlighted sticker, centres included, is darkened so that red, orange and yellow all read as brown and green and blue as near-black. The comparison the text asks for cannot be made from the picture.
- **Evidence:** `S/learn/shots/white-corners-02-home.png`, `middle-layer-try-3-hint2.png`, `yellow-corners-position-try-3-hint1.png`.

### L4 — Minor — The hint's moves and "Show me" sit below the fold on a landscape tablet
- **Provenance:** Lead, same three screenshots as L3 plus `white-corners-try-3-hint1.png`.
- At 1024x768 in a "now on your own" exercise, the hint card's text runs under the sticky Back/Skip bar. The move chips and "Show me" need a scroll that nothing hints at. The arrow on the cube is visible, so he is not stuck.

### Known issues re-observed (no new report)
- **B1:** the "Stage 1 (The daisy) has come undone" banner appeared mid-algorithm on the correct path in drills for white-corners, yellow-cross (5 times in 6 moves), yellow-edges and yellow-corners-position (`S/learn/log-*.txt`, "banner mid-step").
- **B2:** after the first quarter of a `U2` inside a corner insert, the hint flipped to "Stage 2 · White cross" in the white-corners drill and twice in the full solve (`log-white-corners.txt` lines 88–92, `log-full-solve.txt`).
- **M1:** Home's "Start stage 1" goes to `/#/learn/daisy` for a new user while Learn says "Start here: Meet your cube".

### What worked in Learn
- Primer: all 17 screens by touch; 11 of 13 moves by finger drag (F and B needed another route because the top face was hidden by L2); wrong move → message → "Undo that" worked; wrap-up, +40 XP, link to stage 1.
- Daisy, white cross, yellow cross: walked end to end by touch (22, 23 and 46 finger drags, no keyboard). Guided full, name-only and free exercises all reached their success message; three drills each (by hand with hints, by "Show me", clean with an independent cubejs solution); wrap-up, stage badge, XP 165.
- White corners, middle layer, yellow edges, place the corners: all demos played to the end; all three guided exercises completed by finger drag, including the wrong-move/undo path. Drills were started but not finished (see coverage).
- Final twist: demos and guided `try-1`, `try-2` done; `try-3` in progress when stopped.
- No console errors in any lesson other than L1.

---

## Solve my cube (charter 2)

### S1 — Major — A face entered turned or on the wrong side is reported as many unrelated "impossible pieces", with no fix
- **Provenance:** Helper log. 10 runs across 2 cubes (`S/solve/out-m-rot90-{0,1}.json`, `rot180-{0,1}`, `rot270-0`, `mirror-1`, `topAway-{0,1}`, `wrongWay-{0,1}`, `bottomWrong-0`).
- **Steps (script `S/solve/mistakes.mjs <name> <cubeIndex>`):** `/#/solve`, 1024x768 touch, guided face-by-face entry by tapping. Enter one face rotated 90°/180°/270° (or mirrored, or the top face entered from the far side, or right and left faces exchanged, or the bottom face turned).
- **Expected:** one message a child can act on, such as "the right face looks turned a quarter — turn it back?", with a one-tap fix. This is the most likely real-world slip in face-by-face entry.
- **Actual:** status "problems" with 4 to 13 cards, all `impossible-piece` / `duplicate-piece` (for example "This corner has orange and red on it… One of these three stickers is a slip"), none with a fix button. Every run ended `STILL-PROBLEMS`. The only way out is to work out for himself that a whole face is wrong and repaint it.
- **Evidence:** the JSON files above (fields `issues`, `verdict`), screenshots `S/solve/shots/m-<name>-<i>-0.png` and `-full.png`.

### S2 — Minor — The stage-by-stage solution tells him to turn a face and then straight back
- **Provenance:** Helper log. 6 of 6 beginner-method walks (`out-c1`, `c3`, `c5`, `c7`, `c9`, `c10`, field `seq`).
- **Actual:** the displayed move list contains adjacent turns of the same face that cancel or should merge: `U′ U`, `U U′`, `F′ F`, `U2 U′`, `F2 F′`, `U U`, `R R`. Example from cube 1: `… y′ U′ U R U′ R′ …`.
- **Expected:** consecutive turns of one face are merged across step boundaries (`U′ U` removed, `U U` shown as `U2`). The solution is still correct; it is just longer and odd to follow on a real cube.

### S3 — Minor — A wrong centre gets two messages and no one-tap fix
- **Provenance:** Helper log. 2 of 2 (`out-m-centre-0.json`, `out-m-centre-1.json`).
- One centre entered as red instead of green gives "You have 10 red and 8 green…" and "Two middles are red… Check the middle of the right and front faces", neither with a fix button. A single wrong non-centre sticker does get "I think I found the slip → Make it green" and that fix restored the real cube in 2 of 2 runs.

### S4 — Major — The last tap of guided entry paints a second sticker (touch only)
- **Provenance:** Solve helper's own hand-back (received after the stop instruction), reproduced by it 4 of 4 with touch and 0 of 2 with a mouse in a focused script, plus 1 of 1 at another grid position, plus five tap-through entries on the same cube. Not re-run by the lead.
- **Steps (script `S/solve/ghost.mjs touch clean`):** `/#/solve`, 1024x768, touch emulation. Seed `rubikku:solve` with `{phase:'entry', intent:'solve', entryMode:'guided', guidedIndex:5, centresLocked:true, brush:<right colour>}` and a correct cube (scramble `D2 L F' U R2 B D' F2 L' U2 B' R D L2 F U' B2 R' D2 F`) with one hole on the bottom face at grid row 2, column 1. Tap the hole.
- **Expected:** only that sticker is painted and the cube passes the check.
- **Actual:** the cube becomes complete, the 3x3 face grid is swapped for the whole-cube net under the finger, and the same touch's `click` lands on a net sticker and paints it with the current brush. Event trace: `pointerdown@30/face-grid pointerup@27/entry-net click@27/entry-net`. Result: facelet 27 changes from F to B and the status is "problems".
- **Consequence:** alone, the "I think I found the slip" fix restored the real cube in the one case checked. Stacked on a real slip it removes the one-tap fix: the swapped-pair mistake got "Swap these two" on cube 0 but three wrong stickers and no fix on cube 1. It also explains the stray `27:F>B` in every `out-m-*-1.json`.
- **Depends on** where the last tap lands: the 8 clean tap-through entries in the batch never hit it. Hit rate per grid position, and whether 768x1024 and 390x844 are affected, are unconfirmed (the sweep `S/solve/ghost2.mjs` was stopped after one row). Chromium touch emulation only; not tried on a real tablet.
- **Evidence:** `S/solve/shots/ghost-touch-clean-before.png`, `ghost-touch-clean-after.png`, `ghost-touch-slip-after.png`, `S/solve/trace27.mjs`.

### S5 — Minor — Two buttons labelled "Back" on the guided entry screen
Solve helper's hand-back. One is the tab for the back face, the other is the previous-face button, close together. `S/solve/shots/e-toomany.png`.

### What worked in Solve
- 8 cubes entered by tapping through guided entry and followed to the end, each checked against cubejs with whole-cube turns tracked: `oracleSolved: true` and `cubeSolved: true` for cubes 1, 3, 4, 5, 7, 8, 9, 10. Four of those were entered in a non-standard hold (`x`, `z′ y2`, `x′ y`, `y`). Cubes 4 and 8 used "Fastest way" (22 turns each). No console errors.
- Cubes 2, 6, 11, 12 did not finish: script timeouts or the single-threaded server. Not app failures; rerun needed.
- One swapped pair of stickers on a face: guess card with "Swap these two" restored the real cube (1 of 1 clean run).
- Half-finished entry is reported as "Checking as you go — 46 / 54, 8 stickers to go" (`out-m-skip-0.json`).
- Where-am-I on a cube with five stages done names stage 6 and links to its lesson.
- Half-way entry (2 faces + 4 stickers) then reload: `rubikku:solve` byte-identical, same face, same brush; also survives going to `/#/timer` and Back, a cold open in a new tab, and `/#/solve?where` mid-entry.
- Clear face, undo, redo, face tabs, the tenth-sticker warning, two-finger tap and touch drag-paint all behaved.
- On a cube entered as `z′ y`, the "X on top / Y facing you" line matched cubejs on all 13 whole-cube-turn steps of a 135-turn walk (`S/solve/log-holds.txt`).

---

## Persistence (charter 3)

Reload points checked, from `S/persist/*.log` (`SAME` = localStorage, cube state and visible text identical after reload):

| Point | Result |
|---|---|
| Learn map | Same |
| Primer guided exercise: at start, mid-way, off the path (banner back after reload) | Same |
| Primer with mirrors on and the view orbited | Storage same; view angle resets to default |
| Primer "Stuck?" sheet open | Same (sheet closes) |
| Primer screen with an auto-playing animation ("Centres never move") | **Differs** — P5 |
| Daisy goal screen on "After" | Same position |
| Daisy drill, 2 moves in, hint open | Cube and drill kept; **hint card closed** — P4 |
| Daisy drill solved; daisy wrap-up | Kept |
| Peeked lesson (white-corners, screen 3) | Same |
| Full solve: moves + undo + hint open | Cube kept; hint closed — P4 |
| Full solve: solved; new scramble | Same |
| Play: scrambled, two undos (redo stack) | Same; redo still works |
| Play: hint open | Cube kept; hint closed — P4 |
| Play: mirrors/face-letter toggles, orbit | Toggles kept; view angle resets |
| Notation: hub, mode chosen | Same |
| Notation: question 4 of a round; feedback showing; summary | Same |
| Notation: speed round running | Comes back paused with "Carry on" |
| Algorithms list: search + filter | **Search and filter cleared** — P3 |
| Algorithm card: watch at step 3; practise 3 moves in; memory mode | **All reset** — P3 |
| Flash-card quiz: question 4; just answered; summary | **All reset to question 1 with new cards** — P1 |
| Patterns list filter | Same |
| Pattern: watch mid-play | **Reset to solved, 0/3** — P3 |
| Pattern: "Try it" off the path; "Real cube" at step 2 | Position kept (off-path wording changes) |
| Solve: intro; face 1 blank; face 3 after undo; 3D tab; whole-cube mode; clear-all dialog open | Same |
| Solve: problem card open | Same cards; which card is open changes |
| Solve: where-am-I | Same |
| Solve: milestone; mid-turn; fastest way at turn 4; finished | Same, cube matches the oracle |
| Solve: "my cube doesn't match" panel open | Panel closes, position kept — P4 |
| Timer: fresh scramble; scramble navigation; three solves | History and scramble kept; **last-solve OK/+2/DNF pad gone** — P4 |
| Timer: reload while running; reload during inspection | **Attempt silently dropped** — P4 |
| Timer: history row dialog open | Dialog closes |
| Progress; badge dialog open; Home | Same |

Other persistence checks:
- **Export → reset → import:** all nine stores restored; no key differs after import (`backup1.log`: "DIFF KEYS after import (no reload): []"). The theme and motion setting apply immediately.
- **Bad backup files:** empty, not JSON, wrong shape, newer version, no stores — each refused with a clear sentence.
- **Back/forward:** lesson screens do not push history; Back from a lesson returns to the map; Forward returns to the same screen and cube.
- **Deep links cold:** all listed routes opened (`links-good.log`). Bad URLs show the not-found page.
- **Corrupt stores:** 719 cases (truncated JSON, wrong types, nulls, huge values, versions 0 / 2 / 999) across all stores: no error page. See U3.
- **Storage failing** (`getItem`/`setItem` throwing, storage undefined, quota after 20 writes): the app keeps working from memory, shows no warning, and Export produces a file with no stores in it (3 modes). Already code-review M16.
- **Two tabs:** a solve saved in tab B is wiped when stale tab A writes. Already code-review M15.

### P1 — Minor — The flash-card quiz forgets everything on reload
Helper log, 3 reload points in one run (`nap.log`, A05–A07). `/#/algorithms/quiz`: reload at question 4 of 6, after answering, or on the 6/6 summary returns to "1 / 6" with different cards. Nothing about the quiz is in localStorage at that point.

### P2 — Minor — Every reload of a lesson adds "Started a lesson" to the activity feed
Helper log (`learn2.log`, "started"): five reloads of `/#/learn/daisy` gave 1, 2, 3, 4, 5 `lesson-started` rows, and a sixth on leaving and re-entering. Progress shows "Started a lesson just now" six times.

### P3 — Minor — Algorithm cards, pattern playback and the algorithm search lose their place on reload
Helper log (`nap-alg.log` A01–A04, `nap-pat.log` PT02). `/#/algorithms/sune` watched to 3/7 → 0/7; `?mode=practise` three moves in → back to the first move; "Memory" help level → back to "Moves"; algorithm search text and stage filter cleared; `/#/patterns/checkerboard` watched to 3/3 → "Solved 0/3".

### P4 — Minor — Transient panels and in-flight timer attempts are dropped on reload
Helper log. The hint card closes (lesson drill, full solve, play; 3 places). The "my cube doesn't match" panel closes. The timer's last-solve pad (OK / +2 / DNF / Delete) disappears, so a penalty can only be set from the history row. A running timer or inspection is discarded with no solve and no message.

### P5 — Minor — A lesson screen with an auto-playing animation replays it on top of the saved cube after reload
Helper log, 2 of 2 (`learn.log`, `learn-primer.log`, L02). Primer screen 2: before reload `done = ["R","U","F′"]`; after reload the animation runs again from the saved state (`done = ["R","U","F′","L","D2","B","R", …]`), the cube differs, and the button reads "Spin the layers" instead of "Watch again".

### P6 — Minor — Unknown algorithm or pattern ids render a not-found state with no page heading
Helper log, 8 URLs (`links-bad.log`): `/#/algorithms/nope`, `/#/patterns/nope`, `/#/algorithms/constructor`, `/#/patterns/toString`, `/#/algorithms/__proto__`, `/#/patterns/__proto__`, `/#/algorithms/%ZZ`, `/#/patterns/%E0%A4%A` have no `h1`, unlike `/#/learn/garbage`, which shows "This piece isn't part of the cube". Screenshots `S/abuse/shots/bad2-___algorithms_nope.png`, `bad2-___patterns_nope.png`.

---

## Abuse, themes, console (charters 4, 6, 8)

No bugs confirmed. What the saved logs show:
- **Multi-touch on Play** (2 identical runs, `touch.log`): two-finger drag on stickers, second finger joining mid-drag, touch-cancel mid-drag, 15 pinches (zoom clamps at 1.6 and 0.8), three fingers, dragging off-screen, rotating the tablet mid-drag, tapping Scramble during a drag. The shown cube always equalled the engine state and a normal drag worked afterwards.
- **Lesson abuse** (1 full run, `abuse2-lesson.log`): double-clicking Next advances one screen each time; 80 mashed keys in a guided exercise give "Off the path by 80 moves" and 80 presses of "Undo that" return to position 0; portrait and phone resize mid-exercise have no sideways scroll; leaving mid-demo and returning restores the position.
- **Play** (`play1.log`, 1 partial run): scramble spam, 150 mashed moves and undo/redo spam leave state and history consistent.
- **Memory** (`long-routes.log`): 96 route changes, heap 9.1 → 13.4 → 14.8 → 15.3 → 15.8 MB, one WebGL context throughout. Target was 100+; the script was cut at 96.
- **Timer at scale** (`long-timer.log`): 300 and 2,000 stored solves load in about 1.6 s, 12 rows rendered, new solves record normally.
- **Theme:** no flash of the wrong theme on first paint in four stored/system combinations, 2 runs (`themes2.log`, `S/abuse/shots/flash-*.png`); rapid toggling ends consistent with storage; toggling with a sheet open works on lesson and play.
- **Console:** route sweep in light 1024, light 390 and dark 1024 (`sweep.log`) logged only `THREE.Clock … deprecated` (once per page with a cube) and SwiftShader "GPU stall due to ReadPixels" driver messages. No errors, no failed requests, no unhandled rejections. Dark 390 was not reached.

---

## Cross-feature and accessibility (charters 5, 7)

### X1 — Minor — The where-am-I lesson link opens the lesson as "peeking ahead"
Helper log, 1 run (`flow3-where.txt`), consistent with how the path works. A cube with five stages done → "Learn stage 6: Yellow edges" → lesson opens with "You are peeking ahead. Start here: Meet your cube comes first on the path." Back returns to where-am-I with its state intact. Listed as Minor because the banner contradicts the link he just followed.

### X2 — Minor — Touch targets under 44 px on a phone
Helper log, measured at 390x844 on 8 routes (`flow4-phone.txt`). 40x40: theme switch, cube toolbar buttons (mirrors, face letters, peek, reset view), playback step buttons, sheet Close. Smaller: "Open" 35x20 and "Peek ahead" 73x20 on the Learn map, "Lesson" chips 81x32, stage link on an algorithm card 161x20, "Open progress" 103x36, lesson section tabs 50x36. PLAN asks for at least 44 px.

### X3 — Minor — Keyboard focus falls back to the page after Next
Helper log (`kb2-light.txt`, `kb3.txt`). Keyboard-only completion works: the whole primer (40 XP) and a full solve-my-cube entry (the entered cube equalled the real one). But after Enter on Next, focus lands on `BODY` on 13 of 16 primer screens; in solve entry, reaching the grid again after "next face" takes 34–35 Tab presses on each of five faces.

### Other observations (no bug)
- **Streak across simulated days** (`streak-UTC.txt`): day 1 action → 1; midnight with the tab open → "Practise today to keep it alive"; day 2 action → 2; a skipped day → shown as 0 with "Best 2"; next action → 1; clock set backwards → no crash, streak 1. Home, Progress and the store agreed at every step. The Los Angeles run timed out; the IST run was not read.
- **Links:** algorithm card → lesson link → Back returns to the card in practise mode; Back again restores the list scroll position.
- **Notation "Do it" round by mouse drags at tablet size:** 10/10, +30 XP, next level opened; nav showed 30 XP.
- **Play:** drags for R, L, U, D, F, B all work with a mouse at tablet size. The keyboard-help dialog lists all keys.
- **Known issues re-observed:** M10 (a 4.68 s timer press awarded first-solve plus sub-5/3/2/1 badges and 140 XP), M9 (a Play cube solved entirely by Hint → Show me, 38 steps, gave no reward or progress record), code-review minor 18 (entry grid and net cells carry the colour only in the accessible name, no visible letter).
- Accessibility-tree dumps for every route are in `S/cross/out/aria_*.txt`; colour-blind simulations in `S/cross/shots/cvd-*.png`. Neither was analysed.

---

## Unconfirmed — seen once or ambiguous; verify before filing

| # | Observation | Source |
|---|---|---|
| U1 | Final-twist demo "Watch a whole finish" stopped at move 22 of 27 within the script's 120 s wait. The machine was at load ~100; may be slowness, may be code-review M3/M4. | `S/learn/log-yellow-corners-orient.txt` |
| U2 | Importing a backup whose stores hold wrong types (`theme: 12`, `xp: "lots"`) is accepted ("Saved on an unknown date") and written to localStorage as-is. Whether the app then sanitises on load was not checked. | `S/persist/backup1.log`, `bad-evil.json` |
| U3 | Corruption sweep flagged `/#/play` with `settings.turnSpeed: null` and with `showFaceLabels: 7`: the stored value was not rewritten. The page did render; the cube was not yet drawn in the screenshot. | `S/persist/corrupt.log`, `shots/C-settings-55.png`, `C-settings-65.png` |
| U4 | With the system set to reduced motion, transform animations were still reported as running on `/#/learn`, `/#/patterns`, `/#/algorithms` (2 runs of one script). They may be zero-length. Also: a one-move demo "finishes" in 0.3–0.5 s under reduced motion, which may be too fast to read. | `S/abuse/abuse3-mf.log` |
| U5 | Toggling the theme there and back left pixel differences on `/#/timer` and `/#/algorithms/quiz` (and on `/#/learn` at 390 px). Not inspected; may be live content. | `S/abuse/themes1.log` |
| U6 | Escape did not close the keyboard-help dialog in one script and did in another. | `S/cross/out/flow3-play.txt` vs `flow4-misc.txt` |
| U7 | Phone: with the "More" sheet open, tapping the Timer tab left the URL on Home and the sheet open. | `S/cross/out/flow4-phone.txt` |
| U8 | A double-tap on "Next face / Skip this face for now" skipped two faces (top → right, front silently skipped). Seen once. | `S/solve/entry.mjs` |
| U9 | Milestone copy read "1 of 8 done… 6 to go" on one walk; correct on another. Possibly a stage with nothing to do. | Solve helper's hand-back |

---

## Coverage

| Charter | Exercised | Not reached, and why |
|---|---|---|
| 1. Core promise | Home and Learn as a new user. Primer complete. Daisy, white cross, yellow cross complete by touch including 3 drills each. White corners, middle layer, yellow edges, place the corners: every demo and all three guided exercises by finger drag. Final twist: demos, `try-1`, `try-2`. | **Drills for stages 3, 4, 6, 7, 8** (each stopped a few moves into drill 1). **Final twist `try-3` and wrap-up. Wrap-ups of stages 3, 4, 6, 7. Full solve** (stopped in stage 3 of the cube, about 30 moves in). Phone and portrait lesson walks. Cause: 45-minute script timeouts at 6–13 s per move under load. One continuous Home → … → full solve session in a single browser was not done; lessons ran in parallel with earlier stages seeded as complete. |
| 2. Solve my cube | 8 cubes entered by tapping and solved against the oracle, 4 in non-standard holds, 2 by fastest way. Mistakes: one wrong sticker, swapped pair, face rotated 90/180/270, mirrored, wrong centre, faces exchanged, skipped face. | Cubes 2, 6, 11, 12 (rerun). "My cube doesn't match" under messy use, back/next spamming, reload at arbitrary points mid-walk (only the persistence helper's four points). `S/solve/walk2.mjs mismatch` and `walk2.mjs spam` were written for these and never run. Phone and portrait entry. S4 hit rate by grid position and viewport. |
| 3. Persistence | About 45 reload points (table above), export/reset/import, bad backups, 719 corruption cases, storage failure in 4 of 6 modes, history, deep links, bad URLs, two tabs. | Reload mid-demo with playback position (script timed out), lesson stages 2–8, storage modes "undefined" and "all throw" (timed out), visible-state comparison for the corruption sweep beyond "no error page". |
| 4. Abuse | Multi-touch, rotation mid-drag, key mashing, double-click Next, scramble/undo spam, 96 route changes with heap and context counts, 300 and 2,000 timer solves, reduced motion, bad URLs. | Rapid tapping in notation/algorithms/patterns/solve (`abuse2-rest` timed out at its first step), dragging during animations, mid-timer navigation, hidden tab and return, 200% text zoom, long cube session memory, lesson abuse run 2. |
| 5. Cross-feature | Algorithm ↔ lesson links, where-am-I → lesson, Play hint → Show me, timer and notation XP reflected in nav/Home/Progress, streak over simulated days (UTC). | Badge "where to earn it" links, XP/badge consistency after algorithm practise, quiz, pattern, lesson completion and real-cube solve, phone touch on Play and Timer, streak in other time zones. |
| 6. Themes | No-flash on load, rapid toggle, toggle with a sheet open, there-and-back comparison on 9 routes at 1024. | Toggle mid-timer and while the cube animates, 390 px routes beyond Learn, "match device" following a live system change, 3D scene and mini-cube colours after toggle. |
| 7. Accessibility | Keyboard-only primer and solve entry, tab counts, accessibility-tree dumps for 16 routes, colour-blind simulation screenshots, phone target sizes, keyboard-help dialog. | Analysis of the tree dumps and simulations, focus visibility in dark theme, focus trap/restore in modals, contrast checks. |
| 8. Console | Lessons (lead), solve walks, route sweep in light 1024, light 390, dark 1024. | Dark 390 sweep. |

### Reusable scripts and their state

All run with `node <script>` from their own directory against `http://127.0.0.1:4232`. Start a server first with `python3 S/serve.py S/../snap1/dist 4232` (threaded; plain `python3 -m http.server` on this machine is single-threaded and stalls). No server is running now.

| Script | What it does | State |
|---|---|---|
| `S/learn/lib.mjs` | Shared helpers: touch context, `dragMove` (finger drag for any face or slice move, with a second route for F/B/S), keyboard moves, cube-state hooks. | Working. |
| `S/learn/walk.mjs <lesson> [done,lessons] [startBeat]` | Walks a lesson as a child by touch: every screen, demos, guided exercises (with one deliberate wrong move), three drills, wrap-up. `full-solve` follows the coach by hand to the end. Logs to `log-<lesson>.txt`, screenshots to `shots/`. | Working. The `startBeat` argument (start at a given screen, e.g. `drill`) was added but **never run**. To finish charter 1: `node walk.mjs white-corners primer,daisy,white-cross drill`, likewise for middle-layer, yellow-edges, yellow-corners-position; `yellow-corners-orient … try-3`; then `full-solve` with all eight listed. Allow 60+ minutes each on a loaded machine, or run one at a time. |
| `S/learn/hold.mjs`, `hold2.mjs` | Reproduce L1 and its recovery. | Working. |
| `S/learn/pose.mjs` | Reproduces L2. | First variant works; the second (sticker drag during an animation) timed out. |
| `S/learn/dbg.mjs <lesson> <beat> [drag\|key]` | Opens a lesson at a screen, asks for a hint and follows three moves, printing hint state. | Working. |
| `S/solve/batch.mjs <n>`, `runbatch.sh` | Enters cube n (1–12) by tapping, walks the solution against cubejs, writes `out-c<n>.json`. | Working; rerun 2, 6, 11, 12. |
| `S/solve/mistakes.mjs <name> <cube>` | Entry mistakes; writes `out-m-<name>-<cube>.json`. | Working. Cube 1 runs carry an extra wrong sticker at facelet 27, which is bug S4, not the script. |
| `S/solve/ghost.mjs <touch\|mouse> <clean\|slip>`, `ghost2.mjs`, `trace27.mjs` | Reproduce S4; `ghost2` sweeps grid positions × viewports. | `ghost.mjs` working; `ghost2.mjs` stopped after one row. |
| `S/solve/walk2.mjs <mismatch\|spam>` | "My cube doesn't match" by taps; Next/back spam, key mashing, resize mid-walk. | Written, never run. |
| `S/persist/*.mjs` (`learn`, `learn2`, `play`, `nap`, `solve`, `extra`, `backup`, `corrupt`, `storage`, `links`) | Reload-and-compare at named points; logs beside them. | Working; several sections timed out and need a rerun on a quiet machine. |
| `S/abuse/*.mjs` (`touch`, `abuse2`, `abuse3`, `play1`, `long`, `sweep`, `themes1`, `themes2`) | As described above. | `abuse2` run 2 fails on a null bounding box; `abuse2-rest` never got past its first step. |
| `S/cross/*.mjs` (`flow1`–`flow4`, `streak`, `kb1`–`kb3`, `a11y1`, `cvd`, `fplay`, `fp`, `fq`) | Cross-feature flows, streak clock, keyboard-only runs, tree dumps. Output in `S/cross/out/`. | Mostly working. They point at port 4237, a helper's own server that is now stopped — change the base URL. |

### Clean-up
All static servers started for this work (ports 4232, 4233, 4237, 4238, 4242, 4252) and all leftover wait loops were stopped; no Chromium processes remain. Nothing was written in the project apart from this file.
