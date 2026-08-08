#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { collectWebVitalsInteractionWarnings } from './web-vitals-budget-checks.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const playgroundDir = path.join(repoRoot, 'playground')
const host = '127.0.0.1'
const previewWaitTimeoutMs = Number(process.env.WEB_VITALS_PREVIEW_WAIT_TIMEOUT_MS || 60000)
const isReleaseGate = process.env.MARKSTREAM_RELEASE_GATE === '1'
const codeBlockScenarioExpectedCodeBlockCount = 12
const millionRestoreStartMarker = 'MARKSTREAM_MILLION_RESTORE_START'
const millionRestoreDeepMarker = 'MARKSTREAM_MILLION_RESTORE_SECTION_3600'
const millionRestoreEndMarker = 'MARKSTREAM_MILLION_RESTORE_END'

const webVitalsPhaseBudgets = {
  'million-restore': {
    lcpMs: 5000,
    phaseElapsedMs: 60000,
    longTaskMaxMs: 2500,
    longTaskTotalMs: 6000,
    frameP95Ms: 1000,
    frameMaxMs: 3000,
    minFrameSamplesPerSecond: 4,
    rendererDomNodeCount: 1500,
    phaseCls: 0.05,
  },
  'million-scripted-scroll': {
    phaseElapsedMs: 12000,
    longTaskMaxMs: 600,
    longTaskTotalMs: 9000,
    frameP95Ms: 800,
    frameMaxMs: 1500,
    minFrameSamplesPerSecond: 4,
    rendererDomNodeCount: 1500,
    phaseCls: 0.05,
  },
  'codeblock-initial-stream-diffs': {
    // 2.0 baseline: stream-diffs mounts a windowed (virtualized) shell whose
    // first paint is viewport-sized, so the pre → surface handoff carries a
    // small once-off layout shift (measured ~0.09). Budget is the 2.0 baseline
    // with headroom; 0.05 was calibrated against 1.x Monaco.
    lcpMs: 5000,
    phaseElapsedMs: 10000,
    longTaskMaxMs: 1200,
    longTaskTotalMs: 1500,
    frameP95Ms: 500,
    frameMaxMs: 1200,
    minFrameSamplesPerSecond: 8,
    rendererDomNodeCount: 7000,
    phaseCls: 0.15,
  },
  'codeblock-scripted-scroll-into-stream-diffs': {
    // Scripted scrolling mounts 12 deferred 50-line blocks; each windowed
    // mount shift accumulates to the measured 2.0 baseline of ~0.75.
    phaseElapsedMs: 5000,
    longTaskMaxMs: 600,
    longTaskTotalMs: 1000,
    frameP95Ms: 500,
    frameMaxMs: 1000,
    minFrameSamplesPerSecond: 8,
    rendererDomNodeCount: 7000,
    phaseCls: 0.8,
  },
}

const webVitalsInteractionBudgets = {
  'million-click-preview': {
    eventTimingInpCandidateMs: 500,
    eventTimingMaxInputDelayMs: 200,
    eventTimingMaxProcessingMs: 400,
    phaseCls: 0.05,
  },
  'million-keyboard-pagedown': {
    eventTimingInpCandidateMs: 800,
    eventTimingMaxInputDelayMs: 250,
    eventTimingMaxProcessingMs: 700,
    phaseCls: 0.05,
  },
  'codeblock-copy': {
    eventTimingInpCandidateMs: 1000,
    eventTimingMaxInputDelayMs: 300,
    eventTimingMaxProcessingMs: 900,
    phaseCls: 0.05,
  },
  'codeblock-collapse': {
    eventTimingInpCandidateMs: 800,
    eventTimingMaxInputDelayMs: 250,
    eventTimingMaxProcessingMs: 700,
    phaseCls: 0.05,
  },
}

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

async function findFreePort(start = 4460, end = 4500) {
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

async function closeBrowser(browser, timeoutMs = 5000) {
  let timeout = null
  const closeResult = await Promise.race([
    browser.close().then(() => 'closed', () => 'closed'),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve('timeout'), timeoutMs)
      timeout.unref?.()
    }),
  ])
  if (timeout)
    clearTimeout(timeout)
  if (closeResult === 'timeout') {
    try {
      const browserProcess = typeof browser.process === 'function'
        ? browser.process()
        : null
      browserProcess?.kill('SIGKILL')
    }
    catch {}
  }
  return closeResult
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
    if (existsSync(candidate))
      return { executablePath: candidate, headless: true, args: chromeLaunchArgs() }
  }

  return { channel: 'chrome', headless: true, args: chromeLaunchArgs() }
}

function chromeLaunchArgs() {
  return [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ]
}

function startDevServer(port) {
  const logs = []
  const serverArgs = process.env.PLAYGROUND_PERFORMANCE_SERVER === 'preview'
    ? ['-C', playgroundDir, 'exec', 'vite', 'preview', '--host', host, '--port', String(port), '--strictPort']
    : ['-C', playgroundDir, 'exec', 'vite', '--host', host, '--port', String(port), '--strictPort']
  const child = spawn('pnpm', serverArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
  })

  child.stdout.on('data', chunk => logs.push(String(chunk)))
  child.stderr.on('data', chunk => logs.push(String(chunk)))

  return {
    child,
    getLogs() {
      return logs.join('')
    },
  }
}

