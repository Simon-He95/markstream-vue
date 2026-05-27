#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const playgroundDir = path.join(repoRoot, 'playground')

function isPortOpen(port, host = '127.0.0.1') {
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

async function findFreePort(start = 4173, end = 4199) {
  for (let port = start; port <= end; port++) {
    const open = await isPortOpen(port)
    if (!open)
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, ms = 20000) {
  const start = Date.now()
  while (true) {
    const open = await isPortOpen(port)
    if (open)
      return
    if (Date.now() - start > ms)
      throw new Error(`Timed out waiting for port ${port}`)
    await new Promise(resolve => setTimeout(resolve, 150))
  }
}

function killProcessTree(child) {
  if (!child || child.killed)
    return
  try {
    child.kill('SIGTERM')
  }
  catch {}
  setTimeout(() => {
    try {
      if (!child.killed)
        child.kill('SIGKILL')
    }
    catch {}
  }, 3000).unref?.()
}

function countLines(text) {
  return text.split(/\r?\n/).length
}

function buildScenario() {
  const originalLines = [
    'type Task = { id: string, status: \'todo\' | \'done\' }',
    '',
    'export async function synchronizeTasks(tasks: Task[]) {',
    '  const report: string[] = []',
    String.raw`  report.push(\`input=\${tasks.length}\`)`,
    '',
  ]

  for (let i = 1; i <= 160; i++) {
    if (i % 20 === 0)
      originalLines.push(`  // stable checkpoint ${i}`)
    const n = String(i).padStart(3, '0')
    originalLines.push(`  report.push('stable-${n}')`)
  }

  originalLines.push('', '  return report', '}')

  const modifiedLines = [...originalLines]

  const optimized = modifiedLines.findIndex(line => line.includes('stable-018'))
  if (optimized >= 0) {
    modifiedLines[optimized] = `  report.push('stable-018-optimized')`
    modifiedLines[optimized + 1] = `  report.push('stable-019-optimized')`
    modifiedLines[optimized + 2] = `  report.push('stable-020-optimized')`
  }

  const hotfix = modifiedLines.findIndex(line => line.includes('stable-086'))
  if (hotfix >= 0) {
    modifiedLines[hotfix - 1] = `  report.push('stable-085-hotfix')`
    modifiedLines[hotfix] = `  report.push('stable-086-hotfix')`
    modifiedLines[hotfix + 1] = `  report.push('stable-087-hotfix')`
  }

  const cache = modifiedLines.findIndex(line => line.includes('stable-132'))
  if (cache >= 0) {
    modifiedLines[cache - 1] = `  report.push('stable-131-cache-hit')`
    modifiedLines[cache] = `  report.push('stable-132-cache-hit')`
    modifiedLines[cache + 1] = `  report.push('stable-133-cache-miss')`
  }

  const returnLine = modifiedLines.findIndex(line => line.trim() === 'return report')
  if (returnLine >= 0)
    modifiedLines[returnLine] = '  return report.filter(Boolean)'

  return {
    original: originalLines.join('\n'),
    modified: modifiedLines.join('\n'),
  }
}

function buildDiffMarkdown(pair) {
  const original = pair.original.split(/\r?\n/)
  const modified = pair.modified.split(/\r?\n/)
  const max = Math.max(original.length, modified.length)
  const diffLines = []

  for (let i = 0; i < max; i++) {
    const left = original[i]
    const right = modified[i]

    if (left === right) {
      diffLines.push(left ?? '')
      continue
    }
    if (left != null)
      diffLines.push(`-${left}`)
    if (right != null)
      diffLines.push(`+${right}`)
  }

  return [
    '# Diff folding fixture',
    '',
    'This page is used by the Playwright smoke test.',
    '',
    '```diff ts:synchronizeTasks.ts',
    ...diffLines,
    '```',
    '',
  ].join('\n')
}

function estimateChangedLines(pair) {
  const original = pair.original.split(/\r?\n/)
  const modified = pair.modified.split(/\r?\n/)
  const max = Math.max(original.length, modified.length)
  let changed = 0
  for (let i = 0; i < max; i++) {
    if ((original[i] ?? '') !== (modified[i] ?? ''))
      changed++
  }
  return changed
}

function resolveChromeLaunchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
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

async function waitForHiddenRegions(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const hiddenTexts = Array.from(document.querySelectorAll('.diff-hidden-lines'))
      .map(el => (el.textContent ?? '').trim())
      .filter(Boolean)
    return hiddenTexts.some(text => /hidden lines|unchanged|unmodified/i.test(text))
  }, { timeout })
}

