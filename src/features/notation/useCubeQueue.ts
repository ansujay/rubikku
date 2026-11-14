import { useEffect, useMemo, useRef } from 'react'
import { invertAlg, SOLVED, type CubeState } from '../../cube'
import type { CubeController } from '../../three'

export const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

export interface CubeQueue {
  /** Run a step after everything already queued. `alive()` turns false once the queue is cancelled. */
  run(task: (alive: () => boolean) => Promise<void> | void): Promise<void>
  /** Drop everything queued and stop the cube where it is. */
  cancel(): void
  /** Play the moves made so far backwards (fast), so the cube glides home instead of snapping. */
  rewind(speed?: number): Promise<void>
}

/**
 * A tiny choreographer for pages that script the cube (demo, wait, rewind, next question…):
 * steps run strictly one after another, and `cancel()` abandons the rest.
 * `home` is the state the cube should be in between steps.
 */
export function useCubeQueue(controller: CubeController, home: CubeState = SOLVED): CubeQueue {
  const generation = useRef(0)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const homeRef = useRef(home)
  homeRef.current = home

  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )

  return useMemo<CubeQueue>(() => {
    const run: CubeQueue['run'] = (task) => {
      const mine = generation.current
      const alive = () => mine === generation.current
      chain.current = chain.current
        .then(() => (alive() ? task(alive) : undefined))
        .catch(() => undefined)
      return chain.current
    }
    return {
      run,
      cancel() {
        generation.current++
        controller.stop()
      },
      rewind(speed = 3) {
        return run(async () => {
          const { history, state } = controller.getSnapshot()
          if (state === homeRef.current) return
          if (history.length > 0) await controller.apply(invertAlg(history), { speed, record: false })
          if (controller.getSnapshot().state !== homeRef.current) controller.reset(homeRef.current)
        })
      },
    }
  }, [controller])
}
