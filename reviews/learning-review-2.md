# Rubikku — learning review 2 (kid's-eye and cubing teacher)

Second review, after the lessons rework and the integration pass. Reviewed the frozen build `snap2/dist`, served locally, on a 1024×768 touch tablet with phone spot checks at 390×844. I also read every word of `src/features/learn/content/*.ts`, `quiz.ts`, `completion.ts`, the hint texts in `src/cube/beginner/solver.ts` (case names and explanations), `HOLD_WORDS` / `describeHold` in `src/cube/notation.ts`, `RECOVERY_RULES`, the step labels in `engine.ts` (`LABELS` and `NEUTRAL`), and the copy in Home, Timer and Solve my cube.

How it was checked:

- **Every lesson screen as a picture.** All 156 screens of the nine lessons were captured on the tablet, each with its panel text and the cube state behind it. Stages 4 and 8 and every "Now on your cube" step were looked at with the words and the picture side by side. Also captured: Home, the Learn map, the capstone, Solve my cube (`/solve?where`), Timer and Play, plus five phone screens.
- **The recognition rounds against an independent oracle.** A script read each quiz cube's raw stickers, worked out the answer itself without any app code, tapped that answer and recorded whether the app agreed. That covered 39 questions across stages 2–8, and the app agreed every time. The 8 daisy questions were cross-checked a different way: the case the app named was always one present on the cube.
- **Teaching claims against `cubejs`.** Checked: two triggers put the corner back twisted with white sideways; six triggers restore the cube; every "five in a row" set-up is the exact inverse of its algorithm; the yellow-cross line → cross → L (back-left) → line cycle; the opposite-edges case gives an adjacent pair after one Edge Swap from any of the four holds; from none-home, one Corner Cycle from any hold leaves exactly one corner home; and the stage 7 example corners are what the text says (orange/blue/yellow against yellow/orange/blue centres; yellow/green/red against yellow/blue/red). All correct. The algorithms themselves are unchanged and were verified last time.
- **Tried by hand on the tablet.** Free top turns and off-plan turns in the name-only daisy and cross exercises; choosing the wrong side in stage 4; starting the yellow-cross algorithm from a wrong hold; turning the whole cube mid-twist in stage 8; hints in drills (3 levels) and in name-only exercises; "Stuck?" and "It doesn't — I'm stuck" on a real-cube step; tapping Done on a real-cube step; the wrap-up of an untouched stage.
- Scripts and screenshots are in `scratchpad/review-kid2/` (see the appendix). The server I started was stopped. Nothing in the project was built or changed apart from this file.

## Verdict

1. **Yes, probably: with this site alone, this boy would now learn to solve the cube in his hands.** Every stage ends on his own cube with a picture to check against. There is one hold, one white-corners method, a recognition round for every real decision, and recovery rules for slips. All of it is accurate: no algorithm, hold, count or quiz answer is wrong.
2. Of the earlier items, 7 of the 8 Must-fixes are fixed and 1 is mostly fixed. Of the 14 Should-fixes, 8 are fixed, 4 partly fixed and 2 not fixed (case-based drills; the 54-sticker rescue). I found no teaching regressions.
3. **He is still most likely to give up at stage 4 on his real cube.** The screen now teaches the left/right choice well. But the "Now on your cube" step leaves out the two situations that actually stop children: the T forms on another side, and every top edge has yellow because an edge is stuck in the middle layer.
4. The second exit is being lost mid-solve. The deep rescue ("Where is my cube?") is still painting 54 stickers in a white-up hold, and then the walk-through starts at "Turn 1 of 151".
5. The third is stage 8: turning the whole cube by accident. The recovery rule asks him to find a "scrambled column" that does not look like a column on a real cube.

**Do not change:** the "Which is it?" rounds (fast, honest, and the "why" lines teach); the stage 7 twisted example plus its contrast screen; the trigger-only stage 3 with counting out loud; "Five in a row" with fading help; the primer's six-trigger self-check; the stage 8 lesson structure; the calm slip message ("Turn it straight back with `R′`, or tap Undo"); and the wrap-up that tells him plainly what is still to do ("Stage 1 is not finished yet… 0 of 6 done").

