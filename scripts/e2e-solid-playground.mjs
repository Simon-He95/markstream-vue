import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const repoRoot = path.resolve(import.meta.dirname, '..')
const outputDir = path.join(repoRoot, '.tmp/solid')
await mkdir(outputDir, { recursive: true })
const socket = net.createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const server = await preview({ root: path.join(repoRoot, 'playground-solid'), preview: { host: '127.0.0.1', port, strictPort: true } })
const solidRequire = createRequire(path.join(repoRoot, 'packages/markstream-solid/package.json'))
const solidRoot = path.dirname(solidRequire.resolve('solid-js/package.json'))
const { createComponent } = await import(pathToFileURL(path.join(solidRoot, 'dist/server.js')).href)
const { renderToString, generateHydrationScript } = await import(pathToFileURL(path.join(solidRoot, 'web/dist/server.js')).href)
const { default: SolidRenderer } = await import(pathToFileURL(path.join(repoRoot, 'packages/markstream-solid/dist/server/index.js')).href)
const hydrationContent = Array.from({ length: 100 }, (_, index) => `Paragraph ${index}`).join('\n\n')
const markup = renderToString(() => createComponent(SolidRenderer, { content: hydrationContent, final: true, renderCodeBlocksAsPre: true, smoothStreaming: true, maxLiveNodes: 0 }))
const template = await readFile(path.join(repoRoot, 'playground-solid/dist/index.html'), 'utf8')
await writeFile(path.join(repoRoot, 'playground-solid/dist/hydrate.html'), template.replace('<div id="root"></div>', `<div id="root">${markup}</div>${generateHydrationScript()}<script>window.__solidServerRoot = document.getElementById('root').firstElementChild</script>`))
const executablePath = [process.env.PLAYWRIGHT_CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value))
let browser
try {
  const url = `http://127.0.0.1:${port}`
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: 'chrome' }) })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.waitForFunction(() => !!window.__markstreamSolid)
  await page.evaluate(() => {
    window.__markstreamSolid.restore('# Solid playground\n\nStreaming Markdown with **Solid**.\n\n```ts\nconst value = 42\n```\n\nInline math: $E = mc^2$.\n\n```mermaid\nflowchart LR\nStream --> Solid\n```')
    window.__markstreamSolid.update({ viewportPriority: false, deferNodesUntilVisible: false, smoothStreaming: false })
  })
  await page.waitForFunction(() => document.querySelector('.katex') && document.querySelector('[data-markstream-mermaid]') && document.querySelector('.stream-diffs-shell'), null, { timeout: 30000 })
  assert.equal(await page.locator('[data-runtime-error]').count(), 0)
  await page.screenshot({ path: path.join(outputDir, 'playground.png'), fullPage: true })
  await page.evaluate(() => window.__markstreamSolid.update({ content: '```ts\nconst streamed = ', final: false, smoothStreaming: false }))
  assert.ok((await page.locator('.pre-code code').textContent()).includes('const streamed'))
  await page.evaluate(() => window.__markstreamSolid.update({ content: '```ts\nconst streamed = 42\n```', final: true }))
  await page.waitForFunction(() => document.querySelector('.code-block-editor .stream-diffs-shell') && !document.querySelector('.code-block-container[data-markstream-pending]'))
  await page.evaluate(() => {
    window.__solidCodeHost = document.querySelector('.code-block-editor')
    window.__solidCodeRuntime = document.querySelector('.stream-diffs-shell')
    window.__markstreamSolid.update({ content: '```ts\nconst streamed = 99\n```', final: true })
  })
  await page.waitForFunction(() => {
    const host = document.querySelector('.code-block-editor')
    const text = element => (element.textContent || '') + [...element.querySelectorAll('*')].map(child => child.shadowRoot ? text(child.shadowRoot) : '').join('')
    return host && text(host).includes('streamed') && text(host).includes('99')
  })
  assert.equal(await page.evaluate(() => window.__solidCodeHost === document.querySelector('.code-block-editor') && window.__solidCodeRuntime === document.querySelector('.stream-diffs-shell')), true)
  assert.equal(await page.locator('[data-runtime-error]').count(), 0)
  const fixture = '# 中文 streaming 🚀\n\nHello **world** with `code`.\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst value = 42\n```\n\n[link](https://example.com)\n\nThe end.'
  const normalize = () => {
    const root = document.querySelector('[data-testid="preview"] > .markstream-solid')
    return [...root.querySelectorAll('h1,h2,p,li,th,td,pre code')].map(element => `${element.tagName}:${element.textContent.trim()}`)
  }
  await page.evaluate((content) => {
    window.__markstreamSolid.update({ content, final: true, smoothStreaming: false, batchRendering: false, renderCodeBlocksAsPre: true, maxLiveNodes: 0, fade: false })
  }, fixture)
  const baseline = await page.evaluate(normalize)
  for (const chunkSize of [1, 7, 64, 1024]) {
    const result = await page.evaluate(async ({ fixture, chunkSize }) => {
      const control = window.__markstreamSolid
      control.update({ content: '', final: false })
      for (let end = chunkSize; end < fixture.length + chunkSize; end += chunkSize) {
        control.update({ content: fixture.slice(0, end) })
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
      control.update({ final: true })
      return document.querySelector('[data-testid="preview"]').textContent
    }, { fixture, chunkSize })
    assert.ok(result.includes('The end.'))
    assert.deepEqual(await page.evaluate(normalize), baseline, `streaming chunk size ${chunkSize}`)
  }
  await page.evaluate(() => window.__markstreamSolid.update({ content: 'settled\n\n```ts\nlet a', final: false }))
  await page.evaluate(() => {
    window.__solidStable = { root: document.querySelector('[data-testid="preview"] > .markstream-solid'), paragraph: document.querySelector('[data-testid="preview"] p'), code: document.querySelector('[data-testid="preview"] pre code') }
    window.__markstreamSolid.update({ content: 'settled\n\n```ts\nlet a = 1\n```\n\nnext', final: true })
  })
  assert.equal(await page.evaluate(() => window.__solidStable.root === document.querySelector('[data-testid="preview"] > .markstream-solid') && window.__solidStable.paragraph === document.querySelector('[data-testid="preview"] p') && window.__solidStable.code === document.querySelector('[data-testid="preview"] pre code')), true)
  await page.evaluate(() => {
    window.__markstreamSolid.update({ content: '', final: false })
    window.__markstreamSolid.update({ content: '# restored\n\nbody', final: true })
    window.__markstreamSolid.update({ content: '# restored\n\nbody resumed', final: false })
    window.__markstreamSolid.update({ final: true })
  })
  assert.equal(await page.locator('[data-testid="preview"] p').textContent(), 'body resumed')

  await page.evaluate(() => {
    window.__markstreamSolid.update({ content: undefined, final: undefined, maxLiveNodes: 64, liveNodeBuffer: 12, batchRendering: true, smoothStreaming: false })
    window.__markstreamSolid.restore(Array.from({ length: 1500 }, (_, index) => `## Heading ${index}\n\nParagraph ${index}`).join('\n\n'))
  })
  await page.waitForFunction(() => document.querySelector('[data-testid="preview"] > .markstream-solid')?.dataset.totalNodes === '3000')
  assert.ok(await page.locator('[data-testid="preview"] > .markstream-solid > .node-slot').count() <= 64)
  await page.locator('.chat-wrapper').evaluate(element => element.scrollTop = element.scrollHeight)
  await page.waitForFunction(() => document.querySelector('[data-testid="preview"]').textContent.includes('Paragraph 1499'), null, { timeout: 15000 })
  assert.ok(await page.locator('[data-testid="preview"] > .markstream-solid > .node-slot').count() <= 64)
  await page.locator('.chat-wrapper').evaluate(element => element.scrollTop = 0)
  await page.waitForFunction(() => document.querySelector('[data-testid="preview"]').textContent.includes('Heading 0'))
  await page.evaluate(() => window.__markstreamSolid.update({ maxLiveNodes: 0, batchRendering: false }))
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="preview"] > .markstream-solid > .node-slot').length === 3000)
  assert.equal(await page.locator('[data-testid="preview"] h2').count(), 1500)
  assert.equal(await page.locator('[data-testid="preview"] p').count(), 1500)

  await page.evaluate(content => window.__markstreamSolid.update({ content, final: true, smoothStreaming: true, smoothStreamingOptions: { flushOnFinish: true }, renderCodeBlocksAsPre: true }), fixture)
  await page.waitForFunction(() => document.querySelector('[data-testid="preview"] > .markstream-solid')?.dataset.streamCaughtUp === 'true')
  assert.deepEqual(await page.evaluate(normalize), baseline)
  await page.reload()
  await page.waitForFunction(() => !!window.__markstreamSolid)
  await page.evaluate(() => window.__markstreamSolid.restore(`# Playback\n\n${'Input for pause and resume. '.repeat(80)}`))
  await page.getByTestId('start').click()
  await page.getByTestId('pause').click()
  const paused = await page.locator('.speed-status__state').textContent()
  await page.waitForTimeout(80)
  assert.equal(await page.locator('.speed-status__state').textContent(), paused)
  await page.getByTestId('resume').click()
  await page.waitForFunction(() => document.querySelector('.speed-status__state')?.textContent.includes('Input complete'), null, { timeout: 20000 })

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => {
      window.__solidCopied = text
    } } })
    window.__markstreamSolid.update({ content: undefined, final: undefined, viewportPriority: false, deferNodesUntilVisible: false, smoothStreaming: false, batchRendering: false, maxLiveNodes: 0, renderCodeBlocksAsPre: false, codeBlockProps: { showLineNumbers: true } })
  })
  await page.getByText('Document', { exact: true }).click()
  await page.getByTestId('parity').click()
  await page.waitForFunction(() => ['mermaid', 'd2', 'infographic'].every(kind => document.querySelector(`[data-diagram-kind="${kind}"] .diagram-content svg`)), null, { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('.code-block-container[data-markstream-pending]'), null, { timeout: 30000 })
  assert.equal(await page.locator('[data-runtime-error],.diagram-error').count(), 0)
  const htmlBlock = page.locator('[data-code-language="html"]').first()
  await htmlBlock.getByRole('button', { name: 'Copy', exact: true }).click()
  assert.ok(await page.evaluate(() => window.__solidCopied.includes('Sandboxed preview')))
  await htmlBlock.getByRole('button', { name: 'Collapse', exact: true }).click()
  assert.equal(await htmlBlock.locator('.code-block-body').evaluate(element => element.style.display), 'none')
  await htmlBlock.getByRole('button', { name: 'Expand', exact: true }).click()
  await htmlBlock.getByRole('button', { name: 'More', exact: true }).click()
  await htmlBlock.getByRole('menuitem', { name: 'Font size +', exact: true }).click()
  assert.equal(await htmlBlock.evaluate(element => element.style.getPropertyValue('--markstream-code-font-size')), '13px')
  await htmlBlock.getByRole('menuitem', { name: 'Preview', exact: true }).click()
  const iframe = page.locator('.html-preview-frame__iframe')
  assert.equal(await iframe.getAttribute('sandbox'), '')
  await page.frameLocator('.html-preview-frame__iframe').locator('#preview-title').waitFor()
  assert.equal(await page.frameLocator('.html-preview-frame__iframe').locator('body').getAttribute('data-script-ran'), null)
  await page.keyboard.press('Escape')
  assert.equal(await iframe.count(), 0)
  await page.evaluate(() => window.__markstreamSolid.update({ codeBlockProps: { showLineNumbers: true, htmlPreviewAllowScripts: true } }))
  await htmlBlock.getByRole('button', { name: 'More', exact: true }).click()
  await htmlBlock.getByRole('menuitem', { name: 'Preview', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('iframe')?.getAttribute('sandbox') === 'allow-scripts')
  await page.frameLocator('.html-preview-frame__iframe').locator('body[data-script-ran="yes"]').waitFor()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.evaluate(() => {
    window.__solidArtifacts = []
    window.__markstreamSolid.update({ onHandleArtifactClick: payload => window.__solidArtifacts.push(payload) })
  })
  const svgBlock = page.locator('[data-code-language="svg"]').first()
  await svgBlock.getByRole('button', { name: 'More', exact: true }).click()
  await svgBlock.getByRole('menuitem', { name: 'Preview', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__solidArtifacts.at(-1).artifactType), 'image/svg+xml')
  assert.equal(await page.locator('iframe').count(), 0)
  const mermaid = page.locator('[data-diagram-kind="mermaid"]')
  await mermaid.getByRole('button', { name: 'Source', exact: true }).click()
  assert.equal(await mermaid.getByRole('button', { name: 'Source', exact: true }).getAttribute('aria-pressed'), 'true')
  await mermaid.getByRole('button', { name: 'Preview', exact: true }).click()
  await mermaid.getByRole('button', { name: 'Zoom in', exact: true }).click()
  assert.ok((await mermaid.locator('.diagram-content').getAttribute('style')).includes('scale(1.1)'))
  await mermaid.locator('.diagram-preview').scrollIntoViewIfNeeded()
  const rectangle = await mermaid.locator('.diagram-preview').boundingBox()
  await page.mouse.move(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2)
  await page.mouse.down()
  await page.mouse.move(rectangle.x + rectangle.width / 2 + 40, rectangle.y + rectangle.height / 2 + 20)
  await page.mouse.up()
  assert.ok((await mermaid.locator('.diagram-content').getAttribute('style')).includes('translate(40px, 20px)'))
  await mermaid.getByRole('button', { name: 'Reset zoom', exact: true }).click()
  await mermaid.getByRole('button', { name: 'Open', exact: true }).click()
  assert.equal(await page.locator('.diagram-modal').count(), 1)
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.diagram-modal').count(), 0)
  const downloadPromise = page.waitForEvent('download')
  await mermaid.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadPromise
  assert.ok(download.suggestedFilename().endsWith('.svg'))
  await download.cancel()
  for (const kind of ['d2', 'infographic']) {
    const block = page.locator(`[data-diagram-kind="${kind}"]`)
    await block.getByRole('button', { name: 'Source', exact: true }).click()
    await block.getByRole('button', { name: 'Preview', exact: true }).click()
    assert.equal(await block.locator('.diagram-content > svg').count(), 1)
    const previewBox = await block.locator('.diagram-content > svg').boundingBox()
    assert.ok(previewBox && previewBox.width > 10 && previewBox.height > 10, `${kind} preview must have a visible size`)
  }
  await page.screenshot({ path: path.join(outputDir, 'parity.png'), fullPage: true })
  const state = await page.evaluate(async () => {
    const handle = window.__markstreamSolid.getRenderer()
    await handle.forceMeasure()
    return handle.captureVirtualState({ allowFallbackAnchor: true })
  })
  assert.ok(state.heightCache.length > 0)
  await page.evaluate(state => window.__markstreamSolid.getRenderer().restoreVirtualState(state, { restoreAnchor: true, allowUncapturedAnchor: true }), state)

  await page.evaluate(() => {
    window.__markstreamSolid.update({ content: '', final: false, typewriter: 'simple', smoothStreaming: false })
    window.__markstreamSolid.update({ content: 'Simple cursor' })
  })
  await page.waitForFunction(() => document.querySelector('.typewriter-simple-cursor-target'))
  await page.evaluate(() => window.__markstreamSolid.update({ final: true }))
  assert.equal(await page.locator('.typewriter-simple-cursor-target').count(), 0)
  await page.evaluate(() => {
    window.__markstreamSolid.update({ content: '', final: false, typewriter: 'precise' })
    window.__markstreamSolid.update({ content: 'Precise cursor' })
  })
  await page.waitForFunction(() => document.querySelector('.typewriter-cursor')?.getBoundingClientRect().height > 0)
  await page.evaluate(() => window.__markstreamSolid.update({ final: true }))
  assert.equal(await page.locator('.typewriter-cursor').count(), 0)
  await page.evaluate(() => window.__markstreamSolid.update({ content: 'ignored', nodes: [{ type: 'text', content: 'AST mode' }], final: false, typewriter: true }))
  assert.equal(await page.locator('[data-testid="preview"]').textContent(), 'AST mode')
  assert.equal(await page.locator('.typewriter-cursor,.typewriter-simple-cursor-target').count(), 0)

  await page.goto(`${url}/hydrate.html?hydrate=1`)
  await page.waitForFunction(() => !!window.__solidHydrate)
  assert.equal(await page.evaluate(() => window.__solidServerRoot === document.getElementById('root').firstElementChild), true)
  assert.equal(await page.locator('#root p').count(), 100)
  await page.evaluate(() => window.__solidHydrate.append())
  await page.waitForFunction(() => document.getElementById('root').textContent.includes('Hydrated tail'))

  await page.goto(url)
  await page.waitForFunction(() => !!window.__markstreamSolid)
  await page.waitForFunction(() => (document.querySelector('.thinking-node')?.textContent?.length ?? 0) > 160)
  await page.getByTestId('pause').click()
  assert.equal(await page.locator('.chat-header__title').textContent(), 'markstream-solid')
  assert.equal(await page.getByLabel('Code block theme').inputValue(), 'vitesse-dark')
  assert.equal(await page.getByRole('button', { name: '300 estimated TPS', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.screenshot({ path: path.join(outputDir, 'ui-desktop.png'), fullPage: true })
  await page.getByLabel('Brand Theme', { exact: true }).selectOption('claude')
  assert.equal(await page.locator('[data-testid="preview"] > .markstream-solid').getAttribute('data-theme'), 'claude')
  const brandBackground = await page.locator('[data-testid="preview"] > .markstream-solid').evaluate(element => getComputedStyle(element).getPropertyValue('--ms-background').trim())
  assert.equal(brandBackground, '52.5 28.6% 94.5%')
  await page.getByRole('button', { name: 'Dark Mode', exact: true }).click()
  assert.equal(await page.locator('.playground-root').evaluate(element => element.classList.contains('dark')), true)
  await page.getByLabel('Brand Theme', { exact: true }).selectOption('')
  await page.getByLabel('Code block theme').selectOption('github-light')
  assert.equal(await page.locator('.chat-header__meta-pill').last().textContent(), 'github-light')
  await page.getByLabel('HTML policy').selectOption('safe')
  await page.getByText('Document', { exact: true }).click()
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click()
  await page.getByLabel('Markdown source', { exact: true }).fill('# Edited source\n\nUpdated document.')
  await page.waitForFunction(() => document.querySelector('[data-testid="preview"] p')?.textContent === 'Updated document.')
  await page.getByTestId('restore').click()
  assert.equal(await page.locator('[data-testid="preview"] h1').textContent(), 'Edited source')
  const unicodeSource = `# Unicode playback\n\n${'中文🚀😀'.repeat(30)}`
  await page.evaluate(source => window.__markstreamSolid.restore(source), unicodeSource)
  await page.getByRole('button', { name: 'Random chunks', exact: true }).click()
  await page.getByLabel('Stream Profile', { exact: true }).selectOption('websocket')
  await page.getByLabel('Chunk size min', { exact: true }).evaluate((element, value) => {
    element.value = value
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, '24')
  await page.getByLabel('Chunk size max', { exact: true }).evaluate((element, value) => {
    element.value = value
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, '24')
  await page.getByLabel('Chunk delay min', { exact: true }).evaluate((element, value) => {
    element.value = value
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, '8')
  await page.getByLabel('Chunk delay max', { exact: true }).evaluate((element, value) => {
    element.value = value
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, '8')
  for (const transport of ['readable-stream', 'scheduler']) {
    await page.getByLabel('Transport', { exact: true }).selectOption(transport)
    await page.getByLabel('Slice Mode', { exact: true }).selectOption('pure-random')
    await page.getByTestId('start').click()
    await page.waitForFunction(() => document.querySelector('.chat-header__meta-pill')?.textContent === 'Ready')
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"] > .markstream-solid')?.dataset.streamCaughtUp === 'true')
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"] p')?.textContent?.endsWith('中文🚀😀'.repeat(30)))
    assert.equal(await page.locator('[data-testid="preview"] p').textContent(), '中文🚀😀'.repeat(30))
  }
  await page.getByLabel('Transport', { exact: true }).selectOption('scheduler')
  await page.getByLabel('Slice Mode', { exact: true }).selectOption('boundary-aware')
  await page.getByLabel('Burstiness', { exact: true }).evaluate((element, value) => {
    element.value = value
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, '68')
  await page.getByTestId('start').click()
  await page.waitForFunction(() => document.querySelector('.chat-header__meta-pill')?.textContent === 'Ready')
  await page.waitForFunction(() => document.querySelector('[data-testid="preview"] > .markstream-solid')?.dataset.streamCaughtUp === 'true')
  assert.equal(await page.locator('[data-testid="preview"] p').textContent(), '中文🚀😀'.repeat(30))
  await page.getByRole('button', { name: 'Estimated TPS', exact: true }).click()
  await page.getByRole('button', { name: '1000 estimated TPS', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.speed-status__state')?.textContent === 'Input complete')
  await page.waitForFunction(() => document.querySelector('[data-testid="preview"] > .markstream-solid')?.dataset.streamCaughtUp === 'true')
  assert.equal(await page.locator('[data-testid="preview"] p').textContent(), '中文🚀😀'.repeat(30))
  await page.setViewportSize({ width: 390, height: 844 })
  const toggleControls = page.getByRole('button', { name: 'Toggle controls', exact: true })
  await toggleControls.click()
  assert.equal(await page.locator('.settings-sidebar--floating').count(), 1)
  await page.getByRole('button', { name: 'Smooth Stream', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Smooth Stream', exact: true }).getAttribute('aria-pressed'), 'false')
  await page.getByText('Document', { exact: true }).click()
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click()
  await toggleControls.click()
  assert.equal(await page.locator('.settings-sidebar').count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: path.join(outputDir, 'ui-mobile-dark.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.goto(`${url}/?benchmark=1`)
  await page.waitForFunction(() => !!window.__markstreamBenchmark)
  const measurements = await page.evaluate(() => window.__markstreamBenchmark.run(3))
  await writeFile(path.join(outputDir, 'measurements.json'), `${JSON.stringify(measurements, null, 2)}\n`)
  const summary = []
  for (const scenario of ['restore', 'restore-virtual', 'restore-batched', 'streaming', 'restore-rich', 'streaming-rich', 'streaming-history']) {
    for (const framework of ['vue3', 'solid']) {
      const rows = measurements.filter(row => row.scenario === scenario && row.framework === framework)
      const median = key => rows.map(row => row[key]).sort((a, b) => a - b)[Math.floor(rows.length / 2)]
      summary.push({ scenario, framework, medianTotalMs: median('totalMs'), medianUpdateP95Ms: median('updateP95Ms'), domNodes: median('domNodes'), longTaskCount: median('longTaskCount'), maxLongTaskMs: median('maxLongTaskMs'), frameP95Ms: median('frameP95Ms') })
    }
    const [vue, solid] = summary.filter(row => row.scenario === scenario)
    assert.ok(solid.medianUpdateP95Ms < Math.max(100, vue.medianUpdateP95Ms * 2), `Solid ${scenario} update regression`)
  }
  assert.deepEqual(errors, [])
  const report = { browser: await browser.version(), timestamp: new Date().toISOString(), viewport: { width: 1440, height: 1000 }, warmupRounds: 1, measuredRounds: 3, summary, measurements }
  await writeFile(path.join(outputDir, 'performance.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ status: 'passed', checks: ['Vue3 page shell and native controls', 'brand/code themes and HTML policy', 'TPS and both random chunk transports', 'Unicode transport preservation', 'mobile controls and dark mode', 'optional peers', 'real editor streaming identity', 'streaming 1/7/64/1024', 'DOM identity', 'replace/reset/restore/resume', '3000-node virtualization first/last', 'full DOM restore', 'smooth final', 'pause/resume', 'SSR hydration and append', 'toolbar/font/copy', 'HTML sandbox/scripts', 'SVG artifact events', 'D2/infographic/Mermaid preview', 'diagram pan/zoom/fullscreen/export', 'virtual cache roundtrip', 'typewriter simple/precise/final', 'Vue3/Solid performance'], summary, report: path.join(outputDir, 'performance.json') }, null, 2))
}
finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
