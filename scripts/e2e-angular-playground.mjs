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
const playgroundDir = path.join(repoRoot, 'playground-angular')
const host = '127.0.0.1'

function isPortOpen(port, listenHost = host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: listenHost, port })
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

async function findFreePort(start = 4175, end = 4205) {
  for (let port = start; port <= end; port++) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, timeout = 60000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (await isPortOpen(port))
      return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${host}:${port}`)
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

function startDevServer(port) {
  const logBuffer = []
  const child = spawn(
    'pnpm',
    ['exec', 'vite', 'dev', '--host', host, '--port', String(port)],
    {
      cwd: playgroundDir,
      env: {
        ...process.env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const appendLogs = (chunk) => {
    const text = String(chunk)
    logBuffer.push(text)
    if (logBuffer.length > 160)
      logBuffer.splice(0, logBuffer.length - 160)
  }

  child.stdout.on('data', appendLogs)
  child.stderr.on('data', appendLogs)

  return {
    child,
    getLogs() {
      return logBuffer.join('')
    },
  }
}

function summarizeErrors(errors) {
  return errors
    .map(error => error.trim())
    .filter(Boolean)
}

function isExecutionContextDestroyed(error) {
  const message = String(error?.message ?? error ?? '')
  return message.includes('Execution context was destroyed')
    || message.includes('most likely because of a navigation')
}

async function installHoverProbe(page) {
  await page.addInitScript(() => {
    const globalKey = '__MARKSTREAM_HOVER_PROBE__'
    if (globalThis[globalKey])
      return

    const state = {
      mouseoverCount: 0,
      mouseoutCount: 0,
      lastTitle: '',
      frameCount: 0,
      maxFrameGap: 0,
      maxTimerDrift: 0,
    }

    let lastFrameAt = performance.now()
    const tick = (now) => {
      state.frameCount += 1
      state.maxFrameGap = Math.max(state.maxFrameGap, now - lastFrameAt)
      lastFrameAt = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    let expectedTimerAt = performance.now() + 100
    setInterval(() => {
      const now = performance.now()
      state.maxTimerDrift = Math.max(state.maxTimerDrift, Math.max(0, now - expectedTimerAt))
      expectedTimerAt = now + 100
    }, 100)

    const resolveTarget = (value) => {
      if (!(value instanceof Element))
        return null
      return value.closest('[title], a[href]')
    }

    document.addEventListener('mouseover', (event) => {
      const target = resolveTarget(event.target)
      if (!target)
        return
      state.mouseoverCount += 1
      state.lastTitle = target.getAttribute('title') || target.getAttribute('href') || target.textContent || ''
    }, true)

    document.addEventListener('mouseout', (event) => {
      const target = resolveTarget(event.target)
      if (!target)
        return
      state.mouseoutCount += 1
    }, true)

    globalThis[globalKey] = state
  })
}

async function readHoverProbe(page) {
  return page.evaluate(() => {
    const state = globalThis.__MARKSTREAM_HOVER_PROBE__ || {}
    return {
      mouseoverCount: Number(state.mouseoverCount || 0),
      mouseoutCount: Number(state.mouseoutCount || 0),
      lastTitle: String(state.lastTitle || ''),
      frameCount: Number(state.frameCount || 0),
      maxFrameGap: Number(state.maxFrameGap || 0),
      maxTimerDrift: Number(state.maxTimerDrift || 0),
    }
  })
}

async function readHomeProgress(page) {
  return page.evaluate(() => {
    const text = document.querySelector('.meta')?.textContent?.trim() || ''
    const match = text.match(/^(\d+)\s*\/\s*(\d+)\s*\((\d+)%\)$/)
    const current = match ? Number.parseInt(match[1], 10) : 0
    const total = match ? Number.parseInt(match[2], 10) : 0
    const percent = match ? Number.parseInt(match[3], 10) : 0
    return {
      text,
      current,
      total,
      percent,
      done: total > 0 && current >= total && percent === 100,
    }
  })
}

async function readHomePlaceholderCount(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
    return Array.from(document.querySelectorAll('.panel.preview .markstream-angular .node-placeholder'))
      .filter((node) => {
        const rect = node.getBoundingClientRect()
        return rect.width > 0
          && rect.height > 0
          && rect.bottom > 0
          && rect.right > 0
          && rect.top < viewportHeight
          && rect.left < viewportWidth
      })
      .length
  })
}

async function waitForProbeIncrement(page, key, previousValue, timeout = 1500) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    const current = await readHoverProbe(page)
    if (current[key] > previousValue)
      return Date.now() - startedAt
    await page.waitForTimeout(50)
  }
  throw new Error(`Timed out waiting for hover probe increment: ${key}`)
}

async function waitForHomeHoverTarget(page, timeout = 90000) {
  const selector = '.panel.preview .markstream-angular [title], .panel.preview .markstream-angular a[href]'
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeout) {
    const locator = page.locator(selector).first()
    if (await locator.count()) {
      try {
        if (await locator.isVisible())
          return selector
      }
      catch {
        // The preview re-renders while streaming; retry with a fresh locator.
      }
    }
    await page.waitForTimeout(250)
  }

  throw new Error('Timed out waiting for a hoverable home preview target.')
}

async function exerciseHomeHoverDuringStreaming(page, selector) {
  const samples = []
  const startedAt = Date.now()
  let maxPlaceholderCount = 0

  while (Date.now() - startedAt < 180000) {
    const progress = await readHomeProgress(page)
    if (progress.done)
      break

    const before = await readHoverProbe(page)
    const target = page.locator(selector).first()
    await target.hover({ timeout: 3000 })
    const overLatencyMs = await waitForProbeIncrement(page, 'mouseoverCount', before.mouseoverCount, 1500)

    await page.mouse.move(8, 8)
    const outLatencyMs = await waitForProbeIncrement(page, 'mouseoutCount', before.mouseoutCount, 1500)
    const placeholderCount = await readHomePlaceholderCount(page)
    maxPlaceholderCount = Math.max(maxPlaceholderCount, placeholderCount)

    samples.push({
      current: progress.current,
      percent: progress.percent,
      overLatencyMs,
      outLatencyMs,
      placeholderCount,
    })

    await page.waitForTimeout(1200)
  }

  const finalProbe = await readHoverProbe(page)
  return {
    interactionCount: samples.length,
    maxOverLatencyMs: Math.max(0, ...samples.map(sample => sample.overLatencyMs)),
    maxOutLatencyMs: Math.max(0, ...samples.map(sample => sample.outLatencyMs)),
    maxPlaceholderCount,
    finalProbe,
    samples,
  }
}

async function waitForHomeCompletion(page, timeout = 180000) {
  await page.waitForFunction(() => {
    const text = document.querySelector('.meta')?.textContent?.trim() || ''
    const match = text.match(/^(\d+)\s*\/\s*(\d+)\s*\((\d+)%\)$/)
    if (!match)
      return false
    const current = Number.parseInt(match[1], 10)
    const total = Number.parseInt(match[2], 10)
    const percent = Number.parseInt(match[3], 10)
    return total > 0 && current >= total && percent === 100
  }, null, { timeout })
}

async function collectHomeCompletionMetrics(page) {
  return page.evaluate(() => {
    const preview = document.querySelector('.panel.preview .markstream-angular')
    const text = preview?.textContent || ''
    const metaText = document.querySelector('.meta')?.textContent?.trim() || ''
    return {
      metaText,
      textLength: text.length,
      containsTaylor: text.includes('泰勒公式'),
      containsOrthogonalComplement: text.includes('正交补空间'),
      containsHelloWorldTail: text.includes('hello world'),
      linkCount: document.querySelectorAll('.panel.preview .markstream-angular a').length,
      katexCount: document.querySelectorAll('.panel.preview .markstream-angular .katex').length,
    }
  })
}

async function waitForHomeCompletedCodeHighlight(page, timeout = 180000) {
  await page.locator('.panel.preview .markstream-angular .code-block-container').first().scrollIntoViewIfNeeded()
  const startedAt = Date.now()
  let lastSnapshot = null

  while (Date.now() - startedAt < timeout) {
    lastSnapshot = await page.evaluate(() => {
      const text = document.querySelector('.meta')?.textContent?.trim() || ''
      const match = text.match(/^(\d+)\s*\/\s*(\d+)\s*\((\d+)%\)$/)
      const current = match ? Number.parseInt(match[1], 10) : 0
      const total = match ? Number.parseInt(match[2], 10) : 0
      const percent = match ? Number.parseInt(match[3], 10) : 0
      return {
        metaText: text,
        current,
        total,
        percent,
        done: total > 0 && current >= total && percent === 100,
        monacoCount: document.querySelectorAll('.panel.preview .markstream-angular [data-markstream-monaco="1"] .stream-diffs-shell, .panel.preview .markstream-angular [data-markstream-monaco="1"] .monaco-editor, .panel.preview .markstream-angular [data-markstream-monaco="1"] .monaco-diff-editor').length,
        fallbackPreCount: document.querySelectorAll('.panel.preview .markstream-angular .code-pre-fallback').length,
      }
    })

    if (lastSnapshot.done && lastSnapshot.monacoCount > 0)
      return lastSnapshot

    await page.waitForTimeout(400)
  }

  throw new Error(`Timed out waiting for a completed visible code block surface: ${JSON.stringify(lastSnapshot)}`)
}

async function collectHomeThinkingMetrics(page) {
  await page.waitForFunction(() => {
    const text = document.querySelector('.meta')?.textContent?.trim() || ''
    const match = text.match(/(\d+)\s*\/\s*(\d+)/)
    return !!match && Number.parseInt(match[1], 10) >= 1000
  }, { timeout: 30000 })

  return page.evaluate(() => {
    const content = document.querySelector('.thinking-node__content')
    const text = content?.textContent || ''
    return {
      textLength: text.trim().length,
      containsComprehensiveAnswer: text.includes('全面的回答'),
      paragraphCount: content?.querySelectorAll('p').length || 0,
      listCount: content?.querySelectorAll('li').length || 0,
    }
  })
}

async function collectHomeLinkTooltip(page) {
  const link = page
    .locator('.panel.preview .markstream-angular a.link-node[href="https://github.com/Simon-He95/markstream-vue"]')
    .filter({ hasText: 'Star on GitHub' })
    .first()

  await link.waitFor({ state: 'visible', timeout: 30000 })
  await link.hover()
  await page.waitForFunction(() => {
    const tooltip = document.querySelector('.ms-tooltip')
    if (!tooltip)
      return false
    const style = window.getComputedStyle(tooltip)
    const text = tooltip.textContent?.trim() || ''
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') > 0.05
      && text.includes('https://github.com/Simon-He95/markstream-vue')
  }, { timeout: 10000 })

  return page.evaluate(() => {
    const tooltip = document.querySelector('.ms-tooltip')
    const style = tooltip ? window.getComputedStyle(tooltip) : null
    return {
      text: tooltip?.textContent?.trim() || '',
      visible: Boolean(
        tooltip
        && style
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0.05,
      ),
    }
  })
}

async function waitForStableEnhancements(page) {
  await page.waitForSelector('.preview-surface .katex', { timeout: 30000 })
  await page.waitForSelector('.preview-surface .markstream-angular-mermaid svg', { timeout: 30000 })
  await page.waitForSelector('.preview-surface [data-markstream-infographic="1"] svg', { timeout: 30000 })
  await page.waitForSelector('.preview-surface [data-markstream-d2="1"] svg', { timeout: 30000 })
}

async function collectBaselineMetrics(page) {
  return page.evaluate(() => ({
    katexCount: document.querySelectorAll('.preview-surface .katex').length,
    mermaidSvgCount: document.querySelectorAll('.preview-surface .markstream-angular-mermaid svg').length,
    infographicSvgCount: document.querySelectorAll('.preview-surface [data-markstream-infographic="1"] svg').length,
    d2SvgCount: document.querySelectorAll('.preview-surface [data-markstream-d2="1"] svg').length,
  }))
}

async function verifyBaselineInteractions(page) {
  const mermaidBlock = page.locator('.preview-surface .mermaid-block').first()
  await mermaidBlock.getByRole('button', { name: 'Source' }).click()
  await page.waitForSelector('.preview-surface .mermaid-block .mermaid-source', { timeout: 10000 })
  await mermaidBlock.getByRole('button', { name: 'Preview' }).click()
  await page.waitForSelector('.preview-surface .mermaid-block .markstream-angular-mermaid svg', { timeout: 10000 })
  await mermaidBlock.getByRole('button', { name: 'Fullscreen' }).click()
  await page.waitForSelector('.mermaid-modal-overlay', { timeout: 10000 })
  await page.getByRole('button', { name: 'Close' }).click()
  await page.waitForSelector('.mermaid-modal-overlay', { state: 'hidden', timeout: 10000 })

  const d2Block = page.locator('.preview-surface [data-markstream-d2="1"]').first()
  await d2Block.getByRole('button', { name: 'Source' }).click()
  await page.waitForFunction(() => {
    const block = document.querySelector('.preview-surface [data-markstream-d2="1"]')
    return block?.getAttribute('data-mode') === 'source'
  }, { timeout: 10000 })
  await d2Block.getByRole('button', { name: 'Preview' }).click()
  await page.waitForFunction(() => {
    const block = document.querySelector('.preview-surface [data-markstream-d2="1"]')
    return block?.getAttribute('data-mode') === 'preview'
  }, { timeout: 10000 })

  const infographicBlock = page.locator('.preview-surface [data-markstream-infographic="1"]').first()
  await infographicBlock.getByRole('button', { name: 'Source' }).click()
  await page.waitForFunction(() => {
    const block = document.querySelector('.preview-surface [data-markstream-infographic="1"]')
    return block?.getAttribute('data-mode') === 'source'
  }, { timeout: 10000 })
  await infographicBlock.getByRole('button', { name: 'Preview' }).click()
  await page.waitForFunction(() => {
    const block = document.querySelector('.preview-surface [data-markstream-infographic="1"]')
    return block?.getAttribute('data-mode') === 'preview'
  }, { timeout: 10000 })
}

async function collectDiffMetrics(page) {
  return page.evaluate(() => ({
    wrapperCount: document.querySelectorAll('.preview-surface [data-markstream-monaco="1"]').length,
    monacoCount: document.querySelectorAll('.preview-surface [data-markstream-monaco="1"] .stream-diffs-shell, .preview-surface [data-markstream-monaco="1"] .monaco-editor').length,
    monacoDiffCount: document.querySelectorAll('.preview-surface [data-markstream-monaco-diff="1"] .stream-diffs-shell, .preview-surface [data-markstream-monaco-diff="1"] .monaco-diff-editor').length,
    badgeTexts: Array.from(document.querySelectorAll('.preview-surface .markstream-angular-enhanced-block__badge'))
      .map(node => node.textContent?.trim())
      .filter(Boolean),
  }))
}

async function verifyDiffInteractions(page) {
  const diffBlock = page.locator('.preview-surface [data-markstream-monaco-diff="1"]').first()
  await diffBlock.locator('button[title="Collapse"]').first().click()
  await page.waitForFunction(() => {
    const body = document.querySelector('.preview-surface [data-markstream-monaco-diff="1"] .code-block-body')
    return body?.classList.contains('code-block-body--collapsed') === true
  }, { timeout: 10000 })
  await diffBlock.locator('button[title="Expand"]').first().click()
  await page.waitForFunction(() => {
    const body = document.querySelector('.preview-surface [data-markstream-monaco-diff="1"] .code-block-body')
    return body?.classList.contains('code-block-body--collapsed') === false
  }, { timeout: 10000 })
  await diffBlock.locator('button[title="Copy"]').first().click()
  await page.waitForFunction(() => {
    const live = document.querySelector('.preview-surface [data-markstream-monaco-diff="1"] [role="status"]')
    return live?.textContent?.includes('Copied')
  }, { timeout: 10000 })
}

async function collectThinkingMetrics(page) {
  return page.evaluate(() => ({
    thinkingCount: document.querySelectorAll('.preview-surface .thinking-node').length,
    mermaidSvgCount: document.querySelectorAll('.preview-surface .thinking-node .markstream-angular-mermaid svg').length,
    monacoCount: document.querySelectorAll('.preview-surface .thinking-node [data-markstream-monaco="1"] .stream-diffs-shell, .preview-surface .thinking-node [data-markstream-monaco="1"] .monaco-editor, .preview-surface .thinking-node [data-markstream-monaco="1"] .monaco-diff-editor').length,
    listCount: document.querySelectorAll('.preview-surface .thinking-node li').length,
    previewExcerpt: (document.querySelector('.preview-surface')?.textContent || '').slice(0, 500),
  }))
}

async function collectThinkingDebug(page) {
  return page.evaluate(() => ({
    thinkingHtml: (document.querySelector('.preview-surface .thinking-node')?.innerHTML || '').slice(0, 8000),
    blockCount: document.querySelectorAll('.preview-surface .thinking-node .mermaid-block').length,
    blockHtml: (document.querySelector('.preview-surface .thinking-node .mermaid-block')?.outerHTML || '').slice(0, 4000),
    sourceCount: document.querySelectorAll('.preview-surface .thinking-node .mermaid-source').length,
    previewCount: document.querySelectorAll('.preview-surface .thinking-node .mermaid-preview').length,
    hostCount: document.querySelectorAll('.preview-surface .thinking-node .markstream-angular-mermaid').length,
    stage: document.querySelector('.preview-surface .thinking-node .mermaid-block')?.getAttribute('data-stage'),
    errorTexts: Array.from(document.querySelectorAll('.preview-surface .thinking-node .mermaid-error'))
      .map(node => node.textContent?.trim())
      .filter(Boolean),
  }))
}

async function waitForDiffEditors(page, timeout = 60000) {
  const startedAt = Date.now()
  let lastSnapshot = null

  while (Date.now() - startedAt < timeout) {
    lastSnapshot = await page.evaluate(() => ({
      wrapperCount: document.querySelectorAll('.preview-surface [data-markstream-monaco="1"]').length,
      monacoCount: document.querySelectorAll('.preview-surface [data-markstream-monaco="1"] .stream-diffs-shell, .preview-surface [data-markstream-monaco="1"] .monaco-editor').length,
      badgeTexts: Array.from(document.querySelectorAll('.preview-surface .markstream-angular-enhanced-block__badge'))
        .map(node => node.textContent?.trim())
        .filter(Boolean),
      previewExcerpt: (document.querySelector('.preview-surface')?.textContent || '').slice(0, 500),
      textareaExcerpt: (((document.querySelector('textarea') && 'value' in document.querySelector('textarea'))
        ? document.querySelector('textarea').value
        : '') || '').slice(0, 160),
    }))

    if (lastSnapshot.wrapperCount >= 2 && lastSnapshot.monacoCount >= 2)
      return lastSnapshot

    await page.waitForTimeout(1000)
  }

  throw new Error(`Timed out waiting for diff Monaco blocks: ${JSON.stringify(lastSnapshot)}`)
}

async function collectStressMetrics(page) {
  return page.evaluate(() => ({
    tableCount: document.querySelectorAll('.preview-surface table').length,
    detailsCount: document.querySelectorAll('.preview-surface details').length,
    summaryCount: document.querySelectorAll('.preview-surface summary').length,
    blockquoteCount: document.querySelectorAll('.preview-surface blockquote').length,
    previewExcerpt: (document.querySelector('.preview-surface')?.textContent || '').slice(0, 500),
  }))
}

async function collectStreamingMetrics(page) {
  const progressNode = page.locator('.hero-panel__metrics .metric-card').nth(3).locator('strong')
  const readProgress = async () => {
    const text = (await progressNode.textContent()).trim()
    return Number.parseInt(text.replace(/\D/g, ''), 10)
  }

  await page.getByRole('button', { name: '开始流式渲染' }).click()
  await page.waitForFunction(() => {
    const pill = document.querySelectorAll('.workspace-card .mini-pill')[1]
    const foot = document.querySelectorAll('.workspace-card__foot span')[3]
    return pill?.textContent?.trim() === 'Streaming'
      && foot?.textContent?.includes('Streaming 中')
  }, null, { timeout: 10000 })

  const earlyProgress = await readProgress()

  await page.waitForFunction(() => {
    const progress = document.querySelectorAll('.hero-panel__metrics .metric-card strong')[3]
    const pill = document.querySelectorAll('.workspace-card .mini-pill')[1]
    const foot = document.querySelectorAll('.workspace-card__foot span')[3]
    return progress?.textContent?.trim() === '100%'
      && pill?.textContent?.trim() === 'Ready'
      && foot?.textContent?.includes('Angular renderer')
  }, null, { timeout: 30000 })

  return {
    earlyProgress,
    finalProgress: await readProgress(),
  }
}

async function collectHomeStreamingHealth(page, initialMetaText) {
  let previousMetaText = initialMetaText

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForFunction((previous) => {
        const meta = document.querySelector('.meta')
        return !!meta && meta.textContent?.trim() !== previous
      }, previousMetaText, { timeout: 20000 })

      return await page.evaluate(() => new Promise((resolve) => {
        let frameCount = 0
        const startedAt = performance.now()
        const tick = (now) => {
          frameCount += 1
          if (now - startedAt >= 800) {
            resolve({
              frameCount,
              metaText: document.querySelector('.meta')?.textContent?.trim() || '',
            })
            return
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }))
    }
    catch (error) {
      if (!isExecutionContextDestroyed(error) || attempt === 2)
        throw error

      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {})
      await page.waitForSelector('.meta', { timeout: 30000 })
      previousMetaText = (await page.locator('.meta').textContent().catch(() => initialMetaText)).trim()
    }
  }

  throw new Error('Unable to collect home streaming health after navigation retries')
}

async function main() {
  const port = await findFreePort()
  const server = startDevServer(port)

  try {
    await waitForPort(port)

    const browser = await chromium.launch(resolveChromeLaunchOptions())
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
    await installHoverProbe(page)
    const consoleErrors = []
    const pageErrors = []

    page.on('console', (msg) => {
      if (msg.type() === 'error')
        consoleErrors.push(msg.text())
    })
    page.on('pageerror', error => pageErrors.push(String(error)))

    const homeUrl = `http://${host}:${port}/`
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=markstream-angular playground', { timeout: 30000 })
    await page.waitForSelector('text=Open /test', { timeout: 30000 })

    const homeProgressText = (await page.locator('.meta').textContent()).trim()
    const homeStreamingHealth = await collectHomeStreamingHealth(page, homeProgressText)
    const homeHoverSelector = await waitForHomeHoverTarget(page)
    const homeHoverDuringStreaming = await exerciseHomeHoverDuringStreaming(page, homeHoverSelector)
    const homeThinking = await collectHomeThinkingMetrics(page)
    const homeLinkTooltip = await collectHomeLinkTooltip(page)
    await waitForHomeCompletion(page)
    const homeCompletion = await collectHomeCompletionMetrics(page)
    const homeStreamingCodeHighlight = await waitForHomeCompletedCodeHighlight(page)
    await page.getByRole('button', { name: 'Open /test' }).click()
    await page.waitForURL(new RegExp(`http://${host}:${port}/test$`), { timeout: 15000 })
    await page.waitForSelector('text=markstream-angular /test', { timeout: 30000 })

    await waitForStableEnhancements(page)
    const baseline = await collectBaselineMetrics(page)
    await verifyBaselineInteractions(page)

    await page.getByRole('button', { name: 'Thinking 嵌套重节点' }).click()
    await page.waitForSelector('.preview-surface .thinking-node', { timeout: 20000 })
    try {
      await page.waitForSelector('.preview-surface .thinking-node .markstream-angular-mermaid svg', { timeout: 30000 })
    }
    catch (error) {
      const thinkingDebug = await collectThinkingDebug(page)
      throw new Error(`Timed out waiting for thinking Mermaid render: ${JSON.stringify(thinkingDebug)}`, { cause: error })
    }
    await page.waitForSelector('.preview-surface .thinking-node [data-markstream-monaco="1"] .stream-diffs-shell, .preview-surface .thinking-node [data-markstream-monaco="1"] .monaco-editor, .preview-surface .thinking-node [data-markstream-monaco="1"] .monaco-diff-editor', { timeout: 30000 })
    const thinking = await collectThinkingMetrics(page)

    await page.getByRole('button', { name: 'Diff 与代码流' }).click()
    await waitForDiffEditors(page)
    const diff = await collectDiffMetrics(page)
    if (diff.monacoDiffCount < 1)
      throw new Error(`Expected a rendered Monaco diff surface, received ${diff.monacoDiffCount}`)
    await verifyDiffInteractions(page)

    await page.getByRole('button', { name: '结构压力' }).click()
    await page.waitForSelector('.preview-surface table', { timeout: 20000 })
    await page.waitForFunction(() => {
      return document.querySelectorAll('.preview-surface details').length >= 1
        && document.querySelectorAll('.preview-surface summary').length >= 1
    }, { timeout: 20000 })
    const stress = await collectStressMetrics(page)
    const streaming = await collectStreamingMetrics(page)

    await page.getByRole('button', { name: '返回主 demo' }).click()
    await page.waitForURL(new RegExp(`http://${host}:${port}/$`), { timeout: 15000 })
    await page.waitForSelector('text=markstream-angular playground', { timeout: 30000 })

    const screenshot = '/tmp/markstream-angular-playground-e2e.png'
    await page.screenshot({ path: screenshot, fullPage: true })
    await browser.close()

    const result = {
      homeUrl,
      homeProgressText,
      homeStreamingHealth,
      homeHoverDuringStreaming,
      homeThinking,
      homeLinkTooltip,
      homeStreamingCodeHighlight,
      homeCompletion,
      baseline,
      thinking,
      diff,
      stress,
      streaming,
      consoleErrors: summarizeErrors(consoleErrors),
      pageErrors: summarizeErrors(pageErrors),
      screenshot,
    }

    console.log(JSON.stringify(result, null, 2))

    if (result.consoleErrors.length > 0 || result.pageErrors.length > 0) {
      throw new Error(`Unexpected browser errors: console=${result.consoleErrors.length}, page=${result.pageErrors.length}`)
    }
    if (result.homeStreamingHealth.frameCount < 20 || result.homeStreamingHealth.metaText === result.homeProgressText) {
      throw new Error(`Home page became unresponsive while streaming: ${JSON.stringify(result.homeStreamingHealth)}`)
    }
    const completionMatch = result.homeCompletion.metaText.match(/^(\d+)\s*\/\s*(\d+)\s*\((\d+)%\)$/)
    if (!completionMatch || completionMatch[1] !== completionMatch[2] || completionMatch[3] !== '100') {
      throw new Error(`Home page did not reach full completion: ${JSON.stringify(result.homeCompletion)}`)
    }
    if (!result.homeCompletion.containsTaylor || !result.homeCompletion.containsOrthogonalComplement || !result.homeCompletion.containsHelloWorldTail) {
      throw new Error(`Home page final content is missing expected sections: ${JSON.stringify(result.homeCompletion)}`)
    }
    if (result.homeCompletion.katexCount < 10) {
      throw new Error(`Home page did not keep KaTeX refreshed through the full stream: ${JSON.stringify(result.homeCompletion)}`)
    }
    if (
      result.homeHoverDuringStreaming.interactionCount < 3
      || result.homeHoverDuringStreaming.maxOverLatencyMs > 1200
      || result.homeHoverDuringStreaming.maxOutLatencyMs > 1200
      || result.homeHoverDuringStreaming.maxPlaceholderCount > 0
      || result.homeHoverDuringStreaming.finalProbe.mouseoverCount < result.homeHoverDuringStreaming.interactionCount
      || result.homeHoverDuringStreaming.finalProbe.mouseoutCount < result.homeHoverDuringStreaming.interactionCount
    ) {
      throw new Error(`Home hover probe was sluggish while streaming: ${JSON.stringify(result.homeHoverDuringStreaming)}`)
    }
    if (
      result.homeThinking.textLength < 200
      || !result.homeThinking.containsComprehensiveAnswer
      || result.homeThinking.paragraphCount < 2
    ) {
      throw new Error(`Home thinking stream did not keep nested content expanded: ${JSON.stringify(result.homeThinking)}`)
    }
    if (!result.homeLinkTooltip.visible || !result.homeLinkTooltip.text.includes('https://github.com/Simon-He95/markstream-vue')) {
      throw new Error(`Home link tooltip did not match the shared singleton behavior: ${JSON.stringify(result.homeLinkTooltip)}`)
    }
    if (result.homeStreamingCodeHighlight.monacoCount < 1 || !result.homeStreamingCodeHighlight.done) {
      throw new Error(`Completed visible code blocks did not enter highlighted mode: ${JSON.stringify(result.homeStreamingCodeHighlight)}`)
    }
    if (baseline.katexCount < 1 || baseline.mermaidSvgCount < 1 || baseline.infographicSvgCount < 1 || baseline.d2SvgCount < 1) {
      throw new Error(`Baseline enhancements did not all render: ${JSON.stringify(baseline)}`)
    }
    if (thinking.thinkingCount < 1 || thinking.mermaidSvgCount < 1 || thinking.monacoCount < 1 || thinking.listCount < 2) {
      throw new Error(`Thinking sample did not render nested heavy nodes as expected: ${JSON.stringify(thinking)}`)
    }
    if (diff.wrapperCount < 2 || diff.monacoCount < 2) {
      throw new Error(`Diff sample did not mount Monaco editors as expected: ${JSON.stringify(diff)}`)
    }
    if (stress.tableCount < 1 || stress.detailsCount < 1 || stress.summaryCount < 1) {
      throw new Error(`Stress sample missed expected structural nodes: ${JSON.stringify(stress)}`)
    }
    if (!(streaming.earlyProgress > 0 && streaming.earlyProgress < 100) || streaming.finalProgress !== 100) {
      throw new Error(`Streaming progress did not behave as expected: ${JSON.stringify(streaming)}`)
    }
  }
  catch (error) {
    const recentLogs = server.getLogs().trim()
    if (recentLogs) {
      console.error('--- playground-angular recent logs ---')
      console.error(recentLogs)
      console.error('--- end playground-angular recent logs ---')
    }
    throw error
  }
  finally {
    killProcessTree(server.child)
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
