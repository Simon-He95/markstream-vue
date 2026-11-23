#!/usr/bin/env node

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputPath = path.resolve(repoRoot, readArg('--input') ?? path.join(process.env.MARKSTREAM_PARSER_PERF_OUTPUT_DIR || '.tmp/parser-performance', 'latest.json'))
const baselinePath = path.resolve(repoRoot, readArg('--baseline') ?? 'scripts/parser-performance-baseline.json')
const referencePathValue = readArg('--reference')
const referencePath = referencePathValue == null ? null : path.resolve(repoRoot, referencePathValue)
const updateBaseline = process.argv.includes('--update-baseline')
const deterministicOnly = process.argv.includes('--deterministic')
const evidence = readArg('--evidence')
const timingMetrics = ['streamTotalMs', 'commitMedianMs', 'commitP95Ms', 'commitMaxMs', 'finalFlushMs']
const requiredCaseIds = ['headings-lists', 'prose-code-math', 'currency-no-formula']
const requiredScales = [1, 2, 4]
const requiredScalePairs = ['1->2', '1->4', '2->4']
const sameRunnerTimingMaxRatio = 1.75
const sameRunnerHeapMaxRatio = 2
const sameRunnerHeapFixedSlackBytes = 256 * 1024
const heapGrowthDenominatorFloorBytes = 256 * 1024
const countMetrics = ['processedTokenCount', 'reusedNodeCount', 'outputNodeVisits', 'finalNodeCount']
const positiveCountMetrics = new Set(['processedTokenCount', 'outputNodeVisits', 'finalNodeCount'])
const streamCountMetrics = ['total', 'cacheHits', 'appendHits', 'unboundedAppendHits', 'tailHits', 'fullParses', 'resets', 'chunkedParses']
const streamModes = new Set(['idle', 'cache', 'append', 'tail', 'full', 'reset', 'chunked'])
const heapDiagnosticFields = ['heapUsedBytes', 'oldSpaceUsedBytes', 'codeSpaceUsedBytes', 'codeLargeObjectSpaceUsedBytes']
const absoluteTimingMultipliers = {
  commitMaxMs: { multiplier: 3, fixedSlackMs: 2 },
  commitMedianMs: { multiplier: 4, fixedSlackMs: 0.5 },
  commitP95Ms: { multiplier: 3, fixedSlackMs: 2 },
  finalFlushMs: { multiplier: 3, fixedSlackMs: 2 },
  streamTotalMs: { multiplier: 1.75, fixedSlackMs: 0 },
}

function readArg(name) {
  const prefix = `${name}=`
  const equalsValue = process.argv.find(argument => argument.startsWith(prefix))
  if (equalsValue)
    return equalsValue.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function readJson(filePath, label) {
  if (!existsSync(filePath))
    throw new Error(`${label} not found: ${path.relative(repoRoot, filePath)}`)
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function shapeError(label, field, expectation) {
  throw new TypeError(`${label} invalid at ${field}: ${expectation}.`)
}

function requireObject(value, label, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    shapeError(label, field, 'expected an object')
}

function requireString(value, label, field) {
  if (typeof value !== 'string' || !value.trim())
    shapeError(label, field, 'expected a non-empty string')
}

function requireBoolean(value, label, field) {
  if (typeof value !== 'boolean')
    shapeError(label, field, 'expected a boolean')
}

function requireFiniteNumber(value, label, field, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum)
    shapeError(label, field, `expected a finite number >= ${minimum}`)
}

function requireInteger(value, label, field, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum)
    shapeError(label, field, `expected an integer >= ${minimum}`)
}

function requireSha256(value, label, field) {
  if (typeof value !== 'string' || !/^[a-f\d]{64}$/i.test(value))
    shapeError(label, field, 'expected a 64-character SHA-256')
}

function requireExactValues(values, expected, label, field) {
  if (!Array.isArray(values))
    shapeError(label, field, `expected [${expected.join(', ')}]`)
  const actual = values.slice().sort((a, b) => String(a).localeCompare(String(b)))
  const sortedExpected = expected.slice().sort((a, b) => String(a).localeCompare(String(b)))
  if (actual.length !== sortedExpected.length || actual.some((value, index) => value !== sortedExpected[index]))
    shapeError(label, field, `expected exactly [${expected.join(', ')}]`)
}

function validateEnvironment(environment, label, field) {
  requireObject(environment, label, field)
  for (const key of ['node', 'v8', 'platform', 'release', 'arch', 'cpuModel'])
    requireString(environment[key], label, `${field}.${key}`)
  requireInteger(environment.cpuCount, label, `${field}.cpuCount`, 1)
  requireInteger(environment.totalMemoryBytes, label, `${field}.totalMemoryBytes`, 1)
  requireBoolean(environment.gcExposed, label, `${field}.gcExposed`)
}

