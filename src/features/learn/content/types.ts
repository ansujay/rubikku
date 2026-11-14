/**
 * Lesson content as data. A lesson is a list of short screens ("beats"), one idea each. The
 * lesson player (../player) knows how to show every kind of beat; nothing here imports React.
 *
 * Text markup (see RichText): `**bold**`, and backticks for notation — `R U R' U'`.
 */
import type { Face, Move, PieceId, SlotId, StageId } from '../../../cube'
import type { Outcome, Play, Scene } from '../engine'

export type LessonId = 'primer' | StageId | 'full-solve'

export interface SectionDef {
  id: string
  label: string
}

/**
 * What to light up on the cube. `'step'` uses the pieces and targets of the solver's next step
 * from the beat's starting cube — the same thing a hint would light up.
 */
export type HighlightSpec =
  | 'step'
  /** The same, plus the place the piece is heading for (when the text talks about that place). */
  | 'step-target'
  | {
      /** Start from the solver's step, as `'step'` (or `'target'`: as `'step-target'`). */
      step?: true | 'target'
      /**
       * Keep these centres lit (they never move with a face turn, so they are lit as places).
       * Any beat whose text says "compare with the centre(s)" must light them: a dimmed red and a
       * dimmed orange look alike. `'sides'` = the four side centres, `'all'` = all six.
       */
      centres?: 'sides' | 'all' | readonly Face[]
      pieces?: readonly PieceId[]
      /** The pieces sitting in these slots when the beat starts (the light then follows them). */
      piecesAt?: readonly SlotId[]
      slots?: readonly SlotId[]
      facelets?: readonly number[]
      /** Dim everything else (default true). */
      dim?: boolean
    }

export interface BeatView {
  highlight?: HighlightSpec
  /** Float copies of the hidden faces (back, left, bottom) beside the cube. */
  mirrors?: boolean
  /** Show the face letters on the centres. */
  labels?: boolean
  /** Preview a move with an arrow. */
  arrow?: Move
  /** Look at the cube from underneath (to show the white face). */
  below?: boolean
  /** Show the flat top view (the top face with the top layer's side stickers round it) beside the text. */
  top?: boolean
  /** A figure beside the text: the four yellow-cross shapes as tappable top views. */
  figure?: 'yellow-shapes'
}

interface BeatBase {
  /** Stable within the lesson; saved positions refer to it. */
  id: string
  section: string
  title: string
  /** Short paragraphs. */
  body: readonly string[]
  /** One extra line, set apart: a tip or a warning. */
  tip?: string
  view?: BeatView
}

/** Text beside a cube that shows the idea; optionally a short animation to watch. */
export interface InfoBeat extends BeatBase {
  kind: 'info'
  scene: Scene
  /** Moves to watch from the scene. They play once on arrival and on demand. */
  show?: { alg: string; label?: string; outcome?: Outcome | readonly Outcome[] }
  /** Let him turn the cube freely on this beat. */
  free?: boolean
}

/** Before → after for a whole stage: the solver's own moves for it, played fast. */
export interface GoalBeat extends BeatBase {
  kind: 'goal'
  play: Play
  outcome: Outcome | readonly Outcome[]
}

/** Watch a case being solved, with the playback bar. */
export interface DemoBeat extends BeatBase {
  kind: 'demo'
  play: Play
  /** The solver cases this demo shows, in order (checked by the tests). Omit for explicit moves. */
  cases?: readonly string[]
  outcome: Outcome | readonly Outcome[]
  /** Show this algorithm's mnemonic and finger hint under the moves. */
  algorithm?: string
}

/** How much help a guided exercise gives. */
export type Scaffold =
  /** Every move: arrow, chips, a line saying what the move does. */
  | 'full'
  /** Only the names of the steps ("turn the top", "Right Trigger"). */
  | 'name'
  /** Nothing, unless he asks for a hint. */
  | 'none'

/**
 * Do it yourself: the cube is set up and he makes the moves.
 *
 * How he is judged depends on the play. Explicit moves (`play.alg`: a single move, an algorithm)
 * are followed move by move. A play that comes from the solver is judged **by result**: any move
 * that keeps the cube sound (a top turn to look, his own order of petals) is accepted and the plan
 * re-made from wherever he is; only a move that loses something is called a slip.
 */
