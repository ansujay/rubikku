/**
 * Everything "Solve my cube" remembers, saved continuously: the stickers being entered (with
 * undo/redo), where he is in the flow, and where he is in the solution — so a reload at any
 * point puts him back exactly where he was.
 */
import { COLORS, isMove, isSolvable, isStateString, type Color, type CubeState, type Move } from '../../cube'
import { createPersistedStore, isRecord } from '../../store'
import {
  applyForced,
  BLANK_CUBE,
  clearAll,
  clearFace,
  decode,
  EMPTY_HISTORY,
  encode,
  HISTORY_LIMIT,
  inferForced,
  isCentre,
  isEncoded,
  paint,
  pushHistory,
  redoHistory,
  undoHistory,
  type Cell,
  type EntryHistory,
  type Painted,
} from './entryModel'
import { GUIDED_FACES } from './faceGuide'
import type { WalkPos } from './walkthrough'

export type Phase = 'intro' | 'entry' | 'where' | 'walk'
export type Intent = 'solve' | 'where'
export type EntryMode = 'guided' | 'free'
export type WalkMode = 'beginner' | 'fastest'
export type Surface = 'flat' | '3d'

export const SPEEDS = [0.5, 1, 1.5] as const

export interface SolveData {
  phase: Phase
  /** What he came for: the whole guided solve, or just "where am I?". */
  intent: Intent

  // ── entry ──
  /** The 54 stickers, encoded (see entryModel). */
  cells: string
  history: EntryHistory
  brush: Color
  entryMode: EntryMode
  /** Which face guided mode is on: an index into GUIDED_FACES. */
  guidedIndex: number
  centresLocked: boolean
  /** Phone only: which painting surface is showing. */
  surface: Surface
  /**
   * True when the cube on screen comes from "random scramble" / "solved cube" — a pretend cube,
   * not one he copied from his hands. Editing a pretend cube keeps it pretend; undoing the fill
   * or clearing everything makes the entry his own again (see `isPretend`).
   */
  demo: boolean
  /** The stickers exactly as the pretend-cube helper last filled them. */
  demoCells: string | null
  /** True while fixing the colours after "my cube doesn't match". */
  reentry: boolean
  /** The cube the solution expected when re-entry started (to tell whether anything was changed). */
  expected: string | null
  /** "Where am I?" was opened from inside a solution: the walk is waiting to be carried on. */
  paused: boolean

  // ── solution ──
  /** The checked cube the current solution starts from. */
  start: CubeState | null
  walkMode: WalkMode
  /** The fastest-way moves for `start` (the search is slow, so its answer is kept). */
  fastest: Move[] | null
  pos: WalkPos
  speed: number
  mirrors: boolean
  /** Face turns done in earlier parts of this solve (before a re-solve or a change of mode). */
  priorTurns: number
  /** The finish of this walk was celebrated (so a reload on the finish screen does not do it twice). */
  celebrated: boolean
  /**
   * The cube he entered has earned its reward. One reward per entered cube: it stays set through
   * re-solves, changes of mode and fixed colours, until he starts over with an empty cube.
   */
  rewarded: boolean
}

export interface SolveState extends SolveData {
  begin: (intent: Intent) => void
  setPhase: (phase: Phase) => void
  setIntent: (intent: Intent) => void

  setBrush: (color: Color) => void
  setEntryMode: (mode: EntryMode) => void
  setGuidedIndex: (index: number) => void
  setCentresLocked: (locked: boolean) => void
  setSurface: (surface: Surface) => void
  /** Paint stickers with one colour. `sameStroke` folds the change into the previous undo step (drag-painting). */
  paintSticker: (facelet: number, color?: Cell, sameStroke?: boolean) => void
  /** Replace the whole cube as one undoable change. */
  setCells: (painted: Painted, options?: { demo?: boolean }) => void
  clearFace: (faceIndex: number) => void
  clearAll: () => void
  undo: () => void
  redo: () => void

  /** Start walking a solution of `start` from the first move. */
  startWalk: (start: CubeState, mode: WalkMode, options?: { priorTurns?: number }) => void
  showWhere: (start: CubeState) => void
  setFastest: (moves: Move[] | null) => void
  setPos: (pos: WalkPos) => void
  setSpeed: (speed: number) => void
  setMirrors: (mirrors: boolean) => void
  setCelebrated: () => void
  setRewarded: () => void
  /**
   * "My cube doesn't match": go back to entry, pre-filled with the expected cube. The solution
   * and the place in it are kept, so nothing is planned again unless the cube really differs.
   */
  reenter: (expected: Painted) => void
  /** "Where am I?" from inside a solution: look, then carry on from the same turn. */
  pauseWalk: () => void
  /** Back into the solution that was left waiting, optionally at another place in it. */
  resumeWalk: (pos?: WalkPos) => void
  /** Start over with an empty cube. */
  startOver: () => void
}

