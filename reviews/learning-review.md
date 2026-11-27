# Rubikku — learning review (kid's-eye and cubing teacher)

Reviewed: the frozen snapshot `snap1/dist` on a 1024×768 touch tablet, with phone spot checks at 390×844, plus every word of `src/features/learn/content/*.ts`, `src/cube/algorithms.ts`, the hint texts in `src/cube/beginner/solver.ts` and the messages in `src/features/solve/checkModel.ts`.

How it was checked:

- **Algorithms and claims**: every algorithm, hold and count in the lessons was replayed on an independent cube engine (`cubejs`). All of them are correct (details in "Accuracy" below).
- **Screens**: 63 of the 132 lesson screens were captured on the tablet (all of the primer, the daisy and the white cross; white corners up to "At home, but twisted"; the key idea screens of stages 5–7), and about half of those were inspected as pictures alongside their text. Also captured and inspected: Home, the Learn map, Free play, a drill hint in stages 1, 4, 7 and 8, the "Stuck?" sheet, the capstone with a hint, the whole Solve my cube flow with the pretend cube, and four phone screens. The machine was heavily loaded, so the remaining lesson screens — most of stage 4 and stage 8 — were judged from the lesson text, the panel text and the player source. Findings that rest on a picture I did not see are marked "(from source)".
- **Tried by hand**: a wrong move in a fully helped exercise; a top turn in the name-only white-cross exercise; Hint in a name-only exercise, in drills, in Free play and in the capstone.
- **Not checked**: the Timer, Patterns, Progress, Settings and Algorithm pages beyond their copy; sound; real touch-drag feel (moves were made with the keyboard hook).
- **Not re-reported**: the bugs already in `reviews/code-review.md` (drill "has come undone" banner, hints flip-flopping mid-step, Wrap-up tap completing a lesson, Home skipping the primer, daily challenge stub).

## Verdict

1. **With the site alone, he would learn to solve the cube on the screen, and probably not the one in his hands.** The lessons never ask him to pick up his real cube; the first mention is one sentence after the capstone.
2. The teaching itself is accurate: every algorithm, hold and "it takes 2 or 4" claim checks out, and the final-twist lesson handles the hardest moment of the method better than most printed guides.
3. **He is most likely to give up at stage 4 (middle layer) on his real cube**: the left/right choice is made for him on screen, he gets one guided repetition of each 8-move algorithm, and when the white layer breaks the advice is "Tap Hint", which does not exist on a real cube.
4. The second likely exit is stage 7 (placing corners): the hardest recognition task in the method gets one example, and that example is not twisted.
5. The site rewards arriving at the end of a lesson, not being able to do the stage: every exercise and drill can be skipped and the stage still "completes" with 120 XP and a badge.

**Do not change:** the stage 8 lesson's structure ("It looks broken. It is not.", the workbench, top-only rule, "Lost count?", "Turned the cube by accident?"), the "Why matching matters" wrong-drop demo in the white cross, and the calm tone of the off-path message ("No harm done. Undo it, then do `U`.").

## Accuracy of the teaching

Checked on an independent engine, yellow on top, white underneath:

| Claim in the lessons | Result |
|---|---|
| `F R U R' U' F'`: line held left-to-right → cross; line pointing at you → back to a dot | Correct |
| L tucked back-left → line already lying left-to-right; L a quarter turn out → another L | Correct |
| Dot → L, from any side | Correct (the L arrives already in the back-left, so "tuck it" needs no turn) |
| `R U R' U R U2 R' U` swaps front and left cross edges, keeps back and right | Correct |
| "There is always a turn where exactly two match" (or all four) | Correct (4 of 6 cases give an adjacent pair, 1 an opposite pair, 1 is solved) |
| `U R U' L' U R' U' L` keeps the front-right corner and all edges, cycles the other three | Correct |
| Corners at home: "one, none or all four — never two, never three" | Correct once the edges are lined up |
| `R' D' R D`: 2 or 4 rounds; white on the workbench after an odd number; 6 rounds is the identity | Correct |
| Right Trigger: 1, 3 or 5 from above the slot; 2 or 4 from twisted in the slot; 6 restores the cube | Correct |
| `R U R'` (white right), `F' U' F` (white front), `R U2 R' U' R U R'` (white up) | Correct |
| Middle inserts `U R U' R' U' F' U F` and `U' L' U L U F U' F'`; "top sticker = colour of the side it travels to" | Correct |
| Primer directions: U slides left, D slides right, L goes down, F top moves right; clockwise always defined "looking at that face" | Correct |

