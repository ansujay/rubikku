/** Pure logic behind the algorithm cards: cases, mirrors, practice mastery and the flash-card quiz. */
import { ALGORITHMS, BEGINNER_HOLD, SOLVED, algToString, applyAlg, invertAlg, mirrorAlg, parseAlg, type BeginnerAlgorithm, type CubeState, type Move, type Rng } from '../../cube'

/** A solved cube held the beginner way (yellow on top) — where every algorithm demo ends. */
export const HOLD_STATE: CubeState = applyAlg(SOLVED, BEGINNER_HOLD)

/** The cube on which doing `alg` once finishes the job (ends solved, in the beginner hold). */
export const caseState = (alg: readonly Move[] | string): CubeState => applyAlg(HOLD_STATE, invertAlg(alg))

export interface AlgView {
  /** The moves of one go of the algorithm. */
  moves: Move[]
  /** The full demonstration (may repeat the algorithm). */
  demo: Move[]
  /** Where the demonstration starts. */
  demoStart: CubeState
  /** Where practice starts: one go of the algorithm away from solved. */
  practiceStart: CubeState
}

/** The moves and starting cubes for an algorithm, as written or mirrored left-to-right. */
export function algView(algorithm: BeginnerAlgorithm, mirrored = false): AlgView {
  const flip = (moves: readonly Move[]) => (mirrored ? mirrorAlg(moves) : [...moves])
  const moves = flip(algorithm.moves)
  const demo = flip(parseAlg(algorithm.demo.alg))
  return { moves, demo, demoStart: caseState(demo), practiceStart: caseState(moves) }
}

export interface MirrorInfo {
  /** False when the mirror image is the same moves (nothing to show). */
  meaningful: boolean
  moves: Move[]
  /** Another algorithm in the library that *is* the mirror image, if any. */
  twin: BeginnerAlgorithm | null
}

export function mirrorInfo(algorithm: BeginnerAlgorithm): MirrorInfo {
  const moves = mirrorAlg(algorithm.moves)
  const text = algToString(moves)
  const own = algToString(algorithm.moves)
  return { meaningful: text !== own, moves, twin: ALGORITHMS.find((other) => other.id !== algorithm.id && algToString(other.moves) === text) ?? null }
}

// ───────────────────────── Practice mastery ─────────────────────────

export interface AlgStat {
  /** Finished reps, with or without help. */
  reps: number
  /** Reps with no wrong turn and no peeking. */
  clean: number
  /** Clean reps done from memory (moves hidden). */
  blind: number
}

export type AlgStatus = 'learning' | 'practised' | 'mastered'
/** How much help practice gives: next-move arrows · just the written moves · nothing. */
export type Guidance = 'arrows' | 'moves' | 'memory'

export const EMPTY_STAT: AlgStat = { reps: 0, clean: 0, blind: 0 }
/** Clean from-memory reps needed for "mastered". */
export const MASTERY_REPS = 3

export function statusOf(stat: AlgStat | undefined): AlgStatus {
  if (!stat || stat.reps === 0) return 'learning'
  return stat.blind >= MASTERY_REPS ? 'mastered' : 'practised'
}

/** The help to offer next: it fades as the reps add up. */
export function guidanceFor(stat: AlgStat | undefined): Guidance {
  const clean = stat?.clean ?? 0
  return clean < 2 ? 'arrows' : clean < 4 ? 'moves' : 'memory'
}

export function recordRep(stat: AlgStat | undefined, rep: { clean: boolean; guidance: Guidance }): AlgStat {
  const base = stat ?? EMPTY_STAT
  return { reps: base.reps + 1, clean: base.clean + (rep.clean ? 1 : 0), blind: base.blind + (rep.clean && rep.guidance === 'memory' ? 1 : 0) }
}

export const STATUS_LABEL: Record<AlgStatus, string> = { learning: 'Learning', practised: 'Practised', mastered: 'Mastered' }

// ───────────────────────── Search ─────────────────────────