## Earlier items — status

| # | Earlier item | Status | Evidence |
|---|---|---|---|
| M1 | Lessons never use his real cube | **Fixed** | Primer opens with "Get your cube" and ends with a real six-trigger self-check. Every stage has a "Now on your cube" step (picture, numbered steps, checks, Done / "It doesn't — I'm stuck") and "Keep it like this — stage N starts here". There are "On your cube:" tips on the move and trigger screens. The gaps are in the content of two steps (new MF1, SF7). |
| M2 | Lit/dimmed picture hides what the text compares | **Mostly fixed** | Centres are lit wherever the text compares with them (stage 3 "home", stage 6 look/count/swap, stage 7 check). Mirrors are on in stage 6 ("The Edge Swap" now shows back and left). The dim is a pale pastel, not brown. Left over: stage 4 "Right or left?" says both centres are lit but the left one cannot be seen, the lit target slot shows the stickers of the piece sitting in it (SF3), and lit white stickers are lost among the dimmed ones (SF4). |
| M3 | He never makes the hard decisions | **Fixed** | Eight recognition rounds (`daisy-case` … `twist-next`), 5–6 right answers each; 39 answers checked against raw stickers, 0 wrong. Name-only exercises use neutral names ("Send the edge to its side", "Hold the shape the right way"), and Hint in stage 4 shows "U′ · Make the T", not the side. The stage 7 example is now twisted, and "And one that is not" is the contrast screen. |
| M4 | A stage completes with nothing done | **Fixed** | `completion.ts`: every guided exercise and quiz done, plus one practice cube at least half his own turns or the real-cube step. An untouched wrap-up says "Stage 1 is not finished yet … 0 of 6 done". First Steps is now awarded for finishing the primer. XP is not rebalanced as suggested: lesson 80, real cube 60, quiz 20 (Nice NF7). |
| M5 | Contradictory holds | **Fixed** | Primer: "yellow centre on top, white underneath. Always … To start, put green in front". The Home hero is yellow-up. Timer: "Scrambles are written for white on top … roll the cube over so yellow is on top". Solve my cube: "For copying the colours, hold it white on top … we'll roll it to yellow-up to solve". The rescue route still needs that flip (MF2). |
| M6 | White corners taught two methods, practised the wrong one | **Fixed** | Trigger-only main line: "Five in a row: the trigger", "trigger — three times. Count them", "2 or 4" for twisted. The "cross looks broken" warning is added. Shortcuts and the Left Trigger sit in an optional "Faster ways in" after the real-cube step, and the wrap-up puts them under "Faster ways (optional)". Left over: the name-only step reads "White Corner Insert × 2" (SF9). |
| M7 | "Tap Hint" is the only recovery | **Fixed** | "Three rules for your real cube" screen at the end of stage 3. "On your real cube" rules at the top of every Stuck? sheet (seen in stages 4 and 6). "My white layer broke!" uses the suggested replacement copy. Left over: rule 2 overpromises (SF11), and the deep rescue is heavy (MF2). |
| M8 | Guided exercises punish free moves | **Fixed** | Solver-based exercises are judged by result. U, U, D, D′ in the name-only daisy are accepted silently, and three top turns in the name-only cross too. A real slip gets "That was `R`. That moved a petal, or an edge you had dropped. Turn it straight back with `R′`". All three earlier copy mismatches are gone. Left over: wrong *decisions* get the same "you broke it" message (SF1). |
| S1 | Animations play before he reads | **Fixed** | Demos and info screens wait on a Watch button. Goal screens rest on "Before" with "Watch it happen". |
| S2 | 17-screen primer, B on a tablet | **Mostly fixed** | 15 screens. The real cube and the trigger are in it. B is no longer an exercise (one sentence on "The other faces"). F2 moved to stage 2, D to stage 8. Still six single-move exercises before any solving. |
| S3 | `z2` / `y` chips | **Fixed** | "Roll the whole cube upside down. Keep the same side facing you…" with a Turn it button and one curved arrow; "Turn left / Turn right" chips with carousel words. |
| S4 | One repetition of 8-move algorithms | **Fixed** | "Five in a row" for the trigger, middle right and left, yellow cross, Edge Swap and Corner Cycle, with help fading and "the last two from memory"; middle inserts taught as two halves. |
| S5 | Stuck-edge cure vague | **Fixed** | "Hold the stuck edge at the front-right. Do the 'to the right' moves — `U R U' R' U' F' U F` — without looking at what is on top…" |
| S6 | Daisy cases 3/4 knock petals | **Fixed** | Case 4 and the recap both say "Before any side turn, look at the spot above that face." |
| S7 | Shapes only in perspective | **Fixed** | Top view beside the cube in stages 1, 5, 6 and 7. "Look only at the edges" shows the four shapes as tappable top views with stray corners. The quiz asks "Is it held right?" |
| S8 | Drills meet the hard cases rarely | **Not fixed** | `drillState` is still a random cube solved to the stage start, and mastery is still 3 clean random cubes. "New cube" lets him reroll until he gets an easy one. |
| S9 | Using the site with a cube in hand | **Partly fixed** | Added: a "now" strip under the cube with a big move chip and words, Space for Done on real-cube steps, and the Turn it button. Not added: a larger cube (still about 240 px with mirrors on), a "Follow on my cube" mode, speech, or labels on the mirrors. The playback bar in demos is still below the fold. |
| S10 | Solve my cube is a heavy rescue; "151" | **Not fixed** | `/solve?where` opens straight into sticker entry, white on top. `WalkPanel` still shows "Turn {n} of {total}". Escalated to MF2. |
| S11 | Adult labels | **Partly fixed** | "slot", "column" and "parked" are defined; the stage 8 tip is reworded; "Petal Drop" is now "Then drop it". New generic labels: "Turn the top to line it up" in stages 1, 3, 5 and 8, and "White Corner Insert" (SF9). |
| S12 | Rewards not tied to what matters | **Partly fixed** | Real-cube steps give their own moment. The capstone has an "I solved my real cube!" milestone. Not fixed: the stage 8 real-cube Done (his actual first solve) gets only the smaller moment (SF10); the day-one daily challenge is still "Make a pattern"; "Left-handed and all" is still in a success line. |
| S13 | Losing the hold handled only in stage 8 | **Fixed** | "Check first: yellow centre on top" in the first exercise of stages 3–7; rule 3 "Everything went wrong at once?" in every Stuck?. |
| S14 | Hints give the whole answer at once | **Fixed (drills)** | Drill hint in 3 taps: "Which case is this? / How should you hold it?" → case and reason → moves, with "Help 2 of 3 · the moves cost the star". In name-only exercises Hint still gives a bare move with no reason (NF4). |
| N1 | "What next" after the capstone | Not fixed | The capstone links only to the Timer. |
| N2 | Arrows cover lit stickers | Partly fixed | Mostly fixed; the stage 8 "Lost count?" arrow lies over the workbench's white sticker (NF2). |
| N3 | Home slot lights its occupant | Not fixed | Stage 4 "Right or left?" lights the red/green piece in the target slot (SF3). |
| N4 | "Tuck the L" after the dot | Fixed | "The L appears already tucked into the back-left — go straight on." |
| N5 | Six-trigger self-check | Fixed | It is the primer's real-cube step, and a tip in stage 3. |
| N6 | Count out loud; when to take a break | Fixed | "down, left, up, right — one"; "Stop only when a corner has just shown yellow on top." |
| N7 | Reverse drag problem | Fixed | The primer's Stuck? covers both directions. |
| N8 | Printable cheat sheet | Not fixed | None. |
| N9 | "Up late" greeting | Not fixed | `HomePage.tsx:37`. |

