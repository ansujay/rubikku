import type { RouteObject } from 'react-router-dom'
import { matchPath } from 'react-router-dom'
import { lazyPage, type LazyPage } from './lazyPage'

// Every page is its own chunk, loaded on demand and retryable (see lazyPage.tsx).
const HomePage = lazyPage(() => import('../features/home/HomePage'))
const LearnPage = lazyPage(() => import('../features/learn/LearnPage'))
const LessonPage = lazyPage(() => import('../features/learn/LessonPage'))
const PlayPage = lazyPage(() => import('../features/play/PlayPage'))
const NotationPage = lazyPage(() => import('../features/notation/NotationPage'))
const AlgorithmsPage = lazyPage(() => import('../features/algorithms/AlgorithmsPage'))
const AlgorithmDetailPage = lazyPage(() => import('../features/algorithms/AlgorithmDetailPage'))
const AlgorithmQuizPage = lazyPage(() => import('../features/algorithms/AlgorithmQuizPage'))
const SolvePage = lazyPage(() => import('../features/solve/SolvePage'))
const TimerPage = lazyPage(() => import('../features/timer/TimerPage'))
const ProgressPage = lazyPage(() => import('../features/progress/ProgressPage'))
const PatternsPage = lazyPage(() => import('../features/patterns/PatternsPage'))
const PatternDetailPage = lazyPage(() => import('../features/patterns/PatternDetailPage'))
const SettingsPage = lazyPage(() => import('../features/settings/SettingsPage'))
// QA only: every primitive in every state. Reachable by URL (#/kitchen-sink), never linked
// from the navigation, and its own chunk — it costs nothing unless it is opened.
const KitchenSinkPage = lazyPage(() => import('./kitchen-sink/KitchenSinkPage'))
const NotFoundPage = lazyPage(() => import('./NotFoundPage'))

interface AppRoute {
  path: string
  /** The page component, so its code can be fetched ahead of a visit. */
  page?: LazyPage<object>
  /** Shown in the browser tab and announced on navigation: "Timer · Rubikku". */
  title: string
  element: RouteObject['element']
  /** Not part of the product: left out of smoke-test and navigation lists. */
  internal?: boolean
}

const APP_ROUTES: readonly AppRoute[] = [
  { path: '/', title: 'Home', page: HomePage, element: <HomePage /> },
  { path: '/learn', title: 'Learn', page: LearnPage, element: <LearnPage /> },
  { path: '/learn/:stageId', title: 'Lesson', page: LessonPage, element: <LessonPage /> },
  { path: '/play', title: 'Free play', page: PlayPage, element: <PlayPage /> },
  { path: '/notation', title: 'Notation', page: NotationPage, element: <NotationPage /> },
  { path: '/algorithms', title: 'Algorithms', page: AlgorithmsPage, element: <AlgorithmsPage /> },
  { path: '/algorithms/quiz', title: 'Flash cards', page: AlgorithmQuizPage, element: <AlgorithmQuizPage /> },
  { path: '/algorithms/:id', title: 'Algorithm', page: AlgorithmDetailPage, element: <AlgorithmDetailPage /> },
  { path: '/solve', title: 'Solve my cube', page: SolvePage, element: <SolvePage /> },
  { path: '/timer', title: 'Timer', page: TimerPage, element: <TimerPage /> },
  { path: '/progress', title: 'Progress', page: ProgressPage, element: <ProgressPage /> },
  { path: '/patterns', title: 'Patterns', page: PatternsPage, element: <PatternsPage /> },
  // Before /patterns/:id, so "design" is never read as a pattern id.
  { path: '/patterns/design', title: 'Make your own', page: PatternsPage, element: <PatternsPage /> },
  { path: '/patterns/:id', title: 'Pattern', page: PatternDetailPage, element: <PatternDetailPage /> },
  { path: '/settings', title: 'Settings', page: SettingsPage, element: <SettingsPage /> },
  { path: '/kitchen-sink', title: 'Kitchen sink', page: KitchenSinkPage, element: <KitchenSinkPage />, internal: true },
  { path: '*', title: 'Page not found', page: NotFoundPage, element: <NotFoundPage /> },
]

export const ROUTES: RouteObject[] = APP_ROUTES.map(({ path, element }) => ({ path, element }))

/** Product pages without parameters, for smoke tests and the screenshot script. */
export const ROUTE_PATHS = APP_ROUTES.filter((route) => !route.internal && !route.path.includes(':') && route.path !== '*').map((route) => route.path)

export const APP_NAME = 'Rubikku'

/** The page name for a path ("Timer"); "Page not found" for anything unknown. */
export function routeTitle(pathname: string): string {
  const route = APP_ROUTES.find((candidate) => candidate.path !== '*' && matchPath({ path: candidate.path, end: true }, pathname))
  return route?.title ?? 'Page not found'
}

/** What goes in the browser tab. Home is just the app name with its tagline. */
export const documentTitle = (pathname: string): string => (pathname === '/' ? `${APP_NAME} — learn to solve the cube` : `${routeTitle(pathname)} · ${APP_NAME}`)

/** Fetch the code for the page at `pathname` (a hover or focus on its link). */
export function prefetchRoute(pathname: string): void {
  const route = APP_ROUTES.find((candidate) => candidate.path !== '*' && matchPath({ path: candidate.path, end: true }, pathname))
  void route?.page?.preload()
}

let prefetching = false
/**
 * After the first page has painted and the browser is idle, fetch every other page's code, one
 * at a time in idle slices, so moving around never waits on the network (DESIGN.md S1).
 */
export function prefetchAllRoutes(): void {
  if (prefetching || typeof window === 'undefined') return
  prefetching = true
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return
  const queue = APP_ROUTES.filter((route) => route.page && !route.internal && route.path !== '*').map((route) => route.page!)
  const idle = (fn: () => void) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 4000 })
    else globalThis.setTimeout(fn, 400)
  }
  const next = () => {
    const page = queue.shift()
    if (!page) return
    void page.preload().finally(() => idle(next))
  }
  window.setTimeout(() => idle(next), 1800)
}
