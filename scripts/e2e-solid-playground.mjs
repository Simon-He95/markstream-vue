#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const playgroundDir = path.join(repoRoot, 'playground-solid')
const playgroundDist = path.join(playgroundDir, 'dist', 'index.html')
const host = '127.0.0.1'
const screenshotPath = process.env.SOLID_E2E_SCREENSHOT || path.join(repoRoot, 'solid-playground-e2e.png')
const logPath = process.env.SOLID_E2E_LOG || path.join(repoRoot, 'solid-playground-e2e.json')

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

async function findFreePort(start = 4177, end = 4210) {
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

async function readShadowCodeText(page, block) {
  return block.evaluate((element) => {
    const collect = (root) => {
      if (!root)
        return ''
      const nodes = root.querySelectorAll('pre, code, [data-line], .view-line')
      const parts = []
      for (const node of nodes) {
        if (node.classList?.contains('pre-code-node__line-numbers') || node.getAttribute?.('data-line-number'))
          continue
        const text = node.textContent || ''
        if (text.trim())
          parts.push(text)
      }
      return parts.join('\n')
    }
    const diffs = element.querySelector('diffs-container')
    const shadowText = collect(diffs?.shadowRoot)
    if (shadowText.trim())
      return shadowText
    const pre = element.querySelector('.pre-code-node pre, .pre-code-node code, pre code, pre')
    return pre?.textContent || ''
  })
}

async function main() {
  if (!existsSync(playgroundDist))
    throw new Error('Solid playground is not built. Run `pnpm play:solid:build` first.')

  const port = await findFreePort()
  const server = startPreviewServer(port)
  let browser

  try {
    await waitForPort(port)
    try {
      browser = await chromium.launch(resolveChromeLaunchOptions())
    }
    catch (error) {
      const message = `Solid playground browser launcher could not start: ${error instanceof Error ? error.message : error}`
      writeFileSync(logPath, JSON.stringify({ unavailable: true, message }, null, 2))
      throw new Error(message)
    }

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
      localStorage.setItem('vmr-settings-stream-chunk-size-min', '24')
      localStorage.setItem('vmr-settings-stream-chunk-size-max', '24')
      localStorage.setItem('vmr-settings-stream-burstiness', '0')
      localStorage.setItem('vmr-settings-stream-transport-mode', 'scheduler')
    })

    const url = `http://${host}:${port}/`
    for (const visit of [1, 2]) {
      errors.length = 0
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'markstream-solid' }).waitFor()
      const renderer = page.locator('.chatbot-renderer-shell > .markstream-solid')
      await renderer.waitFor()
      await page.waitForFunction(() => {
        const node = document.querySelector('.chatbot-renderer-shell > .markstream-solid')
        const box = node?.getBoundingClientRect()
        return Boolean(node && (node.textContent?.length ?? 0) > 80 && box && box.height > 80 && box.width > 80)
      }, undefined, { timeout: 30000 })
      assert(errors.length === 0, `Visit ${visit} had page errors: ${errors.join(' | ')}`)
    }

    await page.locator('[data-demo-chip="diagrams"]').click()
    await page.waitForFunction(() => {
      return document.querySelector('[data-obs-demo]')?.textContent === 'diagrams'
    })
    await page.locator('[data-stream-start]').click()
    await page.waitForFunction(() => {
      const mermaid = document.querySelector('.mermaid-render svg, [data-markstream-mermaid] svg, .markstream-solid-enhanced-block--mermaid svg')
      const d2 = document.querySelector('.d2-svg svg, [data-markstream-d2] svg, .markstream-solid-enhanced-block--d2 svg')
      const info = document.querySelector('.infographic-render svg, [data-markstream-infographic] svg, .markstream-solid-enhanced-block--infographic svg')
      return Boolean(mermaid && d2 && info)
    }, undefined, { timeout: 45000 })

    await page.locator('[data-stream-reset]').click()
    await page.locator('[data-stream-start]').click()
    await page.waitForFunction(() => {
      const mermaid = document.querySelector('.mermaid-render svg, [data-markstream-mermaid] svg, .markstream-solid-enhanced-block--mermaid svg')
      const d2 = document.querySelector('.d2-svg svg, [data-markstream-d2] svg, .markstream-solid-enhanced-block--d2 svg')
      const info = document.querySelector('.infographic-render svg, [data-markstream-infographic] svg, .markstream-solid-enhanced-block--infographic svg')
      return Boolean(mermaid && d2 && info)
    }, undefined, { timeout: 45000 })

    await page.locator('[data-demo-chip="code-identity"]').click()
    await page.waitForFunction(() => document.querySelector('[data-obs-demo]')?.textContent === 'code-identity')
    await page.waitForFunction(() => {
      return document.querySelector('[data-obs-streaming]')?.textContent === 'no'
        || document.querySelector('[data-obs-transport-complete]')?.textContent === 'true'
    }, undefined, { timeout: 20000 })
    const codeBlock = page.locator('[data-markstream-code-block="1"]').first()
    await codeBlock.waitFor()
    await codeBlock.evaluate((element) => {
      element.setAttribute('data-e2e-code-probe', '1')
    })
    const beforeText = await readShadowCodeText(page, codeBlock)
    assert(/line_01|table/.test(beforeText), `Shadow/code text did not include source (got: ${beforeText.slice(0, 200)})`)
    await page.locator('[data-append-code]').click()
    await page.waitForFunction(() => (document.body.textContent || '').includes('Appended line 1'))
    const sameShell = await page.locator('[data-markstream-code-block="1"][data-e2e-code-probe="1"]').count()
    assert(sameShell === 1, 'Ordinary append recreated the code-block DOM shell')
    await page.screenshot({ path: screenshotPath, fullPage: true })
    writeFileSync(logPath, JSON.stringify({
      unavailable: false,
      errors,
      screenshotPath,
    }, null, 2))
    console.log(`[e2e-solid-playground] passed; screenshot ${screenshotPath}`)
  }
  finally {
    await browser?.close()
    stopServer(server.child)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
