#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { arch, platform, release, totalmem, type } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
import { build, createServer, preview } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const sourceRoot = path.resolve(repoRoot, process.env.MARKSTREAM_BENCHMARK_SOURCE_ROOT || '.')
const outputDir = path.resolve(repoRoot, process.env.MARKSTREAM_REAL_CORPUS_OUTPUT_DIR || '.tmp/perf-real-corpus')
const fixtureRoot = path.join(outputDir, 'fixture')
const outputJsonPath = path.join(outputDir, 'latest.json')
const outputMarkdownPath = path.join(outputDir, 'latest.md')
const parserDistPath = path.join(repoRoot, 'packages/markdown-parser/dist/index.js')
const coreDistPath = path.join(repoRoot, 'packages/markstream-core/dist/index.js')

const parserRounds = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_PARSER_ROUNDS', 7)
const parserWarmups = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_PARSER_WARMUPS', 2)
const streamChunkCount = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_STREAM_CHUNKS', 120)
const browserRepeats = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_BROWSER_REPEATS', 3)
const browserStreamChunks = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_BROWSER_STREAM_CHUNKS', 96)
const browserStreamIntervalMs = readNonNegativeNumberEnv('MARKSTREAM_REAL_CORPUS_BROWSER_STREAM_INTERVAL_MS', 8)
const browserSmoothStreamingOptions = readJsonObjectEnv('MARKSTREAM_REAL_CORPUS_SMOOTH_OPTIONS_JSON')
const browserViewportWidth = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_BROWSER_VIEWPORT_WIDTH', 1280)
const browserViewportHeight = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_BROWSER_VIEWPORT_HEIGHT', 900)
const browserCpuThrottleRate = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_BROWSER_CPU_THROTTLE_RATE', 1)
const browserDebugPerformance = process.env.MARKSTREAM_REAL_CORPUS_DEBUG_PERFORMANCE !== '0'
const browserChatRestoreOverscan = readNonNegativeNumberEnv('MARKSTREAM_REAL_CORPUS_CHAT_RESTORE_OVERSCAN', 1000000)
const browserChatRestoreOverscanPx = readNonNegativeNumberEnv('MARKSTREAM_REAL_CORPUS_CHAT_RESTORE_OVERSCAN_PX', 1000000)
const browserCoreSmoothStreamingDefaults = {
  minCharsPerSecond: 40,
  maxCharsPerSecond: 1000,
  targetLatencyMs: 900,
  catchUpLatencyMs: 350,
  catchUpThreshold: 600,
  maxCommitFps: 30,
  startDelayMs: 80,
  maxCharsPerCommit: 80,
  flushOnFinish: false,
}
const browserRendererSmoothStreamingDefaults = {
  maxCharsPerSecond: 3000,
  maxCommitFps: 20,
  maxCharsPerCommit: 160,
  catchUpLatencyMs: 220,
  catchUpThreshold: 400,
}
const browserEffectiveSmoothStreamingOptions = {
  ...browserCoreSmoothStreamingDefaults,
  ...browserRendererSmoothStreamingDefaults,
  ...(browserSmoothStreamingOptions ?? {}),
}
const browserRendererOptions = {
  initialRenderBatchSize: 32,
  renderBatchSize: 48,
  renderBatchDelay: 6,
  parseCoalesceMs: 32,
  ...readJsonObjectEnv('MARKSTREAM_REAL_CORPUS_RENDERER_OPTIONS_JSON'),
}
const browserFinalTimelineMarkdownOptions = {
  nodeVirtual: 'auto',
  maxLiveNodes: 50,
  liveNodeBuffer: 16,
}
const browserStandaloneFinalRestoreAutoExpectedOptions = {
  nodeVirtual: 'auto',
  maxLiveNodes: 50,
  liveNodeBuffer: 16,
}

const corpusDefinitions = [
  {
    id: 'nested-history',
    label: 'Synthetic multi-paragraph list items',
    path: 'scripts/benchmark-real-corpus-performance.mjs#nested-history',
    markdown: Array.from({ length: 120 }, (_, index) =>
      `- **Item ${index}** with [link](https://example.com/${index})\n\n  Second paragraph with **strong** and <kbd>Enter</kbd>.\n\n  > Nested quote with _emphasis_.\n`).join('\n'),
  },
  {
    id: 'chat-answer',
    label: 'Synthetic short assistant answer',
    path: 'scripts/benchmark-real-corpus-performance.mjs#chat-answer',
    markdown: Array.from({ length: 6 }, (_, index) =>
      `## Section ${index}\n\n中文 answer with **strong**, _emphasis_ and [reference](https://example.com/${index}).\n\n- first\n- second\n`).join('\n'),
  },
  { id: 'ai-chat-streaming', label: 'Docs AI chat streaming', path: 'docs/guide/ai-chat-streaming.md' },
  { id: 'readme-en', label: 'README English', path: 'README.md' },
  { id: 'readme-zh', label: 'README Chinese', path: 'README.zh-CN.md' },
  { id: 'docs-performance', label: 'Docs performance guide', path: 'docs/guide/performance.md' },
  { id: 'react-components', label: 'Docs React components', path: 'docs/guide/react-components.md' },
  { id: 'parser-readme', label: 'Parser README', path: 'packages/markdown-parser/README.md' },
  { id: 'changelog', label: 'CHANGELOG full restore', path: 'CHANGELOG.md' },
]

const chatTranscriptDefinitions = [
  {
    id: 'many-message-thread',
    label: 'Synthetic 40-answer conversation restore',
    items: Array.from({ length: 40 }, (_, index) => [
      { kind: 'user-message', text: `Question ${index}` },
      { kind: 'assistant-markdown', corpusId: 'chat-answer' },
    ]).flat(),
  },
  {
    id: 'docs-chat-thread',
    label: 'Real docs multi-message chat restore',
    items: [
      { kind: 'system-divider', text: 'Thread restored from persisted chat state' },
      { kind: 'user-message', text: 'Show the Vue streaming Markdown renderer guide.' },
      { kind: 'assistant-markdown', corpusId: 'ai-chat-streaming' },
      { kind: 'tool-call', status: 'read', label: 'Loaded docs/guide/performance.md' },
      { kind: 'user-message', text: 'Now include performance and React integration details.' },
      { kind: 'assistant-markdown', corpusId: 'docs-performance' },
      { kind: 'assistant-markdown', corpusId: 'react-components' },
      { kind: 'user-message', text: 'Attach the package README and latest release notes.' },
      { kind: 'assistant-markdown', corpusId: 'readme-en' },
      { kind: 'assistant-markdown', corpusId: 'changelog' },
    ],
  },
]

const selectedParserCaseIds = readCaseListEnv('MARKSTREAM_REAL_CORPUS_PARSER_CASES', corpusDefinitions.map(item => item.id))
const selectedBrowserRestoreCaseIds = readCaseListEnv(
  'MARKSTREAM_REAL_CORPUS_BROWSER_RESTORE_CASES',
  ['ai-chat-streaming', 'readme-en', 'react-components', 'changelog'],
)
const selectedBrowserStreamCaseIds = readCaseListEnv(
  'MARKSTREAM_REAL_CORPUS_BROWSER_STREAM_CASES',
  ['ai-chat-streaming', 'readme-en'],
)
const selectedBrowserChatRestoreCaseIds = readCaseListEnv(
  'MARKSTREAM_REAL_CORPUS_BROWSER_CHAT_RESTORE_CASES',
  ['docs-chat-thread'],
)

function readPositiveIntEnv(name, fallback) {
  const value = process.env[name]
  if (value == null || value === '')
    return fallback
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0)
    throw new Error(`${name} must be a positive integer.`)
  return numeric
}

function readNonNegativeNumberEnv(name, fallback) {
  const value = process.env[name]
  if (value == null || value === '')
    return fallback
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0)
    throw new Error(`${name} must be a non-negative number.`)
  return numeric
}

function readCaseListEnv(name, fallback) {
  const value = process.env[name]
  if (value == null || value.trim() === '')
    return fallback
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function readJsonObjectEnv(name) {
  const value = process.env[name]
  if (value == null || value.trim() === '')
    return null

  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`${name} must be a JSON object.`)
  return parsed
}

function validateCaseIds(ids, label) {
  const known = new Set(corpusDefinitions.map(item => item.id))
  const missing = ids.filter(id => !known.has(id))
  if (missing.length)
    throw new Error(`Unknown ${label} case id(s): ${missing.join(', ')}`)
}

function validateChatCaseIds(ids, label) {
  const known = new Set(chatTranscriptDefinitions.map(item => item.id))
  const missing = ids.filter(id => !known.has(id))
  if (missing.length)
    throw new Error(`Unknown ${label} case id(s): ${missing.join(', ')}`)
}

function round(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits))
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length)
    return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))
  return sorted[index]
}

function summarize(values) {
  return {
    minMs: round(Math.min(...values)),
    medianMs: round(median(values)),
    p95Ms: round(percentile(values, 0.95)),
    maxMs: round(Math.max(...values)),
  }
}

function readCorpus() {
  return corpusDefinitions.map((definition) => {
    const absolutePath = path.join(repoRoot, definition.path)
    const markdown = definition.markdown ?? readFileSync(absolutePath, 'utf8')
    return {
      ...definition,
      absolutePath,
      markdown,
      bytes: Buffer.byteLength(markdown),
      chars: markdown.length,
    }
  })
}

function selectCases(corpus, ids) {
  const byId = new Map(corpus.map(item => [item.id, item]))
  return ids.map(id => byId.get(id)).filter(Boolean)
}

function selectChatTranscriptCases(cases, ids) {
  const byId = new Map(cases.map(item => [item.id, item]))
  return ids.map(id => byId.get(id)).filter(Boolean)
}

function getChatEndMarker(caseId) {
  return `MARKSTREAM_REAL_CHAT_RESTORE_END_${caseId}`
}

