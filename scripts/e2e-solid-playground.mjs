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
  await page.addInitScript(() => {
    window.__solidWorkers = { workers: [], messages: [] }
    const Base = window.Worker
    window.Worker = class extends Base {
      constructor(url, options) {
        super(url, options)
        this.auditName = options?.name ?? String(url)
        window.__solidWorkers.workers.push({ name: this.auditName, url: String(url) })
      }

      postMessage(message, ...args) {
        window.__solidWorkers.messages.push({ name: this.auditName, type: message?.type, displayMode: message?.displayMode })
        return super.postMessage(message, ...args)
      }
    }
  })
  await page.goto(url)
  await page.waitForFunction(() => !!window.__markstreamSolid)
  const timelineRounds = []
  for (let round = 0; round < 2; round++) {
    if (round)
      await page.evaluate(() => window.__markstreamSolid.restore('Ready for timeline'))
    const started = performance.now()
    await page.getByRole('button', { name: 'Virtual timeline', exact: true }).click({ timeout: 5000 })
    const timeline = page.locator('.markstream-virtual-timeline')
    await timeline.waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForFunction(() => {
      const count = document.querySelectorAll('.markstream-timeline-item').length
      return count > 0 && count < 60
    }, null, { timeout: 5000 })
    const mountedMs = performance.now() - started
    await page.waitForTimeout(250)
    await timeline.evaluate(root => root.scrollTop = root.scrollHeight)
    await page.waitForFunction(() => document.querySelector('.markstream-virtual-timeline')?.textContent.includes('Message 999'), null, { timeout: 5000 })
    await page.waitForTimeout(250)
    const bottom = await timeline.evaluate(root => ({ rows: root.querySelectorAll('.markstream-timeline-item').length, scrollTop: root.scrollTop }))
    assert.ok(bottom.rows < 60 && bottom.scrollTop > 0, `Markdown timeline stays windowed at the last item: ${JSON.stringify(bottom)}`)
    if (!round)
      await page.screenshot({ path: path.join(outputDir, 'timeline.png') })
    await timeline.evaluate(root => root.scrollTop = 0)
    await page.waitForFunction(() => document.querySelector('.markstream-virtual-timeline')?.textContent.includes('Message 0'), null, { timeout: 5000 })
    const top = await timeline.evaluate(root => ({ rows: root.querySelectorAll('.markstream-timeline-item').length, scrollTop: root.scrollTop }))
    assert.ok(top.rows < 60 && top.scrollTop === 0, 'Markdown timeline returns to the first item')
    await page.getByRole('button', { name: 'Virtual timeline', exact: true }).click({ timeout: 5000 })
    assert.equal(await timeline.count(), 0)
    timelineRounds.push({ inputState: round ? 'restored' : 'streaming', mountedMs, bottom, top })
  }
  assert.deepEqual(errors, [], 'entering, navigating and leaving a Markdown timeline must not recurse')
  await writeFile(path.join(outputDir, 'timeline.json'), `${JSON.stringify({ rounds: timelineRounds, errors }, null, 2)}\n`)
  await page.evaluate(() => {
    window.__markstreamSolid.restore('# Solid playground\n\nStreaming Markdown with **Solid**.\n\n```ts\nconst value = 42\n```\n\nInline math: $E = mc^2$.\n\n```mermaid\nflowchart LR\nStream --> Solid\n```')
    window.__markstreamSolid.update({ viewportPriority: false, deferNodesUntilVisible: false, smoothStreaming: false })
  })
  await page.waitForFunction(() => document.querySelector('.katex') && document.querySelector('[data-markstream-mermaid]') && document.querySelector('.stream-diffs-shell'), null, { timeout: 30000 })
  assert.equal(await page.locator('[data-runtime-error]').count(), 0)
  await page.screenshot({ path: path.join(outputDir, 'playground.png'), fullPage: true })
  await page.evaluate(() => window.__markstreamSolid.update({ content: '```ts\nconst streamed = ', final: false, smoothStreaming: false }))
  await page.waitForFunction(() => document.querySelector('.code-block-container[aria-busy="true"] .stream-diffs-shell'), null, { timeout: 30000 })
  await page.evaluate(() => {
    window.__solidStreamingHost = document.querySelector('.code-block-editor')
    window.__solidStreamingShell = document.querySelector('.stream-diffs-shell')
  })
  await page.evaluate(() => window.__markstreamSolid.update({ content: '```ts\nconst streamed = 42\n```', final: true }))
  await page.waitForFunction(() => document.querySelector('.code-block-editor .stream-diffs-shell') && !document.querySelector('.code-block-container[data-markstream-pending]'))
  assert.equal(await page.evaluate(() => window.__solidStreamingHost === document.querySelector('.code-block-editor') && window.__solidStreamingShell === document.querySelector('.stream-diffs-shell')), true)
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

  const playbacks = []
  for (let round = 0; round < 3; round++) {
    await page.goto(url)
    await page.waitForFunction(() => !!window.__markstreamSolid)
    await page.evaluate(() => {
      const root = document.querySelector('.chat-wrapper')
      const messages = document.querySelector('.chat-messages')
      const data = window.__solidPlayback = { frames: [], heights: [], longTasks: [], backwards: [], active: true }
      let previous = { time: performance.now(), top: root.scrollTop, height: messages.getBoundingClientRect().height }
      new PerformanceObserver(list => data.longTasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: 'longtask' })
      const sample = () => {
        if (!data.active)
          return
        const next = { time: performance.now(), top: root.scrollTop, height: messages.getBoundingClientRect().height }
        data.frames.push(next.time - previous.time)
        if (Math.abs(next.height - previous.height) > 0.5)
          data.heights.push({ time: next.time, delta: next.height - previous.height })
        if (next.top < previous.top - 2)
          data.backwards.push({ time: next.time, delta: next.top - previous.top, heightDelta: next.height - previous.height })
        previous = next
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await page.waitForFunction(() => document.querySelector('.speed-status__state')?.textContent === 'Input complete', null, { timeout: 30000 })
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"] > .markdown-renderer')?.dataset.streamCaughtUp === 'true')
    await page.waitForTimeout(500)
    const playback = await page.evaluate(() => {
      window.__solidPlayback.active = false
      const root = document.querySelector('.chat-wrapper')
      window.__solidPlayback.bottomGap = root.scrollHeight - root.clientHeight - root.scrollTop
      return window.__solidPlayback
    })
    assert.equal(await page.locator('[data-runtime-error]').count(), 0)
    assert.deepEqual(playback.backwards, [], 'default streaming must not scroll backwards during folding or preview handoff')
    assert.ok(playback.bottomGap <= 1, 'bottom following continues until smooth rendering finishes')
    await page.waitForFunction(() => [...document.querySelectorAll('.chat-messages img')].every(image => image.complete && image.naturalWidth > 0))
    assert.equal(await page.locator('.chat-messages [data-pinned-image-state="error"]').count(), 0)
    assert.equal(await page.locator('.chat-messages img').count(), 2)
    assert.equal(await page.getByRole('heading', { level: 2, name: 'Image', exact: true }).count(), 1)
    const logo = await page.request.get(`${url}/vue-markdown-icon.svg`)
    assert.match(logo.headers()['content-type'], /image\/svg\+xml/)
    playback.images = await page.locator('.chat-messages img').evaluateAll(images => images.map(image => ({ src: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight })))
    assert.ok(playback.images.every(image => new URL(image.src, url).origin === new URL(url).origin), 'demo images are bundled locally')
    assert.ok(Math.max(0, ...playback.longTasks) < 250, 'default playback avoids large main-thread stalls')
    await writeFile(path.join(outputDir, 'playback.json'), `${JSON.stringify(playback, null, 2)}\n`)
    playbacks.push(playback)
  }
  await writeFile(path.join(outputDir, 'playbacks.json'), `${JSON.stringify(playbacks, null, 2)}\n`)
  await page.getByRole('heading', { level: 2, name: 'Image', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(outputDir, 'images-loaded.png') })

  await page.goto(`${url}/component-parity`)
  await page.waitForFunction(() => !!window.__markstreamComponentParity)
  await page.waitForFunction(() => ['vue3', 'solid'].every((framework) => {
    const root = document.querySelector(`[data-framework="${framework}"]`)
    return root?.querySelector('.katex') && root.querySelector('.mermaid-block-container svg text') && root.querySelector('.infographic-block-container svg')
  }), null, { timeout: 45000 })
  const selectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '.paragraph-node', 'strong', 'em', 'del', 'mark', 'ins', 'sub.subscript-node', 'sup.superscript-node', 'blockquote', 'ul', 'ol', 'li', 'hr', 'code.inline-code', '.checkbox-node', '.link-node', 'table', 'th', 'td', 'img', '.math-block', '.math-inline', '.mermaid-block-header', '.infographic-block-header', '.d2-block-header', '.code-block-header', '.footnote-node', '.footnote-reference', '.footnote-anchor', '.admonition', '.admonition-legend', '.admonition-content', '.reference-node', '.emoji-node', '.vmr-container', '.fixture-html', 'kbd']
  const properties = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'marginTop', 'marginBottom', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderLeftWidth', 'borderRadius', 'display', 'verticalAlign', 'whiteSpace', 'minHeight', 'gap', 'letterSpacing', 'tableLayout', 'borderCollapse', 'textDecorationLine', 'position', 'maxWidth']
  const componentStyles = []
  for (const variant of [{ width: 1600, dark: false, locale: 'en' }, { width: 1600, dark: true, locale: 'zh' }, { width: 1600, dark: false, locale: 'zh' }, { width: 760, dark: false, locale: 'zh' }]) {
    await page.setViewportSize({ width: variant.width, height: 1100 })
    await page.evaluate(({ dark, locale }) => window.__markstreamComponentParity.update({ isDark: dark, locale }), variant)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    const rows = await page.evaluate(({ selectors, properties }) => selectors.map((selector) => {
      const read = (framework) => {
        const element = document.querySelector(`[data-framework="${framework}"] ${selector}`)
        if (!element)
          return null
        const css = getComputedStyle(element)
        return Object.fromEntries(properties.map(key => [key, css[key]]))
      }
      const vue = read('vue3')
      const solid = read('solid')
      return { selector, vue, solid, differences: vue && solid ? properties.filter(key => vue[key] !== solid[key]) : ['missing'] }
    }), { selectors, properties })
    componentStyles.push({ ...variant, rows })
    assert.deepEqual(rows.filter(row => row.differences.length), [], `component styles ${JSON.stringify(variant)}`)
    const headers = page.locator('[data-framework="solid"] .diagram-block-header')
    for (const header of await headers.all()) {
      for (const button of await header.locator('.diagram-mode-btn').all()) {
        const box = await button.boundingBox()
        assert.ok(box && box.width > 40 && box.height < 32, 'mode labels stay on one line')
      }
    }
    if (variant.locale === 'zh')
      assert.ok(await page.locator('[data-framework="solid"] button[aria-label="源代码"]').count() >= 3)
    if (variant.width === 1600 && !variant.dark && variant.locale === 'zh') {
      await page.locator('[data-framework="solid"] .mermaid-block-container').first().screenshot({ path: path.join(outputDir, 'mermaid-zh.png') })
      await page.locator('[data-framework="solid"] .infographic-block-container').first().screenshot({ path: path.join(outputDir, 'infographic-zh.png') })
      await page.locator('[data-framework="solid"] .math-block').first().screenshot({ path: path.join(outputDir, 'math-block.png') })
    }
  }
  for (const framework of ['vue3', 'solid']) {
    for (const button of await page.locator(`[data-framework="${framework}"]`).getByRole('button', { name: '源代码', exact: true }).all())
      await button.click()
  }
  const sourceStyles = await page.evaluate(() => ['mermaid', 'infographic'].map((kind) => {
    const fields = ['fontFamily', 'fontSize', 'lineHeight', 'color', 'whiteSpace', 'paddingTop', 'paddingLeft', 'marginTop', 'marginBottom']
    const read = (framework) => {
      const pre = document.querySelector(`[data-framework="${framework}"] .${kind}-source-code`)
      const css = getComputedStyle(pre)
      return Object.fromEntries(fields.map(field => [field, css[field]]))
    }
    return { kind, vue: read('vue3'), solid: read('solid') }
  }))
  for (const result of sourceStyles)
    assert.deepEqual(result.solid, result.vue, `${result.kind} source typography`)
  const workerAudit = await page.evaluate(() => window.__solidWorkers)
  assert.ok(workerAudit.messages.some(message => message.name === 'markstream-solid-katex' && message.type === 'render' && message.displayMode === true), 'block math uses the native Solid worker')
  assert.ok(workerAudit.messages.some(message => message.name === 'markstream-solid-katex' && message.type === 'render' && message.displayMode === false), 'inline math uses the native Solid worker')
  await writeFile(path.join(outputDir, 'component-styles.json'), `${JSON.stringify(componentStyles, null, 2)}\n`)
  await writeFile(path.join(outputDir, 'workers.json'), `${JSON.stringify(workerAudit.messages, null, 2)}\n`)
  await page.evaluate(() => {
    window.__markstreamComponentParity.update({ content: 'Selected prefix', final: false, fade: true })
    const text = document.querySelector('[data-framework="solid"] .text-node > span').firstChild
    window.__solidSelectedText = text
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 8)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    window.__markstreamComponentParity.update({ content: 'Selected prefix plus appended text' })
  })
  await page.waitForTimeout(350)
  assert.equal(await page.evaluate(() => getSelection().toString()), 'Selected')
  assert.equal(await page.evaluate(() => window.__solidSelectedText.textContent), 'Selected prefix')
  assert.equal(await page.locator('[data-framework="solid"]').textContent(), 'Selected prefix plus appended text')
  await page.evaluate(() => getSelection().removeAllRanges())
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.goto(`${url}/?benchmark=1`)
  await page.waitForFunction(() => !!window.__markstreamBenchmark)
  const measurements = await page.evaluate(() => window.__markstreamBenchmark.run(3))
  await writeFile(path.join(outputDir, 'measurements.json'), `${JSON.stringify(measurements, null, 2)}\n`)
  const summary = []
  for (const scenario of ['restore', 'restore-virtual', 'restore-batched', 'restore-progressive', 'streaming', 'restore-rich', 'streaming-rich', 'streaming-history']) {
    for (const framework of ['vue3', 'solid']) {
      const rows = measurements.filter(row => row.scenario === scenario && row.framework === framework)
      if (scenario === 'restore-progressive') {
        assert.ok(rows.every(row => row.batchSizes.length > 1 && row.batchSizes.reduce((sum, size) => sum + size, 0) === 1000), `${framework} must actually restore all 1000 nodes in multiple batches`)
      }
      const median = key => rows.map(row => row[key]).sort((a, b) => a - b)[Math.floor(rows.length / 2)]
      summary.push({ scenario, framework, medianTotalMs: median('totalMs'), medianUpdateP95Ms: median('updateP95Ms'), domNodes: median('domNodes'), longTaskCount: median('longTaskCount'), maxLongTaskMs: median('maxLongTaskMs'), frameP95Ms: median('frameP95Ms') })
    }
    const [vue, solid] = summary.filter(row => row.scenario === scenario)
    if (scenario === 'restore-batched' || scenario === 'restore-progressive')
      assert.ok(solid.medianTotalMs < Math.max(300, vue.medianTotalMs * 1.5), `Solid ${scenario} restoration throughput regression`)
    assert.ok(solid.medianUpdateP95Ms < Math.max(100, vue.medianUpdateP95Ms * 2), `Solid ${scenario} update regression`)
  }
  assert.deepEqual(errors, [])
  const report = { browser: await browser.version(), timestamp: new Date().toISOString(), viewport: { width: 1440, height: 1000 }, warmupRounds: 1, measuredRounds: 3, summary, measurements }
  await writeFile(path.join(outputDir, 'performance.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ status: 'passed', checks: ['real default playground playback, frame/height/scroll trace', 'per-component Vue3 CSS equality in light/dark, English/Chinese and narrow widths', 'real block/inline math worker messages', 'native browser selection survives streaming and fade settlement', 'streaming editor creation and identity', 'Vue3 page shell and native controls', 'brand/code themes and HTML policy', 'TPS and both random chunk transports', 'Unicode transport preservation', 'mobile controls and dark mode', 'optional peers', 'real editor streaming identity', 'streaming 1/7/64/1024', 'DOM identity', 'replace/reset/restore/resume', '3000-node virtualization first/last', 'full DOM restore', 'smooth final', 'pause/resume', 'SSR hydration and append', 'toolbar/font/copy', 'HTML sandbox/scripts', 'SVG artifact events', 'D2/infographic/Mermaid preview', 'diagram pan/zoom/fullscreen/export', 'virtual cache roundtrip', 'typewriter simple/precise/final', 'Vue3/Solid performance'], summary, report: path.join(outputDir, 'performance.json') }, null, 2))
}
finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
