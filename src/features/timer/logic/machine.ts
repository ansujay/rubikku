/**
 * The timer as a pure state machine, driven by timestamps from `performance.now()`.
 *
 *   idle ──press──▶ holding ──(held ≥ HOLD_MS)──▶ ready ──release──▶ running ──press──▶ idle (+ result)
 *                      └──release too early──▶ idle
 *
 * With inspection on, a first tap starts the 15-second countdown instead, and the same
 * hold-then-release starts the solve from there:
 *
 *   idle ──press, release──▶ inspecting ──press──▶ holding ──▶ ready ──release──▶ running
 *
 * Inspection running past 17 s ends the attempt as a DNF. The press that stops the timer must
 * be released before a new attempt can begin, so one long key press can never stop and re-arm.
 */
import { INSPECTION_DNF_MS, inspectionPenalty } from './inspection'
import type { Penalty } from './solves'

/** How long the pad must be held before letting go starts the timer. */
export const HOLD_MS = 300

export type TimerPhase = 'idle' | 'holding' | 'ready' | 'inspecting' | 'running'

export interface TimerMachine {
  phase: TimerPhase
  /** When the current hold began (holding / ready). */
  holdStart: number | null
  /** When inspection began, if this attempt has one. */
  inspectStart: number | null
  /** When the solve began (running). */
  runStart: number | null
  /** Penalty earned during inspection, carried into the result. */
  penalty: Penalty
  /** True after a stop until the stopping press is released. */
  awaitRelease: boolean
  /** True while the press that will start inspection is down. */
  tapPending: boolean
}

export const initialMachine: TimerMachine = {
  phase: 'idle',
  holdStart: null,
  inspectStart: null,
  runStart: null,
  penalty: 'ok',
  awaitRelease: false,
  tapPending: false,
}

export type TimerEvent =
  /** A key or finger went down. */
  | { type: 'press'; at: number }
  /** A key or finger came up. */
  | { type: 'release'; at: number }
  /** Time passed (sent every animation frame while something is happening). */
  | { type: 'tick'; at: number }
  /** Abandon whatever is in progress (Escape before the start, window lost focus mid-hold). */
  | { type: 'cancel' }
  /** Abandon everything, including a running solve. */
  | { type: 'reset' }

export interface TimerResult {
  ms: number
  penalty: Penalty
}

export interface TimerStep {
  state: TimerMachine
  /** Set on the step that finishes an attempt. */
  result?: TimerResult
}

export interface TimerConfig {
  inspection: boolean
  holdMs?: number
}

const same = (state: TimerMachine): TimerStep => ({ state })

export function stepTimer(state: TimerMachine, event: TimerEvent, config: TimerConfig): TimerStep {
  const holdMs = config.holdMs ?? HOLD_MS

  switch (event.type) {
    case 'reset':
      return state === initialMachine ? same(state) : { state: initialMachine }

    case 'cancel': {
      switch (state.phase) {
        case 'running':
          return same(state) // a solve in progress keeps going; time is still passing
        case 'holding':
        case 'ready':
          // Drop the hold. Inspection, if any, carries on.
          return { state: { ...state, phase: state.inspectStart !== null ? 'inspecting' : 'idle', holdStart: null } }
        case 'idle':
          return state.tapPending || state.awaitRelease ? { state: { ...state, tapPending: false, awaitRelease: false } } : same(state)
        default:
          return same(state)
      }
    }

    case 'press': {
      if (state.awaitRelease) return same(state)
      switch (state.phase) {
        case 'idle':
          return config.inspection ? { state: { ...state, tapPending: true } } : { state: { ...state, phase: 'holding', holdStart: event.at } }
        case 'inspecting':
          return { state: { ...state, phase: 'holding', holdStart: event.at } }
        case 'running': {
          const ms = Math.max(0, event.at - (state.runStart ?? event.at))
          return { state: { ...initialMachine, awaitRelease: true }, result: { ms, penalty: state.penalty } }
        }
        default:
          return same(state)
      }
    }

    case 'release': {
      if (state.awaitRelease) return { state: { ...state, awaitRelease: false } }
      switch (state.phase) {
        case 'idle':
          return state.tapPending ? { state: { ...state, phase: 'inspecting', inspectStart: event.at, tapPending: false } } : same(state)
        case 'holding':
        case 'ready': {
          // Normally a tick has already promoted a long hold to "ready"; if frames were
          // skipped, the timestamps still tell the truth.
          const heldLongEnough = state.phase === 'ready' || (state.holdStart !== null && event.at - state.holdStart >= holdMs)
          if (!heldLongEnough) {
            return { state: { ...state, phase: state.inspectStart !== null ? 'inspecting' : 'idle', holdStart: null } }
          }
          const penalty = state.inspectStart !== null ? inspectionPenalty(event.at - state.inspectStart) : 'ok'
          if (penalty === 'dnf') return { state: initialMachine, result: { ms: 0, penalty: 'dnf' } }
          return { state: { ...state, phase: 'running', holdStart: null, runStart: event.at, penalty } }
        }
        default:
          return same(state)
      }
    }

    case 'tick': {
      if (state.inspectStart !== null && state.phase !== 'running' && event.at - state.inspectStart > INSPECTION_DNF_MS) {
        // Out of inspection time. If a finger is still down, wait for it to lift before the next attempt.
        const held = state.phase === 'holding' || state.phase === 'ready'
        return { state: { ...initialMachine, awaitRelease: held }, result: { ms: 0, penalty: 'dnf' } }
      }
      if (state.phase === 'holding' && state.holdStart !== null && event.at - state.holdStart >= holdMs) {
        return { state: { ...state, phase: 'ready' } }
      }
      return same(state)
    }
  }
}

/** Milliseconds on the clock for a running solve. */
export const runningMs = (state: TimerMachine, now: number): number => (state.runStart === null ? 0 : Math.max(0, now - state.runStart))

/** Milliseconds of inspection used so far. */
export const inspectionMs = (state: TimerMachine, now: number): number => (state.inspectStart === null ? 0 : Math.max(0, now - state.inspectStart))
