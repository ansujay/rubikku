/**
 * Messages between the main thread and the one-face search worker, plus the request handler
 * (kept apart from the worker entry file so it can be unit-tested without a real Worker, and
 * apart from the client so the worker bundle never pulls in `new Worker(...)`).
 */
import type { FaceGrid, FaceSearchOptions, FaceSolution } from './faceSearch'

export interface FaceSearchRequest {
  id: number
  grid: FaceGrid
  slices: boolean
}

export type FaceSearchResponse =
  | { id: number; ok: true; solution: FaceSolution | null }
  | { id: number; ok: false; error: string }

/** The slice of `faceSearch.ts` the handler needs (lets tests substitute a fake). */
export interface FaceSearchCore {
  findFaceAlgs(grid: FaceGrid, opts?: FaceSearchOptions): FaceSolution[]
}

/** The best "hold, then moves" for one request; `null` only if nothing was found. */
export function handleFaceSearchRequest(core: FaceSearchCore, request: FaceSearchRequest): FaceSearchResponse {
  try {
    const [best] = core.findFaceAlgs(request.grid, { slices: request.slices })
    return { id: request.id, ok: true, solution: best ? { hold: [...best.hold], moves: [...best.moves] } : null }
  } catch (error) {
    return { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** A two-way channel to something that answers `FaceSearchRequest`s. */
export interface FaceSearchTransport {
  send(request: FaceSearchRequest): void
  /** Register the single listener for responses. */
  onResponse(listener: (response: FaceSearchResponse) => void): void
  /** Register the single listener for a fatal failure of the channel itself. */
  onFailure(listener: (error: Error) => void): void
  terminate(): void
}