function writeJsonResult(result) {
  const outputPath = process.env.WEB_VITALS_JSON_PATH || '.tmp/perf/web-vitals-performance.json'
  const resolvedPath = path.isAbsolute(outputPath) ? outputPath : path.resolve(repoRoot, outputPath)
  mkdirSync(path.dirname(resolvedPath), { recursive: true })
  writeFileSync(resolvedPath, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

function createMillionMarkdown() {
  const parts = ['# Million restore Web Vitals probe', millionRestoreStartMarker, '']
  const paragraph = 'Large restore payload keeps parser and renderer work visible while virtual DOM limits protect the page. '.repeat(3)
  for (let i = 0; i < 3600; i++) {
    const sectionNumber = i + 1
    parts.push(`## Restored section ${sectionNumber}${sectionNumber === 3600 ? ` ${millionRestoreDeepMarker}` : ''}`)
    parts.push(`${paragraph} index=${i}.`)
    if (i % 20 === 0) {
      parts.push([
        '| key | value | note |',
        '| --- | ---: | --- |',
        `| ${i} | ${i * 7} | restored table row |`,
      ].join('\n'))
    }
    if (i % 33 === 0) {
      parts.push([
        '- restored list item A',
        '  - child A',
        '- restored list item B',
      ].join('\n'))
    }
  }
  parts.push(millionRestoreEndMarker)
  return parts.join('\n\n')
}

function createCodeBlockMarkdown() {
  const parts = [
    '# Code block Web Vitals probe',
    '',
    'The first code block starts in the initial viewport so fallback-to-enhanced-surface layout shift is measured.',
    '',
  ]

  for (let i = 0; i < codeBlockScenarioExpectedCodeBlockCount; i++) {
    parts.push(`## Code section ${i + 1}`)
    parts.push('```ts')
    for (let line = 0; line < 50; line++)
      parts.push(`export const value${i}_${line} = ${i * 1000 + line}`)
    parts.push('```')
    parts.push('')
  }

  return parts.join('\n')
}

function metricMap(metrics) {
  return Object.fromEntries(metrics.metrics.map(metric => [metric.name, metric.value]))
}

function deltaMetrics(after, before) {
  return {
    taskDurationMs: (after.TaskDuration - before.TaskDuration) * 1000,
    scriptDurationMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
    layoutDurationMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    recalcStyleDurationMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
    nodes: after.Nodes,
    jsHeapUsedMB: after.JSHeapUsedSize / 1024 / 1024,
  }
}

function summarizeTraceEvents(events) {
  const names = [
    'Layout',
    'UpdateLayoutTree',
    'RecalculateStyles',
    'PrePaint',
    'Paint',
    'RasterTask',
    'CompositeLayers',
  ]
  const totals = Object.fromEntries(names.map(name => [name, { count: 0, totalMs: 0, maxMs: 0 }]))

  for (const event of events) {
    if (event.ph !== 'X' || !Object.prototype.hasOwnProperty.call(totals, event.name))
      continue
    const durationMs = Number(event.dur || 0) / 1000
    const bucket = totals[event.name]
    bucket.count += 1
    bucket.totalMs += durationMs
    bucket.maxMs = Math.max(bucket.maxMs, durationMs)
  }

  return totals
}

async function startTrace(page) {
  const client = await page.context().newCDPSession(page)
  await client.send('Tracing.start', {
    categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc',
    transferMode: 'ReturnAsStream',
  })
  return client
}

async function stopTrace(client) {
  const complete = new Promise((resolve) => {
    client.once('Tracing.tracingComplete', resolve)
  })
  await client.send('Tracing.end')
  const event = await complete
  const handle = event.stream
  let trace = ''
  while (true) {
    const chunk = await client.send('IO.read', { handle })
    trace += chunk.data || ''
    if (chunk.eof)
      break
  }
  await client.send('IO.close', { handle })
  return summarizeTraceEvents(JSON.parse(trace).traceEvents ?? [])
}

async function forceGC(page) {
  if (typeof page.requestGC === 'function')
    await page.requestGC()
  await page.waitForTimeout(80)
  return await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null).catch(() => null)
}

async function waitForFrames(page, count = 2) {
  await page.evaluate(async (frameCount) => {
    for (let i = 0; i < frameCount; i++)
      await new Promise(resolve => requestAnimationFrame(resolve))
  }, count)
}

async function resetPhase(page, phase) {
  await page.evaluate((phase) => {
    const state = window.__webVitalsProbeState
    if (!state)
      return
    state.phase = phase
    state.phaseStartedAt = performance.now()
    state.frames = []
    state.lastFrameAt = 0
    state.parseBaseline = JSON.parse(JSON.stringify(state.parsePerformance ?? null))
    window.__markstreamLayoutReadPerformance = {
      total: 0,
      maxPerFrame: 0,
      byLabel: {},
    }
  }, phase)
  await waitForFrames(page, 1)
}

async function installObservers(context) {
  await context.addInitScript(() => {
    const describeElement = (element) => {
      if (!element)
        return null
      const tag = element.tagName ? element.tagName.toLowerCase() : 'unknown'
      const id = element.id ? `#${element.id}` : ''
      const className = typeof element.className === 'string'
        ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.')
        : ''
      return `${tag}${id}${className ? `.${className}` : ''}`
    }

    const state = {
      startedAt: performance.now(),
      phaseStartedAt: performance.now(),
      phase: 'navigation',
      cls: 0,
      lcpMs: 0,
      lcpElement: null,
      longTasks: [],
      paints: {},
      layoutShifts: [],
      frames: [],
      events: [],
      lastFrameAt: 0,
      eventObserverSupported: false,
      eventObserverError: null,
      interactionCountSupported: typeof performance.interactionCount === 'number',
      parseBaseline: null,
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
    window.__webVitalsProbeState = state
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
            state.layoutShifts.push({
              value: entry.value,
              startTime: entry.startTime,
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
          state.longTasks.push({ duration: entry.duration, startTime: entry.startTime })
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
      const eventObserver = new PerformanceObserver((list) => {
        state.eventObserverSupported = true
        for (const entry of list.getEntries()) {
          state.events.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
            processingStart: entry.processingStart,
            processingEnd: entry.processingEnd,
            inputDelay: Math.max(0, Number(entry.processingStart || 0) - Number(entry.startTime || 0)),
            processingTime: Math.max(0, Number(entry.processingEnd || 0) - Number(entry.processingStart || 0)),
            interactionId: Number(entry.interactionId || 0),
            target: describeElement(entry.target),
          })
        }
      })
      eventObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 })
      state.eventObserverSupported = true
    }
    catch (error) {
      state.eventObserverError = error instanceof Error ? error.message : String(error)
    }

    const sampleFrame = (now) => {
      if (state.lastFrameAt > 0)
        state.frames.push(now - state.lastFrameAt)
      if (state.frames.length > 3600)
        state.frames.shift()
      state.lastFrameAt = now
      requestAnimationFrame(sampleFrame)
    }
    requestAnimationFrame(sampleFrame)
  })
}

