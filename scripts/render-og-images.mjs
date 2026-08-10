// Renders the docs OG/Social-share SVGs to 1200×630 PNG files.
//
// Social crawlers (Facebook, X/Twitter, Discord, WhatsApp) do not render SVG
// as og:image, so the docs reference the PNG versions. When the SVG sources
// change, re-run this script and commit the regenerated PNGs.
//
// Usage: node scripts/render-og-images.mjs
// Requires Google Chrome (set CHROME_BIN to override the binary path).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const publicDir = resolve(root, 'docs/public')
const distFontDir = resolve(root, 'docs/.vitepress/dist/assets')
const outputDir = resolve(root, 'scripts/.tmp-og-render')
const width = 1200
const height = 630

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const chrome = chromeCandidates.find(candidate => existsSync(candidate))
if (!chrome) {
  console.error('[render-og-images] Chrome not found. Set CHROME_BIN to the binary path.')
  process.exit(1)
}

const latinFont = resolve(distFontDir, 'inter-roman-latin.woff2')
const latinExtFont = resolve(distFontDir, 'inter-roman-latin-ext.woff2')

const fontFace = [
  [latinExtFont, latinExtFont],
  [latinFont, latinFont],
]
  .filter(([filePath]) => filePath && existsSync(filePath))
  .map(([, filePath]) => `@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url("file://${filePath}") format("woff2")}`)
  .join('')

const wrapperTemplate = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace}
html,body{margin:0;padding:0;background:#07111f;overflow:hidden}
</style></head><body>%s</body></html>`

mkdirSync(outputDir, { recursive: true })
mkdirSync(publicDir, { recursive: true })
mkdirSync(resolve(publicDir, 'og'), { recursive: true })

const ogSourceDir = resolve(publicDir, 'og')
const svgSources = [
  { source: resolve(publicDir, 'og-image.svg'), target: resolve(publicDir, 'og-image.png') },
  ...readdirSync(ogSourceDir)
    .filter(name => name.endsWith('.svg'))
    .map(name => ({
      source: resolve(ogSourceDir, name),
      target: resolve(ogSourceDir, name.replace(/\.svg$/, '.png')),
    })),
]

for (const { source, target } of svgSources) {
  if (!existsSync(source)) {
    console.warn(`[render-og-images] skipping missing source: ${source}`)
    continue
  }

  const svgContent = readFileSync(source, 'utf8')
  const wrapperPath = resolve(outputDir, `render-${target.split('/').pop()}.html`)
  writeFileSync(wrapperPath, wrapperTemplate.replace('%s', svgContent), 'utf8')

  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--screenshot=${target}`,
    `--window-size=${width},${height}`,
    '--virtual-time-budget=5000',
    `file://${wrapperPath}`,
  ], { stdio: 'ignore' })

  console.log(`[render-og-images] ${source.replace(`${root}/`, '')} -> ${target.replace(`${root}/`, '')}`)
}