function validateHeapExecution(environment, profile, label, field) {
  requireObject(environment.heapExecution, label, `${field}.heapExecution`)
  const expectedMode = profile === 'deep' ? 'jitless-child-process-v1' : 'not-collected'
  if (environment.heapExecution.mode !== expectedMode)
    shapeError(label, `${field}.heapExecution.mode`, `expected ${expectedMode}`)
  requireString(environment.heapExecution.node, label, `${field}.heapExecution.node`)
  requireString(environment.heapExecution.v8, label, `${field}.heapExecution.v8`)
  requireBoolean(environment.heapExecution.jitless, label, `${field}.heapExecution.jitless`)
  requireBoolean(environment.heapExecution.gcExposed, label, `${field}.heapExecution.gcExposed`)
  if (environment.heapExecution.node !== environment.node || environment.heapExecution.v8 !== environment.v8)
    shapeError(label, `${field}.heapExecution`, 'expected the same Node and V8 versions as the main process')
  if (profile === 'deep' && (!environment.heapExecution.jitless || !environment.heapExecution.gcExposed))
    shapeError(label, `${field}.heapExecution`, 'deep reports require jitless and exposed GC')
  if (profile === 'deterministic' && (environment.heapExecution.jitless || environment.heapExecution.gcExposed))
    shapeError(label, `${field}.heapExecution`, 'deterministic reports must not collect heap')
}

function validateStreamStats(stats, label, field) {
  requireObject(stats, label, field)
  for (const key of streamCountMetrics)
    requireInteger(stats[key], label, `${field}.${key}`, key === 'total' ? 1 : 0)
  if (!streamModes.has(stats.lastMode))
    shapeError(label, `${field}.lastMode`, `expected one of ${Array.from(streamModes).join(', ')}`)
}

function validateMetrics(metrics, label, field, heapRequired) {
  requireObject(metrics, label, field)
  for (const metric of timingMetrics) {
    requireFiniteNumber(metrics[metric], label, `${field}.${metric}`)
    if (metrics[metric] <= 0)
      shapeError(label, `${field}.${metric}`, 'expected a finite number > 0')
  }
  if (metrics.commitMedianMs > metrics.commitP95Ms)
    shapeError(label, `${field}.commitMedianMs`, 'expected commitMedianMs <= commitP95Ms')
  if (metrics.commitP95Ms > metrics.commitMaxMs)
    shapeError(label, `${field}.commitP95Ms`, 'expected commitP95Ms <= commitMaxMs')
  if (metrics.commitMaxMs > metrics.streamTotalMs)
    shapeError(label, `${field}.commitMaxMs`, 'expected commitMaxMs <= streamTotalMs')
  for (const metric of countMetrics)
    requireInteger(metrics[metric], label, `${field}.${metric}`, positiveCountMetrics.has(metric) ? 1 : 0)
  if (metrics.reusedNodeCount > metrics.outputNodeVisits)
    shapeError(label, `${field}.reusedNodeCount`, 'expected reusedNodeCount <= outputNodeVisits')
  requireFiniteNumber(metrics.reuseRatio, label, `${field}.reuseRatio`)
  if (metrics.reuseRatio > 1)
    shapeError(label, `${field}.reuseRatio`, 'expected a value <= 1')
  const expectedReuseRatio = metrics.reusedNodeCount / metrics.outputNodeVisits
  if (Math.abs(metrics.reuseRatio - expectedReuseRatio) > 0.000001)
    shapeError(label, `${field}.reuseRatio`, 'expected reusedNodeCount / outputNodeVisits within 0.000001')
  if (metrics.retainedHeapBytes == null) {
    if (heapRequired)
      shapeError(label, `${field}.retainedHeapBytes`, 'expected a finite number when GC is exposed')
  }
  else {
    requireFiniteNumber(metrics.retainedHeapBytes, label, `${field}.retainedHeapBytes`)
  }
  validateStreamStats(metrics.streamStats, label, `${field}.streamStats`)
}

function correctedRetainedHeapBytes(before, after) {
  const heapUsedDelta = after.heapUsedBytes - before.heapUsedBytes
  const codeSpaceDelta = Math.max(0, after.codeSpaceUsedBytes - before.codeSpaceUsedBytes)
  const codeLargeObjectSpaceDelta = Math.max(0, after.codeLargeObjectSpaceUsedBytes - before.codeLargeObjectSpaceUsedBytes)
  return Math.max(0, Math.round(heapUsedDelta - codeSpaceDelta - codeLargeObjectSpaceDelta))
}

