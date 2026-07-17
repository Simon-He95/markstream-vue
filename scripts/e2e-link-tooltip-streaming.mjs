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

async function waitForPort(port, timeout = 60000) {
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

async function readProgress(page) {
  return page.evaluate(() => {
    const metaText = document.querySelector('.meta')?.textContent || ''
    const match = metaText.match(/\((\d+)%\)/)
    return match ? Number(match[1]) : null
  })
}

async function readTooltipState(page) {
  return page.evaluate(() => {
    const tooltip = document.querySelector('.tooltip-element')
    const style = tooltip ? window.getComputedStyle(tooltip) : null
    const text = tooltip?.textContent?.trim() || ''
    const visible = Boolean(
      tooltip
      && text.length > 0
      && style
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') > 0.05,
    )

    return {
      visible,
      text,
      html: tooltip?.innerHTML || '',
    }
  })
}

async function hoverAndReadTooltip(page, locator, expectedText) {
  await locator.scrollIntoViewIfNeeded()
  await locator.hover()
  await page.waitForFunction(() => {
    const tooltip = document.querySelector('.tooltip-element')
    if (!tooltip)
      return false
    const style = window.getComputedStyle(tooltip)
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') > 0.05
      && Boolean(tooltip.textContent?.trim())
  }, { timeout: 10000 })

  const startedAt = Date.now()
  while (Date.now() - startedAt < 4000) {
    const state = await readTooltipState(page)
    if (state.visible && state.text.includes(expectedText))
      return state
    await page.waitForTimeout(80)
  }

  const state = await readTooltipState(page)
  throw new Error(`Tooltip text mismatch. Expected to include "${expectedText}", got "${state.text}".`)
}

async function collectTooltipRegression(page) {
  await page.locator('#delay').fill('4')
  await page.locator('#chunk').fill('16')
  await page.getByRole('button', { name: 'Reset' }).click()

  const firstLink = page.locator('a.link-node[href="https://github.com/Simon-He95/markstream-vue"]').filter({ hasText: 'Star on GitHub' }).first()
  const secondLink = page.locator('a.link-node[href="https://simonhe.me/"]').filter({ hasText: 'Link (Test 1)' }).first()

  await firstLink.waitFor({ state: 'visible', timeout: 15000 })
  const firstProgress = await readProgress(page)
  const firstTooltip = await hoverAndReadTooltip(page, firstLink, 'https://github.com/Simon-He95/markstream-vue')

  await secondLink.waitFor({ state: 'visible', timeout: 15000 })
  const secondTooltip = await hoverAndReadTooltip(page, secondLink, 'https://simonhe.me/')
  const progressAtMonitorStart = await readProgress(page)

  const samples = []
  const startedAt = Date.now()
  while (Date.now() - startedAt < 45000) {
    const tooltip = await readTooltipState(page)
    const progress = await readProgress(page)
    samples.push({ tooltip, progress })

    if (progress === 100 && samples.length >= 10)
      break

    await page.waitForTimeout(120)
  }

  const hiddenSamples = samples.filter(sample => !sample.tooltip.visible).length
  const wrongTextSamples = samples.filter(sample => !sample.tooltip.text.includes('https://simonhe.me/')).length
  const finalProgress = samples.at(-1)?.progress ?? null
  const progressAdvanced = progressAtMonitorStart != null && finalProgress != null
    ? finalProgress - progressAtMonitorStart
    : null

  return {
    firstProgress,
    progressAtMonitorStart,
    finalProgress,
    progressAdvanced,
    firstTooltipText: firstTooltip.text,
    secondTooltipText: secondTooltip.text,
    hiddenSamples,
    wrongTextSamples,
    sampleCount: samples.length,
  }
}

async function main() {
  const port = await findFreePort()
  const server = startDevServer(port)

  try {
    await waitForPort(port)
    const browser = await chromium.launch(resolveChromeLaunchOptions())
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
    const consoleErrors = []
    const pageErrors = []

    page.on('console', (msg) => {
      if (msg.type() === 'error')
        consoleErrors.push(msg.text())
    })
    page.on('pageerror', error => pageErrors.push(String(error)))

    const url = `http://${host}:${port}/?probe=1`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#delay', { timeout: 30000 })
    await page.waitForSelector('.meta', { timeout: 30000 })

    const regression = await collectTooltipRegression(page)
    const screenshot = '/tmp/vue2-cli-link-tooltip-streaming.png'
    await page.screenshot({ path: screenshot, fullPage: true })
    await browser.close()

    const result = {
      url,
      ...regression,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      screenshot,
    }

    console.log(JSON.stringify(result, null, 2))

    if (result.hiddenSamples > 0)
      throw new Error(`Tooltip became hidden during streaming (${result.hiddenSamples} hidden samples).`)
    if (result.wrongTextSamples > 0)
      throw new Error(`Tooltip content got stuck or stale during streaming (${result.wrongTextSamples} wrong-text samples).`)
    if (result.finalProgress !== 100)
      throw new Error(`Streaming did not finish while tooltip was monitored (ended at ${result.finalProgress ?? 'n/a'}%).`)
    if (result.consoleErrorCount > 0 || result.pageErrorCount > 0)
      throw new Error(`Unexpected browser errors: console=${result.consoleErrorCount}, page=${result.pageErrorCount}`)
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