## Beginner cliffs — updated

| # | Cliff | Verdict | What is there now | What is still missing |
|---|---|---|---|---|
| i | Daisy: middle / bottom-down / top-flipped / bottom-flipped | **Handled well** | Four cases, the petal-spot warning in Case 4 and the recap, a case quiz, free order accepted | The lit white edge is hard to pick out (SF4) |
| ii | White cross: match before drop, and why | **Handled well** | The wrong-drop demo, "Which centre? Drop it now?" quiz, any petal order | — |
| iii | White corners: under / twisted / wrong slot; trust the repeat | **Handled well** | Trigger only, counted out loud, "1, 3 or 5" and "2 or 4", a quiz on "Home / twisted / another corner's home", five in a row | Real-cube step lacks "no white corner on top" (SF7); step name gives away the count (SF9) |
| iv | Middle layer: left or right; edge stuck or flipped | **Well on screen, weakly on the real cube** | "Right or left? You decide" (6 answers, including "Neither — it has yellow"), neutral step names, five in a row each way, exact kick-out copy | Real-cube step (MF1); wrong side reported as "broke the layers" (SF1); left centre invisible (SF3); wrong cause in a Stuck? entry (SF6) |
| v | Yellow cross: dot / L / line, ignoring corners; holds | **Handled well** | Top view everywhere, the four-shape figure, a shape quiz plus "held right?" | Starting from a wrong hold is reported as "broke the bottom two layers" (SF1) |
| vi | Yellow edges: what "matches" means; opposite case | **Handled well** | Centres lit, mirrors, top view, a count quiz plus "match, hold or swap?", an unaided opposite exercise | Real-cube step has no opposite case (SF7); counting questions are nearly all "1" (NF1); a stray Sune card (SF8) |
| vii | Corner places: home but twisted; none home | **Handled well** | Twisted example plus contrast, "never two, never three" (verified), a quiz that is mostly twisted corners plus "none" | — |
| viii | Final twist: looks broken; top only; 2 or 4; last top turn | **Handled well** | Unchanged structure, a twist meter, the "Keep twisting or turn the top?" quiz, break advice | Accidental-rotation rule is unreliable on a real cube (SF5); first-solve celebration (SF10) |
| ix-a | A wrong move mid-algorithm | **Handled** (rescue heavy) | Slip rule from the primer on; "Lost? Back to the last stage that is still whole" | Deep rescue is 54 stickers (MF2); rule overpromises (SF11) |
| ix-b | Losing the hold without noticing | **Handled well** | One hold everywhere, check lines in stages 3–7, rule 3, "Hold the cube the way it was" when he turns the cube mid-twist on screen | — |

