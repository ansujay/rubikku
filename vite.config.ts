/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built site works from any static host or sub-path.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // Installable, and fully offline after the first visit: the service worker precaches the
    // app shell, every route chunk, the fonts and the solver worker.
    VitePWA({
      // A new version waits until he says so (see src/app/useAppUpdates.ts) — it is never
      // swapped in under a lesson.
      registerType: 'prompt',
      // Registered from app code (virtual:pwa-register), not by an injected script.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Rubikku',
        short_name: 'Rubikku',
        description: 'A friendly coach that teaches you to solve a 3x3 cube, one layer at a time.',
        lang: 'en',
        // Relative, like `base`: the app works from any folder. Routes live in the hash, so
        // every page is this one document.
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        // The "Daylight desk" paper colour. index.html switches the live theme-color meta to
        // the night colour (#0d0f14) when the dark theme is on.
        theme_color: '#f4f1ea',
        background_color: '#f4f1ea',
        categories: ['education', 'games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Everything the app can ever ask for: all JS chunks (pages, three.js, the solver
        // worker and its tables code), CSS, fonts and icons.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Font subsets the UI never uses (it is English): browsers only fetch a subset when a
        // character needs it, so these would be dead weight in the cache.
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // HashRouter: every navigation is index.html.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // "prompt" mode: the new worker waits, the page asks, `updateSW(true)` activates it.
        skipWaiting: false,
        clientsClaim: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
