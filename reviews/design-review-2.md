# Rubikku — design review 2 (snapshot `snap2/dist`)

Reviewed: the frozen build only, served locally, driven with Playwright (headless Chromium, SwiftShader). 1024×768 light and dark (primary), 390×844 light and dark, spot checks at 768×1024 dark and 1440×900 light; new user and seeded mid-journey user. Celebrations were captured as frame sequences from the Kitchen sink triggers, the pattern-made flow and a real timer personal best.

Screenshots are under
`/tmp/claude-31381/-home-sujay-narayana-thoughtspot-com-rubikku/5df0888d-3ec6-412a-9841-6aab1967a4ad/scratchpad/review-design2/`
in `raw/` (every route), `deep/` (states), `spot/` (768 and 1440) and `shots/motion-*.png` (frame sequences). Below, paths are relative to that folder. Naming: `tl` = 1024×768, `ph` = 390×844, `tp` = 768×1024, `dt` = 1440×900.

Limits: software rendering ran at about 10 fps, so motion comments come from the choreography in the frames and from the code, not from measured smoothness. The theme circle reveal still cannot be captured headless. The milestones for "all eight stages" and "real cube solved" were checked in code (`LessonPlayer.tsx:336`, `FullSolve.tsx:111`, `SolvePage.tsx:207`), not by playing through. Not re-checked this round: S10 (phone solve entry), S14 (white face from below), Settings icons.

## Verdict

1. Yes, mostly. This is now a rich, coherent product with a clear personality. The earlier gap ("clean, not memorable") is largely closed. Every one of the 8 Must-fix items is fixed or nearly fixed. Nothing regressed badly.
2. Rich: yes. The cube is big and unobstructed, the arrows read on every colour, the "Seen from above" diagrams, the four shape tiles, the recognition quizzes with mirrors, the badge art and the StageTracker make it the visual teaching app the brief asked for.
3. Tasteful: yes. The token system held up through two fix rounds. One new gradient (the trophy room) and one loud moment (pattern made: four "done" signals at once) are the only slips.
4. Fluid: not yet. Pages still exit to a blank content area for about 250 ms before the next one fades in, even when its code is already loaded. Dark-theme dimming is too weak to see what is lit. Two screens push their main control below the fold on the primary tablet.
5. The remaining gap is motion and staging at the seams, not features. The milestone takeover shows a 100 px badge where the child's own 3D cube should be. Page changes blink. The timer and Free play lose their main controls under the fold at 1024×768.

Counts: **2 Must fix, 8 Should fix, 7 Polish.** Earlier items: 8/8 Must fixed (M1 partly on phone); 14 Should: 7 fixed, 5 partly (S1, S2-dark, S6, S8, S9), 2 not re-checked, 0 not fixed, 0 regressed. Regressions: the stages got bigger, and that pushed the Timer pad and the Free-play action row below the fold at 1024×768 (M-new-2, N1).

---

## Earlier items: status

