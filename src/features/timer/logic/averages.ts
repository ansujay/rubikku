/**
 * WCA-style statistics over results in ms (`DNF` = Infinity; see solves.ts).
 *
 * - mean of N ("mo3"): the plain mean; any DNF makes it a DNF.
 * - average of N ("ao5", "ao12"): drop the best and the worst result, then take the mean of
 *   the rest. One DNF is simply the worst result and is dropped; two or more make a DNF.
 * Both are rounded to the nearest hundredth of a second.
 */
import { DNF, isDnf } from './solves'

const roundCentis = (ms: number) => Math.round(ms / 10) * 10

/** Mean of exactly these results. Null when there are none. */
export function meanOf(results: readonly number[]): number | null {
  if (results.length === 0) return null
  if (results.some(isDnf)) return DNF
  return roundCentis(results.reduce((sum, r) => sum + r, 0) / results.length)
}

/** Trimmed average of exactly these results (needs at least 3). */
export function averageOf(results: readonly number[]): number | null {
  if (results.length < 3) return null
  const sorted = [...results].sort((a, b) => a - b)
  const middle = sorted.slice(1, -1)
  if (middle.some(isDnf)) return DNF
  return roundCentis(middle.reduce((sum, r) => sum + r, 0) / middle.length)
}

type Stat = (results: readonly number[]) => number | null

/** The statistic over the last `n` results, or null when there are fewer than `n`. */
function latest(results: readonly number[], n: number, stat: Stat): number | null {
  return results.length < n ? null : stat(results.slice(-n))
}

/** The statistic over every window of `n` consecutive results; entry i covers results i-n+1…i (null before that). */
export function rolling(results: readonly number[], n: number, stat: Stat = averageOf): (number | null)[] {
  return results.map((_, i) => (i + 1 < n ? null : stat(results.slice(i + 1 - n, i + 1))))
}

/** The best (lowest, non-DNF) value in a rolling series, or null. */
export function bestOf(series: readonly (number | null)[]): number | null {
  let best: number | null = null
  for (const value of series) {
    if (value === null || isDnf(value)) continue
    if (best === null || value < best) best = value
  }
  return best
}

export interface TimerStats {
  count: number
  /** Solves with a time (not DNF). */
  finished: number
  /** Most recent result (may be DNF). */
  latest: number | null
  best: number | null
  /** Index of the best single in the input, or -1. */
  bestIndex: number
  worst: number | null
  /** Mean of every finished solve. */
  mean: number | null
  mo3: number | null
  ao5: number | null
  ao12: number | null
  bestMo3: number | null
  bestAo5: number | null
  bestAo12: number | null
}

/** Everything the stats row shows, from results in chronological order. */
export function computeStats(results: readonly number[]): TimerStats {
  const finishedResults = results.filter((r) => !isDnf(r))
  let bestIndex = -1
  results.forEach((r, i) => {
    if (!isDnf(r) && (bestIndex < 0 || r < results[bestIndex])) bestIndex = i
  })
  return {
    count: results.length,
    finished: finishedResults.length,
    latest: results.length > 0 ? results[results.length - 1] : null,
    best: bestIndex >= 0 ? results[bestIndex] : null,
    bestIndex,
    worst: finishedResults.length > 0 ? Math.max(...finishedResults) : null,
    mean: meanOf(finishedResults),
    mo3: latest(results, 3, meanOf),
    ao5: latest(results, 5, averageOf),
    ao12: latest(results, 12, averageOf),
    bestMo3: bestOf(rolling(results, 3, meanOf)),
    bestAo5: bestOf(rolling(results, 5)),
    bestAo12: bestOf(rolling(results, 12)),
  }
}
