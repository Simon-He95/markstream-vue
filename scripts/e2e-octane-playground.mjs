#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const playgroundDir = path.join(repoRoot, 'playground-octane')
const playgroundDist = path.join(playgroundDir, 'dist', 'index.html')
const host = '127.0.0.1'

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.on('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function findFreePort(start = 4176, end = 4210) {
  for (let port = start; port <= end; port += 1) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, timeoutMs = 60000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port))
      return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${host}:${port}`)
}

function resolveChromeLaunchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        executablePath: candidate,
        headless: true,
      }
    }
  }

  return {
    channel: 'chrome',
    headless: true,
  }
}

function startPreviewServer(port) {
  const logs = []
  const child = spawn(
    'pnpm',
    ['-C', playgroundDir, 'exec', 'vite', 'preview', '--host', host, '--port', String(port), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
      },
    },
  )

  child.stdout.on('data', chunk => logs.push(String(chunk)))
  child.stderr.on('data', chunk => logs.push(String(chunk)))

  return {
    child,
    getLogs: () => logs.join(''),
  }
}

function stopServer(child) {
  if (!child || child.killed)
    return
  try {
    child.kill('SIGTERM')
  }
  catch {}
}

function assert(condition, message) {
  if (!condition)
    throw new Error(message)
}

async function main() {
  if (!existsSync(playgroundDist))
    throw new Error('Octane playground is not built. Run `pnpm play:octane:build` first.')

  const port = await findFreePort()
  const server = startPreviewServer(port)
  let browser

  try {
    await waitForPort(port)
    browser = await chromium.launch(resolveChromeLaunchOptions())
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []

    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error')
        errors.push(message.text())
    })

    await page.addInitScript(() => {
      localStorage.setItem('vueuse-color-scheme', 'light')
      localStorage.setItem('vmr-test-dark', 'light')
      localStorage.setItem('vmr-settings-stream-delay-min', '8')
      localStorage.setItem('vmr-settings-stream-delay-max', '8')
      localStorage.setItem('vmr-settings-stream-chunk-size-min', '7')
      localStorage.setItem('vmr-settings-stream-chunk-size-max', '7')
      localStorage.setItem('vmr-settings-stream-burstiness', '0')
    })

    await page.goto(`http://${host}:${port}/`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'markstream-octane' }).waitFor()
    const homeRenderer = page.locator('.chatbot-renderer-shell > .markstream-octane')
    await homeRenderer.waitFor()
    await page.waitForFunction(() => {
      const renderer = document.querySelector('.chatbot-renderer-shell > .markstream-octane')
      return (renderer?.textContent?.length ?? 0) > 20
    })

    const logo = homeRenderer.locator('img[alt="Markstream logo"]')
    await logo.waitFor({ timeout: 30000 })
    assert(
      await logo.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0),
      'The playground logo asset did not load',
    )

    const emoji = homeRenderer.locator('.emoji-node')
    await emoji.waitFor({ timeout: 30000 })
    assert(await emoji.textContent() === '😄', 'The :smile: shortcode was not rendered as an emoji')

    const expectedCodeBlocks = [
      { language: 'Shell', source: 'npm create vue@latest electron-vue-chat' },
      { language: 'JavaScript', source: 'const { app, BrowserWindow }' },
      { language: 'JSON', source: '"packageManager": "pnpm@10.16.1"' },
      { language: 'Python', source: 'from fastapi import FastAPI' },
      { language: 'C++', source: '#include <bits/stdc++.h>' },
      { language: 'Vue', source: '<router-view />' },
      { language: 'JavaScript', source: 'createRouter, createWebHistory' },
      { language: 'JavaScript', source: 'createApp(App).use(router)' },
    ]

    for (const expected of expectedCodeBlocks) {
      const slot = homeRenderer.locator('[data-node-type="code_block"]').filter({ hasText: expected.source }).first()
      const shell = slot.locator('.code-block-container')
      await shell.waitFor({ timeout: 30000 })
      await shell.locator('.stream-diffs-shell').first().waitFor({ state: 'attached', timeout: 30000 })
      const state = await slot.evaluate((element, source) => ({
        hasBareFallback: Boolean(element.querySelector(':scope > .node-content > pre')),
        hasStreamDiffs: Boolean(element.querySelector('.stream-diffs-shell')),
        hasSource: Array.from(element.querySelectorAll('pre code')).some(code => code.textContent?.includes(source)),
      }), expected.source)
      assert(!state.hasBareFallback, `${expected.language} code block permanently degraded to a bare fallback`)
      assert(state.hasStreamDiffs, `${expected.language} code block did not initialize stream-diffs`)
      assert(state.hasSource, `${expected.language} code block lost its streamed source`)
    }

    const javascriptBlock = homeRenderer.locator('.code-block-container').filter({ hasText: 'const { app, BrowserWindow }' }).first()
    // stream-diffs renders its finalized surface inside a `diffs-container`
    // shadow root; the `.stream-diffs-finalized` marker appears once the
    // stream controller has been finalized and the highlighted surface is up.
    await javascriptBlock.locator('.stream-diffs-shell .stream-diffs-finalized').first().waitFor({ timeout: 30000 })
    const javascriptState = await javascriptBlock.evaluate((element) => {
      const finalized = element.querySelector('.stream-diffs-shell .stream-diffs-finalized')
      const diffsContainer = finalized?.querySelector('diffs-container')
      const shadowPre = diffsContainer?.shadowRoot?.querySelector('pre')
      const renderedLineCount = shadowPre?.querySelectorAll('[data-line-type]').length ?? 0
      const fallback = element.querySelector('.code-editor-fallback-surface')
      return {
        hasCode: element.textContent?.includes('mainWindow') && element.textContent.includes('loadURL'),
        hasStreamDiffs: Boolean(element.querySelector('.stream-diffs-shell')),
        finalized: Boolean(finalized),
        renderedLineCount,
        fallbackHidden: !fallback || getComputedStyle(fallback).display === 'none',
      }
    })
    assert(javascriptState.hasCode, 'The JavaScript code block rendered without its source code')
    assert(javascriptState.hasStreamDiffs, 'The JavaScript code block did not retain its stream-diffs editor')
    assert(javascriptState.finalized && javascriptState.renderedLineCount > 0, 'The JavaScript code block did not finalize its stream-diffs surface')
    assert(javascriptState.fallbackHidden, 'The code fallback remained visible after stream-diffs became ready')

    const settingsPanel = page.locator('.settings-panel')
    await settingsPanel.getByText('Code Theme', { exact: true }).waitFor()
    assert(await settingsPanel.locator('select').count() === 4, 'The full React 19 settings panel was not ported')
    assert(await settingsPanel.locator('input[type="range"]').count() === 5, 'The full stream controls were not ported')

    const initiallyDark = await page.locator('html').evaluate(element => element.classList.contains('dark'))
    const homeThemeToggle = settingsPanel.locator('label').filter({ hasText: 'Dark Mode' }).locator('..').getByRole('button')
    await homeThemeToggle.scrollIntoViewIfNeeded()
    await homeThemeToggle.click()
    await page.waitForFunction(expected => document.documentElement.classList.contains('dark') === expected, !initiallyDark)

    await page.getByRole('button', { name: 'Test' }).click()
    await page.waitForURL(url => url.pathname === '/test')
    await page.getByRole('heading', { name: 'markstream-octane /test' }).waitFor()
    await page.getByText('Octane Regression Lab', { exact: true }).waitFor()

    const testRenderer = page.locator('.preview-surface .markstream-octane')
    await testRenderer.waitFor()
    await testRenderer.locator('.katex').first().waitFor({ timeout: 20000 })
    await testRenderer.locator('.mermaid-block ._mermaid svg').first().waitFor({ timeout: 20000 })

    const testLab = page.locator('.test-lab')
    const initialTestTheme = await testLab.evaluate(element => ({
      htmlDark: document.documentElement.classList.contains('dark'),
      labDark: element.classList.contains('test-lab--dark'),
    }))
    assert(initialTestTheme.htmlDark === initialTestTheme.labDark, 'The Test Lab theme disagrees with the document theme')

    await page.getByRole('button', { name: /结构压力/ }).click()
    const inlineCode = testRenderer.locator('.table-node code.inline-code').first()
    await inlineCode.waitFor()
    const inlineCodeContrast = await inlineCode.evaluate((element) => {
      const parseColor = (value) => {
        const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number)
        return channels?.length === 3 ? channels : undefined
      }
      const luminance = (channels) => {
        const linear = channels.map((channel) => {
          const normalized = channel / 255
          return normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
      }
      const style = getComputedStyle(element)
      const foreground = parseColor(style.color)
      const background = parseColor(style.backgroundColor)
      if (!foreground || !background)
        return 0
      const foregroundLuminance = luminance(foreground)
      const backgroundLuminance = luminance(background)
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    })
    assert(inlineCodeContrast >= 4.5, `Inline code contrast is too low (${inlineCodeContrast.toFixed(2)}:1)`)

    await page.getByRole('button', { name: /Thinking 嵌套重节点/ }).click()
    await testRenderer.locator('.thinking-node').waitFor()

    const editor = page.locator('textarea.editor-textarea')
    const liveMarkdown = `# Octane live editor\n\n**native runtime**\n\n${'streaming parity '.repeat(80)}`
    await editor.fill(liveMarkdown)
    await testRenderer.getByRole('heading', { name: 'Octane live editor' }).waitFor()
    await testRenderer.locator('strong').filter({ hasText: 'native runtime' }).waitFor()

    await page.getByRole('button', { name: '开始流式渲染' }).click()
    await page.getByRole('button', { name: '暂停流式渲染' }).click()
    await page.getByText('Paused', { exact: true }).first().waitFor()
    const pausedText = await testRenderer.textContent()
    await page.waitForTimeout(200)
    assert(await testRenderer.textContent() === pausedText, 'Markdown output continued changing after the stream was paused')
    await page.getByRole('button', { name: '继续流式渲染' }).click()
    await page.getByRole('button', { name: '停止流式渲染' }).click()

    await page.getByRole('button', { name: '更多设置' }).click()
    const settingsDialog = page.locator('dialog.settings-dialog')
    await settingsDialog.waitFor()
    assert(await settingsDialog.locator('select').count() === 3, 'The Test Lab stream settings are incomplete')
    assert(await settingsDialog.locator('input[type="number"]').count() === 5, 'The Test Lab numeric controls are incomplete')
    await settingsDialog.getByRole('button', { name: '关闭' }).click()

    const testLabInitiallyDark = await testLab.evaluate(element => element.classList.contains('test-lab--dark'))
    await page.getByRole('button', { name: testLabInitiallyDark ? '切换浅色' : '切换暗色' }).click()
    await page.waitForFunction((expected) => {
      const lab = document.querySelector('.test-lab')
      return Boolean(lab?.classList.contains('test-lab--dark')) === expected
        && document.documentElement.classList.contains('dark') === expected
    }, !testLabInitiallyDark)
    const toggledTestTheme = await testLab.evaluate(element => ({
      htmlDark: document.documentElement.classList.contains('dark'),
      labDark: element.classList.contains('test-lab--dark'),
    }))
    assert(toggledTestTheme.htmlDark === toggledTestTheme.labDark, 'The document theme did not follow the Test Lab toggle')

    await page.getByRole('button', { name: '返回主 demo' }).click()
    await page.waitForURL(url => url.pathname === '/')
    await page.getByRole('heading', { name: 'markstream-octane' }).waitFor()

    const reloadFixture = [
      '```ts',
      'const stages = [',
      `  'prepare',`,
      `  'stream',`,
      `  'render',`,
      '] as const',
      'async function run() {',
      '  for (const stage of stages) {',
      '    await Promise.resolve(stage)',
      '  }',
      '}',
      'const result = run()',
      'void result',
      'done()',
      '```',
    ].join('\n')
    const reloadUrl = `http://${host}:${port}/test?view=preview#data=raw:${encodeURIComponent(reloadFixture)}`
    const assertReloadFixture = async (phase) => {
      await page.locator('.workspace-card--share-preview .preview-surface .markstream-octane').waitFor()
      const slot = page.locator('[data-node-type="code_block"]').filter({ hasText: 'done()' }).first()
      await slot.locator('.code-block-container .stream-diffs-shell').first().waitFor({ state: 'attached', timeout: 30000 })
      const state = await slot.evaluate(element => ({
        hasBareFallback: Boolean(element.querySelector(':scope > .node-content > pre')),
        hasStreamDiffs: Boolean(element.querySelector('.stream-diffs-shell')),
        source: Array.from(element.querySelectorAll('pre code')).map(code => code.textContent ?? '').join('\n'),
      }))
      assert(!state.hasBareFallback, `${phase}: TypeScript fixture permanently degraded to a bare fallback`)
      assert(state.hasStreamDiffs, `${phase}: TypeScript fixture did not initialize stream-diffs`)
      const normalizedSource = state.source.trimEnd()
      assert(normalizedSource.split('\n').length === 13, `${phase}: TypeScript fixture did not preserve all 13 lines`)
      assert(normalizedSource.endsWith('done()'), `${phase}: TypeScript fixture lost its final done() line`)
    }

    await page.goto(reloadUrl, { waitUntil: 'load', timeout: 60000 })
    await assertReloadFixture('direct preview load')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await page.reload({ waitUntil: 'load', timeout: 60000 })
    await assertReloadFixture('cold preview reload')
    await cdp.detach()

    if (errors.length)
      throw new Error(`Browser errors:\n${errors.join('\n')}`)

    console.log('[e2e-octane-playground] React 19 parity playground smoke passed')
  }
  catch (error) {
    const logs = server.getLogs()
    if (logs)
      console.error(logs)
    throw error
  }
  finally {
    await browser?.close()
    stopServer(server.child)
  }
}

await main()
