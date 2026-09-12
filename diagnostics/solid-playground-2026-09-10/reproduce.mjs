import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

// Diagnostic only: uses existing Vite service; never modifies renderer source.
const origin = process.env.SOLID_DIAG_ORIGIN || 'http://127.0.0.1:4177'
const out = new URL('./', import.meta.url)
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.SOLID_DIAG_CHROME || '/home/akrc/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(String(error)))
const report = { origin, browser: browser.version(), errors, scenarios: [] }
try {
  await page.goto(origin)
  await page.getByRole('button', { name: '图表与公式', exact: true }).click()
  await page.waitForTimeout(12000)
  report.home = await page.locator('[data-chat-surface]').evaluate(el => ({ text: el.innerText, diagramClasses: [...el.querySelectorAll('[class]')].map(n => n.className).filter(c => typeof c === 'string' && /enhanced-block--|code-block-container/.test(c)), svg: el.querySelectorAll('svg').length }))
  await page.screenshot({ path: new URL('home-diagrams.png', out).pathname, fullPage: true })
  report.homeCode = await page.evaluate(async () => {
    function collect(root) {
      let text = ''
      for (const n of root.childNodes) {
        if (n.nodeType === 3) text += n.textContent
        else if (n.nodeType === 1 && !['STYLE', 'SCRIPT'].includes(n.tagName)) text += collect(n)
      }
      if (root.shadowRoot) text += collect(root.shadowRoot)
      return text
    }
    const start = performance.now()
    const trace = []
    const timer = setInterval(() => {
      const block = document.querySelector('[data-chat-surface] .code-block-node')
      const editor = block?.querySelector('.code-block-node__editor')
      const fallback = block?.querySelector('pre code')
      const shown = editor && getComputedStyle(editor).display !== 'none' ? collect(editor) : fallback?.textContent || ''
      trace.push({ ms: Math.round(performance.now() - start), block: !!block, fallback: !!fallback, visible: shown.replace(/\s+/g, ' ').trim() })
    }, 20)
    ;[...document.querySelectorAll('button')].find(b => b.textContent === '代码块实例保留').click()
    await new Promise(resolve => setTimeout(resolve, 10000))
    clearInterval(timer)
    return trace
  })
  await page.screenshot({ path: new URL('home-code.png', out).pathname, fullPage: true })
  // Unmount the autoplay home before isolated probes to avoid background work.
  await page.getByRole('button', { name: 'Migration', exact: true }).click()
  // Resolve the exact optimized Solid URL used by Vite to avoid duplicate owners.
  const result = await page.evaluate(async () => {
    const base = '/@fs/home/akrc/Developer/markstream/packages/markstream-solid/src/'
    const source = await (await fetch(`${base}components/NodeRenderer.tsx`)).text()
    const solidUrl = source.match(/from "([^"]*\/solid-js\.js\?[^"]*)"/)[1]
    const webUrl = source.match(/from "([^"]*\/solid-js_web\.js\?[^"]*)"/)[1]
    const { createSignal, createComponent } = await import(solidUrl)
    const { render } = await import(webUrl)
    const { NodeRenderer } = await import(`${base}components/NodeRenderer.tsx`)
    const { PreCodeNode } = await import(`${base}components/Nodes.tsx`)
    const { CodeBlockNode } = await import(`${base}components/CodeBlockNode.tsx`)
    const optional = await import(`${base}optional-streamDiffs.ts`)
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
    const host = document.createElement('section')
    host.className = 'markstream-solid'
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:99999;background:white;color:black;padding:24px'
    document.body.append(host)
    const results = []
    const diagramState = () => ({ classes: [...host.querySelectorAll('[class]')].map(n => n.className).filter(c => typeof c === 'string' && /enhanced-block--|code-block-container/.test(c)), svg: host.querySelectorAll('svg').length, text: host.innerText })
    for (const language of ['mermaid', 'd2', 'infographic', 'd3']) {
      const code = language === 'mermaid' ? 'flowchart LR\n A --> B' : language === 'd2' ? 'A -> B' : language === 'infographic' ? 'infographic list-row-simple-horizontal-arrow\ndata\n  items\n    - label A\n    - label B' : 'd3.select("body")'
      const markdown = '```' + language + '\n' + code + '\n```'
      for (const streamed of [false, true]) {
        const [content, setContent] = createSignal(streamed ? '' : markdown)
        const dispose = render(() => createComponent(NodeRenderer, { get content() { return content() }, smoothStreaming: false, typewriter: false, fade: false, batchRendering: false }), host)
        if (streamed) {
          for (let i = 1; i <= markdown.length; i++) { setContent(markdown.slice(0, i)); await sleep(10) }
        }
        await sleep(2200)
        results.push({ name: `${language}-${streamed ? 'stream' : 'static'}`, ...diagramState() })
        dispose()
      }
    }
    // Direct fallback probe: isolates props reactivity from parser/runtime/network.
    {
      const [node, setNode] = createSignal({ type: 'code_block', language: 'ts', code: '', loading: true })
      const dispose = render(() => createComponent(PreCodeNode, { get node() { return node() } }), host)
      setNode({ type: 'code_block', language: 'ts', code: 'const after = 123;', loading: false })
      await sleep(100)
      results.push({ name: 'pre-reactive-props', expected: 'const after = 123;', actual: host.querySelector('code')?.textContent })
      dispose()
    }
    // Real runtime probes sample visible code, including shadow DOM, not headers.
    function textWithin(root) {
      let text = ''
      for (const child of root.childNodes) {
        if (child.nodeType === 3) text += child.textContent
        else if (child.nodeType === 1 && !['STYLE', 'SCRIPT'].includes(child.tagName)) text += textWithin(child)
      }
      if (root.shadowRoot) text += textWithin(root.shadowRoot)
      return text
    }
    const realModule = await optional.getStreamDiffsRuntime()
    for (const mode of ['real-first-probe', 'real-repeat', 'delayed-loader-1000ms', 'disabled']) {
      if (mode === 'delayed-loader-1000ms') optional.setStreamDiffsLoader(async () => { await sleep(1000); return realModule })
      if (mode === 'disabled') optional.disableStreamDiffs()
      const [node, setNode] = createSignal({ type: 'code_block', language: 'typescript', code: '', loading: true })
      const start = performance.now()
      const dispose = render(() => createComponent(CodeBlockNode, { get node() { return node() } }), host)
      const trace = []
      const sample = input => {
        const editor = host.querySelector('.code-block-node__editor')
        const fallback = host.querySelector('pre code')
        const shown = editor && getComputedStyle(editor).display !== 'none' ? textWithin(editor) : fallback?.textContent || ''
        trace.push({ ms: Math.round(performance.now() - start), input, visible: shown, fallback: !!fallback, editorVisible: !!editor && getComputedStyle(editor).display !== 'none' })
      }
      const code = Array.from({ length: 12 }, (_, i) => `const line${i} = ${i};`).join('\n')
      sample(0)
      for (let i = 2; i <= code.length + 1; i += 2) {
        setNode({ type: 'code_block', language: 'typescript', code: code.slice(0, i), loading: true })
        await sleep(20)
        sample(Math.min(i, code.length))
      }
      setNode({ type: 'code_block', language: 'typescript', code, loading: false })
      for (let i = 0; i < 25; i++) { await sleep(80); sample(code.length) }
      results.push({ name: mode, trace })
      dispose()
    }
    host.remove()
    return results
  })
  report.scenarios = result
  await writeFile(new URL('results.json', out), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ home: report.home, errors: [...new Set(errors)], homeCode: { firstBlock: report.homeCode.find(x => x.block), firstCode: report.homeCode.find(x => /const|export|line_/.test(x.visible)) }, scenarios: result.map(({ trace, ...item }) => trace ? { ...item, firstVisible: trace.find(x => /const|co/.test(x.visible))?.ms, lastChars: trace.at(-1).visible.trim().length, changes: trace.filter((x, i) => i === 0 || x.visible !== trace[i - 1].visible).length } : item) }, null, 2))
} finally {
  await browser.close()
}