Two statements are wrong or only sometimes right; both are in finding M5: "For the whole method, hold the cube like this: … green facing you", and the white-on-top hold used by Home, Solve my cube and the Timer.

## Must fix

### M1. The lessons never use his real cube
- **Where:** every lesson. The only mentions of a real cube in Learn are the footer of the path ("Cube stuck half-way?") and one sentence after the capstone ("Now do it on your own cube").
- **What he experiences:** nine lessons of dragging a picture. Each exercise starts from a prepared cube that his own cube cannot match, so even a keen child who wants to follow along cannot. After the "You can solve the cube" wrap-up he picks up his real cube for the first time and meets, all at once: no lit pieces, no arrows, no undo, no mirrors, stiff turns and a cube that is not in the app's starting position.
- **Why it matters:** recognising cases on a real cube and making turns with fingers are the two skills the method consists of. Neither is practised. This is the single biggest reason he might "finish" the site and still not be able to solve his cube.
- **Fix — carry one real cube through the whole path.** Stages build on each other, so his real cube can hold the state between lessons:
  1. Primer, new first screen: **"Get your cube"**. Copy: "Go and get your cube. Scramble it — twenty random turns. You are going to solve it, one stage at a time, alongside this app."
  2. Primer move screens: after each on-screen move, one line: "Now do `R` on your cube. Then `R'` to put it back."
  3. After "Try the trigger" (stage 3): "On your cube: do the Right Trigger six times. If your cube is back how it started, you did all 24 moves right." This is self-checking and children love it.
  4. A new beat after the drills of every stage, **"Now on your cube"**, before the wrap-up. Copy for stage 1: "Pick up your cube. Yellow centre on top. Build the daisy. No arrows this time — use the four cases. When you have four white petals round the yellow centre, tap Done." Buttons: **Done — it looks like the picture** / **I'm stuck** (opens Solve my cube → "Where am I?"). Show the stage's "after" picture and the three most likely mistakes beside it.
  5. Tell him to **leave the cube as it is** until the next lesson: "Keep your cube like this. Stage 2 starts from your daisy."
  6. Give the real-cube step its own reward (see M4) and make the first real solve the biggest celebration on the site.

### M2. The lit/dimmed picture hides exactly what the text tells him to compare
- **Where (seen):** Primer "Layers, not faces"; White corners "Every corner has one home" and "Home not at the front-right?"; Yellow edges "Turn the top and count" and "The Edge Swap"; Place the corners "Check all four".
- **What he experiences:** the text says "check the two side colours against the two centres" / "count how many edges match their centres" / "none of them match their centres" — and the centres are dimmed to dark brown-grey, where orange and red look the same. In "The Edge Swap" the text says "the two matching edges are at the back and on the right", but those two are dimmed and the two *wrong* ones are lit; the back and left sides are not visible at all because the mirrors are off.
- **Why it matters:** these are the recognition screens of stages 3, 6 and 7. He reads a rule and cannot check it against the picture, so he learns the words, not the look.
- **Fix:** whenever a screen's text mentions a centre, light that centre (as "Every edge has two colours" and "Right place, even if twisted" already do). In "The Edge Swap", light all four cross edges and four side centres, and mark the matching pair with a tick rather than by dimming. Turn the mirrors on by default on any screen that talks about the back or the left. Make the dim less dark so colours stay readable.

### M3. He never makes the hard decisions himself — step names and lit pieces make them for him
- **Where:** all "Your turn" sections; worst in Middle layer, Place the corners, Yellow cross, Yellow edges.
- **What he experiences:**
  - Middle layer "Now send one left": the title, the body ("go left") and the step name ("Middle edge goes to the left") all give the answer. The left/right choice — the number one confusion of the method — is never once made by him before the drills.
  - Place the corners "Right place, even if twisted": the one example corner has yellow on top, orange in front, blue on the right, above yellow, orange and blue centres. It is **not twisted**. The hard case (a home corner whose colours are rotated) is never shown. In "Find it, hold it, cycle" the step name and the lit corner find it for him.
  - Yellow cross: one static L; no screen shows the four shapes side by side, and none asks him to name one.
