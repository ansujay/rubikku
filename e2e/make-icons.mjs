// Rasterise public/favicon.svg into the PNG icons the web manifest needs.
// Run: node e2e/make-icons.mjs   (only when the logo changes; the PNGs are committed in public/icons)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public/favicon.svg'), 'utf8')
const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

/** `scale` is how much of the canvas the logo fills; maskable icons keep it inside the safe zone. */
const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.9, background: 'transparent' },
  { file: 'icon-512.png', size: 512, scale: 0.9, background: 'transparent' },
  { file: 'maskable-192.png', size: 192, scale: 0.6, background: '#f4f1ea' },
  { file: 'maskable-512.png', size: 512, scale: 0.6, background: '#f4f1ea' },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.72, background: '#f4f1ea' },
]

const browser = await chromium.launch()
for (const icon of ICONS) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 })
  await page.setContent(
    `<style>html,body{margin:0;width:100%;height:100%;background:${icon.background};display:grid;place-items:center}img{width:${icon.scale * 100}%;height:${icon.scale * 100}%}</style><img src="${data}">`,
  )
  await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0)
  await page.screenshot({ path: join(root, 'public/icons', icon.file), omitBackground: icon.background === 'transparent' })
  await page.close()
  console.log('wrote', icon.file)
}
await browser.close()
