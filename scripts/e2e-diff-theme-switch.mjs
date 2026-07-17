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

async function findFreePort(start = 4190, end = 4235) {
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

function colorLuminance(color) {
  const channels = String(color || '').match(/\d+(?:\.\d+)?/g)
  if (!channels || channels.length < 3)
    return null
  const [r, g, b] = channels.slice(0, 3).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

async function snapshot(page) {
  return page.evaluate(() => {
    const container = document.querySelector('.code-block-container')
    const header = document.querySelector('.code-block-header')
    const preview = document.querySelector('[data-testid="diff-theme-preview"]')
    const diffRoot = document.querySelector('.stream-diffs-shell')
    const diffs = diffRoot?.querySelector('diffs-container')
    const shadow = diffs?.shadowRoot
    const editorBackground = shadow?.querySelector('pre')

    const containerStyle = container instanceof HTMLElement ? window.getComputedStyle(container) : null
    const headerStyle = header instanceof HTMLElement ? window.getComputedStyle(header) : null
    const previewStyle = preview instanceof HTMLElement ? window.getComputedStyle(preview) : null
    const editorStyle = editorBackground instanceof HTMLElement ? window.getComputedStyle(editorBackground) : null

    const visibleUnmodifiedTexts = Array.from(shadow?.querySelectorAll('[data-unmodified-lines]') ?? [])
      .filter((node) => {
        if (!(node instanceof HTMLElement))
          return false
        const style = window.getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number.parseFloat(style.opacity || '1') > 0.05
          && rect.width > 0
          && rect.height > 0
      })
      .map(node => (node instanceof HTMLElement ? node.textContent.trim() : ''))
      .filter(Boolean)
    const fallback = container?.querySelector('pre.code-pre-fallback')
    const fallbackStyle = fallback instanceof HTMLElement ? window.getComputedStyle(fallback) : null
    const fallbackRect = fallback instanceof HTMLElement ? fallback.getBoundingClientRect() : null

    return {
      pageMode: document.documentElement.dataset.themeMode || '',
      containerBg: containerStyle?.backgroundColor || '',
      headerBg: headerStyle?.backgroundColor || '',
      previewBg: previewStyle?.backgroundColor || '',
      editorBg: editorStyle?.backgroundColor || '',
      rootClasses: diffRoot instanceof HTMLElement ? Array.from(diffRoot.classList) : [],
      isDarkClass: container instanceof HTMLElement ? container.classList.contains('is-dark') : false,
      metadataLabels: visibleUnmodifiedTexts,
      fallbackVisible: !!(fallbackRect
        && fallbackRect.width > 0
        && fallbackRect.height > 0
        && fallbackStyle?.display !== 'none'
        && fallbackStyle?.visibility !== 'hidden'),
      visibleHiddenLinesInDiff: visibleUnmodifiedTexts.some(text => /hidden lines/i.test(text)),
    }
  })
}

async function captureTransition(page, mode) {
  await page.click(`[data-theme-toggle="${mode}"]`)
  const frames = []
  for (let i = 0; i < 72; i++) {
    await page.waitForTimeout(16)
    frames.push(await snapshot(page))
  }
  return {
    frames,
    final: frames[frames.length - 1] ?? await snapshot(page),
  }
}

async function main() {
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort()
  const vite = spawn(
    'pnpm',
    ['-C', playgroundDir, 'dev', '--host', host, '--port', String(port), '--strictPort'],
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
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
    })

    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(String(error))
    })
    page.on('console', (message) => {
      if (message.type() === 'error')
        consoleErrors.push(message.text())
    })

    await page.goto(`http://${host}:${port}/diff-theme-regression`, {
      waitUntil: 'networkidle',
    })
    await page.waitForSelector('.code-block-container.is-diff[data-markstream-enhanced="true"][data-markstream-enhancement-state="ready"] .stream-diffs-shell', { timeout: 30000 })
    await page.waitForFunction(() => {
      const diffs = document.querySelector('.code-block-container.is-diff[data-markstream-enhanced="true"] diffs-container')
      return Array.from(diffs?.shadowRoot?.querySelectorAll('[data-unmodified-lines]') ?? [])
        .some((node) => {
          if (!(node instanceof HTMLElement))
            return false
          const style = window.getComputedStyle(node)
          const rect = node.getBoundingClientRect()
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number.parseFloat(style.opacity || '1') > 0.05
            && rect.width > 0
            && rect.height > 0
        })
    }, { timeout: 30000 })
    await page.waitForTimeout(400)

    const initial = await snapshot(page)
    const toLight = await captureTransition(page, 'light')
    const toDark = await captureTransition(page, 'dark')

    await browser.close()

    const initialLum = colorLuminance(initial.containerBg)
    const lightLum = colorLuminance(toLight.final.containerBg)
    const darkLum = colorLuminance(toDark.final.containerBg)

    const frames = [...toLight.frames, ...toDark.frames]
    const anyHiddenFlash = frames.some(frame =>
      frame.visibleHiddenLinesInDiff || frame.fallbackVisible,
    )

    const ok = (initialLum != null && initialLum < 90)
      && (lightLum != null && lightLum > 170)
      && (darkLum != null && darkLum < 90)
      && initial.containerBg !== toLight.final.containerBg
      && toLight.final.containerBg !== toDark.final.containerBg
      && toLight.final.isDarkClass === false
      && toDark.final.isDarkClass === true
      && !anyHiddenFlash
      && pageErrors.length === 0
      && consoleErrors.length === 0

    const result = {
      ok,
      colors: {
        initial: initial.containerBg,
        light: toLight.final.containerBg,
        dark: toDark.final.containerBg,
      },
      luminance: {
        initial: initialLum,
        light: lightLum,
        dark: darkLum,
      },
      initial,
      finalLight: toLight.final,
      finalDark: toDark.final,
      anyHiddenFlash,
      pageErrors,
      consoleErrors,
    }

    console.log(JSON.stringify(result, null, 2))

    if (!ok) {
      console.error('Recent Vite logs:\n', logs.slice(-60).join(''))
      process.exit(1)
    }
  }
  finally {
    cleanup()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