- **Why it matters:** on a real cube the algorithm is the easy part; choosing which one, and how to hold the cube, is where children fail. The site practises execution and skips recognition.
- **Fix — add a short "Which is it?" round before the guided exercises of each stage** (tap an answer, instant feedback, 5–6 cubes, no moves):
  - Stage 3: "Tap the two centres this corner belongs between."
  - Stage 4: "Right or left?" — a T is made; he taps the side. Include one edge that has yellow ("Neither — it has yellow").
  - Stage 5: top-down pictures with yellow corners scattered about: "Dot, L, line or cross?", then "Is it held right?"
  - Stage 6: "How many match?" then "Which two?"
  - Stage 7: "Tap the corner that is at home" — mostly twisted ones, and one round with none.
  - In "name" scaffolds, change step names so they do not give the answer: "Middle edge goes to the left" → "Send the edge to its side".
  - Replace the stage 7 example with a twisted home corner and add a contrast screen: "This corner has yellow, orange and green. Its centres are yellow, orange and blue. Not home."

### M4. A stage "completes" with nothing done, and the rewards point the wrong way
- **Where:** every lesson. "Skip" replaces "Next" on every guided exercise and on the drills; the wrap-up then says "Stage 1 complete. Clean drills: 0 of 3." (seen).
- **What he experiences:** tapping Next/Skip sixteen times earns 120 XP, a stage badge and unlocks the next stage. Solving a drill cube unaided earns 15 XP. A "First Steps" badge pops up for opening a lesson.
- **Why it matters:** a 10+ year-old follows the points. The cheapest route to the next badge is to not practise, and each later stage assumes the earlier one is fluent. He arrives at stage 4 unable to do stage 3.
- **Fix:**
  - A stage completes when he has solved **one drill cube** (hints allowed) — or the real-cube step from M1. Reaching the wrap-up without that shows "Lesson read. Solve one practice cube to finish the stage." and still lets him move on ("Peek ahead" already exists for that).
  - Rebalance: lesson read 40 XP, first drill solved 40, stage done on the real cube 80, mastery star 40.
  - Drop the "First Steps" badge or move it to "finish Meet your cube".

### M5. The site contradicts itself about how to hold the cube
- **Where:** Primer "How to hold it" and its wrap-up; Home hero cube; Solve my cube intro; Timer scramble card.
- **What he experiences:**
  - Primer: "For the whole method, hold the cube like this: yellow centre on top, white underneath, **green facing you**." From stage 2 onward the lessons tell him to turn the whole cube so orange, blue or red faces him. A literal child tries to keep green in front, or thinks he has broken a rule.
  - The Home hero and Free play show white on top (seen). Solve my cube says "White centre on top, green centre facing you", then its first step is "Before we start · hold your cube like this… Roll the whole cube upside down" (seen). The Timer says "Start with white on top and green facing you."
  - A child who is lost mid-solve is holding yellow up, as taught. To be rescued he is told to turn the cube upside down, paint 54 stickers, then turn it back.
- **Why it matters:** "yellow up, white down, always" is the one rule that protects every algorithm in the method. It must be the only hold he ever hears, with the exceptions explained.
- **Fix:**
  - Primer copy: "For the whole method: **yellow centre on top, white underneath. Always.** Which side faces you will change — you will turn the whole cube like a carousel, but never tip it over. To start, put green in front."
  - Show the Home hero cube yellow-up.
  - Solve my cube: let him enter the cube yellow-up (the code already has a "Lock the six middles" switch for other holds) — or, at least, say why: "Just for copying the colours, hold it white on top. We will flip it back before we solve."
  - Timer: "Scrambles are written for white on top, green in front. After scrambling, flip it yellow-up to solve."

