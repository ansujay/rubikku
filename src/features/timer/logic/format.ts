import { isDnf, resultMs, truncateCentis, type Solve } from './solves'

/**
 * Stopwatch text for a duration: "8.04", "59.99", "1:02.30", "12:00.00". Truncates to
 * hundredths (never rounds a time down past what was achieved… or up to what was not).
 */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms)) return 'DNF'
  const centis = Math.floor(truncateCentis(ms) / 10)
  const minutes = Math.floor(centis / 6000)
  const seconds = Math.floor((centis % 6000) / 100)
  const hundredths = String(centis % 100).padStart(2, '0')
  if (minutes === 0) return `${seconds}.${hundredths}`
  return `${minutes}:${String(seconds).padStart(2, '0')}.${hundredths}`
}

/** A result that may be missing or DNF: "—", "DNF" or the time. */
export function formatResult(result: number | null | undefined): string {
  if (result === null || result === undefined || Number.isNaN(result)) return '—'
  return isDnf(result) ? 'DNF' : formatTime(result)
}

/** A solve as shown in lists: "12.34", "14.34+" (two-second penalty included), "DNF". */
export function formatSolve(solve: Pick<Solve, 'ms' | 'penalty'>): string {
  if (solve.penalty === 'dnf') return 'DNF'
  const text = formatTime(resultMs(solve))
  return solve.penalty === '+2' ? `${text}+` : text
}

/** Axis label in whole seconds: "0:45", "1:30", "12:00". */
export function formatAxisTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** A duration read aloud: "1 minute 2.30 seconds". */
export function spokenTime(ms: number): string {
  if (!Number.isFinite(ms)) return 'did not finish'
  const centis = Math.floor(truncateCentis(ms) / 10)
  const minutes = Math.floor(centis / 6000)
  const seconds = ((centis % 6000) / 100).toFixed(2)
  const secText = `${seconds} seconds`
  return minutes === 0 ? secText : `${minutes} minute${minutes === 1 ? '' : 's'} ${secText}`
}

/** "Today, 4:05 PM", "Yesterday, 9:12 AM", "3 Nov, 9:12 AM", "3 Nov 2025". */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  const day = `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`
  return date.getFullYear() === now.getFullYear() ? `${day}, ${time}` : `${day} ${date.getFullYear()}`
}
