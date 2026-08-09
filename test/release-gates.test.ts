import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('release dependency gates', () => {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
  const readPackageJson = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'))

  it('runs the workspace dependency publish gate before packed smoke on prepublish', () => {
    const scripts = packageJson.scripts
    const prepublishOnly = scripts.prepublishOnly

    expect(scripts['check:workspace-deps-local']).toBe('node ./scripts/check-workspace-deps-local.mjs')
    expect(scripts['check:workspace-deps-published']).toBe('node ./scripts/check-workspace-deps-published.mjs')
    expect(prepublishOnly).toContain('pnpm run build:parser')
    expect(prepublishOnly).toContain('pnpm run check:workspace-deps-published')
    expect(prepublishOnly).toContain('pnpm run test:smoke:pack')
    expect(prepublishOnly).toContain('pnpm run test:smoke:pack:optional')
    expect(prepublishOnly.indexOf('pnpm run build:parser')).toBeLessThan(prepublishOnly.indexOf('pnpm run check:workspace-deps-published'))
    expect(prepublishOnly.indexOf('pnpm run check:workspace-deps-published')).toBeLessThan(prepublishOnly.indexOf('pnpm run test:smoke:pack'))
    expect(prepublishOnly.indexOf('pnpm run test:smoke:pack')).toBeLessThan(prepublishOnly.indexOf('pnpm run test:smoke:pack:optional'))
  })

  it('uses the workspace dependency publish gate in the release script', () => {
    const scripts = packageJson.scripts
    const release = scripts.release

    expect(release).toContain('pnpm run check:workspace-deps-published')
    expect(release).not.toContain('pnpm run check:core-published')
    expect(scripts.changelog).toContain('--tag-prefix markstream-vue@')
    expect(scripts.changelog).toContain('-r 1')
    expect(scripts.changelog).not.toContain('-r 0')
    expect(release).toContain('--tag-prefix markstream-vue@')
    expect(release).toContain('-r 1')
    expect(release).not.toContain('-r 0')
  })

  it('uses the 1.0 release gate before publishing stable packages', () => {
    const scripts = packageJson.scripts
    const releaseGate = scripts['release:gate:1.0']
    const release1 = scripts['release:1.0']
    const releaseDryRun = scripts['release:dry-run:1.0']

    expect(releaseGate).toContain('pnpm run release:verify')
    expect(releaseGate).toContain('pnpm run docs:build:ci')
    expect(releaseGate).toContain('pnpm run size:check')
    expect(releaseGate).toContain('pnpm run benchmark:1.0')
    expect(release1).toContain('pnpm run release:gate:1.0')
    expect(scripts['publish:parser:current']).toContain('scripts/publish-current-package.mjs')
    expect(scripts['publish:core:current']).toContain('scripts/publish-current-package.mjs')
    expect(scripts['publish:vue3:current']).toContain('scripts/publish-current-package.mjs')
    expect(scripts['publish:vue3:current']).toContain('pnpm run check:workspace-deps-published')
    expect(scripts['publish:parser:dry-run']).toContain('--dry-run')
    expect(scripts['publish:core:dry-run']).toContain('--dry-run')
    expect(scripts['publish:vue3:dry-run']).toContain('pnpm run check:workspace-deps-local')
    expect(scripts['publish:vue3:dry-run']).not.toContain('pnpm run check:workspace-deps-published')
    expect(scripts['publish:vue3:dry-run']).toContain('--dry-run')
    expect(release1).not.toContain('pnpm run release:parser')
    expect(release1).not.toContain('pnpm run release:core')
    expect(release1).not.toMatch(/&& pnpm run release(?:\s|$)/)
    expect(release1.indexOf('pnpm run release:gate:1.0')).toBeLessThan(release1.indexOf('pnpm run publish:parser:current'))
    expect(release1.indexOf('pnpm run publish:parser:current')).toBeLessThan(release1.indexOf('pnpm run publish:core:current'))
    expect(release1.indexOf('pnpm run publish:core:current')).toBeLessThan(release1.indexOf('pnpm run publish:vue3:current'))
    expect(releaseDryRun.indexOf('pnpm run release:gate:1.0')).toBeLessThan(releaseDryRun.indexOf('pnpm run publish:parser:dry-run'))
    expect(releaseDryRun.indexOf('pnpm run publish:parser:dry-run')).toBeLessThan(releaseDryRun.indexOf('pnpm run publish:core:dry-run'))
    expect(releaseDryRun.indexOf('pnpm run publish:core:dry-run')).toBeLessThan(releaseDryRun.indexOf('pnpm run publish:vue3:dry-run'))
  })

  it('binds the 1.0 benchmark report to the release version and commit', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/benchmark-1-0.mjs'), 'utf8')

    expect(script).toContain('packageVersion: rootPackageVersion')
    expect(script).toContain('gitSha: await resolveGitSha()')
    expect(script).toContain('report.packageVersion !== rootPackageVersion')
    expect(script).toContain('process.env.GITHUB_SHA && report.gitSha !== process.env.GITHUB_SHA')
    expect(script).toContain('const requiredScenarioIds = scenarios.map(scenario => scenario.id)')
  })

  it('uses explicit JSON files for child benchmark results', () => {
    const benchmarkScript = readFileSync(resolve(process.cwd(), 'scripts/benchmark-1-0.mjs'), 'utf8')
    const diagnosticScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-playground-performance.mjs'), 'utf8')
    const mainScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-main-playground-performance.mjs'), 'utf8')
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(benchmarkScript).toContain('const resultPathEnv = scenario.resultPathEnv || \'BENCHMARK_JSON_PATH\'')
    expect(benchmarkScript).toContain('[resultPathEnv]: resultPath')
    expect(benchmarkScript).toContain('resultPathEnv: \'WEB_VITALS_JSON_PATH\'')
    expect(benchmarkScript).toContain('function tryReadJsonFile(filePath)')
    expect(benchmarkScript).toContain('result: resultRead.result')
    expect(benchmarkScript).toContain('resultReadError')
    expect(benchmarkScript).not.toContain('parseJsonOutput')
    expect(diagnosticScript).toContain('process.env.BENCHMARK_JSON_PATH')
    expect(mainScript).toContain('process.env.BENCHMARK_JSON_PATH')
    expect(webVitalsScript).toContain('process.env.WEB_VITALS_JSON_PATH')
  })

  it('hard-fails Web Vitals warnings during the release gate', () => {
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(webVitalsScript).toContain('process.env.MARKSTREAM_RELEASE_GATE === \'1\'')
    expect(webVitalsScript).toContain('function assertScenario(result)')
    expect(webVitalsScript).toContain('Web Vitals release gate failed')
    expect(webVitalsScript).toContain('assertScenario(result)')
  })

  it('runs the 1.0 benchmark workflow with the same Web Vitals release gate', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/benchmark-1-0.yml'), 'utf8')
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(workflow).toContain('MARKSTREAM_RELEASE_GATE: \'1\'')
    expect(workflow).toContain('run: pnpm benchmark:1.0')
    expect(workflow.match(/scripts\/web-vitals-budget-checks\.mjs/g)).toHaveLength(2)
    expect(webVitalsScript).toContain('\'million-scripted-scroll\': {')
    expect(webVitalsScript).toContain('longTaskTotalMs: 9000')
    expect(webVitalsScript).toContain('frameP95Ms: 800')
    expect(webVitalsScript).toContain('minFrameSamplesPerSecond: 4')
    expect(webVitalsScript).toContain('frame sample density below')
  })

  it('reports row-specific viewports for mixed 1.0 benchmark scenarios', () => {
    const benchmarkScript = readFileSync(resolve(process.cwd(), 'scripts/benchmark-1-0.mjs'), 'utf8')
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(benchmarkScript).toContain('function formatViewport(value)')
    expect(benchmarkScript).toContain('| Scenario | Phase | Viewport |')
    expect(benchmarkScript).toContain('row.viewport ?? item.viewport ?? report.environment.defaultViewport')
    expect(benchmarkScript).toContain('mixed; default 1600 x 1200, row-specific overrides in Results')
    expect(webVitalsScript).toContain('viewport: copyViewport(viewport)')
    expect(webVitalsScript).toContain('restore.viewport = copyViewport(viewport)')
    expect(webVitalsScript).toContain('scroll.viewport = copyViewport(viewport)')
  })

  it('keeps terminal Monaco pre fallbacks in the Web Vitals code block gate', () => {
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(webVitalsScript).toContain('const codeBlockScenarioExpectedCodeBlockCount = 12')
    expect(webVitalsScript).toContain('terminalPreFallbackElements')
    expect(webVitalsScript).toContain('[data-markstream-pre="1"]')
    expect(webVitalsScript).toContain('!element.closest(\'.code-block-container\')')
    expect(webVitalsScript).toContain('expected $' + '{codeBlockScenarioExpectedCodeBlockCount} code blocks')
  })

  it('requires offscreen Monaco blocks to stay deferred before scripted scroll', () => {
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(webVitalsScript).toContain('vmr-test-code-block-viewport-root-margin')
    expect(webVitalsScript).toContain('codeBlockViewportRootMargin: \'0px\'')
    expect(webVitalsScript).toContain('offscreenEnhancedCodeBlockCount !== 0')
    expect(webVitalsScript).toContain('expected all offscreen code blocks to remain deferred')
  })

  it('scopes Web Vitals INP candidate to real interaction groups', () => {
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(webVitalsScript).toContain('const inpInteractionValues = [...interactions.entries()]')
    expect(webVitalsScript).toContain('.filter(([key]) => key.startsWith(\'interaction:\'))')
    expect(webVitalsScript).toContain('interactionGroupCount: inpInteractionValues.length')
    expect(webVitalsScript).toContain('performanceInteractionCountDelta')
    expect(webVitalsScript).toContain('belowEventTimingThreshold')
    expect(webVitalsScript).toContain('eventTimingInpCandidateMs: inpInteractionValues.length')
    expect(webVitalsScript).toContain('eventTimingMaxInputDelayMs: inpInteractionValues.length')
    expect(webVitalsScript).toContain('eventTimingMaxProcessingMs: inpInteractionValues.length')
    expect(webVitalsScript).toContain('topEvents: sortedEvents.slice(0, 8)')
  })

  it('gates and reports Web Vitals interaction metrics', () => {
    const benchmarkScript = readFileSync(resolve(process.cwd(), 'scripts/benchmark-1-0.mjs'), 'utf8')
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')
    const webVitalsBudgetScript = readFileSync(resolve(process.cwd(), 'scripts/web-vitals-budget-checks.mjs'), 'utf8')

    expect(webVitalsScript).toContain('const webVitalsInteractionBudgets = {')
    expect(webVitalsScript).toContain('collectWebVitalsInteractionWarnings')
    expect(webVitalsScript).toContain('\'codeblock-copy\': {')
    expect(webVitalsScript).toContain('eventTimingInpCandidateMs: 1000')
    expect(webVitalsScript).toContain('for (const interaction of scenario.interactions ?? [])')
    expect(webVitalsBudgetScript).toContain('INP candidate exceeded')
    expect(webVitalsBudgetScript).toContain('max input delay exceeded')
    expect(webVitalsBudgetScript).toContain('max event processing exceeded')
    expect(webVitalsBudgetScript).toContain('Event Timing measurement unavailable')
    expect(webVitalsBudgetScript).toContain('belowEventTimingThreshold')
    expect(benchmarkScript).toContain('million interaction $' + '{interaction.label}')
    expect(benchmarkScript).toContain('codeblock interaction $' + '{interaction.label}')
    expect(benchmarkScript).toContain('INP candidate ms')
    expect(benchmarkScript).toContain('row.eventTimingMaxProcessingMs')
  })

  it('asserts million restore content identity and deep scroll correctness', () => {
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(webVitalsScript).toContain('const millionRestoreStartMarker')
    expect(webVitalsScript).toContain('const millionRestoreDeepMarker')
    expect(webVitalsScript).toContain('const millionRestoreEndMarker')
    expect(webVitalsScript).toContain('waitForMarkerVisible(page, millionRestoreStartMarker)')
    expect(webVitalsScript).toContain('assertMillionRestoreReady(restoreSnapshot, restoreSnapshot.label)')
    expect(webVitalsScript).toContain('waitForMarkerVisible(page, millionRestoreDeepMarker)')
    expect(webVitalsScript).toContain('waitForMarkerVisible(page, millionRestoreEndMarker)')
    expect(webVitalsScript).toContain('assertMillionRestoreScrolled(scrollSnapshot, scrollSnapshot.label)')
    expect(webVitalsScript).toContain('previewScrollRatio >= 0.9')
  })

  it('keeps code block scroll measurement before stateful copy and collapse interactions', () => {
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')
    const scrollCapture = webVitalsScript.indexOf('const scrollSnapshot = await captureVitalsSnapshot(page, \'codeblock-scripted-scroll-into-monaco\')')
    const restoreTop = webVitalsScript.indexOf('await scrollPreviewByRatio(page, 0)', scrollCapture)
    const copyInteraction = webVitalsScript.indexOf('interactions.push(await runInteraction(page, \'codeblock-copy\'')
    const collapseInteraction = webVitalsScript.indexOf('interactions.push(await runInteraction(page, \'codeblock-collapse\'')

    expect(scrollCapture).toBeGreaterThan(-1)
    expect(restoreTop).toBeGreaterThan(scrollCapture)
    expect(copyInteraction).toBeGreaterThan(restoreTop)
    expect(collapseInteraction).toBeGreaterThan(copyInteraction)
  })

  it('keeps the Web Vitals frame sampler running across long phases', () => {
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(webVitalsScript).toContain('if (state.frames.length > 3600)')
    expect(webVitalsScript).toContain('state.frames.shift()')
    expect(webVitalsScript).toContain('requestAnimationFrame(sampleFrame)')
    expect(webVitalsScript).not.toContain('if (state.frames.length < 3600)')
  })

  it('assigns Web Vitals observer entries by start time at snapshot', () => {
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(webVitalsScript).toContain('const phaseStartedAt = Number(state.phaseStartedAt ?? state.startedAt ?? 0)')
    expect(webVitalsScript).toContain('const inCurrentPhase = entry => Number(entry.startTime || 0) >= phaseStartedAt')
    expect(webVitalsScript).toContain('const longTasks = (Array.isArray(state.longTasks) ? state.longTasks : []).filter(inCurrentPhase)')
    expect(webVitalsScript).toContain('const events = (Array.isArray(state.events) ? state.events : []).filter(inCurrentPhase)')
    expect(webVitalsScript).toContain('const layoutShifts = (Array.isArray(state.layoutShifts) ? state.layoutShifts : []).filter(inCurrentPhase)')
    expect(webVitalsScript).toContain('const computeCls = (shifts) => {')
    expect(webVitalsScript).toContain('startTime - lastShiftTime > 1000')
    expect(webVitalsScript).toContain('startTime - windowStart > 5000')
    expect(webVitalsScript).toContain('layoutShiftTotal')
    expect(webVitalsScript).not.toContain('state.longTasks = []')
    expect(webVitalsScript).not.toContain('phase: state.phase')
  })

  it('checkpoints Web Vitals results after each completed subscenario', () => {
    const webVitalsScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-web-vitals-performance.mjs'), 'utf8')

    expect(webVitalsScript).toContain('function checkpointWebVitalsResult(result)')
    expect(webVitalsScript).toContain('result.warnings = collectResultWarnings(result)')
    expect(webVitalsScript).toContain('result.millionRestore = await runMillionRestoreScenario(browser, port)')
    expect(webVitalsScript).toContain('result.codeblockMonaco = await runCodeBlockScenario(browser, port)')
    const millionRestoreAssignment = webVitalsScript.indexOf('result.millionRestore = await runMillionRestoreScenario(browser, port)')
    const firstCheckpointCall = webVitalsScript.indexOf('checkpointWebVitalsResult(result)', millionRestoreAssignment)

    expect(millionRestoreAssignment).toBeGreaterThan(-1)
    expect(firstCheckpointCall).toBeGreaterThan(millionRestoreAssignment)
    expect(webVitalsScript.match(/checkpointWebVitalsResult\(result\)/g)?.length).toBe(3)
  })

  it('captures stream parser metrics in the 1.0 benchmark', () => {
    const benchmarkScript = readFileSync(resolve(process.cwd(), 'scripts/benchmark-1-0.mjs'), 'utf8')
    const diagnosticScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-playground-performance.mjs'), 'utf8')
    const mainScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-main-playground-performance.mjs'), 'utf8')
    const mainPlayground = readFileSync(resolve(process.cwd(), 'playground/src/pages/index.vue'), 'utf8')
    const diagnosticPlayground = readFileSync(resolve(process.cwd(), 'playground/src/pages/test.vue'), 'utf8')

    expect(mainPlayground).toContain(':debug-performance="isBenchmarkMode"')
    expect(diagnosticPlayground).toContain(':debug-performance="isBenchmarkMode"')
    expect(diagnosticScript).toContain('parsePerformance')
    expect(mainScript).toContain('parsePerformance')
    expect(diagnosticScript).toContain('diffParsePerformance')
    expect(mainScript).toContain('replayParsePerformanceBaseline')
    expect(mainScript).toContain('Replay stream parser should record append/tail/cache hits')
    expect(mainScript).toContain('Replay token clone cost too high')
    expect(benchmarkScript).toContain('parsePerformanceSummary')
    expect(benchmarkScript).toContain('tokenCloneMs')
    expect(benchmarkScript).toContain('processTokensMs')
    expect(diagnosticScript).toContain('__markstreamLayoutReadPerformance')
    expect(mainScript).toContain('__markstreamLayoutReadPerformance')
    expect(diagnosticScript).toContain('MARKSTREAM_BENCHMARK_MAX_LAYOUT_READS_PER_FRAME')
    expect(mainScript).toContain('MARKSTREAM_BENCHMARK_MAX_LAYOUT_READS_PER_FRAME')
    expect(benchmarkScript).toContain('layoutReadsSummary')
  })

  it('does not create release tags for package versions already published on npm', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/publish-current-package.mjs'), 'utf8')

    expect(script).toContain('assertPublishedTagAtHead(packageJson)')
    expect(script).toContain('Refusing to create a tag for an already-published version.')
    expect(script).toContain('Refusing to retag an already-published version.')
  })

  it('skips publish lifecycle scripts for dry-run package publishes', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/publish-current-package.mjs'), 'utf8')

    expect(script).toContain('const dryRunPublishArgs = args.dryRun ? [\'--dry-run\', \'--ignore-scripts\'] : []')
    expect(script).toContain('const pnpmDryRunPublishArgs = args.dryRun ? [...dryRunPublishArgs, \'--no-git-checks\'] : []')
    expect(script).toContain('? resolveDistTag(packageJson.version)')
    expect(script).toContain(': resolvePublishedDistTag(packageJson.name, packageJson.version)')
    expect(script).toContain('[\'publish\', \'--access\', \'public\', ...distTagArgs, ...pnpmDryRunPublishArgs]')
    expect(script).toContain('[\'publish\', \'--access\', \'public\', ...distTagArgs, ...dryRunPublishArgs]')
  })

  it('checks both runtime workspace packages for published versions', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/check-workspace-deps-published.mjs'), 'utf8')

    expect(script).toMatch(/name: 'markstream-core'/)
    expect(script).toMatch(/packageJson: 'packages\/markstream-core\/package\.json'/)
    expect(script).toMatch(/name: 'stream-markdown-parser'/)
    expect(script).toMatch(/packageJson: 'packages\/markdown-parser\/package\.json'/)
    expect(script).toContain('token === \'--package-json\'')
    expect(script).toContain('const dependencyVersion = packageJson.dependencies?.[dep.name]')
    expect(script).toContain('continue')
  })

  it('uses workspace dependency publish gates for framework package releases', () => {
    for (const path of [
      'packages/markstream-angular/package.json',
      'packages/markstream-react/package.json',
      'packages/markstream-svelte/package.json',
      'packages/markstream-vue2/package.json',
    ]) {
      const frameworkPackageJson = readPackageJson(path)
      const scripts = frameworkPackageJson.scripts

      expect(frameworkPackageJson.dependencies['stream-markdown-parser']).toBe('workspace:*')
      expect(scripts['check:workspace-deps-published']).toBe('node ../../scripts/check-workspace-deps-published.mjs --package-json package.json')
      expect(scripts.release).toContain('pnpm run check:workspace-deps-published')
      expect(scripts.release).not.toContain('pnpm run check:core-published')
      if (scripts.prepublishOnly) {
        expect(scripts.prepublishOnly).toContain('pnpm run check:workspace-deps-published')
        expect(scripts.prepublishOnly).not.toContain('pnpm run check:core-published')
      }
    }
  })

  it('builds Svelte declarations from dependency dist files', () => {
    const sveltePackageJson = readPackageJson('packages/markstream-svelte/package.json')
    const svelteBuildTsconfig = JSON.parse(readFileSync(resolve(process.cwd(), 'packages/markstream-svelte/tsconfig.build.json'), 'utf8'))

    expect(sveltePackageJson.scripts.build).toContain('pnpm --dir ../markdown-parser build')
    expect(sveltePackageJson.scripts.build).toContain('pnpm --dir ../markstream-core build')
    expect(sveltePackageJson.scripts.build).toContain('svelte-package -i src -o dist --tsconfig tsconfig.build.json')
    expect(svelteBuildTsconfig.compilerOptions.paths['stream-markdown-parser']).toEqual(['../markdown-parser/dist/index.d.ts'])
    expect(svelteBuildTsconfig.compilerOptions.paths['markstream-core']).toEqual(['../markstream-core/dist/index.d.ts'])
  })

  it('keeps dry-run workspace dependency checks local', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/check-workspace-deps-local.mjs'), 'utf8')

    expect(script).toMatch(/name: 'markstream-core'/)
    expect(script).toMatch(/name: 'stream-markdown-parser'/)
    expect(script).toContain('dependencyVersion !== \'workspace:*\' && dependencyVersion !== targetVersion')
    expect(script).not.toContain('execFileSync')
    expect(script).not.toContain('npmViewVersion')
  })
})
