import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, IsoCube, SCRAMBLED_FACES } from '../ui'
import { isChunkLoadError, retryFailedChunks } from './lazyPage'

interface Props {
  children: ReactNode
  /** Changing this value clears the error (pass the current route). */
  resetKey?: string
}

interface State {
  error: Error | null
}

/**
 * Catches render errors so one broken page never blanks the whole app. Saved progress is
 * untouched. A page whose code failed to *load* (offline, or an old tab after an update) gets
 * its own wording and a retry that really fetches the page again.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Rubikku hit an error:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.retry()
  }

  componentWillUnmount() {
    // Leaving a page that failed to load: forget the failure, so coming back fetches it again
    // (each route has its own boundary, so this one never sees the next route).
    if (isChunkLoadError(this.state.error)) retryFailedChunks()
  }

  /** Clear the error; pages that failed to load are fetched again. */
  retry = () => {
    retryFailedChunks()
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const loading = isChunkLoadError(error)
    // Failing twice in a row usually means the file is gone: a new version was published.
    const stale = loading && error.attempts >= 2
    const offline = loading && typeof navigator !== 'undefined' && navigator.onLine === false
    return (
      <div role="alert" className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 py-12 text-center" data-testid="error-page" data-error={loading ? 'chunk' : 'render'}>
        <IsoCube size={132} {...SCRAMBLED_FACES} />
        <h1 className="mt-7 text-3xl text-ink">{loading ? 'This page didn’t load' : 'That twist went wrong'}</h1>
        <p className="mt-2 text-lg text-ink-muted">
          {!loading
            ? 'Something broke on this page. Your progress is saved — nothing was lost.'
            : stale
              ? 'It still won’t load. Rubikku may have been updated — reload to get the newest version. Your progress is saved.'
              : offline
                ? 'You seem to be offline. Check the connection, then try again. Your progress is saved.'
                : 'The connection dropped while it was loading. Your progress is saved.'}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {stale ? (
            <Button iconLeft="restart" onClick={() => window.location.reload()} data-testid="error-reload">
              Reload Rubikku
            </Button>
          ) : (
            <Button iconLeft="restart" onClick={this.retry} data-testid="error-retry">
              Try again
            </Button>
          )}
          {stale && (
            <Button variant="secondary" onClick={this.retry} data-testid="error-retry">
              Try again
            </Button>
          )}
          <Button
            variant="secondary"
            iconLeft="home"
            onClick={() => {
              window.location.hash = '#/'
              this.retry()
            }}
          >
            Go home
          </Button>
        </div>
        <details className="mt-8 w-full text-left">
          <summary className="cursor-pointer text-sm font-semibold text-ink-faint">For a grown-up: what went wrong</summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-inset p-3 font-mono text-xs whitespace-pre-wrap text-ink-muted">
            {error.message || String(error)}
          </pre>
        </details>
      </div>
    )
  }
}