### M6. White corners teaches two methods and practises the wrong one
- **Where:** White corners, 20 screens; wrap-up shows six algorithm cards.
- **What he experiences:** "Trigger until it fits" is taught as the method that always works (two demos, one four-move try on a solved cube). Then "Three shortcuts" adds three more algorithms, one of them seven moves. Both helped exercises and all the hints use the shortcuts (the third exercise is unaided) ("These are the moves the hints in this app use"). He never once repeats the trigger by hand until a corner drops in. The wrap-up also shows a "Left Trigger" card that the lesson never taught.
- **Why it matters:** for a beginner one algorithm repeated beats three chosen. On his real cube he will fall back on the trigger — the thing he has not practised — and "trust it for up to five rounds" is exactly where children lose their nerve and stop.
- **Fix:**
  - Make the trigger the main line. "Your turn" 1: trigger a corner in from above (3 rounds), counting "one… two… three". "Your turn" 2: fix a corner twisted in its slot (2 or 4 rounds). "Your turn" 3: last two corners alone.
  - Move the three shortcuts to an optional section after the drills: "Faster ways in (optional)". Give hints a "trigger only" style for stage 3 until he opens that section.
  - Remove the Left Trigger card from this wrap-up, or teach it in one screen.
  - Add the missing warning: "Half-way through, your white cross looks broken. Finish the four moves and it comes back."

### M7. When something breaks, the advice is "Tap Hint" — which his real cube does not have
- **Where:** "Stuck?" in White corners ("the hint button will walk you back"), Middle layer ("Tap Hint: it will take you back…"), Yellow cross, Yellow edges, Place the corners, Final twist.
- **What he experiences:** on screen, fine. On his cube, a slipped move in an 8-move algorithm breaks the white layer and the site's answer is a button that only knows the virtual cube. The "Stuck?" sheet does have a "Help with my real cube" button (good), but it leads to Solve my cube: 54 stickers.
- **Why it matters:** every beginner slips a move several times per solve. Without a recovery rule each slip ends the session.
- **Fix — teach the three recovery rules once (new screen at the end of stage 3) and repeat them in every "Stuck?":**
  1. "Slipped one turn? Turn it straight back, then carry on." (Teach "undo = the same face the other way" on the real cube in the primer.)
  2. "Lost in the middle of an algorithm? Do not guess. Look at the cube: which stage is the last one that is still whole? Start again from the stage after it. You never lose more than a stage or two."
  3. "Before every algorithm, check: yellow centre on top?"
  - Replacement copy, Middle layer "My white layer broke!": "A move slipped, so a white corner is still out. Look at the bottom layer. If the cross is whole, find the white corner and put it back with the Right Trigger (stage 3). If a cross edge is out too, bring it up like a petal and drop it (stages 1–2). Then come back to the middle. On the screen cube, Hint will walk you through the same thing."

### M8. Guided exercises punish the very moves the lesson has just called free
- **Where (tested):** White cross "A whole cross, with less help"; Daisy "Your turn: finish this daisy" and "Again, with less help".
- **What he experiences:**
  - White cross teaches "Turning the top is free. It never disturbs the edges you have already dropped." In the name-only exercise he turns the top to look for a petal that matches. The panel turns pink: "That was `U`, not the next move. No harm done. Undo it and have another look." A second turn: "Off the path by 2 moves. Undo them one at a time and you are back on track." The exercise accepts only the app's own petal order ("Turn the cube to the orange side", then blue, then red).
  - Daisy says "Look, think, turn" and "there is no single right order", but both helped exercises follow one fixed list (U, R, U, F′). Any other sensible move — I tried `F` and `D` — gets "That was `F`, not the next move."
  - Asking for a hint in a name-only exercise gives a bare move: "F — Front face, clockwise. The front turns like a clock." No reason, no piece named. The good explanations in the solver ("The white-and-red edge is in the middle layer…") are not shown here.
- **Copy mismatches seen on the same screens:** Daisy "Again, with less help" says "Three steps to go" and lists five. White cross "with less help" says "the petal and its centre are lit" — nothing is lit. Daisy "Your turn: finish this daisy" says "watch where each lit edge goes" — nothing is dimmed and the arrow covers the edge.
- **Why it matters:** stages 1 and 2 are the intuitive stages. Being told "wrong" for a correct idea teaches him to wait for the arrow, which is the opposite of what these two stages are for.
- **Fix:** in stages 1 and 2, judge by result, not by path. Accept any move that does not lose a petal or a placed edge; top turns are always allowed. Speak up only when something is lost: "That knocked a petal off. Undo, then turn the top to an empty spot first." Let the step list re-plan from wherever he is. Show the solver's explanation sentence with every hint. Use a neutral colour for the off-path card, not pink-red. Fix the three copy mismatches.

