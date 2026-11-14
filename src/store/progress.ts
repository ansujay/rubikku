import { createPersistedStore } from './persist'
import {
  applyEvent,
  initialProgress,
  mergeProgress,
  sanitizeProgress,
  type EventResult,
  type ProgressData,
  type ProgressEventMap,
  type ProgressEventType,
} from './progressLogic'

export interface ProgressState extends ProgressData {
  /**
   * The single entry point for "something worth rewarding happened".
   * Updates XP, streak, badges, lesson completion and the activity log, and returns what
   * changed so the caller can celebrate (see `reward()` in src/app/rewards.ts, which also
   * shows the toast and plays the sound — prefer that from feature code).
   */
  recordEvent: <K extends ProgressEventType>(type: K, payload: ProgressEventMap[K], now?: Date) => EventResult
  /**
   * Correct the all-time best timed solve after the solve it pointed at was deleted or given a
   * penalty in the timer: pass the fastest solve that still stands, or null when none does.
   * Nothing else changes — no XP, no badges, no streak, no log entry.
   */
  correctBestSolve: (ms: number | null) => void
}

export const useProgress = createPersistedStore<ProgressState>(
  {
    name: 'progress',
    version: 1,
    migrate: (persisted) => persisted,
    sanitize: (persisted) => sanitizeProgress(persisted),
    // Another tab saved: take its progress, but never let XP, badges or lessons go backwards.
    mergeRemote: (local, remote) => mergeProgress(sanitizeProgress(local), sanitizeProgress(remote)),
  },
  (set, get) => ({
    ...initialProgress(),
    recordEvent: (type, payload, now = new Date()) => {
      const { recordEvent: _keep, correctBestSolve: _alsoKeep, ...data } = get()
      void _keep
      void _alsoKeep
      const { data: next, result } = applyEvent(data, type, payload, now)
      if (next !== data) set(next)
      return result
    },
    correctBestSolve: (ms) => {
      const best = typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? Math.round(ms) : null
      if (best !== get().bestSolveMs) set({ bestSolveMs: best })
    },
  }),
)