function createChatTranscriptCases(corpus) {
  const byId = new Map(corpus.map(item => [item.id, item]))
  return chatTranscriptDefinitions.map((definition) => {
    let bytes = 0
    let chars = 0
    let markdownItemCount = 0
    const paths = []

    for (const item of definition.items) {
      if (item.corpusId) {
        const corpusItem = byId.get(item.corpusId)
        if (!corpusItem)
          throw new Error(`Unknown corpus id in chat transcript ${definition.id}: ${item.corpusId}`)
        bytes += corpusItem.bytes
        chars += corpusItem.chars
        markdownItemCount += 1
        paths.push(corpusItem.path)
      }
      else {
        const text = `${item.status ? `${item.status} ` : ''}${item.label ?? item.text ?? ''}`
        bytes += Buffer.byteLength(text)
        chars += text.length
      }
    }

    const endMarker = getChatEndMarker(definition.id)
    bytes += Buffer.byteLength(endMarker)
    chars += endMarker.length

    return {
      id: definition.id,
      label: definition.label,
      path: Array.from(new Set(paths)).join(', '),
      bytes,
      chars,
      items: definition.items,
      itemCount: definition.items.length + 1,
      markdownItemCount,
    }
  })
}

function getNewestSourceMtimeMs(dir) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, getNewestSourceMtimeMs(filePath))
      continue
    }
    if (!entry.isFile())
      continue
    if (!/\.(?:[cm]?js|tsx?|vue)$/.test(entry.name))
      continue
    newest = Math.max(newest, statSync(filePath).mtimeMs)
  }
  return newest
}

function assertWorkspacePackageDistsFresh() {
  const packages = [
    {
      name: 'stream-markdown-parser',
      srcDir: path.join(repoRoot, 'packages/markdown-parser/src'),
      distPath: parserDistPath,
    },
    {
      name: 'markstream-core',
      srcDir: path.join(repoRoot, 'packages/markstream-core/src'),
      distPath: coreDistPath,
    },
  ]
  const report = packages.map((item) => {
    if (!existsSync(item.distPath)) {
      return {
        ...item,
        distMtimeMs: 0,
        sourceMtimeMs: getNewestSourceMtimeMs(item.srcDir),
        stale: true,
        missing: true,
      }
    }

    const distMtimeMs = statSync(item.distPath).mtimeMs
    const sourceMtimeMs = getNewestSourceMtimeMs(item.srcDir)
    return {
      ...item,
      distMtimeMs,
      sourceMtimeMs,
      stale: sourceMtimeMs > distMtimeMs + 1000,
      missing: false,
    }
  })

  const stale = report.filter(item => item.stale)
  if (stale.length && process.env.MARKSTREAM_REAL_CORPUS_ALLOW_STALE_DIST !== '1') {
    throw new Error([
      'Workspace package dist is stale. Run pnpm run build:parser && pnpm run build:core before this benchmark,',
      'or set MARKSTREAM_REAL_CORPUS_ALLOW_STALE_DIST=1 for exploratory runs.',
      ...stale.map(item => `- ${item.name}: ${path.relative(repoRoot, item.distPath)}`),
    ].join('\n'))
  }

  return report.map(item => ({
    name: item.name,
    distPath: path.relative(repoRoot, item.distPath),
    stale: item.stale,
    missing: item.missing,
    sourceMtimeMs: Math.round(item.sourceMtimeMs),
    distMtimeMs: Math.round(item.distMtimeMs),
  }))
}

function createChunks(markdown, count) {
  if (!markdown)
    return []
  const chunkSize = Math.max(1, Math.ceil(markdown.length / count))
  const chunks = []
  for (let index = 0; index < markdown.length; index += chunkSize)
    chunks.push(markdown.slice(index, index + chunkSize))
  return chunks
}

function sumTiming(rows, key) {
  return round(rows.reduce((total, row) => total + Number(row.timing?.[key] || 0), 0))
}

function summarizeParserStreamRuns(streamRuns) {
  return {
    chunks: median(streamRuns.map(run => run.chunks)),
    totalMedianMs: round(median(streamRuns.map(run => run.totalMs))),
    medianCommitMs: round(median(streamRuns.map(run => run.medianCommitMs))),
    p95CommitMs: round(median(streamRuns.map(run => run.p95CommitMs))),
    maxCommitMs: round(median(streamRuns.map(run => run.maxCommitMs))),
    finalFlushMedianMs: round(median(streamRuns.map(run => run.finalFlushMs))),
    processTokensMedianMs: round(median(streamRuns.map(run => run.processTokensMs))),
    processTokensInputTokens: round(median(streamRuns.map(run => run.processTokensInputTokens))),
    processTokensReusedTopLevelNodes: round(median(streamRuns.map(run => run.processTokensReusedTopLevelNodes))),
    parserTotalMedianMs: round(median(streamRuns.map(run => run.parseTotalMs))),
    medianNodesBeforeFinal: median(streamRuns.map(run => run.nodesBeforeFinal)),
    medianNodesAfterFinal: median(streamRuns.map(run => run.nodesAfterFinal)),
    streamStats: streamRuns[Math.floor(streamRuns.length / 2)]?.streamStats ?? null,
  }
}

async function runParserBenchmarks(corpus) {
  if (!existsSync(parserDistPath)) {
    throw new Error(
      `Parser dist not found at ${path.relative(repoRoot, parserDistPath)}. Run pnpm run build:parser first.`,
    )
  }

  const parser = await import(pathToFileURL(parserDistPath).href)
  const { getMarkdown, parseMarkdownToStructure } = parser
  const cases = selectCases(corpus, selectedParserCaseIds)
  const results = []

  for (const testCase of cases) {
    const finalRuns = []
    for (let roundIndex = 0; roundIndex < parserWarmups + parserRounds; roundIndex++) {
      const md = getMarkdown(`real-corpus-final-${testCase.id}-${roundIndex}`)
      md.stream?.reset?.()
      const timing = {}
      const startedAt = performance.now()
      const nodes = parseMarkdownToStructure(testCase.markdown, md, {
        final: true,
        streamParse: true,
        parserMetrics: timing,
      })
      const elapsed = performance.now() - startedAt
      if (roundIndex >= parserWarmups) {
        finalRuns.push({
          ms: elapsed,
          timing,
          nodes: nodes.length,
        })
      }
    }

    const streamingResults = {}
    for (const mode of [
      { key: 'default', reuseStableTopLevelNodes: false },
      { key: 'structuredReuse', reuseStableTopLevelNodes: true },
    ]) {
      const streamRuns = []
      for (let roundIndex = 0; roundIndex < parserWarmups + parserRounds; roundIndex++) {
        const md = getMarkdown(`real-corpus-stream-${mode.key}-${testCase.id}-${roundIndex}`)
        md.stream?.reset?.()
        let current = ''
        const chunks = createChunks(testCase.markdown, streamChunkCount)
        const commitDurations = []
        const commitTimings = []
        let lastNodes = []

        for (const chunk of chunks) {
          current += chunk
          const timing = {}
          const startedAt = performance.now()
          lastNodes = parseMarkdownToStructure(current, md, {
            final: false,
            streamParse: true,
            ...(mode.reuseStableTopLevelNodes ? { reuseStableTopLevelNodes: true } : {}),
            parserMetrics: timing,
          })
          commitDurations.push(performance.now() - startedAt)
          commitTimings.push({ timing })
        }

        const finalTiming = {}
        const finalStartedAt = performance.now()
        const finalNodes = parseMarkdownToStructure(testCase.markdown, md, {
          final: true,
          streamParse: true,
          parserMetrics: finalTiming,
        })
        const finalFlushMs = performance.now() - finalStartedAt

        if (roundIndex >= parserWarmups) {
          streamRuns.push({
            totalMs: commitDurations.reduce((total, value) => total + value, 0),
            medianCommitMs: median(commitDurations),
            p95CommitMs: percentile(commitDurations, 0.95),
            maxCommitMs: Math.max(...commitDurations),
            finalFlushMs,
            chunks: chunks.length,
            nodesBeforeFinal: lastNodes.length,
            nodesAfterFinal: finalNodes.length,
            processTokensMs: sumTiming(commitTimings, 'processTokensMs'),
            processTokensInputTokens: sumTiming(commitTimings, 'processTokensInputTokens'),
            processTokensReusedTopLevelNodes: sumTiming(commitTimings, 'processTokensReusedTopLevelNodes'),
            parseTotalMs: sumTiming(commitTimings, 'parseMarkdownToStructureTotalMs'),
            finalTiming,
            streamStats: typeof md.stream?.stats === 'function' ? md.stream.stats() : null,
          })
        }
      }
      streamingResults[mode.key] = summarizeParserStreamRuns(streamRuns)
    }

    results.push({
      id: testCase.id,
      label: testCase.label,
      path: testCase.path,
      bytes: testCase.bytes,
      chars: testCase.chars,
      final: {
        ...summarize(finalRuns.map(run => run.ms)),
        medianNodes: median(finalRuns.map(run => run.nodes)),
        processTokensMedianMs: round(median(finalRuns.map(run => run.timing.processTokensMs ?? 0))),
        parserTotalMedianMs: round(median(finalRuns.map(run => run.timing.parseMarkdownToStructureTotalMs ?? 0))),
      },
      streaming: streamingResults.default,
      structuredReuseStreaming: streamingResults.structuredReuse,
    })
  }

  return results
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
        args: chromeLaunchArgs(),
      }
    }
  }

  return {
    channel: 'chrome',
    headless: true,
    args: chromeLaunchArgs(),
  }
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

function metricMap(metrics) {
  return Object.fromEntries(metrics.metrics.map(metric => [metric.name, metric.value]))
}

async function getMetrics(client) {
  return metricMap(await client.send('Performance.getMetrics'))
}