async function captureVitalsSnapshot(page, label, performanceDelta = null) {
  return await page.evaluate(({ label, performanceDelta, markers }) => {
    const state = window.__webVitalsProbeState ?? {}
    const phaseStartedAt = Number(state.phaseStartedAt ?? state.startedAt ?? 0)
    const inCurrentPhase = entry => Number(entry.startTime || 0) >= phaseStartedAt
    const longTasks = (Array.isArray(state.longTasks) ? state.longTasks : []).filter(inCurrentPhase)
    const frames = Array.isArray(state.frames) ? state.frames : []
    const events = (Array.isArray(state.events) ? state.events : []).filter(inCurrentPhase)
    const layoutShifts = (Array.isArray(state.layoutShifts) ? state.layoutShifts : []).filter(inCurrentPhase)
    const root = document.querySelector('.preview-surface')
    const renderer = root?.querySelector('.markdown-renderer')
    const rootRect = root?.getBoundingClientRect()
    const findMarkerElement = (marker) => {
      if (!marker || !renderer)
        return null
      const walker = document.createTreeWalker(renderer, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        if (node.nodeValue?.includes(marker))
          return node.parentElement
        node = walker.nextNode()
      }
      return null
    }
    const markerInfo = (marker) => {
      const element = findMarkerElement(marker)
      if (!element || !rootRect)
        return { present: Boolean(element), visible: false }
      const rect = element.getBoundingClientRect()
      return {
        present: true,
        visible: rect.bottom > rootRect.top && rect.top < rootRect.bottom,
      }
    }
    const interactions = new Map()
    const phase = state.phase ?? 'navigation'
    const isNavigationPhase = phase === 'navigation'
    const cloneJson = value => value == null ? null : JSON.parse(JSON.stringify(value))
    const diffNumber = (after, before) => Math.max(0, Number(after || 0) - Number(before || 0))
    const computeCls = (shifts) => {
      const sorted = [...shifts].sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0))
      let maxWindowValue = 0
      let windowValue = 0
      let windowStart = 0
      let lastShiftTime = 0

      for (const shift of sorted) {
        const startTime = Number(shift.startTime || 0)
        const value = Number(shift.value || 0)
        if (
          windowValue === 0
          || startTime - lastShiftTime > 1000
          || startTime - windowStart > 5000
        ) {
          windowStart = startTime
          windowValue = value
        }
        else {
          windowValue += value
        }
        lastShiftTime = startTime
        maxWindowValue = Math.max(maxWindowValue, windowValue)
      }

      return maxWindowValue
    }
    const diffParsePerformance = (after, before) => {
      if (!after)
        return null
      if (isNavigationPhase)
        return cloneJson(after)

      const base = before ?? {}
      const streamKeys = ['total', 'cacheHits', 'appendHits', 'tailHits', 'fullParses', 'chunkedParses']
      const stream = {}
      for (const key of streamKeys)
        stream[key] = diffNumber(after.stream?.[key], base.stream?.[key])

      const streamModes = {}
      const modeKeys = new Set([
        ...Object.keys(after.streamModes ?? {}),
        ...Object.keys(base.streamModes ?? {}),
      ])
      for (const key of modeKeys)
        streamModes[key] = diffNumber(after.streamModes?.[key], base.streamModes?.[key])

      return {
        parseCommitCount: diffNumber(after.parseCommitCount, base.parseCommitCount),
        parseCoalescedCount: diffNumber(after.parseCoalescedCount, base.parseCoalescedCount),
        streamCommitCount: diffNumber(after.streamCommitCount, base.streamCommitCount),
        syncCommitCount: diffNumber(after.syncCommitCount, base.syncCommitCount),
        tokenCloneMs: diffNumber(after.tokenCloneMs, base.tokenCloneMs),
        processTokensMs: diffNumber(after.processTokensMs, base.processTokensMs),
        parseMarkdownToStructureTotalMs: diffNumber(
          after.parseMarkdownToStructureTotalMs,
          base.parseMarkdownToStructureTotalMs,
        ),
        stream,
        streamModes,
      }
    }
    const normalizeLayoutReadPerformance = (value) => {
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

    for (const event of events) {
      const key = Number(event.interactionId || 0) > 0
        ? `interaction:${event.interactionId}`
        : `event:${event.name}:${event.startTime}`
      const current = interactions.get(key) ?? {
        duration: 0,
        inputDelay: 0,
        processingTime: 0,
        events: [],
      }
      current.duration = Math.max(current.duration, Number(event.duration || 0))
      current.inputDelay = Math.max(current.inputDelay, Number(event.inputDelay || 0))
      current.processingTime = Math.max(current.processingTime, Number(event.processingTime || 0))
      current.events.push(event)
      interactions.set(key, current)
    }

    const inpInteractionValues = [...interactions.entries()]
      .filter(([key]) => key.startsWith('interaction:'))
      .map(([, value]) => value)
    const sortedEvents = [...events].sort((a, b) => Number(b.duration || 0) - Number(a.duration || 0))
    const codeBlocks = Array.from(document.querySelectorAll('.code-block-container'))
    const terminalPreFallbackElements = Array.from(document.querySelectorAll('[data-markstream-pre="1"]'))
      .filter(element => !element.closest('.code-block-container'))
    const codeBlockElements = [...codeBlocks, ...terminalPreFallbackElements]
    const isVisible = (element) => {
      if (!rootRect)
        return false
      const rect = element.getBoundingClientRect()
      return rect.bottom > rootRect.top && rect.top < rootRect.bottom
    }
    const visibleCodeBlocks = codeBlockElements.filter(isVisible)
    const offscreenCodeBlocks = codeBlockElements.filter(element => !isVisible(element))
    const fallbackElements = Array.from(new Set([
      ...Array.from(document.querySelectorAll('.code-fallback-plain, .code-pre-fallback')),
      ...terminalPreFallbackElements,
    ]))
    const isEnhanced = element => element.getAttribute('data-markstream-enhanced') === 'true'
    const startMarker = markerInfo(markers.start)
    const deepMarker = markerInfo(markers.deep)
    const endMarker = markerInfo(markers.end)
    const previewScrollTop = root instanceof HTMLElement ? root.scrollTop : 0
    const previewMaxScrollTop = root instanceof HTMLElement ? Math.max(0, root.scrollHeight - root.clientHeight) : 0
    return {
      label,
      phase,
      elapsedMs: performance.now() - Number(state.startedAt ?? 0),
      phaseElapsedMs: performance.now() - phaseStartedAt,
      lcpMs: isNavigationPhase ? Number(state.lcpMs ?? 0) : null,
      lcpElement: isNavigationPhase ? (state.lcpElement ?? null) : null,
      labMetricScope: isNavigationPhase ? 'navigation-total' : 'phase-delta',
      phaseCls: computeCls(layoutShifts),
      layoutShiftTotal: layoutShifts.reduce((sum, item) => sum + Number(item.value || 0), 0),
      firstPaintMs: isNavigationPhase ? Number(state.paints?.['first-paint'] ?? 0) : null,
      firstContentfulPaintMs: isNavigationPhase ? Number(state.paints?.['first-contentful-paint'] ?? 0) : null,
      longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce((sum, item) => sum + Number(item.duration || 0), 0),
      longTaskMaxMs: longTasks.length ? Math.max(...longTasks.map(item => Number(item.duration || 0))) : 0,
      frameCount: frames.length,
      frameP95Ms: frames.length ? window.__webVitalsProbeP95(frames) : 0,
      frameMaxMs: frames.length ? Math.max(...frames) : 0,
      eventObserverSupported: Boolean(state.eventObserverSupported),
      eventObserverError: state.eventObserverError ?? null,
      eventCount: events.length,
      performanceInteractionCount: typeof performance.interactionCount === 'number'
        ? performance.interactionCount
        : null,
      interactionGroupCount: inpInteractionValues.length,
      eventTimingInpCandidateMs: inpInteractionValues.length
        ? Math.max(...inpInteractionValues.map(interaction => Number(interaction.duration || 0)))
        : null,
      eventTimingMaxInputDelayMs: inpInteractionValues.length
        ? Math.max(...inpInteractionValues.map(interaction => Number(interaction.inputDelay || 0)))
        : 0,
      eventTimingMaxProcessingMs: inpInteractionValues.length
        ? Math.max(...inpInteractionValues.map(interaction => Number(interaction.processingTime || 0)))
        : 0,
      topEvents: sortedEvents.slice(0, 8),
      pageDomNodeCount: document.querySelectorAll('*').length,
      rendererDomNodeCount: renderer ? renderer.querySelectorAll('*').length : 0,
      nodeSlotCount: renderer ? renderer.querySelectorAll(':scope > .node-slot').length : 0,
      millionRestoreStartMarkerPresent: startMarker.present,
      millionRestoreStartMarkerVisible: startMarker.visible,
      millionRestoreDeepMarkerPresent: deepMarker.present,
      millionRestoreDeepMarkerVisible: deepMarker.visible,
      millionRestoreEndMarkerPresent: endMarker.present,
      millionRestoreEndMarkerVisible: endMarker.visible,
      previewScrollTop,
      previewMaxScrollTop,
      previewScrollRatio: previewMaxScrollTop > 0 ? previewScrollTop / previewMaxScrollTop : 0,
      codeBlockCount: codeBlockElements.length,
      enhancedCodeBlockCount: codeBlockElements.filter(isEnhanced).length,
      visibleCodeBlockCount: visibleCodeBlocks.length,
      visibleEnhancedCodeBlockCount: visibleCodeBlocks.filter(isEnhanced).length,
      offscreenCodeBlockCount: offscreenCodeBlocks.length,
      offscreenEnhancedCodeBlockCount: offscreenCodeBlocks.filter(isEnhanced).length,
      fallbackCount: fallbackElements.length,
      terminalPreFallbackCount: terminalPreFallbackElements.length,
      visibleFallbackCount: fallbackElements.filter(isVisible).length,
      hasStreamDiffsDom: Boolean(document.querySelector('.stream-diffs-shell')),
      jsHeapUsedBytes: null,
      parsePerformance: diffParsePerformance(state.parsePerformance, state.parseBaseline),
      layoutReads: normalizeLayoutReadPerformance(window.__markstreamLayoutReadPerformance),
      topLayoutShifts: [...layoutShifts]
        .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0))
        .slice(0, 8),
      performanceDelta,
      traceSummary: null,
    }
  }, {
    label,
    performanceDelta,
    markers: {
      start: millionRestoreStartMarker,
      deep: millionRestoreDeepMarker,
      end: millionRestoreEndMarker,
    },
  })
}

