#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release, totalmem, type } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.resolve(repoRoot, process.env.MARKSTREAM_BENCHMARK_OUTPUT_DIR || 'benchmark')
const resultOutputDir = path.join(outputDir, 'results')
const isReleaseGate = process.env.MARKSTREAM_RELEASE_GATE === '1'

if (isReleaseGate && process.env.MARKSTREAM_BENCHMARK_SKIP_BUILD === '1') {
  throw new Error('MARKSTREAM_BENCHMARK_SKIP_BUILD=1 is not allowed in release gate.')
}

if (isReleaseGate && process.env.MARKSTREAM_BENCHMARK_SAMPLES) {
  throw new Error('MARKSTREAM_BENCHMARK_SAMPLES is not allowed in release gate.')
}

const diagnosticSamples = (process.env.MARKSTREAM_BENCHMARK_SAMPLES || 'baseline,thinking,diff,stress')
  .split(',')
  .map(sample => sample.trim())
  .filter(Boolean)

const scenarios = [
  ...diagnosticSamples.map(sample => ({
    id: `diagnostic-${sample}`,
    title: `Diagnostic Studio / ${sample}`,
    command: ['node', ['scripts/e2e-playground-performance.mjs']],
    env: { PLAYGROUND_SAMPLE: sample },
    notes: 'Runs /test?benchmark=1 in the stream-diffs enhanced code block mode, then scrolls the preview surface.',
  })),
  {
    id: 'main-playground-chat',
    title: 'Main Playground / reverse-flex chat',
    command: ['node', ['scripts/e2e-main-playground-performance.mjs']],
    env: {},
    notes: 'Runs /?benchmark=1 in the main AI chat playground, full-scrolls the reverse-flex viewport, and replays streaming.',
  },
  {
    id: 'web-vitals-performance',
    title: 'Web Vitals / restore and scroll',
    command: ['node', ['scripts/e2e-web-vitals-performance.mjs']],
    env: {},
    resultPathEnv: 'WEB_VITALS_JSON_PATH',
    notes: 'Runs lab LCP, phase CLS, Event Timing, trace, and DOM probes for million-character restore, scroll recovery, and stream-diffs enhanced code block interaction.',
  },
]
const requiredScenarioIds = scenarios.map(scenario => scenario.id)

function readPackageVersion(packageJsonPath) {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, packageJsonPath), 'utf8'))
  return packageJson.version
}

function formatBytes(bytes) {
  if (bytes == null)
    return '-'
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatMs(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(1)
    : '-'
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(Math.round(value))
    : '-'
}

function formatViewport(value) {
  if (typeof value === 'string')
    return value
  if (value && typeof value === 'object' && Number.isFinite(value.width) && Number.isFinite(value.height))
    return `${value.width} x ${value.height}`
  return '-'
}

async function resolveGitSha() {
  if (process.env.GITHUB_SHA)
    return process.env.GITHUB_SHA
  return (await spawnText('git', ['rev-parse', 'HEAD'])).trim()
}

function phaseFrameSampleCount(row) {
  return row.scrollFrameSampleCount ?? row.frameSampleCount ?? row.frameCount
}

function phaseFrameP95Ms(row) {
  return row.scrollFrameP95Ms ?? row.frameP95Ms
}

async function resolveChromeVersion() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!existsSync(candidate))
      continue
    try {
      return {
        executablePath: candidate,
        version: (await spawnText(candidate, ['--version'])).trim() || 'unknown',
      }
    }
    catch {
      return {
        executablePath: candidate,
        version: 'unknown',
      }
    }
  }

  return {
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH || 'chrome channel',
    version: 'unknown',
  }
}

function spawnText(command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const chunks = []
  const errors = []
  child.stdout.on('data', chunk => chunks.push(String(chunk)))
  child.stderr.on('data', chunk => errors.push(String(chunk)))
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0)
        resolve(chunks.join(''))
      else
        reject(new Error(errors.join('') || `${command} exited with ${code}`))
    })
  })
}

