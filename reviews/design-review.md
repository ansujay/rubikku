# Rubikku — design review (snapshot `snap1/dist`)

Reviewed: the frozen build only, served locally, driven with Playwright (headless Chromium, software GL).
Viewports: tablet landscape 1024×768 (primary), tablet portrait 768×1024, phone 390×844, desktop 1440×900; light and dark; new user and seeded mid-journey user.

Screenshots cited below are all in
`/tmp/claude-31381/-home-sujay-narayana-thoughtspot-com-rubikku/5df0888d-3ec6-412a-9841-6aab1967a4ad/scratchpad/review-design/shots/`
(file names only in the text). Naming: `tl` = 1024×768, `tp` = 768×1024, `ph` = 390×844, `dt` = 1440×900.

What I could not judge: frame-level smoothness. The machine was under heavy load and rendering in software, so captured sequences ran at roughly 10 fps. Motion comments below come from the choreography visible in frames plus the motion code, not from measured frame rates. The theme-toggle circle reveal could not be captured at all (View Transitions do not screencast headless); it is implemented as DESIGN.md describes, but it is unverified visually.

## Verdict

1. I would ship the foundations (tokens, keycaps, type, the dark theme, the Solve-my-cube flow) but not the product as "super cool" yet: it is a clean, competent learning app, not a memorable one.
2. The cube is not yet the star. On the primary tablet it is about 240 px wide in lessons and about 170 px in the guided solve, with dead space beside it, and its own overlays and arrows cover the pieces being taught.
3. The moments that should be the pay-off are the weakest part: a level-up is two small toasts, finishing the last stage is a green callout, and on the timer the reward toasts cover the time you just set.
4. Features built separately show it: five different "8 stages" trackers, decorative rainbow tiles that break DESIGN.md's own colour rules, and two pages (Timer, Progress) that read as a grown-up analytics dashboard.
5. The gap to "super cool" is not more polish on what exists. It is three things: a bigger, unobstructed cube; teaching visuals that show the idea (goal states, top views, legible arrows); and a real celebration system.

Do not change: the keycap/sticker language, the three typefaces, the dark theme's surfaces and text contrast (every dark text pair I measured passes AA), the Solve-my-cube face-by-face entry and "my cube doesn't match" recovery, and the full-screen timer while solving.

Counts: 8 Must fix, 14 Should fix, 12 Polish.

---

## Must fix

### M1. Timer result is covered by its own reward toasts
- **Where:** Timer, just after stopping, seeded user. 1024×768 light and 390×844 dark.
- **Shots:** `T-result.tl.light.png`, `T-result.ph.dark.png`
- **Wrong:** Up to three toasts ("New badge: Under Three", "New badge: Under Two", "+60 XP") stack bottom-centre, directly over the time display, the "Let go to start" hint and the OK/+2/DNF/Delete row. On the phone the time is completely hidden. The one number the page exists for is unreadable for the whole toast lifetime.
- **Change:** On the Timer, do not use floating toasts for results. Render rewards inline inside the timer card, under the time: one row with the "New personal best" pill and each new badge as a 40 px sticker with its name, XP as a count-up next to the time. Globally, toasts must never overlap `[data-testid=timer-pad]`; cap the stack at one visible toast with a "+2 more" counter, and anchor it to the top of the content column as the CSS comment in `components.css` already says it should be.

### M2. Notation "You did / We asked for" comparison cubes are squashed and tiny
- **Where:** Notation → Do it → wrong answer. 1024×768 light and dark (same at 3.5 s after the answer, so not a mid-animation frame).
- **Shots:** `N-wrong.tl.light.png`, `N-wrong.tl.dark.png`, zoom `crop-notation-minis.png`
- **Wrong:** Both mini cubes render about 35 px wide by 70 px tall (wrong aspect ratio), pale, pinned to the top-left of 143×200 px tinted cards that are otherwise empty. This is the single teaching visual for a mistake and it looks broken.
- **Change:** Render each mini as a square, at least 120×120 px, centred in the card, same camera as the main cube. Light only the layer that turned and draw the turn arrow on it. Reduce the card height to about 170 px so the mini and its move chip fill it.