| # | Item | Status | Evidence |
|---|---|---|---|
| M1 | Timer result covered by toasts | **Fixed (tablet), partly (phone)** | "New personal best" and "+60 XP" are now inline pills above the time. The PB is a moment card at the top of the column and the next attempt dismisses it (`deep/T-pb-1200.tl.light.png`). On the phone the card overlaps the top of the pad, including its pills, for about 3.4 s (`deep/T-pb-1200.ph.dark.png`). See N3. |
| M2 | Notation comparison cubes squashed | **Fixed** | Square, about 100 px, centred, each with its move chip (`deep/N-wrong.tl.light.png`). The tinted header band above each mini is empty; minor. |
| M3 | White arrows vanish | **Fixed** | Narrow action-blue arrow with a white and dark stroke. It reads on white, yellow and pastels in both themes and starts beside the lit piece, not on it (`deep/L-corners-guided.tl.light.png`, `.tl.dark.png`, `deep/L-twist-try1.tl.light.png`). See N5 for F in Notation. |
| M4 | Controls over the cube | **Fixed** | Every stage has a control bar under the canvas (↺ CUBE ↻ · mode chip · layers/mirrors/view). Nothing overlaps the cube at any size (`deep/L-daisy-guided.ph.light.png`, `spot/L-corners-guided.tp.dark.png`). |
| M5 | Instruction below the fold | **Fixed** | The "now" strip under the stage carries the big keycap and a plain-English line on every size. Slips show in the same strip with "Undo that" (`deep/L-daisy-slip.tl.light.png`, `deep/L-corners-guided.ph.light.png`). "Peeking ahead" is a chip in lessons, but Full solve still has the full-width yellow banner (`deep/L-full-solve-mid.tl.dark.png`). |
| M6 | Empty cell looks white | **Fixed** | Empty cells are sunken, dashed and dotted, and white is a solid keycap. Clear in the net and on the 3D paint (`deep/S-entry-free.tl.light.png`, `deep/S-entry-guided-top.tl.light.png`). |
| M7 | Celebrations don't match | **Fixed** | One module with three tiers (`src/ui/celebrate.ts`). A moment card has a badge keycap that lands, XP that counts up and a spinning cube. A milestone is a content-area takeover with a 48 px headline, confetti in cube colours, XP count-up, one button, "tap anywhere" and a progress line (`shots/motion-ks-moment.png`, `motion-ks-milestone.png`, `motion-pattern-made.png`). Gap: see N2. |
| M8 | Cube too small | **Fixed** | Lessons at 1024: stage about 408 px, cube about 310 px. At 1440: stage 580 px (`spot/L-corners-guided.dt.light.png`). Solve walk: stage about 420 px with the "now" strip (`deep/S-walk-step.tl.light.png`). Free play 1440: stage plus a right column (`spot/play.dt.light.png`). Side effects: N1, N2. |
| S1 | Navigation flashes blank | **Partly** | The spinner is gone, routes are prefetched (`routes.tsx:82`), and a title skeleton shows. But the content area is still empty from about 200 to 430 ms on every navigation, even with the chunk loaded (`shots/motion-page-nav.png`, `motion-page-nav2.png`). See M-new-1. |
| S2 | Dimmed stickers turn to mud | **Fixed (light), partly (dark)** | Light: pastel tints that keep their hue, and no dimming for whole-cube turns. Dark: see N4. |
| S3 | Portrait tablet nav unlabelled | **Fixed** | Labelled rail with a labelled theme button (`spot/home-seeded.tp.dark.png`). |
| S4 | Five trackers | **Fixed** | One StageTracker on Home, Learn, Full solve and the Solve walk (`raw/learn-seeded.tl.light.png`, `deep/S-walk-step.tl.light.png`). |
| S5 | Rainbow decoration | **Fixed** (Algorithms, Home daily card); Settings not re-checked | Algorithms headers are neutral number stickers (`raw/algorithms.tl.dark.png`). |
| S6 | Timer/Progress as a dashboard | **Partly** | Progress now leads with the trophy room (good). Timer has a 3D scramble preview, but it keeps the flat net beside it, and the card grew so much that the pad sits below the fold (M-new-2). |
| S7 | Badges have no art | **Fixed** | Shape-by-family art, a stopwatch with a time, a hexagon with a count, locked silhouettes with progress ("3 / 10"). The modal has large art, the date, how it was earned and the next badge (`raw/progress-seeded.tl.light.png`, `deep/G-badge-modal.tl.light.png`). |
| S8 | Learn map hides the method | **Partly** | Nodes show the stage goal with only the solved part lit, and locked nodes are faded (`raw/learn-seeded.ph.light.full.png`). But at 1024 the path is still a narrow left column, and the right 45% of the map is empty (`raw/learn-seeded.tl.light.png`). |
| S9 | Algorithm cards hide the case | **Partly** | The status pill clutter is gone. Thumbnails are still full-colour cubes and descriptions are still cut with "…" (`raw/algorithms.tl.dark.png`). |
| S10 | Phone solve entry | Not re-checked | — |
| S11 | Light AA failures | **Fixed** | `--ink-faint #65676e` (about 5:1 on bg); near-black `--on-green`. |
| S12 | Diagrams | **Fixed** | "Seen from above" panel in stages 1 and 5–8, four tappable shape tiles in the yellow cross (`deep/L-ycross-shapes.ph.light.full.png`). Placement and legibility: N7. |
| S13 | Notation not a game | **Fixed** | 128 px prompt keycap with a colour bar, ten 20 px progress stickers, a "Perfect round!" ring and a level unlock (`deep/N-prompt.tl.light.png`, `deep/N-summary.tl.light.png`). |
| S14 | White face renders grey | Not re-checked | — |

---

## New findings

### Must fix