async function runCommand(command, args, env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0)
        resolve({ stdout, stderr })
      else
        reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}\n${stderr}\n${stdout}`))
    })
  })
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function tryReadJsonFile(filePath) {
  if (!existsSync(filePath))
    return { result: undefined, error: undefined }

  try {
    return { result: readJsonFile(filePath), error: undefined }
  }
  catch (error) {
    return {
      result: undefined,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function resultPathForScenario(scenario) {
  return path.join(resultOutputDir, `${scenario.id}.json`)
}

function assertReportFresh(report) {
  const rootPackageVersion = readPackageVersion('package.json')
  if (report.packageVersion !== rootPackageVersion)
    throw new Error(`Benchmark report packageVersion ${report.packageVersion} does not match package.json version ${rootPackageVersion}.`)
  if (process.env.GITHUB_SHA && report.gitSha !== process.env.GITHUB_SHA)
    throw new Error(`Benchmark report gitSha ${report.gitSha} does not match GITHUB_SHA ${process.env.GITHUB_SHA}.`)

  const scenarioIds = report.scenarios.map(scenario => scenario.id)
  for (const id of requiredScenarioIds) {
    if (!scenarioIds.includes(id))
      throw new Error(`Benchmark report is missing required scenario ${id}.`)
  }
}

function heavyBlockSummary(row, scope = 'all') {
  const parts = []
  const visible = scope === 'visible'
  const mermaidCount = visible ? row.visibleMermaidCount : row.mermaidCount
  const infographicCount = visible ? row.visibleInfographicCount : row.infographicCount
  const d2Count = visible ? row.visibleD2Count : row.d2Count
  if (!((mermaidCount ?? 0) + (infographicCount ?? 0) + (d2Count ?? 0)))
    return 'N/A'
  if (mermaidCount > 0)
    parts.push(`Mermaid ${(visible ? row.visibleRenderedMermaidCount : row.renderedMermaidCount) ?? '-'}/${mermaidCount}`)
  if (infographicCount > 0)
    parts.push(`Infographic ${(visible ? row.visibleRenderedInfographicCount : row.renderedInfographicCount) ?? '-'}/${infographicCount}`)
  if (d2Count > 0)
    parts.push(`D2 ${(visible ? row.visibleRenderedD2Count : row.renderedD2Count) ?? '-'}/${d2Count}`)
  return parts.length ? parts.join('<br>') : '-'
}

function fallbackSummary(row) {
  if (typeof row.visibleFallbackCount === 'number' && row.visibleCodeBlockCount === 0)
    return `N/A visible / ${row.fallbackCount ?? 0} total`
  if (typeof row.visibleFallbackCount === 'number')
    return `${row.visibleFallbackCount} visible / ${row.fallbackCount ?? 0} total`
  if (typeof row.fallbackCount === 'number')
    return String(row.fallbackCount)
  return '-'
}

function parsePerformanceSummary(row) {
  const metrics = row.parsePerformance
  if (!metrics)
    return '-'

  const stream = metrics.stream ?? {}
  return [
    `commits ${formatNumber(metrics.parseCommitCount)} / coalesced ${formatNumber(metrics.parseCoalescedCount)}`,
    `stream full ${formatNumber(stream.fullParses)} / append ${formatNumber(stream.appendHits)} / tail ${formatNumber(stream.tailHits)} / cache ${formatNumber(stream.cacheHits)}`,
    `timing total ${formatMs(metrics.parseMarkdownToStructureTotalMs)} / clone ${formatMs(metrics.tokenCloneMs)} / process ${formatMs(metrics.processTokensMs)}`,
  ].join('<br>')
}

function layoutReadsSummary(row) {
  const layoutReads = row.layoutReads
  if (!layoutReads)
    return '-'

  const byLabel = layoutReads.byLabel && typeof layoutReads.byLabel === 'object'
    ? Object.entries(layoutReads.byLabel)
        .filter(([, count]) => Number(count || 0) > 0)
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0) || a[0].localeCompare(b[0]))
        .slice(0, 3)
    : []
  const topLabels = byLabel.length
    ? `<br>${byLabel.map(([label, count]) => `${label} ${formatNumber(count)}`).join('<br>')}`
    : ''

  const maxPerFrame = Math.max(Number(layoutReads.maxPerFrame || 0), Number(layoutReads.currentFrameTotal || 0))
  return `total ${formatNumber(layoutReads.total)} / max-frame ${formatNumber(maxPerFrame)}${topLabels}`
}

function scenarioRows(entry) {
  const rows = []
  const result = entry.result

  if (!result)
    return rows

  if (entry.id.startsWith('diagnostic-')) {
    for (const mode of ['stream-diffs']) {
      const row = result[mode]
      if (!row)
        continue
      rows.push({
        scenario: entry.title,
        phase: `${mode} initial`,
        row,
        heavyBlockScope: 'visible',
        memoryAfterUnmountBytes: row.memoryAfterUnmountBytes,
      })
      if (row.fullScroll) {
        rows.push({
          scenario: entry.title,
          phase: `${mode} full scroll`,
          row: row.fullScroll,
          heavyBlockScope: 'all',
          memoryAfterUnmountBytes: row.memoryAfterUnmountBytes,
        })
      }
    }
    return rows
  }

  if (entry.id === 'main-playground-chat') {
    rows.push({ scenario: entry.title, phase: 'initial', row: result.initial, heavyBlockScope: 'visible', memoryAfterUnmountBytes: result.memoryAfterUnmountBytes })
    rows.push({ scenario: entry.title, phase: 'full scroll', row: result.fullScroll, heavyBlockScope: 'all', memoryAfterUnmountBytes: result.memoryAfterUnmountBytes })
    rows.push({ scenario: entry.title, phase: 'stream replay', row: result.replay, heavyBlockScope: 'all', memoryAfterUnmountBytes: result.memoryAfterUnmountBytes })
  }

  if (entry.id === 'web-vitals-performance') {
    if (result.millionRestore?.restore)
      rows.push({ scenario: entry.title, phase: 'million restore navigation', row: result.millionRestore.restore, heavyBlockScope: 'all' })
    if (result.millionRestore?.scroll)
      rows.push({ scenario: entry.title, phase: 'million scripted scroll', row: result.millionRestore.scroll, heavyBlockScope: 'all' })
    for (const interaction of result.millionRestore?.interactions ?? [])
      rows.push({ scenario: entry.title, phase: `million interaction ${interaction.label}`, row: interaction, viewport: result.millionRestore?.viewport, heavyBlockScope: 'all' })
    if (result.codeblockStreamDiffs?.initial)
      rows.push({ scenario: entry.title, phase: 'codeblock initial', row: result.codeblockStreamDiffs.initial, heavyBlockScope: 'visible' })
    if (result.codeblockStreamDiffs?.scroll)
      rows.push({ scenario: entry.title, phase: 'codeblock scripted scroll', row: result.codeblockStreamDiffs.scroll, heavyBlockScope: 'visible' })
    for (const interaction of result.codeblockStreamDiffs?.interactions ?? [])
      rows.push({ scenario: entry.title, phase: `codeblock interaction ${interaction.label}`, row: interaction, viewport: result.codeblockStreamDiffs?.viewport, heavyBlockScope: 'visible' })
  }

  return rows
}

function renderMarkdownReport(report) {
  const lines = []
  lines.push('# markstream-vue 1.0 Benchmark Report')
  lines.push('')
  lines.push(`Generated at: ${report.generatedAt}`)
  lines.push('')
  lines.push('## Environment')
  lines.push('')
  lines.push('| Field | Value |')
  lines.push('| --- | --- |')
  lines.push(`| Package version | ${report.packageVersion} |`)
  lines.push(`| Git SHA | ${report.gitSha} |`)
  lines.push(`| markstream-vue | ${report.versions.markstreamVue} |`)
  lines.push(`| markstream-core | ${report.versions.markstreamCore} |`)
  lines.push(`| stream-markdown-parser | ${report.versions.streamMarkdownParser} |`)
  lines.push(`| Node | ${report.environment.node} |`)
  lines.push(`| OS | ${report.environment.os} |`)
  lines.push(`| CPU | ${report.environment.cpu} |`)
  lines.push(`| Memory | ${formatBytes(report.environment.totalMemoryBytes)} |`)
  lines.push(`| Browser | ${report.environment.browser.version} |`)
  lines.push(`| Browser executable | \`${report.environment.browser.executablePath}\` |`)
  lines.push(`| Viewport | ${report.environment.viewport} |`)
  lines.push(`| Server mode | ${report.environment.serverMode}, CI=1 |`)
  lines.push('')
  lines.push('## Results')
  lines.push('')
  lines.push('| Scenario | Phase | Viewport | LCP ms | CLS | INP candidate ms | Max input delay ms | Max event processing ms | Settle ms | Frame samples | Frame p95 ms | Heavy settle frame samples | Heavy settle frame p95 ms | Max long task ms | Page DOM nodes | Renderer DOM nodes | Parse stream | Layout reads | Fallbacks | Heavy blocks readiness | Scroll drift px | Heap after renderer unmount + GC |')
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: |')

  for (const entry of report.scenarios) {
    for (const item of scenarioRows(entry)) {
      const row = item.row ?? {}
      const cls = row.cls ?? row.phaseCls
      const settleMs = row.settleTimeMs ?? row.phaseElapsedMs
      const viewport = row.viewport ?? item.viewport ?? report.environment.defaultViewport
      lines.push(`| ${item.scenario} | ${item.phase} | ${formatViewport(viewport)} | ${formatMs(row.lcpMs)} | ${typeof cls === 'number' ? cls.toFixed(4) : '-'} | ${formatMs(row.eventTimingInpCandidateMs)} | ${formatMs(row.eventTimingMaxInputDelayMs)} | ${formatMs(row.eventTimingMaxProcessingMs)} | ${formatMs(settleMs)} | ${formatNumber(phaseFrameSampleCount(row))} | ${formatMs(phaseFrameP95Ms(row))} | ${formatNumber(row.heavySettleFrameSampleCount)} | ${formatMs(row.heavySettleFrameP95Ms)} | ${formatMs(row.longTaskMaxMs)} | ${formatNumber(row.pageDomNodeCount)} | ${formatNumber(row.rendererDomNodeCount)} | ${parsePerformanceSummary(row)} | ${layoutReadsSummary(row)} | ${fallbackSummary(row)} | ${heavyBlockSummary(row, item.heavyBlockScope)} | ${formatMs(row.scrollDriftPx)} | ${formatBytes(item.memoryAfterUnmountBytes)} |`)
    }
  }

  const warningScenarios = report.scenarios.filter(entry => Array.isArray(entry.result?.warnings) && entry.result.warnings.length > 0)
  if (warningScenarios.length) {
    lines.push('')
    lines.push('## Scenario Warnings')
    lines.push('')
    for (const entry of warningScenarios) {
      for (const warning of entry.result.warnings)
        lines.push(`- **${entry.title}**: ${warning}`)
    }
  }

  const failedScenarios = report.scenarios.filter(entry => entry.status === 'failed')
  if (failedScenarios.length) {
    lines.push('')
    lines.push('## Failed Scenarios')
    lines.push('')
    for (const entry of failedScenarios) {
      lines.push(`### ${entry.title}`)
      lines.push('')
      lines.push('```txt')
      lines.push(String(entry.error || 'Unknown benchmark failure').slice(0, 8000))
      lines.push('```')
      if (entry.resultReadError) {
        lines.push('')
        lines.push(`Result JSON read error: ${entry.resultReadError}`)
      }
      lines.push('')
    }
  }

  lines.push('')
  lines.push('## Scenario Notes')
  lines.push('')
  for (const entry of report.scenarios)
    lines.push(`- **${entry.title}**: ${entry.notes}`)
  lines.push('')
  lines.push('This report records measured release evidence from the shipped playgrounds. The environment viewport is mixed because Web Vitals scenarios use row-specific viewports; use the Results table viewport column when citing LCP, CLS, visible heavy-block readiness, or DOM-node counts. Initial rows report readiness for heavy blocks visible in the phase viewport, and show N/A when that viewport contains no heavy blocks. Full-scroll rows report all heavy blocks after the scroll pass. Page DOM nodes are recorded for diagnostics; renderer DOM nodes are scoped to the benchmark surface and are the value used by the release gate. Parse stream metrics record renderer parse commits, coalesced smooth-stream parse updates, and markdown-it stream parser full/append/tail/cache counters. Layout reads are collected only when renderer debug performance mode is enabled and show total reads plus the largest observed frame bucket for the benchmark phase. Frame p95 is the phase-local p95 `requestAnimationFrame` delta; for full-scroll rows it covers only the active scroll loop. Heavy-settle frame p95 covers post-scroll heavy block readiness separately. Web Vitals frame p95/max and sample density are hard release-gate metrics. Raw scrollTop drift is recorded for diagnostics but is not a 1.0 release gate. Heap after renderer unmount is best-effort Chrome-only `performance.memory` after unmount plus GC. Keep benchmark claims tied to this environment disclosure and rerun before publishing 1.0.')
  return `${lines.join('\n')}\n`
}

