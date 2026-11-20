#!/usr/bin/env node

/**
 * Head-to-head benchmark for `@pierre/diffs` versions on the same hardware.
 *
 * Each version is installed into an isolated directory and measured in its own
 * process, because the highlighter backend is a module-level singleton that
 * cannot be switched mid-process (see `disposeHighlighter`). Backend variants
 * therefore also need separate processes.
 *
 * Usage:
 *   node scripts/benchmark-diffs-versions.mjs
 *   DIFFS_BENCH_VERSIONS=1.2.12,1.6.4 node scripts/benchmark-diffs-versions.mjs
 *   node scripts/benchmark-diffs-versions.mjs --skip-install   # reuse installs
 *
 * Output: benchmark/diffs-upgrade/latest.json and latest.md
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
// Outside the repo: npm would otherwise inherit this workspace's
// `workspace:*` dependencies and refuse to install.
const workRoot = path.resolve(process.env.DIFFS_BENCH_WORK_DIR || path.join(tmpdir(), 'markstream-diffs-upgrade-bench'))
const outputDir = path.resolve(repoRoot, process.env.DIFFS_BENCH_OUTPUT_DIR || 'benchmark/diffs-upgrade')
const versions = (process.env.DIFFS_BENCH_VERSIONS || '1.2.12,1.6.4')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
const backends = (process.env.DIFFS_BENCH_BACKENDS || 'shiki-js,highlights')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
const skipInstall = process.argv.includes('--skip-install')

const CHILD_SOURCE = `
import { performance } from 'node:perf_hooks'
import process from 'node:process'

const backend = process.env.BENCH_BACKEND || 'shiki-js'
const results = { backend, measurements: {}, status: 'ok', error: null }

// Node 20 has no global navigator and @pierre/diffs reads navigator.userAgent
// when choosing an engine; both children must see the same shape.
if (globalThis.navigator == null)
  globalThis.navigator = { userAgent: \`node/\${process.versions.node}\` }

// Line-oriented payload so a "600 line" label really means 600 lines.
const LINE_TEMPLATES = [
  index => \`export function fn\${index}(input: string): string {\`,
  index => \`  const value = input.trim().toLowerCase() // line \${index}\`,
  index => \`  if (value.length > \${index % 40}) {\`,
  index => \`    return \\\`\\\${value}-\\\${index} \\\${JSON.stringify({ a: 1, b: [2, 3] })}\\\`\`,
  '  }',
  index => \`  return value.slice(0, \${index % 20}) + String(\${index})\`,
  '}',
]

function makeCode(lines) {
  const out = []
  for (let index = 0; index < lines; index++) {
    const template = LINE_TEMPLATES[index % LINE_TEMPLATES.length]
    out.push(typeof template === 'function' ? template(index) : template)
  }
  return \`\${out.join('\\n')}\\n\`
}

function makePair(lines) {
  const before = makeCode(lines).split('\\n')
  const after = before.map((line, index) => (index % 13 === 0 ? line.replace('const ', 'let ') : line))
  after.splice(3, 0, '// inserted for the diff payload')
  return {
    oldFile: { name: 'bench.ts', contents: before.join('\\n'), lang: 'typescript' },
    newFile: { name: 'bench.ts', contents: after.join('\\n'), lang: 'typescript' },
  }
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

async function measure(fn, samples, warmup = 1) {
  for (let index = 0; index < warmup; index++)
    await fn()
  const timings = []
  for (let index = 0; index < samples; index++) {
    const start = performance.now()
    await fn()
    timings.push(performance.now() - start)
  }
  return {
    median: +percentile(timings, 50).toFixed(2),
    p95: +percentile(timings, 95).toFixed(2),
  }
}

try {
  const importStart = performance.now()
  const ssr = await import('@pierre/diffs/ssr')
  const diffs = await import('@pierre/diffs')
  results.measurements.importMs = +(performance.now() - importStart).toFixed(2)

  const code = { 40: makeCode(40), 600: makeCode(600), 2400: makeCode(2400) }
  const pair = makePair(1200)
  const options = { theme: 'pierre-dark' }

  // The WASM backend only exists from 1.6 and is reported by canUseWASM().
  if (backend !== 'shiki-js' && typeof diffs.canUseWASM !== 'function') {
    results.status = 'unsupported'
    results.error = 'backend-not-available'
    console.log('BENCH_JSON:' + JSON.stringify(results))
    process.exit(0)
  }
  if (backend === 'highlights' && diffs.canUseWASM() === false) {
    results.status = 'unsupported'
    results.error = 'wasm-unavailable'
    console.log('BENCH_JSON:' + JSON.stringify(results))
    process.exit(0)
  }

  const coldStart = performance.now()
  await ssr.preloadFile({
    file: { name: 'bench.ts', contents: code[40], lang: 'typescript' },
    options: { ...options, preferredHighlighter: backend },
  })
  results.measurements.coldFirstRenderMs = +(performance.now() - coldStart).toFixed(2)

  for (const lines of [40, 600, 2400]) {
    const samples = lines >= 2400 ? 4 : lines >= 600 ? 6 : 8
    results.measurements['file' + lines] = await measure(() => ssr.preloadFile({
      file: { name: 'bench.ts', contents: code[lines], lang: 'typescript' },
      options: { ...options, preferredHighlighter: backend },
    }), samples, 2)
  }

  results.measurements['diff1200'] = await measure(() => ssr.preloadMultiFileDiff({
    ...pair,
    options: { ...options, diffStyle: 'split', preferredHighlighter: backend },
  }), 4, 1)

  results.measurements['file600themePair'] = await measure(() => ssr.preloadFile({
    file: { name: 'bench.ts', contents: code[600], lang: 'typescript' },
    options: { theme: { dark: 'pierre-dark', light: 'pierre-light' }, preferredHighlighter: backend },
  }), 4, 1)

  results.measurements['parseDiff1200'] = await measure(
    () => diffs.parseDiffFromFile(pair.oldFile, pair.newFile),
    6,
    2,
  )

  // Record what the shared registry actually resolved to. It is first-wins, so
  // a mislabeled run would otherwise look valid.
  results.actualBackend = await diffs.getSharedHighlighter({
    themes: ['pierre-dark'],
    langs: ['typescript'],
    preferredHighlighter: backend,
  }).then(instance => instance.name).catch(() => null)

  results.chars = { 40: code[40].length, 600: code[600].length, 2400: code[2400].length, diff1200: pair.newFile.contents.length }
}
catch (error) {
  results.status = 'failed'
  results.error = String(error && error.message ? error.message : error)
}

console.log('BENCH_JSON:' + JSON.stringify(results))
`

function supportsBackend(version, backend) {
  if (backend === 'shiki-js' || backend === 'shiki-wasm')
    return true
  if (backend !== 'highlights')
    return false
  const [major = 0, minor = 0] = version.split('.').map(value => Number.parseInt(value, 10) || 0)
  return major > 1 || (major === 1 && minor >= 6)
}

function installVersion(version) {
  const dir = path.join(workRoot, version)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: `diffs-bench-${version.replace(/\./g, '-')}`, private: true, type: 'module' }, null, 2)}\n`,
    'utf8',
  )
  writeFileSync(path.join(dir, 'bench-child.mjs'), CHILD_SOURCE, 'utf8')
  if (skipInstall && existsSync(path.join(dir, 'node_modules/@pierre/diffs/package.json')))
    return dir
  const install = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--silent', `@pierre/diffs@${version}`], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'error' },
  })
  if (install.status !== 0)
    throw new Error(`Failed to install @pierre/diffs@${version}: ${install.stderr || install.stdout}`)
  return dir
}

function runChild(dir, backend) {
  const child = spawnSync(process.execPath, ['bench-child.mjs'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, BENCH_BACKEND: backend },
    timeout: 240_000,
  })
  if (child.status !== 0)
    return { backend, status: 'failed', error: (child.stderr || child.stdout || '').slice(-800), measurements: {} }
  const line = (child.stdout || '').split('\n').find(value => value.startsWith('BENCH_JSON:'))
  if (!line)
    return { backend, status: 'failed', error: 'missing BENCH_JSON output', measurements: {} }
  return JSON.parse(line.slice('BENCH_JSON:'.length))
}

function formatCell(entry) {
  if (entry == null)
    return '—'
  if (typeof entry === 'number')
    return String(entry)
  if (typeof entry.median === 'number')
    return String(entry.median)
  return '—'
}

function buildMarkdown(report) {
  const metrics = [
    ['importMs', 'module import'],
    ['coldFirstRenderMs', 'cold first render (40 lines)'],
    ['file40', 'file 40 lines'],
    ['file600', 'file 600 lines'],
    ['file2400', 'file 2400 lines'],
    ['diff1200', 'split diff 1200 lines'],
    ['file600themePair', 'file 600, dark+light theme pair'],
    ['parseDiff1200', 'parseDiffFromFile 1200 lines'],
  ]
  const runs = report.runs
  const header = ['metric', ...runs.map(run => `${run.version} ${run.backend}`)]
  const rows = metrics.map(([key, label]) => [
    label,
    ...runs.map((run) => {
      if (run.status === 'unsupported')
        return 'n/a'
      if (run.status !== 'ok')
        return 'error'
      return formatCell(run.measurements[key])
    }),
  ])
  // Deltas for the first two runs of the same backend across versions.
  const deltaRows = []
  for (let index = 0; index + 1 < runs.length; index += 1) {
    const base = runs[index]
    const head = runs[index + 1]
    if (base.backend !== head.backend || base.status !== 'ok' || head.status !== 'ok')
      continue
    for (const [key, label] of metrics) {
      const before = typeof base.measurements[key] === 'number' ? base.measurements[key] : base.measurements[key]?.median
      const after = typeof head.measurements[key] === 'number' ? head.measurements[key] : head.measurements[key]?.median
      if (before == null || after == null || !before)
        continue
      const change = ((after - before) / before) * 100
      deltaRows.push(`| ${label} (${base.backend}) | ${before} | ${after} | ${change > 0 ? '+' : ''}${change.toFixed(1)}% |`)
    }
  }
  const lines = []
  lines.push(`# @pierre/diffs version benchmark`, '')
  lines.push(`- node: ${report.env.node}`)
  lines.push(`- platform: ${report.env.platform} ${report.env.arch} ${report.env.release}`)
  lines.push(`- cpu: ${report.env.cpuModel} (${report.env.cores} cores)`)
  lines.push(`- memory: ${report.env.totalmemGb} GB`)
  lines.push(`- generated: ${report.generatedAt}`, '')
  const resolved = report.runs
    .filter(run => run.status === 'ok')
    .map(run => `${run.version} asked \`${run.backend}\` → \`${run.actualBackend ?? 'unknown'}\``)
  if (resolved.length)
    lines.push(`- highlighter registry: ${resolved.join('; ')}`, '')
  lines.push(`| ${header.join(' | ')} |`)
  lines.push(`| ${header.map(() => '---').join(' | ')} |`)
  for (const row of rows)
    lines.push(`| ${row.join(' | ')} |`)
  if (deltaRows.length) {
    lines.push('', '## Change', '', '| metric | before | after | change |', '| --- | --- | --- | --- |')
    lines.push(...deltaRows)
  }
  lines.push('', '_Milliseconds, lower is better. `n/a` means the backend does not exist in that version._')
  return `${lines.join('\n')}\n`
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    env: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      release: release(),
      cpuModel: cpus()[0]?.model?.trim() ?? 'unknown',
      cores: cpus().length,
      totalmemGb: +(totalmem() / 1024 ** 3).toFixed(1),
    },
    runs: [],
  }

  for (const version of versions) {
    const dir = installVersion(version)
    const installed = JSON.parse(readFileSync(path.join(dir, 'node_modules/@pierre/diffs/package.json'), 'utf8'))
    for (const backend of backends) {
      if (!supportsBackend(installed.version, backend)) {
        report.runs.push({ version: installed.version, backend, status: 'unsupported', error: 'backend-not-available', measurements: {} })
        console.log(`  ${`${installed.version}/${backend}`.padEnd(24)} unsupported in this version`)
        continue
      }
      const result = runChild(dir, backend)
      report.runs.push({ version: installed.version, backend, ...result })
      const label = `${installed.version}/${backend}`.padEnd(24)
      const summary = result.status === 'ok'
        ? `file600=${formatCell(result.measurements.file600)}ms diff1200=${formatCell(result.measurements.diff1200)}ms`
        : `${result.status}: ${result.error ?? ''}`
      console.log(`  ${label} ${summary}`)
    }
  }

  mkdirSync(outputDir, { recursive: true })
  writeFileSync(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  const markdown = buildMarkdown(report)
  writeFileSync(path.join(outputDir, 'latest.md'), markdown, 'utf8')
  console.log(`\nwrote benchmark/diffs-upgrade/latest.{json,md}`)

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, { flag: 'a' })
    }
    catch {}
  }
}

main()