function validateHeapDiagnostics(sample, label, field, executionMode) {
  requireObject(sample.heapDiagnostics, label, `${field}.heapDiagnostics`)
  if (sample.heapDiagnostics.executionMode !== executionMode)
    shapeError(label, `${field}.heapDiagnostics.executionMode`, `expected ${executionMode}`)
  for (const phase of ['before', 'after']) {
    const phaseField = `${field}.heapDiagnostics.${phase}`
    requireObject(sample.heapDiagnostics[phase], label, phaseField)
    for (const metric of heapDiagnosticFields)
      requireInteger(sample.heapDiagnostics[phase][metric], label, `${phaseField}.${metric}`, metric === 'heapUsedBytes' ? 1 : 0)
    for (const metric of ['oldSpaceUsedBytes', 'codeSpaceUsedBytes', 'codeLargeObjectSpaceUsedBytes']) {
      if (sample.heapDiagnostics[phase][metric] > sample.heapDiagnostics[phase].heapUsedBytes)
        shapeError(label, `${phaseField}.${metric}`, 'expected heap space <= heapUsed')
    }
  }
  const expected = correctedRetainedHeapBytes(sample.heapDiagnostics.before, sample.heapDiagnostics.after)
  if (sample.retainedHeapBytes !== expected)
    shapeError(label, `${field}.retainedHeapBytes`, `expected ${expected} from heap diagnostics`)
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function requireSummaryMatch(actual, expected, tolerance, label, field, source) {
  if (Math.abs(actual - expected) > tolerance)
    shapeError(label, field, `expected ${expected} from ${source}`)
}

function validateSummaryAgainstSamples(summary, samples, label, field) {
  for (const metric of timingMetrics) {
    const expected = round(median(samples.map(sample => sample[metric])), 3)
    requireSummaryMatch(summary[metric], expected, 0.001, label, `${field}.${metric}`, 'the sample median')
  }
  for (const metric of countMetrics) {
    const expected = Math.round(median(samples.map(sample => sample[metric])))
    requireSummaryMatch(summary[metric], expected, 0, label, `${field}.${metric}`, 'the sample median')
  }
  requireSummaryMatch(
    summary.reuseRatio,
    round(median(samples.map(sample => sample.reuseRatio)), 6),
    0.000001,
    label,
    `${field}.reuseRatio`,
    'the sample median',
  )
  const heapSamples = samples.map(sample => sample.retainedHeapBytes).filter(Number.isFinite)
  if (!heapSamples.length) {
    if (summary.retainedHeapBytes != null)
      shapeError(label, `${field}.retainedHeapBytes`, 'expected null because all samples are null')
  }
  else {
    requireSummaryMatch(
      summary.retainedHeapBytes,
      Math.round(median(heapSamples)),
      0,
      label,
      `${field}.retainedHeapBytes`,
      'the sample median',
    )
  }
  for (const metric of [...streamCountMetrics, 'lastMode']) {
    if (summary.streamStats[metric] !== samples[0].streamStats[metric])
      shapeError(label, `${field}.streamStats.${metric}`, 'expected the first sample stream stat')
  }
}

function validateChunkPlan(chunkPlan, label, field, includeSizes) {
  requireObject(chunkPlan, label, field)
  requireString(chunkPlan.id, label, `${field}.id`)
  if (includeSizes) {
    if (!Array.isArray(chunkPlan.sizes) || !chunkPlan.sizes.length)
      shapeError(label, `${field}.sizes`, 'expected a non-empty integer array')
    chunkPlan.sizes.forEach((size, index) => requireInteger(size, label, `${field}.sizes[${index}]`, 1))
  }
  else {
    requireInteger(chunkPlan.chunks, label, `${field}.chunks`, 1)
    requireSha256(chunkPlan.sizesSha256, label, `${field}.sizesSha256`)
  }
}

function validateScale(scale, label, field, heapRequired, expectedSamples, heapExecutionMode) {
  requireObject(scale, label, field)
  if (!requiredScales.includes(scale.scale))
    shapeError(label, `${field}.scale`, `expected one of ${requiredScales.join(', ')}`)
  requireInteger(scale.sourceChars, label, `${field}.sourceChars`, 1)
  requireInteger(scale.sourceBytes, label, `${field}.sourceBytes`, 1)
  requireSha256(scale.sourceSha256, label, `${field}.sourceSha256`)
  validateChunkPlan(scale.chunkPlan, label, `${field}.chunkPlan`, false)
  validateMetrics(scale.metrics, label, `${field}.metrics`, heapRequired)
  if (expectedSamples == null)
    return
  if (!Array.isArray(scale.samples) || scale.samples.length !== expectedSamples)
    shapeError(label, `${field}.samples`, `expected exactly ${expectedSamples} samples`)
  scale.samples.forEach((sample, index) => {
    const sampleField = `${field}.samples[${index}]`
    validateMetrics(sample, label, sampleField, heapRequired)
    if (heapRequired)
      validateHeapDiagnostics(sample, label, sampleField, heapExecutionMode)
  })
  validateSummaryAgainstSamples(scale.metrics, scale.samples, label, `${field}.metrics`)
}

function validateConfig(config, label, field) {
  requireObject(config, label, field)
  requireInteger(config.rounds, label, `${field}.rounds`, 1)
  requireInteger(config.warmups, label, `${field}.warmups`)
  requireExactValues(config.scaleFactors, requiredScales, label, `${field}.scaleFactors`)
  validateChunkPlan(config.chunkPlan, label, `${field}.chunkPlan`, true)
}

function validateReport(report, label) {
  requireObject(report, label, 'root')
  if (report.schemaVersion !== 1)
    shapeError(label, 'schemaVersion', 'expected 1')
  for (const field of ['benchmarkVersion', 'corpusVersion', 'generatedAt'])
    requireString(report[field], label, field)
  if (!['deep', 'deterministic'].includes(report.profile))
    shapeError(label, 'profile', 'expected deep or deterministic')
  validateEnvironment(report.environment, label, 'environment')
  validateHeapExecution(report.environment, report.profile, label, 'environment')
  requireObject(report.parser, label, 'parser')
  requireString(report.parser.package, label, 'parser.package')
  requireString(report.parser.version, label, 'parser.version')
  validateConfig(report.config, label, 'config')
  requireBoolean(report.config.injectedProcessedTokenRegression, label, 'config.injectedProcessedTokenRegression')
  if (report.profile === 'deep' && report.config.rounds < 3)
    shapeError(label, 'config.rounds', 'deep reports require at least 3 measured rounds')
  if (!Array.isArray(report.cases))
    shapeError(label, 'cases', 'expected a non-empty fixed case array')
  requireExactValues(report.cases.map(testCase => testCase?.id), requiredCaseIds, label, 'cases[].id')
  const heapRequired = report.profile === 'deep' && report.environment.heapExecution.gcExposed
  for (const testCase of report.cases) {
    requireObject(testCase, label, `cases[${testCase?.id ?? '?'}]`)
    if (!Array.isArray(testCase.scales))
      shapeError(label, `cases[${testCase.id}].scales`, 'expected fixed scales')
    requireExactValues(testCase.scales.map(scale => scale?.scale), requiredScales, label, `cases[${testCase.id}].scales[]`)
    testCase.scales.forEach(scale => validateScale(
      scale,
      label,
      `cases[${testCase.id}].scales[${scale.scale}x]`,
      heapRequired,
      report.config.rounds,
      report.environment.heapExecution.mode,
    ))
  }
}

function validateGrowthBudgets(entries, valueField, label, field) {
  if (!Array.isArray(entries))
    shapeError(label, field, 'expected fixed 1x/2x/4x growth budgets')
  requireExactValues(entries.map(entry => `${entry?.fromScale}->${entry?.toScale}`), requiredScalePairs, label, field)
  entries.forEach((entry, index) => requireFiniteNumber(entry[valueField], label, `${field}[${index}].${valueField}`))
}

function validateBaseline(baseline, label) {
  requireObject(baseline, label, 'root')
  if (baseline.schemaVersion !== 1)
    shapeError(label, 'schemaVersion', 'expected 1')
  for (const field of ['benchmarkVersion', 'corpusVersion', 'updatedAt', 'evidence', 'timeEnvironmentKey'])
    requireString(baseline[field], label, field)
  validateEnvironment(baseline.environment, label, 'environment')
  if (baseline.timeEnvironmentKey !== timeEnvironmentKey(baseline.environment))
    shapeError(label, 'timeEnvironmentKey', 'does not match environment metadata')
  requireObject(baseline.parser, label, 'parser')
  requireString(baseline.parser.package, label, 'parser.package')
  requireString(baseline.parser.version, label, 'parser.version')
  validateConfig(baseline.config, label, 'config')
  if (baseline.config.rounds < 3)
    shapeError(label, 'config.rounds', 'baseline requires at least 3 measured rounds')
  if (!Array.isArray(baseline.cases))
    shapeError(label, 'cases', 'expected a non-empty fixed case array')
  requireExactValues(baseline.cases.map(testCase => testCase?.id), requiredCaseIds, label, 'cases[].id')

  for (const testCase of baseline.cases) {
    const caseField = `cases[${testCase?.id ?? '?'}]`
    requireObject(testCase, label, caseField)
    if (!Array.isArray(testCase.referenceScales))
      shapeError(label, `${caseField}.referenceScales`, 'expected fixed scales')
    requireExactValues(testCase.referenceScales.map(scale => scale?.scale), requiredScales, label, `${caseField}.referenceScales[]`)
    testCase.referenceScales.forEach(scale => validateScale(
      scale,
      label,
      `${caseField}.referenceScales[${scale.scale}x]`,
      baseline.environment.gcExposed,
      null,
      null,
    ))
    requireObject(testCase.budgets, label, `${caseField}.budgets`)
    for (const scale of requiredScales) {
      const work = testCase.budgets.work?.[scale]
      requireObject(work, label, `${caseField}.budgets.work[${scale}]`)
      requireInteger(work.processedTokenCountMin, label, `${caseField}.budgets.work[${scale}].processedTokenCountMin`, 1)
      requireInteger(work.processedTokenCountMax, label, `${caseField}.budgets.work[${scale}].processedTokenCountMax`)
      if (work.processedTokenCountMin > work.processedTokenCountMax)
        shapeError(label, `${caseField}.budgets.work[${scale}]`, 'processedTokenCountMin must not exceed processedTokenCountMax')
      requireInteger(work.reusedNodeCountMin, label, `${caseField}.budgets.work[${scale}].reusedNodeCountMin`)
      requireFiniteNumber(work.reuseRatioMin, label, `${caseField}.budgets.work[${scale}].reuseRatioMin`)
      requireInteger(work.fullParsesMax, label, `${caseField}.budgets.work[${scale}].fullParsesMax`)
      const absoluteTiming = testCase.budgets.absoluteTiming?.[scale]
      requireObject(absoluteTiming, label, `${caseField}.budgets.absoluteTiming[${scale}]`)
      timingMetrics.forEach(metric => requireFiniteNumber(absoluteTiming[metric], label, `${caseField}.budgets.absoluteTiming[${scale}].${metric}`))
      requireFiniteNumber(testCase.budgets.retainedHeapBytesMax?.[scale], label, `${caseField}.budgets.retainedHeapBytesMax[${scale}]`)
    }
    validateGrowthBudgets(testCase.budgets.workGrowth, 'processedTokenCountMaxRatio', label, `${caseField}.budgets.workGrowth`)
    validateGrowthBudgets(testCase.budgets.retainedHeapGrowth, 'maxRatio', label, `${caseField}.budgets.retainedHeapGrowth`)
    testCase.budgets.retainedHeapGrowth.forEach((entry, index) => {
      if (entry.denominatorFloorBytes !== heapGrowthDenominatorFloorBytes) {
        shapeError(
          label,
          `${caseField}.budgets.retainedHeapGrowth[${index}].denominatorFloorBytes`,
          `expected ${heapGrowthDenominatorFloorBytes}`,
        )
      }
    })
    requireObject(testCase.budgets.timingGrowth, label, `${caseField}.budgets.timingGrowth`)
    timingMetrics.forEach(metric => validateGrowthBudgets(
      testCase.budgets.timingGrowth[metric],
      'maxRatio',
      label,
      `${caseField}.budgets.timingGrowth.${metric}`,
    ))
  }
}

function round(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits))
}