**M-new-1. Every page change blinks to an empty content area.**
- Where: any navigation. 1024×768 light, seeded. Shots: `shots/motion-page-nav.png` (Home → Timer), `shots/motion-page-nav2.png` (Home → Patterns after 4 s idle, so the chunk was already prefetched).
- Wrong: the old page exits in 120 ms, then nothing is shown for about 200–300 ms, then the new page fades up from a ghosted skeleton. The sidebar pill slides nicely while the stage goes blank. This is the first thing the owner will notice under "I love fluidity". It is by construction (exit-then-enter, `mode="wait"`), so a fast device will show it too, only shorter.
- Fix: overlap the exit and the enter. Use `mode="popLayout"`, or no exit animation and a 160 ms enter (opacity 0→1, y 8→0) on the new page while the old one is removed at once. Keep the skeleton only for a genuine chunk wait longer than 150 ms. Share the page `<h1>` with a `layoutId` so the title morphs instead of disappearing.

**M-new-2. Timer: on the primary tablet the time and the result controls sit below the fold.**
- Where: Timer, 1024×768, light and dark, new and seeded. Shots: `deep/T-result.tl.light.png`, `deep/T-pb-1200.tl.light.png`.
- Wrong: the scramble card is now 380 px tall: a chip grid, the 3D mini and the flat net. The pad starts at y≈550, the time sits at y≈620–720, and the OK / +2 / DNF / Delete row is off-screen. Before this round the pad started at y≈430 (`review-design/shots/T-result.tl.light.png`). This regression came from the S6 fix. The one number the page exists for, and the penalty buttons a child needs straight after a solve, require scrolling.
- Fix: drop the flat net (the 3D mini replaces it). Lay the scramble out as one row: moves on the left, a 120 px mini cube on the right. Cap the card at about 190 px. The pad then starts at about y 340 with its result row visible. On the phone keep the pad first (it already is).

### Should fix

**N1. Free play: Scramble / Hint row is cut by the fold at 1024×768.**
- Shots: `deep/Y-scrambled.tl.light.png`, `deep/Y-hint.tl.dark.png`. Light and dark.
- Wrong: the bigger stage (530 px tall) pushes the action row to y 720–768, half visible. The primary button of the page is clipped.
- Fix: fit the stage to `100dvh − header − 64px action row − gutters`, as lessons already do. Or put Scramble / Undo / Redo / Hint into the stage's control bar, which already has room on the left.

**N2. The milestone takeover celebrates a badge, not the cube.**
- Where: milestone tier, all themes and sizes. Shot: `shots/motion-ks-milestone.png` (also `-dark`, `-ph`).
- Wrong: the art is a 100 px hex badge with a tiny cube print, centred in a large empty wash. The confetti is fine, but after 1.7 s nothing moves for the remaining 2.6 s. "You solved the cube" is the product's peak, and the child's own 3D cube, the star of every other screen, is hidden behind the wash.
- Fix: in the takeover, render the page's registered cube (or a fresh `MiniCube` in the solved state) at 220–260 px. Run its `celebrate('milestone')` (spin plus layer ripple) as the centrepiece, with the badge keycap landing beside the XP, not as the hero. Fire a second, smaller confetti burst when the XP count-up finishes, so the hold time has an event.

**N3. Personal-best moment uses the wrong art and covers the pad on phone.**
- Where: Timer PB, seeded. Shots: `deep/T-pb-1200.tl.light.png`, `deep/T-pb-1200.ph.dark.png`.
- Wrong: the title is "11.09" but the art is the "3:00" stopwatch badge (the merged badge won the art slot). Two more badges are reduced to "· +2 more badges: Under Two, Sub-Minute" in body text. On the phone the card sits over the top of the timer pad and its "New personal best" pill for about 3.4 s.
- Fix: for a PB, use the time itself as the art (a stopwatch keycap showing "11.09"). Show merged badges as a row of 40 px badge keycaps under the title, not as prose. On the Timer, anchor the card inside the pad's top padding or show it as a strip under the time, never over `[data-testid=timer-pad]`.

**N4. Dark theme: dimmed and lit stickers are hard to tell apart.**
- Where: every highlight state in dark. Shots: `deep/L-corners-guided.tl.dark.png`, `deep/L-ycross-shapes.tl.dark.png`, `deep/Y-hint.tl.dark.png`.
- Wrong: with `dimMix 0.52 / dimSaturation 0.55`, dimmed red, blue and green stay strong, and dimmed yellow becomes mustard that sits near lit orange. In the white-corners step the lit corner does not stand out from the dimmed red stickers next to it. In the Free-play hint it is unclear what is lit. Light theme is fine.
- Fix: in dark, raise `dimMix` to about 0.7 and lower `dimSaturation` to about 0.35. Also give lit stickers a slightly brighter emissive (+10%) so they "glow" without a glow effect. Check against the lit ring on white.