function deltaMetrics(after, before) {
  return {
    taskDurationMs: round((after.TaskDuration - before.TaskDuration) * 1000),
    scriptDurationMs: round((after.ScriptDuration - before.ScriptDuration) * 1000),
    layoutDurationMs: round((after.LayoutDuration - before.LayoutDuration) * 1000),
    recalcStyleDurationMs: round((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000),
    jsHeapUsedMB: round(after.JSHeapUsedSize / 1024 / 1024),
  }
}

function writeFixture(corpus) {
  const sourceDir = path.join(fixtureRoot, 'src')
  mkdirSync(sourceDir, { recursive: true })
  writeFileSync(path.join(fixtureRoot, 'index.html'), [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="UTF-8"><title>Real corpus benchmark</title></head>',
    '<body><div id="app"></div><script type="module" src="/src/main.js"></script></body>',
    '</html>',
  ].join('\n'))
  writeFileSync(path.join(sourceDir, 'style.css'), [
    'html, body, #app { margin: 0; min-height: 100%; }',
    'body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f8fa; color: #18202f; }',
    '.bench-shell { width: min(920px, calc(100vw - 48px)); margin: 0 auto; padding: 24px 0 72px; }',
    '.bench-host { background: #fff; border: 1px solid #dde2ea; padding: 24px; }',
    '.bench-host--timeline { height: 760px; padding: 0; overflow: hidden; }',
    '.bench-chat-timeline { height: 100%; background: #fff; }',
    '.bench-chat-row { box-sizing: border-box; max-width: 100%; }',
    '.bench-system-row { margin: 14px 20px; color: #667085; font-size: 12px; text-align: center; }',
    '.bench-user-row { width: fit-content; max-width: min(680px, calc(100% - 96px)); margin: 16px 20px 16px auto; padding: 10px 14px; border-radius: 8px; background: #e8f2ff; color: #0f2742; }',
    '.bench-tool-row { width: fit-content; margin: 10px 20px; padding: 8px 10px; border: 1px solid #d7dde6; border-radius: 6px; background: #f8fafc; color: #475467; font-size: 13px; }',
    '.bench-tool-row span { margin-right: 8px; font-weight: 600; text-transform: uppercase; }',
    '.bench-assistant-row { margin: 18px 20px; }',
    '.bench-assistant-markdown { max-width: 100%; }',
    '.bench-restore-loading { display: inline-flex; align-items: center; padding: 8px 12px; border: 1px solid #d7dde6; border-radius: 6px; background: #fff; color: #475467; font-size: 13px; }',
  ].join('\n'))
  writeFileSync(
    path.join(sourceDir, 'corpus.json'),
    `${JSON.stringify(corpus.map(item => ({
      id: item.id,
      label: item.label,
      path: item.path,
      markdown: item.markdown,
      bytes: item.bytes,
      chars: item.chars,
    })))}\n`,
  )
  writeFileSync(path.join(sourceDir, 'main.js'), getFixtureMainSource())
}

function getFixtureMainSource() {
  return String.raw`import MarkdownRender, { MarkstreamVirtualTimeline } from 'markstream-vue'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import corpus from './corpus.json'
import 'markstream-vue/index.css'
import './style.css'

function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length)
    return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))
  return sorted[index]
}

const content = ref('')
const final = ref(true)
const smoothStreaming = ref(false)
const mode = ref('chat')
const surface = ref('markdown')
const renderKey = ref(0)
const timelineItems = ref([])
const timelineInitialState = ref(null)
const timelineThreadKey = ref('')
const timelineRef = ref(null)
const timelineOverscan = ref(1000000)
const timelineOverscanPx = ref(1000000)
const smoothStreamingOptions = ${JSON.stringify(browserSmoothStreamingOptions)}
const rendererOptions = ${JSON.stringify(browserRendererOptions)}
const debugPerformance = ${JSON.stringify(browserDebugPerformance)}
const finalTimelineMarkdownOptions = ${JSON.stringify(browserFinalTimelineMarkdownOptions)}
const chatTranscriptDefinitions = ${JSON.stringify(chatTranscriptDefinitions)}
const preparedChatStates = new Map()
const chatTranscriptCache = new Map()

function waitFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

async function waitFrames(count) {
  for (let i = 0; i < count; i++)
    await waitFrame()
}

function createParsePerformance() {
  return {
    parseCommitCount: 0,
    parseCoalescedCount: 0,
    streamCommitCount: 0,
    syncCommitCount: 0,
    tokenCloneMs: 0,
    processTokensInputTokens: 0,
    processTokensReusedTopLevelNodes: 0,
    processTokensMs: 0,
    parseMarkdownToStructureTotalMs: 0,
    nodeReuseMs: 0,
    signatureMs: 0,
    stabilizeSignatureMs: 0,
    primeSignatureMs: 0,
    signatureCallCount: 0,
    stabilizeSignatureCallCount: 0,
    primeSignatureCallCount: 0,
    stabilizeMs: 0,
    reusedNodeCount: 0,
    dirtyTailNodeCount: 0,
    stream: {
      total: 0,
      cacheHits: 0,
      appendHits: 0,
      tailHits: 0,
      fullParses: 0,
      chunkedParses: 0,
    },
    streamModes: {},
  }
}

function installParsePerformanceHook() {
  if (window.__realCorpusParseHookInstalled)
    return
  window.__realCorpusParseHookInstalled = true
  window.__realCorpusParsePerformance = createParsePerformance()
  const originalInfo = console.info.bind(console)
  const streamCounterKeys = ['total', 'cacheHits', 'appendHits', 'tailHits', 'fullParses', 'chunkedParses']
  const parseTimingKeys = [
    'tokenCloneMs',
    'processTokensInputTokens',
    'processTokensReusedTopLevelNodes',
    'processTokensMs',
    'parseMarkdownToStructureTotalMs',
  ]
  console.info = (...args) => {
    try {
      const label = args[0]
      if (label === '[markstream-vue][perf] parse(stream)' || label === '[markstream-vue][perf] parse(sync)') {
        const data = args[1] ?? {}
        const metrics = window.__realCorpusParsePerformance

        metrics.parseCommitCount = Math.max(metrics.parseCommitCount, Number(data.parseCommitCount || 0))
        metrics.parseCoalescedCount = Math.max(metrics.parseCoalescedCount, Number(data.parseCoalescedCount || 0))
        metrics.nodeReuseMs += Number(data.nodeReuseMs || 0)
        metrics.signatureMs += Number(data.signatureMs || 0)
        metrics.stabilizeSignatureMs += Number(data.stabilizeSignatureMs || 0)
        metrics.primeSignatureMs += Number(data.primeSignatureMs || 0)
        metrics.signatureCallCount += Number(data.signatureCallCount || 0)
        metrics.stabilizeSignatureCallCount += Number(data.stabilizeSignatureCallCount || 0)
        metrics.primeSignatureCallCount += Number(data.primeSignatureCallCount || 0)
        metrics.stabilizeMs += Number(data.stabilizeMs || 0)
        metrics.reusedNodeCount += Number(data.reusedNodeCount || 0)
        metrics.dirtyTailNodeCount += Number(data.dirtyTailNodeCount || 0)

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

        return
      }
    }
    catch {}
    originalInfo(...args)
  }
}

installParsePerformanceHook()

function resetParsePerformance() {
  window.__realCorpusParsePerformance = createParsePerformance()
}

function readParsePerformance() {
  if (!debugPerformance)
    return null
  return JSON.parse(JSON.stringify(window.__realCorpusParsePerformance ?? createParsePerformance()))
}

function diffParsePerformance(after, before) {
  if (!after || !before)
    return null
  const result = createParsePerformance()
  for (const key of [
    'parseCommitCount',
    'parseCoalescedCount',
    'streamCommitCount',
    'syncCommitCount',
    'tokenCloneMs',
    'processTokensInputTokens',
    'processTokensReusedTopLevelNodes',
    'processTokensMs',
    'parseMarkdownToStructureTotalMs',
    'nodeReuseMs',
    'signatureMs',
    'stabilizeSignatureMs',
    'primeSignatureMs',
    'signatureCallCount',
    'stabilizeSignatureCallCount',
    'primeSignatureCallCount',
    'stabilizeMs',
    'reusedNodeCount',
    'dirtyTailNodeCount',
  ]) {
    result[key] = Number(after?.[key] || 0) - Number(before?.[key] || 0)
  }
  for (const key of Object.keys(result.stream))
    result.stream[key] = Number(after?.stream?.[key] || 0) - Number(before?.stream?.[key] || 0)
  result.streamModes = after?.streamModes ?? {}
  return result
}

function startRunObservers(root) {
  const state = {
    startedAt: performance.now(),
    elapsedMs: 0,
    mutationCount: 0,
    longTasks: [],
    layoutShifts: [],
    heightSamples: [],
    frameIntervals: [],
  }
  const pushHeightSample = (height) => {
    if (!Number.isFinite(height) || height <= 0)
      return
    const rounded = Math.round(height * 10) / 10
    if (state.heightSamples[state.heightSamples.length - 1] !== rounded)
      state.heightSamples.push(rounded)
  }
  pushHeightSample(root.getBoundingClientRect().height)

  const mutationObserver = new MutationObserver(records => {
    state.mutationCount += records.length
  })
  mutationObserver.observe(root, { childList: true, subtree: true, characterData: true, attributes: true })

  let longTaskObserver = null
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        state.longTasks.push({ duration: entry.duration, startTime: entry.startTime })
    })
    longTaskObserver.observe({ entryTypes: ['longtask'] })
  }
  catch {}

  let layoutShiftObserver = null
  try {
    layoutShiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput)
          state.layoutShifts.push({ value: entry.value, startTime: entry.startTime })
      }
    })
    layoutShiftObserver.observe({ type: 'layout-shift' })
  }
  catch {}

  let resizeObserver = null
  try {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries)
        pushHeightSample(entry.contentRect?.height)
    })
    resizeObserver.observe(root)
  }
  catch {}

  let frameRaf = null
  let previousFrameAt = performance.now()
  const sampleFrame = (timestamp) => {
    const delta = timestamp - previousFrameAt
    previousFrameAt = timestamp
    if (Number.isFinite(delta) && delta > 0)
      state.frameIntervals.push(delta)
    frameRaf = requestAnimationFrame(sampleFrame)
  }
  if (typeof requestAnimationFrame === 'function')
    frameRaf = requestAnimationFrame(sampleFrame)

  return {
    stop() {
      state.elapsedMs = performance.now() - state.startedAt
      if (frameRaf != null)
        cancelAnimationFrame(frameRaf)
      state.mutationCount += mutationObserver.takeRecords().length
      mutationObserver.disconnect()
      longTaskObserver?.disconnect()
      layoutShiftObserver?.disconnect()
      resizeObserver?.disconnect()
      return state
    },
  }
}

function getRoot() {
  const root = document.querySelector('.bench-host')
  if (!root)
    throw new Error('Benchmark root not found.')
  return root
}

function measureSlots() {
  const root = getRoot()
  const scrollRoot = root.querySelector('[data-markstream-virtual-timeline="1"]') || root
  const scrollRootRect = scrollRoot.getBoundingClientRect()
  const timelineRestoring = scrollRoot.classList?.contains('is-restoring-thread') === true
  const keyOccurrences = new Map()
  const intersects = (a, b) => {
    return a.width > 0
      && a.height > 0
      && b.width > 0
      && b.height > 0
      && a.bottom > b.top
      && a.top < b.bottom
      && a.right > b.left
      && a.left < b.right
  }

  return Array.from(root.querySelectorAll('.node-slot')).map((slot) => {
    const content = slot.querySelector(':scope > .node-content')
    let measuredElement = content || slot
    let rect = measuredElement.getBoundingClientRect()
    if (content && rect.width === 0 && rect.height === 0 && content.firstElementChild) {
      measuredElement = content.firstElementChild
      rect = measuredElement.getBoundingClientRect()
    }
    const slotRect = slot.getBoundingClientRect()
    const timelineItem = slot.closest('[data-markstream-item-key]')
    const itemClipsChildren = timelineRestoring
      || timelineItem?.classList?.contains('is-restored-height-floor') === true
    const visibleInScrollRoot = intersects(slotRect, scrollRootRect)
    const visibleInItem = !itemClipsChildren
      || (timelineItem && intersects(slotRect, timelineItem.getBoundingClientRect()))
    const type = String(slot.getAttribute('data-node-type') || '')
    const index = Number(slot.getAttribute('data-node-index') || -1)
    const timelineItemKey = timelineItem?.getAttribute('data-markstream-item-key') ?? ''
    const baseKey = timelineItemKey ? timelineItemKey + ':' + index : String(index)
    const occurrence = keyOccurrences.get(baseKey) ?? 0
    keyOccurrences.set(baseKey, occurrence + 1)
    const ignored = type === 'image'
      || type === 'math_block'
      || Boolean(slot.querySelector('.katex, [data-markstream-math]'))
      || Boolean(slot.querySelector('img, .image-node-container, .image-placeholder, .image-shimmer-overlay'))
    return {
      key: occurrence === 0 ? baseKey : baseKey + '#' + occurrence,
      index,
      timelineItemKey,
      type,
      height: Math.round(rect.height * 10) / 10,
      visible: Boolean(visibleInScrollRoot && visibleInItem),
      ignored,
    }
  })
}

function summarizeHeightChanges(before, after, thresholdPx = 1) {
  const beforeByKey = new Map(before.map(item => [item.key, item]))
  const changes = []
  const nonIgnoredChanges = []
  const visibleNonIgnoredChanges = []

  for (const next of after) {
    const prev = beforeByKey.get(next.key)
    if (!prev)
      continue
    const delta = next.height - prev.height
    const absDelta = Math.abs(delta)
    if (absDelta <= thresholdPx)
      continue
    const row = {
      key: next.key,
      index: next.index,
      timelineItemKey: next.timelineItemKey,
      type: next.type,
      before: prev.height,
      after: next.height,
      delta: Math.round(delta * 10) / 10,
      ignored: next.ignored || prev.ignored,
      visible: Boolean(prev.visible || next.visible),
    }
    changes.push(row)
    if (!row.ignored) {
      nonIgnoredChanges.push(row)
      if (row.visible)
        visibleNonIgnoredChanges.push(row)
    }
  }

  const byType = new Map()
  for (const row of nonIgnoredChanges) {
    const current = byType.get(row.type) ?? {
      type: row.type,
      count: 0,
      absDeltaPx: 0,
      maxAbsDeltaPx: 0,
    }
    const absDelta = Math.abs(row.delta)
    current.count++
    current.absDeltaPx += absDelta
    current.maxAbsDeltaPx = Math.max(current.maxAbsDeltaPx, absDelta)
    byType.set(row.type, current)
  }

  return {
    changedSlots: changes.length,
    nonIgnoredChangedSlots: nonIgnoredChanges.length,
    visibleNonIgnoredChangedSlots: visibleNonIgnoredChanges.length,
    maxAbsDeltaPx: Math.round(Math.max(0, ...changes.map(item => Math.abs(item.delta))) * 10) / 10,
    nonIgnoredMaxAbsDeltaPx: Math.round(Math.max(0, ...nonIgnoredChanges.map(item => Math.abs(item.delta))) * 10) / 10,
    visibleNonIgnoredMaxAbsDeltaPx: Math.round(Math.max(0, ...visibleNonIgnoredChanges.map(item => Math.abs(item.delta))) * 10) / 10,
    nonIgnoredChangesByType: Array.from(byType.values())
      .map(item => ({
        ...item,
        absDeltaPx: Math.round(item.absDeltaPx * 10) / 10,
        maxAbsDeltaPx: Math.round(item.maxAbsDeltaPx * 10) / 10,
      }))
      .sort((a, b) => b.absDeltaPx - a.absDeltaPx),
    topChanges: changes
      .slice()
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10),
    topNonIgnoredChanges: nonIgnoredChanges
      .slice()
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10),
    topVisibleNonIgnoredChanges: visibleNonIgnoredChanges
      .slice()
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10),
  }
}

function getDomSnapshot() {
  const root = getRoot()
  return {
    scrollHeight: Math.round(root.scrollHeight),
    clientHeight: Math.round(root.clientHeight),
    domNodes: root.querySelectorAll('*').length,
    slots: root.querySelectorAll('.node-slot').length,
    placeholders: root.querySelectorAll('.node-placeholder').length,
    pendingMath: root.querySelectorAll('[data-markstream-math][data-markstream-pending="true"], .math-loading-overlay').length,
    pendingImages: root.querySelectorAll('.image-shimmer-overlay, .image-placeholder').length,
  }
}

function getTimelineSnapshot() {
  const root = getRoot()
  const timeline = root.querySelector('[data-testid="markstream-virtual-timeline"]')
  if (!timeline)
    return null

  const visibleRange = timelineRef.value?.getVisibleRange?.() ?? null
  const totalHeight = timelineRef.value?.getTotalHeight?.()
  return {
    scrollHeight: Math.round(timeline.scrollHeight),
    clientHeight: Math.round(timeline.clientHeight),
    scrollTop: Math.round(timeline.scrollTop),
    totalHeight: Math.round(Number.isFinite(totalHeight) ? totalHeight : timeline.scrollHeight),
    domItems: timeline.querySelectorAll('.markstream-virtual-timeline__item').length,
    markdownItems: timeline.querySelectorAll('[data-markstream-item-kind="assistant-markdown"]').length,
    visibleRange,
    restoring: timeline.classList.contains('is-restoring-thread'),
  }
}

async function waitForText(text, timeoutMs = 30000) {
  if (!text)
    return { found: true, elapsedMs: 0, timedOut: false }

  const startedAt = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    await nextTick()
    await waitFrames(1)
    if (getRoot().textContent.includes(text)) {
      return {
        found: true,
        elapsedMs: performance.now() - startedAt,
        timedOut: false,
      }
    }
  }

  return {
    found: false,
    elapsedMs: performance.now() - startedAt,
    timedOut: true,
  }
}

async function waitForStableRender(timeoutMs = 20000, requiredText = '') {
  const startedAt = performance.now()
  let stableFrames = 0
  let previousKey = ''
  let snapshot = getDomSnapshot()

  while (performance.now() - startedAt < timeoutMs) {
    await nextTick()
    await waitFrames(1)
    snapshot = getDomSnapshot()
    const timelineSnapshot = getTimelineSnapshot()
    const key = [
      snapshot.scrollHeight,
      snapshot.domNodes,
      snapshot.slots,
      snapshot.placeholders,
      timelineSnapshot?.scrollHeight ?? '',
      timelineSnapshot?.totalHeight ?? '',
      timelineSnapshot?.domItems ?? '',
      timelineSnapshot?.restoring ? 1 : 0,
    ].join(':')

    const hasRequiredText = !requiredText || getRoot().textContent.includes(requiredText)
    const timelineReady = !timelineSnapshot || !timelineSnapshot.restoring

    if (hasRequiredText && timelineReady && snapshot.placeholders === 0 && snapshot.pendingMath === 0 && key === previousKey) {
      stableFrames += 1
      if (stableFrames >= 4)
        break
    }
    else {
      stableFrames = 0
      previousKey = key
    }
  }

  return {
    elapsedMs: performance.now() - startedAt,
    stableFrames,
    timedOut: performance.now() - startedAt >= timeoutMs,
    snapshot,
  }
}

async function waitForTimelineReady(timeoutMs = 20000, requiredText = '') {
  const startedAt = performance.now()
  let snapshot = getDomSnapshot()
  let timelineSnapshot = getTimelineSnapshot()

  while (performance.now() - startedAt < timeoutMs) {
    await nextTick()
    await waitFrames(1)
    snapshot = getDomSnapshot()
    timelineSnapshot = getTimelineSnapshot()

    const hasRequiredText = !requiredText || getRoot().textContent.includes(requiredText)
    if (hasRequiredText && (!timelineSnapshot || !timelineSnapshot.restoring))
      break
  }

  return {
    elapsedMs: performance.now() - startedAt,
    timedOut: performance.now() - startedAt >= timeoutMs,
    snapshot,
    timelineSnapshot,
  }
}

function summarizeObserverState(state) {
  const longTaskDurations = state.longTasks.map(entry => entry.duration)
  const frameIntervals = state.frameIntervals.filter(Number.isFinite)
  const droppedFrameEstimate = frameIntervals.reduce((total, delta) => {
    return total + Math.max(0, Math.round(delta / 16.67) - 1)
  }, 0)
  const longTaskTotalMs = Math.round(longTaskDurations.reduce((total, value) => total + value, 0) * 10) / 10
  const elapsedMs = Number.isFinite(state.elapsedMs) && state.elapsedMs > 0 ? state.elapsedMs : 0
  return {
    mutationCount: state.mutationCount,
    longTaskCount: state.longTasks.length,
    longTaskTotalMs,
    longTaskMaxMs: Math.round(Math.max(0, ...longTaskDurations) * 10) / 10,
    cls: Math.round(state.layoutShifts.reduce((total, entry) => total + entry.value, 0) * 100000) / 100000,
    heightSampleCount: state.heightSamples.length,
    frameSampleCount: frameIntervals.length,
    frameP95Ms: Math.round(percentile(frameIntervals, 0.95) * 10) / 10,
    frameMaxMs: Math.round(Math.max(0, ...frameIntervals) * 10) / 10,
    droppedFrameEstimate,
    longTaskBusyRatio: elapsedMs > 0 ? Math.round((longTaskTotalMs / elapsedMs) * 10000) / 10000 : 0,
  }
}

function countHeightJumps(heightSamples) {
  return heightSamples.reduce((count, value, index, array) => {
    return index > 0 && Math.abs(value - array[index - 1]) > 24 ? count + 1 : count
  }, 0)
}

function assertWaitCompleted(label, result) {
  if (result?.timedOut)
    throw new Error(label + ' timed out.')
}

function findCase(caseId) {
  const item = corpus.find(entry => entry.id === caseId)
  if (!item)
    throw new Error('Unknown corpus case: ' + caseId)
  return item
}

function findChatTranscriptDefinition(caseId) {
  const definition = chatTranscriptDefinitions.find(entry => entry.id === caseId)
  if (!definition)
    throw new Error('Unknown chat transcript case: ' + caseId)
  return definition
}

function buildChatTranscript(caseId) {
  const cached = chatTranscriptCache.get(caseId)
  if (cached)
    return cached

  const definition = findChatTranscriptDefinition(caseId)
  const items = []
  const paths = new Set()
  let bytes = 0
  let chars = 0
  let markdownItemCount = 0

  for (const [index, source] of definition.items.entries()) {
    const id = caseId + '-' + index + '-' + source.kind

    if (source.kind === 'assistant-markdown') {
      const corpusItem = findCase(source.corpusId)
      paths.add(corpusItem.path)
      bytes += corpusItem.bytes
      chars += corpusItem.chars
      markdownItemCount += 1
      items.push({
        id,
        kind: source.kind,
        content: corpusItem.markdown,
        final: true,
        revision: corpusItem.bytes + ':' + corpusItem.chars,
        label: corpusItem.label,
      })
      continue
    }

    const text = (source.status ? source.status + ' ' : '') + (source.label ?? source.text ?? source.message ?? '')
    bytes += new TextEncoder().encode(text).length
    chars += text.length
    items.push({
      id,
      ...source,
    })
  }

  const endMarker = 'MARKSTREAM_REAL_CHAT_RESTORE_END_' + caseId
  bytes += new TextEncoder().encode(endMarker).length
  chars += endMarker.length
  items.push({
    id: caseId + '-end-marker',
    kind: 'system-divider',
    text: endMarker,
  })

  const transcript = {
    id: definition.id,
    label: definition.label,
    path: Array.from(paths).join(', '),
    bytes,
    chars,
    threadKey: 'real-chat-' + definition.id,
    endMarker,
    items,
    itemCount: items.length,
    markdownItemCount,
  }
  chatTranscriptCache.set(caseId, transcript)
  return transcript
}

function makeChunks(markdown, count) {
  const chunkSize = Math.max(1, Math.ceil(markdown.length / count))
  const chunks = []
  for (let index = 0; index < markdown.length; index += chunkSize)
    chunks.push(markdown.slice(index, index + chunkSize))
  return chunks
}

async function resetRenderer(nextMode, nextSmoothStreaming) {
  content.value = ''
  final.value = true
  mode.value = nextMode
  smoothStreaming.value = nextSmoothStreaming
  surface.value = 'markdown'
  timelineItems.value = []
  timelineInitialState.value = null
  timelineThreadKey.value = ''
  renderKey.value += 1
  await nextTick()
  await waitFrames(2)
}

async function runRestore(options) {
  const item = findCase(options.caseId)
  await resetRenderer('chat', false)
  const root = getRoot()
  resetParsePerformance()
  const parseBefore = readParsePerformance()
  const observers = startRunObservers(root)
  const startedAt = performance.now()
  final.value = true
  content.value = item.markdown
  await nextTick()
  await waitFrames(2)
  const firstSnapshot = getDomSnapshot()
  const firstSlots = measureSlots()
  const stable = await waitForStableRender(options.timeoutMs ?? 30000)
  const settledSlots = measureSlots()
  const totalMs = performance.now() - startedAt
  const observerState = observers.stop()
  const parseAfter = readParsePerformance()
  assertWaitCompleted('Restore stable render for ' + item.id, stable)

  return {
    id: item.id,
    label: item.label,
    path: item.path,
    bytes: item.bytes,
    chars: item.chars,
    totalMs,
    firstSnapshot,
    settledSnapshot: stable.snapshot,
    stable,
    heightStability: summarizeHeightChanges(firstSlots, settledSlots),
    observers: summarizeObserverState(observerState),
    parsePerformance: diffParsePerformance(parseAfter, parseBefore),
  }
}

async function prepareChatRestore(options) {
  const item = buildChatTranscript(options.caseId)
  const cached = preparedChatStates.get(item.id)
  if (cached)
    return cached.summary

  await resetRenderer('chat', false)
  resetParsePerformance()
  const startedAt = performance.now()
  surface.value = 'timeline'
  timelineOverscan.value = 1000000
  timelineOverscanPx.value = 1000000
  timelineThreadKey.value = item.threadKey
  timelineInitialState.value = null
  timelineItems.value = item.items
  renderKey.value += 1
  await nextTick()
  await waitFrames(2)
  const stable = await waitForStableRender(options.timeoutMs ?? 30000, item.endMarker)
  assertWaitCompleted('Prepare chat restore stable render for ' + item.id, stable)
  const state = timelineRef.value?.captureThreadState?.() ?? null
  const snapshot = getDomSnapshot()
  const timelineSnapshot = getTimelineSnapshot()
  if (!state)
    throw new Error('Failed to capture chat restore state for ' + item.id)

  const summary = {
    elapsedMs: performance.now() - startedAt,
    stable,
    snapshot,
    timelineSnapshot,
    itemHeightCount: Object.keys(state.itemHeights ?? {}).length,
    markdownStateCount: Object.keys(state.markdownStates ?? {}).length,
  }
  preparedChatStates.set(item.id, { state, summary })
  await resetRenderer('chat', false)
  return summary
}

async function runChatRestore(options) {
  const item = buildChatTranscript(options.caseId)
  const prepared = preparedChatStates.get(item.id) ?? {
    state: null,
    summary: await prepareChatRestore(options),
  }
  const preparedState = prepared.state ?? preparedChatStates.get(item.id)?.state
  if (!preparedState)
    throw new Error('Missing prepared chat restore state for ' + item.id)

  await resetRenderer('chat', false)
  const root = getRoot()
  resetParsePerformance()
  const parseBefore = readParsePerformance()
  const observers = startRunObservers(root)
  const startedAt = performance.now()
  surface.value = 'timeline'
  timelineOverscan.value = ${JSON.stringify(browserChatRestoreOverscan)}
  timelineOverscanPx.value = ${JSON.stringify(browserChatRestoreOverscanPx)}
  timelineThreadKey.value = item.threadKey
  timelineInitialState.value = preparedState
  timelineItems.value = item.items
  renderKey.value += 1
  await nextTick()
  await waitFrames(2)
  const firstSnapshot = getDomSnapshot()
  const firstTimelineSnapshot = getTimelineSnapshot()
  const hiddenRestoreSlots = measureSlots()
  const requiresEndMarker = timelineOverscan.value >= item.itemCount
  const restoreReady = await waitForTimelineReady(options.timeoutMs ?? 30000, requiresEndMarker ? item.endMarker : undefined)
  const firstVisibleSnapshot = getDomSnapshot()
  const firstVisibleTimelineSnapshot = getTimelineSnapshot()
  const firstVisibleSlots = measureSlots()
  const stable = await waitForStableRender(options.timeoutMs ?? 30000, requiresEndMarker ? item.endMarker : undefined)
  const settledSlots = measureSlots()
  const totalMs = performance.now() - startedAt
  const observerState = observers.stop()
  const parseAfter = readParsePerformance()
  assertWaitCompleted('Chat restore ready for ' + item.id, restoreReady)
  assertWaitCompleted('Chat restore stable render for ' + item.id, stable)

  return {
    id: item.id,
    label: item.label,
    path: item.path,
    bytes: item.bytes,
    chars: item.chars,
    itemCount: item.itemCount,
    markdownItemCount: item.markdownItemCount,
    totalMs,
    firstSnapshot,
    firstVisibleSnapshot,
    settledSnapshot: stable.snapshot,
    firstTimelineSnapshot,
    firstVisibleTimelineSnapshot,
    settledTimelineSnapshot: getTimelineSnapshot(),
    stable,
    restoreReady,
    prepare: prepared.summary,
    heightStability: summarizeHeightChanges(firstVisibleSlots, settledSlots),
    hiddenRestoreHeightStability: summarizeHeightChanges(hiddenRestoreSlots, settledSlots),
    observers: summarizeObserverState(observerState),
    parsePerformance: diffParsePerformance(parseAfter, parseBefore),
  }
}

async function runStream(options) {
  const item = findCase(options.caseId)
  const endMarker = 'MARKSTREAM_REAL_CORPUS_STREAM_END_' + item.id
  const streamMarkdown = item.markdown + '\n\n' + endMarker
  await resetRenderer('chat', 'auto')
  const root = getRoot()
  resetParsePerformance()
  const parseBefore = readParsePerformance()
  const observers = startRunObservers(root)
  const chunks = makeChunks(streamMarkdown, options.chunks ?? 96)
  const updateDurations = []
  let current = ''
  final.value = false
  smoothStreaming.value = 'auto'
  await nextTick()

  const startedAt = performance.now()
  for (const chunk of chunks) {
    current += chunk
    const updateStartedAt = performance.now()
    content.value = current
    await nextTick()
    await waitFrames(1)
    updateDurations.push(performance.now() - updateStartedAt)
    if (options.intervalMs > 0)
      await new Promise(resolve => setTimeout(resolve, options.intervalMs))
  }
  final.value = true
  await nextTick()
  await waitFrames(2)
  const markerWait = await waitForText(endMarker, options.timeoutMs ?? 30000)
  const finalSnapshot = getDomSnapshot()
  const beforeFinalSlots = measureSlots()
  const stable = await waitForStableRender(options.timeoutMs ?? 30000, endMarker)
  const settledSlots = measureSlots()
  const totalMs = performance.now() - startedAt
  const observerState = observers.stop()
  const parseAfter = readParsePerformance()
  assertWaitCompleted('Stream marker wait for ' + item.id, markerWait)
  assertWaitCompleted('Stream stable render for ' + item.id, stable)
  const sortedUpdates = updateDurations.slice().sort((a, b) => a - b)
  const heightJumps = countHeightJumps(observerState.heightSamples)

  return {
    id: item.id,
    label: item.label,
    path: item.path,
    bytes: item.bytes,
    chars: item.chars,
    chunks: chunks.length,
    totalMs,
    avgUpdateMs: updateDurations.reduce((total, value) => total + value, 0) / Math.max(1, updateDurations.length),
    p95UpdateMs: sortedUpdates[Math.min(sortedUpdates.length - 1, Math.ceil(sortedUpdates.length * 0.95) - 1)] || 0,
    maxUpdateMs: Math.max(0, ...updateDurations),
    heightJumps,
    finalSnapshot,
    settledSnapshot: stable.snapshot,
    markerWait,
    stable,
    heightStability: summarizeHeightChanges(beforeFinalSlots, settledSlots),
    observers: summarizeObserverState(observerState),
    parsePerformance: diffParsePerformance(parseAfter, parseBefore),
  }
}

window.__runRealCorpusBenchmark = async (options) => {
  if (options.mode === 'chat-restore')
    return runChatRestore(options)
  if (options.mode === 'stream')
    return runStream(options)
  return runRestore(options)
}

window.__prepareRealCorpusBenchmark = async (options) => {
  if (options.mode === 'chat-restore')
    return prepareChatRestore(options)
  return null
}

window.__ready = true

function renderTimelineItem(props) {
  const item = props.item ?? {}

  if (props.kind === 'assistant-markdown') {
    return h('article', {
      ref: props.measureRef,
      class: 'bench-chat-row bench-assistant-row',
    }, [
      h(MarkdownRender, {
        ...props.markdownProps,
        ...(props.markdownProps.final ? finalTimelineMarkdownOptions : {}),
        class: 'bench-assistant-markdown',
        debugPerformance,
        renderCodeBlocksAsPre: true,
        smoothStreamingOptions,
        batchRendering: true,
        ...rendererOptions,
      }),
    ])
  }

  if (props.kind === 'user-message') {
    return h('article', {
      ref: props.measureRef,
      class: 'bench-chat-row bench-user-row',
    }, item.text ?? '')
  }

  if (props.kind === 'tool-call') {
    return h('div', {
      ref: props.measureRef,
      class: 'bench-chat-row bench-tool-row',
    }, [
      h('span', item.status ?? ''),
      item.label ?? '',
    ])
  }

  return h('div', {
    ref: props.measureRef,
    class: 'bench-chat-row bench-system-row',
  }, item.text ?? item.message ?? item.label ?? '')
}

const App = defineComponent({
  setup() {
    function renderBenchmarkSurface() {
      if (surface.value === 'timeline') {
        return h(MarkstreamVirtualTimeline, {
          ref: timelineRef,
          key: 'timeline-' + renderKey.value,
          class: 'bench-chat-timeline',
          items: timelineItems.value,
          threadKey: timelineThreadKey.value,
          initialThreadState: timelineInitialState.value,
          overscan: timelineOverscan.value,
          overscanPx: timelineOverscanPx.value,
          stickToBottom: false,
          markdownMode: 'chat',
          renderCodeBlocksAsPre: true,
          markdownFade: false,
          restoreMaxLoadingMs: false,
          debug: true,
        }, {
          default: renderTimelineItem,
          'restore-loading': ({ threadKey }) => h('div', { class: 'bench-restore-loading' }, 'Restoring ' + threadKey),
        })
      }

      return h(MarkdownRender, {
        key: 'markdown-' + renderKey.value,
        content: content.value,
        final: final.value,
        mode: mode.value,
        smoothStreaming: smoothStreaming.value,
        smoothStreamingOptions,
        debugPerformance,
        renderCodeBlocksAsPre: true,
        batchRendering: true,
        ...rendererOptions,
      })
    }

    return () => h('main', { class: 'bench-shell' }, [
      h('section', {
        class: [
          'bench-host',
          surface.value === 'timeline' ? 'bench-host--timeline' : '',
        ],
      }, [
        renderBenchmarkSurface(),
      ]),
    ])
  },
})

createApp(App).mount('#app')
`
}

async function createBenchmarkServer(corpus, benchmarkSourceRoot = sourceRoot, buildOutputDir = outputDir) {
  writeFixture(corpus)
  const serverConfig = {
    configFile: false,
    root: fixtureRoot,
    logLevel: 'silent',
    plugins: [vue()],
    resolve: {
      alias: [
        { find: 'markstream-vue/index.css', replacement: path.join(benchmarkSourceRoot, 'src/index.css') },
        { find: 'markstream-vue', replacement: path.join(benchmarkSourceRoot, 'src/exports.ts') },
        { find: 'stream-markdown-parser', replacement: path.join(benchmarkSourceRoot, 'packages/markdown-parser/src/index.ts') },
        { find: 'markstream-core', replacement: path.join(benchmarkSourceRoot, 'packages/markstream-core/src/index.ts') },
      ],
    },
    server: { host: '127.0.0.1', port: 4193, strictPort: false },
  }
  let server
  if (process.env.MARKSTREAM_BENCHMARK_BUILD === '1') {
    const buildOptions = { outDir: path.join(buildOutputDir, 'dist'), emptyOutDir: true }
    await build({ ...serverConfig, mode: 'production', build: buildOptions })
    server = await preview({ ...serverConfig, build: buildOptions, preview: { host: '127.0.0.1', port: serverConfig.server.port, strictPort: false } })
  }
  else {
    server = await createServer(serverConfig)
    await server.listen()
  }
  const address = server.httpServer?.address()
  const port = typeof address === 'object' && address ? address.port : server.config.server.port
  return { server, port }
}

const observerNumericKeys = [
  'mutationCount',
  'longTaskCount',
  'longTaskTotalMs',
  'longTaskMaxMs',
  'cls',
  'heightSampleCount',
  'frameSampleCount',
  'frameP95Ms',
  'frameMaxMs',
  'droppedFrameEstimate',
  'longTaskBusyRatio',
]

const parsePerformanceNumericKeys = [
  'parseCommitCount',
  'parseCoalescedCount',
  'streamCommitCount',
  'syncCommitCount',
  'tokenCloneMs',
  'processTokensInputTokens',
  'processTokensReusedTopLevelNodes',
  'processTokensMs',
  'parseMarkdownToStructureTotalMs',
  'nodeReuseMs',
  'signatureMs',
  'stabilizeSignatureMs',
  'primeSignatureMs',
  'signatureCallCount',
  'stabilizeSignatureCallCount',
  'primeSignatureCallCount',
  'stabilizeMs',
  'reusedNodeCount',
  'dirtyTailNodeCount',
]

function medianRunNumber(runs, read) {
  const values = runs.map(read).filter(Number.isFinite)
  return values.length ? round(median(values)) : undefined
}

function summarizeNumericObject(runs, read, keys) {
  const output = {}
  for (const key of keys) {
    const value = medianRunNumber(runs, run => read(run)?.[key])
    if (value !== undefined)
      output[key] = value
  }
  return output
}

function summarizeTimedResult(runs, medianRun, key) {
  const source = medianRun[key]
  if (!source)
    return source

  const elapsedMs = medianRunNumber(runs, run => run[key]?.elapsedMs)
  return {
    ...source,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    timedOut: runs.some(run => run[key]?.timedOut === true),
  }
}

function summarizeHeightStabilityWorst(runs, key) {
  const read = (run, metric) => Number(run[key]?.[metric])
  return {
    changedSlots: Math.max(0, ...runs.map(run => read(run, 'changedSlots')).filter(Number.isFinite)),
    nonIgnoredChangedSlots: Math.max(0, ...runs.map(run => read(run, 'nonIgnoredChangedSlots')).filter(Number.isFinite)),
    visibleNonIgnoredChangedSlots: Math.max(0, ...runs.map(run => read(run, 'visibleNonIgnoredChangedSlots')).filter(Number.isFinite)),
    maxAbsDeltaPx: round(Math.max(0, ...runs.map(run => read(run, 'maxAbsDeltaPx')).filter(Number.isFinite))),
    nonIgnoredMaxAbsDeltaPx: round(Math.max(0, ...runs.map(run => read(run, 'nonIgnoredMaxAbsDeltaPx')).filter(Number.isFinite))),
    visibleNonIgnoredMaxAbsDeltaPx: round(Math.max(0, ...runs.map(run => read(run, 'visibleNonIgnoredMaxAbsDeltaPx')).filter(Number.isFinite))),
  }
}

function hasRunTimedOut(run) {
  return Boolean(
    run.stable?.timedOut
    || run.restoreReady?.timedOut
    || run.markerWait?.timedOut
    || run.prepare?.stable?.timedOut,
  )
}

function summarizeParsePerformance(runs, medianRun) {
  const source = medianRun.parsePerformance
  if (!source)
    return source

  return {
    ...source,
    ...summarizeNumericObject(runs, run => run.parsePerformance, parsePerformanceNumericKeys),
    stream: summarizeNumericObject(
      runs,
      run => run.parsePerformance?.stream,
      Array.from(new Set(runs.flatMap(run => Object.keys(run.parsePerformance?.stream ?? {})))),
    ),
  }
}

function summarizeBrowserRuns(runs) {
  const sortedByTotal = runs.slice().sort((a, b) => a.totalMs - b.totalMs)
  const numericKeys = [
    'totalMs',
    'avgUpdateMs',
    'p95UpdateMs',
    'maxUpdateMs',
    'heightJumps',
    'taskDurationMs',
    'scriptDurationMs',
    'layoutDurationMs',
    'recalcStyleDurationMs',
    'jsHeapUsedMB',
    'retainedHeapMB',
  ]
  const output = {}
  for (const key of numericKeys) {
    const values = runs.map(run => run[key]).filter(Number.isFinite)
    if (values.length)
      output[key] = round(median(values))
  }

  const medianRun = sortedByTotal[Math.floor(sortedByTotal.length / 2)]
  output.firstSnapshot = medianRun.firstSnapshot
  output.firstVisibleSnapshot = medianRun.firstVisibleSnapshot
  output.finalSnapshot = medianRun.finalSnapshot
  output.settledSnapshot = medianRun.settledSnapshot
  output.firstTimelineSnapshot = medianRun.firstTimelineSnapshot
  output.firstVisibleTimelineSnapshot = medianRun.firstVisibleTimelineSnapshot
  output.settledTimelineSnapshot = medianRun.settledTimelineSnapshot
  output.heightStability = medianRun.heightStability
  output.hiddenRestoreHeightStability = medianRun.hiddenRestoreHeightStability
  output.heightStabilityWorst = summarizeHeightStabilityWorst(runs, 'heightStability')
  output.hiddenRestoreHeightStabilityWorst = summarizeHeightStabilityWorst(runs, 'hiddenRestoreHeightStability')
  output.observers = summarizeNumericObject(runs, run => run.observers, observerNumericKeys)
  output.parsePerformance = summarizeParsePerformance(runs, medianRun)
  output.stable = summarizeTimedResult(runs, medianRun, 'stable')
  output.restoreReady = summarizeTimedResult(runs, medianRun, 'restoreReady')
  output.prepare = medianRun.prepare
  output.runTimedOut = runs.some(hasRunTimedOut)
  return output
}

async function runBrowserCase(browser, port, mode, testCase) {
  const runs = []

  for (let index = 0; index < browserRepeats; index++) {
    const page = await browser.newPage({
      viewport: { width: browserViewportWidth, height: browserViewportHeight },
      deviceScaleFactor: 1,
    })
    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', (message) => {
      const text = message.text()
      if (message.type() === 'error' && !text.includes('Failed to load resource'))
        consoleErrors.push(text)
    })
    const client = await page.context().newCDPSession(page)
    await client.send('Performance.enable')
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__ready === true)
    if (browserCpuThrottleRate > 1)
      await client.send('Emulation.setCPUThrottlingRate', { rate: browserCpuThrottleRate })
    const runOptions = {
      mode,
      caseId: testCase.id,
      chunks: browserStreamChunks,
      intervalMs: browserStreamIntervalMs,
      timeoutMs: 30000,
    }
    if (mode === 'chat-restore') {
      await page.evaluate(
        options => window.__prepareRealCorpusBenchmark(options),
        runOptions,
      )
    }
    const before = await getMetrics(client)
    const result = await page.evaluate(
      options => window.__runRealCorpusBenchmark(options),
      runOptions,
    )
    const after = await getMetrics(client)
    const correctness = await page.evaluate(() => {
      const root = document.querySelector('#app')
      return {
        text: root.textContent,
        links: Array.from(root.querySelectorAll('a'), link => [link.textContent, link.getAttribute('href'), link.getAttribute('title')]),
        images: Array.from(root.querySelectorAll('img'), image => [image.getAttribute('src'), image.getAttribute('alt')]),
      }
    })
    await client.send('HeapProfiler.collectGarbage')
    const retainedMetrics = await getMetrics(client)
    await page.close()

    if (pageErrors.length || consoleErrors.length) {
      throw new Error([
        `Browser benchmark errors for ${mode}/${testCase.id}`,
        pageErrors.length ? `page errors:\n${pageErrors.join('\n')}` : '',
        consoleErrors.length ? `console errors:\n${consoleErrors.join('\n')}` : '',
      ].filter(Boolean).join('\n\n'))
    }

    runs.push({
      ...result,
      ...deltaMetrics(after, before),
      correctness,
      retainedHeapMB: round(retainedMetrics.JSHeapUsedSize / 1024 / 1024),
      totalMs: round(result.totalMs),
      avgUpdateMs: round(result.avgUpdateMs),
      p95UpdateMs: round(result.p95UpdateMs),
      maxUpdateMs: round(result.maxUpdateMs),
    })
  }

  return {
    id: testCase.id,
    label: testCase.label,
    path: testCase.path,
    bytes: testCase.bytes,
    chars: testCase.chars,
    mode,
    median: summarizeBrowserRuns(runs),
    runs,
  }
}

