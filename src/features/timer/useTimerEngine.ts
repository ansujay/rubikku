/**
 * Wires the pure timer machine (logic/machine.ts) to the real world: keyboard, pointer,
 * window focus and animation frames.
 *
 * - Time comes from `performance.now()` at the moment of each event, so the result never
 *   depends on how often frames are drawn.
 * - While anything is in progress a requestAnimationFrame loop sends `tick`s (to arm the hold
 *   and to enforce the inspection limit) and calls `onFrame` so the caller can paint the
 *   numerals straight into the DOM without re-rendering React 60 times a second.
 * - Space is the timer's key unless the player is clearly using the keyboard on another
 *   control (a visibly focused button, a text field, an open dialog).
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { initialMachine, stepTimer, type TimerEvent, type TimerMachine, type TimerResult } from './logic/machine'

export interface TimerEngineOptions {
  inspection: boolean
  /** Called once when an attempt ends with a result (a time, or a DNF from inspection). */
  onResult: (result: TimerResult) => void
  /** Called when an attempt begins (first press from idle), e.g. to clear the last result. */
  onAttempt?: () => void
  /** Called when Escape throws away a running solve (nothing is recorded). */
  onAbandon?: () => void
  /** Called every animation frame while the machine is not idle. */
  onFrame?: (machine: TimerMachine, now: number) => void
}

export interface TimerEngine {
  machine: TimerMachine
  /** Spread on the big pad. */
  padProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
    onContextMenu: (event: { preventDefault: () => void }) => void
    'data-timer-pad': true
  }
  /** Abandon the attempt in progress without recording anything. */
  reset: () => void
}

const INTERACTIVE = 'a[href], button, input, select, textarea, summary, [role="button"], [role="radio"], [role="tab"], [role="switch"], [tabindex]:not([tabindex="-1"])'
const TEXT_ENTRY = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]), textarea, select, [contenteditable=""], [contenteditable="true"]'

const dialogOpen = () => document.querySelector('[role="dialog"]') !== null
const isBusy = (m: TimerMachine) => m.phase !== 'idle' || m.tapPending

/**
 * Did the focused control get its focus from the keyboard (Tab, arrow keys) rather than a click
 * or tap? `:focus-visible` cannot answer this from inside a key handler — the Space press itself
 * flips it on — so the engine keeps its own note (see the focusin listener below).
 */
let focusCameFromKeyboard = false

/** Should Space be left alone because the player is driving another control with the keyboard? */
function spaceBelongsElsewhere(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || active === document.body) return false
  if (active.matches(TEXT_ENTRY)) return true
  if (active.hasAttribute('data-timer-pad')) return false
  if (!active.matches(INTERACTIVE)) return false
  return focusCameFromKeyboard
}

