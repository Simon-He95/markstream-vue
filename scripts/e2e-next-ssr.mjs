#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const markstreamReactDir = path.join(repoRoot, 'packages/markstream-react')
const host = '127.0.0.1'

const EXPORT_NAMES = [
  'NodeRenderer',
  'AdmonitionNode',
  'BlockquoteNode',
  'CheckboxNode',
  'CodeBlockNode',
  'ReactCodeBlockNode',
  'PreCodeNode',
  'D2BlockNode',
  'MermaidBlockNode',
  'InfographicBlockNode',
  'DefinitionListNode',
  'EmojiNode',
  'EmphasisNode',
  'StrongNode',
  'StrikethroughNode',
  'HighlightNode',
  'InsertNode',
  'SubscriptNode',
  'SuperscriptNode',
  'FootnoteNode',
  'FootnoteReferenceNode',
  'FootnoteAnchorNode',
  'HardBreakNode',
  'HeadingNode',
  'ParagraphNode',
  'HtmlBlockNode',
  'HtmlInlineNode',
  'ImageNode',
  'InlineCodeNode',
  'LinkNode',
  'ListItemNode',
  'ListNode',
  'MathBlockNode',
  'MathInlineNode',
  'ReferenceNode',
  'TableNode',
  'TextNode',
  'ThematicBreakNode',
  'Tooltip',
  'HtmlPreviewFrame',
  'VmrContainerNode',
  'FallbackComponent',
]

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const current = argv[i]
    const next = argv[i + 1]
    if (current === '--playground' && next) {
      args.playground = next
      i++
    }
    else if (current === '--version' && next) {
      args.version = next
      i++
    }
  }
  if (!args.playground || !args.version)
    throw new Error('Usage: node scripts/e2e-next-ssr.mjs --playground <dir> --version <next14|next15>')
  return args
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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

async function findFreePort(start = 3400, end = 3499) {
  for (let port = start; port <= end; port++) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, timeout = 120000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (await isPortOpen(port))
      return
    await sleep(200)
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

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    const append = (chunk) => {
      output += String(chunk)
      if (output.length > 12000)
        output = output.slice(output.length - 12000)
    }

    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0)
        resolve(output)
      else
        reject(new Error(`Command failed: ${command} ${args.join(' ')}\n${output}`))
    })
  })
}

function syncMarkstreamReactPeers(playgroundDir) {
  const peerNames = ['react', 'react-dom']
  const originalLinks = []

  for (const peerName of peerNames) {
    const packagePeerPath = path.join(markstreamReactDir, 'node_modules', peerName)
    const playgroundPeerPath = path.join(playgroundDir, 'node_modules', peerName)
    if (!existsSync(playgroundPeerPath))
      throw new Error(`Missing ${peerName} in ${playgroundDir}`)

    const stats = lstatSync(packagePeerPath)
    if (!stats.isSymbolicLink())
      throw new Error(`Expected ${packagePeerPath} to be a symlink`)

    originalLinks.push({
      packagePeerPath,
      originalTarget: readlinkSync(packagePeerPath),
    })

    rmSync(packagePeerPath, { force: true, recursive: true })
    symlinkSync(playgroundPeerPath, packagePeerPath, 'dir')
  }

  return () => {
    for (const { packagePeerPath, originalTarget } of originalLinks) {
      rmSync(packagePeerPath, { force: true, recursive: true })
      symlinkSync(originalTarget, packagePeerPath, 'dir')
    }
  }
}

