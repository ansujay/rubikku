/**
 * Rubikku cube engine — public API.
 *
 * Pure TypeScript, no React and no DOM. Everything other parts of the app need is exported
 * from this file; import from `src/cube` (never from the files behind it).
 *
 * ## The model in one minute
 *
 * - **State** (`CubeState`) is the 54-character Kociemba facelet string — faces in the order
 *   U R F D L B, each read row by row as on an unfolded net. Each character is the colour of
 *   one sticker, written as the letter of the face that colour belongs to on a solved cube:
 *   U white, R red, F green, D yellow, L orange, B blue. States are immutable strings: copy
 *   them freely, compare with `===`, store them as they are.
 * - **Faces** (`Face`: 'U' | 'R' | 'F' | 'D' | 'L' | 'B') are directions in space.
 *   **Colours** (`Color`: 'white' | 'red' | ...) are what the API hands back for stickers.
 * - **Coordinates**: x points right (R), y up (U), z to the front (F) — the same right-handed
 *   system three.js uses. Cubie positions have coordinates -1, 0 or 1.
 * - **Slots** are fixed places ("UF" = the top-front edge position). **Pieces** are physical
 *   cubies named by their colours through their home slot ("UF" = the white-green edge).
 * - **Moves** (`Move`) are canonical notation strings: "R", "U'", "F2", "M", "r", "x2".
 *   An algorithm (`Alg`) is an array of moves; most functions also accept notation text.
 * - The cube may be held in any orientation: whole-cube rotations x/y/z are ordinary moves and
 *   the centres record how the cube is held. `isSolved`, `PieceLocation.solved`, `homeSlot`
 *   and friends all work relative to the centres.
 *
 * ## Quick tour
 *
 * ```ts
 * import { SOLVED, applyAlg, parseAlg, isSolved, findPiece, randomScramble, validateCube,
 *          solveOptimal } from '../cube'
 *
 * const scrambled = applyAlg(SOLVED, randomScramble())        // or applyAlg(SOLVED, "R U R' U'")
 * findPiece(scrambled, ['white', 'green'])                     // { slot, orientation, facing, ... }
 * const result = validateCube(paintedColours)                  // { ok, state } or { ok: false, problems }
 * const solution = await solveOptimal(scrambled)               // FaceMove[]
 * isSolved(applyAlg(scrambled, solution))                      // true
 *
 * const where = analyzeCube(scrambled)                         // .current stage, .completed, .stages[id] progress
 * isStageComplete(state, 'white-cross')                        // lesson goal check
 * const lesson = solveBeginner(scrambled)                      // .stages[] -> .steps[] with caseName, explanation, moves
 * nextHint(state).step                                         // just the next step (null when solved)
 * ```
 */

// --- Geometry: faces, colours, facelets, slots and pieces -----------------------------------
export {
  FACES,
  COLORS,
  FACE_COLOR,
  COLOR_FACE,
  OPPOSITE_FACE,
  FACE_NAME,
  FACE_NORMAL,
  CORNERS,
  EDGES,
  CENTERS,
  SLOTS,
  FACELETS,
  SLOT_POSITION,
  SLOT_FACELETS,
  oppositeColor,
  kindOf,
  slotFaces,
  pieceColors,
  pieceWithColors,
  slotWithFaces,
  slotAtPosition,
  slotsOnFace,
  faceletIndex,
  faceletAtPosition,
} from './geometry'
export type {
  Face,
  Color,
  Axis,
  Vec3,
  CornerId,
  EdgeId,
  CenterId,
  SlotId,
  PieceId,
  PieceKind,
  FaceletInfo,
} from './geometry'

// --- State: the 54-character facelet string and sticker lookups -----------------------------
export {
  SOLVED,
  isStateString,
  fromKociemba,
  toKociemba,
  parseState,
  fromColors,
  toColors,
  colorAt,
  stickerAt,
  faceColors,
  centerColors,
  faceOfColor,
  isUpright,
  isSolved,
  isFaceSolved,
  toNet,
} from './state'
export type { CubeState } from './state'

// --- Notation: moves as text -------------------------------------------------------------------
export {
  FACE_MOVE_BASES,
  SLICE_MOVE_BASES,
  WIDE_MOVE_BASES,
  ROTATION_BASES,
  MOVE_BASES,
  MOVE_BASE_DEFS,
  ALL_MOVES,
  FACE_MOVES,
  AlgParseError,
  isMove,
  moveBase,
  moveAmount,
  makeMove,
  moveKind,
  isRotation,
  invertMove,
  parseAlg,
  tryParseAlg,
  toAlg,
  algToString,
  invertAlg,
  simplifyAlg,
  mirrorAlg,
  countMoves,
  describeMove,
  describeHold,
  HOLD_WORDS,
} from './notation'
export type {
  Move,
  FaceMove,
  RotationMove,
  Alg,
  MoveBase,
  FaceMoveBase,
  SliceMoveBase,
  WideMoveBase,
  RotationBase,
  MoveSuffix,
  MoveKind,
  MoveAmount,
  TurnDirection,
  MoveDescription,
} from './notation'

