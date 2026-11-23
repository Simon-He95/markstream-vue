#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getHeapSpaceStatistics } from 'node:v8'

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(scriptPath), '..')
const parserDistPath = path.resolve(repoRoot, readArg('--parser-dist') ?? process.env.MARKSTREAM_PARSER_PERF_PARSER_DIST ?? 'packages/markdown-parser/dist/index.js')
const parserPackagePath = path.resolve(path.dirname(parserDistPath), '..', 'package.json')
const packageJson = JSON.parse(readFileSync(
  existsSync(parserPackagePath) ? parserPackagePath : path.join(repoRoot, 'packages/markdown-parser/package.json'),
  'utf8',
))
const outputDir = path.resolve(repoRoot, process.env.MARKSTREAM_PARSER_PERF_OUTPUT_DIR || '.tmp/parser-performance')
const outputPath = path.join(outputDir, 'latest.json')
const profile = readArg('--profile') ?? 'deep'
const rounds = readPositiveIntegerArg('--rounds', profile === 'deterministic' ? 1 : 7)
const warmups = readNonNegativeIntegerArg('--warmups', profile === 'deterministic' ? 0 : 2)
const heapChildMode = process.argv.includes('--heap-child')
// When enabled, every parse runs through a pure `preTransformTokens` hook,
// which forces the token-clone path used by consumers that transform tokens
// (e.g. custom HTML tag demos). This exercises the clone hot path in
// before/after comparisons; it is off by default so continuous regression
// baselines keep measuring the base streaming path.
const transformMode = process.argv.includes('--transform')
const injectProcessedTokenRegression = process.env.MARKSTREAM_PARSER_PERF_INJECT_PROCESSED_TOKEN_REGRESSION === '1'
const injectedHeapRetentionBytes = readNonNegativeIntegerEnvironment('MARKSTREAM_PARSER_PERF_INJECT_HEAP_RETENTION_BYTES')
const scaleFactors = [1, 2, 4]
const chunkSizes = [97, 211, 73, 149, 127, 181, 61, 233]
const injectedHeapRetainers = new Map()

if (!['deep', 'deterministic'].includes(profile))
  throw new Error(`Unknown parser performance profile: ${profile}`)
if (heapChildMode && profile !== 'deep')
  throw new Error('Parser heap child mode requires --profile=deep.')
if (heapChildMode && (!process.execArgv.includes('--jitless') || !process.execArgv.includes('--expose-gc')))
  throw new Error('Parser heap child mode requires --jitless and --expose-gc.')

const corpusDefinitions = [
  {
    id: 'prose-code-math',
    baseUnits: 8,
    createUnit(index) {
      return [
        `## Streaming answer ${index}`,
        '',
        `Paragraph ${index} keeps **strong text**, *emphasis*, \`inline code\`, 中文标点，以及 [link ${index}](https://example.com/${index}).`,
        '',
        `> Quoted explanation ${index} with inline math $x_${index} + y_${index}$.`,
        '',
        '```ts',
        `export const value${index} = { label: 'block-${index}', ready: true }`,
        '```',
        '',
        '$$',
        `\\sum_{i=0}^{${index + 2}} i`,
        '$$',
        '',
      ].join('\n')
    },
  },
  {
    id: 'headings-lists',
    baseUnits: 8,
    createUnit(index) {
      return [
        `### Structured result ${index}`,
        '',
        `- item ${index}.1 with ~~old~~ and ==new== text`,
        `- item ${index}.2`,
        `  - nested ${index}.2.a`,
        '',
        `1. ordered ${index}.1`,
        `2. ordered ${index}.2`,
        '',
        `Direct [entry ${index}](https://example.com/reference/${index}).`,
        '',
      ].join('\n')
    },
  },
  {
    // Prices, not formulas: every `$` is a candidate opener that has to be
    // rejected, which is the shape the inline math rule is slowest on.
    id: 'currency-prose',
    baseUnits: 8,
    createUnit(index) {
      return [
        `### Pricing ${index}`,
        '',
        `Plan ${index} costs $${index + 5} a month or $${(index + 5) * 10} a year, and extra seats are $${index + 2}.50 each after the first $${index + 1},000 of usage.`,
        '',
        `- **Starter:** from $${index + 9} to $${index + 19} per seat, with $${index + 3} add-ons`,
        `- **Team:** $${index + 29}/seat, budgets of $${index}k–$${index + 3}k, *about* $${index + 7} saved`,
        '',
        `> Refunds of $${index + 4} or less take 3 days; anything above $${index + 40} needs approval.`,
        '',
      ].join('\n')
    },
  },
]
const benchmarkVersion = 'parser-performance-v1'
const corpusManifest = corpusDefinitions.map(definition => ({
  id: definition.id,
  baseUnits: definition.baseUnits,
  sources: scaleFactors.map(scale => hash(createSource(definition, scale))),
}))
const corpusVersion = `sha256:${hash(JSON.stringify(corpusManifest))}`

