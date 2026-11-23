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
    return Array.from(document.querySelectorAll('.code-block-container.is-diff diffs-container'))
      .some(host => Array.from(host.shadowRoot?.querySelectorAll('[data-unmodified-lines]') ?? [])
        .some(label => /unmodified lines|unchanged|hidden lines/i.test(label.textContent ?? '')))
  }, { timeout })
}

async function waitForHomeDiff(page, timeout = 90000) {
  await page.waitForSelector('.code-block-container.is-diff[data-markstream-enhanced="true"] .stream-diffs-shell', { timeout })
  await page.waitForFunction(() => {
    return document.querySelector('.chat-header__meta-pill')?.textContent?.trim() === 'Ready'
  }, undefined, { timeout })
}

async function collectExpandState(page, surfaceIndex) {
  return page.evaluate((surfaceIndex) => {
    const surface = document.querySelectorAll('.code-block-container.is-diff diffs-container')[surfaceIndex]
    const root = surface?.shadowRoot
    const hiddenTexts = Array.from(root?.querySelectorAll('[data-unmodified-lines]') ?? [])
      .map(element => (element.textContent ?? '').trim())
      .filter(Boolean)
    const hiddenLineTotal = hiddenTexts.reduce((total, value) => {
      const count = Number.parseInt(value.match(/\d+/)?.[0] ?? '0', 10)
      return total + (Number.isFinite(count) ? count : 0)
    }, 0)
    return {
      hiddenRegionCount: hiddenTexts.length,
      hiddenLineTotal,
      visibleLineCount: root?.querySelectorAll('[data-line-type]').length ?? 0,
      surfaceHeightPx: surface instanceof HTMLElement ? surface.getBoundingClientRect().height : 0,
    }
  }, surfaceIndex)
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
    const diffSurfaces = Array.from(document.querySelectorAll('.code-block-container.is-diff diffs-container'))
    const surfaceMetrics = diffSurfaces.map((surface, index) => {
      const root = surface.shadowRoot
      const pre = root?.querySelector('pre[data-diff]')
      const shell = surface.closest('.stream-diffs-shell')
      const host = surface.closest('.code-editor-container')
      const hiddenRegionTexts = Array.from(root?.querySelectorAll('[data-unmodified-lines]') ?? [])
        .map(element => (element.textContent ?? '').trim())
        .filter(Boolean)
      const foldButtonCandidates = Array.from(
        root?.querySelectorAll('[data-expand-button]') ?? [],
      )
      const foldButton
        = foldButtonCandidates.find(candidate => isVisibleButton(candidate))
          ?? foldButtonCandidates[0]
          ?? null
      const foldButtonRect = foldButton?.getBoundingClientRect?.() ?? null
      const hostHeightPx = host instanceof HTMLElement ? roundPx(host.getBoundingClientRect().height) : null
      const shellHeightPx = shell instanceof HTMLElement ? roundPx(shell.getBoundingClientRect().height) : null
      const surfaceHeightPx = surface instanceof HTMLElement ? roundPx(surface.getBoundingClientRect().height) : null

      return {
        index,
        diffType: pre?.getAttribute('data-diff-type') ?? null,
        hiddenRegionTexts,
        hostHeightPx,
        shellHeightPx,
        surfaceHeightPx,
        deletionVisibleLines: root?.querySelectorAll('[data-deletions] [data-content] [data-line-type]').length ?? 0,
        additionVisibleLines: root?.querySelectorAll('[data-additions] [data-content] [data-line-type]').length ?? 0,
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
          && isVisibleButton(foldButton)),
        surfaceFitsHost: hostHeightPx != null
          && shellHeightPx != null
          && surfaceHeightPx != null
          && Math.abs(hostHeightPx - shellHeightPx) <= 2
          && Math.abs(shellHeightPx - surfaceHeightPx) <= 2,
      }
    })
    const hiddenRegionTexts = surfaceMetrics.flatMap(metric => metric.hiddenRegionTexts)
    const foldedMetrics = surfaceMetrics.filter(metric => metric.hiddenRegionTexts.length > 0)

    return {
      name,
      ...extra,
      diffSurfaces: diffSurfaces.length,
      hiddenRegionCount: hiddenRegionTexts.length,
      hiddenRegionTexts,
      hasHiddenRegionText: hiddenRegionTexts.some(text => /unmodified lines|unchanged|hidden lines/i.test(text)),
      deletionVisibleLines: surfaceMetrics.reduce((total, metric) => total + metric.deletionVisibleLines, 0),
      additionVisibleLines: surfaceMetrics.reduce((total, metric) => total + metric.additionVisibleLines, 0),
      foldingControlsVisible: foldedMetrics.length > 0 && foldedMetrics.every(metric => metric.foldButtonVisible),
      surfacesFitHosts: surfaceMetrics.length > 0 && surfaceMetrics.every(metric => metric.surfaceFitsHost),
      surfaceMetrics,
    }
  }, { name, extra })
}

