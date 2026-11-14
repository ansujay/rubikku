# Rubikku — design direction

## Concept: the cube is the interface

A speedcube is a precise, tactile object: matte tiles, tight gaps, a click when a layer lands.
Rubikku's UI is made of the same stuff. Surfaces are quiet paper (day) or a dim desk at night;
the things you can press are **keycaps** — a face sitting on an edge that sinks when you push
it; the things that carry meaning are **stickers** — rounded squares in one of the six cube
colours. It should read as a well-made game menu or a premium instrument, not a dashboard and
not a cartoon. An 11-year-old should think "this is cool"; a designer should find nothing
shouting.

Three rules hold it together:

1. **The cube is the star.** Every cube sits on the same lit *stage* (`CubeStage`). Chrome
   around it stays neutral so six saturated colours never fight six more.
2. **Every colour has one job.** Colour is information, never decoration (table below).
3. **Things behave like objects.** Press = sink. Done = stays pressed in. Active = lifts.
   Motion is springy and short, and always explains a change.

## Colour

Neutrals do 90% of the work. Both themes are designed separately — dark is not light inverted.

| | Light — "Daylight desk" | Dark — "Night session" |
|---|---|---|
| Mood | warm paper, soft warm shadows | blue-black desk, lit top edges, deep drops |
| `bg` / `surface` | `#f4f1ea` / `#fffefb` | `#0d0f14` / `#161920` |
| `ink` / `ink-muted` | `#1b1c20` / `#585a63` | `#f2f0ea` / `#a9acb6` |
| Depth comes from | shadow under, hairline border | 1px highlight on top, border, darker page |
| Cube colours | pigment (as printed) | slightly luminous, never neon |
| Text on blue | white | near-black (the blue is brighter at night) |
| Text on green | near-black (white is only 2.9:1) | near-black |

The six cube colours, each with `solid`, `edge` (keycap side), `soft` (tint) and `text`
(AA on surfaces) tokens:

| Colour | Job | Used for |
|---|---|---|
| Blue | **Action** | primary buttons, current step, selection, focus ring, links |
| Green | **Success** | completed stages, correct answers, "done today" |
| Yellow | **Reward** | XP, levels, badges, hints |
| Orange | **Streak / energy** | the flame, daily activity |
| Red | **Error / danger** | wrong move, destructive actions |
| White | **Neutral sticker** | the sixth face; quiet tiles |

On the cube itself and in notation, colours mean *faces* (U white, D yellow, F green, B blue,
R red, L orange). That is the only place the "jobs" give way — and there the colour is always
paired with a letter.

## Type

- **Bricolage Grotesque** (display, 700–800, tight tracking) — headlines, numbers that matter.
  It has enough character to feel like a game title without being a novelty face.
- **Figtree** (text, 400–800) — friendly, very legible at 14–18px for a young reader.
- **JetBrains Mono** (notation) — `R U R′ U′`. Unambiguous letters, a clear prime.

All three are self-hosted variable fonts (`@fontsource-variable/*`). Scale: 11 / 12 / 14 /
**16** / 18 / 22 / 28 / 36 / 48 / 60. Body copy never goes below 14px; sentences are short.

## Shape and depth

- Radii are "sticker" radii: 6 · 10 · 14 · 20 · 28. Rounded squares, not pills — pills are
  reserved for chips and status pills.
- **Keycap** (`.key`): 3px solid edge below the face; on press the face travels down 3px and
  the edge disappears (40ms). Flat variants (ghost, soft) squeeze to 95% instead.
- **Sticker** (`Sticker`): an icon or number on a cube-coloured rounded square with a darker
  bottom edge. It is the app's bullet point, avatar and badge.
- **Stage** (`CubeStage`): soft spotlight from above, a perspective floor grid fading to the
  horizon, a contact shadow. The only place a gradient is allowed.
- Elevation has three steps plus `pop` for overlays. No blur, no glass.