## Should fix

### S1. Animations play before he has read the screen
- **Where (seen):** Primer "Layers, not faces"; White cross "Why matching matters"; every Goal screen.
- **Experience:** "Layers, not faces" says "none of them match their centres… Press Watch." By the time he has read the first line, the turn has already played, the cube shows the *finished* layer and the button says "Watch again".
- **Fix:** do not auto-play `show` animations. Start on the "before" picture with a pulsing **Watch** button. Goal screens may auto-play, but slower, and should rest on "Before".

### S2. The primer is 17 screens with no solving and no real cube
- **Experience:** Home says "It starts with a daisy" and sends him to stage 1; the Learn page sends him to 17 screens first. Nine of them are single-move exercises. "B turns the back" asks him to swing the cube round and drag a face he cannot see, "or press B on a keyboard" — on a tablet. B is used by no algorithm in the method; D only in stage 8.
- **Where he would skip:** from screen 3 or 4 ("Edges have two stickers") straight to stage 1. He would then not know: L goes down (needed in stages 4 and 7), what the 2 means, and "layers, not faces".
- **Fix:** cut to about 10 screens: your cube (with his real cube) → centres → edges and corners on one screen → pieces, not stickers → the hold → R → U → the mark → first algorithm (the trigger, on screen and then six times on his cube) → layers. Teach `F` and the 2 where stage 2 needs `F2`, `L` at the start of stage 4, `D` at the start of stage 8. Drop `B` from the path (leave it in the Notation trainer). Remove "or press B on a keyboard" on touch devices.

### S3. Whole-cube turns appear as `z2` and `y` chips that nobody taught
- **Where (seen):** Daisy "First: yellow on top" (chip "z2", caption "Whole cube, half turn (like F2)"); White corners "Home not at the front-right?" (chip "y").
- **Experience:** his first exercise of stage 1 shows a letter the primer never mentioned, compared with a move he has met once. Three large arrows overlap and cover most of the cube.
- **Also seen:** drill hints end in "y′" and "y2" chips. Solve my cube already does this properly: an icon and "Roll the whole cube upside down."
- **Fix:** show whole-cube turns as an icon chip with words, as Solve my cube does — "Turn the cube ↻" / "Roll the cube upside down" — never as letters. Caption: "Whole cube, a quarter turn to the left. Yellow stays on top." One curved arrow round the cube, not three across it.

### S4. The 8-move algorithms get one repetition each
- **Where:** Middle layer "Your turn" (one right, one left, then alone); Yellow edges and Place the corners (one full-help run each).
- **Why it matters:** an 8-move sequence needs about ten repetitions to stick in a 10+ year-old's fingers. Here he gets one with arrows and is then asked to recall it.
- **Fix:** add a "five in a row" beat for each new algorithm of four moves or more: same set-up five times, help fading each time (arrows → chips only → first move only → nothing → nothing, timed for fun). Teach the middle inserts as two halves with names he can say: "Away, up, back, down — then the front does the same." Link each algorithm card's practice mode from the lesson. Tell him to do the same five on his real cube with a solved cube — for example: set up a T on purpose, send the edge in, and check the white layer is still whole.

### S5. Middle layer: the stuck-edge cure does not say which moves to make (from source)
- **Where:** "Stuck in the wrong middle slot", "Right slot, wrong way round".
- **Experience:** "send **any** top edge into its slot, as if it belonged there." He has to work out that this means: hold the stuck edge at the front-right and do the right-hand insert, whatever is on top.
- **Replacement copy:** "Hold the stuck edge at the **front-right**. Do the 'to the right' moves — `U R U' R' U' F' U F` — without looking at what is on top. Whatever was at the top-front goes in, and the stuck edge pops up to the top. Now it is an ordinary edge: make the T and send it home."

### S6. Daisy: two of the four cases can knock a petal off and the lesson does not say so
- **Where:** "Case 3: on top, but white faces sideways", "Case 4: on the bottom, white faces sideways". ("If the petal spot is taken" only covers the swing-up of Case 1.)
- **Experience:** in Case 4, turning the side face to lift the edge throws off the petal above it. The hint text knows this ("Turning that face would knock off the petal above it…"); the lesson does not.
- **Fix:** add to Case 4: "First check the top spot above this face. If a petal is there, turn the top to move it out of the way." Add to the recap: "Before any side turn, look at the spot above that face. Petal there? Turn the top first."

