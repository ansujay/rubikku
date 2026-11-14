/**
 * Local-calendar date helpers. Streaks are about *his* days, so everything here uses the
 * device's local date (never UTC), and day arithmetic is done on calendar fields so that
 * daylight-saving changes (23h / 25h days) cannot break a streak.
 */

/** `YYYY-MM-DD` for the local calendar day of `date`. */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = KEY_PATTERN.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

/** Days since the epoch for a date key, treating the key as a pure calendar day. */
function dayNumber(key: string): number {
  const match = KEY_PATTERN.exec(key)
  if (!match) return Number.NaN
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000)
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from)
}

/** The date key `days` calendar days after `key` (negative goes back). */
export function addDays(key: string, days: number): string {
  const date = new Date((dayNumber(key) + days) * 86_400_000)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: string): number {
  // 1970-01-01 (day 0) was a Thursday → index 3.
  return (((dayNumber(key) + 3) % 7) + 7) % 7
}

/** The seven date keys (Monday → Sunday) of the week containing `key`. */
export function weekOf(key: string): string[] {
  const monday = addDays(key, -weekdayIndex(key))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}