async function runControlledScenario(context, baseUrl) {
  const pair = buildScenario()
  const markdown = buildDiffMarkdown(pair)
  const page = await context.newPage()
  const url = `${baseUrl}/test?diffLayout=side-by-side#data=raw:${encodeURIComponent(markdown)}`

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.code-block-container.is-diff[data-markstream-enhanced="true"] .stream-diffs-shell', { timeout: 20000 })
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

  await page.goto(url, { waitUntil: 'networkidle' })
  await waitForHomeDiff(page)
  await page.evaluate(() => {
    const blocks = document.querySelectorAll('.code-block-container.is-diff')
    blocks[blocks.length - 1]?.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(500)
  await waitForHiddenRegions(page, 90000)
  await page.waitForTimeout(800)

  const result = await collectResult(page, 'index-route', { url })
  await page.close()
  return result
}

async function runHomeInlineScenario(context, baseUrl) {
  const page = await context.newPage()
  const url = `${baseUrl}/`

  await page.setViewportSize({ width: 430, height: 900 })
  await page.goto(url, { waitUntil: 'networkidle' })
  await waitForHomeDiff(page)
  await page.evaluate(() => {
    const blocks = document.querySelectorAll('.code-block-container.is-diff')
    blocks[blocks.length - 1]?.scrollIntoView({ block: 'center' })
  })
  await waitForHiddenRegions(page, 90000)
  await page.waitForTimeout(800)

  const initial = await collectResult(page, 'index-route-inline', { url })
  const foldButton = page.locator('diffs-container [data-expand-button]:visible').first()
  const surfaceIndex = await foldButton.evaluate((button) => {
    const root = button.getRootNode()
    const surface = root instanceof ShadowRoot ? root.host : null
    return Array.from(document.querySelectorAll('.code-block-container.is-diff diffs-container')).indexOf(surface)
  })
  const beforeExpand = await collectExpandState(page, surfaceIndex)
  await foldButton.click()
  await page.waitForFunction(({ surfaceIndex, beforeExpand }) => {
    const surface = document.querySelectorAll('.code-block-container.is-diff diffs-container')[surfaceIndex]
    const root = surface?.shadowRoot
    const hiddenTexts = Array.from(root?.querySelectorAll('[data-unmodified-lines]') ?? [])
      .map(element => (element.textContent ?? '').trim())
      .filter(Boolean)
    const hiddenLineTotal = hiddenTexts.reduce((total, value) => {
      const count = Number.parseInt(value.match(/\d+/)?.[0] ?? '0', 10)
      return total + (Number.isFinite(count) ? count : 0)
    }, 0)
    const visibleLineCount = root?.querySelectorAll('[data-line-type]').length ?? 0
    const surfaceHeightPx = surface instanceof HTMLElement ? surface.getBoundingClientRect().height : 0
    return hiddenTexts.length < beforeExpand.hiddenRegionCount
      || hiddenLineTotal < beforeExpand.hiddenLineTotal
      || visibleLineCount > beforeExpand.visibleLineCount
      || surfaceHeightPx > beforeExpand.surfaceHeightPx + 1
  }, { surfaceIndex, beforeExpand }, { timeout: 10000 })
  const afterExpand = await collectExpandState(page, surfaceIndex)
  const afterExpandChanged = afterExpand.hiddenRegionCount < beforeExpand.hiddenRegionCount
    || afterExpand.hiddenLineTotal < beforeExpand.hiddenLineTotal
    || afterExpand.visibleLineCount > beforeExpand.visibleLineCount
    || afterExpand.surfaceHeightPx > beforeExpand.surfaceHeightPx + 1

  await page.close()
  return {
    ...initial,
    beforeExpand,
    afterExpand,
    afterExpandChanged,
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
      localStorage.setItem('vmr-settings-stream-burstiness', '0')
      localStorage.setItem('vmr-settings-smooth-streaming', 'false')
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
      && controlled.foldingControlsVisible
      && controlled.deletionVisibleLines > 0
      && controlled.additionVisibleLines > 0
      && home.hasHiddenRegionText && home.hiddenRegionCount > 0
      && home.foldingControlsVisible
      && home.surfacesFitHosts
      && homeInline.hasHiddenRegionText && homeInline.hiddenRegionCount > 0
      && homeInline.foldingControlsVisible
      && homeInline.afterExpandChanged
      && home.diffSurfaces === 1

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
