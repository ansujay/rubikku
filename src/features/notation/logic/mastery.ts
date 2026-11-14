/** Per-move accuracy: the "spaced repetition lite" behind question weighting and the mastery grid. */
import type { Move } from '../../../cube'

export interface MoveStat {
  seen: number
  correct: number
  /** Recent accuracy, 0…1: an exponentially weighted average that forgets old answers. */
  recent: number
}

export type MoveStats = Record<string, MoveStat>

/** 0 not tried yet · 1 shaky · 2 getting there · 3 mastered. */
export type MasteryLevel = 0 | 1 | 2 | 3

export const MASTERY_LABEL: Record<MasteryLevel, string> = { 0: 'New', 1: 'Shaky', 2: 'Getting there', 3: 'Mastered' }

const RECENT_WEIGHT = 0.35

/** Fold one answer into a move's numbers. Pure. */
export function recordAnswer(stats: MoveStats, move: Move, ok: boolean): MoveStats {
  const before = stats[move]
  const hit = ok ? 1 : 0
  const next: MoveStat = before
    ? { seen: before.seen + 1, correct: before.correct + hit, recent: before.recent + (hit - before.recent) * RECENT_WEIGHT }
    : { seen: 1, correct: hit, recent: ok ? 0.6 : 0 }
  return { ...stats, [move]: next }
}

export function masteryOf(stat: MoveStat | undefined): MasteryLevel {
  if (!stat || stat.seen === 0) return 0
  if (stat.seen >= 3 && stat.recent >= 0.8) return 3
  if (stat.recent >= 0.5) return 2
  return 1
}

/**
 * How strongly a move should be picked: shaky moves come back about four times as often as
 * mastered ones, and moves he has never seen get a head start.
 */
export function moveWeight(stat: MoveStat | undefined): number {
  if (!stat || stat.seen === 0) return 2.5
  return 1 + 3 * (1 - Math.min(1, Math.max(0, stat.recent)))
}

/** Share of the given moves that are mastered, 0…1. */
export function masteredShare(stats: MoveStats, moves: readonly Move[]): number {
  if (moves.length === 0) return 0
  return moves.filter((move) => masteryOf(stats[move]) === 3).length / moves.length
}

export interface AnswerRecord {
  /** The moves asked. */
  moves: readonly Move[]
  result: 'correct' | 'hinted' | 'wrong'
  /** The asked move that went wrong (for sequences: the first one missed). */
  missed?: Move
  /** Where in `moves` it went wrong, or where the hint was asked for. Absent in older saves. */
  missedIndex?: number
}

/**
 * Which position in an answer's moves gets the blame: -1 for a correct answer; otherwise where
 * it went wrong (or where the hint was needed). Moves before it were done right; moves after it
 * were never reached.
 */
export function blamedIndex(record: AnswerRecord): number {
  if (record.result === 'correct') return -1
  const last = record.moves.length - 1
  if (typeof record.missedIndex === 'number' && record.missedIndex >= 0) return Math.min(last, Math.floor(record.missedIndex))
  // Older records only say which move: take its first appearance.
  return Math.max(0, record.missed ? record.moves.indexOf(record.missed) : 0)
}

/** The moves to practise after a round: missed ones first (most missed first), at most `limit`. */
export function movesToWorkOn(answers: readonly AnswerRecord[], stats: MoveStats, limit = 4): Move[] {
  const misses = new Map<Move, number>()
  for (const answer of answers) {
    if (answer.result === 'correct') continue
    const move = answer.missed ?? answer.moves[0]
    if (move) misses.set(move, (misses.get(move) ?? 0) + 1)
  }
  return [...misses.entries()]
    .sort((a, b) => b[1] - a[1] || (stats[a[0]]?.recent ?? 0) - (stats[b[0]]?.recent ?? 0))
    .slice(0, limit)
    .map(([move]) => move)
}

export interface RoundScore {
  correct: number
  total: number
  /** 0…100, rounded. */
  accuracy: number
  bestStreak: number
}

export function scoreRound(answers: readonly AnswerRecord[]): RoundScore {
  let streak = 0
  let bestStreak = 0
  let correct = 0
  for (const answer of answers) {
    if (answer.result === 'correct') {
      correct++
      streak++
      bestStreak = Math.max(bestStreak, streak)
    } else streak = 0
  }
  const total = answers.length
  return { correct, total, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0, bestStreak }
}

/** The streak at the end of the answers so far. */
export function currentRun(answers: readonly AnswerRecord[]): number {
  let run = 0
  for (let i = answers.length - 1; i >= 0 && answers[i].result === 'correct'; i--) run++
  return run
}