### S7. Yellow cross: shapes are shown in perspective, one at a time
- **Where (seen):** "Look only at the edges" shows one L on a tilted cube.
- **Fix:** add a top-down 3×3 diagram beside the cube on every stage 5–7 screen, and one screen with the four shapes side by side, each with stray yellow corners so he learns to ignore them. Show the two holds as top-down pictures with a "you are here" mark for the front.

### S8. Drills meet the hard cases rarely, so "mastered" can mean "met three easy ones"
- **Where:** drills are random starts of the stage (`drillState`). By the numbers: the yellow dot appears in about 1 drill in 7, the opposite-edges case in about 1 in 5, and three clean drills can easily contain neither.
- **Fix:** make the three "clean" stars case-based where a stage has distinct cases: Yellow cross — one L, one line, one dot; Yellow edges — two adjacent, one opposite; Place the corners — one home, one twice, none home; White corners — one with a corner twisted in its slot, one with a corner in the wrong slot; Middle layer — one with a flipped edge. Show which case each star is for.

### S9. Using the site with a cube in his hands
- **Seen:** on a 1024×768 tablet the cube is drawn about 240 px wide inside a 360 px box, with a large empty band below it; with the mirrors on it shrinks to roughly 150 px. (Free play draws the same cube about 350 px wide.) In demos the playback bar is cut off below the fold of the text panel and needs a scroll. Every guided move needs a drag on the screen, so the real cube must be put down for each turn.
- **Fix:** let the stage fill the height (cube at least 480 px on a tablet). Pin the playback bar and the current move chip directly under the cube. Add a **"Follow on my cube"** mode to demos and guided beats, built like the Solve my cube walk-through: a full-width "Done — next move" button (and tap-the-cube), one move per tap, large move chip plus words ("Right side up"), default speed 0.5×, and a "Say it" toggle that speaks the move. Label the mirrors ("back", "left", "bottom").
- **Colours:** add one line to the primer: "Your cube's colours may be a different shade. If a colour is in a different place on yours — say red where the screen has orange — that is fine: always go by **your** centres."

### S10. "Solve my cube" is a heavy rescue for "where am I?", and its first number is "151"
- **Where (seen, with the pretend cube):** `/#/solve` → Colours → Where am I? → Solve it with me.
- **What is good:** the walk-through is the best cube-in-hand screen on the site: one big "Done — I've turned it" button, turns in words ("Roll the whole cube upside down"), "When you've turned it, you should have: yellow on top, green facing you", and "My cube doesn't match". "Where am I?" lists the eight stages, says what is done, and links to the right lesson.
- **What he experiences:** to find out which stage he is on, a lost child must paint 54 stickers, in a different hold from the one he was taught (M5). When the walk starts, the first thing above the cube is "turn 1 of 151".
- **Fix:**
  - Put a 20-second route in front of the sticker entry: "Which picture looks most like your cube?" — eight stage pictures (daisy, white cross, white layer, two layers, yellow cross, …) plus "none of these". A tap opens that stage's "Stuck?" list and lesson. Keep the full entry as "Show me exactly".
  - Replace "turn 1 of 151" with the stage count only ("Stage 1 of 8 · about 12 turns"). Nobody starts a job that says 151.

### S11. Step names and a few words are adult labels
- "Petal Drop" as a step name hides the half he forgets ("match"). Use "Match, then drop".
- "White edge on the bottom, facing sideways" → "Bottom edge, white on the side".
- "slot" is first used in "Meet the Right Trigger" without a definition; "parked corner" is used in "Three shortcuts" before "park" appears; "column" in the final twist ("the wrong column", "the scrambled column") is never defined. Add half a sentence each: "the **slot** — the empty place a piece drops into"; "the **column** — the three pieces under the workbench".
- Stage 8 tip: "Turn the whole cube now and the next twists land on the wrong column." → "If you turn the whole cube now, the bottom will not come back."

