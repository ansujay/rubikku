/**
 * Asynchronous one-face search for the "Make your own" designer.
 *
 * The search itself (`faceSearch.ts`) is synchronous: well under 0.1 s with face turns, up to
 * ~0.7 s with the middle slices, mostly building tables. In the browser it runs in its own Web
 * Worker so painting never stutters; in Node (tests) it runs in-process behind the same promise
 * API. This file only imports types from the search; the main bundle has the search module
 * anyway (the cube index re-exports `faceShows` and `flagStart` from it), but the main thread
 * never runs a search.
 *
 * Latest wins. A designer fires a search after every paint stroke, so only the newest request
 * matters: asking again cancels every older promise (it rejects with `FaceSearchCancelled`).
 * At most one request is with the worker at a time and at most one waits behind it, so a burst
 * of edits never builds a queue of stale searches. A stale search still in the worker is left to
 * finish rather than the worker being killed: the distance tables it builds stay cached there and
 * are usually what the next search needs (a one-sticker change keeps one of its two tables).
 * Answers are cached, so going back to a design (or from the designer to its player) is instant;
 * "nothing found" is not cached, so asking again really searches again.
 */
import type { FaceGrid, FaceSolution } from './faceSearch'
import type { FaceSearchRequest, FaceSearchResponse, FaceSearchTransport } from './faceSearchProtocol'

export interface FaceSearchQuery {
  /** Also use the middle slices M, E, S (default false). */
  slices?: boolean
}

export interface FaceSearchClient {
  /**
   * The best "hold, then moves" that puts `grid` on the front face (null if none was found,
   * which does not happen for a 3x3 face). Rejects with `FaceSearchCancelled` when a newer
   * search replaces it.
   */
  search(grid: FaceGrid, query?: FaceSearchQuery): Promise<FaceSolution | null>
  /** A cached answer, or undefined if this face has no answer yet ("nothing found" is not kept). */
  peek(grid: FaceGrid, query?: FaceSearchQuery): FaceSolution | undefined
  /** Stop the worker and cancel anything pending. It restarts on next use. */
  dispose(): void
}

export interface FaceSearchClientOptions {
  /** Supply a custom channel (tests, or a host that manages its own worker). */
  createTransport?: () => FaceSearchTransport
  /** How many answers to remember (default 32). */
  cacheSize?: number
}

/** The promise of a search that a newer search replaced. Not an error to show anyone. */
export class FaceSearchCancelled extends Error {
  constructor() {
    super('A newer search replaced this one')
    this.name = 'FaceSearchCancelled'
  }
}

export const isFaceSearchCancelled = (error: unknown): error is FaceSearchCancelled => error instanceof FaceSearchCancelled

function workerTransport(): FaceSearchTransport {
  const worker = new Worker(new URL('./faceSearch.worker.ts', import.meta.url), { type: 'module' })
  return {
    send: (request) => worker.postMessage(request),
    onResponse: (listener) => {
      worker.onmessage = (event: MessageEvent<FaceSearchResponse>) => listener(event.data)
    },
    onFailure: (listener) => {
      worker.onerror = (event) => listener(new Error(event.message || 'The face search worker failed to start'))
    },
    terminate: () => worker.terminate(),
  }
}