const DEFAULTS: SolveData = {
  phase: 'intro',
  intent: 'solve',
  cells: BLANK_CUBE,
  history: EMPTY_HISTORY,
  brush: 'white',
  entryMode: 'guided',
  guidedIndex: 0,
  centresLocked: true,
  surface: 'flat',
  demo: false,
  demoCells: null,
  reentry: false,
  expected: null,
  paused: false,
  start: null,
  walkMode: 'beginner',
  fastest: null,
  pos: { step: 0, move: 0 },
  speed: 1,
  mirrors: false,
  priorTurns: 0,
  celebrated: false,
  rewarded: false,
}

/** No sticker painted except, perhaps, the centres. */
const isEmptyEntry = (cells: string): boolean => [...cells].every((letter, i) => letter === '-' || isCentre(i))

/**
 * Is the cube on screen a pretend one? Yes while the helper's fill is the cube itself or lies
 * behind it in the undo history, with no "clear all" since. So a no-op tap, an edit or a fixed
 * slip cannot turn a pretend cube into a "real" one, but undoing the fill (or clearing
 * everything and painting his own cube) can.
 */
export function isPretend(cells: string, past: readonly string[], demoCells: string | null): boolean {
  if (!demoCells) return false
  const trail = [...past, cells]
  const filled = trail.lastIndexOf(demoCells)
  return filled >= 0 && !trail.slice(filled + 1).some(isEmptyEntry)
}

const oneOf = <T extends string>(value: unknown, options: readonly T[]): value is T => typeof value === 'string' && (options as readonly string[]).includes(value)
const count = (value: unknown, max: number): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : null)

export function sanitizeSolve(saved: unknown): Partial<SolveData> {
  if (!isRecord(saved)) return {}
  const out: Partial<SolveData> = {}
  if (oneOf(saved.intent, ['solve', 'where'] as const)) out.intent = saved.intent
  if (isEncoded(saved.cells)) out.cells = saved.cells
  if (isRecord(saved.history)) {
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter(isEncoded).slice(-HISTORY_LIMIT) : [])
    out.history = { past: strings(saved.history.past), future: strings(saved.history.future) }
  }
  if (oneOf(saved.brush, COLORS)) out.brush = saved.brush
  if (oneOf(saved.entryMode, ['guided', 'free'] as const)) out.entryMode = saved.entryMode
  const guided = count(saved.guidedIndex, GUIDED_FACES.length - 1)
  if (guided !== null) out.guidedIndex = guided
  if (typeof saved.centresLocked === 'boolean') out.centresLocked = saved.centresLocked
  if (oneOf(saved.surface, ['flat', '3d'] as const)) out.surface = saved.surface
  if (isEncoded(saved.demoCells)) out.demoCells = saved.demoCells
  // A save from before `demoCells` existed: the cube as it stands is the pretend one.
  else if (saved.demo === true && out.cells) out.demoCells = out.cells
  out.demo = isPretend(out.cells ?? BLANK_CUBE, out.history?.past ?? [], out.demoCells ?? null)
  if (typeof saved.reentry === 'boolean') out.reentry = saved.reentry
  if (isEncoded(saved.expected)) out.expected = saved.expected
  // Only a cube that can really be solved: the solvers must never be handed anything else.
  if (isStateString(saved.start) && isSolvable(saved.start)) out.start = saved.start
  if (oneOf(saved.walkMode, ['beginner', 'fastest'] as const)) out.walkMode = saved.walkMode
  if (Array.isArray(saved.fastest) && saved.fastest.length <= 40 && saved.fastest.every(isMove)) out.fastest = saved.fastest as Move[]
  if (isRecord(saved.pos)) {
    const step = count(saved.pos.step, 2000)
    const move = count(saved.pos.move, 200)
    if (step !== null && move !== null) out.pos = { step, move }
  }
  if (typeof saved.speed === 'number' && (SPEEDS as readonly number[]).includes(saved.speed)) out.speed = saved.speed
  if (typeof saved.mirrors === 'boolean') out.mirrors = saved.mirrors
  const prior = count(saved.priorTurns, 100_000)
  if (prior !== null) out.priorTurns = prior
  if (typeof saved.celebrated === 'boolean') out.celebrated = saved.celebrated
  if (typeof saved.rewarded === 'boolean') out.rewarded = saved.rewarded
  if (typeof saved.paused === 'boolean') out.paused = saved.paused
  // The phase last: "where" and "walk" only make sense with a cube to work from.
  if (oneOf(saved.phase, ['intro', 'entry', 'where', 'walk'] as const)) {
    out.phase = (saved.phase === 'where' || saved.phase === 'walk') && !out.start ? 'entry' : saved.phase
  }
  if (out.phase !== 'where') out.paused = false
  return out
}

