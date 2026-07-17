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
const playgroundDir = path.join(repoRoot, 'playground-vue2-cli')
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

async function findFreePort(start = 3338, end = 3368) {
  for (let port = start; port <= end; port++) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
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
    ['exec', 'vue-cli-service', 'serve', '--port', String(port), '--host', host],
    {
      cwd: playgroundDir,
      env: {
        ...process.env,
        BROWSER: 'none',
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const appendLogs = (chunk) => {
    const text = String(chunk)
    logBuffer.push(text)
    if (logBuffer.length > 120)
      logBuffer.splice(0, logBuffer.length - 120)
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

function normalizeColor(color) {
  return String(color || '').replace(/\s+/g, '').toLowerCase()
}

function getColorChannels(color) {
  const parts = String(color || '').match(/\d+(?:\.\d+)?/g)
  if (!parts || parts.length < 3)
    return null
  return parts.slice(0, 3).map(Number)
}

function getRelativeLuminance(color) {
  const channels = getColorChannels(color)
  if (!channels)
    return null
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function getContrastRatio(foreground, background) {
  const fg = getRelativeLuminance(foreground)
  const bg = getRelativeLuminance(background)
  if (fg == null || bg == null)
    return null
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

function isDarkColor(color) {
  const parts = getColorChannels(color)
  if (!parts)
    return false
  const [r, g, b] = parts
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance < 140
}

async function collectRegression(page) {
  await page.locator('#delay').fill('4')
  await page.locator('#chunk').fill('16')
  await page.getByRole('button', { name: 'Reset' }).click()

  const seenHighlightBlocks = new Set()
  const regressedBlocks = new Set()
  const changedHighlightedBlocks = new Set()
  const changedHighlightDetails = []
  const regressionDetails = []
  const highlightedText = new Map()
  const uniqueProgress = new Set()
  let maxVisibleFallbacks = 0

  const start = Date.now()
  while (Date.now() - start < 20000) {
    const snapshot = await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll('.code-block-container')).map((block, index) => {
        const component = block.__vue__
        const render = block.querySelector('.code-block-render')
        const fallback = block.querySelector('.code-fallback-plain')
        const renderText = render?.textContent?.trim() || ''
        const fallbackText = fallback?.textContent?.trim() || ''
        const renderStyle = render ? window.getComputedStyle(render) : null
        const style = fallback ? window.getComputedStyle(fallback) : null
        const fallbackVisible = Boolean(
          fallback
          && fallbackText.length > 0
          && style
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || '1') > 0.05,
        )
        return {
          index,
          uid: component?._uid,
          loading: component?.loading ?? component?.$props?.loading,
          nodeLoading: component?.node?.loading ?? component?.$props?.node?.loading,
          renderText,
          fallbackText,
          hasRenderContent: Boolean(
            (renderText.length || render?.children.length)
            && renderStyle
            && renderStyle.display !== 'none'
            && renderStyle.visibility !== 'hidden'
            && Number(renderStyle.opacity || '1') > 0.05
            && !fallbackVisible,
          ),
          fallbackVisible,
        }
      })

      const metaText = document.querySelector('.meta')?.textContent || ''
      const match = metaText.match(/\((\d+)%\)/)

      return {
        blocks,
        progress: match ? Number(match[1]) : null,
      }
    })

    if (snapshot.progress != null)
      uniqueProgress.add(snapshot.progress)

    let visibleFallbacks = 0
    for (const block of snapshot.blocks) {
      if (block.hasRenderContent) {
        seenHighlightBlocks.add(block.index)
        const previousText = highlightedText.get(block.index)
        if (previousText != null && previousText !== block.renderText) {
          changedHighlightedBlocks.add(block.index)
          if (changedHighlightDetails.length < 20) {
            changedHighlightDetails.push({
              index: block.index,
              progress: snapshot.progress,
              loading: block.loading,
              nodeLoading: block.nodeLoading,
              previous: previousText.slice(0, 160),
              next: block.renderText.slice(0, 160),
            })
          }
        }
        highlightedText.set(block.index, block.renderText)
      }
      if (block.fallbackVisible)
        visibleFallbacks += 1
      if (seenHighlightBlocks.has(block.index) && block.fallbackVisible) {
        regressedBlocks.add(block.index)
        if (regressionDetails.length < 20) {
          regressionDetails.push({
            index: block.index,
            uid: block.uid,
            progress: snapshot.progress,
            loading: block.loading,
            nodeLoading: block.nodeLoading,
            renderText: block.renderText.slice(0, 120),
            fallbackText: block.fallbackText?.slice(0, 120),
          })
        }
      }
    }
    maxVisibleFallbacks = Math.max(maxVisibleFallbacks, visibleFallbacks)

    if (snapshot.progress === 100)
      break

    await page.waitForTimeout(120)
  }

  const finalStart = Date.now()
  while (Date.now() - finalStart < 12000 && seenHighlightBlocks.size === 0) {
    const blocks = await page.evaluate(() => (
      Array.from(document.querySelectorAll('.code-block-container')).map((block, index) => {
        const render = block.querySelector('.code-block-render')
        const fallback = block.querySelector('.code-fallback-plain')
        const renderStyle = render ? window.getComputedStyle(render) : null
        const fallbackStyle = fallback ? window.getComputedStyle(fallback) : null
        const fallbackVisible = Boolean(
          fallback
          && fallback.textContent?.trim()?.length
          && fallbackStyle
          && fallbackStyle.display !== 'none'
          && fallbackStyle.visibility !== 'hidden'
          && Number(fallbackStyle.opacity || '1') > 0.05,
        )
        return {
          index,
          hasRenderContent: Boolean(
            (render?.textContent?.trim()?.length || render?.children.length)
            && renderStyle
            && renderStyle.display !== 'none'
            && renderStyle.visibility !== 'hidden'
            && Number(renderStyle.opacity || '1') > 0.05
            && !fallbackVisible,
          ),
          fallbackVisible,
        }
      })
    ))

    for (const block of blocks) {
      if (block.hasRenderContent)
        seenHighlightBlocks.add(block.index)
      if (seenHighlightBlocks.has(block.index) && block.fallbackVisible)
        regressedBlocks.add(block.index)
    }

    if (seenHighlightBlocks.size === 0)
      await page.waitForTimeout(120)
  }

  return {
    seenHighlightBlocks: Array.from(seenHighlightBlocks),
    regressedBlocks: Array.from(regressedBlocks),
    changedHighlightedBlocks: Array.from(changedHighlightedBlocks),
    changedHighlightDetails,
    regressionDetails,
    uniqueProgress: Array.from(uniqueProgress).sort((a, b) => a - b),
    maxVisibleFallbacks,
  }
}

async function collectStyleSnapshot(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.code-block-container')).map((block, index) => {
      const render = block.querySelector('.code-block-render')
      const renderHasContent = Boolean(render?.textContent?.trim()?.length || render?.children.length)
      const titleEl = block.querySelector('.code-block-header .font-mono')
      const shikiEl = block.querySelector('.code-block-render .shiki, .code-block-render pre')
      const shikiCodeEl = shikiEl?.querySelector('code') || shikiEl
      const blockStyle = window.getComputedStyle(block)
      const shikiStyle = shikiEl ? window.getComputedStyle(shikiEl) : null
      const codeStyle = shikiCodeEl ? window.getComputedStyle(shikiCodeEl) : null

      return {
        index,
        title: titleEl?.textContent?.trim() || '',
        hasRenderContent: renderHasContent,
        containerBackground: blockStyle.backgroundColor,
        containerForeground: blockStyle.color,
        shikiBackground: shikiStyle?.backgroundColor || '',
        shikiForeground: codeStyle?.color || shikiStyle?.color || '',
      }
    })
  })
}