### S12. Rewards are not tied to the moments that matter
- The first solve of his **real** cube has no celebration of its own (only a badge inside Solve my cube, after 54 stickers). Add "I solved my real cube!" on the capstone page and on Home, with the biggest celebration on the site and a prompt to show someone.
- The Home daily challenge on day one is "Make something new: build a pattern" — a beginner cannot, and it competes with "Start stage 1". Hide the daily challenge until stage 3 is done, and draw challenges from what he has learned ("Build a daisy on your real cube in under a minute").
- Encouragement is mostly specific and good ("In. And the white layer is still perfect."). Two lines read as adult wit rather than praise: "Left-handed and all." and "No help needed." Suggested: "That was the left-hand version — the tricky one." / "You did that with no help."

### S13. Losing the hold is only handled in stage 8
- Stage 8 has "Turned the cube by accident?". Stages 3–7 have nothing, yet a cube tipped so yellow is in front makes every algorithm wreck the cube.
- **Fix:** one line in the first "Your turn" of stages 3–7: "Check first: yellow centre on top, white underneath." Add to each "Stuck?": "Everything went wrong at once" → "The cube was probably tipped over. Yellow centre on top? Then go back to the last stage that is still whole."

### S14. Hints give the whole answer at once
- **Where (seen):** Daisy drill, first tap on Hint: the piece is lit, the arrow is drawn, the text names the case, the reason and the move ("Turn the left face (L')"), and a "Show me" button will make the move for him. The card runs below the fold of the panel, so the move chip and "Show me" need a scroll.
- **What is good:** the sentence itself teaches ("The white-green edge is in the middle layer, with its white sticker on the front face…"). Keep it.
- **Why it matters:** one tap takes him from "stuck" to "done for me". There is nothing between, so a hint never becomes a nudge, and any hint costs the clean star.
- **Fix:** three taps. First: light the piece and ask "Which case is this?" Second: name the case and what has to happen ("It needs to swing up to the top"). Third: the move and the arrow. Only the third tap counts against a clean solve. Keep "Show me" for the third level only.

## Nice to have

- **N1.** After the capstone, a visible "What next" path: (1) solve your real cube three times, (2) time yourself, (3) "Faster ways" — skip the daisy, the corner shortcuts, the Left Trigger, (4) patterns. Home currently says only "the timer is waiting".
- **N2.** Stage 3 "White faces up": the arrow covers the white sticker the screen is about. Offset arrows from lit stickers.
- **N3.** The "home" highlight in "Every corner has one home" lights whatever piece is sitting in the slot, so it looks like a second lit corner. Draw an outline of the empty place instead.
- **N4.** Yellow cross "The dot: three rounds" says "Tuck the L into the back-left and go again". After the first round the L is already in the back-left. Say so: "The L appears already tucked into the back-left — go straight on."
- **N5.** "Six triggers put the entire cube back… Try it some time." Make it an exercise (see M1); it is the best self-check in the method.
- **N6.** Final twist: suggest counting out loud ("down, left, up, right — one") and add to the real-cube step: "If you stop for a break, stop only when a corner has just shown yellow."
- **N7.** The primer's "Stuck?" entry "The cube spins when I want to turn a layer" is the right problem; add the reverse ("A layer turns when I want to look round").
- **N8.** A printable one-page "cheat sheet" of the eight stages (picture, hold, moves) to keep beside the cube away from the tablet.
- **N9.** Greeting "Up late" at night is charming for an adult; for a child whose father set this up, drop it.

## Beginner cliffs