function writeReportFiles(report, partial = false) {
  const slug = `${report.versions.markstreamVue}.chrome-${platform()}-${arch()}`
  const fileSlug = partial ? `${slug}.partial` : slug
  const jsonPath = path.join(outputDir, `${fileSlug}.json`)
  const markdownPath = path.join(outputDir, `${fileSlug}.md`)
  const latestPath = path.join(outputDir, partial ? 'latest-partial-summary.md' : 'latest-summary.md')
  const markdown = renderMarkdownReport(report)

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(markdownPath, markdown)
  writeFileSync(latestPath, markdown)

  return { jsonPath, markdownPath, latestPath }
}

async function run() {
  mkdirSync(outputDir, { recursive: true })
  mkdirSync(resultOutputDir, { recursive: true })

  const browser = await resolveChromeVersion()
  const serverMode = 'Vite production preview after playground build'
  const rootPackageVersion = readPackageVersion('package.json')
  const report = {
    packageVersion: rootPackageVersion,
    gitSha: await resolveGitSha(),
    generatedAt: new Date().toISOString(),
    versions: {
      markstreamVue: rootPackageVersion,
      markstreamCore: readPackageVersion('packages/markstream-core/package.json'),
      streamMarkdownParser: readPackageVersion('packages/markdown-parser/package.json'),
    },
    environment: {
      node: process.version,
      os: `${type()} ${release()} (${platform()} ${arch()})`,
      cpu: cpus()[0]?.model ?? 'unknown',
      totalMemoryBytes: totalmem(),
      browser,
      defaultViewport: '1600 x 1200',
      viewport: 'mixed; default 1600 x 1200, row-specific overrides in Results',
      serverMode,
    },
    scenarios: [],
  }
  writeReportFiles(report, true)

  if (process.env.MARKSTREAM_BENCHMARK_SKIP_BUILD !== '1') {
    console.error('[benchmark:1.0] Build playground')
    await runCommand('pnpm', ['-C', 'playground', 'build'], {})
  }

  const failedScenarios = []

  for (const scenario of scenarios) {
    const [command, args] = scenario.command
    const resultPath = resultPathForScenario(scenario)
    console.error(`[benchmark:1.0] ${scenario.title}`)
    try {
      rmSync(resultPath, { force: true })
      const resultPathEnv = scenario.resultPathEnv || 'BENCHMARK_JSON_PATH'
      await runCommand(command, args, {
        ...scenario.env,
        [resultPathEnv]: resultPath,
        PLAYGROUND_PERFORMANCE_SERVER: 'preview',
      })
      const resultRead = tryReadJsonFile(resultPath)
      if (resultRead.error)
        throw new Error(`Failed to read benchmark result ${path.relative(repoRoot, resultPath)}: ${resultRead.error}`)
      if (!resultRead.result)
        throw new Error(`Benchmark did not write result file ${path.relative(repoRoot, resultPath)}.`)
      report.scenarios.push({
        id: scenario.id,
        title: scenario.title,
        notes: scenario.notes,
        env: scenario.env,
        status: 'passed',
        result: resultRead.result,
      })
      writeReportFiles(report, true)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const resultRead = tryReadJsonFile(resultPath)
      report.scenarios.push({
        id: scenario.id,
        title: scenario.title,
        notes: scenario.notes,
        env: scenario.env,
        status: 'failed',
        result: resultRead.result,
        error: message,
        ...(resultRead.error ? { resultReadError: resultRead.error } : {}),
      })
      failedScenarios.push(scenario.title)
      writeReportFiles(report, true)
    }
  }

  assertReportFresh(report)
  const { jsonPath, markdownPath, latestPath } = writeReportFiles(report)

  console.log(`Wrote ${path.relative(repoRoot, jsonPath)}`)
  console.log(`Wrote ${path.relative(repoRoot, markdownPath)}`)
  console.log(`Wrote ${path.relative(repoRoot, latestPath)}`)

  if (failedScenarios.length)
    throw new Error(`Benchmark failed in ${failedScenarios.length} scenario(s): ${failedScenarios.join(', ')}`)
}

run().catch((error) => {
  console.error('[benchmark:1.0] failed')
  console.error(error)
  process.exitCode = 1
})