## New findings

### Must fix

#### MF1. Stage 4 "Now on your cube" leaves out the two things that stop children at stage 4
- **Where:** Middle layer → Your cube (`middleLayer.ts`, beat `cube`), steps 2–3.
- **What he experiences:** step 2 says "Find a top edge with **no yellow**. Turn the top until its front sticker sits on its centre: the T." On his own cube the matching centre is usually on another side. Turning the top makes the T on the left or the back, but step 3 ("Its top sticker says the side. Right: `U R U' R' U' F' U F`…") assumes the T is in front of him. Nothing tells him to turn the whole cube first. "Front sticker" is also wrong for an edge that is not at the front. The next stall is worse: after two or three edges, every edge left on top has yellow, because one is in the middle layer in the wrong slot or flipped. The real-cube step does not mention this case at all. The only fix is in the Stuck? sheet, which he only opens once he has already decided he is stuck.
- **Why it matters:** the earlier review named stage 4 on the real cube as the most likely place to give up, and the screen lesson now handles it well ("Its centre is on another side? Turn the cube", "Stuck in the wrong middle slot"). But the real-cube step is the one moment he has no hint, and it covers only the easy case.
- **Fix:** replace the steps with:
  1. "Yellow centre on top, white layer underneath."
  2. "Find a top edge with **no yellow**. Look at its side sticker and turn the top until that sticker sits above the centre of the same colour."
  3. "Turn the whole cube round (not over) so that T faces you."
  4. "Read its **top** sticker. Same colour as the centre on the right: `U R U' R' U' F' U F`. On the left: `U' L' U L U F U' F'`."
  5. "Every top edge has yellow, but the middle is not done? One edge is stuck in the middle layer. Hold it at the front-right, do the 'to the right' moves once to pop it out, then send it in properly."
  6. "Four edges. Then turn the cube round and check every side."

  Add the check: "An edge in the middle layer the wrong way round? That is step 5 too."

