/**
 * Theme: light / dark / follow the system.
 *
 * - The choice lives in the settings store (persisted). index.html has an inline script that
 *   applies it before first paint, so there is no flash.
 * - `useTheme()` gives the *resolved* theme ('light' | 'dark') — use that to adapt canvases.
 * - `setTheme(choice, origin)` animates the change as a circle growing from `origin`
 *   (View Transitions API), falling back to a quick cross-fade.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { useSettings, type ThemeChoice } from '../store/settings'
import { prefersReducedMotion } from './motion'

export type ResolvedTheme = 'light' | 'dark'
export type { ThemeChoice }

const QUERY = '(prefers-color-scheme: dark)'
/** Page background per theme, mirrored in tokens.css (--bg) and index.html. */
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f4f1ea', dark: '#0d0f14' }

/**
 * Colours for the 3D scene, per theme. WebGL cannot read CSS variables, so the values the
 * cube needs are mirrored here from tokens.css. Keep the two in sync.
 */
export const SCENE_THEME: Record<
  ResolvedTheme,
  {
    body: string
    stickers: Record<'white' | 'yellow' | 'green' | 'blue' | 'red' | 'orange', string>
    ambient: number
    key: number
    dim: number
  }
> = {
  light: {
    body: '#17181c',
    stickers: { white: '#ffffff', yellow: '#ffd12e', green: '#1fae58', blue: '#2664ec', red: '#d93235', orange: '#ff8a1f' },
    ambient: 0.95,
    key: 1.1,
    dim: 0.28,
  },
  dark: {
    body: '#05060a',
    stickers: { white: '#f4f2ec', yellow: '#ffd84a', green: '#36cf7a', blue: '#4f8dff', red: '#ff5a5c', orange: '#ff9a3d' },
    ambient: 0.7,
    key: 1.25,
    dim: 0.2,
  },
}

const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches

function subscribeSystem(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export const resolveTheme = (choice: ThemeChoice, systemIsDark: boolean): ResolvedTheme =>
  choice === 'system' ? (systemIsDark ? 'dark' : 'light') : choice

/** Write the resolved theme to <html>. Safe to call repeatedly. */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (root.dataset.theme !== resolved) root.dataset.theme = resolved
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved])
}

let started = false

/** Call once at start-up (main.tsx): keeps <html> in step with the setting and the system. */
export function startThemeSync(): void {
  if (started || typeof window === 'undefined') return
  started = true
  const sync = () => applyTheme(resolveTheme(useSettings.getState().theme, systemDark()))
  sync()
  useSettings.subscribe(sync)
  window.matchMedia?.(QUERY).addEventListener('change', sync)
}

export interface ThemeOrigin {
  x: number
  y: number
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> }
}

/** Change the theme with the reveal animation. `origin` is usually the click position. */
export function changeTheme(choice: ThemeChoice, origin?: ThemeOrigin): void {
  const settings = useSettings.getState()
  const before = resolveTheme(settings.theme, systemDark())
  const after = resolveTheme(choice, systemDark())
  const commit = () => {
    // flushSync so React has re-rendered (icons, labels) before the browser snapshots the page.
    flushSync(() => settings.setTheme(choice))
    applyTheme(after)
  }

  if (before === after || typeof document === 'undefined' || prefersReducedMotion()) {
    commit()
    return
  }

  const doc = document as ViewTransitionDocument
  const root = document.documentElement
  if (typeof doc.startViewTransition !== 'function') {
    root.classList.add('theme-fade')
    commit()
    window.setTimeout(() => root.classList.remove('theme-fade'), 260)
    return
  }

  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? window.innerHeight / 2
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const transition = doc.startViewTransition(commit)
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
      )
    })
    .catch(() => {
      /* transition skipped (tab hidden, another one started): the theme is already applied */
    })
}

export interface ThemeApi {
  /** What the user picked: 'system' | 'light' | 'dark'. */
  choice: ThemeChoice
  /** What is actually showing. Use this to adapt the 3D scene. */
  resolved: ResolvedTheme
  isDark: boolean
  setTheme: (choice: ThemeChoice, origin?: ThemeOrigin) => void
  /** Flip between light and dark (leaves 'system'). */
  toggle: (origin?: ThemeOrigin) => void
}

export function useTheme(): ThemeApi {
  const choice = useSettings((s) => s.theme)
  const systemIsDark = useSyncExternalStore(subscribeSystem, systemDark, () => false)
  const resolved = resolveTheme(choice, systemIsDark)
  const toggle = useCallback(
    (origin?: ThemeOrigin) => changeTheme(resolved === 'dark' ? 'light' : 'dark', origin),
    [resolved],
  )
  return { choice, resolved, isDark: resolved === 'dark', setTheme: changeTheme, toggle }
}
