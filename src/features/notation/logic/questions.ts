/** Question generation for the notation games. Everything takes an `rng` so it can be tested. */
import { ALL_MOVES, MOVE_BASE_DEFS, invertMove, makeMove, moveAmount, moveBase, moveKind, type Move, type MoveBase, type Rng } from '../../../cube'
import type { NotationLevel } from './levels'
import { moveWeight, type MoveStats } from './mastery'

const FOCUS_WEIGHT = 3
const REVIEW_WEIGHT = 1

function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = rng() * total
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return items[i]
  }
  return items[items.length - 1]
}

export interface Pool {
  focus: readonly Move[]
  review: readonly Move[]
}

/**
 * One move from the pool: focus moves over review moves, shaky moves over mastered ones, and
 * never a move on a face in `avoidBases` (so questions do not repeat back to back).
 */
export function pickMove(pool: Pool, stats: MoveStats, rng: Rng, avoidBases: readonly MoveBase[] = []): Move {
  const all = [...pool.focus.map((move) => ({ move, base: FOCUS_WEIGHT })), ...pool.review.filter((m) => !pool.focus.includes(m)).map((move) => ({ move, base: REVIEW_WEIGHT }))]
  const allowed = all.filter((entry) => !avoidBases.includes(moveBase(entry.move)))
  const from = allowed.length > 0 ? allowed : all
  return weightedPick(
    from.map((entry) => entry.move),
    from.map((entry) => entry.base * moveWeight(stats[entry.move])),
    rng,
  )
}

/** One question: a single move, or a short sequence in which neighbours never share a face. */
export function makeQuestion(level: Pick<NotationLevel, 'focus' | 'review' | 'sequence'>, stats: MoveStats, rng: Rng, previous: readonly Move[] = []): Move[] {
  const [min, max] = level.sequence
  const length = min + Math.floor(rng() * (max - min + 1))
  const out: Move[] = []
  let avoid: MoveBase[] = previous.length === 1 && length === 1 ? [moveBase(previous[0])] : []
  for (let i = 0; i < length; i++) {
    const move = pickMove(level, stats, rng, avoid)
    out.push(move)
    avoid = [moveBase(move)]
  }
  return out
}

/** A whole round of questions. */
export function makeRound(level: NotationLevel, stats: MoveStats, rng: Rng): Move[][] {
  const out: Move[][] = []
  for (let i = 0; i < level.questions; i++) out.push(makeQuestion(level, stats, rng, out[i - 1]))
  return out
}

/** The move on the opposite face (R ↔ L, U ↔ D, F ↔ B, r ↔ l …), same suffix; null for slices and rotations. */
export function oppositeFaceMove(move: Move): Move | null {
  const base = moveBase(move)
  const def = MOVE_BASE_DEFS[base]
  if (def.kind !== 'face' && def.kind !== 'wide') return null
  const twin = (Object.keys(MOVE_BASE_DEFS) as MoveBase[]).find((other) => other !== base && MOVE_BASE_DEFS[other].kind === def.kind && MOVE_BASE_DEFS[other].axis === def.axis)
  return twin ? makeMove(twin, moveAmount(move)) : null
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/**
 * Answer choices for "name the move". Always contains the answer and its inverse, then the most
 * tempting wrong answers: the same face with the other suffixes, and the opposite face (whose
 * turn *looks* the same from the front — L' goes up just like R). Padded from the level's moves.
 */
export function nameOptions(answer: Move, candidates: readonly Move[], rng: Rng, count = 4): Move[] {
  const base = moveBase(answer)
  const picks: Move[] = [answer]
  const add = (move: Move | null | undefined) => {
    if (move && !picks.includes(move) && picks.length < count) picks.push(move)
  }
  // The inverse first (for a double, both quarter turns stand in for it).
  if (invertMove(answer) !== answer) add(invertMove(answer))
  else {
    add(makeMove(base, 1))
    add(makeMove(base, 3))
  }
  const opposite = oppositeFaceMove(answer)
  // The opposite face turning the way that looks identical from the front, then its plain twin.
  if (opposite) add(invertMove(opposite) === opposite ? opposite : invertMove(opposite))
  const sameFace = shuffle([makeMove(base, 1), makeMove(base, 2), makeMove(base, 3)].filter((m): m is Move => m !== null), rng)
  if (count > 4) for (const move of sameFace) add(move)
  if (opposite) add(opposite)
  for (const move of shuffle(candidates.filter((m) => moveKind(m) === moveKind(answer)), rng)) add(move)
  for (const move of shuffle([...candidates], rng)) add(move)
  for (const move of shuffle([...ALL_MOVES], rng)) add(move)
  return shuffle(picks, rng)
}