function ratio(numerator, denominator) {
  if (!(denominator > 0))
    return numerator > 0 ? Number.POSITIVE_INFINITY : 0
  return numerator / denominator
}

function metricByScale(scales, scale, metric) {
  return scales.find(item => item.scale === scale)?.metrics?.[metric]
}

function timeEnvironmentKey(environment) {
  const nodeMajor = String(environment?.node ?? '').match(/^v?(\d+)/)?.[1] ?? 'unknown'
  return [
    environment?.platform ?? 'unknown',
    environment?.arch ?? 'unknown',
    environment?.cpuModel ?? 'unknown',
    nodeMajor,
  ].join('|')
}

function createRatioBudget(scales, metric, fromScale, toScale, minimumSlack) {
  const measured = ratio(
    metricByScale(scales, toScale, metric),
    metricByScale(scales, fromScale, metric),
  )
  return round(Math.max(measured * 1.5, measured + minimumSlack), 3)
}

function createHeapGrowthBudget(scales, fromScale, toScale) {
  const measured = ratio(
    metricByScale(scales, toScale, 'retainedHeapBytes'),
    Math.max(metricByScale(scales, fromScale, 'retainedHeapBytes'), heapGrowthDenominatorFloorBytes),
  )
  return {
    fromScale,
    toScale,
    maxRatio: round(Math.max(measured * 1.5, measured + 0.5), 3),
    denominatorFloorBytes: heapGrowthDenominatorFloorBytes,
  }
}