async function finalizeVitalsSnapshot(page, snapshot, traceSummary = null) {
  return {
    ...snapshot,
    jsHeapUsedBytes: await forceGC(page),
    traceSummary,
  }
}

async function readVitals(page, label, performanceDelta = null, traceSummary = null) {
  const snapshot = await captureVitalsSnapshot(page, label, performanceDelta)
  return await finalizeVitalsSnapshot(page, snapshot, traceSummary)
}

async function exposeP95(page) {
  await page.addInitScript(() => {
    window.__webVitalsProbeP95 = (values) => {
      if (!Array.isArray(values) || values.length === 0)
        return 0
      const sorted = [...values].sort((a, b) => a - b)
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1))]
    }
  })
}

function attachPageDiagnostics(page) {
  const messages = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      messages.push(`[console:${message.type()}] ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    messages.push(`[pageerror] ${error.stack || error.message}`)
  })
  return messages
}

async function pageDiagnostics(page, messages) {
  const [title, bodyText] = await Promise.all([
    page.title().catch(() => ''),
    page.locator('body').textContent({ timeout: 1000 }).catch(() => ''),
  ])
  return [
    `url=${page.url()}`,
    `title=${title}`,
    `body=${bodyText.slice(0, 2000)}`,
    ...messages.slice(-20),
  ].join('\n')
}

async function waitForVisible(page, selector, messages, timeout = previewWaitTimeoutMs) {
  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout })
  }
  catch (error) {
    throw new Error(`${selector} did not become visible within ${timeout}ms.\n${await pageDiagnostics(page, messages)}\n${error instanceof Error ? error.message : String(error)}`)
  }
}

async function warmupScenarioContext(browser, port) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    baseURL: `http://${host}:${port}`,
  })
  const page = await context.newPage()
  const messages = attachPageDiagnostics(page)
  try {
    await page.goto('/test?benchmark=1', { waitUntil: 'load' })
    await waitForVisible(page, '.workspace-card--preview', messages)
  }
  finally {
    await context.close()
  }
}

