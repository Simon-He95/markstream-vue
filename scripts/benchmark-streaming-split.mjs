#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const sourceRoot = process.env.MARKSTREAM_BENCHMARK_SOURCE_ROOT
  ? path.resolve(process.env.MARKSTREAM_BENCHMARK_SOURCE_ROOT)
  : repoRoot
const fixtureRoot = path.join(repoRoot, 'test/benchmark/streaming-split')
const outputDir = path.resolve(repoRoot, process.env.MARKSTREAM_STREAMING_SPLIT_OUTPUT_DIR || '.tmp/benchmark/streaming-split')
const outputJsonPath = path.join(outputDir, 'latest.json')
const outputMarkdownPath = path.join(outputDir, 'latest.md')
const baselinePath = process.env.MARKSTREAM_STREAMING_SPLIT_BASELINE
  ? path.resolve(repoRoot, process.env.MARKSTREAM_STREAMING_SPLIT_BASELINE)
  : null

const targetChunks = Number(process.env.MARKSTREAM_STREAMING_SPLIT_CHUNKS || 119)
const chunkSize = Number(process.env.MARKSTREAM_STREAMING_SPLIT_CHUNK_SIZE || 18)
const repeats = Number(process.env.MARKSTREAM_STREAMING_SPLIT_REPEATS || 3)
const warmups = Number(process.env.MARKSTREAM_STREAMING_SPLIT_WARMUPS || 0)
const intervalMs = Number(process.env.MARKSTREAM_STREAMING_SPLIT_INTERVAL_MS || 16)
const timeoutMs = Number(process.env.MARKSTREAM_STREAMING_SPLIT_TIMEOUT_MS || 120000)
const stableFrames = Number(process.env.MARKSTREAM_STREAMING_SPLIT_STABLE_FRAMES || 4)
const cpuThrottleRate = Number(process.env.MARKSTREAM_STREAMING_SPLIT_CPU_THROTTLE_RATE || 1)
const smoothMaxCharsPerSecond = Number(process.env.MARKSTREAM_STREAMING_SPLIT_SMOOTH_MAX_CPS || 3000)
const smoothMaxCharsPerCommit = Number(process.env.MARKSTREAM_STREAMING_SPLIT_SMOOTH_MAX_CHARS || 160)
const smoothMaxCommitFps = Number(process.env.MARKSTREAM_STREAMING_SPLIT_SMOOTH_MAX_FPS || 20)
const skipConfigProbe = process.env.MARKSTREAM_STREAMING_SPLIT_SKIP_CONFIG_PROBE === '1'
const traceEnabled = process.env.MARKSTREAM_STREAMING_SPLIT_TRACE === '1'
const cpuProfileEnabled = process.env.MARKSTREAM_STREAMING_SPLIT_CPU_PROFILE === '1'
const selectedCaseIds = (process.env.MARKSTREAM_STREAMING_SPLIT_CASES || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
const selectedRendererIds = (process.env.MARKSTREAM_STREAMING_SPLIT_RENDERERS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
const includeCssHighlight = process.env.MARKSTREAM_STREAMING_SPLIT_INCLUDE_CSS_HIGHLIGHT === '1'

if (!Number.isFinite(targetChunks) || targetChunks <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_CHUNKS must be a positive number.')
if (!Number.isFinite(chunkSize) || chunkSize <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_CHUNK_SIZE must be a positive number.')
if (!Number.isFinite(repeats) || repeats <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_REPEATS must be a positive number.')
if (!Number.isInteger(warmups) || warmups < 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_WARMUPS must be a non-negative integer.')
if (!Number.isFinite(intervalMs) || intervalMs < 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_INTERVAL_MS must be a non-negative number.')
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_TIMEOUT_MS must be a positive number.')
if (!Number.isInteger(stableFrames) || stableFrames <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_STABLE_FRAMES must be a positive integer.')
if (!Number.isFinite(cpuThrottleRate) || cpuThrottleRate < 1)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_CPU_THROTTLE_RATE must be at least 1.')
if (!Number.isFinite(smoothMaxCharsPerSecond) || smoothMaxCharsPerSecond <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_SMOOTH_MAX_CPS must be a positive number.')
if (!Number.isFinite(smoothMaxCharsPerCommit) || smoothMaxCharsPerCommit <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_SMOOTH_MAX_CHARS must be a positive number.')
if (!Number.isFinite(smoothMaxCommitFps) || smoothMaxCommitFps <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_SMOOTH_MAX_FPS must be a positive number.')

const allCases = [
  {
    id: 'plain',
    label: 'Plain text + headings',
    block: [
      '# Streaming answer\n\n',
      '解释 debounce 的核心思路，并给出前端业务里常见的落地方式。\n\n',
      '高频输入不会每次都打到业务逻辑，而是先进入等待窗口，最终只触发最后一次调用。\n\n',
      '## 关键收益\n\n',
      '它让 UI 更新节奏更稳定，也让请求、取消和 loading 状态更容易维护。\n\n',
    ].join(''),
  },
  {
    id: 'list',
    label: 'Lists',
    block: [
      '## Checklist\n\n',
      '- 搜索框自动补全\n',
      '- resize / scroll 事件\n',
      '- Agent 面板连续 token 合并\n',
      '- 保留滚动位置\n',
      '- 避免重复创建整块 DOM\n\n',
    ].join(''),
  },
  {
    id: 'table',
    label: 'Tables',
    block: [
      '## 对比\n\n',
      '| 方案 | 触发次数 | 用户感受 |\n',
      '| --- | ---: | --- |\n',
      '| 不处理 | 每个 key stroke | 请求抖动，列表闪烁 |\n',
      '| debounce | 最后一次输入 | 节奏稳定 |\n',
      '| throttle | 固定窗口一次 | 适合滚动 |\n\n',
    ].join(''),
  },
  {
    id: 'code-ts',
    label: 'TypeScript code fences',
    block: [
      '```ts\n',
      'export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {\n',
      '  let timer: ReturnType<typeof setTimeout> | undefined\n',
      '  return (...args: Parameters<T>) => {\n',
      '    if (timer) clearTimeout(timer)\n',
      '    timer = setTimeout(() => fn(...args), wait)\n',
      '  }\n',
      '}\n',
      '```\n\n',
    ].join(''),
  },
  {
    id: 'code-diff',
    label: 'Diff code fences',
    block: [
      '```diff\n',
      '- input.addEventListener(\'input\', run)\n',
      '+ input.addEventListener(\'input\', debounce(run, 300))\n',
      '- render(markdown)\n',
      '+ scheduleRender(markdown)\n',
      '```\n\n',
    ].join(''),
  },
  {
    id: 'mermaid-source',
    label: 'Mermaid fences as source',
    block: [
      '```mermaid\n',
      'graph LR\n',
      '  input[Input] --> timer[Timer]\n',
      '  timer --> api[Search API]\n',
      '  api --> view[Result View]\n',
      '```\n\n',
    ].join(''),
  },
  {
    id: 'blockquote',
    label: 'Blockquotes',
    block: [
      '> final: 代码块、表格、Mermaid 源码、diff 和滚动位置都应该稳定落地。\n\n',
      '> 关键不是把每个 chunk 都同步提交，而是让用户看到稳定的增长过程。\n\n',
    ].join(''),
  },
  {
    id: 'full-mix',
    label: 'Full mixed workload',
    block: [
      '# Streaming renderer benchmark\n\n',
      '解释 debounce 的核心思路，并给出前端业务里常见的落地方式。\n\n',
      '- 搜索框自动补全\n',
      '- resize / scroll 这类高频事件\n',
      '- Agent 面板里需要合并连续 token 的 UI 更新\n\n',
      '```ts\n',
      'const run = debounce((value: string) => search(value), 300)\n',
      'input.addEventListener(\'input\', (event) => run((event.target as HTMLInputElement).value))\n',
      '```\n\n',
      '| 方案 | 触发次数 | 用户感受 |\n',
      '| --- | ---: | --- |\n',
      '| 不处理 | 每个 key stroke | 请求抖动 |\n',
      '| debounce | 最后一次输入 | 节奏稳定 |\n\n',
      '```diff\n',
      '- input.addEventListener(\'input\', run)\n',
      '+ input.addEventListener(\'input\', debounce(run, 300))\n',
      '```\n\n',
      '```mermaid\n',
      'graph LR\n',
      '  input[Input] --> timer[Timer]\n',
      '  timer --> api[Search API]\n',
      '```\n\n',
      '> final: 代码块、表格、Mermaid 源码、diff 和滚动位置都应该稳定落地。\n\n',
    ].join(''),
  },
]

const cases = selectedCaseIds.length
  ? allCases.filter(testCase => selectedCaseIds.includes(testCase.id))
  : allCases

const missingCases = selectedCaseIds.filter(id => !allCases.some(testCase => testCase.id === id))
if (missingCases.length)
  throw new Error(`Unknown streaming split benchmark cases: ${missingCases.join(', ')}`)

const allPrimaryRenderers = [
  { id: 'streamdown', renderer: 'streamdown', variant: null },
  { id: 'markstream-local', renderer: 'markstream', variant: 'incremental' },
]
if (includeCssHighlight || selectedRendererIds.some(id => id.startsWith('markstream-css-highlight-'))) {
  allPrimaryRenderers.push(
    { id: 'markstream-css-highlight-local', renderer: 'markstream', variant: 'css-highlight-local' },
    // Deliberately explicit until a pure transferable tokenizer and worker
    // lifecycle are implemented. The fixture records this as unavailable
    // instead of accidentally benchmarking the main-thread implementation.
    { id: 'markstream-css-highlight-worker', renderer: 'markstream', variant: 'css-highlight-worker' },
  )
}

const primaryRenderers = selectedRendererIds.length
  ? allPrimaryRenderers.filter(renderer => selectedRendererIds.includes(renderer.id))
  : allPrimaryRenderers

const missingRenderers = selectedRendererIds.filter(id => !allPrimaryRenderers.some(renderer => renderer.id === id))
if (missingRenderers.length)
  throw new Error(`Unknown streaming split benchmark renderers: ${missingRenderers.join(', ')}`)

const markstreamProbe = [
  { id: 'markstream-local', renderer: 'markstream', variant: 'incremental' },
  { id: 'markstream-local-nosmooth', renderer: 'markstream', variant: 'incremental-nosmooth' },
  { id: 'markstream-local-window', renderer: 'markstream', variant: 'window' },
]

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function packageVersion(packageName, fallback = 'unknown') {
  const packageJsonPath = packageName === 'markstream-vue'
    ? path.join(repoRoot, 'package.json')
    : path.join(repoRoot, 'node_modules', packageName, 'package.json')
  if (!existsSync(packageJsonPath))
    return fallback
  return readJsonFile(packageJsonPath).version || fallback
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

function createChunks(block) {
  let content = ''
  while (content.length < targetChunks * chunkSize)
    content += block
  content = content.slice(0, targetChunks * chunkSize)
  const chunks = []
  for (let index = 0; index < content.length; index += chunkSize)
    chunks.push(content.slice(index, index + chunkSize))
  return chunks.slice(0, targetChunks)
}

function metricMap(metrics) {
  return Object.fromEntries(metrics.metrics.map(metric => [metric.name, metric.value]))
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits))
}

async function getMetrics(client) {
  return metricMap(await client.send('Performance.getMetrics'))
}

async function readProtocolStream(client, handle) {
  const chunks = []
  while (true) {
    const result = await client.send('IO.read', { handle })
    chunks.push(result.base64Encoded ? Buffer.from(result.data, 'base64').toString('utf8') : result.data)
    if (result.eof)
      break
  }
  await client.send('IO.close', { handle })
  return chunks.join('')
}

function summarizeTrace(traceEvents) {
  const trackedNames = ['Paint', 'CompositeLayers', 'RasterTask']
  const summary = {}
  for (const name of trackedNames) {
    const events = traceEvents.filter(event => event.name === name && event.ph === 'X')
    const key = name[0].toLowerCase() + name.slice(1)
    summary[`${key}Count`] = events.length
    summary[`${key}DurationMs`] = events.reduce((total, event) => total + (event.dur || 0), 0) / 1000
  }
  const totals = new Map()
  for (const event of traceEvents) {
    if (event.ph !== 'X' || !Number.isFinite(event.dur) || event.dur <= 0)
      continue
    const current = totals.get(event.name) ?? { name: event.name, count: 0, durationMs: 0, maxMs: 0 }
    const durationMs = event.dur / 1000
    current.count += 1
    current.durationMs += durationMs
    current.maxMs = Math.max(current.maxMs, durationMs)
    totals.set(event.name, current)
  }
  summary.traceTopEvents = Array.from(totals.values())
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 30)
    .map(event => ({
      ...event,
      durationMs: round(event.durationMs),
      maxMs: round(event.maxMs),
    }))
  return summary
}

async function stopTracing(client) {
  const completed = new Promise(resolve => client.once('Tracing.tracingComplete', resolve))
  await client.send('Tracing.end')
  const { stream } = await completed
  const payload = JSON.parse(await readProtocolStream(client, stream))
  return summarizeTrace(payload.traceEvents || [])
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function summarizeCpuProfile(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]))
  const totals = new Map()
  for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
    const node = nodes.get(profile.samples[index])
    if (!node)
      continue
    const frame = node.callFrame
    const key = `${frame.functionName}\n${frame.url}\n${frame.lineNumber}`
    const current = totals.get(key) ?? {
      functionName: frame.functionName || '(anonymous)',
      url: frame.url,
      line: frame.lineNumber + 1,
      selfTimeMs: 0,
      samples: 0,
    }
    current.selfTimeMs += (profile.timeDeltas?.[index] ?? 0) / 1000
    current.samples += 1
    totals.set(key, current)
  }
  return Array.from(totals.values())
    .sort((a, b) => b.selfTimeMs - a.selfTimeMs)
    .slice(0, 30)
    .map(entry => ({ ...entry, selfTimeMs: round(entry.selfTimeMs) }))
}

function medianResult(runs) {
  const keys = [
    'totalMs',
    'transportMs',
    'caughtUpMs',
    'settleMs',
    'p95UpdateMs',
    'maxUpdateMs',
    'avgUpdateMs',
    'longTaskCount',
    'longTaskTotalMs',
    'longTaskMaxMs',
    'mutationCount',
    'domNodes',
    'heightJumps',
    'frameP95Ms',
    'frameMaxMs',
    'droppedFrameEstimate',
    'heapPeakMB',
    'taskDurationMs',
    'taskBusyRatio',
    'taskOtherDurationMs',
    'threadTimeMs',
    'processTimeMs',
    'scriptDurationMs',
    'layoutDurationMs',
    'layoutCount',
    'recalcStyleDurationMs',
    'recalcStyleCount',
    'jsHeapUsedMB',
    'jsHeapDeltaMB',
  ]
  if (traceEnabled) {
    keys.push(
      'paintCount',
      'paintDurationMs',
      'compositeLayersCount',
      'compositeLayersDurationMs',
      'rasterTaskCount',
      'rasterTaskDurationMs',
    )
  }
  const output = {}
  for (const key of keys)
    output[key] = round(median(runs.map(run => run[key])))
  const representative = runs.slice().sort((a, b) => a.totalMs - b.totalMs)[Math.floor(runs.length / 2)]
  output.elementCounts = representative.elementCounts
  output.correctness = representative.correctness
  output.phases = representative.phases
  output.streaming = representative.streaming
    ? Object.fromEntries(Object.keys(representative.streaming).map(key => [key, round(median(runs.map(run => run.streaming?.[key] ?? 0)))]))
    : null
  output.cssHighlight = representative.cssHighlight
    ? Object.fromEntries(Object.keys(representative.cssHighlight).map((key) => {
        const values = runs.map(run => run.cssHighlight?.[key]).filter(value => typeof value === 'number')
        return [key, values.length ? round(median(values)) : representative.cssHighlight[key]]
      }))
    : null
  if (traceEnabled)
    output.traceTopEvents = representative.traceTopEvents
  return output
}

async function runOnce(browser, port, rendererConfig, chunks, caseId) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      consoleErrors.push(message.text())
  })
  const client = await page.context().newCDPSession(page)
  await client.send('Performance.enable')
  const params = new URLSearchParams({ renderer: rendererConfig.renderer })
  if (rendererConfig.variant)
    params.set('variant', rendererConfig.variant)
  params.set('smoothMaxCps', String(smoothMaxCharsPerSecond))
  params.set('smoothMaxChars', String(smoothMaxCharsPerCommit))
  params.set('smoothMaxFps', String(smoothMaxCommitFps))
  await page.goto(`http://127.0.0.1:${port}/?${params.toString()}`, { waitUntil: 'load' })
  try {
    await page.waitForFunction(() => window.__ready === true)
  }
  catch (error) {
    const overlayText = await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay')
      return overlay?.shadowRoot?.textContent || ''
    }).catch(() => '')
    const content = await page.content().catch(() => '')
    await page.close()
    throw new Error([
      error.message,
      overlayText ? `vite overlay:\n${overlayText.slice(0, 4000)}` : '',
      pageErrors.length ? `page errors:\n${pageErrors.join('\n')}` : '',
      consoleErrors.length ? `console errors:\n${consoleErrors.join('\n')}` : '',
      content ? `html:\n${content.slice(0, 2000)}` : '',
    ].filter(Boolean).join('\n\n'))
  }
  if (cpuThrottleRate > 1)
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottleRate })
  await client.send('HeapProfiler.collectGarbage').catch(() => {})
  const endMarker = `MARKSTREAM_BENCH_END_${caseId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
  const expectedContent = `${chunks.join('')}\n\n${endMarker}\n`
  if (traceEnabled) {
    await client.send('Tracing.start', {
      categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc',
      transferMode: 'ReturnAsStream',
    })
  }
  if (cpuProfileEnabled) {
    await client.send('Profiler.enable')
    await client.send('Profiler.start')
  }
  const before = await getMetrics(client)
  const result = await page.evaluate(options => window.__runBenchmark(options), {
    chunks,
    intervalMs,
    endMarker,
    timeoutMs,
    stableFrames,
  })
  const after = await getMetrics(client)
  const cpuProfile = cpuProfileEnabled
    ? summarizeCpuProfile((await client.send('Profiler.stop')).profile)
    : undefined
  const trace = traceEnabled ? await stopTracing(client) : {}
  const correctness = await page.evaluate(options => window.__verifyBenchmarkResult(options), {
    expectedContent,
    targetSnapshot: result.targetSnapshot,
    timeoutMs,
    stableFrames,
  })
  await page.close()
  const taskDurationMs = (after.TaskDuration - before.TaskDuration) * 1000
  return {
    chunks: result.chunks,
    transportChunks: result.transportChunks,
    contentChars: result.contentChars,
    totalMs: result.totalMs,
    transportMs: result.transportMs,
    caughtUpMs: result.caughtUpMs,
    settleMs: result.settleMs,
    phases: result.phases,
    streaming: result.streaming,
    cssHighlight: result.cssHighlight,
    stableFrames: result.stableFrames,
    finalCommitted: result.finalCommitted,
    endMarkerVisible: result.endMarkerVisible,
    p95UpdateMs: result.p95UpdateMs,
    maxUpdateMs: result.maxUpdateMs,
    avgUpdateMs: result.avgUpdateMs,
    longTaskCount: result.longTaskCount,
    longTaskTotalMs: result.longTaskTotalMs,
    longTaskMaxMs: result.longTaskMaxMs,
    longTaskTimeline: result.longTaskTimeline,
    markerSeenMs: result.markerSeenMs,
    mutationCount: result.mutationCount,
    domNodes: result.domNodes,
    elementCounts: result.elementCounts,
    heightJumps: result.heightJumps,
    frameP95Ms: result.frameP95Ms,
    frameMaxMs: result.frameMaxMs,
    droppedFrameEstimate: result.droppedFrameEstimate,
    heapPeakMB: result.heapPeakMB,
    taskDurationMs,
    taskBusyRatio: taskDurationMs / result.totalMs,
    taskOtherDurationMs: (after.TaskOtherDuration - before.TaskOtherDuration) * 1000,
    threadTimeMs: (after.ThreadTime - before.ThreadTime) * 1000,
    processTimeMs: (after.ProcessTime - before.ProcessTime) * 1000,
    scriptDurationMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
    layoutDurationMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    layoutCount: after.LayoutCount - before.LayoutCount,
    recalcStyleDurationMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
    recalcStyleCount: after.RecalcStyleCount - before.RecalcStyleCount,
    jsHeapUsedMB: after.JSHeapUsedSize / 1024 / 1024,
    jsHeapDeltaMB: (after.JSHeapUsedSize - before.JSHeapUsedSize) / 1024 / 1024,
    ...trace,
    cpuProfile,
    correctness,
  }
}

async function runAggregate(browser, port, rendererConfig, chunks, caseId) {
  for (let index = 0; index < warmups; index++)
    await runOnce(browser, port, rendererConfig, chunks, caseId)

  const runs = []
  for (let index = 0; index < repeats; index++)
    runs.push(await runOnce(browser, port, rendererConfig, chunks, caseId))
  return {
    id: rendererConfig.id,
    renderer: rendererConfig.renderer,
    variant: rendererConfig.variant,
    chunks: targetChunks,
    median: medianResult(runs),
    runs: runs.map(run => ({
      ...run,
      totalMs: round(run.totalMs),
      transportMs: round(run.transportMs),
      caughtUpMs: round(run.caughtUpMs),
      settleMs: round(run.settleMs),
      p95UpdateMs: round(run.p95UpdateMs),
      maxUpdateMs: round(run.maxUpdateMs),
      avgUpdateMs: round(run.avgUpdateMs),
      ...(run.streaming ? { streaming: Object.fromEntries(Object.entries(run.streaming).map(([key, value]) => [key, round(value)])) } : {}),
      ...(run.cssHighlight ? { cssHighlight: run.cssHighlight } : {}),
      frameP95Ms: round(run.frameP95Ms),
      frameMaxMs: round(run.frameMaxMs),
      heapPeakMB: round(run.heapPeakMB),
      longTaskTotalMs: round(run.longTaskTotalMs),
      longTaskMaxMs: round(run.longTaskMaxMs),
      taskDurationMs: round(run.taskDurationMs),
      taskOtherDurationMs: round(run.taskOtherDurationMs),
      threadTimeMs: round(run.threadTimeMs),
      processTimeMs: round(run.processTimeMs),
      scriptDurationMs: round(run.scriptDurationMs),
      layoutDurationMs: round(run.layoutDurationMs),
      recalcStyleDurationMs: round(run.recalcStyleDurationMs),
      jsHeapUsedMB: round(run.jsHeapUsedMB),
      jsHeapDeltaMB: round(run.jsHeapDeltaMB),
      ...(traceEnabled
        ? {
            paintDurationMs: round(run.paintDurationMs),
            compositeLayersDurationMs: round(run.compositeLayersDurationMs),
            rasterTaskDurationMs: round(run.rasterTaskDurationMs),
          }
        : {}),
    })),
  }
}

function getMedian(splitCase, idPrefix) {
  return splitCase.results.find(result => result.id === idPrefix || result.id.startsWith(idPrefix))?.median
}

function formatMs(value) {
  return `${round(value, 1)}ms`
}

function formatMb(value) {
  return `${round(value, 1)}MB`
}

function formatPercent(value) {
  return `${round(value * 100, 1)}%`
}

function delta(value, unit = '') {
  const rounded = round(value, 1)
  return `${rounded > 0 ? '+' : ''}${rounded}${unit}`
}

function metricPair(before, after, key, unit = 'ms') {
  const format = unit === 'MB' ? formatMb : formatMs
  return `${format(before[key])} -> ${format(after[key])} (${delta(after[key] - before[key], unit)})`
}

function metricNumberPair(before, after, key) {
  return `${before[key]} -> ${after[key]} (${after[key] - before[key] > 0 ? '+' : ''}${after[key] - before[key]})`
}

function renderPrimaryTable(split) {
  const lines = [
    '| Case | Task S->M | Layout S->M | Script S->M | DOM S->M | Heap S->M | p95 S->M |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]

  for (const splitCase of split) {
    const streamdown = getMedian(splitCase, 'streamdown')
    const markstream = getMedian(splitCase, 'markstream-local')
    if (!streamdown || !markstream)
      continue
    lines.push(`| ${splitCase.id} | ${metricPair(streamdown, markstream, 'taskDurationMs')} | ${metricPair(streamdown, markstream, 'layoutDurationMs')} | ${metricPair(streamdown, markstream, 'scriptDurationMs')} | ${metricNumberPair(streamdown, markstream, 'domNodes')} | ${metricPair(streamdown, markstream, 'jsHeapUsedMB', 'MB')} | ${metricPair(streamdown, markstream, 'p95UpdateMs')} |`)
  }

  return lines.join('\n')
}

function renderBaselineTable(current, baseline) {
  const lines = [
    '| Case | Task baseline->current | Layout baseline->current | Script baseline->current | DOM baseline->current | Heap baseline->current | p95 baseline->current |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]

  for (const currentCase of current.split) {
    const baselineCase = baseline.split.find(splitCase => splitCase.id === currentCase.id)
    if (!baselineCase)
      continue
    const before = getMedian(baselineCase, 'markstream-local')
    const after = getMedian(currentCase, 'markstream-local')
    lines.push(`| ${currentCase.id} | ${metricPair(before, after, 'taskDurationMs')} | ${metricPair(before, after, 'layoutDurationMs')} | ${metricPair(before, after, 'scriptDurationMs')} | ${metricNumberPair(before, after, 'domNodes')} | ${metricPair(before, after, 'jsHeapUsedMB', 'MB')} | ${metricPair(before, after, 'p95UpdateMs')} |`)
  }

  return lines.join('\n')
}

function renderHotspots(split) {
  const rows = []
  for (const splitCase of split) {
    const streamdown = getMedian(splitCase, 'streamdown')
    const markstream = getMedian(splitCase, 'markstream-local')
    if (streamdown && markstream) {
      rows.push({
        id: splitCase.id,
        layoutDelta: markstream.layoutDurationMs - streamdown.layoutDurationMs,
        taskDelta: markstream.taskDurationMs - streamdown.taskDurationMs,
        domDelta: markstream.domNodes - streamdown.domNodes,
        heapDelta: markstream.jsHeapUsedMB - streamdown.jsHeapUsedMB,
      })
    }
  }

  const hotspots = rows
    .filter(row => row.layoutDelta > 1 || row.taskDelta > 1 || row.domDelta > 0 || row.heapDelta > 1)
    .sort((a, b) => b.layoutDelta - a.layoutDelta)

  if (!hotspots.length)
    return 'No positive deltas against streamdown in task/layout/DOM/heap.'

  return hotspots
    .map((row) => {
      const parts = []
      if (row.layoutDelta > 1)
        parts.push(`layout ${delta(row.layoutDelta, 'ms')}`)
      if (row.taskDelta > 1)
        parts.push(`task ${delta(row.taskDelta, 'ms')}`)
      if (row.domDelta > 0)
        parts.push(`DOM ${delta(row.domDelta)}`)
      if (row.heapDelta > 1)
        parts.push(`heap ${delta(row.heapDelta, 'MB')}`)
      return `- ${row.id}: ${parts.join(', ')}`
    })
    .join('\n')
}

function renderConfigProbe(configProbe) {
  const lines = [
    '| Variant | Task | Script | Layout | Recalc | DOM | Heap | p95 | Jumps |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const result of configProbe.results) {
    const metric = result.median
    lines.push(`| ${result.id} | ${formatMs(metric.taskDurationMs)} | ${formatMs(metric.scriptDurationMs)} | ${formatMs(metric.layoutDurationMs)} | ${formatMs(metric.recalcStyleDurationMs)} | ${metric.domNodes} | ${formatMb(metric.jsHeapUsedMB)} | ${formatMs(metric.p95UpdateMs)} | ${metric.heightJumps} |`)
  }
  return lines.join('\n')
}

function renderCompletionTable(split) {
  const lines = [
    '| Case | Renderer | Total | Caught up | Main-thread busy | Stream commit avg/p95/max | CSS tokenize/range/registry | Long tasks count/total/max | Frame p95/max | Layout count/time | Recalc count/time | Peak heap | Mutations | DOM | Correct |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ]
  for (const splitCase of split) {
    for (const result of splitCase.results) {
      if (result.status === 'unavailable') {
        lines.push(`| ${splitCase.id} | ${result.id} | unavailable | unavailable | unavailable | unavailable | ${result.reason.replaceAll('|', '\\|')} | - | - | - | - | - | - | - | - |`)
        continue
      }
      const metric = result.median
      const stream = metric.streaming
      const css = metric.cssHighlight
      const streamText = stream ? `${formatMs(stream.avgCommitMs)} / ${formatMs(stream.p95CommitMs)} / ${formatMs(stream.maxCommitMs)}` : '-'
      const cssText = css ? `${formatMs(css.tokenizeMs)} / ${formatMs(css.rangeBuildMs)} / ${formatMs(css.registryMs)}` : '-'
      lines.push(`| ${splitCase.id} | ${result.id} | ${formatMs(metric.totalMs)} | ${formatMs(metric.caughtUpMs)} | ${formatPercent(metric.taskBusyRatio)} | ${streamText} | ${cssText} | ${metric.longTaskCount} / ${formatMs(metric.longTaskTotalMs)} / ${formatMs(metric.longTaskMaxMs)} | ${formatMs(metric.frameP95Ms)} / ${formatMs(metric.frameMaxMs)} | ${metric.layoutCount} / ${formatMs(metric.layoutDurationMs)} | ${metric.recalcStyleCount} / ${formatMs(metric.recalcStyleDurationMs)} | ${formatMb(metric.heapPeakMB)} | ${metric.mutationCount} | ${metric.domNodes} | ${metric.correctness ? 'yes' : 'no'} |`)
    }
  }
  return lines.join('\n')
}

function renderTraceTable(split) {
  const lines = [
    '| Case | Renderer | Paint count/time | CompositeLayers count/time | Raster count/time |',
    '| --- | --- | ---: | ---: | ---: |',
  ]
  for (const splitCase of split) {
    for (const result of splitCase.results) {
      const metric = result.median
      lines.push(`| ${splitCase.id} | ${result.id} | ${metric.paintCount} / ${formatMs(metric.paintDurationMs)} | ${metric.compositeLayersCount} / ${formatMs(metric.compositeLayersDurationMs)} | ${metric.rasterTaskCount} / ${formatMs(metric.rasterTaskDurationMs)} |`)
    }
  }
  return lines.join('\n')
}

function renderMarkdown(payload, baseline) {
  const sections = [
    '# Streaming Split Benchmark',
    '',
    `Generated: ${payload.generatedAt}`,
    `Method: ${payload.method}`,
    `Versions: streamdown@${payload.versions.streamdown}, markstream-vue@${payload.versions.markstreamVue}`,
    '',
    '## Completion, responsiveness, and correctness',
    '',
    renderCompletionTable(payload.split),
    '',
    '## Current: streamdown -> markstream-vue',
    '',
    renderPrimaryTable(payload.split),
    '',
    '## Hotspots',
    '',
    renderHotspots(payload.split),
    '',
    '## Full-mix markstream config probe',
    '',
    renderConfigProbe(payload.configProbe),
  ]

  if (payload.config.traceEnabled) {
    sections.push(
      '',
      '## CDP trace rendering work',
      '',
      renderTraceTable(payload.split),
    )
  }

  if (baseline) {
    sections.push(
      '',
      `## Baseline delta: ${path.basename(baselinePath)}`,
      '',
      renderBaselineTable(payload, baseline),
    )
  }

  return `${sections.join('\n')}\n`
}