function createBaseline(report) {
  if (report.profile !== 'deep')
    throw new Error('Baseline updates require a deep report.')
  if (report.config?.rounds < 3)
    throw new Error('Baseline updates require at least three measured rounds.')
  if (report.config?.injectedProcessedTokenRegression)
    throw new Error('Cannot update a baseline from an injected regression report.')
  if (!evidence?.trim())
    throw new Error('Baseline updates require --evidence with the same-run comparison or issue reference.')

  const cases = report.cases.map((testCase) => {
    const referenceScales = testCase.scales.map(item => ({
      scale: item.scale,
      sourceChars: item.sourceChars,
      sourceBytes: item.sourceBytes,
      sourceSha256: item.sourceSha256,
      chunkPlan: item.chunkPlan,
      metrics: item.metrics,
    }))
    const work = Object.fromEntries(referenceScales.map(item => [item.scale, {
      processedTokenCountMin: Math.max(1, Math.floor(item.metrics.processedTokenCount * 0.95)),
      processedTokenCountMax: Math.ceil(item.metrics.processedTokenCount * 1.05 + 4),
      reusedNodeCountMin: Math.max(0, Math.floor(item.metrics.reusedNodeCount * 0.95)),
      reuseRatioMin: round(Math.max(0, item.metrics.reuseRatio - 0.03)),
      fullParsesMax: Number(item.metrics.streamStats?.fullParses || 0) + Math.max(1, Math.ceil(item.chunkPlan.chunks * 0.02)),
    }]))
    const workGrowth = [
      [1, 2],
      [2, 4],
      [1, 4],
    ].map(([fromScale, toScale]) => ({
      fromScale,
      toScale,
      processedTokenCountMaxRatio: createRatioBudget(referenceScales, 'processedTokenCount', fromScale, toScale, 0.25),
    }))
    const timingGrowth = Object.fromEntries(timingMetrics.map(metric => [metric, [
      [1, 2],
      [2, 4],
      [1, 4],
    ].map(([fromScale, toScale]) => ({
      fromScale,
      toScale,
      maxRatio: createRatioBudget(referenceScales, metric, fromScale, toScale, 1),
    }))]))
    const absoluteTiming = Object.fromEntries(referenceScales.map(item => [item.scale, Object.fromEntries(
      timingMetrics.map((metric) => {
        const policy = absoluteTimingMultipliers[metric]
        return [metric, round(item.metrics[metric] * policy.multiplier + policy.fixedSlackMs, 3)]
      }),
    )]))
    const retainedHeapBytesMax = Object.fromEntries(referenceScales.map((item) => {
      const retained = Number(item.metrics.retainedHeapBytes || 0)
      return [item.scale, retained * 3 + 2 * 1024 * 1024]
    }))
    const retainedHeapGrowth = [
      [1, 2],
      [2, 4],
      [1, 4],
    ].map(([fromScale, toScale]) => createHeapGrowthBudget(referenceScales, fromScale, toScale))
    return {
      id: testCase.id,
      referenceScales,
      budgets: {
        work,
        workGrowth,
        timingGrowth,
        absoluteTiming,
        retainedHeapBytesMax,
        retainedHeapGrowth,
      },
    }
  })

  return {
    schemaVersion: 1,
    benchmarkVersion: report.benchmarkVersion,
    corpusVersion: report.corpusVersion,
    updatedAt: new Date().toISOString(),
    evidence: evidence.trim(),
    environment: report.environment,
    timeEnvironmentKey: timeEnvironmentKey(report.environment),
    parser: report.parser,
    config: {
      rounds: report.config.rounds,
      warmups: report.config.warmups,
      scaleFactors: report.config.scaleFactors,
      chunkPlan: report.config.chunkPlan,
    },
    cases,
  }
}