async function runBrowserBenchmarks(corpus) {
  const restoreCases = selectCases(corpus, selectedBrowserRestoreCaseIds)
  const streamCases = selectCases(corpus, selectedBrowserStreamCaseIds)
  const chatRestoreCases = selectChatTranscriptCases(createChatTranscriptCases(corpus), selectedBrowserChatRestoreCaseIds)
  const { server, port } = await createBenchmarkServer(corpus)
  let browser

  try {
    browser = await chromium.launch(resolveChromeLaunchOptions())
    const restore = []
    for (const testCase of restoreCases) {
      console.log(`browser restore case=${testCase.id}`)
      restore.push(await runBrowserCase(browser, port, 'restore', testCase))
    }

    const streaming = []
    for (const testCase of streamCases) {
      console.log(`browser stream case=${testCase.id}`)
      streaming.push(await runBrowserCase(browser, port, 'stream', testCase))
    }

    const chatRestore = []
    for (const testCase of chatRestoreCases) {
      console.log(`browser chat restore case=${testCase.id}`)
      chatRestore.push(await runBrowserCase(browser, port, 'chat-restore', testCase))
    }

    return { restore, streaming, chatRestore }
  }
  finally {
    await browser?.close()
    await server.close()
  }
}

function formatMs(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '-'
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : '-'
}