/** Runs the search in the current thread, one request per macrotask. Used where there is no Worker. */
function inlineTransport(): FaceSearchTransport {
  let respond: (response: FaceSearchResponse) => void = () => {}
  let fail: (error: Error) => void = () => {}
  let stopped = false
  let queue: Promise<unknown> = Promise.resolve()
  return {
    send(request: FaceSearchRequest) {
      queue = queue
        .then(() => Promise.all([import('./faceSearch'), import('./faceSearchProtocol'), new Promise((r) => setTimeout(r, 0))]))
        .then(([search, protocol]) => {
          if (!stopped) respond(protocol.handleFaceSearchRequest(search, request))
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

function defaultTransport(): FaceSearchTransport {
  return typeof Worker !== 'undefined' ? workerTransport() : inlineTransport()
}

/** The cache key for a face and a move set: "WWWWRWWWW" or "WWWWRWWWW+s". */
export const faceSearchKey = (grid: FaceGrid, query: FaceSearchQuery = {}): string => grid.map((c) => c[0]).join('') + (query.slices ? '+s' : '')

interface Waiter {
  resolve: (solution: FaceSolution | null) => void
  reject: (error: Error) => void
}

export function createFaceSearchClient(options: FaceSearchClientOptions = {}): FaceSearchClient {
  const createTransport = options.createTransport ?? defaultTransport
  const cacheSize = options.cacheSize ?? 32
  const cache = new Map<string, FaceSolution>()
  let transport: FaceSearchTransport | null = null
  let nextId = 1
  /** The request the worker is busy with. Its waiter is null once a newer search replaced it. */
  let inflight: { id: number; key: string; waiter: Waiter | null } | null = null
  /** The newest request, waiting for the worker to be free. */
  let queued: { key: string; grid: FaceGrid; slices: boolean; waiter: Waiter } | null = null

  const remember = (key: string, solution: FaceSolution) => {
    cache.delete(key)
    cache.set(key, solution)
    if (cache.size > cacheSize) cache.delete(cache.keys().next().value!)
  }

  const cancel = (waiter: Waiter | null | undefined) => waiter?.reject(new FaceSearchCancelled())

  const failAll = (error: Error) => {
    const waiters = [inflight?.waiter, queued?.waiter]
    inflight = null
    queued = null
    for (const waiter of waiters) waiter?.reject(error)
  }

  const reset = () => {
    transport?.terminate()
    transport = null
  }

  const getTransport = (): FaceSearchTransport => {
    if (transport) return transport
    const t = createTransport()
    t.onResponse((response) => {
      if (!inflight || inflight.id !== response.id) return
      const { key, waiter } = inflight
      inflight = null
      if (response.ok) {
        if (response.solution) remember(key, response.solution)
        waiter?.resolve(response.solution)
      } else {
        waiter?.reject(new Error(response.error))
      }
      pump()
    })
    t.onFailure((error) => {
      reset()
      failAll(error)
    })
    transport = t
    return t
  }

  /** Hand the waiting request to the worker once it is free (or answer it from the cache). */
  const pump = () => {
    if (inflight || !queued) return
    const next = queued
    queued = null
    if (cache.has(next.key)) {
      next.waiter.resolve(cache.get(next.key)!)
      return
    }
    const id = nextId++
    inflight = { id, key: next.key, waiter: next.waiter }
    try {
      getTransport().send({ id, grid: [...next.grid] as unknown as FaceGrid, slices: next.slices })
    } catch (error) {
      inflight = null
      next.waiter.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  return {
    search(grid, query = {}) {
      const key = faceSearchKey(grid, query)
      return new Promise<FaceSolution | null>((resolve, reject) => {
        const waiter: Waiter = { resolve, reject }
        // Whatever was asked before is now stale.
        cancel(queued?.waiter)
        queued = null
        if (inflight) {
          cancel(inflight.waiter)
          inflight.waiter = null
          // The worker is already on this very face: wait for that answer.
          if (inflight.key === key) {
            inflight.waiter = waiter
            return
          }
        }
        if (cache.has(key)) {
          resolve(cache.get(key)!)
          return
        }
        queued = { key, grid, slices: Boolean(query.slices), waiter }
        pump()
      })
    },
    peek(grid, query = {}) {
      const key = faceSearchKey(grid, query)
      return cache.has(key) ? cache.get(key) : undefined
    },
    dispose() {
      reset()
      const waiters = [inflight?.waiter, queued?.waiter]
      inflight = null
      queued = null
      for (const waiter of waiters) cancel(waiter)
    },
  }
}

let shared: FaceSearchClient | null = null

function sharedClient(): FaceSearchClient {
  shared ??= createFaceSearchClient()
  return shared
}

/** Search with the shared background worker. Latest wins: see `FaceSearchClient.search`. */
export function searchFace(grid: FaceGrid, query?: FaceSearchQuery): Promise<FaceSolution | null> {
  return sharedClient().search(grid, query)
}

/** The shared worker's cached answer for this face, if it has one. */
export function peekFace(grid: FaceGrid, query?: FaceSearchQuery): FaceSolution | undefined {
  return shared?.peek(grid, query)
}

/** Stop the shared worker and free its memory. It restarts automatically on next use. */
export function disposeFaceSearch(): void {
  shared?.dispose()
  shared = null
}