function compare(report, baseline) {
  const failures = []
  const fail = message => failures.push(`[parser-perf] ${message}`)
  const frozenEnvironmentComparable = timeEnvironmentKey(report.environment) === baseline.timeEnvironmentKey
  const baselineHeapExecutionMode = baseline.environment.heapExecution?.mode ?? 'legacy-in-process-jit'
  const frozenHeapComparable = frozenEnvironmentComparable && baselineHeapExecutionMode === report.environment.heapExecution.mode
  if (report.schemaVersion !== baseline.schemaVersion)
    fail(`schemaVersion mismatch: expected ${baseline.schemaVersion}, received ${report.schemaVersion}`)
  if (report.benchmarkVersion !== baseline.benchmarkVersion)
    fail(`benchmarkVersion mismatch: expected ${baseline.benchmarkVersion}, received ${report.benchmarkVersion}`)
  if (report.corpusVersion !== baseline.corpusVersion)
    fail(`corpusVersion mismatch: expected ${baseline.corpusVersion}, received ${report.corpusVersion}`)

  const reportCases = new Map(report.cases.map(testCase => [testCase.id, testCase]))
  for (const baselineCase of baseline.cases) {
    const actualCase = reportCases.get(baselineCase.id)
    if (!actualCase) {
      fail(`case=${baselineCase.id} is missing from the benchmark report`)
      continue
    }
    const actualScales = new Map(actualCase.scales.map(item => [item.scale, item]))
    for (const reference of baselineCase.referenceScales) {
      const actual = actualScales.get(reference.scale)
      if (!actual) {
        fail(`case=${baselineCase.id} scale=${reference.scale}x is missing from the benchmark report`)
        continue
      }
      if (actual.sourceSha256 !== reference.sourceSha256)
        fail(`case=${baselineCase.id} scale=${reference.scale}x sourceSha256 changed`)
      if (actual.chunkPlan?.sizesSha256 !== reference.chunkPlan?.sizesSha256)
        fail(`case=${baselineCase.id} scale=${reference.scale}x deterministic chunk plan changed`)

      const budget = baselineCase.budgets.work[reference.scale]
      const metrics = actual.metrics
      if (metrics.processedTokenCount < budget.processedTokenCountMin) {
        fail(`case=${baselineCase.id} scale=${reference.scale}x metric=processedTokenCount fell below min=${budget.processedTokenCountMin}; actual=${metrics.processedTokenCount}`)
      }
      if (metrics.processedTokenCount > budget.processedTokenCountMax) {
        fail(`case=${baselineCase.id} scale=${reference.scale}x metric=processedTokenCount exceeded max=${budget.processedTokenCountMax}; actual=${metrics.processedTokenCount}`)
      }
      if (metrics.reusedNodeCount < budget.reusedNodeCountMin) {
        fail(`case=${baselineCase.id} scale=${reference.scale}x metric=reusedNodeCount fell below min=${budget.reusedNodeCountMin}; actual=${metrics.reusedNodeCount}`)
      }
      if (metrics.reuseRatio < budget.reuseRatioMin) {
        fail(`case=${baselineCase.id} scale=${reference.scale}x metric=reuseRatio fell below min=${budget.reuseRatioMin}; actual=${metrics.reuseRatio}`)
      }
      const fullParses = Number(metrics.streamStats?.fullParses || 0)
      if (fullParses > budget.fullParsesMax) {
        fail(`case=${baselineCase.id} scale=${reference.scale}x metric=fullParses exceeded max=${budget.fullParsesMax}; actual=${fullParses}`)
      }

      if (!deterministicOnly && report.profile === 'deep' && frozenHeapComparable && Number.isFinite(metrics.retainedHeapBytes)) {
        const maxHeap = baselineCase.budgets.retainedHeapBytesMax[reference.scale]
        if (metrics.retainedHeapBytes > maxHeap) {
          fail(`case=${baselineCase.id} scale=${reference.scale}x metric=retainedHeapBytes exceeded max=${Math.round(maxHeap)}; actual=${metrics.retainedHeapBytes}`)
        }
      }
      if (!deterministicOnly && report.profile === 'deep' && frozenEnvironmentComparable) {
        for (const metric of timingMetrics) {
          const maxMs = baselineCase.budgets.absoluteTiming[reference.scale][metric]
          if (metrics[metric] > maxMs) {
            fail(`case=${baselineCase.id} scale=${reference.scale}x metric=${metric} exceeded same-environment maxMs=${maxMs}; actualMs=${metrics[metric]}`)
          }
        }
      }
    }

    for (const budget of baselineCase.budgets.workGrowth) {
      const fromValue = metricByScale(actualCase.scales, budget.fromScale, 'processedTokenCount')
      const toValue = metricByScale(actualCase.scales, budget.toScale, 'processedTokenCount')
      const actualRatio = ratio(toValue, fromValue)
      if (actualRatio > budget.processedTokenCountMaxRatio) {
        fail(`case=${baselineCase.id} scales=${budget.fromScale}x->${budget.toScale}x metric=processedTokenCountGrowth exceeded maxRatio=${budget.processedTokenCountMaxRatio}; actualRatio=${round(actualRatio)}`)
      }
    }

    if (!deterministicOnly && report.profile === 'deep') {
      if (report.config?.rounds < 3) {
        fail(`case=${baselineCase.id} timing comparison requires at least three measured rounds; actual=${report.config?.rounds ?? 0}`)
      }
      else {
        for (const metric of timingMetrics) {
          for (const budget of baselineCase.budgets.timingGrowth[metric]) {
            const fromValue = metricByScale(actualCase.scales, budget.fromScale, metric)
            const toValue = metricByScale(actualCase.scales, budget.toScale, metric)
            const actualRatio = ratio(toValue, fromValue)
            if (actualRatio > budget.maxRatio) {
              fail(`case=${baselineCase.id} scales=${budget.fromScale}x->${budget.toScale}x metric=${metric} exceeded maxRatio=${budget.maxRatio}; actualRatio=${round(actualRatio)}`)
            }
          }
        }
        if (frozenHeapComparable) {
          for (const budget of baselineCase.budgets.retainedHeapGrowth) {
            const fromValue = metricByScale(actualCase.scales, budget.fromScale, 'retainedHeapBytes')
            const toValue = metricByScale(actualCase.scales, budget.toScale, 'retainedHeapBytes')
            if (!Number.isFinite(fromValue) || !Number.isFinite(toValue))
              continue
            const actualRatio = ratio(toValue, Math.max(fromValue, budget.denominatorFloorBytes))
            if (actualRatio > budget.maxRatio) {
              fail(`case=${baselineCase.id} scales=${budget.fromScale}x->${budget.toScale}x metric=retainedHeapBytesGrowth exceeded maxRatio=${budget.maxRatio}; actualRatio=${round(actualRatio)}`)
            }
          }
        }
      }
    }
  }
  return failures
}

