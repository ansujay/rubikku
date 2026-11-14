/**
 * WCA inspection: up to 15 seconds to look at the cube before starting. A judge calls
 * "8 seconds" and "12 seconds". Starting after 15 s costs +2; after 17 s the solve is a DNF.
 */
import type { Penalty } from './solves'

export const INSPECTION_MS = 15_000
export const INSPECTION_DNF_MS = 17_000

export type InspectionStage = 'calm' | 'eight' | 'twelve' | 'over'

export function inspectionStage(elapsedMs: number): InspectionStage {
  if (elapsedMs >= INSPECTION_MS) return 'over'
  if (elapsedMs >= 12_000) return 'twelve'
  if (elapsedMs >= 8_000) return 'eight'
  return 'calm'
}

/** The penalty for starting the solve `elapsedMs` into inspection. */
export function inspectionPenalty(elapsedMs: number): Penalty {
  if (elapsedMs > INSPECTION_DNF_MS) return 'dnf'
  if (elapsedMs > INSPECTION_MS) return '+2'
  return 'ok'
}

/** What the countdown shows: whole seconds left (15 → 1), then "+2" once time is up. */
export function inspectionDisplay(elapsedMs: number): string {
  if (elapsedMs >= INSPECTION_MS) return '+2'
  return String(Math.ceil((INSPECTION_MS - Math.max(0, elapsedMs)) / 1000))
}