async function collectResult(page, name, extra = {}) {
  return page.evaluate(({ name, extra }) => {
    const isVisibleButton = (element) => {
      if (!(element instanceof HTMLElement))
        return false
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return (
        rect.width >= 16
        && rect.height >= 16
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0.01
      )
    }
    const roundPx = (value) => {
      return Math.round(value * 100) / 100
    }
    const parsePx = (value) => {
      const n = Number.parseFloat(String(value ?? ''))
      return Number.isFinite(n) ? n : null
    }
    const diffEditors = Array.from(document.querySelectorAll('.monaco-diff-editor'))
    const hiddenTexts = Array.from(document.querySelectorAll('.diff-hidden-lines'))
      .map(el => (el.textContent ?? '').trim())
      .filter(Boolean)

    const originalVisibleLines = document.querySelectorAll('.editor.original .view-line').length
    const modifiedVisibleLines = document.querySelectorAll('.editor.modified .view-line').length
    const bodyText = document.body.textContent ?? ''
    const diffEditorMetrics = diffEditors.map((editorEl, index) => {
      const editorRect = editorEl.getBoundingClientRect()
      const host = editorEl.closest('.code-editor-container')
      const hostStyle = host instanceof HTMLElement ? window.getComputedStyle(host) : null
      const editorHiddenTexts = Array.from(editorEl.querySelectorAll('.diff-hidden-lines'))
        .map(el => (el.textContent ?? '').trim())
        .filter(Boolean)
      const foldButtonCandidates = Array.from(
        editorEl.querySelectorAll('.markstream-inline-fold-proxy, .diff-hidden-lines a'),
      )
      const foldButton
        = foldButtonCandidates.find(candidate => isVisibleButton(candidate))
          ?? foldButtonCandidates[0]
          ?? null
      const foldButtonRect = foldButton?.getBoundingClientRect?.() ?? null
      const hostHeightPx = host instanceof HTMLElement ? roundPx(host.getBoundingClientRect().height) : null
      const hostMaxHeightPx = parsePx(hostStyle?.maxHeight)
      const hostOverflow = hostStyle?.overflow ?? null

      return {
        index,
        isSideBySide: editorEl.classList.contains('side-by-side'),
        foldButtonKind: foldButton?.classList.contains('markstream-inline-fold-proxy') ? 'proxy' : (foldButton ? 'native' : null),
        hiddenRegionTexts: editorHiddenTexts,
        hostHeightPx,
        hostInlineHeight: host instanceof HTMLElement ? host.style.height : '',
        hostMaxHeightPx,
        hostInlineMaxHeight: host instanceof HTMLElement ? host.style.maxHeight : '',
        hostOverflow,
        hostOverflowY: hostStyle?.overflowY ?? null,
        editorHeightPx: roundPx(editorEl.getBoundingClientRect().height),
        foldButtonRect: foldButtonRect
          ? {
              x: roundPx(foldButtonRect.x),
              y: roundPx(foldButtonRect.y),
              width: roundPx(foldButtonRect.width),
              height: roundPx(foldButtonRect.height),
            }
          : null,
        foldButtonVisible: !!(foldButtonRect
          && foldButtonRect.width >= 16
          && foldButtonRect.height >= 16
          && foldButtonRect.left >= editorRect.left - 1
          && foldButtonRect.right <= editorRect.right + 1
          && foldButtonRect.top >= editorRect.top - 1
          && foldButtonRect.bottom <= editorRect.bottom + 1),
        hostShrunkAfterFolding: editorHiddenTexts.length > 0
          ? !!(hostHeightPx != null && hostMaxHeightPx != null && hostHeightPx + 1 < hostMaxHeightPx && hostOverflow !== 'auto')
          : null,
      }
    })
    const foldedMetrics = diffEditorMetrics.filter(metric => metric.hiddenRegionTexts.length > 0)
    const inlineMetrics = foldedMetrics.filter(metric => metric.isSideBySide === false)
    const foldedHostShrinks = foldedMetrics.length > 0 && foldedMetrics.every(metric => metric.hostShrunkAfterFolding === true)
    const inlineFoldButtonVisible = inlineMetrics.length > 0 && inlineMetrics.every(metric => metric.foldButtonVisible === true)

    return {
      name,
      ...extra,
      diffEditors: diffEditors.length,
      hiddenRegionCount: hiddenTexts.length,
      hiddenRegionTexts: hiddenTexts,
      hasHiddenRegionText: hiddenTexts.some(text => /hidden lines|unchanged|unmodified/i.test(text)),
      bodyContainsHiddenLinesText: /hidden lines|unchanged|unmodified/i.test(bodyText),
      originalVisibleLines,
      modifiedVisibleLines,
      foldedHostShrinks,
      inlineFoldButtonVisible,
      diffEditorMetrics,
    }
  }, { name, extra })
}