function startServer({ cwd, port, mode }) {
  const logBuffer = []
  const args = mode === 'dev'
    ? ['exec', 'next', 'dev', '--hostname', host, '--port', String(port)]
    : ['exec', 'next', 'start', '--hostname', host, '--port', String(port)]

  const child = spawn('pnpm', args, {
    cwd,
    env: {
      ...process.env,
      CI: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const appendLogs = (chunk) => {
    logBuffer.push(String(chunk))
    if (logBuffer.length > 200)
      logBuffer.splice(0, logBuffer.length - 200)
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

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return await response.text()
}

function assertIncludes(html, value, label) {
  if (!html.includes(value))
    throw new Error(`Missing ${label}: ${value}`)
}

function assertRawHtml(html, version, router) {
  assertIncludes(html, `data-ssr-version="${version}"`, 'version marker')
  assertIncludes(html, `data-ssr-router="${router}"`, 'router marker')

  const requiredPairs = [
    ['basic', 'next'],
    ['basic', 'server'],
    ['custom', 'next'],
    ['custom', 'server'],
    ['enhanced', 'next'],
    ['fallback', 'next'],
    ['fallback', 'server'],
    ['export-matrix', 'next'],
    ['server-export-matrix', 'server'],
    ['hydration', 'next'],
    ['hydration', 'server'],
  ]

  for (const [caseName, entryName] of requiredPairs) {
    assertIncludes(html, `data-ssr-case="${caseName}"`, `${caseName} case`)
    assertIncludes(html, `data-ssr-entry="${entryName}"`, `${entryName} entry`)
  }

  assertIncludes(html, 'Next Entry Basic', 'next basic heading')
  assertIncludes(html, 'Server Entry Basic', 'server basic heading')
  assertIncludes(html, 'data-ssr-custom-id="next-primary"', 'next primary custom scope')
  assertIncludes(html, 'data-ssr-custom-id="next-alt"', 'next alternate custom scope')
  assertIncludes(html, 'data-ssr-custom-id="server-primary"', 'server primary custom scope')
  assertIncludes(html, 'data-ssr-custom-id="server-alt"', 'server alternate custom scope')
  assertIncludes(html, 'data-ssr-status="next-paragraph-override"', 'next custom paragraph')
  assertIncludes(html, 'data-ssr-status="next-paragraph-alt"', 'next alternate custom paragraph')
  assertIncludes(html, 'data-ssr-status="server-paragraph-override"', 'server custom paragraph')
  assertIncludes(html, 'data-ssr-status="server-paragraph-alt"', 'server alternate custom paragraph')
  assertIncludes(html, 'data-ssr-status="next-custom-node-children"', 'next custom node children')
  assertIncludes(html, 'data-ssr-status="server-custom-node-children"', 'server custom node children')
  assertIncludes(html, 'Next custom child body', 'next custom child body')
  assertIncludes(html, 'Server custom child body', 'server custom child body')
  assertIncludes(html, 'data-ssr-status="next-thinking-tag"', 'next custom tag')
  assertIncludes(html, 'data-ssr-status="next-thinking-tag-alt"', 'next alternate custom tag')
  assertIncludes(html, 'data-ssr-status="server-thinking-tag"', 'server custom tag')
  assertIncludes(html, 'data-ssr-status="server-thinking-tag-alt"', 'server alternate custom tag')
  assertIncludes(html, 'data-ssr-tone="calm"', 'custom tag attrs')
  assertIncludes(html, 'data-ssr-scope="next-primary"', 'next custom tag scope')
  assertIncludes(html, 'data-ssr-scope="server-primary"', 'server custom tag scope')
  assertIncludes(html, 'data-ssr-fallback="code-block"', 'code fallback')
  assertIncludes(html, 'data-ssr-fallback="markdown-code-block"', 'markdown code fallback')
  assertIncludes(html, 'data-ssr-fallback="mermaid"', 'mermaid fallback')
  assertIncludes(html, 'data-ssr-fallback="d2"', 'd2 fallback')
  assertIncludes(html, 'data-ssr-fallback="infographic"', 'infographic fallback')

  for (const name of EXPORT_NAMES)
    assertIncludes(html, `data-ssr-export="${name}"`, `${name} export marker`)
}

function assertDirectMapsHtml(html) {
  assertIncludes(html, 'data-next-direct-map="page"', 'direct map page')
  assertIncludes(html, 'data-next-direct-map="streaming"', 'direct streaming map')
  assertIncludes(html, 'data-next-direct-map-id="app-router"', 'direct streaming attrs')
  assertIncludes(html, 'Streaming Map', 'direct streaming text')
  assertIncludes(html, 'data-next-direct-map="html"', 'direct html map')
  assertIncludes(html, 'data-next-direct-map-tone="warm"', 'direct html attrs')
  assertIncludes(html, 'HTML Map', 'direct html text')
}

async function waitForHydration(page, route) {
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-ssr-case="hydration"][data-ssr-entry="next"][data-ssr-status="enhanced"]', { timeout: 90000 })
  await page.waitForSelector('[data-ssr-case="hydration"][data-ssr-entry="server"][data-ssr-status="fallback-stable"]', { timeout: 90000 })
}

async function assertHydratedUi(page) {
  const nextEnhanced = page.locator('[data-ssr-case="enhanced"][data-ssr-entry="next"]')
  const nextCustomPrimary = page.locator('[data-ssr-case="custom"][data-ssr-entry="next"] [data-ssr-custom-id="next-primary"]')
  const nextCustomAlt = page.locator('[data-ssr-case="custom"][data-ssr-entry="next"] [data-ssr-custom-id="next-alt"]')
  const serverCustomPrimary = page.locator('[data-ssr-case="custom"][data-ssr-entry="server"] [data-ssr-custom-id="server-primary"]')
  const serverCustomAlt = page.locator('[data-ssr-case="custom"][data-ssr-entry="server"] [data-ssr-custom-id="server-alt"]')
  const exportCount = await page.locator('[data-ssr-case="export-matrix"] [data-ssr-export]').count()
  if (exportCount !== EXPORT_NAMES.length)
    throw new Error(`Expected ${EXPORT_NAMES.length} next export markers, received ${exportCount}`)

  const serverExportCount = await page.locator('[data-ssr-case="server-export-matrix"] [data-ssr-export]').count()
  if (serverExportCount !== EXPORT_NAMES.length)
    throw new Error(`Expected ${EXPORT_NAMES.length} server export markers, received ${serverExportCount}`)

  const codeEnhanced = await nextEnhanced.locator('[data-ssr-demo="code"] .monaco-editor, [data-ssr-demo="code"] .code-editor-fallback-surface').count()
  if (codeEnhanced === 0)
    throw new Error('Code block did not enhance to the client shell')

  if (!await nextEnhanced.locator('[data-ssr-demo="math"] .katex').first().isVisible())
    throw new Error('Math block did not enhance to KaTeX')

  const mermaidShellCount = await nextEnhanced.locator('[data-ssr-demo="mermaid"] .mermaid-block').count()
  const mermaidFallbackCount = await nextEnhanced.locator('[data-ssr-demo="mermaid"] [data-ssr-fallback="mermaid"]').count()
  if (mermaidShellCount === 0 || mermaidFallbackCount > 0)
    throw new Error('Mermaid block did not switch to the client shell')

  const fallbackCount = await page.locator('[data-ssr-case="fallback"][data-ssr-entry="server"] [data-ssr-fallback]').count()
  if (fallbackCount < 3)
    throw new Error(`Expected stable server fallback markers, received ${fallbackCount}`)

  if (!await nextCustomPrimary.locator('[data-ssr-status="next-custom-node-children"]').first().isVisible())
    throw new Error('Next custom node children did not render in the primary custom scope')

  if (!await nextCustomPrimary.locator('[data-ssr-status="next-thinking-tag"][data-ssr-tone="calm"][data-ssr-scope="next-primary"]').first().isVisible())
    throw new Error('Next custom tag attrs did not render in the primary custom scope')

  if (await nextCustomPrimary.locator('[data-ssr-status="next-paragraph-alt"]').count() > 0)
    throw new Error('Next primary custom scope leaked alternate overrides')

  if (await nextCustomAlt.locator('[data-ssr-status="next-paragraph-override"]').count() > 0)
    throw new Error('Next alternate custom scope leaked primary overrides')

  if (!await serverCustomPrimary.locator('[data-ssr-status="server-custom-node-children"]').first().isVisible())
    throw new Error('Server custom node children did not render in the primary custom scope')

  if (!await serverCustomPrimary.locator('[data-ssr-status="server-thinking-tag"][data-ssr-tone="calm"][data-ssr-scope="server-primary"]').first().isVisible())
    throw new Error('Server custom tag attrs did not render in the primary custom scope')

  if (await serverCustomPrimary.locator('[data-ssr-status="server-paragraph-alt"]').count() > 0)
    throw new Error('Server primary custom scope leaked alternate overrides')

  if (await serverCustomAlt.locator('[data-ssr-status="server-paragraph-override"]').count() > 0)
    throw new Error('Server alternate custom scope leaked primary overrides')
}

async function runBrowserChecks(baseUrl) {
  const browser = await chromium.launch(resolveChromeLaunchOptions())
  const page = await browser.newPage()
  const browserErrors = []
  const shouldIgnoreBrowserError = text =>
    text.includes('An empty string ("") was passed to the')
    && text.includes('attribute')
    && text.includes('src')

  page.on('pageerror', (error) => {
    browserErrors.push(`pageerror: ${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error' && !shouldIgnoreBrowserError(message.text()))
      browserErrors.push(`console: ${message.text()}`)
  })

  try {
    const appRoute = `${baseUrl}/app-ssr-lab`
    const pagesRoute = `${baseUrl}/pages-ssr-lab`

    await waitForHydration(page, appRoute)
    await assertHydratedUi(page)

    await waitForHydration(page, pagesRoute)
    await assertHydratedUi(page)

    await page.goto(`${baseUrl}/direct-maps`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-next-direct-map="streaming"][data-next-direct-map-id="app-router"]', { timeout: 90000 })
    await page.waitForSelector('[data-next-direct-map="html"][data-next-direct-map-tone="warm"]', { timeout: 90000 })

    await waitForHydration(page, appRoute)
    await assertHydratedUi(page)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-ssr-case="hydration"][data-ssr-entry="next"][data-ssr-status="enhanced"]', { timeout: 90000 })

    if (browserErrors.length > 0)
      throw new Error(browserErrors.join('\n'))
  }
  finally {
    await browser.close()
  }
}

async function runMode({ playgroundDir, version, mode }) {
  const port = await findFreePort(mode === 'dev' ? 3400 : 3500, mode === 'dev' ? 3499 : 3599)
  const baseUrl = `http://${host}:${port}`
  const server = startServer({ cwd: playgroundDir, port, mode })

  try {
    await waitForPort(port)
    await sleep(mode === 'dev' ? 2500 : 1500)

    const appHtml = await fetchText(`${baseUrl}/app-ssr-lab`)
    const pagesHtml = await fetchText(`${baseUrl}/pages-ssr-lab`)
    const directMapsHtml = await fetchText(`${baseUrl}/direct-maps`)
    assertRawHtml(appHtml, version, 'app')
    assertRawHtml(pagesHtml, version, 'pages')
    assertDirectMapsHtml(directMapsHtml)
    await runBrowserChecks(baseUrl)
  }
  catch (error) {
    throw new Error(`${String(error instanceof Error ? error.message : error)}\n\nServer logs:\n${server.getLogs()}`)
  }
  finally {
    killProcessTree(server.child)
  }
}

async function main() {
  const { playground, version } = parseArgs(process.argv)
  const playgroundDir = path.join(repoRoot, playground)
  const restorePeers = syncMarkstreamReactPeers(playgroundDir)

  try {
    console.log(`[next-ssr] preparing ${version} at ${playground}`)
    await runCommand('pnpm', ['run', 'build:parser'], repoRoot)
    await runCommand('pnpm', ['--filter', 'markstream-react', 'build'], repoRoot)

    console.log(`[next-ssr] ${version} dev`)
    await runMode({ playgroundDir, version, mode: 'dev' })

    console.log(`[next-ssr] ${version} build`)
    await runCommand('pnpm', ['exec', 'next', 'build'], playgroundDir)

    console.log(`[next-ssr] ${version} start`)
    await runMode({ playgroundDir, version, mode: 'prod' })

    console.log(`[next-ssr] ${version} passed`)
  }
  finally {
    restorePeers()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