### M3. Guide arrows are white, and disappear on white and yellow stickers
- **Where:** every guided step and demo. Examples: Notation asks for **B** as the first ever question and the arrow is a faint white sliver on white stickers at the back edge; lesson "White corners" guided step, where the arrow starts on top of the lit white sticker it refers to; primer "L goes down" on phone.
- **Shots:** `N-prompt.tl.light.png`, `L-corners-guided.tl.light.png`, `L-primer-move-l.ph.light.png`, `S-walk-step.tl.light.png`
- **Wrong:** The arrow is a fat white band with a thin dark outline. On white or yellow stickers (the top face in most lessons) it has almost no contrast, and it is wide enough to hide the stickers of the layer being turned, including the highlighted piece. Back-face moves have no visible arrow at all.
- **Change:** Fill the arrow with the action blue (`--cube-blue`) in both themes, with a 2 px white inner stroke and a 1 px dark outer stroke so it reads on all six colours. Limit the shaft to 40% of a sticker's width. Start the arrow one sticker past the highlighted piece, never on it. For B (and any move whose layer faces away), either rotate the camera about 35° so the back layer is visible for that step, or switch the mirrors on automatically and draw the arrow in the mirror.

### M4. Stage controls sit on top of the part of the cube being taught
- **Where:** lessons (guided and drill beats), all sizes; worst in stage 8, whose working corner is front-right-bottom, exactly under the "CUBE" rotate pill. Also Free play on phone, where the "Drag a sticker…" hint chip covers the cube's bottom edge.
- **Shots:** `L-twist-try1.tl.light.png`, `L-primer-move-l.ph.light.png`, `play.ph.light.png`
- **Wrong:** The top-right toolbar and the bottom-right "↺ CUBE ↻" pill are absolutely positioned over the canvas. In the final-twist step the lit corner and both arrows are partly hidden behind the pill. On the phone the pill covers the cube's bottom-right corner in every guided step.
- **Change:** Take the whole-cube rotate control out of the canvas: put it in a 48 px control row directly under the stage (left: ↺ CUBE ↻, right: layers / mirrors / reset view). If any control stays inside the stage, the camera fit must reserve a safe area (56 px top and bottom, 16 px sides) so the cube never renders under it. Show the Free-play drag hint for 4 s on first visit only, then remove it.

### M5. In guided steps the instruction is below the fold while the prose is above it
- **Where:** lesson guided beats on 1024×768 and on phone; also the very first primer beat on phone.
- **Shots:** `L-corners-guided-wrong.tl.light.png` (the R U R′ row is cut by the Back/Skip bar), `L-corners-guided.ph.dark.png` and `L-primer-move-l.ph.light.png` (no move keycap visible at all), `primer.ph.dark.png` (tip callout cut in half by the bar)
- **Wrong:** The card shows title and paragraph first, then the error message, then the move keycap and sequence. The sticky Back/Next bar and the permanent yellow "You are peeking ahead" banner take another 110 px. Result: on the primary device the next-move chips are clipped, and on the phone the only thing that says what to do is off-screen while the cube is on-screen.
- **Change:** In guided and drill beats, pin a one-line "now" strip directly under the stage (same on all sizes): big keycap for the current move plus its plain-English line ("Top face, anticlockwise"). Collapse the paragraph to its first sentence after the first move. Show the wrong-move message in that same strip, not above the sequence. Turn the "peeking ahead" banner into a small chip next to the lesson title. Give the card `max-height: calc(100dvh - header)` with its own scroll and a fade above the sticky bar, so nothing is ever cut mid-element.

### M6. Solve entry: an unpainted cell looks the same as a white sticker (light theme)
- **Where:** Solve my cube → Whole cube entry, light theme, 1024×768.
- **Shots:** `S-entry-free.tl.light.png`, zoom `crop-net-empty-vs-white.png`
- **Wrong:** Empty cells are cream (about `#f8f4ec`) and white stickers are `#ffffff`, both with the same dark grid line. Measured ΔE is 5.7; at arm's length they are the same. A child cannot tell which cells still need painting, and white is one of the six answers.
- **Change:** Use the treatment the dark face-by-face grid already has: empty cell = sunken neutral (`--surface-sunken`), 1.5 px dashed border, centre dot. Painted white = solid white keycap with the `--cube-white-edge` bottom edge. Apply to the net, the single-face grid and the 3D paint surface.

