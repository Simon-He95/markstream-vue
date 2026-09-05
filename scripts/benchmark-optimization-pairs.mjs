#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'

const baselineRoot = process.env.MARKSTREAM_BENCHMARK_BASELINE_ROOT
if (!baselineRoot)
  throw new Error('MARKSTREAM_BENCHMARK_BASELINE_ROOT must point to a frozen baseline checkout.')
const candidateRoot = path.resolve(process.env.MARKSTREAM_BENCHMARK_SOURCE_ROOT || '.')
const outputDir = path.resolve(process.env.MARKSTREAM_PAIRS_OUTPUT_DIR || '.tmp/optimization-pairs')
const repeats = Number(process.env.MARKSTREAM_PAIRS_REPEATS || 3)
const suite = process.env.MARKSTREAM_PAIRS_SUITE || 'stream'
if (!Number.isInteger(repeats) || repeats < 1)
  throw new Error('MARKSTREAM_PAIRS_REPEATS must be a positive integer.')
if (!['stream', 'restore'].includes(suite))
  throw new Error('MARKSTREAM_PAIRS_SUITE must be stream or restore.')
process.env.MARKSTREAM_BENCHMARK_BUILD = '1'
process.env.MARKSTREAM_REAL_CORPUS_BROWSER_REPEATS = '1'
process.env.MARKSTREAM_REAL_CORPUS_DEBUG_PERFORMANCE = '0'
const harness = await import(suite === 'stream' ? './benchmark-streaming-split.mjs' : './benchmark-real-corpus-performance.mjs')
const corpus = suite === 'restore' ? harness.readCorpus() : null
const variants = [
  { id: 'baseline', root: path.resolve(baselineRoot) },
  { id: 'candidate', root: candidateRoot },
]
const servers = []
let browser
const results = []
try {
  for (const variant of variants) {
    const output = path.join(outputDir, variant.id)
    servers.push(suite === 'stream'
      ? await harness.createBenchmarkServer(variant.root, output)
      : await harness.createBenchmarkServer(corpus, variant.root, output))
  }
  const chrome = process.env.PLAYWRIGHT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome, headless: true } : { channel: 'chrome', headless: true })
  const cases = suite === 'stream'
    ? harness.cases.map(testCase => ({ ...testCase, mode: 'stream' }))
    : [
        ...corpus.filter(testCase => (process.env.MARKSTREAM_PAIRS_RESTORE_CASES || 'nested-history,changelog,react-components').split(',').includes(testCase.id)).map(testCase => ({ ...testCase, mode: 'restore' })),
        ...harness.createChatTranscriptCases(corpus).filter(testCase => (process.env.MARKSTREAM_PAIRS_CHAT_CASES || 'docs-chat-thread,many-message-thread').split(',').includes(testCase.id)).map(testCase => ({ ...testCase, mode: 'chat-restore' })),
      ]
  if (!cases.length)
    throw new Error('No benchmark cases selected.')
  const run = async (testCase, variantIndex) => {
    const { port } = servers[variantIndex]
    if (suite === 'stream') {
      const variant = process.env.MARKSTREAM_PAIRS_STREAM_VARIANT || 'incremental'
      return harness.runOnce(browser, port, { id: 'markstream-local', renderer: 'markstream', variant }, harness.createChunks(testCase.block, testCase.prefix), testCase.id)
    }
    const result = await harness.runBrowserCase(browser, port, testCase.mode, testCase)
    return result.runs[0]
  }
  for (const testCase of cases) {
    console.log(`warmup ${testCase.id}`)
    for (let index = 0; index < variants.length; index++)
      await run(testCase, index)
    const runs = [[], []]
    const ratios = []
    for (let repeat = 0; repeat < repeats; repeat++) {
      const order = repeat % 2 ? [1, 0] : [0, 1]
      for (const index of order)
        runs[index].push(await run(testCase, index))
      const before = runs[0][repeat]
      const after = runs[1][repeat]
      if (JSON.stringify(before.correctness) !== JSON.stringify(after.correctness))
        throw new Error(`${testCase.id}: baseline/candidate final semantics differ`)
      if (suite === 'restore' && [before, after].some(run => run.stable?.timedOut || run.restoreReady?.timedOut || run.markerWait?.timedOut || run.prepare?.stable?.timedOut))
        throw new Error(`${testCase.id}: restore did not settle`)
      if (suite === 'restore' && ['domNodes', 'slots', 'placeholders'].some(key => before.settledSnapshot[key] !== after.settledSnapshot[key]))
        throw new Error(`${testCase.id}: baseline/candidate restored DOM differs`)
      ratios.push(after.taskDurationMs / before.taskDurationMs)
      console.log(`${testCase.id} pair=${repeat + 1}: ${before.taskDurationMs.toFixed(1)} -> ${after.taskDurationMs.toFixed(1)}ms`)
    }
    const summarize = suite === 'stream' ? harness.medianResult : harness.summarizeBrowserRuns
    results.push({ id: testCase.id, mode: testCase.mode, pairedTaskRatioMedian: ratios.sort((a, b) => a - b)[Math.floor(ratios.length / 2)], baseline: { median: summarize(runs[0]), runs: runs[0] }, candidate: { median: summarize(runs[1]), runs: runs[1] } })
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(path.join(outputDir, 'latest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), productionBuild: true, suite, repeats, warmupsPerVariant: 1, browserVersion: browser.version(), nodeVersion: process.version, platform: process.platform, arch: process.arch, parameters: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^MARKSTREAM_(?:BENCHMARK_|PAIRS_|STREAMING_SPLIT_|REAL_CORPUS_)/.test(key))), variants, results }, null, 2)}\n`)
  }
}
finally {
  await browser?.close()
  for (const { server } of servers)
    await server.close()
}
