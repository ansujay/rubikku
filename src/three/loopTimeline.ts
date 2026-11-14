/**
 * Timeline of a looping algorithm demo, as a pure function of elapsed time. Used by MiniCube:
 * because a frame depends only on the clock, a mini can be paused, hidden or skipped for a
 * frame and always picks up in the right place.
 */
import { moveAmount, type Move } from '../cube'
import { DOUBLE_TURN_FACTOR, easeTurn } from './turns'

export interface LoopTiming {
  /** Milliseconds per quarter turn. */
  quarterMs: number
  /** Pause between moves. */
  gapMs: number
  /** Rest on the starting cube before the first move. */
  holdStartMs: number
  /** Rest on the finished cube. */
  holdEndMs: number
  /** Fade out/in around the jump back to the start. */
  fadeMs: number
  loop: boolean
}

export const DEFAULT_LOOP_TIMING: LoopTiming = { quarterMs: 360, gapMs: 110, holdStartMs: 650, holdEndMs: 1300, fadeMs: 180, loop: true }

export interface LoopFrame {
  /** Moves completely done: the cube to draw is `states[applied]`. */
  applied: number
  /** The move in flight (turning from `states[applied]`), or null while resting. */
  move: Move | null
  /** Eased progress of that move, 0…1. */
  progress: number
  /** Opacity, for the fade around the loop point. */
  alpha: number
  /** True once a non-looping run has finished. */
  done: boolean
}

export function loopDuration(alg: readonly Move[], timing: LoopTiming): number {
  let total = timing.holdStartMs + timing.holdEndMs
  for (const move of alg) total += timing.quarterMs * (moveAmount(move) === 2 ? DOUBLE_TURN_FACTOR : 1) + timing.gapMs
  return total
}

export function loopFrame(alg: readonly Move[], elapsedMs: number, timing: LoopTiming = DEFAULT_LOOP_TIMING): LoopFrame {
  const total = loopDuration(alg, timing)
  if (alg.length === 0) return { applied: 0, move: null, progress: 0, alpha: 1, done: true }
  let t = Math.max(0, elapsedMs)
  const cycle = Math.floor(t / total)
  if (!timing.loop && t >= total - timing.holdEndMs) return { applied: alg.length, move: null, progress: 0, alpha: 1, done: true }
  t -= cycle * total
  let alpha = 1
  if (timing.loop && timing.fadeMs > 0) {
    if (cycle > 0 && t < timing.fadeMs) alpha = t / timing.fadeMs
    else if (t > total - timing.fadeMs) alpha = (total - t) / timing.fadeMs
  }
  if (t < timing.holdStartMs) return { applied: 0, move: null, progress: 0, alpha, done: false }
  t -= timing.holdStartMs
  for (let i = 0; i < alg.length; i++) {
    const duration = timing.quarterMs * (moveAmount(alg[i]) === 2 ? DOUBLE_TURN_FACTOR : 1)
    if (t < duration) return { applied: i, move: alg[i], progress: easeTurn(t / duration), alpha, done: false }
    t -= duration
    if (t < timing.gapMs) return { applied: i + 1, move: null, progress: 0, alpha, done: false }
    t -= timing.gapMs
  }
  return { applied: alg.length, move: null, progress: 0, alpha, done: false }
}
