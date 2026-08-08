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

async function findFreePort(start = 4250, end = 4290) {
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
const maxLayoutReadsPerFrame = Number(process.env.MARKSTREAM_BENCHMARK_MAX_LAYOUT_READS_PER_FRAME || 50)

function cloneParsePerformance(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value))
}

function normalizeLayoutReadPerformance(value) {
  if (!value || typeof value !== 'object')
    return null

  const byLabel = value.byLabel && typeof value.byLabel === 'object'
    ? Object.fromEntries(
        Object.entries(value.byLabel)
          .map(([key, count]) => [key, Number(count || 0)])
          .filter(([, count]) => count > 0)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      )
    : {}

  return {
    total: Number(value.total || 0),
    maxPerFrame: Math.max(Number(value.maxPerFrame || 0), Number(value.currentFrameTotal || 0)),
    byLabel,
  }
}

async function resetLayoutReadPerformance(page) {
  await page.evaluate(() => {
    window.__markstreamLayoutReadPerformance = {
      total: 0,
      maxPerFrame: 0,
      byLabel: {},
    }
  })
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

function assertLayoutReadBudget(mode, phase, layoutReads, options = {}) {
  if (!layoutReads)
    throw new Error(`[${mode}] ${phase} should record layout read metrics.`)

  if (options.requireReads && !(Number(layoutReads.total || 0) > 0))
    throw new Error(`[${mode}] ${phase} should record at least one layout read.`)

  const maxPerFrame = Number(layoutReads.maxPerFrame || 0)
  if (!(maxPerFrame <= maxLayoutReadsPerFrame)) {
    throw new Error(
      `[${mode}] ${phase} layout reads per frame exceeded ${maxLayoutReadsPerFrame}. Got ${maxPerFrame}.`,
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
      && visibleMermaids.every(element => Boolean(element.querySelector('svg')))
      && visibleInfographics.every(element => Boolean(element.querySelector('svg')))
      && visibleD2Blocks.every(element => Boolean(element.querySelector('.d2-svg svg')))
  }, rootSelector, { timeout: 60000 })
}

async function waitForAllD2Ready(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const d2Blocks = Array.from(document.querySelectorAll('[data-markstream-d2="1"]'))
    return d2Blocks.every(element => Boolean(element.querySelector('.d2-svg svg')))
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

async function runScenario(browser, port, mode) {
  const rootSelector = '.preview-surface'
  const sample = process.env.PLAYGROUND_SAMPLE || 'baseline'
  const benchmarkPath = '/test?benchmark=1'
  const warmupContext = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://${host}:${port}`,
          localStorage: [
            { name: 'vmr-test-sample', value: sample },
            { name: 'vmr-test-render-mode', value: mode },
          ],
        },
      ],
    },
  })
  const warmupPage = await warmupContext.newPage()
  await warmupPage.goto(`http://${host}:${port}${benchmarkPath}`, { waitUntil: 'load' })
  await warmupPage.locator('.workspace-card--preview').waitFor({ state: 'visible', timeout: 15000 })
  await warmupContext.close()

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://${host}:${port}`,
          localStorage: [
            { name: 'vmr-test-sample', value: sample },
            { name: 'vmr-test-render-mode', value: mode },
          ],
        },
      ],
    },
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

    window.__markstreamLayoutReadPerformance = {
      total: 0,
      maxPerFrame: 0,
      byLabel: {},
    }
    window.__playgroundPerfState = state

    const originalInfo = console.info.bind(console)
    const streamCounterKeys = ['total', 'cacheHits', 'appendHits', 'tailHits', 'fullParses', 'chunkedParses']
    const parseTimingKeys = ['tokenCloneMs', 'processTokensMs', 'parseMarkdownToStructureTotalMs']
    console.info = (...args) => {
      try {
        const label = args[0]
        if (label === '[markstream-vue][perf] parse(stream)' || label === '[markstream-vue][perf] parse(sync)') {
          const data = args[1] ?? {}
          const metrics = state.parsePerformance

          metrics.parseCommitCount = Math.max(metrics.parseCommitCount, Number(data.parseCommitCount || 0))
          metrics.parseCoalescedCount = Math.max(metrics.parseCoalescedCount, Number(data.parseCoalescedCount || 0))
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
  await page.goto(`http://${host}:${port}${benchmarkPath}`, { waitUntil: 'load' })

  const initialFrameBaseline = await frameBaseline(page, '__playgroundPerfState')
  await page.locator('.workspace-card--preview').waitFor({ state: 'visible', timeout: 15000 })
  await waitForVisibleBlocksReady(page, rootSelector)
  await page.waitForTimeout(200)
  const initialFrameStats = await frameStatsSince(page, '__playgroundPerfState', initialFrameBaseline)

  const result = await page.evaluate((frameStats) => {
    const state = window.__playgroundPerfState ?? {}
    const longTasks = Array.isArray(state.longTasks) ? state.longTasks : []
    const mermaids = Array.from(document.querySelectorAll('[data-markstream-mermaid="1"]'))
    const infographics = Array.from(document.querySelectorAll('[data-markstream-infographic="1"]'))
    const d2Blocks = Array.from(document.querySelectorAll('[data-markstream-d2="1"]'))
    const root = document.querySelector('.preview-surface')
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
    const allCodeBlocks = Array.from(document.querySelectorAll('.code-block-container'))
    const visibleCodeBlocks = allCodeBlocks.filter(isVisible)
    const diffCodeBlocks = allCodeBlocks.filter(element =>
      element.classList.contains('is-diff') || Boolean(element.querySelector('.stream-diffs-shell .diffs-container')),
    )
    const visibleDiffCodeBlocks = diffCodeBlocks.filter(isVisible)
    const renderedMermaidCount = mermaids.filter(element => element.querySelector('svg')).length
    return {
      sample: localStorage.getItem('vmr-test-sample') ?? 'unknown',
      mode: localStorage.getItem('vmr-test-render-mode') ?? 'unknown',
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
      codeBlockCount: allCodeBlocks.length,
      diffCodeBlockCount: diffCodeBlocks.length,
      fallbackCount: document.querySelectorAll('.code-fallback-plain, .code-pre-fallback').length,
      visibleCodeBlockCount: visibleCodeBlocks.length,
      visibleFallbackCount: visibleCodeBlocks.filter(element => element.querySelector('.code-fallback-plain, .code-pre-fallback')).length,
      visibleDiffCodeBlockCount: visibleDiffCodeBlocks.length,
      visibleDiffFallbackCount: visibleDiffCodeBlocks.filter(element => element.querySelector('.code-fallback-plain, .code-pre-fallback')).length,
      mermaidCount: mermaids.length,
      renderedMermaidCount,
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
      sandboxFrameMounted: Boolean(document.querySelector('.sandbox-frame')),
      parsePerformance: state.parsePerformance ?? null,
      layoutReads: window.__markstreamLayoutReadPerformance ?? null,
      topLayoutShifts: Array.isArray(state.layoutShifts)
        ? [...state.layoutShifts]
            .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0))
            .slice(0, 5)
        : [],
    }
  }, initialFrameStats)
  result.parsePerformance = cloneParsePerformance(result.parsePerformance)
  result.layoutReads = normalizeLayoutReadPerformance(result.layoutReads)
  const fullScrollParsePerformanceBaseline = cloneParsePerformance(result.parsePerformance)
  await resetLayoutReadPerformance(page)

  const scrollMetrics = await scrollThroughRoot(page, rootSelector, '__playgroundPerfState')
  const heavySettleFrameBaseline = await frameBaseline(page, '__playgroundPerfState')
  await waitForAllD2Ready(page)
  await page.waitForTimeout(200)
  const heavySettleFrameStats = await frameStatsSince(page, '__playgroundPerfState', heavySettleFrameBaseline)

  result.fullScroll = await page.evaluate((frameStats) => {
    const state = window.__playgroundPerfState ?? {}
    const longTasks = Array.isArray(state.longTasks) ? state.longTasks : []
    const mermaids = Array.from(document.querySelectorAll('[data-markstream-mermaid="1"]'))
    const infographics = Array.from(document.querySelectorAll('[data-markstream-infographic="1"]'))
    const d2Blocks = Array.from(document.querySelectorAll('[data-markstream-d2="1"]'))
    const root = document.querySelector('.preview-surface')
    return {
      settleTimeMs: performance.now() - Number(state.startedAt ?? 0),
      ...frameStats,
      pageDomNodeCount: document.querySelectorAll('*').length,
      rendererDomNodeCount: root ? root.querySelectorAll('*').length : 0,
      jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
      fallbackCount: document.querySelectorAll('.code-fallback-plain, .code-pre-fallback').length,
      mermaidCount: mermaids.length,
      renderedMermaidCount: mermaids.filter(element => element.querySelector('svg')).length,
      infographicCount: infographics.length,
      renderedInfographicCount: infographics.filter(element => element.querySelector('svg')).length,
      d2Count: d2Blocks.length,
      renderedD2Count: d2Blocks.filter(element => element.querySelector('.d2-svg svg')).length,
      longTaskTotalMs: longTasks.reduce((sum, duration) => sum + Number(duration || 0), 0),
      parsePerformance: state.parsePerformance ?? null,
      layoutReads: window.__markstreamLayoutReadPerformance ?? null,
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
  result.fullScroll.parsePerformance = diffParsePerformance(
    result.fullScroll.parsePerformance,
    fullScrollParsePerformanceBaseline,
  )
  result.fullScroll.layoutReads = normalizeLayoutReadPerformance(result.fullScroll.layoutReads)
  result.fullScroll.scrollDriftPx = scrollMetrics.maxScrollDriftPx
  result.memoryBeforeUnmountBytes = await readUsedHeapBytes(page)
  result.memoryAfterUnmountBytes = await measureAfterRendererUnmount(page)

  await context.close()
  return result
}

function assertScenario(result) {
  const maxLongTaskMs = Number(process.env.MARKSTREAM_BENCHMARK_MAX_LONG_TASK_MS || 700)
  const maxLongTaskTotalMs = Number(process.env.MARKSTREAM_BENCHMARK_MAX_LONG_TASK_TOTAL_MS || 1800)

  if (result.sample !== 'stress' && !(result.codeBlockCount > 0))
    throw new Error(`[${result.mode}] Expected at least one rendered code block.`)
  const hasMermaidBlock = result.mermaidCount > 0 || result.fullScroll?.mermaidCount > 0
  const hasInfographicBlock = result.infographicCount > 0 || result.fullScroll?.infographicCount > 0
  const hasD2Block = result.d2Count > 0 || result.fullScroll?.d2Count > 0
  if (result.sample === 'baseline' && !hasMermaidBlock)
    throw new Error(`[${result.mode}] Baseline sample should include at least one mermaid block.`)
  if (result.sample === 'baseline' && !hasInfographicBlock)
    throw new Error(`[${result.mode}] Baseline sample should include at least one infographic block.`)
  if (result.sample === 'baseline' && !hasD2Block)
    throw new Error(`[${result.mode}] Baseline sample should include at least one D2 block.`)
  if (result.visibleFallbackCount !== 0)
    throw new Error(`[${result.mode}] Visible code fallback should be gone after initial settle.`)
  if (result.sample === 'diff' && result.mode === 'stream-diffs' && !(result.diffCodeBlockCount > 0))
    throw new Error('[stream-diffs] Diff sample should render at least one stream-diffs diff block.')
  if (result.sample === 'diff' && result.mode === 'stream-diffs' && result.visibleDiffFallbackCount !== 0)
    throw new Error('[stream-diffs] Visible diff fallback should be gone after initial settle.')
  const visibleHeavyBlockCount = result.visibleMermaidCount + result.visibleInfographicCount + result.visibleD2Count
  if (visibleHeavyBlockCount > 0) {
    if (result.visibleRenderedMermaidCount !== result.visibleMermaidCount)
      throw new Error(`[${result.mode}] Visible mermaid blocks should finish in preview mode after initial settle.`)
    if (result.visibleRenderedInfographicCount !== result.visibleInfographicCount)
      throw new Error(`[${result.mode}] Visible infographic blocks should finish after initial settle.`)
    if (result.visibleRenderedD2Count !== result.visibleD2Count)
      throw new Error(`[${result.mode}] Visible D2 blocks should finish after initial settle.`)
  }
  if (!(result.lcpMs > 0 && result.lcpMs <= 5000))
    throw new Error(`[${result.mode}] LCP should stay within 5000ms. Got ${result.lcpMs}.`)
  if (!(result.cls <= 0.05))
    throw new Error(`[${result.mode}] CLS should stay within 0.05. Got ${result.cls}.`)
  if (!(result.settleTimeMs <= 6000))
    throw new Error(`[${result.mode}] Settle time should stay within 6000ms. Got ${result.settleTimeMs}.`)
  if (!(result.longTaskMaxMs <= maxLongTaskMs))
    throw new Error(`[${result.mode}] Max long task should stay within ${maxLongTaskMs}ms. Got ${result.longTaskMaxMs}.`)
  if (!(result.longTaskTotalMs <= maxLongTaskTotalMs))
    throw new Error(`[${result.mode}] Total long task time should stay within ${maxLongTaskTotalMs}ms. Got ${result.longTaskTotalMs}.`)
  if (!(result.rendererDomNodeCount <= 5000))
    throw new Error(`[${result.mode}] Renderer DOM node count budget exceeded. Got ${result.rendererDomNodeCount}.`)
  assertLayoutReadBudget(result.mode, 'initial', result.layoutReads, { requireReads: true })
  if (result.fullScroll.fallbackCount !== 0)
    throw new Error(`[${result.mode}] Code fallback should be gone after full scroll settle.`)
  if (result.fullScroll.renderedMermaidCount !== result.fullScroll.mermaidCount)
    throw new Error(`[${result.mode}] Mermaid blocks should all finish after full scroll settle.`)
  if (result.fullScroll.renderedInfographicCount !== result.fullScroll.infographicCount)
    throw new Error(`[${result.mode}] Infographic blocks should all finish after full scroll settle.`)
  if (result.fullScroll.renderedD2Count !== result.fullScroll.d2Count)
    throw new Error(`[${result.mode}] D2 blocks should all finish after full scroll settle.`)
  if (!(result.fullScroll.rendererDomNodeCount <= 5000))
    throw new Error(`[${result.mode}] Full-scroll renderer DOM node count budget exceeded. Got ${result.fullScroll.rendererDomNodeCount}.`)
  assertLayoutReadBudget(result.mode, 'full-scroll', result.fullScroll.layoutReads)
}

async function run() {
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort()
  const server = startDevServer(port)
  let results = null
  let browser = null
  const cleanup = () => killProcessTree(server.child)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)

  try {
    await waitForPort(port)
    browser = await chromium.launch(resolveChromeLaunchOptions())

    const streamDiffsResult = await runScenario(browser, port, 'stream-diffs')
    results = {
      'stream-diffs': streamDiffsResult,
    }

    assertScenario(streamDiffsResult)

    writeJsonResult(results)

    await browser.close()
    browser = null
  }
  catch (error) {
    console.error('[e2e-playground-performance] failed')
    console.error(error)
    if (results) {
      if (process.env.BENCHMARK_JSON_PATH)
        writeJsonResult(results)
      else
        console.error(JSON.stringify(results, null, 2))
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
