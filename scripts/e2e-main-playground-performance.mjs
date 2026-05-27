#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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

async function findFreePort(start = 4321, end = 4360) {
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
    if (process.platform !== 'win32' && child.pid)
      process.kill(-child.pid, 'SIGTERM')
    else
      child.kill('SIGTERM')
  }
  catch {}
  setTimeout(() => {
    try {
      if (process.platform !== 'win32' && child.pid)
        process.kill(-child.pid, 'SIGKILL')
      else if (!child.killed)
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

function writeJsonResult(result) {
  const json = `${JSON.stringify(result, null, 2)}\n`
  const outputPath = process.env.BENCHMARK_JSON_PATH
  if (!outputPath) {
    process.stdout.write(json)
    return
  }
  const resolvedPath = path.isAbsolute(outputPath) ? outputPath : path.resolve(repoRoot, outputPath)
  mkdirSync(path.dirname(resolvedPath), { recursive: true })
  writeFileSync(resolvedPath, json)
}

const parsePerformanceCounterKeys = [
  'parseCommitCount',
  'parseCoalescedCount',
  'streamCommitCount',
  'syncCommitCount',
]
const parsePerformanceTimingKeys = [
  'tokenCloneMs',
  'processTokensMs',
  'parseMarkdownToStructureTotalMs',
]
const parsePerformanceStreamCounterKeys = [
  'total',
  'cacheHits',
  'appendHits',
  'tailHits',
  'fullParses',
  'chunkedParses',
]
const tokenCloneTotalBudgetRatio = 0.35

function cloneParsePerformance(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value))
}

function diffNumber(after, before) {
  return Number(after || 0) - Number(before || 0)
}

function diffParsePerformance(after, before) {
  if (!after)
    return null
  if (!before)
    return cloneParsePerformance(after)

  const out = cloneParsePerformance(after)

  for (const key of parsePerformanceCounterKeys)
    out[key] = diffNumber(after[key], before[key])
  for (const key of parsePerformanceTimingKeys)
    out[key] = diffNumber(after[key], before[key])

  out.stream = {}
  for (const key of parsePerformanceStreamCounterKeys)
    out.stream[key] = diffNumber(after.stream?.[key], before.stream?.[key])

  out.streamModes = {}
  const streamModes = new Set([
    ...Object.keys(after.streamModes ?? {}),
    ...Object.keys(before.streamModes ?? {}),
  ])
  for (const key of streamModes)
    out.streamModes[key] = diffNumber(after.streamModes?.[key], before.streamModes?.[key])

  return out
}

function assertTokenCloneBudget(parsePerformance) {
  const tokenCloneMs = Number(parsePerformance?.tokenCloneMs ?? 0)
  const totalMs = Number(parsePerformance?.parseMarkdownToStructureTotalMs ?? 0)
  if (!(Number.isFinite(tokenCloneMs) && Number.isFinite(totalMs) && totalMs > 0))
    return

  if (tokenCloneMs > totalMs * tokenCloneTotalBudgetRatio) {
    throw new Error(
      `Replay token clone cost too high: ${tokenCloneMs}ms of ${totalMs}ms.`,
    )
  }
}

function startDevServer(port) {
  const logs = []
  const serverArgs = process.env.PLAYGROUND_PERFORMANCE_SERVER === 'preview'
    ? ['-C', playgroundDir, 'exec', 'vite', 'preview', '--host', host, '--port', String(port), '--strictPort']
    : ['-C', playgroundDir, 'exec', 'vite', '--host', host, '--port', String(port), '--strictPort']
  const child = spawn(
    'pnpm',
    serverArgs,
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
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
    getLogs() {
      return logs.join('')
    },
  }
}

async function waitForVisibleBlocksReady(page, rootSelector) {
  await page.waitForFunction((selector) => {
    const root = document.querySelector(selector)
    if (!root)
      return false
    const rootRect = root.getBoundingClientRect()
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      return rect.bottom > rootRect.top && rect.top < rootRect.bottom
    }
    const visibleCodeBlocks = Array.from(document.querySelectorAll('.code-block-container')).filter(isVisible)
    const visibleMermaids = Array.from(document.querySelectorAll('[data-markstream-mermaid="1"]')).filter(isVisible)
    const visibleInfographics = Array.from(document.querySelectorAll('[data-markstream-infographic="1"]')).filter(isVisible)
    const visibleD2Blocks = Array.from(document.querySelectorAll('[data-markstream-d2="1"]')).filter(isVisible)
    return visibleCodeBlocks.every(element => !element.querySelector('.code-fallback-plain, .code-pre-fallback'))
      && visibleMermaids.every(element => element.querySelector('svg'))
      && visibleInfographics.every(element => element.querySelector('svg'))
      && visibleD2Blocks.every(element => element.querySelector('.d2-svg svg'))
  }, rootSelector, { timeout: 30000 })
}