async function createBenchmarkServer() {
  const server = await createServer({
    root: fixtureRoot,
    logLevel: 'silent',
    plugins: [vue()],
    resolve: {
      alias: [
        { find: 'markstream-vue/index.css', replacement: path.join(sourceRoot, 'src/index.css') },
        { find: 'markstream-core', replacement: path.join(sourceRoot, 'packages/markstream-core/src/index.ts') },
        { find: 'stream-markdown-parser', replacement: path.join(sourceRoot, 'packages/markdown-parser/src/index.ts') },
        { find: 'markstream-vue', replacement: path.join(sourceRoot, 'src/exports.ts') },
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 4181,
      strictPort: false,
      fs: { allow: [repoRoot, sourceRoot] },
    },
  })
  await server.listen()
  const address = server.httpServer?.address()
  const port = typeof address === 'object' && address ? address.port : server.config.server.port
  return { server, port }
}

async function main() {
  const { server, port } = await createBenchmarkServer()
  const browser = await chromium.launch(resolveChromeLaunchOptions())

  try {
    const split = []
    for (const testCase of cases) {
      const chunks = createChunks(testCase.block)
      const results = []
      for (const rendererConfig of primaryRenderers) {
        console.log(`case=${testCase.id} renderer=${rendererConfig.id}`)
        try {
          results.push(await runAggregate(browser, port, rendererConfig, chunks, testCase.id))
        }
        catch (error) {
          results.push({
            id: rendererConfig.id,
            renderer: rendererConfig.renderer,
            variant: rendererConfig.variant,
            status: 'unavailable',
            reason: String(error?.message || error),
          })
        }
      }
      split.push({
        id: testCase.id,
        label: testCase.label,
        chunkSize,
        chunks: targetChunks,
        results,
      })
    }

    const configProbe = []
    if (!skipConfigProbe) {
      const fullMix = allCases.find(testCase => testCase.id === 'full-mix')
      const fullMixChunks = createChunks(fullMix.block)
      for (const rendererConfig of markstreamProbe) {
        console.log(`probe=full-mix renderer=${rendererConfig.id}`)
        configProbe.push(await runAggregate(browser, port, rendererConfig, fullMixChunks, fullMix.id))
      }
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      source: 'scripts/benchmark-streaming-split.mjs',
      fixture: 'test/benchmark/streaming-split',
      method: `${warmups} warm-up + ${repeats}-run median, Playwright Core + Chrome CDP, ${targetChunks} transport chunks plus end marker per case, ${chunkSize} chars per transport chunk, ${intervalMs}ms transport cadence, ${cpuThrottleRate}x CPU throttle after page ready, smooth ${smoothMaxCharsPerSecond} cps/${smoothMaxCharsPerCommit} chars/${smoothMaxCommitFps} fps, ${stableFrames} stable frames`,
      config: {
        targetChunks,
        chunkSize,
        repeats,
        warmups,
        intervalMs,
        timeoutMs,
        stableFrames,
        cpuThrottleRate,
        smoothMaxCharsPerSecond,
        smoothMaxCharsPerCommit,
        smoothMaxCommitFps,
        skipConfigProbe,
        traceEnabled,
        cpuProfileEnabled,
        sourceRoot,
        renderers: primaryRenderers.map(renderer => renderer.id),
      },
      versions: {
        streamdown: packageVersion('streamdown'),
        markstreamVue: `${packageVersion('markstream-vue')} source`,
      },
      split,
      configProbe: {
        case: 'full-mix',
        results: configProbe,
      },
    }

    const baseline = baselinePath && existsSync(baselinePath) ? readJsonFile(baselinePath) : null
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`)
    writeFileSync(outputMarkdownPath, renderMarkdown(payload, baseline))
    console.log(`wrote ${path.relative(repoRoot, outputJsonPath)}`)
    console.log(`wrote ${path.relative(repoRoot, outputMarkdownPath)}`)
  }
  finally {
    await browser.close()
    await server.close()
  }
}

await main()
