/** Axis maths for the improvement chart. Pure. */

const STEPS_MS = [100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000]

export interface TimeAxis {
  min: number
  max: number
  /** Tick values in ms, ascending, all within [min, max]. */
  ticks: number[]
  step: number
}

/**
 * A y-axis for times between `lo` and `hi` (ms): round-number bounds with about `target`
 * ticks, on steps a person reads easily (5 s, 10 s, 15 s, 30 s, 1 min …). Never below zero.
 */
export function timeAxis(lo: number, hi: number, target = 4): TimeAxis {
  let low = Number.isFinite(lo) ? Math.max(0, lo) : 0
  let high = Number.isFinite(hi) ? Math.max(low, hi) : low
  if (high - low < 1) {
    // One value (or all equal): centre it in a band about a fifth of its size.
    const pad = Math.max(1000, high * 0.2)
    low = Math.max(0, low - pad)
    high = high + pad
  }
  const span = high - low
  const step = STEPS_MS.find((s) => span / s <= target) ?? STEPS_MS[STEPS_MS.length - 1]
  const min = Math.floor(low / step) * step
  const max = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let v = min; v <= max + 1e-6; v += step) ticks.push(v)
  return { min, max, ticks, step }
}

/** Whole-number x ticks (1-based solve numbers) for `count` points: first, last and a few between. */
export function indexTicks(first: number, last: number, maxTicks = 6): number[] {
  if (last < first) return []
  if (last === first) return [first]
  const span = last - first
  const rough = span / Math.max(1, maxTicks - 1)
  const pow = 10 ** Math.floor(Math.log10(Math.max(1, rough)))
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow)
  const ticks = [first]
  for (let v = Math.ceil((first + 1) / step) * step; v < last; v += step) if (v - first >= step * 0.6 && last - v >= step * 0.6) ticks.push(v)
  ticks.push(last)
  return ticks
}

/** Does the axis need sub-second labels? */
export const axisNeedsDecimals = (axis: TimeAxis): boolean => axis.step < 1000