async function waitForAllD2Ready(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const d2Blocks = Array.from(document.querySelectorAll('[data-markstream-d2="1"]'))
    return d2Blocks.every(element => element.querySelector('.d2-svg svg'))
  }, null, { timeout })
}

async function scrollThroughRoot(page, rootSelector, stateName) {
  let maxScrollDriftPx = 0
  const activeScrollFrameDeltas = []
  while (true) {
    await waitForVisibleBlocksReady(page, rootSelector)
    const scrollFrameBaseline = await frameBaseline(page, stateName)
    const state = await page.evaluate((selector) => {
      const root = document.querySelector(selector)
      if (!root)
        return { done: true, nextScrollTop: 0 }
      root.style.scrollBehavior = 'auto'
      const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight)
      const step = Math.max(320, Math.round(root.clientHeight * 0.85))
      const nextScrollTop = Math.min(maxScrollTop, root.scrollTop + step)
      const done = nextScrollTop <= root.scrollTop + 1
      if (!done)
        root.scrollTop = nextScrollTop
      return { done, nextScrollTop }
    }, rootSelector)
    if (state.done)
      break
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    activeScrollFrameDeltas.push(...await frameDeltasSince(page, stateName, scrollFrameBaseline))
    await page.waitForTimeout(180)
    const driftPx = await page.evaluate(({ selector, expectedScrollTop }) => {
      const root = document.querySelector(selector)
      return root ? Math.abs(root.scrollTop - expectedScrollTop) : 0
    }, { selector: rootSelector, expectedScrollTop: state.nextScrollTop })
    maxScrollDriftPx = Math.max(maxScrollDriftPx, Number(driftPx || 0))
  }
  await waitForVisibleBlocksReady(page, rootSelector)
  return {
    maxScrollDriftPx,
    scrollFrameStats: frameStatsFromDeltas(activeScrollFrameDeltas),
  }
}

async function readUsedHeapBytes(page) {
  return await page.evaluate(() => {
    const memory = performance.memory
    return memory && typeof memory.usedJSHeapSize === 'number'
      ? memory.usedJSHeapSize
      : null
  })
}