### M7. The celebrations do not match the achievements
- **Where:** level-up and badge (two toasts); last lesson wrap-up "You can solve the cube" (a green callout and a bullet list); real cube solved in Solve my cube (a card with two stat tiles); pattern made (a green line of text).
- **Shots:** `motion-toast-levelup.png`, `L-twist-wrap.tl.light.png`, `S-walk-finished.tl.dark.png`, `P-made.tl.dark.png`, `N-summary.tl.light.png`
- **Wrong:** The biggest moments in the product look like routine status messages. Confetti exists but is stock `canvas-confetti`, duplicated in `features/play/celebrate.ts` and `features/timer/celebrate.ts` with different particle counts, and the cube itself never reacts. For an 11-year-old, finishing the last stage and getting a toast is the point where "cool" is decided.
- **Change:** Build one celebration module in `src/ui` with three tiers, and delete the two copies.
  - *Tick* (clean rep, correct answer): what exists now.
  - *Stage moment* (lesson complete, pattern collected, new badge): the cube does one 360° spin with a layer ripple (about 900 ms), the stage border flashes green once, the badge appears as a 96 px keycap that presses in, XP counts up beside it. No toast.
  - *Milestone* (first full solve, real cube solved, level-up, all eight stages): a 1.5–2 s full-content-area takeover: the solved cube large and centred, headline in Bricolage 48–60 px ("You can solve the cube"), confetti in the six cube colours emitted from the cube, then the badge and one primary button. Skippable by tap; reduced motion gets the static card.

### M8. The cube is too small where it teaches, and stages are not sized to the screen
- **Where:** lessons at 1024×768 (stage 360×360, cube about 240 px, about 170 px of empty page below both columns); guided solve at 1024×768 (stage 365×275, cube about 170 px, while the child is copying turns onto a real cube); lessons at 768×1024 (stage 628×346 with a 240 px cube and 200 px empty below the card); Free play at 1440×900 (stage 560×420, lower 340 px of the screen empty); Notation at 1024×768 (500 px void under the stage in the left column).
- **Shots:** `L-ycross-shapes.tl.light.png`, `S-walk-step.tl.light.png`, `primer.tp.light.png`, `play.dt.dark.png`, `notation.tl.light.full.png`
- **Wrong:** DESIGN.md rule 1 is "the cube is the star". In the two flows where the child must read the cube precisely, it occupies under a quarter of the screen width and shares the fold with unused space.
- **Change:** Size every stage from the viewport: height = `min(column width, 100dvh − page header − controls row)`. Lessons and the solve walk at ≥1024 px: stage column 55–60% of the content width (about 440 px at 1024, cube about 330 px), text card 40–45%. At 768 portrait: stage full width and 440 px tall, camera zoomed so the cube is about 340 px. Free play at ≥1280 px: stage fills the available height (min 640 px), with the move input and history in a right column. Notation: make the stage column sticky so it travels with the right column instead of leaving a void.

---

## Should fix

### S1. Navigation flashes an empty page and a spinner
- **Where:** any first visit to a route; captured Home → Timer at 1024×768.
- **Shot:** `motion-page-nav.png` (frames at +367 ms and +483 ms are an empty content area; +600 ms shows a spinner)
- **Wrong:** The old page exits in 120 ms, then the lazy route chunk loads behind a bare spinner. The nav pill slides nicely while the content area is blank. This is the opposite of "fluid". (Timing was exaggerated by machine load, but the blank-then-spinner sequence is by construction: `Suspense fallback={<PageLoading />}` in `AppShell.tsx`.)
- **Change:** Prefetch all route chunks on idle after first paint. Navigate inside `startTransition` so the current page stays until the next one can render. If a fallback is still needed after 300 ms, show a skeleton with the page title and a stage-shaped block, not a spinner.

### S2. Dimmed stickers turn to mud
- **Where:** every highlight state: lesson beats, hint in Free play, the "find the slip" check in Solve.
- **Shots:** `L-middle-guided-name.tl.light.png`, `L-primer-centres.tl.light.png`, `S-check-typo.tl.dark.png`, `Y-hint.tl.dark.png`
- **Wrong:** Unlit stickers are darkened versions of their colour: brown, olive, navy, grey-brown. In the light theme the cube looks dirty, and red, orange and yellow become the same brown. In Free play a whole-cube rotation hint dims every sticker although nothing is being singled out.
- **Change:** Dim by desaturating about 85% towards a neutral that matches the stage (light: around `#d5d1c7`; dark: around `#2c303a`), keeping a trace of hue. Lit stickers keep the white rim. Do not dim at all for whole-cube rotation steps.