#### MF2. When he is lost on his real cube, the rescue is still 54 stickers, white on top, "Turn 1 of 151"
- **Where:** "It doesn't — I'm stuck" on every real-cube step → Stuck? sheet → "Where is my cube?" → `/solve?where`. Also the capstone's "Lost? Where is my cube?".
- **What he experiences:** the Stuck? sheet now opens with the recovery rules, which is good. But if those do not tell him where he is, the only button paints his cube sticker by sticker. It starts with "Hold the cube with the white centre on top and the green centre facing you". He has been told for eight stages never to tip the cube over, and now he must: mid-solve, with his cube half done. When the walk-through starts, the counter reads "Turn 1 of 151".
- **Why it matters:** now that every stage is done by hand, "where am I?" is the question he will ask most, and the answer costs five minutes and a broken rule. A child who is lost and then faces 54 stickers stops for the day.
- **Fix:** put a 20-second route at the top of the Stuck? sheet and of `/solve?where`: **"Which picture looks most like your cube?"** Show the eight "after" pictures the real-cube steps already use (`afterStageState`), plus "None of these". A tap opens that stage's real-cube step and Stuck? list. Keep the sticker entry under it as "Check it exactly (54 stickers)". In the walk-through, replace "Turn 1 of 151" with "Stage 3 of 8 · about 12 turns".

### Should fix

#### SF1. A wrong *decision* is reported as "you broke it"
- **Where:** guided exercises judged by result, in stages 4–7 (tested in stages 4 and 5).
- **What he experiences:** in yellow cross "From an L" he forgets to tuck the L and starts the algorithm. He presses `F` and hears "That was `F`. That broke the bottom two layers. Turn it straight back with `F′`". Then "2 moves off the plan… 3 moves off the plan." The lesson has just told him this algorithm "is built to leave the bottom two layers alone". In stage 4 "Which way? You choose" he makes the T and starts the wrong-side algorithm (`U` is accepted as a free top turn, then `R`): "That was `R`. That broke the layers you had finished." The panel also flips back to "Make the T".
- **Why it matters:** these exercises exist to practise the hold and the side. When he gets it wrong, he is told he broke something, not that he chose wrong. He learns "`F` is wrong", which is false, and the decision is never named.
- **Fix:** when the move he made is the first move of the stage's algorithm (or of the other-side algorithm) and the hold or side is wrong, say so. Stage 5: "Right algorithm, wrong hold. Undo `F`, then tuck the L into the back-left first." Stage 4: "That is the right-hand version, but this edge's top sticker is green — the left centre's colour. Undo, then go left: `U' L' U L U F U' F'`." Stage 6: "Not yet — the matching pair is not at the back and right." Stage 7: "The home corner is not at the front-right yet."

#### SF2. On the tablet, quiz answers and the real-cube Done button are below the fold
- **Where:** every "Which is it?" round and every "Now on your cube" step at 1024×768. The first answer button sits at y = 696 in stages 5–6 and y = 748 in stage 7 (of 768); "Done — it looks like the picture" is at y = 704 even in the short primer step.
- **What he experiences:** he reads the question, looks for the answers, and has to scroll the side panel, often with a cube in the other hand. On the real-cube steps the steps, the checks and both buttons need a scroll; at the bottom of the screen he only sees "Later".
- **Fix:** in quiz beats, put the question and answer buttons straight under the title and fold the body text and top-view caption ("Seen from above. The front is at the bottom…" repeats on every screen) behind a small "?" icon. On real-cube steps, pin Done and "I'm stuck" in the footer in place of "Later".

#### SF3. Stage 4 "Right or left?": one centre cannot be seen, and the target lights the wrong stickers
- **Where:** Middle layer → "Right or left?" (beat `which-way`); also the stage 4 quiz.
- **What he experiences:** "It is the colour of the centre on the right, or of the centre on the left — both are lit." Only the right centre is visible; the left face is hidden and the mirrors are off. "The lit slot is where this one is going" lights the red and green stickers of the piece that happens to be in the front-right slot. A bright red sticker beside the blue T looks like part of the answer.
- **Fix:** turn the mirrors on for this beat and for the `middle-side` quiz. Mark the target slot with an outline or a ghost of the edge, not by lighting its current occupant (the old N3). This also applies to "Every corner has one home" (`step: 'target'`).