async function measureAfterRendererUnmount(page) {
  await page.evaluate(async () => {
    const unmount = window.__markstreamBenchmarkUnmount
    if (typeof unmount !== 'function')
      throw new Error('Benchmark renderer unmount hook is not available.')
    unmount()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  if (typeof page.requestGC === 'function')
    await page.requestGC()
  await page.waitForTimeout(100)
  return await readUsedHeapBytes(page)
}

async function frameBaseline(page, stateName) {
  return await page.evaluate((key) => {
    const state = window[key] ?? {}
    return Array.isArray(state.frameDeltas) ? state.frameDeltas.length : 0
  }, stateName)
}

async function frameDeltasSince(page, stateName, baseline) {
  return await page.evaluate(({ key, baseline }) => {
    const state = window[key] ?? {}
    return Array.isArray(state.frameDeltas)
      ? state.frameDeltas.slice(Number(baseline || 0)).map(Number).filter(Number.isFinite)
      : []
  }, { key: stateName, baseline })
}

function frameStatsFromDeltas(frameDeltas) {
  const sortedFrameDeltas = [...frameDeltas].sort((a, b) => a - b)
  const frameP95Index = sortedFrameDeltas.length
    ? Math.min(sortedFrameDeltas.length - 1, Math.ceil(sortedFrameDeltas.length * 0.95) - 1)
    : -1
  return {
    frameSampleCount: frameDeltas.length,
    frameP95Ms: frameP95Index >= 0 ? sortedFrameDeltas[frameP95Index] : 0,
    frameMaxMs: sortedFrameDeltas.length ? sortedFrameDeltas[sortedFrameDeltas.length - 1] : 0,
  }
}

async function frameStatsSince(page, stateName, baseline) {
  return frameStatsFromDeltas(await frameDeltasSince(page, stateName, baseline))
}

async function collectMetrics(page) {
  const rootSelector = '.chatbot-messages'
  await page.goto('/?benchmark=1', { waitUntil: 'load' })
  const initialFrameBaseline = await frameBaseline(page, '__mainPlaygroundPerf')
  await page.locator('.playground-root').waitFor({ state: 'visible', timeout: 15000 })
  await waitForVisibleBlocksReady(page, rootSelector)
  await page.waitForTimeout(250)
  const initialFrameStats = await frameStatsSince(page, '__mainPlaygroundPerf', initialFrameBaseline)

  const initial = await page.evaluate((frameStats) => {
    const state = window.__mainPlaygroundPerf ?? {}
    const longTasks = Array.isArray(state.longTasks) ? state.longTasks : []
    const mermaids = Array.from(document.querySelectorAll('[data-markstream-mermaid="1"]'))
    const infographics = Array.from(document.querySelectorAll('[data-markstream-infographic="1"]'))
    const d2Blocks = Array.from(document.querySelectorAll('[data-markstream-d2="1"]'))
    const root = document.querySelector('.chatbot-messages')
    const rootRect = root?.getBoundingClientRect()
    const isVisible = (element) => {
      if (!rootRect)
        return false
      const rect = element.getBoundingClientRect()
      return rect.bottom > rootRect.top && rect.top < rootRect.bottom
    }
    const visibleMermaids = mermaids.filter(isVisible)
    const visibleInfographics = infographics.filter(isVisible)
    const visibleD2Blocks = d2Blocks.filter(isVisible)
    const visibleCodeBlocks = Array.from(document.querySelectorAll('.code-block-container')).filter(isVisible)
    return {
      lcpMs: Number(state.lcpMs ?? 0),
      lcpElement: state.lcpElement ?? null,
      cls: Number(state.cls ?? 0),
      firstPaintMs: Number(state.paints?.paint ?? 0),
      firstContentfulPaintMs: Number(state.paints?.['first-contentful-paint'] ?? 0),
      longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce((sum, duration) => sum + Number(duration || 0), 0),
      longTaskMaxMs: longTasks.length ? Math.max(...longTasks) : 0,
      ...frameStats,
      settleTimeMs: performance.now() - Number(state.startedAt ?? 0),
      pageDomNodeCount: document.querySelectorAll('*').length,
      rendererDomNodeCount: root ? root.querySelectorAll('*').length : 0,
      jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
      codeBlockCount: document.querySelectorAll('.code-block-container').length,
      fallbackCount: document.querySelectorAll('.code-fallback-plain, .code-pre-fallback').length,
      visibleCodeBlockCount: visibleCodeBlocks.length,
      visibleFallbackCount: visibleCodeBlocks.filter(element => element.querySelector('.code-fallback-plain, .code-pre-fallback')).length,
      mermaidCount: mermaids.length,
      renderedMermaidCount: mermaids.filter(element => element.querySelector('svg')).length,
      visibleMermaidCount: visibleMermaids.length,
      visibleRenderedMermaidCount: visibleMermaids.filter(element => element.querySelector('svg')).length,
      infographicCount: infographics.length,
      renderedInfographicCount: infographics.filter(element => element.querySelector('svg')).length,
      visibleInfographicCount: visibleInfographics.length,
      visibleRenderedInfographicCount: visibleInfographics.filter(element => element.querySelector('svg')).length,
      d2Count: d2Blocks.length,
      renderedD2Count: d2Blocks.filter(element => element.querySelector('.d2-svg svg')).length,
      visibleD2Count: visibleD2Blocks.length,
      visibleRenderedD2Count: visibleD2Blocks.filter(element => element.querySelector('.d2-svg svg')).length,
      parsePerformance: state.parsePerformance ?? null,
      topLayoutShifts: Array.isArray(state.layoutShifts)
        ? [...state.layoutShifts]
            .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0))
            .slice(0, 5)
        : [],
    }
  }, initialFrameStats)
  initial.parsePerformance = cloneParsePerformance(initial.parsePerformance)
  const fullScrollParsePerformanceBaseline = cloneParsePerformance(initial.parsePerformance)

  const scrollMetrics = await scrollThroughRoot(page, rootSelector, '__mainPlaygroundPerf')
  const heavySettleFrameBaseline = await frameBaseline(page, '__mainPlaygroundPerf')
  await waitForAllD2Ready(page)
  await page.waitForTimeout(250)
  const heavySettleFrameStats = await frameStatsSince(page, '__mainPlaygroundPerf', heavySettleFrameBaseline)

  const fullScroll = await page.evaluate((frameStats) => {
    const state = window.__mainPlaygroundPerf ?? {}
    const longTasks = Array.isArray(state.longTasks) ? state.longTasks : []
    const mermaids = Array.from(document.querySelectorAll('[data-markstream-mermaid="1"]'))
    const infographics = Array.from(document.querySelectorAll('[data-markstream-infographic="1"]'))
    const d2Blocks = Array.from(document.querySelectorAll('[data-markstream-d2="1"]'))
    const root = document.querySelector('.chatbot-messages')
    return {
      settleTimeMs: performance.now() - Number(state.startedAt ?? 0),
      ...frameStats,
      pageDomNodeCount: document.querySelectorAll('*').length,
      rendererDomNodeCount: root ? root.querySelectorAll('*').length : 0,
      jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
      codeBlockCount: document.querySelectorAll('.code-block-container').length,
      fallbackCount: document.querySelectorAll('.code-fallback-plain, .code-pre-fallback').length,
      mermaidCount: mermaids.length,
      renderedMermaidCount: mermaids.filter(element => element.querySelector('svg')).length,
      infographicCount: infographics.length,
      renderedInfographicCount: infographics.filter(element => element.querySelector('svg')).length,
      d2Count: d2Blocks.length,
      renderedD2Count: d2Blocks.filter(element => element.querySelector('.d2-svg svg')).length,
      longTaskTotalMs: longTasks.reduce((sum, duration) => sum + Number(duration || 0), 0),
      parsePerformance: state.parsePerformance ?? null,
      scrollDriftPx: null,
    }
  }, {
    scrollFrameSampleCount: scrollMetrics.scrollFrameStats.frameSampleCount,
    scrollFrameP95Ms: scrollMetrics.scrollFrameStats.frameP95Ms,
    scrollFrameMaxMs: scrollMetrics.scrollFrameStats.frameMaxMs,
    heavySettleFrameSampleCount: heavySettleFrameStats.frameSampleCount,
    heavySettleFrameP95Ms: heavySettleFrameStats.frameP95Ms,
    heavySettleFrameMaxMs: heavySettleFrameStats.frameMaxMs,
  })
  fullScroll.parsePerformance = diffParsePerformance(
    fullScroll.parsePerformance,
    fullScrollParsePerformanceBaseline,
  )
  fullScroll.scrollDriftPx = scrollMetrics.maxScrollDriftPx

  const replayButton = page.locator('button.nav-btn--stream')
  await replayButton.waitFor({ state: 'visible', timeout: 5000 })
  if ((await replayButton.textContent())?.includes('Pause')) {
    await replayButton.click()
    await page.waitForFunction(() => {
      const button = document.querySelector('button.nav-btn--stream')
      return button?.textContent?.includes('Resume')
    }, null, { timeout: 5000 })
  }
  const replayParsePerformanceBaseline = await page.evaluate(() => {
    const state = window.__mainPlaygroundPerf
    if (!state)
      return null

    state.replayStartedAt = performance.now()
    state.replayLongTaskCountBaseline = state.longTasks.length
    state.replayLongTaskTotalBaseline = state.longTasks.reduce((sum, duration) => sum + Number(duration || 0), 0)
    state.replayFrameCountBaseline = Array.isArray(state.frameDeltas) ? state.frameDeltas.length : 0
    state.replayParsePerformanceBaseline = state.parsePerformance == null
      ? null
      : JSON.parse(JSON.stringify(state.parsePerformance))
    return state.replayParsePerformanceBaseline
  })
  await page.locator('button.nav-btn--stream').click()
  await waitForVisibleBlocksReady(page, rootSelector)
  await page.waitForTimeout(250)

  const replay = await page.evaluate(() => {
    const state = window.__mainPlaygroundPerf ?? {}
    const longTasks = Array.isArray(state.longTasks) ? state.longTasks : []
    const root = document.querySelector('.chatbot-messages')
    const totalLongTaskMs = longTasks.reduce((sum, duration) => sum + Number(duration || 0), 0)
    const frameDeltas = Array.isArray(state.frameDeltas)
      ? state.frameDeltas.slice(Number(state.replayFrameCountBaseline ?? 0)).map(Number).filter(Number.isFinite)
      : []
    const sortedFrameDeltas = [...frameDeltas].sort((a, b) => a - b)
    const frameP95Index = sortedFrameDeltas.length
      ? Math.min(sortedFrameDeltas.length - 1, Math.ceil(sortedFrameDeltas.length * 0.95) - 1)
      : -1
    return {
      settleTimeMs: performance.now() - Number(state.replayStartedAt ?? performance.now()),
      longTaskCount: longTasks.length - Number(state.replayLongTaskCountBaseline ?? 0),
      longTaskTotalMs: totalLongTaskMs - Number(state.replayLongTaskTotalBaseline ?? 0),
      frameSampleCount: frameDeltas.length,
      frameP95Ms: frameP95Index >= 0 ? sortedFrameDeltas[frameP95Index] : 0,
      frameMaxMs: sortedFrameDeltas.length ? sortedFrameDeltas[sortedFrameDeltas.length - 1] : 0,
      pageDomNodeCount: document.querySelectorAll('*').length,
      rendererDomNodeCount: root ? root.querySelectorAll('*').length : 0,
      jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
      parsePerformance: state.parsePerformance ?? null,
    }
  })
  replay.parsePerformance = diffParsePerformance(
    replay.parsePerformance,
    replayParsePerformanceBaseline,
  )

  const memoryBeforeUnmountBytes = await readUsedHeapBytes(page)
  const memoryAfterUnmountBytes = await measureAfterRendererUnmount(page)

  return { initial, fullScroll, replay, memoryBeforeUnmountBytes, memoryAfterUnmountBytes }
}