export function useTimerEngine({ inspection, onResult, onAttempt, onAbandon, onFrame }: TimerEngineOptions): TimerEngine {
  const [machine, setMachine] = useState<TimerMachine>(initialMachine)
  const ref = useRef<TimerMachine>(initialMachine)
  const options = useRef({ inspection, onResult, onAttempt, onAbandon, onFrame })
  useEffect(() => {
    options.current = { inspection, onResult, onAttempt, onAbandon, onFrame }
  })
  const frame = useRef(0)
  /** Which pointer is holding the pad, so a second finger cannot release it. */
  const activePointer = useRef<number | null>(null)

  const dispatch = useCallback((event: TimerEvent) => {
    const before = ref.current
    const step = stepTimer(before, event, { inspection: options.current.inspection })
    if (step.state !== before) {
      ref.current = step.state
      setMachine(step.state)
      if (!isBusy(before) && isBusy(step.state)) options.current.onAttempt?.()
    }
    if (step.result) options.current.onResult(step.result)
  }, [])

  // Frames: only while something is happening.
  const busy = isBusy(machine)
  useEffect(() => {
    if (!busy) return
    const loop = () => {
      const now = performance.now()
      dispatch({ type: 'tick', at: now })
      options.current.onFrame?.(ref.current, now)
      frame.current = requestAnimationFrame(loop)
    }
    frame.current = requestAnimationFrame(loop)
    // Frames stop in a hidden tab; a slow timer keeps the inspection limit honest there.
    const backstop = window.setInterval(() => dispatch({ type: 'tick', at: performance.now() }), 250)
    return () => {
      cancelAnimationFrame(frame.current)
      window.clearInterval(backstop)
    }
  }, [busy, dispatch])

  useEffect(() => {
    /** After a tap stops the timer, the click that follows must not press whatever is underneath. */
    const swallowNextClick = () => {
      const swallow = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 450)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const m = ref.current
      const at = performance.now()
      if (m.phase === 'running') {
        event.preventDefault()
        event.stopPropagation()
        if (event.repeat) return
        if (event.key === 'Escape') {
          // Escape means "never mind": the attempt is thrown away, not saved as a solve.
          dispatch({ type: 'reset' })
          options.current.onAbandon?.()
        } else dispatch({ type: 'press', at }) // any other key stops the clock
        return
      }
      if (event.key === 'Escape') {
        if (isBusy(m)) {
          event.preventDefault()
          dispatch({ type: 'reset' })
        }
        return
      }
      if (event.code !== 'Space' && event.key !== ' ') return
      if (m.awaitRelease) {
        event.preventDefault() // still holding the key that stopped the clock
        return
      }
      if (!isBusy(m) && (dialogOpen() || spaceBelongsElsewhere())) return
      event.preventDefault()
      if (event.repeat) return
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body && !active.hasAttribute('data-timer-pad')) active.blur()
      dispatch({ type: 'press', at })
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const m = ref.current
      const space = event.code === 'Space' || event.key === ' '
      if (m.awaitRelease) {
        if (space) event.preventDefault()
        dispatch({ type: 'release', at: performance.now() })
        return
      }
      if (!space || !isBusy(m)) return
      event.preventDefault()
      dispatch({ type: 'release', at: performance.now() })
    }

    // Capture phase, so a tap anywhere works while the focus overlay is up.
    const onPointerDown = (event: PointerEvent) => {
      const m = ref.current
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (m.phase === 'running') {
        event.preventDefault()
        activePointer.current = event.pointerId
        swallowNextClick()
        dispatch({ type: 'press', at: performance.now() })
      } else if (m.phase === 'inspecting') {
        event.preventDefault()
        activePointer.current = event.pointerId
        dispatch({ type: 'press', at: performance.now() })
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (activePointer.current !== event.pointerId) return
      activePointer.current = null
      const m = ref.current
      if (m.awaitRelease || isBusy(m)) {
        if (m.phase === 'holding' || m.phase === 'ready') swallowNextClick()
        dispatch({ type: 'release', at: performance.now() })
      }
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (activePointer.current !== event.pointerId) return
      activePointer.current = null
      dispatch({ type: 'cancel' })
    }

    // Losing focus mid-hold means the key-up will never arrive: drop the hold. A running solve keeps running.
    const onBlur = () => {
      activePointer.current = null
      dispatch({ type: 'cancel' })
    }
    const onVisibility = () => {
      if (document.hidden) onBlur()
    }

    // A finger resting on the pad must not turn into a scroll and cancel the hold.
    const onTouchMove = (event: TouchEvent) => {
      // The first 300 ms of a hold on the pad may still become a scroll (the browser then cancels the hold).
      const m = ref.current
      const committed = m.phase === 'ready' || m.phase === 'running' || m.inspectStart !== null
      if (committed && event.cancelable) event.preventDefault()
    }

    // Track how focus moves, so Space can tell "I tabbed to this button" from "I clicked it earlier".
    let navigating = false
    const onNavKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || event.key.startsWith('Arrow')) navigating = true
    }
    const onAnyPointer = () => {
      navigating = false
    }
    const onFocusIn = () => {
      focusCameFromKeyboard = navigating
    }
    window.addEventListener('keydown', onNavKey, true)
    window.addEventListener('pointerdown', onAnyPointer, true)
    window.addEventListener('focusin', onFocusIn, true)

    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('pointercancel', onPointerCancel, true)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onNavKey, true)
      window.removeEventListener('pointerdown', onAnyPointer, true)
      window.removeEventListener('focusin', onFocusIn, true)
      focusCameFromKeyboard = false
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointerup', onPointerUp, true)
      window.removeEventListener('pointercancel', onPointerCancel, true)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [dispatch])

  const onPadPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const m = ref.current
      if (m.phase !== 'idle' || m.awaitRelease || activePointer.current !== null) return
      activePointer.current = event.pointerId
      dispatch({ type: 'press', at: performance.now() })
    },
    [dispatch],
  )

  const reset = useCallback(() => dispatch({ type: 'reset' }), [dispatch])

  return {
    machine,
    padProps: { onPointerDown: onPadPointerDown, onContextMenu: (event) => event.preventDefault(), 'data-timer-pad': true },
    reset,
  }
}