#### SF4. A lit white sticker disappears among the dimmed ones
- **Where:** stage 1 quiz, Case 1–4 demos, stage 2 and 3 screens where the lit piece's key sticker is white (seen on tablet and phone).
- **What he experiences:** "Each cube has one white edge lit. Where is it?" The dimmed stickers are pale pastel and the lit one is white, with a white outline. In the first daisy question the lit edge is one white sticker on the far column of the right face, and it looks like the dimmed stickers around it.
- **Fix:** give lit pieces an outline that contrasts with white (the accent blue or dark ink). Or for white pieces, dim to a mid-grey rather than pastel. A gentle pulse on the asked-about piece would also do.

#### SF5. "Turned the cube by accident?" asks him to find a column that is not a column
- **Where:** stage 8 "Turned the cube by accident?", its tip, its Stuck? entry and the real-cube check.
- **What he experiences:** "The scrambled column — the three pieces under the workbench — has to be at the front-right." On a real cube, after one or more Corner Twists the wrong stickers are not one column. `cubejs`: after one round, stickers are displaced at the front-right, the back-right and the back-left of the bottom (`R0 R3 R8 F5 F8 D2 D5 D8 L6 B7 B8`). A child who guesses the wrong side makes the bottom unrecoverable, in the stage where the cube already looks wrecked.
- **Fix:** use the centres, which never move. In "One corner at a time": "Before your first twist, say the colour of the front centre out loud — that side stays facing you until the cube is solved." Then "Turned the cube by accident? Turn it back until that same centre faces you again, yellow on top. Carry on." Use the same line in the real-cube check and in Stuck?.

#### SF6. Two stage 4 sentences are wrong
- **Where:** "Its centre is on another side? Turn the cube" and the Stuck? entry "The edge went in, but it is the wrong way round."
- **What he experiences:**
  - The first says "no turn of the top can make a T here". A top turn *does* make the T, just on another side.
  - The second says the cause is "It was sent to the wrong side, or the T was not made first." Sending an edge to the wrong side puts it in the other slot, the wrong slot, not flipped (`cubejs`: the green-orange edge sent left lands in the front-left slot with green on the front). A flipped edge comes from going before the T was made.
- **Replacement copy:**
  - "This edge's side colour is not the front centre's colour, so its T would form on another side. Turn the **whole cube** until the centre of that colour faces you. Then make the T and send the edge in."
  - Problem: "An edge went into the wrong slot, or in the right slot the wrong way round." Fix: "Wrong slot: it was sent to the wrong side — check the top sticker before you go. Wrong way round: the T was not made first. Either way: hold it at the front-right, do the 'to the right' moves once to pop it out, make the T, and send it again."

#### SF7. The stage 3 and stage 6 real-cube steps stop at the easy case
- **Where:** White corners → Your cube; Yellow edges → Your cube.
- **What he experiences:** stage 3 starts with "Find a white corner on top". After two or three corners he often has none on top, because one is stuck below in the wrong slot or twisted, and the step does not say what to do. Stage 6 says "Two match? Turn the whole cube… so they are at the back and on the right." When the two that match are opposite each other, he cannot do that, and the step is silent.
- **Fix:**
  - Stage 3: add "No white corner on top, but the layer is not done? One is stuck below. Turn the cube so it is at the front-right and do one Right Trigger to pop it up."
  - Stage 6: add "The two that match are opposite each other? Do the Edge Swap once from any side, then count again."

#### SF8. Stage 6 wrap-up teaches a second algorithm the lesson never mentions
- **Where:** `yellowEdges.algorithms: ['yellow-edge-swap', 'sune']`. The wrap-up's "Your new algorithms" shows Edge Swap, then a **Sune** card ("Moves three of the yellow-cross edges round one place each…").
- **What he experiences:** his "new algorithms" are two near-identical eight- and seven-move sequences with different names. This is the same problem the Left Trigger card had in stage 3 last time.
- **Fix:** remove `sune` from this lesson's cards, or move it to `optional` with the line "The Edge Swap is the Sune plus one more turn of the top. You do not need the Sune."