function formatDiagnosticMs(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : 'N/A'
}

function formatDiagnosticNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : 'N/A'
}

function formatPercent(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-'
}

function formatBoolean(value) {
  return value === true ? 'yes' : 'no'
}

function renderParserTable(parserResults) {
  const lines = [
    '| Case | Mode | Bytes | Nodes | Final median | Process median | Stream total | Stream p95 commit | Processed tokens | Reused prefix nodes | Final flush |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const row of parserResults) {
    for (const [mode, streaming] of [
      ['public-default', row.streaming],
      ['structured-reuse', row.structuredReuseStreaming],
    ]) {
      lines.push(`| ${row.id} | ${mode} | ${row.bytes} | ${formatNumber(row.final.medianNodes)} | ${formatMs(row.final.medianMs)} | ${formatMs(row.final.processTokensMedianMs)} | ${formatMs(streaming.totalMedianMs)} | ${formatMs(streaming.p95CommitMs)} | ${formatNumber(streaming.processTokensInputTokens)} | ${formatNumber(streaming.processTokensReusedTopLevelNodes)} | ${formatMs(streaming.finalFlushMedianMs)} |`)
    }
  }
  return lines.join('\n')
}

function renderBrowserRestoreTable(rows) {
  const lines = [
    '| Case | Bytes | Total | Timed out | Task | Script | Layout | Run long task | Run long-task busy | Run frame p95 | Run frame max | Run dropped frames | DOM nodes | Rendered slots | Worst non-image/katex height changes | Worst max non-ignored delta | Parser total | Node reuse | Signature | CLS |',
    '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const row of rows) {
    const m = row.median
    lines.push(`| ${row.id} | ${row.bytes} | ${formatMs(m.totalMs)} | ${formatBoolean(m.runTimedOut)} | ${formatMs(m.taskDurationMs)} | ${formatMs(m.scriptDurationMs)} | ${formatMs(m.layoutDurationMs)} | ${formatMs(m.observers?.longTaskTotalMs)} | ${formatPercent(m.observers?.longTaskBusyRatio)} | ${formatMs(m.observers?.frameP95Ms)} | ${formatMs(m.observers?.frameMaxMs)} | ${formatNumber(m.observers?.droppedFrameEstimate)} | ${formatNumber(m.settledSnapshot?.domNodes)} | ${formatNumber(m.settledSnapshot?.slots)} | ${formatNumber(m.heightStabilityWorst?.nonIgnoredChangedSlots)} | ${formatMs(m.heightStabilityWorst?.nonIgnoredMaxAbsDeltaPx)} | ${formatDiagnosticMs(m.parsePerformance?.parseMarkdownToStructureTotalMs)} | ${formatDiagnosticMs(m.parsePerformance?.nodeReuseMs)} | ${formatDiagnosticMs(m.parsePerformance?.signatureMs)} | ${m.observers?.cls ?? '-'} |`)
  }
  return lines.join('\n')
}