function compareReference(report, reference) {
  const failures = []
  const fail = message => failures.push(`[parser-perf] ${message}`)
  if (report.profile !== 'deep' || reference.profile !== 'deep')
    fail('same-runner reference comparison requires deep reports')
  if (report.benchmarkVersion !== reference.benchmarkVersion)
    fail(`same-runner benchmarkVersion mismatch: reference=${reference.benchmarkVersion}, actual=${report.benchmarkVersion}`)
  if (report.corpusVersion !== reference.corpusVersion)
    fail(`same-runner corpusVersion mismatch: reference=${reference.corpusVersion}, actual=${report.corpusVersion}`)
  for (const field of ['rounds', 'warmups']) {
    if (report.config[field] !== reference.config[field])
      fail(`same-runner config.${field} mismatch: reference=${reference.config[field]}, actual=${report.config[field]}`)
  }
  if (report.config.chunkPlan.id !== reference.config.chunkPlan.id || report.config.chunkPlan.sizes.join(',') !== reference.config.chunkPlan.sizes.join(','))
    fail('same-runner chunk config mismatch')
  if (report.config.injectedProcessedTokenRegression !== reference.config.injectedProcessedTokenRegression)
    fail('same-runner injected-regression config mismatch')
  const actualEnvironment = timeEnvironmentKey(report.environment)
  const referenceEnvironment = timeEnvironmentKey(reference.environment)
  if (actualEnvironment !== referenceEnvironment)
    fail(`same-runner environment mismatch: reference=${referenceEnvironment}, actual=${actualEnvironment}`)
  for (const field of ['node', 'v8', 'platform', 'release', 'arch', 'cpuModel', 'cpuCount', 'totalMemoryBytes', 'gcExposed']) {
    if (report.environment[field] !== reference.environment[field])
      fail(`same-runner environment.${field} mismatch: reference=${reference.environment[field]}, actual=${report.environment[field]}`)
  }
  for (const field of ['mode', 'node', 'v8', 'jitless', 'gcExposed']) {
    if (report.environment.heapExecution[field] !== reference.environment.heapExecution[field])
      fail(`same-runner heapExecution.${field} mismatch: reference=${reference.environment.heapExecution[field]}, actual=${report.environment.heapExecution[field]}`)
  }

  const referenceCases = new Map(reference.cases.map(testCase => [testCase.id, testCase]))
  for (const actualCase of report.cases) {
    const referenceCase = referenceCases.get(actualCase.id)
    if (!referenceCase)
      continue
    for (const actualScale of actualCase.scales) {
      const referenceScale = referenceCase.scales.find(item => item.scale === actualScale.scale)
      if (!referenceScale)
        continue
      if (actualScale.sourceSha256 !== referenceScale.sourceSha256 || actualScale.chunkPlan.sizesSha256 !== referenceScale.chunkPlan.sizesSha256) {
        fail(`case=${actualCase.id} scale=${actualScale.scale}x same-runner source or chunk plan differs`)
        continue
      }
      for (const metric of timingMetrics) {
        const actualRatio = ratio(actualScale.metrics[metric], referenceScale.metrics[metric])
        if (actualRatio > sameRunnerTimingMaxRatio) {
          fail(`case=${actualCase.id} scale=${actualScale.scale}x metric=${metric} exceeded same-runner reference maxRatio=${sameRunnerTimingMaxRatio}; actualRatio=${round(actualRatio)}`)
        }
      }
      const actualHeap = actualScale.metrics.retainedHeapBytes
      const referenceHeap = referenceScale.metrics.retainedHeapBytes
      if (Number.isFinite(actualHeap) && Number.isFinite(referenceHeap)) {
        const maxHeap = referenceHeap * sameRunnerHeapMaxRatio + sameRunnerHeapFixedSlackBytes
        if (actualHeap > maxHeap) {
          fail(`case=${actualCase.id} scale=${actualScale.scale}x metric=retainedHeapBytes exceeded same-runner reference maxRatio=${sameRunnerHeapMaxRatio} plus fixedSlackBytes=${sameRunnerHeapFixedSlackBytes}; reference=${referenceHeap}; actual=${actualHeap}`)
        }
      }
    }
  }
  return failures
}