async function waitForParse(page) {
  await page.waitForFunction(() => {
    const state = window.__webVitalsProbeState
    return Boolean(state?.parsePerformance?.parseCommitCount)
  }, null, { timeout: 120000 })
}

async function waitForPreviewSurfaceStable(page) {
  await page.waitForFunction(() => new Promise((resolve) => {
    const read = () => {
      const root = document.querySelector('.preview-surface')
      const renderer = root?.querySelector('.markdown-renderer')
      return {
        scrollHeight: root instanceof HTMLElement ? root.scrollHeight : 0,
        nodeSlots: renderer ? renderer.querySelectorAll(':scope > .node-slot').length : 0,
        textLength: renderer?.textContent?.length ?? 0,
      }
    }
    requestAnimationFrame(() => {
      const before = read()
      requestAnimationFrame(() => {
        const after = read()
        resolve(
          before.scrollHeight === after.scrollHeight
          && before.nodeSlots === after.nodeSlots
          && before.textLength === after.textLength,
        )
      })
    })
  }), null, { timeout: 30000 })
}

async function waitForMarkerVisible(page, marker, timeout = 30000) {
  await page.waitForFunction((marker) => {
    const root = document.querySelector('.preview-surface')
    const renderer = root?.querySelector('.markdown-renderer')
    if (!(root instanceof HTMLElement) || !renderer)
      return false
    const rootRect = root.getBoundingClientRect()
    const walker = document.createTreeWalker(renderer, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      if (node.nodeValue?.includes(marker)) {
        const element = node.parentElement
        if (!element)
          return false
        const rect = element.getBoundingClientRect()
        return rect.bottom > rootRect.top && rect.top < rootRect.bottom
      }
      node = walker.nextNode()
    }
    return false
  }, marker, { timeout })
}

async function waitForVisibleCodeBlocksReady(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const root = document.querySelector('.preview-surface')
    if (!root)
      return false
    const rootRect = root.getBoundingClientRect()
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      return rect.bottom > rootRect.top && rect.top < rootRect.bottom
    }
    const visibleCodeBlocks = Array.from(document.querySelectorAll('.code-block-container')).filter(isVisible)
    return visibleCodeBlocks.length > 0
      && visibleCodeBlocks.every(element => element.getAttribute('data-markstream-enhanced') === 'true')
  }, null, { timeout })
}

async function focusPreviewSurface(page) {
  return await page.evaluate(() => {
    const root = document.querySelector('.preview-surface')
    if (!(root instanceof HTMLElement))
      throw new Error('preview surface was not found')
    root.focus({ preventScroll: true })
    return root.scrollTop
  })
}

async function waitForPreviewSurfaceScrollChange(page, beforeScrollTop, timeout = 3000) {
  await page.waitForFunction((previousScrollTop) => {
    const root = document.querySelector('.preview-surface')
    return root instanceof HTMLElement && root.scrollTop !== previousScrollTop
  }, beforeScrollTop, { timeout })
}

async function scrollPreviewByRatio(page, ratio) {
  return await page.evaluate(async (ratio) => {
    const root = document.querySelector('.preview-surface')
    if (!root)
      return { scrollTop: 0, maxScrollTop: 0, targetScrollTop: 0, driftPx: 0 }
    root.style.scrollBehavior = 'auto'
    const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight)
    const targetScrollTop = Math.round(maxScrollTop * ratio)
    root.scrollTop = targetScrollTop
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return {
      scrollTop: root.scrollTop,
      maxScrollTop,
      targetScrollTop,
      driftPx: Math.abs(root.scrollTop - targetScrollTop),
    }
  }, ratio)
}

function assertMillionRestoreReady(vitals, label) {
  if (!vitals.millionRestoreStartMarkerVisible)
    throw new Error(`[${label}] expected restored million-character start marker to be visible before measuring restore.`)
  if (vitals.nodeSlotCount < 180)
    throw new Error(`[${label}] expected restored virtual window to contain at least 180 node slots, got ${vitals.nodeSlotCount}.`)
}

function assertMillionRestoreScrolled(vitals, label) {
  if (!vitals.millionRestoreDeepMarkerVisible || !vitals.millionRestoreEndMarkerPresent)
    throw new Error(`[${label}] expected deep million-character marker and end marker after scripted scroll.`)
  if (!(vitals.previewMaxScrollTop > 0 && vitals.previewScrollRatio >= 0.9))
    throw new Error(`[${label}] expected preview scroll ratio >= 0.9, got ${vitals.previewScrollRatio}.`)
}

function assertCodeBlocksReady(vitals, label) {
  if (vitals.codeBlockCount !== codeBlockScenarioExpectedCodeBlockCount)
    throw new Error(`[${label}] expected ${codeBlockScenarioExpectedCodeBlockCount} code blocks, got ${vitals.codeBlockCount}.`)
  if (vitals.enhancedCodeBlockCount !== vitals.codeBlockCount)
    throw new Error(`[${label}] expected all code blocks to be enhanced, got ${vitals.enhancedCodeBlockCount}/${vitals.codeBlockCount}.`)
  if (vitals.fallbackCount !== 0)
    throw new Error(`[${label}] expected no code block fallbacks, got ${vitals.fallbackCount}.`)
  if (!vitals.hasStreamDiffsDom)
    throw new Error(`[${label}] expected stream-diffs DOM to be present.`)
}