function renderBrowserStreamTable(rows) {
  const lines = [
    '| Case | Bytes | Chunks | Total | Timed out | p95 update | Max update | Run frame p95 | Run frame max | Run dropped frames | Run long task | Run long-task busy | Height jumps | Mutations | Task | Layout | Parser total | Reused prefix nodes | Node reuse | Signature | Worst non-image/katex final height changes |',
    '| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const row of rows) {
    const m = row.median
    lines.push(`| ${row.id} | ${row.bytes} | ${row.runs[0]?.chunks ?? '-'} | ${formatMs(m.totalMs)} | ${formatBoolean(m.runTimedOut)} | ${formatMs(m.p95UpdateMs)} | ${formatMs(m.maxUpdateMs)} | ${formatMs(m.observers?.frameP95Ms)} | ${formatMs(m.observers?.frameMaxMs)} | ${formatNumber(m.observers?.droppedFrameEstimate)} | ${formatMs(m.observers?.longTaskTotalMs)} | ${formatPercent(m.observers?.longTaskBusyRatio)} | ${formatNumber(m.heightJumps)} | ${formatNumber(m.observers?.mutationCount)} | ${formatMs(m.taskDurationMs)} | ${formatMs(m.layoutDurationMs)} | ${formatDiagnosticMs(m.parsePerformance?.parseMarkdownToStructureTotalMs)} | ${formatDiagnosticNumber(m.parsePerformance?.processTokensReusedTopLevelNodes)} | ${formatDiagnosticMs(m.parsePerformance?.nodeReuseMs)} | ${formatDiagnosticMs(m.parsePerformance?.signatureMs)} | ${formatNumber(m.heightStabilityWorst?.nonIgnoredChangedSlots)} |`)
  }
  return lines.join('\n')
}