// --- Applying moves, animation info, cube orientation -----------------------------------------
export {
  applyMove,
  applyAlg,
  stateFromAlg,
  algStates,
  algOrder,
  moveLayer,
  isPositionInMove,
  CUBE_ROTATIONS,
  uprightRotation,
  toUpright,
  rotateAlg,
  withoutRotations,
  movePermutation,
  algPermutation,
  permuteFacelets,
  composePermutations,
  invertPermutation,
  IDENTITY_PERMUTATION,
} from './moves'
export type { MoveLayer, UprightCube, Permutation } from './moves'

// --- Pieces: where things are, cubies for rendering --------------------------------------------
export {
  pieceAt,
  findPiece,
  allPieces,
  homeSlot,
  isPieceSolved,
  isSlotSolved,
  faceOfSticker,
  getCubies,
  identifyStickers,
  toCubieArrays,
  fromCubieArrays,
  permutationParity,
} from './pieces'
export type { PieceLocation, StickerInfo, Cubie, CubieSticker, CubieArrays } from './pieces'

// --- Scrambles and randomness ------------------------------------------------------------------
export { randomScramble, dailyScramble, dateKey, seededRng, randomState } from './scramble'
export type { Rng, ScrambleOptions } from './scramble'

// --- Validating a painted cube -----------------------------------------------------------------
export { validateCube, isSolvable, describeSlot } from './validate'
export type { PaintedCube, CubeProblem, CubeProblemCode, ValidationResult } from './validate'

// --- Short-solution (Kociemba) solver: async, runs in a Web Worker ----------------------------
export {
  solveOptimal,
  warmUpOptimalSolver,
  isOptimalSolverReady,
  disposeOptimalSolver,
  createOptimalSolver,
} from './optimal/optimalSolver'
export type { OptimalSolver, OptimalSolverOptions } from './optimal/optimalSolver'
export type { SolverRequest, SolverResponse, SolverTransport } from './optimal/protocol'

// --- One-face search: hold + shortest moves that put a 3x3 picture (a flag) on the front ------
export { findFaceAlgs, faceShows, flagStart } from './faceSearch'
export type { FaceGrid, FaceSolution, FaceSearchOptions } from './faceSearch'

// --- Beginner-method stages, algorithm library, pattern library -------------------------------
export { STAGE_IDS, BEGINNER_HOLD } from './stages'
export type { StageId } from './stages'
export { ALGORITHMS, getAlgorithm, algorithmsForStage } from './algorithms'
export type { BeginnerAlgorithm } from './algorithms'
export { PATTERNS, getPattern } from './patterns'
export type { CubePattern } from './patterns'

// --- Stage detection ("Where am I?") and lesson goal checks -----------------------------------
export {
  analyzeCube,
  isStageComplete,
  firstIncompleteStage,
  isDaisy,
  isPetal,
  yellowCrossShape,
  topLayerInfo,
  yellowUpRotation,
} from './beginner/analyze'
export type {
  CubeAnalysis,
  StageProgress,
  StageCheckOptions,
  SuggestedHold,
  TwistInProgress,
  YellowCrossShape,
  TopLayerInfo,
} from './beginner/analyze'

// --- Beginner (human-method) solver: explained steps, hints -----------------------------------
export { solveBeginner, nextBeginnerStep, nextHint, flattenSolution, solutionStages } from './beginner/solver'
export { BeginnerSolverError } from './beginner/shared'

// --- Following along by hand: where he is on a path / in the method, slips and the way back ---
export {
  startPath,
  stepPath,
  trackPath,
  rotatePath,
  pathStatus,
  pathNext,
  pathUndo,
  pathRemaining,
  startFollow,
  followMove,
  followMoves,
  followState,
  askFollow,
  replanFollow,
  FOLLOW_LOST_AFTER,
  FOLLOW_LOST_AFTER_SILENT,
} from './beginner/follow'
export type { PathTrack, PathStatus, StepFollower, FollowStatus, FollowOptions, FreshPlan } from './beginner/follow'
export type {
  BeginnerSolution,
  StageSolution,
  SolveStep,
  StepKind,
  StepAlgorithm,
  StepHighlight,
  BeginnerSolverOptions,
  BeginnerHint,
  FlatSolution,
} from './beginner/types'
