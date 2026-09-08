import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baselineRoot = process.env.MARKSTREAM_BENCHMARK_BASELINE_ROOT
if (!baselineRoot)
  throw new Error('MARKSTREAM_BENCHMARK_BASELINE_ROOT must point to a frozen baseline checkout.')
const candidateRoot = process.env.MARKSTREAM_BENCHMARK_SOURCE_ROOT || repoRoot
const output = path.resolve(process.env.DIFF_BENCH_OUTPUT || '.tmp/benchmark/diff-cpu-kernels')
const variants = await Promise.all([baselineRoot, candidateRoot].map(async root => ({
  stats: (await import(pathToFileURL(path.join(root, 'src/components/CodeBlockNode/codeBlockHeader.ts')).href)).estimateDiffStats,
  ...(await import(pathToFileURL(path.join(root, 'packages/markstream-core/src/diff-preview.ts')).href)),
})))
const [baseline, candidate] = variants
let seed = 123456789
function random(n: number) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed % n
}
const tokens = ['a', 'b', '', '中文', '<div>', 'x '.repeat(120)]
let prefixChecks = 0
for (let i = 0; i < 1000; i++) {
  const originalCode = Array.from({ length: random(30) }, () => tokens[random(tokens.length)]).join(['\n', '\r\n', '\r'][i % 3])
  const updatedCode = Array.from({ length: random(30) }, () => tokens[random(tokens.length)]).join(['\n', '\r\n', '\r'][(i + 1) % 3])
  assert.deepEqual(candidate.stats(originalCode, updatedCode), baseline.stats(originalCode, updatedCode))
  for (const inline of [true, false]) {
    const options = { originalCode, updatedCode, inline, hideUnchangedRegions: i % 2 === 0, loading: i % 3 === 0 }
    assert.deepEqual(candidate.buildDiffPreviewPanes(options), baseline.buildDiffPreviewPanes(options))
    if (i >= 100)
      continue
    const caches = variants.map(variant => variant.createDiffMatchCache())
    for (let length = 0; length <= updatedCode.length; length += 7) {
      const prefix = { ...options, updatedCode: updatedCode.slice(0, length), loading: true }
      assert.deepEqual(candidate.buildDiffPreviewPanes({ ...prefix, matchCache: caches[1] }), baseline.buildDiffPreviewPanes({ ...prefix, matchCache: caches[0] }))
      prefixChecks++
    }
    assert.deepEqual(candidate.buildDiffPreviewPanes({ ...options, loading: false, matchCache: caches[1] }), baseline.buildDiffPreviewPanes({ ...options, loading: false, matchCache: caches[0] }))
    prefixChecks++
  }
}
console.log(`1000 randomized stats, 2000 full-pane cases and ${prefixChecks} cached streaming prefixes/finalizations passed`)
const source = readFileSync(path.join(repoRoot, 'src/components/NodeRenderer/NodeRenderer.vue'), 'utf8')
const cases = [
  { id: 'small', lines: Array.from({ length: 30 }, (_, i) => `line ${i}`), mode: 'rewrite' },
  { id: 'source-1000', lines: source.split('\n').slice(0, 1000), mode: 'rewrite' },
  { id: 'long-lines-1000', lines: Array.from({ length: 1000 }, (_, i) => `${'unchanged common code prefix '.repeat(12)} ${i}`), mode: 'rewrite' },
  { id: 'repeated-1000', lines: Array.from({ length: 1000 }, (_, i) => `repeat ${i % 7}`), mode: 'rewrite' },
  { id: 'threshold-1500', lines: Array.from({ length: 1500 }, (_, i) => `line ${i}`), mode: 'rewrite' },
  ...[1000, 10000, 50000].map(size => ({ id: `suffix-${size}`, lines: Array.from({ length: size }, (_, i) => `const value${i} = ${i}`), mode: 'suffix' })),
]
const results = []
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
for (const testCase of cases) {
  const pairs = Array.from({ length: 6 }, (_, variation) => {
    const before = testCase.lines.slice()
    const after = before.map((line, i) => testCase.mode === 'suffix'
      ? i === 0 ? `changed ${variation}` : line
      : i % 13 === 0 ? `${line} changed ${variation}` : line)
    if (testCase.mode !== 'suffix')
      after.push(`new tail ${variation}`)
    return [before.join('\n'), after.join('\n')]
  })
  for (const operation of ['stats', 'preview']) {
    const functions = variants.map(variant => (a: string, b: string) => operation === 'stats'
      ? variant.stats(a, b)
      : variant.buildDiffPreviewPanes({ originalCode: a, updatedCode: b, inline: false, hideUnchangedRegions: true }))
    for (const [a, b] of pairs)
      assert.deepEqual(functions[1](a, b), functions[0](a, b))
    const loops = testCase.lines.length >= 10000 ? 1 : testCase.lines.length < 100 ? 100 : 3
    const run = (fn: typeof functions[number]) => {
      const cpu = process.cpuUsage()
      const start = performance.now()
      for (let j = 0; j < loops; j++) {
        for (const [a, b] of pairs)
          fn(a, b)
      }
      const ms = performance.now() - start
      const usage = process.cpuUsage(cpu)
      return { ms, cpuMs: (usage.user + usage.system) / 1000 }
    }
    run(functions[0])
    run(functions[1])
    const runs = []
    for (let r = 0; r < 5; r++) {
      let before
      let after
      if (r % 2) {
        after = run(functions[1])
        before = run(functions[0])
      }
      else {
        before = run(functions[0])
        after = run(functions[1])
      }
      runs.push({ before, after, ratio: after.ms / before.ms })
    }
    const row = { id: testCase.id, operation, calls: loops * pairs.length, beforeMs: median(runs.map(r => r.before.ms)), afterMs: median(runs.map(r => r.after.ms)), ratio: median(runs.map(r => r.ratio)), runs }
    results.push(row)
    console.log(JSON.stringify({ ...row, runs: undefined }))
    mkdirSync(output, { recursive: true })
    writeFileSync(path.join(output, 'latest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), baselineRoot, candidateRoot, nodeVersion: process.version, platform: process.platform, arch: process.arch, sourceSha256: createHash('sha256').update(source).digest('hex'), seed: 123456789, randomizedStatsCases: 1000, randomizedPaneCases: 2000, prefixChecks, results }, null, 2))
  }
}
