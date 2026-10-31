import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { JSDOM } from 'jsdom'

const root = path.resolve(import.meta.dirname, '../playground-solid/dist')
const site = 'https://markstream-solid.pages.dev/'
const document = new JSDOM(await readFile(path.join(root, 'index.html'), 'utf8')).window.document
assert.equal(document.querySelector('link[rel="canonical"]')?.getAttribute('href'), site)
assert.equal(document.querySelector('meta[property="og:url"]')?.getAttribute('content'), site)
assert.ok(document.querySelector('meta[name="description"]')?.getAttribute('content')?.includes('SolidJS'))
assert.equal(document.querySelector('meta[name="twitter:card"]')?.getAttribute('content'), 'summary_large_image')
assert.equal(JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent).url, site)
const intro = document.querySelector('#playground-intro')
assert.ok(intro?.querySelector('h1')?.textContent.includes('SolidJS streaming Markdown'))
assert.ok(intro.textContent.includes('pnpm add markstream-solid'))
for (const url of ['https://markstream.simonhe.me/frameworks/solid', 'https://markstream.simonhe.me/guide/solid', 'https://markstream.simonhe.me/guide/solid-api', 'https://github.com/Simon-He95/markstream-vue'])
  assert.ok(intro.querySelector(`a[href="${url}"]`))
const robots = await readFile(path.join(root, 'robots.txt'), 'utf8')
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8')
assert.ok(robots.includes(`Sitemap: ${site}sitemap.xml`))
assert.ok(sitemap.includes(`<loc>${site}</loc>`))
assert.ok(!sitemap.includes('markstream-vue.simonhe.me'))
const headers = await readFile(path.join(root, '_headers'), 'utf8')
assert.ok(!robots.includes('Disallow:'))
for (const route of ['/component-parity', '/line-number-handoff-check', '/hydrate.html', '/hydrate']) {
  assert.ok(headers.includes(`${route}\n  X-Robots-Tag: noindex`))
}
const homeHtml = await readFile(path.join(root, 'index.html'), 'utf8')
for (const route of ['/component-parity', '/line-number-handoff-check'])
  assert.equal(await readFile(path.join(root, `${route.slice(1)}.html`), 'utf8'), homeHtml)
const notFound = new JSDOM(await readFile(path.join(root, '404.html'), 'utf8')).window.document
assert.equal(notFound.querySelector('meta[name="robots"]')?.getAttribute('content'), 'noindex')
assert.ok(notFound.querySelector('a[href="/"]'))
for (const asset of ['favicon.svg', 'vue-markdown-icon.svg', 'og-image.png'])
  assert.ok((await readFile(path.join(root, asset))).length > 0)
console.log('Solid playground static content, canonical, social metadata, JSON-LD, crawlable noindex labs, sitemap, lab HTML, 404 page and shared assets passed')