**N5. Notation: the first-ever arrow for F is drawn on the R face.**
- Where: Notation → Do it, first question F. 1024×768 light. Shot: `deep/N-prompt.tl.light.png`.
- Wrong: the arrow runs down the R face's left column, which is technically part of the F layer. A beginner reads it as "turn the right side", and the R label sits right next to it. This is the moment the child first maps a letter to a face.
- Fix: for single-face moves in Notation (and the primer), draw the arrow as a curved clockwise arc on the face itself (F: on the front face round its centre). Keep the edge-strip placement for lessons, where the layer is the point.

**N6. Yellow-cross shape tiles and other diagrams sit below the fold while the left column is empty.**
- Where: lessons, idea and "your cube" beats, 1024×768. Shots: `deep/L-ycross-shapes.tl.light.png` (the four tiles start at y 580 and are cut by the footer), `deep/L-daisy-real.tl.light.png` (the "Seen from above" panel pushes the steps under the footer). Below the stage there is about 150 px of unused column.
- Wrong: the best teaching visuals of the round are inside the scrolling text card while the space under the stage is empty.
- Fix: when a beat has a diagram (TopView, shape tiles), render it in the left column under the stage or the "now" strip, at 120–140 px. The text card then holds only words and options.

**N7. Shape tiles do not show the shape.**
- Where: yellow cross, shapes beat, all sizes. Shot: `deep/L-ycross-shapes.ph.light.full.png`.
- Wrong: the tiles show the whole top face in full colour "from real cubes", stray yellow corners and all. In "Dot" the four yellow corners plus the centre read as an X; in "L" six yellows hide the L. The text says "ignore the corners", but the picture does not.
- Fix: draw corners in the dimmed neutral and edges plus centre in full colour (the same highlight rule as the 3D cube), with a 2 px outline round the yellow edge shape. Keep the "real cube" version as a hover or second state if wanted.

**N8. Learn map still uses half the width at 1024.**
- Shot: `raw/learn-seeded.tl.light.png`.
- Wrong: the map is a 120 px column of nodes plus text, and the right 45% of the content is empty under the StageTracker. With node art this good, it should be the show-piece page.
- Fix: alternate text sides at ≥1024 px and swing the path across the full width (S8 as written). Grow nodes to 112 px.

### Polish

- **P-a. Four "done" signals at once on pattern made.** Moment card, "Collected" pill, "You made it!" pill on the stage, and green "That is the Checkerboard…" text (`deep/P-made.tl.light.png`). Keep the card and the stage pill. Show "Collected" only after the card leaves, and drop the green sentence.
- **P-b. The trophy room panel is a gradient** (warm in light, navy in dark), against "the stage is the only place a gradient is allowed" (`raw/progress-seeded.ph.dark.png`). Use `surface` with the standard shadow.
- **P-c. "New" on every earned badge,** including ones earned 6 days ago (`raw/progress-seeded.tl.light.png`). Show "New" until the badge's modal has been opened once, or for 24 h.
- **P-d. Full solve still shows the full-width "You are peeking ahead" banner** (`deep/L-full-solve-mid.tl.dark.png`). Use the same chip as the lessons.
- **P-e. Lesson card sticky footer cuts content mid-line.** The card does fade, but on 1024 the text is clipped at the footer edge with no visible fade in light theme (`deep/L-daisy-real.tl.light.png`). Strengthen the fade to 32 px.
- **P-f. Solve walk "Solved!" card is still a stat card** (`deep/S-walk-finished.tl.light.png`). After the milestone leaves, the resting state could show the solved cube doing a slow victory turn, not two grey tiles.
- **P-g. Notation comparison cards:** the coloured "YOU DID / WE ASKED FOR" header band takes 36 px above the mini (`deep/N-wrong.tl.light.png`). Put the label as a chip over the mini's top-left and give the space to the cube.

---

## The changes that would most raise the "wow" now

1. **Seamless page transitions (M-new-1).** Overlap enter and exit and morph the page title. This is a small change that every tap benefits from, and it is the clearest remaining break in "fluid".
2. **Put the child's cube at the centre of the milestone (N2).** A 240 px cube doing its victory spin under "You solved the cube", with a second confetti beat when the XP lands. This is where an 11-year-old decides the site is cool.
3. **Fit every stage page to the viewport (M-new-2, N1, N6).** Nothing important below the fold at 1024×768: timer result row, Free-play actions, lesson diagrams in the empty column under the stage.
4. **Fix dark-theme dimming (N4).** Night use is half the brief, and in dark the "lit piece" teaching device currently barely works.
5. **Learn map as a full-width S-curve (N8).** The cube fills up layer by layer down the page. The art already exists; it needs the stage.
