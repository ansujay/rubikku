/**
 * Web Worker entry point for the one-face search (the "Make your own" designer). Created by
 * `faceSearchClient.ts` with `new Worker(new URL('./faceSearch.worker.ts', import.meta.url), …)`.
 * Separate from the cubejs solver worker: it is small and starts in a few milliseconds. The
 * search's distance tables stay cached here between requests.
 */
import { findFaceAlgs } from './faceSearch'
import { handleFaceSearchRequest, type FaceSearchRequest } from './faceSearchProtocol'

interface WorkerScope {
  onmessage: ((event: { data: FaceSearchRequest }) => void) | null
  postMessage(message: unknown): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  scope.postMessage(handleFaceSearchRequest({ findFaceAlgs }, event.data))
}