function renderBrowserChatRestoreTable(rows) {
  const lines = [
    '| Case | Bytes | Items | Markdown items | Total | Timed out | Restore ready | Task | Script | Layout | Run long task | Run long-task busy | Run frame p95 | Run frame max | Run dropped frames | Timeline height | Visible timeline drift | Hidden timeline drift | DOM nodes | Worst viewport node height changes | Worst DOM node height changes | Worst hidden DOM node height changes | Worst max viewport node delta | Parser total | Node reuse | Signature | CLS |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const row of rows) {
    const m = row.median
    const visibleTimelineDrift = Math.abs(
      Number(m.firstVisibleTimelineSnapshot?.scrollHeight ?? 0)
      - Number(m.settledTimelineSnapshot?.scrollHeight ?? 0),
    )
    const hiddenTimelineDrift = Math.abs(
      Number(m.firstTimelineSnapshot?.scrollHeight ?? 0)
      - Number(m.settledTimelineSnapshot?.scrollHeight ?? 0),
    )
    lines.push(`| ${row.id} | ${row.bytes} | ${formatNumber(row.runs[0]?.itemCount)} | ${formatNumber(row.runs[0]?.markdownItemCount)} | ${formatMs(m.totalMs)} | ${formatBoolean(m.runTimedOut)} | ${formatMs(m.restoreReady?.elapsedMs)} | ${formatMs(m.taskDurationMs)} | ${formatMs(m.scriptDurationMs)} | ${formatMs(m.layoutDurationMs)} | ${formatMs(m.observers?.longTaskTotalMs)} | ${formatPercent(m.observers?.longTaskBusyRatio)} | ${formatMs(m.observers?.frameP95Ms)} | ${formatMs(m.observers?.frameMaxMs)} | ${formatNumber(m.observers?.droppedFrameEstimate)} | ${formatNumber(m.settledTimelineSnapshot?.totalHeight)} | ${formatMs(visibleTimelineDrift)} | ${formatMs(hiddenTimelineDrift)} | ${formatNumber(m.settledSnapshot?.domNodes)} | ${formatNumber(m.heightStabilityWorst?.visibleNonIgnoredChangedSlots)} | ${formatNumber(m.heightStabilityWorst?.nonIgnoredChangedSlots)} | ${formatNumber(m.hiddenRestoreHeightStabilityWorst?.nonIgnoredChangedSlots)} | ${formatMs(m.heightStabilityWorst?.visibleNonIgnoredMaxAbsDeltaPx)} | ${formatDiagnosticMs(m.parsePerformance?.parseMarkdownToStructureTotalMs)} | ${formatDiagnosticMs(m.parsePerformance?.nodeReuseMs)} | ${formatDiagnosticMs(m.parsePerformance?.signatureMs)} | ${m.observers?.cls ?? '-'} |`)
  }
  return lines.join('\n')
}