export function matchesSearch(algorithm: BeginnerAlgorithm, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const moves = algorithm.alg.toLowerCase()
  return algorithm.name.toLowerCase().includes(q) || moves.includes(q) || moves.replace(/[\s()]/g, '').includes(q.replace(/\s/g, ''))
}

// ───────────────────────── Flash cards ─────────────────────────

export interface FlashCard {
  /** The algorithm that fixes the case. */
  answerId: string
  /** The case: one go of the algorithm away from solved. */
  state: CubeState
  /** Ids of the choices, shuffled. Exactly one of them fixes the case. */
  options: string[]
  /** Every algorithm in the library that fixes this case (the answer, and any equal to it up to a turn of the top). */
  accepts: string[]
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/** Algorithms with different moves — two cards never share an answer that looks identical. */
export function distinctAlgorithms(): BeginnerAlgorithm[] {
  const seen = new Set<string>()
  return ALGORITHMS.filter((algorithm) => {
    const key = algToString(algorithm.moves)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The solved cube in the beginner hold, with the top layer turned 0, 1, 2 or 3 quarters. */
const FIXED_STATES: ReadonlySet<CubeState> = new Set(['', 'U', 'U2', "U'"].map((turn) => applyAlg(HOLD_STATE, turn)))

/**
 * Does doing `moves` once fix this case? "Fixed" allows a leftover turn of the top layer: the
 * Sune and the yellow-edge swap, or the right trigger and the right corner insert, differ only
 * by a final U — on a real cube both leave the job done, so both are right answers.
 */
export const fixesCase = (state: CubeState, moves: readonly Move[]): boolean => FIXED_STATES.has(applyAlg(state, moves))

export function makeFlashCards(rng: Rng, count = 6, optionCount = 4): FlashCard[] {
  const pool = distinctAlgorithms()
  return shuffle([...pool], rng)
    .slice(0, count)
    .map((answer) => {
      const state = caseState(answer.moves)
      const accepts = ALGORITHMS.filter((other) => fixesCase(state, other.moves)).map((other) => other.id)
      // A wrong choice must really be wrong: nothing that also fixes the case is offered.
      const others = shuffle(pool.filter((other) => !accepts.includes(other.id)), rng).slice(0, optionCount - 1)
      return { answerId: answer.id, state, options: shuffle([answer, ...others], rng).map((a) => a.id), accepts }
    })
}

// ───────────────────────── Mnemonic beats ─────────────────────────

export interface MnemonicBeats {
  /** One word or phrase per move, when the mnemonic lines up with the moves; else null. */
  beats: string[] | null
  /** The rest of the mnemonic (or all of it when there are no beats). */
  rest: string
}

/**
 * Many mnemonics are a chant with one beat per move ("Up, over, down, back."). When the first
 * sentence — or its first half, before a dash — splits into exactly as many beats as the
 * algorithm has moves, return them so each beat can sit under its move.
 */
export function mnemonicBeats(mnemonic: string, moveCount: number): MnemonicBeats {
  const stop = mnemonic.search(/[.:]/)
  const first = stop >= 0 ? mnemonic.slice(0, stop) : mnemonic
  const after = stop >= 0 ? mnemonic.slice(stop + 1).trim() : ''
  const split = (text: string) => text.split(/,\s*|\s+—\s+/).map((beat) => beat.trim()).filter(Boolean)
  const whole = split(first)
  if (moveCount > 1 && whole.length === moveCount) return { beats: whole, rest: after }
  const dash = first.indexOf(' — ')
  if (dash >= 0) {
    const head = split(first.slice(0, dash))
    if (moveCount > 1 && head.length === moveCount) {
      const tail = first.slice(dash + 3).trim()
      return { beats: head, rest: [tail ? `${tail[0].toUpperCase()}${tail.slice(1)}.` : '', after].filter(Boolean).join(' ') }
    }
  }
  return { beats: null, rest: mnemonic }
}