function assertVisibleCodeBlocksReady(vitals, label) {
  if (vitals.codeBlockCount !== codeBlockScenarioExpectedCodeBlockCount)
    throw new Error(`[${label}] expected ${codeBlockScenarioExpectedCodeBlockCount} code blocks, got ${vitals.codeBlockCount}.`)
  if (!(vitals.visibleCodeBlockCount > 0))
    throw new Error(`[${label}] expected visible code blocks.`)
  if (vitals.visibleEnhancedCodeBlockCount !== vitals.visibleCodeBlockCount)
    throw new Error(`[${label}] expected visible code blocks to be enhanced, got ${vitals.visibleEnhancedCodeBlockCount}/${vitals.visibleCodeBlockCount}.`)
  if (vitals.visibleFallbackCount !== 0)
    throw new Error(`[${label}] expected no visible code block fallbacks, got ${vitals.visibleFallbackCount}.`)
  if (!vitals.hasStreamDiffsDom)
    throw new Error(`[${label}] expected stream-diffs DOM to be present for visible code blocks.`)
}

function assertOffscreenCodeBlocksDeferred(vitals, label) {
  if (!(vitals.offscreenCodeBlockCount > 0))
    throw new Error(`[${label}] expected offscreen code blocks.`)
  if (vitals.offscreenEnhancedCodeBlockCount !== 0)
    throw new Error(`[${label}] expected all offscreen code blocks to remain deferred, got ${vitals.offscreenEnhancedCodeBlockCount}/${vitals.offscreenCodeBlockCount} enhanced.`)
}

async function runInteraction(page, label, action) {
  await resetPhase(page, label)
  const started = await page.evaluate(() => ({
    now: performance.now(),
    interactionCount: typeof performance.interactionCount === 'number'
      ? performance.interactionCount
      : null,
  }))
  await action()
  await waitForFrames(page, 2)
  await page.waitForTimeout(120)
  const ended = await page.evaluate(() => ({
    now: performance.now(),
    interactionCount: typeof performance.interactionCount === 'number'
      ? performance.interactionCount
      : null,
  }))
  const vitals = await readVitals(page, label)
  const performanceInteractionCountDelta = typeof started.interactionCount === 'number' && typeof ended.interactionCount === 'number'
    ? Math.max(0, ended.interactionCount - started.interactionCount)
    : 0
  const scriptedInteractionCount = 1
  const belowEventTimingThreshold = vitals.eventObserverSupported === true
    && vitals.interactionGroupCount === 0
    && (scriptedInteractionCount > 0 || performanceInteractionCountDelta > 0)
  return {
    label,
    actionToNextFramesMs: ended.now - started.now,
    eventObserverSupported: vitals.eventObserverSupported,
    interactionGroupCount: vitals.interactionGroupCount,
    performanceInteractionCountDelta,
    scriptedInteractionCount,
    belowEventTimingThreshold,
    eventCount: vitals.eventCount,
    eventTimingInpCandidateMs: belowEventTimingThreshold ? 0 : vitals.eventTimingInpCandidateMs,
    eventTimingMaxInputDelayMs: vitals.eventTimingMaxInputDelayMs,
    eventTimingMaxProcessingMs: vitals.eventTimingMaxProcessingMs,
    eventObserverError: vitals.eventObserverError,
    topEvents: vitals.topEvents,
    phaseCls: vitals.phaseCls,
    topLayoutShifts: vitals.topLayoutShifts,
  }
}

async function createScenarioContext(browser, port, shareId, content, renderMode, viewport, options = {}) {
  const origin = `http://${host}:${port}`
  const context = await browser.newContext({
    viewport,
    baseURL: origin,
    storageState: {
      cookies: [],
      origins: [
        {
          origin,
          localStorage: [
            { name: `vmr-test-share:${shareId}`, value: JSON.stringify({ content }) },
            { name: 'vmr-test-render-mode', value: renderMode },
            { name: 'vmr-test-code-stream', value: 'false' },
            { name: 'vmr-test-viewport-priority', value: 'true' },
            ...(options.codeBlockViewportRootMargin
              ? [{ name: 'vmr-test-code-block-viewport-root-margin', value: options.codeBlockViewportRootMargin }]
              : []),
            { name: 'vmr-test-batch-rendering', value: 'true' },
            { name: 'vmr-test-typewriter', value: 'false' },
          ],
        },
      ],
    },
  })
  if (options.disableViewportPriorityIdleDrain) {
    await context.addInitScript(() => {
      window.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true
    })
  }
  await installObservers(context)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  return context
}

function copyViewport(viewport) {
  return { width: viewport.width, height: viewport.height }
}

