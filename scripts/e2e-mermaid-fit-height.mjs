#!/usr/bin/env node

// Guards the *rendered* geometry of MermaidBlockNode's `fitPreviewHeight`, which
// the jsdom test cannot: jsdom has no layout and never applies the SFC styles, so
// asserting `container.style.height` only proves what the component wrote to the
// inline style, not what the browser lays out.
//
// The preview area carries `min-height: var(--ms-size-diagram-min-height)` (360px
// by default) in scoped CSS, and CSS `min-height` wins over an inline `height`.
// Without the inline override the box stays 360px tall around a ~77px diagram —
// the blank space the flag exists to remove — while every jsdom assertion passes.
//
// The diagram is deterministic (a stubbed mermaid loader renders a fixed
// 1440x220 svg into a 506px column), so the case does not depend on mermaid's
// layout engine or on network access.

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

// The diagram is ~77px tall (220 / 1440 * 506) and the fitted floor is 120px, so a
// box at or above the reservation (500px) or the CSS token (360px) is not fitted.
const FITTED_HEIGHT_CEILING = 160
const HOST_RESERVATION = 500

const PROBES = ['markdown-render', 'markdown-render-default']

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

async function findFreePort(start = 4200, end = 4240) {
  for (let port = start; port <= end; port++) {
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
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate))
      return { executablePath: candidate, headless: true }
  }

  return { channel: 'chrome', headless: true }
}

function startDevServer(port) {
  const logs = []
  const child = spawn(
    'pnpm',
    ['-C', playgroundDir, 'exec', 'vite', '--host', host, '--port', String(port), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } },
  )

  child.stdout.on('data', chunk => logs.push(String(chunk)))
  child.stderr.on('data', chunk => logs.push(String(chunk)))

  return { child, getLogs: () => logs.join('') }
}

function assertFitted(label, measured) {
  if (!measured)
    throw new Error(`[${label}] The preview area was never measured.`)

  const { box, diagram, inlineHeight, computedMinHeight, token } = measured

  if (!(diagram > 0))
    throw new Error(`[${label}] The diagram was never rendered.`)

  if (!(box <= FITTED_HEIGHT_CEILING)) {
    throw new Error(
      `[${label}] The preview box must fit the rendered diagram.\n`
      + `  diagram:             ${diagram.toFixed(1)}px\n`
      + `  box:                 ${box.toFixed(1)}px (expected <= ${FITTED_HEIGHT_CEILING}px)\n`
      + `  inline height:       ${inlineHeight || '(none)'}\n`
      + `  computed min-height: ${computedMinHeight}\n`
      + `  token:               ${token}\n`
      + '  The scoped `min-height: var(--ms-size-diagram-min-height)` overrides the fitted inline height.',
    )
  }

  // The case only means something while the CSS floor is actually in play: the
  // token must be present (360px) and the block must be overriding it. Without
  // this, the case could pass because the token vanished rather than because the
  // fit works.
  if (token !== '360px') {
    throw new Error(
      `[${label}] Expected the --ms-size-diagram-min-height token to be in scope (360px), got "${token}". `
      + 'The case is not exercising the CSS floor.',
    )
  }

  if (computedMinHeight !== '120px') {
    throw new Error(
      `[${label}] Expected the fitted floor to override the CSS token, got computed min-height "${computedMinHeight}".`,
    )
  }
}

async function run() {
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort()
  const server = startDevServer(port)
  const cleanup = () => killProcessTree(server.child)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)

  try {
    await waitForPort(port)
    const browser = await chromium.launch(resolveChromeLaunchOptions())
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    await page.goto(`http://${host}:${port}/mermaid-fit-height`, { waitUntil: 'load' })
    // Vite's dep optimizer can force a reload right after the first load, which
    // would drop the probe API mid-flight; wait for it explicitly.
    await page.waitForFunction(() => !!(window).__mermaidFitHeight, null, { timeout: 30000 })

    for (const probe of PROBES) {
      await page.evaluate(id => (window).__mermaidFitHeight.waitForPreview(id), probe)
      // The preview area animates `height` (transition-[height]), so waiting for the
      // svg alone catches the box mid-flight.
      await page.evaluate(id => (window).__mermaidFitHeight.waitForStableHeight(id), probe)
    }

    const measured = await page.evaluate(() => {
      const api = (window).__mermaidFitHeight
      return {
        fitted: api.measure('markdown-render'),
        reserved: api.measure('markdown-render-default'),
        bare: api.measure('bare-block'),
      }
    })

    console.log(JSON.stringify(measured, null, 2))

    // The case: on the real consumer path (MarkdownRender, library CSS loaded) the
    // box must fit the rendered diagram.
    assertFitted('markdown-render', measured.fitted)

    // The control pins the behaviour the flag is meant to change, so the case cannot
    // pass by the reservation disappearing on its own. It also pins that the CSS
    // token is left untouched when the flag is off.
    if (measured.reserved?.box !== HOST_RESERVATION) {
      throw new Error(
        `[markdown-render-default] Expected the ${HOST_RESERVATION}px host reservation to be held, got ${measured.reserved?.box}px.`,
      )
    }

    if (measured.reserved?.computedMinHeight !== '360px') {
      throw new Error(
        `[markdown-render-default] Expected the CSS token to stay in effect without the flag, got "${measured.reserved?.computedMinHeight}".`,
      )
    }

    await browser.close()
  }
  catch (error) {
    console.error('[e2e-mermaid-fit-height] failed')
    console.error(error)
    console.error(server.getLogs())
    process.exitCode = 1
  }
  finally {
    cleanup()
  }
}

run()
