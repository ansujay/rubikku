/**
 * Messages exchanged between the main thread and the solver worker, plus the request handler
 * (kept separate from the worker entry file so it can be unit-tested without a real Worker).
 */
import type { FaceMove } from '../notation'
import type { CubeState } from '../state'

export type SolverRequest = { id: number; type: 'init' } | { id: number; type: 'solve'; state: CubeState }

export type SolverResponse =
  | { id: number; ok: true; moves: FaceMove[] | null }
  | { id: number; ok: false; error: string }

/** The slice of the core module the handler needs (lets tests substitute a fake). */
export interface SolverCore {
  initSolverSync(): void
  solveSync(state: CubeState): FaceMove[]
}

export function handleSolverRequest(core: SolverCore, request: SolverRequest): SolverResponse {
  try {
    if (request.type === 'init') {
      core.initSolverSync()
      return { id: request.id, ok: true, moves: null }
    }
    return { id: request.id, ok: true, moves: core.solveSync(request.state) }
  } catch (error) {
    return { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** A two-way channel to something that answers `SolverRequest`s. */
export interface SolverTransport {
  send(request: SolverRequest): void
  /** Register the single listener for responses. */
  onResponse(listener: (response: SolverResponse) => void): void
  /** Register the single listener for a fatal failure of the channel itself. */
  onFailure(listener: (error: Error) => void): void
  terminate(): void
}