#### SF9. Step names that do not fit the stage, or give the answer away
- **Where:** the default setup label `'Turn the top to line it up'` (`engine.ts`), shown in daisy (Case 1 "If the petal spot is taken", name-only exercise), white corners (park), yellow cross (lay the line flat) and final twist (next corner). Also white corners "A twisted corner, with less help", whose step list reads "White Corner Insert × 2".
- **What he experiences:** "line it up" with what? Nothing is being lined up in those stages. In the name-only corners exercise the body says "count your triggers" but the step list gives the answer (× 2), under a name ("White Corner Insert") the lesson never uses; it calls the move the Right Trigger.
- **Fix:** add per-case labels to `LABELS`:
  - daisy: "Turn the top: empty spot above"
  - white corners: "Park it: turn the top"
  - yellow cross L/line: "Hold the shape right"
  - final twist next corner: "Top only: next corner to the workbench"
  - drop: keep "Match: turn the top"

  In name-only exercises show "Right Trigger until white faces down" with no count.

#### SF10. His first real solve gets the small celebration
- **Where:** stage 8 "Now solve your cube" → Done gives the "moment" card "Stage 8 by hand" (+60 XP). The "You solved your real cube!" milestone (`real-cube-solved`) fires only from a second button on the capstone page.
- **What he experiences:** the step itself says "You solved your cube! Go and show someone", then he gets the same card as every other stage. If he later taps "I solved my real cube!" on the capstone, the same solve is celebrated again.
- **Fix:** let the stage 8 Done fire `real-cube-solved`, the first-solve milestone, and count it in `capstone.realSolves`. On the capstone, show "Solved once so far" with a "Solved it again!" button.

#### SF11. Recovery rule 2 promises too much
- **Where:** `RECOVERY_RULES[1]`, the stage 3 rules screen.
- **What he experiences:** "You never lose more than a stage or two." A slipped Corner Cycle can break the yellow edges and cross (stages 5–6). Losing his place mid-twist in stage 8 leaves only the white cross whole, and dropping back from stage 8 to stage 3 is five stages. A child who believes "a stage or two" and then finds five gone feels it is his fault.
- **Replacement copy:** "Do not guess. Look at the cube: which stage is the last one that is still whole? Start again from the stage after it. It feels like a big step back, but each stage goes much faster the second time."

### Nice to have

- **NF1.** Stage 6 "How many match?" questions are nearly all "1" (the first three asked were all 1). The useful answer, "2", hardly comes up. Make the counting questions alternate 2, 1, 2, 0.
- **NF2.** Stage 8 "Lost count in the middle?" tells him to look at the workbench, but lights the yellow corner underneath, and the arrow covers the workbench's white sticker. Light the workbench corner too and move the arrow.
- **NF3.** Daisy "If the petal spot is taken": the petal that would be knocked off is dimmed. Light it, because the screen is about it.
- **NF4.** In name-only exercises, Hint shows a bare move ("`U′` · Make the T · Top face, anticlockwise"). Add the solver's one-line reason, as the drill hints do.
- **NF5.** Stage 7 "Check all four" asks him to check but never gives the answer for the cube on screen. Add: "Here: none of them."
- **NF6.** Stage 7 Corner Cycle demo lights the three corners that move, but the text talks about the home corner. Add: "The three lit corners are the ones that travel."
- **NF7.** XP still pays more for finishing a lesson (80) than for doing the stage on his own cube (60). Swap them.
- **NF8.** Hint appears twice on guided screens (the now strip and the panel); keep the one in the strip.
- Carried over, still open: case-based drill stars (S8); a bigger cube on tablets with labelled mirrors, and a "Follow on my cube" mode (S9); hide the day-one daily challenge, and change "Left-handed and all" (S12); a "What next" path after the capstone (N1); a printable one-page cheat sheet (N8); drop "Up late" (N9).

