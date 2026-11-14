/**
 * A timed solve and its penalties (WCA rules): "+2" adds two seconds, "DNF" (did not finish)
 * means the solve has no time at all. Times are kept in milliseconds as measured; results are
 * truncated to hundredths of a second, as on a competition score sheet.
 */
export type Penalty = 'ok' | '+2' | 'dnf'

export interface Solve {
  id: string
  /** Measured time in ms, before any penalty. */
  ms: number
  penalty: Penalty
  /** The scramble, as notation text ("R U2 F' …"). */
  scramble: string
  /** ISO timestamp of when the solve finished. */
  at: string
}

export const PLUS_TWO_MS = 2000
/** A result that means "no time". Sorts after every real time. */
export const DNF = Number.POSITIVE_INFINITY

/** Truncate to hundredths of a second (12.349 s → 12.34 s). */
export const truncateCentis = (ms: number): number => Math.floor(Math.max(0, ms) / 10) * 10

/** The result that counts, in ms: time plus penalty, or `DNF` (Infinity). */
export function resultMs(solve: Pick<Solve, 'ms' | 'penalty'>): number {
  if (solve.penalty === 'dnf') return DNF
  const base = truncateCentis(solve.ms)
  return solve.penalty === '+2' ? base + PLUS_TWO_MS : base
}

export const isDnf = (result: number): boolean => !Number.isFinite(result)

/** Solves faster than this are almost certainly a slip of the finger, not a solve. */
export const MISFIRE_MS = 3000

/**
 * Solves shorter than this cannot be a real solve of a scrambled cube for anyone using this
 * site (the world's fastest need about five seconds), so they earn nothing and set no records:
 * no XP, no badges, no "personal best". They still appear in the list, where he can delete them.
 */
export const RECORD_FLOOR_MS = 10_000

/** Does this solve count for XP, badges and bests? Not a DNF, and long enough to be real. */
export const countsForRecords = (solve: Pick<Solve, 'ms' | 'penalty'>): boolean => solve.penalty !== 'dnf' && solve.ms >= RECORD_FLOOR_MS

/** The fastest result among the solves that count for records, or null. */
export const bestCounted = (solves: readonly Pick<Solve, 'ms' | 'penalty'>[]): number | null => bestResult(solves.filter(countsForRecords))

/**
 * The all-time best after a solve was deleted or had its penalty changed.
 *
 * `allTime` is the best on record, `before` the solve as it was (null when it did not count),
 * and `remaining` the solves as they are now. The record only moves when it has to:
 *  - it pointed at the solve that changed → it falls back to the fastest solve still standing
 *    (possibly that same solve with its +2, possibly none);
 *  - a solve became faster than the record (a +2 or DNF taken off) → that is the record now.
 * Otherwise it stays, even if the solve that set it is long gone from the list ("Clear session"
 * promises exactly that).
 */
export function reconcileBest(allTime: number | null, before: Pick<Solve, 'ms' | 'penalty'> | null, remaining: readonly Pick<Solve, 'ms' | 'penalty'>[]): number | null {
  const standing = bestCounted(remaining)
  const pointedAtIt = before !== null && countsForRecords(before) && allTime !== null && resultMs(before) === allTime
  if (pointedAtIt) return standing
  if (standing !== null && (allTime === null || standing < allTime)) return standing
  return allTime
}

/** The fastest result among `solves`, or null when there is none (or only DNFs). */
export function bestResult(solves: readonly Pick<Solve, 'ms' | 'penalty'>[]): number | null {
  let best = DNF
  for (const solve of solves) best = Math.min(best, resultMs(solve))
  return isDnf(best) ? null : best
}

/**
 * Is `result` a new personal best? `previousBests` are the bests known before this solve
 * (this session's, the all-time one…); null entries mean "no time yet". A DNF is never a best.
 */
export function isPersonalBest(result: number, previousBests: readonly (number | null)[]): boolean {
  if (isDnf(result)) return false
  return previousBests.every((best) => best === null || result < best)
}

const PENALTIES: readonly Penalty[] = ['ok', '+2', 'dnf']
export const isPenalty = (value: unknown): value is Penalty => PENALTIES.includes(value as Penalty)

/** Keep only well-formed solves (for data read back from storage). */
export function sanitizeSolves(input: unknown, cap: number): Solve[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: Solve[] = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue
    const { id, ms, penalty, scramble, at } = item as Record<string, unknown>
    if (typeof id !== 'string' || id.length === 0 || id.length > 64 || seen.has(id)) continue
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > 24 * 3_600_000) continue
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue
    seen.add(id)
    out.push({
      id,
      ms: Math.round(ms),
      penalty: isPenalty(penalty) ? penalty : 'ok',
      scramble: typeof scramble === 'string' ? scramble.slice(0, 400) : '',
      at,
    })
  }
  return out.slice(-cap)
}