## Shared pieces that carry the product

- **StageTracker** (`src/ui/components/StageTracker.tsx`): the ONE drawing of the journey —
  strip (Home, headers), list with summaries (Progress), vertical (side rails). Done = green,
  pressed in, tick · current = blue, lifted · to do = neutral keycap · locked = sunk · peeked =
  dashed blue. Never draw the eight stages any other way.
- **Celebrations** (`src/ui/celebrate.ts`): three tiers. *Tick* (a right move/answer: a ding
  and a pop), *moment* (a stage, a pattern, a PB, a badge: a card at the top of the content
  column, badge keycap lands and presses in, XP counts up, the cube spins), *milestone* (first
  solve, level-up, all stages: a ~4 s skippable takeover whose hero is a live 3D cube doing its
  victory spin, the badge or level landing beside the XP, confetti, then a smaller second beat as
  the XP lands). A PB's art is its time on a gold stopwatch. `reward()` picks the
  tier for level-ups and badges by itself. Confetti exists only here.
- **BadgeArt**: shape by family (learning = cube face, solving = hexagon, speed = stopwatch,
  streak = shield, skills = octagon), a cube motif inside, tier as a yellow rim / gold keycap.
- **Contrast**: every text token pair is listed in `src/ui/contrast.ts` and measured in both
  themes by `contrast.test.ts` (fails below 4.5:1).

## Motion

- Springs, not durations, for anything that moves (`springs.snappy | gentle | bouncy | layout |
  fill` in `src/ui/motion.ts`). Durations only for fades and exits.
- **Fast in, faster out.** Pages rise 12px and fade in while the old page fades out on top (they overlap, so the content area is never empty); the old one leaves in 120ms. Nothing blocks input.
- **One idea per animation**: selection pills slide (shared layout), progress fills, rewards pop
  once with a single overshoot, lists stagger 50ms.
- **The theme change is a moment**: the new theme grows as a circle from the point you tapped
  (View Transitions, 480ms), while the sun sets and the moon rises in the toggle.
- Nothing loops to demand attention. The idle cube breathes slowly; the "current stage" marker
  pulses three times and stops.
- **Reduced motion** (system setting or Settings → Motion) removes transforms, layout animation,
  the theme reveal and CSS animation; short opacity fades remain. Functional motion that is
  itself feedback (the hold-to-erase fill) stays.

## Sound

Synthesised, tiny, optional: a plastic click per turn (slightly different each time), a rising
fifth for success, a four-note arpeggio for a level-up, a soft low blip for errors. Never harsh,
never more than one at a time, always behind the mute setting.

## Do

- Use tokens (`bg-surface`, `text-ink-muted`, `rounded-lg`, `shadow-2`) — never raw hex in features.
- Put a cube on a `CubeStage`. Put moves in `MoveChip`s. Put icons that mean something on a `Sticker`.
- One primary (blue) button per view. Everything else is secondary, soft or ghost.
- Pair colour with a letter, icon or word whenever it carries meaning.
- Keep touch targets ≥ 44px and leave the focus ring alone.
- Write like a coach: short, concrete, kind. "That edge is flipped. Try again."

## Don't

- No purple, no gradients on UI, no glassmorphism, no glow, no emoji as icons.
- No rainbow layouts: at most two cube colours in one component, and never colour for decoration.
- No coloured left-border cards, no generic "hero + three feature cards".
- No animation longer than ~600ms, nothing that loops forever, nothing that nags.
- Don't invent new radii, shadows, timings or greys — add a token if one is truly missing.
- Don't restyle primitives per page; extend them in `src/ui` so every page benefits.

## Where things live

`src/ui/styles/tokens.css` (all values, both themes) · `index.css` (Tailwind `@theme` mapping)
· `components.css` (keycap, slider, stage) · `src/ui/index.ts` (every primitive) ·
`/#/kitchen-sink` (everything, in every state — check it in both themes before shipping UI).
