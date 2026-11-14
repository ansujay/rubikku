/**
 * `lazyPage` is `React.lazy` for route chunks, with a real "Try again".
 *
 * `React.lazy` remembers a failed import for ever, so after one dropped connection the page could
 * never load without a manual reload. Here a failed import is remembered as *failed*, and
 * `retryFailedChunks()` swaps in a fresh `lazy()` for each one and re-renders — the import runs
 * again. If it fails a second time the chunk is most likely gone (a new version was deployed
 * while this tab was open): the error page then offers a reload, which fetches the new app.
 */
import { lazy, useSyncExternalStore, type ComponentType } from 'react'

/** A page's code could not be fetched (offline, flaky network, or an old chunk after a deploy). */
export class ChunkLoadError extends Error {
  /** How many times in a row loading has failed for this chunk. */
  readonly attempts: number
  constructor(cause: unknown, attempts: number) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'ChunkLoadError'
    this.attempts = attempts
  }
}

export const isChunkLoadError = (error: unknown): error is ChunkLoadError => error instanceof ChunkLoadError

const failed = new Set<() => void>()
const listeners = new Set<() => void>()
let version = 0

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getVersion = () => version

/** Give every chunk that failed to load another go. Returns false when there was nothing to retry. */
export function retryFailedChunks(): boolean {
  if (failed.size === 0) return false
  for (const remake of [...failed]) remake()
  failed.clear()
  version++
  for (const listener of [...listeners]) listener()
  return true
}

/** A route page that can be fetched ahead of time. */
export type LazyPage<P> = ComponentType<P> & {
  /** Fetch the page's code now (idle time, a hover on its link). Never throws; a failure is ignored here and surfaces on a real visit. */
  preload: () => Promise<void>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): LazyPage<React.ComponentProps<T>> {
  let attempts = 0
  // Once the code is here, render it directly: no Suspense, no fallback, not even for a frame.
  let ready: T | null = null
  let preloading: Promise<void> | null = null
  const make = () =>
    lazy(() =>
      load().then(
        (module) => {
          attempts = 0
          ready = module.default
          return module
        },
        (cause: unknown) => {
          attempts++
          failed.add(remake)
          throw new ChunkLoadError(cause, attempts)
        },
      ),
    )
  let Current = make()
  function remake() {
    Current = make()
  }
  function LazyPage(props: React.ComponentProps<T>) {
    // Re-render (with the fresh lazy component) when a retry is asked for.
    useSyncExternalStore(subscribe, getVersion, getVersion)
    const Page = (ready ?? Current) as ComponentType<React.ComponentProps<T>>
    return <Page {...props} />
  }
  const preload = () => {
    if (ready) return Promise.resolve()
    preloading ??= load().then(
      (module) => {
        ready = module.default
      },
      () => {
        preloading = null
      },
    )
    return preloading
  }
  return Object.assign(LazyPage, { preload })
}
