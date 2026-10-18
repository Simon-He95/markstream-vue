#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const server = await createServer({
  root,
  plugins: [{
    name: 'mermaid-frontmatter-vue-entry',
    resolveId: id => id === '/__mermaid-vue.js' ? id : undefined,
    load: id => id === '/__mermaid-vue.js' ? 'export { createApp, h, ref } from \'vue\'' : undefined,
  }],
  server: { host: '127.0.0.1', port: 0 },
  optimizeDeps: {
    include: ['vue', '@floating-ui/dom'],
    entries: [
      'src/components/MermaidBlockNode/MermaidBlockNode.vue',
      'packages/markstream-angular/src/enhanceRenderedHtml.ts',
      'packages/markstream-svelte/src/enhanceRenderedHtml.ts',
    ],
  },
})
let browser

try {
  await server.listen()
  const executablePath = [process.env.PLAYWRIGHT_CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome']
    .find(candidate => candidate && existsSync(candidate))
  browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/__mermaid-frontmatter', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main></main></body></html>',
  }))
  await page.goto(`${server.resolvedUrls.local[0]}__mermaid-frontmatter`)
  await page.evaluate(async () => {
    const { getMermaid } = await import('/src/components/MermaidBlockNode/mermaid.ts')
    const mermaid = await getMermaid()
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { htmlLabels: false } })
    window.frontmatterMermaid = mermaid
    window.frontmatterCode = '---\ntitle: Example\nconfig:\n  theme: forest\n  flowchart:\n    nodeSpacing: 73\n---\nflowchart LR\n  A --> B'
  })

  const control = await page.evaluate(async () => {
    const source = `%%{init: {"theme":"default"}}%%\n${window.frontmatterCode}`
    await window.frontmatterMermaid.parse(source)
    const container = document.createElement('div')
    document.body.append(container)
    try {
      await window.frontmatterMermaid.render('broken-frontmatter-control', source, container)
      return false
    }
    catch {
      return true
    }
    finally {
      container.remove()
    }
  })
  assert.equal(control, true, 'The old directive/frontmatter order must fail real rendering even when parse passes')

  const results = []
  for (const framework of ['angular', 'svelte']) {
    for (const newline of ['\n', '\r\n', '\r']) {
      for (const final of [false, true]) {
        for (const isDark of [false, true]) {
          const result = await page.evaluate(async ({ framework, newline, final, isDark }) => {
            const { setMermaidLoader } = await import(`/packages/markstream-${framework}/src/optional/mermaid.ts`)
            setMermaidLoader(() => window.frontmatterMermaid)
            const { enhanceRenderedHtml } = await import(`/packages/markstream-${framework}/src/enhanceRenderedHtml.ts`)
            const root = document.createElement('section')
            const pre = document.createElement('pre')
            const code = document.createElement('code')
            code.className = 'language-mermaid'
            code.textContent = window.frontmatterCode.replace(/\n/g, newline)
            pre.append(code)
            root.append(pre)
            document.querySelector('main').replaceChildren(root)
            const handle = await enhanceRenderedHtml(root, { final, isDark })
            const svg = root.querySelector('svg')
            const result = {
              framework,
              newline,
              final,
              isDark,
              nodes: svg?.querySelectorAll('.node').length ?? 0,
              title: svg?.textContent.includes('Example') ?? false,
              width: svg?.getBoundingClientRect().width ?? 0,
              fallback: !!root.querySelector(':scope > pre'),
            }
            handle.dispose()
            return result
          }, { framework, newline, final, isDark })
          assert.equal(result.nodes, 2, JSON.stringify(result))
          assert.equal(result.title, true, JSON.stringify(result))
          assert.ok(result.width > 0, JSON.stringify(result))
          assert.equal(result.fallback, false, JSON.stringify(result))
          results.push(result)
        }
      }
    }
  }

  await page.evaluate(async () => {
    const { createApp, h, ref } = await import('/__mermaid-vue.js')
    const { default: MermaidBlockNode } = await import('/src/components/MermaidBlockNode/MermaidBlockNode.vue')
    const isDark = ref(false)
    const code = ref(window.frontmatterCode)
    const root = document.createElement('section')
    document.querySelector('main').replaceChildren(root)
    createApp({
      render: () => h(MermaidBlockNode, {
        node: { type: 'code_block', language: 'mermaid', code: code.value, raw: code.value },
        loading: false,
        isDark: isDark.value,
      }),
    }).mount(root)
    window.frontmatterVue = { isDark, code }
  })
  let lightFill
  for (const newline of ['\n', '\r\n', '\r']) {
    for (const isDark of [false, true]) {
      await page.evaluate(({ newline, isDark }) => {
        window.frontmatterVue.code.value = window.frontmatterCode.replace(/\n/g, newline)
        window.frontmatterVue.isDark.value = isDark
      }, { newline, isDark })
      await page.waitForFunction(({ isDark, lightFill }) => {
        const svg = document.querySelector('main ._mermaid svg')
        const rect = svg?.querySelector('.node rect')
        if (!rect || svg.querySelectorAll('.node').length !== 2 || !svg.textContent.includes('Example'))
          return false
        const fill = getComputedStyle(rect).fill
        return !lightFill || (fill === lightFill) === !isDark
      }, { isDark, lightFill })
      if (!lightFill)
        lightFill = await page.locator('main ._mermaid svg .node rect').first().evaluate(rect => getComputedStyle(rect).fill)
    }
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ controlRenderFailed: control, staticRenders: results.length, vueRenders: 6 }))
}
finally {
  await browser?.close()
  await server.close()
}