## Per-lesson scorecard

Scores out of 5. Screens = beats in the lesson as built.

| Lesson | Screens | Clarity | Pacing | Visual support | Practice | Real-cube bridge |
|---|---|---|---|---|---|---|
| 0 Meet your cube | 15 | **5** — the hold is stated once, correctly, with the exceptions explained | **4** — shorter and has a payoff, but still six single-move screens before any solving | **4** — the labelled hold screen is excellent; the white bottom mirror is almost invisible | **3** — single moves and one trigger | **5** — "Get your cube", then six triggers that check themselves |
| 1 The daisy | 18 | **5** — four real cases and a one-line rule | **4** — goal, cases, quiz, three exercises, drills, real cube | **3** — the top view helps; the lit white edge is hard to find (SF4); "line it up" label | **5** — any order accepted, slips named calmly | **4** — clear steps and checks; "Keep your cube just like this" |
| 2 White cross | 14 | **5** — "Match first. Then drop." plus the wrong-drop demo | **5** — tight | **4** — centres and petals lit; the cube is small with mirrors on | **4** — quiz plus free-order exercises | **4** — "look underneath" check is right |
| 3 White corners | 24 | **5** — one method, counted out loud | **3** — 24 screens; the optional seven come after the real-cube step, so they read as more lesson | **4** — centres lit, quiz with mirrors | **5** — five triggers, counted inserts, a twisted-corner exercise | **3** — no "no white corner on top" line (SF7) |
| 4 Middle layer | 19 | **4** — two-halves chant, top-sticker rule; two wrong sentences (SF6) | **3** — 19 screens with a lot of demos before he decides | **3** — left centre invisible, occupant lit (SF3) | **5** — five each way, a 6-answer quiz, "You choose" | **2** — the real-cube step misses both common stalls (MF1) |
| 5 Yellow cross | 15 | **5** — "Look only at the edges", the shapes figure | **4** | **5** — top view on every screen, the four-shape figure | **4** — good quiz; a wrong hold gets "broke the bottom two layers" (SF1) | **4** — complete and correct |
| 6 Yellow edges | 15 | **4** — "match, hold, swap" is clear; the Sune card muddies it (SF8) | **4** | **4** — centres lit, mirrors on, top view; the cube is small | **4** — quiz plus the opposite case done alone; counts nearly all "1" | **3** — no opposite case (SF7) |
| 7 Place the corners | 17 | **5** — the twisted example plus a contrast screen is exactly right | **4** | **4** — centres lit, top view, mirrors | **5** — a mostly-twisted quiz, the none-home case done alone | **4** — "Say the colours out loud" is good |
| 8 Final twist | 19 | **5** — still the best lesson on the site | **4** | **4** — twist meter; "Lost count" lights the wrong piece (NF2) | **4** — quiz plus three exercises | **3** — the accidental-turn rule is unreliable on a real cube (SF5); first-solve celebration (SF10) |

## Appendix — what was run

Everything is under `/tmp/claude-31381/-home-sujay-narayana-thoughtspot-com-rubikku/5df0888d-3ec6-412a-9841-6aab1967a4ad/scratchpad/review-kid2/`:

- `beats.mjs`, `second.mjs` — every lesson screen at 1024×768 → `shots/<lesson>--<beat>.png`; panel text and cube state → `panels.txt`.
- `quiz.mjs` — the independent quiz oracle → `quiz.txt` (`quiz-run1.txt` is the first run, used for the daisy cross-check), plus `shots/quiz-*.png`.
- `interact.mjs`, `interact2.mjs` — free moves, wrong side, wrong hold, the whole cube turned mid-twist, hints, Stuck?, real-cube Done → `interact.txt`, `interact2.txt`, `shots/x-*.png`.
- `pages.mjs` — Home, Learn, the capstone, Solve, Timer, Play and phone screens → `shots/p-*.png`, `pages.txt`.
- `v1.cjs`–`v5.cjs` — `cubejs` checks (triggers, five-in-a-row set-ups, the yellow-cross cycle, what the twist disturbs, the opposite-edges case, the none-home cycle, wrong-side insert).
