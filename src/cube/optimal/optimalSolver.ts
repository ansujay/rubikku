/**
 * Asynchronous short-solution solver (Kociemba two-phase via cubejs).
 *
 * Nothing heavy happens until the first call. In the browser the work runs in a Web Worker, so
 * the multi-second table build never blocks the page; in Node (tests) it runs in-process behind
 * the same promise API. Importing this file is cheap — cubejs is only loaded by the worker.
 */
import type { FaceMove } from '../notation'
import type { CubeState } from '../state'
import type { SolverRequest, SolverResponse, SolverTransport } from './protocol'

export interface OptimalSolver {
  /**
   * Start building the solver tables in the background. Optional — `solve` does it on demand —
   * but calling it early (e.g. when the "Solve my cube" page opens) hides the wait.
   */
  warmUp(): Promise<void>
  /**
   * A short solution of face turns for any solvable cube, written for the cube as it is held
   * (no whole-cube rotations). An already solved cube gives []. Cubes within 7 moves of solved
   * get the true shortest solution; others get at most 22 moves. Rejects if the cube is not
   * solvable.
   */
  solve(state: CubeState): Promise<FaceMove[]>
  /** True once `warmUp()` has finished, i.e. the tables are built and solving is fast. */
  readonly ready: boolean
  /** Stop the worker and reject anything still pending. The solver restarts on next use. */
  dispose(): void
}

export interface OptimalSolverOptions {
  /** Supply a custom channel (tests, or a host that manages its own worker). */
  createTransport?: () => SolverTransport
}

function workerTransport(): SolverTransport {
  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
  return {
    send: (request) => worker.postMessage(request),
    onResponse: (listener) => {
      worker.onmessage = (event: MessageEvent<SolverResponse>) => listener(event.data)
    },
    onFailure: (listener) => {
      worker.onerror = (event) => listener(new Error(event.message || 'The solver worker failed to start'))
    },
    terminate: () => worker.terminate(),
  }
}

/** Runs the solver in the current thread, one request per macrotask. Used where there is no Worker. */
function inlineTransport(): SolverTransport {
  let respond: (response: SolverResponse) => void = () => {}
  let fail: (error: Error) => void = () => {}
  let stopped = false
  let queue: Promise<unknown> = Promise.resolve()
  return {
    send(request: SolverRequest) {
      queue = queue
        .then(() => Promise.all([import('./core'), import('./protocol'), new Promise((r) => setTimeout(r, 0))]))
        .then(([core, protocol]) => {
          if (!stopped) respond(protocol.handleSolverRequest(core, request))
        })
        .catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))))
    },
    onResponse(listener) {
      respond = listener
    },
    onFailure(listener) {
      fail = listener
    },
    terminate() {
      stopped = true
    },
  }
}

function defaultTransport(): SolverTransport {
  return typeof Worker !== 'undefined' ? workerTransport() : inlineTransport()
}

/** Create an independent solver (with its own worker). Most code should use `solveOptimal`. */
export function createOptimalSolver(options: OptimalSolverOptions = {}): OptimalSolver {
  const createTransport = options.createTransport ?? defaultTransport
  let transport: SolverTransport | null = null
  let nextId = 1
  let ready = false
  let warming: Promise<void> | null = null
  const pending = new Map<number, { resolve: (moves: FaceMove[] | null) => void; reject: (error: Error) => void }>()

  const rejectAll = (error: Error) => {
    for (const p of pending.values()) p.reject(error)
    pending.clear()
  }

  const reset = () => {
    transport?.terminate()
    transport = null
    ready = false
    warming = null
  }

  const getTransport = (): SolverTransport => {
    if (transport) return transport
    const t = createTransport()
    t.onResponse((response) => {
      const p = pending.get(response.id)
      if (!p) return
      pending.delete(response.id)
      if (response.ok) p.resolve(response.moves)
      else p.reject(new Error(response.error))
    })
    t.onFailure((error) => {
      reset()
      rejectAll(error)
    })
    transport = t
    return t
  }

  const request = (build: (id: number) => SolverRequest): Promise<FaceMove[] | null> =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      try {
        getTransport().send(build(id))
      } catch (error) {
        pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })

  return {
    warmUp() {
      warming ??= request((id) => ({ id, type: 'init' })).then(
        () => {
          ready = true
        },
        (error: unknown) => {
          warming = null
          throw error
        },
      )
      return warming
    },
    async solve(state) {
      const moves = await request((id) => ({ id, type: 'solve', state }))
      return moves ?? []
    },
    get ready() {
      return ready
    },
    dispose() {
      reset()
      rejectAll(new Error('The solver was stopped'))
    },
  }
}

let shared: OptimalSolver | null = null

function sharedSolver(): OptimalSolver {
  shared ??= createOptimalSolver()
  return shared
}

/**
 * Find a short solution for a cube using the shared background solver.
 * See `OptimalSolver.solve` for details. The first call may take a few seconds while the tables
 * are built (call `warmUpOptimalSolver()` earlier to hide that).
 */
export function solveOptimal(state: CubeState): Promise<FaceMove[]> {
  return sharedSolver().solve(state)
}

/** Start preparing the shared solver in the background. Safe to call many times. */
export function warmUpOptimalSolver(): Promise<void> {
  return sharedSolver().warmUp()
}

/** True once `warmUpOptimalSolver()` has finished (tables built, solving is fast). */
export function isOptimalSolverReady(): boolean {
  return shared?.ready ?? false
}

/** Stop the shared solver's worker and free its memory. It restarts automatically on next use. */
export function disposeOptimalSolver(): void {
  shared?.dispose()
  shared = null
}
