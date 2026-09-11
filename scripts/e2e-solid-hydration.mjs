#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const playgroundDir = path.join(repoRoot, 'playground-solid')
const hydrationDir = path.join(playgroundDir, 'hydration-dist')
const host = '127.0.0.1'
const screenshotPath = process.env.SOLID_HYDRATION_SCREENSHOT || path.join(repoRoot, 'solid-hydration-e2e.png')

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

async function findFreePort(start = 4188, end = 4210) {
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

function startStaticServer(port) {
  const child = spawn(
    process.execPath,
    ['-e', `
      import { createServer } from 'node:http'
      import { readFile } from 'node:fs/promises'
      import { extname, join } from 'node:path'
      const root = ${JSON.stringify(hydrationDir)}
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
      createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        const file = join(root, url.pathname === '/' ? 'index.html' : url.pathname)
        try {
          const body = await readFile(file)
          res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
          res.end(body)
        } catch {
          res.writeHead(404)
          res.end('not found')
        }
      }).listen(${port}, '127.0.0.1')
    `],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return child
}

function assert(condition, message) {
  if (!condition)
    throw new Error(message)
}

async function main() {
  if (!existsSync(path.join(hydrationDir, 'index.html'))) {
    const generated = spawnSync('pnpm', ['--filter', 'markstream-solid-playground', 'hydration:generate'], {
      cwd: repoRoot,
      stdio: 'inherit',
    })
    if (generated.status !== 0)
      throw new Error('hydration:generate failed')
  }

  const port = await findFreePort()
  const server = startStaticServer(port)
  let browser
  try {
    await waitForPort(port)
    try {
      browser = await chromium.launch(resolveChromeLaunchOptions())
    }
    catch (error) {
      throw new Error(`Solid hydration browser launcher could not start: ${error instanceof Error ? error.message : error}`)
    }
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error')
        errors.push(message.text())
    })
    await page.goto(`http://${host}:${port}/`, { waitUntil: 'networkidle' })
    await page.locator('[data-hydration-root]').waitFor()
    await page.getByRole('heading', { name: 'Server rendered Solid' }).waitFor()
    await page.locator('h1').evaluate(element => element.setAttribute('data-hydrate-probe', '1'))
    await page.locator('[data-hydration-append]').click()
    await page.waitForFunction(() => (document.body.textContent || '').includes('Client append after hydrate'))
    const sameHeading = await page.locator('h1[data-hydrate-probe="1"]').count()
    assert(sameHeading === 1, 'Hydration append replaced the server heading node')
    assert(errors.length === 0, `Hydration page errors: ${errors.join(' | ')}`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`[e2e-solid-hydration] passed; screenshot ${screenshotPath}`)
  }
  finally {
    await browser?.close()
    try {
      server.kill('SIGTERM')
    }
    catch {}
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