### S3. Tablet portrait navigation is ten unlabelled icons
- **Where:** 768×1024, every page, both themes.
- **Shots:** `home-seeded.tp.dark.png`, `primer.tp.light.png`
- **Wrong:** The sidebar collapses to a 76 px rail with no labels. Several icons are not self-explanatory (R-in-a-square, stacked squares, wand, grid). Tooltips do not exist on touch. The theme toggle becomes a single icon at the very bottom-left that cycles three states with no label.
- **Change:** Below 900 px use a labelled rail (icon plus a 11–12 px label, about 84 px wide), or reuse the phone pattern (bottom tab bar plus the top bar with streak, XP and the theme button). Keep the theme control in the same place on every breakpoint: top-right on phone and portrait tablet, bottom of the sidebar on landscape, each with a text label on first use ("Light / Dark / Auto").

### S4. Five different trackers for the same eight stages
- **Where:** Home "Your path" (large stickers joined by lines), Learn map (cube thumbnails on a path), Full solve (small numbered chips in a grey panel), Solve walk (small chips with soft-green ticks), Progress (a checklist), Algorithms section headers (number stickers in assorted colours).
- **Shots:** `home-seeded.tl.light.full.png`, `L-full-solve-mid.tl.light.png`, `S-walk-step.tl.light.png`, `progress-seeded.tl.light.full.png`, `algorithms.tl.dark.full.png`
- **Wrong:** Same job, different shape, size, done-state and current-state each time. Done is a solid green keycap on Home, a pale green chip in Solve, a green square in Progress.
- **Change:** One `StageTracker` primitive in `src/ui` with `sm` (32 px) and `md` (56 px) sizes: done = green, pressed in, check; current = blue, lifted, number; to do = neutral, number. Use it in Home, Full solve, Solve walk and Progress. Algorithms headers use the neutral number sticker.

### S5. Decorative rainbow colour, against DESIGN.md's own rules
- **Where:** Home "Jump in" (six tiles in blue, orange, green, red, yellow, white); Progress "By the numbers" (six tiles, six colours); Algorithms stage headers (white 2, green 3, orange 4, yellow 5, red 6, blue 7, green 8); Settings section icons (five colours).
- **Shots:** `home-seeded.tl.light.full.png`, `progress-seeded.tl.light.full.png`, `algorithms.tl.dark.full.png`
- **Wrong:** DESIGN.md: "Colour is information, never decoration", "at most two cube colours in one component", red means error. Here red marks "Algorithms" and "Yellow edges", green marks "Timer". It dilutes the colour jobs that the rest of the app works hard to keep.
- **Change:** Neutral (white-sticker) icons for navigation tiles, stat tiles and settings headers. Keep colour only where its job applies: orange on streak, yellow on XP/badges, green on completed counts.

### S6. Timer and Progress read as an adult analytics dashboard
- **Where:** Timer with history; Progress, seeded. All sizes.
- **Shots:** `timer-seeded.tl.dark.full.png`, `timer-seeded.ph.light.png`, `progress-seeded.tl.light.full.png`
- **Wrong:** Timer: six stat tiles (best, ao5, ao12, mo3, session mean, solves), a line chart, a table. There is no 3D cube on the page; the scramble preview is a 170 px flat net of 5 px-gap squares. On the phone the scramble card fills the first screen and the timer pad starts at the fold. Progress: six stat tiles, a GitHub-style heat map, an activity log, then a wall of 22 grey dashed locked badges.
- **Change:** Timer: replace the net with a 3D mini cube (about 160 px) showing the scrambled state, tap to replay the scramble; show Best and Average of 5 large, put the other four numbers behind "More numbers"; on phone put the timer pad first and the scramble in a compact two-line strip above it. Progress: lead with the badge shelf as the hero, shrink "By the numbers" to one row of three, move the activity log behind a "History" disclosure.

### S7. Badges have no art
- **Where:** Progress badge grid and badge modal.
- **Shots:** `progress-seeded.tl.light.full.png`, `G-badge-modal.tl.light.png`
- **Wrong:** Every badge is a navigation icon on a coloured square; seven of the ten Learning badges are the same "layers" icon. "Daisy Maker" shows no daisy. Locked badges are identical grey tiles with dashed borders. The modal is a small icon, one sentence and a "Nice" button.
- **Change:** Stage badges use a mini cube render of that stage's goal state on a keycap (daisy, white cross, first layer…). Speed and streak badges get a number on the sticker ("5:00", "7"). Locked badges show the silhouette plus progress towards it ("3 / 10 solves" ring). Modal: badge at 160 px, the date, one line on how it was earned, and the next badge in that family.