function assertScenario(result) {
  if (!(result.initial.visibleFallbackCount === 0))
    throw new Error(`Visible code block fallbacks should be gone after initial settle. Got ${result.initial.visibleFallbackCount}.`)
  const visibleHeavyBlockCount = result.initial.visibleMermaidCount + result.initial.visibleInfographicCount + result.initial.visibleD2Count
  if (visibleHeavyBlockCount > 0) {
    if (result.initial.visibleRenderedMermaidCount !== result.initial.visibleMermaidCount)
      throw new Error('Visible mermaid blocks should finish in preview mode after initial settle.')
    if (result.initial.visibleRenderedInfographicCount !== result.initial.visibleInfographicCount)
      throw new Error('Visible infographic blocks should finish after initial settle.')
    if (result.initial.visibleRenderedD2Count !== result.initial.visibleD2Count)
      throw new Error('Visible D2 blocks should finish after initial settle.')
  }
  if (!(result.initial.lcpMs > 0))
    throw new Error('Expected a positive LCP measurement.')
  if (!(result.initial.lcpMs <= 4000))
    throw new Error(`LCP should stay within 4000ms. Got ${result.initial.lcpMs}.`)
  if (!(result.initial.cls <= 0.05))
    throw new Error(`CLS should stay within 0.05. Got ${result.initial.cls}.`)
  if (!(result.initial.longTaskMaxMs <= 500))
    throw new Error(`Max long task should stay within 500ms. Got ${result.initial.longTaskMaxMs}.`)
  if (!(result.initial.longTaskTotalMs <= 1400))
    throw new Error(`Total long task time should stay within 1400ms. Got ${result.initial.longTaskTotalMs}.`)
  if (!(result.initial.settleTimeMs <= 7000))
    throw new Error(`Initial settle should stay within 7000ms. Got ${result.initial.settleTimeMs}.`)
  if (!(result.initial.rendererDomNodeCount <= 5000))
    throw new Error(`Initial renderer DOM node count budget exceeded. Got ${result.initial.rendererDomNodeCount}.`)
  if (result.fullScroll.fallbackCount !== 0)
    throw new Error('Code block fallbacks should be gone after full scroll settle.')
  if (result.fullScroll.renderedMermaidCount !== result.fullScroll.mermaidCount)
    throw new Error('All mermaid blocks should finish after full scroll settle.')
  if (result.fullScroll.renderedInfographicCount !== result.fullScroll.infographicCount)
    throw new Error('All infographic blocks should finish after full scroll settle.')
  if (result.fullScroll.d2Count > 0 && result.fullScroll.renderedD2Count !== result.fullScroll.d2Count)
    throw new Error('All d2 blocks should finish after full scroll settle.')
  if (!(result.fullScroll.rendererDomNodeCount <= 5000))
    throw new Error(`Full-scroll renderer DOM node count budget exceeded. Got ${result.fullScroll.rendererDomNodeCount}.`)
  if (!(result.replay.settleTimeMs <= 5000))
    throw new Error(`Replay settle should stay within 5000ms. Got ${result.replay.settleTimeMs}.`)
  if (!(result.replay.rendererDomNodeCount <= 5000))
    throw new Error(`Replay renderer DOM node count budget exceeded. Got ${result.replay.rendererDomNodeCount}.`)
  const parsePerformance = result.replay.parsePerformance
  if (!parsePerformance || !(parsePerformance.parseCommitCount > 0))
    throw new Error('Replay should record Markdown parse commit metrics.')
  if (!(parsePerformance.streamCommitCount > 0))
    throw new Error('Replay should use stream parser commits.')
  if (!(parsePerformance.parseCoalescedCount >= 0))
    throw new Error('Replay should record the smooth-stream parse coalescing counter.')
  const stream = parsePerformance.stream ?? {}
  const warmFullParses = (result.initial.parsePerformance?.stream?.fullParses ?? 0)
    + (result.fullScroll.parsePerformance?.stream?.fullParses ?? 0)
    + (stream.fullParses ?? 0)
  if (!(warmFullParses >= 1))
    throw new Error(`Replay stream parser should have a full parse before or during replay. Got ${warmFullParses}.`)
  const streamHitCount = (stream.appendHits ?? 0) + (stream.tailHits ?? 0) + (stream.cacheHits ?? 0)
  if (!(streamHitCount > 0))
    throw new Error(`Replay stream parser should record append/tail/cache hits. Stream stats: ${JSON.stringify(stream)}.`)
  assertTokenCloneBudget(parsePerformance)
}

