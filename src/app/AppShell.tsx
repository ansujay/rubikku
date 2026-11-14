import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType, useRoutes } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { onSaveFailure, storageWorks } from '../store'
import { ButtonLink, CelebrationLayer, IconButton, pageTransition, Sticker, Toaster } from '../ui'
import { ErrorBoundary } from './ErrorBoundary'
import { BottomNav, Sidebar, TopBar } from './Navigation'
import { documentTitle, prefetchAllRoutes, routeTitle, ROUTES } from './routes'
import { useAppUpdates } from './useAppUpdates'

/**
 * Shown only if a page's code is still on its way after 150 ms (pages are fetched ahead of time,
 * so this is rare): the shape of a page — its title and a stage — not a spinner.
 */
function PageLoading({ title }: { title: string }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), 150)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <div role="status" aria-label="Loading" className="mx-auto w-full max-w-(--content-max) px-4 pt-5 pb-10 sm:px-6 md:px-8 md:pt-8" data-testid="page-skeleton">
      {show && (
        <div className="animate-[rk-skeleton-in_240ms_var(--ease-out)_both]">
          <p className="font-display text-3xl font-bold tracking-[-0.02em] text-ink-faint sm:text-4xl">{title}</p>
          <div className="mt-3 h-4 w-64 max-w-[70%] rounded-full bg-inset" />
          <div className="mt-7 grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="stage aspect-[4/3] md:aspect-auto md:min-h-[22rem]" />
            <div className="flex flex-col gap-3">
              <div className="h-28 rounded-lg border border-line bg-surface" />
              <div className="h-20 rounded-lg border border-line bg-surface" />
              <div className="h-20 rounded-lg border border-line bg-surface opacity-70" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

type SaveProblem = 'failing' | 'unavailable' | null

/**
 * Tell him — once — when saving stops working, or cannot work at all (storage blocked or
 * missing), in words he can act on. A banner at the top of the content, in the flow: it covers
 * nothing and is never cut short (QA 2, N8 / N9).
 */
function useSaveWarning(): [SaveProblem, () => void] {
  const [problem, setProblem] = useState<SaveProblem>(() => (storageWorks() ? null : 'unavailable'))
  useEffect(() => {
    let told = problem !== null
    return onSaveFailure(() => {
      if (told) return
      told = true
      setProblem('failing')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return [problem, () => setProblem(null)]
}

function SaveBanner({ problem, onClose }: { problem: Exclude<SaveProblem, null>; onClose: () => void }) {
  return (
    <div role="alert" data-testid="save-warning" data-problem={problem} className="mx-auto w-full max-w-(--content-max) px-4 pt-4 sm:px-6 md:px-8">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-cube-red bg-cube-red-soft p-3.5">
        <Sticker tone="red" icon="alert" size="sm" />
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-display text-base leading-5 font-bold text-ink">{problem === 'unavailable' ? 'Rubikku can’t save on this device' : 'Rubikku can’t save right now'}</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {problem === 'unavailable'
              ? 'This browser is blocking saving (a private window, or site data switched off), so your progress will be gone when you close the tab. Ask a grown-up to allow saving for this site.'
              : 'This device is out of room, or saving is switched off. Keep this tab open and ask a grown-up to save a backup.'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {problem === 'failing' && (
            <ButtonLink to="/settings" size="sm" variant="secondary">
              Backup
            </ButtonLink>
          )}
          <IconButton icon="x" label="Hide this warning" size="sm" onClick={onClose} />
        </div>
      </div>
    </div>
  )
}

/** Where each visited page was scrolled to, so Back returns to the same spot. */
const scrollMemory = new Map<string, number>()

/** Layout: sidebar (rail on small tablets) or phone bars, plus the animated page outlet. */
export function AppShell() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const element = useRoutes(ROUTES, location)
  const main = useRef<HTMLElement>(null)
  const first = useRef(true)
  const lastKey = useRef(location.key)
  const lastPath = useRef(location.pathname)
  const title = routeTitle(location.pathname)

  const [saveProblem, hideSaveProblem] = useSaveWarning()
  useAppUpdates()
  // Fetch every page's code while he is reading this one, so navigation never shows a blank.
  useEffect(() => prefetchAllRoutes(), [])

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  }, [])

  // A navigation, before the browser paints it. The page we are leaving is still in the DOM (it
  // fades out ON TOP of the new one — the two overlap, so the content area is never empty):
  //  1. remember how far it was scrolled, so Back returns to the same spot;
  //  2. scroll for the new page at once (top, or where Back left it);
  //  3. pin the old page where it was on screen (the scroll moved it), and take it out of the tab
  //     order, the accessibility tree and the pointer's way while it fades.
  //  (A change of search only — a tab inside a page — keeps the page and its scroll.)
  useLayoutEffect(() => {
    if (lastKey.current === location.key) return
    const leftAt = window.scrollY
    scrollMemory.set(lastKey.current, leftAt)
    if (scrollMemory.size > 50) scrollMemory.delete(scrollMemory.keys().next().value!)
    lastKey.current = location.key
    if (lastPath.current === location.pathname) return
    lastPath.current = location.pathname
    const saved = navigationType === 'POP' ? scrollMemory.get(location.key) : undefined
    window.scrollTo(0, saved ?? 0)
    const shift = window.scrollY - leftAt
    for (const old of main.current?.querySelectorAll<HTMLElement>(':scope > [data-pages] > [data-route]') ?? []) {
      if (old.dataset.route === location.pathname) {
        // Back to a page that was still fading out: it is the page again.
        old.inert = false
        old.removeAttribute('aria-hidden')
        delete old.dataset.leaving
        old.style.translate = ''
        continue
      }
      old.inert = true
      old.setAttribute('aria-hidden', 'true')
      old.dataset.leaving = ''
      if (shift !== 0) old.style.translate = `0 ${shift}px`
    }
  }, [location.key, location.pathname, navigationType])

  // After navigation: name the tab, and move focus to the page so keyboard and screen-reader
  // users start at the top (the <main> is labelled with the page name).
  useEffect(() => {
    document.title = documentTitle(location.pathname)
    if (first.current) {
      first.current = false
      return
    }
    main.current?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          main.current?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2.5 focus:font-bold focus:text-ink-inverse"
      >
        Skip to content
      </a>
      <Sidebar />
      <TopBar />
      <main
        id="main"
        ref={main}
        tabIndex={-1}
        aria-label={title}
        className="min-h-[calc(100dvh-var(--topbar-h))] pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] outline-none md:min-h-dvh md:pb-0 md:pl-(--rail-w) lg:pl-(--sidebar-w)"
      >
        {saveProblem && <SaveBanner problem={saveProblem} onClose={hideSaveProblem} />}
        {/* Pages stack in one grid cell: the new page fades up while the old one fades out on top
            of it (no "wait" — exit and enter overlap, so a page change never blinks to empty). */}
        <div data-pages="" className="grid grid-cols-[minmax(0,1fr)] *:col-start-1 *:row-start-1">
          <AnimatePresence initial={false}>
            <motion.div key={location.pathname} data-route={location.pathname} variants={pageTransition} initial="initial" animate="enter" exit="exit" className="min-w-0">
              {/* Each visit (location.key): coming back to a page that failed while it is still fading out
                  must clear its error too — its instance is reused, not remounted. */}
              <ErrorBoundary resetKey={location.key}>
                <Suspense fallback={<PageLoading title={title} />}>{element}</Suspense>
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <BottomNav />
      <Toaster />
      <CelebrationLayer />
    </div>
  )
}