async function runMillionRestoreScenario(browser, port) {
  const shareId = 'web-vitals-million-restore'
  const content = createMillionMarkdown()
  const viewport = { width: 1600, height: 1100 }
  await warmupScenarioContext(browser, port)
  const context = await createScenarioContext(
    browser,
    port,
    shareId,
    content,
    'pre',
    viewport,
  )
  const page = await context.newPage()
  const messages = attachPageDiagnostics(page)
  await exposeP95(page)
  const client = await page.context().newCDPSession(page)
  await client.send('Performance.enable')
  const beforeNavigate = metricMap(await client.send('Performance.getMetrics'))
  const traceClient = await startTrace(page)

  await page.goto(`/test?benchmark=1&view=preview&share=${shareId}`, { waitUntil: 'load' })
  await waitForVisible(page, '.workspace-card--preview', messages)
  await waitForVisible(page, '.markdown-renderer', messages)
  await waitForParse(page)
  await waitForMarkerVisible(page, millionRestoreStartMarker)
  await waitForPreviewSurfaceStable(page)
  await page.waitForTimeout(800)

  const restoreSnapshot = await captureVitalsSnapshot(page, 'million-restore')
  assertMillionRestoreReady(restoreSnapshot, restoreSnapshot.label)
  const afterRestoreMetrics = metricMap(await client.send('Performance.getMetrics'))
  restoreSnapshot.performanceDelta = deltaMetrics(afterRestoreMetrics, beforeNavigate)
  const restoreTrace = await stopTrace(traceClient)
  const restore = await finalizeVitalsSnapshot(page, restoreSnapshot, restoreTrace)
  restore.viewport = copyViewport(viewport)

  const interactions = []
  interactions.push(await runInteraction(page, 'million-click-preview', async () => {
    await page.locator('.preview-surface').click({ position: { x: 240, y: 240 } })
  }))
  interactions.push(await runInteraction(page, 'million-keyboard-pagedown', async () => {
    const beforeScrollTop = await focusPreviewSurface(page)
    await page.keyboard.press('PageDown')
    await waitForPreviewSurfaceScrollChange(page, beforeScrollTop)
  }))
  const beforeScrollMetrics = metricMap(await client.send('Performance.getMetrics'))
  const scrollTraceClient = await startTrace(page)
  await resetPhase(page, 'million-scroll')
  for (let i = 1; i <= 18; i++)
    await scrollPreviewByRatio(page, i / 18)
  await waitForMarkerVisible(page, millionRestoreDeepMarker)
  await waitForMarkerVisible(page, millionRestoreEndMarker)
  await waitForPreviewSurfaceStable(page)
  await page.waitForTimeout(600)
  const scrollSnapshot = await captureVitalsSnapshot(page, 'million-scripted-scroll')
  assertMillionRestoreScrolled(scrollSnapshot, scrollSnapshot.label)
  const afterScrollMetrics = metricMap(await client.send('Performance.getMetrics'))
  scrollSnapshot.performanceDelta = deltaMetrics(afterScrollMetrics, beforeScrollMetrics)
  const scrollTrace = await stopTrace(scrollTraceClient)
  const scroll = await finalizeVitalsSnapshot(page, scrollSnapshot, scrollTrace)
  scroll.viewport = copyViewport(viewport)
  scroll.scrollInput = 'scripted-scrollTop'

  await context.close()
  return {
    viewport: copyViewport(viewport),
    contentLength: content.length,
    restore,
    interactions,
    scroll,
  }
}

async function runCodeBlockScenario(browser, port) {
  const shareId = 'web-vitals-codeblock-stream-diffs'
  const content = createCodeBlockMarkdown()
  const viewport = { width: 1440, height: 900 }
  await warmupScenarioContext(browser, port)
  const context = await createScenarioContext(
    browser,
    port,
    shareId,
    content,
    'stream-diffs',
    viewport,
    {
      disableViewportPriorityIdleDrain: true,
      codeBlockViewportRootMargin: '0px',
    },
  )
  const page = await context.newPage()
  const messages = attachPageDiagnostics(page)
  await exposeP95(page)
  const client = await page.context().newCDPSession(page)
  await client.send('Performance.enable')
  const beforeNavigate = metricMap(await client.send('Performance.getMetrics'))
  const traceClient = await startTrace(page)

  await page.goto(`/test?benchmark=1&view=preview&share=${shareId}`, { waitUntil: 'load' })
  await waitForVisible(page, '.workspace-card--preview', messages)
  await waitForVisible(page, '.markdown-renderer', messages)
  await waitForParse(page)
  await waitForVisibleCodeBlocksReady(page)
  await page.waitForTimeout(100)

  const initialSnapshot = await captureVitalsSnapshot(page, 'codeblock-initial-stream-diffs')
  const afterInitialMetrics = metricMap(await client.send('Performance.getMetrics'))
  initialSnapshot.performanceDelta = deltaMetrics(afterInitialMetrics, beforeNavigate)
  const initialTrace = await stopTrace(traceClient)
  const initial = await finalizeVitalsSnapshot(page, initialSnapshot, initialTrace)
  initial.viewport = copyViewport(viewport)
  assertVisibleCodeBlocksReady(initial, initial.label)
  assertOffscreenCodeBlocksDeferred(initial, initial.label)

  const beforeScrollReadiness = await captureVitalsSnapshot(page, 'codeblock-before-scroll-readiness')
  assertVisibleCodeBlocksReady(beforeScrollReadiness, beforeScrollReadiness.label)
  assertOffscreenCodeBlocksDeferred(beforeScrollReadiness, beforeScrollReadiness.label)

  const beforeScrollMetrics = metricMap(await client.send('Performance.getMetrics'))
  const scrollTraceClient = await startTrace(page)
  await resetPhase(page, 'codeblock-scroll-into-stream-diffs')
  for (let i = 1; i <= 8; i++) {
    await scrollPreviewByRatio(page, i / 8)
    await waitForVisibleCodeBlocksReady(page)
  }
  await page.waitForTimeout(600)
  const scrollSnapshot = await captureVitalsSnapshot(page, 'codeblock-scripted-scroll-into-stream-diffs')
  const afterScrollMetrics = metricMap(await client.send('Performance.getMetrics'))
  scrollSnapshot.performanceDelta = deltaMetrics(afterScrollMetrics, beforeScrollMetrics)
  const scrollTrace = await stopTrace(scrollTraceClient)
  const scroll = await finalizeVitalsSnapshot(page, scrollSnapshot, scrollTrace)
  scroll.viewport = copyViewport(viewport)
  scroll.scrollInput = 'scripted-scrollTop'
  assertCodeBlocksReady(scroll, scroll.label)

  await scrollPreviewByRatio(page, 0)
  await waitForVisibleCodeBlocksReady(page)
  await waitForFrames(page, 2)

  const interactions = []
  interactions.push(await runInteraction(page, 'codeblock-copy', async () => {
    await page.locator('.code-block-container .code-action-btn').first().click()
  }))
  interactions.push(await runInteraction(page, 'codeblock-collapse', async () => {
    await page.locator('.code-block-container .code-action-btn').nth(1).click()
  }))

  await context.close()
  return {
    viewport: copyViewport(viewport),
    contentLength: content.length,
    initial,
    interactions,
    scroll,
  }
}