export const useSolve = createPersistedStore<SolveState>(
  {
    name: 'solve',
    version: 1,
    migrate: (saved) => saved,
    sanitize: sanitizeSolve,
  },
  (set, get) => {
    /** Replace the stickers as an undoable change, then fill in anything that is now certain. */
    const commit = (painted: Painted, extra: Partial<SolveData> = {}, sameStroke = false) => {
      const before = get().cells
      const cells = encode(painted)
      const demoCells = 'demoCells' in extra ? (extra.demoCells ?? null) : get().demoCells
      if (cells === before) {
        if (Object.keys(extra).length > 0) set({ ...extra, demo: isPretend(cells, get().history.past, demoCells) })
        return
      }
      const history = sameStroke && get().history.past.length > 0 ? { past: get().history.past, future: [] } : pushHistory(get().history, before)
      set({ cells, history, ...extra, demo: isPretend(cells, history.past, demoCells) })
    }

    return {
      ...DEFAULTS,

      begin: (intent) => set({ intent, phase: 'entry' }),
      setPhase: (phase) => set({ phase }),
      setIntent: (intent) => set({ intent }),

      setBrush: (brush) => set({ brush }),
      setEntryMode: (entryMode) => set({ entryMode }),
      setGuidedIndex: (index) => set({ guidedIndex: Math.min(Math.max(0, index), GUIDED_FACES.length - 1) }),
      setCentresLocked: (centresLocked) => set({ centresLocked }),
      setSurface: (surface) => set({ surface }),

      paintSticker: (facelet, color = get().brush, sameStroke = false) => {
        if (get().centresLocked && isCentre(facelet)) return
        let painted = paint(decode(get().cells), facelet, color)
        // The very last stickers of the very last colour paint themselves: nothing else fits.
        const forced = inferForced(painted)
        if (forced.length > 0 && forced.every((f) => f.reason === 'last-color')) painted = applyForced(painted, forced)
        commit(painted, {}, sameStroke)
      },
      setCells: (painted, options = {}) => commit(painted, options.demo ? { demoCells: encode(painted) } : {}),
      clearFace: (faceIndex) => {
        const view = GUIDED_FACES[faceIndex]
        if (view) commit(clearFace(decode(get().cells), view.face, get().centresLocked))
      },
      clearAll: () => {
        // The cube that was here has had its reward: an empty cube now is the start of a new one.
        if (get().rewarded) get().startOver()
        else commit(clearAll(decode(get().cells), get().centresLocked), { guidedIndex: 0 })
      },
      undo: () => {
        const result = undoHistory(get().history, get().cells)
        if (result) set({ ...result, demo: isPretend(result.cells, result.history.past, get().demoCells) })
      },
      redo: () => {
        const result = redoHistory(get().history, get().cells)
        if (result) set({ ...result, demo: isPretend(result.cells, result.history.past, get().demoCells) })
      },

      startWalk: (start, mode, options = {}) =>
        set({ phase: 'walk', start, walkMode: mode, fastest: null, pos: { step: 0, move: 0 }, priorTurns: options.priorTurns ?? 0, celebrated: false, reentry: false, paused: false }),
      showWhere: (start) => set({ phase: 'where', start, reentry: false, paused: false }),
      setFastest: (fastest) => set({ fastest }),
      setPos: (pos) => set({ pos }),
      setSpeed: (speed) => set({ speed }),
      setMirrors: (mirrors) => set({ mirrors }),
      setCelebrated: () => set({ celebrated: true }),
      setRewarded: () => set({ rewarded: true }),

      reenter: (expected) => {
        const cells = encode(expected)
        // A pretend cube stays pretend through "fix the colours".
        set({ phase: 'entry', cells, expected: cells, history: EMPTY_HISTORY, demoCells: get().demo ? cells : null, entryMode: 'free', centresLocked: true, reentry: true, paused: false, surface: 'flat' })
      },
      pauseWalk: () => set({ phase: 'where', paused: true }),
      resumeWalk: (pos) => {
        if (get().start) set({ phase: 'walk', reentry: false, paused: false, ...(pos ? { pos } : {}) })
      },
      startOver: () => set({ ...DEFAULTS, phase: 'entry', intent: get().intent, brush: get().brush, speed: get().speed, surface: get().surface }),
    }
  },
)