| # | Cliff | Verdict | What is there | What to add |
|---|---|---|---|---|
| i | Daisy: white edge on the bottom, flipped on top, in the middle | **Handled well** | Four separate cases with demos, "If the petal spot is taken", a one-line recap | Petal knock-off warning for Cases 3 and 4 (S6) |
| ii | White cross: match the side colour before dropping, and why | **Handled well** | "Every edge has two colours", the wrong-drop demo, "Match first. Then drop." | Light is missing in "with less help" (M8); rename "Petal Drop" (S11) |
| iii | White corners: under the slot / twisted in the slot / wrong slot; repeat up to 5 and trust it | **Handled weakly** | All three positions have a screen; "1, 3 or 5" and "2 or 4" are stated | Practise the repeated trigger by hand; shortcuts optional; "the cross looks broken mid-trigger" (M6); centres lit (M2) |
| iv | Middle layer: left or right; edge in the layer flipped or in the wrong slot | **Handled weakly** | Top-sticker rule, "top turns away from the slot", kick-out demos for wrong slot and flipped | He never chooses left/right himself (M3); one repetition per algorithm (S4); kick-out copy (S5) |
| v | Yellow cross: dot/L/line ignoring corners; holds | **Handled weakly** | "Ignore the corners", L back-left, line left-to-right, "going round in circles" in Stuck? | Four shapes side by side, top-down view, name-the-shape round (M3, S7) |
| vi | Yellow edges: what "matches" means; opposite case | **Handled weakly** | Definition of "matches", "match, hold, swap", opposite case demo and an unaided exercise | The counting screens dim the centres and hide the back and left (M2); a "how many match?" round (M3) |
| vii | Corner positions: right place but twisted; none right | **Handled weakly** | The three-colours rule, "never two, never three", none-home demo and exercise | The only example is untwisted; no contrast, no recognition practice (M3); centres dimmed in "Check all four" (M2) |
| viii | Final twist: looks destroyed; top only; never rotate; one early/one late; final top turn | **Handled well** | "It looks broken. It is not.", twist meter, workbench, top-only rule with the reason, "2 or 4, never 1 or 3", "Lost count?", "Turned the cube by accident?", "Last move: line up the top" | Real-cube run (M1); define "column" (S11) |
| ix-a | A wrong move mid-algorithm | **Handled weakly** | On screen: named, calm, one-tap undo | Nothing for the real cube; recovery rules (M7) |
| ix-b | Losing the hold without noticing | **Missing before stage 8** | Stage 8 only | A check line and a Stuck? entry in stages 3–7 (S13); one consistent hold (M5) |

## Per-lesson scorecard

Scores are out of 5. Lessons marked † were scored partly from text and source rather than from every screenshot.

| Lesson | Screens | Clarity | Pacing | Visual support | Practice | One-line reason |
|---|---|---|---|---|---|---|
| 0 Meet your cube | 17 | 4 | 2 | 3 | 2 | Clear and accurate, but nine single-move screens before any solving, B on a tablet, autoplay spoils "Layers", no real cube. |
| 1 The daisy | 16 | 4 | 4 | 4 | 3 | Best-shaped lesson; cases are the real ones; guided steps follow one fixed order in a stage that says there is none. |
| 2 White cross | 11 | 5 | 4 | 3 | 3 | The wrong-drop demo is excellent; mirrors make the cube tiny and "lit" pieces are not lit in the name-only exercise. |
| 3 White corners † | 20 | 3 | 2 | 2 | 2 | Two methods in one lesson; six algorithm cards; centres dimmed on the "home" screen; the robust method is never practised. |
| 4 Middle layer † | 15 | 3 | 3 | 3 | 2 | Good T and top-sticker rule; the left/right choice is given away and each 8-move algorithm gets one guided run. |
| 5 Yellow cross † | 12 | 4 | 4 | 3 | 3 | Holds are right and well worded; shapes shown one at a time in perspective; no naming practice. |
| 6 Yellow edges † | 12 | 4 | 4 | 2 | 3 | "Match, hold, swap" is a good chant; the counting screens hide the centres, the back and the left. |
| 7 Place the corners † | 13 | 3 | 3 | 2 | 2 | Rule is stated correctly; the one example is the easy untwisted corner; recognition never practised. |
| 8 Final twist † | 16 | 5 | 4 | 4 | 4 | Anticipates every panic point in the right order; needs only the real-cube run and a definition of "column". |

## Appendix — what was run

All under `scratchpad/review-kid/` of the session scratchpad (`/tmp/claude-31381/-home-sujay-narayana-thoughtspot-com-rubikku/5df0888d-3ec6-412a-9841-6aab1967a4ad/scratchpad/review-kid/`):

- `verify.cjs` — independent algorithm checks with cubejs.
- `shots/` — screenshots: `<lesson>--<beat>.png` for lesson screens, `route_*.png` for pages, `x-*.png` for the interaction tests, `ph-*.png` for the phone.
- `panels.txt` — the text of every captured lesson panel; `interact.txt` — messages and hint texts from the interaction tests.
- The static server on port 4233 was stopped; nothing in the live source was built, run or changed.