async function runControlledScenario(context, baseUrl) {
  const pair = buildScenario()
  const markdown = buildDiffMarkdown(pair)
  const page = await context.newPage()
  const url = `${baseUrl}/test#data=raw:${encodeURIComponent(markdown)}`

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.monaco-diff-editor', { timeout: 20000 })
  await waitForHiddenRegions(page)
  await page.waitForTimeout(500)

  const result = await collectResult(page, 'test-route', {
    url,
    originalLineCount: countLines(pair.original),
    modifiedLineCount: countLines(pair.modified),
    changedLineEstimate: estimateChangedLines(pair),
  })

  await page.close()
  return result
}

async function runHomeScenario(context, baseUrl) {
  const page = await context.newPage()
  const url = `${baseUrl}/`
  const diffEditor = page.locator('.monaco-diff-editor').last()

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.monaco-diff-editor', { timeout: 30000 })
  await diffEditor.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await waitForHiddenRegions(page, 30000)
  await page.waitForTimeout(800)

  const result = await collectResult(page, 'index-route', { url })
  await page.close()
  return result
}

async function runHomeInlineScenario(context, baseUrl) {
  const page = await context.newPage()
  const url = `${baseUrl}/`
  const diffEditor = page.locator('.monaco-diff-editor').last()

  await page.setViewportSize({ width: 430, height: 900 })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.monaco-diff-editor', { timeout: 30000 })
  await diffEditor.scrollIntoViewIfNeeded()
  await waitForHiddenRegions(page, 30000)
  await page.waitForTimeout(800)

  const initial = await collectResult(page, 'index-route-inline', { url })
  const foldButton = page.locator('.markstream-inline-fold-proxy:visible, .diff-hidden-lines a:visible').first()
  await foldButton.click()
  await page.waitForFunction(() => document.querySelectorAll('.diff-hidden-lines').length === 0, { timeout: 10000 })
  const afterExpandHiddenRegionCount = await page.locator('.diff-hidden-lines').count()

  await page.close()
  return {
    ...initial,
    afterExpandHiddenRegionCount,
    afterExpandFoldCleared: afterExpandHiddenRegionCount === 0,
  }
}

async function run() {
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort()
  if (!Number.isFinite(port))
    throw new Error(`Invalid PORT: ${process.env.PORT}`)

  const vite = spawn(
    'pnpm',
    ['-C', playgroundDir, 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  )

  const logs = []
  vite.stdout.on('data', chunk => logs.push(String(chunk)))
  vite.stderr.on('data', chunk => logs.push(String(chunk)))

  const cleanup = () => killProcessTree(vite)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)

  try {
    await waitForPort(port)

    const browser = await chromium.launch(resolveChromeLaunchOptions())
    const context = await browser.newContext()
    await context.addInitScript(() => {
      localStorage.setItem('vmr-settings-stream-delay', '4')
      localStorage.setItem('vmr-settings-stream-delay-min', '4')
      localStorage.setItem('vmr-settings-stream-delay-max', '4')
      localStorage.setItem('vmr-settings-stream-chunk-size', '16')
      localStorage.setItem('vmr-settings-stream-chunk-size-min', '16')
      localStorage.setItem('vmr-settings-stream-chunk-size-max', '16')
      localStorage.setItem('vmr-test-render-mode', 'monaco')
      localStorage.setItem('vmr-test-code-stream', 'false')
      localStorage.setItem('vmr-test-viewport-priority', 'false')
      localStorage.setItem('vmr-test-batch-rendering', 'false')
      localStorage.setItem('vmr-test-typewriter', 'false')
      localStorage.setItem('vmr-test-show-settings', 'false')
    })

    const baseUrl = `http://127.0.0.1:${port}`
    const controlled = await runControlledScenario(context, baseUrl)
    const home = await runHomeScenario(context, baseUrl)
    const homeInline = await runHomeInlineScenario(context, baseUrl)
    await browser.close()

    const ok = controlled.hasHiddenRegionText && controlled.hiddenRegionCount > 0
      && home.hasHiddenRegionText && home.hiddenRegionCount > 0
      && home.foldedHostShrinks
      && homeInline.hasHiddenRegionText && homeInline.hiddenRegionCount > 0
      && homeInline.inlineFoldButtonVisible
      && homeInline.afterExpandFoldCleared
      && home.diffEditors === 1

    const result = {
      ok,
      controlled,
      home,
      homeInline,
    }

    console.log(JSON.stringify(result, null, 2))

    if (!ok) {
      console.error('Recent Vite logs:\n', logs.slice(-40).join(''))
      process.exit(1)
    }
  }
  finally {
    cleanup()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