### S8. The Learn map hides the best picture the method has
- **Where:** Learn, new and mid-journey, all sizes.
- **Shots:** `learn.ph.light.full.png`, `learn-seeded.tl.dark.full.png`
- **Wrong:** Completed and current stages show 64 px full-colour scrambles that all look alike; locked stages are grey ghost cubes. A new user sees one coloured cube and seven grey ones. At 1024 px the right third of the map is empty and the path wiggles by about 20 px.
- **Change:** Each node shows that stage's goal state with only the solved part lit and the rest neutral, so reading down the path you see the cube fill up layer by layer. Locked nodes use the same render at 45% opacity with the lock chip. Node size 96 px on tablet, 80 px on phone. Let the path swing across the full content width in a real S-curve, with the text alternating sides at ≥1024 px.

### S9. Algorithm cards do not show the case
- **Where:** Algorithms list, new user.
- **Shot:** `algorithms.tl.dark.full.png`
- **Wrong:** Thumbnails are 60 px fully coloured cubes; the pieces the algorithm is about are not distinguishable. Every description is cut with "…" after two lines. All fourteen cards carry a "Learning" pill although "0 of 14 practised".
- **Change:** Thumbnails use the highlight treatment: only the pieces the algorithm moves are lit, with a small arrow for where they go. Replace the truncated paragraph with an authored one-liner of 60 characters or fewer. Status pill: nothing until first practise, then "Practised", then "Mastered".

### S10. Phone solve entry: palette and grid cannot be seen together
- **Where:** Solve my cube → Face by face, 390×844.
- **Shot:** `S-entry-guided-top.ph.dark.png`
- **Wrong:** Mode switches, palette, face tabs, the "Start with the top face" explainer and its paragraph come before the 3×3 grid, which starts at about 620 px. Scrolling to the grid pushes the palette off-screen, so painting means scrolling up and down.
- **Change:** After the first face, collapse the explainer to one line with a "?" to reopen. Make the palette sticky under the top bar (56 px row). The grid should be fully visible above the tab bar with the palette pinned.

### S11. Light theme: two colour pairs fail WCAG AA
- **Where:** light theme, all pages.
- **Measured:** `--ink-subtle` `#74767d` on `--bg` `#f4f1ea` = 4.02:1, used at 12–14 px ("Locked for now", stage descriptions on Learn, eyebrow labels, locked-badge hints); it is exactly 4.50 on white surfaces. White text on `--cube-green` `#1fae58` = 2.90:1 ("Collected" pill at 12 px, stage number stickers, the "G" chip at 11 px, the F face marker). Disabled buttons at 45% opacity are about 2.8:1 (acceptable as disabled, but "Reset" in Free play looks absent).
- **Change:** Darken `--ink-subtle` to about `#686a71` (≥4.7 on bg). On green stickers use near-black text, as the dark theme already does, or use `--cube-green-edge` `#13803d` as the fill when the text is white.

### S12. Spatial ideas are explained in words where a diagram is obvious
- **Where:** lessons, especially stages 1 and 5–8.
- **Shots:** `L-daisy-goal.tl.light.png` (the daisy is on the foreshortened top face and does not read as a daisy), `L-ycross-shapes.tl.light.png` ("a dot, an L, a line, or the finished cross" in text, one cube)
- **Wrong:** The owner asked for "extremely rich in terms of visualizations". The lesson player has one visual, the 3D cube, and the top face is always seen at a shallow angle. The four yellow-cross shapes, the "matching edges are opposite" case and the corner-cycle direction are all top-view ideas.
- **Change:** Add a `TopView` primitive (flat 3×3 of the top face with the four side strips, about 120 px) and show it beside or under the stage for stage 1 and stages 5–8. The yellow-cross "shapes" beat becomes four tappable top-view tiles (dot, L, line, cross); tapping one sets the 3D cube to that case.

### S13. The notation game does not feel like a game
- **Where:** Notation → round in progress, 1024×768.
- **Shot:** `N-prompt.tl.light.png`
- **Wrong:** The prompt is a 72 px keycap in the corner of a card, ten 8 px grey dots, and three lines of keyboard instructions ("click the cube and type… Shift R") shown on a touch tablet. The lower half of the screen is empty.
- **Change:** Prompt keycap 140–160 px, centred above the cube or in the right column, entering with the `bouncy` spring. Progress as ten 20 px stickers that turn green or red and pop. Show a streak counter ("4 in a row"). Hide keyboard help when `pointer: coarse`.