function readArg(name) {
  const prefix = `${name}=`
  const equalsValue = process.argv.find(argument => argument.startsWith(prefix))
  if (equalsValue)
    return equalsValue.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function readPositiveIntegerArg(name, fallback) {
  const raw = readArg(name)
  if (raw == null)
    return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer.`)
  return value
}

function readNonNegativeIntegerArg(name, fallback) {
  const raw = readArg(name)
  if (raw == null)
    return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer.`)
  return value
}

function readNonNegativeIntegerEnvironment(name) {
  const raw = process.env[name]
  if (raw == null)
    return 0
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer.`)
  return value
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function round(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits))
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length)
    return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function percentile(values, percentileValue) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length)
    return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))]
}

function createSource(definition, scale) {
  return Array.from(
    { length: definition.baseUnits * scale },
    (_, index) => definition.createUnit(index),
  ).join('')
}

function createChunks(source) {
  const chunks = []
  let offset = 0
  let planIndex = 0
  while (offset < source.length) {
    const size = chunkSizes[planIndex % chunkSizes.length]
    chunks.push(source.slice(offset, offset + size))
    offset += size
    planIndex++
  }
  return chunks
}

function forceGc() {
  if (typeof globalThis.gc !== 'function')
    return null
  globalThis.gc()
  globalThis.gc()
  return process.memoryUsage().heapUsed
}

function captureHeapDiagnostics() {
  const spaces = new Map(getHeapSpaceStatistics().map(space => [space.space_name, space.space_used_size]))
  return {
    heapUsedBytes: process.memoryUsage().heapUsed,
    oldSpaceUsedBytes: spaces.get('old_space') ?? 0,
    codeSpaceUsedBytes: spaces.get('code_space') ?? 0,
    codeLargeObjectSpaceUsedBytes: spaces.get('code_large_object_space') ?? 0,
  }
}

function retainedHeapBytes(before, after) {
  const heapUsedDelta = after.heapUsedBytes - before.heapUsedBytes
  const codeSpaceDelta = Math.max(0, after.codeSpaceUsedBytes - before.codeSpaceUsedBytes)
  const codeLargeObjectSpaceDelta = Math.max(0, after.codeLargeObjectSpaceUsedBytes - before.codeLargeObjectSpaceUsedBytes)
  return Math.max(0, Math.round(heapUsedDelta - codeSpaceDelta - codeLargeObjectSpaceDelta))
}

function retainInjectedHeap(key) {
  if (!heapChildMode || injectedHeapRetentionBytes === 0)
    return null
  const retained = new Array(Math.ceil(injectedHeapRetentionBytes / 8)).fill(key)
  injectedHeapRetainers.set(key, retained)
  return key
}

function summarizeSamples(samples) {
  const metric = key => round(median(samples.map(sample => sample[key])))
  const retainedHeapSamples = samples
    .map(sample => sample.retainedHeapBytes)
    .filter(Number.isFinite)
  const first = samples[0]
  return {
    streamTotalMs: metric('streamTotalMs'),
    commitMedianMs: metric('commitMedianMs'),
    commitP95Ms: metric('commitP95Ms'),
    commitMaxMs: metric('commitMaxMs'),
    finalFlushMs: metric('finalFlushMs'),
    processedTokenCount: Math.round(median(samples.map(sample => sample.processedTokenCount))),
    reusedNodeCount: Math.round(median(samples.map(sample => sample.reusedNodeCount))),
    reuseRatio: round(median(samples.map(sample => sample.reuseRatio)), 6),
    retainedHeapBytes: retainedHeapSamples.length ? Math.round(median(retainedHeapSamples)) : null,
    outputNodeVisits: Math.round(median(samples.map(sample => sample.outputNodeVisits))),
    finalNodeCount: Math.round(median(samples.map(sample => sample.finalNodeCount))),
    streamStats: first.streamStats,
  }
}

function crossVersionInstrumentationOptions(metrics) {
  // This collector runs unchanged against both the comparison-base dist and head.
  return {
    reuseStableTopLevelNodes: true,
    parserMetrics: metrics,
    __reuseStableTopLevelNodes: true,
    __timing: metrics,
  }
}

// Pure, stable transform hook that only forces the token-clone path. Parser
// runtimes compare hook identity across streaming commits, so recreating this
// function per commit would reset incremental parser state and invalidate the
// benchmark workload.
const identityTokenTransform = tokens => tokens

function withTransformOptions(options) {
  if (!transformMode)
    return options
  return {
    ...options,
    preTransformTokens: identityTokenTransform,
  }
}

async function runSample(parser, definition, scale, sampleIndex) {
  const { getMarkdown, parseMarkdownToStructure } = parser
  const source = createSource(definition, scale)
  const chunks = createChunks(source)
  forceGc()
  forceGc()
  const beforeHeapDiagnostics = heapChildMode ? captureHeapDiagnostics() : null
  const md = getMarkdown(`parser-perf-${definition.id}-${scale}-${sampleIndex}`)
  md.stream?.reset?.()
  md.stream?.resetStats?.()
  const commitDurations = []
  let current = ''
  let processedTokenCount = 0
  let reusedNodeCount = 0
  let outputNodeVisits = 0

  for (const chunk of chunks) {
    current += chunk
    const timing = {}
    const startedAt = performance.now()
    const nodes = parseMarkdownToStructure(current, md, withTransformOptions({
      final: false,
      streamParse: true,
      ...crossVersionInstrumentationOptions(timing),
    }))
    commitDurations.push(performance.now() - startedAt)
    processedTokenCount += Number(timing.processTokensInputTokens || 0)
    reusedNodeCount += Number(timing.processTokensReusedTopLevelNodes || 0)
    outputNodeVisits += nodes.length
  }

  const retentionKey = retainInjectedHeap(`${definition.id}-${scale}-${sampleIndex}`)
  forceGc()
  const afterHeapDiagnostics = heapChildMode ? captureHeapDiagnostics() : null
  if (retentionKey) {
    if (!injectedHeapRetainers.get(retentionKey)?.length)
      throw new Error('Injected parser heap retention was released before measurement.')
    injectedHeapRetainers.delete(retentionKey)
  }
  const finalTiming = {}
  const finalStartedAt = performance.now()
  const finalNodes = parseMarkdownToStructure(source, md, withTransformOptions({
    final: true,
    streamParse: true,
    ...crossVersionInstrumentationOptions(finalTiming),
  }))
  const finalFlushMs = performance.now() - finalStartedAt
  const streamStats = md.stream?.stats?.() ?? null
  md.stream?.reset?.()

  if (injectProcessedTokenRegression)
    processedTokenCount *= scale

  return {
    streamTotalMs: commitDurations.reduce((total, duration) => total + duration, 0),
    commitMedianMs: median(commitDurations),
    commitP95Ms: percentile(commitDurations, 0.95),
    commitMaxMs: Math.max(...commitDurations),
    finalFlushMs,
    processedTokenCount,
    reusedNodeCount,
    reuseRatio: outputNodeVisits ? reusedNodeCount / outputNodeVisits : 0,
    retainedHeapBytes: beforeHeapDiagnostics == null || afterHeapDiagnostics == null
      ? null
      : retainedHeapBytes(beforeHeapDiagnostics, afterHeapDiagnostics),
    heapDiagnostics: beforeHeapDiagnostics == null || afterHeapDiagnostics == null
      ? null
      : {
          executionMode: 'jitless-child-process-v1',
          before: beforeHeapDiagnostics,
          after: afterHeapDiagnostics,
        },
    outputNodeVisits,
    finalNodeCount: finalNodes.length,
    streamStats,
  }
}

async function runScale(parser, definition, scale) {
  const source = createSource(definition, scale)
  const chunks = createChunks(source)
  const samples = []
  for (let sampleIndex = 0; sampleIndex < warmups + rounds; sampleIndex++) {
    const sample = await runSample(parser, definition, scale, sampleIndex)
    if (sampleIndex >= warmups)
      samples.push(sample)
  }

  return {
    scale,
    sourceChars: source.length,
    sourceBytes: Buffer.byteLength(source),
    sourceSha256: hash(source),
    chunkPlan: {
      id: 'fixed-size-cycle-v1',
      chunks: chunks.length,
      sizesSha256: hash(JSON.stringify(chunks.map(chunk => chunk.length))),
    },
    metrics: summarizeSamples(samples),
    samples: samples.map(sample => ({
      ...sample,
      streamTotalMs: round(sample.streamTotalMs),
      commitMedianMs: round(sample.commitMedianMs),
      commitP95Ms: round(sample.commitP95Ms),
      commitMaxMs: round(sample.commitMaxMs),
      finalFlushMs: round(sample.finalFlushMs),
      reuseRatio: round(sample.reuseRatio, 6),
    })),
  }
}

function heapExecutionMetadata(mode) {
  return {
    mode,
    node: process.version,
    v8: process.versions.v8,
    jitless: mode === 'jitless-child-process-v1',
    gcExposed: mode === 'jitless-child-process-v1' && typeof globalThis.gc === 'function',
  }
}

function environmentMetadata(heapExecution) {
  const cpus = os.cpus()
  return {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    cpuModel: cpus[0]?.model ?? 'unknown',
    cpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
    gcExposed: typeof globalThis.gc === 'function',
    heapExecution,
  }
}

function runHeapChild() {
  const childArgs = [
    '--jitless',
    '--expose-gc',
    scriptPath,
    '--heap-child',
    '--profile=deep',
    `--rounds=${rounds}`,
    `--warmups=${warmups}`,
    `--parser-dist=${parserDistPath}`,
  ]
  if (transformMode)
    childArgs.push('--transform')

  const child = spawnSync(process.execPath, childArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024,
  })
  if (child.error)
    throw child.error
  if (child.status !== 0)
    throw new Error(`Parser heap child failed with exit ${child.status}: ${child.stderr || child.stdout}`)
  try {
    return JSON.parse(child.stdout)
  }
  catch (error) {
    throw new Error(`Parser heap child returned invalid JSON: ${error.message}; stdout=${child.stdout}; stderr=${child.stderr}`)
  }
}

function mergeHeapMeasurements(cases, heapReport) {
  if (heapReport.schemaVersion !== 1 || heapReport.heapExecution?.mode !== 'jitless-child-process-v1' || !heapReport.heapExecution.jitless || !heapReport.heapExecution.gcExposed)
    throw new Error('Parser heap child returned invalid execution metadata.')
  if (heapReport.benchmarkVersion !== benchmarkVersion || heapReport.corpusVersion !== corpusVersion)
    throw new Error('Parser heap child returned mismatched benchmark or corpus identity.')
  if (heapReport.parser?.package !== packageJson.name || heapReport.parser?.version !== packageJson.version)
    throw new Error('Parser heap child returned mismatched parser identity.')
  if (heapReport.config?.rounds !== rounds || heapReport.config?.warmups !== warmups || heapReport.config?.transformMode !== transformMode || JSON.stringify(heapReport.config?.scaleFactors) !== JSON.stringify(scaleFactors) || JSON.stringify(heapReport.config?.chunkPlan) !== JSON.stringify({ id: 'fixed-size-cycle-v1', sizes: chunkSizes }))
    throw new Error('Parser heap child returned mismatched benchmark config.')
  if (JSON.stringify(heapReport.cases.map(testCase => testCase.id)) !== JSON.stringify(cases.map(testCase => testCase.id)))
    throw new Error('Parser heap child returned a mismatched case set.')
  const heapCases = new Map(heapReport.cases.map(testCase => [testCase.id, testCase]))
  for (const testCase of cases) {
    const heapCase = heapCases.get(testCase.id)
    if (!heapCase)
      throw new Error(`Parser heap child omitted case=${testCase.id}.`)
    if (JSON.stringify(heapCase.scales.map(scale => scale.scale)) !== JSON.stringify(testCase.scales.map(scale => scale.scale)))
      throw new Error(`Parser heap child returned mismatched scales for case=${testCase.id}.`)
    const heapScales = new Map(heapCase.scales.map(scale => [scale.scale, scale]))
    for (const scale of testCase.scales) {
      const heapScale = heapScales.get(scale.scale)
      if (!heapScale || heapScale.sourceSha256 !== scale.sourceSha256 || heapScale.chunkPlan?.id !== scale.chunkPlan.id || heapScale.chunkPlan?.chunks !== scale.chunkPlan.chunks || heapScale.chunkPlan?.sizesSha256 !== scale.chunkPlan.sizesSha256 || heapScale.samples.length !== scale.samples.length)
        throw new Error(`Parser heap child mismatch for case=${testCase.id} scale=${scale.scale}x.`)
      for (const [index, sample] of scale.samples.entries()) {
        sample.retainedHeapBytes = heapScale.samples[index].retainedHeapBytes
        sample.heapDiagnostics = heapScale.samples[index].heapDiagnostics
      }
      scale.metrics.retainedHeapBytes = Math.round(median(scale.samples.map(sample => sample.retainedHeapBytes)))
    }
  }
}

const parser = await import(pathToFileURL(parserDistPath).href)
const cases = []
for (const definition of corpusDefinitions) {
  const scales = []
  for (const scale of scaleFactors) {
    if (!heapChildMode)
      console.log(`[parser-perf] case=${definition.id} scale=${scale}x profile=${profile}`)
    scales.push(await runScale(parser, definition, scale))
  }
  cases.push({ id: definition.id, scales })
}

if (heapChildMode) {
  const heapChildOutput = JSON.stringify({
    schemaVersion: 1,
    benchmarkVersion,
    corpusVersion,
    heapExecution: heapExecutionMetadata('jitless-child-process-v1'),
    parser: {
      package: packageJson.name,
      version: packageJson.version,
    },
    config: {
      rounds,
      warmups,
      transformMode,
      scaleFactors,
      chunkPlan: {
        id: 'fixed-size-cycle-v1',
        sizes: chunkSizes,
      },
    },
    cases: cases.map(testCase => ({
      id: testCase.id,
      scales: testCase.scales.map(scale => ({
        scale: scale.scale,
        sourceSha256: scale.sourceSha256,
        chunkPlan: scale.chunkPlan,
        samples: scale.samples.map(sample => ({
          retainedHeapBytes: sample.retainedHeapBytes,
          heapDiagnostics: sample.heapDiagnostics,
        })),
      })),
    })),
  })
  await new Promise(resolve => process.stdout.write(heapChildOutput, resolve))
  process.exit(0)
}

const heapReport = profile === 'deep' ? runHeapChild() : null
if (heapReport)
  mergeHeapMeasurements(cases, heapReport)

const report = {
  schemaVersion: 1,
  benchmarkVersion,
  corpusVersion,
  generatedAt: new Date().toISOString(),
  profile,
  environment: environmentMetadata(
    heapReport?.heapExecution ?? heapExecutionMetadata('not-collected'),
  ),
  parser: {
    package: packageJson.name,
    version: packageJson.version,
  },
  config: {
    rounds,
    warmups,
    scaleFactors,
    chunkPlan: {
      id: 'fixed-size-cycle-v1',
      sizes: chunkSizes,
    },
    injectedProcessedTokenRegression: injectProcessedTokenRegression,
    transformMode,
  },
  cases,
}

mkdirSync(outputDir, { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`[parser-perf] wrote ${path.relative(repoRoot, outputPath)}`)
