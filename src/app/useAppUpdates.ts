/**
 * Service worker registration and the "update available" prompt.
 *
 * The site is a PWA (see vite.config.ts): after the first visit everything is cached and it
 * works with no connection. When a new version has been downloaded it does NOT take over by
 * itself — that could reload the page in the middle of a lesson. Instead a toast offers
 * "Refresh"; until he presses it (or closes every tab) the old version keeps running.
 * Saved progress lives in localStorage, which updates never touch.
 */
import { useEffect } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { toast } from '../ui'

/** How often an open tab asks whether there is a new version. */
const CHECK_EVERY_MS = 60 * 60 * 1000

let started = false

function start(): void {
  if (started || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  started = true
  const update = registerSW({
    // Not `immediate`: registration waits for the window's load event, so caching the whole
    // app in the background never competes with the first page's own files.
    onNeedRefresh() {
      toast({
        key: 'app-update',
        title: 'A new version is ready',
        description: 'Refresh when you are between things. Your progress is saved.',
        tone: 'accent',
        icon: 'sparkle',
        duration: 0,
        action: { label: 'Refresh', onClick: () => void update(true) },
      })
    },
    // No "ready to use offline" announcement: it would land on top of a new player's very
    // first screen, and there is nothing for him to do about it.
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine !== false) void registration.update().catch(() => undefined)
      }
      window.setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}

export function useAppUpdates(): void {
  useEffect(start, [])
}