### S14. A white face seen from below renders grey
- **Where:** primer "Layers, not faces", dark theme.
- **Shot:** `L-primer-layers.tl.dark.png`
- **Wrong:** The text says "the white face is finished" while the stickers on screen are mid-grey (about `#b0b0b0`), with one dimmed centre nearly black.
- **Change:** Raise the under light / hemisphere ground colour so a downward-facing white sticker stays at `#dcdcdc` or lighter in both themes.

---

## Polish

- **P1. Lesson card foot is square.** The sticky Back/Next bar has square bottom corners and a shadow strip under a card with 20 px radii. All sizes. `crop-lesson-card-foot.png`. Give the bar the card's bottom radius and clip the card.
- **P2. Stray arc beside "Badges".** An unlabelled yellow ring segment at the right of the heading looks like a loading spinner. `crop-badge-arc.png`. Put "8/30" inside it or remove it.
- **P3. Duplicate move chip.** In single-move guided steps the big keycap is followed by a second, smaller chip of the same move. `L-primer-move-l.tl.dark.png`. Hide the sequence row when it has one move.
- **P4. Home path labels collide at 768.** "Middle layer" runs into "Yellow cross". `home-seeded.tp.dark.png`. Label only done, current and next; or clamp to two lines at 11 px with a 6 px gap.
- **P5. Progress level card wraps badly.** "Layer / Maker" and "165 / 400 XP in / this level" at 1024. `progress-seeded.tl.light.full.png`. Ring 112 px, text column min 220 px, `text-wrap: balance`.
- **P6. Free play on phone: Reset drops to its own row** as a lone unlabeled icon. `play.ph.light.png`. Move it into the stage toolbar.
- **P7. "More" sheet theme switch:** "Match device" touches the right edge of the control. `C-more.ph.light.png`. Label it "Auto".
- **P8. Patterns cards:** the "+" button's meaning is unclear and every description is truncated with "…". `patterns.tl.light.full.png`. Drop the "+" (the card itself opens) and write one-line descriptions.
- **P9. Keyboard hints on touch devices.** "Space or → next turn · ← back" under the solve buttons and "click the cube and type" in Notation show on tablet and phone. `S-walk-step.tl.light.png`. Hide when `pointer: coarse`.
- **P10. Small targets and small text.** Learn "Review" (49×20) and "Peek ahead" (73×20) links, Algorithms "Lesson ›" (81×32), chart range tabs (36 px high), sidebar theme segments (66×36), phone XP pill (36 px high) are under the 44 px rule. Tab-bar labels, "Learning" pills, weekday letters and chart axes are 11 px against DESIGN.md's 12 px minimum label size.
- **P11. Cube surface is flat.** Stickers have almost no specular (`envMapIntensity: 0.11`), so the hero reads as vector art, not "matte tiles… a premium instrument". The light-theme floor grid is nearly invisible. `play.tl.light.png`. Add a soft top-edge bevel highlight and a little more key-light response; raise the grid to about 8% ink.
- **P12. Dark-theme red is coral** (`#ff5a5c`). Separation from orange is fine by measurement (ΔE 44 in both themes, so no red/orange defect), but it reads salmon rather than red on the cube. Try about `#f4484b`.

---

## Highest-impact upgrades, ranked by impact per effort

1. **A real celebration system (M7).** One module, three tiers, the cube itself celebrates. Touches every feature's pay-off for the cost of one component. Fixes M1 on the way.
2. **Bigger, unobstructed stage (M8 + M4).** Mostly layout and camera-fit changes in `CubeStage`, and every page improves at once.
3. **Arrow redesign (M3).** One change in the arrow material and placement logic; fixes legibility in lessons, notation, algorithms, hints and the guided solve together.
4. **Learn map that fills up (S8).** Reuse the existing mini renderer with highlight masks; turns the map into the clearest explanation of the layer method and removes the grey wall for new users.
5. **Top-view diagrams for stage 1 and stages 5–8 (S12).** One small primitive, large teaching gain; it is the "rich visualisation" the brief asks for.
6. **Badge art from cube renders (S7).** Same mini renderer again; makes Progress a collection a child wants to complete.
7. **Home hero that shows your cube, not a solved one.** For a mid-journey user, render the hero in the state they have reached (three stages lit, the rest neutral) and let it play the next stage's key move on idle. The first screen then says where you are without reading.
8. **Timer with a 3D scramble preview and inline PB moment (S6).** Removes the dashboard feel from the page a child will open most once they can solve.