export interface GuidedBeat extends BeatBase {
  kind: 'guided'
  play: Play
  cases?: readonly string[]
  scaffold: Scaffold
  outcome: Outcome | readonly Outcome[]
  /** Said when the last move lands. */
  success: string
  /**
   * "Five in a row" (explicit algorithms only): the same set-up this many times, the help fading
   * each round — arrows and moves, then the moves only, then the first move, then nothing.
   */
  reps?: number
}

/** The recognition rounds: each one asks him to make one of the method's real decisions. */
export type QuizKind =
  | 'daisy-case'
  | 'cross-petal'
  | 'corner-home'
  | 'middle-side'
  | 'yellow-shape'
  | 'edges-match'
  | 'corner-place'
  | 'twist-next'

/** "Which is it?" — real cubes from the solver; he taps the answer and sees at once why. */
export interface QuizBeat extends BeatBase {
  kind: 'quiz'
  quiz: QuizKind
  /** Right answers needed to finish the round (default 5). A wrong answer just brings another cube. */
  count?: number
}

/** "Now on your cube": the stage done by hand on his own cube, with the picture to check against. */
export interface RealBeat extends BeatBase {
  kind: 'real'
  /** The picture to check against: the cube with this stage finished (null: a solved cube). */
  picture: StageId | null
  /** What the picture is ("Your cube should look like this"). */
  caption?: string
  /** What to do, in order. */
  steps: readonly string[]
  /** "Check": the most likely mistakes, as questions to ask of his cube. */
  checks: readonly string[]
  /** Said when he taps Done. */
  done: string
}

/** Random practice cubes for a stage. */
export interface DrillBeat extends BeatBase {
  kind: 'drill'
  stage: StageId
}

/** What he learned, the algorithms, common mistakes, and what comes next. */
export interface WrapBeat extends BeatBase {
  kind: 'wrap'
}

export type Beat = InfoBeat | GoalBeat | DemoBeat | GuidedBeat | QuizBeat | RealBeat | DrillBeat | WrapBeat

export interface Trouble {
  /** The problem, as he would say it. */
  problem: string
  /** Why it happens and what to do. */
  fix: string
}

export interface Lesson {
  id: Exclude<LessonId, 'full-solve'>
  /** 0 for the primer, 1–8 for the stages. */
  number: number
  title: string
  /** One line for the path. */
  goal: string
  sections: readonly SectionDef[]
  beats: readonly Beat[]
  /** Wrap-up: what he can do now. */
  learned: readonly string[]
  /** Ids in `ALGORITHMS`, shown as cards in the wrap-up. */
  algorithms: readonly string[]
  /** "Stuck?" — the most common real problems at this stage. */
  troubles: readonly Trouble[]
  /** Said when a move in a "your turn" exercise loses something ("That knocked a petal off."). */
  slip?: string
  /**
   * Algorithms shown in the wrap-up apart from the main line, as optional extras ("Faster ways in"
   * for the white-corner shortcuts). Every other card in `algorithms` must be taught in the lesson.
   */
  optional?: readonly string[]
  /** The heading and the line above the optional cards. */
  optionalTitle?: string
  optionalNote?: string
}

export const STAGE_SECTIONS: readonly SectionDef[] = [
  { id: 'goal', label: 'Goal' },
  { id: 'idea', label: 'Idea' },
  { id: 'cases', label: 'Cases' },
  { id: 'turn', label: 'Your turn' },
  { id: 'drill', label: 'Drills' },
  { id: 'cube', label: 'Your cube' },
  { id: 'wrap', label: 'Wrap-up' },
]

/**
 * What to do when something goes wrong on the real cube — taught once (end of stage 3), and
 * shown again at the top of every "Stuck?" from then on. None of them needs a button.
 */
export const RECOVERY_RULES: readonly Trouble[] = [
  {
    problem: 'Slipped one turn?',
    fix: 'Turn that same face straight back the other way, then carry on. `R` is undone by `R\'`, `U\'` by `U`.',
  },
  {
    problem: 'Lost in the middle of an algorithm?',
    fix: 'Do not guess. Look at the cube: which stage is the last one that is still whole? Start again from the stage after it. It feels like a big step back, but each stage goes much faster the second time.',
  },
  {
    problem: 'Everything went wrong at once?',
    fix: 'The cube was probably tipped over. Check: **yellow centre on top, white underneath?** Turn it back that way, then go back to the last stage that is still whole.',
  },
  {
    problem: 'Stage 8 and the bottom looks wrecked?',
    fix: 'That is the Corner Twist working, not a mistake. Keep going with `R\' D\' R D` and turn only the top. The bottom comes back on the last twist.',
  },
]
