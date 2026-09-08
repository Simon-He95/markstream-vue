import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
import { build, preview } from 'vite'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (!process.env.MARKSTREAM_BENCHMARK_BASELINE_ROOT)
  throw new Error('MARKSTREAM_BENCHMARK_BASELINE_ROOT must point to a frozen baseline checkout.')
const output = path.resolve(process.env.DIFF_BENCH_OUTPUT || '.tmp/benchmark/diff-cpu')
const roots = [process.env.MARKSTREAM_BENCHMARK_BASELINE_ROOT, process.env.MARKSTREAM_BENCHMARK_SOURCE_ROOT || repoRoot]
const cases = [
  ...[1000, 10000, 50000].flatMap(count => [false, true].map(unified => ({ id: `suffix-${count}-${unified ? 'inline' : 'split'}`, kind: 'suffix', count, unified }))),
  { id: 'source-1000-split', kind: 'source', count: 1000 },
  { id: 'source-1000-inline', kind: 'source', count: 1000, unified: true },
  { id: 'thread-8-source', kind: 'source', count: 1000, blocks: 8 },
  { id: 'stream-source', kind: 'stream', count: 1000 },
  { id: 'long-lines-split', kind: 'long-lines', count: 1000 },
  { id: 'long-lines-inline', kind: 'long-lines', count: 1000, unified: true },
  { id: 'thread-4-long-lines', kind: 'long-lines', count: 1000, blocks: 4 },
  { id: 'stream-long-lines', kind: 'stream-long-lines', count: 1000 },
]
const selectedCases = cases.filter(c => !process.env.DIFF_BENCH_CASES || process.env.DIFF_BENCH_CASES.split(',').includes(c.id))
if (!selectedCases.length)
  throw new Error('No diff cases selected.')
const repeats = Number(process.env.DIFF_BENCH_REPEATS || 5)
if (!Number.isInteger(repeats) || repeats < 1)
  throw new Error('DIFF_BENCH_REPEATS must be a positive integer.')
const servers = []
const results = []
let browser
try {
  for (const [i, root] of roots.entries()) {
    const config = { configFile: false, root: path.join(repoRoot, 'test/benchmark/diff-cpu'), plugins: [vue()], logLevel: 'silent', resolve: { alias: [
      { find: 'benchmark-pre-code', replacement: path.join(root, 'src/components/PreCodeNode/PreCodeBlock.vue') },
      { find: 'markstream-core', replacement: path.join(root, 'packages/markstream-core/src/index.ts') },
      { find: 'stream-markdown-parser', replacement: path.join(root, 'packages/markdown-parser/src/index.ts') },
      { find: 'markstream-vue/index.css', replacement: path.join(root, 'src/index.css') },
    ] }, build: { outDir: path.join(output, String(i), 'dist'), emptyOutDir: true }, preview: { host: '127.0.0.1', port: 4291 + i } }
    await build(config)
    servers.push(await preview(config))
  }
  const chrome = process.env.PLAYWRIGHT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome, headless: true } : { channel: 'chrome', headless: true })
  const run = async (testCase, variant, save) => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error')
        errors.push(message.text())
    })
    await page.goto(`http://127.0.0.1:${servers[variant].httpServer.address().port}/`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.ready)
    const client = await page.context().newCDPSession(page)
    await client.send('Performance.enable')
    await client.send('HeapProfiler.collectGarbage')
    const metrics = async () => Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
    const before = await metrics()
    const result = await page.evaluate(testCase => window.runDiffCase(testCase), testCase)
    const after = await metrics()
    await client.send('HeapProfiler.collectGarbage')
    const retained = await metrics()
    assert.deepEqual(errors, [])
    if (save)
      await page.screenshot({ path: path.join(output, `${testCase.id}-${variant}.png`) })
    writeFileSync(path.join(output, `${testCase.id}-${variant}.html`), result.html)
    await page.close()
    return { ...result, retainedHeapMB: retained.JSHeapUsedSize / 1024 / 1024, html: createHash('sha256').update(result.html).digest('hex'), taskMs: (after.TaskDuration - before.TaskDuration) * 1000, scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000, layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000 }
  }
  for (const c of selectedCases) {
    await run(c, 0)
    await run(c, 1)
    const runs = []
    for (let i = 0; i < repeats; i++) {
      let baseline
      let candidate
      if (i % 2) {
        candidate = await run(c, 1, i === repeats - 1)
        baseline = await run(c, 0, i === repeats - 1)
      }
      else {
        baseline = await run(c, 0, i === repeats - 1)
        candidate = await run(c, 1, i === repeats - 1)
      }
      assert.equal(baseline.html, candidate.html)
      assert.equal(baseline.domNodes, candidate.domNodes)
      runs.push({ baseline, candidate })
      console.log(`${c.id} ${i + 1}: ${baseline.taskMs.toFixed(1)} -> ${candidate.taskMs.toFixed(1)}`)
    }
    results.push({ ...c, runs })
    mkdirSync(output, { recursive: true })
    writeFileSync(path.join(output, 'latest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), productionBuild: true, browserVersion: browser.version(), nodeVersion: process.version, platform: process.platform, arch: process.arch, sourceSha256: createHash('sha256').update(readFileSync(path.join(repoRoot, 'src/components/NodeRenderer/NodeRenderer.vue'))).digest('hex'), repeats, roots, results }, null, 2))
  }
}
finally {
  await browser?.close()
  for (const server of servers)
    await server.close()
}