async function main() {
  const port = await findFreePort()
  const server = startDevServer(port)

  try {
    await waitForPort(port, 60000)
    const browser = await chromium.launch(resolveChromeLaunchOptions())
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
    const consoleErrors = []
    const pageErrors = []

    page.on('console', (msg) => {
      if (msg.type() === 'error')
        consoleErrors.push(msg.text())
    })
    page.on('pageerror', error => pageErrors.push(String(error)))

    const url = `http://${host}:${port}/`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#delay', { timeout: 30000 })
    await page.waitForSelector('.meta', { timeout: 30000 })

    const regression = await collectRegression(page)
    await page.waitForTimeout(600)
    const styleSnapshot = await collectStyleSnapshot(page)
    const screenshot = '/tmp/vue2-cli-codeblock-highlight-stability.png'
    await page.screenshot({ path: screenshot, fullPage: true })
    await browser.close()

    const highlightedBlocks = styleSnapshot.filter(block => block.hasRenderContent)
    const brightBlocks = highlightedBlocks
      .filter(block => !isDarkColor(block.shikiBackground || block.containerBackground))
      .map(block => block.index)
    const desyncedBackgroundBlocks = highlightedBlocks
      .filter((block) => {
        const shikiBg = normalizeColor(block.shikiBackground)
        const containerBg = normalizeColor(block.containerBackground)
        return shikiBg && containerBg && shikiBg !== containerBg
      })
      .map(block => block.index)
    const lowContrastBlocks = highlightedBlocks
      .filter((block) => {
        const contrast = getContrastRatio(block.containerForeground || block.shikiForeground, block.containerBackground || block.shikiBackground)
        return contrast != null && contrast < 3
      })
      .map(block => block.index)
    const unnormalizedTitleBlocks = highlightedBlocks
      .filter(block => /:/.test(block.title) || /shellscript/i.test(block.title))
      .map(block => ({ index: block.index, title: block.title }))

    const result = {
      url,
      ...regression,
      highlightedBlocks: highlightedBlocks.slice(0, 8),
      brightBlocks,
      desyncedBackgroundBlocks,
      lowContrastBlocks,
      unnormalizedTitleBlocks,
      consoleErrorCount: consoleErrors.length,
      consoleErrors: consoleErrors.slice(0, 20),
      pageErrorCount: pageErrors.length,
      pageErrors: pageErrors.slice(0, 20),
      screenshot,
    }

    console.log(JSON.stringify(result, null, 2))

    if (result.regressedBlocks.length > 0) {
      throw new Error(`Detected code block highlight regression on blocks: ${result.regressedBlocks.join(', ')}`)
    }
    if (result.seenHighlightBlocks.length === 0) {
      throw new Error('No highlighted code block was observed during the run')
    }
    if (result.changedHighlightedBlocks.length > 0) {
      throw new Error(`Highlighted code blocks kept updating: ${result.changedHighlightedBlocks.join(', ')}`)
    }
    if (result.consoleErrorCount > 0 || result.pageErrorCount > 0) {
      throw new Error(`Detected browser errors (console=${result.consoleErrorCount}, page=${result.pageErrorCount})`)
    }
    if (result.brightBlocks.length > 0) {
      throw new Error(`Detected non-dark highlighted code blocks: ${result.brightBlocks.join(', ')}`)
    }
    if (result.desyncedBackgroundBlocks.length > 0) {
      throw new Error(`Detected container/shiki background mismatch on blocks: ${result.desyncedBackgroundBlocks.join(', ')}`)
    }
    if (result.lowContrastBlocks.length > 0) {
      throw new Error(`Detected unreadable code block foreground contrast on blocks: ${result.lowContrastBlocks.join(', ')}`)
    }
    if (result.unnormalizedTitleBlocks.length > 0) {
      throw new Error(`Detected unnormalized code block titles: ${result.unnormalizedTitleBlocks.map(block => `${block.index}:${block.title}`).join(', ')}`)
    }
  }
  catch (error) {
    const recentLogs = server.getLogs().trim()
    if (recentLogs) {
      console.error('--- vue-cli recent logs ---')
      console.error(recentLogs)
      console.error('--- end vue-cli recent logs ---')
    }
    throw error
  }
  finally {
    killProcessTree(server.child)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