function collectScenarioWarnings(name, scenario) {
  const warnings = []
  const navigationPhase = name === 'millionRestore'
    ? scenario.restore
    : scenario.initial
  const phases = name === 'millionRestore'
    ? [scenario.restore, scenario.scroll]
    : [scenario.initial, scenario.scroll]

  const navigationBudget = webVitalsPhaseBudgets[navigationPhase.label] ?? {}
  if (typeof navigationBudget.lcpMs === 'number' && !(navigationPhase.lcpMs > 0 && navigationPhase.lcpMs <= navigationBudget.lcpMs))
    warnings.push(`[${name}:${navigationPhase.label}] LCP exceeded ${navigationBudget.lcpMs}ms: ${navigationPhase.lcpMs}.`)
  for (const phase of phases) {
    const budget = webVitalsPhaseBudgets[phase.label] ?? {}
    if (typeof budget.phaseCls === 'number' && !(phase.phaseCls <= budget.phaseCls))
      warnings.push(`[${name}:${phase.label}] phase CLS exceeded ${budget.phaseCls}: ${phase.phaseCls}.`)
    if (typeof budget.phaseElapsedMs === 'number' && !(phase.phaseElapsedMs <= budget.phaseElapsedMs))
      warnings.push(`[${name}:${phase.label}] phase elapsed exceeded ${budget.phaseElapsedMs}ms: ${phase.phaseElapsedMs}.`)
    if (typeof budget.longTaskMaxMs === 'number' && !(phase.longTaskMaxMs <= budget.longTaskMaxMs))
      warnings.push(`[${name}:${phase.label}] max long task exceeded ${budget.longTaskMaxMs}ms: ${phase.longTaskMaxMs}.`)
    if (typeof budget.longTaskTotalMs === 'number' && !(phase.longTaskTotalMs <= budget.longTaskTotalMs))
      warnings.push(`[${name}:${phase.label}] total long task time exceeded ${budget.longTaskTotalMs}ms: ${phase.longTaskTotalMs}.`)
    if (typeof budget.frameP95Ms === 'number' && !(phase.frameP95Ms <= budget.frameP95Ms))
      warnings.push(`[${name}:${phase.label}] frame p95 exceeded ${budget.frameP95Ms}ms: ${phase.frameP95Ms}.`)
    if (typeof budget.frameMaxMs === 'number' && !(phase.frameMaxMs <= budget.frameMaxMs))
      warnings.push(`[${name}:${phase.label}] frame max exceeded ${budget.frameMaxMs}ms: ${phase.frameMaxMs}.`)
    if (typeof budget.minFrameSamplesPerSecond === 'number') {
      const phaseSeconds = Math.max(0.001, Number(phase.phaseElapsedMs || 0) / 1000)
      const samplesPerSecond = Number(phase.frameCount || 0) / phaseSeconds
      if (!(samplesPerSecond >= budget.minFrameSamplesPerSecond)) {
        warnings.push(
          `[${name}:${phase.label}] frame sample density below ${budget.minFrameSamplesPerSecond}/s: ${samplesPerSecond.toFixed(2)}/s from ${phase.frameCount} samples over ${phase.phaseElapsedMs}ms.`,
        )
      }
    }
    if (typeof budget.rendererDomNodeCount === 'number' && !(phase.rendererDomNodeCount <= budget.rendererDomNodeCount))
      warnings.push(`[${name}:${phase.label}] renderer DOM nodes exceeded ${budget.rendererDomNodeCount}: ${phase.rendererDomNodeCount}.`)
    if (phase.eventObserverError)
      warnings.push(`[${name}:${phase.label}] Event Timing observer failed: ${phase.eventObserverError}.`)
  }

  for (const interaction of scenario.interactions ?? []) {
    const budget = webVitalsInteractionBudgets[interaction.label] ?? {}
    warnings.push(...collectWebVitalsInteractionWarnings(name, interaction, budget))
  }

  return warnings
}

function assertScenario(result) {
  if (!isReleaseGate || !result.warnings.length)
    return
  throw new Error(`Web Vitals release gate failed:\n${result.warnings.map(warning => `- ${warning}`).join('\n')}`)
}

function collectResultWarnings(result) {
  return [
    ...(result.millionRestore ? collectScenarioWarnings('millionRestore', result.millionRestore) : []),
    ...(result.codeblockStreamDiffs ? collectScenarioWarnings('codeblockStreamDiffs', result.codeblockStreamDiffs) : []),
  ]
}

function checkpointWebVitalsResult(result) {
  result.warnings = collectResultWarnings(result)
  writeJsonResult(result)
}

async function run() {
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort()
  const server = startDevServer(port)
  let browser = null
  let browserCloseTimedOut = false
  const cleanup = () => killProcessTree(server.child)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)

  try {
    await waitForPort(port)
    browser = await chromium.launch(resolveChromeLaunchOptions())
    const browserVersion = await browser.version()

    const result = {
      environment: {
        generatedAt: new Date().toISOString(),
        browserVersion,
        host,
        port,
      },
    }

    result.millionRestore = await runMillionRestoreScenario(browser, port)
    checkpointWebVitalsResult(result)

    result.codeblockStreamDiffs = await runCodeBlockScenario(browser, port)
    checkpointWebVitalsResult(result)
    assertScenario(result)

    browserCloseTimedOut = await closeBrowser(browser) === 'timeout'
    browser = null
  }
  catch (error) {
    console.error('[e2e-web-vitals-performance] failed')
    console.error(error)
    console.error(server.getLogs())
    process.exitCode = 1
  }
  finally {
    if (browser) {
      browserCloseTimedOut = await closeBrowser(browser) === 'timeout'
    }
    cleanup()
    if (browserCloseTimedOut)
      process.exit(process.exitCode ?? 0)
  }
}

run()