const report = readJson(inputPath, 'Parser performance report')
validateReport(report, 'Parser performance report')
if (updateBaseline) {
  const baseline = createBaseline(report)
  validateBaseline(baseline, 'Generated parser performance baseline')
  const temporaryBaselinePath = `${baselinePath}.${process.pid}.tmp`
  writeFileSync(temporaryBaselinePath, `${JSON.stringify(baseline, null, 2)}\n`)
  renameSync(temporaryBaselinePath, baselinePath)
  console.log(`[parser-perf] updated ${path.relative(repoRoot, baselinePath)}`)
  console.log(`[parser-perf] evidence: ${baseline.evidence}`)
  process.exit(0)
}

const baseline = readJson(baselinePath, 'Parser performance baseline')
validateBaseline(baseline, 'Parser performance baseline')
const failures = compare(report, baseline)
if (referencePath) {
  const reference = readJson(referencePath, 'Parser performance reference report')
  validateReport(reference, 'Parser performance reference report')
  failures.push(...compareReference(report, reference))
}
if (failures.length) {
  console.error(`[parser-perf] FAIL (${failures.length} metric-level regression${failures.length === 1 ? '' : 's'})`)
  for (const failure of failures)
    console.error(failure)
  process.exit(1)
}

const mode = deterministicOnly || report.profile === 'deterministic' ? 'deterministic work-count' : 'deep repeated-median time/heap'
console.log(`[parser-perf] PASS ${mode} baseline (${report.cases.length} cases, scales 1x/2x/4x).`)
if (!deterministicOnly && report.profile === 'deep') {
  if (timeEnvironmentKey(report.environment) === baseline.timeEnvironmentKey)
    console.log(`[parser-perf] same-environment absolute timing budgets checked (${baseline.timeEnvironmentKey}).`)
  else
    console.log(`[parser-perf] absolute timing budgets skipped across runners (baseline=${baseline.timeEnvironmentKey}, actual=${timeEnvironmentKey(report.environment)}); repeated-median timing scale and deterministic work budgets were checked.`)
  const baselineHeapExecutionMode = baseline.environment.heapExecution?.mode ?? 'legacy-in-process-jit'
  if (timeEnvironmentKey(report.environment) !== baseline.timeEnvironmentKey)
    console.log('[parser-perf] frozen retained-heap ceilings/growth skipped because baseline and report environments differ.')
  else if (baselineHeapExecutionMode !== report.environment.heapExecution.mode)
    console.log(`[parser-perf] frozen retained-heap ceilings/growth skipped because measurement modes differ (baseline=${baselineHeapExecutionMode}, actual=${report.environment.heapExecution.mode}).`)
  else
    console.log(`[parser-perf] same-environment frozen retained-heap budgets checked (mode=${baselineHeapExecutionMode}).`)
  if (referencePath)
    console.log(`[parser-perf] same-runner base/head timing and heap checked (timingMaxRatio=${sameRunnerTimingMaxRatio}, heapMaxRatio=${sameRunnerHeapMaxRatio}, heapFixedSlackBytes=${sameRunnerHeapFixedSlackBytes}).`)
  console.log(`[parser-perf] heap execution mode=${report.environment.heapExecution.mode}; before/after heap-space diagnostics validated.`)
}