async function run() {
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort()
  const server = startDevServer(port)
  let result = null
  let browser = null
  const cleanup = () => killProcessTree(server.child)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)

  try {
    await waitForPort(port)
    browser = await chromium.launch(resolveChromeLaunchOptions())
    const warmupContext = await browser.newContext({
      viewport: { width: 1600, height: 1200 },
      baseURL: `http://${host}:${port}`,
    })
    const warmupPage = await warmupContext.newPage()
    await warmupPage.goto('/?benchmark=1', { waitUntil: 'load' })
    await warmupPage.locator('.playground-root').waitFor({ state: 'visible', timeout: 15000 })
    await warmupContext.close()
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1200 },
      baseURL: `http://${host}:${port}`,
    })
    await context.addInitScript(() => {
      const state = {
        startedAt: performance.now(),
        cls: 0,
        lcpMs: 0,
        lcpElement: null,
        longTasks: [],
        paints: {},
        layoutShifts: [],
        frameDeltas: [],
        lastFrameAt: 0,
        pauseEnabledSeen: false,
        parsePerformance: {
          parseCommitCount: 0,
          parseCoalescedCount: 0,
          streamCommitCount: 0,
          syncCommitCount: 0,
          tokenCloneMs: 0,
          processTokensMs: 0,
          parseMarkdownToStructureTotalMs: 0,
          stream: {
            total: 0,
            cacheHits: 0,
            appendHits: 0,
            tailHits: 0,
            fullParses: 0,
            chunkedParses: 0,
          },
          streamModes: {},
        },
      }

      window.__mainPlaygroundPerf = state

      const originalInfo = console.info.bind(console)
      const streamCounterKeys = ['total', 'cacheHits', 'appendHits', 'tailHits', 'fullParses', 'chunkedParses']
      const parseTimingKeys = ['tokenCloneMs', 'processTokensMs', 'parseMarkdownToStructureTotalMs']
      const parseCountersByRenderer = new Map()
      console.info = (...args) => {
        try {
          const label = args[0]
          if (label === '[markstream-vue][perf] parse(stream)' || label === '[markstream-vue][perf] parse(sync)') {
            const data = args[1] ?? {}
            const metrics = state.parsePerformance
            const rendererId = typeof data.rendererId === 'string'
              ? data.rendererId
              : '__default__'
            const previousCounters = parseCountersByRenderer.get(rendererId) ?? {
              parseCommitCount: 0,
              parseCoalescedCount: 0,
            }
            const parseCommitCount = Number(data.parseCommitCount || 0)
            const parseCoalescedCount = Number(data.parseCoalescedCount || 0)

            metrics.parseCommitCount += parseCommitCount >= previousCounters.parseCommitCount
              ? parseCommitCount - previousCounters.parseCommitCount
              : parseCommitCount
            metrics.parseCoalescedCount += parseCoalescedCount >= previousCounters.parseCoalescedCount
              ? parseCoalescedCount - previousCounters.parseCoalescedCount
              : parseCoalescedCount
            parseCountersByRenderer.set(rendererId, {
              parseCommitCount,
              parseCoalescedCount,
            })
            for (const key of parseTimingKeys)
              metrics[key] += Number(data[key] || 0)

            if (label === '[markstream-vue][perf] parse(stream)')
              metrics.streamCommitCount += 1
            else
              metrics.syncCommitCount += 1

            const delta = data.streamDelta
            if (delta && typeof delta === 'object') {
              for (const key of streamCounterKeys)
                metrics.stream[key] += Number(delta[key] || 0)
            }

            if (typeof data.streamMode === 'string')
              metrics.streamModes[data.streamMode] = (metrics.streamModes[data.streamMode] ?? 0) + 1
          }
        }
        catch {}
        originalInfo(...args)
      }

      const describeElement = (element) => {
        if (!element)
          return null
        const tag = element.tagName ? element.tagName.toLowerCase() : 'unknown'
        const id = element.id ? `#${element.id}` : ''
        const className = typeof element.className === 'string'
          ? element.className.trim().split(/\s+/).filter(Boolean).join('.')
          : ''
        return `${tag}${id}${className ? `.${className}` : ''}`
      }

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.startTime > state.lcpMs) {
              state.lcpMs = entry.startTime
              state.lcpElement = describeElement(entry.element)
            }
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true })
      }
      catch {}

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              state.cls += entry.value
              state.layoutShifts.push({
                value: entry.value,
                sources: Array.isArray(entry.sources)
                  ? entry.sources
                      .map(source => describeElement(source?.node))
                      .filter(Boolean)
                      .slice(0, 4)
                  : [],
              })
            }
          }
        }).observe({ type: 'layout-shift', buffered: true })
      }
      catch {}

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            state.longTasks.push(entry.duration)
        }).observe({ type: 'longtask', buffered: true })
      }
      catch {}

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            state.paints[entry.name] = entry.startTime
        }).observe({ type: 'paint', buffered: true })
      }
      catch {}

      try {
        const sampleFrame = (now) => {
          if (state.lastFrameAt > 0)
            state.frameDeltas.push(now - state.lastFrameAt)
          state.lastFrameAt = now
          if (state.frameDeltas.length < 2400)
            requestAnimationFrame(sampleFrame)
        }
        requestAnimationFrame(sampleFrame)
      }
      catch {}
    })

    const page = await context.newPage()
    result = await collectMetrics(page)
    assertScenario(result)
    writeJsonResult(result)

    await context.close()
    await browser.close()
    browser = null
  }
  catch (error) {
    console.error('[e2e-main-playground-performance] failed')
    console.error(error)
    if (result) {
      if (process.env.BENCHMARK_JSON_PATH)
        writeJsonResult(result)
      else
        console.error(JSON.stringify(result, null, 2))
    }
    console.error(server.getLogs())
    process.exitCode = 1
  }
  finally {
    if (browser) {
      try {
        await browser.close()
      }
      catch {}
    }
    cleanup()
  }
}

run()