function renderHeightChangesByTypeTable(rows) {
  const lines = [
    '| Case | Type | Count | Abs delta | Max delta |',
    '| --- | --- | ---: | ---: | ---: |',
  ]
  for (const row of rows) {
    const groups = row.median?.heightStability?.nonIgnoredChangesByType ?? []
    if (!groups.length) {
      lines.push(`| ${row.id} | - | 0 | 0.0 | 0.0 |`)
      continue
    }
    for (const group of groups)
      lines.push(`| ${row.id} | ${group.type || '-'} | ${formatNumber(group.count)} | ${formatMs(group.absDeltaPx)} | ${formatMs(group.maxAbsDeltaPx)} |`)
  }
  return lines.join('\n')
}

function renderOptionsTable(options) {
  const lines = [
    '| Option | Value |',
    '| --- | --- |',
  ]
  for (const [key, value] of Object.entries(options))
    lines.push(`| ${key} | ${String(value)} |`)
  return lines.join('\n')
}

function renderMarkdownReport(payload) {
  const distRows = payload.distFreshness
    .map(item => `| ${item.name} | ${item.distPath} | ${item.stale ? 'yes' : 'no'} | ${item.missing ? 'yes' : 'no'} |`)
    .join('\n')
  return [
    '# Real Corpus Performance Benchmark',
    '',
    `Generated: ${payload.generatedAt}`,
    `Method: parser ${parserRounds}-run median after ${parserWarmups} warmups; browser ${browserRepeats}-run median, Chrome CDP + Vite source aliases.`,
    '',
    '## Environment',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Node | ${process.version} |`,
    `| OS | ${type()} ${release()} (${platform()} ${arch()}) |`,
    `| Memory | ${(totalmem() / 1024 / 1024).toFixed(0)} MB |`,
    '',
    '## Renderer Fixture',
    '',
    renderOptionsTable(payload.config.rendererOptions),
    '',
    '## Final Timeline Markdown Fixture',
    '',
    renderOptionsTable(payload.config.finalTimelineMarkdownOptions),
    '',
    '## Standalone Final Restore Auto Expected Defaults',
    '',
    'Standalone restore cases do not pass these props directly; they exercise the internal final-restore auto path. Use the Browser Restore `Rendered slots` column as runtime evidence for the active window.',
    '',
    renderOptionsTable(payload.config.standaloneFinalRestoreAutoExpectedOptions),
    '',
    '## Smooth Streaming Fixture',
    '',
    renderOptionsTable(payload.config.smoothStreamingOptions),
    '',
    '## Dist Freshness',
    '',
    '| Package | Dist | Stale | Missing |',
    '| --- | --- | ---: | ---: |',
    distRows,
    '',
    '## Parser',
    '',
    renderParserTable(payload.parser),
    '',
    '## Browser Restore',
    '',
    renderBrowserRestoreTable(payload.browser.restore),
    '',
    '### Restore Height Changes By Type',
    '',
    renderHeightChangesByTypeTable(payload.browser.restore),
    '',
    '## Browser Chat Restore',
    '',
    renderBrowserChatRestoreTable(payload.browser.chatRestore),
    '',
    '### Chat Restore Height Changes By Type',
    '',
    renderHeightChangesByTypeTable(payload.browser.chatRestore),
    '',
    '## Browser Streaming',
    '',
    renderBrowserStreamTable(payload.browser.streaming),
    '',
    '### Streaming Height Changes By Type',
    '',
    renderHeightChangesByTypeTable(payload.browser.streaming),
    '',
    'Height stability reports compare rendered content element border-box heights after the first restored/final frame against the settled frame. Main table height columns use the worst run so intermittent non-image/katex height changes are not hidden; the by-type height tables remain median-run diagnostics. Chat restore uses the first visible timeline frame for viewport columns, keeps all mounted DOM node changes as diagnostics, and keeps hidden restore-frame changes as diagnostics. The non-image/katex columns exclude image nodes, slots containing image DOM, math_block nodes, and slots containing KaTeX/math DOM. Frame columns are sampled with requestAnimationFrame across each browser run; dropped frames are estimated from 16.67 ms frame slots. Run long-task busy is Long Task API duration divided by run duration, not full CPU occupancy. Browser task/layout timings still include diagnostic snapshots, but the streaming update loop does not force per-chunk layout reads.',
    '',
  ].join('\n')
}

async function main() {
  validateCaseIds(selectedParserCaseIds, 'parser')
  validateCaseIds(selectedBrowserRestoreCaseIds, 'browser restore')
  validateCaseIds(selectedBrowserStreamCaseIds, 'browser stream')
  validateChatCaseIds(selectedBrowserChatRestoreCaseIds, 'browser chat restore')

  const distFreshness = assertWorkspacePackageDistsFresh()
  const corpus = readCorpus()
  const chatTranscripts = createChatTranscriptCases(corpus)
  mkdirSync(outputDir, { recursive: true })

  console.log('running parser real-corpus benchmark')
  const parser = await runParserBenchmarks(corpus)
  console.log('running browser real-corpus benchmark')
  const browser = await runBrowserBenchmarks(corpus)

  const payload = {
    generatedAt: new Date().toISOString(),
    productionBuild: process.env.MARKSTREAM_BENCHMARK_BUILD === '1',
    sourceRoot,
    source: 'scripts/benchmark-real-corpus-performance.mjs',
    config: {
      parserRounds,
      parserWarmups,
      streamChunkCount,
      browserRepeats,
      browserStreamChunks,
      browserStreamIntervalMs,
      browserViewportWidth,
      browserViewportHeight,
      browserCpuThrottleRate,
      browserDebugPerformance,
      browserChatRestoreOverscan,
      browserChatRestoreOverscanPx,
      rendererOptions: browserRendererOptions,
      finalTimelineMarkdownOptions: browserFinalTimelineMarkdownOptions,
      standaloneFinalRestoreAutoExpectedOptions: browserStandaloneFinalRestoreAutoExpectedOptions,
      smoothStreamingOptions: browserEffectiveSmoothStreamingOptions,
      parserCases: selectedParserCaseIds,
      browserRestoreCases: selectedBrowserRestoreCaseIds,
      browserStreamCases: selectedBrowserStreamCaseIds,
      browserChatRestoreCases: selectedBrowserChatRestoreCaseIds,
    },
    distFreshness,
    corpus: corpus.map(item => ({
      id: item.id,
      label: item.label,
      path: item.path,
      bytes: item.bytes,
      chars: item.chars,
    })),
    chatTranscripts: chatTranscripts.map(item => ({
      id: item.id,
      label: item.label,
      path: item.path,
      bytes: item.bytes,
      chars: item.chars,
      itemCount: item.itemCount,
      markdownItemCount: item.markdownItemCount,
    })),
    parser,
    browser,
  }

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`)
  writeFileSync(outputMarkdownPath, `${renderMarkdownReport(payload)}\n`)
  console.log(`wrote ${path.relative(repoRoot, outputJsonPath)}`)
  console.log(`wrote ${path.relative(repoRoot, outputMarkdownPath)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main()

export { createBenchmarkServer, createChatTranscriptCases, readCorpus, runBrowserCase, summarizeBrowserRuns }
