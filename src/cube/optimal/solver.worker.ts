/**
 * Web Worker entry point for the short-solution solver. Created by `optimalSolver.ts` with
 * `new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })`.
 */
import * as core from './core'
import { handleSolverRequest, type SolverRequest } from './protocol'

interface WorkerScope {
  onmessage: ((event: { data: SolverRequest }) => void) | null
  postMessage(message: unknown): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  scope.postMessage(handleSolverRequest(core, event.data))
}
